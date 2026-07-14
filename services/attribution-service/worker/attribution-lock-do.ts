import { decideLock, type AttributionLock } from '../src/lock-core.js';

/**
 * AttributionLockDO — the DURABLE attribution-lock authority (LOCK-DURABILITY).
 * One DO instance per checkoutRef (addressed by idFromName(checkoutRef)), so
 * every claim on a checkout serializes through workerd's input gate: two
 * concurrent qualified tokens reach this object one after the other and exactly
 * one locks — the same real mechanism the reservation DO uses (QuoteReservationDO),
 * not a shim. The lock SURVIVES via DO storage; the decision logic is the pure
 * core in src/lock-core.ts (`decideLock`) — no `@platform/contracts` in the
 * bundle, exactly as the reservation DO keeps its pure core clean.
 *
 * The lock is immutable once written: a colliding token bumps a per-checkout
 * (per-aggregate) collision version but never rewrites the lock. `resolveAttribution`
 * (canon's) and the préséance semantics are untouched — this object only makes
 * first-lock-wins DURABLE.
 */

const LOCK_KEY = 'attribution-lock';
const SEQ_KEY = 'collision-seq';

interface LockRequest {
  checkoutRef: string;
  resellerId: string;
  tokenId: string;
  at: string;
}

function isLockRequest(v: unknown): v is LockRequest {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof (v as LockRequest).checkoutRef === 'string' &&
    typeof (v as LockRequest).resellerId === 'string' &&
    typeof (v as LockRequest).tokenId === 'string' &&
    typeof (v as LockRequest).at === 'string'
  );
}

export class AttributionLockDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    // GET — read the persisted lock (or null). This is the projection probe the
    // replay/restart tests read back; it never mutates.
    if (request.method === 'GET') {
      const lock = (await this.state.storage.get<AttributionLock>(LOCK_KEY)) ?? null;
      return Response.json({ ok: true, lock });
    }
    if (request.method !== 'POST') {
      return Response.json({ ok: false, reason: 'method_not_allowed' }, { status: 405 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
    }
    if (!isLockRequest(body)) {
      return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
    }

    const current = (await this.state.storage.get<AttributionLock>(LOCK_KEY)) ?? null;
    const decision = decideLock(current, body);

    if (decision.status === 'created') {
      await this.state.storage.put(LOCK_KEY, decision.lock);
      return Response.json({ ok: true, status: 'created', lock: decision.lock }, { status: 200 });
    }
    if (decision.status === 'idempotent') {
      return Response.json({ ok: true, status: 'idempotent', lock: decision.lock }, { status: 200 });
    }
    // collision — the lock NEVER moves; bump the per-checkout (per-aggregate)
    // collision version, persisted so it too survives a restart.
    const seq = ((await this.state.storage.get<number>(SEQ_KEY)) ?? 0) + 1;
    await this.state.storage.put(SEQ_KEY, seq);
    return Response.json(
      {
        ok: false,
        status: 'collision',
        existing: decision.existing,
        rejectedResellerId: decision.rejectedResellerId,
        rejectedTokenId: decision.rejectedTokenId,
        seq,
      },
      { status: 409 },
    );
  }
}

interface Env {
  ATTRIBUTION_LOCK: DurableObjectNamespace;
}

/**
 * Router: GET/POST /locks/:checkoutRef. The DO name IS the checkoutRef — one
 * lock authority per checkout by construction. A POST body's checkoutRef must
 * agree with the URL, or one checkout's object could be seeded with another's
 * claim. Refuse closed (mirrors the reservation router's quote_mismatch guard).
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/locks\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
    }
    const checkoutRef = decodeURIComponent(match[1]!);
    if (request.method === 'POST') {
      const body = await request.clone().json().catch(() => null);
      if (body == null || typeof body !== 'object' || (body as { checkoutRef?: unknown }).checkoutRef !== checkoutRef) {
        return Response.json({ ok: false, reason: 'checkout_mismatch' }, { status: 400 });
      }
    }
    const stub = env.ATTRIBUTION_LOCK.get(env.ATTRIBUTION_LOCK.idFromName(checkoutRef));
    return stub.fetch(request);
  },
};
