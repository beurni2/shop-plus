import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { attributionCollisionAlert } from '../src/lock.js';

/**
 * ADVERSARIAL LOCK-DURABILITY tests on the REAL Workers runtime (workerd via
 * Miniflare) with ON-DISK persistence. Every test crosses a RESTART — the
 * Miniflare instance is disposed and re-created on the SAME persist directory,
 * so the lock is proven to survive a process death, not merely a second request
 * (the gap the reservation-DO e2e never exercised). SP-I09b.3: "once locked …
 * immutable, first-lock-wins" — now durable.
 */

const SCRIPT = 'dist-worker/attribution-lock-worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'attr-lock-'));
const AT = '2026-07-10T12:00:00.000Z';

function makeMf(): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { ATTRIBUTION_LOCK: 'AttributionLockDO' },
    durableObjectsPersist: persist,
  });
}
let mf = makeMf();
async function restart(): Promise<void> {
  await mf.dispose();
  mf = makeMf(); // same persist dir = a real restart
}
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

type LockBody = {
  ok: boolean;
  status?: string;
  lock?: { checkoutRef: string; resellerId: string; tokenId: string; lockedAt: string } | null;
  existing?: { checkoutRef: string; resellerId: string; tokenId: string; lockedAt: string };
  rejectedResellerId?: string;
  rejectedTokenId?: string;
  seq?: number;
  reason?: string;
};

async function claim(ref: string, resellerId: string, tokenId: string): Promise<{ code: number; body: LockBody }> {
  const res = await mf.dispatchFetch(`http://attr/locks/${ref}`, {
    method: 'POST',
    body: JSON.stringify({ checkoutRef: ref, resellerId, tokenId, at: AT }),
  });
  return { code: res.status, body: (await res.json()) as LockBody };
}
async function read(ref: string): Promise<LockBody['lock']> {
  const res = await mf.dispatchFetch(`http://attr/locks/${ref}`, { method: 'GET' });
  return ((await res.json()) as LockBody).lock ?? null;
}

describe('AttributionLockDO — first-lock-wins, durable across a restart', () => {
  it('LOCK SURVIVES RESTART: a lock written before a crash is read back after it', async () => {
    const created = await claim('chk-survive', 'rs-A', 'att-1');
    expect(created.body).toMatchObject({ ok: true, status: 'created' });
    expect(created.body.lock?.resellerId).toBe('rs-A');

    await restart();

    const after = await read('chk-survive');
    expect(after?.resellerId).toBe('rs-A'); // survived the process death
    expect(after?.tokenId).toBe('att-1');
  });

  it('FIRST-LOCK-WINS ACROSS RESTART: the second claimant loses even after a crash between the two attempts', async () => {
    const first = await claim('chk-race', 'rs-A', 'att-1');
    expect(first.body.status).toBe('created');

    await restart(); // crash between the first claim and the second

    const second = await claim('chk-race', 'rs-B', 'att-2');
    expect(second.code).toBe(409);
    expect(second.body).toMatchObject({ ok: false, status: 'collision' });
    expect(second.body.existing?.resellerId).toBe('rs-A'); // the lock NEVER moved
    expect(await read('chk-race').then((l) => l?.resellerId)).toBe('rs-A');
  });

  it('REPLAY REBUILDS AN IDENTICAL BOOK: the projection re-read after restart is byte-identical', async () => {
    await claim('chk-1', 'rs-1', 'att-1');
    await claim('chk-2', 'rs-2', 'att-2');
    await claim('chk-3', 'rs-3', 'att-3');
    const snapshot = {
      'chk-1': await read('chk-1'),
      'chk-2': await read('chk-2'),
      'chk-3': await read('chk-3'),
    };

    await restart();

    const rebuilt = {
      'chk-1': await read('chk-1'),
      'chk-2': await read('chk-2'),
      'chk-3': await read('chk-3'),
    };
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(snapshot)); // byte-identical projection
    expect(rebuilt['chk-2']?.resellerId).toBe('rs-2');
  });

  it('COLLISION ALERT STILL FIRES DURABLE: a contested checkout emits reconciliation.alert.v1 after a restart', async () => {
    await claim('chk-alert', 'rs-A', 'att-1');
    await restart();

    const collision = await claim('chk-alert', 'rs-B', 'att-2');
    expect(collision.body.status).toBe('collision');

    // the durable decision builds the SAME canon alert as the in-memory book
    const alert = attributionCollisionAlert({
      existing: collision.body.existing!,
      rejectedResellerId: collision.body.rejectedResellerId!,
      rejectedTokenId: collision.body.rejectedTokenId!,
      correlationId: 'corr-alert',
      at: AT,
      seq: collision.body.seq!,
    });
    expect(alert.name).toBe('reconciliation.alert.v1');
    expect(alert.payload['locked_reseller_id']).toBe('rs-A');
    expect(alert.payload['rejected_reseller_id']).toBe('rs-B');
    expect(await read('chk-alert').then((l) => l?.resellerId)).toBe('rs-A'); // lock unchanged
  });

  it('NEVER ATTRIBUTES PLATFORM (SP-I09b.4): stored/returned reseller is always real; an unlocked checkout is NOBODY, never the platform', async () => {
    await claim('chk-plat', 'rs-A', 'att-1');
    await restart();
    const collision = await claim('chk-plat', 'rs-B', 'att-2');

    for (const id of [
      (await read('chk-plat'))?.resellerId,
      collision.body.existing?.resellerId,
    ]) {
      expect(id).toBe('rs-A');
      expect(id).not.toMatch(/platform|shop-plus/i);
      expect(id).not.toBe('');
    }
    // an untouched checkout resolves to NOBODY (null) — never a platform fallback
    expect(await read('chk-never-touched')).toBeNull();
  });

  it('IDEMPOTENT ACROSS RESTART: the same token re-presented after a crash is still locked, no re-lock', async () => {
    const first = await claim('chk-idem', 'rs-A', 'att-1');
    expect(first.body.status).toBe('created');
    await restart();
    const replay = await claim('chk-idem', 'rs-A', 'att-1');
    expect(replay.code).toBe(200);
    expect(replay.body.status).toBe('idempotent');
    expect(replay.body.lock?.resellerId).toBe('rs-A');
  });

  it('the router refuses a body/URL checkoutRef mismatch — one lock DO can never hold another checkout', async () => {
    const res = await mf.dispatchFetch('http://attr/locks/chk-A', {
      method: 'POST',
      body: JSON.stringify({ checkoutRef: 'chk-B', resellerId: 'rs-x', tokenId: 'att-x', at: AT }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as LockBody).reason).toBe('checkout_mismatch');
  });
});
