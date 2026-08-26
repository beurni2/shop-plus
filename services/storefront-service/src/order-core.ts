import { OrderConfirmedEventSchema, QuoteSchema, type OrderConfirmedEvent, type PlatformEvent, type Quote } from '@platform/contracts';
import { OrderSpine, type DoorLegState, type PaymentFailureReason } from '@shop-plus/commerce-core';
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

/** …and its twin. Option B derives one; FULL_PREPAY derives none. */
export function doorLegOf(legs: readonly RequiredLeg[]): RequiredLeg | undefined {
  return legs.find((leg) => leg.legType === 'door');
}

/* ─────────────────────── the door charge (SP4.2a-bis) ────────────────────── */

export type DoorChargeRefusalReason =
  | 'stored_quote_unreadable'
  | 'quote_not_reserved'
  | 'reservation_held_by_another'
  | 'door_leg_not_expected'
  | 'order_not_confirmed'
  | 'door_leg_not_due';

export type DoorChargeDecision =
  | { readonly ok: true; readonly leg: RequiredLeg }
  | { readonly ok: false; readonly reason: DoorChargeRefusalReason };

/**
 * ═══ MAY THIS CALLER ASK US TO COLLECT THE PRODUCT LEG, RIGHT NOW? ═══
 *
 * §5.5's boundary, in order: « … rider verify → custody seal → custody →
 * transit → **buyer inspection** → [B: **pay product leg** → provider-confirmed
 * → HandoffAuthorization] → custody→customer (**drop code last**) ». So the
 * collection is the BUYER's action, after inspection, and every condition below
 * is one of the words in that sentence.
 *
 * PURE, TOTAL, NO CLOCK — the twin of `decideCreateOrder`, and it authorises
 * exactly one thing: asking a provider to collect. **It does not, and cannot,
 * make anything paid.** Only `payment.door_leg_confirmed.v1` does that, and only
 * through the frozen vault.
 *
 * THE FIVE REFUSALS, each by its own name because each needs a different true
 * sentence on her screen:
 *   · `quote_not_reserved` / `reservation_held_by_another` — the caller's claim
 *     to this order, compared byte-for-byte against the receipt, exactly as
 *     order creation compares it. The reservation may have EXPIRED by now and
 *     that is fine: it is a hold on a price before an order exists, and this
 *     order already exists. What is being checked here is IDENTITY, not liveness.
 *   · `door_leg_not_expected` — the quote is FULL_PREPAY, so nothing is owed at
 *     a door. A caller asking us to collect it is describing a different order.
 *   · `order_not_confirmed` — the checkout leg is not funded, so this order has
 *     not begun. Collecting the product leg before it would be taking the larger
 *     amount first, on an order the provider never confirmed.
 *   · `door_leg_not_due` — it is already paid (or was never due). Asking twice
 *     is refused HERE as well as by the leg's stable provider key, because two
 *     defences that fail closed independently is what a second collection costs.
 */
export function decideDoorCharge(input: {
  readonly quote: Quote | undefined;
  readonly holderRef: string;
  readonly receipt: ReservationReceipt | undefined;
  readonly orderState: string;
  readonly doorLegState: 'none' | 'due' | 'paid';
}): DoorChargeDecision {
  if (input.quote === undefined) return { ok: false, reason: 'stored_quote_unreadable' };
  if (input.receipt === undefined) return { ok: false, reason: 'quote_not_reserved' };
  if (input.receipt.holderRef !== input.holderRef) {
    return { ok: false, reason: 'reservation_held_by_another' };
  }
  const derived = requiredLegsFor(input.quote);
  if (!derived.ok) return { ok: false, reason: 'door_leg_not_expected' };
  const leg = doorLegOf(derived.legs);
  if (leg === undefined) return { ok: false, reason: 'door_leg_not_expected' };
  // ORDER OF THE LAST TWO MATTERS. `confirmed` first, so an unconfirmed order is
  // never told « already paid » — the two states need different sentences and
  // the more fundamental one has to win.
  if (input.orderState !== 'confirmed') return { ok: false, reason: 'order_not_confirmed' };
  if (input.doorLegState !== 'due') return { ok: false, reason: 'door_leg_not_due' };
  return { ok: true, leg };
}

