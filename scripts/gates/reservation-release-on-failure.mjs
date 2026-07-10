#!/usr/bin/env node
// GATE (WO-2.3, Contract E2 scenario #1): after a payment failure the
// reservation MUST be released — and if one is ever caught still held, the
// reconciliation.alert.v1 safety net MUST have fired. A fixture showing
// payment_failed with a held reservation and NO alert is the outage the
// Contract names ("a reservation stays held after payment failure") going
// unnoticed — this gate refuses it, exit 1.
import { readFileSync } from 'node:fs';

const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error('usage: reservation-release-on-failure.mjs <fixture.json>');
  process.exit(2);
}
const fx = JSON.parse(readFileSync(fixturePath, 'utf8'));

if (fx.journey.state !== 'payment_failed') {
  console.error(`fixture is not a payment-failed journey (state: ${fx.journey.state})`);
  process.exit(2);
}
const released = fx.reservation.status === 'released';
const alertFired = (fx.events ?? []).some(
  (e) => e.name === 'reconciliation.alert.v1' && e.payload?.alert === 'reservation_held_after_payment_failure',
);
if (released) {
  console.log(`OK: payment failed and the reservation released cleanly (release is the rule; releaseReason=${fx.reservation.releaseReason ?? 'ttl'})`);
  process.exit(0);
}
if (alertFired) {
  console.log('OK (degraded): reservation still held BUT reconciliation.alert.v1 fired — the safety net caught it');
  process.exit(0);
}
console.error('VIOLATION (Contract §6): a reservation stays held after payment failure and NO reconciliation alert fired');
console.error(`  reservation: ${JSON.stringify(fx.reservation)}`);
process.exit(1);
