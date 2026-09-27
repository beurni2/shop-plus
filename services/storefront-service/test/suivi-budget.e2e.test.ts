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


/** A SECOND confirmed sale on an account the helper above already made. */
async function uneVenteDePlus(accountId: string, n: string, k: number): Promise<void> {
  const q = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: `suivi-${n}`, pid: 'pv-suivi-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: accountId, requestKey: `rk-suivi-${n}-bis${k}-${'x'.repeat(10)}` }),
  });
  const qText = await q.text();
  const quoteId = (safeJson(qText) as { quoteId?: string }).quoteId;
  if (q.status !== 200 || quoteId === undefined) throw new Error(`setup: quote ${q.status} ${qText}`);
  await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: `cmd-res-${n}-${k}`, holderRef: `h-${n}-${k}` }),
  });
  const o = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId, holderRef: `h-${n}-${k}`, commandId: `cmd-ord-${n}-${k}` }),
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
  const hook = await mf.dispatchFetch('http://c/checkout/webhook/payment', { method: 'POST', headers: signed, body: JSON.stringify(provider.webhookDeliveryPlan()[0]!.event) });
  if (hook.status !== 200) throw new Error(`setup: webhook ${hook.status} ${await hook.text()}`);
}

/**
 * SUIVI-PAGES-1 (AUDIT-B+2 F-72) — THE BOARD IN PAGES.
 *
 * Before: past 50 accounts the oldest — the ones with sales — fell off the
 * board with no flag (the roster read newest first, pending sign-ups
 * included, and the public sign-up is limited per address only), and the one
 * read budget ran out around 38 lifetime sales, so rows were ranked on counts
 * nobody finished reading.
 *
 * Now a console that asks with `?paged=1` gets ONE page per request, inside
 * the same budget, and a `next` cursor that can resume in the MIDDLE of an
 * account's sales. Active accounts come first, so the budget goes to the
 * accounts that sell. With no `paged` the answer is the old one, for a
 * console page still cached on his phone. Budget 3 here: each page reads ONE
 * order.
 */
