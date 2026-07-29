import sfRouter, { StorefrontDO } from './storefront-do.js';
import lstRouter, { ListingDO } from './listing-do.js';
import checkoutRouter, { CheckoutDO } from './checkout-do.js';
import { checkoutPreflight, handleRequest, withReadCors, type StorefrontServiceEnv } from '../src/index.js';
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
export { StorefrontDO, ListingDO, CheckoutDO };

interface Env extends WriteAuthEnv {
  STOREFRONT: DurableObjectNamespace;
  LISTING: DurableObjectNamespace;
  /** SP3.2a — one instance per quote id, plus the per-request-key pointers. */
  CHECKOUT: DurableObjectNamespace;
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
    const { pathname } = new URL(request.url);

    // ═══ SP3.2a — THE CHECKOUT SURFACE IS PUBLIC, BY DESIGN AND BY NECESSITY ═══
    //
    // A BUYER HOLDS NO KEY AND MUST NEVER NEED ONE. The shared write secret is
    // inlined in the RESELLER app bundle (SERVICE-WRITE-AUTH-1); shipping it to
    // every browser that opens a boutique link would publish it outright. So
    // these three routes are declared here, ABOVE the write gate, and they are
    // the only writes on this Worker that answer without a credential.
    //
    // WHAT THAT DOES **NOT** OPEN, stated precisely because an exemption is a
    // hole until proven otherwise:
    //   · THE THREE ROUTES ARE MATCHED EXACTLY — one `===` and two anchored
    //     regexes that admit a single path segment. `/checkout/anything-else`,
    //     and every other method on these paths, falls through to the gate below
    //     and is refused 401 exactly as before. (Prefix matching is how an auth
    //     check failed open on boutik's side; the `===` idiom is used here for
    //     the same reason it is used for `/supply-projections`.)
    //   · NO AMOUNT CAN ARRIVE. `QuoteRequest` has no money field to land in and
    //     the router refuses unknown keys outright, so the most valuable thing
    //     an anonymous caller could try to say — a price — is unsayable.
    //   · NO ECONOMICS CAN LEAVE. Every response is `toBuyerQuoteView` or a
    //     named refusal; the supplier's base, the commission and both nets stay
    //     inside the Worker.
    //   · IT WRITES NOTHING SOMEONE ELSE OWNS. A quote is a new object under a
    //     server-minted id; no storefront, listing, media object or event is
    //     touched.
    // KNOWN AND ACCEPTED RESIDUE (journalled): an open POST lets an anonymous
    // caller create quote objects at will. They are per-request-key, expire in
    // 15 minutes, and hold no money — but there is no rate limit in front of
    // them, and that belongs on the real-money gate's checklist, not on a
    // pretend one here.
    const isCheckoutQuote = pathname === '/checkout/quote';
    const isCheckoutQuoteById = /^\/checkout\/quote\/[^/]+$/.test(pathname);
    const isCheckoutReserve = /^\/checkout\/quote\/[^/]+\/reserve$/.test(pathname);
    const isPublicCheckout =
      (request.method === 'POST' && (isCheckoutQuote || isCheckoutReserve)) ||
      (request.method === 'GET' && isCheckoutQuoteById) ||
      (request.method === 'OPTIONS' && (isCheckoutQuote || isCheckoutQuoteById || isCheckoutReserve));
    if (isPublicCheckout) {
      if (request.method === 'OPTIONS') return checkoutPreflight();
      // CORS through the SAME exact-origin helper the buyer read routes use —
      // the PWA is served cross-origin from GitHub Pages, so without it the
      // browser blocks the 200 it just received.
      return withReadCors(
        await checkoutRouter.fetch(request, {
          CHECKOUT: env.CHECKOUT,
          // The same namespace→fetcher shim the service env uses, so the
          // checkout router depends on neither DO namespace directly and this
          // composition root stays the one place that holds all three.
          STOREFRONT_DO: { fetch: (req: Request): Promise<Response> => sfRouter.fetch(req, env) },
          LISTING_DO: { fetch: (req: Request): Promise<Response> => lstRouter.fetch(req, env) },
        }),
      );
    }

