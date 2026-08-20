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

/**
 * ═══ GROUPES-CLIENTE — a stored grouping is DRAWN on the page she shares ═══
 *
 * THE HOLE THIS FILLS, and how it opened. The reseller app used to carry an
 * in-app replica of the cliente view (`ApercuCliente`), and a walk over it was
 * the ONLY test in either repo that drove a non-empty `sections` through a
 * render. The founder removed that replica's only door on 2026-08-18 (« voir ma
 * boutique en ligne already does the same thing »), the replica went with it,
 * and the coverage went with the replica: every buyer fixture carries
 * `sections: []`, and the one demo profile that holds three real sections has
 * no test asserting a heading against it. So the DATA's survival was proven on
 * the wire while its DRAWING was proven nowhere.
 *
 * The `sections` field is canon and the editor for it left on 2026-08-13, so
 * what is pinned here is exactly what a shop grouped BEFORE that date still
 * gets: her headings, in her order, with her articles under them and counted,
 * each article drawn ONCE.
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

/** Same shop, but with articles PINNED « à la une » — the state that made an
 *  article render twice. */
const renderAvecUne = (
  featuredItems: string[],
  sections: { id: string; name: string; pids: string[] }[],
): string =>
  renderVitrineReady(
    { ...shop(sections), featuredItems } as never,
    TRUST as never, {} as never, {}, PRODUCTS as never, 'classique',
  );

/** Every `<div class="vt-group">…` heading the page drew, in page order. */
function headings(html: string): string[] {
  return [...html.matchAll(/<div class="vt-group"><b>(?:<v>)?([^<]*)/g)].map((m) => m[1]!);
}

/** How many GRID tiles show this article name — the only way to count an
 *  ÉPUISÉ tile, which renders `disabled` and veiled and carries NO `data-pid`
 *  at all (measured, not assumed: a probe over an out-of-stock article found
 *  zero). BOUND: it matches `.vt-tile-name`, the GRID tile's element. The hero
 *  card uses `.vt-featured-name`, so this is blind to it — sound only where the
 *  article cannot be featured, which is exactly the épuisé case it exists for.
 *  Counting an in-stock article with it would report 1 for a doubled tile. */
function parNom(html: string, nom: string): number {
  return html.split(`<div class="vt-tile-name"><v>${nom}</v></div>`).length - 1;
}

/** How many TILES carry this pid — the « drawn once » question.
 *  Anchored on `data-action="produit"` because `data-pid` also rides each
 *  tile's favourite control: counting the bare attribute doubles every tile. */
function tiles(html: string, pid: string): number {
  return html.split(`data-action="produit" data-pid="${pid}"`).length - 1;
}

describe('GROUPES-CLIENTE — her stored grouping reaches the page, headed and counted', () => {
  it('each section heads its own group, in HER order, with HER articles under it', () => {
    // p1 is deliberately NOT grouped: with nothing pinned, the page promotes the
    // first in-stock article to an auto-lead « Produit à la une », and this pin
    // is about GROUPING, not about that promotion.
    const html = render([
      { id: 'sec-t', name: 'Tissus', pids: ['p2', 'p4'] },
      { id: 'sec-s', name: 'Sacs', pids: ['p3'] },
    ]);

    // HER headings, uppercased, in the order she stored them — and BEFORE the
    // residual, which is where the ungrouped articles fall.
    const heads = headings(html);
    expect(heads, `headings drawn: ${JSON.stringify(heads)}`).toEqual(['TISSUS', 'SACS']);
    // …each counted honestly: a heading that lies about its own list is the
    // defect this page has shipped before.
    expect(html).toContain('<div class="vt-group"><b><v>TISSUS</v></b><i>· 2</i></div>');
    expect(html).toContain('<div class="vt-group"><b><v>SACS</v></b><i>· 1</i></div>');

    // her grouped articles are on the page, and each is drawn exactly ONCE —
    // grouped AND residual would be two tiles, two hearts, desynced on tap
    for (const pid of ['p2', 'p3', 'p4']) {
      expect(tiles(html, pid), `${pid} must be drawn exactly once`).toBe(1);
    }
    // and the ungrouped remainder still gets its own honest heading, over the
    // one article that is in no section and is not the lead
    expect(html).toContain(t('vit.head_autres'));
    expect(tiles(html, 'p5')).toBe(1);
    expect(tiles(html, 'p1'), 'the auto-lead is drawn once, as the lead').toBe(1);
  });

  it('an EMPTY section is invisible — never a heading over nothing', () => {
    const html = render([
      { id: 'sec-vide', name: 'Chaussures', pids: [] },
      { id: 'sec-t', name: 'Tissus', pids: ['p2'] },
    ]);
    expect(headings(html), 'an empty section drew a heading').toEqual(['TISSUS']);
    expect(html).not.toContain('CHAUSSURES');
  });

  it('a shop with NO grouping draws no group heading at all — the pins above are not free', () => {
    // The control: without this, every assertion above could be satisfied by a
    // page that heads everything, always.
    const html = render([]);
    expect(headings(html)).toEqual([]);
    // « Autres » rather than « Tous » because the auto-lead came before it —
    // the page's own rule: « autres » only when something stood above.
    expect(html).toContain(t('vit.head_autres'));
  });
});

