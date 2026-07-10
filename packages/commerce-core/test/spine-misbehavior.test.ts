import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '@shop-plus/flags-client';
import {
  MockPaymentProvider,
  MockSeraEligibilityEmitter,
  OrderSpine,
  WORKED_BASELINE_INPUT,
  issueQuote,
  type PaymentMockConfig,
  type Quote,
} from '../src/index.js';

/**
 * Contract §3: "A mock is not trustworthy until it misbehaves like the real
 * service" — every §3 misbehavior of BOTH mocks is exercised here, with the
 * spine proven idempotent and consistent under each. Formal certification
 * against the shared conformance suite happens at E1 assembly (JOURNAL'd).
 */

const T = '2026-07-09T12:00:00.000Z';

function issuedQuote(): Quote {
  const outcome = issueQuote(
    { flags: EMPTY_SNAPSHOT, now: () => new Date(T), newId: () => 'q-spine' },
    { listingRef: 'l1', offerRef: 'o1', attributionResellerId: 'reseller-9', paymentMode: 'FULL_PREPAY', ...WORKED_BASELINE_INPUT },
  );
  if (!outcome.ok) throw new Error('quote issuance failed in setup');
  return outcome.quote;
}

/** Walk a spine to payment_pending with the standard chain ids. */
function spineAtPaymentPending(quote: Quote): OrderSpine {
  const spine = new OrderSpine({
    quote,
    supplierRef: 'supplier-1',
    correlationId: 'corr-spine',
    issueCommandId: 'c-issue',
    actor: 'commerce-core:test',
    serverTime: T,
  });
  const r = spine.advance({ command_id: 'c-reserve', actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-1' } });
  const p = spine.advance({ command_id: 'c-pay-init', actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'pay-1', order_id: 'ord-1' } });
  if (!r.ok || !p.ok) throw new Error('setup walk failed');
  return spine;
}

function chargeAndPlan(config: PaymentMockConfig, quote: Quote) {
  const provider = new MockPaymentProvider(config);
  const response = provider.initiateCharge({
    orderId: 'ord-1',
    paymentAttemptId: 'pay-1',
    amount: quote.amountPaidAtCheckout,
    correlationId: 'corr-spine',
    requestedAtIso: T,
  });
  return { provider, response, plan: provider.webhookDeliveryPlan() };
}

describe('§3 misbehavior — payment provider mock vs the spine', () => {
  it('DUPLICATES: webhook delivered 3× → exactly one EscrowTxn, one paid transition, duplicates absorbed', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote);
    const { plan } = chargeAndPlan({ webhookCopies: 3 }, quote);
    expect(plan).toHaveLength(3);
    const outcomes = plan.map((d) => spine.onProviderPaymentEvent(d.event));
    expect(outcomes[0]).toEqual({ applied: true, duplicate: false });
    expect(outcomes[1]).toEqual({ applied: true, duplicate: true });
    expect(outcomes[2]).toEqual({ applied: true, duplicate: true });
    expect(spine.journey.state).toBe('paid');
    const escrow = spine.ledger.escrowFor('ord-1')!;
    expect(escrow.paymentLegs).toHaveLength(1); // ONE leg despite three deliveries
    expect(escrow.paymentLegs[0]!.amount).toBe(quote.amountPaidAtCheckout);
    // paid emitted exactly once: versions strictly sequential, no double bump.
    expect(spine.journey.aggregateVersion).toBe(4);
  });

  it('OUT OF ORDER: webhook before payment_pending refuses closed; redelivery after the precondition applies', () => {
    const quote = issuedQuote();
    const spine = new OrderSpine({ quote, supplierRef: 'supplier-1', correlationId: 'corr-spine', issueCommandId: 'c-issue', actor: 'a', serverTime: T });
    const { plan } = chargeAndPlan({}, quote);
    // Arrives while the order is still quote_issued — too early.
    expect(spine.onProviderPaymentEvent(plan[0]!.event)).toEqual({ applied: false, reason: 'out_of_order' });
    expect(spine.journey.state).toBe('quote_issued'); // nothing half-applied
    expect(spine.ledger.escrowFor('ord-1')).toBeUndefined();
    // The emitter redelivers after the spine catches up.
    spine.advance({ command_id: 'c-r', actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-1' } });
    spine.advance({ command_id: 'c-p', actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'pay-1', order_id: 'ord-1' } });
    expect(spine.onProviderPaymentEvent(plan[0]!.event)).toEqual({ applied: true, duplicate: false });
    expect(spine.journey.state).toBe('paid');
  });

  it('DELAYED: the webhook plan carries the configured delay; until it lands there is no paid state and no confirmable order', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote);
    const { plan } = chargeAndPlan({ webhookDelayMs: 90_000 }, quote);
    expect(plan[0]!.deliverAtMs).toBe(90_000); // delay is visible, not hidden
    // Before delivery: confirming is refused — no funded leg exists yet.
    expect(spine.confirmOrder({ command_id: 'c-confirm-early', actor: 'a', serverTime: T })).toEqual({
      applied: false,
      reason: 'out_of_order',
    });
    // After the delayed delivery, the spine converges normally.
    expect(spine.onProviderPaymentEvent(plan[0]!.event)).toEqual({ applied: true, duplicate: false });
    expect(spine.confirmOrder({ command_id: 'c-confirm', actor: 'a', serverTime: T })).toEqual({ applied: true, duplicate: false });
  });

  it('TIMEOUT + retry: first initiate times out; retry with the SAME idempotency key charges ONCE (no duplicate charge)', () => {
    const quote = issuedQuote();
    const provider = new MockPaymentProvider({ timeoutFirstNInitiates: 1 });
    const req = { orderId: 'ord-1', paymentAttemptId: 'pay-1', amount: quote.amountPaidAtCheckout, correlationId: 'corr-spine', requestedAtIso: T };
    expect(provider.initiateCharge(req)).toEqual({ outcome: 'timeout' });
    const retry = provider.initiateCharge(req);
    expect(retry.outcome).toBe('accepted');
    const retryAgain = provider.initiateCharge(req);
    expect(retryAgain).toEqual(retry); // idempotent — same collectRef, no second charge
    expect(provider.webhookDeliveryPlan()).toHaveLength(1); // ONE webhook for one charge
  });

  it('PARTIAL FAILURE: charge accepted but webhook lost → spine stays unpaid and REFUSES to confirm (fail closed)', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote);
    const { response, plan } = chargeAndPlan({ loseWebhook: true }, quote);
    expect(response.outcome).toBe('accepted'); // provider-side success…
    expect(plan).toHaveLength(0); // …but the webhook never arrives
    expect(spine.journey.state).toBe('payment_pending');
    expect(spine.confirmOrder({ command_id: 'c-confirm', actor: 'a', serverTime: T })).toEqual({
      applied: false,
      reason: 'out_of_order',
    });
    expect(spine.ledger.escrowFor('ord-1')).toBeUndefined(); // no phantom money record
  });

  it('REJECT INVALID TRANSITIONS: idempotency-key reuse with a different amount is rejected by the provider', () => {
    const quote = issuedQuote();
    const provider = new MockPaymentProvider({});
    const req = { orderId: 'ord-1', paymentAttemptId: 'pay-1', amount: quote.amountPaidAtCheckout, correlationId: 'corr-spine', requestedAtIso: T };
    expect(provider.initiateCharge(req).outcome).toBe('accepted');
    expect(provider.initiateCharge({ ...req, amount: req.amount + 1 })).toEqual({
      outcome: 'rejected_invalid',
      reason: 'idempotency_key_amount_mismatch',
    });
  });

  it('SPINE rejects invalid webhooks: wrong amount, unfunded status, wrong correlation, non-canonical event', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote);
    const { plan } = chargeAndPlan({}, quote);
    const good = plan[0]!.event;
    const tampered = { ...good, payload: { ...good.payload, amount: (good.payload['amount'] as number) - 1 } };
    expect(spine.onProviderPaymentEvent(tampered)).toEqual({ applied: false, reason: 'amount_mismatch' });
    const refundedStatus = { ...good, payload: { ...good.payload, status: 'refunded' } };
    expect(spine.onProviderPaymentEvent(refundedStatus)).toEqual({ applied: false, reason: 'unfunded_leg_status' });
    const wrongCorr = { ...good, envelope: { ...good.envelope, correlation_id: 'corr-OTHER' } };
    expect(spine.onProviderPaymentEvent(wrongCorr)).toEqual({ applied: false, reason: 'wrong_correlation' });
    expect(spine.onProviderPaymentEvent({ name: 'payment.checkout_leg_confirmed.v1' })).toEqual({
      applied: false,
      reason: 'not_a_platform_event',
    });
    // After all those attacks the spine still converges on the honest webhook.
    expect(spine.onProviderPaymentEvent(good)).toEqual({ applied: true, duplicate: false });
  });

  it('OUT OF ORDER (reordered plan): reverseOrder delivers later charges first — the knob provably reorders', () => {
    const provider = new MockPaymentProvider({ reverseOrder: true });
    const base = { orderId: 'ord-1', amount: 12_500, correlationId: 'corr-spine', requestedAtIso: T };
    provider.initiateCharge({ ...base, paymentAttemptId: 'pay-first' });
    provider.initiateCharge({ ...base, paymentAttemptId: 'pay-second' });
    const plan = provider.webhookDeliveryPlan();
    expect(plan.map((d) => d.event.payload['payment_attempt_id'])).toEqual(['pay-second', 'pay-first']);
  });

  it('STALE PROJECTION: status reads lie after the charge; the spine trusts the webhook, never the read', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote);
    const { provider, plan } = chargeAndPlan({ staleStatusReads: 2 }, quote);
    expect(spine.onProviderPaymentEvent(plan[0]!.event)).toEqual({ applied: true, duplicate: false });
    // The projection is STALE — it claims the charge never happened…
    expect(provider.getStatus('pay-1')).toEqual({ status: 'unknown' });
    expect(provider.getStatus('pay-1')).toEqual({ status: 'unknown' });
    // …but the spine's state came from the webhook and never regresses.
    expect(spine.journey.state).toBe('paid');
    expect(provider.getStatus('pay-1')).toEqual({ status: 'held' }); // truth catches up
  });
});

