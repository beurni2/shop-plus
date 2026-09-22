import { OrderConfirmedEventSchema } from '@platform/contracts';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { composeSandboxConfirmation } from '../../../scripts/sandbox-payment-confirm.mjs';
import { OPS_SECRET, seance, type Seance } from './seance';

/**
 * PAYER-TOUT-1 (founder ruling 2026-09-22, « 1 then 2 », option 1) — ONE
 * PAYMENT FOR THE BOUTIQUE PANIER, EACH ARTICLE STILL ITS OWN ORDER, on the
 * REAL combined Worker (Miniflare): the composition root, the public group
 * doors, the webhook secret gate, CheckoutDO, OrderDO, PaymentGroupDO, the
 * attribution lock and the dispatch index — none of it stubbed. Only the
 * OFFER binding (Boutik+'s supply read and the confirmed-order intake) is a
 * stand-in, as in every order suite.
 *
 * EVERY OUTCOME IS ASKED OF THE LEDGER: each order's own audit read (its
 * journey, its escrow, its alerts, its release rows) — never the response.
 *
 * THE WEBHOOK IS THE SANDBOX CONFIRMER'S OWN COMPOSITION
 * (`scripts/sandbox-payment-confirm.mjs`), so the founder's tool is held to
 * this Worker's acceptance for a group exactly as it is for an order.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'payer-tout-'));
const persistSlow = mkdtempSync(join(tmpdir(), 'payer-tout-slow-'));
const persistSansGroupe = mkdtempSync(join(tmpdir(), 'payer-tout-sans-'));
const persistRejeu = mkdtempSync(join(tmpdir(), 'payer-tout-rejeu-'));
const T0 = '2026-09-22T08:00:00.000Z';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-grp1';
const signed = { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' };

/** Two articles, every figure distinct, both door-eligible (verified, inspectable category). */
const SUPPLY = [
  {
    productVersionId: 'pv-grp-1',
    offerVersion: 'ov-grp-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
  {
    productVersionId: 'pv-grp-2',
    offerVersion: 'ov-grp-2',
    basePrice: 17_000,
    resellerCommission: 1_500,
    available: 9,
    productName: 'Sac en cuir',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

const fulfillmentPosts: { body: unknown }[] = [];

function makeMf(persistDir: string, sandboxBehavior?: string, withGroups = true): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO',
      LISTING: 'ListingDO',
      CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO',
      ATTRIBUTION_LOCK: 'AttributionLockDO',
      LADDER: 'BuyerLadderDO',
      COMPTES: 'ResellerAccountsDO',
      DISPATCH: 'DispatchIndexDO',
      ...(withGroups ? { PAYMENT_GROUP: 'PaymentGroupDO' } : {}),
    },
    durableObjectsPersist: persistDir,
    bindings: {
      CHECKOUT_OPS_SECRET: OPS_SECRET,
      FULFILLMENT_WRITE_SECRET: 'test-fulfillment-write-secret-grp1',
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ...(sandboxBehavior !== undefined ? { PAYMENT_SANDBOX_BEHAVIOR: sandboxBehavior } : {}),
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
          fulfillmentPosts.push({ body: await request.json().catch(() => null) });
          return Response.json({ ok: true, status: 'registered' });
        }
        const single = /^\/supply-projection\/([^/]+)$/.exec(path);
        if (single) {
          const value = SUPPLY.find((v) => v.productVersionId === decodeURIComponent(single[1]!));
          if (value === undefined) return Response.json({ status: 'not_found' }, { status: 404 });
          return Response.json({ version: 1, asOf: new Date().toISOString(), value });
        }
        // B5.1 — the producer's hold door answers « held » for every unit here.
        if (request.method === 'POST' && /hold|release/.test(path)) {
          return Response.json({ status: 'held', expiresAt: new Date(Date.now() + 120_000).toISOString() });
        }
        return Response.json({ status: 'not_found' }, { status: 404 });
      },
    },
  });
}

let mf = makeMf(persist);
/** A real process death: the same persist dir, a new runtime. */
async function restart(): Promise<void> {
  await mf.dispose();
  mf = makeMf(persist);
}
let slow: Miniflare | undefined;
let sansGroupe: Miniflare | undefined;
let rejeu: Miniflare | undefined;

