import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { build, type BuildOptions, type Format, type Platform, type Plugin } from 'esbuild';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { composeSandboxConfirmation } from '../../../scripts/sandbox-payment-confirm.mjs';
import { OPS_SECRET, seance, boutiqueDe } from './seance';

/**
 * ═══ EVERY KEY THIS WORKER CHECKS CAN CHANGE WITH NO GAP — and the founder's
 * sandbox tool holds a key of its own, which opens nothing once the Worker no
 * longer charges through the sandbox ═══
 *
 * Execution Contract §11: « key rotation … overlapping windows ». While `X_NEXT`
 * is set, the value it holds opens exactly what `X` opens — the same doors, the
 * same class, the same answer — and nothing more; unset or empty never matches;
 * once `X` holds the new value and `X_NEXT` is gone, the old value is refused.
 *
 * The real combined Worker on miniflare, one instance per key set (a binding is
 * fixed for an instance's life, exactly as a deployed secret is between two
 * puts). The doors are asked about an order nobody has, so « past the check »
 * is a named answer the check alone cannot give; the money rotation is also
 * walked on real orders, and the order's own view says `confirmed`.
 *
 * The provider fact (`PAYMENT_PROVIDER_KIND`, src/payment-port.ts) is proven
 * through a SECOND bundle: the command `bundle:worker:combined` in this
 * service's package.json, read and followed flag by flag, with that one
 * constant changed — the Worker as it would be the day a real provider is
 * wired. Nothing else in it differs, and the test proves that byte for byte.
 */

const execFileAsync = promisify(execFile);
const SERVICE = resolve(import.meta.dirname, '..');
const SCRIPT = 'dist/worker/worker.mjs';
const CONFIRM_SCRIPT = resolve(import.meta.dirname, '../../../scripts/sandbox-payment-confirm.mjs');
const T0 = '2026-11-28T08:00:00.000Z';

const PW = { vieux: 'test-payment-webhook-secret-cles-vieux', neuf: 'test-payment-webhook-secret-cles-neuf' };
const SC = { vieux: 'test-sandbox-confirm-secret-cles-vieux', neuf: 'test-sandbox-confirm-secret-cles-neuf' };
const OPS = { vieux: OPS_SECRET, neuf: 'test-checkout-ops-secret-cles-neuf' };
const BK = { vieux: 'test-progress-write-secret-cles-vieux', neuf: 'test-progress-write-secret-cles-neuf' };
const SE = { vieux: 'test-sera-progress-secret-cles-vieux', neuf: 'test-sera-progress-secret-cles-neuf' };
const AUTRE = 'pas-une-cle-de-ce-worker';

