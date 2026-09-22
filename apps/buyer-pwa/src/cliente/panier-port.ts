/**
 * ═══ PAYER-TOUT-1 — THE PANIER'S PORT (founder ruling 2026-09-22, option 1) ═══
 *
 * The buyer pays her boutique panier in ONE mobile-money confirmation; the
 * service keeps ONE ORDER PER ARTICLE. This port is the phone's side of the
 * three group doors the service opened for it:
 *
 *   POST /checkout/group/price  — the panier's totals, stated by the SERVER
 *   POST /checkout/group        — pay the panier: one collection
 *   GET  /checkout/group/{id}   — the payment and each order, as they stand
 *
 * plus the per-article quote and hold, which are the single road's own calls
 * (`httpQuotePort`) — the panier asks the same service for the same prices.
 *
 * THE MONEY LAW OF THIS FILE: no amount goes out, and every amount that comes
 * back is read field by field and shape-checked, exactly as `quote-port.ts`
 * reads a quote. Nothing here adds francs: the totals are the server's.
 */

import {
  httpQuotePort,
  looksLikeServerOrder,
  mintUuid,
  type ContactLivraison,
  type QuoteIntent,
  type QuoteOutcome,
  type QuotePort,
  type ReserveOutcome,
  type ServerOrder,
} from './quote-port';
import { composeQuote } from './seed';

/** The panier's totals for ONE mode, as the service summed them. */
export interface PrixPanier {
  readonly paymentMode: string;
  readonly articles: number;
  /** The one collection she pays now. */
  readonly amountPaidAtCheckout: number;
  /** What stays due at the doors, all articles together (0 when prepaid in full). */
  readonly amountDueAtDelivery: number;
  /** Σ delivery fees — « N livraisons ». */
  readonly deliveryTotal: number;
  /** Σ (B + M) — the articles themselves. */
  readonly productTotal: number;
}

export type PrixOutcome =
  | { readonly status: 'prix'; readonly prix: PrixPanier }
  | { readonly status: 'refused'; readonly reason: string; readonly quoteId?: string }
  | { readonly status: 'unreachable' }
  | { readonly status: 'unreadable' };

/** The grouped payment as the service answers it: the one payment, and each article's own order. */
export interface PaiementGroupe {
  readonly groupId: string;
  readonly state: string;
  readonly amountPaidAtCheckout: number;
  readonly amountDueAtDelivery: number;
  readonly articles: readonly ServerOrder[];
  /** Create-only: her read token per order (the single road's `buyerRef`, one per article). */
  readonly commandes?: readonly { readonly orderId: string; readonly buyerRef: string }[];
  readonly noteVocale?: 'gardee' | 'perdue';
}

export type GroupeOutcome =
  | { readonly status: 'groupe'; readonly groupe: PaiementGroupe }
  | { readonly status: 'refused'; readonly reason: string; readonly quoteId?: string }
  | { readonly status: 'unreachable' }
  | { readonly status: 'unreadable' };

export interface PanierPort {
  request(intent: QuoteIntent, requestKey: string): Promise<QuoteOutcome>;
  reserve(quoteId: string, commandId: string, holderRef: string): Promise<ReserveOutcome>;
  prix(quoteIds: readonly string[]): Promise<PrixOutcome>;
  payer(quoteIds: readonly string[], commandId: string, holderRef: string, contact?: ContactLivraison): Promise<GroupeOutcome>;
  etat(groupId: string): Promise<GroupeOutcome>;
}

/* ─────────────────────────────── the shape check ─────────────────────────── */

const franc = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const nonVide = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function lirePrix(body: unknown): PrixPanier | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (
    !nonVide(b['paymentMode']) ||
    !franc(b['articles']) ||
    !franc(b['amountPaidAtCheckout']) ||
    !franc(b['amountDueAtDelivery']) ||
    !franc(b['deliveryTotal']) ||
    !franc(b['productTotal'])
  ) {
    return undefined;
  }
  return {
    paymentMode: b['paymentMode'],
    articles: b['articles'],
    amountPaidAtCheckout: b['amountPaidAtCheckout'],
    amountDueAtDelivery: b['amountDueAtDelivery'],
    deliveryTotal: b['deliveryTotal'],
    productTotal: b['productTotal'],
  };
}

