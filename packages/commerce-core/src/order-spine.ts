import { PlatformEventSchema, type PlatformEvent, type Quote, type RelatedPartyDecision } from '@platform/contracts';
import { LedgerRecords } from './ledger.js';
import { commissionRetenue } from './related-party.js';
import type { ReconciliationSnapshot } from './reconcile.js';
import {
  advanceOrder,
  beginJourney,
  type OrderJourney,
  type TransitionOutcome,
} from './order-machine.js';
import type { ReservationState } from './reservation.js';

/** Local failure knowledge — the webhook that never came is not an event. */
export type PaymentFailureReason = 'charge_rejected' | 'charge_timeout' | 'webhook_never_arrived';

/**
 * E2 scenario #1 safety net (Contract §6: "a reservation stays held after
 * payment failure"). The RULE is the immediate release; this alert is the
 * net under it: an order in payment_failed whose reservation is still held
 * yields a reconciliation.alert.v1. Returns null when the world is clean.
 */
export function reservationReconciliationAlert(
  spine: OrderSpine,
  reservation: ReservationState,
  args: {
    serverTime: string;
    /**
     * RESERVATION-REGLE-2 — the hold the FAILING ATTEMPT was authorized on.
     * The chain's `reservation_id` is write-once (the hold the order was born
     * with), while a retry runs on the owner's fresh hold; the caller that
     * knows which hold the attempt used names it here. Absent ⇒ the chain's.
     */
    ownReservationId?: string;
  },
): PlatformEvent | null {
  if (spine.journey.state !== 'payment_failed') return null;
  if (reservation.status !== 'reserved') return null;
  // RESERVATION-REGLE-2: the net judges THIS attempt's hold. A reservation
  // held under another id is the buyer's fresh hold after the release — a
  // healthy world, not the held-after-failure class. (The Worker feeds the
  // LIVE state in; without this line a legitimate re-hold would raise a false
  // alarm.)
  const own = args.ownReservationId ?? spine.journey.chain.reservation_id;
  if (own !== undefined && reservation.reservationId !== own) return null;
  return PlatformEventSchema.parse({
    name: 'reconciliation.alert.v1',
    envelope: {
      command_id: `recon-alert-${spine.journey.chain.quote_id}`,
      correlation_id: spine.journey.correlationId,
      aggregateVersion: spine.journey.aggregateVersion,
      actor: 'commerce-core:ops',
      serverTime: args.serverTime,
      version: '1',
    },
    payload: {
      ...spine.journey.chain,
      alert: 'reservation_held_after_payment_failure',
      reservation_id_held: reservation.reservationId,
    },
  });
}

/**
 * E1 ORDER SPINE — the consumer side of the walking skeleton (§2.3 steps
 * 6–8, 13–15). Consumes provider payment events and Séra eligibility events
 * idempotently: duplicates are absorbed on envelope.command_id, out-of-order
 * events refuse closed (the emitter redelivers), and no event can produce a
 * confirmed order whose funded checkout leg is missing or short — that
 * refusal is runtime law here and a CI gate beside it.
 */

export type SpineRefusalReason =
  | 'not_a_platform_event'
  | 'unexpected_event_name'
  | 'wrong_correlation'
  | 'out_of_order'
  | 'amount_mismatch'
  | 'unfunded_leg_status'
  | 'conflicting_escrow_for_order'
  | 'no_funded_checkout_leg'
  | 'reservation_not_confirmed'
  | 'door_leg_not_expected'
  | 'door_leg_before_checkout_leg'
  | 'supplier_ref_missing'
  /** NB-3 (E2): the webhook names a charge this order never initiated. */
  | 'attempt_mismatch'
  /** NB-3 (E2): the webhook's own order_id contradicts the chain's. */
  | 'order_mismatch'
  /**
   * GARDE-PAIEMENT-1 (RMG): an AUTHENTICATED webhook whose escrow-bound fields
   * would crash the canon `EscrowTxnSchema.parse` — an empty `collectRef` or
   * `provider`, or a `fee` that is not a non-negative integer. Before this,
   * such a body threw a ZodError out of the vault as an unnamed 500, which a
   * real aggregator retries forever. Named and refused 422 instead.
   */
  | 'malformed_payload'
  /**
   * PAYER-TOUT-1 — this order's own share in the grouped payment disagrees
   * with its own immutable Quote, or the order is not among the group's
   * parts. Both are local records contradicting each other, never provider
   * truth; refused before a franc is recorded.
   */
  | 'group_share_mismatch'
  /** RELATED-PARTY-1 (§6.5) — the appeal and the ruling, refused by name. */
  | 'nothing_to_contest'
  | 'already_contested'
  | 'nothing_to_resolve'
  | 'already_resolved'
  /** REMBOURSEMENT-1 — a refund confirmation naming no refund this order asked for. */
  | 'refund_key_unknown'
  /** REMBOURSEMENT-1 — the provider says something other than « refunded ». */
  | 'unconfirmed_refund_status'
  /** REMBOURSEMENT-1 — the ledger's refusals of a refund (see `recordRefundFromProvider`). */
  | 'no_escrow_for_refund'
  | 'refund_leg_unknown'
  | 'refund_exceeds_leg'
  | 'conflicting_refund';

export type SpineOutcome =
  | { applied: true; duplicate: boolean }
  | {
      applied: false;
      reason: SpineRefusalReason;
      /**
       * RAPPROCHEMENT-1 (E3 seed) — present ONLY when the refusal is a
       * Contract-§6 contradiction (provider truth vs local knowledge):
       * a genuine webhook after local failure, an amount contradicting the
       * immutable Quote, a foreign charge id, a conflicting confirmation.
       * Ordinary refusals (early race, malformed, misrouted) carry none.
       */
      alert?: PlatformEvent;
    };

/** WO-2.5: shop-side Option-B door-leg projection — NOT an order status. */
/**
 * RELATED-PARTY-1 (§6.5) — what one order holds about its reseller's
 * commission once Séra's validated signal recorded the obligations: the
 * decision (made ONCE), her appeal (ONE sentence, at most once, only while a
 * non-clear decision stands unresolved) and the founder's ruling (ONCE).
 */
export interface RelatedPartyAppeal {
  readonly at: string;
  readonly texte: string;
}
export interface RelatedPartyResolution {
  readonly at: string;
  readonly outcome: 'clear' | 'violation';
}
export interface RelatedPartyView {
  readonly decision: RelatedPartyDecision;
  readonly appeal?: RelatedPartyAppeal;
  readonly resolution?: RelatedPartyResolution;
}
/** The prefix every §6.5 hold on an obligation carries; the ruling releases by it. */
export const RELATED_PARTY_HOLD = 'related_party:';

export type DoorLegState = 'none' | 'due' | 'paid';

export type DoorPaymentOutcome =
  | { applied: true; duplicate: boolean; signal: PlatformEvent | null }
  | {
      applied: false;
      reason: SpineRefusalReason;
      /**
       * Item-5 alert (Contract §6 class: provider truth vs local state) — set
       * when a VALID door confirmation arrived for an order NOT door-pending.
       */
      alert: PlatformEvent | null;
    };

