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

/**
 * ═══ OPTION-B-REACHABLE-1 — THE WORD A SUPPLIER TYPES vs THE ROW §6.2 NAMES ═══
 *
 * Founder, 2026-08-04: « Option B still not reachable ». It was not the zone
 * rule (he opened that on 2026-08-01 and the code shipped `'all'`). One of the
 * two remaining causes is here, and it is a VOCABULARY MISMATCH between two
 * repositories that were each individually correct:
 *
 *   · Boutik+ writes the supplier's own chip into `product.category` — the
 *     eight words she actually taps: « Mode femme », « Mode homme », « Enfant »,
 *     « Chaussures », « Sacs », « Maison », « Tissus », « Beauté scellée »
 *     (`apps/supplier-app/src/v2/categorie-details.ts`). Its producer carries
 *     that string VERBATIM onto the supply wire and says so: « NO MAPPING AND
 *     NO DEFAULT HERE … Shop+ allowlists what it recognises and fails closed on
 *     the rest, WHICH IS THE ONLY SIDE THAT MAY DECIDE WHAT A CATEGORY MEANS. »
 *   · Shop+ allowlisted `fashion_bags_fabrics · shoes · sealed_beauty_cosmetics`
 *     — §6.2's own row names — and compared them to those French words directly.
 *
 * The two sets do not intersect, so **every listing the founder can create
 * refused `category_not_inspectable`**, and the same mismatch quietly degraded
 * the buyer's at-door inspection card to the cautious row for every product.
 * Boutik+ named Shop+ as the side that decides meaning; this map is Shop+
 * finally doing it.
 *
 * ═══ EACH ROW IS §6.2's, QUOTED — NOTHING HERE IS INVENTED ═══
 *
 * §6.2's rows are « Fashion, bags, fabrics » · « Shoes (IN pilot) » · « Sealed
 * beauty/cosmetics » · « Electronics/complex — EXCLUDED from MVP ». The eight
 * chips land on them by plain reading, not by judgement:
 *   Mode femme · Mode homme · Enfant · Sacs · Tissus → row 1 (fashion, BAGS,
 *     FABRICS — the row names all three in its own title)
 *   Chaussures → row 2       Beauté scellée → row 3
 *   Maison → NO ROW. Home goods are not one of §6.2's four rows, so they are
 *     not inspectable at the door and Option B refuses for them. That is the
 *     fail-closed answer, not an oversight: the spec grants at-door inspection
 *     rights row by row, and a row that does not exist grants nothing.
 *
 * THE CANONICAL IDS MAP TO THEMSELVES so a producer that already speaks §6.2's
 * vocabulary (the e2e fixtures, and anything Boutik+ may later emit) keeps
 * working unchanged. Everything else — a supplier's free text, a typo, a chip
 * added tomorrow — resolves to `null` and refuses. **A category this map cannot
 * read is a category with no inspection rights**, which is the only safe answer:
 * the buyer's door screen promises exactly what §6.2 says it may, or promises
 * nothing.
 *
 * A `Map`, not an object literal, for the reason `categorie-details.ts` states
 * on its own twin: a plain-object lookup walks `Object.prototype`, so a category
 * named `constructor` would resolve to a function instead of missing.
 */
const RANGEE_62: ReadonlyMap<string, string> = new Map([
  // §6.2 row 1 — « Fashion, bags, fabrics »
  ['fashion_bags_fabrics', 'fashion_bags_fabrics'],
  ['Mode femme', 'fashion_bags_fabrics'],
  ['Mode homme', 'fashion_bags_fabrics'],
  ['Enfant', 'fashion_bags_fabrics'],
  ['Sacs', 'fashion_bags_fabrics'],
  ['Tissus', 'fashion_bags_fabrics'],
  // §6.2 row 2 — « Shoes (IN pilot) »
  ['shoes', 'shoes'],
  ['Chaussures', 'shoes'],
  // §6.2 row 3 — « Sealed beauty/cosmetics »
  ['sealed_beauty_cosmetics', 'sealed_beauty_cosmetics'],
  ['Beauté scellée', 'sealed_beauty_cosmetics'],
]);

/**
 * The §6.2 row a product is inspected under, or `null` when §6.2 names none.
 *
 * ONE MAP, TWO CONSUMERS, AND THAT IS THE WHOLE POINT: the §6.1 gate below asks
 * it whether the door may be offered, and `customer-projection.ts` asks it what
 * to put on the buyer's wire so her at-door checklist and her eligibility can
 * never disagree about what she is buying. A second copy of this table is how
 * those two answers drift apart.
 */
export function rangeeInspection(category: string): string | null {
  return RANGEE_62.get(category) ?? null;
}