const SUPPLY = [
  {
    productVersionId: 'pv-cles-1',
    offerVersion: 'ov-cles-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

/** Boutik+'s two doors these orders cross, answered as the real offer-service answers them. */
async function offre(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === 'POST' && path === '/fulfillment/order-confirmed') return Response.json({ ok: true, status: 'registered' });
  const single = /^\/supply-projection\/([^/]+)$/.exec(path);
  if (single) {
    const value = SUPPLY.find((v) => v.productVersionId === decodeURIComponent(single[1]!));
    if (value === undefined) return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
    return Response.json({ version: 1, asOf: new Date().toISOString(), value });
  }
  return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/* ─────────────────────────── one real Worker per key set ─────────────────────────── */

interface Ouvert {
  mf: Miniflare;
  persist: string;
  /** Every line the runtime wrote, verbatim. */
  lignes: string[];
}
const ouverts: Ouvert[] = [];
afterAll(async () => {
  for (const o of ouverts.splice(0)) {
    await o.mf.dispose();
    rmSync(o.persist, { recursive: true, force: true });
  }
});

function ouvrir(bindings: Record<string, string>, scriptPath = SCRIPT): Ouvert {
  const persist = mkdtempSync(join(tmpdir(), 'cles-'));
  const lignes: string[] = [];
  const mf = new Miniflare({
    modules: true,
    scriptPath,
    // A real port, so the founder's tool reaches it over HTTP as it reaches workers.dev.
    port: 0,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
      DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
      PAYMENT_GROUP: 'PaymentGroupDO',
    },
    durableObjectsPersist: persist,
    bindings,
    serviceBindings: { OFFER: offre },
    structuredWorkerdLogs: true,
    handleStructuredLogs: ({ message }) => {
      lignes.push(message);
    },
  });
  const o = { mf, persist, lignes };
  ouverts.push(o);
  return o;
}

async function fermer(o: Ouvert): Promise<void> {
  const i = ouverts.indexOf(o);
  if (i >= 0) ouverts.splice(i, 1);
  await o.mf.dispose();
  rmSync(o.persist, { recursive: true, force: true });
}

/* ─────────────────────────────── the doors ─────────────────────────────── */

const INCONNUE = 'ord-zz-cles-inconnue';
const REFUS = '401 {"error":"unauthorized"}';
const enveloppe = (n: string) => ({
  command_id: `cles-${n}`, correlation_id: `corr-${INCONNUE}`, aggregateVersion: 1,
  actor: 'payment-provider:sandbox', serverTime: T0, version: '1',
});

/** The six money doors, each with the answer it gives past the check for an order nobody has. */
const PORTES_ARGENT = [
  { nom: 'GET order', methode: 'GET', chemin: `/checkout/webhook/order/${INCONNUE}`, passe: '404 {"ok":false}' },
  { nom: 'GET leg-key', methode: 'GET', chemin: `/checkout/webhook/leg-key/${INCONNUE}?leg=checkout`, passe: '404 {"ok":false}' },
  { nom: 'GET refund-key', methode: 'GET', chemin: `/checkout/webhook/refund-key/${INCONNUE}`, passe: '404 {"ok":false}' },
  {
    nom: 'POST payment', methode: 'POST', chemin: '/checkout/webhook/payment', passe: '404 {"error":"unknown_order"}',
    corps: { name: 'payment.checkout_leg_confirmed.v1', envelope: enveloppe('p'), payload: { order_id: INCONNUE } },
  },
  {
    nom: 'POST door', methode: 'POST', chemin: '/checkout/webhook/door', passe: '404 {"error":"unknown_order"}',
    corps: { name: 'payment.door_leg_confirmed.v1', envelope: enveloppe('d'), payload: { order_id: INCONNUE } },
  },
  {
    nom: 'POST refund', methode: 'POST', chemin: '/checkout/webhook/refund', passe: '404 {"error":"unknown_order"}',
    corps: { name: 'payment.refund_confirmed.v1', envelope: enveloppe('r'), payload: { order_id: INCONNUE } },
  },
] as const;

/** What each money door answers to this header value (`null` = no header at all), in door order. */
async function argent(mf: Miniflare, cle: string | null, cid?: string): Promise<string[]> {
  const out: string[] = [];
  for (const p of PORTES_ARGENT) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cle !== null) headers['X-Payment-Webhook-Key'] = cle;
    if (cid !== undefined) headers['x-correlation-id'] = `${cid}-${p.nom.replace(/\W+/g, '-')}`;
    const res = await mf.dispatchFetch(`http://c${p.chemin}`, {
      method: p.methode,
      headers,
      ...('corps' in p ? { body: JSON.stringify(p.corps) } : {}),
    });
    out.push(`${res.status} ${await res.text()}`);
  }
  return out;
}
const OUVERT = PORTES_ARGENT.map((p) => p.passe);
const FERME = PORTES_ARGENT.map(() => REFUS);

/** The founder's dispatch read (key C), on a Worker that holds no order: its answer past the check. */
const OPS_PASSE = '200 {"ok":true,"orders":[]}';
async function operateur(mf: Miniflare, cle: string | null, cid?: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (cle !== null) headers['Authorization'] = `Bearer ${cle}`;
  if (cid !== undefined) headers['x-correlation-id'] = cid;
  const res = await mf.dispatchFetch('http://c/checkout/dispatch', { headers });
  return `${res.status} ${await res.text()}`;
}

/**
 * THE CLASS a progress credential opens, read off the two progress doors:
 * Boutik+'s preparation fact, and Séra's transit mark. Each class answers a
 * pair no other class answers, so the class is observed, never assumed.
 */
