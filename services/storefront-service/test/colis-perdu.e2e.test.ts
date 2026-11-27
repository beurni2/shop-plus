import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { PackageLostEventSchema, PlatformEventSchema } from '@platform/contracts';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance } from './seance';
import { composeSandboxRefund } from '../../../scripts/sandbox-payment-confirm.mjs';

/**
 * ═══ A PARCEL LOST ON THE ROAD REFUNDS THE BUYER IN FULL ═══
 *
 * Shop-Plus-Build-Spec §7 SP6 (founder ruling 2026-11-27): « A parcel Séra
 * loses on the road is refunded in full the same way (`package.lost.v1`) …
 * every paid leg, the delivery fee included … Only Séra's credential may
 * write it; the refund never waits on the outcome of Séra's liability
 * claim. » Each paid leg once, under its own key, durable before the provider
 * is asked; `refunded` only on the provider's confirmation of every refund.
 *
 * The real combined Worker under Miniflare, both progress credentials live.
 * Séra's bytes are parsed with canon's own PackageLostEventSchema before they
 * are sent, as the sender does. Every outcome is asked of the order's LEDGER
 * (audit, outbox, the buyer's view) — never of the door's answer alone.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'colis-perdu-'));
const T0 = '2026-11-26T08:00:00.000Z';

const WEBHOOK_SECRET = 'test-payment-webhook-secret-cp0001';
const BOUTIK_SECRET = 'test-progress-boutik-secret-cp0001';
const SERA_SECRET = 'test-progress-sera-secret-cp0001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-cp0001';
const signe = { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET };

const SUPPLY = [
  {
    productVersionId: 'pv-rsi-1',
    offerVersion: 'ov-rsi-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 30,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

const registered = new Set<string>();
const livraisons = new Map<string, string>();

let mf: Miniflare;

beforeAll(() => {
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
    },
    durableObjectsPersist: persist,
    bindings: {
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
        if (request.method === 'POST' && path === '/fulfillment/delivered') {
          // Certified to Boutik+'s real door, as livraison-boutik pins it.
          if (request.headers.get('Authorization') !== `Bearer ${FULFILL_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
          const parsed = PlatformEventSchema.safeParse(await request.json().catch(() => null));
          const p = parsed.success ? (parsed.data.payload as Record<string, unknown>) : null;
          const orderId = p?.['order_id'];
          if (
            !parsed.success || parsed.data.name !== 'delivery.validated.v1' ||
            typeof orderId !== 'string' || orderId === '' || orderId.length > 256 ||
            p['result'] !== 'validated' || p['settlement_eligibility'] !== true ||
            parsed.data.envelope.serverTime === '' || Number.isNaN(Date.parse(parsed.data.envelope.serverTime))
          ) {
            return Response.json({ ok: false, reason: 'event_not_canonical' }, { status: 400 });
          }
          if (!registered.has(orderId)) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
          const already = livraisons.get(orderId);
          if (already !== undefined) return Response.json({ ok: true, status: 'already_delivered', deliveredAt: already });
          livraisons.set(orderId, parsed.data.envelope.serverTime);
          return Response.json({ ok: true, status: 'delivered', deliveredAt: parsed.data.envelope.serverTime });
        }
        if (request.method === 'POST' && path === '/fulfillment/delivery-refused') {
          // Certified to Boutik+'s real door (handleRefusedIntake): canonical
          // parse, name, bounded order_id — else 400; unregistered is 200.
          if (request.headers.get('Authorization') !== `Bearer ${FULFILL_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
          const parsed = PlatformEventSchema.safeParse(await request.json().catch(() => null));
          const p = parsed.success ? (parsed.data.payload as Record<string, unknown>) : null;
          const orderId = p?.['order_id'];
          if (!parsed.success || parsed.data.name !== 'delivery.refused.v1' || typeof orderId !== 'string' || orderId === '' || orderId.length > 256) {
            return Response.json({ ok: false, reason: 'event_not_canonical' }, { status: 400 });
          }
          if (!registered.has(orderId)) return Response.json({ ok: true, status: 'unknown_order' });
          const rentre = p['fault_class'] === 'buyer' || p['fault_class'] === 'payment_provider';
          return Response.json(rentre ? { ok: true, status: 'restock_on_return' } : { ok: true, status: 'no_restock', faultClass: typeof p['fault_class'] === 'string' ? p['fault_class'] : null });
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
const freshKey = (): string => `rk-cp-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

type Mode = 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
const payes = new Map<string, number>();
const quotes = new Map<string, Record<string, unknown>>();

async function post(path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  const res = await mf.dispatchFetch(`http://c${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

async function doDe(orderId: string, path: string): Promise<Record<string, unknown>> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  return (await (await ns.get(ns.idFromName(orderId)).fetch(`https://do${path}`)).json()) as Record<string, unknown>;
}

interface Audit {
  state: string;
  doorLeg: string;
  inputCount: number;
  legKeys: Record<string, string>;
  escrow: { paymentLegs: { legType: string; amount: number; collectRef: string; status: string }[] } | null;
  remboursement: {
    decision: string;
    refus: { nature: string } | null;
    lignes: { legType: string; etat: string; amount: number; refundKey: string; essais: number }[];
  } | null;
  refunds: { amount: number; refundKey: string }[];
  reconAlerts: { name: string; envelope: { command_id: string }; payload: Record<string, unknown> }[];
}
const auditDe = async (orderId: string) => (await doDe(orderId, '/entry/audit')) as unknown as Audit;
const vueDe = async (orderId: string) =>
  safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());

/** The buyer's own road to a paid order, the checkout leg confirmed by the certified mock. */
async function commandePayee(n: string, mode: Mode = 'FULL_PREPAY'): Promise<string> {
  const S = await seance(mf, `cp${n}`);
  const created = await post('/storefronts', {
    commandId: `cmd-create-${n}`, id: `sf-cp-${n}`, resellerId: S.accountId,
    shortCode: `CP-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
    category: 'Général', correlationId: `corr-cp-${n}`, at: T0,
  }, S.bearer);
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${created.text}`);
  await post(`/storefronts/${encodeURIComponent(`sf-cp-${n}`)}/publish`, { correlationId: 'corr-en-ligne' }, S.bearer);
  const pub = await post('/listings', {
    commandId: `cmd-listing-${n}`, listingId: `lst-cp-${n}`, storefrontId: `sf-cp-${n}`,
    resellerId: S.accountId, productVersionId: 'pv-rsi-1', offerVersion: 'ov-rsi-1',
    markup: 1_500, correlationId: `corr-cp-${n}`, at: T0,
  }, S.bearer);
  if (pub.json['status'] !== 'published') throw new Error(`setup: listing ${pub.text}`);
  const quote = await post('/checkout/quote', {
    slug: `cp-${n}`, pid: 'pv-rsi-1', paymentMode: mode, zoneTo: 'Ouagadougou',
    attributionResellerId: S.accountId, requestKey: freshKey(),
  });
  const quoteId = quote.json['quoteId'];
  if (typeof quoteId !== 'string') throw new Error(`setup: quote ${quote.status} ${quote.text}`);
  const held = await post(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, { commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status} ${held.text}`);
  const ordered = await post('/checkout/order', {
    quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`,
    contact: { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'près du marché' },
  });
  if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status} ${ordered.text}`);
  const orderId = `ord-${quoteId}`;
  const paye = Number(quote.json['amountPaidAtCheckout']);
  payes.set(orderId, paye);
  quotes.set(orderId, quote.json);
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({
    orderId, paymentAttemptId: (await auditDe(orderId)).legKeys['checkout']!, amount: paye,
    correlationId: `corr-${orderId}`, requestedAtIso: T0,
  });
  const paid = await post('/checkout/webhook/payment', provider.webhookDeliveryPlan()[0]!.event, signe);
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${paid.text}`);
  return orderId;
}

