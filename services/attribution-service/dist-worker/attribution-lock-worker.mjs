// src/lock-core.ts
function decideLock(current, claim) {
  if (current === null) {
    return {
      status: "created",
      lock: {
        checkoutRef: claim.checkoutRef,
        resellerId: claim.resellerId,
        tokenId: claim.tokenId,
        lockedAt: claim.at
      }
    };
  }
  if (current.tokenId === claim.tokenId && current.resellerId === claim.resellerId) {
    return { status: "idempotent", lock: current };
  }
  return {
    status: "collision",
    existing: current,
    rejectedResellerId: claim.resellerId,
    rejectedTokenId: claim.tokenId
  };
}

// worker/attribution-lock-do.ts
var LOCK_KEY = "attribution-lock";
var SEQ_KEY = "collision-seq";
function isLockRequest(v) {
  return v != null && typeof v === "object" && typeof v.checkoutRef === "string" && typeof v.resellerId === "string" && typeof v.tokenId === "string" && typeof v.at === "string";
}
var AttributionLockDO = class {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    if (request.method === "GET") {
      const lock = await this.state.storage.get(LOCK_KEY) ?? null;
      return Response.json({ ok: true, lock });
    }
    if (request.method !== "POST") {
      return Response.json({ ok: false, reason: "method_not_allowed" }, { status: 405 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, reason: "malformed" }, { status: 400 });
    }
    if (!isLockRequest(body)) {
      return Response.json({ ok: false, reason: "malformed" }, { status: 400 });
    }
    const current = await this.state.storage.get(LOCK_KEY) ?? null;
    const decision = decideLock(current, body);
    if (decision.status === "created") {
      await this.state.storage.put(LOCK_KEY, decision.lock);
      return Response.json({ ok: true, status: "created", lock: decision.lock }, { status: 200 });
    }
    if (decision.status === "idempotent") {
      return Response.json({ ok: true, status: "idempotent", lock: decision.lock }, { status: 200 });
    }
    const seq = (await this.state.storage.get(SEQ_KEY) ?? 0) + 1;
    await this.state.storage.put(SEQ_KEY, seq);
    return Response.json(
      {
        ok: false,
        status: "collision",
        existing: decision.existing,
        rejectedResellerId: decision.rejectedResellerId,
        rejectedTokenId: decision.rejectedTokenId,
        seq
      },
      { status: 409 }
    );
  }
};
var attribution_lock_do_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/locks\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      return Response.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    const checkoutRef = decodeURIComponent(match[1]);
    if (request.method === "POST") {
      const body = await request.clone().json().catch(() => null);
      if (body == null || typeof body !== "object" || body.checkoutRef !== checkoutRef) {
        return Response.json({ ok: false, reason: "checkout_mismatch" }, { status: 400 });
      }
    }
    const stub = env.ATTRIBUTION_LOCK.get(env.ATTRIBUTION_LOCK.idFromName(checkoutRef));
    return stub.fetch(request);
  }
};
export {
  AttributionLockDO,
  attribution_lock_do_default as default
};
