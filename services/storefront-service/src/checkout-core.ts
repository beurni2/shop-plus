import { QuoteSchema, type DeliveryFeeQuote, type Quote } from '@platform/contracts';
import {
  ELIGIBILITE_SANS_HISTORIQUE,
  ImmutableQuoteStore,
  decideReservation,
  issueQuote,
  type PayAtDoorPolicy,
  type QuoteIssuanceDeps,
  type QuoteIssuanceRefusal,
  type ReservationDecision,
  type ReservationState,
  type ReserveCommand,
} from '@shop-plus/commerce-core';
import { LISTING_PUBLISHED, type ListingEntry } from './listing-core.js';
// SELLER-TIER-WIRE-1 — the §6.1 gate's two facts (`sellerTier`, `category`) are
// read off the SUPPLY DESCRIPTION the service resolves server-side, never off the
// buyer's request body. This type import is the seam that makes that structural.
import type { ProductDescription } from './supply-source.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHECKOUT & ORDER — THE DECISION CORE (SP3.2a). Pure, total, no I/O.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══ ITS OWN DOMAIN, LIVING BESIDE STOREFRONT & ATTRIBUTION ═══
 *
 * Build Spec §5 lists « Checkout&Order (immutable Quote, Order) » as a domain of
 * its own, and the domains are « Ownership boundaries, co-deployable; no app
 * writes another domain's truth. » This module is therefore a NEIGHBOUR of the
 * storefront code in this repo, never a part of it: it shares NO module state
 * with `storefront-core.ts` / `listing-core.ts`, keeps its own namespace, and
 * READS the storefront domain's records only as values passed in by its caller.
 * Splitting it into its own Worker later is a move, not a rewrite.
 *
 * ═══ THE MONEY LAW OF THIS FILE, IN ONE SENTENCE ═══
 *
 * Nothing here computes an amount. `issueQuote` (FROZEN VAULT,
 * `packages/commerce-core`) is the only issuer, `computeWaterfall` behind it the
 * only arithmetic, and every input B/C/M it is given is READ VERBATIM off frozen
 * stored fields. This module's whole job is to decide whether a quote may exist
 * at all — and to REFUSE, by name, when it may not.
 *
 * ═══ EVERY FAILURE IS A NAMED REFUSAL, AND A REFUSAL IS NEVER A REPAIR ═══
 *
 * There is no rounding, no defaulting, no « best effort » branch anywhere below.
 * A missing commission is not a zero; an unknown zone is not a free delivery; a
 * stored price that does not decompose into whole francs is not nudged into one.
 * Each is its own refusal with its own name, because the buyer's screen (SP3.2b)
 * has to say a different true thing for each.
 *
 * ═══ WHAT THIS FILE DELIBERATELY DOES NOT DECIDE ═══
 *
 *  · The kill switch, the payment mode and the §6.1 pay-at-door gate belong to
 *    `issueQuote` and are NOT re-decided here — their refusals pass through
 *    verbatim. One consequence, stated rather than hidden: because `issueQuote`
 *    runs LAST, a request that is both mis-shaped and arriving while checkout is
 *    killed answers with the local refusal, not `checkout_killed`. Nothing
 *    proceeds in either case; only the name the buyer is told differs.
 *  · Payment, legs, capture, the order spine — SP3.3, absent here on purpose.
 */

/* ─────────────────────────────── the request ─────────────────────────────── */

