import { describe, expect, it } from 'vitest';
import { PayAtDoorEligibilitySchema } from '@platform/contracts';
import {
  PREPAY_ONLY_WINDOW_DAYS,
  REFUSAL_REASONS,
  appliquerRefus,
  decidePayAtDoorEligibility,
  eligibiliteInitiale,
  type RefusalReason,
} from '../src/index.js';

/**
 * SP6.3 (part 1) — §6.4's ladder, EXECUTED.
 *
 * THE CLAIM THIS FILE PROTECTS, in one sentence: **a buyer is never punished
 * for exercising the inspection right Option B exists to give her, and is never
 * punished harder than §6.4 says.** Every assertion below is a reading of that
 * paragraph, and the two rungs whose consequences the spec leaves open are
 * pinned at their FLAGGED defaults so a silent change to either is a red test.
 */

const T = '2026-08-04T09:00:00.000Z';
const BUYER = 'buyer-77';

const monter = (reasons: readonly RefusalReason[], from = eligibiliteInitiale(BUYER)) =>
  reasons.reduce((rec, r) => appliquerRefus(rec, r, T).record, from);

/* ═══════════════════ the vocabulary ═══════════════════ */

describe('§6.4 — the classification vocabulary is the spec’s, closed and complete', () => {
  it('the seven reasons are exactly §6.4’s, in §6.4’s order', () => {
    expect(REFUSAL_REASONS).toEqual([
      'honest_absence',
      'unusable_location',
      'insufficient_balance',
      'change_of_mind',
      'repeated_abuse',
      'fraud',
      'conformity_mismatch',
    ]);
  });

  it('EVERY reason produces a CANONICAL record — no branch can write a shape the gate then refuses', () => {
    // The failure this prevents is nasty and silent: a rung writes a record the
    // §6.1 gate cannot parse, and the buyer is refused
    // `eligibility_record_not_canonical` — a shape error wearing a risk
    // decision's clothes. Swept over the whole vocabulary, from a fresh record
    // and from an already-escalated one.
    for (const reason of REFUSAL_REASONS) {
      for (const from of [eligibiliteInitiale(BUYER), monter(['change_of_mind'])]) {
        const { record } = appliquerRefus(from, reason, T);
        expect(PayAtDoorEligibilitySchema.safeParse(record).success, reason).toBe(true);
        expect(record.buyerRef, reason).toBe(BUYER); // identity never drifts
      }
    }
  });
});

/* ═══════════════════ what must NOT escalate ═══════════════════ */

describe('§6.4 — « Honest absence … do NOT escalate », and a valid rejection is not a fault at all', () => {
  it('honest absence is RECORDED but does not move the counter, however many times it happens', () => {
    let rec = eligibiliteInitiale(BUYER);
    for (let i = 0; i < 5; i += 1) {
      const d = appliquerRefus(rec, 'honest_absence', T);
      expect(d.escalated).toBe(false);
      expect(d.rung).toBe('no_escalation_honest');
      rec = d.record;
    }
    expect(rec.buyerRefusalCount).toBe(0);
    expect(rec.state).toBe('allowed');
    expect(rec.prepayOnlyUntil).toBeUndefined();
    // …and it IS recorded: an operator can see a doorstep happened.
    expect(rec.reason).toBe('honest_absence');
  });

  it('CONFORMITY MISMATCH NEVER COUNTS — §6.2 calls it a VALID REJECTION', () => {
    // The single most important line in this suite. §6.2's row 1 lists « wrong/
    // mismatch/damage/short » as valid rejections. If this ever escalated, the
    // ladder would punish a buyer for the platform's own failure and would turn
    // Option B's inspection right into a trap.
    let rec = eligibiliteInitiale(BUYER);
    for (let i = 0; i < 10; i += 1) rec = appliquerRefus(rec, 'conformity_mismatch', T).record;
    expect(rec.buyerRefusalCount).toBe(0);
    expect(rec.state).toBe('allowed');
    expect(rec.prepayOnlyUntil).toBeUndefined();
    // …and the mode is still genuinely OPEN to her afterwards, checked through
    // the REAL gate rather than by reading the record's fields.
    expect(
      decidePayAtDoorEligibility({
        eligibility: rec,
        sellerTier: 'verified',
        category: 'Mode femme',
        zoneTo: 'Ouagadougou',
        buyerTotalFcfa: 12_500,
        nowIso: T,
      }),
    ).toMatchObject({ eligible: true });
  });

  it('a valid rejection does not neutralise a fault she ALREADY has', () => {
    // The mirror hazard: « conformity_mismatch resets the counter » would let
    // one honest complaint launder two genuine no-shows.
    const rec = monter(['change_of_mind', 'conformity_mismatch']);
    expect(rec.buyerRefusalCount).toBe(1);
  });
});

