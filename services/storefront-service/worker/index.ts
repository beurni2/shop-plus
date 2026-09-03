import sfRouter, { StorefrontDO } from './storefront-do.js';
import lstRouter, { ListingDO } from './listing-do.js';
import checkoutRouter, { CheckoutDO } from './checkout-do.js';
import orderRouter, { OrderDO, televerserNoteVocale } from './order-do.js';
import {
  FulfillmentAcceptedEventSchema,
  FulfillmentReadyEventSchema,
  PlatformEventSchema,
} from '@platform/contracts';
import { DispatchIndexDO, DISPATCH_INDEX_NAME } from './dispatch-index-do.js';
import { ResellerFeedDO, RESELLER_FEED_NAME } from './reseller-feed-do.js';
import { WishlistDO, mintListeToken } from './wishlist-do.js';
import { LISTE_REF, LISTE_TOKEN, validateListeCreate, validateListeUpdate } from '../src/wishlist-core.js';
import { BuyerLadderDO, ladderName } from './buyer-ladder-do.js';
import {
  RESELLER_ACCOUNTS_NAME,
  ResellerAccountsDO,
  resoudreCompte,
} from './reseller-accounts-do.js';
import { checkoutPreflight, handleRequest, withReadCors, type StorefrontServiceEnv } from '../src/index.js';
import { SUPPLY_COLLECTION_ROUTE } from '../src/supply-collection.js';
import { signPrice } from '../src/publish-price.js';
import { resolveSupplySource } from '../src/supply-source.js';
import { orderIdForQuote } from '../src/order-core.js';
import type { R2BucketLike } from '../src/media/media-store.js';
import {
  isWrite,
  rejectUnauthorizedWrite,
  rejectUnauthorizedOpsRead,
  keyAuthorized,
  paymentWebhookAuthorized,
  unauthorized,
  progressWriter,
  type WriteAuthEnv,
} from './auth.js';

/**
 * DISPATCH-PAGES-1 — the dispatch/gains page size AND its hard ceiling. One
 * request spends 1 subrequest on the index list plus one per row; the platform
 * budget is 50 per request on the plan this deploys to, so 40 rows leaves real
 * margin for the CORS answer and any retry the runtime makes. A caller may ask
 * for LESS, never more — a bigger page is the exact 500 this slice removes.
 */
const PAGE_DISPATCH = 40;

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
export { StorefrontDO, ListingDO, CheckoutDO, OrderDO, DispatchIndexDO, ResellerFeedDO, BuyerLadderDO, ResellerAccountsDO, WishlistDO };
/**
 * C1/C2 (audit) — the DURABLE attribution-lock authority (SP-I09b.3
 * first-lock-wins), deployed by joining THIS combined Worker like every other
 * DO class (the founder's one-combined-Worker ruling) rather than standing up
 * a second deployable. Imported from the attribution-service SOURCE — one
 * implementation, never a copy. ITS AUTH MODEL IS NO DOOR AT ALL: no route on
 * this Worker mounts /locks/*, so the lock is reachable only from inside
 * (OrderDO claims it at order create). The standalone router in
 * attribution-service stays undeployed test scaffolding.
 */
