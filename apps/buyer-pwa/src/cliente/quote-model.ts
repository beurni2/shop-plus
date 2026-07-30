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

import type { ClienteQuote, LegSplits, ModePaiement } from './screens';
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
  /**
   * THE DOOR QUOTE'S OWN SPLIT, CARRIED (SP3.3b1 · §6.1).
   *
   * ═══ WHAT THIS DOES AND DOES NOT CLAIM (corrected after a fresh verifier
   *     showed the grander claim was unfalsifiable) ═══
   *
   * IT CANNOT CHANGE A NUMBER, AND NO TEST CAN SHOW THAT IT DOES. `agrees`
   * below FORCES `d.amountPaidAtCheckout === full.deliveryFee` and
   * `d.amountDueAtDelivery === full.productSubtotal`, so a screen that carries
   * the door quote's two fields and a screen that re-derives them from the full
   * quote print the SAME francs — always, by construction. Replace this carry
   * with re-derivation and the suite stays green, because there is no reachable
   * input on which the two differ. That is not a hole in the tests; it is what
   * the cross-check guarantees.
   *
   * WHAT IT IS FOR, then, is PROVENANCE and one less rule in the client: the
   * figure under « À payer maintenant » on the mode-B card is the field the
   * server wrote for MODE B, not this app's opinion that pay-at-door means
   * « the delivery fee now ». The old code held that opinion, in the renderer,
   * beside the amounts — and an opinion about what a payment mode means is the
   * kind of thing that survives a spec change silently. Deleting it costs
   * nothing and removes a place where a future mode could be quietly mispriced.
   *
   * Every cross-check above and below is untouched: a door quote that
   * contradicts the full one is still `amounts_disagree` and still refuses.
   */
  let splitB: LegSplits['B'];
  if (door.status === 'quote') {
    const d = door.quote;
    if (d.paymentMode !== 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') return { ok: false, reason: 'mode_mismatch' };
    // DEFENCE IN DEPTH, AND IT CANNOT FIRE TODAY — said plainly rather than
    // dressed up (verifier ITEM 5). `agrees` below forces the door quote's
    // productSubtotal, deliveryFee and buyerTotal to EQUAL the full quote's, and
    // `reconcile` reads only those three, so `reconcile(full)` — already checked
    // above — implies `reconcile(d)`. This line is unreachable as written.
    //
    // It stays because it is free and it stops being unreachable the moment
    // `agrees` is ever loosened; what does NOT stay is the old comment claiming
    // the door quote « reconciles on its own too », which described a check that
    // could not run. A comment that overstates a guard is the same species of
    // lie as a screen that overstates a total.
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
    splitB = { paidNow: d.amountPaidAtCheckout, dueAtDelivery: d.amountDueAtDelivery };
    bIndisponible = false;
  }

  /**
   * ONE SET OF SPLITS, IN BOTH LEG SLOTS — the same doubling, for the same
   * reason, as `feeToday`/`feeTomorrow`: the canon prices one zone pair, one
   * fee, so there is one split and both slots carry it. `B` is ABSENT (never a
   * zero) whenever the door quote was a refusal, a timeout or an unreachable
   * service — the state C5 renders as « Pas disponible pour cette commande ».
   */
  const splits: LegSplits = {
    A: { paidNow: full.amountPaidAtCheckout, dueAtDelivery: full.amountDueAtDelivery },
    ...(splitB !== undefined ? { B: splitB } : {}),
  };

  return {
    ok: true,
    quote: {
      produitFcfa: full.productSubtotal,
      feeToday: full.deliveryFee,
      feeTomorrow: full.deliveryFee,
      totalToday: full.buyerTotal,
      totalTomorrow: full.buyerTotal,
      splitsToday: splits,
      splitsTomorrow: splits,
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
 * ═══ HOW LONG THE BILL WAITS FOR AN OPTION NOBODY CAN TAKE YET ═══
 *
 * THE GRACE STARTS WHEN THE PRICE IS KNOWN, not when the asks go out. Both
 * requests are issued in the same instant, so by the time the FULL answer lands
 * the door ask has already had the full ask's ENTIRE duration to reply — on a
 * slow link that is seconds of head start. This number is only the TAIL: how
 * much longer we make her stare at a skeleton after her price already exists.
 *
 * WHY 1 500 ms, measured against the real target device and link — a low-end
 * Android on Ouaga 2G/EDGE, where a round trip commonly costs 600–1 200 ms:
 *   · it is ABOUT ONE MORE ROUND TRIP, so a door ask that is merely a little
 *     slower than the full one still lands and mode B is still offered;
 *   · it is SHORT ENOUGH TO BE INVISIBLE against a full ask that itself took
 *     seconds — the buyer perceives one wait, not two;
 *   · it CAPS the pathological case at 1.5 s instead of the service's own
 *     timeout. The verifier measured 13.7 s to first price with a stalled door
 *     ask; on 2G that is the difference between a sale and a closed tab.
 *
 * WHAT A TIMEOUT MEANS, AND WHAT IT MUST NEVER MEAN. It means « we do not have
 * a door price », which is the plain truth and yields the existing, approved
 * « Pas disponible pour cette commande » state — the same state a refusal
 * yields, and the state EVERY request gets in production today. It NEVER means
 * « the door quote was fine »: a door quote that arrives IN TIME and
 * contradicts the full one is still `amounts_disagree` and still refuses. The
 * deadline may only ever turn a door quote into « unavailable », never turn a
 * contradiction into « fine ».
 */
export const DOOR_GRACE_MS = 1_500;

/** The deadline's own answer — never a quote, so it can only ever mean
 *  « mode B unavailable ». Kept distinct from a refusal so no refusal NAME is
 *  invented for something the server never said. */
const DOOR_TIMED_OUT = { status: 'unreachable' } as const;

/**
 * Race one door ask against the grace period.
 *
 * RESOLVES EXACTLY ONCE, and the loser's value is never read again — that is
 * how a late answer is DISCARDED rather than applied. It is structural, not a
 * convention: `Promise.race` hands back one value, this function returns it,
 * and no reference to the door promise survives. A bill already on screen
 * cannot be mutated under the buyer's finger by a reply that arrived too late,
 * because there is nothing left holding that reply.
 *
 * The `catch` is not decoration: `port.request` is documented TOTAL, but if it
 * ever rejected after the race had already settled, an unhandled rejection
 * would surface on a money screen. Swallowed here, at the boundary.
 */
async function doorWithinGrace(ask: Promise<QuoteOutcome>, graceMs: number): Promise<QuoteOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<QuoteOutcome>((resolve) => {
    timer = setTimeout(() => resolve(DOOR_TIMED_OUT), graceMs);
  });
  try {
    return await Promise.race([ask.catch((): QuoteOutcome => ({ status: 'unreadable' })), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

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
  /** The door ask's grace period — injected so tests need not wait 1.5 s. */
  doorGraceMs: number = DOOR_GRACE_MS,
): Promise<QuoteFetch> {
  const intentFor = (paymentMode: PaymentModeWire): QuoteIntent => ({ ...base, paymentMode });
  const fullIntent = intentFor('FULL_PREPAY');
  const doorIntent = intentFor('DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
  const fullKey = keyFor(fullIntent);
  const doorKey = keyFor(doorIntent);
  // NO CSPRNG ON THIS DEVICE ⇒ a NAMED refusal with an action, never a weaker
  // random and never a frozen screen (verifier BLOCKER 4).
  if (fullKey === undefined || doorKey === undefined) return { status: 'refused', reason: 'no_secure_random' };

  // ═══ BOTH ASKS GO OUT TOGETHER; ONLY ONE OF THEM CAN HOLD UP THE BILL ═══
  //
  // Serialized, the door ask — which the service refuses for EVERY buyer today —
  // sat in front of the price. Issued together, a slow pair costs one wait
  // instead of two. But `Promise.all` alone was not enough: it still AWAITS the
  // door, so one STALLED door ask held the whole bill hostage for 13.7 s
  // (measured). Ten Laws #7 puts the low-end phone on the slow link first, and
  // that wait buys her nothing — the option at the end of it is refused today.
  //
  // So: the FULL ask has NO deadline and stays fully authoritative — its
  // refusal, its `unreachable`, its `unreadable` all decide the screen exactly
  // as before. The DOOR ask races the grace period, and losing that race means
  // only « we do not have a door price ».
  const fullAsk = port.request(fullIntent, fullKey);
  // Attached the instant the promise exists: every early return below abandons
  // this ask, and an abandoned promise that later rejects is an unhandled
  // rejection on a money screen.
  const doorAsk = port.request(doorIntent, doorKey).catch((): QuoteOutcome => ({ status: 'unreadable' }));

  const full = await fullAsk;
  if (full.status === 'refused') return { status: 'refused', reason: full.reason };
  // The two « no price » answers stay DISTINCT all the way to the screen: one
  // says « pas de connexion », the other does not, because only one of them is
  // true about the network.
  if (full.status === 'unreadable') return { status: 'unreadable' };
  if (full.status !== 'quote') return { status: 'unreachable' };

  // THE PRICE IS KNOWN. From here the door ask gets its grace period and not one
  // millisecond more; whatever it answers after that is discarded unread.
  const door = await doorWithinGrace(doorAsk, doorGraceMs);

  // THE CROSS-CHECK IS UNTOUCHED BY THE DEADLINE. A door quote that arrived IN
  // TIME goes in exactly as before, contradictions and all — `amounts_disagree`
  // still refuses. Only the ABSENCE of an answer was substituted above.
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
