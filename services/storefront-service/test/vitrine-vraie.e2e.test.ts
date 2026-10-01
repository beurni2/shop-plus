import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_PRODUITS_DECRITS } from '../src/index';
import { cleC, seance } from './seance';

/**
 * ═══ VITRINE-VRAIE-1 (AUDIT-3, founder 2026-10-01 « make it be 2 slices fix »)
 * — the boutique a buyer opens, on the REAL Worker ═══
 *
 * miniflare on the shipped bundle, every Durable Object real; only Boutik+'s
 * OFFER service stood in (the `pause-vente.e2e` stand-in, contract-certified
 * there). What is proven, by asking the buyer's own reads and the ledger:
 *   · a boutique larger than one read is served in PAGES, in her order, with
 *     nothing lost — and a link's own product is described whatever its rank
 *     (her 16th article's link answered « no boutique » before);
 *   · « N ventes livrées » is produced: a validated delivery counts once, a
 *     redelivery never twice, and a delivery validated BEFORE the count
 *     existed is counted the next time she reads her sales;
 *   · a liste belongs to ONE boutique: priced to her address and attached to
 *     an order only there, and only for an article she listed.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'vitrine-vraie-'));
const T0 = '2026-10-01T08:00:00.000Z';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-vv001';
const PROGRESS_SECRET = 'test-progress-write-secret-vv001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-vv001';
const N = 20;
const pidN = (i: number): string => `pv-vv-${i}`;

const SUPPLY = Array.from({ length: N }, (_, k) => ({
  productVersionId: pidN(k + 1),
  offerVersion: `ov-vv-${k + 1}`,
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

/** Her shop with `n` published products, through the REAL doors on her session. */
async function boutique(S: Seance, tag: string, n: number): Promise<{ slug: string; sfId: string }> {
  const sfId = `sf-vv-${tag}`;
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${tag}`, id: sfId, resellerId: S.accountId, shortCode: `VV-${tag}`,
      name: `Boutique ${tag}`, zone: 'Ouagadougou', category: 'Général', correlationId: `corr-vv-${tag}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${await created.text()}`);
  for (let i = 1; i <= n; i += 1) {
    const pub = await mf.dispatchFetch('http://c/listings', {
      method: 'POST', headers: S.bearer,
      body: JSON.stringify({
        commandId: `cmd-listing-${tag}-${i}`, listingId: `lst-vv-${tag}-${i}`, storefrontId: sfId,
        resellerId: S.accountId, productVersionId: pidN(i), offerVersion: `ov-vv-${i}`,
        markup: 500, correlationId: `corr-vv-${tag}-${i}`, at: T0,
      }),
    });
    if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error(`setup: listing ${i}`);
  }
  return { slug: `vv-${tag}`, sfId };
}

async function lire(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await mf.dispatchFetch(`http://c${path}`);
  return { status: res.status, body: safeJson(await res.text()) };
}
const pidsDe = (body: Record<string, unknown>): string[] => ((body['products'] as { pid: string }[] | undefined) ?? []).map((p) => p.pid);