type Classe = 'either' | 'boutik' | 'sera' | 'refus';
const PRET = {
  name: 'fulfillment.ready.v1',
  envelope: { command_id: 'ful-cles-1', correlation_id: 'corr-cles-1', aggregateVersion: 1, actor: 'offer-service:fulfillment', serverTime: T0, version: 'v1' },
  payload: { orderId: INCONNUE, at: T0 },
};
const TRANSIT = { orderId: INCONNUE, stage: 'en_route', asOf: T0 };
const PASSE_PROGRES = '404 {"ok":false,"reason":"unknown_order"}';
const MAUVAIS = '403 {"ok":false,"reason":"wrong_writer"}';
async function classe(mf: Miniflare, valeur: string | null, cid?: string): Promise<Classe> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (valeur !== null) headers['Authorization'] = `Bearer ${valeur}`;
  const avec = (suffixe: string) => (cid === undefined ? headers : { ...headers, 'x-correlation-id': `${cid}-${suffixe}` });
  const a = await mf.dispatchFetch('http://c/fulfillment/progress', { method: 'POST', headers: avec('p'), body: JSON.stringify(PRET) });
  const b = await mf.dispatchFetch('http://c/fulfillment/transit', { method: 'POST', headers: avec('t'), body: JSON.stringify(TRANSIT) });
  const paire = `${a.status} ${await a.text()} | ${b.status} ${await b.text()}`;
  if (paire === `${PASSE_PROGRES} | ${PASSE_PROGRES}`) return 'either';
  if (paire === `${PASSE_PROGRES} | ${MAUVAIS}`) return 'boutik';
  if (paire === `${MAUVAIS} | ${PASSE_PROGRES}`) return 'sera';
  if (paire === `${REFUS} | ${REFUS}`) return 'refus';
  throw new Error(`answers no class gives: ${paire}`);
}

/* ─────────────── what the log says, minus what differs on every request ─────────────── */

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function ligneDe(o: Ouvert, cid: string): Promise<Record<string, unknown>> {
  const fin = Date.now() + 6_000;
  const trouve = () =>
    o.lignes.map((m) => safeJson(m)).filter((l) => l['correlation_id'] === cid);
  while (trouve().length === 0 && Date.now() < fin) await pause(25);
  await pause(100);
  const toutes = trouve();
  expect(toutes, `exactly one line for ${cid}`).toHaveLength(1);
  const { ts: _ts, correlation_id: _cid, durationMs: _d, ...reste } = toutes[0]!;
  return reste;
}

/* ─────────────────────────── a real order, the buyer's road ─────────────────────────── */

const jetons = new Map<string, string>();
let cleN = 0;
async function vraieCommande(mf: Miniflare, n: string): Promise<string> {
  const S = await seance(mf, `cles${n}`);
  const B = boutiqueDe(S, 'CLES');
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: B.id, resellerId: S.accountId, shortCode: B.shortCode,
      name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général', correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  await mf.dispatchFetch(`http://c/storefronts/${encodeURIComponent(B.id)}/publish`, { method: 'POST', headers: S.bearer, body: JSON.stringify({ correlationId: 'corr-en-ligne' }) });
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-cles-${n}`, storefrontId: B.id, resellerId: S.accountId,
      productVersionId: 'pv-cles-1', offerVersion: 'ov-cles-1', markup: 1_500, correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: B.slug, pid: 'pv-cles-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: S.accountId, requestKey: `rk-cles-${String((cleN += 1)).padStart(4, '0')}-${'x'.repeat(10)}`,
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
    body: JSON.stringify({ quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}` }),
  });
  if (res.status !== 200) throw new Error(`setup: order ${res.status}`);
  const orderId = `ord-${quote.quoteId}`;
  jetons.set(orderId, String(safeJson(await res.text())['buyerRef']));
  return orderId;
}

