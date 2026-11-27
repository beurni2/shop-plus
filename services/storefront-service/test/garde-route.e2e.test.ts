import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { PlatformEventSchema } from '@platform/contracts';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeSandboxConfirmation } from '../../../scripts/sandbox-payment-confirm.mjs';
import { OPS_SECRET, seance } from './seance';

/**
 * ═══ GARDE-ROUTE — the buyer's code reaches custody in time, an order that
 *     will never travel stops calling custody, and a stalled Séra intake
 *     stalls nothing else ═══
 *
 * Shop-Plus-Build-Spec §5.5: « … rider verify → custody seal → custody →
 * transit → buyer inspection → … → custody→customer (drop code last) ». The
 * code must be in custody's hands before the rider is at her door.
 * Execution Contract §3: « A mock is not trustworthy until it misbehaves like
 * the real service … simulate timeouts · simulate partial failures · reject
 * invalid state transitions ».
 *
 * The real combined Worker under Miniflare. Every outcome is asked of the
 * order's own record (`/entry/outbox`, `/entry/audit`) or of what custody
 * actually received — never of the answer to the act.
 *
 * ⚠ THE CUSTODY STAND-IN MISBEHAVES LIKE THE REAL DOOR — certified against
 * Séra main 5163e32:
 *   · `services/custody-service/worker/index.ts` :311-431 — the produce-shop
 *     router checks the Bearer (401), then the body (400 `malformed`), BEFORE
 *     the order's file is consulted;
 *   · `services/custody-service/worker/custody-do.ts` :1998-2001 —
 *     `if (this.chain === null || this.spine === null) return
 *     Response.json({ ok: false, reason: 'order_not_open' }, { status: 409 });`
 *     sits BEFORE `/secrets/arm` (:2010), `/door-reference` (:2772) and
 *     `/door-signal` (:2811): until the course's file is opened
 *     (`/order/open` :1814, by Séra at assignment) all three doors answer it;
 *   · :2045 — a successful arm is `{ ok: true, status: 'armed', kind }` 200.
 * So here a file exists only once the test opens it (`ouvrir(orderId)`), the
 * way Séra opens it at pickup — and `panne` is a custody outage (500), a
 * partial failure the real door can have.
 *
 * ⚠ SÉRA'S INTAKE IS A REAL HTTP ORIGIN (a local node server the Worker's own
 * fetch calls). In `fige` mode it accepts the connection and NEVER answers —
 * the timeout the contract says a mock must be able to simulate.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'garde-route-'));
const T0 = '2026-11-27T08:00:00.000Z';

const WEBHOOK_SECRET = 'test-payment-webhook-secret-gr001';
const BOUTIK_SECRET = 'test-progress-boutik-secret-gr001';
const SERA_SECRET = 'test-progress-sera-secret-gr001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-gr001';
const ARM_SECRET = 'test-shop-arm-secret-gr001';
const SUPPLY_SECRET = 'test-supply-read-secret-gr001';
const INTAKE_SECRET = 'test-sera-intake-secret-gr001';
const signe = { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET };

/** The arm fact's kind, assembled at runtime (the exposure gate scans for the literal). */
const ARM_KIND = ['buyer', 'drop', 'code'].join('_');

/** Two articles from ONE supplier (a package when bought together); either sells alone too. */
const SUPPLY = [
  { productVersionId: 'pv-gr-a', offerVersion: 'ov-gr-a', basePrice: 10_000, resellerCommission: 1_000, supplier: 'sup-gr-1', productName: 'Bazin riche' },
  { productVersionId: 'pv-gr-b', offerVersion: 'ov-gr-b', basePrice: 7_000, resellerCommission: 700, supplier: 'sup-gr-1', productName: 'Sac en cuir' },
].map((v) => ({ ...v, available: 30, assetRefs: [] as string[], category: 'fashion_bags_fabrics', sellerTier: 'verified' }));
const PANIER = ['pv-gr-a', 'pv-gr-b'];

/* ─────────────────────────── custody, as the real door ─────────────────────────── */

