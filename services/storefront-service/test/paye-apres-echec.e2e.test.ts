import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { afterAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, cleC, seance, boutiqueDe } from './seance';

/**
 * ═══ MONEY THE PROVIDER CONFIRMS AFTER HER PAYMENT FAILED COMES BACK IN FULL ═══
 *
 * Shop-Plus-Build-Spec §7 SP6 (founder ruling 2026-11-28, « Refund it
 * automatically »): « when the provider's confirmation of a checkout charge
 * reaches an order that reads `payment_failed` … because the attempt ended
 * here (a time-out, a refused echo) while the provider in fact collected,
 * that money never pays the order. The charge is refunded under its own
 * refund key, for exactly the amount the order asked the provider for, to the
 * franc (a grouped collection: each order its own share) … a confirmation
 * naming any other amount is not refunded by itself and stays on the
 * founder's console. Once that refund is asked, no retry of the order charges
 * again. … the order reads `refunded` only then. »
 *
 * The real combined Worker under Miniflare. The certified sandbox provider's
 * own time-out knob makes every first charge time out here WHILE the provider
 * collects (`timeoutCollects`); the confirmations and refund confirmations are
 * the certified mock's own events. Every outcome is asked of the LEDGER (the
 * order's audit, the founder's dispatch row, her own view) — never of a
 * door's answer alone. « No charge initiated » is proven by the durable
 * attempt record each initiate writes before the provider is called, and by
 * an unchanged input log.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'paye-apres-echec-'));
const T0 = '2026-11-28T08:00:00.000Z';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-p14-0001';
const signe = { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET };
/** The certified sandbox's time-out knob: the charge times out here, the provider took the money. */
const COLLECTE = { timeoutFirstNInitiates: 1, timeoutCollects: true };
const LIMITE = 60_000;
const INTAKE_SECRET = 'test-sera-intake-secret-p14-0001';
const ARM_SECRET = 'test-shop-arm-secret-p14-0001';
const FULFILL_SECRET = 'test-fulfillment-secret-p14-0001';
const ARM_KIND = ['buyer', 'drop', 'code'].join('_');

/**
 * EVERY CALL THAT COULD START AN ORDER'S JOURNEY, as it left the Worker: the
 * supplier's binding, Séra's intake (every outbound fetch lands here) and
 * custody's binding. Recorded with the body's text, so a call naming an
 * order is found whatever field carries it.
 */
const departs: { vers: 'boutik' | 'sera' | 'custody'; path: string; corps: string }[] = [];
const nommant = (orderId: string) => departs.filter((d) => d.corps.includes(orderId));

/** Two articles: 2 000 + 333 + 1 000 = 3 333 F, and 10 000 + 1 500 + 1 000 = 12 500 F. */
const SUPPLY = [
  {
    productVersionId: 'pv-pae-1',
    offerVersion: 'ov-pae-1',
    basePrice: 2_000,
    resellerCommission: 200,
    available: 40,
    productName: 'Pagne tissé',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
  {
    productVersionId: 'pv-pae-2',
    offerVersion: 'ov-pae-2',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 40,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];
const MARGES: Record<string, number> = { 'pv-pae-1': 333, 'pv-pae-2': 1_500 };

function makeMf(): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
      DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
      PAYMENT_GROUP: 'PaymentGroupDO', DLQ: 'DeadLetterDO',
    },
    durableObjectsPersist: persist,
    bindings: {
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      CHECKOUT_OPS_SECRET: OPS_SECRET,
      PAYMENT_SANDBOX_BEHAVIOR: JSON.stringify(COLLECTE),
      SERA_INTAKE_BASE: 'https://sera-intake.p14.test',
      SERA_INTAKE_SECRET: INTAKE_SECRET,
      SHOP_ARM_SECRET: ARM_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
    },
    // Séra's intake: the funding fact is the Worker's one outbound fetch.
    outboundService: async (request: Request) => {
      const corps = await request.text();
      departs.push({ vers: 'sera', path: new URL(request.url).pathname, corps });
      if (request.headers.get('Authorization') !== `Bearer ${INTAKE_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
      const fact = safeJson(corps);
      return Response.json({ ok: true, orderId: fact['orderId'], applied: true });
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path.startsWith('/fulfillment/')) {
          departs.push({ vers: 'boutik', path, corps: await request.clone().text() });
        }
        if (request.method === 'POST' && path === '/fulfillment/order-confirmed') return Response.json({ ok: true, status: 'registered' });
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
      CUSTODY: async (request: Request) => {
        const path = new URL(request.url).pathname;
        const corps = await request.text();
        departs.push({ vers: 'custody', path, corps });
        if (request.headers.get('Authorization') !== `Bearer ${ARM_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
        if (request.method === 'POST' && path === '/produce-shop/secrets/arm') {
          return Response.json({ ok: true, status: 'armed', kind: ARM_KIND });
        }
        return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
      },
    },
  });
}