/**
 * The §6.1 pay-at-door inputs a caller may carry. NO `policy` FIELD EXISTS ON
 * THIS SHAPE — the versioned policy is server-side (see `CheckoutDeps`), so a
 * caller cannot loosen the gate it is being measured against.
 *
 * ═══ THE HISTORY OF THIS SHAPE, BECAUSE IT SHRANK FOR A REASON ═══
 *
 * It once carried `sellerTier` and `category` too, and for a while that was
 * harmless for exactly one reason: `PAY_AT_DOOR_POLICY_DEFAULTS` shipped an
 * EMPTY `networkReliableZones` allowlist, so the gate refused every pay-at-door
 * request whatever this context claimed. This comment then warned: « The day the
 * founder names one reliable zone, that mitigation is gone and these three
 * values must come from a server authority, never from the wire. »
 *
 * The founder opened every zone on 2026-08-01 (« open to every buyer who want
 * that option ») and the mitigation went with it — for a period during which
 * THREE of the five §6.1 conditions were answered by the party they exist to
 * constrain. **That period is over for two of the three (SELLER-TIER-WIRE-1).**
 *
 * WHERE EACH CONDITION IS DECIDED NOW — ALL FIVE ON THE SERVER:
 *  · `sellerTier` — SERVER. Canon v3.1.0 added it to `SupplyProjection`, so
 *    Boutik+ answers the question on the wire it already publishes — a
 *    three-value band carrying no supplier identity, which is what let it cross
 *    B4.2 at all. Read here from `IssueQuoteInput.supply`.
 *  · `category` — SERVER. Canon v3.0.0, REQUIRED on the projection. Same source.
 *  · `eligibility` — SERVER, as of OPTION-B-REACHABLE-1. It was the last
 *    self-declared §6.1 input; this shape no longer exists and the field is
 *    refused as an `unknown_field` if sent. `ELIGIBILITE_SANS_HISTORIQUE` (in
 *    `pay-at-door-policy.ts`) supplies the baseline until SP6.3 builds the §6.4
 *    ladder book — with the ⏳ cost written out there in full: no buyer can be
 *    RESTRICTED yet, because nothing records a refusal.
 *  · price cap · zone — never on this shape; the vault computes the first from
 *    the pinned waterfall and the founder opened the second.
 *
 * WHAT HAS ALWAYS HELD: Law #3 is untouched. The product is never handed over on
 * any profile, self-declared or not — custody transfers only after the door leg
 * is PROVIDER-confirmed (`revelationPermise`, `order-core.ts` `decideDoorCharge`).
 */

/**
 * THE ONLY THING A CALLER MAY SEND.
 *
 * ═══ THERE IS NO AMOUNT FIELD ON THIS SHAPE, AND THAT IS THE POINT ═══
 *
 * `publish-price.ts` states the law for the reseller side (PUBLISH-PRICE-1): the
 * SERVICE signs the price, the app never does, because « a service cannot
 * validate a price it did not compute ». This is the same law applied to the
 * BUYER side, one step stronger. There is no `buyerTotal`, no `productSubtotal`,
 * no `deliveryFee`, not even a « for display » copy of one: a price the buyer
 * names is UNREPRESENTABLE here, not merely rejected. A field that does not
 * exist cannot be trusted by mistake in some future branch.
 *
 * `pid` IS THE PRODUCT VERSION, NEVER A LISTING ID (founder standing law, the
 * same one `customer-projection.ts` enforces on the vitrine wire): listing ids
 * stay off the buyer wire so they never become enumerable.
 */
export interface QuoteRequest {
  /** Her shop's public slug — the only handle a buyer has on a storefront. */
  readonly slug: string;
  /** productVersionId. NEVER a listing id. */
  readonly pid: string;
  /** Validated by the vault, not here: an unknown mode refuses `payment_mode_unknown`. */
  readonly paymentMode: string;
  /** Delivery destination — priced by the delivery source, never by the caller. */
  readonly zoneTo: string;
  /** The LOCKED reseller (SP-I09). Absent ⇒ refusal; it never defaults to anyone. */
  readonly attributionResellerId: string;
  /** The buyer's own idempotency token: one key ⇒ at most one quote, forever. */
  readonly requestKey: string;
  /* OPTION-B-REACHABLE-1 — there is NO `payAtDoorContext` here any more. Every
     §6.1 input is now a server truth (see the block above), so the door mode is
     requested by `paymentMode` alone and answered entirely from facts the buyer
     cannot write. The router refuses the old field by name rather than ignoring
     it, so a stale client learns that the server stopped asking. */
}

/**
 * The request PLUS the AUTHORITY-READ values the caller resolved server-side.
 * `entry` is the frozen `ListingEntry` (or `undefined` when nothing resolves);
 * `delivery` is the `DeliveryFeeQuote` from the delivery source. Both are
 * SERVER truths handed in as values — this module performs no I/O and therefore
 * cannot be tricked into reading a live supplier price at quote time.
 */