/** Orders whose custody file Séra has opened. Absent ⇒ every produce-shop door answers `order_not_open`. */
const dossiers = new Set<string>();
/** Orders for which custody is down (500) — an outage, not a refusal. */
const enPanne = new Set<string>();
/** Every act custody's doors received, with the answer each gave, in order. */
const custodyActs: { path: string; orderId: string; status: number; body: Record<string, unknown> }[] = [];
/** The references each open file was told, per order. */
const declared = new Map<string, Set<string>>();

const ouvrir = (orderId: string): void => {
  dossiers.add(orderId);
};
const actes = (orderId: string, path: string) => custodyActs.filter((a) => a.orderId === orderId && a.path === path);
const ARM = '/produce-shop/secrets/arm';
const REF = '/produce-shop/door-reference';
const SIGNAL = '/produce-shop/door-signal';

async function custody(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method !== 'POST' || (path !== ARM && path !== REF && path !== SIGNAL)) {
    return Response.json({ status: 'not_found' }, { status: 404 });
  }
  // The router, first: the Bearer, then the shape — before any file is consulted.
  if (request.headers.get('Authorization') !== `Bearer ${ARM_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body['orderId'] !== 'string' || body['orderId'] === '' || (body['orderId'] as string).length > 256) {
    return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
  }
  const orderId = body['orderId'] as string;
  const answer = (status: number, payload: unknown): Response => {
    custodyActs.push({ path, orderId, status, body });
    return Response.json(payload, { status });
  };
  if (path === ARM) {
    if (
      Object.keys(body).sort().join(',') !== 'command_id,kind,orderId,secret' ||
      typeof body['command_id'] !== 'string' || body['command_id'] === '' || (body['command_id'] as string).length > 256 ||
      body['kind'] !== ARM_KIND ||
      typeof body['secret'] !== 'string' || !/^\d{6}$/.test(body['secret'] as string)
    ) {
      return answer(400, { ok: false, reason: 'malformed' });
    }
  }
  if (path === REF) {
    const [commandId, reference] = [body['command_id'], body['reference']];
    if (typeof commandId !== 'string' || commandId === '' || commandId.length > 256 || typeof reference !== 'string' || reference === '' || reference.length > 256) {
      return answer(400, { ok: false, reason: 'malformed' });
    }
  }
  if (enPanne.has(orderId)) return answer(500, { ok: false });
  // custody-do.ts :1998-2001 — no file, no door.
  if (!dossiers.has(orderId)) return answer(409, { ok: false, reason: 'order_not_open' });
  if (path === ARM) return answer(200, { ok: true, status: 'armed', kind: body['kind'] });
  if (path === REF) {
    const refs = declared.get(orderId) ?? new Set<string>();
    const duplicate = refs.has(body['reference'] as string);
    refs.add(body['reference'] as string);
    declared.set(orderId, refs);
    return answer(200, { ok: true, duplicate });
  }
  const payload = ((body['event'] as { payload?: Record<string, unknown> } | undefined)?.payload ?? {}) as Record<string, unknown>;
  const ref = payload['order_id'];
  const sienne = ref === orderId || (typeof ref === 'string' && (declared.get(orderId)?.has(ref) ?? false));
  if (!sienne) return answer(409, { ok: false, reason: 'door_signal_not_awaited' });
  return answer(200, { ok: true, duplicate: false });
}

/* ─────────────────────────── Séra's intake, a real origin ─────────────────────────── */

let intakeMode: 'ok' | 'fige' = 'ok';
/** Every funding or cancel fact the intake received, in order. */
const intakeFacts: { orderId: string; status: string }[] = [];
let intake: Server;
let intakeBase = '';
const sockets = new Set<Socket>();

function intakeHandler(req: IncomingMessage, res: ServerResponse): void {
  let raw = '';
  req.on('data', (c: Buffer) => { raw += c.toString('utf8'); });
  req.on('end', () => {
    if (intakeMode === 'fige') return; // accepted, never answered
    if (req.headers.authorization !== `Bearer ${INTAKE_SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"unauthorized"}');
      return;
    }
    const fact = (() => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; } })();
    intakeFacts.push({ orderId: String(fact['orderId']), status: String(fact['status']) });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, orderId: fact['orderId'], applied: true }));
  });
}

