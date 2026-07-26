import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKUP,
  MARKUP_CAP_RATE,
  defaultMarkup,
  marginBreakdown,
  markupCap,
  netFromStored,
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
        expect(v.fee).toBe(Math.round(v.gross * 0.2)); // canon 20 %·(C+M), untouched
        expect(v.net + v.fee).toBe(v.gross); // to the franc, always
        expect(v.client).toBe(b + m); // productSubtotal = B + M
      }
    }
  });

  it('THE CEILING IS 100 % OF BASE, snapped to 100 — the pilot-tuned value, unchanged', () => {
    expect(MARKUP_CAP_RATE).toBe(1);
    expect(markupCap(10_000)).toBe(10_000);
    expect(markupCap(8_000)).toBe(8_000);
    expect(markupCap(1_549)).toBe(1_500); // round(1549/100)*100
    expect(markupCap(0)).toBe(0);
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