let keySeq = 0;
const freshKey = (): string => `rk-vv-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

async function vendreEtLivrer(S: Seance, slug: string, pid: string, n: string, livrer = true): Promise<string> {
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
  const livre = await valider(orderId);
  if (livre !== 200) throw new Error(`setup: livraison ${livre}`);
  return orderId;
}

async function valider(orderId: string): Promise<number> {
  const res = await mf.dispatchFetch('http://c/fulfillment/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    body: JSON.stringify({
      name: 'delivery.validated.v1',
      envelope: { command_id: `eligibility-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-10-01T14:30:00.000Z', version: '1' },
      payload: { order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`, result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-vv-001' },
    }),
  });
  await res.text();
  return res.status;
}

let S1: Seance;
let shop: { slug: string; sfId: string };

describe('VITRINE-VRAIE-1 — every product of a big boutique reaches the buyer', () => {
  beforeAll(async () => {
    S1 = await seance(mf, 'vv1');
    shop = await boutique(S1, '0001', N);
  }, 120_000);

  it('the first page describes MAX_PRODUITS_DECRITS products in her order and says where the next page starts; the next page gives the rest; nothing is lost', async () => {
    expect(MAX_PRODUITS_DECRITS).toBeLessThan(N);
    const p1 = await lire(`/s/${shop.slug}`);
    expect(p1.status).toBe(200);
    expect(pidsDe(p1.body)).toEqual(Array.from({ length: MAX_PRODUITS_DECRITS }, (_, k) => pidN(k + 1)));
    expect(p1.body['suite']).toBe(MAX_PRODUITS_DECRITS);
    expect(p1.body['incomplet'], 'a page boundary is not a failure').toBeUndefined();
    const p2 = await lire(`/s/${shop.slug}?depuis=${String(p1.body['suite'])}`);
    expect(p2.status).toBe(200);
    expect(pidsDe(p2.body)).toEqual(Array.from({ length: N - MAX_PRODUITS_DECRITS }, (_, k) => pidN(MAX_PRODUITS_DECRITS + k + 1)));
    expect(p2.body['suite'], 'the last page says nothing more is left').toBeUndefined();
    expect(p2.body['ventesLivrees'], 'her count rides the first page only').toBeUndefined();
    expect([...pidsDe(p1.body), ...pidsDe(p2.body)]).toEqual(Array.from({ length: N }, (_, k) => pidN(k + 1)));
  }, 60_000);

  it('a link to her LAST article describes that article (it answered « no boutique » before); a pid outside her shop is never described', async () => {
    const lien = await lire(`/s/${shop.slug}?pid=${pidN(N)}`);
    expect(lien.status).toBe(200);
    expect(pidsDe(lien.body)).toEqual([pidN(N)]);
    expect(lien.body['suite']).toBeUndefined();
    expect(lien.body['ventesLivrees'], 'a product link never draws the count, so it is not read').toBeUndefined();
    const panier = await lire(`/s/${shop.slug}?pid=${pidN(N)},${pidN(3)},pv-pas-chez-elle`);
    expect(pidsDe(panier.body)).toEqual([pidN(N), pidN(3)]);
    const etranger = await lire(`/s/${shop.slug}?pid=pv-pas-chez-elle`);
    expect(pidsDe(etranger.body), 'a pid not in her shop is not asked — her first page answers').not.toContain('pv-pas-chez-elle');
  }, 60_000);
});

describe('VITRINE-VRAIE-1 — « N ventes livrées » is produced (SP8)', () => {
  it('no delivery yet ⇒ 0 on her first page (and no count on later pages); a validated delivery ⇒ 1; the same signal again ⇒ still 1', async () => {
    const S = await seance(mf, 'vv2');
    const b = await boutique(S, '0002', 2);
    const avant = await lire(`/s/${b.slug}`);
    expect(avant.body['ventesLivrees']).toBe(0);
    const orderId = await vendreEtLivrer(S, b.slug, pidN(1), '0002');
    expect((await lire(`/s/${b.slug}`)).body['ventesLivrees']).toBe(1);
    expect(await valider(orderId), 'the redelivered signal is accepted as a duplicate').toBe(200);
    expect((await lire(`/s/${b.slug}`)).body['ventesLivrees'], 'one order counts once').toBe(1);
    // her sales read sees the same delivery and re-marks it — still once
    const ventes = await mf.dispatchFetch('http://c/reseller/ventes', { headers: S.bearer });
    expect(ventes.status).toBe(200);
    expect((await lire(`/s/${b.slug}`)).body['ventesLivrees']).toBe(1);
  }, 120_000);
});

describe('VITRINE-VRAIE-1 — only a DELIVERED sale counts (verifier m3)', () => {
  it('paid, not yet delivered ⇒ 0, still 0 after her sales read; the validated delivery then makes it 1', async () => {
    const S = await seance(mf, 'vv8');
    const b = await boutique(S, '0008', 2);
    const orderId = await vendreEtLivrer(S, b.slug, pidN(1), '0008', false);
    expect((await lire(`/s/${b.slug}`)).body['ventesLivrees'], 'a paid order is not a delivered sale').toBe(0);
    const ventes = await mf.dispatchFetch('http://c/reseller/ventes', { headers: S.bearer });
    expect(ventes.status).toBe(200);
    expect((await lire(`/s/${b.slug}`)).body['ventesLivrees'], 'her sales read marks nothing undelivered').toBe(0);
    expect(await valider(orderId)).toBe(200);
    expect((await lire(`/s/${b.slug}`)).body['ventesLivrees']).toBe(1);
  }, 120_000);
});

describe('VITRINE-VRAIE-1 — a liste belongs to ONE boutique', () => {
  it('her liste prices to her address on HER boutique only, for an article she listed; another boutique holding the link is refused by name', async () => {
    const SA = await seance(mf, 'vv3');
    const SB = await seance(mf, 'vv4');
    const a = await boutique(SA, '0003', 2);
    const b = await boutique(SB, '0004', 2);
    const cree = await mf.dispatchFetch('http://c/listes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: a.slug, nom: 'Mariam', pids: [pidN(1)],
        livraison: { telephone: '70 55 66 77', quartier: 'Tampouy', repere: 'derrière la mosquée', zone: 'Tampouy, Ouagadougou' },
      }),
    });
    const liste = safeJson(await cree.text());
    expect(cree.status, JSON.stringify(liste)).toBe(200);
    const token = liste['token'] as string;
    const demander = async (slug: string, pid: string, resellerId: string) => {
      const res = await mf.dispatchFetch('http://c/checkout/quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, pid, paymentMode: 'FULL_PREPAY', listeRef: token, attributionResellerId: resellerId, requestKey: freshKey() }),
      });
      return { status: res.status, body: safeJson(await res.text()) };
    };
    const ailleurs = await demander(b.slug, pidN(1), SB.accountId);
    expect(ailleurs.status).toBe(409);
    expect(ailleurs.body).toEqual({ ok: false, reason: 'liste_hors_boutique' });
    const autreArticle = await demander(a.slug, pidN(2), SA.accountId);
    expect(autreArticle.body['reason']).toBe('liste_hors_boutique');
    const chezElle = await demander(a.slug, pidN(1), SA.accountId);
    expect(chezElle.status, JSON.stringify(chezElle.body)).toBe(200);
  }, 120_000);

  it('an order on ANOTHER boutique naming her liste (no address: the friend fills it) is refused by name — her wish is never marked by another seller', async () => {
    const SA = await seance(mf, 'vv5');
    const SB = await seance(mf, 'vv6');
    const a = await boutique(SA, '0005', 1);
    const b = await boutique(SB, '0006', 1);
    const cree = await mf.dispatchFetch('http://c/listes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: a.slug, nom: 'Awa', pids: [pidN(1)] }),
    });
    const token = safeJson(await cree.text())['token'] as string;
    const q = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: b.slug, pid: pidN(1), paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: SB.accountId, requestKey: freshKey() }),
    });
    const quoteId = safeJson(await q.text())['quoteId'] as string;
    await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: 'cmd-reserve-0006', holderRef: 'holder-0006' }),
    });
    const order = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, holderRef: 'holder-0006', commandId: 'cmd-order-0006', listeRef: token, contact: { phone: '70 11 22 44', quartier: 'Gounghin', repere: 'près du marché' } }),
    });
    expect(order.status).toBe(422);
    expect(safeJson(await order.text())).toEqual({ error: 'liste_hors_boutique' });
    const lu = await lire(`/listes/${token}`);
    expect((lu.body['liste'] as { articles: { offert: boolean }[] }).articles[0]!.offert).toBe(false);
  }, 120_000);
});

describe('VITRINE-VRAIE-1 — a delivery validated BEFORE the count existed is counted when she reads her sales', () => {
  it('the book as the previous Worker left it (no marks): her page says 0; her sales read marks it; her page says 1', async () => {
    const S = await seance(mf, 'vv7');
    const b = await boutique(S, '0007', 1);
    await vendreEtLivrer(S, b.slug, pidN(1), '0007');
    expect((await lire(`/s/${b.slug}`)).body['ventesLivrees']).toBe(1);
    // The previous Worker wrote no marks: erase them, through a stand-in of
    // the same class over the same store (miniflare has no storage accessor).
    await mf.dispose();
    const avant = new Miniflare({
      modules: true,
      script: `
        export class ResellerFeedDO {
          constructor(state) { this.state = state; }
          async fetch() {
            const cles = [...(await this.state.storage.list({ prefix: 'livree' })).keys()];
            if (cles.length > 0) await this.state.storage.delete(cles);
            return Response.json({ effaces: cles.length });
          }
        }
        export default { async fetch(request, env) { return env.RESELLER.get(env.RESELLER.idFromName('reseller-feed')).fetch(request); } };`,
      durableObjects: { RESELLER: 'ResellerFeedDO' },
      durableObjectsPersist: persist,
    });
    const effaces = (await (await avant.dispatchFetch('http://x/')).json()) as { effaces: number };
    await avant.dispose();
    expect(effaces.effaces, 'the marks the previous Worker never wrote are gone').toBeGreaterThan(0);
    mf = nouveauMiniflare();
    expect((await lire(`/s/${b.slug}`)).body['ventesLivrees']).toBe(0);
    const ventes = await mf.dispatchFetch('http://c/reseller/ventes', { headers: S.bearer });
    expect(ventes.status).toBe(200);
    expect((await lire(`/s/${b.slug}`)).body['ventesLivrees'], 'counted from her own sales read').toBe(1);
  }, 120_000);
});
