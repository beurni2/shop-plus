#!/usr/bin/env node
// WO-2.5 DoD: the Option-B door path through the REAL service path,
// deterministic ids/clock; --write-fixture regenerates the committed gate
// fixtures from this exact run. Every arm prints evidence:
//   1. the §6.1 eligibility gate — allowed AND the refused-closed negative
//   2. per-mode funded legs — the order confirms on its D-funded leg
//   3. the provider door confirmation → door state advances → THE signal
//   4. NEGATIVE: a locally-asserted door payment cannot reach the signal
//   5. a door confirmation for a NOT-door-pending order → reconciliation.alert.v1
import { writeFileSync } from 'node:fs';
import {
  MockPaymentProvider,
  OrderSpine,
  PAY_AT_DOOR_POLICY_DEFAULTS,
  WORKED_BASELINE_INPUT,
  issueQuote,
} from '@shop-plus/commerce-core';

const T = '2026-07-10T12:00:00.000Z';
const flags = { version: 'e2-sandbox', flags: {}, kills: [], killedCategories: [] };
const deps = { flags, now: () => new Date(T), newId: () => 'quote-b-0001' };

// The DEFAULT policy allowlists no zone (conservative); the run policy names
// one test zone so the positive path executes. ⏳ founder-tunable values.
const RUN_POLICY = {
  ...PAY_AT_DOOR_POLICY_DEFAULTS,
  version: `${PAY_AT_DOOR_POLICY_DEFAULTS.version}+e2-sandbox-zone`,
  networkReliableZones: ['ouaga-centre'],
};
const GATE_CONTEXT = {
  eligibility: { buyerRef: 'buyer-b-1', state: 'allowed', buyerRefusalCount: 0, buyerRiskState: 'normal', requiredDeposit: 0 },
  sellerTier: 'verified',
  category: 'fashion_bags_fabrics',
  zoneTo: 'ouaga-centre',
  policy: RUN_POLICY,
};
const INPUT = {
  listingRef: 'lst-b', offerRef: 'offer-b', attributionResellerId: 'reseller-b',
  ...WORKED_BASELINE_INPUT, paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
  payAtDoor: GATE_CONTEXT, nowIso: T,
};

console.log('=== E2 OPTION-B DOOR PATH — service-path evidence ===');

// 1a. NEGATIVE FIRST: the ineligible request refuses closed, no quote exists.
const refused = issueQuote(deps, { ...INPUT, payAtDoor: { ...GATE_CONTEXT, sellerTier: 'provisional' } });
if (refused.ok) { console.error('eligibility gate FAILED to refuse a provisional seller'); process.exit(1); }
console.log(`eligibility negative: refused closed — reason=${refused.reason} refusal=${refused.refusal} policy=${refused.policyVersion}`);
const refusedDefault = issueQuote(deps, { ...INPUT, payAtDoor: { ...GATE_CONTEXT, policy: undefined } });
if (refusedDefault.ok) { console.error('DEFAULT policy allowed a zone — conservative default broken'); process.exit(1); }
console.log(`shipped-default check: empty zone allowlist refuses (${refusedDefault.refusal}) — Option-B narrow by default`);

// 1b. The eligible request issues a reconciling Option-B quote.
const issued = issueQuote(deps, INPUT);
if (!issued.ok) { console.error('eligible quote refused:', issued.reason); process.exit(1); }
const quote = issued.quote;
console.log(`option-b quote: paid-now=${quote.amountPaidAtCheckout} (D) · due-at-door=${quote.amountDueAtDelivery} (productSubtotal) · buyerTotal=${quote.buyerTotal}`);

