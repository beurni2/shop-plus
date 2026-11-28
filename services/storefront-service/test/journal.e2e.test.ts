import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { unstable_readConfig } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, boutiqueDe, type Boutique, type Seance } from './seance';

/**
 * ═══ JOURNAL-SERVICE — the storefront service keeps a log: one line per
 *     request and one per fault, never a person's data ═══
 *
 * Execution Contract §6 (l.125-126): « One correlation chain per transaction:
 * `quote_id → reservation_id → payment_attempt_id → order_id → …` » and
 * « Standards: structured logs · … · DLQ + stuck-saga detection ».
 * §8 item 8 (l.157): « A support agent can reconstruct any transaction from
 * the correlation chain. » `packages/observability/src/logger.ts`: every line
 * is ONE JSON object carrying `correlation_id`; the inbound header is capped
 * at `CORRELATION_ID_MAX` (64).
 *
 * The real combined Worker under Miniflare. Every `console.*` line the
 * runtime writes is captured (`structuredWorkerdLogs` + `handleStructuredLogs`)
 * — the same lines Workers Logs stores once the service is deployed. Each
 * request this file sends carries its own correlation id, so « exactly one
 * line for this request » is a count, never a guess.
 *
 * ⚠ BOUTIK+'S DOOR IS A CERTIFIED STAND-IN — boutik-plus d1ecbbe:
 *   · `services/offer-service/worker/index.ts:458-462` — `POST
 *     /fulfillment/order-confirmed` asks `rejectUnauthorizedBearer` with
 *     FULFILLMENT_WRITE_SECRET BEFORE the body is read (every /fulfillment/*
 *     door does the same, :473, :487, :503);
 *   · `packages/service-auth/src/index.ts:95-97,150-170` — a missing or wrong
 *     Bearer is the one `{ error: 'unauthorized' }` 401.
 * This Worker is given NO fulfillment key (the secret not yet set on its
 * side), so every fulfillment call it makes is refused 401, exactly as the
 * real door refuses it: the hold answers « unknown » and the sale proceeds
 * (src/producer-hold.ts), the confirmed-order wire stays pending and retries.
 * The supply read is gated on its own Bearer like the real one.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'journal-'));
const T0 = '2026-11-28T08:00:00.000Z';
const SERVICE = 'storefront-service';

const WEBHOOK_SECRET = 'test-payment-webhook-secret-jrn001';
const SUPPLY_SECRET = 'test-supply-read-secret-jrn001';
/** The value Boutik+ holds. This Worker holds none. */
const BOUTIK_FULFILL_SECRET = 'test-fulfillment-write-secret-jrn001';

/** Five-digit amounts: never a duration, and matched only as a whole number (see `porteSentinelle`). */
const BASE = 48_731;
const COMMISSION = 10_463;
const MARKUP = 11_587;

const SUPPLY = [
  {
    productVersionId: 'pv-jrn-1', offerVersion: 'ov-jrn-1', basePrice: BASE, resellerCommission: COMMISSION,
    available: 30, productName: 'Bazin riche', assetRefs: [] as string[], category: 'fashion_bags_fabrics',
    sellerTier: 'verified', supplier: 'sup-jrn-1',
  },
];

/* ─────────────────────────── Boutik+, as its real door ─────────────────────────── */

/** Every call Boutik+'s doors received, with the status each answered. */
const appelsBoutik: { path: string; status: number }[] = [];

async function boutik(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const auth = request.headers.get('Authorization');
  const answer = (status: number, payload: unknown): Response => {
    appelsBoutik.push({ path, status });
    return Response.json(payload, { status });
  };
  if (request.method === 'POST' && path.startsWith('/fulfillment/')) {
    // The Bearer first, before any byte of the body is read.
    if (auth !== `Bearer ${BOUTIK_FULFILL_SECRET}`) return answer(401, { error: 'unauthorized' });
    // Unreachable here — this Worker holds no fulfillment key. Loud if it ever is.
    return answer(500, { ok: false, reason: 'stand_in_not_built_for_an_authorized_call' });
  }
  if (path === '/supply-grouping') {
    if (auth !== `Bearer ${SUPPLY_SECRET}`) return answer(401, { error: 'unauthorized' });
    const ids = ((await request.json().catch(() => null)) as { productVersionIds?: string[] } | null)?.productVersionIds ?? [];
    const groupes = new Map<string, string[]>();
    for (const id of ids) {
      const f = SUPPLY.find((v) => v.productVersionId === id)?.supplier ?? id;
      groupes.set(f, [...(groupes.get(f) ?? []), id]);
    }
    return answer(200, { groups: [...groupes.values()] });
  }
  const single = /^\/supply-projection\/([^/]+)$/.exec(path);
  if (single) {
    if (auth !== `Bearer ${SUPPLY_SECRET}`) return answer(401, { error: 'unauthorized' });
    const v = SUPPLY.find((x) => x.productVersionId === decodeURIComponent(single[1]!));
    if (v === undefined) return answer(404, { status: 'not_found' });
    const { supplier: _cache, ...value } = v;
    return answer(200, { version: 1, asOf: new Date().toISOString(), value });
  }
  return answer(404, { status: 'not_found' });
}

