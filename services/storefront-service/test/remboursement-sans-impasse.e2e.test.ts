import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { PlatformEventSchema } from '@platform/contracts';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance } from './seance';
import { composeSandboxRefund } from '../../../scripts/sandbox-payment-confirm.mjs';

/**
 * ═══ A REFUND NEVER DEAD-ENDS, AND NO PAYOUT LINE IS WRITTEN FOR AN ORDER
 *     BEING REFUNDED OR NOT FULLY PAID ═══
 *
 * Shop-Plus-Build-Spec §7 SP6: a refused delivery or a supplier's refusal
 * refunds the buyer from her own paid legs, each leg ONCE under a key minted
 * once and durable before the provider is asked; she is `refunded` only on the
 * provider's confirmation; a refund that cannot finish by itself is told to
 * the founder. SP-I13: no confirmed order without the funded legs its mode
 * requires. §6.3: the drop code comes last, after any door payment is
 * provider-confirmed.
 *
 * The real combined Worker under Miniflare, both progress credentials bound
 * as live (Boutik+'s and Séra's separate keys). Séra's and Boutik+'s bytes are
 * the ones their producers emit (as livraison-boutik pins them); the garbled
 * refusal is a plausible producer drift. Payment and door webhooks come from
 * the vault's certified mock; refunds are confirmed with the founder's own
 * sandbox tool. Every outcome is asked of the order's LEDGER (audit, gains,
 * reconcile) — never of the answer to the act. No live Séra or Boutik+ runs.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'remboursement-sans-impasse-'));
const T0 = '2026-11-26T08:00:00.000Z';

const WEBHOOK_SECRET = 'test-payment-webhook-secret-rsi001';
const BOUTIK_SECRET = 'test-progress-boutik-secret-rsi001';
const SERA_SECRET = 'test-progress-sera-secret-rsi001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-rsi001';
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
const freshKey = (): string => `rk-rsi-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

type Mode = 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
const payes = new Map<string, number>();

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
const lignesDe = async (orderId: string) =>
  ((await doDe(orderId, '/entry/gains'))['obligations'] as { party: string; amount: number }[] | undefined) ?? [];
const rangeeDe = async (orderId: string) => (await doDe(orderId, '/entry/dispatch'))['remboursement'];
const vueDe = async (orderId: string) =>
  safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());
const alertesDe = async (orderId: string, nom: string) =>
  (await auditDe(orderId)).reconAlerts.filter((a) => a.payload['alert'] === nom);

/** The buyer's own road to a paid order, the checkout leg confirmed by the certified mock. */
async function commandePayee(n: string, mode: Mode = 'FULL_PREPAY'): Promise<string> {
  const S = await seance(mf, `rsi${n}`);
  const created = await post('/storefronts', {
    commandId: `cmd-create-${n}`, id: `sf-rsi-${n}`, resellerId: S.accountId,
    shortCode: `RSI-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
    category: 'Général', correlationId: `corr-rsi-${n}`, at: T0,
  }, S.bearer);
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${created.text}`);
  await post(`/storefronts/${encodeURIComponent(`sf-rsi-${n}`)}/publish`, { correlationId: 'corr-en-ligne' }, S.bearer);
  const pub = await post('/listings', {
    commandId: `cmd-listing-${n}`, listingId: `lst-rsi-${n}`, storefrontId: `sf-rsi-${n}`,
    resellerId: S.accountId, productVersionId: 'pv-rsi-1', offerVersion: 'ov-rsi-1',
    markup: 1_500, correlationId: `corr-rsi-${n}`, at: T0,
  }, S.bearer);
  if (pub.json['status'] !== 'published') throw new Error(`setup: listing ${pub.text}`);
  const quote = await post('/checkout/quote', {
    slug: `rsi-${n}`, pid: 'pv-rsi-1', paymentMode: mode, zoneTo: 'Ouagadougou',
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

const refusLisible = (orderId: string, id = `door-valid-rejection-${orderId}`) => ({
  name: 'delivery.refused.v1',
  envelope: { command_id: id, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-11-26T10:00:00.000Z', version: '1' },
  payload: { order_id: orderId, task_id: `task-${orderId}`, rejection: 'valid_rejection', fault_class: 'seller' },
});
const refusIllisible = (orderId: string) => ({
  ...refusLisible(orderId, `door-garbled-${orderId}`),
  payload: { order_id: orderId, task_id: `task-${orderId}`, quoi: 'inconnu' },
});
const rejete = (orderId: string) => ({
  name: 'fulfillment.rejected.v1',
  envelope: { command_id: `fulfillment-rejected-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 2, actor: 'offer-service:fulfillment', serverTime: '2026-11-26T11:00:00.000Z', version: '1' },
  payload: { orderId, at: '2026-11-26T11:00:00.000Z' },
});
const valide = (orderId: string, id = `eligibility-${orderId}`) => ({
  name: 'delivery.validated.v1',
  envelope: { command_id: id, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-11-26T12:00:00.000Z', version: '1' },
  payload: {
    order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`,
    result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-rsi-001',
  },
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

describe('a refund record that decided nothing is re-decided by the next refusal', () => {
  it('R1 — a garbled Séra refusal, then a readable one: she is refunded every franc she paid, once, and both views say done', async () => {
    const orderId = await commandePayee('0001');
    const paye = payes.get(orderId)!;
    expect((await sera(refusIllisible(orderId))).status).toBe(200);
    const bloque = await auditDe(orderId);
    expect(bloque.remboursement).toMatchObject({ decision: 'refus_illisible', lignes: [] });
    expect((await alertesDe(orderId, 'refusal_fact_unreadable'))).toHaveLength(1);
    expect(await rangeeDe(orderId)).toEqual({ etat: 'bloque', raison: 'refus_illisible' });

    expect((await sera(refusLisible(orderId))).status).toBe(200);
    const a = await demande(orderId);
    expect(a.remboursement).toMatchObject({ decision: 'ouvert', refus: { nature: 'refus_justifie' } });
    expect(a.remboursement!.lignes).toEqual([expect.objectContaining({ legType: 'checkout', amount: paye, etat: 'demande' })]);
    const [r] = await confirmerTout(orderId);
    expect(r).toMatchObject({ refundKey: a.remboursement!.lignes[0]!.refundKey, amount: paye });

    const fini = await auditDe(orderId);
    expect(fini.state).toBe('refunded');
    expect(fini.refunds).toEqual([expect.objectContaining({ amount: paye, refundKey: r!.refundKey })]);
    expect((await vueDe(orderId))['remboursement']).toEqual({ etat: 'fait', montant: paye, motif: 'retour' });
    expect(await rangeeDe(orderId)).toEqual({ etat: 'fait' });
    expect(await alertesDe(orderId, 'refusal_fact_unreadable'), 'the first alert stays one').toHaveLength(1);
  }, 60_000);

  it('R2 — a garbled Séra refusal, then the supplier refuses (Boutik+\'s key): she is refunded in full, as a supplier refusal', async () => {
    const orderId = await commandePayee('0002');
    const paye = payes.get(orderId)!;
    expect((await sera(refusIllisible(orderId))).status).toBe(200);
    expect((await boutik(rejete(orderId))).status).toBe(200);
    const a = await demande(orderId);
    expect(a.remboursement).toMatchObject({ decision: 'ouvert', refus: { nature: 'refus_fournisseur' } });
    expect(a.remboursement!.lignes).toEqual([expect.objectContaining({ amount: paye, etat: 'demande' })]);
    await confirmerTout(orderId);
    const fini = await auditDe(orderId);
    expect(fini.state).toBe('refunded');
    expect(fini.refunds).toHaveLength(1);
    expect((await vueDe(orderId))['remboursement']).toEqual({ etat: 'fait', montant: paye, motif: 'indisponible' });
  }, 60_000);

  it('R3 — a refund already decided stays first-wins: later refusals add no line, mint no key, ask nothing again', async () => {
    const orderId = await commandePayee('0003');
    expect((await sera(refusLisible(orderId))).status).toBe(200);
    const avant = await demande(orderId);
    expect(avant.remboursement!.lignes).toHaveLength(1);
    const { refundKey, essais } = avant.remboursement!.lignes[0]!;

    expect((await sera(refusLisible(orderId, `door-valid-rejection-${orderId}-bis`))).status).toBe(200);
    expect((await boutik(rejete(orderId))).status).toBe(200);
    await new Promise((r) => setTimeout(r, 500));
    const apres = await auditDe(orderId);
    expect(apres.remboursement).toMatchObject({ decision: 'ouvert', refus: { nature: 'refus_justifie' } });
    expect(apres.remboursement!.lignes).toEqual([expect.objectContaining({ refundKey, essais, etat: 'demande' })]);
    await confirmerTout(orderId);
    expect((await auditDe(orderId)).refunds).toHaveLength(1);
  }, 60_000);
});

describe('no payout line for an order being refunded or whose door leg is not paid', () => {
  it('R4 — a refund on record, then Séra says « delivered »: refused by name, no line, nothing logged, one alert; the refund still finishes', async () => {
    const orderId = await commandePayee('0004');
    expect((await sera(refusLisible(orderId))).status).toBe(200);
    await demande(orderId);
    const avant = (await auditDe(orderId)).inputCount;

    const v = await sera(valide(orderId));
    expect(`${v.status} ${v.text}`).toBe('409 {"ok":false,"reason":"eligibility_after_refund"}');
    expect(await lignesDe(orderId), 'no payout line').toEqual([]);
    expect((await auditDe(orderId)).inputCount, 'the refused input is never logged').toBe(avant);
    expect((await vueDe(orderId))['livree'], 'her tracking does not say delivered').toBe(false);
    expect(await alertesDe(orderId, 'eligibility_after_refund')).toHaveLength(1);

    const encore = await sera(valide(orderId));
    expect(encore.status).toBe(409);
    expect(await alertesDe(orderId, 'eligibility_after_refund'), 'Séra retries: still one alert').toHaveLength(1);
    expect(await lignesDe(orderId)).toEqual([]);

    await confirmerTout(orderId);
    expect((await auditDe(orderId)).state).toBe('refunded');
    expect(await doDe(orderId, '/entry/reconcile')).toMatchObject({ ok: true, clean: true, alerts: [] });
  }, 60_000);

  it('R4b — delivered first, refused after, then a validated event with a fresh id: the answer is unchanged and no refusal alert is raised', async () => {
    const orderId = await commandePayee('0005');
    const v = await sera(valide(orderId));
    expect(`${v.status} ${v.text}`).toBe('200 {"ok":true,"status":"recorded","obligations":2}');
    expect((await sera(refusLisible(orderId))).status).toBe(200);
    expect((await auditDe(orderId)).remboursement).toMatchObject({ decision: 'livraison_acceptee', lignes: [] });
    const avant = (await auditDe(orderId)).inputCount;

    const frais = await sera(valide(orderId, `eligibility-${orderId}-fresh`));
    expect(`${frais.status} ${frais.text}`).toBe('200 {"ok":true,"status":"duplicate"}');
    expect(await lignesDe(orderId)).toHaveLength(2);
    expect((await auditDe(orderId)).inputCount).toBe(avant);
    expect(await alertesDe(orderId, 'eligibility_after_refund')).toEqual([]);
  }, 60_000);

  it('R4c — delivered first, then a garbled refusal, then Séra redelivers « delivered » (same id and fresh id): the redelivery answers as before, no refusal alert', async () => {
    const orderId = await commandePayee('0007');
    const v = await sera(valide(orderId));
    expect(`${v.status} ${v.text}`).toBe('200 {"ok":true,"status":"recorded","obligations":2}');
    expect((await sera(refusIllisible(orderId))).status).toBe(200);
    expect((await auditDe(orderId)).remboursement).toMatchObject({ decision: 'refus_illisible', lignes: [] });
    const avant = (await auditDe(orderId)).inputCount;

    const meme = await sera(valide(orderId));
    expect(`${meme.status} ${meme.text}`).toBe('200 {"ok":true,"status":"duplicate"}');
    const frais = await sera(valide(orderId, `eligibility-${orderId}-fresh`));
    expect(`${frais.status} ${frais.text}`).toBe('200 {"ok":true,"status":"duplicate"}');
    expect(await lignesDe(orderId)).toHaveLength(2);
    expect((await auditDe(orderId)).inputCount).toBe(avant);
    expect(await alertesDe(orderId, 'eligibility_after_refund')).toEqual([]);
  }, 60_000);

  it('R5 — pay-at-door, the door leg still due: « delivered » is refused by name with one alert; after the door payment the SAME event writes the two lines from the Quote', async () => {
    const orderId = await commandePayee('0006', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const ouvert = await auditDe(orderId);
    expect(ouvert.state).toBe('confirmed');
    expect(ouvert.doorLeg).toBe('due');
    const avant = ouvert.inputCount;

    const v = await sera(valide(orderId));
    expect(`${v.status} ${v.text}`).toBe('409 {"ok":false,"reason":"eligibility_before_funded_legs"}');
    expect(await lignesDe(orderId)).toEqual([]);
    expect((await auditDe(orderId)).inputCount, 'the refused input is never logged').toBe(avant);
    expect(await alertesDe(orderId, 'eligibility_before_funded_legs')).toHaveLength(1);
    expect((await sera(valide(orderId))).status).toBe(409);
    expect(await alertesDe(orderId, 'eligibility_before_funded_legs'), 'still one').toHaveLength(1);

    // The buyer asks for the door collection; the provider confirms it.
    const porte = await post(`/checkout/order/${encodeURIComponent(orderId)}/door-charge`, { holderRef: 'holder-0006', commandId: 'cmd-door-0006' });
    expect(porte.status, porte.text).toBe(200);
    const gains = await doDe(orderId, '/entry/gains');
    const split = gains['split'] as { productSubtotal: number; sellerNet: number; resellerNet: number };
    const provider = new MockPaymentProvider({});
    provider.initiateCharge({
      orderId, paymentAttemptId: (await auditDe(orderId)).legKeys['door']!, amount: split.productSubtotal,
      correlationId: `corr-${orderId}`, requestedAtIso: T0, legType: 'door',
    });
    const doorEvent = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
    const paid = await post('/checkout/webhook/door', doorEvent, signe);
    expect(paid.status, paid.text).toBe(200);
    expect((await auditDe(orderId)).doorLeg).toBe('paid');

    const apres = await sera(valide(orderId));
    expect(`${apres.status} ${apres.text}`).toBe('200 {"ok":true,"status":"recorded","obligations":2}');
    const lignes = await lignesDe(orderId);
    expect(lignes.find((l) => l.party.startsWith('supplier:'))?.amount).toBe(split.sellerNet);
    expect(lignes.find((l) => l.party.startsWith('reseller:'))?.amount).toBe(split.resellerNet);
    expect(lignes).toHaveLength(2);
    expect(await doDe(orderId, '/entry/reconcile')).toMatchObject({ ok: true, clean: true, alerts: [] });
  }, 60_000);
});