let mf = makeMf();
afterAll(async () => {
  await mf.dispose();
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ligne { legType: string; collectRef: string; amount: number; refundKey: string; etat: string }
interface Audit {
  state: string;
  inputCount: number;
  legKeys: Record<string, string>;
  attempts: { attemptId: string; providerKey: string; outcome: string }[];
  escrow: { paymentLegs: { legType: string; amount: number; fee: number; collectRef: string; status: string }[] } | null;
  remboursement: { decision: string; refus: { nature: string } | null; retenu: number; lignes: Ligne[] } | null;
  refunds: { amount: number; refundKey: string; collectRef: string }[];
  reconAlerts: { name: string; payload: Record<string, unknown> }[];
}
async function audit(orderId: string): Promise<Audit> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  return (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as Audit;
}
async function jusqua(orderId: string, ok: (a: Audit) => boolean, deadlineMs = 10_000): Promise<Audit> {
  const start = Date.now();
  let a = await audit(orderId);
  while (!ok(a) && Date.now() - start < deadlineMs) {
    await sleep(100);
    a = await audit(orderId);
  }
  return a;
}
const alertes = (a: Audit) => a.reconAlerts.map((x) => String(x.payload['alert'] ?? x.payload['stuck_in']));

/** Her own view, under the token her create answered. */
const jetons = new Map<string, string>();
async function vue(orderId: string): Promise<Record<string, unknown>> {
  const jeton = jetons.get(orderId);
  if (jeton === undefined) throw new Error(`no buyer token kept for ${orderId}`);
  return (await call(`/checkout/order/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${jeton}` } })).json;
}

/** The founder's key-C row, through the Worker's own dispatch door. */
async function ligneDispatch(orderId: string): Promise<Record<string, unknown> | undefined> {
  let cursor: string | undefined;
  for (;;) {
    const body = (await call(`/checkout/dispatch?limit=40${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`, { headers: cleC })).json;
    const r = ((body['orders'] as Record<string, unknown>[]) ?? []).find((x) => x['orderId'] === orderId);
    if (r !== undefined) return r;
    if (typeof body['next'] !== 'string') return undefined;
    cursor = body['next'];
  }
}

let seq = 0;
const rk = (): string => `rk-pae-${String((seq += 1)).padStart(4, '0')}-${'z'.repeat(10)}`;

