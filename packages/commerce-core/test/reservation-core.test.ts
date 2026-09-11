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

/**
 * F-94 (AUDIT-SHOP-2) — THE EXPIRY IS AN INSTANT, NOT A STRING. `expiresAt` is
 * minted as a UTC `toISOString()`; a caller's `nowIso` is a valid instant in
 * every production path, but an ISO instant may legally carry an offset, and
 * a text compare read `…T14:01:00+02:00` (12:01 UTC, one minute into the
 * hold) as PAST `…T12:02:00.000Z`. Written red first: the +02:00 pair below
 * failed on the string compare.
 */
describe('F-94 — the TTL is judged on instants: an offset-bearing clock inside the hold does not expire it', () => {
  // Both are 12:01 UTC and 12:03 UTC — the same instants as T1_IN_TTL / T3_PAST_TTL, spelt with an offset.
  const T1_OFFSET_IN_TTL = '2026-07-09T14:01:00.000+02:00';
  const T3_OFFSET_PAST_TTL = '2026-07-09T14:03:00.000+02:00';

  it('inside the hold, spelt with an offset: confirm succeeds, a second reserve is refused, expire refuses — the hold stands', () => {
    const r1 = decideReservation(NONE, reserve('c-a'));
    if (!r1.ok) throw new Error('setup');
    expect(decideReservation(r1.state, { ...reserve('c-b'), holderRef: 'buyer-2', nowIso: T1_OFFSET_IN_TTL })).toMatchObject({
      ok: false,
      reason: 'already_reserved',
    });
    expect(decideReservation(r1.state, { kind: 'expire', quoteId: 'q-1', nowIso: T1_OFFSET_IN_TTL })).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
    const c1 = decideReservation(r1.state, confirm('c-c', T1_OFFSET_IN_TTL));
    expect(c1.ok && c1.state.status).toBe('confirmed');
  });

  it('past the hold, spelt with an offset: confirm is refused expired and the sweep releases — the instant decides, not the spelling', () => {
    const r1 = decideReservation(NONE, reserve('c-a'));
    if (!r1.ok) throw new Error('setup');
    expect(decideReservation(r1.state, confirm('c-c', T3_OFFSET_PAST_TTL))).toMatchObject({ ok: false, reason: 'reservation_expired' });
    const swept = decideReservation(r1.state, { kind: 'expire', quoteId: 'q-1', nowIso: T3_OFFSET_PAST_TTL });
    expect(swept.ok && swept.state.status).toBe('released');
  });

  it('a clock that does not parse never expires a hold: the reserve and expire roads keep refusing closed', () => {
    const r1 = decideReservation(NONE, reserve('c-a'));
    if (!r1.ok) throw new Error('setup');
    expect(decideReservation(r1.state, { ...reserve('c-b'), holderRef: 'buyer-2', nowIso: 'pas-une-date' })).toMatchObject({
      ok: false,
      reason: 'already_reserved',
    });
    expect(decideReservation(r1.state, { kind: 'expire', quoteId: 'q-1', nowIso: 'pas-une-date' })).toMatchObject({
      ok: false,
      reason: 'not_expired',
    });
  });
});
