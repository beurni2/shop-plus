import type { AttributionToken } from '@platform/contracts';
import { attributionCollisionAlert, attributionLockedEvent, type LockOutcome } from './lock.js';
import type { AttributionLock } from './lock-core.js';

/**
 * DURABLE LOCK CLIENT (SP#001-D · named condition ②). The checkout seam that
 * locks attribution THROUGH the durable authority — the `AttributionLockDO`
 * (LOCK-DURABILITY / slice C) — instead of the in-memory `AttributionLockBook`.
 * The DO owns the DECISION (`decideLock`) and the PERSISTENCE (first-lock-wins
 * that survives a restart); this client only carries the claim over the wire and
 * translates the DO's response into the SAME `LockOutcome` the in-memory book
 * returns, built with the SAME shared canon-event builders — so callers see one
 * lock contract on either path, and the events are byte-identical.
 *
 * `doFetch` is injected: the e2e passes Miniflare's dispatch (the DO on real
 * workerd), production passes the deployed DO's HTTP fetch. The client never
 * decides the lock itself and never falls back to the platform.
 */

export interface DurableLockResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

/** POST the claim to the DO addressed by checkoutRef; return its HTTP response. */
export type DurableLockFetch = (checkoutRef: string, body: string) => Promise<DurableLockResponse>;

export async function lockThroughDurableAuthority(
  doFetch: DurableLockFetch,
  args: { checkoutRef: string; correlationId: string; token: AttributionToken; at: string },
): Promise<LockOutcome> {
  const body = JSON.stringify({
    checkoutRef: args.checkoutRef,
    resellerId: args.token.resellerId,
    tokenId: args.token.id,
    at: args.at,
  });
  const res = await doFetch(args.checkoutRef, body);
  const payload = (await res.json()) as Record<string, unknown>;

  if (res.status === 200 && (payload['status'] === 'created' || payload['status'] === 'idempotent')) {
    const lock = payload['lock'] as AttributionLock;
    return {
      ok: true,
      lock,
      event: attributionLockedEvent(lock, args),
      duplicate: payload['status'] === 'idempotent',
    };
  }

  if (res.status === 409 && payload['status'] === 'collision') {
    const existing = payload['existing'] as AttributionLock;
    return {
      ok: false,
      reason: 'attribution_already_locked',
      lock: existing,
      collisionAlert: attributionCollisionAlert({
        existing,
        rejectedResellerId: String(payload['rejectedResellerId']),
        rejectedTokenId: String(payload['rejectedTokenId']),
        correlationId: args.correlationId,
        at: args.at,
        seq: Number(payload['seq']),
      }),
      buyerMessageRef: 'attribution.collision',
    };
  }

  // The DO is the only lock authority; an unexpected response never fabricates a
  // lock and never falls back to the platform — it fails closed, loudly.
  throw new Error(`durable lock authority returned an unexpected response (status ${res.status})`);
}
