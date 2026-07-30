import { QuoteSchema, type Quote } from '@platform/contracts';
import { OrderSpine, type PaymentFailureReason } from '@shop-plus/commerce-core';
import { readStoredQuote } from './checkout-core.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ORDER — THE DECISION CORE (SP3.3a). Pure, total, no I/O, no clock.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══ WHAT THE FROZEN VAULT ALREADY DECIDES, AND IS NOT RE-DECIDED HERE ═══
 *
 * `packages/commerce-core` owns every payment DECISION this slice needs and this
 * module re-implements none of them:
 *
 *   · `order-machine.ts` owns the legal transitions — including the ONE audited
 *     exception, `payment_failed → payment_pending` with a NEW attempt id
 *     (`retry_requires_new_attempt_id` refuses a retry that reuses one).
 *   · `order-spine.ts` owns the provider webhook: idempotent on
 *     `envelope.command_id`, refusing `wrong_correlation`, `out_of_order`,
 *     `amount_mismatch` (franc-exact against the immutable Quote) and
 *     `unfunded_leg_status`; and `confirmOrder` refuses `no_funded_checkout_leg`
 *     — the runtime half of SP-I13's « no confirmed order without the required
 *     funded legs for its mode ».
 *   · `ledger.ts` owns the EscrowTxn RECORD: one checkout leg, one door leg,
 *     amounts COPIED from provider truth, a second different leg of a type
 *     already recorded refused closed.
 *
 * WHAT IS MISSING BETWEEN A RESERVED QUOTE AND A CONFIRMED ORDER — and is the
 * whole of this file plus its Durable Object — is the SERVICE SURFACE: proving
 * the reservation belongs to the caller, deriving the required legs FROM THE
 * MODE, minting and storing payment attempt ids, and replaying the vault's own
 * decisions over DURABLE storage so a process death changes no answer.
 *
 * ═══ THE MONEY LAW OF THIS FILE, IN ONE SENTENCE ═══
 *
 * NOTHING HERE COMPUTES AN AMOUNT. Every figure below is read verbatim off the
 * immutable Quote's STORED BYTES — the ones the vault's `ImmutableQuoteStore`
 * accepted — and the caller's request has no amount field to be read from, in
 * exactly the way `QuoteRequest` has none.
 *
 * ═══ EVERY FAILURE IS A NAMED REFUSAL ═══
 *
 * There is no generic failure and no 500 on this path. Each refusal below is its
 * own name because the buyer's screen (SP3.3b) has to say a different true thing
 * for each one.
 */

/* ────────────────────────────── the identity ─────────────────────────────── */

/**
 * ONE QUOTE ⇒ AT MOST ONE ORDER, STRUCTURALLY.
 *
 * The order id is DERIVED from the quote id rather than minted, and that is a
 * correctness decision, not a naming convenience:
 *
 *  1. The Durable Object holding the order is addressed by this id, so two
 *     concurrent creations for one quote reach ONE object through one workerd
 *     input gate and exactly one order can exist — the same structural argument
 *     that makes « one reservation per quote » true rather than enforced.
 *  2. The RESERVATION RECEIPT (see `ReservationReceipt`) can therefore be written
 *     into that same object at reserve time, so « does this caller hold this
 *     quote » is settled by a SINGLE-OBJECT read. A check in object A guarding a
 *     write in object B is precisely the shape that served one buyer another
 *     shop's price at SP3.2a round 3; it is not repeated here.
 *
 * The quote id rides inside the order id, and that is deliberate and harmless:
 * the only party holding an order id is the buyer who already holds the quote id.
 */
export const ORDER_ID_PREFIX = 'ord-';
export function orderIdForQuote(quoteId: string): string {
  return `${ORDER_ID_PREFIX}${quoteId}`;
}

/* ───────────────────────────── the reservation ───────────────────────────── */

