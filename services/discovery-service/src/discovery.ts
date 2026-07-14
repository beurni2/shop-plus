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

/** Deterministic assembly: zone, then store name, then storefrontId. */
export function buildStoreDiscoveryResponse(stores: StorePreview[]): StoreDiscoveryResponse {
  const ordered = [...stores].sort(
    (a, b) =>
      a.zone.localeCompare(b.zone, 'fr') ||
      a.storeName.localeCompare(b.storeName, 'fr') ||
      a.storefrontId.localeCompare(b.storefrontId),
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
