#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { assertQuoteReconciles } from '@platform/contracts';

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

// §5.5 per-mode split (WO-2.5) — only when the fixture names its mode.
if (quote.paymentMode !== undefined) {
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
console.log(`money-reconciliation OK — ${file} reconciles to the franc (§5.4) and honors the §5.5 per-mode split`);
