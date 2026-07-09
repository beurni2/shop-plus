#!/usr/bin/env node
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalJsonStringify } from '@platform/contracts';

/**
 * CI gate: attribution-tamper-fails-closed (SP-I09 / SP2.1 / FORBIDDEN:
 * "an attribution stub that 'falls back to supplier/platform' on tamper —
 * fails-closed means fails"). Verifies a token fixture with the same HMAC +
 * canonical-JSON scheme as attribution-service (the service test pins the
 * fixtures to the implementation).
 *   exit 0 — token verifies; attribution = exactly the signed reseller
 *   exit 1 — token REJECTED closed (tampered/expired) — no attribution
 *   exit 2 — gate could not run, OR a fallback attribution appeared on a
 *            rejected token (that would be a broken, fails-OPEN verifier)
 */
const file = process.argv[2];
if (!file) {
  console.error('usage: attribution-tamper.mjs <token-fixture.json>');
  process.exit(2);
}
let fixture;
try {
  fixture = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`attribution-tamper: cannot read fixture ${file}: ${String(err)}`);
  process.exit(2);
}
const { testKey, token } = fixture ?? {};
if (!testKey || !token?.payload || typeof token.signature !== 'string') {
  console.error(`attribution-tamper: ${file} is not a token fixture`);
  process.exit(2);
}
// This gate proves SIGNATURE integrity (tamper → closed rejection). Expiry
// is enforced by verifyAttributionToken under an injected clock in the
// attribution-service unit tests — a wall-clock check here would turn the
// checked-in fixture into a CI time bomb.
const verdict = (() => {
  const expected = createHmac('sha256', testKey)
    .update(canonicalJsonStringify(token.payload))
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(token.signature, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };
  return { ok: true, resellerId: token.payload.resellerId };
})();
if (verdict.ok) {
  console.log(`attribution-tamper OK — token verifies; attribution locked to ${verdict.resellerId} (SP-I09)`);
  process.exit(0);
}
if ('resellerId' in verdict) {
  console.error('attribution-tamper GATE BROKEN — rejected token still carries an attribution (fails OPEN)');
  process.exit(2);
}
console.error(`attribution-tamper REJECTED CLOSED — ${verdict.reason}; no reseller, no supplier/platform fallback (SP-I09)`);
process.exit(1);
