import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CATALOGUES-ORPHELINS-1 — THE CATALOG HOLDS NO STRING NOBODY RENDERS.
 *
 * 69 demo-era keys (the seed's `ventes.*` states, `selection.*`, `pubvitrine.*`,
 * `partager.choisir_titre|cap_note|compte`, `fiche.ligne_commission|ligne_brut|
 * prix_client|…`, `gains.brut|net|total_label|…`, `share.code|kit|…`, `acces.*`
 * door strings from the pre-account era, …) sat in the catalog with no call
 * site; two survived only because `i18n.test.ts` used them as interpolation
 * fixtures. A dead string is a string that can come back on a screen by
 * accident, in a register nobody re-read.
 *
 * ALIVE means: the exact quoted key appears in the app's comment-stripped source
 * (`t('key')`, `tf('key'`, or a constant naming it — `feed-screen.ts` names its
 * chip keys as strings), OR the key is built at runtime from one of the FOUR
 * dynamic stems below (the entête names/subtitles per key, the Cercle recipe
 * tags) — those stems are themselves pinned to the source so the allowance
 * cannot outlive the code that needs it.
 */

const appDir = join(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as { key: string }[];

/** Template-literal stems the source builds keys from (`t(\`k.entete.nom_${key}\`)`). */
const RACINES_DYNAMIQUES = ['k.entete.nom_', 'k.entete.sub_', 'ce.w1_tag_', 'ce.w1_best_'];

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

const SOURCES = [join(appDir, 'App.tsx'), ...fichiers(join(appDir, 'src'), (f) => f.endsWith('.ts') || f.endsWith('.tsx'))];
const texte = SOURCES.map((f) => sansCommentaires(readFileSync(f, 'utf8'))).join('\n');

describe('CATALOGUES-ORPHELINS-1 — every reseller catalog key is rendered by the app, or built from a pinned dynamic stem', () => {
  it('the scan sees the app (the guard on the guard)', () => {
    expect(SOURCES.length).toBeGreaterThan(40);
    expect(catalog.length).toBeGreaterThan(400);
    expect(texte.includes("'ventes.net_ligne'")).toBe(true);
  });

  it('every dynamic stem is really built by the source — an allowance with no builder is an orphan family', () => {
    for (const racine of RACINES_DYNAMIQUES) {
      expect(texte.includes(`\`${racine}\${`), racine).toBe(true);
    }
  });

  it('no catalog key is an orphan', () => {
    const orphelines = catalog
      .map((e) => e.key)
      .filter((k) => !RACINES_DYNAMIQUES.some((r) => k.startsWith(r)))
      .filter((k) => !texte.includes(`'${k}'`) && !texte.includes(`"${k}"`) && !texte.includes(`\`${k}\``));
    expect(orphelines).toEqual([]);
  });
});
