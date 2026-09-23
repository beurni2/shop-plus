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
import {
  garderPanierPaye,
  oublierPanierPaye,
  panierPaye,
  titulairePanier,
  type ArticlePaye,
  type ColisPaye,
  type GroupeOutcome,
  type PanierPort,
  type PrixPanier,
} from './panier-port';

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
  /** COLIS-FOURNISSEUR-1 — how many deliveries the service counted, once it priced the panier. */
  livraisons(): number | undefined;
  /** COLIS-FOURNISSEUR-1 — which of her orders travel together, once the payment exists. */
  colis(): readonly ColisPaye[];
  /** The payment's id, once it exists — a package's door is paid through it. */
  groupId(): string | null;
}

const FULL: PaymentModeWire = 'FULL_PREPAY';
const DOOR: PaymentModeWire = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';

/**
 * The quotes a payment was SENT for, in this tab: once an order may be born on
 * a quote it belongs to that payment for ever (an order never joins another),
 * so a panier whose articles changed since takes fresh quotes instead.
 */
const LIE_PREFIX = 'sp-panier-lie:';

function lireLie(slug: string, storage: Storage | undefined): readonly string[] | undefined {
  try {
    const raw = storage?.getItem(LIE_PREFIX + slug);
    if (raw === null || raw === undefined || raw === '') return undefined;
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;
  } catch {
    return undefined;
  }
}

function ecrireLie(slug: string, ids: readonly string[] | undefined, storage: Storage | undefined): void {
  try {
    if (ids === undefined) storage?.removeItem(LIE_PREFIX + slug);
    else storage?.setItem(LIE_PREFIX + slug, JSON.stringify([...ids].sort()));
  } catch {
    /* best-effort — the service refuses an order in another payment by name */
  }
}

/**
 * COLIS-FOURNISSEUR-1 — THE PANIER EACH ARTICLE WAS LAST PRICED IN, and the
 * articles its quote travels with (the service's answer). An article keeps
 * that price — the same ask, so the same key, quote and hold — while nothing
 * was ADDED since (an added article may join its package) and every article
 * of its package is still there. Otherwise its delivery share may differ, and
 * it is priced afresh. This is what keeps « take the gone article off and pay
 * the rest » replaying HER OWN holds (verifier MAJOR 1) when the gone article
 * did not travel with them.
 */
const PRIX_PREFIX = 'sp-panier-prix:';

interface PrixDe {
  readonly panier: readonly string[];
  readonly colis: readonly string[] | null;
}

function lirePrixDe(cle: string, storage: Storage | undefined): PrixDe | undefined {
  try {
    const raw = storage?.getItem(PRIX_PREFIX + cle);
    if (raw === null || raw === undefined || raw === '') return undefined;
    const v = JSON.parse(raw) as { panier?: unknown; colis?: unknown };
    const ids = (x: unknown): x is string[] => Array.isArray(x) && x.every((y) => typeof y === 'string');
    if (!ids(v.panier) || (v.colis !== null && !ids(v.colis))) return undefined;
    return { panier: v.panier, colis: v.colis };
  } catch {
    return undefined;
  }
}

function ecrirePrixDe(cle: string, p: PrixDe | undefined, storage: Storage | undefined): void {
  try {
    if (p === undefined) storage?.removeItem(PRIX_PREFIX + cle);
    else storage?.setItem(PRIX_PREFIX + cle, JSON.stringify(p));
  } catch {
    /* best-effort — without it the article is simply priced afresh */
  }
}

