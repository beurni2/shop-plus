import { makeHealthFetch, provenance } from '@shop-plus/observability';
import type { ResellerListing, Storefront } from '@platform/contracts';
import { resolveMediaStore, type MediaEnv } from './media/media-store.js';
import { StorefrontMediaService, type MediaKind } from './media/service.js';
import { joinVitrineProduct, toStorefrontView, type VitrineProductRecord } from './customer-projection.js';
import { resolveStorefrontStore, type StorefrontStoreEnv } from './storefront-store.js';
import { resolveSupplySource, type SupplySourceEnv } from './supply-source.js';
import { SUPPLY_COLLECTION_ROUTE, readSupplyCollection } from './supply-collection.js';

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

/**
 * SERVICE-PROVENANCE-1 — /health answers WHICH BUILD is live (`release`, the git
 * sha) and WHICH WIRE SHAPE it speaks (`canon`, the pinned contracts version).
 * Both are injected at bundle time; an unstamped build answers the honest `dev`.
 *
 * WHY IT IS COMPOSED HERE AND NOT IN THE SHARED HANDLER (a real constraint, not a
 * preference): boutik puts it inside `makeHealthFetch`, but that handler is shared
 * with `services/attribution-service`, which is FROZEN — byte-identical, zero
 * diff — and its health test pins the exact body. Changing the shared handler
 * would force an edit to a frozen file. So the stamp is composed at THIS service's
 * own edge; the shared handler, and therefore every frozen consumer of it, is
 * untouched. Only the 200 carries the fields; the 404 is unchanged.
 */
async function healthWithProvenance(request: Request): Promise<Response> {
  const res = health(request);
  if (res.status !== 200) return res;
  const body = (await res.json()) as Record<string, unknown>;
  return Response.json({ ...body, ...provenance() }, { status: 200, headers: res.headers });
}

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
export type StorefrontServiceEnv = MediaEnv &
  StorefrontStoreEnv &
  SupplySourceEnv & {
    /** REAL-PRODUCT-RENDER-1 (a2) — the listing DO, reached through the shim for
     * the JOIN. Internal: the public `/listings*` surface stays key-gated. */
    readonly LISTING_DO?: { fetch(request: Request): Promise<Response> };
  };

/**
 * THE READ PATH — GET /s/{slug}. Resolves against the storefront store (durable
 * when the DO binding is present, in-memory otherwise) and emits the buyer-safe
 * StorefrontView. An unknown slug is the HONEST not-found (404) the PWA already
 * renders as VitrineEtat 'invalid' — never a 500, never a neighbouring store.
 */
async function handleStorefrontRead(slug: string, env?: StorefrontServiceEnv): Promise<Response> {
  const storefront = await resolveStorefrontStore(env).getBySlug(slug);
  if (storefront === undefined) {
    return Response.json({ service: SERVICE_NAME, error: 'not_found' }, { status: 404 });
  }
  const products = await describeProducts(storefront.id, storefront.curatedItems, env);
  return Response.json({ ...toStorefrontView(storefront), products }, { status: 200 });
}

/**
 * THE JOIN, SERVER-SIDE (REAL-PRODUCT-RENDER-1 (a2)). For each pid in her
 * `curatedItems` — the canon MEMBERSHIP statement, authoritative for the buyer —
 * resolve which listing sells it (the pid pointer: the ONE question the lookup is
 * ever asked), read HER SIGNED price off that listing, describe the product from
 * SUPPLY, and join. Supplier economics never leave this Worker: the emitted record
 * carries name, her price, stock and image refs, and nothing else.
 *
 * EVERY FAILURE OMITS, NEVER INVENTS: no listing for a pid (an inconsistency), a
 * hidden listing, or an undescribable product (the DEFAULT today — no supply wire
 * exists, so `AbsentSupplySource` describes nothing) all drop that record. The
 * buyer then sees the products the shop CAN describe, and a shop that can describe
 * none renders the existing designed empty state.
 */
