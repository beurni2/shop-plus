#!/usr/bin/env node
// GATE (WO-2.3; SP-I01 first-lock-wins): replays a checkout's attribution
// timeline through the REAL AttributionLockBook and compares the fixture's
// claimed final lock against what the real code produces. A fixture claiming
// a re-attribution (the lock moving to a later token) contradicts the real
// book — exit 1. No silent re-attribution can hide behind a fixture.
import { readFileSync } from 'node:fs';
import { AttributionLockBook } from '../../services/attribution-service/dist/lock.js';
import { signAttributionToken } from '../../services/attribution-service/dist/attribution.js';

const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error('usage: attribution-lock-first-wins.mjs <fixture.json>');
  process.exit(2);
}
const fx = JSON.parse(readFileSync(fixturePath, 'utf8'));
const KEY = 'gate-test-key';

const book = new AttributionLockBook();
let collisions = 0;
for (const step of fx.timeline) {
  const token = signAttributionToken(
    {
      id: step.tokenId,
      resellerId: step.resellerId,
      scope: { kind: 'listing', refId: fx.listingRef },
      issued: fx.at,
      expiry: '2099-01-01T00:00:00.000Z',
      version: 'v1',
    },
    KEY,
  );
  const out = book.lock({ checkoutRef: fx.checkoutRef, correlationId: fx.correlationId, token, at: fx.at });
  if (!out.ok) collisions += 1;
}
const realLock = book.lockFor(fx.checkoutRef);
if (!realLock) {
  console.error('VIOLATION: no lock exists after the timeline');
  process.exit(1);
}
if (realLock.resellerId !== fx.claimedFinalResellerId) {
  console.error(
    `VIOLATION (SP-I01): fixture claims the lock ended on ${fx.claimedFinalResellerId}, but FIRST LOCK WINS — the real book holds ${realLock.resellerId} (collisions refused: ${collisions})`,
  );
  process.exit(1);
}
console.log(
  `OK: first lock wins — locked to ${realLock.resellerId} (token ${realLock.tokenId}); ${collisions} later valid token(s) refused, lock never moved`,
);
process.exit(0);
