import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CONFIANCE-LISIBLE-1 (AUDIT-SHOP-2 F-25) — THE TOKEN-FIDELITY FLOOR on the
 * twenty-eight header style files. The audit measured trust-row and proof text at
 * 8–9.5 px across ~20 styles — the three trust cells (« Livraison Séra
 * vérifiée & scellée » · « Paiement protégé » · « Les meilleurs prix
 * garantis ») were the smallest, faintest text on the page, for Aïcha in
 * sunlight. Charter §5: « large readable type … verified proof gets visual
 * treatment ».
 *
 * The floor: no `font-size` under 10 px anywhere in a header style, and the
 * trust-cell LABEL (`-cell-l`) at 11 px or more. Contrast is measured in the
 * real renderer (e2e/entetes-lisibilite.spec.ts) — a static scan cannot see
 * a gradient behind a word.
 */

const dossier = join(import.meta.dirname, '../src/vitrine/entetes');
const styles = readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'registry.ts');

/** Every `{ … }` rule body with its selector, container queries flattened. */
function regles(source: string): Array<{ selecteur: string; corps: string }> {
  return [...source.matchAll(/([^{}]+?)\s*\{([^{}]*)\}/g)].map((m) => ({
    selecteur: (m[1] ?? '').trim().split('\n').pop()?.trim() ?? '',
    corps: m[2] ?? '',
  }));
}

describe('CONFIANCE-LISIBLE-1 — the floor holds in every header style', () => {
  it('scans all 28 style files (classique lives in vitrine/styles.ts; registry.ts is the loader)', () => {
    expect(styles.length).toBe(28);
  });

  for (const fichier of styles) {
    it(`${fichier}: no font-size under 10 px, and every -cell-l label at 11 px or more`, () => {
      const source = readFileSync(join(dossier, fichier), 'utf8');
      const tailles = [...source.matchAll(/font-size:\s*([0-9.]+)px/g)].map((m) => Number(m[1]));
      expect(tailles.length, 'the scan must still see sizes').toBeGreaterThan(0);
      for (const t of tailles) expect(t, `${fichier} carries a ${t}px face`).toBeGreaterThanOrEqual(10);
      for (const { selecteur, corps } of regles(source)) {
        if (!/cell-l\b/.test(selecteur)) continue;
        const m = /font-size:\s*([0-9.]+)px/.exec(corps);
        if (m === null) continue;
        expect(Number(m[1]), `${fichier} ${selecteur}`).toBeGreaterThanOrEqual(11);
      }
    });
  }
});
