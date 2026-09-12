import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, cleC, seance } from './seance';

/**
 * DURCISSEMENT-SERVICE-1 (AUDIT-SHOP-2 F-28) — THE SUIVI'S BUDGET COUNTS EVERY
 * SUBREQUEST THE HANDLER MAKES.
 *
 * `/reseller/suivi` declared « one global order-read budget for the whole
 * board » and then spent, OUTSIDE it, one roster read plus ONE feed read PER
 * ACCOUNT: 1 + up to 50 + 40 = 91 subrequests on a platform that allows 50.
 * Past roughly nine accounts with sales the board degraded to `incomplet`
 * rows for a reason the budget never named. Now the feed answers every
 * account's rows in ONE read (`/rows-for-many`), and the roster read and that
 * read are paid from the same budget as the order reads: with the clamped
 * knob at 3, two accounts with one sale each leave exactly ONE order read —
 * one row complete, one declared incomplete, never both quietly complete
 * over an accounting the platform does not do.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'suivi-budget-'));
const T0 = '2026-09-12T08:00:00.000Z';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-s028';
const signed = { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' };

const SUPPLY = [
  {
    productVersionId: 'pv-suivi-1',
    offerVersion: 'ov-suivi-1',
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
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CHECKOUT_OPS_SECRET: OPS_SECRET,
    // the clamped test knob (lower only): roster + feed + ONE order read
    FEED_FANOUT_MAX: '3',
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
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

/** An admitted reseller, her shop, her listing, and ONE confirmed sale. */
async function unCompteAvecUneVente(n: string): Promise<{ accountId: string; orderId: string }> {
  const S = await seance(mf, `suivi${n}`);
  const sf = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-sf-${n}`, id: `sf-suivi-${n}`, resellerId: S.accountId, shortCode: `SUIVI-${n}`,
      name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général', correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (sf.status !== 200) throw new Error(`setup: storefront ${sf.status} ${await sf.text()}`);
  const lst = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-lst-${n}`, listingId: `lst-suivi-${n}`, storefrontId: `sf-suivi-${n}`, resellerId: S.accountId,
      productVersionId: 'pv-suivi-1', offerVersion: 'ov-suivi-1', markup: 1_500, correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (((await lst.json()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const q = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `suivi-${n}`, pid: 'pv-suivi-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: S.accountId, requestKey: `rk-suivi-${n}-${'x'.repeat(10)}`,
    }),
  });
  const qText = await q.text();
  const quoteId = (safeJson(qText) as { quoteId?: string }).quoteId;
  if (q.status !== 200 || quoteId === undefined) throw new Error(`setup: quote ${q.status} ${qText}`);
  await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: `cmd-res-${n}`, holderRef: `h-${n}` }),
  });
  const o = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId, holderRef: `h-${n}`, commandId: `cmd-ord-${n}` }),
  });
  const oText = await o.text();
  if (o.status !== 200) throw new Error(`setup: order ${o.status} ${oText}`);
  const amount = (safeJson(oText) as { amountPaidAtCheckout: number }).amountPaidAtCheckout;
  const orderId = `ord-${quoteId}`;
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const audit = (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as { legKeys?: Record<string, string> };
  const attemptId = audit.legKeys?.['checkout'];
  if (attemptId === undefined) throw new Error('setup: no checkout leg key');
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({ orderId, paymentAttemptId: attemptId, amount, correlationId: `corr-${orderId}`, requestedAtIso: T0 });
  const hook = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
    method: 'POST', headers: signed, body: JSON.stringify(provider.webhookDeliveryPlan()[0]!.event),
  });
  if (hook.status !== 200) throw new Error(`setup: webhook ${hook.status} ${await hook.text()}`);
  return { accountId: S.accountId, orderId };
}

describe('DURCISSEMENT-SERVICE-1 (F-28) — the suivi pays its roster and feed reads from the same budget as its order reads', () => {
  it('two accounts, one sale each, budget 3: ONE row complete and ONE declared incomplete — never two complete over an uncounted fan-out', async () => {
    const a = await unCompteAvecUneVente('0001');
    const b = await unCompteAvecUneVente('0002');

    const res = await mf.dispatchFetch('http://c/reseller/suivi', { headers: cleC });
    expect(res.status).toBe(200);
    const body = safeJson(await res.text()) as { lignes?: { accountId: string; ventes: number; netFcfa: number; incomplet: boolean }[] };
    const lignes = (body.lignes ?? []).filter((l) => l.accountId === a.accountId || l.accountId === b.accountId);
    expect(lignes, 'both admitted accounts are on the board').toHaveLength(2);
    const completes = lignes.filter((l) => !l.incomplet);
    const incompletes = lignes.filter((l) => l.incomplet);
    expect(completes, 'exactly one row could be read within the budget').toHaveLength(1);
    expect(completes[0]).toMatchObject({ ventes: 1, netFcfa: 2_500 }); // FRAIS-ZERO: net = C+M
    expect(incompletes, 'the other is DECLARED incomplete, not served short').toHaveLength(1);
    expect(incompletes[0]).toMatchObject({ ventes: 0, netFcfa: 0 });
  });

  it('the feed answers every account\'s rows in ONE read — `/rows-for-many` on the feed object, malformed asks refused by name', async () => {
    const ns = await mf.getDurableObjectNamespace('RESELLER');
    const feed = ns.get(ns.idFromName('reseller-feed'));
    const comptes = (await (await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC })).json()) as { accounts?: { accountId: string }[] };
    const ids = (comptes.accounts ?? []).map((c) => c.accountId);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const res = await feed.fetch('https://do/rows-for-many', { method: 'POST', body: JSON.stringify({ resellerIds: ids }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; rows: Record<string, { orderId: string; at: string }[]> };
    expect(body.ok).toBe(true);
    for (const id of ids) {
      expect(Array.isArray(body.rows[id]), `rows for ${id}`).toBe(true);
      expect(body.rows[id]!.length, `${id} has exactly one confirmed sale`).toBe(1);
      expect(body.rows[id]![0]!.orderId).toMatch(/^ord-/);
    }
    // a reseller nobody registered a sale for is present and EMPTY, never missing
    const vide = (await (await feed.fetch('https://do/rows-for-many', { method: 'POST', body: JSON.stringify({ resellerIds: ['rs-personne'] }) })).json()) as { rows: Record<string, unknown[]> };
    expect(vide.rows['rs-personne']).toEqual([]);
    for (const mauvais of [{}, { resellerIds: 'rs-0001' }, { resellerIds: [''] }, { resellerIds: [42] }, { resellerIds: Array.from({ length: 51 }, (_, i) => `rs-${i}`) }]) {
      const r = await feed.fetch('https://do/rows-for-many', { method: 'POST', body: JSON.stringify(mauvais) });
      expect(r.status, JSON.stringify(mauvais).slice(0, 40)).toBe(400);
    }
  });
});
