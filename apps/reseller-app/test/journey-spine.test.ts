import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOURNEY, START, type Screen } from '../src/journey.js';

/**
 * WO-4.1 spine coverage: the walkable-world promise as assertions. Every
 * screen must be reachable from START by touch (BFS over the journey map),
 * every edge must point at a real screen, and the App must render every
 * screen the map names (source-level pin — a screen in the map with no
 * render block would be a dead end the founder can reach).
 */

const screens = Object.keys(JOURNEY) as Screen[];

describe('reseller journey spine', () => {
  /**
   * CERCLE-FERME-1 (founder, 2026-11-26: hide the demo Cercle until it is
   * built) — the six SP9 screens stay mounted under the scoped override, but
   * no touch reaches them. The list is EXACT both ways: a seventh screen left
   * unreachable, or a door put back into one of these six, turns this red.
   */
  const SANS_PORTE: readonly Screen[] = ['cercle', 'campnew', 'campaign', 'funding', 'reput', 'membres'];

  it('every screen is reachable from START — except exactly the six closed Cercle screens, which are not', () => {
    const seen = new Set<Screen>([START]);
    const queue: Screen[] = [START];
    while (queue.length > 0) {
      for (const next of JOURNEY[queue.shift()!]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const s of screens.filter((x) => !SANS_PORTE.includes(x))) expect(seen.has(s), `unreachable screen: ${s}`).toBe(true);
    expect(screens.filter((x) => !seen.has(x)).sort(), 'the unreachable set must be exactly the closed Cercle').toEqual([...SANS_PORTE].sort());
  });

  it('no edge dangles (every target is a declared screen)', () => {
    for (const s of screens) {
      for (const target of JOURNEY[s]) {
        expect(screens.includes(target), `${s} → ${target}`).toBe(true);
      }
    }
  });

  it('the App renders a block for every screen in the map', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    for (const s of screens) {
      expect(source).toMatch(new RegExp(`screen === '${s}'`));
    }
  });

  it('the App navigates only along journey edges and always offers retour (the demo strip is retired — BANDEAUX-RETIRÉS)', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    expect(source).toMatch(/JOURNEY\[stack\[stack\.length - 1\] \?\? START\]\.includes\(next\)/);
    expect(source).toMatch(/t\('nav\.retour'\)/);
    // BANDEAUX-RETIRÉS (founder, 2026-08-14) — « remove the demo banner at
    // bottom ». The two pins that stood here asserted `nav.recommencer` and
    // `demo.donnees`, the strip's own copy; both the strip and its catalog
    // keys are gone, so the pins invert: neither may come back by accident.
    expect(source).not.toMatch(/nav\.recommencer|demo\.donnees/);
    expect(source).toMatch(/<FlatList/);
  });

  it('the share-link moment renders HER real links — the demo link is retired (PARTAGER-PRO)', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    // PARTAGER-PRO (founder, 2026-08-15) — « remove all the mocks as well and
    // use the real data ». This pin asserted the OPPOSITE: `{DEMO_SHARE_LINK}`
    // and the « lien d'essai » hint on screen. Both inverted: the screen now
    // renders the signed product link and the boutique link from HER storefront,
    // and neither demo byte may come back by accident.
    expect(source).not.toMatch(/DEMO_SHARE_LINK|lien\.hint/);
    expect(source).toMatch(/\{partage\.lienProduit\}/);
    expect(source).toMatch(/\{partage\.lienBoutique\}/);
  });
});
