import { describe, expect, it } from 'vitest';
import { demoStorefrontPort, httpStorefrontPort, looksLikeProductForTest, productFromWireForTest } from '../src/vitrine/profile';
import { renderVitrineReady } from '../src/vitrine/render';
import type { VitrineProduct } from '../src/vitrine/catalog';
import type { Storefront } from '@platform/contracts';

/**
 * BORNES-VITRINE-1 (AUDIT-SHOP-2 F-55) — a malformed wire field must never
 * blank a buyer's shop.
 *
 * The audit measured two blanks: `assetRefs: [123]` (the guard checked the
 * array, never its items; the renderer threw in `esc(vignette(123))`) and a
 * storefront without `cover` (`sf.cover.status` threw). Both threw BEFORE
 * `innerHTML`, so the buyer saw nothing — not the shop, not a card, nothing.
 * The ONE network boundary now normalises every field the page reads; these
 * tests drive that boundary and then the renderer on what it returns.
 */

const resolved = (await demoStorefrontPort('default').resolve('aicha-4821'))!;

/** The minimum a real `GET /s/{slug}` might carry: id, slug, name, and products. */
const NU = {
  id: 'sf_nu_1',
  resellerId: 'res_nu_1',
  slug: 'binta-7412',
  name: 'Chez Binta',
  discoverable: true,
  curatedItems: ['p1', 'p2', 'p3'],
  products: [
    // the audit's exact blank: a photograph reference that is a number
    { pid: 'p1', name: 'Bazin riche brodé', priceFcfa: 12_000, inStock: true, assetRefs: [123] },
    // a bad item BESIDE a good one — the good one must still draw
    { pid: 'p2', name: 'Pagne wax 6 yards', priceFcfa: 8_500, inStock: true, assetRefs: [null, 'https://media.example/media/p2-hero'] },
    // photographs that are not even an array — still a product, without photo
    { pid: 'p3', name: 'Foulard', priceFcfa: 3_000, inStock: false, assetRefs: 'pas-une-liste' },
  ],
};