/**
 * THE RESERVATION RECEIPT — the reservation as the order path may read it.
 *
 * ═══ THE FLAG THIS CLOSES (SP3.2a, JOURNAL) ═══
 *
 * « `POST /checkout/quote/{id}/reserve` is public and takes no ownership proof —
 * anyone who learns a quote id can take its single 2-minute hold and the real
 * buyer gets `already_reserved`. »
 *
 * ORDER CREATION THEREFORE REQUIRES THE SAME `holderRef` THAT TOOK THE HOLD.
 * A stranger who took the hold cannot be turned back into the buyer, but a
 * stranger who did NOT take it can never order on top of someone who did, and a
 * quote nobody holds can never be ordered at all. Both are refused BY NAME.
 *
 * ═══ WHY A RECEIPT AND NOT A READ ═══
 *
 * The authoritative reservation lives in `CheckoutDO`'s own storage, and that
 * object exposes exactly one reservation route: `POST /entry/reserve`. Asking it
 * « who holds this? » is impossible without ALSO taking the hold when nobody
 * does — the vault's `reserve` command on a `none` state creates one. A probe
 * that takes a hold in order to ask about it would (a) make « not reserved » a
 * refusal that stops being true the moment it is spoken, and (b) let a caller who
 * never reserved order on the second attempt. Neither is acceptable on a money
 * path, so the reservation is COPIED here at the moment it is decided instead
 * (`worker/index.ts`, the composition root, the same place the cross-aggregate
 * `curatedItems` write already lives).
 *
 * THE COPY CAN ONLY EVER BE STALE-OLD, AND STALE-OLD FAILS CLOSED: a new hold
 * always carries a LATER `expiresAt` than any hold before it, the receipt refuses
 * to move backwards in time, and an `expiresAt` in the past refuses the order
 * with `reservation_expired`. If the mirroring write is ever lost, the order
 * refuses `quote_not_reserved` and the buyer's next (idempotent) reserve writes
 * it again. Nothing about it can make an order MORE reachable than the hold.
 */
export interface ReservationReceipt {
  readonly quoteId: string;
  readonly reservationId: string;
  readonly holderRef: string;
  /** ISO 8601, copied from the vault's own reserved state — never recomputed. */
  readonly expiresAt: string;
}

/* ──────────────────────────────── the legs ───────────────────────────────── */

/**
 * A REQUIRED LEG — derived from the MODE, never from the caller (§5.5, NORMATIVE):
 *
 *   FULL_PREPAY: `amountPaidAtCheckout = buyerTotal`, `amountDueAtDelivery = 0`
 *   Option B:    `amountPaidAtCheckout = D`, `amountDueAtDelivery = productSubtotal`
 *
 * `due` is the §5.6 leg's timing, not its status: `now` is funded at checkout,
 * `at_delivery` is the Option-B product leg « paid by MoMo at the door before
 * custody transfer » — which this slice does NOT collect (that is the custody
 * handoff path).
 */
export interface RequiredLeg {
  readonly legType: 'checkout' | 'door';
  readonly amount: number;
  readonly due: 'now' | 'at_delivery';
}

export type LegDerivation =
  | { readonly ok: true; readonly legs: readonly RequiredLeg[] }
  | { readonly ok: false; readonly reason: 'payment_mode_unknown' | 'quote_split_incoherent' };

/**
 * THE LEGS COME FROM THE MODE AND THE QUOTE'S OWN BYTES — nothing else.
 *
 * The two amount fields on the Quote and the two mode-derived amounts are checked
 * against each other and a divergence REFUSES (`quote_split_incoherent`). The
 * vault's `issueQuote` already guarantees they agree, so this check is a second
 * reading of the same truth — which is exactly what it is for: a stored quote
 * whose split has drifted from its mode is the one lie the funded-legs CI gate
 * exists to catch (`order-journey.option-b.split-lie.json`), and a lie caught at
 * order creation never becomes a charge.
 */
