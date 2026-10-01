import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, type Seance } from './seance';

/**
 * ═══ PORTE-APRES-RECHARGE-1 (AUDIT-4 A-01, founder « go », 2026-10-01) — her
 * door, after the tab died, through the BUYER APP'S OWN ports, on the REAL
 * Worker ═══
 *
 * §5.5: « product paid by MoMo at the door before custody transfer ». The
 * buyer site's own price module (`fetchClienteQuote`, imported from the app,
 * never re-implemented) holds and orders a pay-at-the-door article; the flow
 * keeps `{orderId, buyerRef, at}` and, in its own per-order store, the door
 * holder, exactly as `flow.ts` writes them; she then orders something else on
 * the same phone (the newest slot moves on); the tab « dies » (nothing in
 * memory survives); then `porteGardee`
 * — what « Ma commande », a reload and « Mes commandes » on this phone now use
 * — starts the door collection. The LEDGER decides: the Worker accepts the
 * holder (the reservation's own receipt), the door leg is `due` until the
 * certified door webhook, then `paid`, and only then does her remise route
 * answer a code. A phone that kept no holder gets no door road at all.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'porte-recharge-'));
const WEBHOOK_SECRET = 'test-payment-webhook-secret-pr001';
const PROGRESS_SECRET = 'test-progress-write-secret-pr001';
const PV = 'pv-pr-1';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: { PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET, CHECKOUT_OPS_SECRET: OPS_SECRET, PROGRESS_WRITE_SECRET: PROGRESS_SECRET },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path === '/fulfillment/order-confirmed') return Response.json({ ok: true, status: 'registered' });
      if (/^\/supply-projection\/[^/]+$/.test(path)) {
        return Response.json({
          version: 1,
          asOf: new Date().toISOString(),
          value: {
            productVersionId: PV, offerVersion: 'ov-pr-1', basePrice: 10_000, resellerCommission: 1_000, available: 9,
            productName: 'Bazin riche', assetRefs: [] as string[], category: 'fashion_bags_fabrics', sellerTier: 'verified',
          },
        });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
    },
  },
});

/** A phone's storage — the shape `localStorage` / `sessionStorage` answer. */
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
  S = await seance(mf, 'pr');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { signal: _signal, ...reste } = init ?? {};
    return (await mf.dispatchFetch(url, reste as never)) as unknown as Response;
  }) as typeof fetch;
  // Her boutique and the article, through her own session.
  const created = await mf.dispatchFetch('http://sf/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({ commandId: 'c-pr-1', id: 'sf-pr-1', resellerId: S.accountId, shortCode: 'PR-0001', name: 'Boutique porte', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-pr-1' }),
  });
  expect(created.status).toBe(200);
  const pub = await mf.dispatchFetch('http://sf/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: 'cmd-listing-pr-1', listingId: 'lst-pr-1', storefrontId: 'sf-pr-1', resellerId: S.accountId,
      productVersionId: PV, offerVersion: 'ov-pr-1', markup: 1_500, correlationId: 'corr-pr-1', at: new Date().toISOString(),
    }),
  });
  const publie = await pub.text();
  expect(publie, publie).toContain('"published"');
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

type Port = typeof import('../../../apps/buyer-pwa/src/cliente/quote-port.js');
type Modele = typeof import('../../../apps/buyer-pwa/src/cliente/quote-model.js');

async function legKeyOf(orderId: string, leg: 'checkout' | 'door'): Promise<string> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const record = (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as { legKeys?: Record<string, string> };
  const key = record.legKeys?.[leg];
  if (key === undefined) throw new Error(`no ${leg} leg key on ${orderId}`);
  return key;
}

function webhook(orderId: string, attemptId: string, amount: number, door: boolean): unknown {
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({ orderId, paymentAttemptId: attemptId, amount, correlationId: `corr-${orderId}`, requestedAtIso: new Date().toISOString(), ...(door ? { legType: 'door' as const } : {}) });
  const plan = provider.webhookDeliveryPlan().find((d) => d.event.name === (door ? 'payment.door_leg_confirmed.v1' : 'payment.checkout_leg_confirmed.v1'));
  if (plan === undefined) throw new Error('the certified mock emitted no event');
  return plan.event;
}

