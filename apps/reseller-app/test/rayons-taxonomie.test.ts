import { describe, expect, it } from 'vitest';
import { RAYONS as RAYONS_PLATEFORME, CATEGORIES as CATEGORIES_PLATEFORME } from '@platform/taxonomy';
import { autresRayons, CATEGORIES, labelCategorie, rayonCanon, RAYONS } from '../src/vitrine/rayons';

/**
 * RAYONS-CANON-1 (founder, 2026-09-12: « Add the product category Maison and
 * the other categories on shop+ ») → TAXONOMIE-CANON-1 (founder, 2026-09-16:
 * the list's home is platform-contracts, canon 3.14.0).
 *
 * This file used to hold a hand copy of Boutik+'s literal and deep-equal the
 * app's mirror against it — the only drift guard two repos could have. The
 * mirror is gone: the app's shelves ARE the platform's (identity, not a
 * copy), and the bytes are pinned once, in `@platform/taxonomy`'s own test.
 * What stays here is what the APP reads off the list.
 */
describe('RAYONS — the app’s shelves are the platform’s, by identity', () => {
  it('the same object as @platform/taxonomy exports — no copy, no drift surface', () => {
    expect(RAYONS).toBe(RAYONS_PLATEFORME);
    expect(CATEGORIES).toBe(CATEGORIES_PLATEFORME);
  });

  it('carries every rayon the founder named — « Maison » first among them', () => {
    for (const c of ['Maison', 'Coiffeuse', 'Draps & housses', 'Vase', 'Décoration', 'Chaussures', 'Beauté scellée']) {
      expect(CATEGORIES.has(c), c).toBe(true);
    }
    expect(RAYONS.flatMap((r) => r.categories)).toHaveLength(30);
  });
});

describe('RAYONS-HERITES-1 — one rayon, whatever its spelling on the wire', () => {
  it('a canon-era id whose label sits on a shelf IS that category; the id with no twin stays itself; a label is itself', () => {
    expect(rayonCanon('shoes')).toBe('Chaussures');
    expect(rayonCanon('sealed_beauty_cosmetics')).toBe('Beauté scellée');
    expect(rayonCanon('fashion_bags_fabrics')).toBe('fashion_bags_fabrics');
    expect(rayonCanon(' Chaussures ')).toBe('Chaussures');
    expect(rayonCanon('Tapis berbère')).toBe('Tapis berbère');
  });

  it('the label still reads as words for every id — the screen’s business, unchanged', () => {
    expect(labelCategorie('shoes')).toBe('Chaussures');
    expect(labelCategorie('fashion_bags_fabrics')).toBe('Mode, sacs & tissus');
  });
});

describe('autresRayons — what the shelves do not know, once each, first appearance wins', () => {
  it('drops the shelves’ own values AND their id-era twins, trims, skips blanks, dedupes across lists, keeps order', () => {
    expect(autresRayons(['shoes', ' Vase ', 'Maison'], ['sealed_beauty_cosmetics', 'Tapis berbère'], ['', 'Vase'])).toEqual(['Tapis berbère']);
  });
  it('the id with no twin is its own rayon, kept as the id (never rewritten)', () => {
    expect(autresRayons(['fashion_bags_fabrics'])).toEqual(['fashion_bags_fabrics']);
  });
  it('empty lists give an empty list — no « Autres rayons » group without a reason', () => {
    expect(autresRayons([], [], [])).toEqual([]);
    expect(autresRayons()).toEqual([]);
  });
});
