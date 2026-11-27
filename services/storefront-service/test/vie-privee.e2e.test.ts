import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { PlatformEventSchema } from '@platform/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, type Seance } from './seance';
import { composeSandboxRefund } from '../../../scripts/sandbox-payment-confirm.mjs';

/**
 * ═══ VIE-PRIVEE-ACHETEUSE — the buyer's details stay hers, on the REAL Worker ═══
 *
 * The combined bundle under Miniflare, every Durable Object real; only Boutik+'s
 * OFFER doors stand in, certified to the bounds its real doors answer (as
 * remboursement-sans-impasse pins them). Every outcome that is about what is
 * STORED is asked of the order's own object, never of the answer to the act.
 *
 *   · her order view (amounts, refund) answers only her own token; no token and
 *     another order's token get the same nameless 404; the gift link's steps
 *     stay open;
 *   · the founder's sandbox tool reads the three facts it needs behind the
 *     webhook secret it already holds;
 *   · the reseller's sales rows carry no buyer area — neither the buyer's
 *     quartier nor a liste owner's private zone;
 *   · a finished order's dispatch row shows no contact (and says so), while an
 *     order on the road or with a refund still open keeps it; nothing is
 *     deleted, and the founder's §6.4 door still records on a finished order.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'vie-privee-'));
const T0 = '2026-11-27T08:00:00.000Z';

const WEBHOOK_SECRET = 'test-payment-webhook-secret-vp001';
const BOUTIK_SECRET = 'test-progress-boutik-secret-vp001';
const SERA_SECRET = 'test-progress-sera-secret-vp001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-vp001';
const signe = { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET };
const cleC = { Authorization: `Bearer ${OPS_SECRET}` };

const PV = 'pv-vp-1';
const SUPPLY = {
  productVersionId: PV, offerVersion: 'ov-vp-1', basePrice: 10_000, resellerCommission: 1_000, available: 40,
  productName: 'Bazin riche', assetRefs: [] as string[], category: 'fashion_bags_fabrics', sellerTier: 'verified',
};
const PIN = { lat: 12.371532, lng: -1.519931, accuracy: 12 };
const LIVRAISON = { telephone: '70123456', quartier: 'Pissy', repere: 'Portail bleu', zone: 'Pissy, Ouagadougou' };
const MONTANTS = ['amountPaidAtCheckout', 'amountDueAtDelivery', 'doorLeg', 'remboursement'];

const registered = new Set<string>();
const livraisons = new Map<string, string>();

let mf: Miniflare;
let S: Seance;
const SLUG = 'vp-0001';

/** The real Worker and her seller's shop; `extra` adds bindings (the failed-payment road). */
async function monter(dossier: string, extra: Record<string, string> = {}): Promise<void> {
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO', WISHLIST: 'WishlistDO',
    },
    durableObjectsPersist: dossier,
    bindings: {
      ...extra,
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      CHECKOUT_OPS_SECRET: OPS_SECRET,
      PROGRESS_WRITE_SECRET: BOUTIK_SECRET,
      SERA_PROGRESS_SECRET: SERA_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
          const body = (await request.json().catch(() => null)) as { payload?: { orderId?: string } } | null;
          if (typeof body?.payload?.orderId === 'string') registered.add(body.payload.orderId);
          return Response.json({ ok: true, status: 'registered' });
        }
        if (request.method === 'POST' && (path === '/fulfillment/delivered' || path === '/fulfillment/delivery-refused')) {
          if (request.headers.get('Authorization') !== `Bearer ${FULFILL_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
          const parsed = PlatformEventSchema.safeParse(await request.json().catch(() => null));
          const p = parsed.success ? (parsed.data.payload as Record<string, unknown>) : null;
          const orderId = p?.['order_id'];
          if (!parsed.success || typeof orderId !== 'string' || orderId === '' || orderId.length > 256) {
            return Response.json({ ok: false, reason: 'event_not_canonical' }, { status: 400 });
          }
          if (path === '/fulfillment/delivery-refused') {
            return Response.json(registered.has(orderId) ? { ok: true, status: 'no_restock', faultClass: 'seller' } : { ok: true, status: 'unknown_order' });
          }
          if (!registered.has(orderId)) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
          const deja = livraisons.get(orderId);
          if (deja !== undefined) return Response.json({ ok: true, status: 'already_delivered', deliveredAt: deja });
          livraisons.set(orderId, parsed.data.envelope.serverTime);
          return Response.json({ ok: true, status: 'delivered', deliveredAt: parsed.data.envelope.serverTime });
        }
        if (/^\/supply-projection\/[^/]+$/.test(path)) {
          return Response.json({ version: 1, asOf: new Date().toISOString(), value: SUPPLY });
        }
        return Response.json({ status: 'not_found' }, { status: 404 });
      },
    },
  });
  S = await seance(mf, 'vp');
  const created = await post('/storefronts', {
    commandId: 'cmd-create-vp', id: 'sf-vp-1', resellerId: S.accountId, shortCode: 'VP-0001',
    name: 'Boutique privée', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-vp', at: T0,
  }, S.bearer);
  expect(created.status, created.text).toBe(200);
  await post('/storefronts/sf-vp-1/publish', { correlationId: 'corr-en-ligne' }, S.bearer);
  const pub = await post('/listings', {
    commandId: 'cmd-listing-vp', listingId: 'lst-vp-1', storefrontId: 'sf-vp-1', resellerId: S.accountId,
    productVersionId: PV, offerVersion: 'ov-vp-1', markup: 1_500, correlationId: 'corr-vp', at: T0,
  }, S.bearer);
  expect(pub.json['status'], pub.text).toBe('published');
}

beforeAll(() => monter(persist), 120_000);

const persistEchec = mkdtempSync(join(tmpdir(), 'vie-privee-echec-'));

afterAll(async () => {
  await mf?.dispose();
  rmSync(persist, { recursive: true, force: true });
  rmSync(persistEchec, { recursive: true, force: true });
});

function safeJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}
async function post(path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  const res = await mf.dispatchFetch(`http://c${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}
async function get(path: string, headers: Record<string, string> = {}) {
  const res = await mf.dispatchFetch(`http://c${path}`, { headers });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}
async function doDe(orderId: string, path: string): Promise<Record<string, unknown>> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  return (await (await ns.get(ns.idFromName(orderId)).fetch(`https://do${path}`)).json()) as Record<string, unknown>;
}
const jeton = (ref: string) => ({ Authorization: `Bearer ${ref}` });

let keySeq = 0;
const freshKey = (): string => `rk-vp-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

interface Commande { orderId: string; buyerRef: string; paye: number }

/** A buyer's own road to a PAID order: quote → hold → create (her token comes back once) → the provider's confirmation. */
async function commandePayee(
  n: string,
  via: { zoneTo: string; contact: Record<string, unknown> } | { listeRef: string },
  /** Played on the real webhook door before the genuine confirmation. */
  avant?: (orderId: string, legKey: string, paye: number) => Promise<void>,
): Promise<Commande> {
  const quote = await post('/checkout/quote', {
    slug: SLUG, pid: PV, paymentMode: 'FULL_PREPAY', attributionResellerId: S.accountId, requestKey: freshKey(),
    ...('listeRef' in via ? { listeRef: via.listeRef } : { zoneTo: via.zoneTo }),
  });
  const quoteId = quote.json['quoteId'];
  if (typeof quoteId !== 'string') throw new Error(`setup: quote ${quote.status} ${quote.text}`);
  const held = await post(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, { commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status} ${held.text}`);
  const ordered = await post('/checkout/order', {
    quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`,
    ...('listeRef' in via ? { listeRef: via.listeRef } : { contact: via.contact }),
  });
  if (ordered.status !== 200 || typeof ordered.json['buyerRef'] !== 'string') throw new Error(`setup: order ${ordered.status} ${ordered.text}`);
  const orderId = `ord-${quoteId}`;
  const paye = Number(quote.json['amountPaidAtCheckout']);
  const legKey = ((await doDe(orderId, '/entry/audit'))['legKeys'] as Record<string, string>)['checkout'];
  if (avant !== undefined) await avant(orderId, legKey!, paye);
  const paid = await post('/checkout/webhook/payment', {
    name: 'payment.checkout_leg_confirmed.v1',
    envelope: { command_id: `whk-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 1, actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1' },
    payload: { provider: 'sandbox-provider', payment_attempt_id: legKey, collectRef: `collect-${orderId}`, amount: paye, fee: 0, status: 'held', order_id: orderId, redelivery: false },
  }, signe);
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${paid.text}`);
  return { orderId, buyerRef: ordered.json['buyerRef'] as string, paye };
}

const sera = (event: unknown) => post('/fulfillment/progress', event, { 'Content-Type': 'application/json', Authorization: `Bearer ${SERA_SECRET}` });
const valide = (orderId: string) => ({
  name: 'delivery.validated.v1',
  envelope: { command_id: `eligibility-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-11-27T12:00:00.000Z', version: '1' },
  payload: { order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`, result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-vp-001' },
});
const refus = (orderId: string) => ({
  name: 'delivery.refused.v1',
  envelope: { command_id: `door-valid-rejection-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-11-27T10:00:00.000Z', version: '1' },
  payload: { order_id: orderId, task_id: `task-${orderId}`, rejection: 'valid_rejection', fault_class: 'seller' },
});

