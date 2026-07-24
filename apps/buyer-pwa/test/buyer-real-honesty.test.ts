import { describe, expect, it } from 'vitest';
import { demoStorefrontPort, httpStorefrontPort } from '../src/vitrine/profile';
import { renderVitrineReady } from '../src/vitrine/render';
import { VITRINE_SEED } from '../src/vitrine/catalog';
import { VITRINE_THEMES, type VitrineThemeKey } from '../src/vitrine/themes';
import type { Storefront } from '@platform/contracts';

/**
 * BUYER-REAL-HONESTY-1 — what a REAL shop with nothing in it honestly looks like.
 *
 * This is the slice that must merge before VITE_STOREFRONT_BASE is ever set. Every
 * assertion below protects one rule: a real reseller's page never wears another
 * reseller's proof, never plays another reseller's voice, never shows another
 * reseller's catalogue, and never lets an ornament pass for the product.
 */

const resolved = (await demoStorefrontPort('default').resolve('aicha-4821'))!;

/** A REAL storefront view as `GET /s/{slug}` returns it — real slug, real pids. */
const REAL_VIEW: Storefront = {
  ...resolved.storefront,
  id: 'sf_real_1',
  resellerId: 'res_real_1',
  slug: 'binta-7412',
  name: 'Chez Binta',
  // REAL pids from the service — deliberately NOT demo-seed pids.
  curatedItems: ['pv_real_a', 'pv_real_b'],
  featuredItems: [],
  sections: [],
};