const memeEnsemble = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

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
  // The panier's composition names its PAYMENT: the same articles, the same pay command.
  const portee = [...articles.map((a) => a.pid)].sort().join(',');
  // Its quotes and holds are kept per BOUTIQUE panier (verifier MAJOR 1): an
  // article taken off leaves the others on the quotes, and the holds, she
  // already has — asking afresh would meet her own hold on a one-unit stock.
  const perimetre = `boutique:${args.slug}`;
  let lignes: readonly LignePanier[] = [];
  let payes: readonly ArticlePaye[] = [];
  let titulaireCourant: string | null = null;
  let livraisons: number | undefined;
  let colis: readonly ColisPaye[] = [];
  let groupIdCourant: string | null = null;
  /** quoteId → the article's name, so a refusal and a paid order can name it. */
  const noms = new Map<string, string>();
  /** quoteId → the article's product, so the paid record can name it. */
  const produits = new Map<string, string>();
  /** Forgets the current articles' quote keys — set by each pricing, for the day they are paid. */
  let oublierCles = (): void => {};

  const zoneDe = (quartier: string): string => (quartier === '' ? args.ville : `${quartier}, ${args.ville}`);
  const clePrix = (a: ArticlePanier, quartier: string, paymentMode: PaymentModeWire): string =>
    [args.slug, a.pid, zoneDe(quartier), paymentMode].join('|');
  const intent = (a: ArticlePanier, quartier: string, paymentMode: PaymentModeWire): QuoteIntent => {
    // COLIS-FOURNISSEUR-1 — her panier, so the articles that leave together
    // are priced as ONE delivery; the panier it was last priced in when that
    // price still holds (see `PrixDe`).
    const courant = articles.map((x) => x.pid);
    const avant = lirePrixDe(clePrix(a, quartier, paymentMode), args.session);
    const garde =
      avant !== undefined &&
      courant.every((id) => avant.panier.includes(id)) &&
      (avant.colis === null || avant.colis.every((id) => courant.includes(id)));
    return {
      slug: args.slug,
      pid: a.pid,
      zoneTo: zoneDe(quartier),
      attributionResellerId: args.resellerId,
      paymentMode,
      ...(articles.length >= 2 ? { panier: garde ? avant.panier : courant } : {}),
    };
  };

  const nomDe = (quoteId: string | undefined): { article?: string } => {
    const nom = quoteId === undefined ? undefined : noms.get(quoteId);
    return nom === undefined ? {} : { article: nom };
  };

  /** The group's answer, read as the one order the flow watches — the group's id. */
  const commeCommande = (r: GroupeOutcome, titulaire: string): OrderFetch => {
    if (r.status === 'refused') return { status: 'refused', reason: r.reason, ...nomDe(r.quoteId) };
    if (r.status !== 'groupe') return r;
    const g = r.groupe;
    groupIdCourant = g.groupId;
    if (g.colis !== undefined) colis = g.colis;
    if (g.commandes !== undefined) {
      payes = g.commandes.map((c) => {
        const quoteId = [...noms.keys()].find((q) => c.orderId.endsWith(q));
        const pid = quoteId !== undefined ? produits.get(quoteId) : undefined;
        return {
          orderId: c.orderId,
          buyerRef: c.buyerRef,
          nom: quoteId !== undefined ? noms.get(quoteId) ?? '' : '',
          ...(pid !== undefined ? { pid } : {}),
        };
      });
    }
    // The phone keeps only a payment that did not fail (verifier minor 2): a
    // failed one is not hers to follow, and its record would say otherwise.
    if (g.state === 'payment_failed') {
      if (panierPaye(args.garde)?.groupId === g.groupId) oublierPanierPaye(args.garde);
    } else if (g.commandes !== undefined) {
      garderPanierPaye(
        { groupId: g.groupId, holderRef: titulaire, at: new Date().toISOString(), slug: args.slug, articles: payes, ...(colis.length > 0 ? { colis } : {}) },
        args.garde,
      );
    }
    // Paid AND confirmed: these articles leave her boutique's panier, and
    // their quotes with them — the next panier with one of them is a new sale.
    if (g.state === 'confirmed') {
      retirerDuPanier(args.slug, articles.map((a) => a.pid));
      oublierCles();
      ecrireLie(args.slug, undefined, args.session);
    }
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
    const oublier = (): void => {
      for (const a of articles) {
        for (const m of [FULL, DOOR]) {
          forgetRequestKey(intent(a, quartier, m), args.session, perimetre);
          ecrirePrixDe(clePrix(a, quartier, m), undefined, args.session);
        }
      }
    };
    if (renouveler === true) oublier();
    oublierCles = oublier;
    // Each ask decided ONCE per pricing, so the key and the record agree.
    const asks = articles.map((a) => ({ full: intent(a, quartier, FULL), door: intent(a, quartier, DOOR) }));
    const cles = asks.map((x) => ({
      full: requestKeyFor(x.full, args.session, perimetre),
      door: requestKeyFor(x.door, args.session, perimetre),
    }));
    const noter = (i: number, m: PaymentModeWire, r: QuoteOutcome): void => {
      const ask = m === FULL ? asks[i]!.full : asks[i]!.door;
      if (r.status === 'quote' && ask.panier !== undefined) {
        ecrirePrixDe(clePrix(articles[i]!, quartier, m), { panier: ask.panier, colis: r.quote.colis ?? null }, args.session);
      }
    };
    if (cles.some((c) => c.full === undefined || c.door === undefined)) return { status: 'refused', reason: 'no_secure_random' };

    // 1. EACH ARTICLE'S OWN PRICE — full asks decide; door asks only offer mode B.
    const fullAsks = articles.map((_, i) =>
      port.request(asks[i]!.full, cles[i]!.full!).then((r) => {
        noter(i, FULL, r);
        return r;
      }),
    );
    const doorAsks = articles.map((_, i) =>
      port.request(asks[i]!.door, cles[i]!.door!).then(
        (r) => {
          noter(i, DOOR, r);
          return r;
        },
        (): QuoteOutcome => ({ status: 'unreadable' }),
      ),
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
    // A quote a payment was sent for belongs to that payment: a CHANGED panier
    // that still carries one takes fresh quotes (once — the fresh ones are free).
    const lie = lireLie(args.slug, args.session);
    if (lie !== undefined && renouveler !== true) {
      const ici = [...quotes, ...(portes ?? []).flatMap((d) => (d.status === 'quote' ? [d.quote] : []))].map((q) => q.quoteId);
      const memePanier = memeEnsemble(lie, quotes.map((q) => q.quoteId)) || memeEnsemble(lie, ici.slice(quotes.length));
      if (!memePanier && ici.some((id) => lie.includes(id))) {
        ecrireLie(args.slug, undefined, args.session);
        return quoteSource(quartier, true);
      }
    }
    noms.clear();
    produits.clear();
    for (const [i, q] of quotes.entries()) {
      noms.set(q.quoteId, articles[i]!.nom);
      produits.set(q.quoteId, articles[i]!.pid);
    }
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
        produits.set(door.quote.quoteId, articles[i]!.pid);
      }
    }

    // 2. THE PANIER'S TOTALS, stated by the service.
    const fullIds = quotes.map((q) => q.quoteId);
    const plein = await port.prix(fullIds);
    if (plein.status === 'refused') return { status: 'refused', reason: plein.reason, ...nomDe(plein.quoteId) };
    if (plein.status !== 'prix') return plein;
    if (!prixPleinCoherent(plein.prix, articles.length)) return { status: 'refused', reason: 'amounts_disagree' };
    livraisons = plein.prix.livraisons;
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
    const titulaire = titulairePanier(perimetre, args.session);
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
        // Recorded BEFORE the payment leaves: from here an order may exist on these quotes.
        ecrireLie(args.slug, cibles.map((q) => q.quoteId), args.session);
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
    livraisons: () => livraisons,
    colis: () => colis,
    groupId: () => groupIdCourant,
  };
}
