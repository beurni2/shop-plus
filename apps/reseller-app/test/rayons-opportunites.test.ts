import { describe, expect, it } from 'vitest';
import { categoriesPresentes, filtrerOffres, labelCategorie } from '../src/vitrine/rayons';
import type { Offer } from '../src/vitrine/offers';

/** CATEGORIES-OPPORTUNITES-1 — the three pure functions, pinned value by value. */

const offre = (pv: string, category?: string): Offer => ({
  productVersionId: pv, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000,
  available: 5, productName: pv, assetRefs: [], ...(category !== undefined ? { category } : {}),
});

describe('labelCategorie — words on her screen, never snake_case, never a crash', () => {
  it('boutik’s French labels pass through untouched', () => {
    for (const c of ['Poussette', 'Mode femme', 'Jeux d’extérieur', 'Assiettes & couverts enfant']) {
      expect(labelCategorie(c)).toBe(c);
    }
  });
  it('the three canon ids get their boutik-equivalent names', () => {
    expect(labelCategorie('fashion_bags_fabrics')).toBe('Mode, sacs & tissus');
    expect(labelCategorie('shoes')).toBe('Chaussures');
    expect(labelCategorie('sealed_beauty_cosmetics')).toBe('Beauté scellée');
  });
  it('an id this map has never met is humanized mechanically — a future canon cannot break the row', () => {
    expect(labelCategorie('kitchen_appliances')).toBe('Kitchen appliances');
    expect(labelCategorie('_x_')).toBe('X');
  });
});

describe('categoriesPresentes — data-driven, first-appearance order, no invention', () => {
  it('distinct categories in the feed’s own order; duplicates and whitespace collapse', () => {
    const feed = [offre('a', 'Poussette'), offre('b', 'Chaussures'), offre('c', ' Poussette '), offre('d', 'Vase')];
    expect(categoriesPresentes(feed)).toEqual(['Poussette', 'Chaussures', 'Vase']);
  });
  it('offers with no usable category earn NO chip — empty, blank and absent are the same nothing', () => {
    expect(categoriesPresentes([offre('a'), offre('b', ''), offre('c', '   ')])).toEqual([]);
  });
});

describe('filtrerOffres — matches the WIRE value, never the label', () => {
  const feed = [offre('a', 'Poussette'), offre('b', 'shoes'), offre('c', ' Poussette '), offre('d')];
  it('null is « Tout » — the list rides through untouched', () => {
    expect(filtrerOffres(feed, null)).toBe(feed);
  });
  it('a category keeps exactly its own products (trim-matched)', () => {
    expect(filtrerOffres(feed, 'Poussette').map((o) => o.productVersionId)).toEqual(['a', 'c']);
    expect(filtrerOffres(feed, 'shoes').map((o) => o.productVersionId)).toEqual(['b']);
  });
  it('a category no offer carries yields the honest empty list — never a fallback', () => {
    expect(filtrerOffres(feed, 'Vase')).toEqual([]);
  });
});