/* ─────────────────────────── Boutik+, quiet ─────────────────────────── */

/** Every refused-course relay Boutik+ received (the alarm flushes it). */
const refusRelais: string[] = [];

async function offer(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === 'POST' && path === '/fulfillment/order-confirmed') return Response.json({ ok: true, status: 'registered' });
  if (request.method === 'POST' && path === '/fulfillment/delivered') return Response.json({ ok: true, status: 'delivered' });
  if (request.method === 'POST' && path === '/fulfillment/delivery-refused') {
    if (request.headers.get('Authorization') !== `Bearer ${FULFILL_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const parsed = PlatformEventSchema.safeParse(await request.json().catch(() => null));
    const orderId = parsed.success ? (parsed.data.payload as Record<string, unknown>)['order_id'] : undefined;
    if (!parsed.success || parsed.data.name !== 'delivery.refused.v1' || typeof orderId !== 'string') {
      return Response.json({ ok: false, reason: 'event_not_canonical' }, { status: 400 });
    }
    refusRelais.push(orderId);
    return Response.json({ ok: true, status: 'no_restock', faultClass: 'seller' });
  }
  if (path === '/supply-grouping') {
    if (request.headers.get('Authorization') !== `Bearer ${SUPPLY_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const ids = ((await request.json().catch(() => null)) as { productVersionIds?: string[] } | null)?.productVersionIds ?? [];
    const groupes = new Map<string, string[]>();
    for (const id of ids) {
      const f = SUPPLY.find((v) => v.productVersionId === id)?.supplier ?? id;
      groupes.set(f, [...(groupes.get(f) ?? []), id]);
    }
    return Response.json({ groups: [...groupes.values()] });
  }
  const single = /^\/supply-projection\/([^/]+)$/.exec(path);
  if (single) {
    const v = SUPPLY.find((x) => x.productVersionId === decodeURIComponent(single[1]!));
    if (v === undefined) return Response.json({ status: 'not_found' }, { status: 404 });
    const { supplier: _cache, ...value } = v;
    return Response.json({ version: 1, asOf: new Date().toISOString(), value });
  }
  if (request.method === 'POST' && /hold|release/.test(path)) {
    return Response.json({ status: 'held', expiresAt: new Date(Date.now() + 120_000).toISOString() });
  }
  return Response.json({ status: 'not_found' }, { status: 404 });
}

let mf: Miniflare;

beforeAll(async () => {
  intake = createServer(intakeHandler);
  intake.on('connection', (s: Socket) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => intake.listen(0, '127.0.0.1', resolve));
  const addr = intake.address();
  if (addr === null || typeof addr === 'string') throw new Error('setup: intake address');
  intakeBase = `http://127.0.0.1:${addr.port}`;
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO', ORDER: 'OrderDO',
      ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO', PAYMENT_GROUP: 'PaymentGroupDO',
    },
    durableObjectsPersist: persist,
    bindings: {
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      CHECKOUT_OPS_SECRET: OPS_SECRET,
      PROGRESS_WRITE_SECRET: BOUTIK_SECRET,
      SERA_PROGRESS_SECRET: SERA_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      SHOP_ARM_SECRET: ARM_SECRET,
      SUPPLY_READ_SECRET: SUPPLY_SECRET,
      SERA_INTAKE_BASE: intakeBase,
      SERA_INTAKE_SECRET: INTAKE_SECRET,
    },
    serviceBindings: { OFFER: offer, CUSTODY: custody },
  });
});

afterAll(async () => {
  await mf?.dispose();
  for (const s of sockets) s.destroy();
  await new Promise<void>((resolve) => intake.close(() => resolve()));
  rmSync(persist, { recursive: true, force: true });
});

/* ─────────────────────────────── the harness ─────────────────────────────── */

function safeJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

async function call(path: string, init: RequestInit = {}) {
  const res = await mf.dispatchFetch(`http://c${path}`, init);
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}
const post = (path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  call(path, { method: 'POST', headers, body: JSON.stringify(body) });

async function doDe(orderId: string, path: string): Promise<Record<string, unknown>> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  return safeJson(await (await ns.get(ns.idFromName(orderId)).fetch(`https://do${path}`)).text());
}

