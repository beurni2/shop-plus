import sfRouter, { StorefrontDO } from './storefront-do.js';
import lstRouter, { ListingDO } from './listing-do.js';
import checkoutRouter, { CheckoutDO } from './checkout-do.js';
import orderRouter, { OrderDO } from './order-do.js';
import { DispatchIndexDO, DISPATCH_INDEX_NAME } from './dispatch-index-do.js';
import { ResellerFeedDO, RESELLER_FEED_NAME } from './reseller-feed-do.js';
import { checkoutPreflight, handleRequest, withReadCors, type StorefrontServiceEnv } from '../src/index.js';
import { SUPPLY_COLLECTION_ROUTE } from '../src/supply-collection.js';
import { signPrice } from '../src/publish-price.js';
import { resolveSupplySource } from '../src/supply-source.js';
import { orderIdForQuote } from '../src/order-core.js';
import type { R2BucketLike } from '../src/media/media-store.js';
import {
  rejectUnauthorizedWrite,
  rejectUnauthorizedOpsRead,
  keyAuthorized,
  paymentWebhookAuthorized,
  unauthorized,
  type WriteAuthEnv,
} from './auth.js';

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
export { StorefrontDO, ListingDO, CheckoutDO, OrderDO, DispatchIndexDO, ResellerFeedDO };

