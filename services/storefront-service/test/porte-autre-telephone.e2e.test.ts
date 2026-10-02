import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, type Seance } from './seance';

/**
 * ═══ PORTE-AUTRE-TELEPHONE-1 (founder, 2026-10-02: « door payment from
 * another phone stays off … fix this »; canon 3.27.0 SP6, fourth ruling) —
 * through the BUYER APP'S OWN ports, on the REAL Worker ═══
 *
 * Phone A: she is signed in, orders an article to pay at the door through the
 * app's own price module, and the app's own account linker (`creerRattacheur`)
 * tells her account the order — with the door's key — once the service says
 * her delivery fees moved. Phone B: a fresh phone, nothing in its stores; she
 * signs in, « Mes commandes » reads the order back with its key, and the app's
 * own door road (`porteGardee`) starts the collection. The LEDGERS decide: the
 * account book holds the key beside her order; the Worker accepts the holder,
 * the door leg is `due` until the certified door webhook, then `paid`, and only
 * then is the code hers. A prepaid order carries no key, so phone B offers no
 * door for it.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'porte-autre-'));
const WEBHOOK_SECRET = 'test-payment-webhook-secret-pa001';
const PROGRESS_SECRET = 'test-progress-write-secret-pa001';
const PV = 'pv-pa-1';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO', COMPTES_CLIENTES: 'BuyerAccountsDO',
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
            productVersionId: PV, offerVersion: 'ov-pa-1', basePrice: 10_000, resellerCommission: 1_000, available: 9,
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
  S = await seance(mf, 'pa');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { signal: _signal, ...reste } = init ?? {};
    return (await mf.dispatchFetch(url, reste as never)) as unknown as Response;
  }) as typeof fetch;
  const created = await mf.dispatchFetch('http://sf/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({ commandId: 'c-pa-1', id: 'sf-pa-1', resellerId: S.accountId, shortCode: 'PA-0001', name: 'Boutique porte', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-pa-1' }),
  });
  expect(created.status).toBe(200);
  // EN-LIGNE-1 — her app puts the shop online in the same act as creating it.
  await mf.dispatchFetch('http://sf/storefronts/sf-pa-1/publish', { method: 'POST', headers: S.bearer, body: JSON.stringify({ correlationId: 'corr-en-ligne' }) });
  const pub = await mf.dispatchFetch('http://sf/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: 'cmd-listing-pa-1', listingId: 'lst-pa-1', storefrontId: 'sf-pa-1', resellerId: S.accountId,
      productVersionId: PV, offerVersion: 'ov-pa-1', markup: 1_500, correlationId: 'corr-pa-1', at: new Date().toISOString(),
    }),
  });
  expect(await pub.text()).toContain('"published"');
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

/** The account book itself — the ledger, not the port's word. */
async function livre(session: string): Promise<{ orderId: string; porte?: string }[]> {
  const res = await mf.dispatchFetch('http://sf/buyer/orders', { method: 'POST', headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, body: '{}' });
  return ((await res.json()) as { commandes: { orderId: string; porte?: string }[] }).commandes;
}

