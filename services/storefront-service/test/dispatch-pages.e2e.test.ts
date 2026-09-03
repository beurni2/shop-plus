import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ DISPATCH-PAGES-1 (AUDIT-SHOP-1 slice b) — THE FOUNDER'S TWO FAN-OUT
 * READS ARE PAGED, on the real combined Worker ═══
 *
 * The audit's MAJOR: `/checkout/dispatch` and `/checkout/gains` listed the
 * WHOLE lifetime index and then made one subrequest per order — the platform
 * caps subrequests per request, so the console 500'd for good at ≈49 orders.
 * This suite creates five real orders through the whole buyer path and walks
 * the pages: every page within the asked size, `next` present exactly while
 * rows remain, the UNION of the pages equal to the unpaged read (no row lost,
 * none repeated), newest first across page boundaries, and refusals BY NAME
 * for a limit past the budget or a cursor the index cannot read.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'dispatch-pages-'));
const T0 = '2026-09-03T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-p101';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-p101';
const OPS_SECRET = 'test-checkout-ops-secret-p101';
const authed = { 'X-Write-Key': WRITE_SECRET };
const signed = { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' };
const cleC = { Authorization: `Bearer ${OPS_SECRET}` };

const CONTACT = { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'Face à la pharmacie' };

const SUPPLY = [
  {
    productVersionId: 'pv-pages-1',
    offerVersion: 'ov-pages-1',
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
    ATTRIBUTION_LOCK: 'AttributionLockDO',
    LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    STOREFRONT_WRITE_SECRET: WRITE_SECRET,
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CHECKOUT_OPS_SECRET: OPS_SECRET,
  },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
        return Response.json({ ok: true, status: 'registered' });
      }
      const single = /^\/supply-projection\/([^/]+)$/.exec(path);
      if (single) {
        const value = SUPPLY.find((v) => v.productVersionId === decodeURIComponent(single[1]!));
        if (value === undefined) return Response.json({ status: 'not_found' }, { status: 404 });
        return Response.json({ version: 1, asOf: new Date().toISOString(), value });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
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

let keyN = 0;
const freshKey = (): string => `rk-pages-${String((keyN += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

/** shop → listing → quote → hold → order WITH contact — the whole buyer path,
 *  mirrored from dispatch.e2e; a 200 create is what registers the index row. */
async function commander(n: string): Promise<{ orderId: string; amount: number }> {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-pages-${n}`, resellerId: `rs-pages-${n}`, shortCode: `PAGES-${n}`,
      name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général',
      correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`seed: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-pages-${n}`, storefrontId: `sf-pages-${n}`,
      resellerId: `rs-pages-${n}`, productVersionId: 'pv-pages-1', offerVersion: 'ov-pages-1',
      markup: 1_500, correlationId: `corr-${n}`, at: T0,
    }),
  });
  if ((safeJson(await pub.text()) as { status?: string }).status !== 'published') throw new Error('seed: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `pages-${n}`, pid: 'pv-pages-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: `rs-pages-${n}`, requestKey: freshKey(),
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
  if (quoteRes.status !== 200 || typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status}`);
  const held = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
  });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const res = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`, contact: CONTACT }),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`setup: order ${res.status} ${text}`);
  return { orderId: `ord-${quote.quoteId}`, amount: (safeJson(text) as { amountPaidAtCheckout?: number }).amountPaidAtCheckout ?? 0 };
}

async function lire(route: 'dispatch' | 'gains', query = '') {
  const res = await mf.dispatchFetch(`http://c/checkout/${route}${query}`, { headers: cleC });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) as { ok?: boolean; orders?: { orderId: string }[]; gains?: { orderId: string }[]; next?: string; reason?: string } };
}

const CREES: { orderId: string; amount: number }[] = [];
beforeAll(async () => {
  for (const n of ['0001', '0002', '0003', '0004', '0005']) CREES.push(await commander(n));
}, 120_000);

