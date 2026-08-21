import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  AttributionTokenSchema,
  canonicalJsonStringify,
  type AttributionToken,
} from '@platform/contracts';

/**
 * Signed attribution-token sign/verify (SP-I09 / SP2.1). The token IS the
 * canonical §5.6 AttributionToken from the pin — no local shape, no drifted
 * spellings; the signature is HMAC-SHA256 over the canonical JSON of the
 * token minus its `signature` field.
 *
 * ═══ C3 (audit) — THE KEYING MODEL, RESOLVED (2026-08-21) ═══
 *
 * The audit's bound was « resolve keying before the Real-Money Gate ». The
 * model, decided and recorded here because this module is what it governs:
 *
 *  · THE KEY IS A WRANGLER SECRET — `ATTRIBUTION_SIGNING_SECRET`, set by the
 *    founder alone (`wrangler secret put`, piped), never `[vars]` (the repos
 *    are public), never bundled into any app. Both `key` parameters below are
 *    already injection points: the caller passes the env value; nothing here
 *    reads a key from anywhere.
 *  · MINTING IS SERVER-SIDE ONLY, on the storefront Worker (Shop+ owns
 *    Storefront & Attribution, Build Spec §5.2) at the moment a share surface
 *    asks for a signed product link. A key in the app bundle would be the E1
 *    write-key posture applied to attribution — every phone able to mint
 *    arbitrary attributions — which tamper-fails-closed exists to prevent.
 *  · ROTATION IS RE-ISSUE, not dual-key verify: tokens carry `issued`/`expiry`
 *    and are short-lived next to the 30-day arrival TTL, so a rotated secret
 *    simply expires the old population; a token signed under the old key
 *    refuses `bad_signature` — a CLOSED refusal, the correct direction.
 *  · UNSET ⇒ NOTHING MINTS and every presented token refuses — fail closed,
 *    the same deploy-order shape every other secret on the Worker keeps.
 *
 * The wiring itself lands with SP5 (signed product links on the live wire —
 * today's live attribution is the spec's `identity` scope, deliberately
 * unsigned per §4.1). TEST keys remain confined to tests.
 *
 * The one property already load-bearing: **tamper fails CLOSED.** A failed
 * verification carries NO reseller id and no fallback to supplier/platform —
 * the caller gets a refusal, never a substitute attribution (FORBIDDEN
 * list). Unparseable tokens and garbage expiry dates are ALSO closed
 * refusals — nothing about a token is ever repaired or defaulted.
 */

export type UnsignedAttributionToken = Omit<AttributionToken, 'signature'>;

export type AttributionVerdict =
  | { ok: true; resellerId: string }
  | { ok: false; reason: 'bad_signature' | 'expired' | 'malformed' };
// NOTE the shape: the failure branch has NO resellerId field at all.

function signatureOver(unsigned: UnsignedAttributionToken, key: string): string {
  return createHmac('sha256', key).update(canonicalJsonStringify(unsigned)).digest('hex');
}

export function signAttributionToken(
  unsigned: UnsignedAttributionToken,
  key: string,
): AttributionToken {
  return AttributionTokenSchema.parse({
    ...unsigned,
    signature: signatureOver(unsigned, key),
  });
}

export function verifyAttributionToken(
  token: unknown,
  key: string,
  now: Date,
): AttributionVerdict {
  const parsed = AttributionTokenSchema.safeParse(token);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed' };
  }
  const { signature, ...unsigned } = parsed.data;
  const expected = Buffer.from(signatureOver(unsigned, key), 'hex');
  const presented = Buffer.from(signature, 'hex');
  if (
    expected.length === 0 ||
    expected.length !== presented.length ||
    !timingSafeEqual(expected, presented)
  ) {
    return { ok: false, reason: 'bad_signature' };
  }
  const expiryMs = new Date(parsed.data.expiry).getTime();
  if (!Number.isFinite(expiryMs)) {
    // a validly-signed token with a garbage expiry is still a refusal —
    // fails closed, never fails open (verifier finding NB-1)
    return { ok: false, reason: 'malformed' };
  }
  if (expiryMs <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, resellerId: parsed.data.resellerId };
}
