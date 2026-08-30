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
const OPS_SECRET = 'test-checkout-ops-secret-le001';
const PROGRESS_SECRET = 'test-progress-write-secret-lc001';
const MEDIA_KEY = 'test-media-write-key-lv001';
const authed = { 'X-Write-Key': WRITE_SECRET };

/** LISTE-VOIX — what the certified media door saw, for the seam's asserts. */
const mediaCalls: { key: string | null; bytes: Uint8Array }[] = [];
const mintedRefs: string[] = [];

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
      // LISTE-ADRESSE — the founder's dispatch board is THE LEDGER this
      // seam asks: the attached contact is asserted where it is actually
      // read, never off the create response.
      CHECKOUT_OPS_SECRET: OPS_SECRET,
      // LISTE-CADEAUX — Séra's transit door: the cadeaux seam drives a REAL
      // arrival fact so the code's reveal gate is exercised by execution.
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      // LISTE-VOIX — the media door's write credential, held by the Worker
      // alone; the seam asserts it rides every upload.
      MEDIA_WRITE_KEY: MEDIA_KEY,
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
      // LISTE-VOIX — the CERTIFIED media door (the repere-audio harness's own
      // stub, verbatim): each clause is the real route's bound — gate first,
      // magic-byte sniff, opaque `media/{uuid}` ref on 201.
      MEDIA: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (request.method !== 'POST' || path !== '/media/audio') {
          return Response.json({ service: 'media-service', status: 'not_found' }, { status: 404 });
        }
        const key = request.headers.get('X-Write-Key');
        const bytes = new Uint8Array(await request.arrayBuffer());
        mediaCalls.push({ key, bytes });
        if (key !== MEDIA_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
        const isWebm = bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
        if (!isWebm) return Response.json({ error: 'rejected', reason: 'unsupported_type' }, { status: 400 });
        const ref = `media/${crypto.randomUUID()}`;
        mintedRefs.push(ref);
        return Response.json({ ref, contentType: 'audio/webm', durationSeconds: null, byteLength: bytes.length }, { status: 201 });
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

async function creerListe(
  slug: string,
  nom = 'Awa',
  pids: string[] = ['pv-le-1', 'pv-le-2'],
  telephone?: string,
  livraison?: { telephone: string; quartier: string; repere: string; zone: string; audioB64?: string; audioRef?: string; pin?: unknown },
) {
  const res = await mf.dispatchFetch('http://c/listes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug, nom, pids,
      ...(telephone !== undefined ? { telephone } : {}),
      ...(livraison !== undefined ? { livraison } : {}),
    }),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: safeJson(text), text };
}

async function lireMerci(orderId: string, jeton: string | null) {
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}/liste-merci`, {
    method: 'GET',
    headers: jeton !== null ? { Authorization: `Bearer ${jeton}` } : {},
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

/** LISTE-CADEAUX — the creator's two edit-key doors. */
async function lireCadeaux(token: string, editCle: string | null) {
  const res = await mf.dispatchFetch(`http://c/listes/${encodeURIComponent(token)}/cadeaux`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editCle !== null ? { editCle } : {}),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

async function fermerListe(token: string, editCle: string | null) {
  const res = await mf.dispatchFetch(`http://c/listes/${encodeURIComponent(token)}/fermer`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editCle !== null ? { editCle } : {}),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

/** Séra's transit door — the arrival fact the code's reveal gate reads. */
async function transit(body: unknown) {
  const res = await mf.dispatchFetch('http://c/fulfillment/transit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    body: JSON.stringify(body),
  });
  return { status: res.status };
}

/** The purchaser's own remise door — the LEDGER the cadeaux code is compared
 *  against: two doors, one stored code, byte-for-byte. */
