import { makeHealthFetch } from '@shop-plus/observability';
import type { ResellerListing, Storefront } from '@platform/contracts';
import { resolveMediaStore, type MediaEnv } from './media/media-store.js';
import { StorefrontMediaService, type MediaKind } from './media/service.js';
import { toStorefrontView } from './customer-projection.js';
import { resolveStorefrontStore, type StorefrontStoreEnv } from './storefront-store.js';

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

/** The service env — media backing + the storefront DO binding (both optional;
 * absent ⇒ the in-memory/mock substrates, so CI never reaches real storage). */
export type StorefrontServiceEnv = MediaEnv & StorefrontStoreEnv;

/**
 * THE READ PATH — GET /s/{slug}. Resolves against the storefront store (durable
 * when the DO binding is present, in-memory otherwise) and emits the buyer-safe
 * StorefrontView. An unknown slug is the HONEST not-found (404) the PWA already
 * renders as VitrineEtat 'invalid' — never a 500, never a neighbouring store.
 */
async function handleStorefrontRead(slug: string, env?: StorefrontStoreEnv): Promise<Response> {
  const storefront = await resolveStorefrontStore(env).getBySlug(slug);
  if (storefront === undefined) {
    return Response.json({ service: SERVICE_NAME, error: 'not_found' }, { status: 404 });
  }
  return Response.json(toStorefrontView(storefront), { status: 200 });
}

/**
 * THE MEDIA READ ROUTE — GET /media/{key} (STOREFRONT-DEPLOY-1). Serves the bytes
 * back THROUGH THE SERVICE from the private R2 bucket (`env.BUCKET.get(key)`) —
 * the bucket is never public. Immutable cache: media keys are content-versioned
 * (a random uuid), so the Cloudflare edge (a PoP near Ouaga) absorbs the R2/ENAM
 * origin distance after the first fetch. No R2 binding (CI/local) → honest 404.
 * NOTE (journaled): a live-only gate belongs here once the media registry is
 * durable — today the buyer projection already emits live-only URLs.
 */
async function handleMediaRead(key: string, env?: MediaEnv): Promise<Response> {
  const bucket = env?.BUCKET;
  if (bucket === undefined || typeof bucket.get !== 'function') {
    return Response.json({ service: SERVICE_NAME, error: 'not_found' }, { status: 404 });
  }
  const object = await bucket.get(key);
  if (object === null) {
    return Response.json({ service: SERVICE_NAME, error: 'not_found' }, { status: 404 });
  }
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export const handleRequest = (request: Request, env?: StorefrontServiceEnv): Response | Promise<Response> => {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/media/upload') return handleMediaUpload(request, env);
  const slugMatch = /^\/s\/([^/]+)$/.exec(url.pathname);
  if (request.method === 'GET' && slugMatch) return handleStorefrontRead(decodeURIComponent(slugMatch[1]!), env);
  const mediaReadMatch = /^\/media\/(.+)$/.exec(url.pathname);
  if (request.method === 'GET' && mediaReadMatch) return handleMediaRead(decodeURI(mediaReadMatch[1]!), env);
  return health(request);
};

export default { fetch: handleRequest };
