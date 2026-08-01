/**
 * THE SUPPLY SOURCE (REAL-PRODUCT-RENDER-1 piece (a)) — where a listing's
 * DISPLAY data comes from. A listing carries `productVersionId`; the product's
 * NAME and IMAGES live on the supply projection (canon v2.0.0
 * `SupplyProjection.productName` / `.assetRefs`). This port is the join's supply
 * side, resolved SERVER-SIDE so supplier economics never leave the Worker.
 *
 * ═══ THE MOCK IS NOT THE FALLBACK (founder ruling — the load-bearing rule) ═══
 *
 * Every other env-gated fallback in this system falls back to something EMPTY:
 * `resolveMediaStore` → in-memory, `resolveStorefrontStore` → in-memory. Empty is
 * safe. A supply port is DIFFERENT: the certified mock is POPULATED — it emits
 * `productName` and `assetRefs` for invented products. A deployed Worker that
 * quietly resolved to the mock would serve FABRICATED product names and
 * FABRICATED image refs to a real buyer on a real shop: the exact
 * mock-wearing-real-infrastructure failure refused for listings, arriving through
 * a door we opened ourselves.
 *
 * So the fallback is ABSENT, never mock:
 *   · configured (the `OFFER` service binding) → the real client;
 *   · NOT configured             → `AbsentSupplySource`, which describes NOTHING.
 *
 * UNREACHABLE BY CONSTRUCTION, NOT BY DISCIPLINE: this module — and the whole
 * deployed composition root — imports NO mock. There is no env value, no flag and
 * no misconfiguration that can reach fabricated supply data, because the code path
 * does not exist in the bundle. Tests inject their own mock through the PORT.
 * `test/supply-source.test.ts` fails if a mock ever becomes reachable from here.
 *
 * ABSENT IS THE DEFAULT TODAY, and that is honest: an unconfigured Worker
 * describes no product — and the buyer surface renders its designed empty/partial
 * state rather than inventing one.
 *
 * ═══ ONE CONSUMER, NOT TWO (SUPPLY-WIRE-1, founder finding) ═══
 *
 * The (a1) cut of this file was a SECOND, hand-rolled client of the same wire and
 * it disagreed with boutik's producer on every axis that matters: it fetched
 * `/supply/{pv}` where the producer serves `/supply-projection/{pv}` (every
 * request would have 404'd); it read `productName`/`assetRefs` straight off the
 * body where the producer NESTS them in the `{version, asOf, value}` envelope; it
 * applied NO freshness bound, which is the entire point of SW-2; and it carried an
 * inline identity regex instead of the certified sweep. A second consumer with
 * weaker validation is exactly how the two halves drifted.
 *
 * So this module no longer parses anything. It performs the ONE thing a Worker
 * must do itself — the async `fetch` — and hands the RAW bytes to the CERTIFIED
 * consumer (`@shop-plus/supply-consumer`): canon envelope schema, the founder's
 * 15-minute freshness bound, and the identity sweep, all in one call. Only a
 * `fresh` verdict describes a product; `stale`, `absent` and `rejected` all block
 * → undescribable → OMITTED. A product described from a STALE projection is worse
 * than a product not described.
 *
 * IMPORT DISCIPLINE: the consumer is imported by SUBPATH (`/consumer`), never by
 * package root — the root re-exports `./mock.js`, and importing it would pull the
 * certified MOCK into the deployed bundle, breaking the unreachable-by-
 * construction property this module exists to hold.
 */

import { consumeSupplyProjection } from '@shop-plus/supply-consumer/consumer';
import type { SellerTrustTier } from '@platform/contracts';

/**
 * THE PRODUCER'S ROUTE, read from boutik's own source, not from memory
 * (`services/offer-service/src/supply-endpoint.ts`: `SUPPLY_ROUTE =
 * /^\/supply-projection\/([^/]+)$/`, GET only — a non-GET is an honest 405).
 * A path mismatch is invisible to every test either side can run alone, so
 * `test/supply-source.test.ts` asserts this constant.
 */
export const SUPPLY_ROUTE_PREFIX = '/supply-projection/';

/** What supply contributes to a buyer-visible product: its name, images, stock
 *  and category. */