/**
 * GARDE-PAIEMENT-1 (RMG) — the guard's bound is EXACTLY the set of payload
 * values that would throw out of `EscrowTxnSchema.parse`, and nothing more
 * (the founder-ordered recheck killed a wider first cut that newly refused
 * values the record path had always coerced):
 *
 *   · `collectRef` / `provider`: the record call reads `String(p['x'] ?? …)`,
 *     so null/undefined take the fallback (command_id / 'sandbox-provider')
 *     and ANY other value — number, boolean, object — String()-coerces to a
 *     non-empty string, exactly as it always did. The ONE value that reaches
 *     the parse empty and throws (`min(1)`) is the empty string itself.
 *   · `fee`: a number must be a SAFE non-negative integer — canon `FcfaSchema`
 *     is zod `.int().min(0)`, and zod's `.int()` refuses 2^53 as `too_big`,
 *     while `Number.isInteger(2^53)` is true (the recheck's BLOCKER: the first
 *     cut waved unsafe integers into the throw). An ABSENT fee (undefined or
 *     JSON null) records as 0, as the record path always did.
 *
 * PORTES-FRANCAISES-1 (AUDIT-SHOP-2 F-34) — ONE WIDENING, ON PURPOSE: a fee
 * that is PRESENT and not a number (`'250'`, `true`) used to coerce to 0 at
 * the record call — a franc the provider did not say, written into a money
 * record whose law is « provider truth, copied as-is » (ledger.ts). It is now
 * `malformed_payload`: what cannot be copied is refused, never invented.
 */
function escrowPayloadMalformed(p: Record<string, unknown>): boolean {
  if (p['collectRef'] === '' || p['provider'] === '') return true;
  const fee = p['fee'];
  if (fee === undefined || fee === null) return false;
  if (typeof fee !== 'number') return true;
  return !(Number.isSafeInteger(fee) && fee >= 0);
}

/**
 * PAYER-TOUT-1 (founder ruling 2026-09-22) — the grouped payment this order
 * belongs to, as the order's own durable origin recorded it at birth: ONE
 * provider collection for several orders of one boutique, each order keeping
 * its own quote, leg, custody and refund. `parts` lists every order of the
 * group with its checkout-leg amount, ordered by orderId; `correlationId` is
 * the group's, the one the provider was charged under.
 */
export interface GroupPaymentShares {
  readonly groupId: string;
  readonly correlationId: string;
  readonly parts: readonly { readonly orderId: string; readonly amount: number }[];
}

/**
 * REMBOURSEMENT-1 (founder ruling 2026-09-23) — what Séra's refused-course
 * fact (`delivery.refused.v1`) says, read off the three payloads its custody
 * spine emits: a justified refusal at the door, a buyer's own refusal (with
 * Séra's word on whether the delivery fee is kept), a delivery check the
 * server rejected. Anything else is unreadable, and no refund is decided on it.
 */
export type RefusCourse =
  | { readonly nature: 'refus_justifie'; readonly faultClass: string }
  | { readonly nature: 'refus_acheteur'; readonly faultClass: string; readonly fraisRetenus: boolean }
  | { readonly nature: 'livraison_rejetee' };

export function lireRefusCourse(payload: unknown): RefusCourse | undefined {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const p = payload as Record<string, unknown>;
  const faute = typeof p['fault_class'] === 'string' && p['fault_class'] !== '' ? p['fault_class'] : undefined;
  if (p['rejection'] === 'valid_rejection' && faute !== undefined) return { nature: 'refus_justifie', faultClass: faute };
  if (typeof p['family'] === 'string' && faute !== undefined && typeof p['fee_retained'] === 'boolean') {
    return { nature: 'refus_acheteur', faultClass: faute, fraisRetenus: p['fee_retained'] };
  }
  if (p['result'] === 'rejected') return { nature: 'livraison_rejetee' };
  return undefined;
}

/** One paid leg's refund: which leg, against which collection, how much goes back. */
export interface LigneRemboursement {
  readonly legType: 'checkout' | 'door';
  readonly collectRef: string;
  readonly amount: number;
}

export type PlanRemboursement =
  | { readonly ok: true; readonly lignes: readonly LigneRemboursement[]; readonly retenu: number }
  | { readonly ok: false; readonly reason: 'pas_paye' | 'livraison_acceptee' };

/** A refund the order asked for, as the refund judge checks the provider's answer against it. */
export interface RemboursementAttendu extends LigneRemboursement {
  readonly refundKey: string;
}

/**
 * FRAIS-PARTAGES-1 (founder ruling 2026-09-23) — this order's share of the
 * collection's ONE provider fee: in proportion to its part, to the franc.
 * The francs the proportional floors leave over go one each to the largest
 * remainders; a tie goes to the lower order id. Every order of the group runs
 * this on the same facts (the frozen parts, the provider's one fee), so the
 * shares add up to the provider's fee exactly without any order reading
 * another's record. Exact integer arithmetic: no float ever touches a franc.
 */
export function partDesFrais(
  parts: readonly { readonly orderId: string; readonly amount: number }[],
  frais: number,
  orderId: string,
): number {
  const total = parts.reduce((s, p) => s + BigInt(p.amount), 0n);
  const f = BigInt(frais);
  const lignes = parts.map((p) => ({
    orderId: p.orderId,
    base: (f * BigInt(p.amount)) / total,
    reste: (f * BigInt(p.amount)) % total,
  }));
  const manque = f - lignes.reduce((s, l) => s + l.base, 0n);
  const servis = [...lignes]
    .sort((a, b) => (a.reste !== b.reste ? (a.reste > b.reste ? -1 : 1) : a.orderId < b.orderId ? -1 : 1))
    .slice(0, Number(manque))
    .map((l) => l.orderId);
  const mienne = lignes.find((l) => l.orderId === orderId);
  if (mienne === undefined) return 0;
  return Number(mienne.base + (servis.includes(orderId) ? 1n : 0n));
}

export class OrderSpine {
  readonly ledger = new LedgerRecords();
  private journeyState: OrderJourney;
  private readonly processedCommandIds = new Set<string>();
  private readonly quote: Quote;
  private readonly supplierRef: string;
  private orderId: string | undefined;
  private lastTransitionAt: string;
  private paymentFailure: { reason: PaymentFailureReason; at: string } | undefined;
  private stuckAlertEmitted = false;
  private supplierStuckEmitted = false;
  private doorLeg: DoorLegState = 'none';
  private doorSignal: PlatformEvent | undefined;
  private relatedParty: RelatedPartyView | undefined;

  constructor(args: {
    quote: Quote;
    supplierRef: string;
    correlationId: string;
    issueCommandId: string;
    actor: string;
    serverTime: string;
  }) {
    this.quote = args.quote;
    this.supplierRef = args.supplierRef;
    this.journeyState = beginJourney({
      correlationId: args.correlationId,
      quoteId: args.quote.id,
      command_id: args.issueCommandId,
      actor: args.actor,
      serverTime: args.serverTime,
    });
    this.lastTransitionAt = args.serverTime;
  }

  get journey(): OrderJourney {
    return this.journeyState;
  }