function withStubbedFetch<T>(body: unknown, status: number, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const resolve = (body: unknown) => withStubbedFetch(body, 200, () => httpStorefrontPort('https://svc.example').resolve('binta-7412'));

describe('BORNES-VITRINE-1 — the photographs: a bad reference never deletes a product and never blanks the page', () => {
  it('a non-string item is dropped, a non-array is no photograph, the product survives the guard', () => {
    const wire = (assetRefs: unknown) => ({ pid: 'p1', name: 'Bazin', priceFcfa: 1_000, inStock: true, assetRefs });
    for (const bad of [[123], [null, 'https://m/x'], 'pas-une-liste', undefined, { a: 1 }]) {
      expect(looksLikeProductForTest(wire(bad)), `assetRefs ${JSON.stringify(bad)}`).toBe(true);
      const cleaned = productFromWireForTest(wire(bad) as unknown as VitrineProduct);
      expect(Array.isArray(cleaned.assetRefs)).toBe(true);
      for (const ref of cleaned.assetRefs) expect(typeof ref).toBe('string');
    }
    expect(productFromWireForTest(wire([null, 'https://m/x']) as unknown as VitrineProduct).assetRefs).toEqual(['https://m/x']);
    expect(productFromWireForTest(wire([123]) as unknown as VitrineProduct).assetRefs).toEqual([]);
    // the four fields the tile cannot draw without stay required
    expect(looksLikeProductForTest({ pid: 'p1', name: 'x', priceFcfa: '1000', inStock: true, assetRefs: [] })).toBe(false);
    expect(looksLikeProductForTest({ pid: 'p1', name: 'x', priceFcfa: 1000, assetRefs: [] })).toBe(false);
  });
});

describe('BORNES-VITRINE-1 — the storefront: the fields the page reads are defaulted at the boundary', () => {
  it('a shop without cover, avatar, sections, featuredItems, bio, tagline or zone resolves with the designed empty states — and RENDERS', async () => {
    const got = await resolve(NU);
    expect(got).toBeDefined();
    const sf = got!.storefront;
    expect(sf.cover).toEqual({ status: 'none' });
    expect(sf.avatar).toEqual({ mode: 'monogram' });
    expect(sf.featuredItems).toEqual([]);
    expect(sf.sections).toEqual([]);
    expect(sf.curatedItems).toEqual(['p1', 'p2', 'p3']);
    expect(sf.bio).toBe('');
    expect(sf.tagline).toBe('');
    expect(sf.zone).toBe('');
    expect(got!.products?.map((p) => [p.pid, p.assetRefs])).toEqual([
      ['p1', []],
      ['p2', ['https://media.example/media/p2-hero']],
      ['p3', []],
    ]);
    // The audit's measurement, inverted: the renderer no longer throws on it.
    const html = renderVitrineReady(sf, got!.trust, { fromProduct: false }, got!.notes, got!.products);
    expect(html).toContain('Chez Binta');
    expect(html).toContain('data-pid="p1"');
    expect(html).toContain('data-pid="p2"');
    expect(html).toContain('data-role="tile-sans-photo"');
    expect(html).toContain('data-role="tile-photo"');
  });

  it('a non-string item inside a collection is dropped, a non-string text is empty, a non-object cover is the default', async () => {
    const got = await resolve({
      ...NU,
      curatedItems: ['p1', 7, null, 'p2'],
      featuredItems: 'p1',
      sections: { not: 'a list' },
      bio: 42,
      tagline: ['x'],
      zone: { ville: 'Ouaga' },
      cover: 'live',
      avatar: { mode: 5 },
    });
    const sf = got!.storefront;
    expect(sf.curatedItems).toEqual(['p1', 'p2']);
    expect(sf.featuredItems).toEqual([]);
    expect(sf.sections).toEqual([]);
    expect(sf.bio).toBe('');
    expect(sf.tagline).toBe('');
    expect(sf.zone).toBe('');
    expect(sf.cover).toEqual({ status: 'none' });
    expect(sf.avatar).toEqual({ mode: 'monogram' });
    expect(() => renderVitrineReady(sf, got!.trust, { fromProduct: false }, got!.notes, got!.products)).not.toThrow();
  });

  it('a cover or avatar whose url is not a string keeps its status and loses the url — the woven habillage, never a throw', async () => {
    const got = await resolve({ ...NU, cover: { status: 'live', url: 123, focus: { x: 30, y: 70 } }, avatar: { mode: 'photo', url: { a: 1 } } });
    const sf = got!.storefront;
    expect(sf.cover).toEqual({ status: 'live', focus: { x: 30, y: 70 } });
    expect(sf.avatar).toEqual({ mode: 'photo' });
    const html = renderVitrineReady(sf, got!.trust, { fromProduct: false }, got!.notes, got!.products);
    expect(html).toContain('data-role="vitrine-cover"');
    expect(html).not.toContain('src="123"');
  });

  it('a well-formed shop passes through UNCHANGED in every defaulted field — the CUSTOMISED variant, whose values differ from every fallback', async () => {
    // The verifier's finding on the first cut: the DEFAULT variant's tagline,
    // bio, featuredItems and sections already equal the fallbacks, so a default
    // that overwrote a real value with '' or [] passed. The customised shop
    // carries a tagline, a bio, a live framed cover, a framed avatar, a featured
    // list and sections — none of which may move an inch through the boundary.
    const custom = (await demoStorefrontPort('customised').resolve('aicha-4821'))!;
    const full: Storefront & { products: unknown[] } = { ...custom.storefront, id: 'sf_full', slug: 'binta-7412', name: 'Chez Binta', products: [] };
    expect(full.tagline).not.toBe('');
    expect(full.bio).not.toBe('');
    expect(full.featuredItems.length).toBeGreaterThan(0);
    expect(full.sections.length).toBeGreaterThan(0);
    expect(full.cover).not.toEqual({ status: 'none' });
    expect(full.avatar).not.toEqual({ mode: 'monogram' });
    const got = await resolve(full);
    const sf = got!.storefront;
    for (const key of ['zone', 'tagline', 'bio', 'curatedItems', 'featuredItems', 'sections', 'cover', 'avatar'] as const) {
      expect(sf[key], key).toEqual(full[key]);
    }
    // and the default variant too — the seed shape, byte for byte
    const plain: Storefront & { products: unknown[] } = { ...resolved.storefront, id: 'sf_plain', slug: 'binta-7412', name: 'Chez Binta', products: [] };
    const gotPlain = await resolve(plain);
    for (const key of ['zone', 'tagline', 'bio', 'curatedItems', 'featuredItems', 'sections', 'cover', 'avatar'] as const) {
      expect(gotPlain!.storefront[key], key).toEqual(plain[key]);
    }
  });

  it('a shop without a NAME is not a shop: the honest not-found, never a throw', async () => {
    const { name: _dropped, ...sansNom } = NU;
    await expect(resolve(sansNom)).resolves.toBeUndefined();
    await expect(resolve({ ...NU, name: 7 })).resolves.toBeUndefined();
  });
});
