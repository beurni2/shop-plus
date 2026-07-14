/**
 * ATTRIBUTION LOCK — pure decision core (LOCK-DURABILITY). This module is
 * pure `current-lock → incoming-token → decision`, with NO `@platform/contracts`
 * import, exactly as `commerce-core/src/reservation.ts` keeps `decideReservation`
 * pure so the Durable Object wrapper can bundle it with zero runtime weight and
 * the persistence layer owns storage. Both the in-memory `AttributionLockBook`
 * and the durable `AttributionLockDO` decide through THIS function, so the
 * semantics (first-lock-wins · locked = immutable · a colliding token contests,
 * never re-attributes) are identical on both paths — proven, not asserted.
 */

export interface AttributionLock {
  checkoutRef: string;
  resellerId: string;
  tokenId: string;
  lockedAt: string;
}

/** A qualified token reduced to what the lock decision needs — never the platform. */
export interface LockClaim {
  checkoutRef: string;
  resellerId: string;
  tokenId: string;
  at: string;
}

export type LockDecision =
  /** No prior lock: this claim becomes the lock (first-lock-wins). */
  | { status: 'created'; lock: AttributionLock }
  /** The SAME qualified token re-presented: idempotent, still locked, no alert. */
  | { status: 'idempotent'; lock: AttributionLock }
  /** A DIFFERENT valid token on a locked checkout: refused; the lock never moves. */
  | { status: 'collision'; existing: AttributionLock; rejectedResellerId: string; rejectedTokenId: string };

/**
 * The whole rule, in one pure step. `current` is the checkout's existing lock
 * (or null). A claim never falls back to the platform: `created`/`idempotent`
 * carry the claim's own reseller, `collision` carries the ORIGINAL locked
 * reseller unchanged.
 */
export function decideLock(current: AttributionLock | null, claim: LockClaim): LockDecision {
  if (current === null) {
    return {
      status: 'created',
      lock: {
        checkoutRef: claim.checkoutRef,
        resellerId: claim.resellerId,
        tokenId: claim.tokenId,
        lockedAt: claim.at,
      },
    };
  }
  if (current.tokenId === claim.tokenId && current.resellerId === claim.resellerId) {
    return { status: 'idempotent', lock: current };
  }
  return {
    status: 'collision',
    existing: current,
    rejectedResellerId: claim.resellerId,
    rejectedTokenId: claim.tokenId,
  };
}
