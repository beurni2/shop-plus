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
   * §6.1 "network-reliable zone". ⏳ FOUNDER-TUNABLE: NO spec values exist —
   * the conservative default is the EMPTY allowlist (no zone is presumed
   * reliable until the founder names it).
   */
  networkReliableZones: readonly string[];
}

/**
 * Conservative defaults — Option-B narrow by default. Every figure here is
 * either quoted from the spec (cap, tier, §6.2 rows) or the empty set where
 * the spec names no value (zones). ⏳ All founder-tunable.
 */
export const PAY_AT_DOOR_POLICY_DEFAULTS: PayAtDoorPolicy = {
  version: 'option-b-policy.v0-conservative',
  priceCapFcfa: 25_000,
  minSellerTier: 'verified',
  inspectableCategories: ['fashion_bags_fabrics', 'shoes', 'sealed_beauty_cosmetics'],
  networkReliableZones: [],
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

  const tierRank = SELLER_TIER_RANK[ctx.sellerTier];
  const minRank = SELLER_TIER_RANK[policy.minSellerTier]!;
  if (tierRank === undefined || tierRank < minRank) return refuse('seller_tier_below_minimum');

  if (!policy.inspectableCategories.includes(ctx.category)) return refuse('category_not_inspectable');

  if (ctx.buyerTotalFcfa > policy.priceCapFcfa) return refuse('over_price_cap');

  if (!policy.networkReliableZones.includes(ctx.zoneTo)) return refuse('zone_not_network_reliable');

  return { eligible: true, policyVersion: policy.version };
}