interface Rang { status?: string; attempts?: number; reason?: string; abandonedAt?: string; deliveredAt?: string; outcome?: string }
interface Boite {
  custodyArm?: Rang;
  seraOutbox?: Rang;
  doorSignal?: Rang;
  doorReferences?: Record<string, Rang>;
}
const boite = async (orderId: string) => (await doDe(orderId, '/entry/outbox')) as Boite;

async function jusqua<T>(lire: () => Promise<T> | T, ok: (v: T) => boolean, timeoutMs = 8_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let v = await lire();
  while (!ok(v) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    v = await lire();
  }
  return v;
}

let keySeq = 0;
const rk = (): string => `rk-gr-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

type Mode = 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';

let shopSeq = 0;
async function boutique(n: string): Promise<{ slug: string; resellerId: string }> {
  const S = await seance(mf, `gr${n}`);
  const shortCode = `GR-${String((shopSeq += 1)).padStart(4, '0')}`;
  const created = await post('/storefronts', {
    commandId: `cmd-create-gr-${n}`, id: `sf-gr-${n}`, resellerId: S.accountId, shortCode,
    name: 'Boutique de Aïcha', zone: 'Ouagadougou', category: 'Général', correlationId: `corr-gr-${n}`, at: T0,
  }, S.bearer);
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${created.text}`);
  await post(`/storefronts/sf-gr-${n}/publish`, { correlationId: 'corr-en-ligne' }, S.bearer);
  for (const [i, v] of SUPPLY.entries()) {
    const pub = await post('/listings', {
      commandId: `cmd-listing-gr-${n}-${i}`, listingId: `lst-gr-${n}-${i}`, storefrontId: `sf-gr-${n}`,
      resellerId: S.accountId, productVersionId: v.productVersionId, offerVersion: v.offerVersion,
      markup: 500, correlationId: `corr-gr-${n}`, at: T0,
    }, S.bearer);
    if (pub.json['status'] !== 'published') throw new Error(`setup: listing ${pub.text}`);
  }
  return { slug: shortCode.toLowerCase(), resellerId: S.accountId };
}

async function devis(shop: { slug: string; resellerId: string }, pid: string, mode: Mode, panier?: string[]) {
  const res = await post('/checkout/quote', {
    slug: shop.slug, pid, paymentMode: mode, zoneTo: 'Ouagadougou', attributionResellerId: shop.resellerId,
    requestKey: rk(), ...(panier !== undefined ? { panier } : {}),
  });
  if (res.status !== 200) throw new Error(`setup: quote ${res.status} ${res.text}`);
  return res.json as { quoteId: string; amountPaidAtCheckout: number; amountDueAtDelivery: number };
}

async function reserver(quoteId: string, holderRef: string): Promise<void> {
  const res = await post(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, { commandId: `rsv-${rk()}`, holderRef });
  if (res.status !== 200) throw new Error(`setup: reserve ${res.status} ${res.text}`);
}

/** One article, alone, paid whole at checkout — the orderId and HER token. Custody's file is
 *  opened first when `dossierOuvert`, the way a course already admitted would have it. */
async function commandePayee(n: string, opts: { dossierOuvert?: boolean } = {}): Promise<{ orderId: string; jeton: string }> {
  const shop = await boutique(n);
  const q = await devis(shop, 'pv-gr-a', 'FULL_PREPAY');
  const holderRef = `holder-gr-${n}`;
  await reserver(q.quoteId, holderRef);
  const orderId = `ord-${q.quoteId}`;
  if (opts.dossierOuvert === true) ouvrir(orderId);
  const ordered = await post('/checkout/order', {
    quoteId: q.quoteId, holderRef, commandId: `cmd-order-gr-${n}`,
    contact: { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'près du marché' },
  });
  if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status} ${ordered.text}`);
  const jeton = ordered.json['buyerRef'];
  if (typeof jeton !== 'string') throw new Error('setup: no buyer token');
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({
    orderId, paymentAttemptId: ((await doDe(orderId, '/entry/audit'))['legKeys'] as Record<string, string>)['checkout']!,
    amount: q.amountPaidAtCheckout, correlationId: `corr-${orderId}`, requestedAtIso: T0,
  });
  const paid = await post('/checkout/webhook/payment', provider.webhookDeliveryPlan()[0]!.event, signe);
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${paid.text}`);
  return { orderId, jeton };
}