export interface IssueQuoteInput {
  readonly request: QuoteRequest;
  readonly entry: ListingEntry | undefined;
  /**
   * SELLER-TIER-WIRE-1 — the supply projection behind this listing, resolved
   * SERVER-SIDE by the caller exactly as `entry` and `delivery` are. It is the
   * source of §6.1's « seller tier ≥ verified » and « category inspectable ».
   *
   * `undefined` is a first-class answer and means « supply could not be
   * described »: unconfigured binding, unreachable producer, STALE projection,
   * or a producer older than canon v3.0.0. In every one of those states §6.1
   * cannot prove its conditions, so Option B refuses — FULL_PREPAY is
   * untouched, because a supply hiccup must never break ordinary checkout.
   */
  readonly supply?: ProductDescription | undefined;
  /**
   * `undefined` is a first-class answer here and means « Séra could not price
   * this »: no zone pair, no shop to start from, no reachable service. It lands
   * on the SAME `delivery_not_serviceable` refusal an unserviceable zone gets,
   * because from a buyer's side those are one situation, and neither is a fee.
   */
  readonly delivery: DeliveryFeeQuote | undefined;
}

/**
 * The vault's issuance deps, plus the versioned §6.1 policy — SERVER-SIDE ONLY.
 * It is on the DEPS and not on the request precisely so the wire cannot reach
 * it; omitted, the vault applies `PAY_AT_DOOR_POLICY_DEFAULTS` (the conservative
 * values). The Worker never sets it; tests set it to exercise the door split.
 */
export interface CheckoutDeps extends QuoteIssuanceDeps {
  readonly payAtDoorPolicy?: PayAtDoorPolicy;
}

/* ────────────────────────────── the refusals ─────────────────────────────── */

/**
 * The refusals THIS module decides, before any quote can exist. Each is its own
 * name because each needs a different true sentence on the buyer's screen.
 *
 * `stored_amounts_incoherent` is the one refusal not named in the work order,
 * and it is here because the function must be TOTAL: `computeWaterfall` THROWS a
 * `RangeError` on a non-integer or negative amount, and `issueQuote` does not
 * catch it. Without this check a corrupted stored entry (a markup above the
 * signed price, say) would leave the money path as an unhandled exception
 * instead of a refusal. A wrong price must be a refusal, never a crash and never
 * a rounded-off success.
 */
export type CheckoutRefusalReason =
  | 'attribution_missing'
  | 'attribution_mismatch'
  | 'quote_not_issuable'
  | 'listing_unknown'
  | 'listing_not_live'
  | 'out_of_stock'
  | 'commission_not_frozen'
  | 'stored_amounts_incoherent'
  | 'delivery_not_serviceable';

export type IssueQuoteOutcome =
  | { readonly ok: true; readonly quote: Quote; readonly canonicalBytes: string }
  | { readonly ok: false; readonly reason: CheckoutRefusalReason }
  /** The vault's own refusals, passed through verbatim (ops detail included). */
  | QuoteIssuanceRefusal;