function lireGroupe(body: unknown): PaiementGroupe | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (
    !nonVide(b['groupId']) ||
    !nonVide(b['state']) ||
    !franc(b['amountPaidAtCheckout']) ||
    !franc(b['amountDueAtDelivery']) ||
    !Array.isArray(b['articles'])
  ) {
    return undefined;
  }
  const articles: ServerOrder[] = [];
  for (const a of b['articles'] as unknown[]) {
    if (!looksLikeServerOrder(a)) return undefined;
    // Field by field — the single road's allowlist law.
    articles.push({
      orderId: a.orderId,
      state: a.state,
      amountPaidAtCheckout: a.amountPaidAtCheckout,
      amountDueAtDelivery: a.amountDueAtDelivery,
      doorLeg: a.doorLeg,
    });
  }
  let commandes: { orderId: string; buyerRef: string }[] | undefined;
  if (Array.isArray(b['commandes'])) {
    commandes = [];
    for (const c of b['commandes'] as unknown[]) {
      const o = c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : {};
      if (!nonVide(o['orderId']) || !nonVide(o['buyerRef'])) return undefined;
      commandes.push({ orderId: o['orderId'], buyerRef: o['buyerRef'] });
    }
  }
  return {
    groupId: b['groupId'],
    state: b['state'],
    amountPaidAtCheckout: b['amountPaidAtCheckout'],
    amountDueAtDelivery: b['amountDueAtDelivery'],
    articles,
    ...(commandes !== undefined ? { commandes } : {}),
    ...(b['noteVocale'] === 'gardee' || b['noteVocale'] === 'perdue' ? { noteVocale: b['noteVocale'] } : {}),
  };
}

function refus(body: unknown): { reason: string; quoteId?: string } | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const reason = nonVide(b['error']) ? b['error'] : nonVide(b['reason']) ? b['reason'] : undefined;
  if (reason === undefined) return undefined;
  return nonVide(b['quoteId']) ? { reason, quoteId: b['quoteId'] } : { reason };
}

/* ──────────────────────────────── the wire ───────────────────────────────── */

export function httpPanierPort(baseUrl: string): PanierPort {
  const base = baseUrl.replace(/\/+$/, '');
  const unique = httpQuotePort(base);
  async function poster(path: string, corps: string): Promise<{ res: Response; body: unknown } | 'unreachable'> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps });
    } catch {
      return 'unreachable';
    }
    return { res, body: await res.json().catch(() => undefined) };
  }
  return {
    request: (intent, key) => unique.request(intent, key),
    reserve: (quoteId, commandId, holderRef) => unique.reserve(quoteId, commandId, holderRef),

    async prix(quoteIds): Promise<PrixOutcome> {
      // The allowlist, as one literal: quote ids and nothing else — no amount.
      const lu = await poster('/checkout/group/price', JSON.stringify({ quoteIds: [...quoteIds] }));
      if (lu === 'unreachable') return { status: 'unreachable' };
      if (!lu.res.ok) {
        const r = refus(lu.body);
        return r === undefined ? { status: 'unreadable' } : { status: 'refused', ...r };
      }
      const prix = lirePrix(lu.body);
      return prix === undefined ? { status: 'unreadable' } : { status: 'prix', prix };
    },

    async payer(quoteIds, commandId, holderRef, contact): Promise<GroupeOutcome> {
      let corps: string;
      try {
        corps = JSON.stringify({
          quoteIds: [...quoteIds],
          holderRef,
          commandId,
          ...(contact !== undefined
            ? {
                contact: {
                  phone: contact.phone,
                  quartier: contact.quartier,
                  repere: contact.repere,
                  ...(contact.audioB64 !== undefined ? { audioB64: contact.audioB64 } : {}),
                  ...(contact.pin !== undefined
                    ? {
                        pin: {
                          lat: contact.pin.lat,
                          lng: contact.pin.lng,
                          ...(contact.pin.accuracy !== undefined ? { accuracy: contact.pin.accuracy } : {}),
                        },
                      }
                    : {}),
                },
              }
            : {}),
        });
      } catch {
        return { status: 'unreadable' };
      }
      const lu = await poster('/checkout/group', corps);
      if (lu === 'unreachable') return { status: 'unreachable' };
      if (!lu.res.ok) {
        const r = refus(lu.body);
        return r === undefined ? { status: 'unreadable' } : { status: 'refused', ...r };
      }
      const groupe = lireGroupe(lu.body);
      return groupe === undefined ? { status: 'unreadable' } : { status: 'groupe', groupe };
    },

    async etat(groupId): Promise<GroupeOutcome> {
      let url: string;
      try {
        url = `${base}/checkout/group/${encodeURIComponent(groupId)}`;
      } catch {
        return { status: 'unreadable' };
      }
      let res: Response;
      try {
        res = await fetch(url, { method: 'GET' });
      } catch {
        return { status: 'unreachable' };
      }
      const body: unknown = await res.json().catch(() => undefined);
      if (!res.ok) {
        const r = refus(body);
        return r === undefined ? { status: 'unreadable' } : { status: 'refused', ...r };
      }
      const groupe = lireGroupe(body);
      return groupe === undefined ? { status: 'unreadable' } : { status: 'groupe', groupe };
    },
  };
}

