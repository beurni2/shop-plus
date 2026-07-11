import { describe, expect, it } from 'vitest';
import { signAttributionToken, verifyAttributionToken } from '../src/attribution.js';
import { AttributionLockBook } from '../src/lock.js';

const KEY = 'test-key-only';
const T = '2026-07-10T12:00:00.000Z';

function qualifiedToken(id: string, resellerId: string) {
  const token = signAttributionToken(
    { id, resellerId, scope: { kind: 'listing', refId: 'lst-1' }, issued: T, expiry: '2026-08-01T00:00:00.000Z', version: 'v1' },
    KEY,
  );
  const verdict = verifyAttributionToken(token, KEY, new Date(T));
  if (!verdict.ok) throw new Error('setup: token must verify');
  return token;
}

describe('attribution lock — FIRST LOCK WINS (SP-I01; two-qualified-links collision)', () => {
  it('the first qualified token locks the checkout and emits attribution.locked.v1', () => {
    const book = new AttributionLockBook();
    const out = book.lock({ checkoutRef: 'chk-1', correlationId: 'corr-1', token: qualifiedToken('att-1', 'rs-first'), at: T });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.lock.resellerId).toBe('rs-first');
    expect(out.event.name).toBe('attribution.locked.v1');
    expect(out.duplicate).toBe(false);
  });

  it('a SECOND VALID token on a locked checkout REFUSES — no silent re-attribution, honest message, collision alert', () => {
    const book = new AttributionLockBook();
    book.lock({ checkoutRef: 'chk-2', correlationId: 'corr-2', token: qualifiedToken('att-1', 'rs-first'), at: T });
    const second = book.lock({ checkoutRef: 'chk-2', correlationId: 'corr-2', token: qualifiedToken('att-2', 'rs-second'), at: T });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('attribution_already_locked');
    expect(second.lock.resellerId).toBe('rs-first'); // the lock NEVER moved
    expect(second.collisionAlert.name).toBe('reconciliation.alert.v1');
    expect(second.collisionAlert.payload['rejected_reseller_id']).toBe('rs-second');
    expect(second.buyerMessageRef).toBe('attribution.collision');
    expect(book.lockFor('chk-2')!.resellerId).toBe('rs-first');
  });

  it('the SAME token re-presented is an idempotent replay — still locked, no alert', () => {
    const book = new AttributionLockBook();
    const token = qualifiedToken('att-1', 'rs-first');
    book.lock({ checkoutRef: 'chk-3', correlationId: 'corr-3', token, at: T });
    const replay = book.lock({ checkoutRef: 'chk-3', correlationId: 'corr-3', token, at: T });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.duplicate).toBe(true);
  });

  it('no fallback to platform: an unverified token never reaches the book (fails-closed upstream)', () => {
    const tampered = { ...qualifiedToken('att-9', 'rs-x'), signature: 'ffff' };
    const verdict = verifyAttributionToken(tampered, KEY, new Date(T));
    expect(verdict.ok).toBe(false); // WO-SP0.1 discipline: bad_signature, no resellerId leaked
  });
});
