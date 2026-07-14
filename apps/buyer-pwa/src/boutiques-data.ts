import { countDeliveredSales, projectStores } from '@shop-plus/store-projection';
import { DEMO_NOW, demoDeliveredSaleEvents, demoStoreEvents } from './demo-stores';

/**
 * WO-7.2a → SP#001-B — S3 DÉCOUVERTE data (buyer PWA). SP-I05 (quoted):
 * "Discovery MUST return reseller STORES, not a cross-reseller product pool."
 * SP-I11: the order is DETERMINISTIC — « dernière mise à jour, la plus récente
 * d'abord » — and its sentence is rendered on-screen (never a hidden score). The
 * directory carries NO price and NO product photo (« le prix vit dans la
 * vitrine ») and NO supplier/commission.
 *
 * SP#001-B: the hard-coded `updatedRank` is GONE. This directory is now the
 * output of THE ONE PRODUCER (`@shop-plus/store-projection`) folded over the
 * demo event log (`demo-stores`) — the SAME producer that feeds the
 * `discovery-service`. `productCount`, the order, the « quand » label, and the
 * hub-verified badge all fall out of real events; nothing is baked. The relative
 * « quand » label is derived from `lastUpdated` against the fixed demo clock
 * (deterministic, SP-I11).
 */

export interface BoutiqueQuand {
  /** Relative-time label kind, resolved to a catalog string in the view. */
  readonly kind: 'hier' | 'jours' | 'semaine';
  /** Days, only for kind==='jours' (« il y a {n} jours »). */
  readonly n?: number;
}

export interface BoutiqueEntry {
  readonly storefrontId: string;
  readonly resellerId: string;
  /** « CHEZ AÏCHA » — display name from the mockup. */
  readonly storeName: string;
  readonly zone: string;
  readonly productCount: number;
  readonly quand: BoutiqueQuand;
  /** Hub-verified badge appears ONLY where true (SP-I19) — derived, never baked. */
  readonly verified: boolean;
  /**
   * Réputation (S8): the exact count of delivered-and-validated sales, folded
   * from delivery-validated events (never a baked number). 0 → the réputation
   * line is hidden (floor = 1). Demo counts here are « démo »-marked in the view.
   */
  readonly deliveredSales: number;
  /** The canon identity slug — the card links to `/v/{slug}`. */
  readonly slug: string;
}

/** « Quand » from the real last-update time, against the fixed demo clock. */
function quandFromLastUpdated(lastUpdated: string): BoutiqueQuand {
  const diffDays = Math.floor((Date.parse(DEMO_NOW) - Date.parse(lastUpdated)) / 86_400_000);
  if (diffDays < 2) return { kind: 'hier' };
  if (diffDays < 7) return { kind: 'jours', n: diffDays };
  return { kind: 'semaine' };
}

/**
 * The directory, PROJECTED (never hand-authored). Only discoverable storefronts
 * appear, ordered by real last-update time (SP-I11) — the producer's order is
 * the directory's order. Computed once from the fixed demo log: pure, no clock.
 */
const DELIVERED_SALES = demoDeliveredSaleEvents();
const STORES: readonly BoutiqueEntry[] = projectStores(demoStoreEvents()).map((s) => ({
  storefrontId: s.storefrontId,
  resellerId: s.resellerId,
  storeName: s.storeName,
  zone: s.zone,
  productCount: s.productCount,
  quand: quandFromLastUpdated(s.lastUpdated),
  verified: s.verified,
  // réputation folded from the delivery-validated events (S8), never hard-coded here.
  deliveredSales: countDeliveredSales(DELIVERED_SALES, s.resellerId),
  slug: s.slug,
}));

/** The zone filter chips, in mockup order (« TOUTES » is the no-filter chip). */
export const BOUTIQUE_ZONES: readonly string[] = Object.freeze([
  'Rood Woko', 'Gounghin', 'Dassasgho', 'Tanghin',
]);

/** The deterministic order (SP-I11), already applied by the producer (last update desc). */
export function orderedBoutiques(): readonly BoutiqueEntry[] {
  return STORES;
}

/**
 * The search filter (SP-I11): a DETERMINISTIC substring match over name + zone,
 * never a relevance score. Order stays last-update-desc. Empty query → all.
 */
export function filterBoutiques(query: string): readonly BoutiqueEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return STORES;
  return STORES.filter((s) => s.storeName.toLowerCase().includes(q) || s.zone.toLowerCase().includes(q));
}

/** All demo stores, ordered — the default directory. */
export function allBoutiques(): readonly BoutiqueEntry[] {
  return STORES;
}

/**
 * The SP-I05 discovery shape — a STORE collection (never a product pool). This
 * is the exact projection the `discovery-returns-stores` gate scans; a test pins
 * the checked-in fixture to it so the gate can never drift from the data.
 */
export interface DiscoveryStore {
  readonly storefrontId: string;
  readonly resellerId: string;
  readonly storeName: string;
  readonly zone: string;
  readonly productCount: number;
}
export interface DiscoveryResponse {
  readonly stores: readonly DiscoveryStore[];
}
export function toDiscoveryResponse(): DiscoveryResponse {
  return {
    stores: STORES.map((s) => ({
      storefrontId: s.storefrontId,
      resellerId: s.resellerId,
      storeName: s.storeName,
      zone: s.zone,
      productCount: s.productCount,
    })),
  };
}