/* ─────────────────────────────── the harness ─────────────────────────────── */

/**
 * ═══ MOCK CERTIFICATION (Execution Contract §3) — the panier's demo port ═══
 *
 * The same stand-in `demoQuotePort` is, for a panier: each article is priced
 * by `composeQuote(its own price)` (the seed's certified mock) and the totals
 * are those composed figures ADDED — the service's own sum, played here. It
 * inherits every optimism `demoQuotePort` names (no latency, no refusals, no
 * §6.1 door conditions, a « webhook » that arrives after `DEMO_ATTENTES`
 * reads) and adds none. Its orders are named from their article, mode and
 * price (`ord-demo-panier-…`), so a tracking opened later, on a reload, reads
 * the same amounts without any memory.
 */
const TTL_MS = 15 * 60 * 1000;

export function demoPanierPort(prixParPid: ReadonlyMap<string, number>, attentes = 2): PanierPort {
  let seq = 0;
  const quotes = new Map<string, { pid: string; door: boolean; prix: number }>();
  const lus = new Map<string, number>();
  const figures = (prix: number, door: boolean) => {
    const c = composeQuote(prix);
    return {
      productSubtotal: c.produitFcfa,
      deliveryFee: c.feeToday,
      buyerTotal: c.totalToday,
      amountPaidAtCheckout: door ? c.feeToday : c.totalToday,
      amountDueAtDelivery: door ? c.produitFcfa : 0,
    };
  };
  const somme = (ids: readonly string[]) => {
    let paid = 0, due = 0, fees = 0, produits = 0;
    let mode = '';
    for (const id of ids) {
      const q = quotes.get(id);
      if (q === undefined) return undefined;
      const f = figures(q.prix, q.door);
      paid += f.amountPaidAtCheckout;
      due += f.amountDueAtDelivery;
      fees += f.deliveryFee;
      produits += f.productSubtotal;
      mode = q.door ? 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' : 'FULL_PREPAY';
    }
    return { paid, due, fees, produits, mode };
  };
  const vue = (groupId: string, ids: readonly string[], state: string): PaiementGroupe => {
    const s = somme(ids)!;
    return {
      groupId,
      state,
      amountPaidAtCheckout: s.paid,
      amountDueAtDelivery: s.due,
      articles: ids.map((id) => {
        const q = quotes.get(id)!;
        const f = figures(q.prix, q.door);
        return {
          orderId: `ord-demo-panier-${q.door ? 'B' : 'A'}-${q.prix}-${id}`,
          state,
          amountPaidAtCheckout: f.amountPaidAtCheckout,
          amountDueAtDelivery: f.amountDueAtDelivery,
          doorLeg: q.door ? 'due' : 'none',
        };
      }),
    };
  };
  const groupes = new Map<string, readonly string[]>();
  return {
    async request(intent): Promise<QuoteOutcome> {
      const prix = prixParPid.get(intent.pid);
      if (prix === undefined) return { status: 'refused', reason: 'listing_unknown' };
      const door = intent.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
      seq += 1;
      const quoteId = `quote-demo-panier-${seq}`;
      quotes.set(quoteId, { pid: intent.pid, door, prix });
      return {
        status: 'quote',
        quote: { quoteId, paymentMode: intent.paymentMode, ...figures(prix, door), expiry: new Date(Date.now() + TTL_MS).toISOString() },
      };
    },
    async reserve(): Promise<ReserveOutcome> {
      return { status: 'reserved' };
    },
    async prix(quoteIds): Promise<PrixOutcome> {
      const s = somme(quoteIds);
      if (s === undefined) return { status: 'refused', reason: 'quote_unknown' };
      return {
        status: 'prix',
        prix: {
          paymentMode: s.mode,
          articles: quoteIds.length,
          amountPaidAtCheckout: s.paid,
          amountDueAtDelivery: s.due,
          deliveryTotal: s.fees,
          productTotal: s.produits,
        },
      };
    },
    async payer(quoteIds): Promise<GroupeOutcome> {
      if (somme(quoteIds) === undefined) return { status: 'refused', reason: 'quote_unknown' };
      const groupId = `grp-demo-${[...quoteIds].sort().join('-')}`;
      groupes.set(groupId, quoteIds);
      lus.set(groupId, 0);
      const v = vue(groupId, quoteIds, 'payment_pending');
      return {
        status: 'groupe',
        groupe: { ...v, commandes: v.articles.map((a) => ({ orderId: a.orderId, buyerRef: `ref-demo-${a.orderId}` })) },
      };
    },
    async etat(groupId): Promise<GroupeOutcome> {
      const ids = groupes.get(groupId);
      if (ids === undefined) return { status: 'refused', reason: 'unknown_order' };
      const n = (lus.get(groupId) ?? 0) + 1;
      lus.set(groupId, n);
      return { status: 'groupe', groupe: vue(groupId, ids, n > attentes ? 'confirmed' : 'payment_pending') };
    },
  };
}

