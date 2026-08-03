// node env has no localStorage; the vitrine's favourites pins need a fake.
const __m = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => __m.get(k) ?? null,
  setItem: (k: string, v: string) => void __m.set(k, v),
  removeItem: (k: string) => void __m.delete(k),
  clear: () => __m.clear(),
  key: (i: number) => [...__m.keys()][i] ?? null,
  get length() { return __m.size; },
} as Storage;
import { describe, expect, it } from 'vitest';
import { renderVitrineReady } from '../src/vitrine/render';
import { VITRINE_STYLES } from '../src/vitrine/styles';

/**
 * GRILLE-ETAGEE — « Apply all these changes on ma boutique/storefront as well,
 * the size, the space scale, the square, etc » (founder order 2026-08-03),
 * carrying the opportunités treatment onto the shop page clients actually see.
 *
 * Three properties, each pinned against the mechanism that would undo it:
 *   1 SIZE + SPACE  — the cards are ~48.5% of the screen, by arithmetic.
 *   2 STAGGER       — two columns that flow independently; no row can re-form.
 *   3 THE SQUARE    — no fixed art height; the photograph decides, within bounds.
 */

const SF = {
  id: 'sf-g', resellerId: 'rs-g', slug: 'chez-g-1',
  name: 'Chez Awa', zone: 'Dassasgho, Ouagadougou', category: 'Général',
  tagline: '', bio: '', theme: 'foret' as const,
  cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const },
  curatedItems: ['p1', 'p2', 'p3', 'p4', 'p5'], featuredItems: ['p1'], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 3, rating: '', reviewCount: 0, demo: false };
const HERO = 'https://media.example/media/h.jpg';
const prods = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    pid: `p${i + 1}`, name: `Article ${i + 1}`, priceFcfa: 1_000 * (i + 1),
    inStock: true, assetRefs: [HERO],
  }));
const html = (n = 5): string =>
  renderVitrineReady(SF as never, TRUST as never, {} as never, {}, prods(n) as never, 'classique');

describe('1 · SIZE + SPACE SCALE — the card matches the founder reference', () => {
  it('the grid ESCAPES the page padding instead of the page losing it', () => {
    // The page keeps 20px for TEXT; only the grid pulls out to 4px. Shrinking
    // `.vt-scroll` instead would shove the whole page against the bezel — the
    // tempting one-line version of this change, and the wrong one.
    expect(VITRINE_STYLES).toContain('.vt-scroll { padding: 16px 20px 46px; }');
    expect(VITRINE_STYLES).toMatch(/\.vt-grid \{[^}]*margin: 10px -16px 0/);
    expect(VITRINE_STYLES).toMatch(/\.vt-grid \{[^}]*gap: 4px/);
  });

  it('the arithmetic those numbers produce, asserted rather than trusted', () => {
    // 390 − (4×2) − 4 = 378, halved = 189px = 48.5%; reference 206/428 = 48.1%.
    const SCREEN = 390;
    const card = (outer: number, gutter: number) => (SCREEN - outer * 2 - gutter) / 2;
    expect(card(4, 4)).toBe(189);
    expect(card(20, 12)).toBe(169); // the old geometry, kept as the contrast
    expect(card(4, 4) / SCREEN).toBeCloseTo(0.485, 3);
    expect(Math.abs(card(4, 4) / SCREEN - 206 / 428)).toBeLessThan(0.005);
    // and it IS an increase — the direction of the founder's order, as maths
    expect(card(4, 4)).toBeGreaterThan(card(20, 12));
  });
});