  /**
   * Local commands (reserve confirmation, payment initiation) advance the machine.
   * NEVER to `refunded`: money going back is provider truth, and only the refund
   * judge (`onProviderRefundEvent`) may record it — a local command that could
   * would be a refund nobody paid.
   */
  advance(cmd: {
    command_id: string;
    actor: string;
    serverTime: string;
    to: string;
    chainAdditions?: Record<string, string>;
  }): TransitionOutcome {
    if (cmd.to === 'refunded') return { ok: false, journey: this.journeyState, reason: 'out_of_order', attempted: cmd.to };
    return this.avancer(cmd);
  }

  private avancer(cmd: {
    command_id: string;
    actor: string;
    serverTime: string;
    to: string;
    chainAdditions?: Record<string, string>;
  }): TransitionOutcome {
    if (this.processedCommandIds.has(cmd.command_id)) {
      return { ok: true, journey: this.journeyState, event: this.journeyState.events.at(-1)! };
    }
    const outcome = advanceOrder(this.journeyState, cmd);
    if (outcome.ok) {
      this.journeyState = outcome.journey;
      this.processedCommandIds.add(cmd.command_id);
      this.lastTransitionAt = cmd.serverTime;
      if (cmd.chainAdditions?.['order_id']) this.orderId = cmd.chainAdditions['order_id'];
    }
    return outcome;
  }

  /**
   * E2 scenario #1 — the payment FAILED (charge refused, timed out, or the
   * webhook never arrived within the attempt window). No canon event exists
   * for provider payment failure: charge refusal/timeout is LOCAL knowledge
   * (the webhook is the only provider truth, and it never came). The machine
   * moves to the canonical payment_failed; the RESERVATION RELEASE is the
   * caller's very next act (release is the rule; the reconciliation alert is
   * the safety net — see reservationReconciliationAlert).
   */
  failPayment(cmd: {
    command_id: string;
    actor: string;
    serverTime: string;
    reason: PaymentFailureReason;
  }): TransitionOutcome {
    const outcome = this.advance({
      command_id: cmd.command_id,
      actor: cmd.actor,
      serverTime: cmd.serverTime,
      to: 'payment_failed',
    });
    if (outcome.ok) this.paymentFailure = { reason: cmd.reason, at: cmd.serverTime };
    return outcome;
  }

  get lastPaymentFailure(): { reason: PaymentFailureReason; at: string } | undefined {
    return this.paymentFailure;
  }

  /** Retry after failure — a NEW payment attempt (the machine audits the replacement). */
  retryPayment(cmd: {
    command_id: string;
    actor: string;
    serverTime: string;
    newPaymentAttemptId: string;
  }): TransitionOutcome {
    return this.advance({
      command_id: cmd.command_id,
      actor: cmd.actor,
      serverTime: cmd.serverTime,
      to: 'payment_pending',
      chainAdditions: { payment_attempt_id: cmd.newPaymentAttemptId },
    });
  }

  /**
   * Cancellation. Pre-payment (quote_issued/reserved/payment_pending/
   * payment_failed) → cancelled; the caller releases the reservation with
   * the same breath. Once money has moved (paid/confirmed) the machine
   * refuses closed with `refund_required_e3` — refund EXECUTION is the E3
   * refund/earning-reversal saga, and the buyer copy says so honestly.
   */
  cancelOrder(cmd: { command_id: string; actor: string; serverTime: string }): TransitionOutcome {
    return this.advance({
      command_id: cmd.command_id,
      actor: cmd.actor,
      serverTime: cmd.serverTime,
      to: 'cancelled',
    });
  }

  /**
   * STUCK-SAGA SEED (Contract E2 exit: "DLQ + stuck-saga detection live").
   * Detection only — recovery is runbook work. payment_pending older than
   * the versioned TTL emits saga.stuck.v1 exactly once.
   */
  checkStuckSaga(nowIso: string, policy: { version: string; paymentPendingTtlMs: number }): PlatformEvent | null {
    if (this.stuckAlertEmitted) return null;
    if (this.journeyState.state !== 'payment_pending') return null;
    const age = Date.parse(nowIso) - Date.parse(this.lastTransitionAt);
    if (age <= policy.paymentPendingTtlMs) return null;
    this.stuckAlertEmitted = true;
    return PlatformEventSchema.parse({
      name: 'saga.stuck.v1',
      envelope: {
        command_id: `saga-stuck-${this.journeyState.chain.quote_id}`,
        correlation_id: this.journeyState.correlationId,
        aggregateVersion: this.journeyState.aggregateVersion,
        actor: 'commerce-core:ops',
        serverTime: nowIso,
        version: '1',
      },
      payload: {
        ...this.journeyState.chain,
        status: this.journeyState.state,
        stuck_in: 'payment_pending',
        pending_since: this.lastTransitionAt,
        ttl_policy_version: policy.version,
      },
    });
  }

  /**
   * RESERVATION-REGLE-2 (Contract E2 scenario « paid-order-no-supplier-
   * decision »; AUDIT-SHOP-2 F-96). An order in this domain never RESTS in
   * `paid`: the confirm lands in the same batch as the webhook that paid it.
   * What can stall is the supplier ever LEARNING — the order.confirmed.v1
   * wire to Boutik+ still `pending` past the TTL, or `unsendable` at any age
   * (nothing retries what can never send). Detection only, once; the caller
   * owns the wire's status and its clock, as it owns the outbox.
   */
  checkStuckSupplierNotification(
    nowIso: string,
    policy: { version: string; ttlMs: number },
    notification: { status: 'pending' | 'unsendable'; since: string },
  ): PlatformEvent | null {
    if (this.supplierStuckEmitted) return null;
    if (this.journeyState.state !== 'confirmed') return null;
    if (notification.status === 'pending' && Date.parse(nowIso) - Date.parse(notification.since) <= policy.ttlMs) {
      return null;
    }
    this.supplierStuckEmitted = true;
    return PlatformEventSchema.parse({
      name: 'saga.stuck.v1',
      envelope: {
        command_id: `saga-stuck-supplier-${this.journeyState.chain.quote_id}`,
        correlation_id: this.journeyState.correlationId,
        aggregateVersion: this.journeyState.aggregateVersion,
        actor: 'commerce-core:ops',
        serverTime: nowIso,
        version: '1',
      },
      payload: {
        ...this.journeyState.chain,
        status: this.journeyState.state,
        stuck_in: 'confirmed',
        blocked_on: 'supplier_notification',
        notification_status: notification.status,
        pending_since: notification.since,
        ttl_policy_version: policy.version,
      },
    });
  }