async function describeProducts(
  storefrontId: string,
  pids: readonly string[],
  env?: StorefrontServiceEnv,
): Promise<readonly VitrineProductRecord[]> {
  const listings = env?.LISTING_DO;
  if (listings === undefined || pids.length === 0) return [];
  const supply = resolveSupplySource(env);
  const out: VitrineProductRecord[] = [];
  for (const pid of pids) {
    const res = await listings
      .fetch(new Request(`https://do/listings/by-pid/${encodeURIComponent(storefrontId)}/${encodeURIComponent(pid)}`))
      .catch(() => undefined);
    if (res === undefined || res.status !== 200) continue; // no resolvable listing → omitted
    const side = (await res.json().catch(() => null)) as
      | { productVersionId: string; customerPriceFcfa: number; status: string }
      | null;
    if (side === null) continue;
    const described = await supply.describe(side.productVersionId);
    const record = joinVitrineProduct(side, described);
    if (record !== undefined) out.push(record); // undescribable → omitted, never invented
  }
  return out;
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

/**
 * RESELLER-STOREFRONT-WRITE-1 — CORS on the BUYER READ ROUTES ONLY. The buyer PWA
 * is served cross-origin from GitHub Pages, so its `fetch` of `GET /s/{slug}` needs
 * an allow-origin header or the browser blocks the 200. EXACT ORIGIN, never a
 * wildcard (a wildcard would let any site's JS read storefront data). The WRITE
 * routes carry NO CORS — the reseller app is React Native (not subject to CORS),
 * and letting browser origins write would widen the surface the auth gate closed.
 * Known, accepted limitation (JOURNAL): a LOCAL PWA build pointed at the live
 * Worker fails CORS until a dev origin is added deliberately — not a bug.
 */
const CORS_READ_ORIGIN = 'https://beurni2.github.io';
function withReadCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', CORS_READ_ORIGIN);
  headers.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
/** Preflight for the read routes — 204 + the CORS headers, and (being an OPTIONS)
 * it never reaches the write gate, so it answers without a key. */
function readPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': CORS_READ_ORIGIN,
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Accept',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

/**
 * BROWSE-SUPPLY-1 — the RESELLER BROWSE READ. `GET /supply-projections` returns the
 * offers she can list, plus the DIAGNOSTIC an operator needs when the list is empty.
 *
 * NO CORS, deliberately: this is a reseller/operator surface reached by the RN app,
 * not a browser, and it carries `basePrice` + `resellerCommission` — the economics
 * the listings gate protects. Adding browser origins here would widen exactly what
 * the key gate (applied in `worker/index.ts`) just closed.
 *
 * `offers` is what the app renders. `diagnostic` is operator-facing and the app
 * ignores it: a reseller sees an honest empty state, never a diagnosis.
 */
async function handleSupplyCollection(env?: StorefrontServiceEnv): Promise<Response> {
  const result = await readSupplyCollection(env, new Date().toISOString());
  return Response.json(
    {
      offers: result.offers,
      diagnostic: {
        status: result.status,
        refusals: result.refusals,
        ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
      },
    },
    { status: 200 },
  );
}

export const handleRequest = async (request: Request, env?: StorefrontServiceEnv): Promise<Response> => {
  const url = new URL(request.url);
  // POST /media/upload — a WRITE route: NO CORS (never buyer-facing).
  if (request.method === 'POST' && url.pathname === '/media/upload') return handleMediaUpload(request, env);
  // BROWSE-SUPPLY-1 — EXACT match, never a prefix. `/supply-projections` does not
  // start with `/supply-projection/`, which is precisely how a prefix-based auth
  // check failed open on boutik's side; the gate in `worker/index.ts` matches this
  // same string exactly for the same reason.
  if (request.method === 'GET' && url.pathname === SUPPLY_COLLECTION_ROUTE) return handleSupplyCollection(env);
  const slugMatch = /^\/s\/([^/]+)$/.exec(url.pathname);
  const mediaReadMatch = /^\/media\/(.+)$/.exec(url.pathname);
  const isReadRoute = url.pathname === '/health' || slugMatch !== null || mediaReadMatch !== null;
  // CORS preflight for the buyer read routes only.
  if (request.method === 'OPTIONS' && isReadRoute) return readPreflight();
  if (request.method === 'GET' && slugMatch) return withReadCors(await handleStorefrontRead(decodeURIComponent(slugMatch[1]!), env));
  if (request.method === 'GET' && mediaReadMatch) return withReadCors(await handleMediaRead(decodeURI(mediaReadMatch[1]!), env));
  // health (and the honest 404 fallthrough) — the buyer read surface, CORS on.
  return withReadCors(await healthWithProvenance(request));
};

export default { fetch: handleRequest };