async function remiseRead(orderId: string, jeton: string) {
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}/remise`, {
    method: 'GET', headers: { Authorization: `Bearer ${jeton}` },
  });
  const text = await res.text();
  return { status: res.status, json: safeJson(text) };
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
      livraison: false,
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
      livraison: false,
    });

    // a smuggled offert field is refused BY NAME — the update body's allowlist
    const truque = await mf.dispatchFetch(`http://c/listes/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCle, pids: ['pv-le-1'], offert: true }),
    });
    expect(truque.status).toBe(400);
    expect(safeJson(await truque.text())['field']).toBe('offert');

    // VERIFIER MINOR 1 — the membership law holds for the liste's WHOLE life:
    // an update naming a pid the boutique does not sell is refused exactly as
    // the create refuses it, even with the creator's own edit key.
    const horsBoutique = await mf.dispatchFetch(`http://c/listes/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCle, pids: ['pv-le-1', 'pv-ailleurs'] }),
    });
    expect(horsBoutique.status).toBe(422);
    expect(safeJson(await horsBoutique.text())).toEqual({ ok: false, reason: 'produit_hors_boutique', field: 'pv-ailleurs' });

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

  /**
   * LISTE-RETRAIT-1 (founder order, 2026-08-26) — removal IS the update door:
   * the pids she keeps replace the selection, and a mark already earned by a
   * provider-confirmed order SURVIVES on every survivor (an edit rearranges
   * wishes, it never un-gives a gift). The last-item law is the door's own:
   * an empty selection is refused BY NAME — a liste with nothing on it is
   * made by « refaire », never by erasing this one.
   */
  it('removing an article keeps the surviving offert mark, and an empty selection is refused by name', async () => {
    const { slug, resellerId } = await boutique('0031');
    const made = await creerListe(slug);
    const token = made.json['token'] as string;
    const editCle = made.json['editCle'] as string;

    // the gift lands on pv-le-1 through the REAL road: order → provider webhook
    const o = await ordered('0031', slug, resellerId, 'pv-le-1', token);
    expect(o.status).toBe(200);
    await confirmOrder(o.orderId, o.buyerTotal);
    expect(await offertVisible(token, 'pv-le-1')).toBe(true);

    // she removes pv-le-2 — the mark on pv-le-1 must ride through untouched
    const retire = await mf.dispatchFetch(`http://c/listes/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCle, pids: ['pv-le-1'] }),
    });
    expect(retire.status).toBe(200);
    expect(safeJson(await retire.text())['liste']).toEqual({
      nom: 'Awa', slug,
      articles: [{ pid: 'pv-le-1', offert: true }],
      livraison: false,
    });

    // the friend's read agrees: one article, still offert, pv-le-2 gone
    const relu = await lireListe(token);
    expect((relu.json['liste'] as { articles: unknown }).articles).toEqual([{ pid: 'pv-le-1', offert: true }]);

    // the last-item law, at the door
    const vide = await mf.dispatchFetch(`http://c/listes/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCle, pids: [] }),
    });
    expect(vide.status).toBe(400);
    expect(safeJson(await vide.text())).toEqual({ ok: false, reason: 'bad_field', field: 'pids' });
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

describe('LISTE-MERCI — the opt-in, the buyer-token-gated merci read, the full-prepay lock', () => {
  it('a create with a telephone stores the opt-in OFF the public read, and a junk number is refused by name', async () => {
    const { slug } = await boutique('0020');
    const made = await creerListe(slug, 'Awa', ['pv-le-1'], '70 12 34 56');
    expect(made.status).toBe(200);
    // the create answer and the public read both carry NO phone bytes — the
    // shared link is passed hand to hand, and a phone on it is harvestable
    expect(made.text).not.toMatch(/telephone|70 12 34 56|22670123456/);
    const lu = await lireListe(made.json['token'] as string);
    expect(lu.text).not.toMatch(/telephone|70 12 34 56|22670123456/);

    const junk = await creerListe(slug, 'Awa', ['pv-le-1'], 'pas-un-numero');
    expect(junk.status).toBe(400);
    expect(junk.json['field']).toBe('telephone');
    // …and a number whatsappDigits cannot vouch for (7 digits) is refused too
    const court = await creerListe(slug, 'Awa', ['pv-le-1'], '7012345');
    expect(court.status).toBe(400);
    expect(court.json['field']).toBe('telephone');
  });

  it('THE MERCI SEAM: only the confirmed order’s own bearer reads the creator’s nom + wa digits', async () => {
    const { slug, resellerId } = await boutique('0021');
    const made = await creerListe(slug, 'Awa', ['pv-le-1', 'pv-le-2'], '70 12 34 56');
    const token = made.json['token'] as string;

    const o = await ordered('0021', slug, resellerId, 'pv-le-1', token);
    expect(o.status).toBe(200);
    const buyerRef = o.json['buyerRef'] as string;
    expect(typeof buyerRef).toBe('string');

    // BEFORE the webhook: the payment is not confirmed, so the road is shut —
    // even to the true bearer.
    const avant = await lireMerci(o.orderId, buyerRef);
    expect(avant.status).toBe(404);

    await confirmOrder(o.orderId, o.buyerTotal);

    // AFTER: the true bearer reads the facts — nom, the NORMALISED wa digits
    // (226 joined to the 8-digit number), and the gifted pid. Never-cache.
    const apres = await lireMerci(o.orderId, buyerRef);
    expect(apres.status).toBe(200);
    expect(apres.json).toEqual({ ok: true, nom: 'Awa', telephone: '22670123456', pid: 'pv-le-1' });
    expect(apres.headers.get('Cache-Control')).toBe('private, no-store');

    // a WRONG bearer answers the SAME uniform 404 as the unconfirmed read —
    // byte-identical, no oracle
    const faux = await lireMerci(o.orderId, 'X'.repeat(32));
    expect(faux.status).toBe(404);
    expect(faux.text).toBe(avant.text);
    // …and no bearer at all likewise
    expect((await lireMerci(o.orderId, null)).status).toBe(404);
  });

  it('no liste on the order, or no opt-in on the liste ⇒ the same shut door after confirmation', async () => {
    const { slug, resellerId } = await boutique('0022');
    // an ordinary order (no listeRef): confirmed, but the merci road stays 404
    const sans = await ordered('0022', slug, resellerId, 'pv-le-1');
    await confirmOrder(sans.orderId, sans.buyerTotal);
    expect((await lireMerci(sans.orderId, sans.json['buyerRef'] as string)).status).toBe(404);
  });

  it('a liste WITHOUT the opt-in answers the same 404 even to the confirmed purchaser', async () => {
    const { slug, resellerId } = await boutique('0023');
    const made = await creerListe(slug, 'Awa', ['pv-le-1']); // no telephone
    const o = await ordered('0023', slug, resellerId, 'pv-le-1', made.json['token'] as string);
    await confirmOrder(o.orderId, o.buyerTotal);
    expect((await lireMerci(o.orderId, o.json['buyerRef'] as string)).status).toBe(404);
  });

  it('FULL-PREPAY LOCK: a door-mode order naming a liste is refused by name, before any contact question', async () => {
    const { slug, resellerId } = await boutique('0024');
    const made = await creerListe(slug, 'Awa', ['pv-le-1']);
    const token = made.json['token'] as string;
    // the door quote ISSUES (verified tier + admitted category — the
    // porte-custody recipe), so the refusal below is the order door's alone
    const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
        zoneTo: 'Ouagadougou', attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
    expect(typeof quote.quoteId, 'setup: the door quote must issue for this test to bite').toBe('string');
    const held = await mf.dispatchFetch(
      `http://c/checkout/quote/${encodeURIComponent(quote.quoteId as string)}/reserve`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: 'cmd-reserve-0024', holderRef: 'holder-0024' }) },
    );
    expect(held.status).toBe(200);
    // NO contact on purpose: the liste refusal must speak FIRST — a gift is
    // never COD-shaped, whoever fills whatever afterwards.
    const res = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId, holderRef: 'holder-0024', commandId: 'cmd-order-0024', listeRef: token,
      }),
    });
    expect(res.status).toBe(422);
    expect(safeJson(await res.text())).toEqual({ error: 'liste_prepaiement_requis' });
  });
});