export function requiredLegsFor(quote: Quote): LegDerivation {
  if (quote.paymentMode === 'FULL_PREPAY') {
    if (quote.amountPaidAtCheckout !== quote.buyerTotal || quote.amountDueAtDelivery !== 0) {
      return { ok: false, reason: 'quote_split_incoherent' };
    }
    return { ok: true, legs: [{ legType: 'checkout', amount: quote.buyerTotal, due: 'now' }] };
  }
  if (quote.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') {
    if (
      quote.amountPaidAtCheckout !== quote.deliveryFee ||
      quote.amountDueAtDelivery !== quote.productSubtotal
    ) {
      return { ok: false, reason: 'quote_split_incoherent' };
    }
    return {
      ok: true,
      legs: [
        { legType: 'checkout', amount: quote.deliveryFee, due: 'now' },
        { legType: 'door', amount: quote.productSubtotal, due: 'at_delivery' },
      ],
    };
  }
  // Unreachable through a parsed canon Quote (the enum admits two modes) and
  // kept anyway: this function must be TOTAL, and a third mode arriving in a
  // future canon bump must land on a refusal rather than on an empty leg list.
  return { ok: false, reason: 'payment_mode_unknown' };
}

/** The one leg that must be funded before this order may confirm, per mode. */
export function checkoutLegOf(legs: readonly RequiredLeg[]): RequiredLeg | undefined {
  return legs.find((leg) => leg.legType === 'checkout');
}

/* ────────────────────────────── the decision ─────────────────────────────── */

export type OrderRefusalReason =
  | 'quote_unknown'
  | 'quote_expired'
  | 'stored_quote_unreadable'
  | 'quote_not_reserved'
  | 'reservation_held_by_another'
  | 'reservation_expired'
  | 'payment_mode_unknown'
  | 'quote_split_incoherent';

export interface CreateOrderInput {
  /** The quote's CANONICAL BYTES, read server-side from the object that owns them. */
  readonly quoteBytes: string | undefined;
  /** The id the caller asked for — the stored quote must actually BE it. */
  readonly quoteId: string;
  /** The caller's claim to the hold. Compared, never trusted. */
  readonly holderRef: string;
  /** The receipt read from THIS order's own object — a single-object read. */
  readonly receipt: ReservationReceipt | undefined;
  /** Injected server time — this core never reads a clock. */
  readonly now: Date;
}

export type CreateOrderDecision =
  | {
      readonly ok: true;
      readonly quote: Quote;
      readonly legs: readonly RequiredLeg[];
      readonly reservationId: string;
    }
  | { readonly ok: false; readonly reason: OrderRefusalReason };

/**
 * MAY THIS ORDER EXIST? — the whole gate, in the order the checks must run.
 *
 *  1. THE QUOTE, from its stored bytes. Absent ⇒ `quote_unknown`; past its
 *     expiry ⇒ `quote_expired` (a revived price is a price nobody agreed to);
 *     unparseable or drifted from its own bytes ⇒ `stored_quote_unreadable`.
 *     The VAULT decides all three (`readStoredQuote` → `ImmutableQuoteStore`).
 *  2. THE QUOTE IS THE ONE ASKED FOR. A stored quote whose id differs from the
 *     requested one is not this order's quote, whatever object it came from.
 *  3. THE RESERVATION IS PROVEN, NOT ASSUMED — no receipt at all, a receipt for
 *     another quote, a receipt naming ANOTHER HOLDER, or a hold whose time has
 *     run out. Three distinct names because they are three different true things.
 *  4. THE LEGS COME FROM THE MODE. Only then does an amount enter the picture.
 */