async function poster(path: string, event: unknown): Promise<number> {
  const res = await mf.dispatchFetch(`http://sf${path}`, {
    method: 'POST', headers: { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
  });
  await res.text();
  return res.status;
}

/** Her order, held and created through the app's OWN price module, kept on her phone as the flow keeps it. */
async function commandeALaPorte(
  port: Port,
  modele: Modele,
  telephone: Storage,
  session: Storage = memoire(),
  http: ReturnType<Port['httpQuotePort']> = port.httpQuotePort('http://sf'),
): Promise<{ orderId: string; buyerRef: string; payerDansLOnglet: (orderId: string, essai: number) => Promise<unknown> }> {
  const pret = await modele.fetchClienteQuote(
    http,
    { slug: 'pr-0001', pid: PV, zoneTo: 'Ouagadougou', attributionResellerId: S.accountId },
    (intent) => port.requestKeyFor(intent, session),
    (quoteId) => port.commandIdFor(quoteId, session),
    1_500,
    (quoteId, essai) => port.orderCommandIdFor(quoteId, essai, session),
  );
  if (pret.status !== 'ready') throw new Error(`price: ${JSON.stringify(pret)}`);
  expect(pret.bIndisponible).toBe(false);
  expect(pret.titulairePorte, 'a door quote exists, so its holder is exposed').toBeTypeOf('string');
  expect((await pret.reserve('B')).status).toBe('reserved');
  const cree = await pret.commander('B', 0, { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'près du marché' });
  if (cree.status !== 'order' || cree.order.buyerRef === undefined) throw new Error(`order: ${JSON.stringify(cree)}`);
  // EXACTLY what flow.ts writes for a door order (mode B ⇒ the holder).
  port.garderCommande({ orderId: cree.order.orderId, buyerRef: cree.order.buyerRef, at: new Date().toISOString() }, telephone);
  port.garderPorte(cree.order.orderId, pret.titulairePorte!, telephone);
  return { orderId: cree.order.orderId, buyerRef: cree.order.buyerRef, payerDansLOnglet: pret.payerALaPorte };
}

describe('PORTE-APRES-RECHARGE-1 — her door after the tab died, on the real Worker', () => {
  it('the kept holder starts the door collection the Worker accepts; the code waits for the door webhook, then is hers', async () => {
    const port: Port = await import('../../../apps/buyer-pwa/src/cliente/quote-port.js');
    const modele: Modele = await import('../../../apps/buyer-pwa/src/cliente/quote-model.js');
    const telephone = memoire();
    const { orderId, buyerRef } = await commandeALaPorte(port, modele, telephone);
    expect(await poster('/checkout/webhook/payment', webhook(orderId, await legKeyOf(orderId, 'checkout'), 1_000, false))).toBe(200);

    // Verifier MAJOR 1 — she orders something else on this phone, and that
    // order fails: the newest slot moves on, then is cleared. Her door stays.
    port.garderCommande({ orderId: 'ord-plus-tard', buyerRef: 'ref-plus-tard', at: new Date().toISOString() }, telephone);
    port.oublierCommande(telephone);

    // THE TAB DIES — nothing in memory survives; a fresh port and a fresh tab.
    const payer = port.porteGardee(orderId, port.httpQuotePort('http://sf'), telephone, memoire());
    expect(payer, 'the phone kept the holder, so her door exists').toBeTypeOf('function');

    const demande = await payer!(orderId, 0);
    expect(demande.status, JSON.stringify(demande)).toBe('order');
    expect(demande.status === 'order' && demande.order.doorLeg).toBe('due');
    const avant = await port.httpQuotePort('http://sf').orderState(orderId);
    expect(avant.status === 'order' && avant.order.doorLeg, 'a request to collect is not a payment').toBe('due');

    // Séra's arrival fact, then — still unpaid — no code.
    const arrivee = await mf.dispatchFetch('http://sf/fulfillment/transit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
      body: JSON.stringify({ orderId, stage: 'arrivee', asOf: new Date().toISOString() }),
    });
    expect(arrivee.status).toBe(200);
    expect((await port.httpQuotePort('http://sf').remise(orderId, buyerRef)).status, 'no code while the product is unpaid').toBe('refused');

    // The operator confirms the door collection the Worker started.
    expect(await poster('/checkout/webhook/door', webhook(orderId, await legKeyOf(orderId, 'door'), 11_500, true))).toBe(200);
    const apres = await port.httpQuotePort('http://sf').orderState(orderId);
    expect(apres.status === 'order' && apres.order.doorLeg).toBe('paid');
    const code = await port.httpQuotePort('http://sf').remise(orderId, buyerRef);
    expect(code.status).toBe('code');
  }, 120_000);

  // Verifier minor 2 — the checkout tab and the reopened road slot the door
  // command on the same key, so a reload while her request waits for the
  // operator REPLAYS it. The ledger, not the response, says how many attempts.
  it('a reload while her door request waits replays HER request — one door attempt on the ledger, not two', async () => {
    const port: Port = await import('../../../apps/buyer-pwa/src/cliente/quote-port.js');
    const modele: Modele = await import('../../../apps/buyer-pwa/src/cliente/quote-model.js');
    const telephone = memoire();
    const onglet = memoire();
    const reel = port.httpQuotePort('http://sf');
    const commandes: string[] = [];
    const espion = { ...reel, doorCharge: (id: string, cmd: string, h: string) => { commandes.push(cmd); return reel.doorCharge(id, cmd, h); } };
    const { orderId, payerDansLOnglet } = await commandeALaPorte(port, modele, telephone, onglet, espion);
    expect(await poster('/checkout/webhook/payment', webhook(orderId, await legKeyOf(orderId, 'checkout'), 1_000, false))).toBe(200);

    expect(((await payerDansLOnglet(orderId, 0)) as { status: string }).status).toBe('order');
    // The tab reloads: its memory dies, its sessionStorage survives.
    const apres = await port.porteGardee(orderId, espion, telephone, onglet)!(orderId, 0);
    expect(apres.status, JSON.stringify(apres)).toBe('order');
    expect(commandes).toHaveLength(2);
    expect(commandes[1], 'the same request, replayed').toBe(commandes[0]);
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const audit = (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as { doorAttempts: unknown[] };
    expect(audit.doorAttempts, 'a replay is not a new attempt').toHaveLength(1);
  }, 120_000);

  it('a phone that kept no holder for the order — another order, or a prepaid one — gets no door road at all', async () => {
    const port: Port = await import('../../../apps/buyer-pwa/src/cliente/quote-port.js');
    const telephone = memoire();
    port.garderPorte('ord-autre', 'titulaire-autre', telephone);
    expect(port.porteGardee('ord-pas-celle-ci', port.httpQuotePort('http://sf'), telephone, memoire())).toBeUndefined();
    port.garderCommande({ orderId: 'ord-prepayee', buyerRef: 'ref-prepayee', at: new Date().toISOString() }, telephone);
    expect(port.porteGardee('ord-prepayee', port.httpQuotePort('http://sf'), telephone, memoire())).toBeUndefined();
  });
});