describe('SUIVI-PAGES-1 (F-72) — the board a page at a time, active accounts first', () => {
  async function pages(): Promise<{ lignes: { accountId: string; state: string; ventes: number; netFcfa: number; incomplet: boolean; suite?: boolean }[]; total: number[]; appels: number }> {
    const lignes: { accountId: string; state: string; ventes: number; netFcfa: number; incomplet: boolean; suite?: boolean }[] = [];
    const total: number[] = [];
    let cursor: string | undefined;
    for (let appels = 1; appels <= 20; appels += 1) {
      const res = await mf.dispatchFetch(`http://c/reseller/suivi?paged=1${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`, { headers: cleC });
      expect(res.status).toBe(200);
      const body = safeJson(await res.text()) as { lignes: typeof lignes; total: number; next?: string };
      lignes.push(...body.lignes);
      total.push(body.total);
      if (body.next === undefined) return { lignes, total, appels };
      cursor = body.next;
    }
    throw new Error('the pages never ended');
  }

  it('every account is reached and every sale read, one order per page — a page stops IN THE MIDDLE of one account and the next resumes there — the active accounts before the waiting one', async () => {
    // the first account admitted above gets a second sale: with one order
    // per page, her two sales can only be read across two pages
    const avant = safeJson(await (await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC })).text()) as { accounts: { accountId: string; name: string; createdAt: string }[] };
    const premiere = [...avant.accounts].sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1))[0]!;
    await uneVenteDePlus(premiere.accountId, '0001', 1);

    // a third reseller who signed up and was never admitted: she must not
    // spend the budget before the accounts that sell
    const attente = await mf.dispatchFetch('http://c/reseller/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Mariam en attente', email: 'attente@example.bf', phone: '+226 70 99 99 00', password: 'grain-de-nere-77' }),
    });
    expect(attente.status).toBe(200);
    const enAttente = (safeJson(await attente.text()) as { accountId: string }).accountId;

    const { lignes, total } = await pages();
    const ordre = [...new Set(lignes.map((l) => l.accountId))];
    expect(ordre.at(-1), 'the waiting account comes last').toBe(enAttente);
    expect(total.every((t) => t === ordre.length), 'every page says how many accounts there are').toBe(true);
    // summed per account, the pages give every sale, complete
    const somme = new Map<string, { ventes: number; netFcfa: number; incomplet: boolean }>();
    for (const l of lignes) {
      const s = somme.get(l.accountId) ?? { ventes: 0, netFcfa: 0, incomplet: false };
      somme.set(l.accountId, { ventes: s.ventes + l.ventes, netFcfa: s.netFcfa + l.netFcfa, incomplet: s.incomplet || l.incomplet });
    }
    const vendeuses = [...somme.entries()].filter(([id]) => id !== enAttente);
    expect(vendeuses).toHaveLength(2);
    expect(somme.get(premiere.accountId), 'her two sales, joined across the pages').toEqual({ ventes: 2, netFcfa: 5_000, incomplet: false });
    for (const [id, s] of vendeuses) if (id !== premiere.accountId) expect(s).toEqual({ ventes: 1, netFcfa: 2_500, incomplet: false });
    // her first page said « more of her on the next page »
    expect(lignes.find((l) => l.accountId === premiere.accountId)?.suite).toBe(true);
    expect(somme.get(enAttente)).toEqual({ ventes: 0, netFcfa: 0, incomplet: false });
  });

  it('a sale that lands BETWEEN two pages is read once, never twice: the cursor names the last sale read, not a position', async () => {
    const liste = safeJson(await (await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC })).text()) as { accounts: { accountId: string; createdAt: string; state: string }[] };
    const premiere = [...liste.accounts].filter((x) => x.state === 'active').sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1))[0]!;
    const somme = { ventes: 0, incomplet: false };
    let cursor: string | undefined;
    for (let page = 1; page <= 20; page += 1) {
      const res = await mf.dispatchFetch(`http://c/reseller/suivi?paged=1${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`, { headers: cleC });
      const body = safeJson(await res.text()) as { lignes: { accountId: string; ventes: number; incomplet: boolean }[]; next?: string };
      for (const l of body.lignes.filter((x) => x.accountId === premiere.accountId)) {
        somme.ventes += l.ventes;
        somme.incomplet ||= l.incomplet;
      }
      if (page === 1) {
        // her first sale is read; now a NEW row lands for her. It names an
        // order the book cannot read, so the board shows whether it was reached.
        const ns = await mf.getDurableObjectNamespace('RESELLER');
        const r = await ns.get(ns.idFromName('reseller-feed')).fetch('https://do/register', {
          method: 'POST', body: JSON.stringify({ resellerId: premiere.accountId, orderId: 'ord-arrivee-entre-deux-pages' }),
        });
        expect(r.status).toBe(200);
      }
      if (body.next === undefined) break;
      cursor = body.next;
    }
    expect(somme.ventes, 'her two real sales, each read once — a position cursor read one of them twice').toBe(2);
    expect(somme.incomplet, 'the row that arrived mid-read WAS reached (unreadable here by construction)').toBe(true);
  });

  it('past 50 accounts (the feed answers 50 per read) the pages carry on to the 51st and beyond — nobody falls off the board', async () => {
    // fifty more sign-ups, written straight into the accounts book: the public
    // door limits sign-ups per address, and every Miniflare call comes from one
    const ns = await mf.getDurableObjectNamespace('COMPTES');
    const book = ns.get(ns.idFromName('reseller-accounts'));
    for (let i = 0; i < 50; i += 1) {
      const r = await book.fetch('https://do/signup', {
        method: 'POST',
        body: JSON.stringify({ name: `Inscrite ${i}`, email: `inscrite${i}@example.bf`, phone: `+226 71 ${String(i).padStart(2, '0')} 00 00`, password: 'grain-de-nere-77' }),
      });
      expect(r.status, await r.clone().text()).toBe(200);
    }
    const { lignes, total, appels } = await pages();
    const vus = new Set(lignes.map((l) => l.accountId));
    expect(total.at(-1)).toBeGreaterThan(50);
    expect(vus.size, 'every account on the roster reached the board').toBe(total.at(-1));
    expect(appels, 'the 51st account needed a page of its own').toBeGreaterThan(1);
  }, 60_000);

  it('with no `paged` the board is the old answer: one read, no next, no total', async () => {
    const res = await mf.dispatchFetch('http://c/reseller/suivi', { headers: cleC });
    const body = safeJson(await res.text()) as { lignes: unknown[]; next?: unknown; total?: unknown };
    expect(body.next).toBeUndefined();
    expect(body.total).toBeUndefined();
    expect(Array.isArray(body.lignes)).toBe(true);
  });

  it('a cursor naming an account that is not on the roster answers 409 curseur_perdu — the console starts again', async () => {
    const res = await mf.dispatchFetch('http://c/reseller/suivi?paged=1&cursor=rs-personne~', { headers: cleC });
    expect(res.status).toBe(409);
    expect(safeJson(await res.text())).toMatchObject({ ok: false, reason: 'curseur_perdu' });
  });

  it('a cursor naming a sale that is no longer in her list answers 409 too — never a guess from her first sale', async () => {
    const liste = safeJson(await (await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC })).text()) as { accounts: { accountId: string; state: string }[] };
    const active = liste.accounts.find((x) => x.state === 'active')!;
    const res = await mf.dispatchFetch(`http://c/reseller/suivi?paged=1&cursor=${encodeURIComponent(`${active.accountId}~ord-qui-nexiste-plus`)}`, { headers: cleC });
    expect(res.status).toBe(409);
    expect(safeJson(await res.text())).toMatchObject({ ok: false, reason: 'curseur_perdu' });
  });

  it('a paused reseller stays on the founder’s board, her line marked `paused` — the pause is shown, never a disappearance (REPONSES-ENREGISTREES-1: the Boutik+ console copies this line)', async () => {
    const liste = safeJson(await (await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC })).text()) as { accounts: { accountId: string; state: string }[] };
    const active = liste.accounts.find((x) => x.state === 'active')!;
    const pause = await mf.dispatchFetch('http://c/reseller/accounts/pause', {
      method: 'POST', headers: { ...cleC, 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: active.accountId }),
    });
    expect(pause.status, await pause.clone().text()).toBe(200);
    const { lignes } = await pages();
    const siennes = lignes.filter((l) => l.accountId === active.accountId);
    expect(siennes.length, 'still on the board').toBeGreaterThan(0);
    expect(siennes.every((l) => l.state === 'paused')).toBe(true);
  });
});
