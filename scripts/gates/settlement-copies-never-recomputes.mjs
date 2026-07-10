#!/usr/bin/env node
// CI gate (WO-1.1 d; Ten Laws #1/#2): SettlementObligation amounts are
// COPIED from the immutable Quote's sellerNet/resellerNet — never recomputed.
// Two enforcement arms:
//  (1) fixture arm: the journey's two obligations must equal the quote's
//      fields to the franc — a fixture that recomputed (any divergence,
//      even 1 FCFA of "better rounding") fails;
//  (2) source arm: the ledger module must not even import the waterfall or
//      fee machinery — recomputation is unrepresentable, not just untested.
// Exit 1 = violation. Exit 2 = non-canonical/unusable input (crash ≠ pass).
import { readFileSync } from 'node:fs';
import { QuoteSchema, SettlementObligationSchema } from '@platform/contracts';

const path = process.argv[2];
if (!path) { console.error('usage: settlement-copies-never-recomputes.mjs <journey.json>'); process.exit(2); }

let journey;
try { journey = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error(`unreadable fixture: ${e.message}`); process.exit(2); }

const quoteParse = QuoteSchema.safeParse(journey.quote);
if (!quoteParse.success) { console.error('fixture quote is not canonical'); process.exit(2); }
const quote = quoteParse.data;

if (!Array.isArray(journey.obligations) || journey.obligations.length === 0) {
  console.log('no obligations in fixture — nothing to check. OK');
  process.exit(0);
}

let failed = false;
const parsed = [];
for (const raw of journey.obligations) {
  const p = SettlementObligationSchema.safeParse(raw);
  if (!p.success) { console.error('obligation is not canonical'); process.exit(2); }
  parsed.push(p.data);
}
if (parsed.length !== 2) {
  console.error(`VIOLATION: expected exactly 2 obligations (supplier, reseller), found ${parsed.length}`);
  failed = true;
}
const supplier = parsed.find((o) => o.party.startsWith('supplier:'));
const reseller = parsed.find((o) => o.party.startsWith('reseller:'));
if (!supplier || !reseller) {
  console.error('VIOLATION: missing supplier or reseller obligation');
  failed = true;
}
if (supplier && supplier.amount !== quote.sellerNet) {
  console.error(`VIOLATION: supplier obligation ${supplier.amount} != quote.sellerNet ${quote.sellerNet} — amount was recomputed, not copied`);
  failed = true;
}
if (reseller && reseller.amount !== quote.resellerNet) {
  console.error(`VIOLATION: reseller obligation ${reseller.amount} != quote.resellerNet ${quote.resellerNet} — amount was recomputed, not copied`);
  failed = true;
}

// Source arm: the ledger cannot hold the tools of recomputation.
const ledgerSource = readFileSync('packages/commerce-core/src/ledger.ts', 'utf8');
const FORBIDDEN = ['computeWaterfall', 'sellerPlatformFee', 'resellerPlatformFee', 'SELLER_PLATFORM_FEE', 'RESELLER_PLATFORM_FEE', 'Math.round', 'Math.floor', 'Math.ceil', '0.05', '0.20'];
for (const token of FORBIDDEN) {
  if (ledgerSource.includes(token)) {
    console.error(`VIOLATION: ledger.ts contains forbidden token '${token}' — the ledger copies, it never computes`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`OK: obligations copied to the franc (supplier ${supplier.amount} = sellerNet; reseller ${reseller.amount} = resellerNet); ledger source clean of waterfall/fee machinery`);
