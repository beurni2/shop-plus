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
 *   · configured (`SUPPLY_BASE`) → the real HTTP client;
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

/**
 * THE PRODUCER'S ROUTE, read from boutik's own source, not from memory
 * (`services/offer-service/src/supply-endpoint.ts`: `SUPPLY_ROUTE =
 * /^\/supply-projection\/([^/]+)$/`, GET only — a non-GET is an honest 405).
 * A path mismatch is invisible to every test either side can run alone, so
 * `test/supply-source.test.ts` asserts this constant.
 */
export const SUPPLY_ROUTE_PREFIX = '/supply-projection/';

/** What supply contributes to a buyer-visible product: its name and its images. */
export interface ProductDescription {
  readonly productName: string;
  /** Bare display refs (canon `assetRefs`); `[0]` is the hero. May be empty. */
  readonly assetRefs: readonly string[];
}

/** The join's supply side. `undefined` = this product cannot be described. */
export interface SupplySourcePort {
  describe(productVersionId: string): Promise<ProductDescription | undefined>;
}

/** Configured out-of-band; absent in CI and absent today (no supply wire exists). */
export interface SupplySourceEnv {
  readonly SUPPLY_BASE?: string;
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
}

/**
 * The REAL client. A non-2xx, a network failure, or a payload that is not
 * description-shaped all resolve to `undefined` — the SAME honest absence, never
 * a throw up the read path and never a partially-invented product.
 */
export class HttpSupplySource implements SupplySourcePort {
  private readonly base: string;
  private readonly readSecret: string | undefined;
  constructor(base: string, readSecret?: string) {
    this.base = base.replace(/\/+$/, '');
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

  async describe(productVersionId: string): Promise<ProductDescription | undefined> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${SUPPLY_ROUTE_PREFIX}${encodeURIComponent(productVersionId)}`, {
        method: 'GET', // the producer answers 405 to anything else
        headers: this.headers(),
      });
    } catch {
      return undefined; // unreachable → absent, never fabricated
    }
    // The producer's honest refusals (404 unknown_product_version · 409
    // unavailable, the projection refusal ladder) are ABSENCE here, not errors:
    // the product is simply undescribable, and the join omits it.
    if (!res.ok) return undefined;
    const raw: unknown = await res.json().catch(() => null);
    if (raw === null) return undefined;

    // THE CERTIFIED CONSUMER DOES THE PARSING — envelope schema, freshness bound,
    // identity sweep. Its port is deliberately SYNCHRONOUS (it consumes bytes, it
    // does not fetch), so the already-fetched payload is handed through a trivial
    // port — the same shape its own tests use. Nothing is re-implemented here.
    const verdict = consumeSupplyProjection({ readProjection: () => raw }, productVersionId, new Date().toISOString());
    // fresh ALONE describes. stale · absent · rejected all BLOCK: a product
    // described from a stale projection is worse than one not described (SW-2).
    if (verdict.status !== 'fresh') return undefined;
    return { productName: verdict.projection.productName, assetRefs: [...verdict.projection.assetRefs] };
  }
}

/**
 * Pick the supply source from the environment. Configured ⇒ the real client;
 * otherwise ABSENT. There is deliberately NO third branch: the mock is not
 * reachable from here, by construction.
 */
export function resolveSupplySource(env?: SupplySourceEnv): SupplySourcePort {
  const base = env?.SUPPLY_BASE;
  return base !== undefined && base !== ''
    ? new HttpSupplySource(base, env?.SUPPLY_READ_SECRET)
    : new AbsentSupplySource();
}
