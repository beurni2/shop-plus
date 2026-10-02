import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, type Seance } from './seance';

/**
 * ═══ AUDIT-4 A-04 — the gift link's read, through the BUYER APP'S OWN ports,
 * on the REAL Worker ═══
 *
 * `?cadeau={orderId}` is forwarded to the liste's creator and to whoever she
 * shows it. It used to read the public order view, which carries what was
 * paid, what is due and any refund. The app's gift reader (`httpSuiviCadeau`,
 * imported, never re-implemented) now asks `/suivi`; the WORKER decides what
 * that answers: the delivery's steps, and not one amount — while the order
 * view itself (the purchaser's own tracking) is unchanged.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'cadeau-suivi-'));
const PROGRESS_SECRET = 'test-progress-write-secret-cs001';
const PV = 'pv-cs-1';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: { PAYMENT_WEBHOOK_SECRET: 'test-payment-webhook-secret-cs001', CHECKOUT_OPS_SECRET: OPS_SECRET, PROGRESS_WRITE_SECRET: PROGRESS_SECRET },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (/^\/supply-projection\/[^/]+$/.test(path)) {
        return Response.json({
          version: 1,
          asOf: new Date().toISOString(),
          value: {
            productVersionId: PV, offerVersion: 'ov-cs-1', basePrice: 10_000, resellerCommission: 1_000, available: 9,
            productName: 'Bazin riche', assetRefs: [] as string[], category: 'fashion_bags_fabrics', sellerTier: 'verified',
          },
        });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
    },
  },
});

function memoire(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}

let S: Seance;
beforeAll(async () => {
  S = await seance(mf, 'cs');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { signal: _signal, ...reste } = init ?? {};
    return (await mf.dispatchFetch(url, reste as never)) as unknown as Response;
  }) as typeof fetch;
  const created = await mf.dispatchFetch('http://sf/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({ commandId: 'c-cs-1', id: 'sf-cs-1', resellerId: S.accountId, shortCode: 'CS-0001', name: 'Boutique cadeau', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-cs-1' }),
  });
  // EN-LIGNE-1 — her app puts the shop online in the same act as creating it.
  await mf.dispatchFetch(`http://sf/storefronts/${encodeURIComponent('sf-cs-1')}/publish`, { method: 'POST', headers: S.bearer, body: JSON.stringify({ correlationId: 'corr-en-ligne' }) });
  expect(created.status).toBe(200);
  const pub = await mf.dispatchFetch('http://sf/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: 'cmd-listing-cs-1', listingId: 'lst-cs-1', storefrontId: 'sf-cs-1', resellerId: S.accountId,
      productVersionId: PV, offerVersion: 'ov-cs-1', markup: 1_500, correlationId: 'corr-cs-1', at: new Date().toISOString(),
    }),
  });
  expect(await pub.text()).toContain('"published"');
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const MONTANTS = ['amountPaidAtCheckout', 'amountDueAtDelivery', 'remboursement', 'buyerRef', 'doorLeg'];

describe('AUDIT-4 A-04 — the gift link reads where the parcel is, never what was paid', () => {
  it('/suivi answers the steps alone; the purchaser’s own order view still carries her amounts', async () => {
    const port = await import('../../../apps/buyer-pwa/src/cliente/quote-port.js');
    const modele = await import('../../../apps/buyer-pwa/src/cliente/quote-model.js');
    const session = memoire();
    const pret = await modele.fetchClienteQuote(
      port.httpQuotePort('http://sf'),
      { slug: 'cs-0001', pid: PV, zoneTo: 'Ouagadougou', attributionResellerId: S.accountId },
      (intent) => port.requestKeyFor(intent, session),
      (quoteId) => port.commandIdFor(quoteId, session),
      1_500,
      (quoteId, essai) => port.orderCommandIdFor(quoteId, essai, session),
    );
    if (pret.status !== 'ready') throw new Error(`price: ${JSON.stringify(pret)}`);
    expect((await pret.reserve('A')).status).toBe('reserved');
    const cree = await pret.commander('A', 0, { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'près du marché' });
    if (cree.status !== 'order') throw new Error(`order: ${JSON.stringify(cree)}`);
    const orderId = cree.order.orderId;
    // Séra's departure fact, so a step is on the road for the gift read to carry.
    const parti = '2026-10-01T09:30:00.000Z';
    const depart = await mf.dispatchFetch('http://sf/fulfillment/transit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
      body: JSON.stringify({ orderId, stage: 'en_route', asOf: parti }),
    });
    expect(depart.status, await depart.clone().text()).toBe(200);

    // The raw answer: only allowlisted keys, not one amount — and the step is there.
    const brut = (await (await mf.dispatchFetch(`http://sf/checkout/order/${encodeURIComponent(orderId)}/suivi`)).json()) as Record<string, unknown>;
    expect(Object.keys(brut).every((k) => ['state', 'acceptedAt', 'readyAt', 'departedAt', 'arrivedAt', 'livree'].includes(k)), JSON.stringify(brut)).toBe(true);
    for (const k of MONTANTS) expect(brut[k], k).toBeUndefined();
    expect(typeof brut['state']).toBe('string');
    expect(brut['departedAt']).toBe(parti);

    // The app's own gift reader, against the same Worker: the step reaches her page, no sum does.
    const lu = await port.httpSuiviCadeau('http://sf')(orderId);
    if (lu.status !== 'suivi') throw new Error(`gift read: ${JSON.stringify(lu)}`);
    expect(lu.suivi.departedAt).toBe(parti);
    expect(JSON.stringify(lu)).not.toMatch(/amount|1[0-9] ?[0-9]00|remboursement/);

    // CONTROL — the purchaser's own order view still carries her amounts.
    const vue = (await (await mf.dispatchFetch(`http://sf/checkout/order/${encodeURIComponent(orderId)}`)).json()) as Record<string, unknown>;
    expect(typeof vue['amountPaidAtCheckout']).toBe('number');
  }, 120_000);

  it('an unknown order is the honest introuvable, never a crash', async () => {
    const port = await import('../../../apps/buyer-pwa/src/cliente/quote-port.js');
    expect(await port.httpSuiviCadeau('http://sf')('ord-inconnu-1')).toEqual({ status: 'introuvable' });
  }, 60_000);
});
