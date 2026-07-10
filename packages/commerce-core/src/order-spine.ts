import { PlatformEventSchema, type PlatformEvent, type Quote } from '@platform/contracts';
import { LedgerRecords } from './ledger.js';
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
  args: { serverTime: string },
): PlatformEvent | null {
  if (spine.journey.state !== 'payment_failed') return null;
  if (reservation.status !== 'reserved') return null;
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
  | 'reservation_not_confirmed';

export type SpineOutcome =
  | { applied: true; duplicate: boolean }
  | { applied: false; reason: SpineRefusalReason };

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

  /** Local commands (reserve confirmation, payment initiation) advance the machine. */
  advance(cmd: {
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
   * Provider webhook (the only payment truth). Idempotent on
   * envelope.command_id; validates the confirmed amount against the
   * immutable Quote to the franc; records the EscrowTxn; advances to paid.
   */
  onProviderPaymentEvent(raw: unknown): SpineOutcome {
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
      return { applied: false, reason: 'out_of_order' };
    }

    const p = event.payload as Record<string, unknown>;
    const amount = p['amount'];
    const status = p['status'];
    // FULL_PREPAY: the checkout leg must equal amountPaidAtCheckout (== buyerTotal).
    if (typeof amount !== 'number' || amount !== this.quote.amountPaidAtCheckout) {
      return { applied: false, reason: 'amount_mismatch' };
    }
    if (status !== 'held' && status !== 'captured') {
      return { applied: false, reason: 'unfunded_leg_status' };
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
    if (!recorded.ok) return { applied: false, reason: recorded.reason };

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
    return { applied: true, duplicate: false };
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
    const { replay } = this.ledger.recordObligationsOnEligibility(
      this.orderId,
      this.quote,
      this.supplierRef,
    );
    this.processedCommandIds.add(event.envelope.command_id);
    return { applied: true, duplicate: replay };
  }
}