interface Env extends WriteAuthEnv {
  STOREFRONT: DurableObjectNamespace;
  LISTING: DurableObjectNamespace;
  /** SP3.2a — one instance per quote id, plus the per-request-key pointers. */
  CHECKOUT: DurableObjectNamespace;
  /** SP3.3a — one instance per ORDER id, and the order id is a function of the
   *  quote id, so one quote can never grow a second order. */
  ORDER: DurableObjectNamespace;
  /** BC-1a — the dispatch index (one singleton): order ids + first-seen
   *  clocks, so the founder's dispatch read can find the per-order objects.
   *  Holds no contact and no money. */
  DISPATCH: DurableObjectNamespace;
  /** RF-1a — the reseller feed (one singleton): her personal-code door and
   *  her index of CONFIRMED sales. Holds no franc: every figure is read from
   *  the order's own object at read time. */
  RESELLER: DurableObjectNamespace;
  /** SP3.3a — the certified sandbox provider's behaviour knobs. UNSET on the
   *  deploy (the well-behaved provider); read by OrderDO, never by a route. */
  PAYMENT_SANDBOX_BEHAVIOR?: string;
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
    // these routes are declared here, ABOVE the write gate, and they are
    // the only writes on this Worker that answer without a credential.
    //
    // WHAT THAT DOES **NOT** OPEN, stated precisely because an exemption is a
    // hole until proven otherwise:
    //   · THE FIVE ROUTES ARE MATCHED EXACTLY (SP3.3a added the two order ones)
    //     — two `===` and three anchored
    //     regexes that admit a single path segment. `/checkout/anything-else`,
    //     and every other method on these paths, falls through to the gate below
    //     and is refused 401 exactly as before. (Prefix matching is how an auth
    //     check failed open on boutik's side; the `===` idiom is used here for
    //     the same reason it is used for `/supply-projections`.)
    //   · NO AMOUNT CAN ARRIVE. `QuoteRequest` has no money field to land in and
    //     the router refuses unknown keys outright, so the most valuable thing
    //     an anonymous caller could try to say — a price — is unsayable.
    //   · NO ECONOMICS CAN LEAVE. Every response is `toBuyerQuoteView`,
    //     `toBuyerOrderView` or a named refusal; the supplier's base, the
    //     commission, both nets, the payment attempt ids and the provider's
    //     collect references stay inside the Worker.
    //   · IT WRITES NOTHING SOMEONE ELSE OWNS. A quote is a new object under a
    //     server-minted id; an order is a new object under an id derived from
    //     that quote's; no storefront, listing, media object or event is touched.
    //   · IT CANNOT DECLARE MONEY RECEIVED. `POST /checkout/order` initiates a
    //     charge and nothing more; the only route that can move an order to
    //     `paid` is the secret-gated webhook below, and even it is validated to
    //     the franc against the immutable Quote by the frozen vault.
    // KNOWN AND ACCEPTED RESIDUE (journalled): an open POST lets an anonymous
    // caller create quote objects at will. They are per-request-key, expire in
    // 15 minutes, and hold no money — but there is no rate limit in front of
    // them, and that belongs on the real-money gate's checklist, not on a
    // pretend one here.
    const isCheckoutQuote = pathname === '/checkout/quote';
    const isCheckoutQuoteById = /^\/checkout\/quote\/[^/]+$/.test(pathname);
    const isCheckoutReserve = /^\/checkout\/quote\/[^/]+\/reserve$/.test(pathname);
    // SP3.3a — the ORDER surface. Public for the SAME reason and on the SAME
    // terms: a buyer holds no key, no amount can arrive (the body is a
    // three-key allowlist with no money field), and no economics can leave (the
    // OrderDO projects inside itself, so the Quote never crosses to the router).
    // The WEBHOOK is deliberately NOT here — it is secret-gated below.
    const isOrderCreate = pathname === '/checkout/order';
    const isOrderById = /^\/checkout\/order\/[^/]+$/.test(pathname);
    /**
     * SP4.2a-bis — the buyer asking for the product leg to be collected at her
     * door. PUBLIC on the SAME terms as order creation: no key exists for her to
     * hold, no amount can arrive (a two-key allowlist with no money field), no
     * economics can leave, and her claim is the `holderRef` that took the hold.
     *
     * IT CANNOT DECLARE THAT MONEY ARRIVED — that is the webhook, on the other
     * side of the secret. This route only asks a provider to collect.
     */
    const isOrderDoorCharge = /^\/checkout\/order\/[^/]+\/door-charge$/.test(pathname);
    const isPublicQuote =
      (request.method === 'POST' && (isCheckoutQuote || isCheckoutReserve)) ||
      (request.method === 'GET' && isCheckoutQuoteById);
    const isPublicOrder =
      (request.method === 'POST' && (isOrderCreate || isOrderDoorCharge)) ||
      (request.method === 'GET' && isOrderById);
    if (
      request.method === 'OPTIONS' &&
      (isCheckoutQuote || isCheckoutQuoteById || isCheckoutReserve || isOrderCreate || isOrderById ||
        isOrderDoorCharge)
    ) {
      return checkoutPreflight();
    }
    if (isPublicQuote) {
      /**
       * SP3.3a — THE RESERVATION RECEIPT IS MIRRORED HERE, at the composition
       * root, for the same reason the cross-aggregate `curatedItems` write below
       * lives here: it spans two aggregates and belongs where both bindings do.
       *
       * WHY IT MUST EXIST AT ALL: `CheckoutDO` owns the reservation and exposes
       * exactly one reservation route — `reserve` — which CREATES a hold when
       * nobody holds one. So there is no way to ASK who holds a quote without
       * also taking the hold, and an order path that took a hold in order to
       * check one would let a caller who never reserved order on the second try.
       * The hold is therefore COPIED into the order's own object at the moment
       * the vault decides it, where `decideCreateOrder` reads it in a
       * single-object read.
       *
       * IT CANNOT WIDEN ANYTHING: the copy is written only when the vault
       * answered 200, it never moves backwards in time (the OrderDO refuses an
       * earlier `expiresAt`), and a copy that is lost or stale fails CLOSED —
       * the order refuses `quote_not_reserved` or `reservation_expired`, and the
       * buyer's next (idempotent) reserve writes it again. The buyer's own
       * reserve response is untouched by it, byte for byte.
       */
      const mirrorSource =
        isCheckoutReserve && request.method === 'POST' ? request.clone() : undefined;
      // CORS through the SAME exact-origin helper the buyer read routes use —
      // the PWA is served cross-origin from GitHub Pages, so without it the
      // browser blocks the 200 it just received.
      const answered = await checkoutRouter.fetch(request, {
        CHECKOUT: env.CHECKOUT,
        // The same namespace→fetcher shim the service env uses, so the
        // checkout router depends on neither DO namespace directly and this
        // composition root stays the one place that holds all three.
        STOREFRONT_DO: { fetch: (req: Request): Promise<Response> => sfRouter.fetch(req, env) },
        LISTING_DO: { fetch: (req: Request): Promise<Response> => lstRouter.fetch(req, env) },
        // SELLER-TIER-WIRE-1 — the §6.1 gate's two facts (`sellerTier`,
        // `category`) are read from the supply projection, SERVER-SIDE, and no
        // longer accepted from the buyer's body. The SAME resolver the read
        // routes use (`src/index.ts`), so there is one supply seam in this
        // Worker and not two: `OFFER` bound ⇒ the real client, absent ⇒
        // `AbsentSupplySource`, and the certified mock is reachable from
        // neither.
        SUPPLY: resolveSupplySource(env),
      });
      if (mirrorSource !== undefined && answered.status === 200) {
        await mirrorReservationReceipt(env, pathname, mirrorSource, answered.clone());
      }
      return withReadCors(answered);
    }
    if (isPublicOrder) {
      // BC-1a — the dispatch index learns about the order the moment its
      // create answers 200 (first of the TWO best-effort registration
      // moments; the webhook below is the second).
      const createSource =
        isOrderCreate && request.method === 'POST' ? request.clone() : undefined;
      const answered = await orderRouter.fetch(request, { ORDER: env.ORDER, CHECKOUT: env.CHECKOUT });
      if (createSource !== undefined && answered.status === 200) {
        await mirrorDispatchRow(env, createSource);
      }
      return withReadCors(answered);
    }

