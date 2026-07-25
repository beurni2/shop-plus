import sfRouter, { StorefrontDO } from './storefront-do.js';
import lstRouter, { ListingDO } from './listing-do.js';
import { handleRequest, type StorefrontServiceEnv } from '../src/index.js';
import { SUPPLY_COLLECTION_ROUTE } from '../src/supply-collection.js';
import { signPrice } from '../src/publish-price.js';
import { resolveSupplySource } from '../src/supply-source.js';
import type { R2BucketLike } from '../src/media/media-store.js';
import { rejectUnauthorizedWrite, keyAuthorized, unauthorized, type WriteAuthEnv } from './auth.js';

/**
 * THE COMBINED WORKER (STOREFRONT-DEPLOY-1, founder ruling: one combined Worker).
 * One deployable = index.ts's service routes + both Durable Object classes + the
 * R2 binding, under one wrangler.toml and one URL. The DO input-gating still
 * serializes per object exactly as before; the only composition-root indirection
 * is the namespace→fetcher SHIM below, so the tested `DurableStorefrontStore`
 * stays fetch-based and untouched. (Splitting to a separate DO Worker later is a
 * `transferred_classes` DO migration, not a cheap config change — combined is
 * right because separate costs two permanent deployables, not because a split is
 * free.)
 *
 * wrangler binds these two classes by their exported names.
 */
export { StorefrontDO, ListingDO };

