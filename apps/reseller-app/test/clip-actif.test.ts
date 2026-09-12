import { describe, expect, it } from 'vitest';
import { choisirClipActif } from '../src/ui/clip-actif';

/**
 * OPPORTUNITES-LEGER-1 (AUDIT-SHOP-2 F-49) — the viewport rule, with a scroll
 * position handed in. The walk proves the grid asks for ONE player; this
 * proves WHICH tile gets it as she scrolls, on the pure decision the grid
 * calls with what its layout events reported.
 */
const o = (pid: string, clip = true) => ({ productVersionId: pid, ...(clip ? { videoRef: `https://media.test/${pid}.mp4` } : {}) });
const OFFRES = [o('a'), o('b', false), o('c'), o('d')];
/** two columns of tiles, 300 tall, the grid starting 200 into the content */
const MESURES = new Map([
  ['a', { y: 0, h: 300 }],
  ['b', { y: 0, h: 300 }],
  ['c', { y: 310, h: 300 }],
  ['d', { y: 310, h: 300 }],
]);
const GRILLE_Y = 200;

describe('choisirClipActif — the tile in view plays', () => {
  it('no layout yet (viewport height 0): the FIRST clip tile in order, so the top of the list moves at once', () => {
    expect(choisirClipActif(OFFRES, new Map(), GRILLE_Y, { y: 0, h: 0 })).toBe('a');
    expect(choisirClipActif(OFFRES, MESURES, GRILLE_Y, { y: 0, h: 0 })).toBe('a');
  });

  it('no clip anywhere: nobody plays', () => {
    expect(choisirClipActif([o('b', false), o('x', false)], MESURES, GRILLE_Y, { y: 0, h: 600 })).toBeNull();
    expect(choisirClipActif([], new Map(), 0, { y: 0, h: 600 })).toBeNull();
  });

  it('at the top, the first row is in view: « a » plays; scrolled past it, the second row: « c » plays — never « b », which has no clip', () => {
    expect(choisirClipActif(OFFRES, MESURES, GRILLE_Y, { y: 0, h: 600 })).toBe('a');
    // scrolled so the first row (200..500) is out and the second (510..810) is in
    expect(choisirClipActif(OFFRES, MESURES, GRILLE_Y, { y: 520, h: 600 })).toBe('c');
  });

  it('the tile with MORE of itself in view wins; a tie keeps the earlier one, so nothing flickers', () => {
    // viewport 400..700: « a » shows 100 (400..500), « c » shows 190 (510..700)
    expect(choisirClipActif(OFFRES, MESURES, GRILLE_Y, { y: 400, h: 300 })).toBe('c');
    // viewport 405..605: « a » shows 95 (405..500), « c » shows 95 (510..605) — a tie → « a »
    expect(choisirClipActif(OFFRES, MESURES, GRILLE_Y, { y: 405, h: 200 })).toBe('a');
  });

  it('a tile that has not reported its layout is skipped, never guessed; the measured one plays', () => {
    const partiel = new Map([['c', { y: 310, h: 300 }]]);
    expect(choisirClipActif(OFFRES, partiel, GRILLE_Y, { y: 0, h: 600 })).toBe('c');
    // …and with NO measured clip tile at all, the first-in-order rule stands
    expect(choisirClipActif(OFFRES, new Map([['b', { y: 0, h: 300 }]]), GRILLE_Y, { y: 0, h: 600 })).toBe('a');
  });
});
