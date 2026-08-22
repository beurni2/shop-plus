import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '@shop-plus/flags-client';
import type { PlatformEvent } from '@platform/contracts';
import {
  MockPaymentProvider,
  MockSeraEligibilityEmitter,
  OrderSpine,
  WORKED_BASELINE_INPUT,
  issueQuote,
  reconcileOrder,
  type ProviderChargeRecord,
  type Quote,
  type ReconciliationSnapshot,
} from '../src/index.js';

/**
 * ═══ RAPPROCHEMENT-1 (E3 seed) — Contract §6/E2 exit: « the defined recovery
 * state + a reconciliation alert »; Contract E3: « settlement reconciliation ».
 *
 * Two halves, both provider-agnostic:
 *  · REFUSAL-PATH ALERTS — when a VALID provider confirmation contradicts
 *    local knowledge (a locally-failed payment, the immutable Quote's amount,
 *    the charge the order actually initiated, an already-funded leg), the
 *    refusal now CARRIES a reconciliation.alert.v1 beside its reason. Amounts
 *    are COPIED into the alert, never computed (Ten Laws #1/#2).
 *  · THE PASS — reconcileOrder() compares the order's own records (journey
 *    state · door projection · EscrowTxn · SettlementObligations · immutable
 *    Quote) and, when given, the provider's own charge records, and names
 *    every divergence. A clean world yields [].
 */

const T = '2026-07-11T12:00:00.000Z';
const LATER = (mins: number) => new Date(Date.parse(T) + mins * 60_000).toISOString();

/** §6.1 gate context so a door-mode quote is issuable at all (e2-door-paths' pattern). */
const DOOR_GATE = {
  eligibility: { buyerRef: 'buyer-e3-1', state: 'allowed', buyerRefusalCount: 0, buyerRiskState: 'normal', requiredDeposit: 0 },
  sellerTier: 'verified',
  category: 'fashion_bags_fabrics',
  zoneTo: 'ouaga-centre',
  policy: {
    version: 'option-b-policy.v0-conservative+test-zone',
    priceCapFcfa: 25_000,
    minSellerTier: 'verified',
    inspectableCategories: ['fashion_bags_fabrics', 'shoes', 'sealed_beauty_cosmetics'],
    networkReliableZones: ['ouaga-centre'],
  },
};

function issuedQuote(paymentMode: 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' = 'FULL_PREPAY'): Quote {
  const outcome = issueQuote(
    { flags: EMPTY_SNAPSHOT, now: () => new Date(T), newId: () => `q-e3-${paymentMode === 'FULL_PREPAY' ? 'pp' : 'door'}` },
    {
      listingRef: 'l1', offerRef: 'o1', attributionResellerId: 'reseller-9', ...WORKED_BASELINE_INPUT, paymentMode,
      ...(paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' ? { payAtDoor: DOOR_GATE, nowIso: T } : {}),
    },
  );
  if (!outcome.ok) throw new Error('quote issuance failed in setup');
  if (outcome.quote.paymentMode !== paymentMode) throw new Error('setup: quote issued in the wrong mode');
  return outcome.quote;
}

function spineAtPaymentPending(quote: Quote, seed = 'e3'): OrderSpine {
  const spine = new OrderSpine({
    quote,
    supplierRef: 'supplier-1',
    correlationId: `corr-${seed}`,
    issueCommandId: `c-issue-${seed}`,
    actor: 'commerce-core:test',
    serverTime: T,
  });
  const r = spine.advance({ command_id: `c-reserve-${seed}`, actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: `res-${seed}` } });
  const p = spine.advance({ command_id: `c-pay-${seed}`, actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: `pay-${seed}`, order_id: `ord-${seed}` } });
  if (!r.ok || !p.ok) throw new Error('setup walk failed');
  return spine;
}

/** A genuine checkout webhook from the certified mock, charged with the leg key. */
function genuineWebhook(quote: Quote, seed = 'e3', legKey = `pay-${seed}`): PlatformEvent {
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({
    orderId: `ord-${seed}`,
    paymentAttemptId: legKey,
    amount: quote.amountPaidAtCheckout,
    correlationId: `corr-${seed}`,
    requestedAtIso: T,
  });
  return provider.webhookDeliveryPlan()[0]!.event;
}

