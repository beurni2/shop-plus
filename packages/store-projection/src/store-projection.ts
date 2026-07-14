/**
 * STORE-PROJECTION (SP#001-B) — THE ONE PRODUCER.
 *
 * A single pure fold from the storefront + listing EVENT stream to the store
 * directory projection. It is the ONE producer that feeds BOTH customer
 * surfaces: the buyer PWA directory (S3 Découverte) and the `discovery-service`
 * envelope. Killing the two hard-coded datasets is the point — a store's
 * `productCount`, `lastUpdated`, and hub-verified badge now follow REAL events,
 * never a baked `updatedRank`.
 *
 * SP-I05 (quoted): "Discovery MUST return reseller STORES, not a cross-reseller
 * product pool." The output is a STORE collection; a product never rises to the
 * top level. SP-I11 (quoted): deterministic — the order is `lastUpdated` desc
 * (« la plus récente d'abord ») with a `storefrontId` tiebreak; never a learned
 * score. SP-I19 (quoted): the hub-verified badge renders ONLY where true — a
 * store is `verified` iff it has at least one LIVE listing whose stock is
 * hub-verified; a store with no verified live stock carries no badge.
 *
 * The events are the Shop+ projection's VIEW of the canon event stream
 * (`storefront.created/published.v1`, `listing.published/auto_hidden.v1`). Each
 * source (the real service, or the buyer PWA's certified demo log) maps its
 * events into this union at its own boundary; canon defines no per-event payload
 * shape, so `hubVerified` rides the listing event as app-boundary data (the
 * Boutik+ hub signal; the real hub wire is deferred — the demo-supply seam
 * supplies it, honestly, per store).
 *
 * Pure and dependency-free (no `@platform/contracts` runtime import) so it is
 * safe inside the buyer PWA's payload budget.
 */

export type StoreProjectionEvent =
  | {
      readonly type: 'storefront.created';
      readonly storefrontId: string;
      readonly resellerId: string;
      readonly storeName: string;
      readonly zone: string;
      readonly slug: string;
      readonly at: string;
    }
  | {
      readonly type: 'storefront.published';
      readonly storefrontId: string;
      readonly discoverable: boolean;
      readonly at: string;
    }
  | {
      readonly type: 'listing.published';
      readonly storefrontId: string;
      readonly listingId: string;
      /** The Boutik+ hub-verified-stock signal (SP-I19). Real wire deferred. */
      readonly hubVerified: boolean;
      readonly at: string;
    }
  | {
      readonly type: 'listing.auto_hidden';
      readonly storefrontId: string;
      readonly listingId: string;
      readonly at: string;
    };

/** One projected store — the directory's row, derived, never hard-coded. */
export interface StoreProjection {
  readonly storefrontId: string;
  readonly resellerId: string;
  readonly storeName: string;
  readonly zone: string;
  /** The canon identity slug — the card links to `/v/{slug}`. */
  readonly slug: string;
  readonly discoverable: boolean;
  /** Count of LIVE listings (published, not auto-hidden). */
  readonly productCount: number;
  /** Max event time across the storefront + its listings — the ordering truth. */
  readonly lastUpdated: string;
  /** ≥1 live listing with hub-verified stock (SP-I19) — else no badge. */
  readonly verified: boolean;
}

interface ListingState {
  live: boolean;
  hubVerified: boolean;
}

interface StoreAcc {
  storefrontId: string;
  resellerId: string;
  storeName: string;
  zone: string;
  slug: string;
  discoverable: boolean;
  lastUpdated: string;
  readonly listings: Map<string, ListingState>;
}

/** ISO-8601 UTC timestamps in one format sort lexicographically; keep the later. */
function later(a: string, b: string): string {
  return b > a ? b : a;
}

/**
 * Fold the event stream into per-store accumulators. Single pass, deterministic:
 * the same events in the same order always yield the same accumulators. A
 * listing event for an unknown storefront is skipped (a listing can never
 * project a store the directory has never heard of).
 */
function foldStores(events: readonly StoreProjectionEvent[]): Map<string, StoreAcc> {
  const byId = new Map<string, StoreAcc>();
  for (const ev of events) {
    if (ev.type === 'storefront.created') {
      const existing = byId.get(ev.storefrontId);
      if (existing) {
        // Idempotent replay: identity is fixed by the first create; only time advances.
        existing.lastUpdated = later(existing.lastUpdated, ev.at);
        continue;
      }
      byId.set(ev.storefrontId, {
        storefrontId: ev.storefrontId,
        resellerId: ev.resellerId,
        storeName: ev.storeName,
        zone: ev.zone,
        slug: ev.slug,
        discoverable: false,
        lastUpdated: ev.at,
        listings: new Map<string, ListingState>(),
      });
      continue;
    }
    const store = byId.get(ev.storefrontId);
    if (!store) continue; // event for an unknown storefront — skip
    if (ev.type === 'storefront.published') {
      store.discoverable = ev.discoverable;
      store.lastUpdated = later(store.lastUpdated, ev.at);
    } else if (ev.type === 'listing.published') {
      store.listings.set(ev.listingId, { live: true, hubVerified: ev.hubVerified });
      store.lastUpdated = later(store.lastUpdated, ev.at);
    } else {
      // listing.auto_hidden — hiding is a store update; the listing goes non-live.
      const listing = store.listings.get(ev.listingId);
      if (listing) listing.live = false;
      store.lastUpdated = later(store.lastUpdated, ev.at);
    }
  }
  return byId;
}

function toProjection(store: StoreAcc): StoreProjection {
  let productCount = 0;
  let verified = false;
  for (const listing of store.listings.values()) {
    if (!listing.live) continue;
    productCount += 1;
    if (listing.hubVerified) verified = true;
  }
  return {
    storefrontId: store.storefrontId,
    resellerId: store.resellerId,
    storeName: store.storeName,
    zone: store.zone,
    slug: store.slug,
    discoverable: store.discoverable,
    productCount,
    lastUpdated: store.lastUpdated,
    verified,
  };
}

/**
 * THE PRODUCER: the event stream → one `StoreProjection` per DISCOVERABLE
 * storefront, ordered `lastUpdated` desc then `storefrontId` asc (deterministic,
 * SP-I11). A storefront created but never published — or unpublished again —
 * does not appear (only-discoverable-storefronts-project).
 */
export function projectStores(events: readonly StoreProjectionEvent[]): readonly StoreProjection[] {
  const discoverable: StoreProjection[] = [];
  for (const store of foldStores(events).values()) {
    if (store.discoverable) discoverable.push(toProjection(store));
  }
  discoverable.sort(
    (a, b) => (a.lastUpdated < b.lastUpdated ? 1 : a.lastUpdated > b.lastUpdated ? -1 : a.storefrontId.localeCompare(b.storefrontId)),
  );
  return discoverable;
}

/**
 * Resolve a vitrine slug to its PUBLISHED store, or `undefined` (honest
 * not-found). An unknown slug and a known-but-unpublished slug both resolve to
 * `undefined` — the directory never opens a vitrine for a store that is not
 * discoverable.
 */
export function resolvePublishedStore(
  events: readonly StoreProjectionEvent[],
  slug: string,
): StoreProjection | undefined {
  for (const store of foldStores(events).values()) {
    if (store.discoverable && store.slug === slug) return toProjection(store);
  }
  return undefined;
}