// 2. The spine to CONFIRMED on the D-funded checkout leg (real mock webhook).
const spine = new OrderSpine({
  quote, supplierRef: 'supplier-b', correlationId: 'corr-b-0001',
  issueCommandId: 'cmd-issue-b', actor: 'commerce-core:e2', serverTime: T,
});
spine.advance({ command_id: 'c-res', actor: 'commerce-core:e2', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-b-0001' } });
spine.advance({ command_id: 'c-pay', actor: 'commerce-core:e2', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'att-b-0001', order_id: 'order-b-0001' } });
const provider = new MockPaymentProvider();
provider.initiateCharge({ orderId: 'order-b-0001', paymentAttemptId: 'att-b-0001', amount: quote.amountPaidAtCheckout, correlationId: 'corr-b-0001', requestedAtIso: T, legType: 'checkout' });
const paid = spine.onProviderPaymentEvent(provider.webhookDeliveryPlan()[0].event);
if (!paid.applied) { console.error('checkout webhook refused:', paid.reason); process.exit(1); }
const confirmed = spine.confirmOrder({ command_id: 'c-confirm', actor: 'commerce-core:e2', serverTime: T });
if (!confirmed.applied) { console.error('confirm refused:', confirmed.reason); process.exit(1); }
console.log(`per-mode funded legs: confirmed on checkout leg of ${quote.amountPaidAtCheckout} F (doorLeg=${spine.doorLegState})`);

// 5 (before the real door payment). A door confirmation against a spine NOT
// door-pending → refuse + reconciliation.alert.v1 (Contract §6 class).
const strayProvider = new MockPaymentProvider();
const straySpineQuote = issueQuote({ ...deps, newId: () => 'quote-b-0002' }, INPUT);
const straySpine = new OrderSpine({
  quote: straySpineQuote.quote, supplierRef: 'supplier-b', correlationId: 'corr-b-0002',
  issueCommandId: 'cmd-issue-s', actor: 'commerce-core:e2', serverTime: T,
});
strayProvider.initiateCharge({ orderId: 'order-b-0002', paymentAttemptId: 'door-stray', amount: 11500, correlationId: 'corr-b-0002', requestedAtIso: T, legType: 'door' });
const stray = straySpine.onProviderDoorPaymentEvent(strayProvider.webhookDeliveryPlan()[0].event);
if (stray.applied || stray.reason !== 'door_leg_not_expected' || stray.alert?.name !== 'reconciliation.alert.v1') {
  console.error('mismatched door confirmation did NOT raise the alert'); process.exit(1);
}
console.log(`mismatched confirmation: refused (${stray.reason}) + ${stray.alert.name} payload.alert=${stray.alert.payload.alert}`);

// 4. NEGATIVE: locally-asserted door payment — no provider event, no signal.
const localAssert = spine.onProviderDoorPaymentEvent({ claim: 'rider says the buyer paid', amount: quote.amountDueAtDelivery });
if (localAssert.applied || spine.doorPaidSignal !== undefined || spine.doorLegState !== 'due') {
  console.error('a locally-asserted door payment reached the door state/signal'); process.exit(1);
}
console.log(`no-signal-without-confirmation: local assertion refused (${localAssert.reason}) — doorLeg still '${spine.doorLegState}', signal: none`);

// 3. The REAL provider door confirmation → door paid → THE signal.
provider.initiateCharge({ orderId: 'order-b-0001', paymentAttemptId: 'door-att-0001', amount: quote.amountDueAtDelivery, correlationId: 'corr-b-0001', requestedAtIso: T, legType: 'door' });
const doorWebhook = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1').event;
const door = spine.onProviderDoorPaymentEvent(doorWebhook);
if (!door.applied || !door.signal) { console.error('door confirmation refused:', door.reason); process.exit(1); }
const escrow = spine.ledger.escrowFor('order-b-0001');
console.log(`door leg confirmed: doorLeg=${spine.doorLegState} · escrow legs=[${escrow.paymentLegs.map((l) => `${l.legType}:${l.amount}:${l.status}`).join(', ')}] · txn stage=${escrow.status}`);
console.log(`door-paid signal: ${door.signal.name} chain={quote:${door.signal.payload.quote_id}, res:${door.signal.payload.reservation_id}, order:${door.signal.payload.order_id}} door_leg=${door.signal.payload.door_leg} amount_confirmed=${door.signal.payload.amount_due_at_delivery_confirmed}`);

if (process.argv.includes('--write-fixture')) {
  // Funded-legs positive (per-mode): the REAL confirmed Option-B world.
  writeFileSync('gates/fixtures/order-journey.option-b.happy.json', JSON.stringify({
    quote,
    order: { id: 'order-b-0001', status: 'confirmed' },
    escrow,
    doorSignal: door.signal,
    events: [],
  }, null, 2) + '\n');
  // Door-signal positive: the timeline the gate replays through REAL code.
  writeFileSync('gates/fixtures/door-signal.happy.json', JSON.stringify({
    claims: { doorPaid: true, signalEmitted: true },
    timeline: [
      { step: 'confirm_option_b_order' },
      { step: 'provider_door_confirmation', amount: quote.amountDueAtDelivery },
    ],
  }, null, 2) + '\n');
  console.log('fixtures written: gates/fixtures/order-journey.option-b.happy.json · gates/fixtures/door-signal.happy.json');
}
process.exit(0);
