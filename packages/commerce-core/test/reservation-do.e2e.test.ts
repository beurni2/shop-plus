import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ADVERSARIAL reservation-DO tests on the REAL Workers runtime (workerd via
 * Miniflare) — not a shim (DoD: "two concurrent confirms → exactly one wins
 * (adversarial test required)"). The DO is addressed by quoteId, so
 * concurrency hits workerd's actual per-object serialization.
 */

let mf: Miniflare;

beforeAll(() => {
  mf = new Miniflare({
    modules: true,
    scriptPath: 'dist-worker/reservation-worker.mjs',
    durableObjects: { QUOTE_RESERVATION: 'QuoteReservationDO' },
  });
});
afterAll(() => mf.dispose());

type DecisionBody = {
  ok: boolean;
  reason?: string;
  reservationId?: string;
  idempotentReplay?: boolean;
  state?: { status: string };
};

async function send(quoteId: string, body: Record<string, unknown>): Promise<DecisionBody> {
  const res = await mf.dispatchFetch(`http://commerce-core/reservations/${quoteId}`, {
    method: 'POST',
    body: JSON.stringify({ quoteId, ...body }),
  });
  return (await res.json()) as DecisionBody;
}

const T0 = '2026-07-09T12:00:00.000Z';
const IN_TTL = '2026-07-09T12:01:00.000Z';
const PAST_TTL = '2026-07-09T12:03:00.000Z';

describe('QuoteReservationDO on workerd — atomicity is the runtime, not a shim', () => {
  it('TWO CONCURRENT CONFIRMS → exactly one wins', async () => {
    const q = 'quote-concurrent-confirm';
    const r = await send(q, { kind: 'reserve', command_id: 'r1', holderRef: 'buyer-1', nowIso: T0, newReservationId: 'res-1' });
    expect(r.ok).toBe(true);

    const [a, b] = await Promise.all([
      send(q, { kind: 'confirm', command_id: 'confirm-A', nowIso: IN_TTL }),
      send(q, { kind: 'confirm', command_id: 'confirm-B', nowIso: IN_TTL }),
    ]);
    const winners = [a, b].filter((d) => d.ok);
    const losers = [a, b].filter((d) => !d.ok);
    expect(winners).toHaveLength(1); // exactly one wins
    expect(losers).toHaveLength(1);
    expect(losers[0]!.reason).toBe('already_confirmed');
    expect(winners[0]!.reservationId).toBe('res-1');
  });

  it('TWENTY CONCURRENT RESERVES on one quote → exactly one wins, nineteen refuse closed', async () => {
    const q = 'quote-concurrent-reserve';
    const attempts = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        send(q, { kind: 'reserve', command_id: `race-${i}`, holderRef: `buyer-${i}`, nowIso: T0, newReservationId: `res-${i}` }),
      ),
    );
    const winners = attempts.filter((d) => d.ok);
    expect(winners).toHaveLength(1);
    expect(attempts.filter((d) => !d.ok && d.reason === 'already_reserved')).toHaveLength(19);
  });

  it('idempotent confirm: replaying the winning command_id returns the same success, never a second apply', async () => {
    const q = 'quote-idempotent-confirm';
    await send(q, { kind: 'reserve', command_id: 'r1', holderRef: 'buyer-1', nowIso: T0, newReservationId: 'res-1' });
    const first = await send(q, { kind: 'confirm', command_id: 'C', nowIso: IN_TTL });
    const replay = await send(q, { kind: 'confirm', command_id: 'C', nowIso: IN_TTL });
    expect(first).toMatchObject({ ok: true, idempotentReplay: false, reservationId: 'res-1' });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, reservationId: 'res-1' });
  });

  it('expiry → clean release → the quote is reservable again; late confirm refuses closed', async () => {
    const q = 'quote-expiry';
    await send(q, { kind: 'reserve', command_id: 'r1', holderRef: 'buyer-1', nowIso: T0, newReservationId: 'res-1' });
    const late = await send(q, { kind: 'confirm', command_id: 'late', nowIso: PAST_TTL });
    expect(late).toMatchObject({ ok: false, reason: 'reservation_expired' });
    const sweep = await send(q, { kind: 'expire', nowIso: PAST_TTL });
    expect(sweep.ok).toBe(true);
    expect(sweep.state?.status).toBe('released');
    const again = await send(q, { kind: 'reserve', command_id: 'r2', holderRef: 'buyer-2', nowIso: PAST_TTL, newReservationId: 'res-2' });
    expect(again).toMatchObject({ ok: true, reservationId: 'res-2' });
  });

  it('state persists across stub calls: a new request sees the confirmed state (storage, not memory)', async () => {
    const q = 'quote-persistence';
    await send(q, { kind: 'reserve', command_id: 'r1', holderRef: 'buyer-1', nowIso: T0, newReservationId: 'res-1' });
    await send(q, { kind: 'confirm', command_id: 'c1', nowIso: IN_TTL });
    const probe = await send(q, { kind: 'confirm', command_id: 'c-other', nowIso: IN_TTL });
    expect(probe).toMatchObject({ ok: false, reason: 'already_confirmed' });
  });

  it('router refuses a body/URL quoteId mismatch — one DO can never hold another quote state', async () => {
    const res = await mf.dispatchFetch('http://commerce-core/reservations/quote-A', {
      method: 'POST',
      body: JSON.stringify({ kind: 'reserve', quoteId: 'quote-B', command_id: 'x', holderRef: 'h', nowIso: T0, newReservationId: 'r' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as DecisionBody).reason).toBe('quote_mismatch');
  });

  it('reservations are per-quote: quote X reserved does not block quote Y', async () => {
    const a = await send('quote-X', { kind: 'reserve', command_id: 'rx', holderRef: 'b1', nowIso: T0, newReservationId: 'res-x' });
    const b = await send('quote-Y', { kind: 'reserve', command_id: 'ry', holderRef: 'b2', nowIso: T0, newReservationId: 'res-y' });
    expect(a.ok && b.ok).toBe(true);
  });
});