describe('LISTE-ADRESSE — her address attaches in the background, and the friend never sees it', () => {
  const LIVRAISON = {
    telephone: '70123456',
    quartier: 'Dassasgho',
    repere: 'Portail bleu, cour commune',
    zone: 'Dassasgho, Ouagadougou',
  };
  /** Every byte of her address, as a leak probe over any public answer. */
  const OCTETS_PRIVES = /Dassasgho|70123456|Portail bleu/;

  it('THE SEAM: private create → listeRef-priced quote → pay-only order → HER contact on the dispatch board → offert lands — and no public read carries one address byte', async () => {
    const { slug, resellerId } = await boutique('0040');
    const made = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, LIVRAISON);
    expect(made.status).toBe(200);
    // the public projection says WHETHER, never WHAT
    expect((made.json['liste'] as { livraison?: unknown }).livraison).toBe(true);
    expect(made.text).not.toMatch(OCTETS_PRIVES);
    const token = made.json['token'] as string;
    const lu = await lireListe(token);
    expect((lu.json['liste'] as { livraison?: unknown }).livraison).toBe(true);
    expect(lu.text).not.toMatch(OCTETS_PRIVES);

    // THE FRIEND'S QUOTE — names the liste, never a destination; priced for
    // HER stored zone; the answer carries the fee and not one address byte.
    const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'FULL_PREPAY', listeRef: token,
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    expect(quoteRes.status).toBe(200);
    const quoteText = await quoteRes.text();
    expect(quoteText).not.toMatch(OCTETS_PRIVES);
    const quote = safeJson(quoteText) as { quoteId?: string; deliveryFee?: number; amountPaidAtCheckout?: number };
    expect(quote.deliveryFee).toBe(1_000); // the Ouagadougou tariff, reached through her PRIVATE zone
    const held = await mf.dispatchFetch(
      `http://c/checkout/quote/${encodeURIComponent(quote.quoteId as string)}/reserve`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: 'cmd-reserve-0040', holderRef: 'holder-0040' }) },
    );
    expect(held.status).toBe(200);

    // THE PAY-ONLY ORDER — no contact field at all; her address attaches inside.
    const created = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId, holderRef: 'holder-0040', commandId: 'cmd-order-0040', listeRef: token,
      }),
    });
    const createdText = await created.text();
    expect(created.status).toBe(200);
    expect(createdText).not.toMatch(OCTETS_PRIVES);
    const orderId = `ord-${quote.quoteId}`;

    // THE LEDGER — the founder's dispatch board (the ONE reader of contacts)
    // holds HER phone, HER quartier, HER repère on this order.
    const board = await mf.dispatchFetch('http://c/checkout/dispatch', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    expect(board.status).toBe(200);
    const rows = (safeJson(await board.text())['orders'] ?? []) as {
      orderId?: string; contact?: { phone?: string; quartier?: string; repere?: string };
    }[];
    const mine = rows.find((r) => r.orderId === orderId);
    expect(mine, 'the gift order must be on the dispatch board').toBeDefined();
    expect(mine?.contact).toEqual({ phone: '70123456', quartier: 'Dassasgho', repere: 'Portail bleu, cour commune' });

    // the friend's own order read — the public view — has no address byte
    const pub = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
    expect(await pub.text()).not.toMatch(OCTETS_PRIVES);

    // and the roads still compose: webhook truth → « offert » on the liste
    await confirmOrder(orderId, quote.amountPaidAtCheckout as number);
    expect(await offertVisible(token, 'pv-le-1')).toBe(true);
  });

  it('the guard rails: zoneTo beside listeRef refused by name · no stored address answers liste_sans_adresse · a caller contact on the gift road refused · a quote priced elsewhere refused', async () => {
    const { slug, resellerId } = await boutique('0041');
    const avec = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, LIVRAISON);
    const tokenAvec = avec.json['token'] as string;
    const sans = await creerListe(slug, 'Binta', ['pv-le-2']);
    const tokenSans = sans.json['token'] as string;

    // one source of truth for the destination — never two that could disagree
    const deux = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'FULL_PREPAY', listeRef: tokenAvec, zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    expect(deux.status).toBe(400);
    expect(safeJson(await deux.text())).toEqual({ ok: false, reason: 'bad_field', field: 'zoneTo' });

    // a liste that stored no address cannot price a quote
    const sansAdresse = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-2', paymentMode: 'FULL_PREPAY', listeRef: tokenSans,
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    expect(sansAdresse.status).toBe(422);
    expect(safeJson(await sansAdresse.text())).toEqual({ ok: false, reason: 'liste_sans_adresse' });

    // a quote priced for ANOTHER destination can never carry her delivery:
    // ordinary quote (zoneTo 'Ouagadougou' ≠ her stored 'Dassasgho, Ouagadougou')
    const etranger = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    const quoteEtranger = safeJson(await etranger.text()) as { quoteId?: string };
    const heldEtranger = await mf.dispatchFetch(
      `http://c/checkout/quote/${encodeURIComponent(quoteEtranger.quoteId as string)}/reserve`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: 'cmd-reserve-0041a', holderRef: 'holder-0041' }) },
    );
    expect(heldEtranger.status).toBe(200);
    const incoherent = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quoteEtranger.quoteId, holderRef: 'holder-0041', commandId: 'cmd-order-0041a', listeRef: tokenAvec,
      }),
    });
    expect(incoherent.status).toBe(422);
    expect(safeJson(await incoherent.text())).toEqual({ error: 'liste_zone_incoherente' });

    // the fee was priced for HER zone — a second address on the same order is
    // refused by name, not silently arbitrated
    const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'FULL_PREPAY', listeRef: tokenAvec,
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
    const held = await mf.dispatchFetch(
      `http://c/checkout/quote/${encodeURIComponent(quote.quoteId as string)}/reserve`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: 'cmd-reserve-0041b', holderRef: 'holder-0041b' }) },
    );
    expect(held.status).toBe(200);
    const conflit = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId, holderRef: 'holder-0041b', commandId: 'cmd-order-0041b', listeRef: tokenAvec,
        contact: { phone: '76000000', quartier: 'Gounghin', repere: '' },
      }),
    });
    expect(conflit.status).toBe(422);
    expect(safeJson(await conflit.text())).toEqual({ error: 'liste_contact_conflit' });

    // and a malformed livraison at create refuses BY NAME, storing nothing
    const mauvaise = await creerListe(slug, 'Rasmata', ['pv-le-1'], undefined, {
      telephone: '', quartier: 'Dassasgho', repere: '', zone: 'Ouagadougou',
    });
    expect(mauvaise.status).toBe(400);
    expect(mauvaise.json['reason']).toBe('bad_field');
    expect(mauvaise.json['field']).toBe('livraison');
  });
});

