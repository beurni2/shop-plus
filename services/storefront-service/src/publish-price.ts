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
    }
  /** Supply could not be read fresh: unconfigured, unreachable, stale, or refused. */
  | { readonly status: 'supply_unavailable' }
  /** The markup is not a usable amount. Shape validation, not policy. */
  | { readonly status: 'markup_invalid' };

/**
 * Sign HER price from the LIVE base and the markup she chose. Pure and total.
 *
 * MARKUP VALIDATION IS SHAPE ONLY — a non-negative safe integer. The markup
 * CEILING (`markupCap`, the pilot-tuned 100 %-of-base rule) is enforced in the
 * reseller app's slider and is NOT re-enforced here. That is a REPORTED GAP, not an
 * oversight: putting the cap here would give a canon-adjacent pricing rule a second
 * home in a second repo, and where that rule should live is the founder's call. It
 * is journaled and reported rather than decided unilaterally.
 */
export function signPrice(economics: ProductEconomics | undefined, markup: unknown): SignedPrice {
  if (typeof markup !== 'number' || !Number.isSafeInteger(markup) || markup < 0) {
    return { status: 'markup_invalid' };
  }
  // NO FALLBACK BRANCH. Absent economics is a refusal, full stop.
  if (economics === undefined) return { status: 'supply_unavailable' };
  return {
    status: 'signed',
    customerPriceFcfa: economics.basePrice + markup, // productSubtotal = B + M
    offerVersion: economics.offerVersion,
  };
}
