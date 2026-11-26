import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeSandboxRefund } from '../../../scripts/sandbox-payment-confirm.mjs';
import { cleC, seance, type Seance } from './seance';

/**
 * ═══ « MES GAINS » SHOWS EACH SALE AT THE RUNG THE SERVER RECORDS — on the
 * REAL Worker (miniflare on the shipped bundle, every Durable Object real;
 * only Boutik+'s OFFER service stood in, to the bounds `related-party.e2e`
 * and `livraison-boutik.e2e` certify). ═══
 *
 * Build Spec SP-I04: « Earnings MUST display Quote/Ledger/Settlement
 * projections only (net), never a live recomputation. » Building Plan SP6.1:
 * « Projected/Locked/Eligible/Payable/Processing/Paid/Held/Adjusted (net,
 * traced) ». Each road below is ASKED OF THE LEDGER first (the order's own
 * audit: its state, its refund record, its obligations), then read the way
 * her phone reads it: her app's OWN port (`HttpResellerFeed`, riding her
 * session over `globalThis.fetch` into this Worker) and her app's OWN model
 * (`vueDesGains`). Nothing of the app is stubbed.
 *
 *   (a) pay the delivery fee, product at the door; Séra says she refused it,
 *       fee kept ⇒ nothing is due back, the order stays `confirmed` — and her
 *       sale is NOT on « Locked »: it is counted as stopped before delivery;
 *   (b) delivered and validated ⇒ two obligations in the ledger — her sale
 *       is on « Eligible »;
 *   (c) paid in full, refused, refund confirmed ⇒ `refunded` — her sale is
 *       still on her wire, counted as refunded, and the answer is complete.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'gains-verite-'));
const WEBHOOK_SECRET = 'test-payment-webhook-secret-gv001';
const PROGRESS_SECRET = 'test-progress-write-secret-gv001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-gv001';
const T0 = '2026-11-26T08:00:00.000Z';
const BASE = 'http://c';
const signed = { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' };

/** Door-eligible (verified tier, inspectable category), so both payment modes exist. */
const SUPPLY = [
  {
    productVersionId: 'pv-gv-1',
    offerVersion: 'ov-gv-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 50,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

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
      CHECKOUT_OPS_SECRET: cleC.Authorization.slice('Bearer '.length),
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path === '/fulfillment/order-confirmed') return Response.json({ ok: true, status: 'registered' });
        if (request.method === 'POST' && path === '/fulfillment/delivered') {
          return Response.json({ ok: true, status: 'delivered', deliveredAt: new Date().toISOString() });
        }
        if (request.method === 'POST' && path === '/fulfillment/delivery-refused') {
          // Boutik+ RETOUR-RAYON-1: a door refusal waits for the supplier's return code.
          return Response.json({ ok: true, status: 'restock_on_return' });
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
  // Her app's `fetch`, crossing into THIS Worker. Only the transport is bridged.
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { signal: _signal, ...reste } = init ?? {};
    return (await mf.dispatchFetch(url, reste as never)) as unknown as Response;
  }) as typeof fetch;
});
afterAll(async () => {
  delete (globalThis as { fetch?: unknown }).fetch;
  await mf?.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const poste = async (path: string, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) => {
  const res = await mf.dispatchFetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
};

let seq = 0;
const freshKey = (): string => `rk-gv-${String((seq += 1)).padStart(4, '0')}-${'z'.repeat(10)}`;

type Mode = 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';

interface Audit {
  state: string;
  legKeys?: Record<string, string>;
  remboursement: { decision: string; retenu: number; lignes: { legType: string; etat: string; amount: number }[] } | null;
}
async function audit(orderId: string): Promise<Audit> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  return (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as Audit;
}

/** A provider-confirmed checkout leg on an order under HER attribution. */
async function commandePayee(S: Seance, n: string, mode: Mode): Promise<string> {
  const created = await poste('/storefronts', {
    commandId: `cmd-create-${n}`, id: `sf-gv-${n}`, resellerId: S.accountId,
    shortCode: `GV-${n}`, name: 'Boutique de Awa', zone: 'Ouagadougou',
    category: 'Général', correlationId: `corr-gv-${n}`, at: T0,
  }, S.bearer);
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${created.text}`);
  await poste(`/storefronts/${encodeURIComponent(`sf-gv-${n}`)}/publish`, { correlationId: 'corr-en-ligne' }, S.bearer);
  const pub = await poste('/listings', {
    commandId: `cmd-listing-${n}`, listingId: `lst-gv-${n}`, storefrontId: `sf-gv-${n}`,
    resellerId: S.accountId, productVersionId: 'pv-gv-1', offerVersion: 'ov-gv-1',
    markup: 1_500, correlationId: `corr-gv-${n}`, at: T0,
  }, S.bearer);
  if (pub.json['status'] !== 'published') throw new Error(`setup: listing ${pub.text}`);
  const quote = await poste('/checkout/quote', {
    slug: `gv-${n}`, pid: 'pv-gv-1', paymentMode: mode, zoneTo: 'Ouagadougou',
    attributionResellerId: S.accountId, requestKey: freshKey(),
  });
  const quoteId = quote.json['quoteId'];
  if (typeof quoteId !== 'string') throw new Error(`setup: quote ${quote.status} ${quote.text}`);
  const held = await poste(`/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, { commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status} ${held.text}`);
  const ordered = await poste('/checkout/order', {
    quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`,
    contact: { phone: '76 00 99 88', quartier: 'Gounghin', repere: 'en face de la pharmacie' },
  });
  if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status} ${ordered.text}`);
  const orderId = `ord-${quoteId}`;
  const vue = safeJson(await (await mf.dispatchFetch(`${BASE}/checkout/order/${encodeURIComponent(orderId)}`)).text());
  const legKey = (await audit(orderId)).legKeys?.['checkout'];
  if (legKey === undefined) throw new Error(`no checkout leg key on ${orderId}`);
  const paid = await poste('/checkout/webhook/payment', {
    name: 'payment.checkout_leg_confirmed.v1',
    envelope: {
      command_id: `whk-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 1,
      actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1',
    },
    payload: {
      provider: 'sandbox-provider', payment_attempt_id: legKey,
      collectRef: `collect-${orderId}`, amount: Number(vue['amountPaidAtCheckout']),
      fee: 0, status: 'held', order_id: orderId, redelivery: false,
    },
  }, signed);
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${paid.text}`);
  return orderId;
}

/** Séra's refused-course fact, on the progress door. */
const refus = (orderId: string, payload: Record<string, unknown>) =>
  poste('/fulfillment/progress', {
    name: 'delivery.refused.v1',
    envelope: {
      command_id: `refus-${orderId}`, correlation_id: `corr-${orderId}`,
      aggregateVersion: 9, actor: 'custody-service:e1', serverTime: T0, version: '1',
    },
    payload: { order_id: orderId, task_id: `task-${orderId}`, ...payload },
  }, { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` });

