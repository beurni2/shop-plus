import { PlatformEventSchema, type PlatformEvent } from '@platform/contracts';

/**
 * SÉRA SETTLEMENT-ELIGIBILITY MOCK — Contract §3 (a mock must misbehave) ×
 * §2.3 step 13 (one validated settlement-eligibility event). Séra emits
 * `delivery.validated.v1` after its validation pipeline; this mock emits the
 * same canonical event THROUGH the pinned PlatformEventSchema and, per
 * config: duplicates it, delivers it out of order (the test drives early
 * delivery against the consumer's state), delays it, serves STALE validation
 * projections (reads that deny a validation that already happened), times
 * out (never emits), partially fails (emits for only some orders), and
 * rejects invalid transitions (validating an order it never saw delivered,
 * or validating twice with a NEW command — a real Séra validates once).
 * Deterministic: config only, no randomness.
 *
 * NOTE (JOURNAL'd): formal certification against the shared conformance
 * suite happens at E1 assembly, after WO-1.0.
 */

export interface EligibilityMockConfig {
  /** Deliver every eligibility event this many times (≥1). */
  eventCopies?: number;
  /** Delay delivery by this many ms of virtual time. */
  deliveryDelayMs?: number;
  /** Serve this many STALE validation-status reads before the fresh one. */
  staleStatusReads?: number;
  /** Timeout: validation never completes, no event is emitted. */
  timeout?: boolean;
  /** Partial failure: emit for at most this many orders, then go silent. */
  emitForFirstNOrders?: number;
}

export type ValidationRequest = {
  orderId: string;
  correlationId: string;
  deliveredAtIso: string;
};

export type ValidationResponse =
  | { outcome: 'accepted' }
  | { outcome: 'timeout' }
  | { outcome: 'rejected_invalid'; reason: 'order_never_delivered' | 'already_validated' };

export interface PlannedEligibility {
  event: PlatformEvent;
  deliverAtMs: number;
}

export class MockSeraEligibilityEmitter {
  private readonly delivered = new Set<string>();
  private readonly validated = new Map<string, ValidationRequest>();
  private staleReadsRemaining: number;

  constructor(private readonly config: EligibilityMockConfig = {}) {
    this.staleReadsRemaining = config.staleStatusReads ?? 0;
  }

  /**
   * Validation-status projection — STALE per config: the first N reads deny
   * a validation that already happened. Consumers must treat the
   * `delivery.validated.v1` event, never this read, as eligibility truth.
   */
  getValidationStatus(orderId: string): { status: 'unknown' | 'validated' } {
    if (!this.validated.has(orderId)) return { status: 'unknown' };
    if (this.staleReadsRemaining > 0) {
      this.staleReadsRemaining -= 1;
      return { status: 'unknown' }; // stale projection
    }
    return { status: 'validated' };
  }

  /** Séra learns a delivery happened (drop code recorded) — precondition for validation. */
  recordDelivered(orderId: string): void {
    this.delivered.add(orderId);
  }

  /** Ask the mock to validate. Rejects invalid transitions like the real service. */
  requestValidation(request: ValidationRequest): ValidationResponse {
    if (this.config.timeout) return { outcome: 'timeout' };
    if (!this.delivered.has(request.orderId)) {
      return { outcome: 'rejected_invalid', reason: 'order_never_delivered' };
    }
    if (this.validated.has(request.orderId)) {
      return { outcome: 'rejected_invalid', reason: 'already_validated' };
    }
    const cap = this.config.emitForFirstNOrders;
    if (cap !== undefined && this.validated.size >= cap) {
      // Partial failure: the service accepted earlier work then went dark.
      return { outcome: 'timeout' };
    }
    this.validated.set(request.orderId, request);
    return { outcome: 'accepted' };
  }

  /** The delivery plan — duplicates and delay applied per config. */
  eligibilityDeliveryPlan(): PlannedEligibility[] {
    const copies = Math.max(1, this.config.eventCopies ?? 1);
    const delay = this.config.deliveryDelayMs ?? 0;
    const plan: PlannedEligibility[] = [];
    for (const request of this.validated.values()) {
      for (let copy = 0; copy < copies; copy += 1) {
        plan.push({ event: this.buildEvent(request), deliverAtMs: delay + copy });
      }
    }
    return plan;
  }

  private buildEvent(request: ValidationRequest): PlatformEvent {
    // Redeliveries carry the SAME command_id — consumers dedupe on it.
    return PlatformEventSchema.parse({
      name: 'delivery.validated.v1',
      envelope: {
        command_id: `elig-${request.orderId}`,
        correlation_id: request.correlationId,
        aggregateVersion: 1,
        actor: 'sera:validation-sandbox',
        serverTime: request.deliveredAtIso,
        version: '1',
      },
      payload: {
        order_id: request.orderId,
        result: 'validated',
      },
    });
  }
}
