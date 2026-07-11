import { PlatformEventSchema, type AttributionToken, type PlatformEvent } from '@platform/contracts';

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
 */

export interface AttributionLock {
  checkoutRef: string;
  resellerId: string;
  tokenId: string;
  lockedAt: string;
}

export type LockOutcome =
  | { ok: true; lock: AttributionLock; event: PlatformEvent; duplicate: boolean }
  | {
      ok: false;
      reason: 'attribution_already_locked';
      lock: AttributionLock;
      collisionAlert: PlatformEvent;
      buyerMessageRef: 'attribution.collision';
    };

export class AttributionLockBook {
  private readonly byCheckout = new Map<string, AttributionLock>();
  private alertCounter = 0;

  lock(args: {
    checkoutRef: string;
    correlationId: string;
    token: AttributionToken;
    at: string;
  }): LockOutcome {
    const existing = this.byCheckout.get(args.checkoutRef);
    if (existing) {
      if (existing.tokenId === args.token.id && existing.resellerId === args.token.resellerId) {
        // The same qualified token re-presented — idempotent, still locked.
        return { ok: true, lock: existing, event: this.lockedEvent(existing, args), duplicate: true };
      }
      this.alertCounter += 1;
      const collisionAlert = PlatformEventSchema.parse({
        name: 'reconciliation.alert.v1',
        envelope: {
          command_id: `attr-collision-${args.checkoutRef}-${this.alertCounter}`,
          correlation_id: args.correlationId,
          aggregateVersion: this.alertCounter,
          actor: 'attribution-service:lock',
          serverTime: args.at,
          version: '1',
        },
        payload: {
          alert: 'attribution_collision_on_locked_checkout',
          checkout_ref: args.checkoutRef,
          locked_reseller_id: existing.resellerId,
          locked_token_id: existing.tokenId,
          rejected_token_id: args.token.id,
          rejected_reseller_id: args.token.resellerId,
        },
      });
      return {
        ok: false,
        reason: 'attribution_already_locked',
        lock: existing,
        collisionAlert,
        buyerMessageRef: 'attribution.collision',
      };
    }
    const lock: AttributionLock = {
      checkoutRef: args.checkoutRef,
      resellerId: args.token.resellerId,
      tokenId: args.token.id,
      lockedAt: args.at,
    };
    this.byCheckout.set(args.checkoutRef, lock);
    return { ok: true, lock, event: this.lockedEvent(lock, args), duplicate: false };
  }

  lockFor(checkoutRef: string): AttributionLock | undefined {
    return this.byCheckout.get(checkoutRef);
  }

  private lockedEvent(lock: AttributionLock, args: { correlationId: string; at: string }): PlatformEvent {
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
}
