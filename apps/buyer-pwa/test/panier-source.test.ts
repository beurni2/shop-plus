import { beforeEach, describe, expect, it } from 'vitest';
import { creerSourcePanier } from '../src/cliente/panier-source';
import {
  demoPanierPort,
  garderPanierPaye,
  httpPanierPort,
  panierPaye,
  retirerArticlePaye,
  type GroupeOutcome,
  type PanierPort,
  type PrixOutcome,
} from '../src/cliente/panier-port';
import { requestKeyFor, type QuoteIntent, type QuoteOutcome, type ReserveOutcome } from '../src/cliente/quote-port';

/**
 * PAYER-TOUT-1 (founder ruling 2026-09-22) — the panier's price source and
 * port, driven with a SCRIPTED service: every article priced by its own quote,
 * the totals the SERVICE's, one holder for every hold, one collection, and
 * each article's own order kept for its tracking.
 */

function memoire(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

const EXPIRY_LOIN = new Date(Date.now() + 15 * 60_000).toISOString();
const EXPIRY_PROCHE = new Date(Date.now() + 5 * 60_000).toISOString();

/** Article p1: 12 500 = 11 500 + 1 000 · article p2: 26 500 = 25 000 + 1 500. */
const FIG: Record<string, { produit: number; frais: number }> = {
  p1: { produit: 11_500, frais: 1_000 },
  p2: { produit: 25_000, frais: 1_500 },
};

interface Journal {
  requests: { intent: QuoteIntent; key: string }[];
  reserves: { quoteId: string; commandId: string; holderRef: string }[];
  prix: string[][];
  payes: { quoteIds: readonly string[]; commandId: string; holderRef: string }[];
}

function service(over: {
  refuseFull?: string;
  refuseDoor?: boolean;
  prix?: (ids: readonly string[]) => PrixOutcome;
  reserve?: (quoteId: string) => ReserveOutcome;
  payer?: GroupeOutcome;
} = {}): { port: PanierPort; j: Journal } {
  const j: Journal = { requests: [], reserves: [], prix: [], payes: [] };
  const port: PanierPort = {
    async request(intent, key): Promise<QuoteOutcome> {
      j.requests.push({ intent, key });
      const door = intent.paymentMode !== 'FULL_PREPAY';
      if (!door && over.refuseFull === intent.pid) return { status: 'refused', reason: 'out_of_stock' };
      if (door && over.refuseDoor === true) return { status: 'refused', reason: 'pay_at_door_not_eligible' };
      const f = FIG[intent.pid]!;
      return {
        status: 'quote',
        quote: {
          quoteId: `q-${intent.pid}-${door ? 'B' : 'A'}`,
          paymentMode: intent.paymentMode,
          productSubtotal: f.produit,
          deliveryFee: f.frais,
          buyerTotal: f.produit + f.frais,
          amountPaidAtCheckout: door ? f.frais : f.produit + f.frais,
          amountDueAtDelivery: door ? f.produit : 0,
          expiry: intent.pid === 'p2' ? EXPIRY_PROCHE : EXPIRY_LOIN,
        },
      };
    },
    async reserve(quoteId, commandId, holderRef) {
      j.reserves.push({ quoteId, commandId, holderRef });
      return over.reserve?.(quoteId) ?? { status: 'reserved' };
    },
    async prix(ids) {
      j.prix.push([...ids]);
      if (over.prix !== undefined) return over.prix(ids);
      const door = ids[0]!.endsWith('-B');
      return {
        status: 'prix',
        prix: door
          ? { paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', articles: 2, amountPaidAtCheckout: 2_500, amountDueAtDelivery: 36_500, deliveryTotal: 2_500, productTotal: 36_500 }
          : { paymentMode: 'FULL_PREPAY', articles: 2, amountPaidAtCheckout: 39_000, amountDueAtDelivery: 0, deliveryTotal: 2_500, productTotal: 36_500 },
      };
    },
    async payer(quoteIds, commandId, holderRef) {
      j.payes.push({ quoteIds, commandId, holderRef });
      return (
        over.payer ?? {
          status: 'groupe',
          groupe: {
            groupId: 'grp-abc',
            state: 'payment_pending',
            amountPaidAtCheckout: 39_000,
            amountDueAtDelivery: 0,
            articles: [],
            commandes: [
              { orderId: 'ord-q-p1-A', buyerRef: 'ref-1' },
              { orderId: 'ord-q-p2-A', buyerRef: 'ref-2' },
            ],
          },
        }
      );
    },
    async etat() {
      return { status: 'refused', reason: 'unknown_order' };
    },
  };
  return { port, j };
}

const ARTICLES = [
  { pid: 'p1', nom: 'Robe bogolan' },
  { pid: 'p2', nom: 'Sac en cuir' },
];

function source(port: PanierPort, session = memoire(), garde = memoire()) {
  return {
    s: creerSourcePanier({ port, slug: 'aicha-4821', ville: 'Ouagadougou', resellerId: 'rs-1', articles: ARTICLES, session, garde, doorGraceMs: 50 }),
    session,
    garde,
  };
}

describe('PAYER-TOUT-1 — the panier\'s price, spoken as one quote', () => {
  let svc: ReturnType<typeof service>;
  beforeEach(() => {
    svc = service();
  });

  it('prices EACH article, then renders the SERVICE\'s totals — never a sum of its own', async () => {
    const { s } = source(svc.port);
    const r = await s.quoteSource('Gounghin');
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    // Every article asked for both modes, each with its own key, for her destination.
    expect(svc.j.requests.map((x) => `${x.intent.pid}:${x.intent.paymentMode}`).sort()).toEqual([
      'p1:DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', 'p1:FULL_PREPAY', 'p2:DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', 'p2:FULL_PREPAY',
    ]);
    for (const x of svc.j.requests) expect(x.intent.zoneTo).toBe('Gounghin, Ouagadougou');
    expect(svc.j.prix).toEqual([['q-p1-A', 'q-p2-A'], ['q-p1-B', 'q-p2-B']]);
    expect(r.quote.totalToday).toBe(39_000);
    expect(r.quote.produitFcfa).toBe(36_500);
    expect(r.quote.feeToday).toBe(2_500);
    expect(r.quote.splitsToday.A).toEqual({ paidNow: 39_000, dueAtDelivery: 0 });
    expect(r.quote.splitsToday.B).toEqual({ paidNow: 2_500, dueAtDelivery: 36_500 });
    expect(r.bIndisponible).toBe(false);
    // The récap lines are each article's own quote, and the panier lives as long as its shortest quote.
    expect(s.lignes()).toEqual([{ nom: 'Robe bogolan', produitFcfa: 11_500 }, { nom: 'Sac en cuir', produitFcfa: 25_000 }]);
    expect(r.expiry).toBe(EXPIRY_PROCHE);
  });

  it('the screen shows the SERVICE\'s total even where it differs from the phone\'s arithmetic (the service decides, the phone checks equalities)', async () => {
    const svc2 = service({
      prix: () => ({ status: 'prix', prix: { paymentMode: 'FULL_PREPAY', articles: 2, amountPaidAtCheckout: 40_000, amountDueAtDelivery: 0, deliveryTotal: 3_500, productTotal: 36_500 } }),
      refuseDoor: true,
    });
    const { s } = source(svc2.port);
    const r = await s.quoteSource('Gounghin');
    expect(r.status === 'ready' && r.quote.totalToday).toBe(40_000);
  });

  it('totals that do not reconcile are refused — no figure reaches the screen', async () => {
    const svc2 = service({
      prix: () => ({ status: 'prix', prix: { paymentMode: 'FULL_PREPAY', articles: 2, amountPaidAtCheckout: 39_001, amountDueAtDelivery: 0, deliveryTotal: 2_500, productTotal: 36_500 } }),
    });
    const r = await source(svc2.port).s.quoteSource('Gounghin');
    expect(r).toEqual({ status: 'refused', reason: 'amounts_disagree' });
  });

  it('one article that cannot be priced is NAMED, before anything is held', async () => {
    const svc2 = service({ refuseFull: 'p2' });
    const r = await source(svc2.port).s.quoteSource('Gounghin');
    expect(r).toEqual({ status: 'refused', reason: 'out_of_stock', article: 'Sac en cuir' });
    expect(svc2.j.reserves).toHaveLength(0);
    expect(svc2.j.prix).toHaveLength(0);
  });

  it('a door refused on any article ⇒ no door mode for the panier (and no door total asked)', async () => {
    const svc2 = service({ refuseDoor: true });
    const r = await source(svc2.port).s.quoteSource('Gounghin');
    expect(r.status === 'ready' && r.bIndisponible).toBe(true);
    if (r.status === 'ready') expect(r.quote.splitsToday.B).toBeUndefined();
    expect(svc2.j.prix).toEqual([['q-p1-A', 'q-p2-A']]);
  });

  it('holds EVERY article under ONE holder, each with its own command; a refusal names the article and stops', async () => {
    const svc2 = service({ reserve: (q) => (q === 'q-p2-A' ? { status: 'refused', reason: 'already_reserved' } : { status: 'reserved' }) });
    const r = await source(svc2.port).s.quoteSource('Gounghin');
    if (r.status !== 'ready') throw new Error('not ready');
    const held = await r.reserve('A');
    expect(held).toEqual({ status: 'refused', reason: 'already_reserved', article: 'Sac en cuir' });
    expect(svc2.j.reserves.map((x) => x.quoteId)).toEqual(['q-p1-A', 'q-p2-A']);
    expect(new Set(svc2.j.reserves.map((x) => x.holderRef)).size).toBe(1);
    expect(new Set(svc2.j.reserves.map((x) => x.commandId)).size).toBe(2);
  });

  it('mode B holds and pays the DOOR quotes', async () => {
    const r = await source(svc.port).s.quoteSource('Gounghin');
    if (r.status !== 'ready') throw new Error('not ready');
    await r.reserve('B');
    expect(svc.j.reserves.map((x) => x.quoteId)).toEqual(['q-p1-B', 'q-p2-B']);
    await r.commander('B', 0);
    expect(svc.j.payes[0]!.quoteIds).toEqual(['q-p1-B', 'q-p2-B']);
  });

  it('pays ONCE for the panier, under the SAME holder; a replayed attempt reuses its command, a retry mints a new one', async () => {
    const { s, garde } = source(svc.port);
    const r = await s.quoteSource('Gounghin');
    if (r.status !== 'ready') throw new Error('not ready');
    await r.reserve('A');
    const o = await r.commander('A', 0, { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'près du marché' });
    expect(o.status === 'order' && o.order.orderId).toBe('grp-abc');
    await r.commander('A', 0);
    await r.commander('A', 1);
    expect(svc.j.payes[0]!.holderRef).toBe(svc.j.reserves[0]!.holderRef);
    expect(svc.j.payes[0]!.commandId).toBe(svc.j.payes[1]!.commandId);
    expect(svc.j.payes[2]!.commandId).not.toBe(svc.j.payes[0]!.commandId);
    // Each article's own order, named, kept on the phone with the holder — for its tracking and its door.
    expect(s.payes()).toEqual([
      { orderId: 'ord-q-p1-A', buyerRef: 'ref-1', nom: 'Robe bogolan' },
      { orderId: 'ord-q-p2-A', buyerRef: 'ref-2', nom: 'Sac en cuir' },
    ]);
    const kept = panierPaye(garde);
    expect(kept?.groupId).toBe('grp-abc');
    expect(kept?.holderRef).toBe(svc.j.reserves[0]!.holderRef);
    expect(kept?.articles.map((a) => a.nom)).toEqual(['Robe bogolan', 'Sac en cuir']);
  });

  it('the panier\'s quotes live in their OWN key slots — never the key the same article gets bought alone', async () => {
    const session = memoire();
    await source(svc.port, session).s.quoteSource('Gounghin');
    const panierKey = svc.j.requests.find((x) => x.intent.pid === 'p1' && x.intent.paymentMode === 'FULL_PREPAY')!.key;
    const seule = requestKeyFor(
      { slug: 'aicha-4821', pid: 'p1', zoneTo: 'Gounghin, Ouagadougou', attributionResellerId: 'rs-1', paymentMode: 'FULL_PREPAY' },
      session,
    );
    expect(seule).not.toBe(panierKey);
    // …and the same panier asked again replays its own keys.
    const avant = svc.j.requests.map((x) => x.key);
    svc.j.requests.length = 0;
    await source(svc.port, session).s.quoteSource('Gounghin');
    expect(svc.j.requests.map((x) => x.key).sort()).toEqual([...avant].sort());
  });

  it('the paid articles leave her boutique\'s panier ONLY once the operator confirmed — a pending payment keeps it', async () => {
    const { panierOf, resetPanierCache, togglePanier } = await import('../src/vitrine/panier');
    resetPanierCache();
    togglePanier('aicha-4821', 'p1');
    togglePanier('aicha-4821', 'p2');
    togglePanier('aicha-4821', 'p5');
    let etat = 'payment_pending';
    const svc2 = service();
    svc2.port.etat = async () => ({
      status: 'groupe',
      groupe: { groupId: 'grp-abc', state: etat, amountPaidAtCheckout: 39_000, amountDueAtDelivery: 0, articles: [] },
    });
    const r = await source(svc2.port).s.quoteSource('Gounghin');
    if (r.status !== 'ready') throw new Error('not ready');
    await r.commander('A', 0);
    await r.etatCommande('grp-abc');
    expect(panierOf('aicha-4821')).toEqual(['p1', 'p2', 'p5']);
    etat = 'confirmed';
    await r.etatCommande('grp-abc');
    expect(panierOf('aicha-4821')).toEqual(['p5']);
  });

  it('a group refusal naming a quote names its article', async () => {
    const svc2 = service({ payer: { status: 'refused', reason: 'reservation_expired', quoteId: 'q-p1-A' } });
    const r = await source(svc2.port).s.quoteSource('Gounghin');
    if (r.status !== 'ready') throw new Error('not ready');
    expect(await r.commander('A', 0)).toEqual({ status: 'refused', reason: 'reservation_expired', article: 'Robe bogolan' });
  });
});

describe('PAYER-TOUT-1 — the port: what crosses the wire, and what the phone keeps', () => {
  it('the HTTP port sends quote ids and a holder — never an amount — and reads the refusal\'s article', async () => {
    const vus: { url: string; body: string }[] = [];
    const avant = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      vus.push({ url, body: String(init?.body ?? '') });
      if (url.endsWith('/checkout/group/price')) {
        return new Response(JSON.stringify({ error: 'out_of_stock', quoteId: 'q-2' }), { status: 422 });
      }
      return new Response(
        JSON.stringify({
          groupId: 'grp-x', state: 'payment_pending', paymentMode: 'FULL_PREPAY', amountPaidAtCheckout: 3, amountDueAtDelivery: 0, deliveryTotal: 1,
          articles: [{ orderId: 'ord-1', state: 'payment_pending', amountPaidAtCheckout: 1, amountDueAtDelivery: 0, sellerNet: 99 }],
          commandes: [{ orderId: 'ord-1', buyerRef: 'r1' }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const port = httpPanierPort('https://svc.example/');
      expect(await port.prix(['q-1', 'q-2'])).toEqual({ status: 'refused', reason: 'out_of_stock', quoteId: 'q-2' });
      const paid = await port.payer(['q-1', 'q-2'], 'cmd-1', 'holder-1', { phone: '70', quartier: 'G', repere: 'r' });
      expect(paid.status).toBe('groupe');
      if (paid.status === 'groupe') {
        // Field by field: a key the server grows never reaches the phone's memory.
        expect(JSON.stringify(paid.groupe)).not.toContain('sellerNet');
        expect(paid.groupe.commandes).toEqual([{ orderId: 'ord-1', buyerRef: 'r1' }]);
      }
      expect(JSON.parse(vus[0]!.body)).toEqual({ quoteIds: ['q-1', 'q-2'] });
      expect(Object.keys(JSON.parse(vus[1]!.body)).sort()).toEqual(['commandId', 'contact', 'holderRef', 'quoteIds']);
      expect(vus[1]!.url).toBe('https://svc.example/checkout/group');
    } finally {
      globalThis.fetch = avant;
    }
  });

  it('the demo port states the composed totals, and confirms after its reads — the certified shape', async () => {
    const port = demoPanierPort(new Map([['p1', 11_500], ['p2', 20_000]]), 1);
    const a = await port.request({ slug: 's', pid: 'p1', zoneTo: 'z', attributionResellerId: 'r', paymentMode: 'FULL_PREPAY' }, 'k1');
    const b = await port.request({ slug: 's', pid: 'p2', zoneTo: 'z', attributionResellerId: 'r', paymentMode: 'FULL_PREPAY' }, 'k2');
    if (a.status !== 'quote' || b.status !== 'quote') throw new Error('no quote');
    const prix = await port.prix([a.quote.quoteId, b.quote.quoteId]);
    expect(prix.status === 'prix' && prix.prix.amountPaidAtCheckout).toBe(a.quote.buyerTotal + b.quote.buyerTotal);
    const paid = await port.payer([a.quote.quoteId, b.quote.quoteId], 'c', 'h');
    if (paid.status !== 'groupe') throw new Error('not paid');
    expect(paid.groupe.state).toBe('payment_pending');
    expect((await port.etat(paid.groupe.groupId)).status === 'groupe').toBe(true);
    const deux = await port.etat(paid.groupe.groupId);
    expect(deux.status === 'groupe' && deux.groupe.state).toBe('confirmed');
  });

  it('« C\'est terminé » on one article forgets its line; the last one takes the record with it', () => {
    const garde = memoire();
    garderPanierPaye(
      { groupId: 'grp-1', holderRef: 'h', at: 'T', articles: [{ orderId: 'o1', buyerRef: 'r1', nom: 'A' }, { orderId: 'o2', buyerRef: 'r2', nom: 'B' }] },
      garde,
    );
    retirerArticlePaye('o1', garde);
    expect(panierPaye(garde)?.articles.map((a) => a.orderId)).toEqual(['o2']);
    retirerArticlePaye('o2', garde);
    expect(panierPaye(garde)).toBeUndefined();
  });
});
