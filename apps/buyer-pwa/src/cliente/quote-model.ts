/**
 * PWA CLIENTE — SERVER BYTES → THE ONE `ClienteQuote` THE SCREENS RENDER.
 *
 * ═══ THE RULE THIS MODULE EXISTS TO MAKE STRUCTURAL ═══
 *
 * `screens.ts` says it: « Money is RENDER-ONLY: every fee/total/reconciliation
 * figure is read from the server-frozen ClienteQuote — no renderer ever adds two
 * amounts. » Until now the frozen quote came from `composeQuote`, which DID add.
 * On the real path it comes from the checkout service, and this file is the only
 * place the two shapes meet. There is not one `+` on money below, and there must
 * never be: if this app can compute a total, then some future branch will show a
 * total the server never signed.
 *
 * ═══ TWO MODES, TWO SERVER QUOTES, ONE SCREEN MODEL ═══
 *
 * The buyer sees ONE bill and chooses HOW to pay it. The service prices each
 * mode separately (`FULL_PREPAY` and `DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR` are
 * two requests, two quotes, two ids). The FULL quote is the one the screens
 * render — product, delivery, total — and the DOOR quote's only job is to say
 * whether mode B may be offered at all.
 *
 * ═══ CROSS-CHECK, NEVER DERIVE ═══
 *
 * We do not recompute the server's arithmetic — that would be this app pricing
 * its own commerce (Ten Laws #2). We check that the two answers AGREE about the
 * same three amounts, and that each mode's split says what its name says:
 *
 *   FULL : amountPaidAtCheckout === buyerTotal   ·   amountDueAtDelivery === 0
 *   DOOR : same productSubtotal · same deliveryFee · same buyerTotal,
 *          amountPaidAtCheckout === deliveryFee  ·   amountDueAtDelivery ===
 *          productSubtotal
 *
 * ANY disagreement ⇒ `amounts_disagree`, and the buyer sees the honest « nous ne
 * pouvons pas afficher le prix » surface. WE NEVER PICK ONE OF TWO DISAGREEING
 * PRICES. Two servers' worth of arithmetic that do not line up is not a
 * rounding question; it is a reason to stop showing figures.
 *
 * Note what is deliberately NOT checked: `productSubtotal + deliveryFee ===
 * buyerTotal`. That identity is the service's to hold and the CI money gate's to
 * prove; asserting it here would mean adding two amounts in the buyer app, which
 * is the exact thing this file forbids. The client renders the server's total,
 * even when the server's total is not the client's sum.
 */

import type { ClienteQuote } from './screens';
import { mintCommandId, type PaymentModeWire, type QuoteIntent, type QuoteOutcome, type QuotePort, type ServerQuote } from './quote-port';

export type ClienteQuoteFromServer =
  | { readonly ok: true; readonly quote: ClienteQuote; readonly bIndisponible: boolean }
  | { readonly ok: false; readonly reason: 'amounts_disagree' };

/**
 * Fill the screens' quote from the server's bytes.
 *
 * `feeToday`/`feeTomorrow` and `totalToday`/`totalTomorrow` are the SAME server
 * figure twice, not two tariffs: the canon `DeliveryFeeQuote{zoneFrom, zoneTo,
 * fee, serviceable, version}` has NO delivery-speed dimension — one zone pair,
 * one fee. The screens keep the two-field shape because the harness still drives
 * both; the real path's C4 renders ONE delivery line for exactly this reason.
 *
 * `bIndisponible` is true whenever the door quote is anything but a quote — a
 * refusal, an unreachable service, or amounts that disagree. That is the
 * existing, approved « Pas disponible pour cette commande » state, and it is the
 * truth today: the service refuses every pay-at-door request.
 */
