import { PayAtDoorEligibilitySchema, type PayAtDoorEligibility } from '@platform/contracts';

/**
 * SP6.3 (part 1) — THE PROGRESSIVE BUYER-REFUSAL LADDER (Build Spec §6.4).
 *
 * §6.4 verbatim, because every branch below is a reading of this one paragraph:
 *
 *   « Classify reason: `honest_absence | unusable_location |
 *     insufficient_balance | change_of_mind | repeated_abuse | fraud |
 *     conformity_mismatch`. **1st ordinary buyer-fault** → next order requires
 *     higher delivery commitment **or** small product deposit; **2nd** →
 *     `FULL_PREPAY` for next 3 orders (`prepayOnlyUntil`); **repeated abuse** →
 *     suspend pay-at-door; **fraud** → immediate restriction/review. **Honest
 *     absence / provider failure do NOT escalate** like change-of-mind/abuse. »
 *
 * OWNER: Risk. No Risk service exists, so this is the decision core that one
 * will run when it does — a PURE function from (record, reason, clock) to a new
 * record. It performs no I/O, holds no book, and knows nothing about who the
 * buyer is: **the keying question is deliberately not answered here**, because
 * it is the founder's to answer (see the note at the end of this header).
 *
 * ═══ WHAT IT WRITES ═══
 *
 * The canonical `PayAtDoorEligibility` — the same record
 * `decidePayAtDoorEligibility` reads, parsed strictly on the way out so a rung
 * that produced a non-canonical record is a thrown error here rather than a
 * refusal named `eligibility_record_not_canonical` three layers away.
 *
 * ═══ THE TWO RUNGS WHOSE CONSEQUENCE §6.4 DOES NOT MAKE IMPLEMENTABLE ═══
 *
 * ⏳ RUNG 1. « next order requires higher delivery commitment **or** small
 * product deposit » — an `or` between two mechanisms, NEITHER of which exists:
 * there is no higher-delivery-commitment flow anywhere, and « small » names no
 * franc figure. Inventing one would be this project's failure mode #3
 * (« inventing numbers for open Decisions »).
 *
 * SO RUNG 1 RECORDS THE FAULT AND CHANGES NOTHING ELSE: the count rises to 1,
 * the state stays `allowed`, `requiredDeposit` stays 0. That is the documented
 * SAFEST DEFAULT rather than a soft one — the alternative readings both
 * over-punish. Setting a non-zero `requiredDeposit` would refuse Option B
 * outright (`decidePayAtDoorEligibility` refuses any deposit > 0, conservatively,
 * because no deposit flow is built), which is rung 2's severity applied at rung
 * 1. **A first ordinary fault must not silently become a suspension.** The
 * count is what carries the memory, and rung 2 fires on it.
 *
 * ⏳ RUNG 2. « `FULL_PREPAY` for next 3 orders (`prepayOnlyUntil`) » — the spec
 * counts ORDERS, canon's field is a TIMESTAMP. There is no order-count field on
 * the record and adding one is a `contracts/` change (founder sign-off, §7). So
 * the window is expressed in TIME, and the duration is a flagged ⏳ default:
 * `PREPAY_ONLY_WINDOW_DAYS`, chosen as 30 because it is long enough to cover
 * three orders for an ordinary buyer at pilot cadence and short enough that an
 * honest customer is not shut out for a season. **It is founder-tunable and it
 * is NOT a number the spec gave.**
 *
 * ═══ WHAT IS UNAMBIGUOUS, AND IS IMPLEMENTED EXACTLY ═══
 *
 *  · `repeated_abuse` → suspend pay-at-door. Terminal for the mode.
 *  · `fraud` → immediate restriction/review, regardless of count. Terminal.
 *  · `honest_absence` and provider failure → **DO NOT ESCALATE.** They are
 *    recorded (an operator must be able to see them) but they do not advance
 *    the ladder, because §6.4 says so in bold and because a buyer whose network
 *    died is not a buyer who refused.
 *
 * ═══ THE KEYING QUESTION THIS FILE DOES NOT ANSWER (founder's, §7) ═══
 *
 * §6.1 evaluates the Option-B gate AT QUOTE. At quote, Shop+ knows no buyer:
 * `QuoteRequest` is slug · pid · paymentMode · zoneTo · attributionResellerId ·
 * requestKey, and the buyer's phone arrives one step later, at ORDER CREATE
 * (BC-1a, `order-do.ts`). A ladder keyed to a buyer therefore has no key at the
 * moment the spec says to read it. That is a real conflict between §6.1 and the
 * shipped checkout shape, it is a money/risk question, and it is raised to the
 * founder rather than resolved here. This module is correct under every option
 * he may choose, which is exactly why it was built first.
 */

