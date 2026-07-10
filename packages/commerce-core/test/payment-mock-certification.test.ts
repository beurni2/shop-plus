import { describe, expect, it } from 'vitest';
import {
  DOMAIN_PAYLOAD_SCHEMAS,
  MockTimeoutError,
  certifyAdapter,
  type EmissionControls,
  type EmissionResult,
  type MockAdapter,
  type ProjectionRead,
  type TransitionAttempt,
} from '@platform/certification';
import type { PlatformEvent } from '@platform/contracts';
import { MockPaymentProvider } from '../src/mocks/payment-provider-mock.js';

/**
 * WO-2.5 — §3 RE-CERTIFICATION of the GROWN payment-provider mock (8/8, no
 * partial passes). The adapter mirrors the E1-assembly pattern (the founder-
 * reviewed live-certifiables adapter): the mock's OWN misbehavior knobs are
 * used where they exist (timeout, duplicate, stale reads, idempotency-key
 * refusal); the remaining §3 misbehaviors are transport-level around the
 * mock's REAL emissions. The emitted sequence now INCLUDES the Option-B
 * door-leg webhook — the certified surface is the mock as it exists after
 * this work order, not the pre-door subset.
 */

const CHECKOUT_D = 1_000; // Option-B checkout leg = D (§5.5)
const DOOR_PRODUCT = 11_500; // Option-B door leg = productSubtotal (§5.5)

async function deliverUnderControls(
  domain: string,
  seed: string,
  events: PlatformEvent[],
  controls: EmissionControls,
): Promise<EmissionResult> {
  if (controls.timeout) {
    throw new MockTimeoutError(`${domain}: simulated provider timeout for seed ${seed}`);
  }
  let sequence = events;
  if (controls.duplicate && sequence.length >= 2) {
    sequence = [...sequence.slice(0, 2), sequence[1]!, ...sequence.slice(2)];
  }
  if (controls.outOfOrder && sequence.length >= 3) {
    sequence = [...sequence.slice(0, -2), sequence[sequence.length - 1]!, sequence[sequence.length - 2]!];
  }
  if (controls.delayMs !== undefined && controls.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, controls.delayMs));
  }
  if (controls.partialFailure && sequence.length >= 2) {
    return {
      delivered: sequence.slice(0, 1).map((event) => ({ event, deliveredAt: Date.now() })),
      failure: { afterCount: 1, reason: `${domain}: simulated mid-sequence failure` },
    };
  }
  return { delivered: sequence.map((event) => ({ event, deliveredAt: Date.now() })) };
}

/** Charge BOTH §5.5 legs through the real mock and return its webhook plan. */
function chargeBothLegs(provider: MockPaymentProvider, seed: string): PlatformEvent[] {
  const base = { orderId: `order_${seed}`, correlationId: `corr_${seed}`, requestedAtIso: new Date().toISOString() };
  const checkout = provider.initiateCharge({ ...base, paymentAttemptId: `payatt_${seed}`, amount: CHECKOUT_D, legType: 'checkout' });
  if (checkout.outcome !== 'accepted') throw new Error(`checkout charge refused: ${checkout.outcome}`);
  const door = provider.initiateCharge({ ...base, paymentAttemptId: `dooratt_${seed}`, amount: DOOR_PRODUCT, legType: 'door' });
  if (door.outcome !== 'accepted') throw new Error(`door charge refused: ${door.outcome}`);
  return provider.webhookDeliveryPlan().map((d) => d.event);
}