/** One boutique selling both articles. */
async function boutique(n: string) {
  const S = await seance(mf, `pae${n}`);
  const B = boutiqueDe(S, 'PAE');
  const created = await post('/storefronts', {
    commandId: `cmd-create-${n}`, id: B.id, resellerId: S.accountId, shortCode: B.shortCode,
    name: 'Boutique de Aïcha', zone: 'Ouagadougou', category: 'Général', correlationId: `corr-pae-${n}`, at: T0,
  }, S.bearer);
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${created.text}`);
  await post(`/storefronts/${encodeURIComponent(B.id)}/publish`, { correlationId: 'corr-en-ligne' }, S.bearer);
  for (const v of SUPPLY) {
    const pub = await post('/listings', {
      commandId: `cmd-listing-${n}-${v.productVersionId}`, listingId: `lst-pae-${n}-${v.productVersionId}`, storefrontId: B.id,
      resellerId: S.accountId, productVersionId: v.productVersionId, offerVersion: v.offerVersion,
      markup: MARGES[v.productVersionId], correlationId: `corr-pae-${n}`, at: T0,
    }, S.bearer);
    if (pub.json['status'] !== 'published') throw new Error(`setup: listing ${pub.text}`);
  }
  return { slug: B.slug, resellerId: S.accountId, session: S.session };
}
async function devis(shop: { slug: string; resellerId: string }, pid: string) {
  const q = await post('/checkout/quote', { slug: shop.slug, pid, paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: shop.resellerId, requestKey: rk() });
  if (typeof q.json['quoteId'] !== 'string') throw new Error(`setup: quote ${q.status} ${q.text}`);
  return q.json as { quoteId: string; amountPaidAtCheckout: number };
}
async function reserver(quoteId: string, holderRef: string) {
  const r = await post(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, { commandId: `cmd-rsv-${rk()}`, holderRef });
  if (r.status !== 200) throw new Error(`setup: reserve ${r.status} ${r.text}`);
}

/** Her road to an order whose first charge timed out here while the provider collected 3 333 F. */
async function commandeEchouee(n: string) {
  const shop = await boutique(n);
  const q = await devis(shop, 'pv-pae-1');
  expect(q.amountPaidAtCheckout, 'the order asks the provider for 3 333 F').toBe(3_333);
  const holderRef = `holder-pae-${n}`;
  await reserver(q.quoteId, holderRef);
  const created = await post('/checkout/order', { quoteId: q.quoteId, holderRef, commandId: `cmd-order-${n}` });
  expect(created.status, created.text).toBe(200);
  const orderId = `ord-${q.quoteId}`;
  jetons.set(orderId, String(created.json['buyerRef']));
  const a = await audit(orderId);
  expect(a.state, 'the charge timed out here').toBe('payment_failed');
  expect(a.attempts.map((x) => x.outcome)).toEqual(['timeout']);
  expect(a.escrow).toBeNull();
  expect(a.remboursement).toBeNull();
  return { orderId, quoteId: q.quoteId, holderRef, key: a.legKeys['checkout']! };
}

/** The certified mock's own confirmation of what it collected under this key. */
function confirmation(orderId: string, key: string, amount: number, payload: Record<string, unknown> = {}, correlationId = `corr-${orderId}`) {
  const provider = new MockPaymentProvider(COLLECTE);
  expect(provider.initiateCharge({ orderId, paymentAttemptId: key, amount, correlationId, requestedAtIso: T0, legType: 'checkout' }).outcome).toBe('timeout');
  const event = provider.webhookDeliveryPlan()[0]!.event;
  return { ...event, payload: { ...event.payload, ...payload } };
}
const webhook = (event: unknown) => post('/checkout/webhook/payment', event, signe);

/** The refunds the order asked, read behind the webhook key, then confirmed by the certified mock. */
async function demandes(orderId: string): Promise<{ legType: 'checkout' | 'door'; refundKey: string; amount: number; collectRef: string }[]> {
  let r = await call(`/checkout/webhook/refund-key/${encodeURIComponent(orderId)}`, { headers: signe });
  for (let i = 0; i < 100 && r.status !== 200; i += 1) {
    await sleep(100);
    r = await call(`/checkout/webhook/refund-key/${encodeURIComponent(orderId)}`, { headers: signe });
  }
  expect(r.status, `the refund was asked of the provider: ${r.text}`).toBe(200);
  return r.json['remboursements'] as { legType: 'checkout' | 'door'; refundKey: string; amount: number; collectRef: string }[];
}
function confirmationRemboursement(orderId: string, d: { legType: 'checkout' | 'door'; refundKey: string; amount: number; collectRef: string }) {
  const provider = new MockPaymentProvider({});
  expect(provider.initiateRefund({ orderId, refundKey: d.refundKey, collectRef: d.collectRef, amount: d.amount, correlationId: `corr-${orderId}`, requestedAtIso: T0, legType: d.legType }).outcome).toBe('accepted');
  return provider.webhookDeliveryPlan().find((x) => x.event.name === 'payment.refund_confirmed.v1')!.event;
}
const webhookRemboursement = (event: unknown) => post('/checkout/webhook/refund', event, signe);

/* ──────────────────────────────── one order ──────────────────────────────── */

describe('one order: the payment failed here, the provider collected 3 333 F', () => {
  it('the genuine confirmation is taken (200), held as her money, and one refund line of 3 333 F is stored under its own key; the founder still reads the alert', async () => {
    const o = await commandeEchouee('0001');
    const r = await webhook(confirmation(o.orderId, o.key, 3_333));
    expect(`${r.status} ${String(r.json['status'])}`, r.text).toBe('200 applied');

    const a = await audit(o.orderId);
    expect(a.state, 'that money never pays the order').toBe('payment_failed');
    expect(a.escrow?.paymentLegs).toEqual([
      expect.objectContaining({ legType: 'checkout', amount: 3_333, collectRef: `collect-${o.key}` }),
    ]);
    expect(a.remboursement).toMatchObject({ decision: 'ouvert', refus: { nature: 'paiement_apres_echec' }, retenu: 0 });
    expect(a.remboursement!.lignes).toHaveLength(1);
    expect(a.remboursement!.lignes[0]).toMatchObject({ legType: 'checkout', amount: 3_333, collectRef: `collect-${o.key}` });
    expect(a.remboursement!.lignes[0]!.refundKey).toMatch(/^rf-/);
    expect(a.refunds).toEqual([]);
    expect(alertes(a)).toEqual(['genuine_webhook_after_local_failure']);

    const row = await ligneDispatch(o.orderId);
    expect(row?.['state']).toBe('payment_failed');
    expect(row?.['remboursement'], 'the founder\'s row names the refund').toEqual({ etat: 'en_cours' });
    const v = await vue(o.orderId);
    expect(v['state']).toBe('payment_failed');
    expect(v['remboursement']).toEqual({ etat: 'en_cours', montant: 3_333, motif: 'paiement' });
  }, LIMITE);

  it('a redelivered confirmation is absorbed: nothing new is written, no second line, no second key', async () => {
    const o = await commandeEchouee('0002');
    const event = confirmation(o.orderId, o.key, 3_333);
    expect((await webhook(event)).status).toBe(200);
    const avant = await audit(o.orderId);
    const again = await webhook(event);
    expect(`${again.status} ${String(again.json['status'])}`, again.text).toBe('200 duplicate');
    const apres = await audit(o.orderId);
    expect(apres.inputCount).toBe(avant.inputCount);
    expect(JSON.stringify(apres.escrow)).toBe(JSON.stringify(avant.escrow));
    expect(apres.remboursement!.lignes.map((l) => [l.refundKey, l.amount, l.collectRef])).toEqual(avant.remboursement!.lignes.map((l) => [l.refundKey, l.amount, l.collectRef]));
    expect(apres.reconAlerts).toHaveLength(avant.reconAlerts.length);
  }, LIMITE);

  it('once the refund is asked, « Payer » again is refused by name and no charge is initiated', async () => {
    const o = await commandeEchouee('0003');
    const late = await webhook(confirmation(o.orderId, o.key, 3_333));
    const avant = await audit(o.orderId);
    await reserver(o.quoteId, o.holderRef);
    const retry = await post('/checkout/order', { quoteId: o.quoteId, holderRef: o.holderRef, commandId: 'cmd-order-0003-retry' });
    expect(`${retry.status} ${String(retry.json['error'])}`, retry.text).toBe('409 paiement_rembourse');
    const apres = await audit(o.orderId);
    expect(apres.attempts, 'the durable record every initiate writes first holds no new attempt').toHaveLength(1);
    expect(apres.inputCount).toBe(avant.inputCount);
    expect(apres.state).toBe('payment_failed');
    // Asserted last so a failure above names the retry: the refund WAS asked first.
    expect(late.status, late.text).toBe(200);
    expect(apres.remboursement!.lignes).toHaveLength(1);
  }, LIMITE);

  it('the provider confirms the refund: the order reads `refunded`, the row « fait »; redelivered, nothing moves; a fresh confirmation of the same charge never makes it paid', async () => {
    const o = await commandeEchouee('0004');
    expect((await webhook(confirmation(o.orderId, o.key, 3_333))).status).toBe(200);
    const [d] = await demandes(o.orderId);
    expect(d).toMatchObject({ legType: 'checkout', amount: 3_333, collectRef: `collect-${o.key}` });
    expect((await audit(o.orderId)).state, 'asked is not refunded').toBe('payment_failed');
    expect((await ligneDispatch(o.orderId))?.['remboursement']).toEqual({ etat: 'en_cours' });

    const confirme = confirmationRemboursement(o.orderId, d!);
    const r = await webhookRemboursement(confirme);
    expect(r.status, r.text).toBe(200);
    const a = await audit(o.orderId);
    expect(a.state).toBe('refunded');
    expect(a.refunds).toEqual([expect.objectContaining({ amount: 3_333, refundKey: d!.refundKey, collectRef: `collect-${o.key}` })]);
    expect((await ligneDispatch(o.orderId))?.['remboursement']).toEqual({ etat: 'fait' });
    expect((await vue(o.orderId))['remboursement']).toEqual({ etat: 'fait', montant: 3_333, motif: 'paiement' });

    const deux = await webhookRemboursement(confirme);
    expect(`${deux.status} ${String(deux.json['status'])}`, deux.text).toBe('200 duplicate');
    expect((await audit(o.orderId)).refunds).toHaveLength(1);

    // A FRESH command id naming the same charge, the right amount: nothing changes, never back to paid.
    const frais = confirmation(o.orderId, o.key, 3_333);
    const rival = { ...frais, envelope: { ...frais.envelope, command_id: `whk-fresh-${o.orderId}` } };
    const answer = await webhook(rival);
    expect(`${answer.status} ${String(answer.json['error'])}`, answer.text).toBe('409 out_of_order');
    const fin = await audit(o.orderId);
    expect(fin.state).toBe('refunded');
    expect(fin.escrow!.paymentLegs).toHaveLength(1);
    expect(fin.remboursement!.lignes.map((l) => l.refundKey)).toEqual([d!.refundKey]);
    expect(fin.refunds).toHaveLength(1);
  }, LIMITE);

  it('a confirmation for ANY other amount is not refunded by itself: no line, the alert stands on the founder\'s row', async () => {
    const o = await commandeEchouee('0005');
    const r = await webhook(confirmation(o.orderId, o.key, 3_334));
    expect(`${r.status} ${String(r.json['error'])}`, r.text).toBe('409 out_of_order');
    await sleep(500);
    const a = await audit(o.orderId);
    expect(a.state).toBe('payment_failed');
    expect(a.escrow).toBeNull();
    expect(a.remboursement).toBeNull();
    expect(alertes(a)).toEqual(['genuine_webhook_after_local_failure']);
    expect(a.reconAlerts[0]!.payload['provider_amount']).toBe(3_334);
    const row = await ligneDispatch(o.orderId);
    expect(row?.['remboursement']).toBeNull();
    expect(((row?.['aVerifier'] as { elements: { classe: string }[] } | null)?.elements ?? []).map((e) => e.classe)).toEqual(['genuine_webhook_after_local_failure']);
    expect((await vue(o.orderId))['remboursement']).toBeUndefined();
  }, LIMITE);

  it('a refund confirmation for a failed order that asked no refund is refused, and nothing reaches the ledger', async () => {
    const o = await commandeEchouee('0006');
    const r = await webhookRemboursement(confirmationRemboursement(o.orderId, { legType: 'checkout', refundKey: 'rf-never-asked', amount: 3_333, collectRef: `collect-${o.key}` }));
    expect(r.status, r.text).not.toBe(200);
    expect(r.json['error']).toBe('refund_key_unknown');
    const a = await audit(o.orderId);
    expect(a.refunds).toEqual([]);
    expect(a.state).toBe('payment_failed');
  }, LIMITE);

  it('a provider fee on the confirmation never comes off her refund: the line is the full 3 333 F', async () => {
    const o = await commandeEchouee('0007');
    expect((await webhook(confirmation(o.orderId, o.key, 3_333, { fee: 150 }))).status).toBe(200);
    const a = await audit(o.orderId);
    expect(a.escrow?.paymentLegs[0]).toMatchObject({ amount: 3_333, fee: 150 });
    expect(a.remboursement?.lignes.map((l) => l.amount)).toEqual([3_333]);
    expect((await vue(o.orderId))['remboursement']).toMatchObject({ montant: 3_333 });
  }, LIMITE);

  it('after a process death, the order rebuilt from its stored log holds the same ledger and the same refund, byte for byte', async () => {
    const o = await commandeEchouee('0008');
    expect((await webhook(confirmation(o.orderId, o.key, 3_333, { fee: 40 }))).status).toBe(200);
    await demandes(o.orderId);
    const avant = await audit(o.orderId);
    expect(avant.remboursement?.lignes).toHaveLength(1);
    await mf.dispose();
    mf = makeMf();
    const apres = await audit(o.orderId);
    for (const champ of ['state', 'inputCount', 'escrow', 'remboursement', 'refunds', 'reconAlerts'] as const) {
      expect(JSON.stringify(apres[champ]), champ).toBe(JSON.stringify(avant[champ]));
    }
  }, LIMITE);
});

/* ──────────────────────────── a grouped collection ──────────────────────────── */

async function panierEchoue(n: string) {
  const shop = await boutique(n);
  const q1 = await devis(shop, 'pv-pae-1');
  const q2 = await devis(shop, 'pv-pae-2');
  expect([q1.amountPaidAtCheckout, q2.amountPaidAtCheckout]).toEqual([3_333, 12_500]);
  const holderRef = `holder-pae-grp-${n}`;
  await reserver(q1.quoteId, holderRef);
  await reserver(q2.quoteId, holderRef);
  const first = await post('/checkout/group', { quoteIds: [q1.quoteId, q2.quoteId], holderRef, commandId: `cmd-grp-${n}` });
  expect(first.status, first.text).toBe(200);
  expect(first.json['state'], 'the collection timed out here').toBe('payment_failed');
  const groupId = String(first.json['groupId']);
  for (const c of (first.json['commandes'] as { orderId: string; buyerRef: string }[]) ?? []) jetons.set(c.orderId, c.buyerRef);
  const key = (await call(`/checkout/webhook/leg-key/${encodeURIComponent(groupId)}?leg=checkout`, { headers: signe })).json['legKey'] as string;
  const parts = [
    { orderId: `ord-${q1.quoteId}`, amount: 3_333 },
    { orderId: `ord-${q2.quoteId}`, amount: 12_500 },
  ];
  for (const p of parts) expect((await audit(p.orderId)).state).toBe('payment_failed');
  return { groupId, key, parts, holderRef, quoteIds: [q1.quoteId, q2.quoteId], shop };
}

describe('a grouped collection of two orders: the charge failed here, the provider collected 15 833 F', () => {
  it('each order holds its own share against the collection\'s reference, each refund its own amount under its own key; the panier\'s retry is refused before any charge; each reads `refunded` on its confirmation', async () => {
    const g = await panierEchoue('0101');
    const r = await webhook(confirmation(g.groupId, g.key, 15_833, {}, `corr-${g.groupId}`));
    expect(`${r.status} ${String(r.json['status'])}`, r.text).toBe('200 applied');

    const cles = new Set<string>();
    for (const p of g.parts) {
      const a = await audit(p.orderId);
      expect(a.state, p.orderId).toBe('payment_failed');
      expect(a.escrow?.paymentLegs, p.orderId).toEqual([expect.objectContaining({ legType: 'checkout', amount: p.amount, collectRef: `collect-${g.key}` })]);
      expect(a.remboursement?.lignes, p.orderId).toEqual([expect.objectContaining({ legType: 'checkout', amount: p.amount, collectRef: `collect-${g.key}` })]);
      cles.add(a.remboursement!.lignes[0]!.refundKey);
      expect((await vue(p.orderId))['remboursement']).toEqual({ etat: 'en_cours', montant: p.amount, motif: 'paiement' });
    }
    expect(cles.size, 'each order its own refund key').toBe(2);

    const avant = await Promise.all(g.parts.map((p) => audit(p.orderId)));
    for (const q of g.quoteIds) await reserver(q, g.holderRef);
    const retry = await post('/checkout/group', { quoteIds: g.quoteIds, holderRef: g.holderRef, commandId: 'cmd-grp-0101-retry' });
    expect(`${retry.status} ${String(retry.json['error'])}`, retry.text).toBe('409 paiement_rembourse');
    for (const [i, p] of g.parts.entries()) {
      const a = await audit(p.orderId);
      expect(a.attempts, p.orderId).toHaveLength(avant[i]!.attempts.length);
      expect(a.inputCount, p.orderId).toBe(avant[i]!.inputCount);
      expect(a.state).toBe('payment_failed');
    }

    for (const p of g.parts) {
      const [d] = await demandes(p.orderId);
      expect(d).toMatchObject({ amount: p.amount, collectRef: `collect-${g.key}` });
      expect((await webhookRemboursement(confirmationRemboursement(p.orderId, d!))).status).toBe(200);
      const a = await audit(p.orderId);
      expect(a.state).toBe('refunded');
      expect(a.refunds).toEqual([expect.objectContaining({ amount: p.amount, refundKey: d!.refundKey })]);
      expect((await ligneDispatch(p.orderId))?.['remboursement']).toEqual({ etat: 'fait' });
    }
  }, LIMITE);

  it('a collection confirmed for any other total is not refunded by itself: no line on either order', async () => {
    const g = await panierEchoue('0102');
    const r = await webhook(confirmation(g.groupId, g.key, 15_834, {}, `corr-${g.groupId}`));
    expect(r.status, r.text).toBe(409);
    await sleep(500);
    for (const p of g.parts) {
      const a = await audit(p.orderId);
      expect(a.escrow, p.orderId).toBeNull();
      expect(a.remboursement, p.orderId).toBeNull();
      expect(alertes(a), p.orderId).toEqual(['genuine_webhook_after_local_failure']);
    }
  }, LIMITE);
});

/* ─────────────── money that never pays the order starts nothing ─────────────── */

/** An order's own read door, status and body. */
async function doLire(orderId: string, path: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch(`https://do${path}`);
  return { status: res.status, json: safeJson(await res.text()) };
}
/** The rows her feed's book holds for her. */
async function lignesDuFil(resellerId: string): Promise<string[]> {
  const ns = await mf.getDurableObjectNamespace('RESELLER');
  const res = await ns.get(ns.idFromName('reseller-feed')).fetch('https://do/rows', { method: 'POST', body: JSON.stringify({ resellerId }) });
  return ((safeJson(await res.text())['orders'] as { orderId: string }[] | undefined) ?? []).map((o) => o.orderId);
}
/** Her sales, through her own session door. */
async function ventesDe(session: string): Promise<string[]> {
  const r = await call('/reseller/ventes', { headers: { Authorization: `Bearer ${session}` } });
  expect(r.status, r.text).toBe(200);
  expect(r.json['incomplet'], 'her feed read every row it holds').toBe(false);
  return ((r.json['ventes'] as { orderId: string }[] | undefined) ?? []).map((v) => v.orderId);
}
/** The founder's earnings, through his key-C door, every page. */
async function gainsDuFondateur(): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const body = (await call(`/checkout/gains?limit=40${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`, { headers: cleC })).json;
    expect(body['ok'], JSON.stringify(body)).toBe(true);
    for (const g of (body['gains'] as { orderId: string }[] | undefined) ?? []) ids.push(g.orderId);
    if (typeof body['next'] !== 'string') return ids;
    cursor = body['next'];
  }
}
/** Before her payment: the producer's hold her order asks for when it is born. */
const avantPaiement = (orderId: string) => nommant(orderId).map((d) => `${d.vers} ${d.path}`);
/** Nothing the late money could start: no call after it, nothing armed, recorded or settled. */
async function rienDemarre(orderId: string, avant: number): Promise<void> {
  expect(nommant(orderId).slice(avant), `no call left the Worker naming ${orderId} after the late confirmation`).toEqual([]);
  const boite = await doLire(orderId, '/entry/outbox');
  expect(`${boite.status} ${String(boite.json['reason'])}`, 'no supplier wire was ever written').toBe('404 no_outbox');
  const g = (await doLire(orderId, '/entry/gains')).json;
  expect([g['state'], g['livree'], g['obligations']], 'no settlement record').toEqual(['payment_failed', false, []]);
}

