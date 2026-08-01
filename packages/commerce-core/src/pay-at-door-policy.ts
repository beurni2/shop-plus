import { PayAtDoorEligibilitySchema } from '@platform/contracts';

/**
 * OPTION-B ELIGIBILITY GATE (WO-2.5; SP3.3; Build Spec §6.1):
 * "Option-B gate (evaluated at quote): seller tier ≥ verified · category
 * inspectable · order ≤ price cap (pilot ~25,000 F) · network-reliable zone ·
 * `PayAtDoorEligibility.state = allowed`."
 *
 * The gate is evaluated at quote time and FAILS CLOSED: any condition not
 * provably satisfied refuses the mode. The POLICY VALUES below are open
 * Decisions (⏳ OWNER: Risk) — every value is founder-tunable and the
 * defaults are deliberately the NARROWEST defensible reading of the spec:
 * door payment is the risk surface, so Option B starts narrow.
 */

/** §5.6 SellerTrustState: `tier(provisional|verified|trusted)`. */
const SELLER_TIER_RANK: Readonly<Record<string, number>> = {
  provisional: 0,
  verified: 1,
  trusted: 2,
};

export interface PayAtDoorPolicy {
  /** Version every eligibility decision names — decisions are replayable. */
  version: string;
  /**
   * §6.1 "order ≤ price cap (pilot ~25,000 F)". ⏳ FOUNDER-TUNABLE: the spec
   * gives the pilot figure with a tilde; 25 000 is the documented number,
   * applied to buyerTotal (the larger figure — the STRICTER reading; the
   * spec's "order" does not say which amount, flagged in JOURNAL).
   */
  priceCapFcfa: number;
  /** §6.1 "seller tier ≥ verified" — spec text, not tunable downward. */
  minSellerTier: 'verified' | 'trusted';
  /**
   * §6.2 category inspection matrix — the MVP rows that allow at-door
   * inspection. ⏳ FOUNDER-TUNABLE identifiers; electronics is EXCLUDED from
   * MVP by the matrix itself.
   */
  inspectableCategories: readonly string[];
  /**
   * §6.1 "network-reliable zone". ⏳ FOUNDER-TUNABLE, and the founder RULED on
   * 2026-08-01: « remove the list of the eligibility rule of neighbourhoods,
   * it's open to every buyer who want that option ».
   *
   * ═══ THE RULE STAYS; ITS ANSWER BECAME « EVERYWHERE » ═══
   *
   * §6.1 is NORMATIVE and names five conditions, this among them, so the check
   * is not deleted — it is given a value that means « every zone ». That keeps
   * the spec's structure intact and keeps the decision REPLAYABLE: every
   * eligibility answer still names the `version` it was decided under, so a
   * future narrowing is a policy change with an audit trail rather than a
   * silent difference between two builds.
   *
   * `'all'` IS AN EXPLICIT SENTINEL AND NOT AN EMPTY LIST, deliberately. An
   * empty array still refuses EVERY zone — so a config that loses its zones,
   * or arrives half-written, fails CLOSED. « Everywhere » has to be typed out
   * by someone who meant it; it can never be reached by accident.
   */
  networkReliableZones: readonly string[] | 'all';
}

/**
 * The shipped policy. Every figure here is quoted from the spec (cap, tier,
 * §6.2 rows) except the zone rule, which the spec gives no values for and the
 * founder ruled OPEN on 2026-08-01. ⏳ All founder-tunable.
 *
 * THE VERSION STRING IS PART OF THE DECISION — every eligibility answer names
 * it — so it moves whenever the policy's MEANING moves. It did here.
 */
export const PAY_AT_DOOR_POLICY_DEFAULTS: PayAtDoorPolicy = {
  version: 'option-b-policy.v1-open-zones',
  priceCapFcfa: 25_000,
  minSellerTier: 'verified',
  inspectableCategories: ['fashion_bags_fabrics', 'shoes', 'sealed_beauty_cosmetics'],
  /**
   * FOUNDER RULING 2026-08-01 — Option B is offered to every buyer who wants
   * it, in every zone. The other four §6.1 conditions are UNTOUCHED and still
   * gate it: seller tier ≥ verified · category inspectable · buyerTotal ≤ the
   * price cap · the buyer's own eligibility record says `allowed`.
   */
  networkReliableZones: 'all',
};

