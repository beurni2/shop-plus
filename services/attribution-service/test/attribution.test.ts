import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  signAttributionToken,
  verifyAttributionToken,
  type UnsignedAttributionToken,
} from '../src/attribution.js';

// CI gate: attribution-tamper-fails-closed (SP-I09, SP2.1). TEST key only.
// The token is the CANONICAL §5.6 AttributionToken — no local shape.

const TEST_KEY = 'sp0.1-test-signing-key-NOT-A-REAL-KEY';
const now = new Date('2026-07-09T12:00:00Z');

const unsigned: UnsignedAttributionToken = {
  id: 'attr_1',
  resellerId: 'res_123',
  scope: { kind: 'listing', refId: 'listing_456' },
  issued: '2026-07-09T00:00:00Z',
  expiry: '2026-08-09T00:00:00Z',
  version: 'v1',
};

describe('attribution-tamper-fails-closed (canonical AttributionToken)', () => {
  it('a valid token verifies and yields exactly its reseller', () => {
    const token = signAttributionToken(unsigned, TEST_KEY);
    expect(verifyAttributionToken(token, TEST_KEY, now)).toEqual({
      ok: true,
      resellerId: 'res_123',
    });
  });

  it('an altered payload is rejected CLOSED — no reseller id, no fallback', () => {
    const token = signAttributionToken(unsigned, TEST_KEY);
    const tampered = { ...token, resellerId: 'res_ATTACKER' };
    const verdict = verifyAttributionToken(tampered, TEST_KEY, now);
    expect(verdict.ok).toBe(false);
    expect(verdict).not.toHaveProperty('resellerId');
    expect(JSON.stringify(verdict)).not.toMatch(/supplier|platform|res_/);
  });

  it('a token signed with a different key is rejected closed', () => {
    const token = signAttributionToken(unsigned, 'some-other-key');
    expect(verifyAttributionToken(token, TEST_KEY, now)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('an altered signature is rejected closed', () => {
    const token = signAttributionToken(unsigned, TEST_KEY);
    const tampered = { ...token, signature: token.signature.replace(/^./, '0') };
    expect(verifyAttributionToken(tampered, TEST_KEY, now)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('an expired token is rejected closed', () => {
    const token = signAttributionToken(unsigned, TEST_KEY);
    expect(verifyAttributionToken(token, TEST_KEY, new Date('2026-09-01T00:00:00Z'))).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('a validly-signed token with a garbage expiry is rejected closed, never open (NB-1)', () => {
    const token = signAttributionToken({ ...unsigned, expiry: 'not-a-date' }, TEST_KEY);
    const verdict = verifyAttributionToken(token, TEST_KEY, now);
    expect(verdict).toEqual({ ok: false, reason: 'malformed' });
  });

  it('non-canonical token shapes (extra/missing/renamed fields) are malformed, closed', () => {
    const token = signAttributionToken(unsigned, TEST_KEY);
    const { id: _dropped, ...missingId } = token;
    expect(verifyAttributionToken(missingId, TEST_KEY, now)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyAttributionToken({ ...token, scopeRef: 'x' }, TEST_KEY, now)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyAttributionToken(null, TEST_KEY, now)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('the checked-in gate fixtures match this implementation (pinning)', () => {
    const dir = join(import.meta.dirname, '../../../gates/fixtures/attribution');
    const valid = JSON.parse(readFileSync(join(dir, 'valid-token.json'), 'utf8'));
    const { signature: _sig, ...unsignedFixture } = valid.token;
    expect(signAttributionToken(unsignedFixture, valid.testKey)).toEqual(valid.token);
    expect(verifyAttributionToken(valid.token, valid.testKey, now).ok).toBe(true);
    const tampered = JSON.parse(
      readFileSync(join(dir, '../negative/attribution/tampered-token.json'), 'utf8'),
    );
    const verdict = verifyAttributionToken(tampered.token, tampered.testKey, now);
    expect(verdict.ok).toBe(false);
    expect(verdict).not.toHaveProperty('resellerId');
  });
});