describe('LISTE-CADEAUX — her gifts on her own device, the code under the remise gate', () => {
  it('THE SEAM: gift confirmed → cadeaux names it; the code appears ONLY after arrival, byte-equal to the remise door', async () => {
    const { slug, resellerId } = await boutique('0050');
    const made = await creerListe(slug, 'Awa', ['pv-le-1', 'pv-le-2']);
    const token = made.json['token'] as string;
    const editCle = made.json['editCle'] as string;

    // before any gift: the honest empty answer, to HER key alone
    const vide = await lireCadeaux(token, editCle);
    expect(vide.status).toBe(200);
    expect(vide.json).toEqual({ ok: true, nom: 'Awa', cadeaux: [] });

    // wrong key ≡ absent liste: ONE uniform 404, byte-identical
    const mauvaise = await lireCadeaux(token, 'B'.repeat(32));
    const absente = await lireCadeaux('C'.repeat(32), editCle);
    expect(mauvaise.status).toBe(404);
    expect(absente.status).toBe(404);
    expect(mauvaise.text).toBe(absente.text);
    // …and a malformed key is refused by name, never hashed
    expect((await lireCadeaux(token, null)).status).toBe(400);

    // the gift: order names the liste, the provider confirms, the mark lands
    const o = await ordered('0050', slug, resellerId, 'pv-le-1', token);
    expect(o.status).toBe(200);
    await confirmOrder(o.orderId, o.buyerTotal);
    expect(await offertVisible(token, 'pv-le-1')).toBe(true);

    // BEFORE ARRIVAL — the journey shows, the code does NOT (§6.3's gate,
    // proven by execution, not by the guard's presence)
    const avant = await lireCadeaux(token, editCle);
    expect(avant.status).toBe(200);
    const rowsAvant = avant.json['cadeaux'] as { pid: string; suivi?: { state?: string; livree?: boolean }; code?: string }[];
    expect(rowsAvant).toHaveLength(1);
    expect(rowsAvant[0]!.pid).toBe('pv-le-1');
    expect(rowsAvant[0]!.suivi?.state).toBe('confirmed');
    expect(rowsAvant[0]!.suivi?.livree).toBe(false);
    expect(rowsAvant[0]!.code).toBeUndefined();
    expect(avant.text).not.toContain('"code"');
    // …and not one identifying or money byte leaves: no orderId, no amount
    expect(avant.text).not.toContain(o.orderId);
    expect(avant.text).not.toContain(String(o.buyerTotal));

    // Séra departs and arrives — the transit door, the real one
    expect((await transit({ orderId: o.orderId, stage: 'en_route', asOf: '2026-08-27T11:00:00.000Z' })).status).toBe(200);
    expect((await transit({ orderId: o.orderId, stage: 'arrivee', asOf: '2026-08-27T11:45:00.000Z' })).status).toBe(200);

    // AFTER ARRIVAL — the code reveals, and THE LEDGER agrees: the remise
    // door (the purchaser's own, buyer-token-gated) serves the SAME bytes.
    const apres = await lireCadeaux(token, editCle);
    expect(apres.status).toBe(200);
    const rowsApres = apres.json['cadeaux'] as { pid: string; suivi?: { arrivedAt?: string }; code?: string }[];
    expect(rowsApres[0]!.suivi?.arrivedAt).toBe('2026-08-27T11:45:00.000Z');
    expect(rowsApres[0]!.code).toMatch(/^\d{6}$/);
    // the byte probes hold on the REVEALED answer too (verifier OBS 3)
    expect(apres.text).not.toContain(o.orderId);
    expect(apres.text).not.toContain(String(o.buyerTotal));
    const jeton = o.json['buyerRef'] as string;
    const porte = await remiseRead(o.orderId, jeton);
    expect(porte.status).toBe(200);
    expect(rowsApres[0]!.code).toBe(porte.json['code']);
  });
});