/** Séra's validated delivery, on the progress door. */
const valide = (orderId: string) =>
  poste('/fulfillment/progress', {
    name: 'delivery.validated.v1',
    envelope: {
      command_id: `eligibility-${orderId}`, correlation_id: `corr-${orderId}`,
      aggregateVersion: 9, actor: 'custody-service:e1', serverTime: T0, version: '1',
    },
    payload: {
      order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`,
      result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-gv-001',
    },
  }, { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` });

/** The founder's sandbox tool: wait until the order asked the provider, then confirm every refund it asked. */
async function confirmerRemboursements(orderId: string): Promise<void> {
  let demandes = { status: 0, json: {} as Record<string, unknown> };
  for (let i = 0; i < 160; i += 1) {
    const res = await mf.dispatchFetch(`${BASE}/checkout/webhook/refund-key/${encodeURIComponent(orderId)}`, { headers: signed });
    demandes = { status: res.status, json: safeJson(await res.text()) };
    if (demandes.status === 200) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  if (demandes.status !== 200) throw new Error(`the refund of ${orderId} was never asked`);
  for (const r of demandes.json['remboursements'] as { refundKey: string; amount: number; collectRef: string }[]) {
    const ok = await poste('/checkout/webhook/refund', composeSandboxRefund(orderId, r, new Date().toISOString()), signed);
    if (ok.status !== 200) throw new Error(`refund confirmation ${ok.status} ${ok.text}`);
  }
}

/** HER phone's read: her app's own port, her app's own model. */
async function sesGains(S: Seance) {
  const { HttpResellerFeed } = await import('../../../apps/reseller-app/src/sales/feed-service');
  const { vueDesGains } = await import('../../../apps/reseller-app/src/sales/gains-model');
  const res = await new HttpResellerFeed(BASE).mesVentes(S.session);
  if (!res.ok) throw new Error(`her feed answered ${res.reason}`);
  const vue = vueDesGains(res.ventes, res.incomplet);
  if (vue.kind !== 'echelle') throw new Error(`her ladder is ${vue.kind}`);
  const palier = (etat: string) => vue.paliers.find((p) => p.etat === etat)!;
  return { res, vue, palier };
}

describe('« Mes gains » shows each sale at the rung the server records — on the real Worker, read by her own app', () => {
  it('(a) product at the door, refused by the buyer with the fee kept: nothing is due back, and her sale leaves « Locked »', async () => {
    const S = await seance(mf, 'gva');
    const orderId = await commandePayee(S, '0001', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const r = await refus(orderId, { family: 'return', reason_code: 'change_of_mind', fault_class: 'buyer', fee_retained: true });
    expect(`${r.status} ${r.text}`).toBe('200 {"ok":true,"status":"recorded"}');

    // THE LEDGER: a refund decided with nothing to give back; the order never leaves `confirmed`.
    const a = await audit(orderId);
    expect(a.state).toBe('confirmed');
    expect(a.remboursement).toMatchObject({ decision: 'ouvert', retenu: 1_000, lignes: [] });

    const { res, vue, palier } = await sesGains(S);
    expect(res.incomplet).toBe(false);
    expect(res.ventes.map((v) => v.orderId)).toEqual([orderId]);
    expect(palier('Locked').ventes, 'a refused sale is not money that is hers').toBe(0);
    expect(palier('Locked').netFcfa).toBe(0);
    expect(vue.paliers.every((p) => p.ventes === 0), 'it sits on no rung at all').toBe(true);
    expect(vue.refusees, 'counted on its own honest line').toBe(1);
    expect(vue.remboursees).toBe(0);
  });

  it('(b) delivered and validated by Séra: two obligations in the ledger, and her sale is on « Eligible »', async () => {
    const S = await seance(mf, 'gvb');
    const orderId = await commandePayee(S, '0002', 'FULL_PREPAY');
    const v = await valide(orderId);
    expect(`${v.status} ${v.text}`).toBe('200 {"ok":true,"status":"recorded","obligations":2}');
    expect((await audit(orderId)).state, 'the order state alone still says confirmed').toBe('confirmed');

    const { res, vue, palier } = await sesGains(S);
    expect(res.incomplet).toBe(false);
    expect(palier('Locked').ventes, 'a delivered sale is no longer only locked').toBe(0);
    expect(palier('Eligible').ventes).toBe(1);
    expect(palier('Eligible').netFcfa, 'her net, copied off the quote').toBe(res.ventes[0]!.resellerNet);
    expect(palier('Eligible').atteignable).toBe(true);
    expect(vue.refusees).toBe(0);
  });

  it('(a2) paid in full, refused by Séra, the refund not yet confirmed by the provider: already off « Locked »', async () => {
    const S = await seance(mf, 'gva2');
    const orderId = await commandePayee(S, '0004', 'FULL_PREPAY');
    const r = await refus(orderId, { rejection: 'valid_rejection', fault_class: 'seller' });
    expect(r.status, r.text).toBe(200);
    // THE LEDGER: a refund with a line to give back; until the provider confirms, the order says `confirmed`.
    const a = await audit(orderId);
    expect(a.state).toBe('confirmed');
    expect(a.remboursement?.decision).toBe('ouvert');
    expect(a.remboursement?.lignes.length).toBe(1);

    const { res, vue, palier } = await sesGains(S);
    expect(res.incomplet).toBe(false);
    expect(palier('Locked').ventes, 'refused, refund in flight: not money that is hers').toBe(0);
    expect(vue.refusees).toBe(1);
    expect(vue.remboursees).toBe(0);
  });

  it('(c) paid in full, refused, refund confirmed: the sale stays on her wire as refunded, and the answer is complete', async () => {
    const S = await seance(mf, 'gvc');
    const orderId = await commandePayee(S, '0003', 'FULL_PREPAY');
    const r = await refus(orderId, { rejection: 'valid_rejection', fault_class: 'seller' });
    expect(r.status, r.text).toBe(200);

    await confirmerRemboursements(orderId);
    expect((await audit(orderId)).state).toBe('refunded');

    const { res, vue } = await sesGains(S);
    expect(res.ventes.map((x) => [x.orderId, x.state]), 'the refunded sale is read, not dropped').toEqual([[orderId, 'refunded']]);
    expect(res.incomplet, 'the server said complete, so she is told complete').toBe(false);
    expect(vue.incomplet).toBe(false);
    expect(vue.paliers.every((p) => p.ventes === 0)).toBe(true);
    expect(vue.remboursees, 'counted on its own honest line').toBe(1);
    expect(vue.refusees, 'once refunded it is counted once, as refunded').toBe(0);
  });
});