    /**
     * ═══ RF-1a — THE RESELLER'S OWN FEED (founder order, 2026-08-02) ═══
     *
     * HER PERSONAL CODE IS THE IDENTITY, presented as Bearer and resolved
     * INSIDE the object (hash lookup — no secret ever compares against
     * attacker-controlled bytes). No body carries a resellerId anywhere in
     * this flow, so no caller can ask for a feed that is not theirs; a
     * missing or unknown code answers the SAME uniform 401.
     *
     * WHY IT CANNOT BE THE SHARED WRITE KEY: that key ships inside every
     * reseller's app bundle, so it identifies nobody — and this route
     * answers with francs. Her net plus her displayed price yields the
     * supplier's base by subtraction; a shared credential here would be the
     * `/listings*` leak with extra steps.
     *
     * The fan-out reads each order's own reseller projection, so a stale
     * state or a stale franc is unrepresentable: the index holds ids only.
     */
    if (pathname === '/reseller/ventes') {
      if (request.method === 'OPTIONS') return resellerPreflight();
      if (request.method !== 'GET') return withResellerCors(unauthorized());
      const auth = request.headers.get('Authorization') ?? '';
      const code = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
      if (code === '') return withResellerCors(unauthorized());
      // RF-1a (verifier M3) — a Worker deployed before migration v5 has no
      // RESELLER binding. Refuse like every other unauthorized caller rather
      // than throwing a raw TypeError onto the wire.
      if (env.RESELLER === undefined) return withResellerCors(unauthorized());
      const feed = env.RESELLER.get(env.RESELLER.idFromName(RESELLER_FEED_NAME));
      const mineRes = await feed.fetch(
        new Request('https://do/mine', { method: 'POST', body: JSON.stringify({ code }) }),
      );
      const mine = (await mineRes.json().catch(() => null)) as
        | { ok?: boolean; resellerId?: string; orders?: { orderId: string }[] }
        | null;
      if (mine?.ok !== true || typeof mine.resellerId !== 'string' || !Array.isArray(mine.orders)) {
        return withResellerCors(unauthorized());
      }
      /**
       * THE FAN-OUT, BOUNDED AND HONEST ABOUT WHAT IT COULD NOT READ
       * (verifier B3). The first cut looped over every row with a bare
       * `catch {}`, which meant a failed read became a SHORTER LIST OF HER
       * MONEY served as `200 ok` — she could not tell « you have no sales »
       * from « we could not read your sales ». Two changes: the loop is
       * capped well under the platform's per-request subrequest ceiling, and
       * anything not read is COUNTED and declared. A partial answer is
       * allowed (one bad order must not blank her feed) but it is never
       * allowed to look complete.
       */
      const asked = mine.orders.slice(0, MAX_FEED_FANOUT);
      let illisibles = mine.orders.length - asked.length;
      const ventes: unknown[] = [];
      for (const row of asked) {
        try {
          const res = await env.ORDER.get(env.ORDER.idFromName(row.orderId)).fetch(
            new Request(`https://do/entry/reseller/${encodeURIComponent(mine.resellerId)}`),
          );
          const v = (await res.json().catch(() => null)) as Record<string, unknown> | null;
          const projected = projectVente(v);
          if (projected === null) illisibles += 1;
          else ventes.push(projected);
        } catch {
          illisibles += 1;
        }
      }
      // RF-1a (verifier M5) — an authenticated money-bearing answer is never
      // a cacheable one.
      const answer = Response.json({ ok: true, ventes, incomplet: illisibles > 0 });
      answer.headers.set('Cache-Control', 'private, no-store');
      return withResellerCors(answer);
    }

