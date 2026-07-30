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
 * same three amounts, that each mode's split says what its name says, and that
 * each quote RECONCILES:
 *
 *   BOTH : paymentMode is the mode that was ASKED for
 *   BOTH : productSubtotal + deliveryFee === buyerTotal
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
 * ═══ WHY THE `+` BELOW IS A GUARD AND NOT THIS APP PRICING ANYTHING ═══
 *
 * This file used to say the reconciliation identity was « deliberately NOT
 * checked », on the grounds that writing `a + b` on money here would be the app
 * doing arithmetic. THAT WAS WRONG, and the verifier proved the cost in a live
 * DOM (SP3.2b round 3): a server answering buyerTotal 13 900 on 11 500 + 1 000
 * produced a bill, a CTA, a C6 confirmation and — worst — the sentence
 * « 13 900 = 11 500 + 1 000 — chaque franc a sa place. » 1 400 FCFA unaccounted
 * for, under the screen's own promise that nothing is hidden.
 *
 * THE DISTINCTION THAT MATTERS: computing a total means DERIVING a number and
 * SHOWING it. This does neither. It compares two numbers the server sent and
 * REFUSES when they contradict — the identical discipline as `isAmount`
 * rejecting a fractional franc, or `looksLikeServerQuote` rejecting a missing
 * field. « A network boundary is checked, never trusted. » The client still
 * renders the server's figures and never substitutes its own; it declines to
 * render figures that contradict each other.
 *
 * AND THE CANON REQUIRES IT: Ten Laws #1 — « every quote/order byte-stable and
 * RECONCILING TO THE FRANC ». A quote that does not reconcile is not a quote.
 * `screens.ts` prints that identity as a promise to the buyer; a promise nobody
 * checks is the kind of sentence this project exists not to ship.
 */

import type { ClienteQuote, ModePaiement } from './screens';
import { mintCommandId, type PaymentModeWire, type QuoteIntent, type QuoteOutcome, type QuotePort, type ServerQuote } from './quote-port';

export type ClienteQuoteFromServer =
  | { readonly ok: true; readonly quote: ClienteQuote; readonly bIndisponible: boolean }
  | { readonly ok: false; readonly reason: 'amounts_disagree' | 'mode_mismatch' };

/** Does this quote reconcile to the franc? An EQUALITY GUARD at the boundary —
 *  see the header: comparing two server figures is not computing a third. */