export type ChargeAcceptance =
  | { readonly ok: true; readonly amount: number }
  | { readonly ok: false; readonly reason: 'provider_amount_divergence' };

/**
 * ═══ THE PORT'S ECHO MUST BE THE LEG'S OWN AMOUNT, OR NOTHING IS RECORDED ═══
 *
 * The charge and the durable record used to read the leg independently, so
 * changing one left the other truthful-looking; then the record was made to
 * follow the port's echo, and the record's DEPENDENCE on that echo was itself
 * untested — two edits restored the defect. This closes the family rather than
 * the instance: the two numbers are COMPARED, and a disagreement is a REFUSAL.
 *
 * A provider that answers about an amount nobody asked it for has violated its
 * contract, and there is no safe way to pick a winner between the two figures:
 * trusting the echo records a charge the mode never authorised, and trusting the
 * leg records a number the provider never saw. So neither is recorded. The
 * attempt stays `pending` — which is the honest state, because the money may
 * have moved and only a webhook can say — and the buyer is told by name.
 */
export function acceptChargeForLeg(leg: RequiredLeg, echoedAmount: number): ChargeAcceptance {
  if (echoedAmount !== leg.amount) return { ok: false, reason: 'provider_amount_divergence' };
  // The ECHO is what is returned, never the leg: one source for the recorded
  // amount, and it is the one the port was demonstrably called with.
  return { ok: true, amount: echoedAmount };
}

/** The two defence-in-depth faults that end a charge attempt without a webhook. */
export type ChargeFault = 'leg_key_not_durable' | 'provider_amount_divergence';

/**
 * ═══ A REFUSAL THAT LEAVES NO EXIT IS NOT A REFUSAL, IT IS A TRAP ═══
 * (Verifier note, round 3 — and it was this file's own round-3 code that made it.)
 *
 * Both faults above are raised AFTER the order has been persisted at
 * `payment_pending` with a pending attempt. Returning at that point stranded the
 * order forever: the retry branch requires `payment_failed`, so no command id —
 * the same one, a new one, any number of new ones — could move it, and the E2
 * reservation-release rule never fired either, because it keys on a payment
 * FAILURE and this never became one. `provider_amount_divergence` is the worse
 * of the two in money terms: it fires after the charge, so if the provider
 * collected the amount it echoed, no webhook could ever match and the buyer's
 * money sat there with no order, no refund trigger and no reconciliation case.
 *
 * So both faults END THE ATTEMPT the way every other charge failure does. That
 * is safe only because of the leg key: a retry reuses it, so re-charging cannot
 * double-collect, and if the original charge did collect, the webhook under that
 * same key still confirms the order.
 *
 * ⏳ THE VALUE IS IMPRECISE, AND THAT IS A CONTRACTS DECISION, NOT MINE.
 * `PaymentFailureReason` offers exactly three values — `charge_rejected`,
 * `charge_timeout`, `webhook_never_arrived` — and NONE describes what actually
 * happened here: no provider rejected anything, nothing timed out, and no
 * webhook was ever expected. What happened is that this service refused to
 * proceed on its own defence. `charge_rejected` is used as the DOCUMENTED
 * SAFEST DEFAULT because it is the only value that means « this attempt ended
 * and no money is claimed for it », which is the true and conservative reading.
 * A fourth value (`local_fault`, or similar) is a change to the FROZEN VAULT and
 * to `contracts/`, which is a founder stop — flagged, not taken.
 */