  /**
   * Provider webhook (the only payment truth). Idempotent on
   * envelope.command_id; validates the confirmed amount against the
   * immutable Quote to the franc; records the EscrowTxn; advances to paid.
   *
   * NB-3 (E2, deferred at E1 and journalled) — THE WEBHOOK MUST NAME THE
   * CHARGE THIS ORDER INITIATED. `expectedProviderKey` is the LEG's provider
   * key — the id the provider was actually charged with, stable across every
   * retry of the leg (which is why it, and not the chain's per-attempt audit
   * id, is what the webhook echoes). When the caller provides it, a payload
   * naming any other id — or naming none — refuses closed. `null` means the
   * caller affirms NO charge was ever initiated on the leg: every webhook for
   * it refuses, because none can be genuine. A payload
   * `order_id` contradicting the chain's refuses unconditionally; correlation
   * already binds the journey, so this is a contradiction check, not a
   * presence requirement — the certified provider DOES send order_id on both
   * legs (payment-provider-mock echoes the charge request's), so in practice
   * a genuine webhook always faces the check; absence alone never refuses.
   */
  onProviderPaymentEvent(raw: unknown, expectedProviderKey?: string | null): SpineOutcome {
    const parsed = PlatformEventSchema.safeParse(raw);
    if (!parsed.success) return { applied: false, reason: 'not_a_platform_event' };
    const event = parsed.data;
    if (event.name !== 'payment.checkout_leg_confirmed.v1') {
      return { applied: false, reason: 'unexpected_event_name' };
    }
    if (event.envelope.correlation_id !== this.journeyState.correlationId) {
      return { applied: false, reason: 'wrong_correlation' };
    }
    if (this.processedCommandIds.has(event.envelope.command_id)) {
      return { applied: true, duplicate: true };
    }
    if (this.journeyState.state !== 'payment_pending' || this.orderId === undefined) {
      // RAPPROCHEMENT-1: a webhook NAMING OUR CHARGE that lands after this
      // order LOCALLY failed is provider truth contradicting local failure
      // knowledge (Contract §6) — the refusal stands (E3's refund saga owns
      // what follows), but it now carries the alert instead of silence. The
      // early pre-order race stays quiet: that is the provider's ordinary
      // at-least-once behavior, not a contradiction.
      const late = event.payload as Record<string, unknown>;
      if (
        (this.journeyState.state === 'payment_failed' || this.journeyState.state === 'cancelled') &&
        this.paymentFailure !== undefined &&
        this.checkWebhookIds(late, expectedProviderKey) === null
      ) {
        return {
          applied: false,
          reason: 'out_of_order',
          alert: this.reconAlert('genuine_webhook_after_local_failure', event, {
            leg: 'checkout',
            local_state: this.journeyState.state,
            local_failure_reason: this.paymentFailure.reason,
            local_failure_at: this.paymentFailure.at,
            provider_amount: typeof late['amount'] === 'number' ? late['amount'] : null,
          }),
        };
      }
      // The REACHABLE double-charge signal (E3 verifier MAJOR): a rival
      // confirmation — fresh command_id, OUR charge's ids — arriving after
      // the leg already funded. A redelivery of the genuine webhook carries
      // the SAME command_id and was absorbed above, so what reaches here
      // naming our charge on a paid order is a confirmation that should not
      // exist twice. The refusal stands; the alert is the point.
      if (
        (this.journeyState.state === 'paid' || this.journeyState.state === 'confirmed') &&
        this.checkWebhookIds(late, expectedProviderKey) === null
      ) {
        return {
          applied: false,
          reason: 'out_of_order',
          alert: this.reconAlert('conflicting_provider_confirmation', event, {
            leg: 'checkout',
            local_state: this.journeyState.state,
          }),
        };
      }
      return { applied: false, reason: 'out_of_order' };
    }

    const p = event.payload as Record<string, unknown>;
    const idCheck = this.checkWebhookIds(p, expectedProviderKey);
    if (idCheck !== null) {
      return {
        applied: false,
        reason: idCheck,
        alert: this.reconAlert('webhook_names_foreign_charge', event, {
          leg: 'checkout',
          refusal: idCheck,
          payload_attempt_id: typeof p['payment_attempt_id'] === 'string' ? p['payment_attempt_id'] : null,
          payload_order_id: typeof p['order_id'] === 'string' ? p['order_id'] : null,
        }),
      };
    }
    const amount = p['amount'];
    const status = p['status'];
    // PER MODE by construction (§5.5): amountPaidAtCheckout is buyerTotal
    // under FULL_PREPAY and exactly D under Option B — the pinned waterfall
    // wrote it into the immutable Quote; the checkout leg must equal it.
    if (typeof amount !== 'number' || amount !== this.quote.amountPaidAtCheckout) {
      return {
        applied: false,
        reason: 'amount_mismatch',
        alert: this.reconAlert('provider_amount_contradicts_quote', event, {
          leg: 'checkout',
          provider_amount: typeof amount === 'number' ? amount : null,
          expected_amount: this.quote.amountPaidAtCheckout,
        }),
      };
    }
    if (status !== 'held' && status !== 'captured') {
      return { applied: false, reason: 'unfunded_leg_status' };
    }
    // GARDE-PAIEMENT-1 — a present-but-broken escrow field is refused BY NAME
    // before the canon parse, not thrown as an unnamed 500 the provider retries.
    if (escrowPayloadMalformed(p)) {
      return { applied: false, reason: 'malformed_payload' };
    }

    const recorded = this.ledger.recordEscrowFromProvider({
      orderId: this.orderId,
      provider: String(p['provider'] ?? 'sandbox-provider'),
      paymentAttemptId: String(p['payment_attempt_id'] ?? ''),
      legType: 'checkout',
      collectRef: String(p['collectRef'] ?? event.envelope.command_id),
      // Provider truth, copied — `amount` is the webhook's own figure, already
      // proven equal to the immutable Quote's amountPaidAtCheckout above.
      amount,
      fee: typeof p['fee'] === 'number' ? p['fee'] : 0,
      status,
    });
    if (!recorded.ok) {
      // A DIFFERENT confirmation for a leg already funded — double-charge
      // territory, the loudest Contract-§6 class there is.
      return {
        applied: false,
        reason: recorded.reason,
        alert: this.reconAlert('conflicting_provider_confirmation', event, {
          leg: 'checkout',
          refusal: recorded.reason,
        }),
      };
    }

    const advanced = this.advance({
      command_id: event.envelope.command_id,
      actor: event.envelope.actor,
      serverTime: event.envelope.serverTime,
      to: 'paid',
    });
    if (!advanced.ok) return { applied: false, reason: 'out_of_order' };
    return { applied: true, duplicate: false };
  }

