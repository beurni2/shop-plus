import { describe, expect, it } from 'vitest';
import { autresRayons, CATEGORIES_BOUTIK, labelCategorie, RAYONS_BOUTIK } from '../src/vitrine/rayons';

/**
 * RAYONS-CANON-1 (founder order 2026-09-12: « Add the product category Maison
 * and the other categories on shop+ … the product with the video was added
 * under the category Maison on boutik+ ») — THE MIRROR IS BYTE-EXACT.
 *
 * `RAYONS_BOUTIK` is a hand copy of Boutik+'s wizard taxonomy
 * (boutik-plus/apps/supplier-app/src/v2/categorie-details.ts, `RAYONS`). The
 * wire carries the category label verbatim, so one changed letter is a
 * different rayon that never matches a product. No shared package carries the
 * taxonomy yet (the category floor is an open founder decision), so this
 * literal — copied from Boutik+ by hand, on purpose — is the only cross-repo
 * drift guard available: a mirror edit is then a deliberate edit in two files.
 */
const BOUTIK_RAYONS_2026_08_23 = [
  { titre: 'Bébé — sortie & voyage', categories: ['Siège auto', 'Poussette'] },
  { titre: 'Bébé — chambre', categories: ['Lit petit enfant', 'Lit à barreaux', 'Couffin'] },
  { titre: 'Bébé — bain', categories: ['Baignoire bébé', 'Bassine de bain', 'Tapis de bain', 'Serviette bébé'] },
  { titre: 'Bébé — repas', categories: ['Chaise haute', 'Assiettes & couverts enfant', 'Table de repas enfant', 'Bavoir'] },
  { titre: 'Jouets & jeux', categories: ['Petites voitures', 'Jeux éducatifs', 'Poupées & dînette', "Jeux d'extérieur", 'Vélo enfant'] },
  { titre: 'Maison & chambre', categories: ['Coiffeuse', 'Draps & housses', 'Vase', 'Décoration', 'Maison'] },
  { titre: 'Mode & tissus', categories: ['Mode femme', 'Mode homme', 'Enfant', 'Chaussures', 'Sacs', 'Tissus'] },
  { titre: 'Beauté', categories: ['Beauté scellée'] },
];

describe('RAYONS_BOUTIK — a byte-exact mirror of Boutik+’s shelves', () => {
  it('deep-equals the Boutik+ literal: every shelf, every category, same order', () => {
    expect(RAYONS_BOUTIK).toEqual(BOUTIK_RAYONS_2026_08_23);
  });

  it('8 shelves, 30 categories, none blank, none twice, each within the account book’s 64-char bound, every shelf titled', () => {
    expect(RAYONS_BOUTIK).toHaveLength(8);
    const all = RAYONS_BOUTIK.flatMap((r) => r.categories);
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
    for (const c of all) {
      expect(c.trim()).toBe(c);
      expect(c).not.toBe('');
      expect(c.length).toBeLessThanOrEqual(64);
    }
    for (const r of RAYONS_BOUTIK) expect(r.titre.trim()).not.toBe('');
    expect(CATEGORIES_BOUTIK.size).toBe(30);
  });

  it('carries every rayon the founder named — « Maison » first among them', () => {
    for (const c of ['Maison', 'Coiffeuse', 'Draps & housses', 'Vase', 'Décoration', 'Chaussures', 'Beauté scellée']) {
      expect(CATEGORIES_BOUTIK.has(c), c).toBe(true);
    }
  });

  it('spells « Jeux d’extérieur » with the STRAIGHT apostrophe (U+0027), as Boutik+ publishes it', () => {
    const jeux = RAYONS_BOUTIK.find((r) => r.titre === 'Jouets & jeux')!.categories.find((c) => c.startsWith('Jeux d'))!;
    expect(jeux.charCodeAt(6)).toBe(0x27);
    expect(jeux).toBe("Jeux d'extérieur");
  });

  it('the legacy canon ids: shoes and sealed_beauty_cosmetics resolve to names INSIDE the mirror; fashion_bags_fabrics deliberately does not', () => {
    expect(CATEGORIES_BOUTIK.has(labelCategorie('shoes'))).toBe(true);
    expect(CATEGORIES_BOUTIK.has(labelCategorie('sealed_beauty_cosmetics'))).toBe(true);
    // « Mode, sacs & tissus » is a canon-era name Boutik+ split into three
    // shelves' worth of categories; it lands under « Autres rayons ».
    expect(CATEGORIES_BOUTIK.has(labelCategorie('fashion_bags_fabrics'))).toBe(false);
  });
});

describe('autresRayons — what the mirror does not know, once each, first appearance wins', () => {
  it('drops the mirror’s own values, trims, skips blanks, dedupes across lists, keeps order', () => {
    expect(autresRayons(['shoes', ' Vase ', 'Maison'], ['shoes', 'Tapis berbère'], ['', 'Vase'])).toEqual(['shoes', 'Tapis berbère']);
  });
  it('empty lists give an empty list — no « Autres rayons » group without a reason', () => {
    expect(autresRayons([], [], [])).toEqual([]);
    expect(autresRayons()).toEqual([]);
  });
  it('never rewrites a wire value: a legacy id rides as the id, its label is the screen’s business', () => {
    expect(autresRayons(['fashion_bags_fabrics'])).toEqual(['fashion_bags_fabrics']);
  });
});
