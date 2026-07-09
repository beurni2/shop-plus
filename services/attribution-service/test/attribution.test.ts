import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  signAttributionToken,
  verifyAttributionToken,
  type AttributionTokenPayload,
} from '../src/attribution.js';

// CI gate: attribution-tamper-fails-closed (SP-I09, SP2.1). TEST key only.

const TEST_KEY = 'sp0.1-test-signing-key-NOT-A-REAL-KEY';
const now = new Date('2026-07-09T12:00:00Z');

const payload: AttributionTokenPayload = {
  resellerId: 'res_123',
  scope: 'listing',
  scopeRef: 'listing_456',
  issuedAt: '2026-07-09T00:00:00Z',
  expiresAt: '2026-08-09T00:00:00Z',
  version: 'v1',
};

describe('attribution-tamper-fails-closed', () => {
  it('a valid token verifies and yields exactly its reseller', () => {
    const token = signAttributionToken(payload, TEST_KEY);
    const verdict = verifyAttributionToken(token, TEST_KEY, now);
    expect(verdict).toEqual({ ok: true, resellerId: 'res_123' });
  });

  it('an altered payload is rejected CLOSED — no reseller id, no fallback', () => {
    const token = signAttributionToken(payload, TEST_KEY);
    const tampered = {
      ...token,
      payload: { ...token.payload, resellerId: 'res_ATTACKER' },
    };
    const verdict = verifyAttributionToken(tampered, TEST_KEY, now);
    expect(verdict.ok).toBe(false);
    expect(verdict).not.toHaveProperty('resellerId');
    expect(JSON.stringify(verdict)).not.toMatch(/supplier|platform|res_/);
  });

  it('an altered signature is rejected closed', () => {
    const token = signAttributionToken(payload, TEST_KEY);
    const tampered = { ...token, signature: token.signature.replace(/^./, '0') };
    const verdict = verifyAttributionToken(tampered, TEST_KEY, now);
    expect(verdict).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('an expired token is rejected closed', () => {
    const token = signAttributionToken(payload, TEST_KEY);
    const verdict = verifyAttributionToken(token, TEST_KEY, new Date('2026-09-01T00:00:00Z'));
    expect(verdict).toEqual({ ok: false, reason: 'expired' });
  });

  it('the checked-in gate fixtures match this implementation (pinning)', () => {
    const dir = join(import.meta.dirname, '../../../gates/fixtures/attribution');
    const valid = JSON.parse(readFileSync(join(dir, 'valid-token.json'), 'utf8'));
    expect(signAttributionToken(valid.token.payload, valid.testKey)).toEqual(valid.token);
    expect(verifyAttributionToken(valid.token, valid.testKey, now).ok).toBe(true);
    const tampered = JSON.parse(
      readFileSync(join(dir, '../negative/attribution/tampered-token.json'), 'utf8'),
    );
    const verdict = verifyAttributionToken(tampered.token, tampered.testKey, now);
    expect(verdict.ok).toBe(false);
    expect(verdict).not.toHaveProperty('resellerId');
  });
});
