import { makeHealthFetch } from '@shop-plus/observability';
import type { AttributionToken } from '@platform/contracts';

/**
 * attribution-service stub (WO-SP0.1): signed attribution tokens (SP-I09;
 * tamper fails closed, SP2.1). Shop+ OWNS Storefront&Attribution (§5.2).
 * Canonical shapes are imported from the pin, never redefined.
 */
export const SERVICE_NAME = 'attribution-service';

/** The canonical shapes this service will serve views of. */
export type AttributionServiceShapes = { attributionToken: AttributionToken };

export * from './attribution.js';
export * from './lock.js';
export * from './resolution.js';
export * from './durable-lock-client.js';

export const handleRequest = makeHealthFetch(SERVICE_NAME);

export default { fetch: handleRequest };