export function chargeFaultInput(args: {
  readonly fault: ChargeFault;
  /**
   * THE ATTEMPT ID, NEVER THE COMMAND ID — and this is load-bearing, not a
   * naming preference. The spine dedupes on `command_id`, and a buyer may send
   * one command id many times: the first fault ends attempt A, then the SAME
   * command id retries into attempt B, and a fault input derived from that
   * command id is DEDUPED — a silent no-op that leaves the order at
   * `payment_pending` with no exit, which is the very defect this function
   * exists to close, walking back in through a different door. (Found by
   * re-running the verifier's probe against this fix, not by reasoning.)
   * The attempt id is minted per attempt and cannot repeat.
   */
  readonly attemptId: string;
  readonly actor: string;
  readonly serverTime: string;
}): OrderInput {
  return {
    kind: 'fail',
    // The fault is named IN the command id, so the audit says which defence
    // ended the attempt even though the canon reason cannot.
    command_id: `ord-fault-${args.fault}-${args.attemptId}`,
    actor: args.actor,
    serverTime: args.serverTime,
    reason: 'charge_rejected',
  };
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
  | {
      readonly kind: 'provider';
      readonly event: unknown;
      /** NB-3 (E2) — the checkout leg's provider key, read from durable
       *  LEG_KEYS at the route and REPLAYED with the event: the spine refuses
       *  a webhook naming any other charge; `null` affirms no charge was ever
       *  initiated, so every webhook refuses. In the log so replay re-judges
       *  with exactly what the original judgement saw. */
      readonly expectedProviderKey?: string | null;
    }
  /**
   * SP4.2a — THE DOOR LEG'S PROVIDER TRUTH, and it is a SEPARATE KIND from
   * `provider` on purpose.
   *
   * The two legs are funded by two different webhooks carrying two different
   * canon event names (`payment.confirmed.v1` and `payment.door_leg_confirmed.v1`)
   * and the vault validates them with two different methods, against two
   * different amounts. Folding them into one input kind would mean this file
   * deciding, from the event's own payload, which leg a payment funds — and
   * « the payload tells us which leg it is » is exactly how a checkout
   * confirmation ends up marking the door leg paid.
   *
   * The kind is the routing decision, it is made at the ROUTE (two paths, two
   * handlers), and it is what replays out of the durable log.
   */
  | {
      readonly kind: 'door_provider';
      readonly event: unknown;
      /** NB-3 (E2) — the door leg's provider key, same law as `provider`'s. */
      readonly expectedProviderKey?: string | null;
    }
  /**
   * SE-LIVE-5b — Séra's settlement-eligibility signal (`delivery.validated.v1`),
   * carried into the log EXACTLY as it arrived. The spine does every check that
   * matters (canon envelope, event name, the order's own correlation,
   * idempotency by command_id, confirmed-first) and copies the obligations from
   * the frozen Quote — this kind adds nothing of its own.
   */
  | { readonly kind: 'eligibility'; readonly event: unknown }
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
  /**
   * ORDER-PAID-WIRE-1b — the three facts `order.confirmed.v1` needs that the
   * canon Quote does not carry. SERVER-READ at quote-issue time (the checkout
   * router knew `pid` and `zoneTo` from the validated request, and
   * `offerVersion` from the resolved listing) and stored beside the quote's
   * bytes in the SAME atomic write — never accepted from the order-creation
   * caller, whose route is public.
   *
   * OPTIONAL, because orders created before this slice have no record. An
   * order without it still confirms and still pays — the money path is
   * untouched — but its outbox entry is `unsendable_missing_fields`, an honest
   * state the operator can see, never a guessed payload.
   */
  readonly fulfillment?: {
    readonly productVersionId: string;
    readonly zoneTo: string;
    readonly offerVersion: string;
  };
  /**
   * LISTE-ENVIES-1 — the wishlist this order was placed FROM, when the buyer
   * arrived through a shared liste link. The ONE caller-supplied origin fact,
   * and deliberately safe as one: it is an opaque 192-bit token, charset-
   * pinned at the door, that can neither price nor route anything — its only
   * consumer is the offert outbox wire, which tells the liste's own object
   * « this pid was paid for » at the provider-confirmed transition. A wrong
   * or invented value marks nothing (the wishlist object answers `ignored`
   * for a token it never minted). OPTIONAL: most orders have no liste.
   */
  readonly listeRef?: string;
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
  | {
      readonly applied: false;
      readonly reason: string;
      /**
       * RAPPROCHEMENT-1 (E3 seed) — the vault's Contract-§6 alert, when the
       * refusal is a provider-truth-vs-local-knowledge contradiction. The DO
       * SINKS it durably (the B4 gap closed); it never rides a public answer.
       */
      readonly alert?: PlatformEvent;
    };

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
      const outcome = spine.onProviderPaymentEvent(input.event, input.expectedProviderKey);
      return outcome.applied
        ? { applied: true, duplicate: outcome.duplicate }
        : {
            applied: false,
            reason: outcome.reason,
            ...(outcome.alert !== undefined ? { alert: outcome.alert } : {}),
          };
    }
    case 'eligibility': {
      const outcome = spine.onEligibilityEvent(input.event);
      return outcome.applied
        ? { applied: true, duplicate: outcome.duplicate }
        : { applied: false, reason: outcome.reason };
    }
    /**
     * SP4.2a — THE DOOR LEG. The vault does every check that matters and this
     * case adds none of its own: correlation, idempotency, `doorLeg === 'due'`
     * (so a door confirmation for an order that owes nothing at the door
     * REFUSES and raises a reconciliation alert), the amount FRANC-EXACT
     * against the immutable Quote's `amountDueAtDelivery`, and a status that is
     * actually funded. §5.5: « Option B: … product paid by MoMo at the door
     * before custody transfer. »
     *
     * RAPPROCHEMENT-1 (E3) — THE ALERT IS DROPPED NO LONGER (audit B4 closed):
     * `onProviderDoorPaymentEvent` can return a `reconciliation.alert.v1` for
     * provider truth that contradicts local state, and it now rides this
     * outcome to the DO's durable sink — on the checkout leg's path too. The
     * money behavior is unchanged: the outcome still refuses.
     */
    case 'door_provider': {
      const outcome = spine.onProviderDoorPaymentEvent(input.event, input.expectedProviderKey);
      return outcome.applied
        ? { applied: true, duplicate: outcome.duplicate === true }
        : {
            applied: false,
            reason: outcome.reason,
            ...(outcome.alert !== null ? { alert: outcome.alert } : {}),
          };
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
  /**
   * SP4.2a — WHERE THE DOOR LEG STANDS: `none` (mode A owes nothing at the
   * door) · `due` (Option B, not yet paid) · `paid` (a signed provider webhook
   * confirmed it, franc-exact, and the vault recorded the escrow).
   *
   * A FIFTH FIELD ON A SHAPE WHOSE COMMENT SAYS « FOUR FIELDS, WHICH IS SP-I13
   * EXACTLY » — so the reason is written down. SP-I13 is about what is paid now
   * versus due at delivery, and the two amounts still say that. This says
   * whether the due one HAS BEEN PAID, which is a different question and the one
   * §6.3 turns on: « the buyer enters the drop code last, AFTER any door payment
   * is provider-confirmed. » Without it the buyer client cannot tell « you owe
   * 11 500 at the door » from « you have paid it », and a client that cannot
   * tell those apart is a client that guesses — which is how the drop code got
   * revealed on an unpaid order in SP3.3c's review.
   *
   * IT IS A STATE, NEVER AN AMOUNT, so it leaks no economics: the two figures
   * beside it are the Quote's own and were already here.
   */
  readonly doorLeg: DoorLegState;
  /**
   * VRAI-SUIVI (SP6 — « responsible next party, masked relay ») — THE JOURNEY'S
   * INSTANTS, each present ONLY once its owning domain actually said so:
   * `acceptedAt`/`readyAt` are Boutik+'s preparation facts (first-wins, the
   * same record the reseller projection already serves), `departedAt`/
   * `arrivedAt` are Séra's transit marks (first-wins per stage). ABSENT MEANS
   * « not yet », never « no » — a missing key is how her screen knows to say
   * the step has not happened rather than inventing that it has.
   *
   * WHAT IS DELIBERATELY NOT HERE (SP-I03 and the founder's privacy rulings):
   * no rider identity, no exact rider position, no franc split, no buyer
   * token, and NEVER her remise code — that code has exactly one door, and it
   * is not the poll view.
   */
  readonly acceptedAt?: string;
  readonly readyAt?: string;
  readonly departedAt?: string;
  readonly arrivedAt?: string;
  /**
   * VRAI-SUIVI — « livrée », derived EXACTLY as `/entry/gains` derives it: the
   * settlement obligations Séra's validated signal recorded exist (their
   * presence IS the fact). A state, never an amount.
   */
  readonly livree?: boolean;
}