/* ─────────────────────────────── the capture ─────────────────────────────── */

/** Every message the runtime wrote, verbatim, in order. */
const recus: string[] = [];
type Ligne = Record<string, unknown>;

function lignes(): Ligne[] {
  return recus.flatMap((m) => {
    try {
      const v = JSON.parse(m) as unknown;
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? [v as Ligne] : [];
    } catch {
      return [];
    }
  });
}

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The lines that match, once at least `attendu` are in — then a short settle, so a second line is seen too. */
async function attendreLignes(filtre: (l: Ligne) => boolean, attendu = 1, ms = 6_000): Promise<Ligne[]> {
  const fin = Date.now() + ms;
  while (lignes().filter(filtre).length < attendu && Date.now() < fin) await pause(25);
  await pause(200);
  return lignes().filter(filtre);
}
const lignesDe = (cid: string, attendu = 1): Promise<Ligne[]> => attendreLignes((l) => l['correlation_id'] === cid, attendu);

/* ─────────────────────────────── the harness ─────────────────────────────── */

let mf: Miniflare;
let seq = 0;

function safeJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

interface Reponse { status: number; text: string; json: Record<string, unknown>; headers: Headers; cid: string }

/**
 * One request, under its own correlation id. The default stem shares nothing
 * with any sentinel below: her slug is `jrn-` and her four account digits, so
 * a `…jrn-NNNN` id would carry her slug whenever NNNN met those digits.
 */
async function appel(path: string, init: RequestInit = {}, cid = `corr-balai-${String((seq += 1)).padStart(4, '0')}`): Promise<Reponse> {
  const headers = new Headers(init.headers);
  headers.set('x-correlation-id', cid);
  const res = await mf.dispatchFetch(`http://c${path}`, { ...init, headers } as never);
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text), headers: res.headers as unknown as Headers, cid };
}
const json = { 'Content-Type': 'application/json' };
const poste = (path: string, body: unknown, headers: Record<string, string> = json): Promise<Reponse> =>
  appel(path, { method: 'POST', headers, body: JSON.stringify(body) });

async function outboxDe(orderId: string): Promise<Record<string, { status?: string; attempts?: number } | undefined>> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  return safeJson(await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/outbox')).text()) as never;
}

/* ─────────────────── a real order, by the buyer's own road ─────────────────── */

/** Her contact at the door, every field a sentinel: none of it may ever reach a line. */
const CONTACT = {
  phone: '+226 71 93 52 84',
  quartier: 'Qxquartier Gounghin',
  repere: 'Qxrepere derriere le marche',
  pin: { lat: 12.3714277, lng: -1.5196603 },
  audioB64: btoa('QXVOIX-note-vocale-sentinelle'),
};

let S: Seance;
let B: Boutique;
let orderId = '';
let quoteId = '';
let jeton = '';
let legKey = '';
let amountPaid = 0;

