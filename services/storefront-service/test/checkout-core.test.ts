import { describe, expect, it } from 'vitest';
import { QuoteSchema, ResellerListingSchema, canonicalJsonStringify, type DeliveryFeeQuote, type Quote } from '@platform/contracts';
import { PAY_AT_DOOR_POLICY_DEFAULTS, QUOTE_TTL_MS, type PayAtDoorPolicy } from '@shop-plus/commerce-core';
import {
  decideIssueQuote,
  decideReserveForQuote,
  decideStoreQuote,
  readStoredQuote,
  toBuyerQuoteView,
  type CheckoutDeps,
  type IssueQuoteOutcome,
  type QuoteRequest,
} from '../src/checkout-core.js';
import { DELIVERY_TARIFF_VERSION, quoteDeliveryFee } from '../src/delivery-source.js';
import type { ListingEntry } from '../src/listing-core.js';

/**
 * SP3.2a — the checkout decision core, EXECUTED. Every assertion below runs the
 * real function; nothing is asserted about source text.
 *
 * THE §5.4 WORKED BASELINE is the fixture on purpose: B 10 000 · C 1 000 ·
 * M 1 500 · D 1 000, the same figures `gates/fixtures/quote.baseline.json` and
 * the money-reconciliation gate already pin. A quote issued through this slice
 * must land on those exact francs or the slice is wrong, not the baseline.
 */

const T = '2026-07-29T08:00:00.000Z';
const B = 10_000;
const C = 1_000;
const M = 1_500;
const HER_PRICE = B + M; // 11 500 — customerPriceFcfa, frozen at publish
const D = 1_000;

const QUIET_FLAGS = { version: 'test', flags: {}, kills: [], killedCategories: [] };

function deps(over: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return {
    flags: QUIET_FLAGS,
    now: () => new Date(T),
    newId: () => 'quote-sp32a-0001',
    ...over,
  };
}

function entryFixture(over: Partial<ListingEntry> = {}): ListingEntry {
  return {
    listing: ResellerListingSchema.parse({
      id: 'lst-0001',
      resellerId: 'rs-0001',
      productVersionId: 'pv-bazin-0001',
      offerVersion: 'ov-1',
      markup: M,
      version: 1,
      variants: [],
      status: 'published',
    }),
    storefrontId: 'sf-0001',
    publishCommandId: 'cmd-publish-0001',
    customerPriceFcfa: HER_PRICE,
    resellerCommission: C,
    ...over,
  };
}

function requestFixture(over: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    slug: 'seller-0001',
    pid: 'pv-bazin-0001',
    paymentMode: 'FULL_PREPAY',
    zoneTo: 'Ouagadougou',
    attributionResellerId: 'rs-0001',
    requestKey: 'req-key-000000000001',
    ...over,
  };
}

const SERVICEABLE = quoteDeliveryFee('Ouagadougou', 'Ouagadougou');

function issue(over: { request?: Partial<QuoteRequest>; entry?: ListingEntry | undefined; delivery?: DeliveryFeeQuote | undefined; deps?: Partial<CheckoutDeps> } = {}): IssueQuoteOutcome {
  return decideIssueQuote(deps(over.deps), {
    request: requestFixture(over.request),
    entry: 'entry' in over ? over.entry : entryFixture(),
    delivery: 'delivery' in over ? over.delivery : SERVICEABLE,
  });
}

function issuedQuote(over: Parameters<typeof issue>[0] = {}): Quote {
  const outcome = issue(over);
  if (!outcome.ok) throw new Error(`expected an issued quote, got refusal ${outcome.reason}`);
  return outcome.quote;
}

/* ══════════════════════════ the delivery source ═══════════════════════════ */