interface Env extends WriteAuthEnv {
  STOREFRONT: DurableObjectNamespace;
  LISTING: DurableObjectNamespace;
  BUCKET?: R2BucketLike;
  MEDIA_PUBLIC_BASE?: string;
  STOREFRONT_GCS_BUCKET?: string;
  STOREFRONT_GCS_TOKEN?: string;
  STOREFRONT_GCS_PUBLIC_BASE?: string;
  /** Supply display source. UNSET ⇒ ABSENT product data, never mock data. */
  /** BROWSE-SUPPLY-BINDING-1 — the offer-service service binding ([[services]] in
   * wrangler.toml). Replaces the SUPPLY_BASE secret: readable config over a
   * write-only value, and no same-zone Worker-to-Worker fetch (1042) to hit. */
  OFFER?: { fetch(request: Request): Promise<Response> };
  /** Service-to-service credential for the supply read (wrangler secret, never a var). */
  SUPPLY_READ_SECRET?: string;
  /** PRODUCT-MEDIA-BASE-1 — public origin for boutik's PRODUCT media. A `[vars]`
   * value, deliberately not a secret, and NOT `MEDIA_PUBLIC_BASE` (different bucket). */
  PRODUCT_MEDIA_BASE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // SERVICE-WRITE-AUTH-1 — gate EVERY write at the one deployed entry, before
    // any dispatch or existence lookup (so the 401 is never an existence oracle).
    // Reads pass straight through; a Worker with no secret configured fails closed.
    const denied = await rejectUnauthorizedWrite(request, env);
    if (denied) return denied;
    const { pathname } = new URL(request.url);
    // KEY-GATED READS — safe methods skip the write gate above, so any read that is
    // NOT buyer-facing is gated EXPLICITLY here, before any dispatch:
    //
    //   · GET /storefronts — the admin list (RESELLER-STOREFRONT-WRITE-1).
    //   · /listings* — the WHOLE listings surface (LISTING-READ-GATE-1). The canon
    //     `ResellerListing` this returns carries `markup` (M): with her displayed
    //     price (B + M) in hand, M yields the SUPPLIER'S BASE PRICE B by subtraction.
    //     That is precisely the economics leak SP-I03 exists to prevent, and it was
    //     live on the deployed Worker — harmless ONLY because no listing exists yet.
    //     This is a RESELLER/OPERATOR surface and never a buyer route: the buyer's
    //     per-product read is a separate, stripped projection (piece (a)), so gating
    //     the whole surface costs the buyer nothing. Reads AND writes now need the key.
    const isListings = pathname === '/listings' || pathname.startsWith('/listings/');
    const isAdminList = request.method === 'GET' && pathname === '/storefronts';
    //   · /supply-projections (BROWSE-SUPPLY-1) — the reseller browse read. It
    //     returns `basePrice` and `resellerCommission` for EVERY offer, the same
    //     economics the listings gate protects, so open would be the identical
    //     fail-open leak. Gated on the key the app ALREADY holds: a second bundled
    //     secret is no better protected, because both are readable by anyone who
    //     extracts the bundle. THE BLAST RADIUS OF THAT KEY IS THEREFORE WIDER — it
    //     now means « can write storefronts » AND « can read all supply economics »
    //     — and it rides the standing hard gate: no reseller but the founder
    //     onboards until real per-reseller identity lands, at which point this
    //     becomes per-reseller auth and the shared key goes away entirely.
    //     MATCHED EXACTLY, never by prefix: `/supply-projections` does NOT start
    //     with `/supply-projection/`, which is how a prefix check failed OPEN on
    //     boutik's side. `isListings` above is the same idiom and the reason this
    //     one is written with `===`.
    const isSupplyCollection = pathname === SUPPLY_COLLECTION_ROUTE;
    if ((isListings || isAdminList || isSupplyCollection) && !(await keyAuthorized(request, env))) {
      return unauthorized();
    }
    // DO-management surfaces → the DO routers (idFromName addressing lives there).
    if (pathname === '/storefronts' || pathname.startsWith('/storefronts/')) return sfRouter.fetch(request, env);
    // REAL-PRODUCT-RENDER-1 (a2) — MEMBERSHIP is stated HERE, at the composition
    // root, because it is CROSS-AGGREGATE: publishing a listing appends its pid to
    // the storefront's canon `curatedItems`. Neither aggregate router depends on
    // the other's namespace (the standalone listing worker still runs); the
    // coordination lives where both bindings do. ORDER OF INTENT: curatedItems is
    // the MEMBERSHIP statement, the pid pointer (written by the listing router) is
    // the LOOKUP that resolves it.
    // ═══ PUBLISH-PRICE-1 — THE SERVICE SIGNS HER PRICE, THE APP NEVER DOES ═══
    //
    // The app sends the MARKUP SHE CHOSE and nothing else about money. Here, at the
    // boundary where an untrusted caller exists, the live base is read through the
    // OFFER binding and `customerPriceFcfa = basePrice + markup` is computed. Any
    // `customerPriceFcfa` or `offerVersion` that ARRIVED on the request is DISCARDED
    // — the derived values overwrite them, so the app cannot author a signed amount
    // even by sending one, and a stale `offerVersion` cannot ride in either.
    //
    // SUPPLY UNREACHABLE ⇒ REFUSE (founder ruling). 409, never a fallback: signing
    // against a cached or app-supplied base is how a buyer gets charged a price
    // nobody authorised. A refusal she can retry is the correct failure.
    if (request.method === 'POST' && pathname === '/listings') {
      const cmd = (await request.clone().json().catch(() => null)) as
        | { storefrontId?: string; productVersionId?: string; markup?: unknown; at?: string }
        | null;
      if (cmd === null || typeof cmd.productVersionId !== 'string' || cmd.productVersionId === '') {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const signed = signPrice(await resolveSupplySource(env).economics(cmd.productVersionId), cmd.markup);
      if (signed.status !== 'signed') {
        // The reason is NAMED, not collapsed: `supply_unavailable` and
        // `markup_invalid` need different responses from whoever is looking.
        return Response.json({ error: signed.status }, { status: signed.status === 'markup_invalid' ? 400 : 409 });
      }
      const priced = new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({
          ...cmd,
          customerPriceFcfa: signed.customerPriceFcfa, // DERIVED HERE — any inbound value is discarded
          offerVersion: signed.offerVersion, // from the SAME live projection
        }),
      });
      const res = await lstRouter.fetch(priced, env);
      const decision = (await res.clone().json().catch(() => null)) as { status?: string } | null;
      if (decision?.status === 'published' && cmd?.storefrontId && cmd?.productVersionId) {
        await sfRouter.fetch(
          new Request(`https://do/storefronts/${encodeURIComponent(cmd.storefrontId)}/items`, {
            method: 'POST',
            body: JSON.stringify({ pid: cmd.productVersionId, at: cmd.at }),
          }),
          env,
        );
      }
      return res;
    }
    if (pathname === '/listings' || pathname.startsWith('/listings/')) return lstRouter.fetch(request, env);
    // Service surfaces (POST /media/upload · GET /s/{slug} · GET /media/{key} ·
    // health) → handleRequest, with the SHIM: DurableStorefrontStore reaches the
    // storefront DO by fetch, resolved here against the DO namespace.
    const serviceEnv: StorefrontServiceEnv = {
      ...(env.BUCKET !== undefined ? { BUCKET: env.BUCKET } : {}),
      ...(env.MEDIA_PUBLIC_BASE !== undefined ? { MEDIA_PUBLIC_BASE: env.MEDIA_PUBLIC_BASE } : {}),
      ...(env.STOREFRONT_GCS_BUCKET !== undefined ? { STOREFRONT_GCS_BUCKET: env.STOREFRONT_GCS_BUCKET } : {}),
      ...(env.STOREFRONT_GCS_TOKEN !== undefined ? { STOREFRONT_GCS_TOKEN: env.STOREFRONT_GCS_TOKEN } : {}),
      ...(env.STOREFRONT_GCS_PUBLIC_BASE !== undefined ? { STOREFRONT_GCS_PUBLIC_BASE: env.STOREFRONT_GCS_PUBLIC_BASE } : {}),
      ...(env.OFFER !== undefined ? { OFFER: env.OFFER } : {}),
      ...(env.PRODUCT_MEDIA_BASE !== undefined ? { PRODUCT_MEDIA_BASE: env.PRODUCT_MEDIA_BASE } : {}),
      ...(env.SUPPLY_READ_SECRET !== undefined ? { SUPPLY_READ_SECRET: env.SUPPLY_READ_SECRET } : {}),
      STOREFRONT_DO: { fetch: (req: Request): Promise<Response> => sfRouter.fetch(req, env) },
      // The JOIN reaches the listing DO through the SAME shim pattern. Internal:
      // the public /listings* surface stays key-gated above (LISTING-READ-GATE-1).
      LISTING_DO: { fetch: (req: Request): Promise<Response> => lstRouter.fetch(req, env) },
    };
    return handleRequest(request, serviceEnv);
  },
};