/**
 * PAYER-TOUT-1 — WHAT ONE PAID ARTICLE'S TRACKING NEEDS: its order read, its
 * code read, and its own door charge. The real service's single-order doors,
 * unchanged — a panier article IS an ordinary order once paid.
 */
export type SuiviArticlePort = Pick<QuotePort, 'orderState' | 'remise' | 'doorCharge'>;

/**
 * The harness's twin, CERTIFIED BY THE SAME LIST as `demoQuotePort`: it is
 * reached only from a panier the demo already confirmed, so reads answer
 * `confirmed`; the door is `paid` once she has asked for it, and no rider
 * exists so no code is ever handed out. The amounts are read off the demo order's own id
 * (`ord-demo-panier-{A|B}-{prix}-…`) through the seed's composer.
 */
export function demoSuiviArticle(): SuiviArticlePort {
  const payees = new Set<string>();
  const lire = (orderId: string): ServerOrder | undefined => {
    const m = /^ord-demo-panier-([AB])-(\d+)-/.exec(orderId);
    if (m === null) return undefined;
    const door = m[1] === 'B';
    const c = composeQuote(Number(m[2]));
    return {
      orderId,
      state: 'confirmed',
      amountPaidAtCheckout: door ? c.feeToday : c.totalToday,
      amountDueAtDelivery: door ? c.produitFcfa : 0,
      doorLeg: !door ? 'none' : payees.has(orderId) ? 'paid' : 'due',
    };
  };
  return {
    async orderState(orderId) {
      const o = lire(orderId);
      return o === undefined ? { status: 'refused', reason: 'unknown_order' } : { status: 'order', order: o };
    },
    async remise() {
      return { status: 'refused' };
    },
    async doorCharge(orderId) {
      const o = lire(orderId);
      if (o === undefined) return { status: 'refused', reason: 'unknown_order' };
      payees.add(orderId);
      return { status: 'order', order: { ...o, doorLeg: 'due' } };
    },
  };
}

export function resolveSuiviArticle(): SuiviArticlePort {
  const env = (import.meta as { env?: { VITE_STOREFRONT_BASE?: string } }).env;
  const base = env?.VITE_STOREFRONT_BASE;
  return base ? httpQuotePort(base) : demoSuiviArticle();
}

