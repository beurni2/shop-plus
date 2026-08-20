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
import { t } from '../src/i18n';
import { renderVitrineReady } from '../src/vitrine/render';
import { VITRINE_STYLES } from '../src/vitrine/styles';

/**
 * ═══ UNE SEULE GRILLE — the buyer page stops drawing sections ═══
 *
 * FOUNDER, 2026-08-19: « remove sections on buyers page as well ». He had
 * already removed the EDITOR on 2026-08-13 — its own empty state read « Sans
 * sections, une seule grille. » — but the buyer page kept drawing the stored
 * groupings, so every boutique arranged before that date still showed its
 * customers headings nobody could edit any more. Both duplicate-tile defects
 * found on 2026-08-19 lived in exactly that gap.
 *
 * THE FIELD STAYS. `sections` is canon (§5, identical across three specs) and
 * this slice does not touch contract shapes — the wire still carries her stored
 * grouping and `storefront-canon.test.ts` still pins that. What ends is the
 * RENDERING: every article she curated now falls into one grid, in her own
 * curation order.
 *
 * These pins were written against the page that still drew sections, red first.
 */

const HERO = 'https://media.example/media/h.jpg';

const shop = (sections: { id: string; name: string; pids: string[] }[]) => ({
  id: 'sf-s', resellerId: 'rs-s', slug: 'chez-s-1',
  name: 'Chez Awa', zone: 'Dassasgho, Ouagadougou', category: 'Général',
  tagline: '', bio: '', theme: 'foret' as const,
  cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const },
  curatedItems: ['p1', 'p2', 'p3', 'p4', 'p5'],
  featuredItems: [],
  sections,
  discoverable: true, createdAt: 'T', updatedAt: 'T',
});

const TRUST = { deliveredCount: 3, rating: '', reviewCount: 0, demo: false };
const PRODUCTS = Array.from({ length: 5 }, (_, i) => ({
  pid: `p${i + 1}`, name: `Article ${i + 1}`, priceFcfa: 1_000 * (i + 1),
  inStock: true, assetRefs: [HERO],
}));

const render = (sections: { id: string; name: string; pids: string[] }[]): string =>
  renderVitrineReady(shop(sections) as never, TRUST as never, {} as never, {}, PRODUCTS as never, 'classique');

/** Same shop, but with articles PINNED « à la une ». */
const renderAvecUne = (
  featuredItems: string[],
  sections: { id: string; name: string; pids: string[] }[],
): string =>
  renderVitrineReady(
    { ...shop(sections), featuredItems } as never,
    TRUST as never, {} as never, {}, PRODUCTS as never, 'classique',
  );

/** Every group heading the page drew. After this slice it must always be []. */
function headings(html: string): string[] {
  return [...html.matchAll(/<div class="vt-group"><b>(?:<v>)?([^<]*)/g)].map((m) => m[1]!);
}

/** How many TILES carry this pid — the « drawn once » question.
 *  Anchored on `data-action="produit"` because `data-pid` also rides each
 *  tile's favourite control: counting the bare attribute doubles every tile. */
function tiles(html: string, pid: string): number {
  return html.split(`data-action="produit" data-pid="${pid}"`).length - 1;
}

/** How many GRID tiles show this article name — the only way to count an
 *  ÉPUISÉ tile, which renders `disabled` and veiled and carries NO `data-pid`
 *  at all (measured, not assumed: a probe over an out-of-stock article found
 *  zero). BOUND: it matches `.vt-tile-name`, the GRID tile's element. The hero
 *  card uses `.vt-featured-name`, so this is blind to it — sound only where the
 *  article cannot be featured, which is exactly the épuisé case it exists for. */
function parNom(html: string, nom: string): number {
  return html.split(`<div class="vt-tile-name"><v>${nom}</v></div>`).length - 1;
}

