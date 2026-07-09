import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  AttributionTokenSchema,
  canonicalJsonStringify,
  type AttributionToken,
} from '@platform/contracts';

/**
 * Signed attribution-token verify STUB (SP-I09 / SP2.1) — TEST keys only,
 * no real keys at this slice (WO-SP0.1 OUT OF SCOPE). The token IS the
 * canonical §5.6 AttributionToken from the pin — no local shape, no drifted
 * spellings; the signature is HMAC-SHA256 over the canonical JSON of the
 * token minus its `signature` field.
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