/** The env-gated choice, `resolveQuotePort`'s twin. */
export function resolvePanierPort(prixParPid: ReadonlyMap<string, number>): PanierPort {
  const env = (import.meta as { env?: { VITE_STOREFRONT_BASE?: string } }).env;
  const base = env?.VITE_STOREFRONT_BASE;
  return base ? httpPanierPort(base) : demoPanierPort(prixParPid);
}

/* ──────────────────── the panier's paid articles, kept on the phone ────────── */

/**
 * WHAT THE PHONE KEEPS after a panier payment, so « Mes articles » reopens
 * each article's tracking after the tab dies: the payment's id, the holder
 * that paid it (each article's door is paid under it), and per article its
 * order, its read token and its name. ONE slot, newest wins — pilot scale,
 * the single road's own law (`sp-commande:v1`). No amount, no contact, no code.
 */
export const PANIER_PAYE_CLE = 'sp-panier-paye:v1';

export interface ArticlePaye {
  readonly orderId: string;
  readonly buyerRef: string;
  readonly nom: string;
}

export interface PanierPaye {
  readonly groupId: string;
  readonly holderRef: string;
  readonly at: string;
  readonly articles: readonly ArticlePaye[];
}

export function garderPanierPaye(p: PanierPaye, storage?: Storage): void {
  if (storage === undefined) return;
  try {
    storage.setItem(
      PANIER_PAYE_CLE,
      JSON.stringify({
        groupId: p.groupId,
        holderRef: p.holderRef,
        at: p.at,
        articles: p.articles.map((a) => ({ orderId: a.orderId, buyerRef: a.buyerRef, nom: a.nom })),
      }),
    );
  } catch {
    /* best-effort — the orders still live on the service */
  }
}

export function panierPaye(storage?: Storage): PanierPaye | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(PANIER_PAYE_CLE);
    if (raw === null || raw === '') return undefined;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!nonVide(v['groupId']) || !nonVide(v['holderRef']) || !nonVide(v['at']) || !Array.isArray(v['articles'])) return undefined;
    const articles: ArticlePaye[] = [];
    for (const a of v['articles'] as unknown[]) {
      const o = a !== null && typeof a === 'object' ? (a as Record<string, unknown>) : {};
      if (!nonVide(o['orderId']) || !nonVide(o['buyerRef']) || typeof o['nom'] !== 'string') return undefined;
      articles.push({ orderId: o['orderId'], buyerRef: o['buyerRef'], nom: o['nom'] });
    }
    if (articles.length === 0) return undefined;
    return { groupId: v['groupId'], holderRef: v['holderRef'], at: v['at'], articles };
  } catch {
    return undefined;
  }
}

/** « C'est terminé » on one article: its line goes; the last one takes the slot with it. */
export function retirerArticlePaye(orderId: string, storage?: Storage): void {
  const p = panierPaye(storage);
  if (p === undefined) return;
  const reste = p.articles.filter((a) => a.orderId !== orderId);
  if (reste.length === 0) oublierPanierPaye(storage);
  else garderPanierPaye({ ...p, articles: reste }, storage);
}

export function oublierPanierPaye(storage?: Storage): void {
  if (storage === undefined) return;
  try {
    storage.removeItem(PANIER_PAYE_CLE);
  } catch {
    /* best-effort */
  }
}

/**
 * THE PANIER'S HOLDER — one opaque token per panier composition, kept for the
 * tab's life so a reload replays her own holds. Every article's hold is taken
 * under it (the service's group requires ONE holder across the panier), and
 * each article's door is later paid under it.
 */
const TITULAIRE_PREFIX = 'sp-panier-titulaire:';

export function titulairePanier(portee: string, storage?: Storage): string | undefined {
  if (storage === undefined) return mintUuid();
  const slot = TITULAIRE_PREFIX + portee;
  try {
    const existing = storage.getItem(slot);
    if (existing !== null && existing !== '') return existing;
    const minted = mintUuid();
    if (minted !== undefined) storage.setItem(slot, minted);
    return minted;
  } catch {
    return mintUuid();
  }
}
