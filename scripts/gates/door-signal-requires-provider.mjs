#!/usr/bin/env node
// GATE (WO-2.5; SE-I11 shop-side half): "custody→customer ONLY after
// provider-confirmed door payment" — shop's half is that NO door-paid signal
// exists without a provider confirmation. This gate replays a fixture's
// timeline through the REAL OrderSpine and the REAL provider mock, then
// compares the fixture's CLAIMS against what the real code produced. A
// fixture claiming a signal that the real spine never emitted (e.g. a
// locally-asserted door payment) contradicts the real code — exit 1.
import { readFileSync } from 'node:fs';
import {
  MockPaymentProvider,
  OrderSpine,
  PAY_AT_DOOR_POLICY_DEFAULTS,
  WORKED_BASELINE_INPUT,
  issueQuote,
} from '@shop-plus/commerce-core';

const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error('usage: door-signal-requires-provider.mjs <fixture.json>');
  process.exit(2);
}
const fx = JSON.parse(readFileSync(fixturePath, 'utf8'));

const T = '2026-07-10T12:00:00.000Z';
const flags = { version: 'e2-sandbox', flags: {}, kills: [], killedCategories: [] };
const issued = issueQuote(
  { flags, now: () => new Date(T), newId: () => 'quote-gate-b' },
  {
    listingRef: 'lst-b', offerRef: 'offer-b', attributionResellerId: 'reseller-b',
    ...WORKED_BASELINE_INPUT, paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
    payAtDoor: {
      eligibility: { buyerRef: 'buyer-b', state: 'allowed', buyerRefusalCount: 0, buyerRiskState: 'normal', requiredDeposit: 0 },
      sellerTier: 'verified', category: 'fashion_bags_fabrics', zoneTo: 'gate-zone',
      policy: { ...PAY_AT_DOOR_POLICY_DEFAULTS, version: `${PAY_AT_DOOR_POLICY_DEFAULTS.version}+gate-zone`, networkReliableZones: ['gate-zone'] },
    },
    nowIso: T,
  },
);
if (!issued.ok) { console.error(`gate setup: quote refused ${issued.reason}`); process.exit(2); }
const quote = issued.quote;
const spine = new OrderSpine({
  quote, supplierRef: 'supplier-b', correlationId: 'corr-gate-b',
  issueCommandId: 'c-issue', actor: 'commerce-core:gate', serverTime: T,
});
const provider = new MockPaymentProvider();

for (const step of fx.timeline) {
  switch (step.step) {
    case 'confirm_option_b_order': {
      spine.advance({ command_id: 'c-res', actor: 'commerce-core:gate', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-gate-b' } });
      spine.advance({ command_id: 'c-pay', actor: 'commerce-core:gate', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'att-gate-b', order_id: 'order-gate-b' } });
      provider.initiateCharge({ orderId: 'order-gate-b', paymentAttemptId: 'att-gate-b', amount: quote.amountPaidAtCheckout, correlationId: 'corr-gate-b', requestedAtIso: T, legType: 'checkout' });
      const paid = spine.onProviderPaymentEvent(provider.webhookDeliveryPlan()[0].event);
      if (!paid.applied) { console.error(`gate setup: checkout webhook refused ${paid.reason}`); process.exit(2); }
      const confirmed = spine.confirmOrder({ command_id: 'c-confirm', actor: 'commerce-core:gate', serverTime: T });
      if (!confirmed.applied) { console.error(`gate setup: confirm refused ${confirmed.reason}`); process.exit(2); }
      break;
    }
    case 'provider_door_confirmation': {
      provider.initiateCharge({ orderId: 'order-gate-b', paymentAttemptId: 'door-gate-b', amount: step.amount, correlationId: 'corr-gate-b', requestedAtIso: T, legType: 'door' });
      const webhook = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1');
      spine.onProviderDoorPaymentEvent(webhook.event);
      break;
    }
    case 'local_assert_door_paid': {
      // The tampering arm: NOT a provider event — the real consumer refuses.
      spine.onProviderDoorPaymentEvent({ locally_asserted: true, amount: step.amount, by: 'rider:app' });
      break;
    }
    default:
      console.error(`unknown timeline step '${step.step}'`);
      process.exit(2);
  }
}

const realDoorPaid = spine.doorLegState === 'paid';
const realSignal = spine.doorPaidSignal !== undefined;
if (fx.claims.signalEmitted && !realSignal) {
  console.error(
    'VIOLATION (SE-I11 shop-side): the fixture claims a door-paid signal, but the REAL spine emitted none — ' +
    `no provider confirmation in the timeline reached it (doorLeg=${spine.doorLegState})`,
  );
  process.exit(1);
}
if (fx.claims.doorPaid && !realDoorPaid) {
  console.error('VIOLATION (SE-I11 shop-side): the fixture claims door-paid, but the REAL door leg is ' + spine.doorLegState);
  process.exit(1);
}
if (!fx.claims.signalEmitted && realSignal) {
  console.error('fixture under-claims: the real spine DID emit the signal — fixture out of date');
  process.exit(2);
}
console.log(
  `OK: claims match the real code — doorPaid=${realDoorPaid}, signal=${realSignal ? spine.doorPaidSignal.name : 'none'}; ` +
  'the signal exists only downstream of a provider door confirmation',
);
process.exit(0);