describe('money that never pays the order starts nothing — while an order paid on its retry, in the same Worker, starts all of it', () => {
  it('one order: no supplier told, nothing to Séra, no custody armed, no sale in her feed, no row in the founder\'s earnings, no settlement', async () => {
    const shop = await boutique('0201');

    const q = await devis(shop, 'pv-pae-1');
    await reserver(q.quoteId, 'holder-pae-0201');
    expect((await post('/checkout/order', { quoteId: q.quoteId, holderRef: 'holder-pae-0201', commandId: 'cmd-order-0201' })).status).toBe(200);
    const tard = `ord-${q.quoteId}`;
    const a0 = await audit(tard);
    expect(a0.state).toBe('payment_failed');
    expect(avantPaiement(tard), 'her order\'s birth asked the producer\'s hold, nothing else').toEqual(['boutik /fulfillment/stock-hold']);
    const r = await webhook(confirmation(tard, a0.legKeys['checkout']!, 3_333));
    expect(`${r.status} ${String(r.json['status'])}`, r.text).toBe('200 applied');
    // Her refund is asked: the alarm that asks it flushes every wire this order holds.
    await demandes(tard);

    // THE CONTROL — same boutique, its first charge timed out too, retried, then confirmed.
    const q2 = await devis(shop, 'pv-pae-2');
    await reserver(q2.quoteId, 'holder-pae-0201-t');
    expect((await post('/checkout/order', { quoteId: q2.quoteId, holderRef: 'holder-pae-0201-t', commandId: 'cmd-order-0201-t1' })).status).toBe(200);
    const temoin = `ord-${q2.quoteId}`;
    expect((await audit(temoin)).state).toBe('payment_failed');
    await reserver(q2.quoteId, 'holder-pae-0201-t');
    const retry = await post('/checkout/order', { quoteId: q2.quoteId, holderRef: 'holder-pae-0201-t', commandId: 'cmd-order-0201-t2' });
    expect(retry.status, retry.text).toBe(200);
    const paid = await webhook(confirmation(temoin, (await audit(temoin)).legKeys['checkout']!, 12_500));
    expect(`${paid.status} ${String(paid.json['status'])}`, paid.text).toBe('200 applied');
    expect((await audit(temoin)).state).toBe('confirmed');
    const deadline = Date.now() + 10_000;
    const routes = () => nommant(temoin).filter((d) => d.path !== '/fulfillment/stock-hold').map((d) => `${d.vers} ${d.path}`).sort();
    while (routes().length < 3 && Date.now() < deadline) await sleep(100);
    expect(routes(), 'the control reached the supplier, Séra and custody').toEqual([
      'boutik /fulfillment/order-confirmed',
      'custody /produce-shop/secrets/arm',
      'sera /intake/funding',
    ]);
    expect((await doLire(temoin, '/entry/outbox')).status).toBe(200);
    expect(await lignesDuFil(shop.resellerId)).toEqual([temoin]);
    expect(await ventesDe(shop.session)).toEqual([temoin]);
    expect(await gainsDuFondateur()).toContain(temoin);

    // THE LATE MONEY — none of it.
    await rienDemarre(tard, 1);
    expect(await gainsDuFondateur()).not.toContain(tard);
    expect((await audit(tard)).state).toBe('payment_failed');
  }, LIMITE);

  it('a grouped collection: neither order tells anyone anything, enters her feed, the earnings or a settlement', async () => {
    const g = await panierEchoue('0202');
    for (const p of g.parts) expect(avantPaiement(p.orderId), p.orderId).toEqual(['boutik /fulfillment/stock-hold']);
    const r = await webhook(confirmation(g.groupId, g.key, 15_833, {}, `corr-${g.groupId}`));
    expect(`${r.status} ${String(r.json['status'])}`, r.text).toBe('200 applied');
    for (const p of g.parts) await demandes(p.orderId);
    for (const p of g.parts) await rienDemarre(p.orderId, 1);
    expect(await lignesDuFil(g.shop.resellerId)).toEqual([]);
    expect(await ventesDe(g.shop.session)).toEqual([]);
    const gains = await gainsDuFondateur();
    for (const p of g.parts) expect(gains, p.orderId).not.toContain(p.orderId);
  }, LIMITE);
});

