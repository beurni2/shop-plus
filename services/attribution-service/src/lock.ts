import { PlatformEventSchema, type AttributionToken, type PlatformEvent } from '@platform/contracts';
import { decideLock, type AttributionLock, type LockClaim } from './lock-core.js';

export type { AttributionLock } from './lock-core.js';

/**
 * ATTRIBUTION LOCK — FIRST LOCK WINS (SP-I01: "Every confirmed order MUST
 * carry exactly one reseller_id locked from a qualified attribution";
 * boundary rule: Shop+ never changes locked attribution). A checkout locks
 * to the FIRST qualified token; a second VALID token arriving on a locked
 * checkout is REFUSED — no silent re-attribution, no fallback to platform
 * (the WO-SP0.1 fails-closed discipline extended). The collision emits a
 * reconciliation.alert.v1 so operations sees contested checkouts; the buyer
 * sees an honest message (catalog key attribution.collision).
 *
 * Callers verify the token FIRST (verifyAttributionToken) — this book never
 * sees an unverified token.
 *
 * LOCK-DURABILITY: the DECISION is the pure `decideLock` (lock-core.ts); the
 * canon events are built by the SHARED builders below. The in-memory book here
 * keeps the byte-identical semantics for callers and unit tests; the durable
 * `AttributionLockDO` (worker/) decides through the SAME core and builds the
 * SAME events, so a lock survives a restart with no semantic drift.
 */

export type LockOutcome =
  | { ok: true; lock: AttributionLock; event: PlatformEvent; duplicate: boolean }
  | {
      ok: false;
      reason: 'attribution_already_locked';
      lock: AttributionLock;
      collisionAlert: PlatformEvent;
      buyerMessageRef: 'attribution.collision';
    };

/** The canon `attribution.locked.v1` event for a lock — one aggregate, version 1. */
export function attributionLockedEvent(
  lock: AttributionLock,
  args: { correlationId: string; at: string },
): PlatformEvent {
  return PlatformEventSchema.parse({
    name: 'attribution.locked.v1',
    envelope: {
      command_id: `attr-lock-${lock.checkoutRef}`,
      correlation_id: args.correlationId,
      aggregateVersion: 1,
      actor: 'attribution-service:lock',
      serverTime: args.at,
      version: '1',
    },
    payload: {
      checkout_ref: lock.checkoutRef,
      reseller_id: lock.resellerId,
      token_id: lock.tokenId,
    },
  });
}

/**
 * The canon `reconciliation.alert.v1` for a contested checkout. `seq` is the
 * aggregate version + the alert command_id's tie-break suffix; the in-memory
 * book supplies its per-book counter, the durable DO supplies the per-checkout
 * persisted version — same event shape, same payload, on both paths.
 */
export function attributionCollisionAlert(args: {
  existing: AttributionLock;
  rejectedResellerId: string;
  rejectedTokenId: string;
  correlationId: string;
  at: string;
  seq: number;
}): PlatformEvent {
  return PlatformEventSchema.parse({
    name: 'reconciliation.alert.v1',
    envelope: {
      command_id: `attr-collision-${args.existing.checkoutRef}-${args.seq}`,
      correlation_id: args.correlationId,
      aggregateVersion: args.seq,
      actor: 'attribution-service:lock',
      serverTime: args.at,
      version: '1',
    },
    payload: {
      alert: 'attribution_collision_on_locked_checkout',
      checkout_ref: args.existing.checkoutRef,
      locked_reseller_id: args.existing.resellerId,
      locked_token_id: args.existing.tokenId,
      rejected_token_id: args.rejectedTokenId,
      rejected_reseller_id: args.rejectedResellerId,
    },
  });
}

export class AttributionLockBook {
  private readonly byCheckout = new Map<string, AttributionLock>();
  private alertCounter = 0;

  lock(args: {
    checkoutRef: string;
    correlationId: string;
    token: AttributionToken;
    at: string;
  }): LockOutcome {
    const claim: LockClaim = {
      checkoutRef: args.checkoutRef,
      resellerId: args.token.resellerId,
      tokenId: args.token.id,
      at: args.at,
    };
    const decision = decideLock(this.byCheckout.get(args.checkoutRef) ?? null, claim);
    if (decision.status === 'collision') {
      this.alertCounter += 1;
      return {
        ok: false,
        reason: 'attribution_already_locked',
        lock: decision.existing,
        collisionAlert: attributionCollisionAlert({
          existing: decision.existing,
          rejectedResellerId: decision.rejectedResellerId,
          rejectedTokenId: decision.rejectedTokenId,
          correlationId: args.correlationId,
          at: args.at,
          seq: this.alertCounter,
        }),
        buyerMessageRef: 'attribution.collision',
      };
    }
    if (decision.status === 'created') {
      this.byCheckout.set(args.checkoutRef, decision.lock);
    }
    return {
      ok: true,
      lock: decision.lock,
      event: attributionLockedEvent(decision.lock, args),
      duplicate: decision.status === 'idempotent',
    };
  }

  lockFor(checkoutRef: string): AttributionLock | undefined {
    return this.byCheckout.get(checkoutRef);
  }
}
