#!/usr/bin/env node
// WO-1.1 DoD: one full happy-path run emitting the correlation chain
// quote_id → reservation_id → payment_attempt_id → order_id →
// settlement_obligation_id, chain log-copied. Deterministic clock and ids so
// the emitted journey is byte-reproducible; --write-fixture regenerates the
// committed gate fixture from this exact run.
import { writeFileSync } from 'node:fs';
import { canonicalJsonStringify } from '@platform/contracts';
import {
  MockPaymentProvider,
  MockSeraEligibilityEmitter,
  OrderSpine,
  WORKED_BASELINE_INPUT,
  decideReservation,
  issueQuote,
} from '@shop-plus/commerce-core';

const T = '2026-07-09T12:00:00.000Z';
const flags = { version: 'e1-sandbox', flags: {}, kills: [], killedCategories: [] };

// 1. QUOTE (Contract §2.3 step 6) — all money via the pinned waterfall.
const issued = issueQuote(
  { flags, now: () => new Date(T), newId: () => 'quote-e1-0001' },
  {
    listingRef: 'listing-e1', offerRef: 'offer-e1', attributionResellerId: 'reseller-e1',
    paymentMode: 'FULL_PREPAY', ...WORKED_BASELINE_INPUT,
  },
);
if (!issued.ok) { console.error('quote refused:', issued.reason); process.exit(1); }
const quote = issued.quote;

// 2. RESERVE (step 7) — the same pure core the DO hosts, deterministic here.
let res = decideReservation({ status: 'none' }, {
  kind: 'reserve', command_id: 'cmd-reserve-1', quoteId: quote.id,
  holderRef: 'buyer-e1', nowIso: T, newReservationId: 'res-e1-0001',
});
if (!res.ok) { console.error('reserve refused:', res.reason); process.exit(1); }

const spine = new OrderSpine({
  quote, supplierRef: 'supplier-e1', correlationId: 'corr-e1-0001',
  issueCommandId: 'cmd-issue-1', actor: 'commerce-core:e1', serverTime: T,
});
spine.advance({ command_id: 'cmd-reserved-1', actor: 'commerce-core:e1', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: res.reservationId } });
spine.advance({ command_id: 'cmd-payinit-1', actor: 'commerce-core:e1', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'pay-e1-0001', order_id: 'order-e1-0001' } });

// 3. SANDBOX PAYMENT (step 8) — provider mock, well-behaved for the happy path.
const provider = new MockPaymentProvider({});
const charge = provider.initiateCharge({
  orderId: 'order-e1-0001', paymentAttemptId: 'pay-e1-0001',
  amount: quote.amountPaidAtCheckout, correlationId: 'corr-e1-0001', requestedAtIso: T,
});
if (charge.outcome !== 'accepted') { console.error('charge failed'); process.exit(1); }
const webhook = provider.webhookDeliveryPlan()[0].event;
const paidOutcome = spine.onProviderPaymentEvent(webhook);
if (!paidOutcome.applied) { console.error('webhook refused:', paidOutcome.reason); process.exit(1); }

// Reservation consumed exactly once (idempotent confirm).
res = decideReservation(res.state, { kind: 'confirm', command_id: 'cmd-confirm-res-1', quoteId: quote.id, nowIso: T });
if (!res.ok) { console.error('reservation confirm refused:', res.reason); process.exit(1); }

const confirmed = spine.confirmOrder({ command_id: 'cmd-confirm-1', actor: 'commerce-core:e1', serverTime: T });
if (!confirmed.applied) { console.error('confirm refused:', confirmed.reason); process.exit(1); }

// 4. ELIGIBILITY (step 13) → OBLIGATIONS ×2 (step 14), amounts COPIED.
const sera = new MockSeraEligibilityEmitter({});
sera.recordDelivered('order-e1-0001');
sera.requestValidation({ orderId: 'order-e1-0001', correlationId: 'corr-e1-0001', deliveredAtIso: T });
const eligibility = sera.eligibilityDeliveryPlan()[0].event;
const settled = spine.onEligibilityEvent(eligibility);
if (!settled.applied) { console.error('eligibility refused:', settled.reason); process.exit(1); }

const escrow = spine.ledger.escrowFor('order-e1-0001');
const obligations = spine.ledger.obligationsFor('order-e1-0001');

// ---- Evidence output ----
console.log('=== E1 HAPPY PATH — correlation chain ===');
const chain = spine.journey.events.at(-1).payload;
console.log(`quote_id                 = ${chain.quote_id}`);
console.log(`reservation_id           = ${chain.reservation_id}`);
console.log(`payment_attempt_id       = ${chain.payment_attempt_id}`);
console.log(`order_id                 = ${chain.order_id}`);
for (const o of obligations) {
  console.log(`settlement_obligation_id = ${o.orderId}:${o.party} (amount ${o.amount} FCFA, state ${o.state})`);
}
console.log(`correlation_id (constant)= ${spine.journey.correlationId}`);
console.log('\n=== events (name @ aggregateVersion) ===');
for (const e of spine.journey.events) console.log(`${e.envelope.aggregateVersion}. ${e.name} (command ${e.envelope.command_id})`);
console.log('\n=== reconciliation at issue (pinned waterfall) ===');
console.log(`productSubtotal ${quote.productSubtotal} = sellerNet ${quote.sellerNet} + resellerNet ${quote.resellerNet} + platformFee ${quote.platformProductFeeRevenue}`);
console.log(`buyerTotal ${quote.buyerTotal} = productSubtotal ${quote.productSubtotal} + deliveryFee ${quote.deliveryFee}`);
console.log(`amountPaidAtCheckout ${quote.amountPaidAtCheckout} + amountDueAtDelivery ${quote.amountDueAtDelivery} = buyerTotal ${quote.buyerTotal}`);
console.log(`escrow leg: ${escrow.paymentLegs[0].legType} ${escrow.paymentLegs[0].amount} FCFA (${escrow.paymentLegs[0].status})`);
console.log(`obligations copy check: supplier ${obligations[0].amount} == quote.sellerNet ${quote.sellerNet}; reseller ${obligations[1].amount} == quote.resellerNet ${quote.resellerNet}`);

const journeyFixture = {
  quote,
  order: { id: 'order-e1-0001', status: spine.journey.state },
  escrow,
  obligations,
  events: spine.journey.events,
};

if (process.argv.includes('--write-fixture')) {
  writeFileSync('gates/fixtures/order-journey.happy.json', canonicalJsonStringify(journeyFixture) + '\n');
  console.log('\nfixture written: gates/fixtures/order-journey.happy.json');
}

// Exit nonzero if anything above silently diverged.
const sane =
  spine.journey.state === 'confirmed' &&
  obligations.length === 2 &&
  obligations[0].amount + obligations[1].amount + quote.platformProductFeeRevenue === quote.productSubtotal;
process.exit(sane ? 0 : 1);
