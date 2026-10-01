import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleC, seance } from './seance';

/**
 * ═══ VENTES-LIVREES-2 (founder « go 1 and 2 », 2026-10-01: count every
 * seller's older deliveries once) — on the REAL Worker ═══
 *
 * miniflare on the shipped bundle, every Durable Object real; only Boutik+'s
 * OFFER service stood in (as in `vitrine-vraie.e2e`). The book is put back the
 * way the previous Worker left it — sale rows, NO delivered marks, NO catch-up
 * receipt — by a stand-in of the same class over the same store (miniflare has
 * no storage accessor). Then the real Worker wakes, and the LEDGER the buyer
 * reads (`GET /s/{slug}` → `ventesLivrees`) must say, for each seller:
 *   · every delivery validated before, counted — including a seller who never
 *     opens her sales;
 *   · a paid sale not yet delivered, not counted;
 *   · nothing counted twice: a second catch-up over a marked book, and her own
 *     sales read, leave the counts where they are.
 * The catch-up walks in batches of two (`RATTRAPAGE_LOT`), so the cursor is
 * crossed several times.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'ventes-livrees-2-'));
const T0 = '2026-10-01T08:00:00.000Z';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-vl2001';
const PROGRESS_SECRET = 'test-progress-write-secret-vl2001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-vl2001';
const pidN = (i: number): string => `pv-vl2-${i}`;

const SUPPLY = Array.from({ length: 4 }, (_, k) => ({
  productVersionId: pidN(k + 1),
  offerVersion: `ov-vl2-${k + 1}`,
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 50,
  productName: `Article ${k + 1}`,
  assetRefs: [] as string[],
  category: 'fashion_bags_fabrics',
  sellerTier: 'verified',
}));

function nouveauMiniflare(): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO', WISHLIST: 'WishlistDO',
    },
    durableObjectsPersist: persist,
    bindings: {
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      CHECKOUT_OPS_SECRET: cleC.Authorization.slice('Bearer '.length),
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      RATTRAPAGE_LOT: '2',
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path === '/fulfillment/order-confirmed') return Response.json({ ok: true, status: 'registered' });
        if (request.method === 'POST' && path === '/fulfillment/delivered') {
          return Response.json({ ok: true, status: 'delivered', deliveredAt: new Date().toISOString() });
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
}

let mf: Miniflare;
beforeAll(() => {
  mf = nouveauMiniflare();
});
afterAll(async () => {
  await mf?.dispose();
  rmSync(persist, { recursive: true, force: true });
});

type Seance = Awaited<ReturnType<typeof seance>>;
function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function boutique(S: Seance, tag: string, n: number): Promise<string> {
  const sfId = `sf-vl2-${tag}`;
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${tag}`, id: sfId, resellerId: S.accountId, shortCode: `VL-${tag}`,
      name: `Boutique ${tag}`, zone: 'Ouagadougou', category: 'Général', correlationId: `corr-vl2-${tag}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${await created.text()}`);
  for (let i = 1; i <= n; i += 1) {
    const pub = await mf.dispatchFetch('http://c/listings', {
      method: 'POST', headers: S.bearer,
      body: JSON.stringify({
        commandId: `cmd-listing-${tag}-${i}`, listingId: `lst-vl2-${tag}-${i}`, storefrontId: sfId,
        resellerId: S.accountId, productVersionId: pidN(i), offerVersion: `ov-vl2-${i}`,
        markup: 500, correlationId: `corr-vl2-${tag}-${i}`, at: T0,
      }),
    });
    if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error(`setup: listing ${i}`);
  }
  return `vl-${tag}`;
}

/** THE LEDGER — the count the buyer's page carries. */
async function compte(slug: string): Promise<unknown> {
  const res = await mf.dispatchFetch(`http://c/s/${slug}`);
  return safeJson(await res.text())['ventesLivrees'];
}

