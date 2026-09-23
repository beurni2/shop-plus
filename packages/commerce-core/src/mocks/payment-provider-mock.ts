import { PlatformEventSchema, type PlatformEvent } from '@platform/contracts';

/**
 * SANDBOX PAYMENT PROVIDER MOCK — Contract §3: "A mock is not trustworthy
 * until it misbehaves like the real service." This mock, per configuration,
 * emits duplicate webhooks, delivers out of order, delays delivery, serves
 * stale status projections, times out, fails partially (charge accepted but
 * the webhook lost), and rejects invalid transitions (idempotency-key reuse
 * with a different amount; capture of an unknown attempt). Events are built
 * THROUGH the pinned PlatformEventSchema — the same contract schema the real
 * producer will use. Fully deterministic: behavior comes from config, never
 * from randomness.
 *
 * NOTE (JOURNAL'd): formal certification against the shared conformance
 * suite happens at E1 assembly, after WO-1.0.
 */

export interface PaymentMockConfig {
  /** Deliver every webhook this many times (≥1). 3 = two duplicates. */
  webhookCopies?: number;
  /** Deliver the webhook plan in reverse order. */
  reverseOrder?: boolean;
  /** Delay all webhook deliveries by this many ms (virtual time). */
  webhookDelayMs?: number;
  /** The first N initiateCharge calls time out instead of answering — the
   * retry path must reuse the SAME idempotency key and never double-charge. */
  timeoutFirstNInitiates?: number;
  /** Partial failure: the charge succeeds provider-side but the webhook is lost. */
  loseWebhook?: boolean;
  /** Serve this many stale status reads before the fresh one. */
  staleStatusReads?: number;
  /** REMBOURSEMENT-1 — the first N initiateRefund calls time out; the retry
   * must reuse the SAME refund key and never refund twice. */
  timeoutFirstNRefunds?: number;
  /** REMBOURSEMENT-2 — the provider declines every refund ask by name (a real
   * aggregator can: its own balance or rules); the order must record it and
   * tell the operator, never retry it silently. */
  refuseRefunds?: boolean;
}

/** REMBOURSEMENT-1 — one refund of one paid leg, asked under its own key. */
export interface RefundRequest {
  orderId: string;
  refundKey: string; // idempotency key
  collectRef: string;
  amount: number;
  correlationId: string;
  requestedAtIso: string;
  legType: 'checkout' | 'door';
}

export type RefundResponse =
  | { outcome: 'accepted'; refundKey: string; refundRef: string }
  | { outcome: 'timeout' }
  | { outcome: 'rejected_invalid'; reason: 'idempotency_key_amount_mismatch' | 'refund_exceeds_collection' | 'refund_declined' };

export interface ChargeRequest {
  orderId: string;
  paymentAttemptId: string; // idempotency key
  amount: number;
  correlationId: string;
  requestedAtIso: string;
  /**
   * WO-2.5: which §5.5 payment leg this charge funds. Defaults to 'checkout'
   * (every pre-Option-B caller); 'door' emits payment.door_leg_confirmed.v1.
   */
  legType?: 'checkout' | 'door';
  /**
   * COLIS-FOURNISSEUR-1 — what ONE collection pays for, when it pays for
   * several orders (a package's door): each order and its amount, summing to
   * `amount`. The provider echoes it on its confirmation, so the payment says
   * itself whose it is (a real aggregator's metadata echo — ⏳ aggregator).
   */
  parts?: readonly { readonly orderId: string; readonly amount: number }[];
}

export type ChargeResponse =
  | { outcome: 'accepted'; paymentAttemptId: string; collectRef: string }
  | { outcome: 'timeout' }
  | { outcome: 'rejected_invalid'; reason: 'idempotency_key_amount_mismatch' };

interface AttemptRecord {
  request: ChargeRequest;
  collectRef: string;
  status: 'held';
  legType: 'checkout' | 'door';
}

export interface PlannedDelivery {
  event: PlatformEvent;
  deliverAtMs: number;
}

export class MockPaymentProvider {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly refunds = new Map<string, { request: RefundRequest; refundRef: string }>();
  private staleReadsRemaining: number;
  private timeoutsRemaining: number;
  private refundTimeoutsRemaining: number;
  private readonly refuseRefunds: boolean;

  constructor(private readonly config: PaymentMockConfig = {}) {
    this.staleReadsRemaining = config.staleStatusReads ?? 0;
    this.timeoutsRemaining = config.timeoutFirstNInitiates ?? 0;
    this.refundTimeoutsRemaining = config.timeoutFirstNRefunds ?? 0;
    this.refuseRefunds = config.refuseRefunds === true;
  }

  /**
   * REMBOURSEMENT-1 — idempotent refund initiation: the same key never refunds
   * twice, and never with another amount. A collection this mock charged is
   * never refunded beyond what it collected, however the refunds are keyed.
   * Accepted is NOT refunded: the refund webhook is the only truth of it.
   */
  initiateRefund(request: RefundRequest): RefundResponse {
    if (this.refundTimeoutsRemaining > 0) {
      this.refundTimeoutsRemaining -= 1;
      return { outcome: 'timeout' };
    }
    if (this.refuseRefunds) return { outcome: 'rejected_invalid', reason: 'refund_declined' };
    const existing = this.refunds.get(request.refundKey);
    if (existing) {
      if (existing.request.amount !== request.amount) {
        return { outcome: 'rejected_invalid', reason: 'idempotency_key_amount_mismatch' };
      }
      return { outcome: 'accepted', refundKey: request.refundKey, refundRef: existing.refundRef };
    }
    const collected = [...this.attempts.values()].find((a) => a.collectRef === request.collectRef);
    if (collected !== undefined) {
      const already = [...this.refunds.values()]
        .filter((r) => r.request.collectRef === request.collectRef)
        .reduce((sum, r) => sum + r.request.amount, 0);
      if (already + request.amount > collected.request.amount) {
        return { outcome: 'rejected_invalid', reason: 'refund_exceeds_collection' };
      }
    }
    const refundRef = `refund-${request.refundKey}`;
    this.refunds.set(request.refundKey, { request, refundRef });
    return { outcome: 'accepted', refundKey: request.refundKey, refundRef };
  }

