import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJsonStringify } from '@platform/contracts';

/**
 * Signed attribution-token verify STUB (SP-I09 / SP2.1) — TEST keys only,
 * no real keys at this slice (WO-SP0.1 OUT OF SCOPE). The one property that
 * is already load-bearing: **tamper fails CLOSED.** A failed verification
 * carries NO reseller id and no fallback to supplier/platform — the caller
 * gets a refusal, never a substitute attribution (FORBIDDEN list).
 */

export interface AttributionTokenPayload {
  resellerId: string;
  scope: 'listing' | 'store' | 'campaign';
  scopeRef: string;
  issuedAt: string;
  expiresAt: string;
  version: 'v1';
}

export interface SignedAttributionToken {
  payload: AttributionTokenPayload;
  signature: string; // hex HMAC-SHA256 over canonical JSON of payload
}

export type AttributionVerdict =
  | { ok: true; resellerId: string }
  | { ok: false; reason: 'bad_signature' | 'expired' | 'malformed' };
// NOTE the shape: the failure branch has NO resellerId field at all.

export function signAttributionToken(
  payload: AttributionTokenPayload,
  key: string,
): SignedAttributionToken {
  const signature = createHmac('sha256', key)
    .update(canonicalJsonStringify(payload))
    .digest('hex');
  return { payload, signature };
}

export function verifyAttributionToken(
  token: SignedAttributionToken,
  key: string,
  now: Date,
): AttributionVerdict {
  if (
    typeof token?.payload?.resellerId !== 'string' ||
    token.payload.resellerId.length === 0 ||
    typeof token.signature !== 'string'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const expected = createHmac('sha256', key)
    .update(canonicalJsonStringify(token.payload))
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(token.signature, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (new Date(token.payload.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, resellerId: token.payload.resellerId };
}