    /** RF-1a — the founder MINTS and REVOKES a reseller's feed code. His own
     *  credential (value C, the same one his dispatch read uses — same
     *  person, same Worker, same class of act); the body crosses VERBATIM so
     *  the object's exact-key check refuses a smuggled field rather than
     *  this layer silently stripping it. */
    if (pathname === '/reseller/code' || pathname === '/reseller/code/revoke') {
      if (request.method === 'OPTIONS') return opsPreflight('POST');
      if (request.method !== 'POST') return withOpsCors(unauthorized());
      const refused = await rejectUnauthorizedOpsRead(request, env);
      if (refused) return withOpsCors(refused);
      if (env.RESELLER === undefined) return withOpsCors(unauthorized());
      const body = await request.text();
      const feed = env.RESELLER.get(env.RESELLER.idFromName(RESELLER_FEED_NAME));
      return withOpsCors(
        await feed.fetch(
          new Request(pathname === '/reseller/code' ? 'https://do/code/mint' : 'https://do/code/revoke', {
            method: 'POST',
            body,
          }),
        ),
      );
    }

    /** RF-1a — the founder's inventory of feed doors. Same credential. */
    if (pathname === '/reseller/codes') {
      if (request.method === 'OPTIONS') return opsPreflight('GET');
      if (request.method !== 'GET') return withOpsCors(unauthorized());
      const refused = await rejectUnauthorizedOpsRead(request, env);
      if (refused) return withOpsCors(refused);
      if (env.RESELLER === undefined) return withOpsCors(unauthorized());
      return withOpsCors(
        await env.RESELLER.get(env.RESELLER.idFromName(RESELLER_FEED_NAME)).fetch(new Request('https://do/codes')),
      );
    }

    /**
     * ═══ BC-1a — THE FOUNDER'S DISPATCH READ (approved proposal, 2026-08-02) ═══
     *
     * The ONE door to buyer contact: `Authorization: Bearer` against
     * CHECKOUT_OPS_SECRET (« value C » — this Worker's founder credential,
     * held nowhere but his browser and this Worker's encrypted store), gated
     * BEFORE any dispatch so the 401 is never an existence oracle. The write
     * key, the webhook secret, and Boutik+'s ops key all open nothing here.
     *
     * The read fans out from the index to each order's OWN internal dispatch
     * projection — state, contact, product facts; no quote bytes, no
     * attempts, no economics — so this route can never serve a stale contact
     * or invent a state. Unbounded at pilot scale on purpose (the paid-order
     * book's reasoning).
     *
     * CORS: the CONSOLE's exact origin, never `*` and never the buyer PWA's —
     * a different reader, its own stamp.
     */
    if (pathname === '/checkout/dispatch') {
      if (request.method === 'OPTIONS') return dispatchPreflight();
      if (request.method !== 'GET') return withDispatchCors(unauthorized());
      const refused = await rejectUnauthorizedOpsRead(request, env);
      if (refused) return withDispatchCors(refused);
      const stub = env.DISPATCH.get(env.DISPATCH.idFromName(DISPATCH_INDEX_NAME));
      const listRes = await stub.fetch(new Request('https://do/list'));
      const list = (await listRes.json().catch(() => null)) as
        | { ok?: boolean; orders?: { orderId: string; firstSeenAt: string }[] }
        | null;
      if (list?.ok !== true || !Array.isArray(list.orders)) {
        return withDispatchCors(Response.json({ ok: false, reason: 'index_unavailable' }, { status: 503 }));
      }
      const rows: unknown[] = [];
      for (const entry of list.orders) {
        const res = await env.ORDER.get(env.ORDER.idFromName(entry.orderId)).fetch(
          new Request('https://do/entry/dispatch'),
        );
        const row = (await res.json().catch(() => null)) as { ok?: boolean; exists?: boolean } | null;
        if (row?.ok === true && row.exists === true) rows.push(row);
      }
      return withDispatchCors(Response.json({ ok: true, orders: rows }));
    }