  /**
   * PAYER-TOUT-1 — the provider's confirmation of a GROUPED checkout
   * collection: one charge, under the group's own correlation and provider
   * key, covering the checkout leg of every order in `groupe.parts`. The same
   * webhook is handed to each order of the group; each order judges it here
   * against its OWN records and funds its OWN leg only.
   *
   * The checks are the single-order twin's, re-aimed at the group: canon
   * envelope, event name, the GROUP's correlation, idempotency on command_id,
   * `payment_pending`, the group's provider key, a payload `order_id` that may
   * only name the group, the provider amount equal TO THE FRANC to the sum of
   * the parts, this order among the parts with a share equal to its own
   * Quote's `amountPaidAtCheckout`, a funded status. The escrow records this
   * order's share — copied from the immutable Quote, which is proven to be
   * one term of a total the provider itself stated.
   *
   * THE FEE (FRAIS-PARTAGES-1, founder ruling 2026-09-23): the provider
   * states ONE fee for the one collection; each order records its share of
   * it in proportion to its part, to the franc (`partDesFrais` — largest
   * remainder, a tie to the lower order id), so the group's records sum to
   * exactly the provider's figure — never N times, never a franc lost.
   */
  onGroupProviderPaymentEvent(
    raw: unknown,
    expectedProviderKey: string | null,
    groupe: GroupPaymentShares,
  ): SpineOutcome {
    const parsed = PlatformEventSchema.safeParse(raw);
    if (!parsed.success) return { applied: false, reason: 'not_a_platform_event' };
    const event = parsed.data;
    if (event.name !== 'payment.checkout_leg_confirmed.v1') {
      return { applied: false, reason: 'unexpected_event_name' };
    }
    if (event.envelope.correlation_id !== groupe.correlationId) {
      return { applied: false, reason: 'wrong_correlation' };
    }
    if (this.processedCommandIds.has(event.envelope.command_id)) {
      return { applied: true, duplicate: true };
    }
    if (this.journeyState.state !== 'payment_pending' || this.orderId === undefined) {
      // The twin's two Contract-§6 alerts, same conditions, the group's ids.
      const late = event.payload as Record<string, unknown>;
      if (
        (this.journeyState.state === 'payment_failed' || this.journeyState.state === 'cancelled') &&
        this.paymentFailure !== undefined &&
        this.checkGroupWebhookIds(late, expectedProviderKey, groupe) === null
      ) {
        return {
          applied: false,
          reason: 'out_of_order',
          alert: this.reconAlert('genuine_webhook_after_local_failure', event, {
            leg: 'checkout',
            group_id: groupe.groupId,
            local_state: this.journeyState.state,
            local_failure_reason: this.paymentFailure.reason,
            local_failure_at: this.paymentFailure.at,
            provider_amount: typeof late['amount'] === 'number' ? late['amount'] : null,
          }),
        };
      }
      if (
        (this.journeyState.state === 'paid' || this.journeyState.state === 'confirmed') &&
        this.checkGroupWebhookIds(late, expectedProviderKey, groupe) === null
      ) {
        return {
          applied: false,
          reason: 'out_of_order',
          alert: this.reconAlert('conflicting_provider_confirmation', event, {
            leg: 'checkout',
            group_id: groupe.groupId,
            local_state: this.journeyState.state,
          }),
        };
      }
      return { applied: false, reason: 'out_of_order' };
    }

    const p = event.payload as Record<string, unknown>;
    const idCheck = this.checkGroupWebhookIds(p, expectedProviderKey, groupe);
    if (idCheck !== null) {
      return {
        applied: false,
        reason: idCheck,
        alert: this.reconAlert('webhook_names_foreign_charge', event, {
          leg: 'checkout',
          group_id: groupe.groupId,
          refusal: idCheck,
          payload_attempt_id: typeof p['payment_attempt_id'] === 'string' ? p['payment_attempt_id'] : null,
          payload_order_id: typeof p['order_id'] === 'string' ? p['order_id'] : null,
        }),
      };
    }

    const own = groupe.parts.find((part) => part.orderId === this.orderId);
    if (own === undefined || own.amount !== this.quote.amountPaidAtCheckout) {
      return { applied: false, reason: 'group_share_mismatch' };
    }
    let total = 0;
    for (const part of groupe.parts) {
      if (!Number.isSafeInteger(part.amount) || part.amount <= 0) {
        return { applied: false, reason: 'group_share_mismatch' };
      }
      total += part.amount;
    }
    if (!Number.isSafeInteger(total)) return { applied: false, reason: 'group_share_mismatch' };

    const amount = p['amount'];
    const status = p['status'];
    if (typeof amount !== 'number' || amount !== total) {
      return {
        applied: false,
        reason: 'amount_mismatch',
        alert: this.reconAlert('provider_amount_contradicts_quote', event, {
          leg: 'checkout',
          group_id: groupe.groupId,
          provider_amount: typeof amount === 'number' ? amount : null,
          expected_amount: total,
        }),
      };
    }
    if (status !== 'held' && status !== 'captured') {
      return { applied: false, reason: 'unfunded_leg_status' };
    }
    if (escrowPayloadMalformed(p)) {
      return { applied: false, reason: 'malformed_payload' };
    }

    const recorded = this.ledger.recordEscrowFromProvider({
      orderId: this.orderId,
      provider: String(p['provider'] ?? 'sandbox-provider'),
      paymentAttemptId: String(p['payment_attempt_id'] ?? ''),
      legType: 'checkout',
      collectRef: String(p['collectRef'] ?? event.envelope.command_id),
      // This order's share, copied from its immutable Quote — proven above to
      // be its own part of the total the provider stated to the franc.
      amount: this.quote.amountPaidAtCheckout,
      // FRAIS-PARTAGES-1 — its share of the collection's one fee, not the whole of it.
      fee: typeof p['fee'] === 'number' ? partDesFrais(groupe.parts, p['fee'], this.orderId) : 0,
      status,
    });
    if (!recorded.ok) {
      return {
        applied: false,
        reason: recorded.reason,
        alert: this.reconAlert('conflicting_provider_confirmation', event, {
          leg: 'checkout',
          group_id: groupe.groupId,
          refusal: recorded.reason,
        }),
      };
    }

    const advanced = this.advance({
      command_id: event.envelope.command_id,
      actor: event.envelope.actor,
      serverTime: event.envelope.serverTime,
      to: 'paid',
    });
    if (!advanced.ok) return { applied: false, reason: 'out_of_order' };
    return { applied: true, duplicate: false };
  }

  /**
   * Order confirmation — NO CONFIRMED ORDER WITHOUT FUNDED LEGS (SP3.2,
   * SP-I13). The runtime check inspects the recorded EscrowTxn: a checkout
   * leg with status held|captured covering amountPaidAtCheckout exactly.
   */
  confirmOrder(cmd: { command_id: string; actor: string; serverTime: string }): SpineOutcome {
    if (this.processedCommandIds.has(cmd.command_id)) return { applied: true, duplicate: true };
    if (this.journeyState.state !== 'paid' || this.orderId === undefined) {
      return { applied: false, reason: 'out_of_order' };
    }
    const escrow = this.ledger.escrowFor(this.orderId);
    const funded = escrow?.paymentLegs.some(
      (leg) =>
        leg.legType === 'checkout' &&
        (leg.status === 'held' || leg.status === 'captured') &&
        leg.amount === this.quote.amountPaidAtCheckout,
    );
    if (!funded) return { applied: false, reason: 'no_funded_checkout_leg' };

    const advanced = this.advance({ ...cmd, to: 'confirmed' });
    if (!advanced.ok) return { applied: false, reason: 'out_of_order' };
    // WO-2.5: an Option-B order confirms on its D-funded checkout leg with
    // the PRODUCT still due at the door — the door projection opens here.
    if (this.quote.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') {
      this.doorLeg = 'due';
    }
    return { applied: true, duplicate: false };
  }

  /** WO-2.5: the shop-side door-leg projection (never an order status). */
  get doorLegState(): DoorLegState {
    return this.doorLeg;
  }

  /** The one door-paid signal, if the provider has confirmed the door leg. */
  get doorPaidSignal(): PlatformEvent | undefined {
    return this.doorSignal;
  }

