import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  QuoteReconciliationError,
  assertQuoteReconciles,
  computeWaterfall,
  type WaterfallInput,
  type WaterfallResult,
} from '@platform/contracts';
import { WORKED_BASELINE_INPUT } from '@shop-plus/commerce-core';
import {
  DEMO_SHARE_LINK,
  DEMO_KIT_LINK,
  baselineGains,
  baselineProductPriceFcfa,
  createDemoWorld,
  gainsLineFor,
  gainsTotal,
  isSelected,
  opportunityCard,
  selectedOpportunities,
  toggleSelection,
} from '../src/demo/store.js';

/**
 * WO-4.1 — the demo world obeys the money law. Every seeded franc DERIVES
 * from the pinned waterfall (the checked-in snapshot is replayed through
 * `computeWaterfall` here — byte equality, the same pin as
 * opportunity-example.json); the §5.4 worked baseline shows the exact
 * canonical numbers in-app; a tampered seed cannot exist (frozen + refused);
 * the store never exposes a gross-without-net view (SP-I04/SP-I12).
 */

const appDir = join(import.meta.dirname, '..');
const seedFile = JSON.parse(readFileSync(join(appDir, 'src/demo/seed.json'), 'utf8')) as {
  baseline: { input: WaterfallInput; money: WaterfallResult };
  opportunities: Array<{
    id: string;
    name: string;
    landmark: string;
    input: WaterfallInput;
    money: WaterfallResult;
  }>;
};

