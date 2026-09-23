import { OrderConfirmedEventSchema, PlatformEventSchema, splitPackageDeliveryFee } from '@platform/contracts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { composeSandboxConfirmation } from '../../../scripts/sandbox-payment-confirm.mjs';
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
 *  · CUSTODY (Séra): the arm door and the door-signal door with the bounds
 *    `porte-custody.e2e.test.ts` certifies; here both only record.
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
const armPosts: Record<string, unknown>[] = [];
const doorSignalPosts: Record<string, unknown>[] = [];

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

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO', ORDER: 'OrderDO',
    ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', COMPTES: 'ResellerAccountsDO',
    DISPATCH: 'DispatchIndexDO', PAYMENT_GROUP: 'PaymentGroupDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    CHECKOUT_OPS_SECRET: OPS_SECRET,
    FULFILLMENT_WRITE_SECRET: 'test-fulfillment-write-secret-colis',
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    SUPPLY_READ_SECRET: SUPPLY_SECRET,
    SHOP_ARM_SECRET: ARM_SECRET,
    PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
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
      if (request.method === 'POST' && path === '/produce-shop/door-signal') {
        doorSignalPosts.push(body);
        return Response.json({ ok: true, duplicate: false });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
    },
  },
});

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
  const res = await mf.dispatchFetch(`http://c${path}`, init);
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

const post = (path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  call(path, { method: 'POST', headers, body: JSON.stringify(body) });

let seq = 0;
const rk = (): string => `rk-colis-${String(seq++).padStart(4, '0')}-${'z'.repeat(10)}`;

async function seedShop(n: string): Promise<{ slug: string; resellerId: string }> {
  const S = await seance(mf, `colis${n}`);
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
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit');
  return (await res.json()) as {
    state: string | null;
    doorLeg?: string;
    escrow: { paymentLegs: { legType: string; amount: number; fee: number; collectRef: string }[] } | null;
    reconAlerts: { payload: Record<string, unknown> }[];
  };
}

async function outbox(orderId: string) {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/outbox');
  return (await res.json()) as { seraOutbox?: { fact: Record<string, unknown> }; seraAnnulation?: { status: string; fact: Record<string, unknown> } };
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
    // A different set over the same articles is refused: the set is fixed.
    const autreSet = await post(`/checkout/group/${groupId}/porte`, { packageId, orderIds: [oa], holderRef, commandId: 'cmd-porte-03b' });
    expect(autreSet.status).toBe(409);
    expect(autreSet.json['error']).toBe('porte_deja_choisie');

    // THE PROVIDER'S ONE CONFIRMATION — the certified mock's own door event,
    // under the collection's key, for the collection's total, with a fee.
    const collectId = `${groupId}-porte-1`;
    const key = await call(`/checkout/webhook/leg-key/${encodeURIComponent(collectId)}?leg=door`, { headers: signed });
    expect(key.status, key.text).toBe(200);
    const total = qa.amountDueAtDelivery + qb.amountDueAtDelivery;
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
    // Each article tells custody its own door leg is paid.
    await waitFor(() => new Set(doorSignalPosts.map((p) => p['orderId'])).size >= 2);
    expect(doorSignalPosts.map((p) => p['orderId']).sort()).toEqual([oa, ob].sort());
    // A redelivery is absorbed by both.
    expect((await post('/checkout/webhook/door', event, signed)).json['status']).toBe('duplicate');
    for (const id of [oa, ob]) expect((await audit(id)).escrow!.paymentLegs.filter((l) => l.legType === 'door')).toHaveLength(1);
  }, 60_000);
});
