import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ImmutableQuoteStore,
  MockPaymentProvider,
  MockSeraEligibilityEmitter,
  OrderSpine,
  WORKED_BASELINE_INPUT,
  decideReservation,
  issueQuote,
  type Quote,
} from '@shop-plus/commerce-core';
import { ListingRegistry, StorefrontRegistry } from '@shop-plus/storefront-service';
import { signAttributionToken, verifyAttributionToken } from '../src/attribution.js';
import { resolveCheckoutAttribution } from '../src/resolution.js';
import { lockThroughDurableAuthority, type DurableLockFetch } from '../src/durable-lock-client.js';

/**
 * SP#001-D — LA PREMIÈRE COMMANDE RÉELLE. One real order end-to-end through REAL
 * data: Seller #001's storefront + published listing (the real aggregates from
 * SP#001-A/B) → a qualified token → attribution LOCKED THROUGH THE DURABLE DO
 * (workerd via Miniflare — named condition ②, the WIRED path, never the in-memory
 * book) → immutable Quote from the real listing → order spine → provider payment
 * HELD (« en attente », no franc pretends to move) → confirm → Séra eligibility
 * → settlement obligations copied from the Quote to the LOCKED reseller.
 *
 * Money and custody stay frozen: this test WIRES the existing checkout/Quote/
 * order/ledger primitives with real inputs and re-points the lock to the durable
 * authority — it modifies none of them. Real Séra dispatch is deferred (the
 * eligibility mock is the certified seam).
 */

const SCRIPT = 'dist-worker/attribution-lock-worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'premiere-commande-'));
const KEY = 'sp001d-secret';
const T = '2026-07-14T12:00:00.000Z';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { ATTRIBUTION_LOCK: 'AttributionLockDO' },
  durableObjectsPersist: persist,
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

/** The checkout seam's lock transport → the durable DO on workerd (named condition ②). */
const doFetch: DurableLockFetch = async (checkoutRef, body) => {
  const res = await mf.dispatchFetch(`http://attr/locks/${encodeURIComponent(checkoutRef)}`, { method: 'POST', body });
  return { status: res.status, json: () => res.json() };
};

// --- Seller #001, created through the REAL aggregates (never seeded) ---
const SELLER_ID = 'rs-seller-0001';
const SHORT_CODE = 'SELLER-0001';
const LISTING_ID = 'lst-seller-0001';
const HER_PRICE = WORKED_BASELINE_INPUT.sellerBasePrice + WORKED_BASELINE_INPUT.resellerMarkup; // productSubtotal = B + M

const storefronts = new StorefrontRegistry();
const listings = new ListingRegistry();
/** Server-side short-code registry, derived from the REAL published storefront. */
function resolveShortCode(code: string): string | undefined {
  return code === SHORT_CODE ? SELLER_ID : undefined;
}
function qualifiedToken(id: string, resellerId: string) {
  const token = signAttributionToken(
    { id, resellerId, scope: { kind: 'listing', refId: LISTING_ID }, issued: T, expiry: '2026-08-01T00:00:00.000Z', version: 'v1' },
    KEY,
  );
  if (!verifyAttributionToken(token, KEY, new Date(T)).ok) throw new Error('setup: token must verify');
  return token;
}

interface Commande {
  lockedResellerId: string;
  quote: Quote;
  quoteImmutable: ImmutableQuoteStore;
  spine: OrderSpine;
}
let commande: Commande;

