// node env has no localStorage; the vitrine's favourites/panier pins need a fake.
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
import { renderListeSheet, renderPanierBand, renderVitrineReady, vignette } from '../src/vitrine/render';
import { renderC1, renderGalerie } from '../src/cliente/screens';
import { clienteProduitReel } from '../src/cliente/seed';
import { togglePanier } from '../src/vitrine/panier';

/**
 * VIGNETTES-1 (AUDIT-SHOP-2 F-22) — every SMALL frame asks the media service
 * for the 320 px vignette (`?v=thumb`); the frames that are looked at full —
 * the « À la une » card, the C1 frame, the gallery — keep the full derivative.
 * Before this slice `grep v=thumb src/` returned nothing: a two-column grid of
 * 170 px tiles pulled the 1280 px derivative for each.
 */

const HERO = 'https://media.example/media/h1';
const SF = {
  id: 'sf-v', resellerId: 'rs-v', slug: 'chez-v-1',
  name: 'Chez Awa', zone: 'Dassasgho, Ouagadougou', category: 'Général',
  tagline: '', bio: '', theme: 'foret' as const,
  cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const },
  curatedItems: ['p1', 'p2', 'p3'], featuredItems: ['p1'], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 3, rating: '', reviewCount: 0, demo: false };
const produit = (i: number, over: Record<string, unknown> = {}) => ({
  pid: `p${i}`, name: `Article ${i}`, priceFcfa: 1_000 * i, inStock: true,
  assetRefs: [`${HERO}-${i}`, `${HERO}-${i}-b`], ...over,
});

describe('vignette() — the URL rule', () => {
  it('appends ?v=thumb to an http(s) ref, & when a query already stands, and leaves any other ref untouched', () => {
    expect(vignette('https://m.example/media/abc')).toBe('https://m.example/media/abc?v=thumb');
    expect(vignette('http://127.0.0.1:9099/media/abc?x=1')).toBe('http://127.0.0.1:9099/media/abc?x=1&v=thumb');
    expect(vignette('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(vignette('')).toBe('');
  });
});

describe('the small frames ask for the vignette; the frames looked at full do not', () => {
  it('grid tiles carry ?v=thumb; the « À la une » card keeps the full derivative', () => {
    const html = renderVitrineReady(SF as never, TRUST as never, {} as never, {}, [produit(1), produit(2), produit(3)] as never, 'classique');
    // p1 is hoisted to the hero — full; p2 and p3 are grid tiles — vignettes.
    expect(html).toContain(`<img class="vt-tile-photo" src="${HERO}-1" alt=""`);
    expect(html).toContain(`<img class="vt-tile-photo" src="${HERO}-2?v=thumb" alt=""`);
    expect(html).toContain(`<img class="vt-tile-photo" src="${HERO}-3?v=thumb" alt=""`);
    // never the full derivative on a grid tile
    expect(html).not.toContain(`src="${HERO}-2" `);
    expect(html).not.toContain(`src="${HERO}-3" `);
  });

  it('a clip tile\'s poster is the vignette; the featured clip\'s poster stays full', () => {
    const clip = 'https://media.example/media/clip';
    const html = renderVitrineReady(
      SF as never, TRUST as never, {} as never, {},
      [produit(1, { videoRef: clip }), produit(2, { videoRef: clip }), produit(3)] as never,
      'classique',
    );
    expect(html).toContain(`poster="${HERO}-1"`);
    expect(html).toContain(`poster="${HERO}-2?v=thumb"`);
  });

  it('the panier cards and the liste builder rows are vignettes', () => {
    togglePanier(SF.slug, 'p2');
    const panier = renderPanierBand(SF as never, [produit(1), produit(2), produit(3)] as never);
    expect(panier).toContain('data-role="panier-article"');
    expect(panier).toContain(`src="${HERO}-2?v=thumb"`);
    const liste = renderListeSheet([produit(2), produit(3)] as never, new Set());
    expect(liste).toContain(`src="${HERO}-2?v=thumb"`);
    expect(liste).toContain(`src="${HERO}-3?v=thumb"`);
    expect(liste).not.toContain(`src="${HERO}-2"`);
  });

  it('the C1 frame and the gallery keep the full derivative — those are looked at, not scanned', () => {
    const sf = { name: 'Chez Awa', slug: 'chez-v-1', theme: 'indigo' as const, zone: 'Dassasgho' };
    const { produit: m } = clienteProduitReel(sf, produit(1) as never, undefined);
    const c1 = renderC1(m, { epuise: false, sansVoix: true });
    expect(c1).toContain(`<img class="cl-photo-img" src="${HERO}-1" alt=""`);
    expect(c1).not.toContain('v=thumb');
    const galerie = renderGalerie(m, 1);
    expect(galerie).toContain(`src="${HERO}-1-b"`);
    expect(galerie).not.toContain('v=thumb');
  });
});