/* ═══════════════════ the ordinary rungs ═══════════════════ */

describe('§6.4 — the ordinary ladder: 1st records, 2nd narrows the mode', () => {
  it('a FIRST ordinary fault records the count and changes nothing else (⏳ flagged default)', () => {
    // §6.4's rung-1 consequence is « higher delivery commitment OR small
    // product deposit » — an `or` between two mechanisms, neither built, and
    // « small » names no franc. The safest implementable reading is: record it,
    // punish nothing. Pinned so a later edit that quietly sets a deposit — which
    // `decidePayAtDoorEligibility` refuses outright, i.e. rung-2 severity at
    // rung 1 — is a red test.
    const d = appliquerRefus(eligibiliteInitiale(BUYER), 'change_of_mind', T);
    expect(d.escalated).toBe(true);
    expect(d.rung).toBe('first_fault_recorded');
    expect(d.record.buyerRefusalCount).toBe(1);
    expect(d.record.state).toBe('allowed');
    expect(d.record.requiredDeposit).toBe(0);
    expect(d.record.prepayOnlyUntil).toBeUndefined();
    // …and Option B is STILL open to her after one ordinary fault, proved
    // through the gate itself, not by reading fields.
    expect(
      decidePayAtDoorEligibility({
        eligibility: d.record, sellerTier: 'verified', category: 'shoes',
        zoneTo: 'Ouagadougou', buyerTotalFcfa: 12_500, nowIso: T,
      }),
    ).toMatchObject({ eligible: true });
  });

  it('a SECOND ordinary fault opens the prepay-only window, and the gate then REFUSES the door', () => {
    const rec = monter(['change_of_mind', 'insufficient_balance']);
    expect(rec.buyerRefusalCount).toBe(2);
    expect(rec.prepayOnlyUntil).toBeDefined();
    expect(rec.state).toBe('allowed'); // still a customer; only the MODE narrows
    // THE CONSEQUENCE, MEASURED WHERE IT LANDS. A window on the record is worth
    // nothing unless the §6.1 gate acts on it — asserted end to end.
    const ctx = {
      eligibility: rec, sellerTier: 'verified', category: 'shoes',
      zoneTo: 'Ouagadougou', buyerTotalFcfa: 12_500,
    };
    expect(decidePayAtDoorEligibility({ ...ctx, nowIso: T })).toMatchObject({
      eligible: false,
      reason: 'buyer_not_allowed',
    });
  });

  it('the window is finite — after it passes the door opens again (⏳ 30 days, founder-tunable)', () => {
    const rec = monter(['change_of_mind', 'change_of_mind']);
    const ctx = {
      eligibility: rec, sellerTier: 'verified', category: 'shoes',
      zoneTo: 'Ouagadougou', buyerTotalFcfa: 12_500,
    };
    const jour = 24 * 60 * 60 * 1000;
    // one day before the end: still refused
    const avant = new Date(Date.parse(T) + (PREPAY_ONLY_WINDOW_DAYS - 1) * jour).toISOString();
    expect(decidePayAtDoorEligibility({ ...ctx, nowIso: avant })).toMatchObject({ eligible: false });
    // one day after: open again. A ladder rung that never expires is a ban.
    const apres = new Date(Date.parse(T) + (PREPAY_ONLY_WINDOW_DAYS + 1) * jour).toISOString();
    expect(decidePayAtDoorEligibility({ ...ctx, nowIso: apres })).toMatchObject({ eligible: true });
    // the ⏳ default itself, pinned: a silent change to the duration reddens.
    expect(PREPAY_ONLY_WINDOW_DAYS).toBe(30);
  });

  it('the three ordinary reasons behave identically — the ladder counts FAULTS, not flavours', () => {
    for (const r of ['unusable_location', 'insufficient_balance', 'change_of_mind'] as const) {
      expect(appliquerRefus(eligibiliteInitiale(BUYER), r, T).record.buyerRefusalCount, r).toBe(1);
      expect(monter([r, r]).prepayOnlyUntil, r).toBeDefined();
    }
  });
});