const reconcile = (q: ServerQuote): boolean => q.productSubtotal + q.deliveryFee === q.buyerTotal;

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
  // THE ANSWER MUST BE ABOUT THE QUESTION. A quote carrying a mode we did not
  // ask for is a different product with our price on it (verifier: a FULL ask
  // answered `paymentMode: DOOR` rendered happily, and the whole B/A split on
  // C5 is decided by which mode we believe we hold).
  if (full.paymentMode !== 'FULL_PREPAY') return { ok: false, reason: 'mode_mismatch' };
  // IT MUST RECONCILE TO THE FRANC (Ten Laws #1) — the identity C5 prints.
  if (!reconcile(full)) return { ok: false, reason: 'amounts_disagree' };
  // THE FULL QUOTE'S OWN SPLIT. « Tout payer maintenant » must mean it.
  if (full.amountPaidAtCheckout !== full.buyerTotal) return { ok: false, reason: 'amounts_disagree' };
  if (full.amountDueAtDelivery !== 0) return { ok: false, reason: 'amounts_disagree' };

  let bIndisponible = true;
  if (door.status === 'quote') {
    const d = door.quote;
    if (d.paymentMode !== 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') return { ok: false, reason: 'mode_mismatch' };
    // The door quote reconciles ON ITS OWN too — it is a second quote, not a
    // view of the first, and it is the one that gets held when B is chosen.
    if (!reconcile(d)) return { ok: false, reason: 'amounts_disagree' };
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
      /**
       * The ids this checkout attempt is made of — all fixed for its life. The
       * DOOR pair is absent whenever mode B was not issued (which is every
       * request today: the service refuses every pay-at-door ask).
       */
      readonly ids: {
        readonly fullQuoteId: string;
        readonly commandId: string;
        readonly doorQuoteId?: string;
        readonly doorCommandId?: string;
      };
      /** The server's own expiry instant, verbatim. */
      readonly expiry: string;
      /**
       * HOLD THE QUOTE FOR THE MODE SHE CHOSE.
       *
       * IT TAKES THE MODE, and that is the fix (verifier BLOCKER, round 3): the
       * hold used to be hard-bound to the FULL quote id, so choosing « Payer à
       * la livraison » — a CTA promising 1 000 FCFA — placed the hold on the
       * 12 500 FULL quote. Latent only because the service refuses every door
       * ask today; the day one reliable zone opens it holds the wrong quote at
       * the wrong amount.
       *
       * It still takes no COMMAND ID: each mode's command is minted once with
       * its quote and closed over, so a second tap replays her own hold instead
       * of colliding with it (the round-2 blocker, still closed).
       */
      readonly reserve: (mode: ModePaiement) => Promise<ReserveFetch>;
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
  keyFor: (intent: QuoteIntent) => string | undefined,
  /**
   * The command id for the issued quote. Injected, not minted inline, so the
   * caller can make it survive a page reload the way the request key does —
   * see `commandIdFor`. Defaults to a fresh mint, which is correct in tests and
   * wherever no storage exists.
   */
  commandIdFor: (quoteId: string) => string | undefined = () => mintCommandId(),
): Promise<QuoteFetch> {
  const intentFor = (paymentMode: PaymentModeWire): QuoteIntent => ({ ...base, paymentMode });
  const fullIntent = intentFor('FULL_PREPAY');
  const doorIntent = intentFor('DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
  const fullKey = keyFor(fullIntent);
  const doorKey = keyFor(doorIntent);
  // NO CSPRNG ON THIS DEVICE ⇒ a NAMED refusal with an action, never a weaker
  // random and never a frozen screen (verifier BLOCKER 4).
  if (fullKey === undefined || doorKey === undefined) return { status: 'refused', reason: 'no_secure_random' };

  // THE TWO ASKS GO TOGETHER (verifier NOTE 7). Serialized, the door ask — which
  // the service refuses for EVERY buyer today — sat in front of the price: the
  // verifier measured 13.8 s to first price with a stalled door ask, when the
  // price was known after the first round trip. On 2G that doubled
  // time-to-price for an option nobody can take yet. The FULL ask stays
  // authoritative for refusals; the door ask only ever decides whether mode B
  // may be offered.
  const [full, door] = await Promise.all([port.request(fullIntent, fullKey), port.request(doorIntent, doorKey)]);

  if (full.status === 'refused') return { status: 'refused', reason: full.reason };
  // The two « no price » answers stay DISTINCT all the way to the screen: one
  // says « pas de connexion », the other does not, because only one of them is
  // true about the network.
  if (full.status === 'unreadable') return { status: 'unreadable' };
  if (full.status !== 'quote') return { status: 'unreachable' };

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
  if (commandId === undefined) return { status: 'refused', reason: 'no_secure_random' };

  // THE DOOR QUOTE'S OWN id and OWN command — the hold for mode B lands on the
  // quote mode B was priced under, never on the FULL one.
  const doorQuote = door.status === 'quote' && !model.bIndisponible ? door.quote : undefined;
  let doorHold: { readonly quoteId: string; readonly commandId: string } | undefined;
  if (doorQuote !== undefined) {
    const cmd = commandIdFor(doorQuote.quoteId);
    if (cmd === undefined) return { status: 'refused', reason: 'no_secure_random' };
    doorHold = { quoteId: doorQuote.quoteId, commandId: cmd };
  }

  return {
    status: 'ready',
    quote: model.quote,
    bIndisponible: model.bIndisponible,
    ids: {
      fullQuoteId: quoteId,
      commandId,
      ...(doorHold !== undefined ? { doorQuoteId: doorHold.quoteId, doorCommandId: doorHold.commandId } : {}),
    },
    expiry: full.quote.expiry,
    // THE HOLDER IS THIS CHECKOUT ATTEMPT, and the request key already names it
    // uniquely and opaquely — the server minted no other handle and the buyer
    // has no identity to lend. Nothing about her rides on this value.
    reserve: (mode: ModePaiement): Promise<ReserveFetch> => {
      if (mode === 'B') {
        // Unreachable through the UI — with no door quote, `bIndisponible` is
        // true and C5 renders the « Pas disponible » block instead of a B
        // button. Named rather than silently held on the wrong quote.
        if (doorHold === undefined) {
          return Promise.resolve({ status: 'refused', reason: 'mode_indisponible' });
        }
        return port.reserve(doorHold.quoteId, doorHold.commandId, doorKey);
      }
      return port.reserve(quoteId, commandId, fullKey);
    },
  };
}