export interface ProductDescription {
  readonly productName: string;
  /** Bare display refs (canon `assetRefs`); `[0]` is the hero. May be empty. */
  readonly assetRefs: readonly string[];
  /**
   * CATEGORY-WIRE-1 (canon v3.0.0) — the SUPPLIER'S category, verbatim.
   *
   * REQUIRED here, not optional, and that is deliberate: canon makes it required
   * on `SupplyProjection`, so a `fresh` verdict always has one. Typing it
   * optional would invite a `?? undefined` somewhere downstream and re-open the
   * silent-degradation hole the canon field was made required to close.
   *
   * IT IS DISPLAY DATA, NOT ECONOMICS, so it may ride to the buyer — the same
   * test `productName` and `assetRefs` pass. What it must NEVER become is a
   * value this service INVENTS: it is read from the projection or the product is
   * not described at all.
   */
  readonly category: string;
  /**
   * SELLER-TIER-WIRE-1 (canon v3.1.0) — §6.1's « seller tier ≥ verified », as
   * the PRODUCER states it. OPTIONAL because an offer-service older than v3.1.0
   * sends nothing, and because absence must degrade rather than break: no tier
   * ⇒ §6.1 cannot prove the condition ⇒ Option B refused. Never defaulted here.
   *
   * It is a property of the offer, not an identity — one of three values shared
   * by every supplier in that band — so it carries nothing B4.2 keeps off this
   * wire. It is also the ONLY way Shop+ can answer the condition at all: canon
   * keys `SellerTrustState` by `sellerId`, which this service is designed never
   * to learn.
   */
  readonly sellerTier?: SellerTrustTier;
  /**
   * PUBLISH-PRICE-1 — the supplier's live stock count, carried so the buyer record
   * can state stock TRUTHFULLY. `joinVitrineProduct` used to hardcode `inStock:
   * true`, and `buildSupplyProjection` has no `available > 0` guard, so a
   * zero-stock offer became an in-stock buyer tile. Stock is not economics: this
   * field says how many exist, never what they cost.
   */
  readonly available: number;
}

/**
 * PUBLISH-PRICE-1 — what supply contributes to a PUBLISH DECISION: the base the
 * price is signed against, and the offer version it belongs to.
 *
 * DELIBERATELY A SEPARATE SHAPE FROM `ProductDescription`, not a widening of it.
 * The description port's guarantee is that it carries NO economics — that is what
 * makes it safe to feed the buyer projection — and merging `basePrice` into it
 * would destroy exactly that property. Two shapes, two purposes: one may reach a
 * buyer record, the other may only reach a signing decision inside this Worker.
 */
export interface ProductEconomics {
  readonly basePrice: number;
  readonly offerVersion: string;
  /** MONEY-SHAPE-1 — C, so the listing can FREEZE her side of the money shape at the
   *  same instant it freezes the buyer's. Read from the same fresh projection. */
  readonly resellerCommission: number;
}

/**
 * AUTO-HIDE-WATCH-1 — the PRESENCE verdict, the watcher's instrument.
 *
 * `describe()` deliberately collapses every non-fresh outcome into `undefined`,
 * which is right for RENDERING (omit, never invent) and useless as EVIDENCE:
 * « the wire hiccuped » and « the offer no longer exists » look identical. The
 * founder's law — AN ABSENCE IS ONLY EVIDENCE IF THE INSTRUMENT COULD HAVE SEEN
 * THE PRESENCE — demands a reading that separates them, because auto-hiding a
 * listing on a network blip would hide every shop in Ouaga each time the supply
 * service restarts.
 *
 *   · `present` — a fresh projection described the offer. The description rides
 *     along so the caller never fetches twice.
 *   · `gone`    — the PRODUCER ANSWERED and positively denied the offer
 *     (404 `unknown_product_version`, read from boutik's own source). The
 *     instrument saw where the presence would be and it was not there. THIS is
 *     evidence a listing may act on.
 *   · `unknown` — everything else: unreachable, 5xx, unparseable, STALE, and the
 *     producer's 409 `unavailable` (an extant offer refusing service — possibly
 *     transient moderation, and `decideAutoHide` is one-way, so hiding on it
 *     would strand her listing behind a state that may clear itself). NO
 *     EVIDENCE — the caller may omit from a render, never hide.
 */