  /**
   * WO-2.5 — the provider's DOOR-LEG confirmation (§5.5 Option B: "product
   * paid by MoMo at the door before custody transfer"; provider webhooks are
   * the ONLY payment truth). Validates the confirmed amount against the
   * immutable Quote's amountDueAtDelivery to the franc, appends the door leg
   * to the EscrowTxn (amounts copied), advances the door projection, and
   * emits THE door-paid signal — an enveloped order.status_projection_updated.v1
   * carrying the chain ids, which Séra's inspection flow consumes (WO-2.4).
   * There is NO other path to this signal: no local assertion, no rider
   * claim, no screenshot — only this consumer, only after validation.
   *
   * Item 5 (Contract §6 "provider truth vs local state"): a VALID door
   * confirmation arriving for an order NOT door-pending refuses AND carries
   * a reconciliation.alert.v1.
   */
  onProviderDoorPaymentEvent(raw: unknown, expectedProviderKey?: string | null): DoorPaymentOutcome {
    const parsed = PlatformEventSchema.safeParse(raw);
    if (!parsed.success) return { applied: false, reason: 'not_a_platform_event', alert: null };
    const event = parsed.data;
    if (event.name !== 'payment.door_leg_confirmed.v1') {
      return { applied: false, reason: 'unexpected_event_name', alert: null };
    }
    if (event.envelope.correlation_id !== this.journeyState.correlationId) {
      return { applied: false, reason: 'wrong_correlation', alert: null };
    }
    if (this.processedCommandIds.has(event.envelope.command_id)) {
      return { applied: true, duplicate: true, signal: this.doorSignal ?? null };
    }
    // Door-pending means: an Option-B order, confirmed, door leg still due.
    if (this.doorLeg !== 'due' || this.orderId === undefined) {
      return {
        applied: false,
        reason: 'door_leg_not_expected',
        alert: this.doorMismatchAlert(event),
      };
    }

    const p = event.payload as Record<string, unknown>;
    // NB-3 (E2) — same id cross-check as the checkout twin, same closed
    // refusal; RAPPROCHEMENT-1 — same Contract-§6 alerts as the twin too.
    const idCheck = this.checkWebhookIds(p, expectedProviderKey);
    if (idCheck !== null) {
      return {
        applied: false,
        reason: idCheck,
        alert: this.reconAlert('webhook_names_foreign_charge', event, {
          leg: 'door',
          refusal: idCheck,
          payload_attempt_id: typeof p['payment_attempt_id'] === 'string' ? p['payment_attempt_id'] : null,
          payload_order_id: typeof p['order_id'] === 'string' ? p['order_id'] : null,
        }),
      };
    }
    const amount = p['amount'];
    const status = p['status'];
    // §5.5 Option B: amountDueAtDelivery == productSubtotal — franc-exact.
    if (typeof amount !== 'number' || amount !== this.quote.amountDueAtDelivery) {
      return {
        applied: false,
        reason: 'amount_mismatch',
        alert: this.reconAlert('provider_amount_contradicts_quote', event, {
          leg: 'door',
          provider_amount: typeof amount === 'number' ? amount : null,
          expected_amount: this.quote.amountDueAtDelivery,
        }),
      };
    }
    if (status !== 'held' && status !== 'captured') {
      return { applied: false, reason: 'unfunded_leg_status', alert: null };
    }
    // GARDE-PAIEMENT-1 — same guard on the door leg (alert:null: a malformed
    // body is a producer bug to fix, not a provider-truth contradiction to alert).
    if (escrowPayloadMalformed(p)) {
      return { applied: false, reason: 'malformed_payload', alert: null };
    }

    const recorded = this.ledger.recordEscrowFromProvider({
      orderId: this.orderId,
      provider: String(p['provider'] ?? 'sandbox-provider'),
      paymentAttemptId: String(p['payment_attempt_id'] ?? ''),
      legType: 'door',
      collectRef: String(p['collectRef'] ?? event.envelope.command_id),
      // Provider truth, copied — proven equal to amountDueAtDelivery above.
      amount,
      fee: typeof p['fee'] === 'number' ? p['fee'] : 0,
      status,
    });
    if (!recorded.ok) {
      return {
        applied: false,
        reason: recorded.reason,
        alert: this.reconAlert('conflicting_provider_confirmation', event, {
          leg: 'door',
          refusal: recorded.reason,
        }),
      };
    }

    this.doorLeg = 'paid';
    this.processedCommandIds.add(event.envelope.command_id);
    this.doorSignal = PlatformEventSchema.parse({
      name: 'order.status_projection_updated.v1',
      envelope: {
        command_id: `door-signal-${this.orderId}`,
        correlation_id: this.journeyState.correlationId,
        aggregateVersion: this.journeyState.aggregateVersion,
        actor: 'commerce-core:door',
        serverTime: event.envelope.serverTime,
        version: '1',
      },
      payload: {
        ...this.journeyState.chain,
        status: this.journeyState.state,
        door_leg: 'paid',
        door_collect_ref: String(p['collectRef'] ?? event.envelope.command_id),
        // Copied from the immutable Quote (already proven == provider amount).
        amount_due_at_delivery_confirmed: this.quote.amountDueAtDelivery,
        provider: String(p['provider'] ?? 'sandbox-provider'),
      },
    });
    return { applied: true, duplicate: false, signal: this.doorSignal };
  }

  /**
   * NB-3 (E2) — the shared id cross-check both webhook consumers run before a
   * single franc is recorded. Returns the refusal, or null when the ids hold.
   */
  private checkWebhookIds(
    p: Record<string, unknown>,
    // `null` is the caller AFFIRMING no charge was ever initiated on this leg
    // — no payload id can match it, so every webhook refuses. Deliberately
    // checked AFTER the state gates, so the truer refusal names still win
    // (`out_of_order` stays a retryable 409 for an early redelivery,
    // `door_leg_not_expected` for a mode the leg does not exist in).
    expectedProviderKey: string | null | undefined,
  ): 'attempt_mismatch' | 'order_mismatch' | null {
    if (expectedProviderKey !== undefined && p['payment_attempt_id'] !== expectedProviderKey) {
      return 'attempt_mismatch';
    }
    const payloadOrder = p['order_id'];
    if (
      typeof payloadOrder === 'string' &&
      payloadOrder !== '' &&
      this.orderId !== undefined &&
      payloadOrder !== this.orderId
    ) {
      return 'order_mismatch';
    }
    return null;
  }