describe('demo world money law', () => {
  it('every seeded money block IS the pinned waterfall of its input (byte equality + real reconciliation)', () => {
    expect(seedFile.opportunities.length).toBeGreaterThanOrEqual(6);
    for (const o of seedFile.opportunities) {
      expect(o.money, `seed ${o.id} drifted from computeWaterfall`).toEqual(
        computeWaterfall(o.input),
      );
      expect(() => assertQuoteReconciles(o.money)).not.toThrow();
      // Literal reseller identities (Ten Laws #1): gross = C+M, fee+net = gross.
      expect(o.money.resellerGrossEarnings).toBe(
        o.input.sellerFundedCommission + o.input.resellerMarkup,
      );
      expect(o.money.resellerNet + o.money.resellerPlatformFee).toBe(
        o.money.resellerGrossEarnings,
      );
      expect(o.money.sellerNet + o.money.resellerNet + o.money.platformProductFeeRevenue).toBe(
        o.money.productSubtotal,
      );
    }
    // The store exposes exactly the checked-in seed, nothing else.
    expect(createDemoWorld().opportunities).toEqual(seedFile.opportunities);
  });

  it('seeded gains are literal and reconcile to the franc (first seed + whole-world totals)', () => {
    const world = createDemoWorld();
    const first = gainsLineFor(world.opportunities[0]!.money);
    expect(first).toEqual({ netFcfa: 1_600, feeFcfa: 400, grossFcfa: 2_000 });
    const totals = gainsTotal(world.opportunities);
    expect(totals).toEqual({ netFcfa: 9_520, feeFcfa: 2_380, grossFcfa: 11_900 });
    expect(totals.netFcfa + totals.feeFcfa).toBe(totals.grossFcfa);
  });

  it('the in-app baseline card shows the §5.4 worked baseline exactly (2 000 net = 2 500 gross − 500 fee)', () => {
    expect(seedFile.baseline.input).toEqual(WORKED_BASELINE_INPUT);
    expect(seedFile.baseline.money).toEqual(computeWaterfall(WORKED_BASELINE_INPUT));
    expect(baselineGains()).toEqual({ netFcfa: 2_000, feeFcfa: 500, grossFcfa: 2_500 });
    expect(baselineProductPriceFcfa()).toBe(10_000);
  });

  it('a tampered demo seed cannot exist (frozen world) and a tampered quote is refused by the real checker', () => {
    const world = createDemoWorld();
    const seed = world.opportunities[0]!;
    expect(Object.isFrozen(seed.money)).toBe(true);
    expect(() => {
      (seed.money as { resellerNet: number }).resellerNet += 1;
    }).toThrow(TypeError);
    expect(seed.money.resellerNet).toBe(1_600);
    const tampered = { ...seed.money, resellerNet: seed.money.resellerNet + 1 };
    expect(() => assertQuoteReconciles(tampered)).toThrow(QuoteReconciliationError);
  });

  it('reset restores the exact seed; selection walks never mutate the world in place', () => {
    const fresh = createDemoWorld();
    const picked = toggleSelection(toggleSelection(fresh, 'o1'), 'o3');
    expect(picked.selectedIds).toEqual(['o1', 'o3']);
    expect(isSelected(picked, 'o1')).toBe(true);
    expect(selectedOpportunities(picked).map((o) => o.id)).toEqual(['o1', 'o3']);
    expect(toggleSelection(picked, 'o1').selectedIds).toEqual(['o3']);
    expect(toggleSelection(picked, 'inconnu')).toBe(picked); // unknown id: no-op
    expect(fresh.selectedIds).toEqual([]); // the original world untouched
    expect(createDemoWorld()).toEqual({
      opportunities: seedFile.opportunities,
      selectedIds: [],
    });
  });

  it('every seed name is obviously fictional (démo-marked) and the share link is visibly a sandbox', () => {
    for (const o of seedFile.opportunities) expect(o.name).toContain('(démo)');
    expect(DEMO_SHARE_LINK).toContain('shop-plus.demo/'); // visibly-fictional sandbox domain
    // Founder ruling 2026-07-20: the demo signed link must LAND, not dead-end —
    // its slug is HER RESOLVING storefront slug (matches the /v/ identity), so the
    // buyer /s/{slug} route resolves the offer and a review walk closes the loop.
    // The « essai » sandbox signal now lives on the .demo DOMAIN, not the slug.
    expect(DEMO_SHARE_LINK).toContain('/s/aicha-4821');
    expect(DEMO_SHARE_LINK).not.toMatch(/^https?:/); // never a live URL
    // WO-7.2b — the media-kit link-out is the same visibly-fictional sandbox form.
    expect(DEMO_KIT_LINK).toContain('shop-plus.demo/');
    expect(DEMO_KIT_LINK).not.toMatch(/^https?:/);
  });

  it('the store never exposes a gross-without-net view (SP-I04/SP-I12 net-first)', () => {
    const world = createDemoWorld();
    for (const o of world.opportunities) {
      const card = opportunityCard(o);
      expect(Object.keys(card)).toEqual(['netFcfa', 'customerPriceFcfa']);
      expect(JSON.stringify(card)).not.toMatch(/gross/i);
      expect(card.netFcfa).toBe(o.money.resellerNet);
    }
    for (const line of [
      gainsLineFor(world.opportunities[0]!.money),
      gainsTotal(world.opportunities),
      baselineGains(),
    ]) {
      // Net is the FIRST field; gross only ever appears beside net + fee.
      expect(Object.keys(line)).toEqual(['netFcfa', 'feeFcfa', 'grossFcfa']);
      expect(line.netFcfa + line.feeFcfa).toBe(line.grossFcfa);
    }
  });

  it('the journey/demo modules bundle Metro-safe (no runtime import of node-only barrels)', () => {
    for (const file of ['src/journey.ts', 'src/demo/store.ts', 'src/share/hub.ts', 'src/sales/ventes.ts', 'src/qr/encoder.ts', 'src/qr/identity.ts', 'src/qr/QrCode.tsx', 'App.tsx']) {
      const source = readFileSync(join(appDir, file), 'utf8');
      const runtimeImports = [...source.matchAll(/^import (?!type )[^;]*from '([^']+)';/gm)].map(
        (m) => m[1],
      );
      for (const spec of runtimeImports) {
        expect(spec, `${file} runtime-imports ${spec}`).not.toMatch(
          /@platform\/(contracts|i18n)|@shop-plus\/commerce-core/,
        );
      }
    }
  });
});
