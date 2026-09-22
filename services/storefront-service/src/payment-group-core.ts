import type { BuyerOrderView } from './order-core.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAYER-TOUT-1 — ONE PAYMENT FOR SEVERAL ARTICLES OF ONE BOUTIQUE.
 * Pure, total, no I/O, no clock. (Founder ruling 2026-09-22, option 1.)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The buyer pays her boutique panier in ONE mobile-money confirmation; the
 * platform keeps ONE ORDER PER ARTICLE, each with its own quote, delivery fee,
 * package, rider, custody and refund. The group is only the collection: it
 * owns no money rule. Every figure below is read off each order's immutable
 * Quote and ADDED — the one arithmetic this file does, so the buyer sees one
 * total the server stated rather than one her phone computed.
 *
 * A group is ONE BOUTIQUE, ONE MODE, ONE DESTINATION:
 *  · one boutique — the same locked `attributionResellerId` (SP-I01) on every
 *    quote, so one payment never crosses two resellers' books;
 *  · one mode — the collection is either every checkout leg in full, or every
 *    delivery fee (pay at the door: each product then at its own door);
 *  · one destination — one contact rides every order, so every quote must be
 *    priced for the same zone, or one delivery fee would be a lie.
 */

/** Two is the least a group can be; ten bounds the fan-out's subrequests. */
export const GROUP_MIN = 2;
/**
 * ⚑ FLAGGED DEFAULT — ten articles per payment. The group reaches every order
 * of its panier on each pay and on each webhook (a check and a create each on
 * pay), and the Worker's per-invocation subrequest budget is finite. Ten keeps
 * a pay under ~25 subrequests with the note upload and the charge.
 */
export const GROUP_MAX = 10;

export const GROUP_ID_PREFIX = 'grp-';

/**
 * THE SAME SET OF QUOTES IS THE SAME GROUP, ALWAYS. Derived, never minted, for
 * the reason the order id is derived from its quote's: a buyer whose answer was
 * lost and who asks again reaches the SAME object and the SAME provider key, so
 * a double tap can never become two collections. Order-free: sorted first.
 */
export async function groupIdFor(quoteIds: readonly string[]): Promise<string> {
  const canon = [...new Set(quoteIds)].sort().join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${GROUP_ID_PREFIX}${hex.slice(0, 40)}`;
}

export function isGroupId(id: string): boolean {
  return id.startsWith(GROUP_ID_PREFIX);
}

/** What each article contributes — every field read off its own immutable Quote. */
export interface GroupEntry {
  readonly quoteId: string;
  readonly orderId: string;
  readonly paymentMode: string;
  readonly attributionResellerId: string;
  /** The destination its fee was priced for; `undefined` when the quote carries no record. */
  readonly zoneTo: string | undefined;
  readonly amountPaidAtCheckout: number;
  readonly amountDueAtDelivery: number;
  readonly deliveryFee: number;
  /** B + M — what the article itself costs, before its delivery. */
  readonly productSubtotal: number;
}

export interface GroupPart {
  readonly orderId: string;
  readonly quoteId: string;
  /** This order's checkout leg — its share of the one collection. */
  readonly amount: number;
  /** What stays due at this order's own door (0 when prepaid in full). */
  readonly due: number;
}

export type GroupRefusal = 'panier_taille' | 'panier_doublon' | 'panier_incoherent' | 'montant_illisible';

export type GroupDecision =
  | {
      readonly ok: true;
      readonly paymentMode: string;
      /** Ordered by orderId: the order every later reader walks them in. */
      readonly parts: readonly GroupPart[];
      /** Σ checkout legs — the ONE amount the provider is asked for. */
      readonly total: number;
      /** Σ amounts due at the doors (0 when prepaid in full). */
      readonly dueTotal: number;
      /** Σ delivery fees, shown beside « N livraisons » so she sees what she pays for. */
      readonly deliveryTotal: number;
      /** Σ (B + M) — the articles themselves; with `deliveryTotal` it reconciles the full total. */
      readonly productTotal: number;
    }
  | { readonly ok: false; readonly reason: GroupRefusal };

function franc(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

export function decideGroupParts(entries: readonly GroupEntry[]): GroupDecision {
  if (entries.length < GROUP_MIN || entries.length > GROUP_MAX) return { ok: false, reason: 'panier_taille' };
  if (new Set(entries.map((e) => e.quoteId)).size !== entries.length) return { ok: false, reason: 'panier_doublon' };
  const first = entries[0]!;
  for (const e of entries) {
    if (
      e.paymentMode !== first.paymentMode ||
      e.attributionResellerId !== first.attributionResellerId ||
      e.zoneTo === undefined ||
      e.zoneTo !== first.zoneTo
    ) {
      return { ok: false, reason: 'panier_incoherent' };
    }
  }
  let total = 0;
  let dueTotal = 0;
  let deliveryTotal = 0;
  let productTotal = 0;
  for (const e of entries) {
    if (
      !franc(e.amountPaidAtCheckout) || e.amountPaidAtCheckout === 0 ||
      !franc(e.amountDueAtDelivery) || !franc(e.deliveryFee) || !franc(e.productSubtotal)
    ) {
      return { ok: false, reason: 'montant_illisible' };
    }
    total += e.amountPaidAtCheckout;
    dueTotal += e.amountDueAtDelivery;
    deliveryTotal += e.deliveryFee;
    productTotal += e.productSubtotal;
  }
  if (!franc(total) || !franc(dueTotal) || !franc(deliveryTotal) || !franc(productTotal)) {
    return { ok: false, reason: 'montant_illisible' };
  }
  const parts = [...entries]
    .sort((a, b) => (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0))
    .map((e) => ({ orderId: e.orderId, quoteId: e.quoteId, amount: e.amountPaidAtCheckout, due: e.amountDueAtDelivery }));
  return { ok: true, paymentMode: first.paymentMode, parts, total, dueTotal, deliveryTotal, productTotal };
}

/* ─────────────────────────── the buyer's view ─────────────────────────────── */

/**
 * ONE STATE FOR THE WHOLE PAYMENT, read off the orders' own states: when they
 * all agree, that; otherwise the payment is still moving, which is the honest
 * word for a webhook half-way through its fan-out or a failure half-way
 * through its notice. Never « confirmed » until every order is.
 */
export function groupStateOf(states: readonly string[]): string {
  const first = states[0];
  if (first !== undefined && states.every((s) => s === first)) return first;
  return 'payment_pending';
}

export interface BuyerGroupView {
  readonly groupId: string;
  readonly state: string;
  readonly paymentMode: string;
  /** The one collection she pays now. */
  readonly amountPaidAtCheckout: number;
  /** Σ due at the doors. */
  readonly amountDueAtDelivery: number;
  readonly deliveryTotal: number;
  /** Each article is its own order and keeps its own view. */
  readonly articles: readonly BuyerOrderView[];
}

export function toBuyerGroupView(args: {
  readonly groupId: string;
  readonly paymentMode: string;
  readonly total: number;
  readonly dueTotal: number;
  readonly deliveryTotal: number;
  readonly articles: readonly BuyerOrderView[];
}): BuyerGroupView {
  return {
    groupId: args.groupId,
    state: groupStateOf(args.articles.map((a) => a.state)),
    paymentMode: args.paymentMode,
    amountPaidAtCheckout: args.total,
    amountDueAtDelivery: args.dueTotal,
    deliveryTotal: args.deliveryTotal,
    articles: args.articles,
  };
}