describe('UNE SEULE GRILLE — a stored grouping is no longer drawn, and nothing is lost with it', () => {
  it('a shop WITH sections draws no heading, and every article is still on the page ONCE', () => {
    const html = render([
      { id: 'sec-t', name: 'Tissus', pids: ['p2', 'p4'] },
      { id: 'sec-s', name: 'Sacs', pids: ['p3'] },
    ]);

    // NO grouping is drawn — not the headings, not the markup behind them.
    expect(headings(html), 'the buyer page is still drawing sections').toEqual([]);
    expect(html, 'her section names must not reach the page').not.toContain('TISSUS');
    expect(html).not.toContain('SACS');

    // AND NOTHING IS LOST. This is the half that makes the removal safe: every
    // article she curated is still there, exactly once. A removal that dropped
    // her grouped articles would empty her shop.
    for (const pid of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      expect(tiles(html, pid), `${pid} must still be on the page, once`).toBe(1);
    }
  });

  it('a stored grouping changes NOTHING — the same shop with and without one renders identically', () => {
    /**
     * The strongest form of the founder's order, and the one that cannot rot:
     * not « the headings are gone » but « the field no longer reaches the page
     * at all ». Sections used to drive ORDER as well as headings — « Tissus »
     * listing p4 before p2 drew them in that order — so a weaker pin could pass
     * while her grouping still quietly rearranged a cliente's page.
     *
     * (The order is asserted here as whole-HTML identity rather than a pid
     * sequence: `grille` lays two columns that flow independently, so the DOM
     * order is column-major and a naive sequence assertion reads as a bug when
     * it is the documented stagger — GRILLE-ETAGEE, vitrine-grille.test.ts.)
     */
    const groupee = render([
      { id: 'sec-t', name: 'Tissus', pids: ['p4', 'p2'] },
      { id: 'sec-s', name: 'Sacs', pids: ['p3'] },
    ]);
    const sansGroupes = render([]);
    expect(groupee, 'her grouping still reaches the buyer page').toBe(sansGroupes);
    // …and it is a real page, not two empty strings agreeing with each other
    expect(groupee.length).toBeGreaterThan(1000);
    expect(groupee).toContain('data-role="vitrine-trust"');
  });

  it('the heading over that grid is « Autres articles » under a lead — the page keeps its own rule', () => {
    // « autres » only when something stood above. With sections gone, the lead
    // is the only thing that ever can.
    const avecUne = renderAvecUne(['p1'], [{ id: 'sec-t', name: 'Tissus', pids: ['p2'] }]);
    expect(avecUne).toContain(t('vit.head_autres'));
    expect(avecUne).not.toContain(t('vit.head_tous'));
  });

  it('a pinned article is still drawn ONCE — the duplicate cannot come back through a section', () => {
    // GROUPES-SANS-DOUBLON (2026-08-19) fixed this by excluding featured pids
    // from sections. With sections gone the exclusion lives only in the single
    // grid; this pins that the outcome he saw is unchanged.
    const html = renderAvecUne(['p1'], [{ id: 'sec-t', name: 'Tissus', pids: ['p1', 'p2'] }]);
    expect(tiles(html, 'p1'), 'p1 is pinned AND was grouped — it must be drawn once').toBe(1);
    expect(tiles(html, 'p2')).toBe(1);
    expect(headings(html)).toEqual([]);
  });

  it('an article that was in TWO sections is drawn ONCE — the defect left open on 2026-08-19', () => {
    // The second duplicate, closed by this removal rather than by a dedupe:
    // sections were mapped independently, so a pid in two of them drew twice.
    // One grid cannot draw one article twice.
    const html = render([
      { id: 'sec-t', name: 'Tissus', pids: ['p2'] },
      { id: 'sec-s', name: 'Sacs', pids: ['p2'] },
    ]);
    expect(tiles(html, 'p2'), 'an article in two sections drew twice').toBe(1);
  });

  it('an ÉPUISÉ article still shows, veiled, in the one grid', () => {
    const stock = PRODUCTS.map((p) => (p.pid === 'p2' ? { ...p, inStock: false } : p));
    const html = renderVitrineReady(
      shop([{ id: 'sec-t', name: 'Tissus', pids: ['p2'] }]) as never,
      TRUST as never, {} as never, {}, stock as never, 'classique',
    );
    expect(parNom(html, 'Article 2'), 'an épuisé article must not vanish with its section').toBe(1);
    expect(html).toContain('ÉPUISÉ');
  });

  it('the grouping STYLES leave with the markup — no rule left addressing nothing', () => {
    expect(VITRINE_STYLES, '.vt-group CSS outlived the markup it dressed').not.toContain('.vt-group');
  });
});
