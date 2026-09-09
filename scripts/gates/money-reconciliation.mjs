#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { assertQuoteReconciles, computeWaterfall } from '@platform/contracts';

/**
 * CI gate: money-reconciliation (§5.4/§5.5, standing guardrail) — runs the
 * PINNED assertQuoteReconciles over a quote-money fixture file, THEN
 * (WO-2.5) enforces the §5.5 PER-MODE SPLIT the pinned checker does not
 * bind: it verifies paid + due == buyerTotal but not WHERE the split falls.
 * §5.5 verbatim: FULL_PREPAY "amountPaidAtCheckout = buyerTotal,
 * amountDueAtDelivery = 0"; Option B "amountPaidAtCheckout = D,
 * amountDueAtDelivery = productSubtotal". A split-shifted Option-B quote
 * (e.g. 2,000 now / 10,500 at the door) reconciles under the pinned checker
 * and is exactly what this extension refuses. Exact to the franc.
 * (Pinned-checker gap flagged in JOURNAL for the founder's source-edit list.)
 *
 * PORTES-FRANCAISES-1 (AUDIT-SHOP-2 F-33) — THE PER-FIELD ARM. The pinned
 * checker binds three SUMS, so a quote whose two nets lie in opposite
 * directions by the same franc still « reconciles » (« sellerNet −100,
 * resellerNet +100, resellerGrossEarnings 999 » exited 0 — measured).
 * Production is right by construction (`issueQuote` spreads
 * `computeWaterfall`); the exposure is a hand-built or edited fixture
 * certifying a lie. So, after the sums and the split, every derived field is
 * RECOMPUTED from the five inputs by the pinned law and must match to the
 * franc — the same move WO-2.5 made for the split. The pinned checker itself
 * is canon (§7 — flagged to platform-contracts, not edited here).
 */
const file = process.argv[2];
if (!file) {
  console.error('usage: money-reconciliation.mjs <quote-money.json>');
  process.exit(2);
}
let quote;
try {
  quote = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  // exit 2 = the gate could not run — never confusable with a gate failure (1)
  console.error(`money-reconciliation: cannot read fixture ${file}: ${String(err)}`);
  process.exit(2);
}
try {
  assertQuoteReconciles(quote);
} catch (err) {
  console.error(`money-reconciliation FAILED on ${file}:`);
  console.error(String(err.message ?? err));
  process.exit(1);
}

// §5.5 per-mode split (WO-2.5). Absence is a FAILURE, not a skip (verifier
// finding 2): a quote that names no mode has an unverifiable split, and the
// canonical QuoteSchema requires paymentMode anyway — no honest fixture
// omits it.
if (quote.paymentMode === undefined) {
  console.error(`money-reconciliation FAILED on ${file}: quote names no paymentMode — the §5.5 split cannot be verified`);
  process.exit(1);
}
{
  const splitFailures = [];
  if (quote.paymentMode === 'FULL_PREPAY') {
    if (quote.amountPaidAtCheckout !== quote.buyerTotal)
      splitFailures.push(`FULL_PREPAY: amountPaidAtCheckout (${quote.amountPaidAtCheckout}) != buyerTotal (${quote.buyerTotal})`);
    if (quote.amountDueAtDelivery !== 0)
      splitFailures.push(`FULL_PREPAY: amountDueAtDelivery (${quote.amountDueAtDelivery}) != 0`);
  } else if (quote.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') {
    if (quote.amountPaidAtCheckout !== quote.deliveryFee)
      splitFailures.push(`Option B: amountPaidAtCheckout (${quote.amountPaidAtCheckout}) != deliveryFee D (${quote.deliveryFee})`);
    if (quote.amountDueAtDelivery !== quote.productSubtotal)
      splitFailures.push(`Option B: amountDueAtDelivery (${quote.amountDueAtDelivery}) != productSubtotal (${quote.productSubtotal})`);
  } else {
    splitFailures.push(`unknown paymentMode '${quote.paymentMode}' — not a §5.5 mode`);
  }
  if (splitFailures.length > 0) {
    console.error(`money-reconciliation FAILED on ${file} — §5.5 per-mode split violated:`);
    for (const f of splitFailures) console.error(`  ${f}`);
    process.exit(1);
  }
}
{
  let attendu;
  try {
    attendu = computeWaterfall({
      sellerBasePrice: quote.sellerBasePrice,
      sellerFundedCommission: quote.sellerFundedCommission,
      resellerMarkup: quote.resellerMarkup,
      deliveryFee: quote.deliveryFee,
      paymentMode: quote.paymentMode,
    });
  } catch (err) {
    console.error(`money-reconciliation FAILED on ${file}: the five inputs are not a quote the pinned law can compute — ${String(err.message ?? err)}`);
    process.exit(1);
  }
  const fieldFailures = [];
  for (const [field, valeur] of Object.entries(attendu)) {
    if (quote[field] !== valeur) fieldFailures.push(`${field}: fixture says ${JSON.stringify(quote[field])}, the pinned law computes ${JSON.stringify(valeur)}`);
  }
  if (fieldFailures.length > 0) {
    console.error(`money-reconciliation FAILED on ${file} — the sums reconcile but a field disagrees with the pinned law (a coherent lie):`);
    for (const f of fieldFailures) console.error(`  ${f}`);
    process.exit(1);
  }
}
console.log(`money-reconciliation OK — ${file} reconciles to the franc (§5.4), honors the §5.5 per-mode split, and every field is the pinned law's own`);
