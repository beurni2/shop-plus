import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, boutiqueDe } from './seance';

/**
 * A COMMISSION THE SELLER WOULD PAY TO SELL GETS NO QUOTE — on the real
 * combined Worker (Miniflare), asked of the Worker's own records.
 *
 * ⚠ THE PRODUCER BELOW SENDS A MESSAGE BOUTIK+ NEVER SENDS FOR AN OFFER
 * CREATED TODAY. Boutik+ now refuses to create an offer whose commission
 * leaves the seller nothing (`commission_leaves_no_net`), but it did not
 * always, so an offer stored before that refusal may still carry C ≥ B. This
 * stand-in serves one, because the storefront must not rely on the other
 * side's refusal: whatever reaches it, the quote must still refuse. Every
 * other field is the real projection's shape.
 *
 * The rule is the canon waterfall's own seller net, refused when ≤ 0 — at
 * whatever fee canon charges — under the existing `stored_amounts_incoherent`.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'quote-net-vendeur-'));
const T0 = '2026-11-26T08:00:00.000Z';
const MARKUP = 250; // the publish cap on a 1 000 base is 250

const produit = (productVersionId: string, basePrice: number, resellerCommission: number) => ({
  productVersionId,
  offerVersion: 'ov-net-1',
  basePrice,
  resellerCommission,
  available: 9,
  productName: 'Bazin riche',
  assetRefs: [] as string[],
  category: 'fashion_bags_fabrics',
  sellerTier: 'verified',
});

const SUPPLY = [
  produit('pv-net-negatif', 1_000, 1_500), // seller net −500
  produit('pv-net-zero', 1_000, 1_000), // seller net exactly 0
  produit('pv-net-un', 1_000, 999), // one franc left: the control
];

function makeMf(): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO',
      LISTING: 'ListingDO',
      CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
      COMPTES: 'ResellerAccountsDO',
    },
    durableObjectsPersist: persist,
    bindings: { CHECKOUT_OPS_SECRET: OPS_SECRET },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const single = /^\/supply-projection\/([^/]+)$/.exec(new URL(request.url).pathname);
        const value = single ? SUPPLY.find((v) => v.productVersionId === decodeURIComponent(single[1]!)) : undefined;
        if (value === undefined) {
          return Response.json({ service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' }, { status: 404 });
        }
        return Response.json({ version: 1, asOf: new Date().toISOString(), value });
      },
    },
  });
}

const mf = makeMf();
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function call(path: string, init: RequestInit = {}) {
  const res = await mf.dispatchFetch(`http://c${path}`, init);
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

/** Her shop, online, selling `pid` — and the PUBLISH ITSELF asserted accepted,
 *  with the frozen economics read back off the listing's own record, so a
 *  later refusal is the quote's and never the publish's. */
async function shopSelling(n: string, pid: string, B: number, C: number) {
  const S = await seance(mf, `netv${n}`);
  const shop = boutiqueDe(S, 'NETV');
  const sf = shop.id;
  const created = await call('/storefronts', {
    method: 'POST',
    headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: sf, resellerId: S.accountId, shortCode: shop.shortCode,
      name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général', correlationId: `corr-${n}`, at: T0,
    }),
  });
  expect(created.status, created.text).toBe(200);
  await call(`/storefronts/${sf}/publish`, { method: 'POST', headers: S.bearer, body: JSON.stringify({ correlationId: 'corr-en-ligne' }) });
  const listingId = `lst-net-${n}`;
  const pub = await call('/listings', {
    method: 'POST',
    headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId, storefrontId: sf, resellerId: S.accountId,
      productVersionId: pid, offerVersion: 'ov-net-1', markup: MARKUP, correlationId: `corr-${n}`, at: T0,
    }),
  });
  expect(pub.json['status'], `the Worker refused the publish itself: ${pub.text}`).toBe('published');
  const ns = await mf.getDurableObjectNamespace('LISTING');
  const economics = (await (await ns.get(ns.idFromName(listingId)).fetch('https://do/entry/economics')).json()) as {
    customerPriceFcfa?: number;
    resellerCommission?: number;
  };
  expect(economics.customerPriceFcfa, 'her signed price').toBe(B + MARKUP);
  expect(economics.resellerCommission, 'the frozen commission').toBe(C);
  return { slug: shop.slug, resellerId: S.accountId };
}

async function quoteFor(shop: { slug: string; resellerId: string }, pid: string, requestKey: string) {
  return call('/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: shop.slug, pid, paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: shop.resellerId, requestKey }),
  });
}