/**
 * ═══ GROUPES-SANS-DOUBLON — an article is on the page ONCE, wherever it sits ═══
 *
 * FOUNDER, 2026-08-19: « fix the duplicate bug ». An article that was BOTH
 * pinned « à la une » AND inside a section rendered TWICE — once as the hero
 * tile, once under the section heading — on the page a cliente actually buys
 * from, with its heading counting 2 for what is one article.
 *
 * WHAT IT IS NOT, stated because the first draft of this file said otherwise:
 * the two tiles do NOT desync their hearts. `applyFavoriteState` (flows.ts)
 * flips every heart carrying the pid, and favorites.test.ts pins that by
 * EXECUTION. NORTH-STAR-1 closed that half when it de-duplicated the residual
 * grid; what it never did was apply the same exclusion to the SECTIONS. So the
 * harm here is the duplicate tile, the heading that lies about its own list,
 * and — when every article is pinned and grouped — a « Voir tout » pointing at
 * an anchor with nothing beneath it.
 *
 * Nothing drove a non-empty `sections` through the render until 2026-08-19,
 * which is why it was never seen. These pins are written against the broken
 * page first.
 *
 * WHO COULD REACH IT: only a shop grouped before 2026-08-13, when the sections
 * editor left. No shop created since can enter the state — which is why it
 * survived, not why it was acceptable.
 */
describe('GROUPES-SANS-DOUBLON — a pinned article is not redrawn inside its section', () => {
  it('an article pinned « à la une » AND grouped renders ONCE — and its heading counts what it drew', () => {
    const html = renderAvecUne(['p1'], [{ id: 'sec-t', name: 'Tissus', pids: ['p1', 'p2'] }]);

    // THE BUG, stated as the property it broke.
    expect(tiles(html, 'p1'), 'p1 is pinned AND grouped — it must be drawn once').toBe(1);
    // …and the heading counts the list it actually drew. « TISSUS · 2 » over one
    // tile is the same lie in a different place.
    expect(html).toContain('<div class="vt-group"><b><v>TISSUS</v></b><i>· 1</i></div>');
    // the section's OTHER article is untouched — the fix drops one pid, not the group
    expect(tiles(html, 'p2'), 'p2 must still be drawn under her heading').toBe(1);
    // and the ungrouped remainder is unaffected
    for (const pid of ['p3', 'p4', 'p5']) expect(tiles(html, pid)).toBe(1);
  });

  it('a section whose ONLY article is the pinned one disappears — never a heading over nothing', () => {
    const html = renderAvecUne(['p1'], [
      { id: 'sec-t', name: 'Tissus', pids: ['p1'] },
      { id: 'sec-s', name: 'Sacs', pids: ['p2'] },
    ]);
    expect(headings(html), 'a section emptied by the pin still drew a heading').toEqual(['SACS']);
    expect(html).not.toContain('<v>TISSUS</v>');
    expect(tiles(html, 'p1'), 'the pinned article is still on the page, once').toBe(1);
  });

  it('a section whose articles do not RESOLVE vanishes too — the same law, a second cause', () => {
    /**
     * A SECOND BEHAVIOUR CHANGE THIS FIX CARRIES, named rather than left to be
     * discovered. `orderedProducts` silently drops a pid that resolves to no
     * product, and that happens on the LIVE path as well as here: a service
     * response that omits one article (BUYER-LIVE-WIRE-3) leaves her section
     * holding nothing. It used to draw the heading anyway, over an empty grid.
     * Under the « a group left empty does not render » rule it now vanishes —
     * the honest outcome, and the same one an empty `pids` list has always had.
     */
    const html = render([
      { id: 'sec-f', name: 'Fantôme', pids: ['pid-inconnu'] },
      { id: 'sec-s', name: 'Sacs', pids: ['p2'] },
    ]);
    expect(headings(html), 'a section that resolved nothing still drew a heading').toEqual(['SACS']);
    expect(html).not.toContain('<v>FANTÔME</v>');
  });

  it('an ÉPUISÉ pinned article never reaches the hero, so its section still shows it', () => {
    // THE BOUND OF THE FIX, and the page's own existing rule: the exclusion is
    // the pids the featured block ACTUALLY DREW, never the pids she pinned. An
    // out-of-stock pin renders no hero tile, so dropping it from her section
    // would delete it from the page entirely.
    //
    // With p1 épuisé the page falls to its auto-lead — p2 — which is ALSO in
    // her section, so this fixture carries the duplicate a second way.
    const stock = PRODUCTS.map((p) => (p.pid === 'p1' ? { ...p, inStock: false } : p));
    const html = renderVitrineReady(
      { ...shop([{ id: 'sec-t', name: 'Tissus', pids: ['p1', 'p2'] }]), featuredItems: ['p1'] } as never,
      TRUST as never, {} as never, {}, stock as never, 'classique',
    );
    // her épuisé pin is still on the page, in her group, veiled — counted by
    // NAME because an épuisé tile carries no pid
    expect(parNom(html, 'Article 1'), 'an épuisé pin must still appear, voilé, in her section').toBe(1);
    expect(html).toContain('ÉPUISÉ');
    // …and the auto-lead is drawn ONCE, as the lead — not again under TISSUS
    expect(tiles(html, 'p2'), 'the auto-lead was redrawn inside her section').toBe(1);
    expect(html).toContain('<div class="vt-group"><b><v>TISSUS</v></b><i>· 1</i></div>');
  });
});