export function decideCreateOrder(input: CreateOrderInput): CreateOrderDecision {
  const read = readStoredQuote(input.quoteBytes, input.now);
  if (!read.ok) {
    return {
      ok: false,
      reason:
        read.reason === 'not_found'
          ? 'quote_unknown'
          : read.reason === 'expired'
            ? 'quote_expired'
            : 'stored_quote_unreadable',
    };
  }
  const quote = read.quote;
  if (quote.id !== input.quoteId) return { ok: false, reason: 'quote_unknown' };

  const receipt = input.receipt;
  if (receipt === undefined || receipt.quoteId !== input.quoteId) {
    return { ok: false, reason: 'quote_not_reserved' };
  }
  if (receipt.holderRef !== input.holderRef) {
    return { ok: false, reason: 'reservation_held_by_another' };
  }
  // The vault wrote `expiresAt` when it decided the hold; the comparison is the
  // same ISO string ordering `reservation.ts` itself uses.
  if (input.now.toISOString() > receipt.expiresAt) {
    return { ok: false, reason: 'reservation_expired' };
  }

  const derived = requiredLegsFor(quote);
  if (!derived.ok) return { ok: false, reason: derived.reason };

  return { ok: true, quote, legs: derived.legs, reservationId: receipt.reservationId };
}

/* ────────────────────── the durable journal of the spine ─────────────────── */

/**
 * ═══ HOW A FROZEN, IN-MEMORY SPINE BECOMES DURABLE WITHOUT BEING REWRITTEN ═══
 *
 * `OrderSpine` holds its journey, its processed command ids and its ledger in
 * MEMORY, and it exposes no rehydration. Copying its decisions into storage would
 * mean re-implementing them — the one thing this slice may not do. So the Durable
 * Object stores the INPUTS instead, in order, and rebuilds the spine by replaying
 * them through the vault on every request.
 *
 * That is sound because the spine is a PURE FUNCTION OF ITS INPUTS: every clock
 * value it uses is injected on a command or read off an event envelope, and it
 * draws no randomness. The same log replays to the same state, forever, on any
 * process. The log is a handful of records per order, not a growing history.
 */
export type OrderInput =
  | {
      readonly kind: 'advance';
      readonly to: string;
      readonly command_id: string;
      readonly actor: string;
      readonly serverTime: string;
      readonly chainAdditions?: Record<string, string>;
    }
  | {
      readonly kind: 'fail';
      readonly command_id: string;
      readonly actor: string;
      readonly serverTime: string;
      readonly reason: PaymentFailureReason;
    }
  | {
      readonly kind: 'retry';
      readonly command_id: string;
      readonly actor: string;
      readonly serverTime: string;
      readonly newPaymentAttemptId: string;
    }
  | { readonly kind: 'provider'; readonly event: unknown }
  | {
      readonly kind: 'confirm';
      readonly command_id: string;
      readonly actor: string;
      readonly serverTime: string;
    };

/** The immutable facts an order is born with — stored once, replayed always. */
export interface OrderOrigin {
  readonly orderId: string;
  readonly quoteId: string;
  readonly correlationId: string;
  readonly issueCommandId: string;
  readonly actor: string;
  /** The server time the order was created — the spine's first event carries it. */
  readonly createdAt: string;
  /**
   * The supplier the settlement obligations would name. IT IS NOT KNOWN HERE and
   * is deliberately EMPTY: the canon Quote carries no supplier reference and the
   * storefront domain never learns one (the listing knows a product version, not
   * a supplier). The only consumer is `OrderSpine.onEligibilityEvent`, which this
   * slice does not route at all — Séra's settlement-eligibility signal is a later
   * slice, and it must carry the supplier with it rather than find a guess here.
   */
  readonly supplierRef: string;
}

export function rebuildOrderSpine(
  quote: Quote,
  origin: OrderOrigin,
  inputs: readonly OrderInput[],
): OrderSpine {
  const spine = new OrderSpine({
    quote,
    supplierRef: origin.supplierRef,
    correlationId: origin.correlationId,
    issueCommandId: origin.issueCommandId,
    actor: origin.actor,
    serverTime: origin.createdAt,
  });
  for (const input of inputs) applyOrderInput(spine, input);
  return spine;
}

export type ApplyOutcome =
  | { readonly applied: true; readonly duplicate: boolean }
  | { readonly applied: false; readonly reason: string };

/**
 * ONE INPUT → THE VAULT'S OWN VERDICT, normalised. Not one rule lives here: every
 * branch delegates, and the refusal name that comes back is the vault's.
 */