export type SupplyPresence =
  | { readonly kind: 'present'; readonly description: ProductDescription }
  | { readonly kind: 'gone' }
  | { readonly kind: 'unknown' };

/** The join's supply side. `undefined` = this product cannot be described. */
export interface SupplySourcePort {
  describe(productVersionId: string): Promise<ProductDescription | undefined>;
  /** AUTO-HIDE-WATCH-1 — presence with evidence semantics (see `SupplyPresence`). */
  presence(productVersionId: string): Promise<SupplyPresence>;
  /**
   * PUBLISH-PRICE-1 (founder ruling) — the live base for a signing decision.
   * `undefined` ⇒ **PUBLISH REFUSES**. Never a cached, assumed or app-supplied
   * base: *"a refusal she can retry is correct; a price signed against a number
   * nobody could read is not."* `AbsentSupplySource` returns `undefined` here by
   * construction, so an unconfigured Worker cannot sign a price at all.
   */
  economics(productVersionId: string): Promise<ProductEconomics | undefined>;
}

/**
 * BROWSE-SUPPLY-BINDING-1 — the wire is now a SERVICE BINDING, not a public URL.
 *
 * WHY (a real day-long fault, not a preference): `SUPPLY_BASE` was a write-only
 * Worker secret. When the supply read failed `unreachable · 404` THREE TIMES across
 * three founder re-sets — including a typed one — nobody could read back what the
 * secret held, and a wrong value was indistinguishable from Cloudflare's standing
 * same-zone restriction (error 1042: a Worker cannot `fetch` another Worker on the
 * same workers.dev zone). Critically, this hop had NEVER succeeded — every green
 * probe came from a laptop. The binding is the platform's own mechanism for
 * Worker-to-Worker in one account: no network hop, no public URL, no 1042 class at
 * all — and the configuration becomes READABLE: the binding name lives in
 * wrangler.toml, versioned and reviewable, where a secret was inspectable by nobody.
 * `SUPPLY_BASE` stops existing as a failure point.
 *
 * The seam philosophy survives intact: resolve on the BINDING's presence —
 * `env.OFFER` present ⇒ the real source, absent ⇒ `AbsentSupplySource` — the same
 * honest-null discipline, with presence now visible in config rather than hidden
 * in a secret.
 */
export interface SupplyFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface SupplySourceEnv {
  /** The offer-service SERVICE BINDING (`[[services]]` in wrangler.toml). */
  readonly OFFER?: SupplyFetcher;
  /**
   * SUPPLY-WIRE-AUTH-1 (founder ruling) — the SERVICE-TO-SERVICE credential this
   * Worker presents to boutik's supply read, as `Authorization: Bearer`.
   *
   * IT IS A DIFFERENT KIND OF THING FROM THE APP WRITE KEY, and the two must never
   * be conflated or reused: the write key SHIPS INSIDE AN APP BUNDLE, readable by
   * anyone who downloads it, so it stops scanners rather than attackers and is not
   * a real credential. This secret NEVER LEAVES TWO WORKERS, so it is one. Set by
   * `wrangler secret put` on both sides — never in `[vars]`, never in a repo,
   * never quoted in a report. PER-CALLER, not one platform secret: rotating one
   * caller cannot break the others, and a leak names its source (the eligibility
   * wire instantiates the same shape with its own).
   */
  readonly SUPPLY_READ_SECRET?: string;
}

/**
 * ABSENT — describes nothing, ever. The honest state when no supply source is
 * configured: the service knows a listing exists and knows HER price, but cannot
 * say what the product IS, so it says nothing rather than something invented.
 */
export class AbsentSupplySource implements SupplySourcePort {
  async describe(): Promise<undefined> {
    return undefined;
  }

  /** An absent instrument can never see presence, so its absence is never
   * evidence: ALWAYS `unknown`, NEVER `gone`. An unconfigured Worker must be
   * incapable of hiding a listing, the same way it is incapable of signing. */
  async presence(): Promise<SupplyPresence> {
    return { kind: 'unknown' };
  }

  /** No source ⇒ no base ⇒ no signature. Publish refuses, by construction. */
  async economics(): Promise<undefined> {
    return undefined;
  }
}

/**
 * The REAL client. A non-2xx, a network failure, or a payload that is not
 * description-shaped all resolve to `undefined` — the SAME honest absence, never
 * a throw up the read path and never a partially-invented product.
 */