afterAll(async () => {
  await mf.dispose();
  if (slow !== undefined) await slow.dispose();
  if (sansGroupe !== undefined) await sansGroupe.dispose();
  if (rejeu !== undefined) await rejeu.dispose();
  for (const dir of [persist, persistSlow, persistSansGroupe, persistRejeu]) rmSync(dir, { recursive: true, force: true });
});

/** One Durable Object's stored state, removed from a stopped runtime's persist dir. Returns the files removed. */
function effacerObjet(dir: string, hex: string): number {
  let n = 0;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.startsWith(hex)) {
      rmSync(join(entry.parentPath, entry.name));
      n += 1;
    }
  }
  return n;
}

/* ─────────────────────────────── the harness ─────────────────────────────── */

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function call(m: Miniflare, path: string, init: RequestInit = {}) {
  const res = await m.dispatchFetch(`http://c${path}`, init);
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text), headers: res.headers };
}

const post = (m: Miniflare, path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  call(m, path, { method: 'POST', headers, body: JSON.stringify(body) });

let seq = 0;
const rk = (): string => `rk-grp-${String(seq++).padStart(4, '0')}-${'y'.repeat(10)}`;

interface Shop {
  slug: string;
  resellerId: string;
  seance: Seance;
}

/** One boutique holding BOTH articles — the panier's whole premise. */
async function seedShop(m: Miniflare, n: string): Promise<Shop> {
  const S = await seance(m, `grp${n}`);
  const shortCode = `GROUP-00${n}`;
  const created = await post(
    m,
    '/storefronts',
    {
      commandId: `cmd-create-grp-${n}`,
      id: `sf-grp-${n}`,
      resellerId: S.accountId,
      shortCode,
      name: 'Boutique de Aïcha',
      zone: 'Ouagadougou',
      category: 'Général',
      correlationId: `corr-grp-${n}`,
      at: T0,
    },
    S.bearer,
  );
  if (created.status !== 200) throw new Error(`seed: storefront ${created.status} ${created.text}`);
  for (const [i, v] of SUPPLY.entries()) {
    const pub = await post(
      m,
      '/listings',
      {
        commandId: `cmd-listing-grp-${n}-${i}`,
        listingId: `lst-grp-${n}-${i}`,
        storefrontId: `sf-grp-${n}`,
        resellerId: S.accountId,
        productVersionId: v.productVersionId,
        offerVersion: v.offerVersion,
        markup: i === 0 ? 1_500 : 2_500,
        correlationId: `corr-grp-${n}`,
        at: T0,
      },
      S.bearer,
    );
    if ((pub.json as { status?: string }).status !== 'published') throw new Error(`seed: publish ${pub.text}`);
  }
  return { slug: shortCode.toLowerCase(), resellerId: S.accountId, seance: S };
}

type Mode = 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';

async function quote(m: Miniflare, shop: Shop, pid: string, mode: Mode = 'FULL_PREPAY') {
  const res = await post(m, '/checkout/quote', {
    slug: shop.slug,
    pid,
    paymentMode: mode,
    zoneTo: 'Ouagadougou',
    attributionResellerId: shop.resellerId,
    requestKey: rk(),
  });
  if (res.status !== 200) throw new Error(`quote ${res.status} ${res.text}`);
  return res.json as { quoteId: string; amountPaidAtCheckout: number; amountDueAtDelivery: number; deliveryFee: number; buyerTotal: number };
}

async function reserve(m: Miniflare, quoteId: string, holderRef: string, commandId = `rsv-${rk()}`) {
  const res = await post(m, `/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, { commandId, holderRef });
  if (res.status !== 200) throw new Error(`reserve ${res.status} ${res.text}`);
  return res.json;
}

async function audit(m: Miniflare, orderId: string) {
  const ns = await m.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit');
  return (await res.json()) as {
    exists: boolean;
    state: string | null;
    escrow: { paymentLegs: { legType: string; amount: number; fee: number; collectRef: string }[] } | null;
    legKeys: Record<string, string>;
    attempts: { attemptId: string; providerKey: string; outcome: string }[];
    release: { status: string; reservationId: string } | null;
    reconAlerts: { payload: Record<string, unknown> }[];
    doorLeg?: string;
  };
}

async function outbox(m: Miniflare, orderId: string) {
  const ns = await m.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/outbox');
  return (await res.json()) as { ok: boolean; outbox?: { status: string }; seraOutbox?: { fact: { orderId: string; status: string } } };
}

async function legKey(m: Miniflare, id: string) {
  return call(m, `/checkout/webhook/leg-key/${encodeURIComponent(id)}?leg=checkout`, { headers: signed });
}

async function confirmation(m: Miniflare, groupId: string, amount: number, over: Record<string, unknown> = {}) {
  const key = await legKey(m, groupId);
  expect(key.status, key.text).toBe(200);
  const event = composeSandboxConfirmation(groupId, amount, new Date().toISOString(), key.json['legKey']) as {
    envelope: Record<string, unknown>;
    payload: Record<string, unknown>;
  };
  return { ...event, payload: { ...event.payload, ...over } };
}

const webhook = (m: Miniflare, event: unknown, headers: Record<string, string> = signed) =>
  post(m, '/checkout/webhook/payment', event, headers);

async function waitFor(pred: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
}

/** A panier of both articles, reserved by one holder. */
async function panier(m: Miniflare, n: string, mode: Mode = 'FULL_PREPAY') {
  const shop = await seedShop(m, n);
  const q1 = await quote(m, shop, 'pv-grp-1', mode);
  const q2 = await quote(m, shop, 'pv-grp-2', mode);
  const holderRef = `holder-grp-${n}`;
  await reserve(m, q1.quoteId, holderRef);
  await reserve(m, q2.quoteId, holderRef);
  return { shop, q1, q2, holderRef, orderIds: [`ord-${q1.quoteId}`, `ord-${q2.quoteId}`] };
}

/* ──────────────────────────────── the walks ──────────────────────────────── */

describe('PAYER-TOUT-1 — one payment for the panier, one order per article, on the real Worker', () => {
  it('the server states ONE total, pays it ONCE, and every order is funded with ITS OWN share; the fee lands once', async () => {
    fulfillmentPosts.length = 0;
    const { q1, q2, holderRef, orderIds } = await panier(mf, '01');
    expect(q1.amountPaidAtCheckout).not.toBe(q2.amountPaidAtCheckout);

    // THE PRICE: the server's own sum of each quote's figure — the phone never adds.
    const price = await post(mf, '/checkout/group/price', { quoteIds: [q1.quoteId, q2.quoteId] });
    expect(price.status, price.text).toBe(200);
    expect(price.json).toEqual({
      paymentMode: 'FULL_PREPAY',
      articles: 2,
      amountPaidAtCheckout: q1.amountPaidAtCheckout + q2.amountPaidAtCheckout,
      amountDueAtDelivery: 0,
      deliveryTotal: q1.deliveryFee + q2.deliveryFee,
      productTotal: q1.buyerTotal - q1.deliveryFee + (q2.buyerTotal - q2.deliveryFee),
    });
    const total = q1.amountPaidAtCheckout + q2.amountPaidAtCheckout;

    // THE PAY: no amount on the wire; one group; two orders, payment_pending.
    const contact = { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'près du marché' };
    const paid = await post(mf, '/checkout/group', { quoteIds: [q2.quoteId, q1.quoteId], holderRef, commandId: 'cmd-grp-01', contact });
    expect(paid.status, paid.text).toBe(200);
    const groupId = String(paid.json['groupId']);
    expect(groupId).toMatch(/^grp-[0-9a-f]{40}$/);
    expect(paid.json['state']).toBe('payment_pending');
    expect(paid.json['amountPaidAtCheckout']).toBe(total);
    const articles = paid.json['articles'] as { orderId: string; state: string; amountPaidAtCheckout: number }[];
    expect(articles.map((a) => a.orderId).sort()).toEqual([...orderIds].sort());
    const commandes = paid.json['commandes'] as { orderId: string; buyerRef: string }[];
    expect(commandes).toHaveLength(2);
    for (const c of commandes) expect(c.buyerRef).toMatch(/^[A-Za-z0-9_-]{32}$/);
    // No economics on the wire: no supplier base, no commission, no net.
    for (const leak of ['sellerBasePrice', 'sellerNet', 'resellerNet', 'resellerMarkup', 'sellerFundedCommission']) {
      expect(paid.text).not.toContain(leak);
    }

    // THE LEDGER, before the webhook: one key for both orders, the group's.
    const before = await Promise.all(orderIds.map((id) => audit(mf, id)));
    const key = await legKey(mf, groupId);
    for (const a of before) {
      expect(a.state).toBe('payment_pending');
      expect(a.legKeys['checkout']).toBe(key.json['legKey']);
      expect(a.escrow).toBeNull();
    }
    // …and the key read by ORDER id names the group, so the founder's tool
    // can be handed either id.
    const byOrder = await legKey(mf, orderIds[0]!);
    expect(byOrder.json).toEqual({ ok: true, legKey: key.json['legKey'], groupId });

    // THE WEBHOOK: the founder's own composition, with a provider fee.
    const event = await confirmation(mf, groupId, total, { fee: 150 });
    const applied = await webhook(mf, event);
    expect(applied.status, applied.text).toBe(200);
    expect(applied.json).toEqual({ status: 'applied', state: 'confirmed' });

    const after = await Promise.all(orderIds.map((id) => audit(mf, id)));
    const byId = new Map(orderIds.map((id, i) => [id, after[i]!]));
    const leg1 = byId.get(`ord-${q1.quoteId}`)!.escrow!.paymentLegs[0]!;
    const leg2 = byId.get(`ord-${q2.quoteId}`)!.escrow!.paymentLegs[0]!;
    expect(byId.get(`ord-${q1.quoteId}`)!.state).toBe('confirmed');
    expect(byId.get(`ord-${q2.quoteId}`)!.state).toBe('confirmed');
    expect(leg1.amount).toBe(q1.amountPaidAtCheckout);
    expect(leg2.amount).toBe(q2.amountPaidAtCheckout);
    expect(leg1.amount + leg2.amount).toBe(total);
    expect(leg1.collectRef).toBe(leg2.collectRef);
    expect(leg1.fee + leg2.fee).toBe(150);
    expect([leg1.fee, leg2.fee].sort()).toEqual([0, 150]);

    // Each order carries its own downstream facts: Boutik+'s order.confirmed
    // (one per article, each its own order and product) and Séra's funding fact.
    await waitFor(() => fulfillmentPosts.length >= 2);
    const emitted = fulfillmentPosts.map((p) => OrderConfirmedEventSchema.parse(p.body).payload);
    expect(emitted.map((e) => e.orderId).sort()).toEqual([...orderIds].sort());
    expect(emitted.map((e) => e.productVersionId).sort()).toEqual(['pv-grp-1', 'pv-grp-2']);
    for (const id of orderIds) {
      const o = await outbox(mf, id);
      expect(o.seraOutbox?.fact).toMatchObject({ orderId: id, status: 'funded' });
    }

    // The public reads: the group, and each order on its own.
    const view = await call(mf, `/checkout/group/${groupId}`);
    expect(view.status).toBe(200);
    expect(view.json['state']).toBe('confirmed');
    for (const id of orderIds) {
      const one = await call(mf, `/checkout/order/${id}`);
      expect(one.json['state']).toBe('confirmed');
    }

    // Both orders entered the dispatch index (the founder's board).
    const dispatch = await mf.getDurableObjectNamespace('DISPATCH');
    const listed = (await (await dispatch.get(dispatch.idFromName('dispatch-orders')).fetch('https://do/list?limit=50')).json()) as {
      orders?: { orderId: string }[];
    };
    for (const id of orderIds) expect(listed.orders?.map((o) => o.orderId)).toContain(id);

    // A REDELIVERY is absorbed by every order: nothing moves, nothing is emitted again.
    const again = await webhook(mf, event);
    expect(again.json).toEqual({ status: 'duplicate', state: 'confirmed' });
    await new Promise((r) => setTimeout(r, 300));
    expect(fulfillmentPosts).toHaveLength(2);

    // A RIVAL confirmation (a fresh command id under our key) is refused and
    // ALERTED on every order — the loudest Contract-§6 class there is.
    const rival = { ...event, envelope: { ...event.envelope, command_id: 'whk-rival-grp-01' } };
    const refused = await webhook(mf, rival);
    expect(refused.status).toBe(409);
    for (const id of orderIds) {
      const a = await audit(mf, id);
      expect(a.reconAlerts.map((x) => x.payload['alert'])).toContain('conflicting_provider_confirmation');
      expect(a.escrow!.paymentLegs).toHaveLength(1);
    }

    // The SAME command replays its answer, byte-stable tokens included.
    const replay = await post(mf, '/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef, commandId: 'cmd-grp-01', contact });
    expect(replay.status, replay.text).toBe(200);
    expect(replay.json['commandes']).toEqual(commandes);

    // A grouped order can never be paid again on its own.
    const single = await post(mf, '/checkout/order', { quoteId: q1.quoteId, holderRef, commandId: 'cmd-single-grp-01' });
    expect(single.status, single.text).toBe(409);
    expect(single.json['error']).toBe('order_in_group');
  });

  it('a provider amount a franc off the sum is refused and alerted; the orders stay unpaid until the true one arrives', async () => {
    const { q1, q2, holderRef, orderIds } = await panier(mf, '02');
    const total = q1.amountPaidAtCheckout + q2.amountPaidAtCheckout;
    const paid = await post(mf, '/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef, commandId: 'cmd-grp-02' });
    expect(paid.status, paid.text).toBe(200);
    const groupId = String(paid.json['groupId']);

    // THE GROUP SURVIVES A PROCESS DEATH: its key, its answer, its orders.
    const keyBefore = (await legKey(mf, groupId)).json['legKey'];
    await restart();
    expect((await legKey(mf, groupId)).json['legKey']).toBe(keyBefore);
    const replayed = await post(mf, '/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef, commandId: 'cmd-grp-02' });
    expect(replayed.json['commandes']).toEqual(paid.json['commandes']);

    const short = await confirmation(mf, groupId, total - 1);
    const refused = await webhook(mf, short);
    expect(refused.status).toBe(422);
    expect(refused.json['error']).toBe('amount_mismatch');
    const one = await audit(mf, orderIds[0]!);
    expect(one.state).toBe('payment_pending');
    expect(one.escrow).toBeNull();
    expect(one.reconAlerts.map((x) => x.payload['alert'])).toContain('provider_amount_contradicts_quote');

    // One ORDER's share, named as if it were the order's own confirmation, is refused too.
    const k = await legKey(mf, groupId);
    const asOrder = composeSandboxConfirmation(orderIds[0]!, q1.amountPaidAtCheckout, new Date().toISOString(), k.json['legKey']);
    const wrong = await webhook(mf, asOrder);
    expect(wrong.json['error']).toBe('wrong_correlation');
    expect((await audit(mf, orderIds[0]!)).state).toBe('payment_pending');

    const right = await webhook(mf, await confirmation(mf, groupId, total));
    expect(right.status, right.text).toBe(200);
    for (const id of orderIds) expect((await audit(mf, id)).state).toBe('confirmed');
  });

  it('one article not held: she is told which one BEFORE anything is created or charged', async () => {
    const shop = await seedShop(mf, '03');
    const q1 = await quote(mf, shop, 'pv-grp-1');
    const q2 = await quote(mf, shop, 'pv-grp-2');
    await reserve(mf, q1.quoteId, 'holder-grp-03');
    const res = await post(mf, '/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef: 'holder-grp-03', commandId: 'cmd-grp-03' });
    expect(res.status).toBe(422);
    expect(res.json).toEqual({ error: 'quote_not_reserved', quoteId: q2.quoteId });
    for (const q of [q1, q2]) expect((await audit(mf, `ord-${q.quoteId}`)).exists).toBe(false);
  });

  it('an order that cannot be born mid-payment ends the attempt for the one already moved, releases its hold, charges nothing', async () => {
    const { q1, q2, holderRef, orderIds } = await panier(mf, '04');
    const sorted = [...orderIds].sort();
    // The second order (by id) already locked to another reseller: its create
    // refuses AFTER the first order was moved to payment_pending.
    const locks = await mf.getDurableObjectNamespace('ATTRIBUTION_LOCK');
    const second = sorted[1]!;
    const lockRes = await locks.get(locks.idFromName(second)).fetch('https://do/lock', {
      method: 'POST',
      body: JSON.stringify({ checkoutRef: second, resellerId: 'rs-someone-else', tokenId: 'tok-other', at: T0 }),
    });
    expect(lockRes.status).toBe(200);
    const res = await post(mf, '/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef, commandId: 'cmd-grp-04' });
    // The same status the single order door answers for this refusal.
    expect(res.status, res.text).toBe(422);
    expect(res.json['error']).toBe('attribution_locked_elsewhere');
    expect(res.json['quoteId']).toBe(second.slice('ord-'.length));
    const first = await audit(mf, sorted[0]!);
    expect(first.state).toBe('payment_failed');
    expect(first.release).not.toBeNull();
    expect(first.escrow).toBeNull();
    expect((await audit(mf, second)).exists).toBe(false);
  });

  it('a panier that is not one boutique, one mode, one destination is refused whole', async () => {
    const shopA = await seedShop(mf, '05');
    const shopB = await seedShop(mf, '06');
    const a1 = await quote(mf, shopA, 'pv-grp-1');
    const aDoor = await quote(mf, shopA, 'pv-grp-2', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const b1 = await quote(mf, shopB, 'pv-grp-2');
    for (const q of [a1, aDoor, b1]) await reserve(mf, q.quoteId, 'holder-grp-05');
    const modes = await post(mf, '/checkout/group/price', { quoteIds: [a1.quoteId, aDoor.quoteId] });
    expect(modes.json).toEqual({ error: 'panier_incoherent' });
    const shops = await post(mf, '/checkout/group', { quoteIds: [a1.quoteId, b1.quoteId], holderRef: 'holder-grp-05', commandId: 'cmd-grp-05' });
    expect(shops.status).toBe(422);
    expect(shops.json['error']).toBe('panier_incoherent');
    expect((await audit(mf, `ord-${a1.quoteId}`)).exists).toBe(false);
    // …and the wire refuses a lone article, a duplicate, and an amount.
    expect((await post(mf, '/checkout/group', { quoteIds: [a1.quoteId], holderRef: 'h', commandId: 'c1' })).status).toBe(400);
    expect((await post(mf, '/checkout/group', { quoteIds: [a1.quoteId, a1.quoteId], holderRef: 'h', commandId: 'c1' })).status).toBe(400);
    const amount = await post(mf, '/checkout/group', { quoteIds: [a1.quoteId, b1.quoteId], holderRef: 'h', commandId: 'c1', amount: 1 });
    expect(amount.json).toEqual({ error: 'unknown_field', field: 'amount' });
  });

  it('pay at the door: the one payment is the delivery fees; each product then at its own door', async () => {
    const { q1, q2, holderRef, orderIds } = await panier(mf, '07', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    expect(q1.amountPaidAtCheckout).toBe(q1.deliveryFee);
    const noContact = await post(mf, '/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef, commandId: 'cmd-grp-07a' });
    expect(noContact.json['error']).toBe('contact_required_for_door');
    const contact = { phone: '70 22 33 44', quartier: 'Dassasgho', repere: 'la boutique bleue' };
    const paid = await post(mf, '/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef, commandId: 'cmd-grp-07', contact });
    expect(paid.status, paid.text).toBe(200);
    expect(paid.json['amountPaidAtCheckout']).toBe(q1.deliveryFee + q2.deliveryFee);
    expect(paid.json['amountDueAtDelivery']).toBe(q1.amountDueAtDelivery + q2.amountDueAtDelivery);
    const groupId = String(paid.json['groupId']);
    const applied = await webhook(mf, await confirmation(mf, groupId, q1.deliveryFee + q2.deliveryFee));
    expect(applied.status, applied.text).toBe(200);
    for (const id of orderIds) {
      const a = await audit(mf, id);
      expect(a.state).toBe('confirmed');
      expect(a.doorLeg).toBe('due');
      // Her door, per article, under the SAME holder that paid the panier.
      const door = await post(mf, `/checkout/order/${id}/door-charge`, { holderRef, commandId: `cmd-door-${id.slice(-6)}` });
      expect(door.status, door.text).toBe(200);
      expect((await audit(mf, id)).legKeys['door']).toMatch(/^pk-/);
    }
  });

  it('the charge times out: every order fails and frees its hold; the retry charges the SAME key and confirms', async () => {
    slow = makeMf(persistSlow, JSON.stringify({ timeoutFirstNInitiates: 1 }));
    const { q1, q2, holderRef, orderIds } = await panier(slow, '08');
    const total = q1.amountPaidAtCheckout + q2.amountPaidAtCheckout;
    const first = await post(slow, '/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef, commandId: 'cmd-grp-08a' });
    expect(first.status, first.text).toBe(200);
    expect(first.json['state']).toBe('payment_failed');
    const groupId = String(first.json['groupId']);
    const key1 = (await legKey(slow, groupId)).json['legKey'];
    for (const id of orderIds) {
      const a = await audit(slow, id);
      expect(a.state).toBe('payment_failed');
      expect(a.release).not.toBeNull();
      expect(a.attempts.at(-1)?.outcome).toBe('timeout');
    }

    // She tries again: fresh holds, a new command — the SAME collection key.
    await reserve(slow, q1.quoteId, holderRef);
    await reserve(slow, q2.quoteId, holderRef);
    const second = await post(slow, '/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef, commandId: 'cmd-grp-08b' });
    expect(second.status, second.text).toBe(200);
    expect(second.json['state']).toBe('payment_pending');
    expect((await legKey(slow, groupId)).json['legKey']).toBe(key1);
    for (const id of orderIds) {
      const a = await audit(slow, id);
      expect(a.attempts).toHaveLength(2);
      expect(new Set(a.attempts.map((x) => x.providerKey))).toEqual(new Set([key1]));
    }
    const applied = await webhook(slow, await confirmation(slow, groupId, total));
    expect(applied.status, applied.text).toBe(200);
    for (const id of orderIds) expect((await audit(slow, id)).state).toBe('confirmed');
  });

  it('the SAME pay command sent again after a mid-payment refusal RETRIES the order it had moved; the one charge funds every order, no late alert', async () => {
    // Verifier BLOCKER 1: the order answered the repeated command from its OLD
    // saved reply (« payment_pending ») while it had failed, and the group
    // charged for an order that would refuse the money.
    let m = makeMf(persistRejeu);
    rejeu = m;
    const { q1, q2, holderRef, orderIds } = await panier(m, '09');
    const [premier, second] = [...orderIds].sort() as [string, string];
    const locks = await m.getDurableObjectNamespace('ATTRIBUTION_LOCK');
    const lockHex = locks.idFromName(second).toString();
    const lockRes = await locks.get(locks.idFromName(second)).fetch('https://do/lock', {
      method: 'POST',
      body: JSON.stringify({ checkoutRef: second, resellerId: 'rs-someone-else', tokenId: 'tok-other', at: T0 }),
    });
    expect(lockRes.status).toBe(200);
    const quoteIds = [q1.quoteId, q2.quoteId];
    const first = await post(m, '/checkout/group', { quoteIds, holderRef, commandId: 'cmd-grp-09' });
    expect(first.status, first.text).toBe(422);
    expect(first.json['error']).toBe('attribution_locked_elsewhere');
    expect((await audit(m, premier)).state).toBe('payment_failed');

    // The collision clears: a real restart with that one lock gone from storage
    // — the stand-in for any refusal that does not last (a busy object, a 503).
    await m.dispose();
    const effaces = effacerObjet(persistRejeu, lockHex);
    expect(effaces).toBeGreaterThan(0);
    m = makeMf(persistRejeu);
    rejeu = m;

    // She goes back and pays again: her first article held afresh, the SAME command.
    await reserve(m, (premier === `ord-${q1.quoteId}` ? q1 : q2).quoteId, holderRef);
    const again = await post(m, '/checkout/group', { quoteIds, holderRef, commandId: 'cmd-grp-09' });
    expect(again.status, again.text).toBe(200);
    const groupId = String(again.json['groupId']);
    expect(again.json['state']).toBe('payment_pending');
    // THE LEDGER: the first order was RETRIED under this attempt, not answered from its old reply.
    const a1 = await audit(m, premier);
    expect(a1.state).toBe('payment_pending');
    expect(a1.attempts).toHaveLength(2);
    expect((await audit(m, second)).state).toBe('payment_pending');

    const total = q1.amountPaidAtCheckout + q2.amountPaidAtCheckout;
    const applied = await webhook(m, await confirmation(m, groupId, total));
    expect(applied.status, applied.text).toBe(200);
    for (const id of orderIds) {
      const a = await audit(m, id);
      expect(a.state).toBe('confirmed');
      expect(a.reconAlerts).toEqual([]);
    }
  });

  it('the group doors are closed without the binding, and a group webhook without the secret never routes', async () => {
    sansGroupe = makeMf(persistSansGroupe, undefined, false);
    const res = await post(sansGroupe, '/checkout/group/price', { quoteIds: ['q-a', 'q-b'] });
    expect(res.status).toBe(503);
    expect(res.json['error']).toBe('paiement_groupe_indisponible');
    const unsigned = await webhook(mf, { name: 'payment.checkout_leg_confirmed.v1' }, { 'Content-Type': 'application/json' });
    expect(unsigned.status).toBe(401);
  });
});
