import { describe, expect, it } from 'vitest';
import {
  DeadLetterQueue,
  OrderSpine,
  ProblemReportBook,
  WORKED_BASELINE_INPUT,
  decideReservation,
  issueQuote,
  reservationReconciliationAlert,
  type ReservationState,
} from '../src/index.js';

const T = '2026-07-10T12:00:00.000Z';
const LATER = (mins: number) => new Date(Date.parse(T) + mins * 60_000).toISOString();
const flags = { version: 'e2-test', flags: {}, kills: [], killedCategories: [] };

function freshSpine(seed: string): OrderSpine {
  const issued = issueQuote(
    { flags, now: () => new Date(T), newId: () => `quote-${seed}` },
    { listingRef: 'lst-1', offerRef: 'offer-1', attributionResellerId: 'rs-1', ...WORKED_BASELINE_INPUT },
  );
  if (!issued.ok) throw new Error('quote refused');
  return new OrderSpine({
    quote: issued.quote,
    supplierRef: 'sup-1',
    correlationId: `corr-${seed}`,
    issueCommandId: `issue-${seed}`,
    actor: 'commerce-core:e2',
    serverTime: T,
  });
}

function toPaymentPending(spine: OrderSpine, seed: string): void {
  spine.advance({ command_id: `rsv-${seed}`, actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: `res-${seed}` } });
  spine.advance({ command_id: `pay-${seed}`, actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: `att-${seed}-1`, order_id: `order-${seed}` } });
}