describe('2 · STAGGER — two columns that cannot line up again', () => {
  it('the grid emits TWO independent columns, not tiles in a row-based grid', () => {
    const h = html(5);
    expect(h.split('class="vt-col"').length - 1).toBe(2);
    // `grid-template-columns` is the mechanism that locked the rows. Its absence
    // from the grid rule is the slice; a naive `not.toContain` over the whole
    // stylesheet would hit the hero, which legitimately still uses one.
    const rule = /\.vt-grid \{[^}]*\}/.exec(VITRINE_STYLES)?.[0] ?? '';
    expect(rule).not.toContain('grid-template-columns');
    expect(rule).toContain('display: flex');
    // …and `align-items: flex-start`, or flex's default STRETCH pulls the short
    // column to the tall one's height and the stagger silently dies.
    expect(rule).toContain('align-items: flex-start');
  });

  it('the split is ALTERNATING, so her arrangement order survives the layout', () => {
    // CSS column-count would have staggered in one line but fills COLUMN-MAJOR:
    // 1-2-3 down the left, 4-5-6 down the right. Reading order is hers.
    const h = html(5);
    const cols = h.split('class="vt-col"');
    // featured p1 is hoisted to the hero, so the grid holds p2…p5:
    // evens of that list (p2, p4) left, odds (p3, p5) right.
    expect(cols[1]).toContain('Article 2');
    expect(cols[1]).toContain('Article 4');
    expect(cols[1]).not.toContain('Article 3');
    expect(cols[2]).toContain('Article 3');
    expect(cols[2]).toContain('Article 5');
  });

  it('an ODD count simply ends one column early — no spacer, no stretched tile', () => {
    const h = html(4); // p1 featured ⇒ 3 tiles in the grid
    const cols = h.split('class="vt-col"');
    expect(cols[1]).toContain('Article 2');
    expect(cols[1]).toContain('Article 4');
    expect(cols[2]).toContain('Article 3');
    expect(cols[2]).not.toContain('Article 4');
  });
});

describe('3 · THE SQUARE IS DROPPED — the photograph decides its own height', () => {
  it('no fixed art height survives on the GRID tile', () => {
    const rule = /\.vt-tile-art \{[^}]*\}/.exec(VITRINE_STYLES)?.[0] ?? '';
    expect(rule).not.toContain('height:');
    // the photo sizes itself — `position: absolute; inset: 0` would make it fill
    // a parent that now has no height of its own, collapsing the card to zero
    expect(VITRINE_STYLES).toMatch(/\.vt-tile-photo \{[^}]*height: auto/);
    expect(VITRINE_STYLES).not.toMatch(/\.vt-tile-photo \{[^}]*position: absolute/);
  });

  it('BOUNDED — one panorama or one screenshot cannot own the column', () => {
    for (const sel of ['.vt-tile-photo', '.vt-video-hero']) {
      // ANCHORED TO THE START OF A RULE (`^\s*`, multiline). Unanchored, this
      // matched `.vt-featured .vt-video-hero { … min-height: 0 }` — the hero's
      // deliberate override — and reported the BASE rule as unbounded. The test
      // was right that something was wrong; it was wrong about which rule.
      const rule = new RegExp(`^\\s*\\${sel} \\{[^}]*\\}`, 'm').exec(VITRINE_STYLES)?.[0] ?? '';
      expect(rule, `${sel}: no base rule found`).not.toBe('');
      expect(rule, `${sel} unbounded`).toContain('min-height: 120px');
      expect(rule, `${sel} unbounded`).toContain('max-height: 260px');
      expect(rule, `${sel} lost its fit law`).toContain('object-fit: cover');
    }
  });

  it('A CLIP FOLLOWS THE SAME HEIGHT LAW as a photograph', () => {
    // `height: 100%` on the clip would resolve against the now-auto-height
    // parent and collapse the tile — a real bug, not a style preference.
    expect(VITRINE_STYLES).toMatch(/\.vt-video-hero \{[^}]*height: auto/);
  });

  it('SANS PHOTO KEEPS A HEIGHT — there is no photograph to derive one from', () => {
    // Without this the woven habillage collapses and the honest no-photo state
    // becomes a bare caption. 132px is exactly what every tile used to be.
    expect(VITRINE_STYLES).toMatch(/\.vt-tile-art-sansphoto \{[^}]*height: 132px/);
    expect(VITRINE_STYLES).toMatch(/\.vt-tile-art-sansphoto \{[^}]*align-items: center/);
  });

  it('THE « À LA UNE » HERO KEEPS ITS DESIGNED HEIGHT, and its media fills it', () => {
    // One full-width card aligns with nothing, so the stagger has no work for
    // it; and a portrait photo at 420px would push the grid below the fold.
    expect(VITRINE_STYLES).toContain('.vt-featured .vt-tile-art { height: 210px; }');
    // the override is load-bearing: inherited `height: auto` would float the
    // hero photo inside a 210px box with the sand background showing through
    expect(VITRINE_STYLES).toMatch(/\.vt-featured \.vt-tile-photo,\s*\n?\s*\.vt-featured \.vt-video-hero \{ height: 100%/);
  });
});