describe('LISTE-FERMER — removing everything terminates the liste, totally and fail-closed', () => {
  it('THE SEAM: fermer deletes — the link dies, every door 404s, the gift quote fails closed, and a wrong key changed nothing', async () => {
    const { slug, resellerId } = await boutique('0051');
    const made = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, {
      telephone: '70123456', quartier: 'Dassasgho', repere: 'Portail bleu', zone: 'Dassasgho, Ouagadougou',
    });
    const token = made.json['token'] as string;
    const editCle = made.json['editCle'] as string;

    // a wrong key refuses uniformly AND the liste still answers afterwards
    const truque = await fermerListe(token, 'B'.repeat(32));
    expect(truque.status).toBe(404);
    expect((await lireListe(token)).status).toBe(200);
    // …and a malformed body is refused by name
    expect((await fermerListe(token, null)).status).toBe(400);

    // the confirmed close
    const fermee = await fermerListe(token, editCle);
    expect(fermee.status).toBe(200);
    expect(fermee.json).toEqual({ ok: true });

    // TOTAL: the shared link, the update door and the cadeaux door all 404
    expect((await lireListe(token)).status).toBe(404);
    const update = await mf.dispatchFetch(`http://c/listes/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCle, pids: ['pv-le-1'] }),
    });
    expect(update.status).toBe(404);
    expect((await lireCadeaux(token, editCle)).status).toBe(404);

    // FAIL-CLOSED ON THE MONEY ROAD: a gift quote naming the closed liste
    // meets the same refusal a liste without an address earns
    const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'FULL_PREPAY', listeRef: token,
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    expect(quoteRes.status).toBe(422);
    expect(safeJson(await quoteRes.text())['reason']).toBe('liste_sans_adresse');

    // a REPLAYED close is indistinguishable from a wrong key here — the
    // anti-oracle holds; the CLIENT's public re-read owns the distinction
    expect((await fermerListe(token, editCle)).status).toBe(404);
  });

  it('a gift in flight cannot wedge on a closed liste: the offert wire completes as ignored', async () => {
    const { slug, resellerId } = await boutique('0052');
    const made = await creerListe(slug, 'Awa', ['pv-le-1']);
    const token = made.json['token'] as string;
    const editCle = made.json['editCle'] as string;

    // the order names the liste BEFORE the close; the provider confirms AFTER
    const o = await ordered('0052', slug, resellerId, 'pv-le-1', token);
    expect(o.status).toBe(200);
    expect((await fermerListe(token, editCle)).status).toBe(200);
    await confirmOrder(o.orderId, o.buyerTotal);

    // the wire drains to its COMPLETE outcome — the sale is untouched, the
    // liste stays gone, nothing retries forever
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const deadline = Date.now() + 8_000;
    let status: string | undefined;
    while (Date.now() < deadline) {
      const outbox = (await (await ns.get(ns.idFromName(o.orderId)).fetch('https://do/entry/outbox')).json()) as {
        listeOffert?: { status?: string };
      };
      status = outbox.listeOffert?.status;
      if (status === 'delivered') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(status).toBe('delivered');
    expect((await lireListe(token)).status).toBe(404);
  });
});

describe('LISTE-VOIX — her recorded repère becomes a ref at create and rides the gift order to the dispatch board', () => {
  const webm = (): Uint8Array => {
    const b = new Uint8Array(64);
    b[0] = 0x1a; b[1] = 0x45; b[2] = 0xdf; b[3] = 0xa3;
    for (let i = 4; i < 64; i += 1) b[i] = i;
    return b;
  };
  const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
  const LIV = { telephone: '70123456', quartier: 'Dassasgho', repere: 'Portail bleu', zone: 'Dassasgho, Ouagadougou' };

  it('THE SEAM: audioB64 at liste create → the media door gets THE BYTES under THE KEY → the gift order attaches the minted ref where the board reads it', async () => {
    const { slug, resellerId } = await boutique('0060');
    const note = webm();
    const avantMedia = mediaCalls.length;
    const made = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, { ...LIV, audioB64: b64(note) });
    expect(made.status).toBe(200);
    expect(made.json['noteVocale']).toBe('gardee');

    // the door received the DECODED bytes, under the Worker's own write key
    expect(mediaCalls.length).toBe(avantMedia + 1);
    expect(mediaCalls[avantMedia]!.key).toBe(MEDIA_KEY);
    expect([...mediaCalls[avantMedia]!.bytes]).toEqual([...note]);
    const ref = mintedRefs[mintedRefs.length - 1]!;

    // not one audio byte and not the ref on the create answer or the public read
    expect(made.text).not.toContain(b64(note).slice(0, 24));
    expect(made.text).not.toContain(ref);
    const token = made.json['token'] as string;
    const lu = await lireListe(token);
    expect(lu.text).not.toContain(ref);
    expect(lu.text).not.toContain('audio');

    // the friend's pay-only gift → provider webhook → THE LEDGER: the
    // dispatch board's contact carries her phone, quartier, repère AND ref
    const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'FULL_PREPAY', listeRef: token,
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    expect(quoteRes.status).toBe(200);
    const quote = safeJson(await quoteRes.text()) as { quoteId?: string; amountPaidAtCheckout?: number };
    const held = await mf.dispatchFetch(
      `http://c/checkout/quote/${encodeURIComponent(quote.quoteId as string)}/reserve`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: 'cmd-reserve-0060', holderRef: 'holder-0060' }) },
    );
    expect(held.status).toBe(200);
    const created = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId, holderRef: 'holder-0060', commandId: 'cmd-order-0060', listeRef: token,
      }),
    });
    expect(created.status).toBe(200);
    expect(await created.text()).not.toContain(ref); // the friend never sees her note
    const orderId = `ord-${quote.quoteId}`;

    const board = await mf.dispatchFetch('http://c/checkout/dispatch', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    expect(board.status).toBe(200);
    const rows = (safeJson(await board.text())['orders'] ?? []) as {
      orderId?: string; contact?: { phone?: string; quartier?: string; repere?: string; audioRef?: string };
    }[];
    const mine = rows.find((r) => r.orderId === orderId);
    expect(mine, 'the gift order must be on the dispatch board').toBeDefined();
    expect(mine?.contact).toEqual({ phone: '70123456', quartier: 'Dassasgho', repere: 'Portail bleu', audioRef: ref });

    // the friend's public order view still carries no address and no note
    const pub = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
    expect(await pub.text()).not.toContain(ref);

    await confirmOrder(orderId, quote.amountPaidAtCheckout as number);
    expect(await offertVisible(token, 'pv-le-1')).toBe(true);
  });

  it('a refused media door NEVER blocks her liste: the loss is named, the address stands, and no ref ever attaches', async () => {
    const { slug, resellerId } = await boutique('0061');
    // JPEG magic bytes — the certified door refuses them, as the real one would
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8]);
    const made = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, { ...LIV, audioB64: b64(jpeg) });
    expect(made.status).toBe(200);
    expect(made.json['noteVocale']).toBe('perdue');
    const token = made.json['token'] as string;

    // the gift road works exactly as an address without a note: the attach
    // carries the three typed facts and NOTHING pretending to be a ref
    const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'FULL_PREPAY', listeRef: token,
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
    await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quote.quoteId as string)}/reserve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: 'cmd-reserve-0061', holderRef: 'holder-0061' }),
    });
    const created = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: quote.quoteId, holderRef: 'holder-0061', commandId: 'cmd-order-0061', listeRef: token }),
    });
    expect(created.status).toBe(200);
    const board = await mf.dispatchFetch('http://c/checkout/dispatch', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    const rows = (safeJson(await board.text())['orders'] ?? []) as {
      orderId?: string; contact?: Record<string, unknown>;
    }[];
    const mine = rows.find((r) => r.orderId === `ord-${quote.quoteId}`);
    expect(mine?.contact).toEqual({ phone: '70123456', quartier: 'Dassasgho', repere: 'Portail bleu' });
  });

  it('the wire never names a ref, and a malformed note refuses loudly: caller audioRef 400 · both-at-once 400 · junk base64 400 · oversize 400', async () => {
    const { slug } = await boutique('0062');
    // a caller who could name a ref could attach a stranger's note — refused
    // BY NAME at the one public door, before any validation
    const truque = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, {
      ...LIV, audioRef: 'media/1e6cfa62-59b5-4d70-9d10-4dcae21f0532',
    });
    expect(truque.status).toBe(400);
    expect(truque.json).toEqual({ ok: false, reason: 'bad_field', field: 'livraison' });
    // transport and storage confused — refused (shape law, and no upload runs)
    const avantMedia = mediaCalls.length;
    const deux = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, {
      ...LIV, audioB64: 'QQ==', audioRef: 'media/1e6cfa62-59b5-4d70-9d10-4dcae21f0532',
    });
    expect(deux.status).toBe(400);
    const junk = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, { ...LIV, audioB64: '!!!pas-du-base64!!!' });
    expect(junk.status).toBe(400);
    expect(junk.json['field']).toBe('livraison');
    const trop = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, { ...LIV, audioB64: 'A'.repeat(1_400_001) });
    expect(trop.status).toBe(400);
    expect(mediaCalls.length).toBe(avantMedia); // not one refused body reached the door
  });
});