/**
 * ═══ THE BUYER'S LADDER RECORD BEFORE ANY LADDER EXISTS (OPTION-B-REACHABLE-1) ═══
 *
 * The SECOND cause of « Option B still not reachable », and the one that fired
 * FIRST, for every buyer, before any of §6.1's five conditions was evaluated:
 * `PayAtDoorEligibility` is OWNER: Risk (§6.4), no Risk service exists, so
 * nothing produced the record — and a request with no record refuses
 * `context_missing` in `quote-issuance.ts` before the gate is even consulted.
 *
 * WHY A SERVER-SIDE BASELINE AND NOT A FIELD ON THE BUYER'S REQUEST. The record
 * used to be caller-supplied, and `checkout-core.ts` called that out as « the
 * one remaining self-declared §6.1 input … a live exposure ». Filling it in from
 * the browser would have made Option B reachable AND left the buyer answering
 * the condition she is being measured by. Deciding it HERE closes that: the
 * field leaves the wire entirely, so a caller cannot answer it even by mistake.
 *
 * ⏳ WHAT THIS COSTS, STATED PLAINLY BECAUSE IT IS REAL: until SP6.3 builds the
 * ladder book, **no buyer can be restricted** — there is nowhere to write a
 * refusal count, so every buyer reads as having none. That matches the founder's
 * ruling of 2026-08-01 (« it's open to every buyer who want that option ») and
 * §6.4's own shape, where the ladder only ever RESTRICTS from an unrestricted
 * start (« 1st ordinary buyer-fault → … »). It is not an invented policy value;
 * it is the top of the documented ladder, and SP6.3 replaces this constant with
 * a real read.
 *
 * `buyerRef` IS `'anonyme'` AND THAT IS NOT A PLACEHOLDER FOR A KNOWN VALUE —
 * checkout carries no buyer identity at quote time by design (`QuoteRequest`
 * has slug · pid · paymentMode · zoneTo · attributionResellerId · requestKey and
 * nothing else; her phone and quartier are captured later, at ORDER create).
 * There is no key to look a ladder entry up BY yet, which is the deeper reason
 * SP6.3 is the slice that closes this and this constant cannot.
 *
 * The other four §6.1 conditions are UNTOUCHED and still gate every door quote:
 * seller tier ≥ verified · category inspectable · buyerTotal ≤ the cap · zone.
 */
export const ELIGIBILITE_SANS_HISTORIQUE = Object.freeze({
  buyerRef: 'anonyme',
  state: 'allowed',
  buyerRefusalCount: 0,
  /** No risk recorded — the only honest value when no ladder has ever run. */
  buyerRiskState: 'none',
  /** §6.4's deposit rung is a ladder consequence; an unladdered buyer owes none. */
  requiredDeposit: 0,
});

