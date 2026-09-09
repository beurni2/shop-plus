import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * BUNDLE-SANS-ZOD-1 (AUDIT-SHOP-2 F-21, F-88) — the buyer surface consumes the
 * WIRE, never the canon package at runtime. One value import of
 * `@platform/contracts` carried zod and every canon schema into the entry
 * (24.8 KB gzip, 19 % of first-load JS) for a one-line slug rule no app code
 * called. These are the SOURCE pins; the byte-level proof (`ZodError` names
 * appear in no built buyer chunk) is `scripts/gates/pwa-payload-budget.mjs`
 * on the fresh build.
 */

const srcDir = join(import.meta.dirname, '../src');

function tousLesTs(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return tousLesTs(chemin);
    return nom.endsWith('.ts') ? [chemin] : [];
  });
}

const fichiers = tousLesTs(srcDir);

describe('the canon package is type-only in the buyer bundle', () => {
  it('every `@platform/contracts` import in src/ is `import type` — no value import can reach the entry', () => {
    const imports = fichiers.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/^import\b[^;]*from '@platform\/contracts';/gm)].map((m) => ({ f, ligne: m[0] })),
    );
    expect(imports.length, 'the scan must still see the imports it guards').toBeGreaterThan(0);
    for (const { f, ligne } of imports) {
      expect(ligne, `${f}: ${ligne}`).toMatch(/^import type \{/);
    }
  });

  it('the [DEMO] tone (voice-asset) is reached ONLY by dynamic import — never statically, or it rides the entry', () => {
    for (const f of fichiers) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} imports voice-asset statically`).not.toMatch(/^import\b[^;]*voice-asset/m);
    }
    const dynamiques = fichiers.filter((f) => /import\('\.\.?\/(?:vitrine\/)?voice-asset'\)/.test(readFileSync(f, 'utf8')));
    expect(dynamiques.map((f) => f.slice(srcDir.length + 1)).sort()).toEqual(['main.ts', 'vitrine/profile.ts']);
  });
});
