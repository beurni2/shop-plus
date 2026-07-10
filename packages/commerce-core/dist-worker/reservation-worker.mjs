// src/reservation.ts
var RESERVATION_TTL_MS = 2 * 60 * 1e3;
function expired(state, nowIso) {
  return nowIso > state.expiresAt;
}
function decideReservation(state, cmd) {
  if (state.status !== "none" && "quoteId" in state && state.quoteId !== cmd.quoteId) {
    return { ok: false, state, reason: "quote_mismatch" };
  }
  switch (cmd.kind) {
    case "reserve": {
      if (state.status === "reserved") {
        if (state.reserveCommandId === cmd.command_id) {
          return { ok: true, state, reservationId: state.reservationId, idempotentReplay: true };
        }
        if (!expired(state, cmd.nowIso)) {
          return { ok: false, state, reason: "already_reserved" };
        }
        return reserveFresh(cmd);
      }
      if (state.status === "confirmed") {
        if (state.reserveCommandId === cmd.command_id) {
          return { ok: true, state, reservationId: state.reservationId, idempotentReplay: true };
        }
        return { ok: false, state, reason: "already_confirmed" };
      }
      return reserveFresh(cmd);
    }
    case "confirm": {
      if (state.status === "confirmed") {
        if (state.confirmCommandId === cmd.command_id) {
          return { ok: true, state, reservationId: state.reservationId, idempotentReplay: true };
        }
        return { ok: false, state, reason: "already_confirmed" };
      }
      if (state.status === "reserved") {
        if (expired(state, cmd.nowIso)) {
          return { ok: false, state, reason: "reservation_expired" };
        }
        const next = {
          status: "confirmed",
          quoteId: state.quoteId,
          reservationId: state.reservationId,
          holderRef: state.holderRef,
          reserveCommandId: state.reserveCommandId,
          confirmCommandId: cmd.command_id
        };
        return { ok: true, state: next, reservationId: next.reservationId, idempotentReplay: false };
      }
      return { ok: false, state, reason: "no_reservation" };
    }
    case "expire": {
      if (state.status === "reserved" && expired(state, cmd.nowIso)) {
        const next = {
          status: "released",
          quoteId: state.quoteId,
          priorReservationId: state.reservationId
        };
        return { ok: true, state: next, reservationId: state.reservationId, idempotentReplay: false };
      }
      if (state.status === "released") {
        return { ok: true, state, reservationId: state.priorReservationId, idempotentReplay: true };
      }
      return {
        ok: false,
        state,
        reason: state.status === "none" ? "no_reservation" : state.status === "confirmed" ? "already_confirmed" : "not_expired"
      };
    }
  }
}
function reserveFresh(cmd) {
  const next = {
    status: "reserved",
    quoteId: cmd.quoteId,
    reservationId: cmd.newReservationId,
    holderRef: cmd.holderRef,
    reserveCommandId: cmd.command_id,
    expiresAt: new Date(Date.parse(cmd.nowIso) + RESERVATION_TTL_MS).toISOString()
  };
  return { ok: true, state: next, reservationId: next.reservationId, idempotentReplay: false };
}

// worker/reservation-do.ts
var STATE_KEY = "reservation-state";
var QuoteReservationDO = class {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ ok: false, reason: "method_not_allowed" }, { status: 405 });
    }
    let cmd;
    try {
      cmd = await request.json();
    } catch {
      return Response.json({ ok: false, reason: "malformed" }, { status: 400 });
    }
    if (cmd == null || typeof cmd !== "object" || typeof cmd.quoteId !== "string") {
      return Response.json({ ok: false, reason: "malformed" }, { status: 400 });
    }
    const current = await this.state.storage.get(STATE_KEY) ?? {
      status: "none"
    };
    const decision = decideReservation(current, cmd);
    if (decision.ok && !decision.idempotentReplay) {
      await this.state.storage.put(STATE_KEY, decision.state);
    }
    return Response.json(decision, { status: decision.ok ? 200 : 409 });
  }
};
var reservation_do_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/reservations\/([^/]+)$/.exec(url.pathname);
    if (!match || request.method !== "POST") {
      return Response.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    const quoteId = decodeURIComponent(match[1]);
    const body = await request.clone().json().catch(() => null);
    if (body == null || typeof body !== "object" || body.quoteId !== quoteId) {
      return Response.json({ ok: false, reason: "quote_mismatch" }, { status: 400 });
    }
    const stub = env.QUOTE_RESERVATION.get(env.QUOTE_RESERVATION.idFromName(quoteId));
    return stub.fetch(request);
  }
};
export {
  QuoteReservationDO,
  reservation_do_default as default
};
