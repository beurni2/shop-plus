import { makeHealthFetch } from '@shop-plus/observability';
import type { ResellerListing, Storefront } from '@platform/contracts';

/**
 * storefront-service stub (WO-SP0.1): Storefront authoring + customer-surface
 * projections (Shop+ OWNS Storefront&Attribution, §5.2). Canonical shapes are
 * imported from the pin, never redefined.
 */
export const SERVICE_NAME = 'storefront-service';

/** The canonical shapes this service will serve views of. */
export type StorefrontServiceShapes = { storefront: Storefront; resellerListing: ResellerListing };

export * from './customer-projection.js';
export * from './storefront-aggregate.js';

export const handleRequest = makeHealthFetch(SERVICE_NAME);

export default { fetch: handleRequest };
