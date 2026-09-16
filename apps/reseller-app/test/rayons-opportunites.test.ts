import { describe, expect, it } from 'vitest';
import { categoriesPresentes, filtrerOffres, filtrerParSelection, labelCategorie } from '../src/vitrine/rayons';
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

/**
 * RAYONS-HERITES-1 (founder, 2026-09-16: « fix the 3 that is still open ») —
 * an account that chose `shoes` in the id era and a product Boutik+ publishes
 * as « Chaussures » today are ONE rayon: they match, they count once, they
 * share one chip.
 */
describe('RAYONS-HERITES-1 — a canon-era id and its shelf label are one rayon everywhere', () => {
  const feed = [offre('a', 'shoes'), offre('b', 'Chaussures'), offre('c', 'Poussette'), offre('d', 'fashion_bags_fabrics')];
  it('categoriesPresentes lists the rayon ONCE, under its label, in first-appearance order; the id with no twin stays itself', () => {
    expect(categoriesPresentes(feed)).toEqual(['Chaussures', 'Poussette', 'fashion_bags_fabrics']);
  });
  it('filtrerOffres on the label OR the id keeps BOTH spellings’ products', () => {
    expect(filtrerOffres(feed, 'Chaussures').map((o) => o.productVersionId)).toEqual(['a', 'b']);
    expect(filtrerOffres(feed, 'shoes').map((o) => o.productVersionId)).toEqual(['a', 'b']);
  });
  it('a selection saved as `shoes` narrows to today’s « Chaussures » products too — the reseller who chose in the id era sees the feed again', () => {
    expect(filtrerParSelection(feed, ['shoes']).map((o) => o.productVersionId)).toEqual(['a', 'b']);
    expect(filtrerParSelection(feed, ['fashion_bags_fabrics']).map((o) => o.productVersionId)).toEqual(['d']);
  });
});
