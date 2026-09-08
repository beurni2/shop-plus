/**
 * WO-VITRINE-FLOW — the vitrine-collection SEAM. Production-shaped, demo-fed.
 *
 * GROUND (SP#001-B): `@shop-plus/store-projection` models a vitrine as a fold of
 * `StoreProjectionEvent` (packages/store-projection/src/store-projection.ts:31):
 *   • `listing.published`     — a product joins the vitrine (the membership op)
 *   • `listing.auto_hidden`   — a product leaves it
 *   (`storefront.published {discoverable}`, the privée ⇄ publique toggle, is the
 *   SERVICE's fact now — VITRINE-VISIBLE-1 — and no longer folded here)
 * `StoreProjection` (…:63) exposes `productCount` (live listings), `discoverable`,
 * and the `/v/{slug}` identity; `resolvePublishedStore(events, slug)` (…:190)
 * resolves a slug to its store ONLY when discoverable (the DIRECTORY rule).
 *
 * THIS SEAM speaks exactly that vocabulary. The reseller RN bundle is snapshot-only
 * (it imports no @shop-plus domain package — money rides `seed.json`, not a
 * `computeWaterfall` import), so today the port is backed by an in-memory demo
 * event log + a minimal demo fold. The op names, the discoverable rule, and the
 * real `/v/` slug are production-shaped; only the DATA SOURCE is demo.
 *
 * FLAG VITRINE-REAL-BACKING (named follow-on — NOT wired now): swap the demo log +
 * demo fold for the live storefront event source + the real
 * `projectStores`/`resolvePublishedStore`. The `VitrineCollectionPort` interface
 * does not change — the adapter does. This is the "later adapter swap, not a
 * rebuild" the work order names.
 */

/** The `StoreProjectionEvent` subset this seam emits — the SP#001-B vocabulary,
 * snapshot-shaped for the RN bundle (kept byte-aligned with store-projection.ts:31). */
export type VitrineEvent =
  | { readonly type: 'listing.published'; readonly listingId: string; readonly at: string }
  | { readonly type: 'listing.auto_hidden'; readonly listingId: string; readonly at: string };

export interface VitrineListing {
  readonly listingId: string;
}

/** UI-enforced share cap — a vitrine card carries at most this many products
 * (WO-VITRINE-FLOW step 3; the UI states the cap to the reseller). */
export const VITRINE_SHARE_CAP = 3;

/**
 * The vitrine-collection port. The demo adapter and the real storefront adapter
 * (VITRINE-REAL-BACKING) implement THE SAME interface — the flow never knows which.
 */
export interface VitrineCollectionPort {
  /** Add a product — a `listing.published` (the real listing-membership op). */
  addToVitrine(listingId: string): void;
  /** Remove a product — a `listing.auto_hidden`. */
  removeFromVitrine(listingId: string): void;
  /** The LIVE listings (published, not auto-hidden) — StoreProjection.productCount's members. */
  listings(): readonly VitrineListing[];
  has(listingId: string): boolean;
  /** The reseller's real `/v/{slug}` link (SP#001-B canon slug) — always valid,
   * even privée ("Vitrine privée — accessible par lien"). */
  shareSlug(): string;
}

/** Cap a share selection to ≤ VITRINE_SHARE_CAP, preserving order. */
export function capShareSelection(listingIds: readonly string[]): readonly string[] {
  return listingIds.slice(0, VITRINE_SHARE_CAP);
}

/**
 * The demo fold — the RN stand-in for `projectStores`. A listing is live iff its
 * last event is `published` (not `auto_hidden`). Pure, so the class adapter and
 * the App's React-state adapter share one fold (no drift). VITRINE-REAL-BACKING
 * swaps this for the real `projectStores`.
 *
 * VITRINE-VISIBLE-1 (AUDIT-SHOP-2 F-13): the fold no longer carries
 * `discoverable`. That fact is the SERVICE's (`Storefront.discoverable`) and the
 * App reads and writes it there; a session-local flag here toasted « Publique »
 * over a shop the wire said the opposite about.
 */
export function foldVitrine(events: readonly VitrineEvent[]): {
  readonly live: readonly string[];
} {
  const membership = new Map<string, boolean>();
  for (const e of events) {
    if (e.type === 'listing.published') membership.set(e.listingId, true);
    else membership.set(e.listingId, false);
  }
  return {
    live: [...membership.entries()].filter(([, isLive]) => isLive).map(([id]) => id),
  };
}

/**
 * The DEMO adapter — an in-memory `VitrineEvent` log + a minimal fold. The fold is
 * the RN stand-in for `projectStores` (VITRINE-REAL-BACKING swaps in the real one);
 * it applies the same membership rule the real fold does: a listing is live iff
 * its last event is `published` (not `auto_hidden`).
 */
export class DemoVitrineCollection implements VitrineCollectionPort {
  private readonly log: VitrineEvent[] = [];

  constructor(
    /** The reseller's canon `/v/{slug}` identity link (derived through `shortCodeToSlug`, SP#001-B). */
    private readonly slug: string,
    /** Injected clock — deterministic in tests, real at runtime. */
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  addToVitrine(listingId: string): void {
    this.log.push({ type: 'listing.published', listingId, at: this.now() });
  }

  removeFromVitrine(listingId: string): void {
    this.log.push({ type: 'listing.auto_hidden', listingId, at: this.now() });
  }

  listings(): readonly VitrineListing[] {
    return foldVitrine(this.log).live.map((listingId) => ({ listingId }));
  }

  has(listingId: string): boolean {
    return foldVitrine(this.log).live.includes(listingId);
  }

  shareSlug(): string {
    return this.slug;
  }
}
