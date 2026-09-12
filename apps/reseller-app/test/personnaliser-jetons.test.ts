import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pwaColour, sharedColour, shopColour } from '@platform/ui-tokens';
import { K_RAW_STYLES, K_SANS_JETON } from '../src/vitrine/customize/k-styles';

/**
 * PERSONNALISER-JETONS-1 (AUDIT-SHOP-2 F-44) — Personnaliser reads the tokens.
 *
 * The audit counted 141 raw hex colours in the Personnaliser style table and
 * more inline in its screens and the voice sheet: a token change never reached
 * them, and the family DNA held there by discipline alone. Now every colour in
 * the table and the screens is the Faso Premium token that carries its byte,
 * and the few bytes NO token carries live in ONE named map, pinned here so
 * nothing joins it unnoticed.
 */
const lire = (rel: string): string => readFileSync(join(import.meta.dirname, '..', rel), 'utf8');
const HEX = /#[0-9A-Fa-f]{3,8}\b/g;

const TOKEN_BYTES = new Set<string>(
  [...Object.values(sharedColour), ...Object.values(shopColour), ...Object.values(pwaColour)].map((v) => String(v).toUpperCase()),
);

describe('the Personnaliser screens and the voice sheet carry no raw colour', () => {
  for (const f of ['src/vitrine/customize/screens.tsx', 'src/vitrine/customize/voice-sheet.tsx']) {
    it(`${f}: zero hex literals`, () => {
      // comments may cite a byte; code may not carry one
      const code = lire(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code.match(HEX) ?? []).toEqual([]);
    });
  }
});

describe('the style table: every colour is a token byte or one of the named exceptions', () => {
  const flat = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;
  const COLOUR_PROPS = ['color', 'backgroundColor', 'borderColor', 'borderTopColor', 'shadowColor', 'placeholderTextColor'];

  it('runtime: each colour value in K_RAW_STYLES is a token byte or a K_SANS_JETON byte', () => {
    const exceptions = new Set(Object.values(K_SANS_JETON).map((v) => String(v).toUpperCase()));
    const inconnus: string[] = [];
    for (const [name, style] of Object.entries(K_RAW_STYLES)) {
      for (const prop of COLOUR_PROPS) {
        const v = flat(style)[prop];
        if (typeof v !== 'string') continue;
        const u = v.toUpperCase();
        if (!TOKEN_BYTES.has(u) && !exceptions.has(u)) inconnus.push(`${name}.${prop} = ${v}`);
      }
    }
    expect(inconnus, 'colours that are neither a token nor a named exception').toEqual([]);
  });

  it('source: the ONLY hex literals in k-styles.ts are inside K_SANS_JETON — the table itself carries none', () => {
    const src = lire('src/vitrine/customize/k-styles.ts');
    // THE ANCHOR MUST MATCH (verifier): `indexOf` = -1 would slice ONE
    // character and pass this test over a table that no longer exists.
    const debut = src.indexOf('export const K_RAW_STYLES');
    expect(debut, 'the style table marker is gone').toBeGreaterThan(-1);
    const table = src.slice(debut);
    const code = table.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code.match(HEX) ?? []).toEqual([]);
    expect(code).not.toMatch(/rgba\(/);
  });

  it('the exceptions are exactly the thirteen the slice named — nothing joins the list unnoticed', () => {
    expect(Object.keys(K_SANS_JETON).sort()).toEqual([
      'artVoix', 'creme', 'ecoute', 'feuille', 'lisereDanger', 'lisereDemo', 'lisereRefus', 'lisereSable', 'piste', 'sable', 'scrim', 'terre', 'voile',
    ]);
    // …and none of them is secretly a token byte (then it would belong to the token)
    for (const [name, v] of Object.entries(K_SANS_JETON)) {
      expect(TOKEN_BYTES.has(String(v).toUpperCase()), `${name} is a token byte and should read the token`).toBe(false);
    }
  });

  it('the sizes a token carries read the token: card/tile/button/pill radii, the spacing steps, the type scale', () => {
    const src = lire('src/vitrine/customize/k-styles.ts');
    const table = src.slice(src.indexOf('export const K_RAW_STYLES'));
    for (const literal of ['borderRadius: 20', 'borderRadius: 18', 'borderRadius: 16', 'borderRadius: 14', 'borderRadius: 99', 'fontSize: 14.5', 'fontSize: 13,', 'fontSize: 10.5', 'fontSize: 11,', 'fontSize: 19', 'fontSize: 20', 'fontSize: 24']) {
      expect(table, `« ${literal} » should read a token`).not.toContain(literal);
    }
    expect(table.match(/\b(padding|paddingHorizontal|paddingVertical|marginTop|marginBottom|gap): (4|8|12|16|24|34)\b/g) ?? []).toEqual([]);
    expect(table).toContain('borderRadius: radius.card');
    expect(table).toContain('fontSize: t2.scale.row.size');
    expect(table).toContain('padding: spacing.lg');
  });
});