export { AttributionLockDO } from '../../attribution-service/worker/attribution-lock-do.js';

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
  /** SP6.3 — the §6.4 buyer-refusal ladder, one instance per buyer key. */
  LADDER: DurableObjectNamespace;
  /** C1/C2 (audit) — the durable attribution-lock book, one instance per
   *  ORDER id. Claimed by OrderDO at create (SP-I09b.3 first-lock-wins);
   *  no public route reaches it. */
  ATTRIBUTION_LOCK: DurableObjectNamespace;
  /** RESELLER-ACCOUNTS-1b — the singleton account book (canon v3.8.0). */
  COMPTES?: DurableObjectNamespace;
  /** LISTE-ENVIES-1 — one instance per liste, idFromName('liste:'+token).
   *  OPTIONAL like COMPTES: a Worker deployed before migration v9 has no
   *  binding, and the liste doors answer a named 503 rather than throwing. */
  WISHLIST?: DurableObjectNamespace;
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
  /** REPERE-AUDIO-REEL — the media Worker, as a SERVICE BINDING (the
   * SUPPLY_BASE / error-1042 lesson: cross-Worker fetch rides bindings in
   * this account, never public URLs). Transport only — the door's write gate
   * still stands. */
  MEDIA?: { fetch(request: Request): Promise<Response> };
  /** REPERE-AUDIO-REEL — the media service's write secret, so THIS Worker can
   * hand a buyer's voice note to the media door server-side. `wrangler secret
   * put MEDIA_WRITE_KEY`, the founder's alone — never [vars], never bundled.
   * UNSET ⇒ every note is honestly `perdue`; no order is ever blocked. */
  MEDIA_WRITE_KEY?: string;
  /** CUSTODY-ARMED-SIGNAL (audit E6) — the three custody wires the OrderDO
   * reads from ITS OWN env (order-do.ts). Declared here ONLY so the router can
   * compute presence booleans for /health; the router never reads a value. */
  SERA_INTAKE_BASE?: string;
  SERA_INTAKE_SECRET?: string;
  SHOP_ARM_SECRET?: string;
  /** G4 CHECKOUT-KILL — the founder's emergency stop for NEW QUOTES. Read by
   * CheckoutDO from its own env; non-empty ⇒ every new quote refuses
   * `checkout_killed` (503). Reads, orders in flight, and her shop are
   * untouched. Arm/disarm in seconds, no code deploy:
   * `printf '1' | wrangler secret put CHECKOUT_KILL` · `wrangler secret delete
   * CHECKOUT_KILL`. Declared here for documentation; the router never reads it. */
  CHECKOUT_KILL?: string;
  /** RESELLER-PILOTE-1 — the account book's pilot ceiling, read by
   * ResellerAccountsDO from its own env (absent ⇒ one seat). A `[vars]` value
   * that leaves with slice a2. Declared for documentation; never read here. */
  RESELLER_ADMISSION_CEILING?: string;
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
    /**
     * VRAI-SUIVI — the buyer's remise read. PUBLIC PATH on the same terms as
     * the order read (she holds no service key), but the ANSWER is gated
     * inside the object on the order's own buyer token AND Séra's arrival
     * fact, with one constant-shape 404 for every refusal. No amount can
     * arrive (GET, no body) and none can leave (the 200 carries the six-digit
     * code and nothing else). Matched exactly, like its five neighbours.
     */
    const isOrderRemise = /^\/checkout\/order\/[^/]+\/remise$/.test(pathname);
    /**
     * LISTE-MERCI — the purchaser's notify read, PUBLIC on the remise route's
     * exact terms (public path, private answer: buyer-token-gated inside the
     * object, one uniform 404 for every refusal). GET, no body, and the 200
     * carries a first name + wa.me digits and nothing else.
     */
    const isOrderListeMerci = /^\/checkout\/order\/[^/]+\/liste-merci$/.test(pathname);
    const isPublicQuote =
      (request.method === 'POST' && (isCheckoutQuote || isCheckoutReserve)) ||
      (request.method === 'GET' && isCheckoutQuoteById);
    const isPublicOrder =
      (request.method === 'POST' && (isOrderCreate || isOrderDoorCharge)) ||
      (request.method === 'GET' && (isOrderById || isOrderRemise || isOrderListeMerci));
    if (
      request.method === 'OPTIONS' &&
      (isCheckoutQuote || isCheckoutQuoteById || isCheckoutReserve || isOrderCreate || isOrderById ||
        isOrderDoorCharge || isOrderRemise || isOrderListeMerci)
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
      /**
       * ═══ LISTE-ADRESSE-1 — A GIFT'S QUOTE NAMES THE LISTE, NEVER THE
       *     DESTINATION (founder order, 2026-08-27) ═══
       *
       * A quote body carrying `listeRef` is priced FOR THE CREATOR'S STORED
       * ZONE, resolved HERE (the one layer holding the WISHLIST binding) and
       * forwarded to the vault as an ordinary zoneTo — the money-path
       * validator underneath does not change at all. The laws:
       *  · `zoneTo` alongside `listeRef` is refused BY NAME — one source of
       *    truth for the destination, never two that could disagree;
       *  · a liste without a stored address answers `liste_sans_adresse`
       *    (the honest client never asks — the public boolean said no);
       *  · the friend's answer carries the FEE and never the zone: the vault
       *    echoes no destination on the buyer wire.
       * The order door completes the pair: it re-reads the liste and refuses
       * any quote whose stored zoneTo disagrees with hers, so a hand-crafted
       * quote priced elsewhere can never carry her delivery.
       */
      let quoteRequest = request;
      if (isCheckoutQuote && request.method === 'POST') {
        const peeked = (await request.clone().json().catch(() => null)) as Record<string, unknown> | null;
        if (peeked !== null && typeof peeked === 'object' && !Array.isArray(peeked) && peeked['listeRef'] !== undefined) {
          if (typeof peeked['listeRef'] !== 'string' || !LISTE_REF.test(peeked['listeRef'])) {
            return withReadCors(Response.json({ ok: false, reason: 'bad_field', field: 'listeRef' }, { status: 400 }));
          }
          if (peeked['zoneTo'] !== undefined) {
            return withReadCors(Response.json({ ok: false, reason: 'bad_field', field: 'zoneTo' }, { status: 400 }));
          }
          if (env.WISHLIST === undefined) {
            return withReadCors(Response.json({ ok: false, reason: 'listes_indisponibles' }, { status: 503 }));
          }
          const lu = await env.WISHLIST.get(env.WISHLIST.idFromName(`liste:${peeked['listeRef']}`)).fetch(
            new Request('https://do/entry/livraison'),
          );
          const livre = lu.status === 200 ? ((await lu.json().catch(() => null)) as { livraison?: { zone?: unknown } } | null) : null;
          const zone = livre?.livraison?.zone;
          if (typeof zone !== 'string' || zone === '') {
            return withReadCors(Response.json({ ok: false, reason: 'liste_sans_adresse' }, { status: 422 }));
          }
          const { listeRef: _retire, ...reste } = peeked;
          quoteRequest = new Request(request, { body: JSON.stringify({ ...reste, zoneTo: zone }) });
        }
      }
      // CORS through the SAME exact-origin helper the buyer read routes use —
      // the PWA is served cross-origin from GitHub Pages, so without it the
      // browser blocks the 200 it just received.
      const answered = await checkoutRouter.fetch(quoteRequest, {
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
      const answered = await orderRouter.fetch(request, {
        ORDER: env.ORDER,
        CHECKOUT: env.CHECKOUT,
        // SP6.3 — the §6.4 ladder book, NAMED EXPLICITLY like its two
        // neighbours. This composition root hands each router the exact
        // bindings it may reach rather than the whole env, so a capability
        // a route was not given is one it cannot use by accident. Adding
        // the ladder here is what makes the buyer rung readable at order
        // create; forgetting it fails CLOSED (the door refuses), which is
        // how this omission was found.
        LADDER: env.LADDER,
        // REPERE-AUDIO-REEL — the media door, for the buyer's voice note at
        // create. Same explicit-grant law; forgetting either fails SOFT by
        // design (the note is `perdue`, the sale never blocks).
        ...(env.MEDIA !== undefined ? { MEDIA: env.MEDIA } : {}),
        ...(env.MEDIA_WRITE_KEY !== undefined ? { MEDIA_WRITE_KEY: env.MEDIA_WRITE_KEY } : {}),
        // LISTE-ADRESSE — the liste book, for the gift order's background
        // contact attach and the zone-coherence check. Same explicit-grant
        // law; forgetting it would fail SOFT here (no attach) but the quote
        // road above is gated on the same binding, so no address-priced
        // quote could exist for this door to mismatch.
        ...(env.WISHLIST !== undefined ? { WISHLIST: env.WISHLIST } : {}),
      });
      if (createSource !== undefined && answered.status === 200) {
        await mirrorDispatchRow(env, createSource);
      }
      return withReadCors(answered);
    }

    /**
     * ═══ LISTE-ENVIES-1 — THE WISHLIST DOORS (founder order, 2026-08-25) ═══
     *
     * PUBLIC on the checkout surface's EXACT terms: a buyer holds no key and
     * must never need one to make or open a wish list. What that does NOT
     * open, stated like its neighbours because an exemption is a hole until
     * proven otherwise:
     *   · MATCHED EXACTLY — one `===`, one anchored single-segment regex,
     *     and one anchored two-segment action regex whose second segment is a
     *     LITERAL ALTERNATION (`fermer|cadeaux` — LISTE-CADEAUX); every other
     *     method and every other `/listes/...` shape falls through to the
     *     write gate and is refused 401.
     *   · THE CADEAUX DOOR SERVES THE CREATOR ONLY — the edit key is the
     *     credential (hash-compared inside the object, wrong key ≡ absent
     *     liste), and what leaves per gift is the pid, the journey facts the
     *     public ?cadeau view already serves, and the remise code under the
     *     remise door's own reveal conditions (decided inside the OrderDO).
     *     No orderId, no amount, no contact crosses out.
     *   · NO AMOUNT CAN ARRIVE — the create/update bodies are exact-key
     *     allowlists (`wishlist-core`) with no money field, and the pids must
     *     already be ON the boutique (checked against `curatedItems` below),
     *     so a caller cannot even name a product the shop does not sell.
     *   · NO ECONOMICS CAN LEAVE — the only answer shape is `projectListe`:
     *     nom, slug, pids, and « offert » as a bare boolean. No price, no
     *     supplier, no orderId crosses out.
     *   · IT CANNOT DECLARE ANYTHING PAID — « offert » is written only by the
     *     OrderDO's outbox at the provider-confirmed transition; the DO route
     *     that writes it (/entry/offert) is mapped to no public path at all.
     *   · WRITES ARE TOKEN-SCOPED — a liste is reachable only by its own
     *     192-bit server-minted token, and editing needs the edit key, which
     *     is hash-compared inside the object (absent liste and wrong key are
     *     one uniform 404 — no oracle).
     * KNOWN AND ACCEPTED RESIDUE (journalled — the THIRD named admission of
     * this class, after the open quote POST and the signup POST): an open
     * POST lets an anonymous caller create liste objects at will. They hold
     * no money and no personal data beyond a first name, but there is no
     * rate limit in front of them, and that belongs on the real-money gate's
     * checklist, not on a pretend one here.
     */
    const isListeCreate = pathname === '/listes';
    const isListeByToken = /^\/listes\/[^/]+$/.test(pathname);
    // LISTE-CADEAUX — the creator's two edit-key doors: close the liste,
    // read her gifts. POST because the key rides the BODY, never a URL.
    const listeAction = /^\/listes\/([^/]+)\/(fermer|cadeaux)$/.exec(pathname);
    if (request.method === 'OPTIONS' && (isListeCreate || isListeByToken || listeAction !== null)) {
      // The checkout preflight, verbatim: same exact origin, and these doors
      // need the same POST + Content-Type grant the order routes needed.
      return checkoutPreflight();
    }
    if (
      (request.method === 'POST' && isListeCreate) ||
      ((request.method === 'GET' || request.method === 'POST') && isListeByToken) ||
      (request.method === 'POST' && listeAction !== null)
    ) {
      if (env.WISHLIST === undefined) {
        return withReadCors(Response.json({ ok: false, reason: 'listes_indisponibles' }, { status: 503 }));
      }
      const wishlist = env.WISHLIST;
      const listeStub = (token: string): DurableObjectStub => wishlist.get(wishlist.idFromName(`liste:${token}`));
      const neverCache = (res: Response): Response => {
        const out = new Response(res.body, res);
        out.headers.set('Cache-Control', 'private, no-store');
        return withReadCors(out);
      };
      if (isListeCreate) {
        const body = (await request.json().catch(() => null)) as unknown;
        // LISTE-VOIX — THE PUBLIC WIRE NEVER NAMES A REF (the
        // readBuyerContactWire law, applied to this door): a caller who could
        // send `audioRef` could attach a stranger's note to their deliveries.
        // The shared validator accepts the stored form because the DO
        // re-validates this root's OWN composed payload — so the refusal
        // lives HERE, at the one public door, by name.
        const livraisonBrute = (body as { livraison?: { audioRef?: unknown } } | null)?.livraison;
        if (livraisonBrute !== null && typeof livraisonBrute === 'object' && livraisonBrute.audioRef !== undefined) {
          return neverCache(Response.json({ ok: false, reason: 'bad_field', field: 'livraison' }, { status: 400 }));
        }
        const asked = validateListeCreate(body);
        if (!asked.ok) {
          return neverCache(
            Response.json(
              { ok: false, reason: asked.error, ...(asked.field !== undefined ? { field: asked.field } : {}) },
              { status: 400 },
            ),
          );
        }
        // THE BOUTIQUE IS RESOLVED THROUGH ITS OWN SLUG ROAD — the same
        // pointer→entry read `GET /s/{slug}` uses, so an unknown slug is the
        // same honest not-found and a private vitrine still resolves (the
        // signed-link law). The pids must be a SUBSET of her curatedItems:
        // a liste can only ever wish for what the shop actually sells.
        const sfRes = await sfRouter.fetch(new Request(`https://svc/s/${encodeURIComponent(asked.value.slug)}`), env);
        if (sfRes.status !== 200) {
          return neverCache(Response.json({ ok: false, reason: 'boutique_inconnue' }, { status: 404 }));
        }
        // The DO road answers the storefront FLAT (`/entry` returns
        // `entry.storefront`), so membership reads at the top level.
        const entry = (await sfRes.json().catch(() => null)) as { curatedItems?: unknown } | null;
        const curated = entry?.curatedItems;
        const curatedSet = new Set(Array.isArray(curated) ? (curated as string[]) : []);
        for (const pid of asked.value.pids) {
          if (!curatedSet.has(pid)) {
            return neverCache(Response.json({ ok: false, reason: 'produit_hors_boutique', field: pid }, { status: 422 }));
          }
        }
        /**
         * LISTE-VOIX — HER NOTE BECOMES A REF BEFORE THE LISTE IS BORN (the
         * order road's REPERE-AUDIO-REEL discipline, verbatim): this Worker
         * hands the bytes to the media door with ITS OWN write key, and only
         * the minted opaque ref is stored — a Durable Object value never
         * carries a megabyte of base64, and the write key never rides in any
         * public bundle. BEST-EFFORT BY RULING: a refusing media backend must
         * never block her liste — the typed repère and the address stand —
         * but the loss is NAMED on the response (`noteVocale: 'perdue'`),
         * never silent.
         */
        let noteVocale: 'gardee' | 'perdue' | undefined;
        let livraisonFinale = asked.value.livraison;
        if (asked.value.audioB64 !== undefined && livraisonFinale !== undefined) {
          const ref = await televerserNoteVocale(env, asked.value.audioB64);
          if (ref !== null) {
            livraisonFinale = { ...livraisonFinale, audioRef: ref };
            noteVocale = 'gardee';
          } else {
            noteVocale = 'perdue';
          }
        }
        const token = mintListeToken();
        const editCle = mintListeToken();
        const created = await listeStub(token).fetch(
          new Request('https://do/entry/create', {
            method: 'POST',
            // Composed EXPLICITLY, never a spread of the command: the bytes
            // (`audioB64`) stop HERE — only the stored form crosses to the DO.
            body: JSON.stringify({
              liste: {
                slug: asked.value.slug,
                nom: asked.value.nom,
                pids: asked.value.pids,
                ...(asked.value.telephone !== undefined ? { telephone: asked.value.telephone } : {}),
                ...(livraisonFinale !== undefined ? { livraison: livraisonFinale } : {}),
              },
              editCle,
            }),
          }),
        );
        const decided = (await created.json().catch(() => null)) as { ok?: boolean; liste?: unknown } | null;
        if (decided?.ok !== true || decided.liste === undefined) {
          // The only refusal a validated create can meet is a token-name
          // collision — not a real event at 192 bits, so it is answered as
          // the retryable unavailability it would be.
          return neverCache(Response.json({ ok: false, reason: 'listes_indisponibles' }, { status: 503 }));
        }
        // THE EDIT KEY LEAVES EXACTLY ONCE, here, never-cache — the buyer-ref
        // create-only discipline. The share token is the link; the edit key
        // stays on the creator's own phone. `noteVocale` is the same
        // create-only fact the order road serves: what became of her note.
        return neverCache(
          Response.json({ ok: true, token, editCle, liste: decided.liste, ...(noteVocale !== undefined ? { noteVocale } : {}) }),
        );
      }
      // LISTE-CADEAUX — the creator's action doors. The malformed-token law
      // is the by-token read's, verbatim; the BODY crosses to the object
      // VERBATIM (the update door's discipline — the object's own validation
      // refuses, never this layer).
      if (listeAction !== null) {
        const actionToken = decodeOrderId(listeAction[1]!);
        if (actionToken === undefined || !LISTE_TOKEN.test(actionToken)) {
          return neverCache(Response.json({ ok: false, reason: 'not_found' }, { status: 404 }));
        }
        const actionBody = await request.text();
        if (listeAction[2] === 'fermer') {
          // « remove all his items to terminate the wishlist » — the object
          // deletes everything or refuses uniformly; nothing to add here.
          return neverCache(
            await listeStub(actionToken).fetch(
              new Request('https://do/entry/delete', { method: 'POST', body: actionBody }),
            ),
          );
        }
        // cadeaux — the object hash-checks her key and names the gift orders;
        // THEN this root (the one layer holding both namespaces) asks each
        // order for its journey and, when the OrderDO's own remise conditions
        // say so, the code. ≤20 by the liste's own ceiling. A gift whose
        // order cannot answer degrades to its pid alone — the sheet says
        // « suivi indisponible », never a dead screen.
        const decided = await listeStub(actionToken).fetch(
          new Request('https://do/entry/cadeaux', { method: 'POST', body: actionBody }),
        );
        if (!decided.ok) return neverCache(decided);
        const lu = (await decided.json().catch(() => null)) as
          | { ok?: boolean; nom?: unknown; cadeaux?: unknown }
          | null;
        if (lu?.ok !== true || typeof lu.nom !== 'string' || !Array.isArray(lu.cadeaux)) {
          return neverCache(Response.json({ ok: false, reason: 'listes_indisponibles' }, { status: 503 }));
        }
        const rows = await Promise.all(
          (lu.cadeaux as { pid?: unknown; orderId?: unknown }[]).map(async (c) => {
            const pid = typeof c?.pid === 'string' ? c.pid : undefined;
            const orderId = typeof c?.orderId === 'string' ? c.orderId : undefined;
            if (pid === undefined) return null;
            if (orderId === undefined) return { pid };
            const res = await env.ORDER.get(env.ORDER.idFromName(orderId))
              .fetch(
                new Request('https://do/entry/cadeau-liste', {
                  method: 'POST',
                  body: JSON.stringify({ listeRef: actionToken }),
                }),
              )
              .catch(() => undefined);
            const facts =
              res === undefined
                ? null
                : ((await res.json().catch(() => null)) as { ok?: boolean; suivi?: unknown; code?: unknown } | null);
            if (facts?.ok !== true || facts.suivi === undefined) return { pid };
            // The orderId NEVER rides out — the pid keys the row; the suivi
            // and code are relayed as the OrderDO allowlisted them.
            return { pid, suivi: facts.suivi, ...(typeof facts.code === 'string' ? { code: facts.code } : {}) };
          }),
        );
        return neverCache(Response.json({ ok: true, nom: lu.nom, cadeaux: rows.filter((r) => r !== null) }));
      }
      // BY TOKEN — read (friend) or update (creator). A malformed token is
      // the SAME uniform 404 an unknown one earns inside the object: the
      // charset pin refuses it before it becomes a Durable Object name.
      const rawToken = decodeOrderId(pathname.slice('/listes/'.length));
      if (rawToken === undefined || !LISTE_TOKEN.test(rawToken)) {
        return neverCache(Response.json({ ok: false, reason: 'not_found' }, { status: 404 }));
      }
      if (request.method === 'GET') {
        return neverCache(await listeStub(rawToken).fetch(new Request('https://do/entry')));
      }
      // UPDATE — the body crosses VERBATIM so the object's exact-key
      // allowlist refuses a smuggled field rather than this layer stripping
      // it (the accounts-door discipline); the edit key is hash-compared
      // inside, where absent-liste and wrong-key are one indistinguishable 404.
      const updateBody = await request.text();
      /**
       * VERIFIER (MINOR 1, handled once) — THE MEMBERSHIP LAW HOLDS FOR THE
       * LISTE'S WHOLE LIFE, not only its birth: an update's pids are checked
       * against the SAME curatedItems the create checked, through the liste's
       * own stored slug. Only a WELL-FORMED body is checked here — a malformed
       * one still crosses verbatim so the object's allowlist names the field.
       * No new oracle: the check runs before the edit-key compare, but the
       * slug it could reveal is already on the PUBLIC projection, and the
       * catalogue is the boutique's public page. A boutique that no longer
       * resolves skips the check rather than stranding her liste — nothing
       * downstream renders a pid the catalogue cannot resolve anyway.
       */
      const askedUpdate = validateListeUpdate((() => {
        try { return JSON.parse(updateBody) as unknown; } catch { return null; }
      })());
      if (askedUpdate.ok) {
        const luRes = await listeStub(rawToken).fetch(new Request('https://do/entry'));
        const lu = (await luRes.json().catch(() => null)) as { liste?: { slug?: unknown } } | null;
        const slugListe = lu?.liste?.slug;
        if (typeof slugListe === 'string') {
          const sfRes = await sfRouter.fetch(new Request(`https://svc/s/${encodeURIComponent(slugListe)}`), env);
          if (sfRes.status === 200) {
            const entry = (await sfRes.json().catch(() => null)) as { curatedItems?: unknown } | null;
            const curatedSet = new Set(Array.isArray(entry?.curatedItems) ? (entry.curatedItems as string[]) : []);
            for (const pid of askedUpdate.value.pids) {
              if (!curatedSet.has(pid)) {
                return neverCache(Response.json({ ok: false, reason: 'produit_hors_boutique', field: pid }, { status: 422 }));
              }
            }
          }
        }
      }
      return neverCache(
        await listeStub(rawToken).fetch(
          new Request('https://do/entry/update', { method: 'POST', body: updateBody }),
        ),
      );
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
    /**
     * ═══ READINESS-RETURN-1c — THE RETURN LEG'S INTAKE (founder order,
     *     2026-08-02: « build the return signal ») ═══
     *
     * Boutik+ delivers `fulfillment.accepted.v1` / `fulfillment.ready.v1` here
     * at-least-once. This is the FIRST event this Worker receives rather than
     * sends, so it gets its own secret (`PROGRESS_WRITE_SECRET`) — never the
     * one this Worker uses to write INTO Boutik+.
     *
     * PARSED THROUGH THE CANON ARTIFACT ON RECEIPT, which is the whole point
     * of binding name to payload: a body carrying a supplier id, a readiness
     * challenge, a photo or a franc is refused HERE, by construction, even if
     * a future producer bug tried to send one. The refusal is a 400 and not a
     * 5xx, deliberately: a producer bug must surface as a repeating refusal in
     * both Workers' logs, while a real outage stays retryable.
     *
     * The gate runs BEFORE any dispatch, so a 401 can never become an
     * existence oracle for order ids.
     */
    if (pathname === '/fulfillment/progress') {
      if (request.method !== 'POST') return unauthorized();
      /**
       * SECTEURS-PROGRES-1 (AUDIT-SHOP-1 slice e) — WHO is writing is settled
       * FIRST (uniform 401, before any parse), and WHAT they may write is
       * enforced at each event's own dispatch: Boutik+'s credential opens the
       * preparation facts alone, Séra's the delivery marks alone. A valid
       * credential on the wrong event is a 403 BY NAME. The senders differ on
       * what they do with it — the verifier's catch: Séra's three wires judge
       * by `res.ok` alone and RETRY on their alarm, so the founder's
       * secret-swap window loses no delivery mark in either order; Boutik+'s
       * preparation wire PARKS a 403 permanently (`refused_by_consumer`,
       * one attempt, its own deliberate law). A correct swap never shows
       * Boutik+ a 403 — its credential stays valid on its own doors in both
       * worlds — but pasting the Séra value into `PROGRESS_WRITE_SECRET`
       * would silently park preparation facts: the runbook in wrangler.toml
       * names it.
       */
      const writer = await progressWriter(request, env);
      if (writer === null) return unauthorized();
      const raw: unknown = await request.json().catch(() => null);
      const accepted = FulfillmentAcceptedEventSchema.safeParse(raw);
      const ready = accepted.success ? null : FulfillmentReadyEventSchema.safeParse(raw);
      if (accepted.success || (ready !== null && ready.success)) {
        if (writer === 'sera') {
          return Response.json({ ok: false, reason: 'wrong_writer' }, { status: 403 });
        }
        const event = accepted.success ? accepted.data : ready!.data!;
        const fact = event.name === 'fulfillment.accepted.v1' ? 'accepted' : 'ready';
        return env.ORDER.get(env.ORDER.idFromName(event.payload.orderId)).fetch(
          new Request('https://do/entry/preparation', {
            method: 'POST',
            body: JSON.stringify({ fact, at: event.payload.at }),
          }),
        );
      }
      /**
       * SE-LIVE-5b — the THIRD event this door accepts: Séra's
       * `delivery.validated.v1`. Canon names the event but publishes no typed
       * payload artifact for it yet, so the binding of name to payload happens
       * HERE, strictly, on the fields the custody spine actually emits — a
       * body carrying anything less is refused 400 like every other
       * non-canonical caller. The RAW event goes to the vault untouched: the
       * spine re-parses the envelope, checks the order's own correlation and
       * absorbs redeliveries by command_id.
       */
      /**
       * STOCK-VENDU-1b — the FOURTH event this door accepts: Séra's
       * `delivery.refused.v1` (already canon; sent so Boutik+ can restock the
       * returned unit). Same strict binding-at-the-door discipline as the
       * validated signal: the order id bounded, the raw event forwarded
       * verbatim, the DO first-wins per order.
       */
      const refusee = PlatformEventSchema.safeParse(raw);
      if (refusee.success && refusee.data.name === 'delivery.refused.v1') {
        if (writer === 'boutik') {
          return Response.json({ ok: false, reason: 'wrong_writer' }, { status: 403 });
        }
        const p = refusee.data.payload as Record<string, unknown>;
        if (typeof p['order_id'] !== 'string' || p['order_id'] === '' || p['order_id'].length > 256) {
          return Response.json({ ok: false, reason: 'event_not_canonical' }, { status: 400 });
        }
        return env.ORDER.get(env.ORDER.idFromName(p['order_id'])).fetch(
          new Request('https://do/entry/course-refusee', {
            method: 'POST',
            body: JSON.stringify(refusee.data),
          }),
        );
      }
      const validated = PlatformEventSchema.safeParse(raw);
      if (validated.success && validated.data.name === 'delivery.validated.v1') {
        if (writer === 'boutik') {
          return Response.json({ ok: false, reason: 'wrong_writer' }, { status: 403 });
        }
        const p = validated.data.payload as Record<string, unknown>;
        if (
          typeof p['order_id'] !== 'string' ||
          p['order_id'] === '' ||
          p['order_id'].length > 256 ||
          p['result'] !== 'validated' ||
          p['settlement_eligibility'] !== true ||
          // audit G1: the signal names the SUPPLIER that gets paid. Without it
          // the spine would record a settlement obligation to an empty payee.
          // Refuse at the boundary so Séra resends with the ref.
          typeof p['supplier_ref'] !== 'string' ||
          p['supplier_ref'] === ''
        ) {
          return Response.json({ ok: false, reason: 'event_not_canonical' }, { status: 400 });
        }
        return env.ORDER.get(env.ORDER.idFromName(p['order_id'])).fetch(
          new Request('https://do/entry/eligibility', {
            method: 'POST',
            body: JSON.stringify(validated.data),
          }),
        );
      }
      return Response.json({ ok: false, reason: 'event_not_canonical' }, { status: 400 });
    }

    /**
     * ═══ VRAI-SUIVI — SÉRA'S TRANSIT MARKS (the buyer-tracking intake) ═══
     *
     * Séra tells this Worker the rider departed (`en_route`) and arrived
     * (`arrivee`), so the buyer's « Mes commandes » can say where her package
     * stands — SP6's masked relay: a stage and an instant, never a rider
     * identity and never a position. SÉRA'S OWN credential opens it
     * (SECTEURS-PROGRES-1: `SERA_PROGRESS_SECRET` once the founder mints it,
     * the legacy shared value until then — the same classifier as
     * `/fulfillment/progress`), and the gate runs BEFORE any dispatch so the
     * 401 is never an existence oracle.
     *
     * EXACT-SHAPE BODY: {orderId, stage, asOf} and nothing else — an unknown
     * field, an unknown stage or an unparseable instant refuses 400 BY NAME
     * (a producer bug must surface as a repeating refusal in both Workers'
     * logs). An order this Worker does not know is 404 and NOT a write: the
     * producer retries, exactly as the preparation intake has it.
     */
    if (pathname === '/fulfillment/transit') {
      if (request.method !== 'POST') return unauthorized();
      // SECTEURS-PROGRES-1 — this whole door is Séra's: no body inspection
      // needed to know Boutik+'s credential has no business here.
      const writer = await progressWriter(request, env);
      if (writer === null) return unauthorized();
      if (writer === 'boutik') {
        return Response.json({ ok: false, reason: 'wrong_writer' }, { status: 403 });
      }
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      for (const key of Object.keys(body)) {
        if (key !== 'orderId' && key !== 'stage' && key !== 'asOf') {
          return Response.json({ ok: false, reason: 'unknown_field', field: key }, { status: 400 });
        }
      }
      const orderId = body['orderId'];
      const stage = body['stage'];
      const asOf = body['asOf'];
      if (
        typeof orderId !== 'string' || orderId === '' || orderId.length > 256 ||
        (stage !== 'en_route' && stage !== 'arrivee') ||
        typeof asOf !== 'string' || Number.isNaN(Date.parse(asOf))
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return env.ORDER.get(env.ORDER.idFromName(orderId)).fetch(
        new Request('https://do/entry/transit', {
          method: 'POST',
          body: JSON.stringify({ stage, at: asOf }),
        }),
      );
    }

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
      /**
       * RESELLER-ACCOUNTS-1b — a SESSION opens this read too. Tried first
       * (its prefix is unambiguous); a resolved-but-not-active account is
       * refused BY NAME — the founder's pause must read as a pause, never as
       * a network fault or a bad credential. The legacy feed-code path is
       * untouched underneath: the founder's own code keeps working.
       */
      type MineShape = { ok?: boolean; resellerId?: string; orders?: { orderId: string }[] } | null;
      let mine: MineShape = null;
      const compte = await resoudreCompte(env, code);
      if (compte !== undefined) {
        if (compte.state === 'paused') {
          return withResellerCors(Response.json({ ok: false, reason: 'access_paused' }, { status: 403 }));
        }
        if (compte.state === 'pending_access') {
          return withResellerCors(Response.json({ ok: false, reason: 'access_required' }, { status: 403 }));
        }
        const rowsRes = await feed.fetch(
          new Request('https://do/rows', { method: 'POST', body: JSON.stringify({ resellerId: compte.accountId }) }),
        );
        mine = (await rowsRes.json().catch(() => null)) as MineShape;
      } else {
        const mineRes = await feed.fetch(
          new Request('https://do/mine', { method: 'POST', body: JSON.stringify({ code }) }),
        );
        mine = (await mineRes.json().catch(() => null)) as MineShape;
      }
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
      const asked = mine.orders.slice(0, feedFanoutMax(env));
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

    /**
     * ═══ RESELLER-ACCOUNTS-1b — THE ACCOUNT DOORS (canon v3.8.0) ═══
     *
     * PUBLIC on the same terms as checkout: a stranger holds no key and must
     * be able to CREATE an account and LOG IN. What that does not open: no
     * money can arrive or leave through these routes, the admission code is
     * founder-minted, and every read behind them refuses on account state.
     * KNOWN RESIDUE (journalled, same class as the open quote POST): no rate
     * limit in front of signup — that belongs on the real-money gate's
     * checklist, not on a pretend one here.
     */
    if (
      pathname === '/reseller/signup' ||
      pathname === '/reseller/login' ||
      pathname === '/reseller/session' ||
      pathname === '/reseller/admission' ||
      pathname === '/reseller/profile'
    ) {
      if (request.method === 'OPTIONS') return resellerPreflight();
      if (request.method !== 'POST') return withResellerCors(unauthorized());
      if (env.COMPTES === undefined) {
        return withResellerCors(Response.json({ ok: false, reason: 'accounts_unavailable' }, { status: 503 }));
      }
      const comptes = env.COMPTES.get(env.COMPTES.idFromName(RESELLER_ACCOUNTS_NAME));
      // session/admission/profile authenticate with the Bearer; the DO receives
      // it in the body because a DO fetch has no ambient auth of its own.
      if (pathname === '/reseller/session' || pathname === '/reseller/admission' || pathname === '/reseller/profile') {
        const auth = request.headers.get('Authorization') ?? '';
        const session = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const answer = await comptes.fetch(
          new Request(`https://do${pathname.slice('/reseller'.length)}`, {
            method: 'POST',
            body: JSON.stringify({ ...body, session }),
          }),
        );
        const out = new Response(answer.body, answer);
        out.headers.set('Cache-Control', 'private, no-store');
        return withResellerCors(out);
      }
      // signup/login carry credentials in the body VERBATIM — the DO's own
      // allowlist refuses a smuggled field rather than this layer stripping it.
      const answer = await comptes.fetch(
        new Request(`https://do${pathname.slice('/reseller'.length)}`, { method: 'POST', body: await request.text() }),
      );
      const out = new Response(answer.body, answer);
      out.headers.set('Cache-Control', 'private, no-store');
      return withResellerCors(out);
    }

    /**
     * THE FOUNDER'S ACCOUNT CONSOLE — roster, pause/resume, admission-code
     * mint, and the suivi. Key C, the same credential as the dispatch board:
     * same person, same Worker, same class of act.
     */
    if (
      pathname === '/reseller/accounts' ||
      pathname === '/reseller/accounts/access-code' ||
      pathname === '/reseller/accounts/access-code/reveal' ||
      pathname === '/reseller/accounts/pause' ||
      pathname === '/reseller/accounts/resume'
    ) {
      const isList = pathname === '/reseller/accounts';
      if (request.method === 'OPTIONS') return dispatchPreflight(isList ? 'GET' : 'POST');
      if (request.method !== (isList ? 'GET' : 'POST')) return withDispatchCors(unauthorized());
      const refused = await rejectUnauthorizedOpsRead(request, env);
      if (refused) return withDispatchCors(refused);
      if (env.COMPTES === undefined) {
        return withDispatchCors(Response.json({ ok: false, reason: 'accounts_unavailable' }, { status: 503 }));
      }
      const comptes = env.COMPTES.get(env.COMPTES.idFromName(RESELLER_ACCOUNTS_NAME));
      const cible = isList ? '/accounts' : pathname.slice('/reseller/accounts'.length);
      return withDispatchCors(
        await comptes.fetch(
          new Request(`https://do${cible}`, isList ? undefined : { method: 'POST', body: await request.text() }),
        ),
      );
    }

    /**
     * LE SUIVI — every account, its confirmed sales and its net, in one read.
     * Key C. The counts are EXACT COUNTS and the francs are COPIES of frozen
     * quote nets summed (SP-I04's law, same as the gains ladder) — no score,
     * no rank is computed anywhere; the console sorts by the count it shows.
     * Fan-out bounded and HONEST: what could not be read within the budget is
     * counted and declared per row (`incomplet`), never silently dropped.
     */
    if (pathname === '/reseller/suivi') {
      if (request.method === 'OPTIONS') return dispatchPreflight();
      if (request.method !== 'GET') return withDispatchCors(unauthorized());
      const refused = await rejectUnauthorizedOpsRead(request, env);
      if (refused) return withDispatchCors(refused);
      if (env.COMPTES === undefined || env.RESELLER === undefined) {
        return withDispatchCors(Response.json({ ok: false, reason: 'accounts_unavailable' }, { status: 503 }));
      }
      const comptes = env.COMPTES.get(env.COMPTES.idFromName(RESELLER_ACCOUNTS_NAME));
      const listRes = await comptes.fetch(new Request('https://do/accounts'));
      const list = (await listRes.json().catch(() => null)) as
        | { ok?: boolean; accounts?: { accountId: string; name: string; state: string }[] }
        | null;
      if (list?.ok !== true || !Array.isArray(list.accounts)) {
        return withDispatchCors(Response.json({ ok: false, reason: 'unreadable' }, { status: 502 }));
      }
      const feed = env.RESELLER.get(env.RESELLER.idFromName(RESELLER_FEED_NAME));
      let budget = feedFanoutMax(env); // one global order-read budget for the whole board
      const lignes: unknown[] = [];
      for (const acc of list.accounts.slice(0, 50)) {
        const rowsRes = await feed
          .fetch(new Request('https://do/rows', { method: 'POST', body: JSON.stringify({ resellerId: acc.accountId }) }))
          .catch(() => null);
        const rows = rowsRes === null
          ? null
          : ((await rowsRes.json().catch(() => null)) as { ok?: boolean; orders?: { orderId: string }[] } | null);
        if (rows?.ok !== true || !Array.isArray(rows.orders)) {
          lignes.push({ accountId: acc.accountId, name: acc.name, state: acc.state, ventes: 0, netFcfa: 0, incomplet: true });
          continue;
        }
        let net = 0;
        let lues = 0;
        let incomplet = false;
        for (const row of rows.orders) {
          if (budget <= 0) { incomplet = true; break; }
          budget -= 1;
          try {
            const res = await env.ORDER.get(env.ORDER.idFromName(row.orderId)).fetch(
              new Request(`https://do/entry/reseller/${encodeURIComponent(acc.accountId)}`),
            );
            const v = (await res.json().catch(() => null)) as Record<string, unknown> | null;
            const projected = projectVente(v);
            if (projected === null) { incomplet = true; continue; }
            const p = projected as { state?: unknown; resellerNet?: unknown };
            if (p.state === 'confirmed' && typeof p.resellerNet === 'number') {
              net += p.resellerNet;
              lues += 1;
            }
          } catch {
            incomplet = true;
          }
        }
        lignes.push({ accountId: acc.accountId, name: acc.name, state: acc.state, ventes: lues, netFcfa: net, incomplet });
      }
      const answer = Response.json({ ok: true, lignes });
      answer.headers.set('Cache-Control', 'private, no-store');
      return withDispatchCors(answer);
    }

    /** RF-1a — the founder MINTS and REVOKES a reseller's feed code. His own
     *  credential (value C, the same one his dispatch read uses — same
     *  person, same Worker, same class of act); the body crosses VERBATIM so
     *  the object's exact-key check refuses a smuggled field rather than
     *  this layer silently stripping it. */
    if (pathname === '/reseller/code' || pathname === '/reseller/code/revoke' || pathname === '/reseller/code/reveal') {
      if (request.method === 'OPTIONS') return opsPreflight('POST');
      if (request.method !== 'POST') return withOpsCors(unauthorized());
      const refused = await rejectUnauthorizedOpsRead(request, env);
      if (refused) return withOpsCors(refused);
      if (env.RESELLER === undefined) return withOpsCors(unauthorized());
      const body = await request.text();
      const feed = env.RESELLER.get(env.RESELLER.idFromName(RESELLER_FEED_NAME));
      return withOpsCors(
        await feed.fetch(
          new Request(
            pathname === '/reseller/code'
              ? 'https://do/code/mint'
              : pathname === '/reseller/code/revoke'
                ? 'https://do/code/revoke'
                : 'https://do/code/reveal', {
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
    /**
     * RB-3 — THE GAINS READ: every CONFIRMED order's frozen waterfall, to the
     * founder alone (key C — the same credential as the dispatch read: one
     * Shop+ ops door, one identity). Composed exactly as the dispatch read is:
     * the index names the orders, each OrderDO serves ITS OWN stored split
     * (or refuses 422 if its bytes no longer reconcile — a refused row is
     * DROPPED here, never rendered wrong). Only `confirmed` rows leave: an
     * unpaid order has no gains to explain.
     */
    /**
     * ═══ DISPATCH-PAGES-1 (AUDIT-SHOP-1 slice b) — THE FAN-OUT IS PAGED ═══
     *
     * Both reads below list the index and then make ONE subrequest per listed
     * order to that order's own object — and the platform caps subrequests
     * per request, so the console 500'd the moment the LIFETIME order count
     * crossed the budget (measured ceiling ≈ 49 on the Free plan). Now each
     * request reads ONE page: `?limit=` (absent = 40; 1..40, else 400 BY
     * NAME — a bigger page would simply re-create the bug) after `?cursor=`
     * (the `next` a previous page answered, echoed verbatim; the index
     * refuses a malformed one by name). `next` present means more pages —
     * the console follows it, one HTTP request per page, each within budget.
     */
    if (pathname === '/checkout/gains' || pathname === '/checkout/dispatch') {
      if (request.method === 'OPTIONS') return dispatchPreflight();
      if (request.method !== 'GET') return withDispatchCors(unauthorized());
      const refused = await rejectUnauthorizedOpsRead(request, env);
      if (refused) return withDispatchCors(refused);
      const params = new URL(request.url).searchParams;
      const limitRaw = params.get('limit');
      const limit = limitRaw === null ? PAGE_DISPATCH : Number(limitRaw);
      if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_DISPATCH) {
        return withDispatchCors(Response.json({ ok: false, reason: 'malformed' }, { status: 400 }));
      }
      const cursor = params.get('cursor');
      const stub = env.DISPATCH.get(env.DISPATCH.idFromName(DISPATCH_INDEX_NAME));
      const listRes = await stub.fetch(
        new Request(`https://do/list?limit=${limit}${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`),
      );
      if (listRes.status === 400) {
        // the index refused the cursor — the caller's mistake, named, never
        // dressed up as an index outage
        return withDispatchCors(Response.json({ ok: false, reason: 'malformed' }, { status: 400 }));
      }
      const list = (await listRes.json().catch(() => null)) as
        | { ok?: boolean; orders?: { orderId: string; firstSeenAt: string }[]; next?: string }
        | null;
      if (list?.ok !== true || !Array.isArray(list.orders)) {
        return withDispatchCors(Response.json({ ok: false, reason: 'index_unavailable' }, { status: 503 }));
      }
      const suite = typeof list.next === 'string' ? { next: list.next } : {};
      if (pathname === '/checkout/gains') {
        const gains: unknown[] = [];
        for (const entry of list.orders) {
          const res = await env.ORDER.get(env.ORDER.idFromName(entry.orderId)).fetch(
            new Request('https://do/entry/gains'),
          );
          const row = (await res.json().catch(() => null)) as
            | { ok?: boolean; exists?: boolean; state?: string }
            | null;
          if (row?.ok === true && row.exists === true && row.state === 'confirmed') gains.push(row);
        }
        return withDispatchCors(Response.json({ ok: true, gains, ...suite }));
      }
      const rows: unknown[] = [];
      for (const entry of list.orders) {
        const res = await env.ORDER.get(env.ORDER.idFromName(entry.orderId)).fetch(
          new Request('https://do/entry/dispatch'),
        );
        const row = (await res.json().catch(() => null)) as { ok?: boolean; exists?: boolean } | null;
        if (row?.ok === true && row.exists === true) rows.push(row);
      }
      return withDispatchCors(Response.json({ ok: true, orders: rows, ...suite }));
    }

    /**
     * ═══ SP6.3 — THE FOUNDER RECORDS ONE DOORSTEP REFUSAL (§6.4) ═══
     *
     * `POST /checkout/dispatch/{orderId}/refusal`, key C, same door and same
     * credential as the dispatch read it sits beside: he is already looking at
     * that row when the rider tells him what happened.
     *
     * ═══ THE BUYER IS NAMED BY THE ORDER, NEVER BY THE CALLER ═══
     *
     * The body carries ONE field — the §6.4 reason. It cannot carry a phone,
     * and that is the whole shape of this route: the key is read from the
     * ORDER'S OWN contact, server-side, through the same internal projection
     * the dispatch list uses. A console typo can therefore refuse the wrong
     * ORDER (visible, and his to correct) but can never move a stranger's
     * ladder — which a phone field would have made a one-digit mistake away.
     * Same law as §6.1's facts: the values a decision is measured by come from
     * server truth, never from the wire.
     *
     * A door that only the founder holds, on a Worker whose write key, webhook
     * secret and Boutik+ ops key all open nothing here.
     */
    {
      const refusalRoute = /^\/checkout\/dispatch\/([^/]+)\/refusal$/.exec(pathname);
      if (refusalRoute !== null) {
        if (request.method === 'OPTIONS') return dispatchPreflight('POST');
        if (request.method !== 'POST') return withDispatchCors(unauthorized());
        const refused = await rejectUnauthorizedOpsRead(request, env);
        if (refused) return withDispatchCors(refused);
        if (env.LADDER === undefined) {
          return withDispatchCors(Response.json({ ok: false, reason: 'ladder_unavailable' }, { status: 503 }));
        }
        const orderId = decodeOrderId(refusalRoute[1]!);
        if (orderId === undefined) return withDispatchCors(Response.json({ ok: false, reason: 'not_found' }, { status: 404 }));

        const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
          return withDispatchCors(Response.json({ ok: false, reason: 'malformed' }, { status: 400 }));
        }
        for (const key of Object.keys(body)) {
          // ONE FIELD, and the allowlist is the shape — a `phone` sent here is
          // refused by NAME rather than ignored, so a client that thinks it may
          // name the buyer learns immediately that it may not.
          if (key !== 'reason') {
            return withDispatchCors(Response.json({ ok: false, reason: 'unknown_field', field: key }, { status: 400 }));
          }
        }

        // THE ORDER'S OWN CONTACT, read the way the dispatch list reads it.
        const orderRes = await env.ORDER.get(env.ORDER.idFromName(orderId)).fetch(
          new Request('https://do/entry/dispatch'),
        );
        const order = (await orderRes.json().catch(() => null)) as
          | { ok?: boolean; exists?: boolean; contact?: { phone?: unknown } | null }
          | null;
        if (order?.ok !== true || order.exists !== true) {
          return withDispatchCors(Response.json({ ok: false, reason: 'not_found' }, { status: 404 }));
        }
        const phone = order.contact?.phone;
        if (typeof phone !== 'string' || phone === '') {
          // No contact on the order — there is no buyer to key a ladder to, and
          // inventing one is not on the table. Named so the console can say
          // something true instead of « it did not work ».
          return withDispatchCors(Response.json({ ok: false, reason: 'no_contact_on_order' }, { status: 422 }));
        }
        const name = ladderName(phone);
        if (name === null) {
          return withDispatchCors(Response.json({ ok: false, reason: 'phone_not_keyable' }, { status: 422 }));
        }

        // The DO validates the reason against §6.4's closed vocabulary and
        // applies the rung; nothing here decides anything about her history.
        return withDispatchCors(
          await env.LADDER.get(env.LADDER.idFromName(name)).fetch(
            new Request('https://do/entry/refusal', {
              method: 'POST',
              // REFUS-IDEMPOTENCE-1 — the order id travels INTO the ladder as
              // the idempotency key (founder ruling, option A). It comes from
              // the path this route already matched, never from the body, so
              // the one-field allowlist above is untouched and a caller still
              // cannot say anything about who is being recorded.
              body: JSON.stringify({
                buyerRef: name,
                orderId,
                reason: body.reason,
                at: new Date().toISOString(),
              }),
            }),
          ),
        );
      }
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
    /**
     * NB-3 (E2) — the sandbox stand-in READS THE KEY IT MUST ECHO. The vault
     * now refuses any webhook naming a charge the order never initiated, and a
     * real aggregator knows its key because we charged it with one — the
     * founder's SANDBOX-PAY-1 tool stands in for that aggregator, so it reads
     * the key here. SAME secret as the webhook itself (its holder can already
     * declare money received — reading one opaque key widens nothing), GET
     * only, and it RETIRES with the tool at the Real-Money Gate.
     */
    if (request.method === 'GET' && /^\/checkout\/webhook\/leg-key\//.test(pathname)) {
      if (!(await paymentWebhookAuthorized(request, env))) return unauthorized();
      return orderRouter.fetch(request, { ORDER: env.ORDER, CHECKOUT: env.CHECKOUT, LADDER: env.LADDER });
    }
    if (
      request.method === 'POST' &&
      (pathname === '/checkout/webhook/payment' || pathname === '/checkout/webhook/door')
    ) {
      if (!(await paymentWebhookAuthorized(request, env))) return unauthorized();
      // BC-1a — the SECOND best-effort registration moment: a 200 webhook
      // means the order certainly exists, so a row the create-time mirror
      // lost is repaired here, idempotently.
      const webhookSource = request.clone();
      const answered = await orderRouter.fetch(request, {
        ORDER: env.ORDER,
        CHECKOUT: env.CHECKOUT,
        // SP6.3 — the §6.4 ladder book, NAMED EXPLICITLY like its two
        // neighbours. This composition root hands each router the exact
        // bindings it may reach rather than the whole env, so a capability
        // a route was not given is one it cannot use by accident. Adding
        // the ladder here is what makes the buyer rung readable at order
        // create; forgetting it fails CLOSED (the door refuses), which is
        // how this omission was found.
        LADDER: env.LADDER,
      });
      if (answered.status === 200) await mirrorDispatchRow(env, webhookSource);
      return answered;
    }

    // KEY-GATED READS — safe methods skip the write gate below, so any read that is
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
    /**
     * ═══ RESELLER-AUTH-1 (AUDIT-SHOP-1 slice a2a) — WHO IS CALLING, AND WHAT IS HERS ═══
     *
     * The audit's MAJOR: every write ran on ONE shared key baked into the app,
     * and the per-reseller session was never consulted on a write — so any
     * admitted reseller could write into a rival's shop as herself. Now an
     * ACTIVE account's session (`Authorization: Bearer SPS-…`, the same bearer
     * her feed already rides) authorises every write and every key-gated read
     * on its own, and when it does, OWNERSHIP IS ENFORCED: the shop she creates
     * carries her own account id, and every act on a shop — reads included —
     * reaches only a shop whose `resellerId` is hers (`saBoutique`); a foreign
     * or absent shop answers ONE mute 404, so the check can never become an
     * existence oracle. A listing is owned through its shop.
     *
     * THE SHARED KEY STILL OPENS EVERY DOOR IT OPENED — deliberately, for one
     * more slice: the published app's access gate is off, so the phone in the
     * founder's hand holds no session, and his shop was created under a device
     * identity. Slice a2b (his word) arms the gate, seats him, and retires the
     * key, the a1 ceiling and its var together. Until then a key-only caller is
     * the pre-slice caller: no identity, no ownership — the residue the a1
     * ceiling exists to bound.
     */
    const appelante =
      isWrite(request.method) || isListings || isStorefrontRead || isSupplyCollection
        ? await sessionActive(request, env)
        : undefined;
    if (appelante === undefined) {
      // SERVICE-WRITE-AUTH-1 — gate EVERY write at the one deployed entry, before
      // any dispatch or existence lookup (so the 401 is never an existence oracle).
      // Reads pass straight through; a Worker with no secret configured fails closed.
      const denied = await rejectUnauthorizedWrite(request, env);
      if (denied) return denied;
      if ((isListings || isStorefrontRead || isSupplyCollection) && !(await keyAuthorized(request, env))) {
        return unauthorized();
      }
    } else {
      const refus = await refuserHorsPropriete(appelante, request, pathname, env);
      if (refus !== null) return refus;
    }
    // DO-management surfaces → the DO routers (idFromName addressing lives there).
    if (pathname === '/storefronts' || pathname.startsWith('/storefronts/')) {
      const res = await sfRouter.fetch(request, env);
      // RESELLER-AUTH-1 — with a session, the admin list is HER list: rows of
      // other resellers' shops never leave. The key-only caller keeps the whole
      // directory (the founder's operator read, until a2b).
      if (appelante !== undefined && request.method === 'GET' && pathname === '/storefronts' && res.status === 200) {
        const rows = (await res.json().catch(() => null)) as { resellerId?: unknown }[] | null;
        return Response.json((rows ?? []).filter((r) => r.resellerId === appelante.accountId));
      }
      return res;
    }
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
      /**
       * ═══ NO BOUTIQUE, NO PUBLICATION (founder ruling 2026-08-11) ═══
       *
       * A verifier walked this: `decidePublish` never checks that a storefront
       * exists, and the MEMBERSHIP write that follows answers `absent` at HTTP
       * 200 — which this root then ignored. So a reseller who had not yet put
       * her boutique online could publish, be told « C'est ajouté à votre
       * vitrine », and have it in no vitrine at all: a success message that
       * cannot fail, over a product no buyer could ever reach.
       *
       * THE CHECK IS BEFORE THE PUBLISH, not after. Publishing first and
       * undoing on `absent` would mean a signed listing existing for a moment
       * with no shop behind it, and an undo that can itself fail. Refusing
       * first leaves nothing to undo.
       *
       * IT REFUSES ONLY ON A DEFINITE 404. An unreachable or erroring shop read
       * is NOT « she has no shop » — that would take publishing down for
       * everyone on a hiccup — so anything but a clean not-found falls through
       * and the pre-existing behaviour stands.
       */
      if (typeof cmd.storefrontId === 'string' && cmd.storefrontId !== '') {
        const shop = await sfRouter
          .fetch(new Request(`https://do/storefronts/${encodeURIComponent(cmd.storefrontId)}`), env)
          .catch(() => undefined);
        if (shop !== undefined && shop.status === 404) {
          return Response.json({ error: 'storefront_absent' }, { status: 409 });
        }
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
      /**
       * ═══ RE-AJOUT (founder bug, 2026-08-13) — AN IDEMPOTENT PUBLISH STATES
       * MEMBERSHIP TOO ═══
       *
       * « When I add a product to ma vitrine, remove it and trying t re-add it,
       * it says the product exist already » — over an EMPTY vitrine. The app
       * pins every publish of a product to ONE command id (deliberate: a re-tap
       * stays idempotent, and the deferred re-price road stays closed), so a
       * re-add after « Retirer de ma vitrine » replays `idempotent` here — and
       * this append used to run only on `published`, so the product could never
       * return. « Publish states membership » is this root's own law; a replay
       * is still a publish, so it states it too. The listing itself is NOT
       * re-signed — the product returns at her ORIGINAL signed marge.
       */
      if (
        (decision?.status === 'published' || decision?.status === 'idempotent') &&
        cmd?.storefrontId &&
        cmd?.productVersionId
      ) {
        const added = await sfRouter.fetch(
          new Request(`https://do/storefronts/${encodeURIComponent(cmd.storefrontId)}/items`, {
            method: 'POST',
            body: JSON.stringify({ pid: cmd.productVersionId, at: cmd.at }),
          }),
          env,
        );
        /**
         * THE MEMBERSHIP ANSWER IS READ, not thrown away. The pre-check above
         * makes `absent` nearly unreachable, but « nearly » is what the shop
         * being deleted between the two calls costs — and a publish that
         * reports success while the product is in no shop is the exact lie
         * this ruling closes. Named so she is told, rather than left to
         * discover an empty vitrine.
         */
        const membership = (await added.json().catch(() => null)) as
          | { status?: string; storefront?: unknown }
          | null;
        if (membership?.status === 'absent') {
          return Response.json({ error: 'storefront_absent' }, { status: 409 });
        }
        /**
         * RE-AJOUT, the answer's half: an IDEMPOTENT publish whose append
         * genuinely ADDED (the product was gone — a re-add after removal)
         * says so: `remise: true`, with the post-add shop off the decider's
         * own answer (the removeItem precedent — the shop comes off the
         * write, never a second read). An idempotent replay whose append
         * answered `already_present` keeps today's body EXACTLY — `remise`
         * appears only when something actually returned. A `published`
         * answer keeps today's body exactly, too.
         */
        if (decision.status === 'idempotent' && membership?.status === 'added') {
          const replay = (await res.json().catch(() => null)) as Record<string, unknown> | null;
          return Response.json(
            {
              ...(replay ?? { status: 'idempotent' }),
              remise: true,
              ...(membership.storefront !== undefined ? { storefront: membership.storefront } : {}),
            },
            { status: res.status },
          );
        }
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
      // CUSTODY-ARMED-SIGNAL (audit E6) — presence only, computed HERE so the
      // secret values never enter the service env (the explicit-grant law:
      // health needs « set or unset », so that is all it is handed).
      CUSTODY_WIRES: {
        seraIntakeBase: (env.SERA_INTAKE_BASE ?? '') !== '',
        seraIntakeSecret: (env.SERA_INTAKE_SECRET ?? '') !== '',
        shopArmSecret: (env.SHOP_ARM_SECRET ?? '') !== '',
      },
      // CONTACT-WHATSAPP-1 — the owner-contact port over the accounts book's
      // internal /contact-of: the phone of an ACTIVE account, or undefined for
      // everything else (no compte, paused, pending, transport failure — the
      // boutique read renders unchanged on all of them). The port carries the
      // ONE field the join needs, never the account record.
      ...(env.COMPTES !== undefined
        ? {
            CONTACT: {
              whatsappOf: async (resellerId: string): Promise<string | undefined> => {
                const res = await env
                  .COMPTES!.get(env.COMPTES!.idFromName(RESELLER_ACCOUNTS_NAME))
                  .fetch(new Request('https://do/contact-of', { method: 'POST', body: JSON.stringify({ accountId: resellerId }) }))
                  .catch(() => undefined);
                if (res === undefined || !res.ok) return undefined;
                const body = (await res.json().catch(() => null)) as { phone?: unknown } | null;
                return typeof body?.phone === 'string' && body.phone !== '' ? body.phone : undefined;
              },
            },
          }
        : {}),
    };
    return handleRequest(request, serviceEnv);
  },
};

/**
 * RESELLER-AUTH-1 — the caller's ACTIVE session, or nobody. Only an `SPS-`
 * bearer is consulted: key C and the progress secret ride the same header on
 * routes answered above this gate, and a legacy `SP-` feed code is a door, not
 * an identity. Pending and paused accounts resolve to nobody — the state the
 * founder set outranks the credential she holds, here as on every read.
 */
async function sessionActive(request: Request, env: Env): Promise<{ accountId: string } | undefined> {
  const auth = request.headers.get('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (!bearer.startsWith('SPS-')) return undefined;
  const compte = await resoudreCompte(env, bearer);
  return compte !== undefined && compte.state === 'active' ? { accountId: compte.accountId } : undefined;
}

/** Is this shop hers? Absent, unreadable and foreign all answer the same `false`. */
async function saBoutique(env: Env, accountId: string, storefrontId: string): Promise<boolean> {
  const res = await sfRouter
    .fetch(new Request(`https://do/storefronts/${encodeURIComponent(storefrontId)}`), env)
    .catch(() => undefined);
  if (res === undefined || res.status !== 200) return false;
  const shop = (await res.json().catch(() => null)) as { resellerId?: unknown } | null;
  return shop?.resellerId === accountId;
}

/** ONE mute not-found for everything that is not hers — never an oracle. */
const pasLaSienne = (): Response => Response.json({ error: 'not_found' }, { status: 404 });

/** A path segment that will not decode is nobody's — never a 500. */
function decodeSur(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Is this listing hers? Absent (a new id) is `true`; foreign or unreadable is `false`. */
async function saListeOuLibre(env: Env, accountId: string, listingId: string): Promise<boolean> {
  const res = await lstRouter
    .fetch(new Request(`https://do/listings/${encodeURIComponent(listingId)}`), env)
    .catch(() => undefined);
  if (res === undefined) return false;
  if (res.status === 404) return true;
  if (res.status !== 200) return false;
  const listing = (await res.json().catch(() => null)) as { resellerId?: unknown } | null;
  return listing?.resellerId === accountId;
}

/**
 * RESELLER-AUTH-1 — the ownership rule, route by route, for a caller WITH a
 * session. `null` means « proceed ». A shop she creates must carry her own
 * account id (403 `not_owner` — there is no target to be mute about); every
 * act on an existing shop, listing or by-pid read must land on a shop that is
 * hers; the media upload names its shop in the query and that shop must be
 * hers; only the supply read needs the active session alone, because it is
 * the same catalogue for every admitted reseller.
 */
async function refuserHorsPropriete(
  appelante: { accountId: string },
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response | null> {
  if (request.method === 'POST' && pathname === '/storefronts') {
    const cmd = (await request.clone().json().catch(() => null)) as { resellerId?: unknown; id?: unknown } | null;
    if (cmd?.resellerId !== appelante.accountId) return Response.json({ error: 'not_owner' }, { status: 403 });
    // VERIFIER (a2a): the core answers a COLLIDING id with the existing shop in
    // the body — the very object the by-id read is muted to hide. An id that
    // already belongs to someone else is therefore nobody's here; her own
    // (the idempotent re-create) and a free id go through.
    if (typeof cmd.id !== 'string' || cmd.id === '') return Response.json({ error: 'malformed' }, { status: 400 });
    const existante = await sfRouter
      .fetch(new Request(`https://do/storefronts/${encodeURIComponent(cmd.id)}`), env)
      .catch(() => undefined);
    if (existante === undefined) return pasLaSienne();
    if (existante.status === 200) {
      const shop = (await existante.json().catch(() => null)) as { resellerId?: unknown } | null;
      if (shop?.resellerId !== appelante.accountId) return pasLaSienne();
    }
    return null;
  }
  // VERIFIER (a2a): the upload is not a blob she later attaches — `handleMediaUpload`
  // itself points the shop in its query at the stored bytes (cover, avatar, voice)
  // through the router directly. So the shop in the query must be hers.
  if (request.method === 'POST' && pathname === '/media/upload') {
    const storefrontId = new URL(request.url).searchParams.get('storefrontId');
    if (storefrontId === null || storefrontId === '') return Response.json({ error: 'malformed' }, { status: 400 });
    return (await saBoutique(env, appelante.accountId, storefrontId)) ? null : pasLaSienne();
  }
  let m = /^\/storefronts\/([^/]+)(?:\/.*)?$/.exec(pathname);
  if (m) {
    const id = decodeSur(m[1]!);
    return id !== null && (await saBoutique(env, appelante.accountId, id)) ? null : pasLaSienne();
  }
  if (request.method === 'POST' && pathname === '/listings') {
    const cmd = (await request.clone().json().catch(() => null)) as
      | { storefrontId?: unknown; resellerId?: unknown; listingId?: unknown }
      | null;
    // With an identity in hand, a publish that names no shop is a signed price
    // with no vitrine behind it — the NO-BOUTIQUE ruling, refused by name.
    if (typeof cmd?.storefrontId !== 'string' || cmd.storefrontId === '') {
      return Response.json({ error: 'malformed' }, { status: 400 });
    }
    if (typeof cmd.listingId !== 'string' || cmd.listingId === '') {
      return Response.json({ error: 'malformed' }, { status: 400 });
    }
    // The listing's payee is HER — SP-I01 locks every order's resellerId from
    // this artifact, so a listing naming anyone else would route her sales away.
    if (cmd.resellerId !== appelante.accountId) return Response.json({ error: 'not_owner' }, { status: 403 });
    if (!(await saBoutique(env, appelante.accountId, cmd.storefrontId))) return pasLaSienne();
    // VERIFIER (a2a): a publish is also a REWRITE of whatever already lives under
    // `listingId` (version N+1, or the idempotent replay of its command). Ids are
    // derivable, so an existing listing must be hers — or the id is nobody's.
    return (await saListeOuLibre(env, appelante.accountId, cmd.listingId)) ? null : pasLaSienne();
  }
  m = /^\/listings\/by-pid\/([^/]+)\/[^/]+(?:\/economics)?$/.exec(pathname);
  if (m) {
    const id = decodeSur(m[1]!);
    return id !== null && (await saBoutique(env, appelante.accountId, id)) ? null : pasLaSienne();
  }
  m = /^\/listings\/([^/]+)(?:\/hide)?$/.exec(pathname);
  if (m) {
    // A listing by id is owned by its PAYEE: the canon artifact carries her
    // `resellerId` (the id SP-I01 locks every order to) and, past this gate,
    // a publish can only ever carry the caller's own. Absent, foreign, or
    // unreadable answer the same mute not-found.
    const id = decodeSur(m[1]!);
    if (id === null) return pasLaSienne();
    const res = await lstRouter
      .fetch(new Request(`https://do/listings/${encodeURIComponent(id)}`), env)
      .catch(() => undefined);
    if (res === undefined || res.status !== 200) return pasLaSienne();
    const listing = (await res.json().catch(() => null)) as { resellerId?: unknown } | null;
    return listing?.resellerId === appelante.accountId ? null : pasLaSienne();
  }
  return null;
}

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
      // RESELLER-ACCOUNTS-1b — the account routes are POSTs on this same
      // public reseller surface; granting the METHOD grants nothing, every
      // route still authenticates its own way (session, code, or key C).
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Accept, Authorization, Content-Type',
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
 * The cap, with a TEST KNOB THAT CAN ONLY LOWER IT — the same clamped shape
 * `READINESS_TTL_MS` uses in Boutik+, and for the same reason: truncation is
 * otherwise observable only by building 41 real confirmed orders, so it went
 * untested and a mutation removing the cap stayed green. Clamped, a typo in
 * the environment can shorten her page but can never raise the ceiling above
 * the subrequest budget.
 */
function feedFanoutMax(env: Env): number {
  const raw = Number((env as { FEED_FANOUT_MAX?: string }).FEED_FANOUT_MAX);
  if (!Number.isInteger(raw) || raw < 1) return MAX_FEED_FANOUT;
  return Math.min(raw, MAX_FEED_FANOUT);
}

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
  /**
   * READINESS-RETURN-1c — the preparation instants, carried ONLY when present
   * and only when they are strings. Absent stays absent: « not yet » is a real
   * state on her screen and must never be filled in with a default.
   */
  const acceptedAt = v['acceptedAt'];
  const readyAt = v['readyAt'];
  return {
    orderId, state, createdAt, resellerNet, productVersionId, zoneTo,
    ...(typeof acceptedAt === 'string' && acceptedAt !== '' ? { acceptedAt } : {}),
    ...(typeof readyAt === 'string' && readyAt !== '' ? { readyAt } : {}),
  };
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

/** SP6.3 — a path segment that is not a decodable id is not an id. Mirrors
 *  `checkout-do.ts`'s own decoder: a lone escape THROWS on `decodeURIComponent`
 *  and an uncaught throw answers 500, which every route in this Worker refuses
 *  to do. A malformed id becomes an honest 404 instead. */
function decodeOrderId(raw: string): string | undefined {
  try {
    const decoded = decodeURIComponent(raw);
    return decoded === '' || decoded.length > 191 ? undefined : decoded;
  } catch {
    return undefined;
  }
}

function dispatchPreflight(methods: 'GET' | 'POST' = 'GET'): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': DISPATCH_CORS_ORIGIN,
      // SP6.3 — the refusal route is a POST on this same door, so the preflight
      // advertises the method the caller is actually about to use. Advertising
      // GET for a POST route is a preflight that passes and a request that then
      // fails in the browser with nothing the console can say about it.
      'Access-Control-Allow-Methods': methods,
      // Authorization: the founder's Bearer — granting the HEADER grants
      // nothing; the route still 401s anything but his key.
      'Access-Control-Allow-Headers': 'Accept, Authorization, Content-Type',
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