let keySeq = 0;
const freshKey = (): string => `rk-vl2-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

async function vendre(S: Seance, slug: string, pid: string, n: string, livrer: boolean): Promise<string> {
  const q = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, pid, paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: S.accountId, requestKey: freshKey() }),
  });
  const quote = safeJson(await q.text());
  if (q.status !== 200) throw new Error(`setup: quote ${q.status} ${JSON.stringify(quote)}`);
  const quoteId = quote['quoteId'] as string;
  const held = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
  });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const ordered = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`, contact: { phone: '70 11 22 33', quartier: 'Gounghin', repere: 'près du marché' } }),
  });
  if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status} ${await ordered.text()}`);
  const orderId = `ord-${quoteId}`;
  const vue = safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());
  const nsOrd = await mf.getDurableObjectNamespace('ORDER');
  const audit = (await (await nsOrd.get(nsOrd.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as { legKeys?: Record<string, string> };
  const paid = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET },
    body: JSON.stringify({
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: { command_id: `whk-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 1, actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1' },
      payload: { provider: 'sandbox-provider', payment_attempt_id: audit.legKeys?.['checkout'], collectRef: `collect-${orderId}`, amount: Number(vue['amountPaidAtCheckout']), fee: 0, status: 'held', order_id: orderId, redelivery: false },
    }),
  });
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status}`);
  if (!livrer) return orderId;
  const res = await mf.dispatchFetch('http://c/fulfillment/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    body: JSON.stringify({
      name: 'delivery.validated.v1',
      envelope: { command_id: `eligibility-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-10-01T14:30:00.000Z', version: '1' },
      payload: { order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`, result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-vl2-001' },
    }),
  });
  await res.text();
  if (res.status !== 200) throw new Error(`setup: livraison ${res.status}`);
  return orderId;
}

/**
 * Put the book back as the previous Worker left it: erase every delivered
 * mark, every count and — when asked — the catch-up receipt. The sale rows
 * (`row:*`) stay: they are what the previous Worker DID write.
 */
async function commeAvant(prefixes: readonly string[]): Promise<number> {
  await mf.dispose();
  const avant = new Miniflare({
    modules: true,
    script: `
      export class ResellerFeedDO {
        constructor(state) { this.state = state; }
        async fetch() {
          let n = 0;
          for (const prefix of ${JSON.stringify(prefixes)}) {
            const cles = [...(await this.state.storage.list({ prefix })).keys()];
            if (cles.length > 0) n += await this.state.storage.delete(cles);
          }
          await this.state.storage.deleteAlarm();
          return Response.json({ effaces: n });
        }
      }
      export default { async fetch(request, env) { return env.RESELLER.get(env.RESELLER.idFromName('reseller-feed')).fetch(request); } };`,
    durableObjects: { RESELLER: 'ResellerFeedDO' },
    durableObjectsPersist: persist,
  });
  const effaces = (await (await avant.dispatchFetch('http://x/')).json()) as { effaces: number };
  await avant.dispose();
  mf = nouveauMiniflare();
  return effaces.effaces;
}

/**
 * The catch-up's own receipt, read through a stand-in over the same store
 * (verifier m1: the counts alone cannot tell « walked again » from « did
 * nothing »). `planter` first writes a sale row whose order does not exist,
 * under a reseller id that escaping changes (verifier m3).
 */
async function recu(planter?: { resellerId: string; orderId: string }): Promise<Record<string, unknown> | null> {
  await mf.dispose();
  const lecteur = new Miniflare({
    modules: true,
    script: `
      export class ResellerFeedDO {
        constructor(state) { this.state = state; }
        async fetch(request) {
          const corps = await request.json();
          if (corps.planter) {
            const p = corps.planter;
            await this.state.storage.put('row:' + encodeURIComponent(p.resellerId) + ':' + p.orderId, { orderId: p.orderId, at: '2026-09-01T08:00:00.000Z' });
          }
          return Response.json({ recu: (await this.state.storage.get('rattrapage:livrees')) ?? null });
        }
      }
      export default { async fetch(request, env) { return env.RESELLER.get(env.RESELLER.idFromName('reseller-feed')).fetch(request); } };`,
    durableObjects: { RESELLER: 'ResellerFeedDO' },
    durableObjectsPersist: persist,
  });
  const lu = (await (await lecteur.dispatchFetch('http://x/', { method: 'POST', body: JSON.stringify({ planter: planter ?? null }) })).json()) as { recu: Record<string, unknown> | null };
  await lecteur.dispose();
  mf = nouveauMiniflare();
  return lu.recu;
}

/** The catch-up runs by alarm: ask the ledger until it answers, within a bound. */
async function attendre(slug: string, attendu: number): Promise<unknown> {
  let lu: unknown;
  for (let i = 0; i < 60; i += 1) {
    lu = await compte(slug);
    if (lu === attendu) return lu;
    await new Promise((r) => setTimeout(r, 100));
  }
  return lu;
}

describe('VENTES-LIVREES-2 — every older delivery is counted once, for every seller', () => {
  let slugA: string;
  let slugB: string;
  let SA: Seance;

  beforeAll(async () => {
    SA = await seance(mf, 'vl2a');
    const SB = await seance(mf, 'vl2b');
    slugA = await boutique(SA, '0001', 3);
    slugB = await boutique(SB, '0002', 1);
    await vendre(SA, slugA, pidN(1), 'a1', true);
    await vendre(SA, slugA, pidN(2), 'a2', true);
    await vendre(SA, slugA, pidN(3), 'a3', false); // paid, never delivered
    await vendre(SB, slugB, pidN(1), 'b1', true);
    expect(await compte(slugA)).toBe(2);
    expect(await compte(slugB)).toBe(1);
  }, 180_000);

  it('the book as the previous Worker left it (rows, no marks, no receipt): on its first wake every delivered sale is counted — the seller who never opens her sales too — and the undelivered one is not', async () => {
    const effaces = await commeAvant(['livree', 'rattrapage:']);
    expect(effaces, 'marks, counts and receipt are gone, as before this producer').toBeGreaterThan(0);
    // The first read wakes the book; the catch-up then walks every row in batches of two.
    expect(await attendre(slugB, 1), 'B never read her sales: only the catch-up can count her delivery').toBe(1);
    expect(await attendre(slugA, 2), 'two delivered, one only paid').toBe(2);
    // THE RECEIPT: every row asked, three marks written, nothing unreadable, and the end.
    const r = await recu();
    expect(r).toMatchObject({ lignes: 4, marquees: 3, illisibles: 0 });
    expect(typeof r?.['fin']).toBe('string');
  }, 60_000);

  it('never twice: her own sales read over the caught-up book, a restart, and a second full catch-up over the marks leave the counts as they are', async () => {
    const ventes = await mf.dispatchFetch('http://c/reseller/ventes', { headers: SA.bearer });
    expect(ventes.status).toBe(200);
    expect(await compte(slugA)).toBe(2);
    // the receipt says « done »: a plain restart starts nothing — the receipt is byte-identical after a wake
    const avant = await recu();
    expect(await commeAvant([]), 'nothing erased').toBe(0);
    expect(await compte(slugA)).toBe(2);
    await new Promise((r) => setTimeout(r, 500));
    expect(await recu(), 'a finished catch-up does not walk again').toEqual(avant);
    // the receipt alone erased: the catch-up walks the book again, over its own marks — and marks nothing new
    await commeAvant(['rattrapage:']);
    await compte(slugA); // wakes the book
    for (let i = 0; i < 40 && (await recu())?.['fin'] === undefined; i += 1) {
      await compte(slugA);
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(await recu()).toMatchObject({ lignes: 4, marquees: 0, illisibles: 0 });
    expect(await compte(slugA), 'a second catch-up never adds to a marked count').toBe(2);
    expect(await compte(slugB)).toBe(1);
  }, 60_000);

  it('a row whose order cannot be read (and whose reseller id escaping changes) is counted unreadable — the walk does not stall and the counts stand', async () => {
    await commeAvant(['rattrapage:']);
    await recu({ resellerId: 'rs:0000 x', orderId: 'ord-fantome' });
    await compte(slugA); // wakes the book
    for (let i = 0; i < 40 && (await recu())?.['fin'] === undefined; i += 1) {
      await compte(slugA);
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(await recu()).toMatchObject({ lignes: 5, marquees: 0, illisibles: 1 });
    expect(await compte(slugA)).toBe(2);
    expect(await compte(slugB)).toBe(1);
  }, 60_000);
});