/** The order's own view, read with its buyer's token — the ledger's word, never a response's. */
async function etat(mf: Miniflare, orderId: string): Promise<{ state: string; amount: number }> {
  const jeton = jetons.get(orderId);
  if (jeton === undefined) throw new Error(`no buyer token kept for ${orderId}`);
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${jeton}` } });
  const body = safeJson(await res.text());
  return { state: String(body['state'] ?? `http-${res.status}`), amount: Number(body['amountPaidAtCheckout']) };
}

/* ═══════════════════════════════ the simple keys ═══════════════════════════════ */

/** Every key that opens a whole door (no class): the two money keys and key C. */
const ROTATION = {
  PAYMENT_WEBHOOK_SECRET: PW.vieux, PAYMENT_WEBHOOK_SECRET_NEXT: PW.neuf,
  SANDBOX_CONFIRM_SECRET: SC.vieux, SANDBOX_CONFIRM_SECRET_NEXT: SC.neuf,
  CHECKOUT_OPS_SECRET: OPS.vieux, CHECKOUT_OPS_SECRET_NEXT: OPS.neuf,
  PROGRESS_WRITE_SECRET: BK.vieux, PROGRESS_WRITE_SECRET_NEXT: BK.neuf,
  SERA_PROGRESS_SECRET: SE.vieux, SERA_PROGRESS_SECRET_NEXT: SE.neuf,
};

describe('during a change, the old key and the next key both open, with the same answer — nothing else does', () => {
  it('the six money doors: the provider key, the sandbox tool key, and each one’s next', async () => {
    const o = ouvrir(ROTATION);
    for (const cle of [PW.vieux, PW.neuf, SC.vieux, SC.neuf]) {
      expect(await argent(o.mf, cle), `key ${cle}`).toEqual(OUVERT);
    }
    for (const cle of [AUTRE, '', null, OPS.vieux, BK.vieux, SE.vieux]) {
      expect(await argent(o.mf, cle), `value ${String(cle)}`).toEqual(FERME);
    }
    await fermer(o);
  }, 60_000);

  it('key C: the old and the next open the founder’s read, nothing else does', async () => {
    const o = ouvrir(ROTATION);
    expect(await operateur(o.mf, OPS.vieux)).toBe(OPS_PASSE);
    expect(await operateur(o.mf, OPS.neuf)).toBe(OPS_PASSE);
    for (const cle of [AUTRE, '', null, PW.vieux, SC.vieux, BK.vieux]) expect(await operateur(o.mf, cle), `value ${String(cle)}`).toBe(REFUS);
    await fermer(o);
  }, 60_000);

  it('the log line is the same whichever of the two keys opened — it never says which', async () => {
    const o = ouvrir(ROTATION);
    const paires: [string, string, (cid: string) => Promise<unknown>, (cid: string) => Promise<unknown>][] = [
      ['provider key', 'cles-pw', (c) => argent(o.mf, PW.vieux, c), (c) => argent(o.mf, PW.neuf, c)],
      ['sandbox tool key', 'cles-sc', (c) => argent(o.mf, SC.vieux, c), (c) => argent(o.mf, SC.neuf, c)],
      ['key C', 'cles-ops', (c) => operateur(o.mf, OPS.vieux, c), (c) => operateur(o.mf, OPS.neuf, c)],
      ['Boutik+ progress key', 'cles-bk', (c) => classe(o.mf, BK.vieux, c), (c) => classe(o.mf, BK.neuf, c)],
      ['Séra progress key', 'cles-se', (c) => classe(o.mf, SE.vieux, c), (c) => classe(o.mf, SE.neuf, c)],
    ];
    for (const [, cid, vieux, neuf] of paires) {
      await vieux(`${cid}-vieux`);
      await neuf(`${cid}-neuf`);
    }
    // Each door's line under the old key against the same door under the next.
    const suffixes = (cid: string): string[] =>
      cid === 'cles-ops' ? [''] : cid === 'cles-bk' || cid === 'cles-se' ? ['-p', '-t'] : PORTES_ARGENT.map((p) => `-${p.nom.replace(/\W+/g, '-')}`);
    for (const [nom, cid] of paires) {
      for (const s of suffixes(cid)) {
        const a = await ligneDe(o, `${cid}-vieux${s}`);
        const b = await ligneDe(o, `${cid}-neuf${s}`);
        expect(b, `${nom}${s}`).toEqual(a);
        expect(a['status'], `${nom}${s} is past the check`).not.toBe(401);
      }
    }
    await fermer(o);
  }, 60_000);

  it('a real order: the provider’s next key confirms it through the tool’s own composition, and the order reads confirmed', async () => {
    const o = ouvrir(ROTATION);
    const orderId = await vraieCommande(o.mf, '0001');
    const avant = await etat(o.mf, orderId);
    expect(avant.state).toBe('payment_pending');
    const signe = { 'X-Payment-Webhook-Key': PW.neuf, 'Content-Type': 'application/json' };
    const key = await o.mf.dispatchFetch(`http://c/checkout/webhook/leg-key/${encodeURIComponent(orderId)}?leg=checkout`, { headers: signe });
    expect(key.status).toBe(200);
    const legKey = String(safeJson(await key.text())['legKey']);
    const sent = await o.mf.dispatchFetch('http://c/checkout/webhook/payment', {
      method: 'POST',
      headers: signe,
      body: JSON.stringify(composeSandboxConfirmation(orderId, avant.amount, new Date().toISOString(), legKey)),
    });
    expect(sent.status).toBe(200);
    expect((await etat(o.mf, orderId)).state).toBe('confirmed');
    await fermer(o);
  }, 60_000);

  it('a real order: the founder’s tool, holding the next sandbox key, confirms it, and the order reads confirmed', async () => {
    const o = ouvrir(ROTATION);
    const orderId = await vraieCommande(o.mf, '0002');
    expect((await etat(o.mf, orderId)).state).toBe('payment_pending');
    const env: Record<string, string | undefined> = { ...process.env, STOREFRONT_BASE: String(await o.mf.ready), ORDER_ID: orderId };
    delete env['PAYMENT_WEBHOOK_SECRET'];
    delete env['SANDBOX_CONFIRM_SECRET_NEXT'];
    env['SANDBOX_CONFIRM_SECRET'] = SC.neuf;
    let code = 0;
    let sortie = '';
    try {
      const r = await execFileAsync(process.execPath, [CONFIRM_SCRIPT], { env });
      sortie = r.stdout + r.stderr;
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      code = e.code ?? 1;
      sortie = (e.stdout ?? '') + (e.stderr ?? '');
    }
    expect(code, sortie).toBe(0);
    expect((await etat(o.mf, orderId)).state).toBe('confirmed');
    await fermer(o);
  }, 60_000);

  it('after the change (X holds the new value, no X_NEXT): the new value opens, the old one is refused everywhere', async () => {
    const o = ouvrir({
      PAYMENT_WEBHOOK_SECRET: PW.neuf, SANDBOX_CONFIRM_SECRET: SC.neuf, CHECKOUT_OPS_SECRET: OPS.neuf,
    });
    expect(await argent(o.mf, PW.neuf)).toEqual(OUVERT);
    expect(await argent(o.mf, SC.neuf)).toEqual(OUVERT);
    expect(await operateur(o.mf, OPS.neuf)).toBe(OPS_PASSE);
    for (const cle of [PW.vieux, SC.vieux, '', null]) expect(await argent(o.mf, cle), `value ${String(cle)}`).toEqual(FERME);
    for (const cle of [OPS.vieux, '', null]) expect(await operateur(o.mf, cle), `value ${String(cle)}`).toBe(REFUS);
    await fermer(o);
  }, 60_000);

  it('only X_NEXT set (X unset): it opens what X would open, and an empty or missing value never does', async () => {
    const o = ouvrir({
      PAYMENT_WEBHOOK_SECRET_NEXT: PW.neuf, SANDBOX_CONFIRM_SECRET_NEXT: SC.neuf, CHECKOUT_OPS_SECRET_NEXT: OPS.neuf,
    });
    expect(await argent(o.mf, PW.neuf)).toEqual(OUVERT);
    expect(await argent(o.mf, SC.neuf)).toEqual(OUVERT);
    expect(await operateur(o.mf, OPS.neuf)).toBe(OPS_PASSE);
    for (const cle of [PW.vieux, SC.vieux, AUTRE, '', null]) expect(await argent(o.mf, cle), `value ${String(cle)}`).toEqual(FERME);
    for (const cle of [OPS.vieux, AUTRE, '', null]) expect(await operateur(o.mf, cle), `value ${String(cle)}`).toBe(REFUS);
    await fermer(o);
  }, 60_000);

  it('X set and X_NEXT unset: an empty or missing value is refused (the unset next key never matches)', async () => {
    const o = ouvrir({
      PAYMENT_WEBHOOK_SECRET: PW.vieux, SANDBOX_CONFIRM_SECRET: SC.vieux, CHECKOUT_OPS_SECRET: OPS.vieux,
    });
    expect(await argent(o.mf, PW.vieux)).toEqual(OUVERT);
    expect(await argent(o.mf, SC.vieux)).toEqual(OUVERT);
    for (const cle of ['', null, PW.neuf, SC.neuf]) expect(await argent(o.mf, cle), `value ${String(cle)}`).toEqual(FERME);
    for (const cle of ['', null, OPS.neuf]) expect(await operateur(o.mf, cle), `value ${String(cle)}`).toBe(REFUS);
    await fermer(o);
  }, 60_000);
});

