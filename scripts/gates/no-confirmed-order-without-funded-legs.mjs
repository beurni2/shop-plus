#!/usr/bin/env node
// CI gate (SP3.2 / SP-I13): "No confirmed order without funded legs."
// Validates an order-journey fixture: if the order is confirmed, a canonical
// EscrowTxn MUST exist with a checkout leg in status held|captured whose
// amount equals the immutable Quote's amountPaidAtCheckout to the franc.
// Exit 1 = violation (the invariant caught it). Exit 2 = non-canonical or
// unusable input (a crash must never pass for a working negative fixture).
import { readFileSync } from 'node:fs';
import { EscrowTxnSchema, QuoteSchema, assertQuoteReconciles } from '@platform/contracts';

const path = process.argv[2];
if (!path) { console.error('usage: no-confirmed-order-without-funded-legs.mjs <journey.json>'); process.exit(2); }

let journey;
try { journey = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error(`unreadable fixture: ${e.message}`); process.exit(2); }

const quoteParse = QuoteSchema.safeParse(journey.quote);
if (!quoteParse.success) { console.error('fixture quote is not canonical'); process.exit(2); }
const quote = quoteParse.data;
try { assertQuoteReconciles(quote); } catch (e) { console.error(`fixture quote does not reconcile: ${e.message}`); process.exit(2); }

// §5.5 per-mode split on the journey's OWN quote (WO-2.5 verifier finding 3):
// the pinned checker binds paid+due=buyerTotal but not WHERE the split falls,
// so a coherently-lying journey (split-shifted quote + matching oversized leg)
// would otherwise walk through this gate. A shifted split is a VIOLATION
// (exit 1), not unusable input — it is exactly the lie this gate exists for.
const splitViolations = [];
if (quote.paymentMode === 'FULL_PREPAY') {
  if (quote.amountPaidAtCheckout !== quote.buyerTotal)
    splitViolations.push(`FULL_PREPAY: amountPaidAtCheckout (${quote.amountPaidAtCheckout}) != buyerTotal (${quote.buyerTotal})`);
  if (quote.amountDueAtDelivery !== 0)
    splitViolations.push(`FULL_PREPAY: amountDueAtDelivery (${quote.amountDueAtDelivery}) != 0`);
} else if (quote.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') {
  if (quote.amountPaidAtCheckout !== quote.deliveryFee)
    splitViolations.push(`Option B: amountPaidAtCheckout (${quote.amountPaidAtCheckout}) != deliveryFee D (${quote.deliveryFee})`);
  if (quote.amountDueAtDelivery !== quote.productSubtotal)
    splitViolations.push(`Option B: amountDueAtDelivery (${quote.amountDueAtDelivery}) != productSubtotal (${quote.productSubtotal})`);
}
if (splitViolations.length > 0) {
  console.error('VIOLATION: the journey quote violates the §5.5 per-mode split:');
  for (const v of splitViolations) console.error(`  ${v}`);
  process.exit(1);
}

if (!journey.order || typeof journey.order.status !== 'string') { console.error('fixture has no order.status'); process.exit(2); }

// Only the five E1 states are legible — "Confirmed", "CONFIRMED", or any
// unknown string must not slip past as "not confirmed".
const E1_STATES = ['quote_issued', 'reserved', 'payment_pending', 'paid', 'confirmed'];
if (!E1_STATES.includes(journey.order.status)) {
  console.error(`unknown order status '${journey.order.status}' — not an E1 state`);
  process.exit(2);
}

if (journey.order.status !== 'confirmed') {
  console.log(`order status '${journey.order.status}' — gate applies only to confirmed orders. OK`);
  process.exit(0);
}

const escrowParse = EscrowTxnSchema.safeParse(journey.escrow);
if (!escrowParse.success) {
  console.error('VIOLATION: confirmed order with no canonical EscrowTxn record');
  process.exit(1);
}
const funded = escrowParse.data.paymentLegs.some(
  (leg) => leg.legType === 'checkout' && (leg.status === 'held' || leg.status === 'captured') && leg.amount === quote.amountPaidAtCheckout,
);
if (!funded) {
  console.error(
    `VIOLATION: confirmed order without a funded checkout leg covering amountPaidAtCheckout=${quote.amountPaidAtCheckout} ` +
    `(legs: ${escrowParse.data.paymentLegs.map((l) => `${l.legType}:${l.amount}:${l.status}`).join(', ') || 'none'})`,
  );
  process.exit(1);
}
console.log(`OK: confirmed order ${journey.order.id} has a funded checkout leg of ${quote.amountPaidAtCheckout} FCFA`);