  /**
   * REMBOURSEMENT-1 (founder ruling 2026-09-23) — WHAT GOES BACK, decided from
   * this order's own records only: the legs the provider funded (the ledger),
   * the delivery fee its immutable Quote names, and Séra's word on fault.
   * Every paid leg is refunded in full, except that a buyer's refusal whose fee
   * Séra kept leaves D on the checkout leg (Option B: that leg IS D, so only a
   * paid door leg goes back). Nothing is refunded before the money moved, and
   * nothing after acceptance: an order with settlement obligations was
   * delivered and accepted (§6.3 finality). Asked again once `refunded`, it
   * answers for a door leg the provider confirmed AFTER the refusal (a charge
   * already in flight at the door) — the caller refunds the legs it lacks.
   */
  decideRefund(refus: RefusCourse): PlanRemboursement {
    const escrow = this.orderId === undefined ? undefined : this.ledger.escrowFor(this.orderId);
    const etat = this.journeyState.state;
    if (escrow === undefined || (etat !== 'paid' && etat !== 'confirmed' && etat !== 'refunded')) {
      return { ok: false, reason: 'pas_paye' };
    }
    if (this.ledger.obligationsFor(this.orderId!).length > 0) return { ok: false, reason: 'livraison_acceptee' };
    const garde = refus.nature === 'refus_acheteur' && refus.fraisRetenus ? this.quote.deliveryFee : 0;
    let retenu = 0;
    const lignes: LigneRemboursement[] = [];
    for (const leg of escrow.paymentLegs) {
      const garde_ici = leg.legType === 'checkout' ? Math.min(garde, leg.amount) : 0;
      retenu += garde_ici;
      if (leg.amount - garde_ici > 0) {
        lignes.push({ legType: leg.legType, collectRef: leg.collectRef, amount: leg.amount - garde_ici });
      }
    }
    return { ok: true, lignes, retenu };
  }

  /**
   * REMBOURSEMENT-1 — THE PROVIDER'S REFUND TRUTH, judged like a payment's:
   * the order's own correlation, deduped on the envelope, a refund key this
   * order asked for (`attendus`, replayed from the log with the event), the
   * amount to the franc, the collection it was taken from, a « refunded »
   * status. Recorded in the ledger; the order becomes `refunded` only when
   * every refund it asked for is confirmed — never on a local command.
   */
  onProviderRefundEvent(raw: unknown, attendus: readonly RemboursementAttendu[]): SpineOutcome {
    const parsed = PlatformEventSchema.safeParse(raw);
    if (!parsed.success) return { applied: false, reason: 'not_a_platform_event' };
    const event = parsed.data;
    if (event.name !== 'payment.refund_confirmed.v1') return { applied: false, reason: 'unexpected_event_name' };
    if (event.envelope.correlation_id !== this.journeyState.correlationId) {
      return { applied: false, reason: 'wrong_correlation' };
    }
    if (this.processedCommandIds.has(event.envelope.command_id)) return { applied: true, duplicate: true };
    const p = event.payload as Record<string, unknown>;
    const key = p['refund_key'];
    const attendu = attendus.find((a) => a.refundKey === key);
    if (attendu === undefined || this.orderId === undefined) {
      return {
        applied: false,
        reason: 'refund_key_unknown',
        alert: this.reconAlert('webhook_names_foreign_refund', event, {
          payload_refund_key: typeof key === 'string' ? key : null,
        }),
      };
    }
    const ref = p['order_id'];
    if (typeof ref === 'string' && ref !== '' && ref !== this.orderId) return { applied: false, reason: 'order_mismatch' };
    const etat = this.journeyState.state;
    if (etat !== 'paid' && etat !== 'confirmed' && etat !== 'refunded') return { applied: false, reason: 'out_of_order' };
    const amount = p['amount'];
    if (typeof amount !== 'number' || amount !== attendu.amount) {
      return {
        applied: false,
        reason: 'amount_mismatch',
        alert: this.reconAlert('provider_refund_contradicts_request', event, {
          leg: attendu.legType,
          provider_amount: typeof amount === 'number' ? amount : null,
          expected_amount: attendu.amount,
        }),
      };
    }
    if (p['collectRef'] !== attendu.collectRef) return { applied: false, reason: 'refund_leg_unknown' };
    if (p['status'] !== 'refunded') return { applied: false, reason: 'unconfirmed_refund_status' };
    const fee = p['fee'];
    if (fee !== undefined && fee !== null && !(typeof fee === 'number' && Number.isSafeInteger(fee) && fee >= 0)) {
      return { applied: false, reason: 'malformed_payload' };
    }
    const recorded = this.ledger.recordRefundFromProvider({
      orderId: this.orderId,
      legType: attendu.legType,
      collectRef: attendu.collectRef,
      refundKey: attendu.refundKey,
      amount,
      fee: typeof fee === 'number' ? fee : 0,
    });
    if (!recorded.ok) {
      return {
        applied: false,
        reason: recorded.reason,
        alert: this.reconAlert('conflicting_provider_refund', event, { leg: attendu.legType, refusal: recorded.reason }),
      };
    }
    if (recorded.replay) {
      this.processedCommandIds.add(event.envelope.command_id);
      return { applied: true, duplicate: true };
    }
    const confirmes = new Set(this.ledger.refundsFor(this.orderId).map((r) => r.refundKey));
    if (etat !== 'refunded' && attendus.every((a) => confirmes.has(a.refundKey))) {
      const advanced = this.avancer({
        command_id: event.envelope.command_id,
        actor: event.envelope.actor,
        serverTime: event.envelope.serverTime,
        to: 'refunded',
      });
      if (!advanced.ok) return { applied: false, reason: 'out_of_order' };
    } else {
      this.processedCommandIds.add(event.envelope.command_id);
    }
    return { applied: true, duplicate: false };
  }

  /**
   * PAYER-TOUT-1 — the grouped twin of `checkWebhookIds`: the key is the
   * group's, and the payload's `order_id` — the merchant reference the
   * provider was charged with — may only name the GROUP.
   */
  private checkGroupWebhookIds(
    p: Record<string, unknown>,
    expectedProviderKey: string | null,
    groupe: GroupPaymentShares,
  ): 'attempt_mismatch' | 'order_mismatch' | null {
    if (p['payment_attempt_id'] !== expectedProviderKey) return 'attempt_mismatch';
    const ref = p['order_id'];
    if (typeof ref === 'string' && ref !== '' && ref !== groupe.groupId) return 'order_mismatch';
    return null;
  }

  /**
   * RAPPROCHEMENT-1 (E3 seed) — the ONE mint for Contract-§6 refusal alerts:
   * provider truth contradicting local knowledge. Deterministic per causing
   * webhook (`recon-whk-${its command_id}`), so a redelivered refusal re-mints
   * the SAME alert and the durable sink dedupes instead of counting. The
   * `whk`/`door`/`pass` namespaces are mutually non-prefixing ON PURPOSE
   * (verifier MINOR): the causing command_id is attacker-influenced, and a
   * crafted one must never be able to occupy ANOTHER class's dedupe key. Every
   * figure in the payload is COPIED (Ten Laws #1/#2) — from the webhook, the
   * immutable Quote, or recorded local knowledge — never computed here.
   */
  private reconAlert(scenario: string, cause: PlatformEvent, extra: Record<string, unknown>): PlatformEvent {
    return PlatformEventSchema.parse({
      name: 'reconciliation.alert.v1',
      envelope: {
        command_id: `recon-whk-${cause.envelope.command_id}`,
        correlation_id: this.journeyState.correlationId,
        aggregateVersion: this.journeyState.aggregateVersion,
        actor: 'commerce-core:ops',
        serverTime: cause.envelope.serverTime,
        version: '1',
      },
      payload: {
        ...this.journeyState.chain,
        alert: scenario,
        provider_command_id: cause.envelope.command_id,
        ...extra,
      },
    });
  }