describe('E2 scenario #1 — payment failure: the release is the rule, the alert is the net', () => {
  it('payment_pending → payment_failed (canonical enum member), reason recorded', () => {
    const spine = freshSpine('pf1');
    toPaymentPending(spine, 'pf1');
    const failed = spine.failPayment({ command_id: 'fail-1', actor: 'a', serverTime: LATER(1), reason: 'charge_timeout' });
    expect(failed.ok).toBe(true);
    expect(spine.journey.state).toBe('payment_failed');
    expect(spine.lastPaymentFailure).toEqual({ reason: 'charge_timeout', at: LATER(1) });
  });

  it('the reservation releases IMMEDIATELY on failure — no TTL wait, idempotent, stock-clean', () => {
    let res: ReservationState = { status: 'none' };
    const reserved = decideReservation(res, { kind: 'reserve', command_id: 'r1', quoteId: 'q1', holderRef: 'b1', nowIso: T, newReservationId: 'res-1' });
    if (!reserved.ok) throw new Error('reserve failed');
    res = reserved.state;
    // BEFORE the 2-minute TTL: release must not wait it out.
    const released = decideReservation(res, { kind: 'release', command_id: 'rel-1', quoteId: 'q1', nowIso: LATER(1), reason: 'payment_failed' });
    expect(released.ok && released.state.status === 'released').toBe(true);
    if (!released.ok) return;
    const replay = decideReservation(released.state, { kind: 'release', command_id: 'rel-1', quoteId: 'q1', nowIso: LATER(2), reason: 'payment_failed' });
    expect(replay.ok && 'idempotentReplay' in replay && replay.idempotentReplay).toBe(true);
    // a released slot is re-reservable — stock returned
    const again = decideReservation(released.state, { kind: 'reserve', command_id: 'r2', quoteId: 'q1', holderRef: 'b2', nowIso: LATER(2), newReservationId: 'res-2' });
    expect(again.ok).toBe(true);
  });

  it('a CONFIRMED reservation refuses release (un-confirming is the E3 saga)', () => {
    let res: ReservationState = { status: 'none' };
    const reserved = decideReservation(res, { kind: 'reserve', command_id: 'r1', quoteId: 'q1', holderRef: 'b1', nowIso: T, newReservationId: 'res-1' });
    if (!reserved.ok) throw new Error('reserve failed');
    const confirmed = decideReservation(reserved.state, { kind: 'confirm', command_id: 'c1', quoteId: 'q1', nowIso: T });
    if (!confirmed.ok) throw new Error('confirm failed');
    const release = decideReservation(confirmed.state, { kind: 'release', command_id: 'rel-1', quoteId: 'q1', nowIso: T, reason: 'cancelled' });
    expect(release.ok).toBe(false);
    if (!release.ok) expect(release.reason).toBe('already_confirmed');
  });

  it('SAFETY NET: a reservation still held after payment failure yields reconciliation.alert.v1', () => {
    const spine = freshSpine('pf2');
    toPaymentPending(spine, 'pf2');
    spine.failPayment({ command_id: 'fail-2', actor: 'a', serverTime: LATER(1), reason: 'charge_rejected' });
    const heldReservation: ReservationState = {
      status: 'reserved', quoteId: 'quote-pf2', reservationId: 'res-pf2', holderRef: 'b',
      reserveCommandId: 'r', expiresAt: LATER(2),
    };
    const alert = reservationReconciliationAlert(spine, heldReservation, { serverTime: LATER(3) });
    expect(alert).not.toBeNull();
    expect(alert!.name).toBe('reconciliation.alert.v1');
    expect(alert!.payload['alert']).toBe('reservation_held_after_payment_failure');
    // clean world → no alert
    const released: ReservationState = { status: 'released', quoteId: 'quote-pf2', priorReservationId: 'res-pf2' };
    expect(reservationReconciliationAlert(spine, released, { serverTime: LATER(3) })).toBeNull();
  });

  it('RETRY needs a genuinely new attempt id; the prior id is audited, never silently replaced', () => {
    const spine = freshSpine('pf3');
    toPaymentPending(spine, 'pf3');
    spine.failPayment({ command_id: 'fail-3', actor: 'a', serverTime: LATER(1), reason: 'webhook_never_arrived' });
    const reusedId = spine.retryPayment({ command_id: 'retry-bad', actor: 'a', serverTime: LATER(2), newPaymentAttemptId: 'att-pf3-1' });
    expect(reusedId.ok).toBe(false);
    if (!reusedId.ok) expect(reusedId.reason).toBe('retry_requires_new_attempt_id');
    const retried = spine.retryPayment({ command_id: 'retry-1', actor: 'a', serverTime: LATER(2), newPaymentAttemptId: 'att-pf3-2' });
    expect(retried.ok).toBe(true);
    expect(spine.journey.state).toBe('payment_pending');
    expect(spine.journey.chain.payment_attempt_id).toBe('att-pf3-2');
    expect(spine.journey.priorPaymentAttemptIds).toEqual(['att-pf3-1']);
    if (retried.ok) expect(retried.event.payload['previous_payment_attempt_id']).toBe('att-pf3-1');
  });
});

