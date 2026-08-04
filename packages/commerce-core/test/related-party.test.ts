import { describe, expect, it } from 'vitest';
import { RelatedPartyDecisionSchema } from '@platform/contracts';
import { RELATED_PARTY_POLICY_VERSION, commissionRetenue, decideRelatedParty } from '../src/index.js';

/**
 * SP6.3 (part 3) — §6.5's tier, EXECUTED.
 *
 * THE CLAIM THIS FILE PROTECTS: **a reseller is never auto-voided for how she
 * lives.** §6.5 says a shared device, household, landmark, phone or network is
 * « often legitimate in Burkina Faso »; the whole tier exists so that ordinary
 * life is reviewed by a human, never punished by a machine.
 */

const T = '2026-08-04T09:00:00.000Z';
const IDENTITY = ['verified_identity', 'phone', 'mobile_money_account', 'own_account'] as const;
const CIRCUMSTANTIAL = ['device', 'household', 'landmark', 'shared_phone', 'network'] as const;

const decide = (identity: readonly string[], circumstantial: readonly string[]) =>
  decideRelatedParty({
    orderId: 'ord_0001',
    signals: { identity: [...identity], circumstantial: [...circumstantial] } as never,
    nowIso: T,
  });

describe('§6.5 — circumstantial signals NEVER auto-void, however many stack', () => {
  it('EVERY circumstantial signal alone is a REVIEW, not a void', () => {
    for (const s of CIRCUMSTANTIAL) {
      expect(decide([], [s]).outcome, s).toBe('held_for_review');
    }
  });

  it('ALL FIVE AT ONCE is still a review — stacking ordinary life is still ordinary life', () => {
    // The mutation this kills: « enough circumstantial signals ⇒ void ». There
    // is no such threshold in §6.5, and inventing one would auto-void a family
    // that shares a courtyard, a landmark, a handset and a wifi router — which
    // in Ouagadougou describes a great many households.
    expect(decide([], CIRCUMSTANTIAL).outcome).toBe('held_for_review');
  });
});

describe('§6.5 — identity signals auto-void, and are never softened', () => {
  it('EVERY identity signal alone voids', () => {
    for (const s of IDENTITY) {
      expect(decide([s], []).outcome, s).toBe('auto_void');
    }
  });

  it('an identity match STILL voids when circumstantial signals are also present', () => {
    // The opposite mutation, and the more tempting one: « she lives there, so
    // the phone match is explained ». Buying through your own account is not
    // explained by your address.
    expect(decide(['own_account'], CIRCUMSTANTIAL).outcome).toBe('auto_void');
    expect(decide(['mobile_money_account'], ['household']).outcome).toBe('auto_void');
  });
});

describe('§6.5 — no signals is CLEAR, and the decision is auditable', () => {
  it('nothing detected ⇒ clear, and the commission is not withheld', () => {
    const d = decide([], []);
    expect(d.outcome).toBe('clear');
    expect(commissionRetenue(d)).toBe(false);
  });

  it('« held » withholds the commission TODAY, exactly as a void does', () => {
    // §6.5: « During investigation commission is held, not returned ». The two
    // outcomes differ in what comes NEXT, not in what is paid now.
    expect(commissionRetenue(decide([], ['device']))).toBe(true);
    expect(commissionRetenue(decide(['phone'], []))).toBe(true);
  });

  it('the decision carries its signals, its policy version and its clock', () => {
    // A verdict a reseller cannot be told the basis of is a verdict she cannot
    // appeal — and §6.5 promises an appeal path.
    const d = decide(['phone'], ['household']);
    expect(d.signals).toEqual({ identity: ['phone'], circumstantial: ['household'] });
    expect(d.policyVersion).toBe(RELATED_PARTY_POLICY_VERSION);
    expect(d.decidedAt).toBe(T);
    expect(RelatedPartyDecisionSchema.safeParse(d).success).toBe(true);
  });

  it('DETERMINISTIC — the same signals decide the same way, byte for byte', () => {
    expect(JSON.stringify(decide(['phone'], ['device']))).toBe(JSON.stringify(decide(['phone'], ['device'])));
  });

  it('the input is COPIED, not captured — a caller mutating its array cannot move a decision', () => {
    const identity: string[] = [];
    const d = decideRelatedParty({ orderId: 'ord_0001', signals: { identity, circumstantial: ['device'] } as never, nowIso: T });
    identity.push('mobile_money_account');
    expect(d.signals.identity).toEqual([]);
    expect(d.outcome).toBe('held_for_review');
  });
});
