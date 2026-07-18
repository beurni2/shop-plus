/**
 * WO-VITRINE-FLOW — the vitrine-collection SEAM. Production-shaped, demo-fed.
 *
 * GROUND (SP#001-B): `@shop-plus/store-projection` models a vitrine as a fold of
 * `StoreProjectionEvent` (packages/store-projection/src/store-projection.ts:31):
 *   • `listing.published`     — a product joins the vitrine (the membership op)
 *   • `listing.auto_hidden`   — a product leaves it
 *   • `storefront.published {discoverable}` — the privée ⇄ publique toggle
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
  | { readonly type: 'listing.auto_hidden'; readonly listingId: string; readonly at: string }
  | { readonly type: 'storefront.published'; readonly discoverable: boolean; readonly at: string };

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
  /** privée ⇄ publique — a `storefront.published {discoverable}`. */
  setDiscoverable(discoverable: boolean): void;
  /** The LIVE listings (published, not auto-hidden) — StoreProjection.productCount's members. */
  listings(): readonly VitrineListing[];
  has(listingId: string): boolean;
  /** Whether the vitrine is publique (in the directory). Privée stays accessible par lien. */
  isDiscoverable(): boolean;
  /** The reseller's real `/v/{slug}` link (SP#001-B canon slug) — always valid,
   * even privée ("Vitrine privée — accessible par lien"). */
  shareSlug(): string;
  /** Mirrors `resolvePublishedStore`: the slug is resolvable IN THE DIRECTORY only
   * when discoverable (an unpublished vitrine is honestly not-found in discovery). */
  resolvesInDirectory(): boolean;
}

/** Cap a share selection to ≤ VITRINE_SHARE_CAP, preserving order. */
export function capShareSelection(listingIds: readonly string[]): readonly string[] {
  return listingIds.slice(0, VITRINE_SHARE_CAP);
}

/**
 * The demo fold — the RN stand-in for `projectStores`. A listing is live iff its
 * last event is `published` (not `auto_hidden`); discoverable is the latest
 * `storefront.published` value. Pure, so the class adapter and the App's
 * React-state adapter share one fold (no drift). VITRINE-REAL-BACKING swaps this
 * for the real `projectStores`.
 */
export function foldVitrine(events: readonly VitrineEvent[]): {
  readonly live: readonly string[];
  readonly discoverable: boolean;
} {
  const membership = new Map<string, boolean>();
  let discoverable = false;
  for (const e of events) {
    if (e.type === 'listing.published') membership.set(e.listingId, true);
    else if (e.type === 'listing.auto_hidden') membership.set(e.listingId, false);
    else discoverable = e.discoverable;
  }
  return {
    live: [...membership.entries()].filter(([, isLive]) => isLive).map(([id]) => id),
    discoverable,
  };
}

/**
 * The DEMO adapter — an in-memory `VitrineEvent` log + a minimal fold. The fold is
 * the RN stand-in for `projectStores` (VITRINE-REAL-BACKING swaps in the real one);
 * it applies the same two rules the real fold does: a listing is live iff its last
 * event is `published` (not `auto_hidden`), and discoverable is the latest
 * `storefront.published` value.
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

  setDiscoverable(discoverable: boolean): void {
    this.log.push({ type: 'storefront.published', discoverable, at: this.now() });
  }

  listings(): readonly VitrineListing[] {
    return foldVitrine(this.log).live.map((listingId) => ({ listingId }));
  }

  has(listingId: string): boolean {
    return foldVitrine(this.log).live.includes(listingId);
  }

  isDiscoverable(): boolean {
    return foldVitrine(this.log).discoverable;
  }

  shareSlug(): string {
    return this.slug;
  }

  resolvesInDirectory(): boolean {
    return this.isDiscoverable();
  }
}
