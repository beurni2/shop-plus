import type { DeliveredSaleEvent, StoreProjectionEvent } from '@shop-plus/store-projection';
import type { VitrineProduct } from './vitrine-view';

/**
 * SP#001-B — THE ONE DEMO DATASET (buyer PWA has no backend). This is the
 * certified-mock event SOURCE: the same five S3 stores, expressed as the REAL
 * storefront + listing events the aggregates emit (created → published →
 * listings). It feeds BOTH customer surfaces through the ONE producer
 * (`@shop-plus/store-projection`): the S3 directory (`boutiques-data`) and the
 * vitrine resolution (`vitrine-link`). Nothing here is hard-coded ordering or a
 * baked `updatedRank` — the directory's order, product count, last-update label,
 * and hub-verified badge all fall out of these events.
 *
 * The shapes are real; only the SOURCE is demo (Execution Contract §3 —
 * mock-certified). The real event stream (storefront-service aggregates, live
 * Boutik supply) replaces this map without touching the producer or the views.
 */

export interface DemoStore {
  readonly storefrontId: string;
  readonly resellerId: string;
  /** Directory display name (« CHEZ AÏCHA »). */
  readonly storeName: string;
  /** Vitrine header name (« Aïcha ») — the commercial relationship (SP-I03). */
  readonly resellerName: string;
  /** ASCII short code per canon `ResellerShortCodeSchema` (`AICHA-4821`). */
  readonly shortCode: string;
  /** Directory zone (« Rood Woko »). */
  readonly zone: string;
  /** Vitrine header zone, a landmark (« Rood Woko, Ouagadougou »). */
  readonly vitrineZone: string;
  readonly slug: string;
  /** Number of live listed products — the directory count. */
  readonly productCount: number;
  /** Hub-verified stock (SP-I19) — drives the badge, only where true. */
  readonly verified: boolean;
  /** Days before the demo reference clock the store was last touched. */
  readonly daysAgo: number;
  /**
   * DEMO count of delivered-and-validated sales (S8 réputation). These are DEMO
   * numbers under the « données d'essai » ribbon — the render marks them « démo »
   * so a fabricated count is never mistaken for a real trust claim. The founder's
   * real store starts at zero until a delivery validates; a store with 0 renders
   * no réputation line (floor = 1).
   */
  readonly deliveredSales: number;
  /** The vitrine's product rows — HER prices (productSubtotal), no supplier/commission. */
  readonly products: readonly VitrineProduct[];
}

/** The demo reference clock — fixed, so the relative-time labels stay deterministic (SP-I11). */
export const DEMO_NOW = '2026-07-14T12:00:00.000Z';

/**
 * The five S3 stores. Directory `productCount` and the vitrine `products` are
 * independent by design (the vitrine shows a curated sample, not the whole
 * shelf) — as in WO-7.2a. Aïcha's vitrine is the canon pinned demo; the other
 * four carry small honest sample shelves so every card opens a real vitrine.
 */
