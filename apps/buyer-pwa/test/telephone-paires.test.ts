import { describe, expect, it } from 'vitest';
import { caretApresChiffres, telEnPaires } from '../src/cliente/telephone';

/**
 * TEL-PAIRES (founder order 2026-08-09) — « on the phone make spaced after 2
 * numbers like this 76 16 02 55 ». The pure law of the C3 field, plus the two
 * facts that make the spaced string SAFE on the wire: the order door's length
 * bound, and `cleAcheteur`'s digit-only identity (asserted here against the
 * real commerce-core, never assumed).
 */

// The REAL identity function, from the workspace source (the package entry is
// not resolvable from this app — same cross-workspace idiom as the e2e seams).
import { cleAcheteur } from '../../../packages/commerce-core/src/refusal-ladder';

describe('telEnPaires — the founder’s exact example, and every keystroke on the way there', () => {
  it('formats the founder’s example verbatim', () => {
    expect(telEnPaires('76160255')).toBe('76 16 02 55');
  });

  it('every prefix of a number she is still typing stays paired', () => {
    expect(telEnPaires('7')).toBe('7');
    expect(telEnPaires('76')).toBe('76');
    expect(telEnPaires('761')).toBe('76 1');
    expect(telEnPaires('7616')).toBe('76 16');
    expect(telEnPaires('76160')).toBe('76 16 0');
  });

  it('is idempotent — reformatting a formatted string changes nothing (the every-keystroke law)', () => {
    const once = telEnPaires('76160255');
    expect(telEnPaires(once)).toBe(once);
    expect(telEnPaires('76 16 02 55')).toBe('76 16 02 55');
  });

  it('strips what is not a number, keeps HER leading « + », and stops at E.164’s ceiling', () => {
    expect(telEnPaires('76-16.02 55')).toBe('76 16 02 55');
    expect(telEnPaires('+22676160255')).toBe('+22 67 61 60 25 5');
    expect(telEnPaires('abc')).toBe('');
    // 20 digits typed: capped at 15 (the same band cleAcheteur accepts)
    expect(telEnPaires('12345678901234567890').replace(/\D/g, '')).toHaveLength(15);
  });

  it('the spaced form is IDENTITY-SAFE: cleAcheteur keys it exactly like the bare digits', () => {
    expect(cleAcheteur('76 16 02 55')).toBe(cleAcheteur('76160255'));
    expect(cleAcheteur('76 16 02 55')).toBe('76160255');
  });

  it('the spaced form stays inside the order door’s 32-char bound at the 15-digit ceiling', () => {
    // EXACT output at the ceiling — falsifiable, unlike a « ≤ 32 » that the
    // 15-digit cap makes unreachable (verifier vacuity finding): 15 digits in
    // pairs is 7 spaces + the '+', 23 chars, and readBuyerContact bounds 32.
    expect(telEnPaires('+123456789012345')).toBe('+12 34 56 78 90 12 34 5');
    expect('+12 34 56 78 90 12 34 5'.length).toBe(23);
  });
});

describe('caretApresChiffres — a correction in the middle never throws her to the end', () => {
  it('lands after the same count of digits, skipping the spaces the format inserted', () => {
    // she was behind « 7616 » (4 digits) — in « 76 16 02 55 » that is index 5
    expect(caretApresChiffres('76 16 02 55', 4)).toBe(5);
    expect(caretApresChiffres('76 16 02 55', 2)).toBe(2);
    expect(caretApresChiffres('76 16 02 55', 0)).toBe(0);
    // more digits than exist: the end, never past it
    expect(caretApresChiffres('76 16', 99)).toBe(5);
  });

  it('never lands BEFORE a leading « + » — a keystroke there would delete it on the next reformat', () => {
    expect(caretApresChiffres('+76 16', 0)).toBe(1);
    expect(caretApresChiffres('+76 16', 2)).toBe(3);
    expect(caretApresChiffres('+', 0)).toBe(1);
  });
});