/** An amount is usable only if it is a whole, non-negative, safe integer of francs. */
function usableFcfa(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/* ─────────────────────────────── the decision ────────────────────────────── */

/**
 * DECIDE WHETHER A QUOTE MAY EXIST, AND IF SO ISSUE IT THROUGH THE VAULT.
 *
 * ═══ WHERE B, C AND M COME FROM — ALL THREE FROZEN, NONE LIVE ═══
 *
 *   M = entry.listing.markup              — HER markup, frozen at publish.
 *   C = entry.resellerCommission          — MONEY-SHAPE-1: C frozen at publish.
 *   B = entry.customerPriceFcfa − M       — by SUBTRACTION from the two frozen
 *                                            halves of the signed artifact.
 *
 * B is derived and not read because nothing stores B: `listing-core.ts` signs
 * `customerPriceFcfa` (= B + M) and `markup` (= M) at publish, and
 * `publish-price.ts` computed the first as `basePrice + markup`. Subtracting
 * recovers exactly the base that was signed — not the base that is live now.
 * That distinction is the whole point: « le prix reste signé ». A live supply
 * read at quote time would let a supplier's price change reprice a buyer
 * mid-checkout, and there is deliberately no code path here that could do it —
 * this function is given no supply source and no fetcher, so the TYPE forbids
 * it rather than a convention.
 *
 * ═══ ORDER OF CHECKS, AND WHY IT IS THIS ORDER ═══
 *
 *  1. ATTRIBUTION — the CI gate is « every order has a locked `reseller_id`,
 *     none defaults to supplier/platform ». Checked first because a quote with
 *     nobody attributed must never be built even far enough to be priced.
 *  2. THE LISTING — unknown, then not live, then the pid must actually be the
 *     one this listing sells. All three before money is touched.
 *  3. HER COMMISSION — absent C means HER NET IS UNKNOWN. The refusal is the
 *     honest answer: `netForListing` returns `undefined` for exactly this case,
 *     and a quote that would guess her earnings is worse than no quote.
 *  4. DELIVERY — read `serviceable` BEFORE `fee` ever matters. An unserviceable
 *     zone and an unreachable Séra must land on the SAME refusal; nothing about
 *     D is ever inferred.
 *  5. THE AMOUNTS — whole, non-negative francs, or refuse.
 *  6. THE VAULT ISSUES. Kill switch → mode → §6.1 gate → `QuoteSchema.parse` →
 *     `assertQuoteReconciles`. Every money field on the result came from the
 *     pinned waterfall; not one is computed, adjusted or re-rounded here.
 */
export function decideIssueQuote(deps: CheckoutDeps, input: IssueQuoteInput): IssueQuoteOutcome {
  const { request, entry, delivery } = input;

  if (request.attributionResellerId === '') {
    return { ok: false, reason: 'attribution_missing' };
  }
  if (entry === undefined) {
    return { ok: false, reason: 'listing_unknown' };
  }
  // The resolved listing must be the one that sells the pid asked for. A
  // mismatch is an index inconsistency, and pricing through it would quote one
  // product at another's price.
  if (entry.listing.productVersionId !== request.pid) {
    return { ok: false, reason: 'listing_unknown' };
  }
  /**
   * ═══ THE PAYEE IS BOUND TO THE LISTING, NEVER NAMED BY THE CALLER ═══
   * (verifier BLOCKER, SP3.2a — the defect this closes was live.)
   *
   * `attributionResellerId` arrives on an ANONYMOUS, unauthenticated POST and
   * lands in the canon Quote field the spec annotates `(LOCKED)` — the field
   * SP3.3 settles against. Unbound, it accepted anything: a rival reseller's
   * id, an id that exists nowhere, and the literal strings `platform` and
   * `supplier` — each one written onto an IMMUTABLE artifact.
   *
   * Governing text, both breached by the unbound version:
   *   · SP-I09b.4 — « Une référence altérée, expirée ou non résolvable
   *     n'attribue personne et ne bascule JAMAIS vers la plateforme. »
   *   · CI gate — « every order has a locked reseller_id, none defaults to
   *     supplier/platform ».
   *
   * THE LISTING IS THE AUTHORITY on who sells this product in this shop: she
   * published it, the service signed her price from her markup, and her net is
   * frozen beside it. So the quote's payee is `entry.listing.resellerId`, and a
   * request naming anyone else is REFUSED BY NAME rather than silently
   * re-pointed — a buyer arriving under a stale or tampered link must hear that
   * something is wrong, not be quoted against the wrong seller's money.
   *
   * (Which reseller earns the ARRIVAL is the attribution lock's separate
   * question — a collision there is SP3.3's to resolve, and it can never make
   * a stranger the payee of THIS listing.)
   */
  if (request.attributionResellerId !== entry.listing.resellerId) {
    return { ok: false, reason: 'attribution_mismatch' };
  }
  if (entry.listing.status !== LISTING_PUBLISHED) {
    return { ok: false, reason: 'listing_not_live' };
  }
  /**
   * STOCK-VENDU-1b — supply POSITIVELY says the counter is empty: refuse
   * BEFORE any money starts (SP3: « out-of-stock hides future buying » — a
   * stale page must not reach a payment for an épuisé product). `undefined`
   * supply refuses nothing — the standing law three fields up: a supply
   * hiccup must never break ordinary checkout. Shop+ still alters no stock;
   * it declines to SELL what the supply truth says is gone. The residual
   * race (a quote issued while one unit remained, paid after someone else
   * took it) stays open until B+5 reservation — journalled, not hidden.
   */
  if (input.supply !== undefined && input.supply.available <= 0) {
    return { ok: false, reason: 'out_of_stock' };
  }
  if (entry.resellerCommission === undefined) {
    return { ok: false, reason: 'commission_not_frozen' };
  }
  if (delivery === undefined || !delivery.serviceable) {
    return { ok: false, reason: 'delivery_not_serviceable' };
  }

  const resellerMarkup = entry.listing.markup; // M — frozen
  const sellerFundedCommission = entry.resellerCommission; // C — frozen
  const sellerBasePrice = entry.customerPriceFcfa - resellerMarkup; // B — by subtraction
  const deliveryFee = delivery.fee; // D — from Séra's stand-in, never a caller

  if (
    !usableFcfa(sellerBasePrice) ||
    !usableFcfa(sellerFundedCommission) ||
    !usableFcfa(resellerMarkup) ||
    !usableFcfa(deliveryFee)
  ) {
    return { ok: false, reason: 'stored_amounts_incoherent' };
  }

  // THE ONLY ISSUER. Never a hand-built Quote, never a recomputed field.
  //
  // WRAPPED, AND ONLY WRAPPED (verifier finding, SP3.2a): the issuer already
  // returns a named refusal for every condition it decides, but it can still
  // THROW on inputs it never expected — `computeWaterfall` raises on a
  // non-integer amount, `QuoteSchema.parse` on a value the canon string types
  // reject. On a PUBLIC money route an uncaught throw answers 500, which the
  // DoD bans (« every failure is a named refusal »). The catch converts a
  // throw into `quote_not_issuable` and NOTHING ELSE — it never substitutes a
  // value, never retries, never repairs. A quote that could not be issued does
  // not exist.
  try {
    return issueQuoteFrom(deps, entry, request, {
      sellerBasePrice,
      sellerFundedCommission,
      resellerMarkup,
      deliveryFee,
    }, input.supply);
  } catch {
    return { ok: false, reason: 'quote_not_issuable' };
  }
}

/** The issuance call itself, split out so the wrap above reads as one thought. */
function issueQuoteFrom(
  deps: CheckoutDeps,
  entry: ListingEntry,
  request: QuoteRequest,
  money: {
    readonly sellerBasePrice: number;
    readonly sellerFundedCommission: number;
    readonly resellerMarkup: number;
    readonly deliveryFee: number;
  },
  supply: ProductDescription | undefined,
): IssueQuoteOutcome {
  const { sellerBasePrice, sellerFundedCommission, resellerMarkup, deliveryFee } = money;
  return issueQuote(deps, {
    listingRef: entry.listing.id,
    offerRef: entry.listing.offerVersion,
    attributionResellerId: request.attributionResellerId,
    paymentMode: request.paymentMode,
    sellerBasePrice,
    sellerFundedCommission,
    resellerMarkup,
    deliveryFee,
    // ═══ §6.1's FACTS COME FROM THE SERVER NOW, NOT FROM THE BUYER ═══
    //
    // `sellerTier` and `category` are read off the SUPPLY PROJECTION this
    // service resolved for the listing — the same wire that carries the price
    // basis — never off the request. `supply === undefined` means supply could
    // not be described, and rather than substitute anything the whole
    // `payAtDoor` block is OMITTED, which the vault answers with the named
    // `context_missing` refusal. Omission is the fail-closed shape: there is no
    // partial context that could accidentally satisfy a condition.
    //
    // A supply projection older than canon v3.1.0 carries no `sellerTier`; the
    // vault then refuses `seller_tier_below_minimum`, because an unprovable
    // condition is a refused condition.
    //
    // OPTION-B-REACHABLE-1 — WHAT NOW DECIDES WHETHER THIS BLOCK EXISTS. It used
    // to be `request.payAtDoorContext !== undefined`, i.e. the BUYER decided
    // whether §6.1 ran at all — and since her PWA never sent that field, the
    // block was never built and every door quote refused `context_missing`
    // before a single condition was evaluated. That is why « Option B still not
    // reachable » survived opening the zones: the gate was never reached.
    //
    // The block is now built for the DOOR MODE ITSELF, from supply. `supply ===
    // undefined` still omits it — supply could not be described, so §6.1 cannot
    // prove its conditions and `context_missing` is still the honest answer.
    /**
     * ═══ THE BLOCK IS BUILT FOR THE DOOR MODE, SUPPLY OR NO SUPPLY ═══
     *
     * It used to be built only when `supply !== undefined`, so a supply read
     * that came back empty refused the whole mode `context_missing`. That was
     * right while §6.1 needed the read: the two facts supply contributes are
     * `sellerTier` and `category`, and a gate that cannot see its inputs must
     * refuse. **After the founder's 2026-08-12 override it was wrong**, and it
     * was A SECOND GATE ON THE DOOR THAT NOBODY WAS TOLD ABOUT: under
     * `minSellerTier: 'aucun'` and `inspectableCategories: 'toutes'` NEITHER
     * field is read, so the door was being refused for want of data the
     * decision no longer consults. A slow Boutik+ offer-service, a redeploy, or
     * one aged projection and « Payer le produit à la livraison » vanished from
     * her screen — the founder's own « Option B still not reachable », with a
     * different root cause underneath it.
     *
     * AND IT IS STILL FAIL-CLOSED, PER CONDITION RATHER THAN IN BULK. Missing
     * supply travels as `''` for both fields, which is not a substitution and
     * not a repair: `''` is not a member of `SELLER_TIER_RANK`, so a policy
     * with a real minimum refuses `seller_tier_below_minimum`; `''` maps to no
     * §6.2 row, so a policy with a real list refuses `category_not_inspectable`.
     * The day the founder re-tightens either rule, an unreadable projection
     * refuses again — by NAME, and only the condition that actually needs the
     * data. Nothing the BUYER controls reaches these fields; they come from the
     * projection or they come from nowhere.
     */
    ...(request.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR'
      ? {
          payAtDoor: {
            // §6.4's record, from the server. See ELIGIBILITE_SANS_HISTORIQUE
            // for what it asserts, what it cannot yet assert, and why SP6.3 is
            // the slice that replaces it with a real ladder read.
            eligibility: ELIGIBILITE_SANS_HISTORIQUE,
            sellerTier: supply?.sellerTier ?? '',
            category: supply?.category ?? '',
            // The zone the DELIVERY was priced for — one zone, never two.
            zoneTo: request.zoneTo,
            ...(deps.payAtDoorPolicy !== undefined ? { policy: deps.payAtDoorPolicy } : {}),
          },
        }
      : {}),
  });
}

/* ──────────────────────── the buyer wire (the boundary) ──────────────────── */

/**
 * ═══ THE SECURITY BOUNDARY OF THIS SLICE ═══
 *
 * The canon Quote carries `sellerBasePrice`, `sellerFundedCommission`,
 * `sellerNet`, `sellerPlatformFee`, `resellerGrossEarnings`, `resellerNet` and
 * `platformProductFeeRevenue`. NOT ONE OF THEM MAY EVER REACH A BUYER'S BROWSER
 * (SP-I03: « MUST NOT expose supplier identity/contact or commission »; Ten Laws
 * #1: « commission never in buyer price »). With her displayed price in hand, a
 * single one of those numbers yields the supplier's base by subtraction — the
 * exact leak the `/listings*` key gate exists to prevent.
 *
 * BUILT FIELD BY FIELD, NEVER A SPREAD AND NEVER A DELETE. A `{...quote}` with
 * keys deleted is safe only for the shape that exists on the day it is written;
 * the next canon field rides onto the buyer wire silently. An allowlist that
 * must be edited to grow is the only shape where forgetting fails toward
 * SILENCE. Its exact `Object.keys` are asserted by test, and the serialized
 * bytes are scanned for every banned name.
 *
 * NOTE the omissions that are also deliberate: no `attributionResellerId` (the
 * buyer has no use for it and it identifies her), no `policyVersions`, no
 * `taxFields`, no `paymentProcessingFeeEstimate`.
 */
export interface BuyerQuoteView {
  readonly quoteId: string;
  readonly paymentMode: string;
  /** B + M, presented WHOLE — the buyer's price is never decomposed for her. */
  readonly productSubtotal: number;
  readonly deliveryFee: number;
  readonly buyerTotal: number;
  readonly amountPaidAtCheckout: number;
  readonly amountDueAtDelivery: number;
  readonly expiry: string;
}

export function toBuyerQuoteView(quote: Quote): BuyerQuoteView {
  return {
    quoteId: quote.id,
    paymentMode: quote.paymentMode,
    productSubtotal: quote.productSubtotal,
    deliveryFee: quote.deliveryFee,
    buyerTotal: quote.buyerTotal,
    amountPaidAtCheckout: quote.amountPaidAtCheckout,
    amountDueAtDelivery: quote.amountDueAtDelivery,
    expiry: quote.expiry,
  };
}

/* ──────────────────────────── the reservation ────────────────────────────── */

/**
 * RESERVE — a THIN delegation to the vault's `decideReservation`, narrowed to the
 * one command this slice may issue.
 *
 * THE NARROWING IS THE FEATURE, not ceremony. `decideReservation` also handles
 * `confirm`, `release` and `expire`; confirming belongs to the payment path
 * (SP3.3) and releasing to the failure path (E2). Typing this entry point to
 * `ReserveCommand` means the checkout DO literally cannot reach those
 * transitions — one reservation per quote, and no way to advance it from here.
 *
 * One reservation per quote is STRUCTURAL, not enforced: the object holding this
 * state is addressed by quote id, so every command for one quote serializes
 * through one workerd input gate.
 */
export function decideReserveForQuote(state: ReservationState, cmd: ReserveCommand): ReservationDecision {
  return decideReservation(state, cmd);
}

/* ─────────────────── the durable immutable-store helpers ─────────────────── */

/**
 * ═══ THE `ImmutableQuoteStore` LAW, MADE DURABLE — BY USING THE VAULT, NOT BY
 *     REWRITING IT ═══
 *
 * The vault's store keeps canonical BYTES in a `Map`, which dies with the
 * process; SP3.2a needs the same law over DO storage. These two functions are
 * that bridge and they contain NO rule of their own: each builds a fresh
 * `ImmutableQuoteStore`, hands it the durable bytes, and returns THE VAULT'S OWN
 * verdict. The only thing living out here is the storage read/write, which is
 * exactly the part the vault deliberately does not own.
 *
 * They are pure and clock-injected, so the expiry decision — the one behaviour a
 * 15-minute TTL makes untestable against a real workerd clock — is provable by
 * value in a unit test on the very function the Durable Object calls.
 */
export type StoredQuoteRead =
  | { readonly ok: true; readonly quote: Quote }
  | { readonly ok: false; readonly reason: 'not_found' | 'expired' | 'stored_quote_unreadable' };

/**
 * READ. Absent ⇒ `not_found`. Present ⇒ the bytes are parsed against the strict
 * canonical `QuoteSchema`, rehydrated into the vault's store (which re-checks
 * that the bytes ARE the quote), and the VAULT decides expiry. A record that
 * will not parse, or whose bytes have drifted from the quote they claim to be,
 * is `stored_quote_unreadable` — REFUSED, never repaired and never guessed at.
 * An expired quote is refused too: a silently revived price is a price nobody
 * agreed to.
 */
export function readStoredQuote(bytes: string | undefined, now: Date): StoredQuoteRead {
  if (bytes === undefined) return { ok: false, reason: 'not_found' };
  let quote: Quote;
  try {
    quote = QuoteSchema.parse(JSON.parse(bytes));
  } catch {
    return { ok: false, reason: 'stored_quote_unreadable' };
  }
  const store = new ImmutableQuoteStore();
  if (!store.put(quote, bytes).ok) return { ok: false, reason: 'stored_quote_unreadable' };
  const read = store.get(quote.id, now); // THE VAULT decides not_found / expired
  if (!read.ok) {
    return { ok: false, reason: read.reason === 'expired' ? 'expired' : 'stored_quote_unreadable' };
  }
  return { ok: true, quote: read.quote };
}

/**
 * WRITE, ONCE. A record already present under this id refuses `quote_id_exists`
 * — there is no update path, exactly as the vault has none. When the slot is
 * free, the VAULT's own `put` decides whether the bytes may be stored at all,
 * so the « bytes must BE the quote » rule is never restated here.
 */
export function decideStoreQuote(
  existingBytes: string | undefined,
  quote: Quote,
  canonicalBytes: string,
): { readonly ok: true } | { readonly ok: false; readonly reason: 'quote_id_exists' | 'bytes_do_not_match_quote' } {
  if (existingBytes !== undefined) return { ok: false, reason: 'quote_id_exists' };
  return new ImmutableQuoteStore().put(quote, canonicalBytes);
}