export interface PayAtDoorPolicy {
  /** Version every eligibility decision names — decisions are replayable. */
  version: string;
  /**
   * §6.1 "order ≤ price cap (pilot ~25,000 F)". ⏳ FOUNDER-TUNABLE: the spec
   * gives the pilot figure with a tilde; 25 000 is the documented number,
   * applied to buyerTotal (the larger figure — the STRICTER reading; the
   * spec's "order" does not say which amount, flagged in JOURNAL).
   */
  priceCapFcfa: number | 'aucun';
  /**
   * §6.1 "seller tier ≥ verified".
   *
   * FOUNDER OVERRIDE 2026-08-12: « for pay at the door I do not want any gate at
   * all, make it open to any product from any supplier. » Given after being told
   * what §6.1 says and what the tier protects, and repeated. `'aucun'` is the
   * sentinel that means no tier is required.
   */
  minSellerTier: 'verified' | 'trusted' | 'aucun';
  /**
   * §6.2 category inspection matrix — the MVP rows that allow at-door
   * inspection. ⏳ FOUNDER-TUNABLE identifiers; electronics is EXCLUDED from
   * MVP by the matrix itself.
   */
  inspectableCategories: readonly string[] | 'toutes';
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
/**
 * ═══ FOUNDER OVERRIDE 2026-08-12 — OPTION B IS OFFERED ON EVERYTHING ═══
 *
 * « for pay at the door I do not want any gate at all, make it open to any
 * product from any supplier. » Said after being shown §6.1's five conditions
 * verbatim and told what each one protects, and repeated when the concern was
 * raised. It is his decision and it is recorded as one; §6.1/§6.2 are updated to
 * match rather than left contradicting the code.
 *
 * WHAT HE WAS TOLD, kept here because a reversal should be able to read it:
 * §6.2 excludes electronics because a buyer cannot meaningfully inspect one at
 * the door, and an opened box that is then refused cannot be resold — that loss
 * lands on the supplier and on him. The cap is what bounds the loss on any
 * single refusal. Neither risk went away; he accepted both.
 *
 * THE RULES ARE NOT DELETED — each is given a sentinel that means « open »,
 * exactly as the 2026-08-01 zones ruling was applied. That keeps §6.1's
 * structure intact, keeps every decision REPLAYABLE (each answer names the
 * `version` it was decided under), and makes re-tightening a policy edit with an
 * audit trail instead of a code change. Sentinels are WORDS, never a huge number
 * or an empty list: « open » has to be typed out by someone who meant it, and a
 * config that arrives half-written still fails closed.
 *
 * WHAT IS *NOT* OPENED, and it is deliberate: `PayAtDoorEligibility`. It refuses
 * nobody today (`ELIGIBILITE_SANS_HISTORIQUE` allows every buyer, because
 * nothing yet records a refusal) so it is not gating anything he can see, and it
 * is the only thing that could ever stop a buyer who repeatedly refuses at the
 * door. Flagged to him rather than silently dropped.
 */
export const PAY_AT_DOOR_POLICY_DEFAULTS: PayAtDoorPolicy = {
  version: 'option-b-policy.v2-ouvert-a-tous',
  priceCapFcfa: 'aucun',
  minSellerTier: 'aucun',
  inspectableCategories: 'toutes',
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

/**
 * ═══ THE BUYER HALF OF §6.1, ON ITS OWN — SP6.3 ═══
 *
 * Extracted because it is now read from TWO places and must give one answer:
 *
 *  · at QUOTE, inside `decidePayAtDoorEligibility` below, where it runs against
 *    the server's baseline record; and
 *  · at ORDER CREATE, where her phone finally exists and the real §6.4 ladder
 *    book can be read (founder ruling 2026-08-04 — see `buyer-ladder-do.ts`).
 *
 * A SECOND COPY OF THESE FOUR CHECKS WOULD BE THE DEFECT. Two gates that
 * disagree about what « allowed » means is how a buyer is offered the door at
 * one step and refused at the next for no stated reason — or, worse, refused at
 * quote and admitted at order.
 */
export function decideBuyerRung(
  eligibility: unknown,
  nowIso: string,
): { allowed: true } | { allowed: false; reason: 'eligibility_record_not_canonical' | 'buyer_not_allowed' } {
  const parsed = PayAtDoorEligibilitySchema.safeParse(eligibility);
  if (!parsed.success) return { allowed: false, reason: 'eligibility_record_not_canonical' };
  const record = parsed.data;
  if (record.state !== 'allowed') return { allowed: false, reason: 'buyer_not_allowed' };
  // §6.4 ladder: an active prepay-only window means FULL_PREPAY only.
  if (record.prepayOnlyUntil !== undefined && nowIso < record.prepayOnlyUntil) {
    return { allowed: false, reason: 'buyer_not_allowed' };
  }
  // ⏳ requiredDeposit > 0 is a ladder consequence with NO built flow — refuse
  // the mode rather than silently waive the deposit.
  if (record.requiredDeposit > 0) return { allowed: false, reason: 'buyer_not_allowed' };
  return { allowed: true };
}

export function decidePayAtDoorEligibility(
  ctx: PayAtDoorContext,
  policy: PayAtDoorPolicy = PAY_AT_DOOR_POLICY_DEFAULTS,
): PayAtDoorDecision {
  const refuse = (reason: PayAtDoorRefusalReason): PayAtDoorDecision => ({
    eligible: false,
    policyVersion: policy.version,
    reason,
  });

  // Buyer side — ONE implementation, shared with the order-create gate.
  const rung = decideBuyerRung(ctx.eligibility, ctx.nowIso);
  if (!rung.allowed) return refuse(rung.reason);

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
  // ═══ THE SAME GUARD ON THE POLICY SIDE — AND THIS HALF FAILED **OPEN** ═══
  //
  // The first cut of this fix stopped one line short (verifier, round 2) and
  // left `SELLER_TIER_RANK[policy.minSellerTier]!` — the identical unguarded
  // lookup, behind a non-null assertion that made it look deliberate. The
  // direction of the failure is the opposite one and therefore worse: an
  // unrecognised MINIMUM yields `undefined`, `anyRank < undefined` is `false`,
  // and the refusal is skipped. Measured: with `minSellerTier: 'toString'`, a
  // **provisional** seller came back ELIGIBLE.
  //
  // Not reachable from the wire today — `minSellerTier` is typed
  // `'verified' | 'trusted'` and only arrives via `CheckoutDeps.payAtDoorPolicy`,
  // which the Worker never sets. But every value in this file is marked
  // ⏳ FOUNDER-TUNABLE, and the day a tuned policy is loaded from config or JSON
  // instead of a TypeScript literal, the type stops guarding anything and this
  // opens. A policy this module cannot interpret must refuse the mode, never
  // grant it: an unreadable rule is not an absent rule.
  // FOUNDER OVERRIDE 2026-08-12 — `'aucun'` means no tier is required, so the
  // comparison is skipped rather than satisfied by a fake rank. The guard below
  // is untouched for every other value: a minimum this module cannot interpret
  // still REFUSES, because an unreadable rule is not an absent rule.
  if (policy.minSellerTier !== 'aucun') {
    if (!Object.hasOwn(SELLER_TIER_RANK, policy.minSellerTier)) return refuse('seller_tier_below_minimum');
    const minRank = SELLER_TIER_RANK[policy.minSellerTier]!;
    if (tierRank === undefined || tierRank < minRank) return refuse('seller_tier_below_minimum');
  }

  // ═══ THE SUPPLIER'S WORD, THEN THE POLICY — TWO SEPARATE QUESTIONS ═══
  //
  // `rangeeInspection` answers « which §6.2 row is this », a reading of the
  // spec that does not change; `policy.inspectableCategories` answers « which
  // rows are open today », which is ⏳ FOUNDER-TUNABLE. Keeping them apart is
  // what lets the founder later close, say, shoes without touching the map that
  // knows « Chaussures » IS shoes.
  //
  // BOTH HALVES REFUSE. A category §6.2 does not name resolves to `null`; a row
  // §6.2 names but the policy has since CLOSED is not in the list. Either way the
  // door is not offered, and the buyer's checklist (which reads the SAME map,
  // through the customer projection) shows the cautious row rather than
  // promising rights she does not have.
  // FOUNDER OVERRIDE 2026-08-12 — `'toutes'` opens every category, INCLUDING the
  // ones §6.2 has no row for. That is the point of the sentinel: the previous
  // code refused an unknown category twice over (no row, and not in the list),
  // and he asked for any product. The §6.2 map still decides what the buyer's
  // at-door checklist SAYS; it no longer decides whether the door is offered.
  if (policy.inspectableCategories !== 'toutes') {
    // AN UNREADABLE LIST REFUSES — the `minSellerTier` guard's law, applied here.
    // Without it `.includes()` runs on a STRING and becomes SUBSTRING matching:
    // a config written as `'fashion_bags_fabrics,shoes'` instead of an array
    // would open `shoes` by accident, and `'toutes-shoes'` opens it while the
    // sentinel itself is misspelt. Measured, not theorised.
    if (!Array.isArray(policy.inspectableCategories)) return refuse('category_not_inspectable');
    const rangee = rangeeInspection(ctx.category);
    if (rangee === null || !policy.inspectableCategories.includes(rangee)) {
      return refuse('category_not_inspectable');
    }
  }

  // FOUNDER OVERRIDE 2026-08-12 — `'aucun'` means no ceiling. A NUMBER still caps
  // exactly as before, so setting one is how he re-bounds his exposure later.
  //
  // THIS ONE FAILED OPEN, AND IT IS THE ONE THAT BOUNDS THE LOSS. The first
  // cut was `policy.priceCapFcfa !== 'aucun' && ctx.buyerTotalFcfa > policy.priceCapFcfa`,
  // which compares a number against WHATEVER the value is: `'acun'`, `'AUCUN'`,
  // `undefined` and a missing key all yielded false and skipped the refusal — a
  // 900 000 FCFA basket admitted at the door under a config its author believed
  // capped it. Measured on all four. The other three conditions refused
  // correctly because each had a guard; this one had none, while this file's own
  // comment claimed « a config that arrives half-written still fails closed ».
  // It does now.
  if (policy.priceCapFcfa !== 'aucun') {
    if (typeof policy.priceCapFcfa !== 'number' || !Number.isFinite(policy.priceCapFcfa)) {
      return refuse('over_price_cap');
    }
    if (ctx.buyerTotalFcfa > policy.priceCapFcfa) return refuse('over_price_cap');
  }

  // `'all'` short-circuits; an ARRAY still allowlists, and an empty one still
  // refuses everything. The two readings share no code path.
  if (policy.networkReliableZones !== 'all') {
    // Same guard, same reason: a mistyped `'al'` would otherwise substring-match
    // any zone whose name contains « al ».
    if (!Array.isArray(policy.networkReliableZones)) return refuse('zone_not_network_reliable');
    if (!policy.networkReliableZones.includes(ctx.zoneTo)) return refuse('zone_not_network_reliable');
  }

  return { eligible: true, policyVersion: policy.version };
}