  /** Idempotent charge initiation — the same key never charges twice. */
  initiateCharge(request: ChargeRequest): ChargeResponse {
    if (this.timeoutsRemaining > 0) {
      this.timeoutsRemaining -= 1;
      return { outcome: 'timeout' };
    }
    const existing = this.attempts.get(request.paymentAttemptId);
    if (existing) {
      if (existing.request.amount !== request.amount) {
        // Invalid transition: reusing an idempotency key for a different
        // amount is rejected, never silently honored.
        return { outcome: 'rejected_invalid', reason: 'idempotency_key_amount_mismatch' };
      }
      return {
        outcome: 'accepted',
        paymentAttemptId: request.paymentAttemptId,
        collectRef: existing.collectRef,
      };
    }
    const record: AttemptRecord = {
      request,
      collectRef: `collect-${request.paymentAttemptId}`,
      status: 'held',
      legType: request.legType ?? 'checkout',
    };
    this.attempts.set(request.paymentAttemptId, record);
    return { outcome: 'accepted', paymentAttemptId: request.paymentAttemptId, collectRef: record.collectRef };
  }

  /**
   * The webhook delivery plan for everything charged so far — duplicates,
   * reordering, delay, and loss applied per config. `deliverAtMs` is virtual
   * time relative to the charge; the consumer test advances its own clock.
   */
  webhookDeliveryPlan(): PlannedDelivery[] {
    const deliveries: PlannedDelivery[] = [];
    const copies = Math.max(1, this.config.webhookCopies ?? 1);
    const delay = this.config.webhookDelayMs ?? 0;
    for (const attempt of this.attempts.values()) {
      if (this.config.loseWebhook) continue; // partial failure: charged, no webhook
      for (let copy = 0; copy < copies; copy += 1) {
        deliveries.push({
          event: this.buildWebhookEvent(attempt, copy),
          deliverAtMs: delay + copy, // duplicates land as distinct deliveries
        });
      }
    }
    for (const refund of this.refunds.values()) {
      if (this.config.loseWebhook) continue;
      for (let copy = 0; copy < copies; copy += 1) {
        deliveries.push({ event: this.buildRefundEvent(refund, copy), deliverAtMs: delay + copy });
      }
    }
    if (this.config.reverseOrder) deliveries.reverse();
    return deliveries;
  }

  /**
   * Status projection — STALE per config: the first N reads answer as if the
   * charge never happened, then the truth appears. Consumers must treat the
   * webhook, not this read, as payment truth.
   */
  getStatus(paymentAttemptId: string): { status: 'unknown' | 'held' } {
    const attempt = this.attempts.get(paymentAttemptId);
    if (!attempt) return { status: 'unknown' };
    if (this.staleReadsRemaining > 0) {
      this.staleReadsRemaining -= 1;
      return { status: 'unknown' }; // stale projection
    }
    return { status: attempt.status };
  }

  /** REMBOURSEMENT-1 — the refund's own confirmation, one command_id per refund (copies share it). */
  private buildRefundEvent(refund: { request: RefundRequest; refundRef: string }, copy: number): PlatformEvent {
    return PlatformEventSchema.parse({
      name: 'payment.refund_confirmed.v1',
      envelope: {
        command_id: `whk-${refund.refundRef}`,
        correlation_id: refund.request.correlationId,
        aggregateVersion: 1,
        actor: 'payment-provider:sandbox',
        serverTime: refund.request.requestedAtIso,
        version: '1',
      },
      payload: {
        provider: 'sandbox-provider',
        refund_key: refund.request.refundKey,
        refundRef: refund.refundRef,
        collectRef: refund.request.collectRef,
        amount: refund.request.amount,
        fee: 0,
        status: 'refunded',
        order_id: refund.request.orderId,
        redelivery: copy,
      },
    });
  }

  private buildWebhookEvent(attempt: AttemptRecord, copy: number): PlatformEvent {
    // Same envelope command_id on every copy: a real provider redelivers the
    // SAME webhook — consumers must dedupe on it. The event NAME follows the
    // §5.5 leg (WO-2.5): checkout vs door confirmations are distinct canon
    // events with the same provider payload shape.
    return PlatformEventSchema.parse({
      name:
        attempt.legType === 'door'
          ? 'payment.door_leg_confirmed.v1'
          : 'payment.checkout_leg_confirmed.v1',
      envelope: {
        command_id: `whk-${attempt.collectRef}`,
        correlation_id: attempt.request.correlationId,
        aggregateVersion: 1,
        actor: 'payment-provider:sandbox',
        serverTime: attempt.request.requestedAtIso,
        version: '1',
      },
      payload: {
        provider: 'sandbox-provider',
        payment_attempt_id: attempt.request.paymentAttemptId,
        collectRef: attempt.collectRef,
        amount: attempt.request.amount,
        fee: 0,
        status: 'held',
        order_id: attempt.request.orderId,
        redelivery: copy,
        ...(attempt.request.parts !== undefined
          ? { parts: attempt.request.parts.map((x) => ({ order_id: x.orderId, amount: x.amount })) }
          : {}),
      },
    });
  }
}