export function applyOrderInput(spine: OrderSpine, input: OrderInput): ApplyOutcome {
  switch (input.kind) {
    case 'advance': {
      const outcome = spine.advance({
        command_id: input.command_id,
        actor: input.actor,
        serverTime: input.serverTime,
        to: input.to,
        ...(input.chainAdditions !== undefined ? { chainAdditions: input.chainAdditions } : {}),
      });
      return outcome.ok ? { applied: true, duplicate: false } : { applied: false, reason: outcome.reason };
    }
    case 'fail': {
      const outcome = spine.failPayment({
        command_id: input.command_id,
        actor: input.actor,
        serverTime: input.serverTime,
        reason: input.reason,
      });
      return outcome.ok ? { applied: true, duplicate: false } : { applied: false, reason: outcome.reason };
    }
    case 'retry': {
      const outcome = spine.retryPayment({
        command_id: input.command_id,
        actor: input.actor,
        serverTime: input.serverTime,
        newPaymentAttemptId: input.newPaymentAttemptId,
      });
      return outcome.ok ? { applied: true, duplicate: false } : { applied: false, reason: outcome.reason };
    }
    case 'provider': {
      const outcome = spine.onProviderPaymentEvent(input.event);
      return outcome.applied
        ? { applied: true, duplicate: outcome.duplicate }
        : { applied: false, reason: outcome.reason };
    }
    case 'confirm': {
      const outcome = spine.confirmOrder({
        command_id: input.command_id,
        actor: input.actor,
        serverTime: input.serverTime,
      });
      return outcome.applied
        ? { applied: true, duplicate: outcome.duplicate }
        : { applied: false, reason: outcome.reason };
    }
  }
}

/* ──────────────────────── the buyer wire (the boundary) ──────────────────── */

/**
 * ═══ THE SECURITY BOUNDARY OF THIS SLICE ═══
 *
 * The order's internal record holds the immutable Quote's full canonical bytes —
 * `sellerBasePrice`, `sellerFundedCommission`, both nets, both platform fees — as
 * well as the payment attempt ids and the provider's collect references. NOT ONE
 * OF THEM MAY REACH A BUYER'S BROWSER (SP-I03; Ten Laws #1 « commission never in
 * buyer price »): with her displayed total in hand, a single one of those numbers
 * yields the supplier's base by subtraction, and an attempt id is an idempotency
 * KEY — a value that names a charge.
 *
 * BUILT FIELD BY FIELD, NEVER A SPREAD AND NEVER A DELETE, for the same reason
 * `toBuyerQuoteView` is: an allowlist that must be edited to grow is the only
 * shape where forgetting fails toward SILENCE.
 *
 * FOUR FIELDS, WHICH IS SP-I13 EXACTLY — « Checkout MUST show exactly what is
 * paid now vs due at delivery »: which order this is, where it stands, what is
 * paid at checkout, what is due at delivery. The HTTP code says whether the
 * command was accepted; `state` — and only `state` — says whether money moved.
 */
export interface BuyerOrderView {
  readonly orderId: string;
  readonly state: string;
  readonly amountPaidAtCheckout: number;
  readonly amountDueAtDelivery: number;
}

export function toBuyerOrderView(args: {
  readonly orderId: string;
  readonly state: string;
  readonly quote: Quote;
}): BuyerOrderView {
  return {
    orderId: args.orderId,
    state: args.state,
    // COPIED from the immutable Quote, never recomputed and never re-split.
    amountPaidAtCheckout: args.quote.amountPaidAtCheckout,
    amountDueAtDelivery: args.quote.amountDueAtDelivery,
  };
}

/**
 * The stored bytes → the Quote, for the paths that have already proven the bytes
 * once (the projection read). Refuses rather than repairs, like every other read
 * of a stored money artifact in this repo.
 */
export function parseStoredQuote(bytes: string | undefined): Quote | undefined {
  if (bytes === undefined) return undefined;
  try {
    return QuoteSchema.parse(JSON.parse(bytes));
  } catch {
    return undefined;
  }
}
