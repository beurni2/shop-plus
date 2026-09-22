/**
 * ═══ PAYER-TOUT-1 — THE PANIER'S PRICE, SPOKEN IN THE ONE LANGUAGE THE FLOW
 *     ALREADY UNDERSTANDS (founder ruling 2026-09-22, option 1) ═══
 *
 * `createCliente` asks ONE question for a price — `quoteSource(quartier)` —
 * and gets ONE answer shape back (`QuoteFetch`): a quote to render, a hold to
 * take, an order to create and read. This file answers that same question for
 * a whole panier, so the address screen, the payment screen, the operator
 * wait and the retry all work for a panier exactly as they work for one
 * article, with no second copy of any of them.
 *
 * WHAT IT DOES, IN ORDER:
 *  1. Asks the service for EACH article's quote (full, and door within its
 *     grace), each cross-checked the way one article's is
 *     (`clienteQuoteFromServer`) — if one article cannot be priced, she is
 *     told which one, before anything is held.
 *  2. Asks the service for the panier's TOTALS (`POST /checkout/group/price`)
 *     — the phone adds no franc; it only checks the service's totals agree
 *     with each other, by equality, like the single road checks a quote.
 *  3. Holds every article under ONE holder (the group needs one), naming the
 *     article whose hold is refused.
 *  4. Pays the panier in ONE collection and reads it back as one « order » —
 *     the group's id — while keeping each article's own order and read token
 *     for the confirmation list and for « Mes articles » after a reload.
 *
 * WHAT IT NEVER DOES: invent a price, sum a franc, or pay an article alone.
 */

import type { ClienteQuote, ModePaiement } from './screens';
import { clienteQuoteFromServer, DOOR_GRACE_MS, type OrderFetch, type QuoteFetch, type ReserveFetch } from './quote-model';
import {
  commandIdFor,
  forgetRequestKey,
  orderCommandIdFor,
  requestKeyFor,
  type ContactLivraison,
  type PaymentModeWire,
  type QuoteIntent,
  type QuoteOutcome,
  type ServerQuote,
} from './quote-port';
import { retirerDuPanier } from '../vitrine/panier';
import { garderPanierPaye, titulairePanier, type ArticlePaye, type GroupeOutcome, type PanierPort, type PrixPanier } from './panier-port';

export interface ArticlePanier {
  readonly pid: string;
  readonly nom: string;
}

/** One line of the récap: the article's name and its own product price, as ITS quote says. */
export interface LignePanier {
  readonly nom: string;
  readonly produitFcfa: number;
}

export interface SourcePanier {
  readonly quoteSource: (quartier: string, renouveler?: boolean) => Promise<QuoteFetch>;
  /** The récap's lines, once the service has priced them. */
  lignes(): readonly LignePanier[];
  /** Each article's own order, once the payment is created. */
  payes(): readonly ArticlePaye[];
  /** The holder the panier was held and paid under — each article's door is paid under it. */
  titulaire(): string | null;
}

const FULL: PaymentModeWire = 'FULL_PREPAY';
const DOOR: PaymentModeWire = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';