const asRefusal = (o: { applied: boolean }): { applied: false; reason: string; alert?: PlatformEvent } => {
  if (o.applied) throw new Error('expected a refusal');
  return o as { applied: false; reason: string; alert?: PlatformEvent };
};

describe('E3 — refusal-path alerts: provider truth contradicting local knowledge is NAMED, never silent', () => {
  it('a GENUINE webhook landing after LOCAL payment failure refuses out_of_order AND carries the alert; the early pre-order race stays alert-free', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote, 'lw1');
    spine.failPayment({ command_id: 'fail-lw1', actor: 'a', serverTime: LATER(1), reason: 'charge_timeout' });
    const refusal = asRefusal(spine.onProviderPaymentEvent(genuineWebhook(quote, 'lw1')));
    expect(refusal.reason).toBe('out_of_order');
    expect(refusal.alert?.name).toBe('reconciliation.alert.v1');
    expect(refusal.alert?.payload).toMatchObject({
      alert: 'genuine_webhook_after_local_failure',
      local_failure_reason: 'charge_timeout',
      leg: 'checkout',
    });

    // The EARLY race (webhook before the order exists) is the provider's
    // normal at-least-once behavior — retryable, no contradiction, NO alert.
    const early = new OrderSpine({ quote, supplierRef: 'supplier-1', correlationId: 'corr-lw2', issueCommandId: 'c-issue-lw2', actor: 'a', serverTime: T });
    const earlyRefusal = asRefusal(early.onProviderPaymentEvent(genuineWebhook(quote, 'lw2')));
    expect(earlyRefusal.reason).toBe('out_of_order');
    expect(earlyRefusal.alert).toBeUndefined();
  });

  it('an amount contradicting the immutable Quote refuses amount_mismatch AND alerts with both figures COPIED', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote, 'am1');
    const event = genuineWebhook(quote, 'am1') as { payload: Record<string, unknown> };
    const tampered = { ...event, payload: { ...event.payload, amount: quote.amountPaidAtCheckout + 500 } };
    const refusal = asRefusal(spine.onProviderPaymentEvent(tampered));
    expect(refusal.reason).toBe('amount_mismatch');
    expect(refusal.alert?.payload).toMatchObject({
      alert: 'provider_amount_contradicts_quote',
      provider_amount: quote.amountPaidAtCheckout + 500,
      expected_amount: quote.amountPaidAtCheckout,
      leg: 'checkout',
    });
    expect(spine.ledger.escrowFor('ord-am1')).toBeUndefined(); // nothing recorded
  });

  it('NB-3 foreign ids alert as webhook_names_foreign_charge — both the attempt and the order contradiction', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote, 'nb1');
    const foreignAttempt = asRefusal(spine.onProviderPaymentEvent(genuineWebhook(quote, 'nb1', 'someone-elses-key'), 'pay-nb1'));
    expect(foreignAttempt.reason).toBe('attempt_mismatch');
    expect(foreignAttempt.alert?.payload).toMatchObject({ alert: 'webhook_names_foreign_charge', leg: 'checkout' });

    const spine2 = spineAtPaymentPending(quote, 'nb2');
    const event = genuineWebhook(quote, 'nb2') as { payload: Record<string, unknown> };
    const foreignOrder = { ...event, payload: { ...event.payload, order_id: 'ord-SOMEONE-ELSE' } };
    const refusal2 = asRefusal(spine2.onProviderPaymentEvent(foreignOrder));
    expect(refusal2.reason).toBe('order_mismatch');
    expect(refusal2.alert?.payload).toMatchObject({ alert: 'webhook_names_foreign_charge', payload_order_id: 'ord-SOMEONE-ELSE' });
  });

  it('a SECOND DIFFERENT confirmation for an already-funded leg refuses AND alerts conflicting_provider_confirmation (E3 verifier MAJOR: the reachable double-charge signal)', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote, 'cf1');
    expect(spine.onProviderPaymentEvent(genuineWebhook(quote, 'cf1'))).toEqual({ applied: true, duplicate: false });
    // A rival confirmation — fresh command_id, OUR charge's ids — after the
    // leg funded. A redelivery of the genuine webhook (same command_id) is
    // absorbed before this gate, so what lands here should not exist twice.
    const rival = new MockPaymentProvider({});
    rival.initiateCharge({ orderId: 'ord-cf1', paymentAttemptId: 'pay-cf1-rival', amount: quote.amountPaidAtCheckout, correlationId: 'corr-cf1', requestedAtIso: T });
    const rivalEvent = rival.webhookDeliveryPlan()[0]!.event as { payload: Record<string, unknown> };
    // The rival names OUR leg key in its payload (a doctored re-announcement).
    const naming = { ...rivalEvent, payload: { ...rivalEvent.payload, payment_attempt_id: 'pay-cf1' } };
    const rivalRefusal = asRefusal(spine.onProviderPaymentEvent(naming, 'pay-cf1'));
    expect(rivalRefusal.reason).toBe('out_of_order'); // the refusal stands — money unchanged
    expect(rivalRefusal.alert?.payload).toMatchObject({
      alert: 'conflicting_provider_confirmation',
      leg: 'checkout',
      local_state: 'paid',
    });
    // …while a rival naming a FOREIGN charge stays a quiet state refusal:
    const foreign = asRefusal(spine.onProviderPaymentEvent(rivalEvent, 'pay-cf1'));
    expect(foreign.reason).toBe('out_of_order');
    expect(foreign.alert).toBeUndefined();
  });

  it('a genuine webhook on a CANCELLED-after-failure order alerts too — the abandonment does not silence the contradiction', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote, 'cx1');
    spine.failPayment({ command_id: 'fail-cx1', actor: 'a', serverTime: LATER(1), reason: 'charge_rejected' });
    expect(spine.cancelOrder({ command_id: 'cancel-cx1', actor: 'buyer', serverTime: LATER(2) }).ok).toBe(true);
    const refusal = asRefusal(spine.onProviderPaymentEvent(genuineWebhook(quote, 'cx1')));
    expect(refusal.reason).toBe('out_of_order');
    expect(refusal.alert?.payload).toMatchObject({
      alert: 'genuine_webhook_after_local_failure',
      local_state: 'cancelled',
      local_failure_reason: 'charge_rejected',
    });
  });

  it('DOOR twins: a door amount contradicting amountDueAtDelivery alerts; a door confirmation before checkout funding alerts; door-not-expected keeps its existing alert', () => {
    const quote = issuedQuote('DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const spine = spineAtPaymentPending(quote, 'dr1');
    expect(spine.onProviderPaymentEvent(genuineWebhook(quote, 'dr1'))).toEqual({ applied: true, duplicate: false });
    expect(spine.confirmOrder({ command_id: 'c-confirm-dr1', actor: 'a', serverTime: LATER(1) })).toEqual({ applied: true, duplicate: false });
    expect(spine.doorLegState).toBe('due');

    const doorProvider = new MockPaymentProvider({});
    doorProvider.initiateCharge({
      orderId: 'ord-dr1', paymentAttemptId: 'door-dr1', amount: quote.amountDueAtDelivery,
      correlationId: 'corr-dr1', requestedAtIso: T, legType: 'door',
    });
    const doorEvent = doorProvider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event as {
      payload: Record<string, unknown>;
    };
    const tampered = { ...doorEvent, payload: { ...doorEvent.payload, amount: quote.amountDueAtDelivery - 1 } };
    const refusal = asRefusal(spine.onProviderDoorPaymentEvent(tampered));
    expect(refusal.reason).toBe('amount_mismatch');
    expect((refusal.alert as PlatformEvent | null)?.payload).toMatchObject({
      alert: 'provider_amount_contradicts_quote',
      provider_amount: quote.amountDueAtDelivery - 1,
      expected_amount: quote.amountDueAtDelivery,
      leg: 'door',
    });

    // Door-not-expected (FULL_PREPAY spine) — the existing Contract-§6 alert stands.
    const prepayQuote = issuedQuote();
    const prepay = spineAtPaymentPending(prepayQuote, 'dr2');
    const strayDoor = new MockPaymentProvider({});
    strayDoor.initiateCharge({
      orderId: 'ord-dr2', paymentAttemptId: 'door-dr2', amount: 11_500,
      correlationId: 'corr-dr2', requestedAtIso: T, legType: 'door',
    });
    const strayEvent = strayDoor.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
    const notExpected = asRefusal(prepay.onProviderDoorPaymentEvent(strayEvent));
    expect(notExpected.reason).toBe('door_leg_not_expected');
    expect((notExpected.alert as PlatformEvent | null)?.payload).toMatchObject({ alert: 'door_confirmation_without_door_pending_order' });
  });

  it('alerts are DETERMINISTIC per webhook: the same refused delivery re-mints the same alert command_id (the sink dedupes on it)', () => {
    const quote = issuedQuote();
    const spine = spineAtPaymentPending(quote, 'dt1');
    const event = genuineWebhook(quote, 'dt1') as { payload: Record<string, unknown> };
    const tampered = { ...event, payload: { ...event.payload, amount: 1 } };
    const first = asRefusal(spine.onProviderPaymentEvent(tampered));
    const second = asRefusal(spine.onProviderPaymentEvent(tampered));
    expect(first.alert?.envelope.command_id).toBeDefined();
    expect(second.alert?.envelope.command_id).toBe(first.alert?.envelope.command_id);
  });
});

