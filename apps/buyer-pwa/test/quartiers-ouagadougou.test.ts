import { describe, expect, it } from 'vitest';
import {
  QUARTIERS_OUAGADOUGOU,
  QUARTIERS_PAR_ARRONDISSEMENT,
  filtrerQuartiers,
} from '../src/cliente/quartiers-ouagadougou';

/**
 * QUARTIERS-OUAGA-1 (founder order 2026-08-22): « not all quartiers from
 * Ouagadougou are displayed… source all quartiers from an up to date doc. »
 * The doc is the official répartition of the CURRENT structure — Loi
 * n°066-2009/AN, 12 arrondissements — cross-checked across five independent
 * reproductions (sourced in the module header). These pins hold the list to
 * that document: the 12 arrondissements all present, the flat list deduped
 * and alphabetical, and every quartier the app shipped BEFORE this slice
 * still choosable (nothing a returning buyer picked disappears).
 */
describe('the official list — complete, deduped, ordered', () => {
  it('all 12 arrondissements are present, each with its quartiers', () => {
    expect(QUARTIERS_PAR_ARRONDISSEMENT.map((a) => a.arrondissement)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const a of QUARTIERS_PAR_ARRONDISSEMENT) expect(a.quartiers.length).toBeGreaterThan(0);
  });

  it('the flat list is DEDUPED (Dassasgho straddles two arrondissements and appears once) and alphabetical, accent-aware', () => {
    expect(new Set(QUARTIERS_OUAGADOUGOU).size).toBe(QUARTIERS_OUAGADOUGOU.length);
    expect(QUARTIERS_OUAGADOUGOU.filter((q) => q === 'Dassasgho')).toHaveLength(1);
    const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const sorted = [...QUARTIERS_OUAGADOUGOU].sort((a, b) => (fold(a) < fold(b) ? -1 : fold(a) > fold(b) ? 1 : 0));
    expect(QUARTIERS_OUAGADOUGOU).toEqual(sorted);
  });

  it('the count is EXACTLY the sourced répartition: 78 rows, 77 after the Dassasgho dedupe', () => {
    // Pinned exact (verifier note): the module header claims cross-repo drift
    // is caught by these pins, and a ≥70 floor lets a dropped or misspelled
    // non-canary name through. 77 is the claim.
    expect(QUARTIERS_PAR_ARRONDISSEMENT.flatMap((a) => a.quartiers)).toHaveLength(78);
    expect(QUARTIERS_OUAGADOUGOU).toHaveLength(77);
  });

  it("every quartier the app shipped BEFORE this slice is still choosable — except plain « Gounghin », which the official doc splits into Sud/Nord", () => {
    for (const q of ['Dassasgho', 'Pissy', 'Tampouy', 'Wemtenga', 'Zogona', 'Cissin', 'Somgandé']) {
      expect(QUARTIERS_OUAGADOUGOU).toContain(q);
    }
    expect(QUARTIERS_OUAGADOUGOU).toContain('Gounghin Sud');
    expect(QUARTIERS_OUAGADOUGOU).toContain('Gounghin Nord');
  });

  it('the landmark names a buyer expects are all here', () => {
    for (const q of ['Ouaga 2000', "Patte d'Oie", 'Tanghin', 'Karpala', 'Kilwin', 'Rimkièta', 'Hamdalaye', 'Larlé', 'Koulouba', 'Bissighin', 'Kossodo', 'Bendogo']) {
      expect(QUARTIERS_OUAGADOUGOU).toContain(q);
    }
  });
});

describe('filtrerQuartiers — deterministic, accent- and case-insensitive (SP-I11: never a relevance score)', () => {
  it('an empty query answers the whole list', () => {
    expect(filtrerQuartiers('')).toEqual(QUARTIERS_OUAGADOUGOU);
    expect(filtrerQuartiers('   ')).toEqual(QUARTIERS_OUAGADOUGOU);
  });

  it('a substring narrows, accents and case folded both ways', () => {
    expect(filtrerQuartiers('goun')).toEqual(['Gounghin Nord', 'Gounghin Sud']);
    expect(filtrerQuartiers('LARLE')).toEqual(['Larlé', 'Larlé Wéogo']);
    expect(filtrerQuartiers('rimkieta')).toEqual(['Rimkièta']);
  });

  it('no match answers the empty list — the screen offers her typed text instead, never a dead end', () => {
    expect(filtrerQuartiers('Zone du Bois')).toEqual([]);
  });
});
