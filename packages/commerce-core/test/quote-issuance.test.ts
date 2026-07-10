import { describe, expect, it } from 'vitest';
import { QuoteSchema, canonicalJsonStringify, computeWaterfall } from '@platform/contracts';
import { EMPTY_SNAPSHOT, type FlagSnapshot } from '@shop-plus/flags-client';
import {
  ImmutableQuoteStore,
  NON_DIVISIBLE_REGRESSION_INPUT,
  WORKED_BASELINE_INPUT,
  issueQuote,
  type QuoteIssuanceInput,
} from '../src/index.js';

const openFlags: FlagSnapshot = { version: 'test', flags: {}, kills: [], killedCategories: [] };
const T0 = new Date('2026-07-09T12:00:00.000Z');
const deps = (flags: FlagSnapshot = openFlags) => {
  let n = 0;
  return { flags, now: () => T0, newId: () => `quote-${(n += 1)}` };
};

const input = (money: { sellerBasePrice: number; sellerFundedCommission: number; resellerMarkup: number; deliveryFee: number }): QuoteIssuanceInput => ({
  listingRef: 'listing-1',
  offerRef: 'offer-1',
  attributionResellerId: 'reseller-9',
  paymentMode: 'FULL_PREPAY',
  ...money,
});

describe('quote issuance — reconciliation enforced at issue time (WO-1.1 a, SP3.2)', () => {
  it('§5.4 worked baseline through the SERVICE path: every money field from the pinned waterfall, reconciling to the franc', () => {
    const outcome = issueQuote(deps(), input(WORKED_BASELINE_INPUT));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const q = outcome.quote;
    // The five §5.4 baseline figures, asserted literally — not via the waterfall.
    expect(q.productSubtotal).toBe(11_500);
    expect(q.buyerTotal).toBe(12_500);
    expect(q.sellerNet).toBe(8_500);
    expect(q.resellerNet).toBe(2_000);
    expect(q.platformProductFeeRevenue).toBe(1_000);
    // FULL_PREPAY legs identity.
    expect(q.amountPaidAtCheckout).toBe(12_500);
    expect(q.amountDueAtDelivery).toBe(0);
    // Reconciliation identities to the franc.
    expect(q.sellerNet + q.resellerNet + q.platformProductFeeRevenue).toBe(q.productSubtotal);
    expect(q.productSubtotal + q.deliveryFee).toBe(q.buyerTotal);
    // Strict-canonical.
    expect(QuoteSchema.safeParse(q).success).toBe(true);
  });

  it('founder non-divisible regression through the SERVICE path reconciles and matches the pinned waterfall exactly', () => {
    const outcome = issueQuote(deps(), input(NON_DIVISIBLE_REGRESSION_INPUT));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const q = outcome.quote;
    const w = computeWaterfall(NON_DIVISIBLE_REGRESSION_INPUT);
    for (const key of [
      'productSubtotal',
      'buyerTotal',
      'sellerPlatformFee',
      'sellerNet',
      'resellerGrossEarnings',
      'resellerPlatformFee',
      'resellerNet',
      'platformProductFeeRevenue',
      'amountPaidAtCheckout',
      'amountDueAtDelivery',
    ] as const) {
      expect(q[key], key).toBe(w[key]);
    }
    expect(q.sellerNet + q.resellerNet + q.platformProductFeeRevenue).toBe(q.productSubtotal);
    expect(q.productSubtotal + q.deliveryFee).toBe(q.buyerTotal);
  });

  it('checkout kill-switch OFF-path: kills:["checkout"] → refuses closed, no quote exists', () => {
    const killed: FlagSnapshot = { ...openFlags, kills: ['checkout'] };
    const outcome = issueQuote(deps(killed), input(WORKED_BASELINE_INPUT));
    expect(outcome).toEqual({ ok: false, reason: 'checkout_killed' });
    expect(outcome).not.toHaveProperty('quote');
  });

  it('fail-safe default snapshot (EMPTY_SNAPSHOT) does NOT kill checkout — kill is explicit, not ambient', () => {
    const outcome = issueQuote(deps(EMPTY_SNAPSHOT), input(WORKED_BASELINE_INPUT));
    expect(outcome.ok).toBe(true);
  });

  it('Option B without eligibility context refuses closed (the §6.1 gate fails closed; WO-2.5)', () => {
    const outcome = issueQuote(deps(), {
      ...input(WORKED_BASELINE_INPUT),
      paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
    });
    expect(outcome).toEqual({
      ok: false,
      reason: 'pay_at_door_not_eligible',
      refusal: 'context_missing',
      policyVersion: 'option-b-policy.v0-conservative',
    });
  });

  it('an unknown payment mode string still refuses closed', () => {
    const outcome = issueQuote(deps(), { ...input(WORKED_BASELINE_INPUT), paymentMode: 'CASH_ON_DELIVERY' });
    expect(outcome).toEqual({ ok: false, reason: 'payment_mode_unknown' });
  });

  it('byte-stable serialization: same quote → identical canonical bytes, independent of key insertion order', () => {
    const outcome = issueQuote(deps(), input(WORKED_BASELINE_INPUT));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const reordered = Object.fromEntries(Object.entries(outcome.quote).reverse());
    expect(canonicalJsonStringify(reordered)).toBe(outcome.canonicalBytes);
    expect(canonicalJsonStringify(outcome.quote)).toBe(outcome.canonicalBytes);
  });

  it('immutable store: second put on the same id refuses; get returns the byte-identical quote; expiry refuses', () => {
    const d = deps();
    const outcome = issueQuote(d, input(WORKED_BASELINE_INPUT));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const store = new ImmutableQuoteStore();
    expect(store.put(outcome.quote, outcome.canonicalBytes)).toEqual({ ok: true });
    expect(store.put(outcome.quote, outcome.canonicalBytes)).toEqual({ ok: false, reason: 'quote_id_exists' });
    const got = store.get(outcome.quote.id, T0);
    expect(got.ok && got.quote).toEqual(outcome.quote);
    const afterExpiry = new Date(T0.getTime() + 16 * 60 * 1000);
    expect(store.get(outcome.quote.id, afterExpiry)).toEqual({ ok: false, reason: 'expired' });
  });
});
