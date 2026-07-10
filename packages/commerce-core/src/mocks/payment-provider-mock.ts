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
}

export interface ChargeRequest {
  orderId: string;
  paymentAttemptId: string; // idempotency key
  amount: number;
  correlationId: string;
  requestedAtIso: string;
}

export type ChargeResponse =
  | { outcome: 'accepted'; paymentAttemptId: string; collectRef: string }
  | { outcome: 'timeout' }
  | { outcome: 'rejected_invalid'; reason: 'idempotency_key_amount_mismatch' };

interface AttemptRecord {
  request: ChargeRequest;
  collectRef: string;
  status: 'held';
}

export interface PlannedDelivery {
  event: PlatformEvent;
  deliverAtMs: number;
}

export class MockPaymentProvider {
  private readonly attempts = new Map<string, AttemptRecord>();
  private staleReadsRemaining: number;
  private timeoutsRemaining: number;

  constructor(private readonly config: PaymentMockConfig = {}) {
    this.staleReadsRemaining = config.staleStatusReads ?? 0;
    this.timeoutsRemaining = config.timeoutFirstNInitiates ?? 0;
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

  private buildWebhookEvent(attempt: AttemptRecord, copy: number): PlatformEvent {
    // Same envelope command_id on every copy: a real provider redelivers the
    // SAME webhook — consumers must dedupe on it.
    return PlatformEventSchema.parse({
      name: 'payment.checkout_leg_confirmed.v1',
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
      },
    });
  }
}
