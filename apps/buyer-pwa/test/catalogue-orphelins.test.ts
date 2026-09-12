import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CATALOGUES-ORPHELINS-1 — THE CATALOG HOLDS NO STRING NOBODY RENDERS.
 *
 * 110 prototype-era keys (`discover.*`, `order.*`, `checkout.*`, `produit.*`,
 * `suivi.*`, `protections.*`, `lieu.*`, `voix.*`, `livraison.*`, `confirmation.*`,
 * `vitrine.chez|verifiee|protege|prix|epuise`, `vit.ne_street`, …) sat in the
 * catalog with no call site — the old shell's copy, kept alive by nothing but
 * the file itself, and in two cases by a test that pinned their survival. A
 * dead string is a string that can come back on a screen by accident, in a
 * register nobody re-read; the `cl.` half of this rule already lives in
 * `cliente-catalogue.test.ts`. This is the whole-catalog version.
 *
 * ALIVE means: the exact quoted key appears in the app's comment-stripped source
 * (`t('key')`, `tf('key'`, or a constant naming it), OR the key is named BY
 * REFERENCE from another package — the two below are carried as message refs
 * by the attribution lock (`buyerMessageRef: 'attribution.collision'`) and the
 * commerce-core problem path (`humanReasonRef: 'order.problem.ack'`), so
 * « nothing names it » is false for them and they stay.
 */

const appDir = join(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as { key: string }[];

/** Keys another package names by reference — see the header. */
const NOMMEES_AILLEURS = new Set(['attribution.collision', 'order.problem.ack']);

function fichiers(dir: string, garde: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (nom === 'node_modules' || nom.startsWith('.')) continue;
    if (statSync(p).isDirectory()) out.push(...fichiers(p, garde));
    else if (garde(p)) out.push(p);
  }
  return out;
}

const sansCommentaires = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SOURCES = [
  ...fichiers(join(appDir, 'src'), (f) => f.endsWith('.ts')),
  ...fichiers(join(appDir, 'scripts'), (f) => f.endsWith('.ts') || f.endsWith('.mjs')),
  join(appDir, 'index.html'),
];
const texte = SOURCES.map((f) => sansCommentaires(readFileSync(f, 'utf8'))).join('\n');

describe('CATALOGUES-ORPHELINS-1 — every buyer catalog key is rendered by the app, or named by reference', () => {
  it('the scan sees the app (the guard on the guard)', () => {
    expect(SOURCES.length).toBeGreaterThan(40);
    expect(catalog.length).toBeGreaterThan(400);
    // a live key the shell renders is found by the same rule the pin uses
    expect(texte.includes("'cl.protections.titre'")).toBe(true);
  });

  it('no catalog key is an orphan', () => {
    const orphelines = catalog
      .map((e) => e.key)
      .filter((k) => !NOMMEES_AILLEURS.has(k))
      .filter((k) => !texte.includes(`'${k}'`) && !texte.includes(`"${k}"`) && !texte.includes(`\`${k}\``));
    expect(orphelines).toEqual([]);
  });

  it('the two keys kept by reference are still referenced where the header says', () => {
    const lock = readFileSync(join(appDir, '../../services/attribution-service/src/lock.ts'), 'utf8');
    expect(lock).toContain("'attribution.collision'");
    const probleme = readFileSync(join(appDir, '../../packages/commerce-core/test/e2-failure-paths.test.ts'), 'utf8');
    expect(probleme).toContain("'order.problem.ack'");
    for (const k of NOMMEES_AILLEURS) expect(catalog.some((e) => e.key === k), k).toBe(true);
  });
});