async function attendre<T>(lire: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  const fin = Date.now() + 8_000;
  for (;;) {
    const v = await lire();
    if (ok(v) || Date.now() > fin) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
}

let telSeq = 0;

/** Phone A: signed in, she orders — exactly as `flow.ts` tells the account linker. */
async function commanderSurA(mode: 'A' | 'B'): Promise<{ orderId: string; buyerRef: string; titulaire?: string; phone: string; password: string; session: string }> {
  const port: Port = await import('../../../apps/buyer-pwa/src/cliente/quote-port.js');
  const modele: Modele = await import('../../../apps/buyer-pwa/src/cliente/quote-model.js');
  const { httpComptePort } = await import('../../../apps/buyer-pwa/src/compte/port.js');
  const { garderSession } = await import('../../../apps/buyer-pwa/src/compte/garde.js');
  const { creerRattacheur } = await import('../../../apps/buyer-pwa/src/compte/entree.js');
  const compte = httpComptePort('http://sf');
  const phone = `70 55 ${String(10 + (telSeq += 1)).padStart(2, '0')} 11`;
  const password = 'grain-de-nere-77';
  const inscrite = await compte.inscrire({ firstName: 'Awa', lastName: 'Ouédraogo', phone, password });
  if (inscrite.kind !== 'ok') throw new Error(`signup: ${JSON.stringify(inscrite)}`);
  const session = inscrite.value.session;
  const localA = memoire();
  const ongletA = memoire();
  garderSession(localA, { session, prenom: 'Awa' });

  const pret = await modele.fetchClienteQuote(
    port.httpQuotePort('http://sf'),
    { slug: 'pa-0001', pid: PV, zoneTo: 'Ouagadougou', attributionResellerId: S.accountId },
    (intent) => port.requestKeyFor(intent, ongletA),
    (quoteId) => port.commandIdFor(quoteId, ongletA),
    1_500,
    (quoteId, essai) => port.orderCommandIdFor(quoteId, essai, ongletA),
  );
  if (pret.status !== 'ready') throw new Error(`price: ${JSON.stringify(pret)}`);
  expect((await pret.reserve(mode)).status).toBe('reserved');
  const cree = await pret.commander(mode, 0, { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'près du marché' });
  if (cree.status !== 'order' || cree.order.buyerRef === undefined) throw new Error(`order: ${JSON.stringify(cree)}`);
  const { orderId, buyerRef } = cree.order;
  const titulaire = mode === 'B' ? pret.titulairePorte : undefined;
  const rattacher = creerRattacheur(compte, localA, ongletA);
  // At the create — what flow.ts sends: the door key rides only a door order.
  rattacher({ orderId, buyerRef, ...(titulaire !== undefined ? { porte: titulaire } : {}) });
  // The service says her first leg moved; the page tells the linker « payée ».
  const montant = Number((await port.httpQuotePort('http://sf').orderState(orderId) as { order?: { amountPaidAtCheckout?: number } }).order?.amountPaidAtCheckout);
  expect(await poster('/checkout/webhook/payment', webhook(orderId, await legKeyOf(orderId, 'checkout'), montant, false))).toBe(200);
  rattacher({ orderId, buyerRef, payee: true });
  await attendre(() => livre(session), (l) => l.some((c) => c.orderId === orderId));
  return { orderId, buyerRef, ...(titulaire !== undefined ? { titulaire } : {}), phone, password, session };
}

describe('PORTE-AUTRE-TELEPHONE-1 — her door from « Mes commandes » on another phone, on the real Worker', () => {
  it('phone A orders at the door signed in; phone B, empty, signs in and « Mes commandes » pays that door — the Worker accepts the holder, the code waits for the door webhook', async () => {
    const port: Port = await import('../../../apps/buyer-pwa/src/cliente/quote-port.js');
    const { httpComptePort } = await import('../../../apps/buyer-pwa/src/compte/port.js');
    const a = await commanderSurA('B');
    expect(a.titulaire, 'a door quote exposes its holder').toBeTypeOf('string');

    // THE ACCOUNT BOOK: her order, with its door key — the ledger, not the port.
    const ligne = (await livre(a.session)).find((c) => c.orderId === a.orderId);
    expect(ligne?.porte).toBe(a.titulaire);

    // PHONE B — nothing in its stores. She signs in; « Mes commandes » reads it.
    const telB = memoire();
    const ongletB = memoire();
    const compteB = httpComptePort('http://sf');
    const entree = await compteB.connecter(a.phone, a.password);
    if (entree.kind !== 'ok') throw new Error(`login: ${JSON.stringify(entree)}`);
    const lues = await compteB.commandes(entree.value.session);
    if (lues.kind !== 'ok') throw new Error(`orders: ${JSON.stringify(lues)}`);
    const sienne = lues.value.find((c) => c.orderId === a.orderId);
    expect(sienne?.porte, 'the key reached phone B through the app’s own reader').toBe(a.titulaire);

    // The door road phone B now has — and nothing of it came from phone B's stores.
    expect(port.porteGardee(a.orderId, port.httpQuotePort('http://sf'), telB, ongletB), 'phone B kept nothing itself').toBeUndefined();
    const payer = port.porteGardee(a.orderId, port.httpQuotePort('http://sf'), telB, ongletB, sienne?.porte);
    expect(payer, 'her account gives phone B the door').toBeTypeOf('function');
    const demande = await payer!(a.orderId, 0);
    expect(demande.status, JSON.stringify(demande)).toBe('order');
    expect(demande.status === 'order' && demande.order.doorLeg).toBe('due');

    // THE ORDER'S LEDGER: one door attempt, and a request is not a payment.
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const audit = (await (await ns.get(ns.idFromName(a.orderId)).fetch('https://do/entry/audit')).json()) as { doorAttempts: unknown[] };
    expect(audit.doorAttempts).toHaveLength(1);
    const arrivee = await mf.dispatchFetch('http://sf/fulfillment/transit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
      body: JSON.stringify({ orderId: a.orderId, stage: 'arrivee', asOf: new Date().toISOString() }),
    });
    expect(arrivee.status).toBe(200);
    expect((await port.httpQuotePort('http://sf').remise(a.orderId, a.buyerRef)).status, 'no code while the product is unpaid').toBe('refused');

    expect(await poster('/checkout/webhook/door', webhook(a.orderId, await legKeyOf(a.orderId, 'door'), 11_500, true))).toBe(200);
    const apres = await port.httpQuotePort('http://sf').orderState(a.orderId);
    expect(apres.status === 'order' && apres.order.doorLeg).toBe('paid');
    expect((await port.httpQuotePort('http://sf').remise(a.orderId, a.buyerRef)).status).toBe('code');
  }, 120_000);

  it('CONTROL — an order she prepaid carries no key: phone B shows its tracking and offers no door', async () => {
    const port: Port = await import('../../../apps/buyer-pwa/src/cliente/quote-port.js');
    const a = await commanderSurA('A');
    const ligne = (await livre(a.session)).find((c) => c.orderId === a.orderId);
    expect(ligne).toBeDefined();
    expect(ligne?.porte, 'no door, no key').toBeUndefined();
    expect(port.porteGardee(a.orderId, port.httpQuotePort('http://sf'), memoire(), memoire(), ligne?.porte)).toBeUndefined();
  }, 120_000);

  it('a key the book cannot hold is refused by name, and nothing is linked', async () => {
    const { httpComptePort } = await import('../../../apps/buyer-pwa/src/compte/port.js');
    const compte = httpComptePort('http://sf');
    const inscrite = await compte.inscrire({ firstName: 'Mariam', lastName: 'Kaboré', phone: '70 66 77 88', password: 'karite-du-soir-8' });
    if (inscrite.kind !== 'ok') throw new Error('signup');
    const res = await mf.dispatchFetch('http://sf/buyer/orders', {
      method: 'POST', headers: { Authorization: `Bearer ${inscrite.value.session}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ajouter: [{ orderId: 'ord-x-1', buyerRef: 'ref-x-1', porte: 'pas une clé !' }] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: 'bad_field', field: 'ajouter' });
    expect(await livre(inscrite.value.session)).toEqual([]);
  }, 60_000);
});