async function jusqua<T>(lire: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 8_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let v = await lire();
  while (!ok(v) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    v = await lire();
  }
  return v;
}

interface LigneDispatch { orderId?: string; contact?: Record<string, unknown> | null; contactMasque?: unknown; state?: string }
async function ligneDispatch(orderId: string): Promise<LigneDispatch | undefined> {
  const rows: LigneDispatch[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const res = await get(`/checkout/dispatch?limit=40${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`, cleC);
    expect(res.status, res.text).toBe(200);
    rows.push(...((res.json['orders'] ?? []) as LigneDispatch[]));
    cursor = typeof res.json['next'] === 'string' ? res.json['next'] : undefined;
    if (cursor === undefined) break;
  }
  return rows.find((r) => r.orderId === orderId);
}

describe('the gift link: her order view answers her token alone', () => {
  let liste: Commande;
  let autre: Commande;

  beforeAll(async () => {
    const made = await post('/listes', { slug: SLUG, nom: 'Mariam', pids: [PV], livraison: LIVRAISON });
    expect(made.status, made.text).toBe(200);
    liste = await commandePayee('g1', { listeRef: made.json['token'] as string });
    autre = await commandePayee('g2', { zoneTo: 'Ouagadougou', contact: { phone: '70 22 33 44', quartier: 'Zogona', repere: 'la pharmacie' } });
  }, 120_000);

  it('no header, and another order’s token, get the same nameless 404; her own token reads her amounts; the steps stay open', async () => {
    const path = `/checkout/order/${encodeURIComponent(liste.orderId)}`;
    const sans = await get(path);
    expect(sans.status, sans.text).toBe(404);
    expect(sans.json).toEqual({ ok: false });
    const etranger = await get(path, jeton(autre.buyerRef));
    expect(etranger.status, etranger.text).toBe(404);
    expect(etranger.text, 'a wrong token is refused exactly like no token').toBe(sans.text);
    const faux = await get(path, { Authorization: 'Bearer ' });
    expect(faux.text).toBe(sans.text);
    const inconnu = await get('/checkout/order/ord-inconnu-vp', jeton(liste.buyerRef));
    expect(inconnu.text, 'an unknown order is the same 404').toBe(sans.text);

    const sienne = await get(path, jeton(liste.buyerRef));
    expect(sienne.status, sienne.text).toBe(200);
    expect(sienne.json['amountPaidAtCheckout']).toBe(liste.paye);
    expect(sienne.json['state']).toBe('confirmed');

    const suivi = await get(`${path}/suivi`);
    expect(suivi.status).toBe(200);
    expect(suivi.json['state']).toBe('confirmed');
    for (const k of MONTANTS) expect(suivi.json[k], k).toBeUndefined();
  }, 60_000);

  it('the founder’s sandbox tool reads state and the two sums behind the webhook secret, and nothing else', async () => {
    const path = `/checkout/webhook/order/${encodeURIComponent(liste.orderId)}`;
    expect((await get(path)).status, 'no secret').toBe(401);
    expect((await get(path, { 'X-Payment-Webhook-Key': 'pas-le-secret' })).status, 'wrong secret').toBe(401);
    const lu = await get(path, { 'X-Payment-Webhook-Key': WEBHOOK_SECRET });
    expect(lu.status, lu.text).toBe(200);
    expect(lu.json).toEqual({ state: 'confirmed', amountPaidAtCheckout: liste.paye, amountDueAtDelivery: 0 });
    const inconnu = await get('/checkout/webhook/order/ord-inconnu-vp', { 'X-Payment-Webhook-Key': WEBHOOK_SECRET });
    expect(inconnu.status).toBe(404);
  }, 60_000);
});