describe('delivery-source — the versioned sandbox tariff, never a guessed fee', () => {
  it('a KNOWN zone pair answers serviceable with the versioned integer fee', () => {
    const q = quoteDeliveryFee('Ouagadougou', 'Ouagadougou');
    expect(q.serviceable).toBe(true);
    expect(q.fee).toBe(1_000);
    expect(Number.isSafeInteger(q.fee)).toBe(true);
    expect(q.version).toBe(DELIVERY_TARIFF_VERSION);
    expect(q.zoneFrom).toBe('Ouagadougou');
    expect(q.zoneTo).toBe('Ouagadougou');
  });

  it('an UNKNOWN zone is UNSERVICEABLE — no fee is invented for it', () => {
    for (const [from, to] of [
      ['Ouagadougou', 'Bobo-Dioulasso'],
      ['Bobo-Dioulasso', 'Ouagadougou'],
    ]) {
      const q = quoteDeliveryFee(from!, to!);
      expect(q?.serviceable).toBe(false);
      expect(q?.version).toBe(DELIVERY_TARIFF_VERSION);
    }
  });

  it('TOTAL: a zone that cannot form a canon quote answers `undefined`, never a thrown 500', () => {
    // An ABSENT storefront yields an empty `zoneFrom` upstream, and the canon
    // DeliveryFeeQuote refuses empty/untrimmed zone strings. This must be a
    // refusal, not an exception on the money path.
    for (const [from, to] of [
      ['', 'Ouagadougou'],
      ['Ouagadougou', ''],
      ['  ', 'Ouagadougou'],
      ['Ouagadougou', ' Ouagadougou '],
    ]) {
      expect(() => quoteDeliveryFee(from!, to!)).not.toThrow();
      expect(quoteDeliveryFee(from!, to!)).toBeUndefined();
    }
  });

  it('DETERMINISTIC: the same pair answers identically, forever', () => {
    expect(canonicalJsonStringify(quoteDeliveryFee('Ouagadougou', 'Ouagadougou')!)).toBe(
      canonicalJsonStringify(quoteDeliveryFee('Ouagadougou', 'Ouagadougou')!),
    );
  });
});

/* ═══════════════════ B / C / M come from the frozen entry ═════════════════ */

describe('decideIssueQuote — B, C and M are READ off frozen stored fields', () => {
  it('derives the §5.4 baseline to the exact franc from customerPriceFcfa and markup alone', () => {
    const quote = issuedQuote();
    // B is recovered by SUBTRACTION from the two halves signed at publish.
    expect(quote.sellerBasePrice).toBe(B);
    expect(quote.resellerMarkup).toBe(M);
    expect(quote.sellerFundedCommission).toBe(C);
    expect(quote.deliveryFee).toBe(D);
    // …and every derived field is the pinned waterfall's, to the franc.
    expect(quote.productSubtotal).toBe(11_500);
    expect(quote.buyerTotal).toBe(12_500);
    expect(quote.sellerPlatformFee).toBe(500);
    expect(quote.sellerNet).toBe(8_500);
    expect(quote.resellerGrossEarnings).toBe(2_500);
    expect(quote.resellerPlatformFee).toBe(500);
    expect(quote.resellerNet).toBe(2_000);
    expect(quote.platformProductFeeRevenue).toBe(1_000);
    expect(quote.amountPaidAtCheckout).toBe(12_500);
    expect(quote.amountDueAtDelivery).toBe(0);
  });

  it('a DIFFERENT frozen price moves B and nothing else — the markup is carried verbatim', () => {
    const quote = issuedQuote({ entry: entryFixture({ customerPriceFcfa: 20_000 }) });
    expect(quote.resellerMarkup).toBe(M); // M unchanged
    expect(quote.sellerBasePrice).toBe(20_000 - M); // B follows the SIGNED price
    expect(quote.productSubtotal).toBe(20_000); // = B + M, her signed price exactly
  });

  it('THE COMMISSION IS NEVER IN THE BUYER PRICE (Ten Laws #1)', () => {
    const withC = issuedQuote({ entry: entryFixture({ resellerCommission: C }) });
    const withBiggerC = issuedQuote({ entry: entryFixture({ resellerCommission: C * 3 }) });
    expect(withBiggerC.productSubtotal).toBe(withC.productSubtotal);
    expect(withBiggerC.buyerTotal).toBe(withC.buyerTotal);
    expect(withBiggerC.amountPaidAtCheckout).toBe(withC.amountPaidAtCheckout);
  });

  it('THE QUOTE RECONCILES TO THE FRANC — the identities asserted here, not delegated', () => {
    const q = issuedQuote();
    expect(q.productSubtotal).toBe(q.sellerBasePrice + q.resellerMarkup);
    expect(q.buyerTotal).toBe(q.sellerBasePrice + q.resellerMarkup + q.deliveryFee);
    expect(q.productSubtotal).toBe(q.sellerNet + q.resellerNet + q.platformProductFeeRevenue);
    expect(q.amountPaidAtCheckout + q.amountDueAtDelivery).toBe(q.buyerTotal);
    // delivery is OUTSIDE both fee bases
    expect(q.sellerPlatformFee).toBe(Math.floor(0.05 * q.sellerBasePrice));
    expect(q.resellerPlatformFee).toBe(Math.floor(0.2 * (q.sellerFundedCommission + q.resellerMarkup)));
  });

  it('the quote is BYTE-STABLE and expires: canonical bytes round-trip, expiry is issue + the vault TTL', () => {
    const outcome = issue();
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.canonicalBytes).toBe(canonicalJsonStringify(outcome.quote));
    expect(QuoteSchema.parse(JSON.parse(outcome.canonicalBytes))).toEqual(outcome.quote);
    expect(outcome.quote.expiry).toBe(new Date(Date.parse(T) + QUOTE_TTL_MS).toISOString());
  });

  it('the LOCKED reseller rides the quote — it never defaults to supplier or platform', () => {
    // EVOLVED (CTO, verifier BLOCKER): the payee is now BOUND to the listing, so
    // this asserts the bound id rides the quote. The original passed an
    // arbitrary `rs-locked-9` — which is precisely the hole the verifier found:
    // the caller could name anyone. The claim this test makes is unchanged and
    // now strictly stronger; the refusal side is pinned below and in the e2e.
    expect(issuedQuote().attributionResellerId).toBe('rs-0001'); // = entry.listing.resellerId
  });

  it('a payee the CALLER names, differing from the listing, is refused — never quoted', () => {
    for (const claimed of ['rs-locked-9', 'platform', 'supplier', 'rs-0001 ']) {
      const outcome = issue({ request: { attributionResellerId: claimed } });
      expect(outcome.ok, claimed).toBe(false);
      if (!outcome.ok) expect(outcome.reason, claimed).toBe('attribution_mismatch');
    }
  });
});