/* ═══ GEO-ACHAT-1 (liste half) — HER PIN ON THE PRIVATE LIVRAISON ═════════
 * The C3 pin's laws, applied to this door: supporting evidence for the
 * rider (SE-I07), same privacy class as her telephone — stored on the
 * private livraison, attached in the background to the gift order, served
 * ONLY on the founder's key-C dispatch read. */

describe('GEO-ACHAT-1 (liste half) — her pin rides the livraison to the gift order and the board', () => {
  const PIN = { lat: 12.371532, lng: -1.519931, accuracy: 12 };
  const LIVRAISON_GEO = {
    telephone: '70123456',
    quartier: 'Dassasgo',
    repere: 'Portail bleu, cour commune',
    zone: 'Dassasgo, Ouagadougou',
    pin: PIN,
  };
  /** Every coordinate byte, as a leak probe over any public answer. */
  const OCTETS_PIN = /"pin"|12\.371532|-1\.519931/;

  it('THE SEAM: pin at liste create → the gift order attaches it → the board serves the exact bytes — and no public read carries a coordinate', async () => {
    const { slug, resellerId } = await boutique('0070');
    const made = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, LIVRAISON_GEO);
    expect(made.status).toBe(200);
    expect(made.text).not.toMatch(OCTETS_PIN);
    const token = made.json['token'] as string;
    const lu = await lireListe(token);
    expect(lu.text).not.toMatch(OCTETS_PIN);

    const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug, pid: 'pv-le-1', paymentMode: 'FULL_PREPAY', listeRef: token,
        attributionResellerId: resellerId, requestKey: freshKey(),
      }),
    });
    expect(quoteRes.status).toBe(200);
    const quoteText = await quoteRes.text();
    expect(quoteText).not.toMatch(OCTETS_PIN);
    const quote = safeJson(quoteText) as { quoteId?: string };
    const held = await mf.dispatchFetch(
      `http://c/checkout/quote/${encodeURIComponent(quote.quoteId as string)}/reserve`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: 'cmd-reserve-0070', holderRef: 'holder-0070' }) },
    );
    expect(held.status).toBe(200);
    const created = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: quote.quoteId, holderRef: 'holder-0070', commandId: 'cmd-order-0070', listeRef: token,
      }),
    });
    expect(created.status).toBe(200);
    expect(await created.text()).not.toMatch(OCTETS_PIN);
    const orderId = `ord-${quote.quoteId}`;

    // THE LEDGER: the one reader of contacts serves the very bytes she tapped.
    const board = await mf.dispatchFetch('http://c/checkout/dispatch', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    expect(board.status).toBe(200);
    const rows = (safeJson(await board.text())['orders'] ?? []) as {
      orderId?: string; contact?: Record<string, unknown>;
    }[];
    const mine = rows.find((r) => r.orderId === orderId);
    expect(mine).toBeDefined();
    expect(mine!.contact!['pin']).toEqual(PIN);
    // And the public order view stays clean of it.
    const pub = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
    expect(pub.status).toBe(200);
    expect(await pub.text()).not.toMatch(OCTETS_PIN);
  });

  it('the wire REFUSES a malformed pin at the liste door — loudly, by field', async () => {
    const { slug } = await boutique('0071');
    const mauvais: unknown[] = [
      { lat: 91, lng: 0 },
      { lat: 12.3, lng: -1.5, alt: 300 },
      { lat: '12.3', lng: -1.5 },
      { lat: 12.3, lng: -1.5, accuracy: -1 },
    ];
    for (const pin of mauvais) {
      const r = await creerListe(slug, 'Awa', ['pv-le-1'], undefined, { ...LIVRAISON_GEO, pin });
      expect(r.status, `pin ${JSON.stringify(pin)} was not refused`).toBe(400);
      expect(r.json).toEqual({ ok: false, reason: 'bad_field', field: 'livraison' });
    }
    // And a livraison WITHOUT a pin stays exactly the shipped shape — the
    // board contact carries no pin key (the LISTE-ADRESSE road, untouched).
  });
});
