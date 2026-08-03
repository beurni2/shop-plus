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
import { decideLecture, mountVideoScroll, SEUIL_LECTURE } from '../src/vitrine/video-scroll';
import { productFromWireForTest } from '../src/vitrine/profile';

/**
 * VIDEO-PRODUIT V-1e — the founder's sentence, as assertions: « I want the
 * short video to be the hero card and will start playing a preview when a
 * client/viewer scrolls and pause on that. »
 *
 * ORDER WIDENED 2026-08-03: « I want the video to be displayed on any product
 * if it has one not just a la une product. » So the pin below flipped — EVERY
 * in-stock card carrying a clip is a `<video>`, hero or grid. The 1GB-Android
 * promise is kept by the OBSERVER (at most one clip plays at a time) and by
 * `preload="metadata"` + poster, not by refusing the element.
 *
 * What must hold: a product WITH a clip renders as a `<video>` — muted (the
 * only autoplay that respects anyone), playsinline, loop, `preload="metadata"`,
 * the hero PHOTO as poster; a product without one renders the photo card
 * byte-for-byte as before; an ÉPUISÉ tile stays a photograph (veiled, muette —
 * a clip playing under the stamp advertises what cannot be bought); and the
 * scroll rule is pure and pinned.
 */

const SF = {
  id: 'sf-vid', resellerId: 'rs-vid', slug: 'chez-vid-1',
  name: 'Chez Awa', zone: 'Dassasgho, Ouagadougou', category: 'Général',
  tagline: '', bio: '', theme: 'foret' as const,
  cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const },
  curatedItems: ['pv-1', 'pv-2'], featuredItems: ['pv-1'], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 3, rating: '', reviewCount: 0, demo: false };
const CLIP = 'https://media.example/media/clip-1';
const HERO = 'https://media.example/media/hero-1.jpg';

const products = (videoRef?: string) => [
  { pid: 'pv-1', name: 'Bazin riche', priceFcfa: 9_400, inStock: true, assetRefs: [HERO], ...(videoRef !== undefined ? { videoRef } : {}) },
  { pid: 'pv-2', name: 'Pagne tissé', priceFcfa: 7_000, inStock: true, assetRefs: [HERO], ...(videoRef !== undefined ? { videoRef } : {}) },
];

const ready = (videoRef?: string): string =>
  renderVitrineReady(SF as never, TRUST as never, {} as never, {}, products(videoRef) as never, 'classique');

describe('the featured card IS the video hero when a clip exists', () => {
  it('renders <video> with the whole honesty kit: muted, playsinline, loop, metadata-only, photo poster', () => {
    const html = ready(CLIP);
    const video = html.match(/<video[^>]*>/)?.[0];
    expect(video, 'no <video> on a clip-bearing featured card').toBeDefined();
    for (const attr of ['muted', 'playsinline', 'loop', 'preload="metadata"', `poster="${HERO}"`, `src="${CLIP}"`, 'data-role="video-hero"']) {
      expect(video, attr).toContain(attr);
    }
  });

  it('EVERY card with a clip — hero AND grid (founder order 2026-08-03)', () => {
    const html = ready(CLIP);
    // pv-1 is featured, pv-2 renders in the grid; both carry a clip, so both
    // are videos. The old build stopped at 1 — this is the pin that flipped.
    expect(html.split('<video').length - 1).toBe(2);
    // and each one is a REAL observer target, not decoration
    expect(html.split('data-role="video-hero"').length - 1).toBe(2);
  });

  it('a MIXED shop renders each product as what it actually has', () => {
    // pv-1 with a clip, pv-2 without: one video, one photo — never the clip
    // borrowed onto the neighbour, never a photo hiding an existing clip.
    const mixed = [
      { pid: 'pv-1', name: 'Bazin riche', priceFcfa: 9_400, inStock: true, assetRefs: [HERO], videoRef: CLIP },
      { pid: 'pv-2', name: 'Pagne tissé', priceFcfa: 7_000, inStock: true, assetRefs: [HERO] },
    ];
    const html = renderVitrineReady(SF as never, TRUST as never, {} as never, {}, mixed as never, 'classique');
    expect(html.split('<video').length - 1).toBe(1);
    expect(html).toContain('data-role="tile-photo"'); // the clip-less one stays a photograph
  });

  it('an ÉPUISÉ tile stays a photograph even when the product has a clip', () => {
    const epuise = [
      { pid: 'pv-1', name: 'Bazin riche', priceFcfa: 9_400, inStock: true, assetRefs: [HERO], videoRef: CLIP },
      { pid: 'pv-2', name: 'Pagne tissé', priceFcfa: 7_000, inStock: false, assetRefs: [HERO], videoRef: CLIP },
    ];
    const html = renderVitrineReady(SF as never, TRUST as never, {} as never, {}, epuise as never, 'classique');
    expect(html.split('<video').length - 1).toBe(1); // the hero only; the sold-out tile is veiled
    expect(html).toContain('vt-tile-epuise');
  });

  it('no clip ⇒ the photo card, byte-for-byte as before — and no <video> anywhere', () => {
    const html = ready(undefined);
    expect(html.includes('<video')).toBe(false);
    expect(html).toContain('data-role="tile-photo"');
  });

  it('the clip url is ESCAPED on the way in — not an attribute-injection door', () => {
    const html = ready('https://x/a"onloadstart="alert(1)');
    expect(html.includes('"onloadstart="')).toBe(false);
  });
});