describe('E2 cancellation — pre-payment allowed; post-payment refuses closed (refund is E3)', () => {
  it('cancels cleanly from reserved (pre-payment) and from payment_failed (abandon)', () => {
    const a = freshSpine('c1');
    a.advance({ command_id: 'r', actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-c1' } });
    const cancelled = a.cancelOrder({ command_id: 'x', actor: 'buyer', serverTime: LATER(1) });
    expect(cancelled.ok).toBe(true);
    expect(a.journey.state).toBe('cancelled');

    const b = freshSpine('c2');
    toPaymentPending(b, 'c2');
    b.failPayment({ command_id: 'f', actor: 'a', serverTime: LATER(1), reason: 'charge_timeout' });
    const abandoned = b.cancelOrder({ command_id: 'x2', actor: 'buyer', serverTime: LATER(2) });
    expect(abandoned.ok).toBe(true);
    expect(b.journey.state).toBe('cancelled');
  });

  it('REFUSES CLOSED once money has moved: paid/confirmed → refund_required_e3, money records untouched', () => {
    const spine = freshSpine('c3');
    toPaymentPending(spine, 'c3');
    const webhook = {
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: { command_id: 'whk-c3', correlation_id: 'corr-c3', aggregateVersion: 1, actor: 'payment-provider:sandbox', serverTime: LATER(1), version: '1' },
      payload: { provider: 'sandbox-provider', payment_attempt_id: 'att-c3-1', collectRef: 'col-c3', amount: 12_500, fee: 0, status: 'held', order_id: 'order-c3', redelivery: 0 },
    };
    expect(spine.onProviderPaymentEvent(webhook)).toEqual({ applied: true, duplicate: false });
    const escrowBefore = JSON.stringify(spine.ledger.escrowFor('order-c3'));

    const refusedPaid = spine.cancelOrder({ command_id: 'x3', actor: 'buyer', serverTime: LATER(2) });
    expect(refusedPaid.ok).toBe(false);
    if (!refusedPaid.ok) expect(refusedPaid.reason).toBe('refund_required_e3');
    expect(spine.journey.state).toBe('paid');
    expect(JSON.stringify(spine.ledger.escrowFor('order-c3'))).toBe(escrowBefore); // no money mutation

    const confirmed = spine.confirmOrder({ command_id: 'cf3', actor: 'a', serverTime: LATER(3) });
    expect(confirmed.applied).toBe(true);
    const refusedConfirmed = spine.cancelOrder({ command_id: 'x4', actor: 'buyer', serverTime: LATER(4) });
    expect(refusedConfirmed.ok).toBe(false);
    if (!refusedConfirmed.ok) expect(refusedConfirmed.reason).toBe('refund_required_e3');
    expect(JSON.stringify(spine.ledger.escrowFor('order-c3'))).toBe(escrowBefore);
  });

  it('refunded is UNREACHABLE at E2 — no transition path in', () => {
    const spine = freshSpine('c4');
    toPaymentPending(spine, 'c4');
    const attempt = spine.advance({ command_id: 'x5', actor: 'a', serverTime: LATER(1), to: 'refunded' });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.reason).toBe('out_of_order');
  });
});

describe('E2 problem path — a structured record that NEVER moves money', () => {
  it('creates the record on canon §6.4 reason codes, emits incident.opened.v1, idempotent', () => {
    const book = new ProblemReportBook();
    const out = book.report({
      command_id: 'pr-1', correlationId: 'corr-p1', orderId: 'order-p1',
      reasonCode: 'unusable_location', humanReasonRef: 'order.problem.ack', note: 'Portail fermé', at: T, actor: 'buyer:pwa',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.event.name).toBe('incident.opened.v1');
    expect(out.report.reasonCode).toBe('unusable_location');
    const replay = book.report({
      command_id: 'pr-1', correlationId: 'corr-p1', orderId: 'order-p1',
      reasonCode: 'unusable_location', humanReasonRef: 'order.problem.ack', at: T, actor: 'buyer:pwa',
    });
    expect(replay.ok && replay.duplicate).toBe(true);
    expect(book.reportsFor('order-p1')).toHaveLength(1);
  });

  it('refuses an unknown reason code (derived vocabulary only)', () => {
    const book = new ProblemReportBook();
    const out = book.report({
      command_id: 'pr-2', correlationId: 'c', orderId: 'o', reasonCode: 'bad_vibes',
      humanReasonRef: 'order.problem.ack', at: T, actor: 'buyer:pwa',
    });
    expect(out.ok).toBe(false);
  });

  it('reporting a problem changes NO obligation and NO escrow on a confirmed order', () => {
    const spine = freshSpine('p2');
    toPaymentPending(spine, 'p2');
    spine.onProviderPaymentEvent({
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: { command_id: 'whk-p2', correlation_id: 'corr-p2', aggregateVersion: 1, actor: 'payment-provider:sandbox', serverTime: T, version: '1' },
      payload: { provider: 'sandbox-provider', payment_attempt_id: 'att-p2-1', collectRef: 'col-p2', amount: 12_500, fee: 0, status: 'held', order_id: 'order-p2', redelivery: 0 },
    });
    spine.confirmOrder({ command_id: 'cf', actor: 'a', serverTime: T });
    const before = JSON.stringify([spine.ledger.escrowFor('order-p2'), spine.ledger.obligationsFor('order-p2')]);
    const book = new ProblemReportBook();
    book.report({ command_id: 'pr-3', correlationId: 'corr-p2', orderId: 'order-p2', reasonCode: 'change_of_mind', humanReasonRef: 'order.problem.ack', at: T, actor: 'buyer:pwa' });
    expect(JSON.stringify([spine.ledger.escrowFor('order-p2'), spine.ledger.obligationsFor('order-p2')])).toBe(before);
  });
});

describe('E2 stuck-saga seed — clock-controlled, once, versioned TTL', () => {
  const POLICY = { version: 'stuck-ttl.v1', paymentPendingTtlMs: 15 * 60_000 };

  it('payment_pending younger than the TTL: silent; older: exactly one saga.stuck.v1', () => {
    const spine = freshSpine('s1');
    toPaymentPending(spine, 's1');
    expect(spine.checkStuckSaga(LATER(10), POLICY)).toBeNull();
    const stuck = spine.checkStuckSaga(LATER(16), POLICY);
    expect(stuck).not.toBeNull();
    expect(stuck!.name).toBe('saga.stuck.v1');
    expect(stuck!.payload['stuck_in']).toBe('payment_pending');
    expect(stuck!.payload['ttl_policy_version']).toBe('stuck-ttl.v1');
    expect(spine.checkStuckSaga(LATER(20), POLICY)).toBeNull(); // once
  });

  it('a resolved saga never alerts: paid orders are not stuck', () => {
    const spine = freshSpine('s2');
    toPaymentPending(spine, 's2');
    spine.onProviderPaymentEvent({
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: { command_id: 'whk-s2', correlation_id: 'corr-s2', aggregateVersion: 1, actor: 'payment-provider:sandbox', serverTime: LATER(1), version: '1' },
      payload: { provider: 'sandbox-provider', payment_attempt_id: 'att-s2-1', collectRef: 'col-s2', amount: 12_500, fee: 0, status: 'held', order_id: 'order-s2', redelivery: 0 },
    });
    expect(spine.checkStuckSaga(LATER(60), POLICY)).toBeNull();
  });
});

describe('E2 DLQ seed — poison parks byte-exact, nothing dropped silently', () => {
  it('schema-invalid JSON parks with the ORIGINAL BYTES preserved exactly', () => {
    const dlq = new DeadLetterQueue();
    // deliberately weird spacing + unicode + key order — bytes must survive untouched
    const poison = '{ "name":"payment.checkout_leg_confirmed.v1" ,"envelope": {"command_id":"x"}, "extra": "Boutik+ × Shop+ × Séra" }';
    const out = dlq.parkIfPoison(poison, { correlationId: 'corr-d1', at: T });
    expect(out.poison).toBe(true);
    expect(out.entry!.original).toBe(poison); // byte-exact, not re-serialized
    expect(out.event!.name).toBe('dlq.parked.v1');
    expect(out.event!.payload['original_sha256']).toBe(out.entry!.originalSha256);
    expect(dlq.parked()).toHaveLength(1);
  });

  it('non-JSON parks too — a truncated storm survivor is never dropped', () => {
    const dlq = new DeadLetterQueue();
    const torn = '{"name":"order.confir'; // truncated mid-flight
    const out = dlq.parkIfPoison(torn, { correlationId: 'corr-d2', at: T });
    expect(out.poison).toBe(true);
    expect(out.entry!.original).toBe(torn);
    expect(out.entry!.reason).toBe('not_json');
  });

  it('a healthy canonical event does NOT park', () => {
    const dlq = new DeadLetterQueue();
    const healthy = JSON.stringify({
      name: 'order.confirmed.v1',
      envelope: { command_id: 'c', correlation_id: 'x', aggregateVersion: 1, actor: 'a', serverTime: T, version: '1' },
      payload: {},
    });
    expect(dlq.parkIfPoison(healthy, { correlationId: 'x', at: T }).poison).toBe(false);
    expect(dlq.parked()).toHaveLength(0);
  });
});
