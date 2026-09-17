/**
 * STORE-PROJECTION (SP#001-B) — THE ONE PRODUCER.
 *
 * A single pure fold from the storefront + listing EVENT stream to ONE store's
 * projection, resolved by the slug a link names. DECOUVERTE-RETIREE-1 (founder,
 * 2026-09-17; SP-I05 amended: « there is no cross-reseller discovery »): the
 * whole-directory output and the two surfaces it fed are gone; what stays is
 * the fold itself — a store's `productCount`, `lastUpdated`, and hub-verified
 * badge follow REAL events, never a baked value.
 *
 * SP-I19 (quoted): the hub-verified badge renders ONLY where true — a
 * store is `verified` iff it has at least one LIVE listing whose stock is
 * hub-verified; a store with no verified live stock carries no badge.
 *
 * The events are the Shop+ projection's VIEW of the canon event stream
 * (`storefront.created/published.v1`, `listing.published/auto_hidden.v1`). Each
 * source (the real service, or the buyer PWA's certified demo log) maps its
 * events into this union at its own boundary; canon defines no per-event payload
 * shape, so the stock assurance rides the listing event as app-boundary data. The
 * real hub wire is deferred, so today every real claim is `'declared'` and NO real
 * store can earn the badge — which is the honest state, not a missing feature.
 *
 * Pure and dependency-free (no `@platform/contracts` runtime import) so it is
 * safe inside the buyer PWA's payload budget.
 */

/**
 * HUB-ASSURANCE-1 — the PROVENANCE of a stock claim. Declared stock is recorded
 * honestly; only a real Boutik+ hub signal earns the customer-visible badge.
 * Shop-local: `hubVerified` never existed in `@platform/contracts`, and canon's
 * `PlatformEventSchema` declares its payload as a free-form record, so the event
 * NAME is canon while its SHAPE is ours — no canon cycle, no three-repo migration.
 */
export interface StockAssurance {
  readonly source: 'declared' | 'hub';
}

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
      /**
       * HUB-ASSURANCE-1 — WHERE THE STOCK CLAIM CAME FROM, not whether someone
       * asserted it. This replaced a `hubVerified: boolean`, and the reason is the
       * whole point of the change: a boolean cannot distinguish « the seller told us
       * she has stock » from « the Boutik+ hub confirmed it », so declared stock set
       * the SAME flag as a real hub signal — and that flag renders a « Vérifiée »
       * badge beside the shop name on the vitrine, in the same visual
       * language as the platform's own trust marks. **ONLY `'hub'` MAY EVER SET THE
       * BADGE.** Renaming the boolean could not have carried that distinction.
       */
      readonly stockAssurance: StockAssurance;
      readonly at: string;
    }
  | {
      readonly type: 'listing.auto_hidden';
      readonly storefrontId: string;
      readonly listingId: string;
      readonly at: string;
    };

/** One projected store — derived from its events, never hard-coded. */
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
  /** ≥1 live listing whose stock assurance came from the HUB (SP-I19) — else no
   *  badge. Declared stock never sets this; see StockAssurance. */
  readonly verified: boolean;
}

interface ListingState {
  live: boolean;
  /** HUB-ASSURANCE-1 — the PROVENANCE, carried through the fold unflattened so the
   *  badge decision below can ask WHERE the claim came from, not merely whether one
   *  was made. Flattening this back to a boolean here would re-open the hole. */
  stockAssurance: StockAssurance;
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
 * project a store no create ever announced).
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
      store.listings.set(ev.listingId, { live: true, stockAssurance: ev.stockAssurance });
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
    // ONLY a real hub signal earns the badge. Declared stock is recorded and
    // counted (it is a live product) but NEVER renders « Vérifiée ».
    if (listing.stockAssurance.source === 'hub') verified = true;
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
 * Resolve a vitrine slug to its PUBLISHED store, or `undefined` (honest
 * not-found). An unknown slug and a known-but-unpublished slug both resolve to
 * `undefined` — a link never opens a vitrine for a store its reseller has not
 * put online. DECOUVERTE-RETIREE-1 (SP-I05 amended, 2026-09-17): this is the
 * ONLY way a store is reached — one slug, one store; the former whole-directory
 * fold (every published store, ordered) is gone with the directory it served.
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