export class BoundSupplySource implements SupplySourcePort {
  private readonly readSecret: string | undefined;
  // BROWSE-SUPPLY-BINDING-1 — the fetcher IS the service binding (`env.OFFER`).
  // The request's hostname is a placeholder: a binding routes by PATH to the bound
  // Worker regardless of origin, so no public URL exists to mistype, and the
  // same-zone fetch restriction (1042) cannot apply.
  constructor(private readonly fetcher: SupplyFetcher, readSecret?: string) {
    this.readSecret = readSecret !== undefined && readSecret !== '' ? readSecret : undefined;
  }

  /**
   * SUPPLY-WIRE-AUTH-1 — SHOP SENDS FIRST, boutik gates second (founder
   * sequencing). The wire carries no traffic yet, so a header at an ungated
   * producer is harmless, while gating before the caller sends would open a 401
   * window. So the header is ENV-GATED: an absent secret means NO HEADER, never a
   * broken request — this Worker keeps working against today's open producer and
   * starts authenticating the moment the secret is set, with no code change and no
   * gap between the lanes.
   *
   * BONUS THE FOUNDER SURFACED, worth keeping: Cloudflare's cache automatically
   * BYPASSES any request carrying an `Authorization` header. The supply projection
   * must never be cached — a cached copy would hand back stale-but-honest truth
   * while fresh truth existed, and the consumer would correctly refuse to act on
   * it. Choosing Bearer makes no-cache a PLATFORM PROPERTY rather than a
   * discipline anyone has to remember.
   */
  private headers(): Record<string, string> {
    return {
      Accept: 'application/json',
      ...(this.readSecret !== undefined ? { Authorization: `Bearer ${this.readSecret}` } : {}),
    };
  }

  /**
   * ONE FETCH, ONE CONSUME, TWO READERS. `describe` and `economics` ask the same
   * producer route the same question and differ only in which fields they take off
   * the answer — so the fetch and the certified-consumer call live here ONCE.
   * A second copy is how the two halves of this wire drifted the last time
   * (SUPPLY-WIRE-1); it is not repeated for a second reason.
   *
   * `undefined` covers every non-`fresh` outcome identically: unreachable, non-2xx,
   * unparseable, stale, absent, or identity-rejected. Callers decide what absence
   * MEANS — the buyer join omits the product; publish refuses to sign.
   */
  private async fresh(
    productVersionId: string,
  ): Promise<{ verdict: 'fresh'; projection: SupplyProjectionValue } | { verdict: 'gone' } | { verdict: 'unknown' }> {
    let res: Response;
    try {
      res = await this.fetcher.fetch(
        new Request(`https://offer${SUPPLY_ROUTE_PREFIX}${encodeURIComponent(productVersionId)}`, {
          method: 'GET', // the producer answers 405 to anything else
          headers: this.headers(),
        }),
      );
    } catch {
      return { verdict: 'unknown' }; // unreachable → absent, never fabricated
    }
    // The producer's honest refusals are ABSENCE for a RENDER either way, but they
    // differ as EVIDENCE (AUTO-HIDE-WATCH-1): 404 `unknown_product_version` is the
    // producer positively denying the offer — `gone`; 409 `unavailable` (the
    // refusal ladder) is an EXTANT offer refusing service — no evidence, like any
    // other non-2xx.
    //
    // THE STATUS CODE ALONE IS NOT THE DENIAL — the BODY is verified (verifier
    // finding, accepted): boutik's fallback 404 (`{service, status:'not_found'}`,
    // health.ts) answers any UNMATCHED path with the same code and NO `reason`,
    // while the route's real denial carries `reason:'unknown_product_version'`
    // (supply-endpoint.ts:154). A cross-repo route drift — which this wire has
    // lived once (SUPPLY-WIRE-1) — would otherwise turn every read into a 404
    // and every 404 into a ONE-WAY mass hide. Cheap insurance, proportional to
    // the irreversibility: no `reason`, no evidence.
    if (res.status === 404) {
      const body = (await res.json().catch(() => null)) as { reason?: string } | null;
      return body?.reason === 'unknown_product_version' ? { verdict: 'gone' } : { verdict: 'unknown' };
    }
    if (!res.ok) return { verdict: 'unknown' };
    const raw: unknown = await res.json().catch(() => null);
    if (raw === null) return { verdict: 'unknown' };

    // THE CERTIFIED CONSUMER DOES THE PARSING — envelope schema, freshness bound,
    // identity sweep. Its port is deliberately SYNCHRONOUS (it consumes bytes, it
    // does not fetch), so the already-fetched payload is handed through a trivial
    // port — the same shape its own tests use. Nothing is re-implemented here.
    const verdict = consumeSupplyProjection({ readProjection: () => raw }, productVersionId, new Date().toISOString());
    // fresh ALONE describes. stale · absent · rejected all BLOCK: a product
    // described from a stale projection is worse than one not described (SW-2) —
    // and none of them is evidence of a lapse (a 200 answered; the offer exists).
    if (verdict.status !== 'fresh') return { verdict: 'unknown' };
    return { verdict: 'fresh', projection: verdict.projection };
  }

