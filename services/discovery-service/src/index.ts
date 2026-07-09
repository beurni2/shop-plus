import { makeHealthFetch } from '@shop-plus/observability';
import type { Storefront } from '@platform/contracts';

/**
 * discovery-service stub (WO-SP0.1): store discovery (SP-I05: returns
 * STORES, never a cross-reseller product pool; deterministic, SP-I11).
 * Canonical shapes are imported from the pin, never redefined.
 */
export const SERVICE_NAME = 'discovery-service';

/** The canonical shapes this service will serve views of. */
export type DiscoveryServiceShapes = { storefront: Storefront };

export * from './discovery.js';

export const handleRequest = makeHealthFetch(SERVICE_NAME);

export default { fetch: handleRequest };