async function commandeReelle(): Promise<void> {
  S = await seance(mf, 'jrn');
  B = boutiqueDe(S, 'JRN');
  const created = await poste('/storefronts', {
    commandId: 'cmd-jrn-create', id: B.id, resellerId: S.accountId, shortCode: B.shortCode,
    name: 'Boutique Qxdjeneba', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-jrn-shop', at: T0,
  }, S.bearer);
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${created.text}`);
  await poste(`/storefronts/${encodeURIComponent(B.id)}/publish`, { correlationId: 'corr-jrn-en-ligne' }, S.bearer);
  const pub = await poste('/listings', {
    commandId: 'cmd-jrn-listing', listingId: 'lst-jrn-1', storefrontId: B.id, resellerId: S.accountId,
    productVersionId: 'pv-jrn-1', offerVersion: 'ov-jrn-1', markup: MARKUP, correlationId: 'corr-jrn-listing', at: T0,
  }, S.bearer);
  if (pub.json['status'] !== 'published') throw new Error(`setup: listing ${pub.status} ${pub.text}`);
  const quote = await poste('/checkout/quote', {
    slug: B.slug, pid: 'pv-jrn-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
    attributionResellerId: S.accountId, requestKey: `rk-jrn-0001-${'x'.repeat(10)}`,
  });
  if (typeof quote.json['quoteId'] !== 'string') throw new Error(`setup: quote ${quote.status} ${quote.text}`);
  quoteId = quote.json['quoteId'];
  amountPaid = Number(quote.json['amountPaidAtCheckout']);
  const held = await poste(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, { commandId: 'cmd-jrn-reserve', holderRef: 'holder-jrn-1' });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status} ${held.text}`);
  const ordered = await poste('/checkout/order', { quoteId, holderRef: 'holder-jrn-1', commandId: 'cmd-jrn-order', contact: CONTACT });
  if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status} ${ordered.text}`);
  orderId = `ord-${quoteId}`;
  jeton = String(ordered.json['buyerRef']);
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const audit = safeJson(await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).text()) as { legKeys?: Record<string, string> };
  legKey = audit.legKeys?.['checkout'] ?? '';
  if (legKey === '') throw new Error(`setup: no checkout leg key on ${orderId}`);
  const paid = await poste('/checkout/webhook/payment', {
    name: 'payment.checkout_leg_confirmed.v1',
    envelope: {
      command_id: `whk-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 1,
      actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1',
    },
    payload: {
      provider: 'sandbox-provider', payment_attempt_id: legKey, collectRef: `collect-${orderId}`,
      amount: amountPaid, fee: 0, status: 'held', order_id: orderId, redelivery: false,
    },
  }, { ...json, 'X-Payment-Webhook-Key': WEBHOOK_SECRET });
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${paid.text}`);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO', ORDER: 'OrderDO',
      ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO', PAYMENT_GROUP: 'PaymentGroupDO',
      COMPTES_CLIENTES: 'BuyerAccountsDO', DLQ: 'DeadLetterDO',
      // WISHLIST deliberately unbound: the liste doors answer their named 503 — a server-side refusal to log.
    },
    durableObjectsPersist: persist,
    bindings: {
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      CHECKOUT_OPS_SECRET: OPS_SECRET,
      SUPPLY_READ_SECRET: SUPPLY_SECRET,
      // No FULFILLMENT_WRITE_SECRET, no SERA_INTAKE_BASE / SECRET, no CUSTODY binding: unset on this side.
    },
    ratelimits: {
      LIMITE_CONNEXIONS_CLIENTES: { namespace_id: '1006', simple: { limit: 2, period: 60 } },
    },
    serviceBindings: { OFFER: boutik },
    structuredWorkerdLogs: true,
    handleStructuredLogs: ({ message }) => {
      recus.push(message);
    },
  });
  await commandeReelle();
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
  rmSync(persist, { recursive: true, force: true });
});

/* ═══════════════════════ (i) one line per request ═══════════════════════ */

const ORDER_SHAPE = /^ord-quote-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('the service writes ONE structured line per request', () => {
  it('a known route writes exactly one line: its template, method, status, duration, correlation id and the order it names', async () => {
    expect(orderId).toMatch(ORDER_SHAPE);
    const r = await appel(`/checkout/order/${encodeURIComponent(orderId)}/suivi`, {}, 'corr-jrn-suivi-0001');
    expect(r.status).toBe(200);
    const mine = await lignesDe('corr-jrn-suivi-0001');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toEqual({
      ts: expect.any(String),
      level: 'info',
      correlation_id: 'corr-jrn-suivi-0001',
      service: SERVICE,
      msg: 'request',
      route: '/checkout/order/:orderId/suivi',
      method: 'GET',
      status: 200,
      durationMs: expect.any(Number),
      orderId,
    });
    expect(Number.isInteger(mine[0]!['durationMs']) && (mine[0]!['durationMs'] as number) >= 0).toBe(true);
  }, 60_000);

  it('/health writes exactly one line, and its correlation id is the one its answer carries', async () => {
    const r = await mf.dispatchFetch('http://c/health');
    await r.text();
    const cid = r.headers.get('x-correlation-id');
    expect(cid).toBeTruthy();
    const mine = await lignesDe(cid!);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toEqual({
      ts: expect.any(String), level: 'info', correlation_id: cid, service: SERVICE, msg: 'request',
      route: '/health', method: 'GET', status: 200, durationMs: expect.any(Number),
    });
  }, 60_000);

  it('an inbound correlation id longer than 64 characters is written cut to its first 64', async () => {
    const long = `corr-jrn-long-${'c'.repeat(500)}`;
    await appel('/health', {}, long);
    const mine = await lignesDe(long.slice(0, 64));
    expect(mine).toHaveLength(1);
    expect(mine[0]!['route']).toBe('/health');
    expect(recus.some((m) => m.includes('c'.repeat(65)))).toBe(false);
  }, 60_000);

  it('a quote, a group and an order are named only when the route names them AND the id has its minted shape', async () => {
    const q = await appel(`/checkout/quote/${encodeURIComponent(quoteId)}`);
    const [lq] = await lignesDe(q.cid);
    expect(lq).toMatchObject({ route: '/checkout/quote/:quoteId', quoteId });
    expect(lq).not.toHaveProperty('orderId');

    const grp = `grp-${'a1b2c3d4e5'.repeat(4)}`;
    const g = await appel(`/checkout/group/${grp}`);
    const [lg] = await lignesDe(g.cid);
    expect(lg).toMatchObject({ route: '/checkout/group/:groupId', groupId: grp });

    // Shapes a caller typed: the template stands, the id is left out.
    for (const [path, route] of [
      ['/checkout/group/grp-not-a-minted-group', '/checkout/group/:groupId'],
      ['/checkout/order/22671935284/suivi', '/checkout/order/:orderId/suivi'],
      [`/checkout/order/ord-quote-${'z'.repeat(36)}/suivi`, '/checkout/order/:orderId/suivi'],
      ['/checkout/quote/quote-not-a-uuid', '/checkout/quote/:quoteId'],
    ] as const) {
      const x = await appel(path);
      const [l] = await lignesDe(x.cid);
      expect(l, path).toMatchObject({ route });
      expect(l, path).not.toHaveProperty('orderId');
      expect(l, path).not.toHaveProperty('groupId');
      expect(l, path).not.toHaveProperty('quoteId');
    }
  }, 60_000);

  it('an unknown path is « unmatched », and a method outside the known set is « OTHER »', async () => {
    const u = await appel('/zz/nowhere');
    expect(u.status).toBe(404);
    const [lu] = await lignesDe(u.cid);
    expect(lu).toMatchObject({ route: 'unmatched', method: 'GET', status: 404 });
    const m = await appel('/health', { method: 'PROPFIND' });
    const [lm] = await lignesDe(m.cid);
    expect(lm).toMatchObject({ method: 'OTHER' });
  }, 60_000);

  it('levels: a 5xx is error · a 401, 403, 413 or 429 is warn · every other answer is info', async () => {
    const indispo = await appel('/listes/qx-niveau-liste');
    expect(indispo.status).toBe(503);
    expect((await lignesDe(indispo.cid))[0]).toMatchObject({ level: 'error', status: 503, route: '/listes/:liste' });

    const sansCle = await appel('/checkout/dlq');
    expect(sansCle.status).toBe(401);
    expect((await lignesDe(sansCle.cid))[0]).toMatchObject({ level: 'warn', status: 401 });

    const pasLaSienne = await poste('/storefronts', {
      commandId: 'cmd-jrn-autre', id: 'sf-9999', resellerId: 'rs-9999', shortCode: 'AUTRE-9999',
      name: 'Autre', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-x', at: T0,
    }, S.bearer);
    expect(pasLaSienne.status).toBe(403);
    expect((await lignesDe(pasLaSienne.cid))[0]).toMatchObject({ level: 'warn', status: 403, route: '/storefronts' });

    const gros = await appel('/storefronts', { method: 'POST', headers: { ...S.bearer }, body: 'x'.repeat(70 * 1024) });
    expect(gros.status).toBe(413);
    expect((await lignesDe(gros.cid))[0]).toMatchObject({ level: 'warn', status: 413 });

    const ip = { ...json, 'CF-Connecting-IP': '192.0.2.41' };
    let trop: Reponse | undefined;
    for (let i = 0; i < 3; i += 1) trop = await poste('/buyer/login', { phone: '70000000', password: 'mauvais-mot' }, ip);
    expect(trop!.status).toBe(429);
    expect((await lignesDe(trop!.cid))[0]).toMatchObject({ level: 'warn', status: 429, route: '/buyer/login' });

    const introuvable = await appel('/s/qx-niveau-introuvable');
    expect(introuvable.status).toBe(404);
    expect((await lignesDe(introuvable.cid))[0]).toMatchObject({ level: 'info', status: 404, route: '/s/:slug' });
  }, 60_000);
});

/* ═══════════════════════ (ii) one line per fault ═══════════════════════ */

describe('a delivery that fails writes ONE line per attempt — and nothing about the retry changes', () => {
  it('Boutik+ answers 401: an error line names the outbox, the order, the attempt and the status — the row stays pending', async () => {
    const fin = Date.now() + 10_000;
    let row = (await outboxDe(orderId))['outbox'];
    while ((row?.attempts ?? 0) < 1 && Date.now() < fin) {
      await pause(50);
      row = (await outboxDe(orderId))['outbox'];
    }
    expect(row?.status).toBe('pending');
    const tentatives = row?.attempts ?? 0;
    expect(tentatives).toBeGreaterThanOrEqual(1);
    // The far side really said 401 — the line reports what it answered, not a guess.
    expect(appelsBoutik.some((a) => a.path === '/fulfillment/order-confirmed' && a.status === 401)).toBe(true);

    const filtre = (l: Ligne): boolean => l['msg'] === 'outbox_undelivered' && l['outbox'] === 'order-confirmed-outbox' && l['orderId'] === orderId;
    const mine = await attendreLignes(filtre, tentatives);
    expect(mine.map((l) => l['attempts'])).toEqual(Array.from({ length: tentatives }, (_, i) => i + 1));
    expect(mine[0]).toEqual({
      ts: expect.any(String),
      level: 'error',
      correlation_id: `corr-${orderId}`,
      service: SERVICE,
      msg: 'outbox_undelivered',
      outbox: 'order-confirmed-outbox',
      orderId,
      attempts: 1,
      status: 401,
    });
    // Unchanged behaviour: still pending, the attempt counted once per line.
    expect((await outboxDe(orderId))['outbox']?.status).toBe('pending');
  }, 60_000);

  it('a wire with nothing configured on this side says so, by name, on every attempt (Séra intake, custody arm)', async () => {
    for (const outbox of ['sera-funding-outbox', 'custody-arm-outbox']) {
      const [l] = await attendreLignes((x) => x['msg'] === 'outbox_undelivered' && x['outbox'] === outbox && x['orderId'] === orderId);
      expect(l, outbox).toEqual({
        ts: expect.any(String), level: 'error', correlation_id: `corr-${orderId}`, service: SERVICE,
        msg: 'outbox_undelivered', outbox, orderId, attempts: 1, reason: 'not_configured',
      });
    }
  }, 60_000);

  /**
   * These faults cannot be made to happen under Miniflare without replacing
   * app code (a storage `setAlarm` that throws; a same-Worker object that
   * throws mid-call), which would make the walk prove nothing. So their CALL
   * SITES are asserted instead: no re-arm failure and no best-effort helper
   * swallows its fault without writing the line.
   */
  it('no alarm re-arm failure is dropped without its line, in the order and payment-group objects', () => {
    // One level of nested parentheses inside the call: `setAlarm(Date.now())`.
    const appelArme = String.raw`setAlarm\((?:[^()]|\([^()]*\))*\)`;
    for (const [file, sites] of [['worker/order-do.ts', 16], ['worker/payment-group-do.ts', 1]] as const) {
      const src = readFileSync(file, 'utf8');
      expect(src.match(new RegExp(`${appelArme}\\.catch\\(\\(\\) => undefined\\)`, 'g')) ?? [], file).toEqual([]);
      expect((src.match(new RegExp(`${appelArme}\\.catch\\(\\(e\\) => this\\.rearmeEchoue\\(e\\)\\)`, 'g')) ?? []).length, file).toBe(sites);
    }
  });

  it('the four best-effort helpers each write a warn line where they swallow a fault', () => {
    const corps = (src: string, nom: string): string => {
      const debut = src.indexOf(`async function ${nom}(`);
      expect(debut, nom).toBeGreaterThanOrEqual(0);
      return src.slice(debut, src.indexOf('\n}\n', debut));
    };
    const index = readFileSync('worker/index.ts', 'utf8');
    const order = readFileSync('worker/order-do.ts', 'utf8');
    for (const [src, nom] of [[index, 'mirrorDispatchRow'], [index, 'mirrorDispatchRows'], [index, 'mirrorReservationReceipt'], [order, 'parkPoison']] as const) {
      const c = corps(src, nom);
      const prises = c.split('} catch {');
      expect(prises.length - 1, nom).toBe(0);
      expect(c, nom).toMatch(/\} catch \(e\) \{[^}]*\.warn\(/);
    }
  });
});

/* ═══════════════════ (ii b) a request that throws ═══════════════════ */

describe('a request that throws writes ONE error line — and the caller still gets the runtime’s own failure', () => {
  // The same bundle, with no dispatch index bound: the dispatch list reaches
  // for it unguarded once the ops key is accepted, so the app itself throws a
  // real TypeError. Nothing is stubbed.
  const siennes: string[] = [];
  let sansIndex: Miniflare;
  beforeAll(() => {
    sansIndex = new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      bindings: { CHECKOUT_OPS_SECRET: OPS_SECRET },
      structuredWorkerdLogs: true,
      handleStructuredLogs: ({ message }) => {
        siennes.push(message);
      },
    });
  });
  afterAll(async () => {
    await sansIndex?.dispose();
  });

  it('GET /checkout/dispatch with the ops key: one error line by error name, and the exception reaches the caller unchanged', async () => {
    const cid = 'corr-balai-jette-0001';
    const res = await sansIndex.dispatchFetch('http://c/checkout/dispatch', {
      headers: { Authorization: `Bearer ${OPS_SECRET}`, 'x-correlation-id': cid },
    });
    const corps = await res.text();
    expect(res.status).toBe(500);
    // The exception's own message is what the runtime answers with; the
    // service's catch writes only the error's NAME, and only to its log — a
    // 500 it made itself could never carry this text.
    expect(corps).toMatch(/^TypeError: Cannot read properties of undefined \(reading 'get'\)/);

    const fin = Date.now() + 6_000;
    const lesSiennes = (): Ligne[] => siennes.map(safeJson).filter((l) => l['correlation_id'] === cid);
    while (lesSiennes().length < 1 && Date.now() < fin) await pause(25);
    await pause(200);
    expect(lesSiennes()).toEqual([
      {
        ts: expect.any(String),
        level: 'error',
        correlation_id: cid,
        service: SERVICE,
        msg: 'request',
        route: '/checkout/dispatch',
        method: 'GET',
        status: 500,
        durationMs: expect.any(Number),
        error: 'TypeError',
      },
    ]);
  }, 60_000);
});

/* ═══════════════════ (iii) nothing a person typed or owns ═══════════════════ */

/** A number is matched only as a whole value, so a uuid's hex digits never false-match an amount. */
function porteSentinelle(message: string, s: string | number): boolean {
  if (typeof s === 'number') return new RegExp(`(?<![0-9A-Za-z-])${s}(?![0-9A-Za-z-])`).test(message);
  return message.includes(s);
}

const QUERY = '?q=QXQUERY&page=QXPAGE';
const ENTETES = {
  'User-Agent': 'QXAGENT/9.1',
  'CF-Connecting-IP': '203.0.113.77',
  'X-Forwarded-For': '198.51.100.23',
  Cookie: 'qx=QXCOOKIE',
  Referer: 'https://qxreferer.example/',
};

/** Every request the sweep sent, by correlation id. */
const balayage: string[] = [];
let sessionAcheteuse = '';

describe('no line ever carries a person’s data, a code, a token, a secret, a body, a query, an address or an amount', () => {
  beforeAll(async () => {
    const avec = (h: Record<string, string> = {}): Record<string, string> => ({ ...ENTETES, ...h });
    const envoyer = async (path: string, init: RequestInit = {}): Promise<Reponse> => {
      const r = await appel(path, { ...init, headers: avec(init.headers as Record<string, string> | undefined) });
      balayage.push(r.cid);
      return r;
    };
    const envoyerJson = (path: string, body: unknown, h: Record<string, string> = {}): Promise<Reponse> =>
      envoyer(path, { method: 'POST', headers: { ...json, ...h }, body: JSON.stringify(body) });

    // Paths that carry her name, her account digits, a liste token, a media key, the buyer's map, a typed id.
    await envoyer(`/s/qxslug-4821${QUERY}`);
    await envoyer(`/s/${B.slug}${QUERY}`);
    await envoyer(`/storefronts/${encodeURIComponent(B.id)}${QUERY}`, { headers: { Authorization: S.bearer.Authorization } });
    await envoyer('/storefronts/QXBOUTIQUE/identity', { method: 'POST', headers: { ...S.bearer }, body: JSON.stringify({ name: 'QXNOMBOUTIQUE' }) });
    await envoyer(`/listings/by-pid/QXSF/QXPID2${QUERY}`);
    await envoyer(`/tiles/17/6543217/1234567.png${QUERY}`);
    await envoyer(`/listes/QXLISTE${QUERY}`);
    await envoyer('/listes/QXLISTE', { method: 'HEAD' });
    await envoyerJson('/listes/QXLISTE/fermer', { editCle: 'QXCLE' });
    await envoyer(`/media/cover/QXMEDIA.png?v=petite&k=QXQUERY`);
    await envoyer(`/media/upload?kind=cover&storefrontId=QXSFUP`, { method: 'POST', body: 'QXOCTETS' });
    await envoyer(`/checkout/order/22671935284/suivi${QUERY}`);
    await envoyer(`/checkout/order/${encodeURIComponent(orderId)}/remise`, { headers: { Authorization: `Bearer ${jeton}` } });
    await envoyer(`/checkout/order/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${jeton}` } });
    await envoyer(`/checkout/order/${encodeURIComponent(orderId)}/liste-merci`, { headers: { Authorization: 'Bearer QXJETON' } });
    await envoyer(`/checkout/webhook/leg-key/QXLEG`);
    await envoyer(`/orders/QXORD/related-party${QUERY}`);
    await envoyerJson('/checkout/dispatch/QXDISP/refusal', { outcome: 'QXISSUE' });
    await envoyer(`/checkout/gains${QUERY}`);
    await envoyer(`/reseller/suivi${QUERY}`, { headers: { Authorization: S.bearer.Authorization } });
    await envoyerJson('/reseller/ventes/QXVENTE/contester', { texte: 'QXTEXTE' }, { Authorization: S.bearer.Authorization });
    await envoyer(`/zz/QXINCONNU${QUERY}`);
    await envoyer(`/health?pbkdf2=QXSONDE`);
    await envoyer('/checkout/quote', { method: 'OPTIONS' });
    // Bodies: accounts, a quote, a webhook with a money figure in it.
    const inscrite = await envoyerJson('/buyer/signup', {
      firstName: 'Qxprenom', lastName: 'Qxnomdefamille', email: 'qxmail@example.bf', phone: '+226 76 54 32 19', password: 'qx-mot-de-passe-77',
    });
    sessionAcheteuse = String(inscrite.json['session'] ?? '');
    await envoyerJson('/buyer/login', { phone: '+226 76 54 32 19', password: 'qx-mot-de-passe-77' });
    await envoyerJson('/reseller/signup', { name: 'Qxrevendeuse', email: 'qxrev@example.bf', phone: '+226 75 31 13 57', password: 'qx-rev-passe-77' });
    await envoyerJson('/reseller/login', { email: 'qxrev@example.bf', password: 'qx-mauvais-passe' });
    await envoyerJson('/checkout/quote', {
      slug: 'qxslug-4821', pid: 'QXPIDQUOTE', paymentMode: 'FULL_PREPAY', zoneTo: 'Qxzone Tampouy',
      attributionResellerId: S.accountId, requestKey: 'rk-qx-sentinelle-0001',
    });
    await envoyerJson('/checkout/webhook/payment', { payload: { amount: 73_951, order_id: 'QXORDER' } }, { 'X-Payment-Webhook-Key': 'QXMAUVAISECLE' });
    // The doors that carry a person's data and are not walked above. None has
    // a path parameter (a typed segment would make it another route), so each
    // sentinel rides the query, the headers and the body.
    await envoyerJson('/listes?de=QXLISTEQ', { titre: 'QXLISTETITRE', prenom: 'Qxlisteprenom', telephone: '+226 72 84 61 39', pids: ['QXLISTEPID'] });
    await envoyerJson('/checkout/group?ref=QXGROUPEQ', {
      quoteIds: ['QXGROUPEQUOTE'], holderRef: 'QXGROUPEHOLDER', commandId: 'QXGROUPECMD',
      contact: { phone: '+226 78 46 93 15', quartier: 'Qxgroupequartier', repere: 'Qxgrouperepere' },
    });
    // Her own session, so her profile door reads the body rather than refusing at the bearer.
    await envoyerJson('/buyer/profile?x=QXPROFILQ', {
      firstName: 'Qxprofilprenom', lastName: 'Qxprofilnom', email: 'qxprofil@example.bf',
    }, { Authorization: `Bearer ${sessionAcheteuse}` });
    await envoyerJson('/fulfillment/progress?o=QXPROGQ', {
      orderId: 'QXPROGORDER', event: 'QXPROGEVENT', note: 'QXPROGNOTE', phone: '+226 73 62 95 18',
    }, { Authorization: 'Bearer QXPROGCLE' });
    // The real webhook key: these two bodies are read and refused by the order road, not stopped at the door.
    for (const [porte, nom, sentinelle, montant] of [
      ['door', 'payment.door_leg_confirmed.v1', 'QXPORTE', 64_829],
      ['refund', 'payment.refund_confirmed.v1', 'QXREMB', 58_317],
    ] as const) {
      await envoyerJson(`/checkout/webhook/${porte}?w=${sentinelle}Q`, {
        name: nom,
        envelope: {
          command_id: `${sentinelle}CMD`, correlation_id: `corr-balai-${porte}-env`, aggregateVersion: 1,
          actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1',
        },
        payload: {
          provider: `${sentinelle}PROV`, payment_attempt_id: `${sentinelle}LEG`, collectRef: `${sentinelle}COLLECT`,
          amount: montant, fee: 0, status: 'held', order_id: `${sentinelle}ORDER`, redelivery: false,
        },
      }, { 'X-Payment-Webhook-Key': WEBHOOK_SECRET });
    }
    // « OggS » opens the bytes, so the upload is taken as a voice note and goes on to be stored and pointed.
    await envoyer(`/media/upload?kind=voice&storefrontId=${encodeURIComponent(B.id)}&pid=QXVOIXPID&durationMs=4000`, {
      method: 'POST', headers: { ...S.octets('audio/ogg') }, body: 'OggSQXVOIXOCTETS',
    });
  }, 120_000);

  it('every request of the sweep wrote its one line (so the check below is never a check of an empty log)', async () => {
    for (const cid of balayage) {
      const mine = await lignesDe(cid);
      expect(mine, cid).toHaveLength(1);
    }
  }, 60_000);

  it('no captured line — request or fault — holds any sentinel, any secret, any amount or any account id', async () => {
    // The paid order's wires have had their first attempt (their lines are part of what is checked).
    await attendreLignes((l) => l['msg'] === 'outbox_undelivered' && l['orderId'] === orderId);
    const sentinelles: (string | number)[] = [
      // the buyer at the door
      '71935284', '71 93 52 84', 'Qxquartier', 'Qxrepere', '12.3714277', '1.5196603', CONTACT.audioB64, 'QXVOIX',
      // her codes, keys and the provider's references
      jeton, legKey, `collect-${orderId}`, `whk-${orderId}`, 'QXJETON', 'QXCLE', 'QXCOOKIE',
      // the reseller: her account, her shop, her session, her sign-up
      S.accountId, B.id, B.slug, B.shortCode, S.session, 'Qxdjeneba', 'Traor', '@example.bf',
      // accounts typed at the doors
      'Qxprenom', 'Qxnomdefamille', 'qxmail', '76543219', '76 54 32 19', 'qx-mot-de-passe', 'Qxrevendeuse', 'qxrev', '75311357', 'qx-rev-passe', 'qx-mauvais-passe',
      // paths, queries, headers, bodies
      'qxslug', 'QXQUERY', 'QXPAGE', 'QXAGENT', '203.0.113.77', '198.51.100.23', 'qxreferer', 'QXBOUTIQUE', 'QXNOMBOUTIQUE', 'QXSF', 'QXPID',
      '6543217', '1234567', 'QXLISTE', 'QXMEDIA', 'QXSFUP', 'QXOCTETS', '22671935284', 'QXLEG', 'QXORD', 'QXDISP', 'QXISSUE', 'QXVENTE',
      'QXTEXTE', 'QXINCONNU', 'QXSONDE', 'Qxzone', 'rk-qx-sentinelle', 'rk-jrn-', 'holder-jrn', 'QXORDER', 'QXMAUVAISECLE',
      // the liste, group, profile, progress, door, refund and voice doors
      'Qxlisteprenom', '72846139', '72 84 61 39', 'QXGROUPE', 'Qxgroupequartier', 'Qxgrouperepere', '78469315', '78 46 93 15',
      'QXPROFIL', 'Qxprofilprenom', 'Qxprofilnom', 'qxprofil', 'QXPROG', '73629518', '73 62 95 18',
      'QXPORTE', 'QXREMB',
      // the secrets this Worker and its neighbours hold
      WEBHOOK_SECRET, SUPPLY_SECRET, OPS_SECRET, BOUTIK_FULFILL_SECRET,
      // money
      BASE, COMMISSION, MARKUP, BASE + MARKUP, amountPaid, 73_951, 64_829, 58_317,
    ];
    if (sessionAcheteuse !== '') sentinelles.push(sessionAcheteuse);
    const fautes: string[] = [];
    for (const message of recus) {
      for (const s of sentinelles) if (s !== '' && porteSentinelle(message, s)) fautes.push(`${String(s)} ⟵ ${message}`);
    }
    expect(fautes).toEqual([]);
    // Never a pass on a near-empty log: every swept request and more were written.
    expect(recus.length).toBeGreaterThan(balayage.length);
  }, 60_000);

  it('every line is one JSON object with its level, its service, its message and a correlation id', () => {
    for (const message of recus) {
      const l = safeJson(message);
      expect(typeof l['correlation_id'], message).toBe('string');
      expect(l['service'], message).toBe(SERVICE);
      expect(['info', 'warn', 'error'], message).toContain(l['level']);
      expect(typeof l['msg'], message).toBe('string');
    }
  });
});

/* ═══════════════════ (iv) what Workers Logs keeps ═══════════════════ */

describe('Workers Logs keeps this service’s own lines and nothing else (wrangler.toml, read by wrangler itself)', () => {
  it('every request is sampled, query strings are cut, and the per-request invocation log (raw URL) is off', () => {
    const cfg = unstable_readConfig({ config: 'wrangler.toml' });
    expect(cfg.observability).toEqual({
      enabled: true,
      head_sampling_rate: 1,
      redact_query_string: true,
      logs: { invocation_logs: false },
    });
  });
});