/* ═══════════════════════ the progress classifier, row by row ═══════════════════════ */

const b = BK.vieux;
const bn = BK.neuf;
const s = SE.vieux;
const sn = SE.neuf;
const X = 'test-shared-value-cles-egalite';
const PRESENTES: [string, string | null][] = [
  ['b', b], ['bn', bn], ['s', s], ['sn', sn], ['X', X], ['other', AUTRE], ['empty', ''], ['none', null],
];
/**
 * The split is armed by SERA_PROGRESS_SECRET alone. Legacy (unset): Boutik+'s
 * value, or its next, opens every progress door (`either`), and Séra's next
 * opens nothing. Split: Boutik+'s values open preparation only, Séra's values
 * the delivery marks only, and a value both hold is Boutik+'s.
 */
const TABLE: { ligne: string; env: Record<string, string>; ouvre: Partial<Record<string, Classe>> }[] = [
  { ligne: 'legacy · b', env: { PROGRESS_WRITE_SECRET: b }, ouvre: { b: 'either' } },
  { ligne: 'legacy · b + bn', env: { PROGRESS_WRITE_SECRET: b, PROGRESS_WRITE_SECRET_NEXT: bn }, ouvre: { b: 'either', bn: 'either' } },
  { ligne: 'legacy · b + sn (sn opens nothing while s is unset)', env: { PROGRESS_WRITE_SECRET: b, SERA_PROGRESS_SECRET_NEXT: sn }, ouvre: { b: 'either' } },
  { ligne: 'legacy · b + bn + sn', env: { PROGRESS_WRITE_SECRET: b, PROGRESS_WRITE_SECRET_NEXT: bn, SERA_PROGRESS_SECRET_NEXT: sn }, ouvre: { b: 'either', bn: 'either' } },
  { ligne: 'legacy · bn only (b unset)', env: { PROGRESS_WRITE_SECRET_NEXT: bn }, ouvre: { bn: 'either' } },
  { ligne: 'legacy · nothing set', env: {}, ouvre: {} },
  { ligne: 'split · b + s', env: { PROGRESS_WRITE_SECRET: b, SERA_PROGRESS_SECRET: s }, ouvre: { b: 'boutik', s: 'sera' } },
  { ligne: 'split · b + bn + s', env: { PROGRESS_WRITE_SECRET: b, PROGRESS_WRITE_SECRET_NEXT: bn, SERA_PROGRESS_SECRET: s }, ouvre: { b: 'boutik', bn: 'boutik', s: 'sera' } },
  { ligne: 'split · b + s + sn', env: { PROGRESS_WRITE_SECRET: b, SERA_PROGRESS_SECRET: s, SERA_PROGRESS_SECRET_NEXT: sn }, ouvre: { b: 'boutik', s: 'sera', sn: 'sera' } },
  { ligne: 'split · b + bn + s + sn', env: { PROGRESS_WRITE_SECRET: b, PROGRESS_WRITE_SECRET_NEXT: bn, SERA_PROGRESS_SECRET: s, SERA_PROGRESS_SECRET_NEXT: sn }, ouvre: { b: 'boutik', bn: 'boutik', s: 'sera', sn: 'sera' } },
  { ligne: 'split · bn + s (b unset)', env: { PROGRESS_WRITE_SECRET_NEXT: bn, SERA_PROGRESS_SECRET: s }, ouvre: { bn: 'boutik', s: 'sera' } },
  { ligne: 'split · s + sn (no Boutik+ value)', env: { SERA_PROGRESS_SECRET: s, SERA_PROGRESS_SECRET_NEXT: sn }, ouvre: { s: 'sera', sn: 'sera' } },
  { ligne: 'tie · bn and s hold the same value', env: { PROGRESS_WRITE_SECRET: b, PROGRESS_WRITE_SECRET_NEXT: X, SERA_PROGRESS_SECRET: X }, ouvre: { b: 'boutik', X: 'boutik' } },
  { ligne: 'tie · b and sn hold the same value', env: { PROGRESS_WRITE_SECRET: X, SERA_PROGRESS_SECRET: s, SERA_PROGRESS_SECRET_NEXT: X }, ouvre: { X: 'boutik', s: 'sera' } },
  { ligne: 'after Boutik+’s change (b = new, no bn): the old value is refused', env: { PROGRESS_WRITE_SECRET: bn }, ouvre: { bn: 'either' } },
  { ligne: 'after Séra’s change (s = new, no sn): the old value is refused', env: { PROGRESS_WRITE_SECRET: b, SERA_PROGRESS_SECRET: sn }, ouvre: { b: 'boutik', sn: 'sera' } },
];