describe('the wire boundary — videoRef normalised exactly as category is', () => {
  it('a string rides; absent, blank and non-string become an ABSENT key', () => {
    const base = { pid: 'p', name: 'N', priceFcfa: 1_000, inStock: true, assetRefs: [] as string[] };
    expect(productFromWireForTest({ ...base, videoRef: CLIP } as never).videoRef).toBe(CLIP);
    expect('videoRef' in productFromWireForTest(base as never)).toBe(false);
    expect('videoRef' in productFromWireForTest({ ...base, videoRef: '' } as never)).toBe(false);
    expect('videoRef' in productFromWireForTest({ ...base, videoRef: 42 } as never)).toBe(false);
  });
});

describe('the scroll rule — pure, pinned, one at a time', () => {
  it('mostly visible plays, anything less pauses, and the threshold is the pinned 0.6', () => {
    expect(SEUIL_LECTURE).toBe(0.6);
    expect(decideLecture(1)).toBe('lire');
    expect(decideLecture(0.6)).toBe('lire');
    expect(decideLecture(0.59)).toBe('pause');
    expect(decideLecture(0)).toBe('pause');
  });

  it('mountVideoScroll without IntersectionObserver mounts NOTHING and the poster stands', () => {
    const had = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    try {
      const unmount = mountVideoScroll({ querySelectorAll: () => { throw new Error('must not query'); } } as never);
      expect(typeof unmount).toBe('function');
      unmount();
    } finally {
      if (had !== undefined) (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = had;
    }
  });

  it('ONE AT A TIME: when a hero crosses the threshold, every other hero is paused', () => {
    const mk = () => {
      const el = { played: 0, paused: 0, play() { this.played += 1; }, pause() { this.paused += 1; } };
      return el;
    };
    const a = mk(); const b = mk();
    let callback: (entries: unknown[]) => void = () => {};
    class FakeIO {
      constructor(cb: (entries: unknown[]) => void) { callback = cb; }
      observe(): void {}
      disconnect(): void {}
    }
    const had = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
    try {
      mountVideoScroll({ querySelectorAll: () => [a, b] } as never);
      callback([{ target: a, intersectionRatio: 0.8 }]);
      expect(a.played).toBe(1);
      expect(b.paused).toBe(1); // the sibling was silenced
      callback([{ target: a, intersectionRatio: 0.2 }]);
      expect(a.paused).toBe(1); // scrolled away ⇒ paused
    } finally {
      if (had !== undefined) (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = had;
      else delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    }
  });
});
