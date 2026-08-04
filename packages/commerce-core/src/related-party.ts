import {
  RelatedPartyDecisionSchema,
  type RelatedPartyDecision,
  type RelatedPartySignals,
} from '@platform/contracts';

/**
 * SP6.3 (part 3) — RELATED-PARTY DETECTION, TIERED (Build Spec §6.5; OWNER: Risk).
 *
 * §6.5 verbatim:
 *
 *   « **Auto-void commission:** same verified identity/phone/wallet, or reseller
 *     buying through their own account. **Manual-review flag (not auto-void):**
 *     same device/household/landmark/shared phone/network — **often legitimate
 *     in Burkina Faso.** During investigation commission is **held**, not
 *     returned; appeal path; on violation → returned to seller; on clear →
 *     paid. »
 *
 * ═══ THE TIER IS THE RULE, AND IT IS A STATEMENT ABOUT BURKINA FASO ═══
 *
 * One handset shared between a mother and her daughter. One courtyard, one
 * landmark, one neighbourhood wifi, one phone that three traders use. These are
 * not evasion signals here — the spec says so in bold — and a system that voided
 * a reseller's commission on them would be reading ordinary life as fraud, on
 * the surface where being wrong costs her a month's earnings.
 *
 * So circumstantial matches NEVER auto-void, however many of them stack. Ten
 * circumstantial signals are still ten circumstantial signals; only an IDENTITY
 * match — the same verified person, phone or wallet on both sides of the sale,
 * or the reseller buying through her own account — voids automatically, because
 * that is not a coincidence about where someone lives.
 *
 * ═══ « HELD » IS NOT « VOIDED », AND THE DIFFERENCE IS HERS ═══
 *
 * A review PAUSES the commission with a way back: « on violation → returned to
 * seller; on clear → paid ». It does not take her money and it does not accuse
 * her. That is why `held_for_review` is its own outcome and not a softer word
 * for the same thing — collapsing them would delete the appeal path from the
 * type system, and a path that is not representable is a path nobody builds.
 *
 * ═══ WHAT THIS MODULE IS NOT ═══
 *
 * It does not DETECT. It decides what a detected set of signals MEANS. Producing
 * the signals — comparing identities, phones, wallets, devices — needs an
 * identity system this platform does not have; when one exists it feeds this
 * function, and this function will not need to change.
 */

/** ⏳ FOUNDER-TUNABLE, and named on every decision so a call replays. */
export const RELATED_PARTY_POLICY_VERSION = 'related-party.v1';

export interface RelatedPartyInput {
  readonly orderId: string;
  readonly signals: RelatedPartySignals;
  readonly nowIso: string;
}

/**
 * §6.5, decided. Pure and total: no clock read, no I/O, no throw on any input
 * the type admits.
 */
export function decideRelatedParty(input: RelatedPartyInput): RelatedPartyDecision {
  const { identity, circumstantial } = input.signals;

  // AUTO-VOID — and ONLY from the identity family. Checked first so that an
  // identity match is never softened by the presence of circumstantial ones:
  // living in the same courtyard does not make buying through your own account
  // less of a violation.
  const outcome =
    identity.length > 0 ? 'auto_void' : circumstantial.length > 0 ? 'held_for_review' : 'clear';

  return RelatedPartyDecisionSchema.parse({
    orderId: input.orderId,
    outcome,
    // The signals ride WITH the decision. A related-party call a reseller can
    // appeal is one she can be told the basis of; a bare verdict is not
    // appealable, and §6.5 promises an appeal path.
    signals: { identity: [...identity], circumstantial: [...circumstantial] },
    policyVersion: RELATED_PARTY_POLICY_VERSION,
    decidedAt: input.nowIso,
  });
}

/**
 * Does this outcome stop the reseller's commission from being paid NOW?
 *
 * TRUE for both `auto_void` and `held_for_review`, and the shared answer is the
 * point: §6.5 says that during investigation the commission is HELD. What
 * separates the two is what happens NEXT — a hold has an appeal and can end in
 * payment; a void does not. Callers that only need « may this be paid today »
 * ask here rather than re-deriving the rule from the outcome string.
 */
export function commissionRetenue(decision: RelatedPartyDecision): boolean {
  return decision.outcome !== 'clear';
}