export const DEMO_STORES: readonly DemoStore[] = [
  {
    storefrontId: 'sf_aicha', resellerId: 'res_aicha', storeName: 'CHEZ AÏCHA', resellerName: 'Aïcha',
    shortCode: 'AICHA-4821', zone: 'Rood Woko', vitrineZone: 'Rood Woko, Ouagadougou', slug: 'aicha-4821',
    productCount: 6, verified: true, daysAgo: 1, deliveredSales: 47,
    products: [
      { productName: 'Bazin riche brodé', priceFcfa: 11_500, inStock: true },
      { productName: 'Sac en cuir tanné', priceFcfa: 9_000, inStock: true },
      { productName: 'Foulard wax', priceFcfa: 3_500, inStock: false },
    ],
  },
  {
    storefrontId: 'sf_mariam', resellerId: 'res_mariam', storeName: 'CHEZ MARIAM', resellerName: 'Mariam',
    shortCode: 'MARIAM-2170', zone: 'Gounghin', vitrineZone: 'Gounghin, Ouagadougou', slug: 'mariam-2170',
    productCount: 4, verified: true, daysAgo: 2, deliveredSales: 23,
    products: [
      { productName: 'Pagne Faso Dan Fani', priceFcfa: 8_500, inStock: true },
      { productName: 'Ensemble bébé wax', priceFcfa: 6_000, inStock: true },
      { productName: 'Sandales en cuir', priceFcfa: 4_500, inStock: false },
    ],
  },
  {
    storefrontId: 'sf_kadi', resellerId: 'res_kadi', storeName: 'BOUTIQUE KADI', resellerName: 'Kadi',
    shortCode: 'KADI-5530', zone: 'Dassasgho', vitrineZone: 'Dassasgho, Ouagadougou', slug: 'kadi-5530',
    productCount: 9, verified: true, daysAgo: 3, deliveredSales: 61,
    products: [
      { productName: 'Chaussures femme', priceFcfa: 12_000, inStock: true },
      { productName: 'Sac à main', priceFcfa: 7_500, inStock: true },
      { productName: 'Foulard en soie', priceFcfa: 5_000, inStock: true },
    ],
  },
  {
    storefrontId: 'sf_fanta', resellerId: 'res_fanta', storeName: 'CHEZ FANTA', resellerName: 'Fanta',
    shortCode: 'FANTA-8090', zone: 'Tanghin', vitrineZone: 'Tanghin, Ouagadougou', slug: 'fanta-8090',
    productCount: 3, verified: true, daysAgo: 8, deliveredSales: 8,
    products: [
      { productName: 'Robe en pagne', priceFcfa: 9_500, inStock: true },
      { productName: 'Voile brodé', priceFcfa: 6_500, inStock: true },
      { productName: 'Bracelets dorés', priceFcfa: 3_000, inStock: false },
    ],
  },
  {
    storefrontId: 'sf_awa', resellerId: 'res_awa', storeName: 'CHEZ AWA T.', resellerName: 'Awa',
    shortCode: 'AWA-3360', zone: 'Rood Woko', vitrineZone: 'Rood Woko, Ouagadougou', slug: 'awa-3360',
    productCount: 5, verified: true, daysAgo: 9, deliveredSales: 15,
    products: [
      { productName: 'Bazin Getzner', priceFcfa: 15_000, inStock: true },
      { productName: 'Chaussures enfant', priceFcfa: 4_000, inStock: true },
      { productName: 'Parfum en flacon', priceFcfa: 5_500, inStock: true },
    ],
  },
];

/** The demo store, keyed by slug — for vitrine resolution. */
export function demoStoreBySlug(slug: string): DemoStore | undefined {
  return DEMO_STORES.find((s) => s.slug === slug);
}

function timestampFor(daysAgo: number): string {
  return new Date(Date.parse(DEMO_NOW) - daysAgo * 86_400_000).toISOString();
}

/**
 * The demo event log — every store created (unpublished), then published
 * (discoverable), then its listings published (all hub-verified per the store's
 * signal). One timestamp per store keeps `lastUpdated` clean; the producer
 * derives count, order, last-update, and badge from these events alone.
 */
export function demoStoreEvents(): readonly StoreProjectionEvent[] {
  const events: StoreProjectionEvent[] = [];
  for (const s of DEMO_STORES) {
    const at = timestampFor(s.daysAgo);
    events.push({ type: 'storefront.created', storefrontId: s.storefrontId, resellerId: s.resellerId, storeName: s.storeName, zone: s.zone, slug: s.slug, at });
    events.push({ type: 'storefront.published', storefrontId: s.storefrontId, discoverable: true, at });
    for (let i = 0; i < s.productCount; i += 1) {
      events.push({ type: 'listing.published', storefrontId: s.storefrontId, listingId: `${s.storefrontId}-l${i}`, hubVerified: s.verified, at });
    }
  }
  return events;
}

/**
 * The demo delivered-sale events (S8 réputation) — `deliveredSales` validated
 * orders per store, each a distinct `orderId`, attributed to the store's
 * reseller. The réputation fold counts these (fold-derived, never a hard-coded
 * render number); the render marks the result « démo » since these are test
 * data. Generated from the per-store count so the source stays compact.
 */
export function demoDeliveredSaleEvents(): readonly DeliveredSaleEvent[] {
  const events: DeliveredSaleEvent[] = [];
  for (const s of DEMO_STORES) {
    for (let i = 0; i < s.deliveredSales; i += 1) {
      events.push({ type: 'delivery.validated', resellerId: s.resellerId, orderId: `${s.storefrontId}-ord-${i}` });
    }
  }
  return events;
}