describe('DISPATCH-PAGES-1 — the dispatch read pages, and the pages ARE the list', () => {
  it('pages of 2: sizes honoured, next present exactly while rows remain, the union equals the unpaged read in the same order, no duplicates', async () => {
    const tout = await lire('dispatch');
    expect(tout.status, tout.text).toBe(200);
    expect(tout.json.orders!.length, 'five orders were created above').toBe(5);
    // five rows fit one default page whole — nothing more to fetch, no next
    expect('next' in tout.json).toBe(false);

    const vus: string[] = [];
    let cursor: string | undefined;
    let tours = 0;
    do {
      const page = await lire('dispatch', `?limit=2${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`);
      expect(page.status, page.text).toBe(200);
      expect(page.json.orders!.length, 'a page never exceeds its asked size').toBeLessThanOrEqual(2);
      vus.push(...page.json.orders!.map((o) => o.orderId));
      cursor = page.json.next;
      tours += 1;
    } while (cursor !== undefined && tours < 10);
    expect(tours, '5 rows at 2 per page is exactly 3 pages').toBe(3);
    // the union IS the unpaged read — same rows, same order, nothing repeated
    expect(vus).toEqual(tout.json.orders!.map((o) => o.orderId));
    expect(new Set(vus).size).toBe(5);
    // and every created order is on it
    for (const c of CREES) expect(vus, c.orderId).toContain(c.orderId);
  }, 60_000);

  it('gains pages ride the same cursor law (empty here — nothing is confirmed — but the page contract still answers)', async () => {
    const page = await lire('gains', '?limit=2');
    expect(page.status, page.text).toBe(200);
    expect(Array.isArray(page.json.gains)).toBe(true);
    // the index has 5 rows, so a 2-row sweep still has more to visit: next is
    // present even though no visited order was confirmed — the cursor walks
    // the INDEX, and « no gains on this page » is not « no more pages »
    expect(typeof page.json.next, 'next walks the index, not the filtered rows').toBe('string');
  });

  it('a confirmed order reaches the gains pages exactly once across the sweep', async () => {
    // confirm ONE order the provider's own way — the genuine webhook names
    // the LEG KEY off the order's own record and the create's exact amount
    // (the NB-3 discipline, mirrored from dispatch.e2e)
    const cible = CREES[2]!.orderId;
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const audit = (await (await ns.get(ns.idFromName(cible)).fetch('https://do/entry/audit')).json()) as {
      legKeys?: Record<string, string>;
    };
    const attemptId = audit.legKeys?.['checkout'];
    if (attemptId === undefined) throw new Error('no checkout leg key');
    const provider = new MockPaymentProvider({});
    provider.initiateCharge({ orderId: cible, paymentAttemptId: attemptId, amount: CREES[2]!.amount, correlationId: `corr-${cible}`, requestedAtIso: T0 });
    const event = provider.webhookDeliveryPlan()[0]!.event;
    const hook = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
      method: 'POST', headers: signed, body: JSON.stringify(event),
    });
    expect(hook.status, await hook.clone().text()).toBe(200);

    const vus: string[] = [];
    let cursor: string | undefined;
    let tours = 0;
    do {
      const page = await lire('gains', `?limit=2${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`);
      expect(page.status, page.text).toBe(200);
      vus.push(...page.json.gains!.map((g) => g.orderId));
      cursor = page.json.next;
      tours += 1;
    } while (cursor !== undefined && tours < 10);
    expect(vus).toEqual([cible]);
  }, 60_000);

  it('refusals BY NAME: a limit past the budget, zero, junk, and an unreadable cursor are each 400 malformed — never a 500, never index_unavailable', async () => {
    for (const q of ['?limit=41', '?limit=0', '?limit=abc', '?limit=1.5', '?cursor=pas-de-separateur', '?cursor=a%7C%25E0']) {
      const res = await lire('dispatch', q);
      expect(res.status, q).toBe(400);
      expect(res.json.reason, q).toBe('malformed');
    }
    // a WELL-FORMED cursor pointing past everything is a lawful empty page
    const fin = await lire('dispatch', `?limit=2&cursor=${encodeURIComponent('0000|rien')}`);
    expect(fin.status, fin.text).toBe(200);
    expect(fin.json.orders).toEqual([]);
    expect('next' in fin.json).toBe(false);
  });

  it('the door is unchanged: no key C answers 401 on the paged read too', async () => {
    const res = await mf.dispatchFetch('http://c/checkout/dispatch?limit=2');
    expect(res.status).toBe(401);
  });
});
