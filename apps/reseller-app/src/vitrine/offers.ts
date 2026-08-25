/**
 * BROWSE-SUPPLY-1 — the reseller's LIVE offer feed, replacing the frozen demo seed.
 *
 * ═══ THE DEMO OPPORTUNITIES ARE GONE, NOT FILTERED (founder ruling) ═══
 *
 * Opportunités showed seven seeded products, each suffixed « (démo) ». They do not
 * move behind a flag and they are not a fallback: if the wire is unconfigured or
 * fails, the screen shows NOTHING and says so honestly. The founder's reasoning is
 * the sharpest version of the populated-fallback argument in this project:
 * « (démo) » is a LABEL A RESELLER WOULD LEARN TO IGNORE rather than a state she
 * would notice — so a demo fallback here is worse than most, not better.
 *
 * ═══ THROUGH STOREFRONT-SERVICE, NEVER DIRECT TO BOUTIK ═══
 *
 * The supply hop lives entirely server-side and is never readable from a phone: the
 * Worker reaches boutik through a SERVICE BINDING (`env.OFFER`, declared in
 * `wrangler.toml`) and presents `SUPPLY_READ_SECRET`, a Worker secret. `SUPPLY_BASE`
 * NO LONGER EXISTS — it was removed in BROWSE-SUPPLY-BINDING-1, after a
 * write-only secret nobody could read back burned three founder round-trips.
 * Calling boutik directly would need boutik credentials inside the EAS
 * bundle — extending a weakness accepted once for the write key. So this asks the
 * Worker, which holds the service-to-service bearer, and sends the SAME
 * `X-Write-Key` the app already holds (founder ruling: a second bundled secret buys
 * separation of concerns and zero protection, since both are readable by anyone who
 * extracts the bundle).
 *
 * RN-safe: no `@platform/*` runtime import (Metro law). The shape is mirrored here
 * and the SERVICE is what validates — every offer this receives has already been
 * through the certified consumer, the 15-minute freshness bound and the identity
 * sweep, server-side.
 */

import { WRITE_KEY_HEADER } from './service';

/** One offer as the browse card needs it. Mirrors the service's `SupplyOffer`. */
export interface Offer {
  readonly productVersionId: string;
  readonly offerVersion: string;
  readonly basePrice: number;
  readonly resellerCommission: number;
  readonly available: number;
  readonly productName: string;
  readonly assetRefs: readonly string[];
  /**
   * CATEGORIES-OPPORTUNITES-1 — the service has sent this since
   * CATEGORY-WIRE-1 (WHAT is sold, never WHO sells it) and this mirror
   * dropped it. OPTIONAL, defensively: an older service omits it, and the
   * chips row simply does not build from what is not there.
   */
  readonly category?: string;
  /**
   * VIDEO-PARTOUT (founder order 2026-08-03) — the ≤ 6 s clip's ABSOLUTE url,
   * absolutized by the wire through the same base as `assetRefs`. Optional:
   * most products have none, and an older service sends nothing. Display data
   * only, exactly like the photographs — it carries nothing about WHO supplies.
   */
  readonly videoRef?: string;
}

/**
 * What the screen renders. `offers` empty with `ok` is the honest « nothing
 * published yet »; every failure is ALSO an empty list, because the reseller sees an
 * honest empty state and never a diagnosis — the WHY is operator-facing and lives on
 * the service's `diagnostic`, which this deliberately does not surface to her.
 */
export type OfferFeed =
  | { readonly status: 'ok'; readonly offers: readonly Offer[] }
  | { readonly status: 'unconfigured' }
  | { readonly status: 'unavailable' };

export interface OfferSourcePort {
  list(): Promise<OfferFeed>;
}

/** The route the Worker serves — PLURAL, and the app must not prefix-match it either. */
export const OFFERS_ROUTE = '/supply-projections';

export class HttpOfferSource implements OfferSourcePort {
  private readonly base: string;
  constructor(base: string, private readonly writeKey: string) {
    this.base = base.replace(/\/+$/, '');
  }

  async list(): Promise<OfferFeed> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${OFFERS_ROUTE}`, {
        method: 'GET',
        headers: { [WRITE_KEY_HEADER]: this.writeKey, Accept: 'application/json' },
      });
    } catch {
      return { status: 'unavailable' }; // offline or unreachable — never invented products
    }
    if (!res.ok) return { status: 'unavailable' };
    const body = (await res.json().catch(() => null)) as { offers?: unknown } | null;
    if (body === null || !Array.isArray(body.offers)) return { status: 'unavailable' };
    return { status: 'ok', offers: body.offers as readonly Offer[] };
  }
}

/**
 * Resolve the offer source. `null` when the app is not connected — the SAME
 * env-gating and the same honest-null discipline as `resolveStorefrontService`
 * (RESELLER-SEAM-HONESTY-1). There is deliberately NO demo branch: a populated
 * fallback on a browse surface is the hazard this slice removes.
 */
export function resolveOfferSource(): OfferSourcePort | null {
  const base = process.env.EXPO_PUBLIC_STOREFRONT_BASE;
  const key = process.env.EXPO_PUBLIC_STOREFRONT_WRITE_KEY;
  if (base && key) return new HttpOfferSource(base, key);
  return null;
}
