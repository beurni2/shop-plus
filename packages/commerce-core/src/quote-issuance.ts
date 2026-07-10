import {
  QuoteSchema,
  assertQuoteReconciles,
  canonicalJsonStringify,
  computeWaterfall,
  type Quote,
} from '@platform/contracts';
import { isKilled, type FlagSnapshot } from '@shop-plus/flags-client';

/**
 * QUOTE ISSUANCE (WO-1.1 a; Contract §2.3 step 6; SP3.2). Every money field
 * comes from the pinned computeWaterfall — nothing is computed locally. The
 * quote is validated against the strict canonical QuoteSchema AND
 * assertQuoteReconciles at issue time (runtime, not only CI), serialized
 * byte-stably, and persisted immutable-with-expiry.
 *
 * E1: FULL_PREPAY only. Option-B legs are E2/E3 (WO FORBIDDEN) — any other
 * mode refuses closed. Checkout kill-switch (Contract §7.2) refuses closed
 * BEFORE any quote exists.
 */

export const QUOTE_TTL_MS = 15 * 60 * 1000; // short expiry per SP3.2

export interface QuoteIssuanceDeps {
  flags: FlagSnapshot;
  now: () => Date;
  newId: (kind: 'quote') => string;
}

export interface QuoteIssuanceInput {
  listingRef: string;
  offerRef: string;
  attributionResellerId: string;
  paymentMode: string;
  /** B — integer FCFA, from the supplier offer. */
  sellerBasePrice: number;
  /** C — integer FCFA, seller-funded; never added to the buyer price. */
  sellerFundedCommission: number;
  /** M — integer FCFA, from the reseller listing version. */
  resellerMarkup: number;
  /** D — integer FCFA, from the DeliveryFeeQuote; outside both fee bases. */
  deliveryFee: number;
}

export type QuoteIssuanceRefusal =
  | { ok: false; reason: 'checkout_killed' }
  | { ok: false; reason: 'payment_mode_not_available_e1' }
  | { ok: false; reason: 'quote_does_not_reconcile'; failures: readonly string[] };

export type QuoteIssuanceOutcome =
  | { ok: true; quote: Quote; canonicalBytes: string }
  | QuoteIssuanceRefusal;

export function issueQuote(deps: QuoteIssuanceDeps, input: QuoteIssuanceInput): QuoteIssuanceOutcome {
  if (isKilled(deps.flags, 'checkout')) {
    return { ok: false, reason: 'checkout_killed' };
  }
  if (input.paymentMode !== 'FULL_PREPAY') {
    return { ok: false, reason: 'payment_mode_not_available_e1' };
  }

  const { roundingLawVersion: _law, ...money } = computeWaterfall({
    sellerBasePrice: input.sellerBasePrice,
    sellerFundedCommission: input.sellerFundedCommission,
    resellerMarkup: input.resellerMarkup,
    deliveryFee: input.deliveryFee,
    paymentMode: 'FULL_PREPAY',
  });

  const issuedAt = deps.now();
  const quote: Quote = QuoteSchema.parse({
    id: deps.newId('quote'),
    attributionResellerId: input.attributionResellerId,
    ...money,
    // Safest defaults, flagged in JOURNAL: estimate/tax/policy carriers with
    // no E1 formula in §5.4; none participate in the reconciliation identities.
    paymentProcessingFeeEstimate: 0,
    taxFields: {},
    policyVersions: {
      settlementPolicyVersion: 'e1-sandbox',
      inspectionPolicyVersion: 'e1-sandbox',
    },
    expiry: new Date(issuedAt.getTime() + QUOTE_TTL_MS).toISOString(),
  });

  try {
    assertQuoteReconciles(quote); // runtime enforcement at issue time (DoD)
  } catch (err) {
    if (err instanceof Error && err.name === 'QuoteReconciliationError') {
      const failures = (err as Error & { failures: readonly string[] }).failures;
      return { ok: false, reason: 'quote_does_not_reconcile', failures };
    }
    throw err;
  }

  return { ok: true, quote, canonicalBytes: canonicalJsonStringify(quote) };
}

/**
 * Immutable quote persistence: the store keeps the canonical BYTES. There is
 * no update path — a second put on the same id refuses closed.
 */
export class ImmutableQuoteStore {
  private readonly bytesById = new Map<string, string>();

  put(
    quote: Quote,
    canonicalBytes: string,
  ): { ok: true } | { ok: false; reason: 'quote_id_exists' | 'bytes_do_not_match_quote' } {
    if (this.bytesById.has(quote.id)) return { ok: false, reason: 'quote_id_exists' };
    if (canonicalJsonStringify(quote) !== canonicalBytes) {
      // Bytes must BE the quote — a divergent copy is refused, not repaired.
      return { ok: false, reason: 'bytes_do_not_match_quote' };
    }
    this.bytesById.set(quote.id, canonicalBytes);
    return { ok: true };
  }

  get(quoteId: string, now: Date): { ok: true; quote: Quote } | { ok: false; reason: 'not_found' | 'expired' } {
    const bytes = this.bytesById.get(quoteId);
    if (bytes === undefined) return { ok: false, reason: 'not_found' };
    const quote = QuoteSchema.parse(JSON.parse(bytes));
    if (now.toISOString() > quote.expiry) return { ok: false, reason: 'expired' };
    return { ok: true, quote };
  }
}
