/**
 * ATOMIC ORDER RESERVATION — pure decision core (WO-1.1 b; Contract §2.3
 * step 7; SP3.2 "short reservation (atomic)"). One reservation per quote is
 * structural: the Durable Object hosting this core is addressed by quoteId,
 * so all commands for one quote serialize through one object. This module is
 * pure state → command → state; the DO wrapper owns persistence.
 *
 * Idempotency: reserve and confirm are idempotent on command_id — the same
 * command replayed returns the SAME outcome and never double-applies.
 * Everything not explicitly allowed REFUSES CLOSED.
 */

export const RESERVATION_TTL_MS = 2 * 60 * 1000; // short TTL per SP3.2

export type ReservationState =
  | { status: 'none' }
  | {
      status: 'reserved';
      quoteId: string;
      reservationId: string;
      holderRef: string;
      reserveCommandId: string;
      expiresAt: string;
    }
  | {
      status: 'confirmed';
      quoteId: string;
      reservationId: string;
      holderRef: string;
      reserveCommandId: string;
      confirmCommandId: string;
    }
  | { status: 'released'; quoteId: string; priorReservationId: string };

export interface ReserveCommand {
  kind: 'reserve';
  command_id: string;
  quoteId: string;
  holderRef: string;
  /** Injected server time — the core never reads a clock. */
  nowIso: string;
  newReservationId: string;
}

export interface ConfirmCommand {
  kind: 'confirm';
  command_id: string;
  quoteId: string;
  nowIso: string;
}

export interface ExpireCommand {
  kind: 'expire';
  quoteId: string;
  nowIso: string;
}

export type ReservationCommand = ReserveCommand | ConfirmCommand | ExpireCommand;

export type ReservationDecision =
  | { ok: true; state: ReservationState; reservationId: string; idempotentReplay: boolean }
  | {
      ok: false;
      state: ReservationState;
      reason:
        | 'already_reserved'
        | 'already_confirmed'
        | 'no_reservation'
        | 'reservation_expired'
        | 'not_expired'
        | 'quote_mismatch';
    };

function expired(state: Extract<ReservationState, { status: 'reserved' }>, nowIso: string): boolean {
  return nowIso > state.expiresAt;
}

export function decideReservation(state: ReservationState, cmd: ReservationCommand): ReservationDecision {
  if (state.status !== 'none' && 'quoteId' in state && state.quoteId !== cmd.quoteId) {
    return { ok: false, state, reason: 'quote_mismatch' };
  }

  switch (cmd.kind) {
    case 'reserve': {
      if (state.status === 'reserved') {
        if (state.reserveCommandId === cmd.command_id) {
          return { ok: true, state, reservationId: state.reservationId, idempotentReplay: true };
        }
        if (!expired(state, cmd.nowIso)) {
          return { ok: false, state, reason: 'already_reserved' };
        }
        // Expired but not yet swept: the new reserve wins cleanly.
        return reserveFresh(cmd);
      }
      if (state.status === 'confirmed') {
        if (state.reserveCommandId === cmd.command_id) {
          return { ok: true, state, reservationId: state.reservationId, idempotentReplay: true };
        }
        return { ok: false, state, reason: 'already_confirmed' };
      }
      // none | released → fresh reservation
      return reserveFresh(cmd);
    }

    case 'confirm': {
      if (state.status === 'confirmed') {
        if (state.confirmCommandId === cmd.command_id) {
          return { ok: true, state, reservationId: state.reservationId, idempotentReplay: true };
        }
        return { ok: false, state, reason: 'already_confirmed' };
      }
      if (state.status === 'reserved') {
        if (expired(state, cmd.nowIso)) {
          return { ok: false, state, reason: 'reservation_expired' };
        }
        const next: ReservationState = {
          status: 'confirmed',
          quoteId: state.quoteId,
          reservationId: state.reservationId,
          holderRef: state.holderRef,
          reserveCommandId: state.reserveCommandId,
          confirmCommandId: cmd.command_id,
        };
        return { ok: true, state: next, reservationId: next.reservationId, idempotentReplay: false };
      }
      return { ok: false, state, reason: 'no_reservation' };
    }

    case 'expire': {
      if (state.status === 'reserved' && expired(state, cmd.nowIso)) {
        const next: ReservationState = {
          status: 'released',
          quoteId: state.quoteId,
          priorReservationId: state.reservationId,
        };
        return { ok: true, state: next, reservationId: state.reservationId, idempotentReplay: false };
      }
      // Expire on anything else changes nothing — refuse closed, no side effect.
      if (state.status === 'released') {
        return { ok: true, state, reservationId: state.priorReservationId, idempotentReplay: true };
      }
      return {
        ok: false,
        state,
        reason: state.status === 'none' ? 'no_reservation' : state.status === 'confirmed' ? 'already_confirmed' : 'not_expired',
      };
    }
  }
}

function reserveFresh(cmd: ReserveCommand): ReservationDecision {
  const next: ReservationState = {
    status: 'reserved',
    quoteId: cmd.quoteId,
    reservationId: cmd.newReservationId,
    holderRef: cmd.holderRef,
    reserveCommandId: cmd.command_id,
    expiresAt: new Date(Date.parse(cmd.nowIso) + RESERVATION_TTL_MS).toISOString(),
  };
  return { ok: true, state: next, reservationId: next.reservationId, idempotentReplay: false };
}
