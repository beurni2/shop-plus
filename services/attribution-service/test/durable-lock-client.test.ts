import { describe, expect, it } from 'vitest';
import { signAttributionToken, verifyAttributionToken } from '../src/attribution.js';
import { AttributionLockBook } from '../src/lock.js';
import { decideLock, type AttributionLock } from '../src/lock-core.js';
import { lockThroughDurableAuthority, type DurableLockFetch } from '../src/durable-lock-client.js';

/**
 * SP#001-D — the durable-lock client maps the DO's HTTP response to the SAME
 * `LockOutcome` the in-memory `AttributionLockBook` returns, built with the SAME
 * shared canon-event builders. Named condition ②: the checkout locks THROUGH the
 * durable authority. Here a FAKE doFetch stands in for the DO (decideLock +
 * per-checkout storage + persisted collision seq) so the mapping is unit-proven;
 * the e2e drives the REAL DO on workerd.
 */

const KEY = 'sp001d-secret';
const T = '2026-07-14T12:00:00.000Z';

function qualifiedToken(id: string, resellerId: string) {
  const token = signAttributionToken(
    { id, resellerId, scope: { kind: 'listing', refId: 'lst-seller-0001' }, issued: T, expiry: '2026-08-01T00:00:00.000Z', version: 'v1' },
    KEY,
  );
  const verdict = verifyAttributionToken(token, KEY, new Date(T));
  if (!verdict.ok) throw new Error('setup: token must verify');
  return token;
}

/** A fake DO: decideLock + per-checkout lock + persisted collision seq (mirrors attribution-lock-do.ts). */
function fakeDurableAuthority(): DurableLockFetch {
  const locks = new Map<string, AttributionLock>();
  const seqs = new Map<string, number>();
  return async (checkoutRef, body) => {
    const claim = JSON.parse(body) as { checkoutRef: string; resellerId: string; tokenId: string; at: string };
    const decision = decideLock(locks.get(checkoutRef) ?? null, claim);
    if (decision.status === 'created') {
      locks.set(checkoutRef, decision.lock);
      return { status: 200, json: async () => ({ ok: true, status: 'created', lock: decision.lock }) };
    }
    if (decision.status === 'idempotent') {
      return { status: 200, json: async () => ({ ok: true, status: 'idempotent', lock: decision.lock }) };
    }
    const seq = (seqs.get(checkoutRef) ?? 0) + 1;
    seqs.set(checkoutRef, seq);
    return {
      status: 409,
      json: async () => ({
        ok: false,
        status: 'collision',
        existing: decision.existing,
        rejectedResellerId: decision.rejectedResellerId,
        rejectedTokenId: decision.rejectedTokenId,
        seq,
      }),
    };
  };
}

describe('lockThroughDurableAuthority — the checkout seam locks THROUGH the durable authority', () => {
  it('first lock wins: a created lock carries the claim reseller and the canon attribution.locked.v1', async () => {
    const doFetch = fakeDurableAuthority();
    const token = qualifiedToken('tok-1', 'rs-seller-0001');
    const out = await lockThroughDurableAuthority(doFetch, { checkoutRef: 'chk-1', correlationId: 'corr-1', token, at: T });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.lock.resellerId).toBe('rs-seller-0001');
    expect(out.duplicate).toBe(false);
    expect(out.event.name).toBe('attribution.locked.v1');
    expect(out.event.payload['reseller_id']).toBe('rs-seller-0001');
    expect(out.event.payload['checkout_ref']).toBe('chk-1');
  });

  it('the SAME token re-presented is idempotent (no re-lock, no alert)', async () => {
    const doFetch = fakeDurableAuthority();
    const token = qualifiedToken('tok-1', 'rs-seller-0001');
    await lockThroughDurableAuthority(doFetch, { checkoutRef: 'chk-1', correlationId: 'corr-1', token, at: T });
    const replay = await lockThroughDurableAuthority(doFetch, { checkoutRef: 'chk-1', correlationId: 'corr-1', token, at: T });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.duplicate).toBe(true);
  });

  it('a DIFFERENT valid token on a locked checkout collides: the lock never moves, a collision alert fires, buyer sees the honest message', async () => {
    const doFetch = fakeDurableAuthority();
    const first = qualifiedToken('tok-1', 'rs-seller-0001');
    const second = qualifiedToken('tok-2', 'rs-rival-0002');
    await lockThroughDurableAuthority(doFetch, { checkoutRef: 'chk-1', correlationId: 'corr-1', token: first, at: T });
    const collision = await lockThroughDurableAuthority(doFetch, { checkoutRef: 'chk-1', correlationId: 'corr-1', token: second, at: T });
    expect(collision.ok).toBe(false);
    if (collision.ok) return;
    expect(collision.reason).toBe('attribution_already_locked');
    expect(collision.lock.resellerId).toBe('rs-seller-0001'); // the ORIGINAL, never re-attributed
    expect(collision.collisionAlert.name).toBe('reconciliation.alert.v1');
    expect(collision.collisionAlert.payload['locked_reseller_id']).toBe('rs-seller-0001');
    expect(collision.collisionAlert.payload['rejected_reseller_id']).toBe('rs-rival-0002');
    expect(collision.buyerMessageRef).toBe('attribution.collision');
  });

  it('BYTE-EQUIVALENT to the in-memory book on the created path (same lock, same locked event)', async () => {
    const doFetch = fakeDurableAuthority();
    const token = qualifiedToken('tok-1', 'rs-seller-0001');
    const durable = await lockThroughDurableAuthority(doFetch, { checkoutRef: 'chk-1', correlationId: 'corr-1', token, at: T });

    const book = new AttributionLockBook();
    const inMemory = book.lock({ checkoutRef: 'chk-1', correlationId: 'corr-1', token, at: T });

    expect(durable.ok && inMemory.ok).toBe(true);
    if (!durable.ok || !inMemory.ok) return;
    // same lock, same canon event bytes — the seam is drop-in for the book.
    expect(JSON.stringify(durable.lock)).toBe(JSON.stringify(inMemory.lock));
    expect(JSON.stringify(durable.event)).toBe(JSON.stringify(inMemory.event));
  });

  it('an unexpected authority response fails CLOSED (throws), never fabricates a lock', async () => {
    const badFetch: DurableLockFetch = async () => ({ status: 500, json: async () => ({ ok: false }) });
    const token = qualifiedToken('tok-1', 'rs-seller-0001');
    await expect(
      lockThroughDurableAuthority(badFetch, { checkoutRef: 'chk-1', correlationId: 'corr-1', token, at: T }),
    ).rejects.toThrow(/unexpected response/);
  });
});