describe('§3 misbehavior — Séra eligibility mock vs the spine', () => {
  function confirmedSpine(quote: Quote): OrderSpine {
    const spine = spineAtPaymentPending(quote);
    const { plan } = chargeAndPlan({}, quote);
    spine.onProviderPaymentEvent(plan[0]!.event);
    const c = spine.confirmOrder({ command_id: 'c-confirm', actor: 'a', serverTime: T });
    if (!('applied' in c) || !c.applied) throw new Error('setup confirm failed');
    return spine;
  }

  function validatedPlan(config: ConstructorParameters<typeof MockSeraEligibilityEmitter>[0]) {
    const sera = new MockSeraEligibilityEmitter(config);
    sera.recordDelivered('ord-1');
    const response = sera.requestValidation({ orderId: 'ord-1', correlationId: 'corr-spine', deliveredAtIso: T });
    return { sera, response, plan: sera.eligibilityDeliveryPlan() };
  }

  it('DUPLICATES: eligibility delivered 3× → EXACTLY TWO obligations (supplier, reseller), copies absorbed', () => {
    const quote = issuedQuote();
    const spine = confirmedSpine(quote);
    const { plan } = validatedPlan({ eventCopies: 3 });
    expect(plan).toHaveLength(3);
    const outcomes = plan.map((d) => spine.onEligibilityEvent(d.event));
    expect(outcomes[0]).toEqual({ applied: true, duplicate: false });
    expect(outcomes[1]).toEqual({ applied: true, duplicate: true });
    expect(outcomes[2]).toEqual({ applied: true, duplicate: true });
    const obligations = spine.ledger.obligationsFor('ord-1');
    expect(obligations).toHaveLength(2);
    // Amounts are COPIED from the immutable Quote — asserted to the franc.
    expect(obligations.find((o) => o.party.startsWith('supplier:'))!.amount).toBe(quote.sellerNet);
    expect(obligations.find((o) => o.party.startsWith('reseller:'))!.amount).toBe(quote.resellerNet);
  });

  it('OUT OF ORDER (early): eligibility before the order is confirmed refuses closed; redelivery converges', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote); // not confirmed yet
    const { plan } = validatedPlan({});
    expect(spine.onEligibilityEvent(plan[0]!.event)).toEqual({ applied: false, reason: 'out_of_order' });
    expect(spine.ledger.obligationsFor('ord-1')).toHaveLength(0);
    // Catch up, then redeliver.
    const { plan: payPlan } = chargeAndPlan({}, quote);
    spine.onProviderPaymentEvent(payPlan[0]!.event);
    spine.confirmOrder({ command_id: 'c-confirm', actor: 'a', serverTime: T });
    expect(spine.onEligibilityEvent(plan[0]!.event)).toEqual({ applied: true, duplicate: false });
    expect(spine.ledger.obligationsFor('ord-1')).toHaveLength(2);
  });

  it('DELAYED: the plan carries the delay; obligations exist only after delivery', () => {
    const quote = issuedQuote();
    const spine = confirmedSpine(quote);
    const { plan } = validatedPlan({ deliveryDelayMs: 60_000 });
    expect(plan[0]!.deliverAtMs).toBe(60_000);
    expect(spine.ledger.obligationsFor('ord-1')).toHaveLength(0); // before
    spine.onEligibilityEvent(plan[0]!.event);
    expect(spine.ledger.obligationsFor('ord-1')).toHaveLength(2); // after
  });

  it('TIMEOUT: validation never completes → no event, no obligations, spine consistent', () => {
    const quote = issuedQuote();
    const spine = confirmedSpine(quote);
    const sera = new MockSeraEligibilityEmitter({ timeout: true });
    sera.recordDelivered('ord-1');
    expect(sera.requestValidation({ orderId: 'ord-1', correlationId: 'corr-spine', deliveredAtIso: T })).toEqual({ outcome: 'timeout' });
    expect(sera.eligibilityDeliveryPlan()).toHaveLength(0);
    expect(spine.ledger.obligationsFor('ord-1')).toHaveLength(0);
    expect(spine.journey.state).toBe('confirmed'); // no corruption, just no settlement yet
  });

  it('PARTIAL FAILURE: emits for the first order then goes dark for the second', () => {
    const sera = new MockSeraEligibilityEmitter({ emitForFirstNOrders: 1 });
    sera.recordDelivered('ord-1');
    sera.recordDelivered('ord-2');
    expect(sera.requestValidation({ orderId: 'ord-1', correlationId: 'c1', deliveredAtIso: T }).outcome).toBe('accepted');
    expect(sera.requestValidation({ orderId: 'ord-2', correlationId: 'c2', deliveredAtIso: T }).outcome).toBe('timeout');
    expect(sera.eligibilityDeliveryPlan()).toHaveLength(1);
  });

  it('REJECT INVALID TRANSITIONS: undelivered order refused; a SECOND validation command refused (redelivery ≠ revalidation)', () => {
    const sera = new MockSeraEligibilityEmitter({});
    expect(sera.requestValidation({ orderId: 'ord-ghost', correlationId: 'c', deliveredAtIso: T })).toEqual({
      outcome: 'rejected_invalid',
      reason: 'order_never_delivered',
    });
    sera.recordDelivered('ord-1');
    expect(sera.requestValidation({ orderId: 'ord-1', correlationId: 'c', deliveredAtIso: T }).outcome).toBe('accepted');
    expect(sera.requestValidation({ orderId: 'ord-1', correlationId: 'c', deliveredAtIso: T })).toEqual({
      outcome: 'rejected_invalid',
      reason: 'already_validated',
    });
  });

  it('STALE PROJECTION: validation-status reads deny a done validation; the spine trusts the event, never the read', () => {
    const quote = issuedQuote();
    const spine = confirmedSpine(quote);
    const { sera, plan } = validatedPlan({ staleStatusReads: 2 });
    expect(spine.onEligibilityEvent(plan[0]!.event)).toEqual({ applied: true, duplicate: false });
    // The projection is STALE — it claims the validation never happened…
    expect(sera.getValidationStatus('ord-1')).toEqual({ status: 'unknown' });
    expect(sera.getValidationStatus('ord-1')).toEqual({ status: 'unknown' });
    // …but the obligations came from the event and never regress on a stale read.
    expect(spine.ledger.obligationsFor('ord-1')).toHaveLength(2);
    expect(spine.journey.state).toBe('confirmed');
    expect(sera.getValidationStatus('ord-1')).toEqual({ status: 'validated' }); // truth catches up
    // An order the mock never validated reads unknown honestly, stale or not.
    expect(sera.getValidationStatus('ord-ghost')).toEqual({ status: 'unknown' });
  });

  it('SPINE rejects a foreign event name on the eligibility path (closed refusal)', () => {
    const quote = issuedQuote();
    const spine = confirmedSpine(quote);
    const { plan } = validatedPlan({});
    const renamed = { ...plan[0]!.event, name: 'payout.paid.v1' };
    expect(spine.onEligibilityEvent(renamed)).toEqual({ applied: false, reason: 'unexpected_event_name' });
    expect(spine.ledger.obligationsFor('ord-1')).toHaveLength(0);
  });
});

