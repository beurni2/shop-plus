import { OrderConfirmedEventSchema, PlatformEventSchema, splitPackageDeliveryFee } from '@platform/contracts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { composeSandboxConfirmation, composeSandboxRefund } from '../../../scripts/sandbox-payment-confirm.mjs';
import { OPS_SECRET, seance } from './seance';

/**
 * COLIS-FOURNISSEUR-1 (founder rulings 2026-09-23, decisions a–d, « build
 * option 1 ») — ONE PACKAGE AND ONE DELIVERY FEE PER SUPPLIER, on the REAL
 * combined Worker (Miniflare): the quote door, the group doors, the webhook
 * secret gate, CheckoutDO, OrderDO, PaymentGroupDO — none of it stubbed.
 *
 * TWO STAND-INS, each contract-certified to the service it stands for:
 *  · OFFER (Boutik+): the supply read and the confirmed-order intake as every
 *    order suite has them, plus the GROUPING DOOR with Boutik+'s real bounds
 *    (boutik-plus `services/offer-service/test/colis.e2e.test.ts` +
 *    `src/supply-grouping.ts`): POST only, the supply-read Bearer or 401, a
 *    strict `{productVersionIds}` of 2–10 distinct ids or 400, and an answer
 *    that groups the asked ids by supplier in the order asked, an unknown
 *    product alone — never a supplier id.
 *  · CUSTODY (Séra): the arm door records; the door-reference door records
 *    the collection references declared to each article's file (sera
 *    `custody-do.ts` `/door-reference`: `command_id` + `reference`, 200
 *    `{ok, duplicate}`); the door-signal door answers as sera
 *    `custody-spine.ts` consumeDoorPaidSignal decides (COLIS-2): a signal is
 *    this order's only when the provider's event names it by `order_id` or
 *    names a reference declared to it BEFORE — else 409
 *    `door_signal_not_awaited`, the retryable refusal. No article list is
 *    read: a real provider sends none.
 *
 * EVERY OUTCOME IS ASKED OF THE LEDGER — each order's audit and outbox reads,
 * the bytes each wire carried — never of a response alone.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'colis-'));
const WEBHOOK_SECRET = 'test-payment-webhook-secret-colis';
const SUPPLY_SECRET = 'test-supply-read-secret-colis';
const ARM_SECRET = 'test-shop-arm-secret-colis';
const PROGRESS_SECRET = 'test-progress-write-secret-colis';
const T0 = '2026-09-23T08:00:00.000Z';
const signed = { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' };

/** Three articles: the first two leave from ONE supplier, the third from another. */
const SUPPLY = [
  { productVersionId: 'pv-colis-a', offerVersion: 'ov-a', basePrice: 10_000, resellerCommission: 1_000, supplier: 'sup-1', productName: 'Bazin riche' },
  { productVersionId: 'pv-colis-b', offerVersion: 'ov-b', basePrice: 7_000, resellerCommission: 700, supplier: 'sup-1', productName: 'Sac en cuir' },
  { productVersionId: 'pv-colis-c', offerVersion: 'ov-c', basePrice: 4_000, resellerCommission: 400, supplier: 'sup-2', productName: 'Beurre de karité' },
].map((v) => ({ ...v, available: 9, assetRefs: [] as string[], category: 'fashion_bags_fabrics', sellerTier: 'verified' }));

const fulfillmentPosts: unknown[] = [];
const groupingAsks: { auth: string | null; body: unknown }[] = [];
/** COLIS-2 — Boutik+'s grouping door is down (answers 503) while this is set. */
let groupingEnPanne = false;
const armPosts: Record<string, unknown>[] = [];
const doorSignalPosts: Record<string, unknown>[] = [];
/** COLIS-2 — every act on custody, in the order custody heard it. */
const custodyActs: { path: string; orderId: string; reference?: string }[] = [];
/** COLIS-2 — the references each article's custody file was told, per order. */
const declared = new Map<string, Set<string>>();
/** COLIS-2 — orders whose custody file does not exist yet: custody answers 409 `order_not_open`. */
const sansDossier = new Set<string>();

/** Boutik+'s grouping door, with its real bounds. */
function grouping(auth: string | null, body: unknown): Response {
  if (auth !== `Bearer ${SUPPLY_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const ids = (body as { productVersionIds?: unknown } | null)?.productVersionIds;
  if (
    body === null || typeof body !== 'object' || Object.keys(body).join(',') !== 'productVersionIds' ||
    !Array.isArray(ids) || ids.length < 2 || ids.length > 10 || new Set(ids).size !== ids.length ||
    !ids.every((x) => typeof x === 'string' && x !== '')
  ) {
    return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
  }
  const groupes = new Map<string, string[]>();
  const seuls: string[][] = [];
  for (const id of ids as string[]) {
    const f = SUPPLY.find((v) => v.productVersionId === id)?.supplier;
    if (f === undefined) seuls.push([id]);
    else groupes.set(f, [...(groupes.get(f) ?? []), id]);
  }
  return Response.json({ groups: [...groupes.values(), ...seuls] });
}

function makeMf(dir: string, extra: Record<string, string> = {}): Miniflare {
  return new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO', ORDER: 'OrderDO',
    ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', COMPTES: 'ResellerAccountsDO',
    DISPATCH: 'DispatchIndexDO', PAYMENT_GROUP: 'PaymentGroupDO',
  },
  durableObjectsPersist: dir,
  bindings: {
    CHECKOUT_OPS_SECRET: OPS_SECRET,
    FULFILLMENT_WRITE_SECRET: 'test-fulfillment-write-secret-colis',
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    SUPPLY_READ_SECRET: SUPPLY_SECRET,
    SHOP_ARM_SECRET: ARM_SECRET,
    PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
    ...extra,
  },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
        fulfillmentPosts.push(await request.json().catch(() => null));
        return Response.json({ ok: true, status: 'registered' });
      }
      if (path === '/supply-grouping') {
        if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
        const body = await request.json().catch(() => null);
        const auth = request.headers.get('Authorization');
        groupingAsks.push({ auth, body });
        if (groupingEnPanne) return Response.json({ error: 'unavailable' }, { status: 503 });
        return grouping(auth, body);
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
    },
    CUSTODY: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.headers.get('Authorization') !== `Bearer ${ARM_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      if (request.method === 'POST' && path === '/produce-shop/secrets/arm') {
        armPosts.push(body);
        return Response.json({ ok: true, status: 'armed', kind: body['kind'] });
      }
      if (request.method === 'POST' && path === '/produce-shop/door-reference') {
        const [orderId, commandId, reference] = [body['orderId'], body['command_id'], body['reference']];
        if (typeof orderId !== 'string' || typeof commandId !== 'string' || commandId === '' || commandId.length > 256 || typeof reference !== 'string' || reference === '' || reference.length > 256) {
          return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
        }
        custodyActs.push({ path, orderId, reference });
        if (sansDossier.has(orderId)) return Response.json({ ok: false, reason: 'order_not_open' }, { status: 409 });
        const refs = declared.get(orderId) ?? new Set<string>();
        const duplicate = refs.has(reference);
        refs.add(reference);
        declared.set(orderId, refs);
        return Response.json({ ok: true, duplicate });
      }
      if (request.method === 'POST' && path === '/produce-shop/door-signal') {
        doorSignalPosts.push(body);
        custodyActs.push({ path, orderId: String(body['orderId']) });
        const payload = ((body['event'] as { payload?: Record<string, unknown> } | undefined)?.payload ?? {}) as Record<string, unknown>;
        const ref = payload['order_id'];
        const sienne = ref === body['orderId'] || (typeof ref === 'string' && (declared.get(String(body['orderId']))?.has(ref) ?? false));
        if (!sienne) return Response.json({ ok: false, reason: 'door_signal_not_awaited' }, { status: 409 });
        return Response.json({ ok: true, duplicate: false });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
    },
  },
  });
}
const mf = makeMf(persist);
/** The Worker the harness below speaks to — the main one, or a test's own. */
let cible: Miniflare = mf;

afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

/* ─────────────────────────────── the harness ─────────────────────────────── */

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function call(path: string, init: RequestInit = {}) {
  const res = await cible.dispatchFetch(`http://c${path}`, init);
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

const post = (path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  call(path, { method: 'POST', headers, body: JSON.stringify(body) });

let seq = 0;
const rk = (): string => `rk-colis-${String(seq++).padStart(4, '0')}-${'z'.repeat(10)}`;

async function seedShop(n: string): Promise<{ slug: string; resellerId: string }> {
  const S = await seance(cible, `colis${n}`);
  const shortCode = `COLIS-00${n}`;
  const created = await post(
    '/storefronts',
    { commandId: `cmd-create-colis-${n}`, id: `sf-colis-${n}`, resellerId: S.accountId, shortCode, name: 'Boutique de Aïcha', zone: 'Ouagadougou', category: 'Général', correlationId: `corr-colis-${n}`, at: T0 },
    S.bearer,
  );
  if (created.status !== 200) throw new Error(`seed: storefront ${created.status} ${created.text}`);
  for (const [i, v] of SUPPLY.entries()) {
    const pub = await post(
      '/listings',
      { commandId: `cmd-listing-colis-${n}-${i}`, listingId: `lst-colis-${n}-${i}`, storefrontId: `sf-colis-${n}`, resellerId: S.accountId, productVersionId: v.productVersionId, offerVersion: v.offerVersion, markup: [1_500, 1_200, 500][i]!, correlationId: `corr-colis-${n}`, at: T0 },
      S.bearer,
    );
    if ((pub.json as { status?: string }).status !== 'published') throw new Error(`seed: publish ${pub.text}`);
  }
  return { slug: shortCode.toLowerCase(), resellerId: S.accountId };
}

type Mode = 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
interface Q { quoteId: string; amountPaidAtCheckout: number; amountDueAtDelivery: number; deliveryFee: number; buyerTotal: number }

async function quote(shop: { slug: string; resellerId: string }, pid: string, mode: Mode, panier?: string[]): Promise<Q> {
  const res = await post('/checkout/quote', {
    slug: shop.slug, pid, paymentMode: mode, zoneTo: 'Ouagadougou', attributionResellerId: shop.resellerId, requestKey: rk(),
    ...(panier !== undefined ? { panier } : {}),
  });
  if (res.status !== 200) throw new Error(`quote ${res.status} ${res.text}`);
  return res.json as unknown as Q;
}

async function reserve(quoteId: string, holderRef: string) {
  const res = await post(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, { commandId: `rsv-${rk()}`, holderRef });
  if (res.status !== 200) throw new Error(`reserve ${res.status} ${res.text}`);
}

async function audit(orderId: string) {
  const ns = await cible.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit');
  return (await res.json()) as {
    state: string | null;
    doorLeg?: string;
    escrow: { paymentLegs: { legType: string; amount: number; fee: number; collectRef: string }[] } | null;
    reconAlerts: { payload: Record<string, unknown> }[];
  };
}

async function outbox(orderId: string) {
  const ns = await cible.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/outbox');
  return (await res.json()) as {
    seraOutbox?: { fact: Record<string, unknown> };
    seraAnnulation?: { status: string; fact: Record<string, unknown> };
    doorSignal?: { status?: string; outcome?: string; reason?: string };
    doorReferences?: Record<string, { status: string; outcome?: string }>;
  };
}

async function confirmer(groupId: string, amount: number) {
  const key = await call(`/checkout/webhook/leg-key/${encodeURIComponent(groupId)}?leg=checkout`, { headers: signed });
  expect(key.status, key.text).toBe(200);
  const event = composeSandboxConfirmation(groupId, amount, new Date().toISOString(), key.json['legKey']);
  const res = await post('/checkout/webhook/payment', event, signed);
  expect(res.status, res.text).toBe(200);
}

async function waitFor(pred: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
}

const PANIER = ['pv-colis-a', 'pv-colis-b', 'pv-colis-c'];
const D = 1_000; // the sandbox tariff's one Ouagadougou fee
const CONTACT = { phone: '70 44 55 66', quartier: 'Dassasgho', repere: 'la boutique bleue' };

/* ──────────────────────────────── the walks ──────────────────────────────── */

describe('COLIS-FOURNISSEUR-1 — one package and one delivery fee per supplier, on the real Worker', () => {
  it('prices the package ONCE and splits it; pays it whole or not at all; every wire carries it; ONE code for its articles', async () => {
    const shop = await seedShop('01');
    // Alone, an article still carries the whole fee — nothing changed for her.
    expect((await quote(shop, 'pv-colis-a', 'FULL_PREPAY')).deliveryFee).toBe(D);

    const qa = await quote(shop, 'pv-colis-a', 'FULL_PREPAY', [...PANIER].reverse());
    const qb = await quote(shop, 'pv-colis-b', 'FULL_PREPAY', PANIER);
    const qc = await quote(shop, 'pv-colis-c', 'FULL_PREPAY', PANIER);
    // THE ONE FEE, split to the franc; the third article leaves alone.
    expect([qa.deliveryFee, qb.deliveryFee]).toEqual(splitPackageDeliveryFee(D, 2));
    expect(qa.deliveryFee + qb.deliveryFee).toBe(D);
    expect(qc.deliveryFee).toBe(D);
    // The ask was the sorted panier, behind the supply credential, and no answer carried a supplier.
    const ask = groupingAsks.at(-1)!;
    expect(ask.auth).toBe(`Bearer ${SUPPLY_SECRET}`);
    expect(ask.body).toEqual({ productVersionIds: [...PANIER].sort() });

    // THE PRICE: two deliveries, one fee each.
    const price = await post('/checkout/group/price', { quoteIds: [qa.quoteId, qb.quoteId, qc.quoteId] });
    expect(price.status, price.text).toBe(200);
    expect(price.json['livraisons']).toBe(2);
    expect(price.json['deliveryTotal']).toBe(2 * D);
    for (const leak of ['sup-1', 'sup-2', 'supplier']) expect(price.text).not.toContain(leak);

    // A PACKAGE'S ARTICLE NEVER PAYS ALONE, nor with half its package.
    const holderRef = 'holder-colis-01';
    for (const q of [qa, qb, qc]) await reserve(q.quoteId, holderRef);
    const seule = await post('/checkout/order', { quoteId: qa.quoteId, holderRef, commandId: 'cmd-seule-01' });
    expect(seule.status, seule.text).toBe(409);
    expect(seule.json['error']).toBe('colis_paye_ensemble');
    const moitie = await post('/checkout/group', { quoteIds: [qa.quoteId, qc.quoteId], holderRef, commandId: 'cmd-moitie-01' });
    expect(moitie.json['error']).toBe('colis_incomplet');
    const moitiePrix = await post('/checkout/group/price', { quoteIds: [qa.quoteId, qc.quoteId] });
    expect(moitiePrix.json['error']).toBe('colis_incomplet');

    // WHOLE: one payment, the package named on her view.
    const paid = await post('/checkout/group', { quoteIds: [qc.quoteId, qb.quoteId, qa.quoteId], holderRef, commandId: 'cmd-colis-01', contact: { phone: '70 11 22 33', quartier: 'Gounghin', repere: 'près du marché' } });
    expect(paid.status, paid.text).toBe(200);
    const groupId = String(paid.json['groupId']);
    const [oa, ob, oc] = [qa, qb, qc].map((q) => `ord-${q.quoteId}`) as [string, string, string];
    const colis = paid.json['colis'] as { packageId: string; orderIds: string[] }[];
    expect(colis).toHaveLength(1);
    expect(colis[0]!.orderIds).toEqual([oa, ob]);
    expect(colis[0]!.packageId).toMatch(/^colis-[0-9a-f]{40}$/);

    await confirmer(groupId, qa.amountPaidAtCheckout + qb.amountPaidAtCheckout + qc.amountPaidAtCheckout);
    for (const id of [oa, ob, oc]) expect((await audit(id)).state).toBe('confirmed');

    // BOUTIK+ HEARS THE PACKAGE on each of its articles, never on the third.
    await waitFor(() => fulfillmentPosts.length >= 3);
    const emitted = new Map(fulfillmentPosts.map((p) => {
      const e = OrderConfirmedEventSchema.parse(p).payload;
      return [e.orderId, e] as const;
    }));
    expect(emitted.get(oa)!.package).toEqual({ packageId: colis[0]!.packageId, orderIds: [oa, ob] });
    expect(emitted.get(ob)!.package).toEqual(emitted.get(oa)!.package);
    expect(emitted.get(oc)!.package).toBeUndefined();

    // SÉRA'S FUNDING FACT carries it too (its intake keeps it write-once).
    expect((await outbox(oa)).seraOutbox!.fact['package']).toEqual({ packageId: colis[0]!.packageId, orderIds: [oa, ob] });
    expect((await outbox(ob)).seraOutbox!.fact['package']).toEqual({ packageId: colis[0]!.packageId, orderIds: [oa, ob] });
    expect((await outbox(oc)).seraOutbox!.fact['package']).toBeUndefined();

    // ONE CODE FOR THE PACKAGE: custody is armed with the SAME six digits for both articles.
    await waitFor(() => new Set(armPosts.map((a) => a['orderId'])).size >= 3);
    const code = (id: string) => armPosts.find((a) => a['orderId'] === id)!['secret'];
    expect(code(oa)).toMatch(/^\d{6}$/);
    expect(code(ob)).toBe(code(oa));
    expect(code(oc)).toMatch(/^\d{6}$/);
    // The payment keeps the code only to hand it to its articles: no read of
    // the payment returns it, and nothing Boutik+ hears carries it.
    const vue = await call(`/checkout/group/${encodeURIComponent(groupId)}`);
    expect(vue.status, vue.text).toBe(200);
    expect(vue.text).not.toContain(String(code(oa)));
    for (const p of fulfillmentPosts) expect(JSON.stringify(p)).not.toContain(String(code(oa)));

    // A redelivered confirmation hands the same code; nothing moves.
    const redelivered = await call(`/checkout/webhook/leg-key/${encodeURIComponent(groupId)}?leg=checkout`, { headers: signed });
    const again = await post('/checkout/webhook/payment', composeSandboxConfirmation(groupId, qa.amountPaidAtCheckout + qb.amountPaidAtCheckout + qc.amountPaidAtCheckout, new Date().toISOString(), redelivered.json['legKey']), signed);
    expect(again.json['status']).toBe('duplicate');
    expect(code(ob)).toBe(code(oa));
  }, 60_000);

  it('the SUPPLIER REFUSES one article: Séra is told it is cancelled, with its package, so the rest travels', async () => {
    const shop = await seedShop('02');
    const [qa, qb] = [await quote(shop, 'pv-colis-a', 'FULL_PREPAY', PANIER.slice(0, 2)), await quote(shop, 'pv-colis-b', 'FULL_PREPAY', PANIER.slice(0, 2))];
    const holderRef = 'holder-colis-02';
    for (const q of [qa, qb]) await reserve(q.quoteId, holderRef);
    const paid = await post('/checkout/group', { quoteIds: [qa.quoteId, qb.quoteId], holderRef, commandId: 'cmd-colis-02' });
    expect(paid.status, paid.text).toBe(200);
    await confirmer(String(paid.json['groupId']), qa.amountPaidAtCheckout + qb.amountPaidAtCheckout);
    const [oa, ob] = [`ord-${qa.quoteId}`, `ord-${qb.quoteId}`];

    const refus = await post(
      '/fulfillment/progress',
      {
        name: 'fulfillment.rejected.v1',
        envelope: { command_id: `ful-rejected-${oa}`, correlation_id: `corr-${oa}`, aggregateVersion: 1, actor: 'offer-service:fulfillment', serverTime: '2026-09-23T10:00:00.000Z', version: 'v1' },
        payload: { orderId: oa, at: '2026-09-23T10:00:00.000Z' },
      },
      { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    );
    expect(refus.status, refus.text).toBe(200);
    const annule = (await outbox(oa)).seraAnnulation;
    expect(annule?.fact).toMatchObject({ orderId: oa, status: 'cancelled', paymentMode: 'FULL_PREPAY' });
    expect(annule?.fact['package']).toEqual((await outbox(oa)).seraOutbox!.fact['package']);
    // …and LATER than the funded fact, so Séra applies it.
    expect(Date.parse(String(annule!.fact['asOf']))).toBeGreaterThan(Date.parse(String((await outbox(oa)).seraOutbox!.fact['asOf'])));
    // The other article is untouched.
    expect((await outbox(ob)).seraAnnulation).toBeUndefined();
    // A redelivery adds nothing.
    const encore = await post(
      '/fulfillment/progress',
      {
        name: 'fulfillment.rejected.v1',
        envelope: { command_id: `ful-rejected-${oa}`, correlation_id: `corr-${oa}`, aggregateVersion: 1, actor: 'offer-service:fulfillment', serverTime: '2026-09-23T10:00:00.000Z', version: 'v1' },
        payload: { orderId: oa, at: '2026-09-23T10:00:00.000Z' },
      },
      { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    );
    expect(encore.status).toBe(200);
    expect((await outbox(oa)).seraAnnulation?.fact['asOf']).toBe(annule!.fact['asOf']);
  }, 60_000);

  it('PAY AT THE DOOR: ONE payment for the articles she keeps; each funds its own door leg; its set is fixed once charged', async () => {
    const shop = await seedShop('03');
    const DOOR: Mode = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
    const [qa, qb] = [await quote(shop, 'pv-colis-a', DOOR, PANIER.slice(0, 2)), await quote(shop, 'pv-colis-b', DOOR, PANIER.slice(0, 2))];
    expect(qa.amountPaidAtCheckout + qb.amountPaidAtCheckout).toBe(D);
    const holderRef = 'holder-colis-03';
    for (const q of [qa, qb]) await reserve(q.quoteId, holderRef);
    const paid = await post('/checkout/group', { quoteIds: [qa.quoteId, qb.quoteId], holderRef, commandId: 'cmd-colis-03', contact: { phone: '70 44 55 66', quartier: 'Dassasgho', repere: 'la boutique bleue' } });
    expect(paid.status, paid.text).toBe(200);
    const groupId = String(paid.json['groupId']);
    const packageId = (paid.json['colis'] as { packageId: string }[])[0]!.packageId;
    await confirmer(groupId, D);
    const [oa, ob] = [`ord-${qa.quoteId}`, `ord-${qb.quoteId}`];
    for (const id of [oa, ob]) expect((await audit(id)).doorLeg).toBe('due');

    // The single door is closed to a package's article.
    const seule = await post(`/checkout/order/${oa}/door-charge`, { holderRef, commandId: 'cmd-door-seule-03' });
    expect(seule.json['error']).toBe('porte_du_colis');
    // Another holder is not hers to pay for.
    const autre = await post(`/checkout/group/${groupId}/porte`, { packageId, orderIds: [oa, ob], holderRef: 'quelqu-un', commandId: 'cmd-porte-x' });
    expect(autre.json['error']).toBe('reservation_held_by_another');
    // An amount can never arrive.
    const montant = await post(`/checkout/group/${groupId}/porte`, { packageId, orderIds: [oa], holderRef, commandId: 'cmd-porte-m', amount: 1 });
    expect(montant.json).toEqual({ error: 'unknown_field', field: 'amount' });

    // SHE KEEPS BOTH: one payment for the two door legs.
    const porte = await post(`/checkout/group/${groupId}/porte`, { packageId, orderIds: [ob, oa], holderRef, commandId: 'cmd-porte-03' });
    expect(porte.status, porte.text).toBe(200);
    expect((porte.json['articles'] as { orderId: string; doorLeg: string }[]).map((a) => a.doorLeg)).toEqual(['due', 'due']);
    // The one amount she is asked for is the server's sum of the two door legs.
    expect(porte.json['montant']).toBe(qa.amountDueAtDelivery + qb.amountDueAtDelivery);
    // A different set over the same articles is the SAME payment: the one in
    // flight answers, for what it was asked for — never a second collection.
    const autreSet = await post(`/checkout/group/${groupId}/porte`, { packageId, orderIds: [oa], holderRef, commandId: 'cmd-porte-03b' });
    expect(autreSet.status, autreSet.text).toBe(200);
    expect(autreSet.json['montant']).toBe(qa.amountDueAtDelivery + qb.amountDueAtDelivery);
    expect((await call(`/checkout/webhook/leg-key/${encodeURIComponent(`${groupId}-porte-2`)}?leg=door`, { headers: signed })).status).toBe(404);

    // THE PROVIDER'S ONE CONFIRMATION — the certified mock's own door event,
    // under the collection's key, for the collection's total, with a fee.
    const collectId = `${groupId}-porte-1`;
    const key = await call(`/checkout/webhook/leg-key/${encodeURIComponent(collectId)}?leg=door`, { headers: signed });
    expect(key.status, key.text).toBe(200);
    const total = qa.amountDueAtDelivery + qb.amountDueAtDelivery;
    // COLIS-2 — the key read gives the key and nothing about what it pays for:
    // no provider sends an article list back, and nothing here needs one.
    expect(Object.keys(key.json).sort()).toEqual(['groupId', 'legKey', 'ok']);
    // Each article told ITS OWN custody file the collection's reference, and
    // custody heard it before any door payment reached it.
    for (const id of [oa, ob]) {
      let fate = (await outbox(id)).doorReferences?.[collectId];
      for (let i = 0; i < 40 && fate?.status !== 'delivered'; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        fate = (await outbox(id)).doorReferences?.[collectId];
      }
      expect(fate, `${id}: its custody file never heard the reference`).toMatchObject({ status: 'delivered', outcome: 'accepted' });
      expect(declared.get(id)?.has(collectId), id).toBe(true);
    }
    const provider = new MockPaymentProvider({});
    provider.initiateCharge({ orderId: collectId, paymentAttemptId: String(key.json['legKey']), amount: total, correlationId: `corr-${collectId}`, requestedAtIso: T0, legType: 'door' });
    const plan = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!;
    const event = PlatformEventSchema.parse({ ...plan.event, payload: { ...(plan.event.payload as Record<string, unknown>), fee: 101 } });

    // A franc short is refused — and alerted — on every article.
    const court = { ...event, envelope: { ...event.envelope, command_id: 'whk-porte-court' }, payload: { ...(event.payload as Record<string, unknown>), amount: total - 1 } };
    expect((await post('/checkout/webhook/door', court, signed)).status).not.toBe(200);
    for (const id of [oa, ob]) expect((await audit(id)).doorLeg).toBe('due');

    const applied = await post('/checkout/webhook/door', event, signed);
    expect(applied.status, applied.text).toBe(200);
    const [aa, ab] = [await audit(oa), await audit(ob)];
    expect(aa.doorLeg).toBe('paid');
    expect(ab.doorLeg).toBe('paid');
    const porteA = aa.escrow!.paymentLegs.find((l) => l.legType === 'door')!;
    const porteB = ab.escrow!.paymentLegs.find((l) => l.legType === 'door')!;
    expect(porteA.amount).toBe(qa.amountDueAtDelivery);
    expect(porteB.amount).toBe(qb.amountDueAtDelivery);
    expect(porteA.amount + porteB.amount).toBe(total);
    expect(porteA.fee + porteB.fee).toBe(101);
    // Each article tells custody its own door leg is paid — and custody takes
    // it as THIS article's, the provider's event naming a reference declared
    // to it first (COLIS-2): the payload carries no article list at all.
    expect((event.payload as Record<string, unknown>)['parts']).toBeUndefined();
    expect((event.payload as Record<string, unknown>)['order_id']).toBe(collectId);
    await waitFor(() => new Set(doorSignalPosts.map((p) => p['orderId'])).size >= 2);
    expect([...new Set(doorSignalPosts.map((p) => p['orderId']))].sort()).toEqual([oa, ob].sort());
    for (const id of [oa, ob]) {
      let fate = (await outbox(id)).doorSignal;
      for (let i = 0; i < 40 && fate?.status !== 'delivered'; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        fate = (await outbox(id)).doorSignal;
      }
      expect(fate, `${id}: custody never took its door payment`).toMatchObject({ status: 'delivered', outcome: 'accepted' });
      // The declaration reached custody before the first signal did.
      const actes = custodyActs.filter((a) => a.orderId === id);
      expect(actes.findIndex((a) => a.path === '/produce-shop/door-reference')).toBeLessThan(actes.findIndex((a) => a.path === '/produce-shop/door-signal'));
    }
    // A redelivery is absorbed by both.
    expect((await post('/checkout/webhook/door', event, signed)).json['status']).toBe('duplicate');
    for (const id of [oa, ob]) expect((await audit(id)).escrow!.paymentLegs.filter((l) => l.legType === 'door')).toHaveLength(1);
  }, 60_000);

  it('verifier M3 + M5: an article refused before she pays leaves her one payment; two requests at once make ONE collection, confirmed for both', async () => {
    const DOOR: Mode = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
    const payer = async (n: string) => {
      const shop = await seedShop(n);
      const [qa, qb] = [await quote(shop, 'pv-colis-a', DOOR, PANIER.slice(0, 2)), await quote(shop, 'pv-colis-b', DOOR, PANIER.slice(0, 2))];
      const holderRef = `holder-colis-${n}`;
      for (const q of [qa, qb]) await reserve(q.quoteId, holderRef);
      const paid = await post('/checkout/group', { quoteIds: [qa.quoteId, qb.quoteId], holderRef, commandId: `cmd-colis-${n}`, contact: CONTACT });
      expect(paid.status, paid.text).toBe(200);
      const groupId = String(paid.json['groupId']);
      await confirmer(groupId, D);
      return { qa, qb, holderRef, groupId, packageId: (paid.json['colis'] as { packageId: string }[])[0]!.packageId, oa: `ord-${qa.quoteId}`, ob: `ord-${qb.quoteId}` };
    };

    // M3 — the sandals were refused before she paid: asking for both, she pays for the bazin alone.
    const r = await payer('04');
    const refus = await post(
      '/fulfillment/progress',
      {
        name: 'fulfillment.rejected.v1',
        envelope: { command_id: `ful-rejected-${r.ob}`, correlation_id: `corr-${r.ob}`, aggregateVersion: 1, actor: 'offer-service:fulfillment', serverTime: '2026-09-23T10:00:00.000Z', version: 'v1' },
        payload: { orderId: r.ob, at: '2026-09-23T10:00:00.000Z' },
      },
      { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    );
    expect(refus.status, refus.text).toBe(200);
    const seule = await post(`/checkout/group/${r.groupId}/porte`, { packageId: r.packageId, orderIds: [r.oa, r.ob], holderRef: r.holderRef, commandId: 'cmd-porte-04' });
    expect(seule.status, seule.text).toBe(200);
    expect(seule.json['montant']).toBe(r.qa.amountDueAtDelivery);
    expect((seule.json['articles'] as { orderId: string }[]).map((a) => a.orderId)).toEqual([r.oa]);
    // Only the bazin entered the collection: only its custody file heard of it.
    await waitFor(() => declared.get(r.oa)?.has(`${r.groupId}-porte-1`) === true);
    expect(declared.get(r.oa)?.has(`${r.groupId}-porte-1`)).toBe(true);
    expect(declared.get(r.ob)?.has(`${r.groupId}-porte-1`) ?? false).toBe(false);

    // M5 — two requests at the same moment: ONE collection, its key the one both articles hold.
    const c = await payer('05');
    const [un, deux] = await Promise.all(
      ['cmd-porte-05a', 'cmd-porte-05b'].map((commandId) =>
        post(`/checkout/group/${c.groupId}/porte`, { packageId: c.packageId, orderIds: [c.oa, c.ob], holderRef: c.holderRef, commandId }),
      ),
    );
    expect(un.status, un.text).toBe(200);
    expect(deux.status, deux.text).toBe(200);
    expect((await call(`/checkout/webhook/leg-key/${encodeURIComponent(`${c.groupId}-porte-2`)}?leg=door`, { headers: signed })).status).toBe(404);
    const collectId = `${c.groupId}-porte-1`;
    const k = await call(`/checkout/webhook/leg-key/${encodeURIComponent(collectId)}?leg=door`, { headers: signed });
    const provider = new MockPaymentProvider({});
    const total = c.qa.amountDueAtDelivery + c.qb.amountDueAtDelivery;
    provider.initiateCharge({ orderId: collectId, paymentAttemptId: String(k.json['legKey']), amount: total, correlationId: `corr-${collectId}`, requestedAtIso: T0, legType: 'door' });
    const event = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
    const applied = await post('/checkout/webhook/door', event, signed);
    expect(applied.status, applied.text).toBe(200);
    for (const id of [c.oa, c.ob]) expect((await audit(id)).doorLeg, `${id}: the key both articles hold`).toBe('paid');
  }, 60_000);

  /**
   * COLIS-2 — HER DOOR PAYMENT'S ANSWER IS LOST, AND SHE GIVES AN ARTICLE BACK
   * BEFORE RETRYING (founder, 2026-09-23: « the retry still covers it and it's
   * refunded afterwards … it's not the kindest screen »). On a Worker whose
   * sandbox provider does not answer her first door payment, the rider records
   * her refusal of the sandals, and she asks again for the bazin alone. The
   * provider is asked what became of the first payment, under its own key —
   * the three answers a provider can give, one walk each.
   */
  async function porteSansReponse(
    n: string,
    behavior: Record<string, unknown>,
    extra: Record<string, string> = {},
    /**
     * REMBOURSEMENT-PORTE-FERMEE (verifier M1) — prepared before her retry
     * (the provider's key read, the event built), then sent at the same moment,
     * `enTete` first or just after.
     */
    pendant?: { readonly preparer: (groupId: string, total: number) => Promise<() => Promise<unknown>>; readonly enTete: boolean },
  ) {
    const dir = mkdtempSync(join(tmpdir(), `colis-lent-${n}-`));
    const lent = makeMf(dir, { PAYMENT_SANDBOX_BEHAVIOR: JSON.stringify({ timeoutFirstNInitiates: 1, ...behavior }), ...extra });
    cible = lent;
    const DOOR: Mode = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
    const shop = await seedShop(n);
    const [qa, qb] = [await quote(shop, 'pv-colis-a', DOOR, PANIER.slice(0, 2)), await quote(shop, 'pv-colis-b', DOOR, PANIER.slice(0, 2))];
    const holderRef = `holder-colis-${n}`;
    for (const q of [qa, qb]) await reserve(q.quoteId, holderRef);
    // The delivery fees: the first charge times out, the retry goes through.
    const first = await post('/checkout/group', { quoteIds: [qa.quoteId, qb.quoteId], holderRef, commandId: `cmd-colis-${n}a`, contact: CONTACT });
    expect(first.json['state']).toBe('payment_failed');
    const groupId = String(first.json['groupId']);
    for (const q of [qa, qb]) await reserve(q.quoteId, holderRef);
    const second = await post('/checkout/group', { quoteIds: [qa.quoteId, qb.quoteId], holderRef, commandId: `cmd-colis-${n}b`, contact: CONTACT });
    expect(second.status, second.text).toBe(200);
    const packageId = (second.json['colis'] as { packageId: string }[])[0]!.packageId;
    await confirmer(groupId, D);
    const [oa, ob] = [`ord-${qa.quoteId}`, `ord-${qb.quoteId}`];

    // Her door payment for both: the provider does not answer.
    const perdu = await post(`/checkout/group/${groupId}/porte`, { packageId, orderIds: [oa, ob], holderRef, commandId: `cmd-porte-${n}a` });
    expect(perdu.json['error']).toBe('timeout');
    // The rider records that she gives the sandals back (a valid refusal at the door).
    const refus = await post(
      '/fulfillment/progress',
      {
        name: 'delivery.refused.v1',
        envelope: { command_id: `refus-${ob}`, correlation_id: `corr-${ob}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-09-23T10:00:00.000Z', version: '1' },
        payload: { order_id: ob, task_id: `task-${ob}`, rejection: 'valid_rejection', fault_class: 'seller' },
      },
      { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    );
    expect(refus.status, refus.text).toBe(200);
    // She asks again, for what she keeps.
    const envoyer = await pendant?.preparer(groupId, qa.amountDueAtDelivery + qb.amountDueAtDelivery);
    const relance = () => post(`/checkout/group/${groupId}/porte`, { packageId, orderIds: [oa], holderRef, commandId: `cmd-porte-${n}b` });
    const encore =
      envoyer === undefined
        ? await relance()
        : pendant!.enTete
          ? (await Promise.all([envoyer(), relance()]))[1]
          : (await Promise.all([relance(), envoyer()]))[0];
    const cle = (i: number) => call(`/checkout/webhook/leg-key/${encodeURIComponent(`${groupId}-porte-${i}`)}?leg=door`, { headers: signed });
    const fin = async () => {
      cible = mf;
      await lent.dispose();
      rmSync(dir, { recursive: true, force: true });
    };
    return { qa, qb, oa, ob, groupId, packageId, holderRef, encore, cle, fin };
  }

  /** The provider's door confirmation of one collection, as the certified mock builds it. */
  async function confirmerPorte(collectId: string, amount: number) {
    const k = await call(`/checkout/webhook/leg-key/${encodeURIComponent(collectId)}?leg=door`, { headers: signed });
    expect(k.status, k.text).toBe(200);
    const provider = new MockPaymentProvider({});
    provider.initiateCharge({ orderId: collectId, paymentAttemptId: String(k.json['legKey']), amount, correlationId: `corr-${collectId}`, requestedAtIso: T0, legType: 'door' });
    const event = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
    return post('/checkout/webhook/door', event, signed);
  }

  async function lignesRendues(orderId: string) {
    const ns = await cible.getDurableObjectNamespace('ORDER');
    const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit');
    const a = (await res.json()) as { remboursement: { lignes: { legType: string; amount: number }[] } | null };
    return a.remboursement?.lignes.map((l) => [l.legType, l.amount]) ?? [];
  }

  it('COLIS-2 — the provider says the lost payment TOOK NOTHING: it is closed, and she pays for the bazin alone — the sandals are never charged, so nothing of theirs comes back', async () => {
    const w = await porteSansReponse('06', {});
    try {
      expect(w.encore.status, w.encore.text).toBe(200);
      expect(w.encore.json['montant']).toBe(w.qa.amountDueAtDelivery);
      expect((w.encore.json['articles'] as { orderId: string }[]).map((a) => a.orderId)).toEqual([w.oa]);
      // A NEW payment, under its own key — the closed one is never asked again.
      const [k1, k2] = [await w.cle(1), await w.cle(2)];
      expect(k2.status, k2.text).toBe(200);
      expect(k2.json['legKey']).not.toBe(k1.json['legKey']);
      // Its reference reached the bazin's custody file.
      await waitFor(() => declared.get(w.oa)?.has(`${w.groupId}-porte-2`) === true);
      expect(declared.get(w.oa)?.has(`${w.groupId}-porte-2`)).toBe(true);
      // The provider confirms it: the bazin's door leg is paid, to the franc.
      const ok = await confirmerPorte(`${w.groupId}-porte-2`, w.qa.amountDueAtDelivery);
      expect(ok.status, ok.text).toBe(200);
      const [aa, ab] = [await audit(w.oa), await audit(w.ob)];
      expect(aa.doorLeg).toBe('paid');
      expect(aa.escrow!.paymentLegs.filter((l) => l.legType === 'door').map((l) => l.amount)).toEqual([w.qa.amountDueAtDelivery]);
      // The sandals: never charged at the door, so no door money to give back.
      expect(ab.escrow!.paymentLegs.filter((l) => l.legType === 'door')).toEqual([]);
      expect((await lignesRendues(w.ob)).filter(([leg]) => leg === 'door')).toEqual([]);
    } finally {
      await w.fin();
    }
  }, 60_000);

  it('COLIS-2 — the provider says the lost payment TOOK THE MONEY: it stands as asked, never a second charge beside it — even with the door’s attempts spent — and the sandals are refunded when its confirmation lands', async () => {
    // The door's ceiling is ONE attempt, already spent: only the provider's own
    // word that it took the money can answer her as paid — a retry could not.
    const w = await porteSansReponse('08', { timeoutCollects: true }, { DOOR_ATTEMPTS_MAX: '1' });
    try {
      expect(w.encore.status, w.encore.text).toBe(200);
      // What was taken is what she is told: both articles, the one sum.
      expect(w.encore.json['montant']).toBe(w.qa.amountDueAtDelivery + w.qb.amountDueAtDelivery);
      expect((await w.cle(2)).status, 'a second collection exists').toBe(404);
      // A second ask answers the same payment — still never a new one.
      const redit = await post(`/checkout/group/${w.groupId}/porte`, { packageId: w.packageId, orderIds: [w.oa], holderRef: w.holderRef, commandId: 'cmd-porte-08c' });
      expect(redit.status, redit.text).toBe(200);
      expect(redit.json['montant']).toBe(w.qa.amountDueAtDelivery + w.qb.amountDueAtDelivery);
      expect((await w.cle(2)).status).toBe(404);
      // The provider's confirmation of what it took lands.
      const ok = await confirmerPorte(`${w.groupId}-porte-1`, w.qa.amountDueAtDelivery + w.qb.amountDueAtDelivery);
      expect(ok.status, ok.text).toBe(200);
      expect((await audit(w.oa)).doorLeg).toBe('paid');
      // The given-back sandals: their door money goes back to her, to the franc.
      let lignes = await lignesRendues(w.ob);
      for (let i = 0; i < 80 && !lignes.some(([leg]) => leg === 'door'); i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        lignes = await lignesRendues(w.ob);
      }
      expect(lignes.filter(([leg]) => leg === 'door')).toEqual([['door', w.qb.amountDueAtDelivery]]);
    } finally {
      await w.fin();
    }
  }, 60_000);

  it('COLIS-2 — the provider CANNOT SAY what became of it: the payment is retried AS IT WAS (never a second one beside it), under the door’s ceiling', async () => {
    const w = await porteSansReponse('09', { staleStatusReads: 1 }, { DOOR_ATTEMPTS_MAX: '1' });
    try {
      expect(w.encore.json['error']).toBe('door_attempts_exhausted');
      expect((await w.cle(2)).status).toBe(404);
    } finally {
      await w.fin();
    }
  }, 60_000);

  /* ── REMBOURSEMENT-PORTE-FERMEE (founder, 2026-09-23: « A ») — the closed payment, confirmed after all ── */

  interface Retour {
    collectId: string; orderIds: string[]; total: number; collectRef: string; refundKey: string;
    etat: string; motifRefus?: string; alerteLe?: string; ligne?: string; rembourse?: { confirmation: string };
  }

  /** The payment object's own record of it — the ledger, never a response. */
  async function registre(groupId: string) {
    const ns = await cible.getDurableObjectNamespace('PAYMENT_GROUP');
    const res = await ns.get(ns.idFromName(groupId)).fetch('https://do/entry/retours');
    return (await res.json()) as { retours: Record<string, Retour>; portes: Record<string, { abandonnee?: true; confirmee?: { collectRef: string } }> };
  }
  const retours = async (groupId: string) => (await registre(groupId)).retours;

  async function attendre<T>(lire: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 8_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let v = await lire();
    while (!ok(v) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      v = await lire();
    }
    return v;
  }

  /** The founder's Commandes rows, as his console reads them (key C). */
  async function rangs(): Promise<Map<string, { remboursement?: { etat: string; raison?: string } | null }>> {
    const res = await call('/checkout/dispatch', { headers: { Authorization: `Bearer ${OPS_SECRET}` } });
    expect(res.status, res.text).toBe(200);
    return new Map((res.json['orders'] as { orderId: string; remboursement?: { etat: string; raison?: string } | null }[]).map((r) => [r.orderId, r]));
  }

  it('REMBOURSEMENT-PORTE-FERMEE — the payment closed on « took nothing » is confirmed after all: it pays for NO article, and ALL of it goes back to her, under a refund key of its own, done only when the provider confirms it', async () => {
    const w = await porteSansReponse('11', {});
    try {
      expect(w.encore.status, w.encore.text).toBe(200);
      const [ferme, neuve] = [`${w.groupId}-porte-1`, `${w.groupId}-porte-2`];
      const total = w.qa.amountDueAtDelivery + w.qb.amountDueAtDelivery;
      // She pays for the bazin she keeps, in the new payment.
      expect((await confirmerPorte(neuve, w.qa.amountDueAtDelivery)).status).toBe(200);
      // The provider now confirms the payment it said took nothing — a franc short first: refused, nothing kept.
      const court = await confirmerPorte(ferme, total - 1);
      expect(court.status, court.text).toBe(422);
      expect(court.json['error']).toBe('amount_mismatch');
      expect((await retours(w.groupId))[ferme]).toBeUndefined();
      // Then as it was asked: taken — by the payment object, not by any article.
      const tard = await confirmerPorte(ferme, total);
      expect(tard.status, tard.text).toBe(200);
      expect(tard.json).toEqual({ status: 'applied', doorLeg: 'closed' });
      const [aa, ab] = [await audit(w.oa), await audit(w.ob)];
      expect(aa.escrow!.paymentLegs.filter((l) => l.legType === 'door').map((l) => l.amount)).toEqual([w.qa.amountDueAtDelivery]);
      expect(ab.escrow!.paymentLegs.filter((l) => l.legType === 'door')).toEqual([]);
      expect(ab.doorLeg).toBe('due');
      expect((await lignesRendues(w.ob)).filter(([leg]) => leg === 'door')).toEqual([]);
      // Custody never hears a door payment under it.
      expect(doorSignalPosts.some((p) => (p['event'] as { payload?: Record<string, unknown> } | undefined)?.payload?.['order_id'] === ferme)).toBe(false);
      // A redelivery is absorbed; another payment under the same key contradicts it and is refused.
      expect((await confirmerPorte(ferme, total)).json['status']).toBe('duplicate');
      const k = await w.cle(1);
      const autre = PlatformEventSchema.parse({
        name: 'payment.door_leg_confirmed.v1',
        envelope: { command_id: 'whk-porte-fermee-autre', correlation_id: `corr-${ferme}`, aggregateVersion: 1, actor: 'payment-provider:sandbox', serverTime: T0, version: '1' },
        payload: { provider: 'sandbox-provider', payment_attempt_id: k.json['legKey'], collectRef: 'collect-autre', amount: total, fee: 0, status: 'held', order_id: ferme, redelivery: false },
      });
      const contredit = await post('/checkout/webhook/door', autre, signed);
      expect(contredit.status, contredit.text).toBe(409);
      expect(contredit.json['error']).toBe('conflicting_escrow_for_order');

      // ALL of it is asked back of the provider, under a key of its own, from the collection it was taken from.
      const r = (await attendre(() => retours(w.groupId), (x) => x[ferme]?.etat === 'demande'))[ferme]!;
      expect(r).toMatchObject({ etat: 'demande', total, orderIds: [w.oa, w.ob].sort() });
      expect(r.refundKey).toMatch(/^rf-/);
      const k1 = await w.cle(1);
      expect(r.collectRef).toBe(`collect-${String(k1.json['legKey'])}`);
      // The stand-in reads the refund it was asked for, as it reads an order's.
      const demandes = await call(`/checkout/webhook/refund-key/${encodeURIComponent(ferme)}`, { headers: signed });
      expect(demandes.json).toEqual({ ok: true, remboursements: [{ legType: 'door', refundKey: r.refundKey, amount: total, collectRef: r.collectRef }] });
      // Another group id is still no refund's name.
      expect((await call(`/checkout/webhook/refund-key/${encodeURIComponent(w.groupId)}`, { headers: signed })).status).toBe(400);
      const ligne = (demandes.json['remboursements'] as { refundKey: string; collectRef: string; amount: number }[])[0]!;
      // Not refunded until the provider says so: a franc short refused, then confirmed, then a redelivery absorbed.
      const refundCourt = composeSandboxRefund(ferme, { ...ligne, amount: total - 1 }, new Date().toISOString());
      expect((await post('/checkout/webhook/refund', refundCourt, signed)).json['error']).toBe('amount_mismatch');
      expect((await retours(w.groupId))[ferme]!.rembourse).toBeUndefined();
      const rendu = await post('/checkout/webhook/refund', composeSandboxRefund(ferme, ligne, new Date().toISOString()), signed);
      expect(rendu.status, rendu.text).toBe(200);
      expect(rendu.json).toEqual({ status: 'applied', state: 'refunded' });
      expect((await post('/checkout/webhook/refund', composeSandboxRefund(ferme, ligne, new Date().toISOString()), signed)).json['status']).toBe('duplicate');
      expect((await retours(w.groupId))[ferme]!.rembourse).toMatchObject({ confirmation: `whk-sandbox-refund-${r.refundKey}` });
      // Nothing is left for the founder: neither article's row says a refund is blocked.
      const vus = await rangs();
      for (const id of [w.oa, w.ob]) expect(vus.get(id)?.remboursement?.etat, id).not.toBe('bloque');
    } finally {
      await w.fin();
    }
  }, 60_000);

  it('REMBOURSEMENT-PORTE-FERMEE (verifier M1) — her retry and the late confirmation arrive TOGETHER, then the provider delivers it again: the payment either paid her articles or goes back whole — never both', async () => {
    for (const [n, enTete] of [['14', true], ['15', false], ['16', true], ['17', true]] as const) {
      let ferme = '';
      let total = 0;
      const w = await porteSansReponse(n, {}, {}, {
        enTete,
        preparer: async (groupId, somme) => {
          [ferme, total] = [`${groupId}-porte-1`, somme];
          const k = await call(`/checkout/webhook/leg-key/${encodeURIComponent(ferme)}?leg=door`, { headers: signed });
          const provider = new MockPaymentProvider({});
          provider.initiateCharge({ orderId: ferme, paymentAttemptId: String(k.json['legKey']), amount: somme, correlationId: `corr-${ferme}`, requestedAtIso: T0, legType: 'door' });
          const event = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
          return () => post('/checkout/webhook/door', event, signed);
        },
      });
      try {
        // At least once: the provider delivers it again, whatever happened meanwhile.
        expect((await confirmerPorte(ferme, total)).status).toBeLessThan(500);
        await new Promise((r) => setTimeout(r, 300));
        const ref = `collect-${String((await w.cle(1)).json['legKey'])}`;
        const [aa, ab] = [await audit(w.oa), await audit(w.ob)];
        const payeLesArticles = [aa, ab].some((a) => a.escrow?.paymentLegs.some((l) => l.legType === 'door' && l.collectRef === ref) === true);
        const reg = await registre(w.groupId);
        const rendueEntiere = reg.retours[ferme] !== undefined;
        expect(payeLesArticles !== rendueEntiere, `run ${n}: paid her articles=${payeLesArticles}, refunded whole=${rendueEntiere}`).toBe(true);
        // A payment its articles took is never closed.
        if (payeLesArticles) expect(reg.portes[ferme]?.abandonnee, `run ${n}`).toBeUndefined();
      } finally {
        await w.fin();
      }
    }
  }, 120_000);

  it('REMBOURSEMENT-PORTE-FERMEE — the provider REFUSES to give it back: the founder\'s row says so, by its reason — on the article she gave back, never the one still travelling to her', async () => {
    const w = await porteSansReponse('12', { refuseRefunds: true });
    try {
      const ferme = `${w.groupId}-porte-1`;
      expect((await confirmerPorte(ferme, w.qa.amountDueAtDelivery + w.qb.amountDueAtDelivery)).status).toBe(200);
      const r = (await attendre(() => retours(w.groupId), (x) => x[ferme]?.etat === 'refuse'))[ferme]!;
      expect(r).toMatchObject({ etat: 'refuse', motifRefus: 'refund_declined', ligne: w.ob });
      const vus = await rangs();
      expect(vus.get(w.ob)?.remboursement).toEqual({ etat: 'bloque', raison: 'refus_du_prestataire' });
      // The bazin she keeps stays in its queue: no refund state on its row.
      expect(vus.get(w.oa)?.remboursement ?? null).toBeNull();
    } finally {
      await w.fin();
    }
  }, 60_000);

  it('REMBOURSEMENT-PORTE-FERMEE — the provider never confirms it: past the stuck time the founder\'s row says so, on ONE row, and it clears when the provider confirms', async () => {
    const w = await porteSansReponse('13', {}, { STUCK_SAGA_TTL_MS: '1' });
    try {
      const ferme = `${w.groupId}-porte-1`;
      const total = w.qa.amountDueAtDelivery + w.qb.amountDueAtDelivery;
      expect((await confirmerPorte(ferme, total)).status).toBe(200);
      const r = (await attendre(() => retours(w.groupId), (x) => x[ferme]?.alerteLe !== undefined))[ferme]!;
      expect(r.etat).toBe('demande');
      // The sandals' own refund is confirmed, so their row can speak for the payment.
      const propres = await attendre(
        () => call(`/checkout/webhook/refund-key/${encodeURIComponent(w.ob)}`, { headers: signed }),
        (x) => x.status === 200,
      );
      for (const l of propres.json['remboursements'] as { refundKey: string; collectRef: string; amount: number; legType: string }[]) {
        expect((await post('/checkout/webhook/refund', composeSandboxRefund(w.ob, l, new Date().toISOString()), signed)).status).toBe(200);
      }
      let vus = await rangs();
      expect(vus.get(w.ob)?.remboursement).toEqual({ etat: 'bloque', raison: 'sans_confirmation' });
      expect(vus.get(w.oa)?.remboursement ?? null).toBeNull();
      // The provider confirms it after all: nothing is blocked any more — the sandals read their own refund, done.
      const ligne = { refundKey: r.refundKey, collectRef: r.collectRef, amount: total };
      expect((await post('/checkout/webhook/refund', composeSandboxRefund(ferme, ligne, new Date().toISOString()), signed)).status).toBe(200);
      vus = await rangs();
      expect(vus.get(w.ob)?.remboursement?.etat).toBe('fait');
      expect(vus.get(w.oa)?.remboursement ?? null).toBeNull();
    } finally {
      await w.fin();
    }
  }, 60_000);

  it('COLIS-2 — custody cannot take the declaration yet: the provider’s confirmation is recorded, but the door signal WAITS — it reaches custody only after the reference did, and is never refused for it', async () => {
    const shop = await seedShop('10');
    const DOOR: Mode = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
    const [qa, qb] = [await quote(shop, 'pv-colis-a', DOOR, PANIER.slice(0, 2)), await quote(shop, 'pv-colis-b', DOOR, PANIER.slice(0, 2))];
    const holderRef = 'holder-colis-10';
    for (const q of [qa, qb]) await reserve(q.quoteId, holderRef);
    const paid = await post('/checkout/group', { quoteIds: [qa.quoteId, qb.quoteId], holderRef, commandId: 'cmd-colis-10', contact: CONTACT });
    expect(paid.status, paid.text).toBe(200);
    const groupId = String(paid.json['groupId']);
    const packageId = (paid.json['colis'] as { packageId: string }[])[0]!.packageId;
    await confirmer(groupId, D);
    const [oa, ob] = [`ord-${qa.quoteId}`, `ord-${qb.quoteId}`];
    const collectId = `${groupId}-porte-1`;
    for (const id of [oa, ob]) sansDossier.add(id);
    try {
      const porte = await post(`/checkout/group/${groupId}/porte`, { packageId, orderIds: [oa, ob], holderRef, commandId: 'cmd-porte-10' });
      expect(porte.status, porte.text).toBe(200);
      // Each article tried to declare, and custody had no file: still pending.
      await waitFor(() => [oa, ob].every((id) => custodyActs.some((a) => a.orderId === id && a.reference === collectId)));
      for (const id of [oa, ob]) expect((await outbox(id)).doorReferences?.[collectId]).toMatchObject({ status: 'pending' });

      // The provider confirms the one payment: recorded on both articles…
      const k = await call(`/checkout/webhook/leg-key/${encodeURIComponent(collectId)}?leg=door`, { headers: signed });
      const provider = new MockPaymentProvider({});
      provider.initiateCharge({ orderId: collectId, paymentAttemptId: String(k.json['legKey']), amount: qa.amountDueAtDelivery + qb.amountDueAtDelivery, correlationId: `corr-${collectId}`, requestedAtIso: T0, legType: 'door' });
      const event = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
      expect((await post('/checkout/webhook/door', event, signed)).status).toBe(200);
      for (const id of [oa, ob]) expect((await audit(id)).doorLeg).toBe('paid');
      // …but custody is not told before it knows the reference.
      await new Promise((r) => setTimeout(r, 600));
      expect(doorSignalPosts.filter((p) => p['orderId'] === oa || p['orderId'] === ob)).toEqual([]);
      for (const id of [oa, ob]) expect((await outbox(id)).doorSignal).toMatchObject({ status: 'pending' });

      // Custody opens the files; a redelivered confirmation wakes the wires.
      for (const id of [oa, ob]) sansDossier.delete(id);
      expect((await post('/checkout/webhook/door', event, signed)).json['status']).toBe('duplicate');
      for (const id of [oa, ob]) {
        let fate = (await outbox(id)).doorSignal;
        for (let i = 0; i < 40 && fate?.status !== 'delivered'; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
          fate = (await outbox(id)).doorSignal;
        }
        expect(fate, id).toMatchObject({ status: 'delivered', outcome: 'accepted' });
        expect((await outbox(id)).doorReferences?.[collectId]).toMatchObject({ status: 'delivered', outcome: 'accepted' });
        // ONE signal each, taken the first time: never refused for want of the reference.
        expect(doorSignalPosts.filter((p) => p['orderId'] === id)).toHaveLength(1);
      }
    } finally {
      for (const id of [oa, ob]) sansDossier.delete(id);
    }
  }, 60_000);

  it('COLIS-2 — Boutik+ cannot be reached: the shop remembers what it was told, so her package still costs ONE delivery — and a shop that was never told still prices each article alone', async () => {
    const shop = await seedShop('11');
    const duo = PANIER.slice(0, 2);
    // Boutik+ answers once: the bazin and the bag leave from one supplier.
    expect((await quote(shop, 'pv-colis-a', 'FULL_PREPAY', duo)).deliveryFee).toBe(splitPackageDeliveryFee(D, 2)[0]);
    groupingEnPanne = true;
    try {
      // Boutik+ is down. Asked again, it does not answer — and her quotes still split ONE fee.
      const avant = groupingAsks.length;
      const [qa, qb] = [await quote(shop, 'pv-colis-a', 'FULL_PREPAY', duo), await quote(shop, 'pv-colis-b', 'FULL_PREPAY', duo)];
      expect(groupingAsks.length, 'Boutik+ was still asked first').toBeGreaterThan(avant);
      expect([qa.deliveryFee, qb.deliveryFee]).toEqual(splitPackageDeliveryFee(D, 2));
      // A product never grouped before (the karité) travels alone, at the full fee.
      expect((await quote(shop, 'pv-colis-c', 'FULL_PREPAY', PANIER)).deliveryFee).toBe(D);
      // …and the package pays whole, as ONE package with ONE delivery.
      for (const q of [qa, qb]) await reserve(q.quoteId, 'holder-colis-11');
      const paid = await post('/checkout/group', { quoteIds: [qa.quoteId, qb.quoteId], holderRef: 'holder-colis-11', commandId: 'cmd-colis-11', contact: CONTACT });
      expect(paid.status, paid.text).toBe(200);
      expect((paid.json['colis'] as { orderIds: string[] }[]).map((c) => c.orderIds.length)).toEqual([2]);

      // Another shop was never told anything: during the outage its articles are alone.
      const autre = await seedShop('12');
      expect((await quote(autre, 'pv-colis-a', 'FULL_PREPAY', duo)).deliveryFee).toBe(D);
    } finally {
      groupingEnPanne = false;
    }
  }, 60_000);

  it('verifier m2: a panier naming a product this boutique does not sell asks Boutik+ nothing, and the article travels alone', async () => {
    const shop = await seedShop('07');
    const avant = groupingAsks.length;
    const q = await quote(shop, 'pv-colis-a', 'FULL_PREPAY', ['pv-colis-a', 'pv-autre-boutique']);
    expect(groupingAsks.length, 'a probe reached Boutik+').toBe(avant);
    expect(q.deliveryFee).toBe(D);
  }, 60_000);
});