export function clienteQuoteFromServer(full: ServerQuote, door: QuoteOutcome): ClienteQuoteFromServer {
  // THE FULL QUOTE'S OWN SPLIT. « Tout payer maintenant » must mean it.
  if (full.amountPaidAtCheckout !== full.buyerTotal) return { ok: false, reason: 'amounts_disagree' };
  if (full.amountDueAtDelivery !== 0) return { ok: false, reason: 'amounts_disagree' };

  let bIndisponible = true;
  if (door.status === 'quote') {
    const d = door.quote;
    const agrees =
      d.productSubtotal === full.productSubtotal &&
      d.deliveryFee === full.deliveryFee &&
      d.buyerTotal === full.buyerTotal &&
      d.amountPaidAtCheckout === full.deliveryFee &&
      d.amountDueAtDelivery === full.productSubtotal;
    // A DOOR QUOTE THAT CONTRADICTS THE FULL ONE IS NOT « mode B unavailable » —
    // it is two prices for one basket, and neither may be shown.
    if (!agrees) return { ok: false, reason: 'amounts_disagree' };
    bIndisponible = false;
  }

  return {
    ok: true,
    quote: {
      produitFcfa: full.productSubtotal,
      feeToday: full.deliveryFee,
      feeTomorrow: full.deliveryFee,
      totalToday: full.buyerTotal,
      totalTomorrow: full.buyerTotal,
    },
    bIndisponible,
  };
}

/**
 * IS THIS PRICE STILL ALIVE? — the gate the flow runs BEFORE it takes a hold.
 *
 * A quote lives 15 minutes (`QUOTE_TTL_MS`); past that the store refuses it as
 * `expired` and never revives it. Paying against a stale price means asking for
 * an amount nobody currently agrees to, and finding that out AFTER the operator
 * prompt is the cruel way to learn it.
 *
 * FAIL CLOSED ON GARBAGE: an unparsable or absent expiry is treated as expired.
 * `Date.parse` answers `NaN` there, and every comparison with `NaN` is false —
 * which would have silently meant « not expired, go ahead », the single most
 * dangerous default on this path. The `Number.isNaN` branch is that trap, shut.
 */
export function prixExpire(expiry: string, now: number): boolean {
  const at = Date.parse(expiry);
  if (Number.isNaN(at)) return true;
  return now >= at;
}

/* ─────────────────── what the flow receives when it asks ─────────────────── */

export type ReserveFetch =
  | { readonly status: 'reserved'; readonly expiresAt?: string }
  | { readonly status: 'refused'; readonly reason: string }
  /** Nothing answered. » Pas de connexion « is true only here. */
  | { readonly status: 'unreachable' }
  /** Something answered and it was not usable. */
  | { readonly status: 'unreadable' };

/**
 * The ONE answer `ClienteInit.quoteSource` gives the flow.
 *
 * `expiry` and `reserve` ride on the READY variant rather than on `ClienteInit`
 * because they are bound to the quote that was just issued: there is no expiry
 * and nothing to hold until a price exists. The flow gates payment on `expiry`
 * and takes the hold through `reserve` — it never learns the base url, the port,
 * or the shop's identity.
 */
export type QuoteFetch =
  | {
      readonly status: 'ready';
      readonly quote: ClienteQuote;
      readonly bIndisponible: boolean;
      /** The two ids this checkout attempt is made of — both fixed for its life. */
      readonly ids: { readonly fullQuoteId: string; readonly commandId: string };
      /** The server's own expiry instant, verbatim. */
      readonly expiry: string;
      /**
       * HOLD THIS QUOTE. It takes NO argument, and that is the fix: the command
       * id is minted ONCE per issued quote and closed over here, so a second
       * tap cannot mint a second one (CTO BLOCKER, SP3.2b review).
       */
      readonly reserve: () => Promise<ReserveFetch>;
    }
  | { readonly status: 'refused'; readonly reason: string }
  | { readonly status: 'unreachable' }
  | { readonly status: 'unreadable' };

/** What the buyer wants, minus the mode — the mode is what the two asks vary. */
export interface QuoteBase {
  readonly slug: string;
  readonly pid: string;
  readonly zoneTo: string;
  readonly attributionResellerId: string;
}

