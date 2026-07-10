import {
  decideReservation,
  type ReservationCommand,
  type ReservationState,
} from '../src/reservation.js';

/**
 * QuoteReservationDO — the atomic reservation authority (WO-1.1 b). One DO
 * instance per quote (addressed by idFromName(quoteId)), so every command
 * for a quote serializes through workerd's input gate: two concurrent
 * confirms reach this object one after the other and exactly one wins —
 * that is the real mechanism, exercised by the adversarial Miniflare test,
 * not a shim. State survives via DO storage; the decision logic is the pure
 * core in src/reservation.ts.
 */

const STATE_KEY = 'reservation-state';

export class QuoteReservationDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, reason: 'method_not_allowed' }, { status: 405 });
    }
    let cmd: ReservationCommand;
    try {
      cmd = (await request.json()) as ReservationCommand;
    } catch {
      return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
    }
    if (cmd == null || typeof cmd !== 'object' || typeof cmd.quoteId !== 'string') {
      return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
    }

    const current = (await this.state.storage.get<ReservationState>(STATE_KEY)) ?? {
      status: 'none' as const,
    };
    const decision = decideReservation(current, cmd);
    if (decision.ok && !decision.idempotentReplay) {
      await this.state.storage.put(STATE_KEY, decision.state);
    }
    return Response.json(decision, { status: decision.ok ? 200 : 409 });
  }
}

interface Env {
  QUOTE_RESERVATION: DurableObjectNamespace;
}

/**
 * Minimal E1 router: POST /reservations/:quoteId with a ReservationCommand
 * body. The DO name IS the quoteId — one reservation per quote by
 * construction.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/reservations\/([^/]+)$/.exec(url.pathname);
    if (!match || request.method !== 'POST') {
      return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
    }
    const quoteId = decodeURIComponent(match[1]!);
    // The DO identity comes from the URL; the body must agree or the command
    // could seed one quote's object with another quote's state. Refuse closed.
    const body = await request.clone().json().catch(() => null);
    if (body == null || typeof body !== 'object' || (body as { quoteId?: unknown }).quoteId !== quoteId) {
      return Response.json({ ok: false, reason: 'quote_mismatch' }, { status: 400 });
    }
    const stub = env.QUOTE_RESERVATION.get(env.QUOTE_RESERVATION.idFromName(quoteId));
    return stub.fetch(request);
  },
};
