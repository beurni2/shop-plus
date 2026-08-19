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

/** Every `<div class="vt-group">…` heading the page drew, in page order. */
function headings(html: string): string[] {
  return [...html.matchAll(/<div class="vt-group"><b>(?:<v>)?([^<]*)/g)].map((m) => m[1]!);
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