export interface PayAtDoorContext {
  /** The canonical PayAtDoorEligibility record for this buyer (OWNER: Risk). */
  eligibility: unknown;
  /** §5.6 SellerTrustState.tier of the supplier behind the offer. */
  sellerTier: string;
  /** The listing's category identifier (per the §6.2 matrix rows). */
  category: string;
  /** Delivery destination zone (DeliveryFeeQuote.zoneTo). */
  zoneTo: string;
  /** buyerTotal from the pinned waterfall — the cap is checked against it. */
  buyerTotalFcfa: number;
  nowIso: string;
}

export type PayAtDoorRefusalReason =
  | 'eligibility_record_not_canonical'
  | 'buyer_not_allowed'
  | 'seller_tier_below_minimum'
  | 'category_not_inspectable'
  | 'over_price_cap'
  | 'zone_not_network_reliable';

export type PayAtDoorDecision =
  | { eligible: true; policyVersion: string }
  | { eligible: false; policyVersion: string; reason: PayAtDoorRefusalReason };

export function decidePayAtDoorEligibility(
  ctx: PayAtDoorContext,
  policy: PayAtDoorPolicy = PAY_AT_DOOR_POLICY_DEFAULTS,
): PayAtDoorDecision {
  const refuse = (reason: PayAtDoorRefusalReason): PayAtDoorDecision => ({
    eligible: false,
    policyVersion: policy.version,
    reason,
  });

  // Buyer side — the canonical record must parse AND affirmatively allow.
  const parsed = PayAtDoorEligibilitySchema.safeParse(ctx.eligibility);
  if (!parsed.success) return refuse('eligibility_record_not_canonical');
  const record = parsed.data;
  if (record.state !== 'allowed') return refuse('buyer_not_allowed');
  // §6.4 ladder: an active prepay-only window means FULL_PREPAY only.
  if (record.prepayOnlyUntil !== undefined && ctx.nowIso < record.prepayOnlyUntil) {
    return refuse('buyer_not_allowed');
  }
  // ⏳ requiredDeposit > 0 is a ladder consequence with NO built flow at E2 —
  // conservative: refuse the mode rather than silently waive the deposit.
  if (record.requiredDeposit > 0) return refuse('buyer_not_allowed');

  // ═══ `Object.hasOwn` — WITHOUT IT THIS CONDITION DID NOT EXIST ═══
  //
  // This read `SELLER_TIER_RANK[ctx.sellerTier]` directly. `SELLER_TIER_RANK` is
  // an object literal, so a prototype member resolves instead of missing:
  // `SELLER_TIER_RANK['toString']` is a FUNCTION, which is not `undefined`, and
  // `someFunction < 1` is `false` — so the refusal never fired. Measured against
  // the shipped policy before this fix: `provisional` and `garbage` refused
  // correctly, while `toString`, `constructor`, `valueOf` and `__proto__` all
  // came back ELIGIBLE. §6.1's « seller tier ≥ verified » was structurally
  // unenforceable by any caller who typed one of five words.
  //
  // That matters more here than in a renderer: `ctx.sellerTier` is CALLER-SUPPLIED
  // on the checkout wire today (see `checkout-core.ts`), so this was a live
  // bypass of one of the five Option-B conditions, not a theoretical one.
  //
  // Found by a fresh-context verifier while reviewing an unrelated field; the
  // defect is older than that change. Fixed in the same pass as the identical
  // bug in the buyer's §6.2 row lookup, because it is one root cause: an
  // untrusted string used directly as a key into an object literal.
  const tierRank = Object.hasOwn(SELLER_TIER_RANK, ctx.sellerTier) ? SELLER_TIER_RANK[ctx.sellerTier] : undefined;
  const minRank = SELLER_TIER_RANK[policy.minSellerTier]!;
  if (tierRank === undefined || tierRank < minRank) return refuse('seller_tier_below_minimum');

  if (!policy.inspectableCategories.includes(ctx.category)) return refuse('category_not_inspectable');

  if (ctx.buyerTotalFcfa > policy.priceCapFcfa) return refuse('over_price_cap');

  // `'all'` short-circuits; an ARRAY still allowlists, and an empty one still
  // refuses everything. The two readings share no code path.
  if (policy.networkReliableZones !== 'all' && !policy.networkReliableZones.includes(ctx.zoneTo)) {
    return refuse('zone_not_network_reliable');
  }

  return { eligible: true, policyVersion: policy.version };
}