/** Race every door ask against ONE grace period, counted from the moment the full prices are known. */
async function portesDansLeDelai(asks: readonly Promise<QuoteOutcome>[], graceMs: number): Promise<readonly QuoteOutcome[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), graceMs);
  });
  try {
    return await Promise.race([Promise.all(asks), delai]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** The service's totals must agree with each other — equalities between its own figures. */
function prixPleinCoherent(p: PrixPanier, n: number): boolean {
  return (
    p.paymentMode === FULL &&
    p.articles === n &&
    p.amountDueAtDelivery === 0 &&
    p.productTotal + p.deliveryTotal === p.amountPaidAtCheckout
  );
}

function prixPorteCoherent(porte: PrixPanier, plein: PrixPanier, n: number): boolean {
  return (
    porte.paymentMode === DOOR &&
    porte.articles === n &&
    porte.amountPaidAtCheckout === plein.deliveryTotal &&
    porte.amountDueAtDelivery === plein.productTotal
  );
}

export function creerSourcePanier(args: {
  readonly port: PanierPort;
  readonly slug: string;
  readonly ville: string;
  readonly resellerId: string;
  readonly articles: readonly ArticlePanier[];
  /** The tab's storage: request keys, command ids, the holder (reload-stable, closed with the tab). */
  readonly session: Storage | undefined;
  /** The phone's storage: the paid panier, for « Mes articles » after the tab dies. */
  readonly garde: Storage | undefined;
  readonly doorGraceMs?: number;
}): SourcePanier {
  const { port, articles } = args;
  // The panier's composition is its scope: the same articles, the same keys.
  const portee = [...articles.map((a) => a.pid)].sort().join(',');
  let lignes: readonly LignePanier[] = [];
  let payes: readonly ArticlePaye[] = [];
  let titulaireCourant: string | null = null;
  /** quoteId → the article's name, so a refusal and a paid order can name it. */
  const noms = new Map<string, string>();

  const intent = (a: ArticlePanier, quartier: string, paymentMode: PaymentModeWire): QuoteIntent => ({
    slug: args.slug,
    pid: a.pid,
    zoneTo: quartier === '' ? args.ville : `${quartier}, ${args.ville}`,
    attributionResellerId: args.resellerId,
    paymentMode,
  });

  const nomDe = (quoteId: string | undefined): { article?: string } => {
    const nom = quoteId === undefined ? undefined : noms.get(quoteId);
    return nom === undefined ? {} : { article: nom };
  };

  /** The group's answer, read as the one order the flow watches — the group's id. */
  const commeCommande = (r: GroupeOutcome, titulaire: string): OrderFetch => {
    if (r.status === 'refused') return { status: 'refused', reason: r.reason, ...nomDe(r.quoteId) };
    if (r.status !== 'groupe') return r;
    const g = r.groupe;
    if (g.commandes !== undefined) {
      payes = g.commandes.map((c) => {
        const quoteId = [...noms.keys()].find((q) => c.orderId.endsWith(q));
        return { orderId: c.orderId, buyerRef: c.buyerRef, nom: quoteId !== undefined ? noms.get(quoteId) ?? '' : '' };
      });
      garderPanierPaye({ groupId: g.groupId, holderRef: titulaire, at: new Date().toISOString(), articles: payes }, args.garde);
    }
    // Paid AND confirmed: these articles leave her boutique's panier.
    if (g.state === 'confirmed') retirerDuPanier(args.slug, articles.map((a) => a.pid));
    return {
      status: 'order',
      order: {
        orderId: g.groupId,
        state: g.state,
        amountPaidAtCheckout: g.amountPaidAtCheckout,
        amountDueAtDelivery: g.amountDueAtDelivery,
        ...(g.noteVocale !== undefined ? { noteVocale: g.noteVocale } : {}),
      },
    };
  };

  const quoteSource = async (quartier: string, renouveler?: boolean): Promise<QuoteFetch> => {
    if (renouveler === true) {
      for (const a of articles) for (const m of [FULL, DOOR]) forgetRequestKey(intent(a, quartier, m), args.session, portee);
    }
    const cles = articles.map((a) => ({
      full: requestKeyFor(intent(a, quartier, FULL), args.session, portee),
      door: requestKeyFor(intent(a, quartier, DOOR), args.session, portee),
    }));
    if (cles.some((c) => c.full === undefined || c.door === undefined)) return { status: 'refused', reason: 'no_secure_random' };

    // 1. EACH ARTICLE'S OWN PRICE — full asks decide; door asks only offer mode B.
    const fullAsks = articles.map((a, i) => port.request(intent(a, quartier, FULL), cles[i]!.full!));
    const doorAsks = articles.map((a, i) =>
      port.request(intent(a, quartier, DOOR), cles[i]!.door!).catch((): QuoteOutcome => ({ status: 'unreadable' })),
    );
    const fulls = await Promise.all(fullAsks);
    const quotes: ServerQuote[] = [];
    for (const [i, f] of fulls.entries()) {
      if (f.status === 'refused') return { status: 'refused', reason: f.reason, article: articles[i]!.nom };
      if (f.status === 'unreadable') return { status: 'unreadable' };
      if (f.status !== 'quote') return { status: 'unreachable' };
      quotes.push(f.quote);
    }
    const portes = await portesDansLeDelai(doorAsks, args.doorGraceMs ?? DOOR_GRACE_MS);
    noms.clear();
    for (const [i, q] of quotes.entries()) noms.set(q.quoteId, articles[i]!.nom);
    const doorQuotes: ServerQuote[] = [];
    let bIndisponible = portes === null;
    for (const [i, full] of quotes.entries()) {
      const door: QuoteOutcome = portes?.[i] ?? { status: 'unreachable' };
      const model = clienteQuoteFromServer(full, door);
      if (!model.ok) return { status: 'refused', reason: model.reason, article: articles[i]!.nom };
      if (model.bIndisponible || door.status !== 'quote') {
        bIndisponible = true;
      } else {
        doorQuotes.push(door.quote);
        noms.set(door.quote.quoteId, articles[i]!.nom);
      }
    }

    // 2. THE PANIER'S TOTALS, stated by the service.
    const fullIds = quotes.map((q) => q.quoteId);
    const plein = await port.prix(fullIds);
    if (plein.status === 'refused') return { status: 'refused', reason: plein.reason, ...nomDe(plein.quoteId) };
    if (plein.status !== 'prix') return plein;
    if (!prixPleinCoherent(plein.prix, articles.length)) return { status: 'refused', reason: 'amounts_disagree' };
    let porte: PrixPanier | undefined;
    if (!bIndisponible) {
      const p = await port.prix(doorQuotes.map((q) => q.quoteId));
      if (p.status === 'prix' && prixPorteCoherent(p.prix, plein.prix, articles.length)) porte = p.prix;
      else bIndisponible = true;
    }
    const splits = {
      A: { paidNow: plein.prix.amountPaidAtCheckout, dueAtDelivery: 0 },
      ...(porte !== undefined ? { B: { paidNow: porte.amountPaidAtCheckout, dueAtDelivery: porte.amountDueAtDelivery } } : {}),
    };
    const quote: ClienteQuote = {
      produitFcfa: plein.prix.productTotal,
      feeToday: plein.prix.deliveryTotal,
      feeTomorrow: plein.prix.deliveryTotal,
      totalToday: plein.prix.amountPaidAtCheckout,
      totalTomorrow: plein.prix.amountPaidAtCheckout,
      splitsToday: splits,
      splitsTomorrow: splits,
    };
    lignes = quotes.map((q, i) => ({ nom: articles[i]!.nom, produitFcfa: q.productSubtotal }));

    // 3. ONE HOLDER FOR THE WHOLE PANIER, and each quote's own hold command.
    const titulaire = titulairePanier(portee, args.session);
    if (titulaire === undefined) return { status: 'refused', reason: 'no_secure_random' };
    titulaireCourant = titulaire;
    const commandes = new Map<string, string>();
    for (const q of [...quotes, ...doorQuotes]) {
      const cmd = commandIdFor(q.quoteId, args.session);
      if (cmd === undefined) return { status: 'refused', reason: 'no_secure_random' };
      commandes.set(q.quoteId, cmd);
    }
    // The panier's price lives as long as its SHORTEST-lived quote.
    const expiry = quotes.map((q) => q.expiry).reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
    const pour = (mode: ModePaiement): readonly ServerQuote[] | undefined =>
      mode === 'A' ? quotes : porte !== undefined ? doorQuotes : undefined;

    return {
      status: 'ready',
      quote,
      bIndisponible,
      ids: {
        fullQuoteId: quotes[0]!.quoteId,
        commandId: commandes.get(quotes[0]!.quoteId)!,
      },
      expiry,
      reserve: async (mode: ModePaiement): Promise<ReserveFetch> => {
        const cibles = pour(mode);
        if (cibles === undefined) return { status: 'refused', reason: 'mode_indisponible' };
        for (const q of cibles) {
          const r = await port.reserve(q.quoteId, commandes.get(q.quoteId)!, titulaire);
          if (r.status === 'refused') return { status: 'refused', reason: r.reason, ...nomDe(q.quoteId) };
          if (r.status !== 'reserved') return r;
        }
        return { status: 'reserved' };
      },
      commander: async (mode: ModePaiement, essai: number, contact?: ContactLivraison): Promise<OrderFetch> => {
        const cibles = pour(mode);
        if (cibles === undefined) return { status: 'refused', reason: 'mode_indisponible' };
        // One command per (panier, mode, attempt): a double tap replays, a retry is new.
        const cmd = orderCommandIdFor(`panier#${portee}#${mode}`, essai, args.session);
        if (cmd === undefined) return { status: 'refused', reason: 'no_secure_random' };
        return commeCommande(await port.payer(cibles.map((q) => q.quoteId), cmd, titulaire, contact), titulaire);
      },
      etatCommande: async (groupId: string): Promise<OrderFetch> => commeCommande(await port.etat(groupId), titulaire),
      // A panier's doors are each article's own, paid from its own tracking.
      payerALaPorte: async (): Promise<OrderFetch> => ({ status: 'refused', reason: 'mode_indisponible' }),
      remise: async () => ({ status: 'refused' }),
    };
  };

  return {
    quoteSource,
    lignes: () => lignes,
    payes: () => payes,
    titulaire: () => titulaireCourant,
  };
}
