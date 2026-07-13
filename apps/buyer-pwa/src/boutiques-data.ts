/**
 * WO-7.2a — S3 DÉCOUVERTE data (buyer PWA). SP-I05 (quoted): "Discovery MUST
 * return reseller STORES, not a cross-reseller product pool." SP-I11: the order
 * is DETERMINISTIC — here « dernière mise à jour, la plus récente d'abord » —
 * and its sentence is rendered on-screen (never a hidden score). The directory
 * carries NO price and NO product photo (« le prix vit dans la vitrine ») and
 * NO supplier/commission — a store lists its name, zone, product count, and
 * when it was last updated; tapping it opens her vitrine (canon /v/{slug}).
 *
 * PWA-local demo registry (same pattern as the vitrine's demo map): the buyer
 * app has no backend. The separate `discovery-service` contract orders
 * zone→name→id for its own envelope; THIS view orders by last-update per the
 * S3 mockup — both are deterministic (SP-I11), a view concern, not a contract
 * change. The store cards link to canon `/v/{slug}`; only Aïcha's slug resolves
 * to a full vitrine in this slice (the other four are directory entries whose
 * vitrines are follow-up demo data — journaled).
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
  /** Deterministic sort key — higher is more recent (« la plus récente d'abord »). */
  readonly updatedRank: number;
  readonly quand: BoutiqueQuand;
  /** Hub-verified badge appears ONLY where true (SP-I19). */
  readonly verified: boolean;
  /** The canon identity slug — the card links to `/v/{slug}`. */
  readonly slug: string;
}

/** The demo directory — the five stores the S3 mockup specifies, deep-frozen. */
const RAW_STORES: readonly BoutiqueEntry[] = [
  { storefrontId: 'sf_aicha', resellerId: 'res_aicha', storeName: 'CHEZ AÏCHA', zone: 'Rood Woko', productCount: 6, updatedRank: 5, quand: { kind: 'hier' }, verified: true, slug: 'aicha-4821' },
  { storefrontId: 'sf_mariam', resellerId: 'res_mariam', storeName: 'CHEZ MARIAM', zone: 'Gounghin', productCount: 4, updatedRank: 4, quand: { kind: 'jours', n: 2 }, verified: true, slug: 'mariam-2170' },
  { storefrontId: 'sf_kadi', resellerId: 'res_kadi', storeName: 'BOUTIQUE KADI', zone: 'Dassasgho', productCount: 9, updatedRank: 3, quand: { kind: 'jours', n: 3 }, verified: true, slug: 'kadi-5530' },
  { storefrontId: 'sf_fanta', resellerId: 'res_fanta', storeName: 'CHEZ FANTA', zone: 'Tanghin', productCount: 3, updatedRank: 2, quand: { kind: 'semaine' }, verified: true, slug: 'fanta-8090' },
  { storefrontId: 'sf_awa', resellerId: 'res_awa', storeName: 'CHEZ AWA T.', zone: 'Rood Woko', productCount: 5, updatedRank: 1, quand: { kind: 'semaine' }, verified: true, slug: 'awa-3360' },
];
const STORES: readonly BoutiqueEntry[] = RAW_STORES.map((s) => Object.freeze(s));

/** The zone filter chips, in mockup order (« TOUTES » is the no-filter chip). */
export const BOUTIQUE_ZONES: readonly string[] = Object.freeze([
  'Rood Woko', 'Gounghin', 'Dassasgho', 'Tanghin',
]);

/** Deterministic order: last update, most recent first (SP-I11) — NEVER a score. */
export function orderedBoutiques(stores: readonly BoutiqueEntry[] = STORES): readonly BoutiqueEntry[] {
  return [...stores].sort((a, b) => b.updatedRank - a.updatedRank);
}

/**
 * The search filter (SP-I11): a DETERMINISTIC substring match over name + zone,
 * never a relevance score. Order stays last-update-desc. Empty query → all.
 */
export function filterBoutiques(query: string, stores: readonly BoutiqueEntry[] = STORES): readonly BoutiqueEntry[] {
  const q = query.trim().toLowerCase();
  const base = orderedBoutiques(stores);
  if (q === '') return base;
  return base.filter((s) => s.storeName.toLowerCase().includes(q) || s.zone.toLowerCase().includes(q));
}

/** All demo stores, ordered — the default directory. */
export function allBoutiques(): readonly BoutiqueEntry[] {
  return orderedBoutiques();
}

/**
 * The SP-I05 discovery shape — a STORE collection (never a product pool). This
 * is the exact projection the `discovery-returns-stores` gate scans; a test
 * pins the checked-in fixture to it so the gate can never drift from the data.
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
    stores: orderedBoutiques().map((s) => ({
      storefrontId: s.storefrontId,
      resellerId: s.resellerId,
      storeName: s.storeName,
      zone: s.zone,
      productCount: s.productCount,
    })),
  };
}
