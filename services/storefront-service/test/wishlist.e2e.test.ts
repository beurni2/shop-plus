import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ LISTE-ENVIES-1 — the wishlist, end to end on the REAL combined Worker ═══
 *
 * The seam this file exists to cross (the standing seam-test law): a liste is
 * CREATED through the public door, a buyer ORDERS one of its articles with
 * `listeRef` on the create body, the PROVIDER WEBHOOK confirms the payment —
 * and the liste's own public read then says « offert ». Webhook truth to the
 * shared screen, through the OrderDO's seventh outbox wire and the WishlistDO,
 * with nothing politely constructed: the same bundle the deploy ships.
 *
 * The refusal ladder rides along: unknown boutique, pid outside her curation,
 * unknown fields by name, malformed tokens as uniform 404s, and the wrong
 * edit key indistinguishable from an absent liste.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'liste-envies-'));
const T0 = '2026-08-25T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-le001';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-le001';
const authed = { 'X-Write-Key': WRITE_SECRET };

const SUPPLY = [
  {
    productVersionId: 'pv-le-1',
    offerVersion: 'ov-le-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
  {
    productVersionId: 'pv-le-2',
    offerVersion: 'ov-le-2',
    basePrice: 6_000,
    resellerCommission: 600,
    available: 5,
    productName: 'Écharpe tissée',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

let mf: Miniflare;

beforeAll(() => {
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
      DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', WISHLIST: 'WishlistDO',
    },
    durableObjectsPersist: persist,
    bindings: {
      STOREFRONT_WRITE_SECRET: WRITE_SECRET,
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        // Boutik's intakes answer ok so the sibling wires drain quietly — they
        // are not under test here (their own e2e files own them).
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
});

afterAll(async () => {
  await mf?.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function safeJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

let keySeq = 0;
const freshKey = (): string => `rk-le-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

/** One boutique with BOTH supply articles published — the liste's ground. */
async function boutique(n: string): Promise<{ slug: string; resellerId: string }> {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-le-${n}`, resellerId: `rs-le-${n}`,
      shortCode: `LE-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-le-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  for (const [i, pv] of (['pv-le-1', 'pv-le-2'] as const).entries()) {
    const pub = await mf.dispatchFetch('http://c/listings', {
      method: 'POST', headers: authed,
      body: JSON.stringify({
        commandId: `cmd-listing-${n}-${i}`, listingId: `lst-le-${n}-${i}`, storefrontId: `sf-le-${n}`,
        resellerId: `rs-le-${n}`, productVersionId: pv, offerVersion: `ov-le-${i + 1}`,
        markup: 1_500, correlationId: `corr-le-${n}`, at: T0,
      }),
    });
    if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  }
  return { slug: `le-${n}`, resellerId: `rs-le-${n}` };
}

async function creerListe(slug: string, nom = 'Awa', pids: string[] = ['pv-le-1', 'pv-le-2']) {
  const res = await mf.dispatchFetch('http://c/listes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, nom, pids }),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: safeJson(text), text };
}

async function lireListe(token: string) {
  const res = await mf.dispatchFetch(`http://c/listes/${encodeURIComponent(token)}`);
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: safeJson(text), text };
}

/** The buyer's whole road to a CREATED order, optionally naming a liste. */
async function ordered(n: string, slug: string, resellerId: string, pid: string, listeRef?: string) {
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug, pid, paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId, requestKey: freshKey(),
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string; amountPaidAtCheckout?: number };
  if (typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status}`);
  if (typeof quote.amountPaidAtCheckout !== 'number') throw new Error('setup: quote carries no amount');
  const held = await mf.dispatchFetch(
    `http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }) },
  );
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const res = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`,
      ...(listeRef !== undefined ? { listeRef } : {}),
    }),
  });
  const json = safeJson(await res.text());
  // The webhook must name the checkout leg's amount TO THE FRANC — read off
  // the quote's own view, never invented.
  return { status: res.status, json, orderId: `ord-${quote.quoteId}`, buyerTotal: quote.amountPaidAtCheckout };
}

/** …and to a PAID one, through the provider webhook (NB-3: the event names
 *  the LEG KEY the order actually holds — read off its record). */
async function confirmOrder(orderId: string, amount: number): Promise<void> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const audit = (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
    legKeys?: Record<string, string>;
  };
  const legKey = audit.legKeys?.['checkout'];
  if (legKey === undefined) throw new Error(`no checkout leg key on ${orderId}`);
  const paid = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET },
    body: JSON.stringify({
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: {
        command_id: `whk-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 1,
        actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1',
      },
      payload: {
        provider: 'sandbox-provider', payment_attempt_id: legKey,
        collectRef: `collect-${orderId}`, amount, fee: 0, status: 'held',
        order_id: orderId, redelivery: false,
      },
    }),
  });
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${await paid.text()}`);
}

async function offertVisible(token: string, pid: string, timeoutMs = 8_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const lu = await lireListe(token);
    const articles = (lu.json['liste'] as { articles?: { pid: string; offert: boolean }[] } | undefined)?.articles ?? [];
    if (articles.find((a) => a.pid === pid)?.offert === true) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('the liste doors', () => {
  it('creates a liste on a real boutique and answers token + editCle + projection, never-cache, CORS on', async () => {
    const { slug } = await boutique('0001');
    const res = await creerListe(slug);
    expect(res.status).toBe(200);
    expect(res.json['ok']).toBe(true);
    expect(res.json['token']).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(res.json['editCle']).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(res.json['liste']).toEqual({
      nom: 'Awa', slug,
      articles: [{ pid: 'pv-le-1', offert: false }, { pid: 'pv-le-2', offert: false }],
    });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://beurni2.github.io');

    // …and the friend's read is the projection ALONE: no editCle, no hash, no
    // order id, no supplier economics (SP-I03 applied to the new surface).
    const lu = await lireListe(res.json['token'] as string);
    expect(lu.status).toBe(200);
    expect(lu.json['liste']).toEqual(res.json['liste']);
    expect(lu.text).not.toMatch(/editCle|supplier|commission|basePrice|sellerNet/i);
  });

  it('OPTIONS preflight answers 204 with POST + Content-Type granted', async () => {
    const res = await mf.dispatchFetch('http://c/listes', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('refuses an unknown boutique, a pid outside her curation, and an unknown field by name', async () => {
    const { slug } = await boutique('0002');
    const inconnue = await creerListe('boutique-inconnue');
    expect(inconnue.status).toBe(404);
    expect(inconnue.json['reason']).toBe('boutique_inconnue');

    const horsBoutique = await creerListe(slug, 'Awa', ['pv-le-1', 'pv-ailleurs']);
    expect(horsBoutique.status).toBe(422);
    expect(horsBoutique.json['reason']).toBe('produit_hors_boutique');
    expect(horsBoutique.json['field']).toBe('pv-ailleurs');

    const res = await mf.dispatchFetch('http://c/listes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, nom: 'Awa', pids: ['pv-le-1'], amount: 5_000 }),
    });
    expect(res.status).toBe(400);
    expect(safeJson(await res.text())).toEqual({ ok: false, reason: 'unknown_field', field: 'amount' });
  });

  it('a malformed and an unknown token are the same uniform 404', async () => {
    const malforme = await lireListe('pas-un-jeton');
    expect(malforme.status).toBe(404);
    const inconnu = await lireListe('A'.repeat(32));
    expect(inconnu.status).toBe(404);
    expect(malforme.json['reason']).toBe(inconnu.json['reason']);
  });

  it('update edits with the edit key, keeps offert unrepresentable from outside, and refuses a wrong key as the same 404', async () => {
    const { slug } = await boutique('0003');
    const made = await creerListe(slug, 'Awa', ['pv-le-1']);
    const token = made.json['token'] as string;
    const editCle = made.json['editCle'] as string;

    const edited = await mf.dispatchFetch(`http://c/listes/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCle, nom: 'Rasmata', pids: ['pv-le-2', 'pv-le-1'] }),
    });
    expect(edited.status).toBe(200);
    expect(safeJson(await edited.text())['liste']).toEqual({
      nom: 'Rasmata', slug,
      articles: [{ pid: 'pv-le-2', offert: false }, { pid: 'pv-le-1', offert: false }],
    });

    // a smuggled offert field is refused BY NAME — the update body's allowlist
    const truque = await mf.dispatchFetch(`http://c/listes/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCle, pids: ['pv-le-1'], offert: true }),
    });
    expect(truque.status).toBe(400);
    expect(safeJson(await truque.text())['field']).toBe('offert');

    // the wrong key and an absent liste answer IDENTICALLY (no oracle)
    const mauvaise = await mf.dispatchFetch(`http://c/listes/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCle: 'B'.repeat(32), pids: ['pv-le-1'] }),
    });
    const absente = await mf.dispatchFetch(`http://c/listes/${'C'.repeat(32)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCle, pids: ['pv-le-1'] }),
    });
    expect(mauvaise.status).toBe(404);
    expect(absente.status).toBe(404);
    expect(await mauvaise.text()).toBe(await absente.text());
  });
});

describe('THE SEAM — webhook truth becomes « offert » on the shared liste', () => {
  it('order with listeRef → provider webhook → the liste says offert (and only for that pid)', async () => {
    const { slug, resellerId } = await boutique('0010');
    const made = await creerListe(slug);
    const token = made.json['token'] as string;

    const o = await ordered('0010', slug, resellerId, 'pv-le-1', token);
    expect(o.status).toBe(200);
    await confirmOrder(o.orderId, o.buyerTotal);

    // the alarm-driven seventh wire delivers; the PUBLIC read is the ledger
    expect(await offertVisible(token, 'pv-le-1')).toBe(true);
    const lu = await lireListe(token);
    const articles = (lu.json['liste'] as { articles: { pid: string; offert: boolean }[] }).articles;
    expect(articles).toEqual([
      { pid: 'pv-le-1', offert: true },
      { pid: 'pv-le-2', offert: false },
    ]);
    // no orderId crosses to the public read even now that one exists
    expect(lu.text).not.toContain(o.orderId);

    // …and the wire's fate is visible on the order's own outbox read
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const outbox = (await (await ns.get(ns.idFromName(o.orderId)).fetch('https://do/entry/outbox')).json()) as {
      listeOffert?: { status?: string };
    };
    expect(outbox.listeOffert?.status).toBe('delivered');
  });

  it('an order WITHOUT listeRef enqueues no offert wire at all', async () => {
    const { slug, resellerId } = await boutique('0011');
    const o = await ordered('0011', slug, resellerId, 'pv-le-1');
    expect(o.status).toBe(200);
    await confirmOrder(o.orderId, o.buyerTotal);
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const outbox = (await (await ns.get(ns.idFromName(o.orderId)).fetch('https://do/entry/outbox')).json()) as {
      listeOffert?: unknown;
      outbox?: { status?: string };
    };
    expect(outbox.outbox?.status).toBeDefined();
    expect(outbox.listeOffert).toBeUndefined();
  });

  it('a listeRef naming a liste that does not exist completes the wire harmlessly', async () => {
    const { slug, resellerId } = await boutique('0012');
    const fantome = 'F'.repeat(32);
    const o = await ordered('0012', slug, resellerId, 'pv-le-1', fantome);
    expect(o.status).toBe(200);
    await confirmOrder(o.orderId, o.buyerTotal);
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const deadline = Date.now() + 8_000;
    let fate: string | undefined;
    for (;;) {
      const outbox = (await (await ns.get(ns.idFromName(o.orderId)).fetch('https://do/entry/outbox')).json()) as {
        listeOffert?: { status?: string };
      };
      fate = outbox.listeOffert?.status;
      if (fate === 'delivered' || Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(fate).toBe('delivered');
    expect((await lireListe(fantome)).status).toBe(404);
  });

  it('a malformed listeRef on the order body is refused by name before any object is touched', async () => {
    const { slug, resellerId } = await boutique('0013');
    const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
    const res = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId, holderRef: 'holder-013', commandId: 'cmd-order-013',
        listeRef: 'espace interdit',
      }),
    });
    expect(res.status).toBe(400);
    expect(safeJson(await res.text())).toEqual({ error: 'bad_field', field: 'listeRef' });
  });
});