describe('the progress classifier — every row of the table, through the two real progress doors', () => {
  it.each(TABLE)('$ligne', async ({ env, ouvre }) => {
    const o = ouvrir(env);
    const vu: Record<string, Classe> = {};
    for (const [nom, valeur] of PRESENTES) vu[nom] = await classe(o.mf, valeur);
    const attendu = Object.fromEntries(PRESENTES.map(([nom]) => [nom, ouvre[nom] ?? 'refus']));
    expect(vu).toEqual(attendu);
    await fermer(o);
  }, 60_000);
});

/* ═══════════════ the provider fact: the Worker the day a real provider is wired ═══════════════ */

/** The fact, exactly as src/payment-port.ts writes it, and the one change a switch makes. */
const ANCRE = "export const PAYMENT_PROVIDER_KIND = 'sandbox' as const;";
const BASCULE = "export const PAYMENT_PROVIDER_KIND = 'reel' as const;";

/**
 * The command that builds the deployed Worker, as package.json writes it,
 * split into words by the same shell pnpm runs it with — never a copied list.
 */
function commandeDuBundle(): string[] {
  const pkg = JSON.parse(readFileSync(join(SERVICE, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const cmd = pkg.scripts['bundle:worker:combined'];
  if (cmd === undefined || !cmd.startsWith('esbuild ')) throw new Error('bundle:worker:combined is not one esbuild command');
  // One command only: anything that could run a second one is refused, not run.
  if (/[;&|`<>\n]|\$\(/.test(cmd)) throw new Error(`bundle:worker:combined carries more than one command: ${cmd}`);
  const mots = execFileSync('sh', ['-c', `printf '%s\\0' ${cmd}`], { cwd: SERVICE, env: process.env, encoding: 'utf8' });
  return mots.split('\0').slice(0, -1);
}

/** The esbuild options those words mean. A flag this does not know stops the build: the variant never drifts quietly. */
function optionsDe(mots: string[], outfile: string): BuildOptions {
  const [bin, ...reste] = mots;
  if (bin !== 'esbuild') throw new Error(`not an esbuild command: ${String(bin)}`);
  const entryPoints: string[] = [];
  const alias: Record<string, string> = {};
  const define: Record<string, string> = {};
  const o: BuildOptions = { absWorkingDir: SERVICE, entryPoints, alias, define, logLevel: 'silent', write: true };
  let sortie = false;
  for (const mot of reste) {
    let m: RegExpExecArray | null;
    if (!mot.startsWith('-')) entryPoints.push(mot);
    else if (mot === '--bundle') o.bundle = true;
    else if ((m = /^--format=(.+)$/.exec(mot))) o.format = m[1] as Format;
    else if ((m = /^--platform=(.+)$/.exec(mot))) o.platform = m[1] as Platform;
    else if ((m = /^--conditions=(.+)$/.exec(mot))) o.conditions = m[1]!.split(',');
    else if ((m = /^--alias:([^=]+)=(.+)$/.exec(mot))) alias[m[1]!] = m[2]!;
    else if ((m = /^--define:([^=]+)=(.+)$/.exec(mot))) define[m[1]!] = m[2]!;
    else if (/^--outfile=/.test(mot)) {
      o.outfile = outfile;
      sortie = true;
    } else throw new Error(`the variant does not know the flag ${mot} — teach it before trusting it`);
  }
  if (!sortie || entryPoints.length !== 1) throw new Error('the command names no single entry and outfile');
  return o;
}

/** Changes the provider fact, and nothing else, in the one file that holds it. */
function bascule(touches: string[]): Plugin {
  return {
    name: 'bascule-fournisseur',
    setup(b) {
      b.onLoad({ filter: /[\\/]src[\\/]payment-port\.ts$/ }, (args) => {
        const src = readFileSync(args.path, 'utf8');
        const n = src.split(ANCRE).length - 1;
        if (n !== 1) throw new Error(`the provider fact matched ${n} times in ${args.path}, not exactly once`);
        touches.push(args.path);
        return { contents: src.replace(ANCRE, BASCULE), loader: 'ts' };
      });
    },
  };
}

describe('the sandbox tool’s key opens nothing once the Worker no longer charges through the sandbox', () => {
  // Under the service's own build output: workerd refuses a script path that
  // climbs out of the directory it was started in.
  const dossier = mkdtempSync(join(SERVICE, 'dist', 'cles-variante-'));
  afterAll(() => rmSync(dossier, { recursive: true, force: true }));

  it('the command, followed from package.json, builds the deployed bundle byte for byte', async () => {
    const out = join(dossier, 'meme.mjs');
    await build(optionsDe(commandeDuBundle(), out));
    expect(readFileSync(out, 'utf8') === readFileSync(join(SERVICE, SCRIPT), 'utf8'), 'the followed command must rebuild dist/worker/worker.mjs exactly').toBe(true);
  }, 60_000);

  it('with only the provider fact changed: both sandbox keys get the one 401 at every money door, the provider keys still open', async () => {
    const meme = join(dossier, 'base.mjs');
    const variante = join(dossier, 'variante.mjs');
    await build(optionsDe(commandeDuBundle(), meme));
    const touches: string[] = [];
    await build({ ...optionsDe(commandeDuBundle(), variante), plugins: [bascule(touches)] });
    expect(touches.map((p) => p.slice(SERVICE.length + 1)), 'the fact was changed in its one file, once').toEqual(['src/payment-port.ts']);

    // Nothing but that constant differs between the two Workers.
    const a = readFileSync(meme, 'utf8').split('\n');
    const v = readFileSync(variante, 'utf8').split('\n');
    expect(v.length).toBe(a.length);
    const diff = a.flatMap((ligne, i) => (ligne === v[i] ? [] : [[ligne, v[i]]]));
    expect(diff).toHaveLength(1);
    expect(diff[0]![1]).toBe(diff[0]![0]!.replace('"sandbox"', '"reel"'));
    expect(diff[0]![0]).toContain('PAYMENT_PROVIDER_KIND');

    const o = ouvrir(
      {
        PAYMENT_WEBHOOK_SECRET: PW.vieux, PAYMENT_WEBHOOK_SECRET_NEXT: PW.neuf,
        SANDBOX_CONFIRM_SECRET: SC.vieux, SANDBOX_CONFIRM_SECRET_NEXT: SC.neuf,
      },
      variante,
    );
    expect(await argent(o.mf, SC.vieux), 'the sandbox key').toEqual(FERME);
    expect(await argent(o.mf, SC.neuf), 'the next sandbox key').toEqual(FERME);
    expect(await argent(o.mf, PW.vieux), 'the provider key').toEqual(OUVERT);
    expect(await argent(o.mf, PW.neuf), 'the next provider key').toEqual(OUVERT);
    await fermer(o);
  }, 60_000);
});
