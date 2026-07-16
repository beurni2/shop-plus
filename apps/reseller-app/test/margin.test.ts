import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { marginBreakdown, markupCap, defaultMarkup, snapMarkup, DEFAULT_MARKUP } from '../src/vitrine/margin.js';

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
  it('markupCap is the planche 20 %-of-base ceiling, round(B×0.2/100)×100', () => {
    expect(markupCap(8000)).toBe(1600);
    expect(markupCap(1500)).toBe(300);
    expect(markupCap(1000)).toBe(200);
    expect(markupCap(12000)).toBe(2400);
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

  it('reconciles to the franc at EVERY markup on the slider range (net + fee = gross, fee = 20 %)', () => {
    for (const o of seed.opportunities) {
      const { sellerBasePrice: b, sellerFundedCommission: c } = o.input;
      const cap = markupCap(b);
      for (let m = 0; m <= cap; m += 100) {
        const r = marginBreakdown(b, c, m);
        expect(r.net + r.fee, `${o.id}@${m} reconcile`).toBe(r.gross);
        expect(r.fee, `${o.id}@${m} fee`).toBe(Math.round(r.gross * 0.2));
        expect(r.client, `${o.id}@${m} client`).toBe(b + m);
        expect(r.gross, `${o.id}@${m} gross`).toBe(c + m);
      }
    }
  });

  it('defaultMarkup clamps the 1500 default to the cap (min(1500, cap))', () => {
    expect(DEFAULT_MARKUP).toBe(1500);
    expect(defaultMarkup(1600)).toBe(1500); // cap above default → default
    expect(defaultMarkup(300)).toBe(300); // cap below default → cap binds (o2)
    expect(defaultMarkup(200)).toBe(200); // o6
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