  /**
   * RAPPROCHEMENT-1 — everything `reconcileOrder` compares, read from the one
   * replayed truth. INTERNAL ONLY: the snapshot carries the full immutable
   * Quote and the money records; it may never reach a buyer surface (SP-I03).
   */
  reconciliationSnapshot(): ReconciliationSnapshot {
    return {
      orderId: this.orderId,
      correlationId: this.journeyState.correlationId,
      aggregateVersion: this.journeyState.aggregateVersion,
      state: this.journeyState.state,
      doorLeg: this.doorLeg,
      quote: this.quote,
      supplierRef: this.supplierRef,
      escrow: this.orderId === undefined ? undefined : this.ledger.escrowFor(this.orderId),
      obligations: this.orderId === undefined ? [] : this.ledger.obligationsFor(this.orderId),
    };
  }

  /** Contract §6 alert: provider door truth contradicting local state. */
  private doorMismatchAlert(event: PlatformEvent): PlatformEvent {
    return PlatformEventSchema.parse({
      name: 'reconciliation.alert.v1',
      envelope: {
        command_id: `recon-door-${event.envelope.command_id}`,
        correlation_id: this.journeyState.correlationId,
        aggregateVersion: this.journeyState.aggregateVersion,
        actor: 'commerce-core:ops',
        serverTime: event.envelope.serverTime,
        version: '1',
      },
      payload: {
        ...this.journeyState.chain,
        alert: 'door_confirmation_without_door_pending_order',
        local_state: this.journeyState.state,
        local_door_leg: this.doorLeg,
        payment_mode: this.quote.paymentMode,
        provider_command_id: event.envelope.command_id,
      },
    });
  }

  /**
   * Séra settlement-eligibility signal (§2.3 step 13) → exactly two
   * SettlementObligations copied from the Quote (step 14). Idempotent;
   * refuses closed before confirmation.
   */
  onEligibilityEvent(raw: unknown): SpineOutcome {
    const parsed = PlatformEventSchema.safeParse(raw);
    if (!parsed.success) return { applied: false, reason: 'not_a_platform_event' };
    const event = parsed.data;
    if (event.name !== 'delivery.validated.v1') {
      return { applied: false, reason: 'unexpected_event_name' };
    }
    if (event.envelope.correlation_id !== this.journeyState.correlationId) {
      return { applied: false, reason: 'wrong_correlation' };
    }
    if (this.processedCommandIds.has(event.envelope.command_id)) {
      return { applied: true, duplicate: true };
    }
    if (this.journeyState.state !== 'confirmed' || this.orderId === undefined) {
      return { applied: false, reason: 'out_of_order' };
    }
    // SE-LIVE-5b — THE SIGNAL CARRIES THE SUPPLIER, exactly as OrderOrigin's
    // own comment demanded when it left `supplierRef` empty: the storefront
    // domain never learns a supplier, but Séra's custody chain HOLDS one (it
    // named `seller:{supplierId}` in every transition). An event without one
    // falls back to the constructor's ref, so pre-5b fixtures keep their
    // meaning; it is never invented here.
    const payloadSupplier = (event.payload as Record<string, unknown>)['supplier_ref'];
    const supplierRef =
      typeof payloadSupplier === 'string' && payloadSupplier !== '' ? payloadSupplier : this.supplierRef;
    // §5.6 money integrity (audit G1): NEVER record a settlement obligation to
    // an empty payee. An order that never learned a supplier (OrderOrigin's
    // `supplierRef` is `''` by design) and a signal that omits `supplier_ref`
    // would name party `supplier:` — a payout to nobody. Refuse; the signal is
    // not consumed, so Séra's redelivery WITH the ref converges. The Worker
    // intake also refuses a supplier-less event, so this is the core backstop.
    if (supplierRef === '') {
      return { applied: false, reason: 'supplier_ref_missing' };
    }
    const { replay } = this.ledger.recordObligationsOnEligibility(
      this.orderId,
      this.quote,
      supplierRef,
    );
    this.processedCommandIds.add(event.envelope.command_id);
    return { applied: true, duplicate: replay };
  }

  /* ═══ RELATED-PARTY-1 — §6.5 « Related-party detection (tiered; OWNER: Risk) » ═══
   *
   * The DECISION is made outside (`decideRelatedParty`, from signals the
   * Worker read) and recorded here ONCE per order, after Séra's validated
   * signal — before it there is no commission to hold. « During investigation
   * commission is HELD, not returned »: a non-clear decision puts a hold on
   * HER obligation only; the supplier's line and every amount stay as the
   * quote copied them. The appeal is her one sentence; the ruling is the
   * founder's: `clear` releases the hold (« on clear → paid » — the line is
   * Eligible again, on the same road as any other), `violation` keeps it held
   * and names the violation. The MOVE « returned to seller » is deliberately
   * NOT made here — how it is represented in the settlement records is a §7
   * question the founder rules on; until then the money does not move.
   */
  relatedPartyView(): RelatedPartyView | undefined {
    return this.relatedParty;
  }

  private resellerParty(): string {
    return `reseller:${this.quote.attributionResellerId}`;
  }

  onRelatedPartyDecision(decision: RelatedPartyDecision): SpineOutcome {
    if (this.orderId === undefined || decision.orderId !== this.orderId) {
      return { applied: false, reason: 'order_mismatch' };
    }
    if (this.relatedParty !== undefined) return { applied: true, duplicate: true };
    // Before the validated signal there is no obligation to hold: refused by
    // name, so a decision can never arrive ahead of the commission it judges.
    if (this.ledger.obligationsFor(this.orderId).length === 0) return { applied: false, reason: 'out_of_order' };
    this.relatedParty = { decision };
    if (commissionRetenue(decision)) {
      this.ledger.holdObligation(this.orderId, this.resellerParty(), `${RELATED_PARTY_HOLD}${decision.outcome}`);
    }
    return { applied: true, duplicate: false };
  }

  onRelatedPartyAppeal(appeal: RelatedPartyAppeal): SpineOutcome {
    const rp = this.relatedParty;
    if (rp === undefined || rp.decision.outcome === 'clear') return { applied: false, reason: 'nothing_to_contest' };
    if (rp.resolution !== undefined) return { applied: false, reason: 'already_resolved' };
    // Her first words stand: a second sentence is refused by name, not merged.
    if (rp.appeal !== undefined) return { applied: false, reason: 'already_contested' };
    this.relatedParty = { ...rp, appeal };
    return { applied: true, duplicate: false };
  }

  onRelatedPartyResolution(resolution: RelatedPartyResolution): SpineOutcome {
    const rp = this.relatedParty;
    if (rp === undefined || rp.decision.outcome === 'clear' || this.orderId === undefined) {
      return { applied: false, reason: 'nothing_to_resolve' };
    }
    if (rp.resolution !== undefined) {
      return rp.resolution.outcome === resolution.outcome
        ? { applied: true, duplicate: true }
        : { applied: false, reason: 'already_resolved' };
    }
    this.relatedParty = { ...rp, resolution };
    if (resolution.outcome === 'clear') {
      this.ledger.releaseHold(this.orderId, this.resellerParty(), RELATED_PARTY_HOLD);
    } else {
      this.ledger.holdObligation(this.orderId, this.resellerParty(), `${RELATED_PARTY_HOLD}violation`);
    }
    return { applied: true, duplicate: false };
  }
}