const sera = (path: string, body: unknown) =>
  post(path, body, { 'Content-Type': 'application/json', Authorization: `Bearer ${SERA_SECRET}` });
const boutik = (body: unknown) =>
  post('/fulfillment/progress', body, { 'Content-Type': 'application/json', Authorization: `Bearer ${BOUTIK_SECRET}` });

const rejete = (orderId: string) => ({
  name: 'fulfillment.rejected.v1',
  envelope: { command_id: `fulfillment-rejected-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 2, actor: 'offer-service:fulfillment', serverTime: '2026-11-27T09:00:00.000Z', version: '1' },
  payload: { orderId, at: '2026-11-27T09:00:00.000Z' },
});
const refusee = (orderId: string) => ({
  name: 'delivery.refused.v1',
  envelope: { command_id: `pickup-refusal-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-11-27T10:00:00.000Z', version: '1' },
  payload: { order_id: orderId, task_id: `task-${orderId}`, rejection: 'valid_rejection', fault_class: 'seller' },
});

/* ──────────────────────────────── the walks ──────────────────────────────── */

describe('GARDE-ROUTE — the code crosses as soon as custody can take it', () => {
  it('L1 — custody has no file at payment: the arm is refused and waits; the file opens, the rider leaves, and the code is in custody before he arrives — the code she reads is the one custody holds', async () => {
    const { orderId, jeton } = await commandePayee('L1');

    // Payment confirmed, no file yet: the real door refuses the arm, and the row waits.
    await jusqua(() => actes(orderId, ARM), (a) => a.length >= 1);
    expect(actes(orderId, ARM)[0], 'the first arm met a closed file').toMatchObject({ status: 409 });
    const enAttente = await jusqua(() => boite(orderId), (b) => (b.custodyArm?.attempts ?? 0) >= 1);
    expect(enAttente.custodyArm).toMatchObject({ status: 'pending' });
    expect(enAttente.custodyArm!.attempts).toBeGreaterThanOrEqual(1);
    const avant = actes(orderId, ARM).length;

    // Séra opens the file at pickup; the rider leaves.
    ouvrir(orderId);
    const parti = await sera('/fulfillment/transit', { orderId, stage: 'en_route', asOf: '2026-11-27T11:00:00.000Z' });
    expect(parti.status, parti.text).toBe(200);

    // Within seconds — not at the next rung of the ladder — the arm is tried again and taken.
    const pris = await jusqua(() => actes(orderId, ARM), (a) => a.length > avant && a.at(-1)!.status === 200, 5_000);
    expect(pris.length, 'the arm was tried again after the departure').toBeGreaterThan(avant);
    expect(pris.at(-1)!.status).toBe(200);
    const livre = await jusqua(() => boite(orderId), (b) => b.custodyArm?.status === 'delivered', 2_000);
    expect(livre.custodyArm, 'the record says custody holds the code BEFORE the arrival').toMatchObject({ status: 'delivered' });

    // The rider arrives; what she reads is what custody holds.
    expect((await sera('/fulfillment/transit', { orderId, stage: 'arrivee', asOf: '2026-11-27T11:40:00.000Z' })).status).toBe(200);
    const lu = await call(`/checkout/order/${encodeURIComponent(orderId)}/remise`, { headers: { Authorization: `Bearer ${jeton}` } });
    expect(lu.status, lu.text).toBe(200);
    expect(lu.json['code']).toBe(pris.at(-1)!.body['secret']);
  }, 60_000);
});

describe('GARDE-ROUTE — an order that will never travel stops calling custody', () => {
  it('F1 — the supplier refuses: the arm row is abandoned by name in the same act, and a later alarm pass sends custody nothing more', async () => {
    const { orderId } = await commandePayee('F1');
    await jusqua(() => boite(orderId), (b) => (b.custodyArm?.attempts ?? 0) >= 1);

    expect((await boutik(rejete(orderId))).status).toBe(200);
    // Asked of the record at once: the refusal and the abandon are one write.
    const b = await boite(orderId);
    expect(b.custodyArm).toMatchObject({ status: 'abandoned', reason: 'fournisseur_refuse' });
    expect(typeof b.custodyArm?.abandonedAt).toBe('string');
    const avant = actes(orderId, ARM).length;

    // The alarm runs after the refusal — proven by the cancel fact it carries to Séra…
    await jusqua(() => intakeFacts, (f) => f.some((x) => x.orderId === orderId && x.status === 'cancelled'));
    expect(intakeFacts.some((x) => x.orderId === orderId && x.status === 'cancelled'), 'the alarm ran after the refusal').toBe(true);
    // …and it called custody's arm door no more.
    await new Promise((r) => setTimeout(r, 300));
    expect(actes(orderId, ARM)).toHaveLength(avant);
    expect((await boite(orderId)).custodyArm).toMatchObject({ status: 'abandoned', reason: 'fournisseur_refuse' });
  }, 60_000);

  it('F2 — Séra refuses the course while custody is down: the arm row is abandoned by name, and a later alarm pass sends custody nothing more', async () => {
    const { orderId } = await commandePayee('F2', { dossierOuvert: true });
    enPanne.add(orderId);
    try {
      await jusqua(() => boite(orderId), (b) => (b.custodyArm?.attempts ?? 0) >= 1);
      expect((await boite(orderId)).custodyArm).toMatchObject({ status: 'pending' });

      expect((await sera('/fulfillment/progress', refusee(orderId))).status).toBe(200);
      const b = await boite(orderId);
      expect(b.custodyArm).toMatchObject({ status: 'abandoned', reason: 'course_refusee' });
      expect(typeof b.custodyArm?.abandonedAt).toBe('string');
      const avant = actes(orderId, ARM).length;

      // The alarm runs after the refusal — proven by the relay it carries to Boutik+…
      await jusqua(() => refusRelais, (r) => r.includes(orderId));
      expect(refusRelais, 'the alarm ran after the refusal').toContain(orderId);
      // …and custody's arm door heard nothing more.
      await new Promise((r) => setTimeout(r, 300));
      expect(actes(orderId, ARM)).toHaveLength(avant);
    } finally {
      enPanne.delete(orderId);
    }
  }, 60_000);

  it('F3 — a row custody already took is never touched by a later refusal', async () => {
    const { orderId } = await commandePayee('F3', { dossierOuvert: true });
    const pris = await jusqua(() => boite(orderId), (b) => b.custodyArm?.status === 'delivered');
    expect(pris.custodyArm).toMatchObject({ status: 'delivered' });
    expect((await sera('/fulfillment/progress', refusee(orderId))).status).toBe(200);
    expect((await boite(orderId)).custodyArm, 'byte for byte as custody left it').toEqual(pris.custodyArm);
  }, 60_000);

  it('F4 — a package paid at the door: one article\'s course is refused while its file is closed — its door reference and door signal are abandoned by name; its sibling still travels, untouched', async () => {
    const DOOR: Mode = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
    const shop = await boutique('F4');
    const [qa, qb] = [await devis(shop, 'pv-gr-a', DOOR, PANIER), await devis(shop, 'pv-gr-b', DOOR, PANIER)];
    const holderRef = 'holder-gr-F4';
    for (const q of [qa, qb]) await reserver(q.quoteId, holderRef);
    const paid = await post('/checkout/group', {
      quoteIds: [qa.quoteId, qb.quoteId], holderRef, commandId: 'cmd-colis-gr-F4',
      contact: { phone: '70 44 55 66', quartier: 'Dassasgho', repere: 'la boutique bleue' },
    });
    expect(paid.status, paid.text).toBe(200);
    const groupId = String(paid.json['groupId']);
    const packageId = (paid.json['colis'] as { packageId: string }[])[0]!.packageId;
    const k = await call(`/checkout/webhook/leg-key/${encodeURIComponent(groupId)}?leg=checkout`, { headers: signe });
    expect((await post('/checkout/webhook/payment', composeSandboxConfirmation(groupId, qa.amountPaidAtCheckout + qb.amountPaidAtCheckout, new Date().toISOString(), k.json['legKey']), signe)).status).toBe(200);
    const [oa, ob] = [`ord-${qa.quoteId}`, `ord-${qb.quoteId}`];
    const collectId = `${groupId}-porte-1`;

    // She pays at the door; neither file is open yet, so each reference waits…
    const porte = await post(`/checkout/group/${groupId}/porte`, { packageId, orderIds: [oa, ob], holderRef, commandId: 'cmd-porte-gr-F4' });
    expect(porte.status, porte.text).toBe(200);
    await jusqua(() => [oa, ob].every((id) => actes(id, REF).length >= 1), (ok) => ok);
    const kd = await call(`/checkout/webhook/leg-key/${encodeURIComponent(collectId)}?leg=door`, { headers: signe });
    const provider = new MockPaymentProvider({});
    provider.initiateCharge({ orderId: collectId, paymentAttemptId: String(kd.json['legKey']), amount: qa.amountDueAtDelivery + qb.amountDueAtDelivery, correlationId: `corr-${collectId}`, requestedAtIso: T0, legType: 'door' });
    const event = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
    expect((await post('/checkout/webhook/door', event, signe)).status).toBe(200);
    for (const id of [oa, ob]) {
      const b = await boite(id);
      expect(b.doorReferences?.[collectId], id).toMatchObject({ status: 'pending' });
      expect(b.doorSignal, id).toMatchObject({ status: 'pending' });
    }

    // …and Séra refuses the first article's course.
    expect((await sera('/fulfillment/progress', refusee(oa))).status).toBe(200);
    const a = await boite(oa);
    expect(a.doorReferences?.[collectId]).toMatchObject({ status: 'abandoned', reason: 'course_refusee' });
    expect(a.doorSignal).toMatchObject({ status: 'abandoned', reason: 'course_refusee' });
    expect(a.custodyArm).toMatchObject({ status: 'abandoned', reason: 'course_refusee' });
    const [refAvant, sigAvant] = [actes(oa, REF).length, actes(oa, SIGNAL).length];

    // The sibling still travels: nothing of its own was abandoned.
    const b = await boite(ob);
    expect(b.doorReferences?.[collectId]).toMatchObject({ status: 'pending' });
    expect(b.doorSignal).toMatchObject({ status: 'pending' });
    expect(b.custodyArm).toMatchObject({ status: 'pending' });

    // The alarm runs after the refusal (the relay to Boutik+), and the refused article's doors hear nothing more.
    await jusqua(() => refusRelais, (r) => r.includes(oa));
    expect(refusRelais).toContain(oa);
    await new Promise((r) => setTimeout(r, 300));
    expect(actes(oa, REF)).toHaveLength(refAvant);
    expect(actes(oa, SIGNAL)).toHaveLength(sigAvant);
  }, 60_000);
});

describe('GARDE-ROUTE — a Séra intake that never answers stalls nothing else', () => {
  it('H1 — the intake accepts and never answers: the arm still reaches custody within about twelve seconds, and the funding row records ONE failed attempt', async () => {
    intakeMode = 'fige';
    try {
      const t0 = Date.now();
      const { orderId } = await commandePayee('H1', { dossierOuvert: true });
      const pris = await jusqua(() => actes(orderId, ARM), (a) => a.some((x) => x.status === 200), 13_000);
      expect(pris.some((x) => x.status === 200), 'the arm crossed despite the hung intake').toBe(true);
      expect(Date.now() - t0).toBeLessThan(15_000);
      const b = await jusqua(() => boite(orderId), (x) => (x.seraOutbox?.attempts ?? 0) >= 1, 3_000);
      expect(b.seraOutbox).toMatchObject({ status: 'pending', attempts: 1 });
    } finally {
      intakeMode = 'ok';
    }
  }, 60_000);
});