/** The id the Worker minted for this request key, read off the key's own record. */
async function quoteIdOfKey(requestKey: string): Promise<string> {
  const ns = await mf.getDurableObjectNamespace('CHECKOUT');
  const res = await ns.get(ns.idFromName(`key:${requestKey}`)).fetch('https://do/key/claim', {
    method: 'POST',
    body: JSON.stringify({ candidateQuoteId: 'quote-never-minted-here' }),
  });
  const claim = (await res.json()) as { quoteId: string; claimed: boolean };
  // `claimed: false` — the quote request already minted this id; this read wrote nothing.
  expect(claim.claimed, 'the quote request never reached the key').toBe(false);
  return claim.quoteId;
}

async function storedQuote(quoteId: string) {
  const ns = await mf.getDurableObjectNamespace('CHECKOUT');
  const res = await ns.get(ns.idFromName(quoteId)).fetch('https://do/entry');
  return { status: res.status, body: (await res.json()) as { ok: boolean; reason?: string; quote?: { sellerNet?: number } } };
}

describe('a commission that leaves the seller nothing gets no quote, and no order can start from it', () => {
  for (const [n, pid, B, C] of [
    ['0001', 'pv-net-negatif', 1_000, 1_500],
    ['0002', 'pv-net-zero', 1_000, 1_000],
  ] as const) {
    it(`B ${B} · C ${C}: refused by name, nothing stored, no reservation, no order`, async () => {
      const shop = await shopSelling(n, pid, B, C);
      const key = `rk-net-${n}-xxxxxxxxxxxx`;
      const quote = await quoteFor(shop, pid, key);
      expect(quote.status, quote.text).toBe(422);
      expect(quote.json['error']).toBe('stored_amounts_incoherent');
      expect(quote.json['quoteId']).toBeUndefined();

      // ASK THE WORKER'S RECORDS, not the response.
      const quoteId = await quoteIdOfKey(key);
      const stored = await storedQuote(quoteId);
      expect(stored.status, JSON.stringify(stored.body)).toBe(404);
      expect(stored.body.reason).toBe('not_found');
      expect((await call(`/checkout/quote/${encodeURIComponent(quoteId)}`)).status).toBe(404);

      const reserve = await call(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
      });
      // No quote under this id, so nothing to hold: the reserve door says so by name.
      expect({ status: reserve.status, error: reserve.json['error'] }, reserve.text).toEqual({ status: 404, error: 'not_found' });
      // The quote object's own reservation record: nothing was held.
      const quotes = await mf.getDurableObjectNamespace('CHECKOUT');
      const held = (await (await quotes.get(quotes.idFromName(quoteId)).fetch('https://do/entry/reservation')).json()) as {
        ok: boolean;
        state: { status: string };
      };
      expect(held).toEqual({ ok: true, state: { status: 'none' } });
      const order = await call('/checkout/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}` }),
      });
      // The order door finds no stored quote to make an order from.
      expect({ status: order.status, error: order.json['error'] }, order.text).toEqual({ status: 404, error: 'quote_unknown' });
      const orders = await mf.getDurableObjectNamespace('ORDER');
      const orderRecord = await orders.get(orders.idFromName(`ord-${quoteId}`)).fetch('https://do/entry');
      expect(orderRecord.status, 'an order object exists for a quote that was refused').toBe(404);
    }, 60_000);
  }

  it('one franc left still quotes, and the stored quote leaves the seller exactly 1 franc', async () => {
    const shop = await shopSelling('0003', 'pv-net-un', 1_000, 999);
    const key = 'rk-net-0003-xxxxxxxxxxxx';
    const quote = await quoteFor(shop, 'pv-net-un', key);
    expect(quote.status, quote.text).toBe(200);
    expect(quote.json['buyerTotal']).toBe(2_250); // B 1 000 + M 250 + D 1 000
    const stored = await storedQuote(quote.json['quoteId'] as string);
    expect(stored.body.ok, JSON.stringify(stored.body)).toBe(true);
    expect(stored.body.quote?.sellerNet).toBe(1);

    // The same record reads « reserved » once a hold is taken, so the « none »
    // asserted above for a refused quote is a real answer, not a default.
    const quoteId = quote.json['quoteId'] as string;
    const reserve = await call(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: 'cmd-reserve-0003', holderRef: 'holder-0003' }),
    });
    expect(reserve.status, reserve.text).toBe(200);
    const quotes = await mf.getDurableObjectNamespace('CHECKOUT');
    const held = (await (await quotes.get(quotes.idFromName(quoteId)).fetch('https://do/entry/reservation')).json()) as {
      state: { status: string };
    };
    expect(held.state.status).toBe('reserved');
  }, 60_000);
});