export function makeGrownPaymentProviderAdapter(): MockAdapter {
  return {
    domain: 'payment-provider',
    producerSchema: DOMAIN_PAYLOAD_SCHEMAS['payment-provider'],
    async emit(seed, controls): Promise<EmissionResult> {
      if (controls.timeout) {
        // REAL knob: the provider mock times out its first N initiates.
        const provider = new MockPaymentProvider({ timeoutFirstNInitiates: 1 });
        const charge = provider.initiateCharge({
          orderId: `order_${seed}`, paymentAttemptId: `payatt_${seed}`,
          amount: CHECKOUT_D, correlationId: `corr_${seed}`, requestedAtIso: new Date().toISOString(),
        });
        if (charge.outcome === 'timeout') throw new MockTimeoutError('sandbox provider timed out (its own knob)');
        throw new Error(`expected the provider's own timeout, got ${charge.outcome}`);
      }
      // REAL knob: duplicates = the provider redelivers the same webhook
      // (same command_id), exactly as configured.
      const provider = new MockPaymentProvider(controls.duplicate ? { webhookCopies: 2 } : {});
      const webhooks = chargeBothLegs(provider, seed);
      // Payout responses extend the same sandbox provider (E1-certified
      // sequence shape) — they give the sequence its ordered version tail.
      const payoutPayload = (status: 'held' | 'captured') => ({
        provider: 'sandbox-provider',
        payment_attempt_id: `payatt_${seed}`,
        collectRef: `payout_${seed}`,
        amount: CHECKOUT_D,
        fee: 0,
        status,
        order_id: `order_${seed}`,
        redelivery: 0,
      });
      const envelope = (n: number) => ({
        command_id: `${seed}-payout-${n}`,
        correlation_id: `corr_${seed}`,
        aggregateVersion: n,
        actor: 'payment-provider:sandbox',
        serverTime: new Date().toISOString(),
        version: '1',
      });
      const events: PlatformEvent[] = [
        ...webhooks,
        { name: 'payout.submitted.v1', envelope: envelope(2), payload: payoutPayload('held') },
        { name: 'payout.paid.v1', envelope: envelope(3), payload: payoutPayload('captured') },
      ];
      // duplicates already REAL (webhookCopies); everything else transport-level.
      return deliverUnderControls(this.domain, seed, events, { ...controls, duplicate: false });
    },
    async readProjection(seed, options): Promise<ProjectionRead> {
      // REAL knob: stale status reads served by the provider itself.
      const provider = new MockPaymentProvider(options.stale ? { staleStatusReads: 1 } : {});
      provider.initiateCharge({
        orderId: `order_${seed}`, paymentAttemptId: `payatt_${seed}`,
        amount: CHECKOUT_D, correlationId: `corr_${seed}`, requestedAtIso: new Date().toISOString(),
      });
      const status = provider.getStatus(`payatt_${seed}`);
      return options.stale
        ? { version: 1, asOf: new Date().toISOString(), value: { status: status.status } }
        : { version: 2, asOf: new Date().toISOString(), value: { status: status.status } };
    },
    attemptInvalidTransition(): TransitionAttempt {
      // REAL refusal: same paymentAttemptId, different amount — the
      // provider's idempotency-key check rejects it (door legs included).
      const provider = new MockPaymentProvider({});
      const base = { orderId: 'order_x', paymentAttemptId: 'dooratt_x', correlationId: 'corr_x', requestedAtIso: new Date().toISOString() };
      provider.initiateCharge({ ...base, amount: DOOR_PRODUCT, legType: 'door' });
      const second = provider.initiateCharge({ ...base, amount: DOOR_PRODUCT + 1, legType: 'door' });
      return second.outcome === 'rejected_invalid'
        ? { from: `door@${DOOR_PRODUCT}`, to: `door@${DOOR_PRODUCT + 1}`, accepted: false, reason: `provider mock refused: ${second.reason}` }
        : { from: `door@${DOOR_PRODUCT}`, to: `door@${DOOR_PRODUCT + 1}`, accepted: true };
    },
  };
}

describe('§3 re-certification — grown payment-provider mock (WO-2.5, door flow included)', () => {
  it('certifies 8/8 — no partial passes', async () => {
    const scorecard = await certifyAdapter(makeGrownPaymentProviderAdapter());
    for (const result of scorecard.results) {
      expect(result.passed, `${result.behavior}: ${result.detail}`).toBe(true);
    }
    expect(scorecard.score).toBe('8/8');
    expect(scorecard.certified).toBe(true);
  });

  it('the certified emission sequence contains BOTH §5.5 leg webhooks with distinct canon names', async () => {
    const result = await makeGrownPaymentProviderAdapter().emit('door-proof', {});
    const names = result.delivered.map((d) => d.event.name);
    expect(names).toContain('payment.checkout_leg_confirmed.v1');
    expect(names).toContain('payment.door_leg_confirmed.v1');
    const door = result.delivered.find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!;
    expect(door.event.payload['amount']).toBe(DOOR_PRODUCT);
  });
});