/** Séra's bytes, on Séra's own key. */
const sera = (event: unknown) => post('/fulfillment/progress', event, { 'Content-Type': 'application/json', Authorization: `Bearer ${SERA_SECRET}` });
/** Boutik+'s bytes, on Boutik+'s own key. */
const boutik = (event: unknown) => post('/fulfillment/progress', event, { 'Content-Type': 'application/json', Authorization: `Bearer ${BOUTIK_SECRET}` });

async function jusqua<T>(lire: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 8_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let v = await lire();
  while (!ok(v) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    v = await lire();
  }
  return v;
}
const demande = (orderId: string) =>
  jusqua(() => auditDe(orderId), (a) => (a.remboursement?.lignes.length ?? 0) > 0 && a.remboursement!.lignes.every((l) => l.etat === 'demande'));

/** The founder's sandbox tool: read the asked refunds behind the secret, confirm each. */
async function confirmerTout(orderId: string): Promise<{ refundKey: string; amount: number }[]> {
  const res = await mf.dispatchFetch(`http://c/checkout/webhook/refund-key/${encodeURIComponent(orderId)}`, { headers: signe });
  const text = await res.text();
  expect(res.status, `the refund key is readable: ${text}`).toBe(200);
  const demandes = safeJson(text)['remboursements'] as { legType: string; refundKey: string; amount: number; collectRef: string }[];
  for (const r of demandes) {
    const ok = await post('/checkout/webhook/refund', composeSandboxRefund(orderId, r, new Date().toISOString()), signe);
    expect(ok.status, ok.text).toBe(200);
  }
  return demandes;
}