/** §6.4's classification vocabulary, verbatim and closed. */
export type RefusalReason =
  | 'honest_absence'
  | 'unusable_location'
  | 'insufficient_balance'
  | 'change_of_mind'
  | 'repeated_abuse'
  | 'fraud'
  | 'conformity_mismatch';

export const REFUSAL_REASONS: readonly RefusalReason[] = [
  'honest_absence',
  'unusable_location',
  'insufficient_balance',
  'change_of_mind',
  'repeated_abuse',
  'fraud',
  'conformity_mismatch',
];

/**
 * WHICH REASONS ARE « ORDINARY BUYER-FAULT » — the set the rungs count.
 *
 * §6.4 names the two that must NOT escalate (`honest_absence`, and provider
 * failure, which is not a buyer reason at all and so is not in this vocabulary)
 * and two that jump the ladder (`repeated_abuse`, `fraud`). What is left is the
 * ordinary middle, and it is enumerated rather than derived by subtraction so a
 * reason added to the vocabulary later cannot become counted by accident.
 *
 * `conformity_mismatch` IS NOT HERE, and that is the most important line in
 * this file. A buyer who refuses because the article does not conform has not
 * committed a fault — §6.2 lists exactly that as a VALID REJECTION (« wrong /
 * mismatch / damage / short »). Counting it would punish a buyer for the
 * platform's own failure and would make the refusal ladder an instrument
 * against the very inspection right Option B exists to give her.
 *
 * `unusable_location` and `insufficient_balance` ARE ordinary faults: the
 * delivery was attempted and failed on the buyer's side.
 */
const FAUTES_ORDINAIRES: ReadonlySet<RefusalReason> = new Set<RefusalReason>([
  'unusable_location',
  'insufficient_balance',
  'change_of_mind',
]);

/**
 * ⏳ FOUNDER-TUNABLE. §6.4 says « FULL_PREPAY for next 3 orders » — an ORDER
 * count, on a record whose only window field is a timestamp. 30 days is the
 * flagged default and is not a figure the spec gave. See the header.
 */
export const PREPAY_ONLY_WINDOW_DAYS = 30;

/** A fresh buyer's record — the top of the ladder, before anything happened. */
export function eligibiliteInitiale(buyerRef: string): PayAtDoorEligibility {
  return PayAtDoorEligibilitySchema.parse({
    buyerRef,
    state: 'allowed',
    buyerRefusalCount: 0,
    buyerRiskState: 'none',
    requiredDeposit: 0,
  });
}

export interface RungDecision {
  readonly record: PayAtDoorEligibility;
  /** TRUE when this event advanced the ladder; FALSE when it was recorded only. */
  readonly escalated: boolean;
  /** Why, in one machine-readable token — for the operator log, never the buyer. */
  readonly rung:
    | 'no_escalation_honest'
    | 'no_escalation_valid_rejection'
    | 'first_fault_recorded'
    | 'prepay_only_window'
    | 'suspended_abuse'
    | 'restricted_fraud'
    | 'already_terminal';
}

/**
 * ONE REFUSAL, APPLIED TO ONE RECORD.
 *
 * `nowIso` is passed, never read from a clock, so a replay of the same event
 * yields the same record — a ladder that moves differently on re-processing is
 * a ladder nobody can audit.
 */