export function toBuyerOrderView(args: {
  readonly orderId: string;
  readonly state: string;
  readonly quote: Quote;
  readonly doorLeg: DoorLegState;
  /** VRAI-SUIVI — the journey facts, OPTIONAL: only the poll projection owns
   *  all of them; the create/door-charge answers legitimately omit what has
   *  not happened by their moment. Each key crosses only when present. */
  readonly suivi?: {
    readonly acceptedAt?: string;
    readonly readyAt?: string;
    readonly departedAt?: string;
    readonly arrivedAt?: string;
    readonly livree?: boolean;
  };
}): BuyerOrderView {
  const suivi = args.suivi ?? {};
  return {
    orderId: args.orderId,
    state: args.state,
    // COPIED from the immutable Quote, never recomputed and never re-split.
    amountPaidAtCheckout: args.quote.amountPaidAtCheckout,
    amountDueAtDelivery: args.quote.amountDueAtDelivery,
    // READ OFF THE SPINE, never inferred from the amounts. « amountDueAtDelivery
    // > 0 » says what she OWES, not what she has PAID, and deriving one from the
    // other would make the door leg look unpaid forever.
    doorLeg: args.doorLeg,
    // VRAI-SUIVI — present ⇔ recorded; the allowlist idiom the whole view uses.
    ...(suivi.acceptedAt !== undefined ? { acceptedAt: suivi.acceptedAt } : {}),
    ...(suivi.readyAt !== undefined ? { readyAt: suivi.readyAt } : {}),
    ...(suivi.departedAt !== undefined ? { departedAt: suivi.departedAt } : {}),
    ...(suivi.arrivedAt !== undefined ? { arrivedAt: suivi.arrivedAt } : {}),
    ...(suivi.livree !== undefined ? { livree: suivi.livree } : {}),
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

/* ─────────────── ORDER-PAID-WIRE-1b — the preparation signal ─────────────── */

/**
 * The outcome of composing `order.confirmed.v1`. `unsendable` is a terminal,
 * OPERATOR-VISIBLE state, never a retry loop: a payload that cannot be built
 * today cannot be built tomorrow either (the missing facts are immutable
 * origin data), and a payload canon refuses is a BUG to fix, not a delivery to
 * reattempt.
 */
export type OrderConfirmedComposition =
  | { readonly ok: true; readonly event: OrderConfirmedEvent }
  | { readonly ok: false; readonly reason: 'missing_fulfillment_fields' | 'event_not_canonical' };

/**
 * Compose the canonical `order.confirmed.v1` — PURE, and validated through
 * `OrderConfirmedEventSchema.parse` BEFORE anything is stored or sent. That
 * parse is the founder's privacy rules enforced at the producer: the schema is
 * `.strict()`, so a `buyerPhone`, a supplier id, a drop code or anyone else's
 * money is UNREPRESENTABLE in what leaves this function — the canon verifier
 * named the gap where a producer skips the schema, and this producer cannot,
 * because the event object it returns IS the parse result.
 *
 * Every value is read from server-owned records: `origin` (written at order
 * creation from quote-issue-time facts), the frozen `quote` bytes, and the
 * confirm command the provider-verified transition minted. Nothing here came
 * from a caller.
 */
export function composeOrderConfirmedEvent(
  origin: OrderOrigin,
  quote: Quote,
  confirm: { readonly command_id: string; readonly serverTime: string },
  aggregateVersion: number,
): OrderConfirmedComposition {
  if (origin.fulfillment === undefined) return { ok: false, reason: 'missing_fulfillment_fields' };
  const candidate = {
    name: 'order.confirmed.v1',
    envelope: {
      command_id: confirm.command_id,
      correlation_id: origin.correlationId,
      aggregateVersion,
      actor: origin.actor,
      serverTime: confirm.serverTime,
      version: 'v1',
    },
    payload: {
      orderId: origin.orderId,
      productVersionId: origin.fulfillment.productVersionId,
      offerVersion: origin.fulfillment.offerVersion,
      paymentMode: quote.paymentMode,
      // The CONFIRMED transition's server time — one named instant (canon pin).
      paidAt: confirm.serverTime,
      zoneTo: origin.fulfillment.zoneTo,
      // B, verbatim off the frozen quote. Never recomputed.
      sellerBasePrice: quote.sellerBasePrice,
    },
  };
  const parsed = OrderConfirmedEventSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: 'event_not_canonical' };
  return { ok: true, event: parsed.data };
}

/**
 * The outbox delivery backoff — PURE so the schedule is an assertion, not a
 * comment (verifier finding: every « retries hourly » claim was untested).
 * Doubles from one minute, caps at one hour, forever: at-least-once means the
 * signal outlives any outage, and an unset intake secret drains within an hour
 * of the founder setting it.
 */
export function outboxBackoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.min(attempts, 10), 3_600_000);
}