/* ─────────────────────────── the pass ─────────────────────────── */

function confirmedSpine(seed: string, mode: 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' = 'FULL_PREPAY'): { spine: OrderSpine; quote: Quote } {
  const quote = issuedQuote(mode);
  const spine = spineAtPaymentPending(quote, seed);
  if (!spine.onProviderPaymentEvent(genuineWebhook(quote, seed)).applied) throw new Error('setup webhook');
  if (!spine.confirmOrder({ command_id: `c-confirm-${seed}`, actor: 'a', serverTime: LATER(1) }).applied) throw new Error('setup confirm');
  return { spine, quote };
}

const scenariosOf = (alerts: readonly PlatformEvent[]) => alerts.map((a) => a.payload['alert']);

describe('E3 — reconcileOrder: the pass compares the records and names every divergence; a clean world is []', () => {
  it('a clean CONFIRMED order (with its Séra obligations) reconciles to [] — with and without provider records', () => {
    const { spine, quote } = confirmedSpine('cl1');
    const sera = new MockSeraEligibilityEmitter();
    sera.recordDelivered('ord-cl1');
    sera.requestValidation({ orderId: 'ord-cl1', correlationId: 'corr-cl1', deliveredAtIso: LATER(2) });
    for (const { event } of sera.eligibilityDeliveryPlan()) spine.onEligibilityEvent(event);
    expect(spine.ledger.obligationsFor('ord-cl1').length).toBe(2);
    const snapshot = spine.reconciliationSnapshot();
    expect(reconcileOrder(snapshot, { serverTime: LATER(5) })).toEqual([]);

    const provider: ProviderChargeRecord[] = [{
      collectRef: snapshot.escrow!.paymentLegs[0]!.collectRef,
      paymentAttemptId: 'pay-cl1',
      legType: 'checkout',
      amount: quote.amountPaidAtCheckout,
      status: 'held',
    }];
    expect(reconcileOrder(snapshot, { serverTime: LATER(5), providerRecords: provider })).toEqual([]);
  });

  it('CONFIRMED WITHOUT A FUNDED CHECKOUT LEG is named (Contract gate: no confirmed order without funded legs)', () => {
    const { spine } = confirmedSpine('cw1');
    const truth = spine.reconciliationSnapshot();
    const divergent: ReconciliationSnapshot = { ...truth, escrow: undefined };
    const alerts = reconcileOrder(divergent, { serverTime: LATER(5) });
    expect(scenariosOf(alerts)).toContain('confirmed_without_funded_checkout_leg');
  });

  it('ESCROW ON AN UNPAID ORDER is named — money recorded while the journey never reached paid', () => {
    const { spine } = confirmedSpine('eu1');
    const truth = spine.reconciliationSnapshot();
    const divergent: ReconciliationSnapshot = { ...truth, state: 'payment_failed' };
    const alerts = reconcileOrder(divergent, { serverTime: LATER(5) });
    expect(scenariosOf(alerts)).toContain('escrow_without_paid_order');
  });

  it('the DOOR projection diverging from the escrow record is named, in both directions', () => {
    const { spine } = confirmedSpine('dp1', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const truth = spine.reconciliationSnapshot();
    // 'paid' projection with no door leg recorded:
    const paidNoLeg: ReconciliationSnapshot = { ...truth, doorLeg: 'paid' };
    expect(scenariosOf(reconcileOrder(paidNoLeg, { serverTime: LATER(5) }))).toContain('door_projection_diverges_from_escrow');
    // clean 'due' state stays clean:
    expect(reconcileOrder(truth, { serverTime: LATER(5) })).toEqual([]);
  });

  it('OBLIGATIONS diverging from the immutable Quote are named — amounts and parties are COPIES, and a wrong copy is an alert', () => {
    const { spine, quote } = confirmedSpine('ob1');
    const truth = spine.reconciliationSnapshot();
    const good = spine.ledger.recordObligationsOnEligibility('ord-ob1', quote, 'supplier-1').obligations;
    const doctored = good.map((o) =>
      o.party.startsWith('reseller:') ? { ...o, amount: o.amount + 100 } : o,
    );
    const divergent: ReconciliationSnapshot = { ...truth, obligations: doctored };
    expect(scenariosOf(reconcileOrder(divergent, { serverTime: LATER(5) }))).toContain('obligation_diverges_from_quote');
    // …and obligations on a never-confirmed order are named too:
    const unconfirmed: ReconciliationSnapshot = { ...truth, state: 'paid', obligations: good };
    expect(scenariosOf(reconcileOrder(unconfirmed, { serverTime: LATER(5) }))).toContain('obligations_without_confirmed_order');
  });

  it('PROVIDER RECORDS vs the ledger: an unmatched provider charge, a phantom ledger leg, and a diverging amount are each named', () => {
    const { spine, quote } = confirmedSpine('pr1');
    const snapshot = spine.reconciliationSnapshot();
    const leg = snapshot.escrow!.paymentLegs[0]!;

    // The provider holds a charge this ledger never recorded (collect happened,
    // record lost — the E3 class the settlement report will surface):
    const extraCharge: ProviderChargeRecord[] = [
      { collectRef: leg.collectRef, paymentAttemptId: 'pay-pr1', legType: 'checkout', amount: quote.amountPaidAtCheckout, status: 'held' },
      { collectRef: 'collect-GHOST', paymentAttemptId: 'pay-ghost', legType: 'door', amount: 999, status: 'captured' },
    ];
    expect(scenariosOf(reconcileOrder(snapshot, { serverTime: LATER(5), providerRecords: extraCharge })))
      .toContain('provider_charge_unmatched_in_ledger');

    // The ledger holds a leg the provider does not know (phantom record):
    expect(scenariosOf(reconcileOrder(snapshot, { serverTime: LATER(5), providerRecords: [] })))
      .toContain('ledger_leg_unmatched_at_provider');

    // Same collectRef, different figure — the franc-exact copy diverged:
    const wrongAmount: ProviderChargeRecord[] = [
      { collectRef: leg.collectRef, paymentAttemptId: 'pay-pr1', legType: 'checkout', amount: leg.amount + 1, status: 'held' },
    ];
    expect(scenariosOf(reconcileOrder(snapshot, { serverTime: LATER(5), providerRecords: wrongAmount })))
      .toContain('provider_amount_diverges_from_ledger');
  });

  it('every alert the pass mints is a canonical reconciliation.alert.v1 with a deterministic command_id', () => {
    const { spine } = confirmedSpine('cn1');
    const divergent: ReconciliationSnapshot = { ...spine.reconciliationSnapshot(), escrow: undefined };
    const first = reconcileOrder(divergent, { serverTime: LATER(5) });
    const second = reconcileOrder(divergent, { serverTime: LATER(6) });
    expect(first.length).toBeGreaterThan(0);
    for (const alert of first) expect(alert.name).toBe('reconciliation.alert.v1');
    expect(first.map((a) => a.envelope.command_id)).toEqual(second.map((a) => a.envelope.command_id));
  });
});
