import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeWaterfall } from '@platform/contracts';
import { WORKED_BASELINE_INPUT } from '@shop-plus/commerce-core';
import { buildOpportunityCard, formatFcfa, opportunityCardSurface } from '../src/earnings.js';

// CI gate: net-first-display (SP-I04/SP-I12) — the real surface, pinned to
// the checked-in descriptor the gate script runs on.

const appDir = join(import.meta.dirname, '..');

describe('net-first-display — opportunity card', () => {
  it('the surface descriptor is net-first and matches the checked-in gate fixture byte-for-byte', () => {
    const descriptor = opportunityCardSurface();
    expect(descriptor.moneyFieldsInRenderOrder[0]).toBe('resellerNet');
    const checkedIn = JSON.parse(
      readFileSync(join(appDir, '../../gates/fixtures/surfaces/opportunity-card.json'), 'utf8'),
    );
    expect(descriptor).toEqual(checkedIn);
  });

  it('the card model puts the NET as the primary figure and renders no gross', () => {
    const money = computeWaterfall(WORKED_BASELINE_INPUT);
    const card = buildOpportunityCard(money);
    expect(card.netFcfa).toBe(2_000); // §5.4 baseline resellerNet
    expect(card.customerPriceFcfa).toBe(11_500);
    expect(Object.keys(card)).toEqual(['netFcfa', 'customerPriceFcfa']);
    expect(JSON.stringify(card)).not.toMatch(/gross/i);
  });

  it('FCFA formatting is large plain francs (no decimals, fr-FR grouping, canon FCFA suffix)', () => {
    expect(formatFcfa(2_000)).toBe('2\u202f000\u202fFCFA'); // canon v1.0.1 suffix (U+202F + « FCFA »)
  });
  it('the checked-in shell snapshot equals the pinned waterfall output (Metro-safe, canon-pinned)', () => {
    const snapshot = JSON.parse(
      readFileSync(join(appDir, 'src/opportunity-example.json'), 'utf8'),
    );
    expect(snapshot).toEqual(buildOpportunityCard(computeWaterfall(WORKED_BASELINE_INPUT)));
  });

  it('the shell bundle imports no node-only barrel (runtime imports of contracts/i18n/commerce-core banned)', () => {
    for (const file of ['App.tsx', 'src/i18n.ts', 'src/earnings.ts']) {
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

describe('reseller-app catalog discipline (same law as every app)', () => {
  const catalog = JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as Array<{
    key: string;
  }>;

  it('covers every key the shell uses', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const appSource = readFileSync(join(appDir, 'App.tsx'), 'utf8');
    const usedKeys = [...appSource.matchAll(/(?<![\w.])t\('([^']+)'\)/g)].map((m) => m[1]);
    expect(usedKeys.length).toBeGreaterThan(0);
    for (const key of usedKeys) {
      expect(keys.has(key ?? '')).toBe(true);
    }
  });

  it('no inline French user-facing strings (accented literals) in component code', () => {
    const appSource = readFileSync(join(appDir, 'App.tsx'), 'utf8');
    const codeOnly = appSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/['"«][^'"»]*[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ]/);
  });

  it('app.json static backgroundColor stays equal to the ui-tokens paper (drift guard)', async () => {
    const { shopPlusTheme } = await import('@platform/ui-tokens/legacy');
    const appConfig = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8'));
    expect(appConfig.expo.backgroundColor).toBe(shopPlusTheme.colours.paper);
  });
});