export function appliquerRefus(
  current: PayAtDoorEligibility,
  reason: RefusalReason,
  nowIso: string,
): RungDecision {
  const parse = (r: Omit<PayAtDoorEligibility, never>): PayAtDoorEligibility =>
    PayAtDoorEligibilitySchema.parse(r);

  // ═══ TERMINAL STATES DO NOT RE-ESCALATE ═══
  //
  // A suspended or restricted buyer who refuses again stays exactly where she
  // is. Not leniency — idempotence: without this, a replayed event or a second
  // report of the same doorstep would inflate the count and make the record's
  // history a function of how many times an operator pressed a button.
  if (current.state === 'suspended' || current.state === 'restricted') {
    return { record: current, escalated: false, rung: 'already_terminal' };
  }

  // ═══ FRAUD — IMMEDIATE, REGARDLESS OF COUNT (§6.4) ═══
  if (reason === 'fraud') {
    return {
      record: parse({
        ...current,
        state: 'restricted',
        reason: 'fraud',
        buyerRiskState: 'under_review',
        buyerRefusalCount: current.buyerRefusalCount + 1,
        requiredDeposit: current.requiredDeposit,
      }),
      escalated: true,
      rung: 'restricted_fraud',
    };
  }

  // ═══ REPEATED ABUSE — SUSPEND THE MODE (§6.4) ═══
  if (reason === 'repeated_abuse') {
    return {
      record: parse({
        ...current,
        state: 'suspended',
        reason: 'repeated_abuse',
        buyerRiskState: 'abusive',
        buyerRefusalCount: current.buyerRefusalCount + 1,
        requiredDeposit: current.requiredDeposit,
      }),
      escalated: true,
      rung: 'suspended_abuse',
    };
  }

  // ═══ THE TWO THAT MUST NOT ESCALATE ═══
  //
  // §6.4, in bold: « Honest absence / provider failure do NOT escalate like
  // change-of-mind/abuse. » And `conformity_mismatch` is §6.2's own VALID
  // REJECTION — the buyer exercised the right the mode exists to give her.
  //
  // BOTH ARE STILL RECORDED. `buyerRefusalCount` does NOT move (it is the
  // ladder's counter and these are not rungs), but the reason is written so an
  // operator reading the record can see that a doorstep happened. A refusal
  // that leaves no trace at all is indistinguishable from a delivery that never
  // was attempted.
  if (reason === 'honest_absence') {
    return {
      record: parse({ ...current, reason: 'honest_absence' }),
      escalated: false,
      rung: 'no_escalation_honest',
    };
  }
  if (reason === 'conformity_mismatch') {
    return {
      record: parse({ ...current, reason: 'conformity_mismatch' }),
      escalated: false,
      rung: 'no_escalation_valid_rejection',
    };
  }

  // ═══ THE ORDINARY RUNGS ═══
  //
  // Everything reaching here is in `FAUTES_ORDINAIRES` by construction — the
  // vocabulary is closed and every other member was handled above. Asserted
  // rather than assumed: a reason added to the type without a branch must not
  // silently fall into « ordinary fault », which is the direction that punishes.
  if (!FAUTES_ORDINAIRES.has(reason)) {
    return { record: current, escalated: false, rung: 'no_escalation_valid_rejection' };
  }

  const count = current.buyerRefusalCount + 1;

  // RUNG 2 AND BEYOND — the prepay-only window (§6.4). Expressed in time
  // because canon's field is a timestamp; the duration is the flagged ⏳.
  if (count >= 2) {
    const until = new Date(Date.parse(nowIso) + PREPAY_ONLY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return {
      record: parse({
        ...current,
        state: 'allowed', // still a customer — only the MODE is narrowed
        reason,
        buyerRiskState: 'prepay_only',
        buyerRefusalCount: count,
        requiredDeposit: current.requiredDeposit,
        prepayOnlyUntil: until,
      }),
      escalated: true,
      rung: 'prepay_only_window',
    };
  }

  // RUNG 1 — recorded, nothing else changes. See the header for why this is the
  // safest reading and not a soft one.
  return {
    record: parse({
      ...current,
      state: 'allowed',
      reason,
      buyerRiskState: 'watch',
      buyerRefusalCount: count,
      requiredDeposit: current.requiredDeposit,
    }),
    escalated: true,
    rung: 'first_fault_recorded',
  };
}
