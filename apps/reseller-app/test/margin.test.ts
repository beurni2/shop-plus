import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { marginBreakdown, markupCap, defaultMarkup, snapMarkup, DEFAULT_MARKUP, MARKUP_CAP_RATE } from '../src/vitrine/margin.js';

/**
 * WO-VITRINE-FLOW (founder redirect) — the reseller-margin arithmetic is the
 * planche `rc(p, m)` (…:889) and reconciles to the franc at every markup. The
 * money-integrity anchor: at each seed's AUTHORED markup, this in-app math equals
 * the pinned computeWaterfall-derived seed money (net / fee / client) exactly — so
 * the live display agrees with the frozen waterfall where they meet. The seed is
 * the fixture; the module is not allowed to import computeWaterfall.
 */

const appDir = join(import.meta.dirname, '..');
const seed = JSON.parse(readFileSync(join(appDir, 'src/demo/seed.json'), 'utf8')) as {
  opportunities: Array<{
    id: string;
    input: { sellerBasePrice: number; sellerFundedCommission: number; resellerMarkup: number };
    money: { resellerNet: number; resellerPlatformFee: number; resellerGrossEarnings: number; productSubtotal: number };
  }>;
};

describe('reseller-margin arithmetic (margin.ts)', () => {
  it('markupCap is 25 % of base, floored to the franc (founder order 2026-08-25 — « cannot add more than 25% »)', () => {
    // SP3's « markup within cap » rule holds; the pilot value is 25 % of B.
    expect(markupCap(8000)).toBe(2000);
    expect(markupCap(1500)).toBe(375);
    expect(markupCap(1000)).toBe(250);
    expect(markupCap(12000)).toBe(3000);
    // FLOOR, never round: on these bases a rounded cap would EXCEED 25 %,
    // which is exactly what the founder's sentence forbids.
    expect(markupCap(11_500)).toBe(2_875);
    expect(markupCap(999)).toBe(249);
    // …and the bound property itself: cap ≤ B×0.25 on every base.
    for (const b of [1, 999, 1_500, 8_000, 11_500, 123_456]) {
      expect(markupCap(b)).toBeLessThanOrEqual(b * 0.25);
    }
  });

  it('at each seed authored markup, the in-app math EQUALS the pinned seed money (net/fee/client)', () => {
    for (const o of seed.opportunities) {
      const b = marginBreakdown(o.input.sellerBasePrice, o.input.sellerFundedCommission, o.input.resellerMarkup);
      expect(b.gross, `${o.id} gross`).toBe(o.money.resellerGrossEarnings);
      expect(b.fee, `${o.id} fee`).toBe(o.money.resellerPlatformFee);
      expect(b.net, `${o.id} net`).toBe(o.money.resellerNet);
      expect(b.client, `${o.id} client`).toBe(o.money.productSubtotal);
    }
  });

  it('reconciles to the franc at EVERY markup on the slider range (net + fee = gross, fee = 0 — FRAIS-ZERO)', () => {
    for (const o of seed.opportunities) {
      const { sellerBasePrice: b, sellerFundedCommission: c } = o.input;
      const cap = markupCap(b);
      for (let m = 0; m <= cap; m += 100) {
        const r = marginBreakdown(b, c, m);
        expect(r.net + r.fee, `${o.id}@${m} reconcile`).toBe(r.gross);
        // FRAIS-ZERO (founder 2026-08-25): a REAL pin — 0, never a re-typing
        // of the module's own formula.
        expect(r.fee, `${o.id}@${m} fee`).toBe(0);
        expect(r.net, `${o.id}@${m} net`).toBe(c + m);
        expect(r.client, `${o.id}@${m} client`).toBe(b + m);
        expect(r.gross, `${o.id}@${m} gross`).toBe(c + m);
      }
    }
  });

  it('the default markup is 0 on arrival (founder override 2026-07-26, supersedes HANDOFF §3 1500)', () => {
    // She starts from the base and ADDS her margin deliberately; an un-acted
    // default signs the lowest cliente price, never a number chosen for her.
    expect(DEFAULT_MARKUP).toBe(0);
    expect(defaultMarkup(8000)).toBe(0);
    expect(defaultMarkup(0)).toBe(0);
  });

  it('snapMarkup snaps to the step (100) and clamps to [0, cap]', () => {
    expect(snapMarkup(1249, 2400)).toBe(1200);
    expect(snapMarkup(1251, 2400)).toBe(1300);
    expect(snapMarkup(-50, 2400)).toBe(0);
    expect(snapMarkup(9999, 300)).toBe(300); // clamps to cap
  });

  it('the module imports NO custody waterfall (reseller-margin only)', () => {
    const src = readFileSync(join(appDir, 'src/vitrine/margin.ts'), 'utf8');
    const imports = [...src.matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec, `margin.ts imports ${spec}`).not.toMatch(/@platform\/contracts|@shop-plus\/commerce-core/);
    }
    // and it never calls the custody waterfall (the arithmetic is reseller-margin)
    expect(src).not.toMatch(/computeWaterfall\(/);
  });
});

describe('MONEY-SHAPE-1 — the app IMPORTS the money rules, it does not declare them', () => {
  it('margin.ts CONTAINS NO ARITHMETIC — it is a re-export door onto the shared package', () => {
    const src = readFileSync(join(__dirname, '..', 'src/vitrine/margin.ts'), 'utf8');
    expect(src).toMatch(/from '@shop-plus\/reseller-money'/);
    // Not duplicated, not re-declared: a second copy of a pricing rule is a second
    // rule, and the two would drift on the first tuning.
    expect(src).not.toMatch(/MARKUP_CAP_RATE\s*=/);
    expect(src).not.toMatch(/DEFAULT_MARKUP\s*=/);
    expect(src).not.toMatch(/Math\.round/);
    expect(src).not.toMatch(/function markupCap/);
    expect(src).not.toMatch(/function marginBreakdown/);
  });

  it('THE APP AND THE SERVICE SEE THE SAME CEILING — one constant, two consumers', async () => {
    const shared = await import('@shop-plus/reseller-money');
    // the app's door and the package must be the same object, not merely equal
    expect(markupCap).toBe(shared.markupCap);
    expect(MARKUP_CAP_RATE).toBe(shared.MARKUP_CAP_RATE);
  });
});