/* ═══════════════════ the two that jump the ladder ═══════════════════ */

describe('§6.4 — abuse suspends, fraud restricts, and neither waits for a count', () => {
  it('REPEATED ABUSE suspends pay-at-door from a CLEAN record — no count is required', () => {
    const d = appliquerRefus(eligibiliteInitiale(BUYER), 'repeated_abuse', T);
    expect(d.rung).toBe('suspended_abuse');
    expect(d.record.state).toBe('suspended');
    expect(
      decidePayAtDoorEligibility({
        eligibility: d.record, sellerTier: 'trusted', category: 'shoes',
        zoneTo: 'Ouagadougou', buyerTotalFcfa: 1_000, nowIso: T,
      }),
    ).toMatchObject({ eligible: false, reason: 'buyer_not_allowed' });
  });

  it('FRAUD restricts immediately, from a clean record, and the gate refuses', () => {
    const d = appliquerRefus(eligibiliteInitiale(BUYER), 'fraud', T);
    expect(d.rung).toBe('restricted_fraud');
    expect(d.record.state).toBe('restricted');
    expect(d.record.buyerRiskState).toBe('under_review'); // §6.4: « restriction/review »
    expect(
      decidePayAtDoorEligibility({
        eligibility: d.record, sellerTier: 'trusted', category: 'shoes',
        zoneTo: 'Ouagadougou', buyerTotalFcfa: 1_000, nowIso: T,
      }),
    ).toMatchObject({ eligible: false, reason: 'buyer_not_allowed' });
  });

  it('a TERMINAL record does not re-escalate — a replayed event cannot inflate a history', () => {
    for (const terminal of ['repeated_abuse', 'fraud'] as const) {
      const once = appliquerRefus(eligibiliteInitiale(BUYER), terminal, T).record;
      for (const again of REFUSAL_REASONS) {
        const d = appliquerRefus(once, again, T);
        expect(d.record, `${terminal} then ${again}`).toEqual(once);
        expect(d.escalated).toBe(false);
        expect(d.rung).toBe('already_terminal');
      }
    }
  });
});

/* ═══════════════════ determinism ═══════════════════ */

describe('§6.4 — the ladder is replayable', () => {
  it('the same event on the same record yields the same record, byte for byte', () => {
    // No clock is read inside; `nowIso` is passed. A ladder that moves
    // differently on re-processing is a ladder nobody can audit.
    for (const reason of REFUSAL_REASONS) {
      const a = appliquerRefus(monter(['change_of_mind']), reason, T);
      const b = appliquerRefus(monter(['change_of_mind']), reason, T);
      expect(JSON.stringify(a), reason).toBe(JSON.stringify(b));
    }
  });

  it('the initial record is the canonical top of the ladder', () => {
    const rec = eligibiliteInitiale(BUYER);
    expect(rec).toEqual({
      buyerRef: BUYER,
      state: 'allowed',
      buyerRefusalCount: 0,
      buyerRiskState: 'none',
      requiredDeposit: 0,
    });
    expect(PayAtDoorEligibilitySchema.safeParse(rec).success).toBe(true);
  });
});
