import { shortCodeToSlug, type AttributionArrival } from '@platform/contracts';
import { countDeliveredSales, resolvePublishedStore } from '@shop-plus/store-projection';
import type { VitrineReputation, VitrineViewModel } from './vitrine-view';
import { DEMO_STORES, demoDeliveredSaleEvents, demoStoreEvents } from './demo-stores';

/**
 * WO-7.1 — the ONE LINK-FORMAT LAW, in code. The identity link the system
 * emits is canon's `shortCodeToSlug` form (`/v/aicha-4821`) — never a
 * query-string. `shortCodeToSlug` already returns the `/v/{slug}` path; the
 * card link is that suffix under the deployed base (so `/shop-plus/v/aicha-4821`
 * in project-page hosting). The vitrine is reached by that path; a
 * `?demo-vitrine=<slug>` param is a LOCAL/GATE harness only (like
 * `?demo-journey`), never the shared link.
 */

/** The canon identity link suffix for a reseller short code: `/v/{slug}`. */
export function identityLinkSuffix(shortCode: string): string {
  return shortCodeToSlug(shortCode); // e.g. AICHA-4821 → /v/aicha-4821
}

/** The full identity link under the app's deployed base (base ends with '/'). */
export function identityLink(shortCode: string, origin: string, basePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  return `${origin}${base}${identityLinkSuffix(shortCode)}`;
}

/**
 * Parse a vitrine slug from a pathname, tolerant of the deployed base path
 * (the 404.html SPA-fallback restores the original `/…/v/{slug}` path before
 * the app boots). Returns the slug (`aicha-4821`) or undefined.
 */
export function vitrineSlugFromPath(pathname: string): string | undefined {
  const m = /\/v\/([a-z0-9-]+)\/?$/.exec(pathname);
  return m ? m[1] : undefined;
}

/**
 * Parse a SIGNED PRODUCT slug from a `/s/{slug}` pathname — the reseller's
 * « the one she sends » link (§6.2.1 Arrival: it opens the offer and carries the
 * signed attribution). Same tolerance for the deployed base path as
 * `vitrineSlugFromPath` (the 404.html SPA-fallback restores the original
 * `/…/s/{slug}` before the app boots). Returns the slug (`aicha-4821`) or
 * undefined. The slug is the reseller's storefront slug — the SAME scheme as
 * `/v/{slug}`, resolved by the SAME port (no second scheme); the offer's product
 * rides a `?pid=` alongside it.
 */
export function signedProductSlugFromPath(pathname: string): string | undefined {
  const m = /\/s\/([a-z0-9-]+)\/?$/.exec(pathname);
  return m ? m[1] : undefined;
}

/**
 * A reseller vitrine identity. The short code is ASCII per
 * ResellerShortCodeSchema (`AICHA-4821`); the DISPLAY name carries the diacritic
 * (« Aïcha »). Prices are HER prices (productSubtotal = B + M) — no supplier, no
 * commission (SP-I03, enforced structurally by the view model).
 */
export interface VitrineIdentity {
  readonly resellerId: string;
  readonly shortCode: string;
  readonly slug: string;
  readonly view: VitrineViewModel;
  /** S8 réputation — « N ventes livrées » on the trust chrome; count 0 hides it. */
  readonly reputation: VitrineReputation;
}

/**
 * SP#001-B — vitrine resolution goes REAL. The 1-of-5 hack (only `aicha-4821`
 * resolved) is gone: a slug resolves iff THE PRODUCER
 * (`@shop-plus/store-projection`) reports that storefront PUBLISHED — any
 * published store resolves, an unknown OR unpublished slug resolves to
 * `undefined` (honest not-found). The vitrine's product rows come from the same
 * demo catalog that seeds the event log; in production the storefront-service
 * serves this, unchanged callers.
 */
export function resolveVitrineSlug(slug: string): VitrineIdentity | undefined {
  const published = resolvePublishedStore(demoStoreEvents(), slug);
  if (!published) return undefined; // unknown or not discoverable → not-found
  const store = DEMO_STORES.find((s) => s.slug === slug);
  if (!store) return undefined;
  return {
    resellerId: store.resellerId,
    shortCode: store.shortCode,
    slug: store.slug,
    view: { resellerName: store.resellerName, zone: store.vitrineZone, products: store.products },
    // S8 réputation — folded from the delivery-validated events, marked « démo » (test data).
    reputation: { count: countDeliveredSales(demoDeliveredSaleEvents(), store.resellerId), demo: true },
  };
}

/**
 * Record an IDENTITY-scope arrival (A8, last-touch) when the buyer lands on the
 * vitrine. Client-only demo: arrivals live in sessionStorage so the checkout
 * seam (resolveCheckoutAttribution) can read them; the checkout itself is never
 * modified. The scope is `identity` — a vitrine touch names no specific offer,
 * so the arrival carries no offerId (canon `AttributionRefSchema` forbids offerId
 * on the `identity` variant; the flat `AttributionArrivalSchema` leaves it
 * optional, so we simply never set it here).
 */
const ARRIVALS_KEY = 'shop-plus.arrivals.v1';

export function recordVitrineArrival(
  identity: VitrineIdentity,
  nowIso: string,
  correlationId: string,
  store: Pick<Storage, 'getItem' | 'setItem'>,
): AttributionArrival {
  const arrival: AttributionArrival = {
    resellerId: identity.resellerId,
    scope: 'identity',
    arrivedAt: nowIso,
    correlationId,
  };
  let existing: AttributionArrival[] = [];
  try {
    const raw = store.getItem(ARRIVALS_KEY);
    if (raw) existing = JSON.parse(raw) as AttributionArrival[];
  } catch {
    existing = [];
  }
  existing.push(arrival);
  store.setItem(ARRIVALS_KEY, JSON.stringify(existing));
  return arrival;
}

export function readArrivals(store: Pick<Storage, 'getItem'>): AttributionArrival[] {
  try {
    const raw = store.getItem(ARRIVALS_KEY);
    return raw ? (JSON.parse(raw) as AttributionArrival[]) : [];
  } catch {
    return [];
  }
}