describe('ledger copy discipline (WO-1.1 d)', () => {
  it('non-divisible regression: obligation amounts equal the quote fields EXACTLY — copied, never recomputed', () => {
    const outcome = issueQuote(
      { flags: EMPTY_SNAPSHOT, now: () => new Date(T), newId: () => 'q-nd' },
      {
        listingRef: 'l1', offerRef: 'o1', attributionResellerId: 'reseller-9', paymentMode: 'FULL_PREPAY',
        sellerBasePrice: 10_001, sellerFundedCommission: 333, resellerMarkup: 778, deliveryFee: 600,
      },
    );
    if (!outcome.ok) throw new Error('setup');
    const quote = outcome.quote;
    const spine = new OrderSpine({ quote, supplierRef: 'supplier-1', correlationId: 'corr-nd', issueCommandId: 'ci', actor: 'a', serverTime: T });
    spine.advance({ command_id: 'cr', actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-1' } });
    spine.advance({ command_id: 'cp', actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'pay-1', order_id: 'ord-nd' } });
    const provider = new MockPaymentProvider({});
    provider.initiateCharge({ orderId: 'ord-nd', paymentAttemptId: 'pay-1', amount: quote.amountPaidAtCheckout, correlationId: 'corr-nd', requestedAtIso: T });
    spine.onProviderPaymentEvent(provider.webhookDeliveryPlan()[0]!.event);
    spine.confirmOrder({ command_id: 'cc', actor: 'a', serverTime: T });
    const sera = new MockSeraEligibilityEmitter({});
    sera.recordDelivered('ord-nd');
    sera.requestValidation({ orderId: 'ord-nd', correlationId: 'corr-nd', deliveredAtIso: T });
    spine.onEligibilityEvent(sera.eligibilityDeliveryPlan()[0]!.event);

    const obligations = spine.ledger.obligationsFor('ord-nd');
    expect(obligations).toHaveLength(2);
    const supplier = obligations.find((o) => o.party === 'supplier:supplier-1')!;
    const reseller = obligations.find((o) => o.party === 'reseller:reseller-9')!;
    expect(supplier.amount).toBe(quote.sellerNet);
    expect(reseller.amount).toBe(quote.resellerNet);
    // And the copied pair still reconciles with the platform fee to the subtotal.
    expect(supplier.amount + reseller.amount + quote.platformProductFeeRevenue).toBe(quote.productSubtotal);
  });

  it('conflicting escrow (different collectRef on the same order) refuses closed — money records never merge', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote);
    const { plan } = chargeAndPlan({}, quote);
    expect(spine.onProviderPaymentEvent(plan[0]!.event)).toEqual({ applied: true, duplicate: false });
    const secondCharge = {
      ...plan[0]!.event,
      envelope: { ...plan[0]!.event.envelope, command_id: 'whk-DIFFERENT' },
      payload: { ...plan[0]!.event.payload, collectRef: 'collect-DIFFERENT' },
    };
    expect(spine.onProviderPaymentEvent(secondCharge)).toEqual({ applied: false, reason: 'out_of_order' });
    expect(spine.ledger.escrowFor('ord-1')!.paymentLegs).toHaveLength(1);
    // And the ledger itself refuses a direct conflicting record — defense in depth.
    expect(
      spine.ledger.recordEscrowFromProvider({
        orderId: 'ord-1', provider: 'sandbox-provider', paymentAttemptId: 'pay-2',
        legType: 'checkout', collectRef: 'collect-DIFFERENT', amount: quote.amountPaidAtCheckout, fee: 0, status: 'held',
      }),
    ).toEqual({ ok: false, reason: 'conflicting_escrow_for_order' });
  });
});
