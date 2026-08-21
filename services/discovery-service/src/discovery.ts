import { z } from 'zod';
import { projectStores, type StoreProjectionEvent } from '@shop-plus/store-projection';

/**
 * Discovery response CONTRACT (SP-I05): discovery returns reseller STORES —
 * matching-item previews may ride along nested under their store, but the
 * top level is a store collection, never a flat cross-reseller product
 * pool. Ordering is deterministic (SP-I11): zone, then store name, then id —
 * no learned ranking. These are Shop+-owned view envelopes over the
 * canonical Storefront (Shop+ owns Storefront&Attribution, §5.2); no
 * canonical shape is redefined.
 */

export const MatchingItemPreviewSchema = z
  .object({
    listingId: z.string().min(1),
    productName: z.string().min(1),
    customerPriceFcfa: z.number().int().nonnegative(),
  })
  .strict();
export type MatchingItemPreview = z.infer<typeof MatchingItemPreviewSchema>;

export const StorePreviewSchema = z
  .object({
    storefrontId: z.string().min(1),
    resellerId: z.string().min(1),
    storeName: z.string().min(1),
    zone: z.string().min(1),
    matchingItemPreviews: z.array(MatchingItemPreviewSchema).optional(),
  })
  .strict();
export type StorePreview = z.infer<typeof StorePreviewSchema>;

export const StoreDiscoveryResponseSchema = z
  .object({
    stores: z.array(StorePreviewSchema),
  })
  .strict();
export type StoreDiscoveryResponse = z.infer<typeof StoreDiscoveryResponseSchema>;

/**
 * Audit H2 — the French-aware comparator, WITHOUT the runtime's collation
 * tables. `localeCompare(x, 'fr')` delegates to ICU, whose tables differ
 * across runtimes and versions (workerd vs Node vs a future upgrade) — so the
 * « deterministic » SP-I11 order could silently differ between the deployed
 * Worker and the CI that certified it. This comparator depends only on
 * Unicode NFD (specified by the standard, engine-stable): accents fold onto
 * their base letters and case folds away for ORDERING (« Épicerie » sorts with
 * the E names, « Aïcha » beside « Aicha »), then the raw string breaks ties so
 * two distinct strings never compare equal (a total order, SP-I11).
 */
function frCompare(a: string, b: string): number {
  const keyA = a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const keyB = b.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (keyA < keyB) return -1;
  if (keyA > keyB) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Deterministic assembly: zone, then store name, then storefrontId. */
export function buildStoreDiscoveryResponse(stores: StorePreview[]): StoreDiscoveryResponse {
  const ordered = [...stores].sort(
    (a, b) =>
      frCompare(a.zone, b.zone) ||
      frCompare(a.storeName, b.storeName) ||
      frCompare(a.storefrontId, b.storefrontId),
  );
  return StoreDiscoveryResponseSchema.parse({ stores: ordered });
}

/**
 * SP#001-B — the discovery envelope, fed by THE ONE PRODUCER
 * (`@shop-plus/store-projection`) over the real storefront + listing event
 * stream. Only DISCOVERABLE storefronts project (SP-I05: stores, never a product
 * pool); the envelope keeps its deterministic zone→name→id order (SP-I11).
 * Matching-item previews (search) are SP5.1 — deferred; the top level is a pure
 * store collection here.
 */
export function projectStoreDiscovery(events: readonly StoreProjectionEvent[]): StoreDiscoveryResponse {
  const previews: StorePreview[] = projectStores(events).map((s) => ({
    storefrontId: s.storefrontId,
    resellerId: s.resellerId,
    storeName: s.storeName,
    zone: s.zone,
  }));
  return buildStoreDiscoveryResponse(previews);
}
