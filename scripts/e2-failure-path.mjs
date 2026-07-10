#!/usr/bin/env node
// WO-2.3 DoD: the E2 failure paths through the REAL service path,
// deterministic ids/clock; --write-fixture regenerates the committed
// release-on-failure gate fixture from this exact run.
import { writeFileSync } from 'node:fs';
import {
  DeadLetterQueue,
  OrderSpine,
  ProblemReportBook,
  WORKED_BASELINE_INPUT,
  decideReservation,
  issueQuote,
  reservationReconciliationAlert,
} from '@shop-plus/commerce-core';

const T = '2026-07-10T12:00:00.000Z';
const AT = (m) => new Date(Date.parse(T) + m * 60_000).toISOString();
const flags = { version: 'e2-sandbox', flags: {}, kills: [], killedCategories: [] };

// 1. Quote → reserve → payment_pending (the road to the failure)
const issued = issueQuote(
  { flags, now: () => new Date(T), newId: () => 'quote-e2-0001' },
  { listingRef: 'lst-e2', offerRef: 'offer-e2', attributionResellerId: 'reseller-e2', ...WORKED_BASELINE_INPUT },
);
if (!issued.ok) { console.error('quote refused:', issued.reason); process.exit(1); }
let res = decideReservation({ status: 'none' }, {
  kind: 'reserve', command_id: 'cmd-reserve-e2', quoteId: issued.quote.id,
  holderRef: 'buyer-e2', nowIso: T, newReservationId: 'res-e2-0001',
});
if (!res.ok) { console.error('reserve refused'); process.exit(1); }
const spine = new OrderSpine({
  quote: issued.quote, supplierRef: 'supplier-e2', correlationId: 'corr-e2-0001',
  issueCommandId: 'cmd-issue-e2', actor: 'commerce-core:e2', serverTime: T,
});
spine.advance({ command_id: 'c-res', actor: 'commerce-core:e2', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-e2-0001' } });
spine.advance({ command_id: 'c-pay', actor: 'commerce-core:e2', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'att-e2-0001', order_id: 'order-e2-0001' } });

// 2. STUCK-SAGA SEED fires before anything resolves (clock-controlled)
const stuck = spine.checkStuckSaga(AT(16), { version: 'stuck-ttl.v1', paymentPendingTtlMs: 15 * 60_000 });
if (!stuck) { console.error('stuck-saga did not fire'); process.exit(1); }

// 3. PAYMENT FAILS → payment_failed → the reservation releases IMMEDIATELY
const failed = spine.failPayment({ command_id: 'c-fail', actor: 'commerce-core:e2', serverTime: AT(17), reason: 'webhook_never_arrived' });
if (!failed.ok) { console.error('failPayment refused'); process.exit(1); }
res = decideReservation(res.state, { kind: 'release', command_id: 'c-release', quoteId: issued.quote.id, nowIso: AT(17), reason: 'payment_failed' });
if (!res.ok || res.state.status !== 'released') { console.error('release refused'); process.exit(1); }
const alertOnClean = reservationReconciliationAlert(spine, res.state, { serverTime: AT(18) });
// snapshot the REAL failed+released world for the positive gate fixture
const fixtureSnapshot = {
  journey: { state: spine.journey.state, chain: { ...spine.journey.chain } },
  reservation: res.state,
  events: [],
};

// 4. RETRY with a NEW attempt → abandon → cancelled (the honest exits)
const retried = spine.retryPayment({ command_id: 'c-retry', actor: 'buyer:pwa', serverTime: AT(19), newPaymentAttemptId: 'att-e2-0002' });
if (!retried.ok) { console.error('retry refused'); process.exit(1); }
const failedAgain = spine.failPayment({ command_id: 'c-fail-2', actor: 'commerce-core:e2', serverTime: AT(20), reason: 'charge_rejected' });
if (!failedAgain.ok) { console.error('second fail refused'); process.exit(1); }
const abandoned = spine.cancelOrder({ command_id: 'c-abandon', actor: 'buyer:pwa', serverTime: AT(21) });
if (!abandoned.ok) { console.error('abandon refused'); process.exit(1); }

// 5. PROBLEM PATH + DLQ seeds
const problems = new ProblemReportBook();
const report = problems.report({
  command_id: 'c-problem', correlationId: 'corr-e2-0001', orderId: 'order-e2-0001',
  reasonCode: 'unusable_location', humanReasonRef: 'order.problem.ack', at: AT(22), actor: 'buyer:pwa',
});
if (!report.ok) { console.error('problem report refused'); process.exit(1); }
const dlq = new DeadLetterQueue();
const poison = '{"name":"payment.checkout_leg_confirmed.v1","envelope":{"command_id":"whk-torn"';
const parked = dlq.parkIfPoison(poison, { correlationId: 'corr-e2-0001', at: AT(23) });
if (!parked.poison || parked.entry.original !== poison) { console.error('DLQ failed byte-exact preservation'); process.exit(1); }

// ---- Evidence ----
console.log('=== E2 FAILURE PATH — service-path evidence ===');
console.log(`saga.stuck.v1 fired: pending_since=${stuck.payload.pending_since} ttl=${stuck.payload.ttl_policy_version}`);
console.log(`payment_failed reason: ${spine.lastPaymentFailure?.reason ?? 'n/a (post-abandon)'} · final state: ${spine.journey.state}`);
console.log(`reservation: released immediately (reason=payment_failed) · re-alert on clean world: ${alertOnClean === null ? 'none (correct)' : 'UNEXPECTED'}`);
console.log(`retry audit: prior attempts ${JSON.stringify(spine.journey.priorPaymentAttemptIds)} · final attempt att-e2-0002`);
console.log(`problem report: ${report.report.reportId} reason=${report.report.reasonCode} event=${report.event.name}`);
console.log(`dlq: parked ${parked.entry.parkId} sha256=${parked.entry.originalSha256.slice(0, 12)}… bytes preserved exactly: ${parked.entry.original === poison}`);

if (process.argv.includes('--write-fixture')) {
  // The POSITIVE gate fixture: the real failed+released world, captured live.
  writeFileSync('gates/fixtures/payment-fail-released.json', JSON.stringify(fixtureSnapshot, null, 2) + '\n');
  console.log('fixture written: gates/fixtures/payment-fail-released.json');
}
process.exit(0);