beforeAll(async () => {
  // 1. REAL storefront + listing (SP#001-A/B aggregates) — Seller #001 lists at HER price.
  const created = storefronts.create({ commandId: 'cmd-sf-create', id: 'sf-seller-0001', resellerId: SELLER_ID, shortCode: SHORT_CODE, name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-d', at: T });
  if (created.status !== 'created') throw new Error('setup: storefront must create');
  storefronts.publish({ id: 'sf-seller-0001', correlationId: 'corr-d', at: T });
  const listed = listings.publish({ commandId: 'cmd-listing', listingId: LISTING_ID, storefrontId: 'sf-seller-0001', resellerId: SELLER_ID, productVersionId: 'pv-bazin-0001', offerVersion: 'ov-1', markup: WORKED_BASELINE_INPUT.resellerMarkup, customerPriceFcfa: HER_PRICE, hubVerified: true, correlationId: 'corr-d', at: T });
  if (listed.status !== 'published') throw new Error('setup: listing must publish');

  // 2. Buyer arrives on the vitrine (identity arrival) and carries a qualified token.
  const token = qualifiedToken('tok-seller001', SELLER_ID);

  // 3. ATTRIBUTION LOCKED THROUGH THE DURABLE DO (workerd) — the wired path.
  const lockOutcome = await lockThroughDurableAuthority(doFetch, { checkoutRef: 'chk-seller-0001', correlationId: 'corr-d', token, at: T });
  if (!lockOutcome.ok) throw new Error('setup: first lock must win');
  const lockedResellerId = lockOutcome.lock.resellerId;

  // 4. The checkout resolves attribution with the DURABLE lock as préséance #1.
  const resolved = resolveCheckoutAttribution({
    lockedResellerId,
    arrivals: [{ resellerId: SELLER_ID, scope: 'identity', arrivedAt: T, correlationId: 'corr-d' }],
    nowIso: T,
    correlationId: 'corr-d',
    resolveShortCode,
  });
  if (!resolved.resolution.attributed) throw new Error('setup: the locked reseller must attribute');

  // 5. IMMUTABLE QUOTE from the real listing — M is the listing's markup, verbatim.
  const flags = { version: 'e1-sandbox', flags: {}, kills: [], killedCategories: [] };
  const issued = issueQuote(
    { flags, now: () => new Date(T), newId: () => 'quote-seller001' },
    {
      listingRef: LISTING_ID,
      offerRef: 'ov-1',
      attributionResellerId: lockedResellerId,
      paymentMode: 'FULL_PREPAY',
      sellerBasePrice: WORKED_BASELINE_INPUT.sellerBasePrice,
      sellerFundedCommission: WORKED_BASELINE_INPUT.sellerFundedCommission,
      resellerMarkup: listed.listing.markup, // from the REAL listing
      deliveryFee: WORKED_BASELINE_INPUT.deliveryFee,
    },
  );
  if (!issued.ok) throw new Error(`setup: quote refused (${issued.reason})`);
  const quote = issued.quote;
  const quoteImmutable = new ImmutableQuoteStore();
  const put = quoteImmutable.put(quote, issued.canonicalBytes);
  if (!put.ok) throw new Error('setup: immutable quote put must succeed');

  // 6. ORDER SPINE → reserve → pay (HELD) → confirm → eligibility → obligations.
  const spine = new OrderSpine({ quote, supplierRef: 'supplier-seller001', correlationId: 'corr-d', issueCommandId: 'cmd-issue', actor: 'attribution-service:e2e', serverTime: T });
  const reserve = decideReservation({ status: 'none' }, { kind: 'reserve', command_id: 'cmd-reserve', quoteId: quote.id, holderRef: 'buyer-d', nowIso: T, newReservationId: 'res-d-0001' });
  if (!reserve.ok) throw new Error('setup: reserve refused');
  spine.advance({ command_id: 'cmd-reserved', actor: 'attribution-service:e2e', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: reserve.reservationId } });
  spine.advance({ command_id: 'cmd-payinit', actor: 'attribution-service:e2e', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'pay-d-0001', order_id: 'order-d-0001' } });

  const provider = new MockPaymentProvider({});
  const charge = provider.initiateCharge({ orderId: 'order-d-0001', paymentAttemptId: 'pay-d-0001', amount: quote.amountPaidAtCheckout, correlationId: 'corr-d', requestedAtIso: T });
  if (charge.outcome !== 'accepted') throw new Error('setup: charge must be accepted');
  const paid = spine.onProviderPaymentEvent(provider.webhookDeliveryPlan()[0]!.event);
  if (!paid.applied) throw new Error('setup: held webhook must apply');
  const confirmed = spine.confirmOrder({ command_id: 'cmd-confirm', actor: 'attribution-service:e2e', serverTime: T });
  if (!confirmed.applied) throw new Error('setup: confirm must apply on funded leg');

  const sera = new MockSeraEligibilityEmitter({});
  sera.recordDelivered('order-d-0001');
  sera.requestValidation({ orderId: 'order-d-0001', correlationId: 'corr-d', deliveredAtIso: T });
  const settled = spine.onEligibilityEvent(sera.eligibilityDeliveryPlan()[0]!.event);
  if (!settled.applied) throw new Error('setup: eligibility must record obligations');

  commande = { lockedResellerId, quote, quoteImmutable, spine };

  // --- narrated run (the première-commande story on real data) ---
  const obligations = spine.ledger.obligationsFor('order-d-0001');
  const escrow = spine.ledger.escrowFor('order-d-0001')!;
  // eslint-disable-next-line no-console
  console.log(
    [
      '=== LA PREMIÈRE COMMANDE RÉELLE (Seller #001, real data) ===',
      `storefront            = sf-seller-0001 (published)`,
      `listing               = ${LISTING_ID} @ HER price ${HER_PRICE} FCFA (markup ${listed.listing.markup})`,
      `attribution LOCKED    = ${lockedResellerId} — THROUGH the durable DO (workerd)`,
      `quote_id (immutable)  = ${quote.id}  attributionResellerId=${quote.attributionResellerId}`,
      `reconciliation        : productSubtotal ${quote.productSubtotal} = sellerNet ${quote.sellerNet} + resellerNet ${quote.resellerNet} + platformFee ${quote.platformProductFeeRevenue}`,
      `money boundary        : checkout leg ${escrow.paymentLegs[0]!.amount} FCFA « ${escrow.paymentLegs[0]!.status} » (stage ${escrow.status}) — en attente, aucun franc capturé`,
      `obligations           : supplier ${obligations[0]!.amount} (==sellerNet) · reseller[${commande.lockedResellerId}] ${obligations[1]!.amount} (==resellerNet), state ${obligations[1]!.state}`,
      `order state           = ${spine.journey.state}`,
    ].join('\n'),
  );
});