const perdu = (orderId: string, id = `package-lost-${orderId}`) =>
  PackageLostEventSchema.parse({
    name: 'package.lost.v1',
    envelope: { command_id: id, correlation_id: `corr-lost-${orderId}`, aggregateVersion: 1, actor: 'custody-service:e1', serverTime: '2026-11-27T10:00:00.000Z', version: '1' },
    payload: { orderId, at: '2026-11-27T10:00:00.000Z' },
  });
const refusAcheteurFraisGardes = (orderId: string) => ({
  name: 'delivery.refused.v1',
  envelope: { command_id: `door-buyer-refusal-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-11-27T09:00:00.000Z', version: '1' },
  payload: { order_id: orderId, task_id: `task-${orderId}`, family: 'return', reason_code: 'change_of_mind', fault_class: 'buyer', fee_retained: true },
});
interface Rang { status?: string; reason?: string; abandonedAt?: string }
const boite = async (orderId: string) =>
  (await doDe(orderId, '/entry/outbox')) as { custodyArm?: Rang; seraOutbox?: Rang; seraAnnulation?: Rang };
const fraisDe = (orderId: string): number => {
  const d = quotes.get(orderId)?.['deliveryFee'];
  if (typeof d !== 'number' || d <= 0) throw new Error(`setup: the quote names no delivery fee: ${JSON.stringify(quotes.get(orderId))}`);
  return d;
};
const somme = (xs: readonly { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

describe('a parcel Séra declares lost on the road', () => {
  it('L1 — paid in full at checkout: every paid leg comes back, the delivery fee included, and she reads it calmly', async () => {
    const orderId = await commandePayee('0001');
    const paye = payes.get(orderId)!;
    const D = fraisDe(orderId);
    expect((await boite(orderId)).custodyArm?.status, 'a custody row still waits before the loss').toBe('pending');

    const r = await sera(perdu(orderId));
    expect(r.status, r.text).toBe(200);
    expect(r.json['status']).toBe('recorded');

    const a = await demande(orderId);
    expect(a.remboursement).toMatchObject({ decision: 'ouvert', refus: { nature: 'colis_perdu' } });
    const legs = a.escrow!.paymentLegs;
    expect(a.remboursement!.lignes.map((l) => l.legType).sort(), 'one line for every paid leg').toEqual(legs.map((l) => l.legType).sort());
    expect(somme(a.remboursement!.lignes), 'everything the provider took comes back').toBe(somme(legs));
    expect(somme(a.remboursement!.lignes), 'the delivery fee included').toBe(paye);
    expect(paye).toBeGreaterThan(D);
    expect(new Set(a.remboursement!.lignes.map((l) => l.refundKey)).size).toBe(a.remboursement!.lignes.length);
    const rangs = await boite(orderId);
    expect(rangs.custodyArm, 'the custody row stops in the same act').toMatchObject({ status: 'abandoned', reason: 'colis_perdu' });
    // Séra is the one that declared it: nothing tells Séra back that the order is cancelled.
    expect(rangs.seraOutbox, 'Séra was told the order is funded, so a cancel row could exist').toBeDefined();
    expect(rangs.seraAnnulation).toBeUndefined();

    const confirmes = await confirmerTout(orderId);
    expect(somme(confirmes)).toBe(paye);
    const fini = await auditDe(orderId);
    expect(fini.state).toBe('refunded');
    expect(somme(fini.refunds)).toBe(paye);
    expect((await vueDe(orderId))['remboursement']).toEqual({ etat: 'fait', montant: paye, motif: 'perdu' });
  }, 60_000);

  it('L2 — delivery fee paid at checkout, product at the door: the fee she paid comes back in full', async () => {
    const orderId = await commandePayee('0002', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const paye = payes.get(orderId)!;
    expect(paye, 'what she paid is the delivery fee').toBe(fraisDe(orderId));

    expect((await sera(perdu(orderId))).status).toBe(200);
    const a = await demande(orderId);
    expect(a.remboursement).toMatchObject({ decision: 'ouvert', refus: { nature: 'colis_perdu' }, retenu: 0 });
    expect(a.remboursement!.lignes).toEqual([expect.objectContaining({ legType: 'checkout', amount: paye })]);
    expect(somme(a.remboursement!.lignes)).toBe(somme(a.escrow!.paymentLegs.filter((l) => l.status !== 'pending')));

    await confirmerTout(orderId);
    const fini = await auditDe(orderId);
    expect(fini.state).toBe('refunded');
    expect(somme(fini.refunds)).toBe(paye);
    expect((await vueDe(orderId))['remboursement']).toEqual({ etat: 'fait', montant: paye, motif: 'perdu' });
  }, 60_000);

  it('L3 — Boutik+\'s credential cannot declare a parcel lost: 403 by name, and no refund opens', async () => {
    const orderId = await commandePayee('0003');
    const r = await boutik(perdu(orderId));
    expect(r.status, r.text).toBe(403);
    expect(r.json['reason']).toBe('wrong_writer');
    await new Promise((x) => setTimeout(x, 300));
    expect((await auditDe(orderId)).remboursement).toBeNull();
  }, 60_000);

  it('L4 — a payload carrying anything more than the order and the instant is refused 400, and no refund opens', async () => {
    const orderId = await commandePayee('0004');
    const ev = perdu(orderId);
    const r = await sera({ ...ev, payload: { ...ev.payload, amount: 1 } });
    expect(r.status, r.text).toBe(400);
    expect(r.json['reason']).toBe('event_not_canonical');
    await new Promise((x) => setTimeout(x, 300));
    expect((await auditDe(orderId)).remboursement).toBeNull();
  }, 60_000);

  it('L5 — a redelivery answers duplicate: the same lines, the same keys, nothing asked twice', async () => {
    const orderId = await commandePayee('0005');
    expect((await sera(perdu(orderId))).status).toBe(200);
    const avant = await demande(orderId);
    const r = await sera(perdu(orderId, `package-lost-${orderId}-bis`));
    expect(r.status, r.text).toBe(200);
    expect(r.json['status']).toBe('duplicate');
    await new Promise((x) => setTimeout(x, 300));
    const apres = await auditDe(orderId);
    expect(apres.remboursement!.lignes.map((l) => [l.refundKey, l.essais])).toEqual(avant.remboursement!.lignes.map((l) => [l.refundKey, l.essais]));
    await confirmerTout(orderId);
    expect((await auditDe(orderId)).refunds).toHaveLength(avant.remboursement!.lignes.length);
  }, 60_000);

  it('L6 — her own refusal at the door kept the delivery fee, then the parcel is lost on the way back: her refund stays as the door decided it', async () => {
    // Safest default (coordinator, 2026-11-27, pending the founder's ruling): first-wins.
    const orderId = await commandePayee('0006');
    const paye = payes.get(orderId)!;
    const D = fraisDe(orderId);
    expect((await sera(refusAcheteurFraisGardes(orderId))).status).toBe(200);
    const avant = await demande(orderId);
    expect(avant.remboursement).toMatchObject({ refus: { nature: 'refus_acheteur' }, retenu: D });

    const r = await sera(perdu(orderId));
    expect(r.status, r.text).toBe(200);
    expect(r.json['status']).toBe('recorded');
    await new Promise((x) => setTimeout(x, 300));
    const apres = await auditDe(orderId);
    expect(apres.remboursement).toMatchObject({ refus: { nature: 'refus_acheteur' }, retenu: D });
    expect(apres.remboursement!.lignes.map((l) => l.refundKey)).toEqual(avant.remboursement!.lignes.map((l) => l.refundKey));
    expect(somme(apres.remboursement!.lignes)).toBe(paye - D);
  }, 60_000);

  it('L7 — an order this Worker does not know is 404 and writes nothing', async () => {
    const r = await sera(perdu('ord-inconnue-cp-0007'));
    expect(r.status, r.text).toBe(404);
    expect(r.json['reason']).toBe('unknown_order');
    const lu = await doDe('ord-inconnue-cp-0007', '/entry/audit');
    expect(lu).toMatchObject({ exists: false, escrow: null });
  }, 60_000);

  it('L8 — paid in two parts, the product at the door, its payment confirmed after the declaration: both parts come back, each under its own key, and refunded only when both are confirmed', async () => {
    const orderId = await commandePayee('0008', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const D = payes.get(orderId)!;
    expect(D).toBe(fraisDe(orderId));
    // At her door the provider was asked for the product; the parcel is lost before it answers.
    const porte = await post(`/checkout/order/${encodeURIComponent(orderId)}/door-charge`, { holderRef: 'holder-0008', commandId: 'cmd-door-0008' });
    expect(porte.status, porte.text).toBe(200);
    const BM = ((await doDe(orderId, '/entry/gains'))['split'] as { productSubtotal: number }).productSubtotal;
    expect((await sera(perdu(orderId))).status).toBe(200);

    const provider = new MockPaymentProvider({});
    provider.initiateCharge({
      orderId, paymentAttemptId: (await auditDe(orderId)).legKeys['door']!, amount: BM,
      correlationId: `corr-${orderId}`, requestedAtIso: T0, legType: 'door',
    });
    const doorEvent = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
    const paid = await post('/checkout/webhook/door', doorEvent, signe);
    expect(paid.status, paid.text).toBe(200);

    const a = await jusqua(() => auditDe(orderId), (x) => (x.remboursement?.lignes.length ?? 0) === 2 && x.remboursement!.lignes.every((l) => l.etat === 'demande'));
    const lignes = a.remboursement!.lignes;
    expect(lignes.map((l) => l.legType).sort()).toEqual(['checkout', 'door']);
    expect(new Set(lignes.map((l) => l.refundKey)).size, 'two distinct keys').toBe(2);
    expect(somme(lignes), 'B + M + D').toBe(BM + D);
    expect(a.remboursement).toMatchObject({ refus: { nature: 'colis_perdu' }, retenu: 0 });

    const res = await mf.dispatchFetch(`http://c/checkout/webhook/refund-key/${encodeURIComponent(orderId)}`, { headers: signe });
    const demandes = safeJson(await res.text())['remboursements'] as { legType: string; refundKey: string; amount: number; collectRef: string }[];
    expect(demandes).toHaveLength(2);
    const [premier, second] = [demandes.find((d) => d.legType === 'checkout')!, demandes.find((d) => d.legType === 'door')!];
    expect((await post('/checkout/webhook/refund', composeSandboxRefund(orderId, premier, new Date().toISOString()), signe)).status).toBe(200);
    expect((await auditDe(orderId)).state, 'one refund of two confirmed is not refunded').not.toBe('refunded');
    expect((await post('/checkout/webhook/refund', composeSandboxRefund(orderId, second, new Date().toISOString()), signe)).status).toBe(200);
    const fini = await auditDe(orderId);
    expect(fini.state).toBe('refunded');
    expect(somme(fini.refunds)).toBe(BM + D);
  }, 60_000);
});