  async describe(productVersionId: string): Promise<ProductDescription | undefined> {
    const r = await this.fresh(productVersionId);
    if (r.verdict !== 'fresh') return undefined;
    const p = r.projection;
    return { productName: p.productName, assetRefs: [...p.assetRefs], available: p.available, category: p.category, ...(p.sellerTier !== undefined ? { sellerTier: p.sellerTier } : {}) };
  }

  /** AUTO-HIDE-WATCH-1 — the same one fetch, surfaced with evidence semantics. */
  async presence(productVersionId: string): Promise<SupplyPresence> {
    const r = await this.fresh(productVersionId);
    if (r.verdict === 'gone') return { kind: 'gone' };
    if (r.verdict !== 'fresh') return { kind: 'unknown' };
    const p = r.projection;
    return {
      kind: 'present',
      description: { productName: p.productName, assetRefs: [...p.assetRefs], available: p.available, category: p.category, ...(p.sellerTier !== undefined ? { sellerTier: p.sellerTier } : {}) },
    };
  }

  /**
   * PUBLISH-PRICE-1 — the live base, read at the moment of signing. It goes through
   * the SAME freshness bound as everything else on this wire, which is the point:
   * a price signed against a 20-minute-old base is the drift « le prix reste signé »
   * exists to prevent, so a stale projection refuses the publish rather than
   * quietly signing against it.
   */
  async economics(productVersionId: string): Promise<ProductEconomics | undefined> {
    const r = await this.fresh(productVersionId);
    if (r.verdict !== 'fresh') return undefined;
    const p = r.projection;
    return { basePrice: p.basePrice, offerVersion: p.offerVersion, resellerCommission: p.resellerCommission };
  }
}

/** The fields this module reads off a `fresh` verdict — the certified consumer owns
 *  the shape; this names only what is consumed, so an unused canon field cannot
 *  silently become a dependency here. */
interface SupplyProjectionValue {
  readonly productName: string;
  readonly assetRefs: readonly string[];
  readonly available: number;
  /** CATEGORY-WIRE-1 — canon v3.0.0, required on the projection. */
  readonly category: string;
  /**
   * SELLER-TIER-WIRE-1 — canon v3.1.0, OPTIONAL on the projection.
   *
   * `| undefined` EXPLICITLY, because this names what the CERTIFIED CONSUMER
   * hands back and the canon schema's `.optional()` yields a present-but-
   * `undefined` property. `ProductDescription.sellerTier` is deliberately NOT
   * widened the same way: there the field is either ABSENT or a real tier, which
   * is what makes `supply.sellerTier ?? ''` in `checkout-core.ts` a fail-closed
   * read rather than a silent default.
   */
  readonly sellerTier?: SellerTrustTier | undefined;
  readonly basePrice: number;
  readonly offerVersion: string;
  readonly resellerCommission: number;
}

/**
 * Pick the supply source from the environment. Configured ⇒ the real client;
 * otherwise ABSENT. There is deliberately NO third branch: the mock is not
 * reachable from here, by construction.
 */
export function resolveSupplySource(env?: SupplySourceEnv): SupplySourcePort {
  const fetcher = env?.OFFER;
  return fetcher !== undefined && typeof fetcher.fetch === 'function'
    ? new BoundSupplySource(fetcher, env?.SUPPLY_READ_SECRET)
    : new AbsentSupplySource();
}