/* ─────────────── her retry after the hold ran out: still the refund's words ─────────────── */

describe('her retry after the time the order was kept has run out is still answered by her refund, never by « Rien n\'a été payé »', () => {
  // THE REAL CLOCK: the hold lasts 2 minutes (commerce-core RESERVATION_TTL_MS),
  // so one ~130 s wait crosses it for both the single order and the panier.
  // The check that answers here runs before the object's whole freshness
  // decision, quote expiry included (which no real clock can cross in a test).
  it('one order and one panier, each refunded after a failed charge: the late retry is 409 paiement_rembourse and no charge is initiated', async () => {
    const o = await commandeEchouee('0301');
    expect((await webhook(confirmation(o.orderId, o.key, 3_333))).status).toBe(200);
    await demandes(o.orderId);
    const g = await panierEchoue('0302');
    expect((await webhook(confirmation(g.groupId, g.key, 15_833, {}, `corr-${g.groupId}`))).status).toBe(200);
    for (const p of g.parts) await demandes(p.orderId);
    const avant = await audit(o.orderId);
    const avantG = await Promise.all(g.parts.map((p) => audit(p.orderId)));

    await sleep(130_000);

    const retry = await post('/checkout/order', { quoteId: o.quoteId, holderRef: o.holderRef, commandId: 'cmd-order-0301-tard' });
    expect(`${retry.status} ${String(retry.json['error'])}`, retry.text).toBe('409 paiement_rembourse');
    const apres = await audit(o.orderId);
    expect(apres.attempts, 'no charge initiated').toHaveLength(avant.attempts.length);
    expect(apres.inputCount).toBe(avant.inputCount);

    const retryG = await post('/checkout/group', { quoteIds: g.quoteIds, holderRef: g.holderRef, commandId: 'cmd-grp-0302-tard' });
    expect(`${retryG.status} ${String(retryG.json['error'])}`, retryG.text).toBe('409 paiement_rembourse');
    for (const [i, p] of g.parts.entries()) {
      const a = await audit(p.orderId);
      expect(a.attempts, p.orderId).toHaveLength(avantG[i]!.attempts.length);
      expect(a.inputCount, p.orderId).toBe(avantG[i]!.inputCount);
    }
  }, 200_000);
});