describe('SP#001-D — la première commande réelle, end-to-end on real data', () => {
  it('the order reaches CONFIRMED through the real spine', () => {
    expect(commande.spine.journey.state).toBe('confirmed');
  });

  it('QUOTE-IMMUTABLE-ON-REAL-LISTING: the quote reconciles to the franc and cannot be overwritten', () => {
    const q = commande.quote;
    // reconciliation identities (Ten Laws #1) hold on the real-listing quote
    expect(q.productSubtotal).toBe(q.sellerNet + q.resellerNet + q.platformProductFeeRevenue);
    expect(q.buyerTotal).toBe(q.productSubtotal + q.deliveryFee);
    expect(q.amountPaidAtCheckout + q.amountDueAtDelivery).toBe(q.buyerTotal);
    // immutable: a second put on the same id is refused, never repaired
    const second = commande.quoteImmutable.put(q, JSON.stringify(q));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('quote_id_exists');
  });

  it('OBLIGATION-EQUALS-LOCKED-QUOTE: obligations copy the Quote and name the DURABLE-LOCKED reseller', () => {
    const obligations = commande.spine.ledger.obligationsFor('order-d-0001');
    expect(obligations).toHaveLength(2);
    const reseller = obligations.find((o) => o.party.startsWith('reseller:'));
    const supplier = obligations.find((o) => o.party.startsWith('supplier:'));
    // the reseller obligation names EXACTLY the reseller locked through the DO
    expect(reseller?.party).toBe(`reseller:${commande.lockedResellerId}`);
    expect(reseller?.party).toBe(`reseller:${commande.quote.attributionResellerId}`);
    expect(reseller?.amount).toBe(commande.quote.resellerNet); // copied, never recomputed
    expect(supplier?.amount).toBe(commande.quote.sellerNet);
    expect(reseller?.state).toBe('Eligible');
  });

  it('MONEY-BOUNDARY-HONEST: the checkout leg is HELD (« en attente »), no franc is captured or paid out', () => {
    const escrow = commande.spine.ledger.escrowFor('order-d-0001')!;
    expect(escrow.paymentLegs).toHaveLength(1);
    expect(escrow.paymentLegs[0]!.legType).toBe('checkout');
    expect(escrow.paymentLegs[0]!.status).toBe('held'); // held, NOT captured — nothing moved
    expect(escrow.paymentLegs[0]!.amount).toBe(commande.quote.amountPaidAtCheckout);
    expect(escrow.status).toBe('hold'); // aggregator stage: hold, not split/payout
    expect(escrow.payoutRefs).toEqual([]); // no payout — no franc left the buyer's hold
  });
});

describe('SP#001-D — the full préséance suite, on the REAL Seller #001 storefront', () => {
  it('LOCKED wins: the durable lock beats a DIFFERENT explicit code (préséance #1)', () => {
    const out = resolveCheckoutAttribution({
      lockedResellerId: commande.lockedResellerId, // came from the durable DO
      typedShortCode: 'RIVAL-9999', // a different code the buyer typed
      arrivals: [],
      nowIso: T,
      correlationId: 'corr-d',
      resolveShortCode: (c) => (c === 'RIVAL-9999' ? 'rs-rival-9999' : resolveShortCode(c)),
    });
    expect(out.resolution.attributed).toBe(true);
    if (out.resolution.attributed) expect(out.resolution.resellerId).toBe(commande.lockedResellerId);
  });

  it('EXPLICIT resolves on the real short code when there is no lock (préséance #2)', () => {
    const out = resolveCheckoutAttribution({ typedShortCode: SHORT_CODE, arrivals: [], nowIso: T, correlationId: 'corr-d', resolveShortCode });
    expect(out.resolution.attributed).toBe(true);
    if (out.resolution.attributed) expect(out.resolution.resellerId).toBe(SELLER_ID);
  });

  it('ARRIVAL resolves when there is no lock and no explicit code (préséance #3)', () => {
    const out = resolveCheckoutAttribution({
      arrivals: [{ resellerId: SELLER_ID, scope: 'identity', arrivedAt: T, correlationId: 'corr-d' }],
      nowIso: T,
      correlationId: 'corr-d',
      resolveShortCode,
    });
    expect(out.resolution.attributed).toBe(true);
    if (out.resolution.attributed) expect(out.resolution.resellerId).toBe(SELLER_ID);
  });

  it('a PRESENTED-BUT-UNRESOLVED reference attributes NOBODY (never the platform) and raises the alert', () => {
    const out = resolveCheckoutAttribution({ typedShortCode: 'GHOST-0000', arrivals: [], nowIso: T, correlationId: 'corr-d', resolveShortCode });
    expect(out.resolution.attributed).toBe(false);
    expect(out.alert?.name).toBe('reconciliation.alert.v1');
    // the outcome is NOBODY — no platform fallback anywhere
    expect(JSON.stringify(out.resolution)).not.toMatch(/platform|shop-plus/i);
  });
});