    // SERVICE-WRITE-AUTH-1 — gate EVERY write at the one deployed entry, before
    // any dispatch or existence lookup (so the 401 is never an existence oracle).
    // Reads pass straight through; a Worker with no secret configured fails closed.
    const denied = await rejectUnauthorizedWrite(request, env);
    if (denied) return denied;
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
    //   · EVERY storefront READ (STOREFRONT-READ-GATE-1, founder order 2026-07-27).
    //     `GET /storefronts` (the admin list) was gated; `GET /storefronts/{id}` was
    //     NOT — it fell through to the DO router, so anyone who guessed an id could
    //     read a shop's `curatedItems`, name, zone and discoverable flag without a
    //     credential. No money is on that shape (no price, markup or commission, so
    //     no loi 1/2 leak), but her CURATION is hers, and a private shop being
    //     readable by id is the same fail-open family as the listings leak.
    //     THE BUYER PAYS NOTHING FOR THIS: her public page is `GET /s/{slug}`, a
    //     separate stripped projection that stays open — verified, not assumed
    //     (the buyer PWA contains no `/storefronts` caller at all).
    //     PREFIX HERE IS DELIBERATE, unlike the `===` idioms above: `/storefronts/`
    //     has exactly one GET sub-route (`/{id}`), every other sub-path is a POST
    //     already caught by the write gate, and the media route lives under
    //     `/media/...`, a different prefix entirely.
    const isStorefrontRead =
      request.method === 'GET' && (pathname === '/storefronts' || pathname.startsWith('/storefronts/'));
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
    if ((isListings || isStorefrontRead || isSupplyCollection) && !(await keyAuthorized(request, env))) {
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
        | { storefrontId?: string; productVersionId?: string; markup?: unknown; customerPriceFcfa?: unknown; at?: string }
        | null;
      if (cmd === null || typeof cmd.productVersionId !== 'string' || cmd.productVersionId === '') {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      // ═══ MONEY-SHAPE-1 — A SUPPLIED PRICE IS REFUSED, NOT DISCARDED ═══
      //
      // PUBLISH-PRICE-1 silently dropped an inbound `customerPriceFcfa` and answered
      // 200. That is a caller sending a money value, being ignored, and never
      // learning it — the same shape as a success message that cannot fail. The
      // price is DERIVED here; a caller who supplies one has a wrong model of who
      // owns the amount, and the honest answer is to say so.
      //
      // SAFE AT THE BOUNDARY ONLY: `services/attribution-service` (FROZEN VAULT)
      // publishes through the IN-MEMORY REGISTRY, never over HTTP, so this refusal
      // cannot reach it — VERIFIED, not assumed (`premiere-commande-reelle.e2e.test
      // .ts:92` calls `listings.publish({…})` directly on `ListingRegistry`). The
      // pure core still accepts the field, so the frozen path is untouched.
      if ('customerPriceFcfa' in cmd) {
        return Response.json({ error: 'price_not_accepted' }, { status: 400 });
      }
      const signed = signPrice(await resolveSupplySource(env).economics(cmd.productVersionId), cmd.markup);
      if (signed.status !== 'signed') {
        // The reason is NAMED, not collapsed: each needs a different response from
        // whoever is looking — retry, fix the amount, or lower it under the cap.
        return Response.json(
          { error: signed.status, ...(signed.status === 'markup_over_cap' ? { cap: signed.cap } : {}) },
          { status: signed.status === 'supply_unavailable' ? 409 : 400 },
        );
      }
      const priced = new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({
          ...cmd,
          customerPriceFcfa: signed.customerPriceFcfa, // DERIVED HERE from the live base
          offerVersion: signed.offerVersion, // from the SAME live projection
          // MONEY-SHAPE-1 — C frozen from the SAME projection that priced the buyer's
          // side, so both halves of the artifact are signed against one reading.
          resellerCommission: signed.resellerCommission,
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
