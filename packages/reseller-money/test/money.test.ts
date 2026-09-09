import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESELLER_PLATFORM_FEE as LOI_CANON, computeWaterfall } from '@platform/contracts';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKUP,
  MARKUP_CAP_RATE,
  RESELLER_PLATFORM_FEE,
  defaultMarkup,
  marginBreakdown,
  markupCap,
  netFromStored,
  resellerFeeOnGross,
  snapMarkup,
} from '../src/index';

/**
 * MONEY-SHAPE-1 — the moved arithmetic, and the two properties that make the move
 * safe: the numbers did not change, and this module depends on nothing.
 */

describe('the arithmetic is BYTE-IDENTICAL to what shipped in the app', () => {
  it('THE IDENTITIES HOLD AT EVERY MARKUP — net + fee = gross, client = B + M', () => {
    for (const [b, c] of [
      [10_000, 750],
      [8_000, 600],
      [1_500, 200],
      [0, 0],
      [999_999, 1],
    ] as const) {
      for (const m of [0, 100, 1_500, 2_500, markupCap(b)]) {
        const v = marginBreakdown(b, c, m);
        expect(v.gross).toBe(c + m);
        expect(v.fee).toBe(0); // FRAIS-ZERO (founder 2026-08-25): rate 0, fee 0 on every gross
        expect(v.net + v.fee).toBe(v.gross); // to the franc, always
        expect(v.client).toBe(b + m); // productSubtotal = B + M
      }
    }
  });

  it('THE CEILING IS 25 % OF BASE, floored to the franc (founder order 2026-08-25 — « cannot add more than 25% »)', () => {
    expect(MARKUP_CAP_RATE).toBe(0.25);
    expect(markupCap(10_000)).toBe(2_500);
    expect(markupCap(8_000)).toBe(2_000);
    expect(markupCap(1_549)).toBe(387); // floor(1549×0.25) — exact, never above 25 %
    expect(markupCap(11_500)).toBe(2_875); // the old round(…/100)×100 said 2 900 — OVER the bound
    expect(markupCap(0)).toBe(0);
    // The bound property the order states: cap never exceeds a quarter of B.
    for (const b of [1, 999, 1_549, 8_000, 11_500, 123_456]) {
      expect(markupCap(b)).toBeLessThanOrEqual(b * 0.25);
    }
  });

  it('THE DEFAULT IS 0 (founder override 2026-07-26) and the slider snaps to 100, clamped to [0, cap]', () => {
    // Supersedes HANDOFF §3's `?? 1500`: she starts from the base and ADDS her
    // margin deliberately — an un-acted default must sign the LOWEST cliente
    // price, never a number pre-chosen for her.
    expect(DEFAULT_MARKUP).toBe(0);
    expect(defaultMarkup(10_000)).toBe(0);
    expect(defaultMarkup(0)).toBe(0); // zero cap, same start
    expect(snapMarkup(1_449, 10_000)).toBe(1_400);
    expect(snapMarkup(-5, 10_000)).toBe(0);
    expect(snapMarkup(99_999, 8_000)).toBe(8_000);
  });
});

describe('netFromStored — HER net without a supply read in the path', () => {
  it('IT TAKES THE STORED C AND M AND NOTHING ELSE', () => {
    // The signature is the guarantee: no supply source, no fetcher, no base price.
    expect(netFromStored.length).toBe(2);
    expect(netFromStored(750, 1_900)).toBe(marginBreakdown(10_000, 750, 1_900).net);
  });

  it('IT AGREES WITH marginBreakdown AT EVERY POINT — one arithmetic, two entry points', () => {
    for (const c of [0, 200, 750, 5_000]) {
      for (const m of [0, 100, 1_900, 12_345]) {
        expect(netFromStored(c, m)).toBe(marginBreakdown(10_000, c, m).net);
      }
    }
  });

  it('NET DOES NOT DEPEND ON B — which is why B is not a parameter', () => {
    // If B could move the net, a caller would be tempted to fetch a LIVE base and
    // reintroduce exactly the drift the frozen commission removes.
    const a = marginBreakdown(10_000, 750, 1_900).net;
    const b = marginBreakdown(999_999, 750, 1_900).net;
    expect(a).toBe(b);
    expect(netFromStored(750, 1_900)).toBe(a);
  });
});

/**
 * ARRONDI-REVENDEUSE-1 (AUDIT-SHOP-2 F-10) — ONE ROUNDING LAW. The fee floors
 * with the canon pair, the pair is pinned to the INSTALLED contracts, and every
 * breakdown agrees with `computeWaterfall` to the franc.
 */
