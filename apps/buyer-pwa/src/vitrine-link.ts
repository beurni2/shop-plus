import { shortCodeToSlug, type AttributionArrival } from '@platform/contracts';
import type { VitrineViewModel } from './vitrine-view';

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
 * The DEMO identity registry (demo/store.ts is frozen, so the reseller vitrine
 * identity lives here). The short code is ASCII per ResellerShortCodeSchema
 * (`AICHA-4821`); the DISPLAY name carries the diacritic (« Aïcha »). Prices
 * are HER prices (productSubtotal = B + M) — no supplier, no commission (SP-I03).
 */
export interface VitrineIdentity {
  readonly resellerId: string;
  readonly shortCode: string;
  readonly slug: string;
  readonly view: VitrineViewModel;
}

const DEMO_VITRINE: VitrineIdentity = {
  resellerId: 'res_aicha',
  shortCode: 'AICHA-4821',
  slug: 'aicha-4821',
  view: {
    resellerName: 'Aïcha',
    zone: 'Rood Woko, Ouagadougou',
    products: [
      { productName: 'Bazin riche brodé', priceFcfa: 11_500, inStock: true },
      { productName: 'Sac en cuir tanné', priceFcfa: 9_000, inStock: true },
      { productName: 'Foulard wax', priceFcfa: 3_500, inStock: false },
    ],
  },
};

/** Resolve a slug → its vitrine identity (server-side in production; demo map here). */
export function resolveVitrineSlug(slug: string): VitrineIdentity | undefined {
  return slug === DEMO_VITRINE.slug ? DEMO_VITRINE : undefined;
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
