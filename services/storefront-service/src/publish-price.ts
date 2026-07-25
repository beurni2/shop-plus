import { markupCap } from '@shop-plus/reseller-money';
import type { ProductEconomics } from './supply-source.js';

/**
 * PUBLISH-PRICE-1 — THE SERVICE SIGNS THE PRICE. THE APP NEVER DOES.
 *
 * ═══ THE FOUNDER'S RULING, AND THE REASON IT IS THE RIGHT SHAPE ═══
 *
 * The reseller app used to be expected to send `customerPriceFcfa` on the publish
 * command, and the service froze whatever arrived. Two things were wrong with that
 * and the second is the one that decides it:
 *
 *   1. The app would be AUTHORING A SIGNED AMOUNT — a money value that a buyer is
 *      later charged — from a `basePrice` it read at some earlier moment.
 *   2. **A SERVICE CANNOT VALIDATE A PRICE IT DID NOT COMPUTE.** Given only
 *      `{markup, customerPriceFcfa}` there is no check the service can run that
 *      distinguishes an honest client from a wrong one, because the base it would
 *      check against is exactly the thing it was not told.
 *
 * So the app sends THE MARKUP SHE CHOSE and nothing else about money. The service
 * reads the live supply projection through the `OFFER` binding and computes
 * `customerPriceFcfa = basePrice + markup` itself.
 *
 * ═══ SUPPLY UNREACHABLE ⇒ PUBLISH REFUSES (founder ruling, also his words) ═══
 *
 * *"Never sign against a cached, assumed, or app-supplied base. A refusal she can
 * retry is correct; a price signed against a number nobody could read is not."*
 * There is deliberately no fallback branch here — not a cache, not a last-known
 * base, not the value the app happened to send. `economics()` returning `undefined`
 * is a REFUSAL, and it is the only safe direction: the failure mode of guessing is
 * a buyer charged a price nobody authorised.
 *
 * ═══ WHY THE COMMAND STILL CARRIES `customerPriceFcfa` (a real constraint) ═══
 *
 * `PublishListingCommand` keeps the field, and the pure core still carries it
 * verbatim without arithmetic. It could not be removed: `services/attribution-
 * service` is in the FROZEN VAULT (byte-identical, zero diff) and its
 * `premiere-commande-reelle` e2e publishes a listing through the in-memory registry
 * WITH that field. Removing it would have forced an edit to a frozen file.
 *
 * The derivation therefore lives at the HTTP BOUNDARY (`POST /listings`), which is
 * the honest place for it anyway: the boundary is where an untrusted caller exists.
 * **A `customerPriceFcfa` arriving over HTTP is IGNORED** — the derived value
 * always wins, so the app cannot author an amount even by sending one.
 */

export type SignedPrice =
  | {
      readonly status: 'signed';
      /** HER price = productSubtotal = B + M, computed HERE from the live base. */
      readonly customerPriceFcfa: number;
      /** Read from the same live projection — never the app's possibly-stale copy. */
      readonly offerVersion: string;
      /** MONEY-SHAPE-1 — C from the SAME reading that priced the buyer's side, so
       *  the listing can freeze both halves of the artifact against one instant. */
      readonly resellerCommission: number;
    }
  /** Supply could not be read fresh: unconfigured, unreachable, stale, or refused. */
  | { readonly status: 'supply_unavailable' }
  /** The markup is not a usable amount. Shape validation, not policy. */
  | { readonly status: 'markup_invalid' }
  /**
   * MONEY-SHAPE-1 — the markup exceeds the CEILING for this base. `cap` rides along
   * so the refusal can say WHAT the limit was rather than only that one was hit.
   */
  | { readonly status: 'markup_over_cap'; readonly cap: number };

/**
 * Sign HER price from the LIVE base and the markup she chose. Pure and total.
 *
 * ═══ MONEY-SHAPE-1 — THE CEILING IS ENFORCED HERE NOW (founder ruling) ═══
 *
 * It previously was not, and that was a REPORTED GAP rather than an oversight: the
 * rule lived in the app, and duplicating it here would have created a second home for
 * a pricing rule. The founder's ruling resolved the placement instead of the
 * duplication — **`markupCap` is IMPORTED from `@shop-plus/reseller-money`, the one
 * module the app imports too.** A SERVICE THAT SIGNS MUST BOUND: the signing moved
 * here precisely so the app would not author money, and a bound that only the app
 * enforces is a bound any other caller can walk around.
 *
 * ORDER OF CHECKS, and it is deliberate: SHAPE first (is this a usable amount at
 * all), then SUPPLY (can we read the base), then the CEILING — because the ceiling
 * is a function OF the base, so it cannot be evaluated before the base is known.
 */
export function signPrice(economics: ProductEconomics | undefined, markup: unknown): SignedPrice {
  if (typeof markup !== 'number' || !Number.isSafeInteger(markup) || markup < 0) {
    return { status: 'markup_invalid' };
  }
  // NO FALLBACK BRANCH. Absent economics is a refusal, full stop.
  if (economics === undefined) return { status: 'supply_unavailable' };
  // THE CEILING, evaluated against the LIVE base — the same base the price is signed
  // against, so the bound and the amount can never disagree about which B they meant.
  const cap = markupCap(economics.basePrice);
  if (markup > cap) return { status: 'markup_over_cap', cap };
  return {
    status: 'signed',
    customerPriceFcfa: economics.basePrice + markup, // productSubtotal = B + M
    offerVersion: economics.offerVersion,
    resellerCommission: economics.resellerCommission,
  };
}
