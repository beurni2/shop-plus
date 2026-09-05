import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { orderIdForQuote } from '../src/order-core.js';
import { OPS_SECRET, seance } from './seance';

/**
 * C1/C2 (audit) — THE ATTRIBUTION LOCK IS DURABLE AND CLAIMED IN PRODUCTION.
 *
 * SP-I09b.3: « Une fois la commande verrouillée, l'attribution est immuable
 * (first-lock-wins) ». The machinery existed (AttributionLockDO, decideLock)
 * with no production call site — a book nobody wrote in. It now joins the
 * combined Worker and the OrderDO claims it at order create:
 * checkoutRef = the order's own id, resellerId = the Quote's LOCKED
 * attributionResellerId (SP-I01), tokenId = the quote id (the identity-scope
 * qualification — SP5's signed product tokens will present their own ids here
 * and collide honestly rather than re-attribute).
 *
 * Driven on the REAL bundle through real workerd, asking the BOOK for the
 * outcome rather than believing the response: the lock is read back through
 * Miniflare's namespace probe (there is deliberately NO public route to it).
 *
 * ACCES-ARME-2 (2026-09-05): the shared write key is retired. Every shop
 * fixture here is seated through `seance()` — signup → the founder mints on
 * key C → admission — and is created with HER session bearer; the
 * `resellerId` the lock must name is the id the book minted, never one this
 * file chose.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'attribution-lock-'));
const T0 = '2026-08-21T08:00:00.000Z';

const SUPPLY = [
  {
    productVersionId: 'pv-attr-1',
    offerVersion: 'ov-attr-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO',
    LISTING: 'ListingDO',
    CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO',
    LADDER: 'BuyerLadderDO',
    ATTRIBUTION_LOCK: 'AttributionLockDO',
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

async function seedShop(n: string): Promise<{ slug: string; resellerId: string }> {
  const S = await seance(mf, `attr${n}`);
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-attr-${n}`, resellerId: S.accountId,
      shortCode: `ATTR-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-attr-${n}`, storefrontId: `sf-attr-${n}`,
      resellerId: S.accountId, productVersionId: 'pv-attr-1', offerVersion: 'ov-attr-1',
      markup: 1_500, correlationId: `corr-${n}`, at: T0,
    }),
  });
  const decision = (await pub.json()) as { status?: string };
  if (decision.status !== 'published') throw new Error(`setup: listing ${JSON.stringify(decision)}`);
  return { slug: `attr-${n}`, resellerId: S.accountId };
}

/** quote → reserve, returning the ids the create needs. */
async function quoteAndReserve(n: string, shop: { slug: string; resellerId: string }) {
  const q = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: shop.slug, pid: 'pv-attr-1', paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou', attributionResellerId: shop.resellerId,
      requestKey: `rk-attr-${n}-xxxxxxxxxxxx`,
    }),
  });
  const qBody = safeJson(await q.text());
  if (q.status !== 200) throw new Error(`setup: quote ${q.status} ${JSON.stringify(qBody)}`);
  const quoteId = qBody['quoteId'] as string;
  const r = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: `cmd-res-${n}`, holderRef: `holder-attr-${n}` }),
  });
  if (r.status !== 200) throw new Error(`setup: reserve ${r.status}`);
  return { quoteId, holderRef: `holder-attr-${n}` };
}

async function lockProbe(orderId: string): Promise<{ ok?: boolean; lock?: Record<string, unknown> | null }> {
  const ns = await mf.getDurableObjectNamespace('ATTRIBUTION_LOCK');
  const stub = ns.get(ns.idFromName(orderId));
  const res = await stub.fetch('https://do/lock');
  return (await res.json()) as { ok?: boolean; lock?: Record<string, unknown> | null };
}

describe('C1/C2 — the durable attribution lock, claimed on the real Worker', () => {
  it('NO DOOR: /locks/* on the public wire is not a route (the auth model is no route at all)', async () => {
    const res = await mf.dispatchFetch('http://c/locks/order-whatever', { method: 'GET' });
    expect(res.status).toBe(404);
    // A write with no session is the root's ONE 401 (ACCES-ARME-2), before any
    // route is even looked up — so the POST answers 401, and it is still no door.
    const post = await mf.dispatchFetch('http://c/locks/order-whatever', {
      method: 'POST',
      body: JSON.stringify({ checkoutRef: 'order-whatever', resellerId: 'rs-x', tokenId: 't-x', at: T0 }),
    });
    expect([401, 404]).toContain(post.status);
  });

  it('a real order create WRITES the durable lock: her reseller, keyed by the quote (SP-I09b.3)', async () => {
    const shop = await seedShop('0001');
    const { quoteId, holderRef } = await quoteAndReserve('0001', shop);
    const created = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, holderRef, commandId: 'cmd-order-0001' }),
    });
    expect(created.status, await created.clone().text()).toBe(200);

    const orderId = orderIdForQuote(quoteId);
    const probe = await lockProbe(orderId);
    expect(probe.ok).toBe(true);
    expect(probe.lock, 'the create must have claimed the durable lock').not.toBeNull();
    expect(probe.lock).toMatchObject({
      checkoutRef: orderId,
      resellerId: shop.resellerId,
      tokenId: quoteId,
    });
  });

  it('a FOREIGN lock on the order refuses the create — fail closed, the lock never moves, no order exists', async () => {
    const shop = await seedShop('0002');
    const { quoteId, holderRef } = await quoteAndReserve('0002', shop);
    const orderId = orderIdForQuote(quoteId);

    // The book already names ANOTHER reseller for this order (the state a
    // competing SP5 token would create). The create must refuse, not re-attribute.
    const ns = await mf.getDurableObjectNamespace('ATTRIBUTION_LOCK');
    const stub = ns.get(ns.idFromName(orderId));
    const seeded = await stub.fetch('https://do/lock', {
      method: 'POST',
      body: JSON.stringify({ checkoutRef: orderId, resellerId: 'rs-intrus', tokenId: 'tok-intrus', at: T0 }),
    });
    expect(seeded.status).toBe(200);

    const created = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, holderRef, commandId: 'cmd-order-0002' }),
    });
    // The order router normalizes every DO refusal to its wire convention
    // (« refusals are 422 ») with the reason under `error` — the collision
    // rides that convention rather than minting a second one.
    const body = safeJson(await created.text());
    expect(created.status, JSON.stringify(body)).toBe(422);
    expect(body['error']).toBe('attribution_locked_elsewhere');

    // The lock never moved, and no order was born refused.
    const probe = await lockProbe(orderId);
    expect(probe.lock).toMatchObject({ resellerId: 'rs-intrus', tokenId: 'tok-intrus' });
    const read = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`, { method: 'GET' });
    expect(read.status).toBe(404);
  });
});