/** The two modes this app ever asks about, in the order it asks them. */
export const MODES_WIRE: readonly PaymentModeWire[] = ['FULL_PREPAY', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR'];

/**
 * ASK, CROSS-CHECK, ANSWER — the whole real-path price, in one place.
 *
 * TWO ASKS, and the FULL one decides everything. If it does not answer with a
 * quote there is no price and no screen: its refusal name (or `unreachable`)
 * goes straight back. The DOOR ask only ever decides whether mode B may be
 * offered — its refusal is the approved « Pas disponible pour cette commande »
 * state, never a reason to hide the bill.
 *
 * THERE IS NO FALLBACK BRANCH HERE, deliberately. Nothing in this function can
 * reach `composeQuote`; a refusal is returned as a refusal and an unreachable
 * service as an unreachable service. A price we invented is worse than no price.
 */
export async function fetchClienteQuote(
  port: QuotePort,
  base: QuoteBase,
  keyFor: (intent: QuoteIntent) => string,
  /**
   * The command id for the issued quote. Injected, not minted inline, so the
   * caller can make it survive a page reload the way the request key does —
   * see `commandIdFor`. Defaults to a fresh mint, which is correct in tests and
   * wherever no storage exists.
   */
  commandIdFor: (quoteId: string) => string = () => mintCommandId(),
): Promise<QuoteFetch> {
  const intentFor = (paymentMode: PaymentModeWire): QuoteIntent => ({ ...base, paymentMode });
  const fullIntent = intentFor('FULL_PREPAY');
  const fullKey = keyFor(fullIntent);
  const full = await port.request(fullIntent, fullKey);
  if (full.status === 'refused') return { status: 'refused', reason: full.reason };
  // The two « no price » answers stay DISTINCT all the way to the screen: one
  // says « pas de connexion », the other does not, because only one of them is
  // true about the network.
  if (full.status === 'unreadable') return { status: 'unreadable' };
  if (full.status !== 'quote') return { status: 'unreachable' };

  const doorIntent = intentFor('DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
  const door = await port.request(doorIntent, keyFor(doorIntent));

  const model = clienteQuoteFromServer(full.quote, door);
  // Two prices for one basket is not « mode B unavailable » — it is a reason to
  // stop showing figures, and it reaches the screen under its own name.
  if (!model.ok) return { status: 'refused', reason: model.reason };

  const quoteId = full.quote.quoteId;
  /**
   * ═══ ONE COMMAND ID PER ISSUED QUOTE — NOT ONE PER TAP ═══
   *
   * THE DEFECT THIS CLOSES (CTO BLOCKER, SP3.2b review): the flow minted a
   * fresh uuid inside the `payer` handler, so a buyer who tapped back out of
   * « ENVOI SÉCURISÉ » (`renderC5`'s submitting branch renders a back button)
   * and tapped Payer again sent a DIFFERENT command id at her own live hold.
   * The vault replays a reservation idempotently ONLY when
   * `state.reserveCommandId === cmd.command_id` (`reservation.ts`); anything
   * else against a `reserved` state answers `already_reserved`. She would have
   * been shown « Cette commande est déjà en cours. » for a hold she is the
   * holder of, for the full two-minute TTL, with no way forward.
   *
   * Resolved here, once, and CLOSED OVER: `reserve()` takes no argument, so a
   * per-tap mint is not merely avoided — it is unrepresentable. A new quote
   * (including « Voir le prix à jour », which re-enters this function and gets
   * a new quote id) gets a new one, which is correct: a new hold on a new quote
   * is a new command. `commandIdFor` is keyed on the QUOTE ID, so a page reload
   * that lands on the same quote lands on the same command too.
   */
  const commandId = commandIdFor(quoteId);
  return {
    status: 'ready',
    quote: model.quote,
    bIndisponible: model.bIndisponible,
    ids: { fullQuoteId: quoteId, commandId },
    expiry: full.quote.expiry,
    // THE HOLDER IS THIS CHECKOUT ATTEMPT, and the request key already names it
    // uniquely and opaquely — the server minted no other handle and the buyer
    // has no identity to lend. Nothing about her rides on this value.
    reserve: () => port.reserve(quoteId, commandId, fullKey),
  };
}