/** Stub `GET /s/{slug}` with one real storefront; no network, no demo fallback. */
function withStubbedFetch<T>(body: unknown, status: number, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

describe('item 1 + 2 — a REAL storefront carries ABSENT trust and NO borrowed voice notes', () => {
  it('FABRICATED-TRUST-REMOVED: the real port returns zero deliveries, no rating, zero reviews — never the demo 16 / 4,8 / 12', async () => {
    const got = await withStubbedFetch(REAL_VIEW, 200, () => httpStorefrontPort('https://svc.example').resolve('binta-7412'));
    expect(got).toBeDefined();
    expect(got!.storefront.slug).toBe('binta-7412'); // it IS the real storefront
    expect(got!.trust).toEqual({ deliveredCount: 0, rating: '', reviewCount: 0, demo: false });
    // the exact fabricated values this slice removed — social proof she never earned
    expect(got!.trust.deliveredCount).not.toBe(16);
    expect(got!.trust.rating).not.toBe('4,8');
    expect(got!.trust.reviewCount).not.toBe(12);
  });

  it('BORROWED-VOICE-REMOVED: the real port returns NO notes — a real page never plays another reseller’s recorded voice', async () => {
    const got = await withStubbedFetch(REAL_VIEW, 200, () => httpStorefrontPort('https://svc.example').resolve('binta-7412'));
    expect(got!.notes).toEqual({});
    expect(Object.keys(got!.notes)).toHaveLength(0);
    // the demo notes are keyed by demo pids — none may ride the real path
    for (const pid of ['p1', 'p2', 'p5', 'k1']) expect(got!.notes[pid]).toBeUndefined();
  });

  it('THE DEMO PORT IS UNTOUCHED — the offline harness keeps its demo trust and demo notes', async () => {
    expect(resolved.trust).toEqual({ deliveredCount: 16, rating: '4,8', reviewCount: 12, demo: true });
    expect(Object.keys(resolved.notes).length).toBeGreaterThan(0);
    expect(resolved.notes['p1']?.status).toBe('ready');
  });

  it('a non-2xx and a non-storefront body BOTH stay the honest not-found (never a neighbouring store)', async () => {
    const missing = await withStubbedFetch({ error: 'not_found' }, 404, () =>
      httpStorefrontPort('https://svc.example').resolve('inconnue-0000'),
    );
    expect(missing).toBeUndefined();
    const garbage = await withStubbedFetch({ nope: true }, 200, () =>
      httpStorefrontPort('https://svc.example').resolve('binta-7412'),
    );
    expect(garbage).toBeUndefined();
  });
});

describe('item 5 — the DEMO-CATALOGUE FILL is gone: a store renders HER items and nothing else', () => {
  it('REAL-PIDS-RENDER-NOTHING-BORROWED: a store whose pids are not seed pids never renders the demo catalogue', () => {
    const html = renderVitrineReady(REAL_VIEW, resolved.trust, { fromProduct: false });
    // the bug this removes: `missing` appended every seed product not in curatedItems,
    // so a real store rendered the ENTIRE demo catalogue as if it were hers.
    for (const p of VITRINE_SEED) {
      expect(html, `demo product ${p.pid} leaked onto a real storefront`).not.toContain(p.name);
      expect(html, `demo pid ${p.pid} leaked onto a real storefront`).not.toContain(`data-pid="${p.pid}"`);
    }
    expect(html).not.toMatch(/data-role="vitrine-produit"/); // her real pids resolve to no seed tile
  });

  it('SUBSET-STAYS-A-SUBSET: a store curating TWO seed products renders exactly those two, never the other six', () => {
    const twoOnly: Storefront = { ...resolved.storefront, curatedItems: ['p1', 'p2'], featuredItems: [], sections: [] };
    const html = renderVitrineReady(twoOnly, resolved.trust, { fromProduct: false });
    expect(html).toContain('data-pid="p1"');
    expect(html).toContain('data-pid="p2"');
    for (const pid of ['p3', 'p4', 'p5', 'p7', 'p8', 'k1']) {
      expect(html, `uncurated demo product ${pid} was filled in`).not.toContain(`data-pid="${pid}"`);
    }
    expect(html.match(/data-role="vitrine-produit"/g)).toHaveLength(2);
  });
});

describe('item 4 — the NO-IMAGE state is woven, theme-derived, and LABELLED so it never passes for the product', () => {
  const html = renderVitrineReady(resolved.storefront, resolved.trust, { fromProduct: false });

  it('LABELLED: every tile carries « SANS PHOTO » inside the frame (the C1 precedent), so an ornament can never read as the item', () => {
    expect(html).toContain('SANS PHOTO');
    expect(html).toMatch(/data-role="tile-sans-photo"/);
    const tiles = html.match(/data-role="tile-sans-photo"/g)!;
    const labels = html.match(/vt-sansphoto-caps/g)!;
    expect(labels).toHaveLength(tiles.length); // EVERY tile is labelled, not just the first
    // « à venir » would be a promise the platform makes on the seller's behalf —
    // if she never adds a photo, the platform lied. « Sans photo » promises nothing.
    expect(html).not.toMatch(/À VENIR|A VENIR|BIENT[ÔO]T/i);
  });

  it('NOT SEED-DERIVED: the retired VITRINE_SEED gradient and glyph are gone from tile art', () => {
    expect(html).not.toContain('linear-gradient(140deg'); // the p.art gradient
    expect(html).not.toMatch(/vt-tile-stripes/);
    expect(html).not.toMatch(/<em class="vt-glyph"/); // the p.glyph product glyph
    for (const p of VITRINE_SEED) expect(html).not.toContain(`data-glyph="${p.glyph}"`);
  });

  it('THEME-DERIVED: the weave + ticks + label read ONLY theme tokens, so each of the four habillages draws its own', async () => {
    const styles = (await import('../src/vitrine/styles')).VITRINE_STYLES;
    const weave = styles.slice(styles.indexOf('.vt-weave'), styles.indexOf('.vt-tick '));
    expect(weave).toContain('var(--vt-accent)'); // habillage-derived, not a fixed colour
    expect(weave).toMatch(/repeating-linear-gradient/); // woven, geometric, ornamental
    expect(weave).not.toMatch(/#[0-9A-Fa-f]{6}/); // no hardcoded hex in the weave
    // applyTheme sets --vt-accent/--vt-soft/--vt-deep per habillage, so all four differ
    const keys: VitrineThemeKey[] = ['laterite', 'danfani', 'indigo', 'foret'];
    const accents = new Set(keys.map((k) => VITRINE_THEMES[k].accent));
    expect(accents.size).toBe(4);
  });

  it('the art carries NO product identity of its own — it is ornament, and the tile name/price still carry the truth', () => {
    // the honest product identity stays where it belongs: the tile body
    expect(html).toContain('Robe brodée bogolan'); // a real demo NAME still renders
    expect(html).toMatch(/vt-tile-price/); // and HER price
    // …but the art frame itself names no product
    const art = html.slice(html.indexOf('vt-tile-art'), html.indexOf('vt-tile-body'));
    for (const p of VITRINE_SEED) expect(art).not.toContain(p.name);
  });
});