describe('the reseller’s sales rows carry no buyer area', () => {
  it('an ordinary order (« Gounghin, Ouagadougou ») and a liste gift (the owner’s private zone): no area on either row', async () => {
    const made = await post('/listes', { slug: SLUG, nom: 'Awa', pids: [PV], livraison: LIVRAISON });
    expect(made.status, made.text).toBe(200);
    const ordinaire = await commandePayee('f1', { zoneTo: 'Gounghin, Ouagadougou', contact: { phone: '70 33 44 55', quartier: 'Gounghin', repere: 'le marché' } });
    const cadeau = await commandePayee('f2', { listeRef: made.json['token'] as string });
    const ventes = await jusqua(
      () => get('/reseller/ventes', S.bearer),
      (r) => [ordinaire.orderId, cadeau.orderId].every((id) => r.text.includes(id)),
    );
    expect(ventes.status, ventes.text).toBe(200);
    const rows = JSON.parse(ventes.text) as { ventes?: Record<string, unknown>[] };
    const lignes = (rows.ventes ?? []).filter((v) => v['orderId'] === ordinaire.orderId || v['orderId'] === cadeau.orderId);
    expect(lignes).toHaveLength(2);
    for (const l of lignes) expect(l['zoneTo'], 'no area on her wire, for this release an empty value').toBe('');
    expect(ventes.text).not.toMatch(/Gounghin|Pissy/);
  }, 120_000);
});

