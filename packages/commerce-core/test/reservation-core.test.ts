import { describe, expect, it } from 'vitest';
import { decideReservation, type ReservationState } from '../src/reservation.js';

const T0 = '2026-07-09T12:00:00.000Z';
const T1_IN_TTL = '2026-07-09T12:01:00.000Z';
const T3_PAST_TTL = '2026-07-09T12:03:00.000Z';
const NONE: ReservationState = { status: 'none' };

const reserve = (command_id: string, nowIso = T0) =>
  ({ kind: 'reserve', command_id, quoteId: 'q-1', holderRef: 'buyer-1', nowIso, newReservationId: `res-${command_id}` }) as const;
const confirm = (command_id: string, nowIso = T1_IN_TTL) =>
  ({ kind: 'confirm', command_id, quoteId: 'q-1', nowIso }) as const;

describe('reservation pure core — idempotent, refuse-closed (WO-1.1 b)', () => {
  it('reserve then confirm inside TTL succeeds; both are idempotent on command_id', () => {
    const r1 = decideReservation(NONE, reserve('c-r'));
    expect(r1.ok && r1.state.status).toBe('reserved');
    if (!r1.ok) return;
    // Idempotent replay of the SAME reserve command.
    const r2 = decideReservation(r1.state, reserve('c-r'));
    expect(r2).toMatchObject({ ok: true, idempotentReplay: true, reservationId: r1.reservationId });

    const c1 = decideReservation(r1.state, confirm('c-c'));
    expect(c1.ok && c1.state.status).toBe('confirmed');
    if (!c1.ok) return;
    // Idempotent replay of the SAME confirm command — same outcome, no double-apply.
    const c2 = decideReservation(c1.state, confirm('c-c'));
    expect(c2).toMatchObject({ ok: true, idempotentReplay: true, reservationId: c1.reservationId });
    // A DIFFERENT confirm command after confirmation refuses closed.
    const c3 = decideReservation(c1.state, confirm('c-other'));
    expect(c3).toMatchObject({ ok: false, reason: 'already_confirmed' });
  });

  it('a second reserve with a different command refuses closed while the first is live', () => {
    const r1 = decideReservation(NONE, reserve('c-a'));
    if (!r1.ok) throw new Error('setup');
    const r2 = decideReservation(r1.state, { ...reserve('c-b'), holderRef: 'buyer-2' });
    expect(r2).toMatchObject({ ok: false, reason: 'already_reserved' });
    // The loser changed nothing.
    expect(r2.state).toEqual(r1.state);
  });

  it('confirm after TTL refuses closed (reservation_expired); expire releases cleanly and a fresh reserve wins', () => {
    const r1 = decideReservation(NONE, reserve('c-a'));
    if (!r1.ok) throw new Error('setup');
    const late = decideReservation(r1.state, confirm('c-late', T3_PAST_TTL));
    expect(late).toMatchObject({ ok: false, reason: 'reservation_expired' });

    const swept = decideReservation(r1.state, { kind: 'expire', quoteId: 'q-1', nowIso: T3_PAST_TTL });
    expect(swept.ok && swept.state.status).toBe('released');
    if (!swept.ok) return;
    const again = decideReservation(swept.state, reserve('c-new', T3_PAST_TTL));
    expect(again.ok && again.state.status).toBe('reserved');
  });

  it('expire is refuse-closed on live/confirmed/none states — it never releases early', () => {
    expect(decideReservation(NONE, { kind: 'expire', quoteId: 'q-1', nowIso: T0 })).toMatchObject({
      ok: false,
      reason: 'no_reservation',
    });
    const r1 = decideReservation(NONE, reserve('c-a'));
    if (!r1.ok) throw new Error('setup');
    expect(decideReservation(r1.state, { kind: 'expire', quoteId: 'q-1', nowIso: T1_IN_TTL })).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
    const c1 = decideReservation(r1.state, confirm('c-c'));
    if (!c1.ok) throw new Error('setup');
    expect(decideReservation(c1.state, { kind: 'expire', quoteId: 'q-1', nowIso: T3_PAST_TTL })).toMatchObject({
      ok: false,
      reason: 'already_confirmed',
    });
  });

  it('confirm with no reservation refuses closed; quote mismatch refuses closed', () => {
    expect(decideReservation(NONE, confirm('c-x'))).toMatchObject({ ok: false, reason: 'no_reservation' });
    const r1 = decideReservation(NONE, reserve('c-a'));
    if (!r1.ok) throw new Error('setup');
    const wrongQuote = decideReservation(r1.state, { kind: 'confirm', command_id: 'c-y', quoteId: 'q-OTHER', nowIso: T1_IN_TTL });
    expect(wrongQuote).toMatchObject({ ok: false, reason: 'quote_mismatch' });
  });
});