    /**
     * ═══ SP3.3a — THE PAYMENT WEBHOOK: AUTHENTICATED BEFORE IT IS ROUTED ═══
     *
     * It is NOT in the public exemption above and never can be: it is the only
     * route in this repo that can declare money received, and an order it moves
     * to `confirmed` is an order Séra will take into custody and settlement will
     * later pay out against.
     *
     * THE SECRET IS ITS OWN (`PAYMENT_WEBHOOK_SECRET`, a `wrangler secret`,
     * never `[vars]`, never in a bundle) and it FAILS CLOSED exactly as
     * `rejectUnauthorizedWrite` does: with no secret configured, every webhook is
     * 401. The check runs HERE, before any dispatch, so a rejected webhook never
     * reaches a Durable Object and the 401 can never become an existence oracle
     * for order ids. Matched with `===` and POST only — every other method on
     * this path falls through to the write gate and is refused there.
     */
    /**
     * SP4.2a — THE DOOR LEG'S WEBHOOK JOINS IT, on the SAME secret and the SAME
     * terms. It declares that the buyer paid for the product at her door, which
     * is the fact §6.3 puts in front of the drop code and Ten Laws #3 puts in
     * front of custody transfer — so it belongs on this side of the gate and
     * never in the public exemption above.
     *
     * ONE CONDITION, TWO PATHS, so neither can be added to the public list by
     * accident: a future edit that widens the exemption has to walk past this.
     */
    if (
      request.method === 'POST' &&
      (pathname === '/checkout/webhook/payment' || pathname === '/checkout/webhook/door')
    ) {
      if (!(await paymentWebhookAuthorized(request, env))) return unauthorized();
      // BC-1a — the SECOND best-effort registration moment: a 200 webhook
      // means the order certainly exists, so a row the create-time mirror
      // lost is repaired here, idempotently.
      const webhookSource = request.clone();
      const answered = await orderRouter.fetch(request, { ORDER: env.ORDER, CHECKOUT: env.CHECKOUT });
      if (answered.status === 200) await mirrorDispatchRow(env, webhookSource);
      return answered;
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

/**
 * SP3.3a — COPY A DECIDED HOLD INTO THE ORDER THAT WILL BE ASKED ABOUT IT.
 *
 * Reads only values that already crossed this boundary: the quote id from the
 * path, the holder from the request the caller sent, the reservation id and the
 * expiry from the answer `CheckoutDO` just gave. It computes nothing, decides
 * nothing, and carries NO MONEY — a receipt is four strings.
 *
 * TOTAL AND SILENT ON FAILURE, deliberately — and this is load-bearing, not
 * politeness: it runs AFTER the buyer's reservation has already succeeded, so
 * anything it could throw (a Worker deployed before the `ORDER` migration ran, a
 * body that will not re-read) would turn her 200 into a 500 for a hold she
 * actually has. The cost of a lost copy is that the ORDER refuses
 * `quote_not_reserved` until the next reserve (which is idempotent and rewrites
 * it) — a refusal, never a wrong success.
 */
/**
 * RF-1a — the reseller app is Expo (native shell today, web preview
 * tomorrow), so there is no single browser origin to pin the way the
 * console's exact-origin stamp does. `*` is safe HERE on the same terms the
 * checkout wire states: this Worker holds no cookie and no ambient
 * credential, and this route answers ONLY to a personal Bearer code the page
 * must knowingly attach. THE TRIPWIRE: the day any cookie or session enters
 * this Worker, `*` stops being safe and this comment is the review flag.
 */
function withResellerCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function resellerPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Accept, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * BC-1a — the dispatch view is served to the founder's CONSOLE, which lives on
 * its own Pages origin — a different reader from the buyer PWA, so its own
 * exact-origin stamp (never `*`: this route answers with buyer contact).
 */
const DISPATCH_CORS_ORIGIN = 'https://boutik-plus-web.pages.dev';

/**
 * RF-1a (verifier B3) — the fan-out ceiling. Workers cap subrequests per
 * request (50 on the free plan); past it every remaining `fetch` throws. A
 * bound WELL under that, with the overflow declared as unread rather than
 * dropped, is the difference between « we showed you part » and a silent lie.
 * Her older sales are not lost — they are simply not in this answer, and the
 * answer says so.
 */
const MAX_FEED_FANOUT = 40;

/**
 * RF-1a (verifier M7) — RE-PROJECT AT THE ROUTER. The OrderDO's projection is
 * already a literal allowlist, but forwarding its object whole made that the
 * only thing standing between a future OrderDO field and her wire. This
 * rebuilds the row field by field and drops anything that does not typecheck,
 * so a row can never reach her half-formed and a new field upstream can never
 * ride out of here by accident. `ok`/`exists` are routing facts and stay here.
 */
function projectVente(v: Record<string, unknown> | null): Record<string, unknown> | null {
  if (v === null || v['ok'] !== true || v['exists'] !== true) return null;
  const { orderId, state, createdAt, resellerNet, productVersionId, zoneTo } = v;
  if (typeof orderId !== 'string' || orderId === '') return null;
  if (typeof state !== 'string' || state === '') return null;
  if (typeof createdAt !== 'string' || createdAt === '') return null;
  if (typeof resellerNet !== 'number' || !Number.isInteger(resellerNet)) return null;
  if (typeof productVersionId !== 'string' || typeof zoneTo !== 'string') return null;
  return { orderId, state, createdAt, resellerNet, productVersionId, zoneTo };
}

/**
 * RF-1a (verifier B4) — the founder's FEED-CODE routes answer his console,
 * the same reader and the same exact-origin discipline his dispatch read got
 * one screen earlier. Without this they were curl-only, and their fall-through
 * 404 was stamped with the BUYER PWA's origin.
 */
function withOpsCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', DISPATCH_CORS_ORIGIN);
  headers.set('Vary', 'Origin');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function opsPreflight(methods: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': DISPATCH_CORS_ORIGIN,
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Accept, Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function withDispatchCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', DISPATCH_CORS_ORIGIN);
  headers.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function dispatchPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': DISPATCH_CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET',
      // Authorization: the founder's Bearer — granting the HEADER grants
      // nothing; the route still 401s anything but his key.
      'Access-Control-Allow-Headers': 'Accept, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * BC-1a — register one order in the dispatch index, BEST-EFFORT and swallowed
 * on purpose (the reservation mirror's own discipline): the order path, the
 * money path, and the webhook's answer are all untouched by a failed
 * registration; the row is retried at the other moment. The orderId is read
 * from the SAME field the target route itself uses — the create body's
 * `quoteId` (via `orderIdForQuote`) or the webhook payload's `order_id` — so
 * the mirror can never register a row the route would not have addressed.
 */
async function mirrorDispatchRow(env: Env, source: Request): Promise<void> {
  try {
    const body = (await source.json().catch(() => null)) as Record<string, unknown> | null;
    if (body === null) return;
    let orderId: string | undefined;
    if (typeof body['quoteId'] === 'string' && body['quoteId'] !== '') {
      orderId = orderIdForQuote(body['quoteId']);
    } else {
      const payload = body['payload'] as Record<string, unknown> | undefined;
      const fromEvent = payload?.['order_id'];
      if (typeof fromEvent === 'string' && fromEvent !== '') orderId = fromEvent;
    }
    if (orderId === undefined) return;
    await env.DISPATCH.get(env.DISPATCH.idFromName(DISPATCH_INDEX_NAME)).fetch(
      new Request('https://do/register', { method: 'POST', body: JSON.stringify({ orderId }) }),
    );
  } catch {
    // Swallowed on purpose — see above. Nothing downstream depends on this row
    // existing; the dispatch list self-repairs at the next webhook.
  }
}

async function mirrorReservationReceipt(
  env: Env,
  pathname: string,
  reserveRequest: Request,
  reserveResponse: Response,
): Promise<void> {
  try {
    const match = /^\/checkout\/quote\/([^/]+)\/reserve$/.exec(pathname);
    if (match === null) return;
    const quoteId = decodeURIComponent(match[1]!);
    const asked = (await reserveRequest.json().catch(() => null)) as { holderRef?: unknown } | null;
    const answered = (await reserveResponse.json().catch(() => null)) as
      | { status?: unknown; reservationId?: unknown; expiresAt?: unknown }
      | null;
    if (asked === null || answered === null) return;
    const { holderRef } = asked;
    const { reservationId, expiresAt } = answered;
    // A hold that is not `reserved`, or that names no expiry, is not a hold this
    // order may be created against. Nothing is written.
    if (answered.status !== 'reserved') return;
    if (typeof holderRef !== 'string' || typeof reservationId !== 'string' || typeof expiresAt !== 'string') {
      return;
    }
    await env.ORDER.get(env.ORDER.idFromName(orderIdForQuote(quoteId))).fetch(
      new Request('https://do/entry/reserved', {
        method: 'POST',
        body: JSON.stringify({ quoteId, reservationId, holderRef, expiresAt }),
      }),
    );
  } catch {
    // Swallowed on purpose — see the paragraph above. The order path fails
    // CLOSED without this copy; the reservation itself is unaffected.
  }
}