/* ═══════════════════════ every refusal, BY VALUE ══════════════════════════ */

describe('decideIssueQuote — every failure is a NAMED refusal that fails closed', () => {
  const refusalOf = (o: IssueQuoteOutcome): string => (o.ok ? 'ISSUED' : o.reason);

  it('attribution_missing — no locked reseller, so no quote (SP-I09)', () => {
    expect(refusalOf(issue({ request: { attributionResellerId: '' } }))).toBe('attribution_missing');
  });

  it('listing_unknown — nothing resolved at all', () => {
    expect(refusalOf(issue({ entry: undefined }))).toBe('listing_unknown');
  });

  it('listing_unknown — the resolved listing does not sell the pid that was asked for', () => {
    expect(refusalOf(issue({ request: { pid: 'pv-someone-elses' } }))).toBe('listing_unknown');
  });

  it('listing_not_live — an auto-hidden listing cannot be bought', () => {
    const hidden = entryFixture();
    expect(
      refusalOf(
        issue({ entry: { ...hidden, listing: { ...hidden.listing, status: 'auto_hidden' } } }),
      ),
    ).toBe('listing_not_live');
  });

  it('commission_not_frozen — C absent means HER NET IS UNKNOWN, so the quote refuses rather than guess it', () => {
    const noC = entryFixture();
    const { resellerCommission: _dropped, ...withoutC } = noC;
    expect(refusalOf(issue({ entry: withoutC as ListingEntry }))).toBe('commission_not_frozen');
  });

  it('delivery_not_serviceable — an unknown zone refuses; a fee on an unserviceable answer is NEVER spent', () => {
    expect(refusalOf(issue({ delivery: quoteDeliveryFee('Ouagadougou', 'Bobo-Dioulasso') }))).toBe(
      'delivery_not_serviceable',
    );
    // …and the ORDER is asserted: `serviceable` is read BEFORE `fee`, so even a
    // large fee on an unserviceable answer cannot be turned into a delivery.
    const poisoned: DeliveryFeeQuote = { zoneFrom: 'X', zoneTo: 'Y', fee: 99_999, serviceable: false, version: 'v' };
    expect(refusalOf(issue({ delivery: poisoned }))).toBe('delivery_not_serviceable');
  });

  it('stored_amounts_incoherent — a markup above the signed price refuses; it is never nudged into a valid one', () => {
    // B would be NEGATIVE. computeWaterfall would throw; the money path answers
    // with a refusal instead of an exception.
    expect(refusalOf(issue({ entry: entryFixture({ customerPriceFcfa: 500 }) }))).toBe('stored_amounts_incoherent');
    // a fractional franc is equally unusable
    expect(refusalOf(issue({ entry: entryFixture({ customerPriceFcfa: 11_500.5 }) }))).toBe('stored_amounts_incoherent');
    // and so is a negative frozen commission
    expect(refusalOf(issue({ entry: entryFixture({ resellerCommission: -1 }) }))).toBe('stored_amounts_incoherent');
  });

  it('checkout_killed — the vault kill switch passes through (Execution Contract §7.2)', () => {
    expect(
      refusalOf(issue({ deps: { flags: { ...QUIET_FLAGS, kills: ['checkout'] } } })),
    ).toBe('checkout_killed');
  });

  it('payment_mode_unknown — an unrecognised mode refuses closed, never falls back to prepay', () => {
    expect(refusalOf(issue({ request: { paymentMode: 'CASH_ON_TRUST' } }))).toBe('payment_mode_unknown');
    expect(refusalOf(issue({ request: { paymentMode: '' } }))).toBe('payment_mode_unknown');
  });

  it('pay_at_door_not_eligible — missing context, and the shipped conservative policy, both refuse', () => {
    expect(refusalOf(issue({ request: { paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' } }))).toBe(
      'pay_at_door_not_eligible',
    );
    // Context supplied, but PAY_AT_DOOR_POLICY_DEFAULTS names NO reliable zone,
    // so the door mode is closed today whatever a caller claims about itself.
    expect(PAY_AT_DOOR_POLICY_DEFAULTS.networkReliableZones).toEqual([]);
    expect(
      refusalOf(
        issue({
          request: {
            paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
            payAtDoorContext: {
              eligibility: {
                buyerRef: 'buyer-1',
                state: 'allowed',
                buyerRefusalCount: 0,
                buyerRiskState: 'clear',
                requiredDeposit: 0,
              },
              sellerTier: 'trusted',
              category: 'shoes',
            },
          },
        }),
      ),
    ).toBe('pay_at_door_not_eligible');
  });

  it('THE OPS DETAIL RIDES THE REFUSAL, so the service can diagnose without telling the buyer', () => {
    const outcome = issue({ request: { paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' } });
    if (outcome.ok || outcome.reason !== 'pay_at_door_not_eligible') throw new Error('expected the door refusal');
    expect(outcome.refusal).toBe('context_missing');
    expect(outcome.policyVersion).toBe(PAY_AT_DOOR_POLICY_DEFAULTS.version);
  });

  it('NO REFUSAL EVER CARRIES A QUOTE — a refused request produces nothing to charge against', () => {
    const refusals = [
      issue({ request: { attributionResellerId: '' } }),
      issue({ entry: undefined }),
      issue({ delivery: quoteDeliveryFee('Ouagadougou', 'Nulle-Part') }),
      issue({ request: { paymentMode: 'CASH_ON_TRUST' } }),
      issue({ deps: { flags: { ...QUIET_FLAGS, kills: ['checkout'] } } }),
    ];
    for (const r of refusals) {
      expect(r.ok).toBe(false);
      expect(Object.keys(r)).not.toContain('quote');
      expect(Object.keys(r)).not.toContain('canonicalBytes');
    }
  });
});

/* ══════════ the door split, through a SERVER-SIDE policy (never the wire) ══ */

describe('decideIssueQuote — the §5.5 pay-at-door split, when a policy allows it', () => {
  /** A founder-tuned policy, supplied SERVER-SIDE. The request shape has no
   *  `policy` field, so a caller can never reach this. */
  const OPEN_POLICY: PayAtDoorPolicy = {
    version: 'option-b-policy.test-open',
    priceCapFcfa: 25_000,
    minSellerTier: 'verified',
    inspectableCategories: ['shoes'],
    networkReliableZones: ['Ouagadougou'],
  };
  const doorRequest = {
    paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
    payAtDoorContext: {
      eligibility: {
        buyerRef: 'buyer-1',
        state: 'allowed',
        buyerRefusalCount: 0,
        buyerRiskState: 'clear',
        requiredDeposit: 0,
      },
      sellerTier: 'verified',
      category: 'shoes',
    },
  } as const;

  it('D is paid at checkout, the product at the door, and the two legs SUM to buyerTotal', () => {
    const q = issuedQuote({ request: doorRequest, deps: { payAtDoorPolicy: OPEN_POLICY } });
    expect(q.paymentMode).toBe('DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    expect(q.amountPaidAtCheckout).toBe(D); // the delivery leg only
    expect(q.amountDueAtDelivery).toBe(q.productSubtotal); // B + M at the door
    expect(q.amountPaidAtCheckout + q.amountDueAtDelivery).toBe(q.buyerTotal);
    expect(q.buyerTotal).toBe(12_500); // the same total as prepay — only the split moves
  });

  it('over the price cap, the door mode refuses — the cap is not stretched to fit', () => {
    const outcome = issue({
      request: doorRequest,
      entry: entryFixture({ customerPriceFcfa: 40_000 }),
      deps: { payAtDoorPolicy: OPEN_POLICY },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('pay_at_door_not_eligible');
  });
});

/* ═════════════ the buyer wire — THE SECURITY BOUNDARY OF THE SLICE ════════ */

describe('toBuyerQuoteView — no supplier economics may reach a browser (SP-I03)', () => {
  const BANNED = [
    'sellerBasePrice',
    'sellerFundedCommission',
    'sellerNet',
    'sellerPlatformFee',
    'resellerNet',
    'resellerGross',
    'platformProductFeeRevenue',
    'resellerCommission',
    'basePrice',
  ];

  it('the emitted keys ARE the allowlist — exactly these eight, in any order', () => {
    const view = toBuyerQuoteView(issuedQuote());
    expect(Object.keys(view).sort()).toEqual(
      [
        'quoteId',
        'paymentMode',
        'productSubtotal',
        'deliveryFee',
        'buyerTotal',
        'amountPaidAtCheckout',
        'amountDueAtDelivery',
        'expiry',
      ].sort(),
    );
  });

  it('NOT ONE banned name appears anywhere in the SERIALIZED bytes', () => {
    const bytes = JSON.stringify(toBuyerQuoteView(issuedQuote()));
    for (const banned of BANNED) {
      expect(bytes.includes(banned)).toBe(false);
    }
    // …and neither does the reseller the quote is attributed to, nor the listing.
    expect(bytes.includes('attributionResellerId')).toBe(false);
    expect(bytes.includes('lst-0001')).toBe(false);
  });

  it('NO ECONOMICS VALUE APPEARS IN THE VIEW — asserted on an all-distinct fixture', () => {
    // The §5.4 baseline happens to have C === D (1 000 each), so a value scan on
    // it would fail on a COINCIDENCE rather than on a leak. This fixture is
    // chosen so every seller/reseller figure differs from every buyer figure.
    const q = issuedQuote({
      entry: entryFixture({
        customerPriceFcfa: 13_333,
        resellerCommission: 909,
        listing: ResellerListingSchema.parse({
          id: 'lst-0001',
          resellerId: 'rs-0001',
          productVersionId: 'pv-bazin-0001',
          offerVersion: 'ov-1',
          markup: 1_777,
          version: 1,
          variants: [],
          status: 'published',
        }),
      }),
    });
    const view = toBuyerQuoteView(q);
    const values = Object.values(view);
    for (const hidden of [
      q.sellerBasePrice,
      q.sellerFundedCommission,
      q.sellerNet,
      q.sellerPlatformFee,
      q.resellerMarkup,
      q.resellerGrossEarnings,
      q.resellerNet,
      q.resellerPlatformFee,
      q.platformProductFeeRevenue,
    ]) {
      expect(values).not.toContain(hidden);
    }
    // the buyer's price is carried WHOLE, never decomposed
    expect(view.productSubtotal).toBe(q.productSubtotal);
    expect(view.buyerTotal).toBe(q.buyerTotal);
    // …and the view still reconciles on this fixture too
    expect(view.productSubtotal + view.deliveryFee).toBe(view.buyerTotal);
  });

  it('the amounts the buyer is shown are the QUOTE’s own, unaltered, and still reconcile', () => {
    const q = issuedQuote();
    const view = toBuyerQuoteView(q);
    expect(view.quoteId).toBe(q.id);
    expect(view.paymentMode).toBe(q.paymentMode);
    expect(view.deliveryFee).toBe(q.deliveryFee);
    expect(view.amountPaidAtCheckout).toBe(q.amountPaidAtCheckout);
    expect(view.amountDueAtDelivery).toBe(q.amountDueAtDelivery);
    expect(view.expiry).toBe(q.expiry);
    expect(view.productSubtotal + view.deliveryFee).toBe(view.buyerTotal);
    expect(view.amountPaidAtCheckout + view.amountDueAtDelivery).toBe(view.buyerTotal);
  });
});

/* ═══════════ the immutable store law, made durable (pure half) ════════════ */

describe('readStoredQuote / decideStoreQuote — the ImmutableQuoteStore law over bytes', () => {
  const outcome = issue();
  if (!outcome.ok) throw new Error('fixture: the baseline quote must issue');
  const { quote, canonicalBytes } = outcome;
  const beforeExpiry = new Date(Date.parse(T) + 60_000);
  const afterExpiry = new Date(Date.parse(quote.expiry) + 1);

  it('an absent record is not_found — never an empty quote', () => {
    expect(readStoredQuote(undefined, beforeExpiry)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('a stored quote reads back BYTE-IDENTICAL while it is alive', () => {
    const read = readStoredQuote(canonicalBytes, beforeExpiry);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(canonicalJsonStringify(read.quote)).toBe(canonicalBytes);
    expect(read.quote).toEqual(quote);
  });

  it('PAST ITS EXPIRY IT REFUSES — a price is never silently revived', () => {
    expect(readStoredQuote(canonicalBytes, afterExpiry)).toEqual({ ok: false, reason: 'expired' });
    // one millisecond before, it is still honest
    expect(readStoredQuote(canonicalBytes, new Date(Date.parse(quote.expiry) - 1)).ok).toBe(true);
  });

  it('bytes that are not the canonical quote are REFUSED, never repaired', () => {
    expect(readStoredQuote('not json at all', beforeExpiry)).toEqual({ ok: false, reason: 'stored_quote_unreadable' });
    expect(readStoredQuote('{"id":"q"}', beforeExpiry)).toEqual({ ok: false, reason: 'stored_quote_unreadable' });
    // a re-serialization that is NOT the canonical form: same values, other bytes
    const prettified = JSON.stringify(JSON.parse(canonicalBytes), null, 2);
    expect(prettified).not.toBe(canonicalBytes);
    expect(readStoredQuote(prettified, beforeExpiry)).toEqual({ ok: false, reason: 'stored_quote_unreadable' });
  });

  it('a free slot accepts the quote; an occupied one REFUSES — there is no update path', () => {
    expect(decideStoreQuote(undefined, quote, canonicalBytes)).toEqual({ ok: true });
    expect(decideStoreQuote(canonicalBytes, quote, canonicalBytes)).toEqual({ ok: false, reason: 'quote_id_exists' });
  });

  it('bytes that are not the quote are refused on WRITE too', () => {
    const other = issuedQuote({ entry: entryFixture({ customerPriceFcfa: 20_000 }) });
    expect(decideStoreQuote(undefined, quote, canonicalJsonStringify(other))).toEqual({
      ok: false,
      reason: 'bytes_do_not_match_quote',
    });
  });
});

/* ═══════════════════════════ the reservation ══════════════════════════════ */

describe('decideReserveForQuote — one reservation per quote, short and atomic', () => {
  const cmd = {
    kind: 'reserve' as const,
    command_id: 'cmd-reserve-1',
    quoteId: 'quote-sp32a-0001',
    holderRef: 'buyer-1',
    nowIso: T,
    newReservationId: 'res-1',
  };

  it('a fresh quote reserves, with the vault TTL', () => {
    const decision = decideReserveForQuote({ status: 'none' }, cmd);
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.state.status).toBe('reserved');
    expect(decision.reservationId).toBe('res-1');
    if (decision.state.status !== 'reserved') return;
    expect(decision.state.expiresAt).toBe(new Date(Date.parse(T) + 2 * 60 * 1000).toISOString());
  });

  it('A SECOND, DIFFERENT reserve on a held quote REFUSES — never a second hold', () => {
    const first = decideReserveForQuote({ status: 'none' }, cmd);
    if (!first.ok) throw new Error('setup');
    const second = decideReserveForQuote(first.state, { ...cmd, command_id: 'cmd-reserve-2', newReservationId: 'res-2' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('already_reserved');
  });

  it('the SAME command replayed is idempotent — the same reservation, not a new one', () => {
    const first = decideReserveForQuote({ status: 'none' }, cmd);
    if (!first.ok) throw new Error('setup');
    const replay = decideReserveForQuote(first.state, cmd);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.reservationId).toBe('res-1');
  });

  it('a command naming ANOTHER quote is refused — one object, one quote', () => {
    const first = decideReserveForQuote({ status: 'none' }, cmd);
    if (!first.ok) throw new Error('setup');
    const foreign = decideReserveForQuote(first.state, { ...cmd, quoteId: 'quote-someone-else', command_id: 'c3' });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.reason).toBe('quote_mismatch');
  });
});