describe('ARRONDI-REVENDEUSE-1 — the fee FLOORS, with the canon pair', () => {
  const RATES: ReadonlyArray<readonly [number, number]> = [
    [20, 100], // the law's recorded reseller target (§5.4)
    [5, 100], // the seller side's, for symmetry
    [1, 3], // a pair that never lands on a franc
  ];
  const GROSSES = Array.from({ length: 2_000 }, (_, i) => i * 7 + (i % 13)); // 0 … 13 993

  it('THE PAIR IS THE CANON PAIR — pinned to the installed @platform/contracts', () => {
    // The day a rate returns in contracts, this line is the one that goes red —
    // and the property test below then bites at the real rate.
    expect(RESELLER_PLATFORM_FEE).toEqual({ numerator: LOI_CANON.numerator, denominator: LOI_CANON.denominator });
    expect(RESELLER_PLATFORM_FEE.denominator).toBeGreaterThan(0);
  });

  it('IT FLOORS, NEVER ROUNDS — at the law\'s own 20 % the two differ on a third of grosses', () => {
    // 1 234 × 20 / 100 = 246.8 → 246 F (round would say 247, a franc the law leaves with her).
    expect(resellerFeeOnGross(1_234, { numerator: 20, denominator: 100 })).toBe(246);
    expect(resellerFeeOnGross(999, { numerator: 5, denominator: 100 })).toBe(49); // 49.95
    expect(resellerFeeOnGross(1_234)).toBe(0); // the installed rate
    let differ = 0;
    for (const [num, den] of RATES) {
      for (const gross of GROSSES) {
        const fee = resellerFeeOnGross(gross, { numerator: num, denominator: den });
        expect(fee).toBe(Math.floor((gross * num) / den)); // the law's floorFraction, integer-first
        expect(Number.isSafeInteger(fee)).toBe(true);
        expect(fee).toBeLessThanOrEqual((gross * num) / den); // the fraction stays with her
        if (fee !== Math.round((gross * num) / den)) differ += 1;
      }
    }
    // A grid on which round and floor cannot be told apart would prove nothing.
    expect(differ).toBeGreaterThan(GROSSES.length);
  });

  it('EVERY BREAKDOWN AGREES WITH computeWaterfall TO THE FRANC — net, fee, gross, client', () => {
    const BASES = [0, 1, 999, 1_549, 8_000, 10_000, 11_500, 123_456, 999_999];
    const COMMISSIONS = [0, 1, 200, 750, 5_000, 12_345];
    const MARKUPS = [0, 1, 100, 1_900, 2_875, 12_345, 99_999];
    let cases = 0;
    for (const b of BASES) {
      for (const c of COMMISSIONS) {
        for (const m of [...MARKUPS, markupCap(b)]) {
          for (const paymentMode of ['FULL_PREPAY', 'PAY_AT_DOOR'] as const) {
            const loi = computeWaterfall({ sellerBasePrice: b, sellerFundedCommission: c, resellerMarkup: m, deliveryFee: 1_000, paymentMode });
            const v = marginBreakdown(b, c, m);
            expect(v.fee).toBe(loi.resellerPlatformFee);
            expect(v.net).toBe(loi.resellerNet);
            expect(v.gross).toBe(loi.resellerGrossEarnings);
            expect(v.client).toBe(loi.productSubtotal);
            expect(netFromStored(c, m)).toBe(loi.resellerNet);
            cases += 1;
          }
        }
      }
    }
    expect(cases).toBe(BASES.length * COMMISSIONS.length * (MARKUPS.length + 1) * 2);
  });

  it('BOTH ENTRY POINTS CALL THE ONE CONSTRUCTION — no second rounding rule in the source', () => {
    // At rate 0 a literal `0` would pass every value test above; the call sites
    // are anchored here, and proven by execution the day a rate returns.
    const src = readFileSync(join(__dirname, '..', 'src/index.ts'), 'utf8');
    expect(src.match(/resellerFeeOnGross\(gross\)/g)).toHaveLength(2);
    expect(src).not.toMatch(/Math\.round\(gross/);
  });
});

describe('the package depends on NOTHING — the RN bundle has to carry it', () => {
  it('NO IMPORTS AT ALL in the source', () => {
    const src = readFileSync(join(__dirname, '..', 'src/index.ts'), 'utf8');
    // A money rule with a dependency graph is a money rule that can break for
    // unrelated reasons — and Metro has to bundle this into the reseller app.
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/require\(/);
  });

  it('ITS package.json DECLARES NO RUNTIME DEPENDENCIES', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies ?? {}).toEqual({});
  });
});
