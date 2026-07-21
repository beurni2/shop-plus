import { makeHealthFetch } from '@shop-plus/observability';
import type { ResellerListing, Storefront } from '@platform/contracts';
import { resolveMediaStore, type MediaEnv } from './media/media-store.js';
import { StorefrontMediaService, type MediaKind } from './media/service.js';

/**
 * storefront-service: Storefront authoring + customer-surface projections (Shop+
 * OWNS Storefront & Attribution, §5.2) + STOREFRONT-MEDIA-BACKING — the
 * through-a-service media backend (cover/avatar/voice upload → validate → store →
 * moderation hold → buyer projection). Canonical shapes are imported from the
 * pin, never redefined.
 */
export const SERVICE_NAME = 'storefront-service';

/** The canonical shapes this service will serve views of. */
export type StorefrontServiceShapes = { storefront: Storefront; resellerListing: ResellerListing };

export * from './customer-projection.js';
export * from './storefront-aggregate.js';
export * from './listing-aggregate.js';
export * from './media/media-store.js';
export * from './media/service.js';

const health = makeHealthFetch(SERVICE_NAME);

/** The media moderation registry persists across requests. In workerd the env
 * rides each fetch; in Node it reads process.env. No GCS creds → the mock store. */
let mediaService: StorefrontMediaService | undefined;
function getMediaService(env?: MediaEnv): StorefrontMediaService {
  if (mediaService === undefined) mediaService = new StorefrontMediaService(resolveMediaStore(env));
  return mediaService;
}

const KINDS: readonly MediaKind[] = ['cover', 'avatar', 'voice'];

/**
 * THE UPLOAD ENDPOINT — phone → service → store. The app POSTs the raw bytes with
 * `kind`/`storefrontId` (and `pid`/`durationMs` for voice) in the query; the
 * service validates + stores server-side and returns the RESELLER's view (she may
 * preview her own pending upload). The buyer projection (`buyerMedia`) is what
 * strips non-live media — the buyer only ever receives a live URL.
 */
async function handleMediaUpload(request: Request, env?: MediaEnv): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const storefrontId = url.searchParams.get('storefrontId');
  if (storefrontId === null || kind === null || !(KINDS as readonly string[]).includes(kind)) {
    return Response.json({ service: SERVICE_NAME, error: 'bad_request' }, { status: 400 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  const pidParam = url.searchParams.get('pid');
  const durationRaw = url.searchParams.get('durationMs');
  const outcome = await getMediaService(env).upload({
    storefrontId,
    kind: kind as MediaKind,
    bytes,
    at: new Date().toISOString(),
    ...(pidParam !== null ? { pid: pidParam } : {}),
    ...(durationRaw !== null ? { durationMs: Number(durationRaw) } : {}),
  });
  if (!outcome.ok) return Response.json({ service: SERVICE_NAME, error: outcome.reason }, { status: 400 });
  const r = outcome.record;
  return Response.json(
    { service: SERVICE_NAME, kind: r.kind, status: r.status, url: r.url, width: r.width, height: r.height, durationMs: r.durationMs },
    { status: 201 },
  );
}

export const handleRequest = (request: Request, env?: MediaEnv): Response | Promise<Response> => {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/media/upload') return handleMediaUpload(request, env);
  return health(request);
};

export default { fetch: handleRequest };