describe('a finished order leaves the founder’s dispatch view without the buyer’s contact', () => {
  const contact = (phone: string) => ({ phone, quartier: 'Gounghin', repere: 'près du marché', pin: PIN });
  let livreeId = '';

  it('delivered: contact null and marked; on the road: kept; the stored contact is untouched', async () => {
    const livree = await commandePayee('d1', { zoneTo: 'Ouagadougou', contact: contact('70 44 55 01') });
    const enRoute = await commandePayee('d2', { zoneTo: 'Ouagadougou', contact: contact('70 44 55 02') });
    expect((await post('/fulfillment/transit', { orderId: enRoute.orderId, stage: 'en_route', asOf: '2026-11-27T09:30:00.000Z' }, { 'Content-Type': 'application/json', Authorization: `Bearer ${SERA_SECRET}` })).status).toBe(200);
    livreeId = livree.orderId;
    const v = await sera(valide(livree.orderId));
    expect(v.status, v.text).toBe(200);

    const fini = await ligneDispatch(livree.orderId);
    expect(fini, 'the delivered order is still on his board').toBeDefined();
    expect(fini!.state).toBe('confirmed');
    expect(fini!.contact, 'a finished order shows no contact').toBeNull();
    expect(fini!.contactMasque).toBe(true);

    const route = await ligneDispatch(enRoute.orderId);
    expect(route!.contact).toMatchObject({ phone: '70 44 55 02', pin: PIN });
    expect(route!, 'the mark is present only when the contact is held back').not.toHaveProperty('contactMasque');
  }, 120_000);

  it('a refusal whose refund is open keeps the contact; once the refund is confirmed it is finished — and his §6.4 door still records', async () => {
    const o = await commandePayee('d3', { zoneTo: 'Ouagadougou', contact: contact('70 44 55 03') });
    expect((await sera(refus(o.orderId))).status).toBe(200);
    await jusqua(() => doDe(o.orderId, '/entry/audit'), (a) => ((a['remboursement'] as { lignes?: { etat: string }[] } | null)?.lignes ?? []).some((l) => l.etat === 'demande'));
    const ouverte = await ligneDispatch(o.orderId);
    expect(ouverte!.contact, 'a refund not yet confirmed still needs her').toMatchObject({ phone: '70 44 55 03' });
    expect(ouverte!).not.toHaveProperty('contactMasque');

    const keys = await get(`/checkout/webhook/refund-key/${encodeURIComponent(o.orderId)}`, signe);
    expect(keys.status, keys.text).toBe(200);
    for (const r of keys.json['remboursements'] as { legType: string; refundKey: string; amount: number; collectRef: string }[]) {
      const ok = await post('/checkout/webhook/refund', composeSandboxRefund(o.orderId, r, new Date().toISOString()), signe);
      expect(ok.status, ok.text).toBe(200);
    }
    const close = await jusqua(() => ligneDispatch(o.orderId), (r) => r?.contactMasque === true);
    expect(close!.state).toBe('refunded');
    expect(close!.contact).toBeNull();

    const rang = await post(`/checkout/dispatch/${encodeURIComponent(o.orderId)}/refusal`, { reason: 'change_of_mind' }, { 'Content-Type': 'application/json', ...cleC });
    expect(rang.status, `his refusal door reads the stored phone itself: ${rang.text}`).toBe(200);
  }, 120_000);

  it('a delivered order with something for him to check keeps her contact, unmarked', async () => {
    // A confirmation naming the wrong amount is refused and recorded as an
    // alert; the genuine one then confirms it, and Séra delivers it.
    const o = await commandePayee('d4', { zoneTo: 'Ouagadougou', contact: contact('70 44 55 04') }, async (orderId, legKey, paye) => {
      const faux = await post('/checkout/webhook/payment', {
        name: 'payment.checkout_leg_confirmed.v1',
        envelope: { command_id: `whk-faux-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 1, actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1' },
        payload: { provider: 'sandbox-provider', payment_attempt_id: legKey, collectRef: `collect-${orderId}`, amount: paye + 1, fee: 0, status: 'held', order_id: orderId, redelivery: false },
      }, signe);
      expect(faux.status, faux.text).not.toBe(200);
    });
    expect((await sera(valide(o.orderId))).status).toBe(200);
    const ligne = await ligneDispatch(o.orderId);
    expect((ligne as { aVerifier?: unknown }).aVerifier, 'the alert is on his row').not.toBeNull();
    expect(ligne!.contact, 'something to check still needs her').toMatchObject({ phone: '70 44 55 04' });
    expect(ligne!).not.toHaveProperty('contactMasque');
  }, 120_000);

  it('NOTHING DELETED — the delivered order’s own storage still holds her whole contact, pin included', async () => {
    expect(livreeId).not.toBe('');
    // Read off the order's own durable store by a stand-in of the same class
    // over the same persist folder (miniflare has no storage accessor) — the
    // ledger, not any answer this slice builds.
    await mf.dispose();
    const lecteur = new Miniflare({
      modules: true,
      script: `
        export class OrderDO {
          constructor(state) { this.state = state; }
          async fetch() { return Response.json({ contact: (await this.state.storage.get('buyer-contact')) ?? null }); }
        }
        export default { async fetch(request, env) { return env.ORDER.get(env.ORDER.idFromName(new URL(request.url).pathname.slice(1))).fetch(request); } };`,
      durableObjects: { ORDER: 'OrderDO' },
      durableObjectsPersist: persist,
    });
    const lu = (await (await lecteur.dispatchFetch(`http://x/${livreeId}`)).json()) as { contact: Record<string, unknown> | null };
    await lecteur.dispose();
    mf = undefined as unknown as Miniflare;
    expect(lu.contact).toEqual({ phone: '70 44 55 01', quartier: 'Gounghin', repere: 'près du marché', pin: PIN });
  }, 60_000);
});

describe('a failed payment can still be retried, so it keeps her contact', () => {
  // A second real Worker whose certified sandbox provider times out the first
  // charge of every order: the one road by which a payment fails for real.
  beforeAll(() => monter(persistEchec, { PAYMENT_SANDBOX_BEHAVIOR: JSON.stringify({ timeoutFirstNInitiates: 1 }) }), 120_000);

  it('payment_failed: the contact stays on his row, unmarked', async () => {
    const quote = await post('/checkout/quote', { slug: SLUG, pid: PV, paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: S.accountId, requestKey: freshKey() });
    const quoteId = String(quote.json['quoteId']);
    expect((await post(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, { commandId: 'cmd-reserve-e1', holderRef: 'holder-e1' })).status).toBe(200);
    const cree = await post('/checkout/order', { quoteId, holderRef: 'holder-e1', commandId: 'cmd-order-e1', contact: { phone: '70 44 55 09', quartier: 'Gounghin', repere: 'près du marché' } });
    expect(cree.status, cree.text).toBe(200);
    expect(cree.json['state']).toBe('payment_failed');
    const ligne = await ligneDispatch(`ord-${quoteId}`);
    expect(ligne!.state).toBe('payment_failed');
    expect(ligne!.contact).toMatchObject({ phone: '70 44 55 09' });
    expect(ligne!).not.toHaveProperty('contactMasque');
  }, 120_000);
});
