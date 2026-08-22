// node env has no localStorage; the vitrine's panier needs the same fake the
// favourites tests pin.
const __m = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => __m.get(k) ?? null,
  setItem: (k: string, v: string) => void __m.set(k, v),
  removeItem: (k: string) => void __m.delete(k),
  clear: () => __m.clear(),
  key: (i: number) => [...__m.keys()][i] ?? null,
  get length() { return __m.size; },
} as Storage;
import { beforeEach, describe, expect, it } from 'vitest';
import { renderVitrineReady } from '../src/vitrine/render';
import { applyPanierState } from '../src/vitrine/flows';
import { panierOf, resetPanierCache, togglePanier } from '../src/vitrine/panier';

/**
 * PANIER-VITRINE-1 — continuity without an account (founder order 2026-08-22):
 * « if a buyer does some activities (product like, product added to cart) on a
 * reseller's boutique, goes out and comes back in, be able to see it again
 * where he left off. » The heart already persists (NORTH-STAR-1); this pins
 * the panier: device-local, PER BOUTIQUE, rendered back from storage on a
 * fresh load — and NEVER a combined cart (§SP9: per-product truth, stock and
 * economics preserved; each article checks out through its own page).
 */

const SF = {
  id: 'sf-p', resellerId: 'rs-p', slug: 'chez-awa-1',
  name: 'Chez Awa', zone: 'Dassasgho, Ouagadougou', category: 'Général',
  tagline: '', bio: '', theme: 'foret' as const,
  cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const },
  curatedItems: ['p1', 'p2', 'p3'], featuredItems: ['p1'], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 3, rating: '', reviewCount: 0, demo: false };
const HERO = 'https://media.example/media/h.jpg';
const prods = (over: Partial<{ pid: string; inStock: boolean }>[] = []) =>
  ['p1', 'p2', 'p3'].map((pid, i) => ({
    pid, name: `Article ${i + 1}`, priceFcfa: 1_000 * (i + 1),
    inStock: true, assetRefs: [HERO],
    ...(over.find((o) => o.pid === pid) ?? {}),
  }));
const html = (products = prods()): string =>
  renderVitrineReady(SF as never, TRUST as never, {} as never, {}, products as never, 'classique');

beforeEach(() => {
  resetPanierCache();
  localStorage.clear();
});

describe('the band — her shelf renders back from storage on a FRESH load', () => {
  it('a stored article is on the page when she comes back, with its name and the count', () => {
    togglePanier('chez-awa-1', 'p2');
    resetPanierCache(); // a new visit
    const page = html();
    expect(page).toContain('data-role="vitrine-panier"');
    const band = page.split('data-role="vitrine-panier"')[1]!.split('data-role="vitrine-a-la-une"')[0]!;
    expect(band).toContain('Article 2');
    expect(band).not.toContain('Article 3'); // only what SHE saved
  });

  it('an empty panier renders NO band — the slot stays, silent', () => {
    const page = html();
    expect(page).toContain('data-role="vitrine-panier-slot"');
    expect(page).not.toContain('data-role="vitrine-panier"');
  });

  it("ANOTHER boutique's panier never renders here — intent does not bleed across shops", () => {
    togglePanier('chez-binta-2', 'p2');
    expect(html()).not.toContain('data-role="vitrine-panier"');
  });

  it('a saved pid no longer in the catalog does not render — and the storage is left untouched', () => {
    togglePanier('chez-awa-1', 'p2');
    togglePanier('chez-awa-1', 'fantome');
    const page = html();
    const band = page.split('data-role="vitrine-panier"')[1]!.split('data-role="vitrine-a-la-une"')[0]!;
    expect(band).toContain('Article 2');
    expect(band).not.toContain('fantome');
    expect(panierOf('chez-awa-1')).toEqual(['p2', 'fantome']); // it may come back
  });

  it('NO TOTAL, ever — the band carries one price per article and no sum (§SP9: no combined cart)', () => {
    togglePanier('chez-awa-1', 'p1');
    togglePanier('chez-awa-1', 'p2');
    const page = html();
    const band = page.split('data-role="vitrine-panier"')[1]!.split('data-role="vitrine-a-la-une"')[0]!;
    expect((band.match(/FCFA/g) ?? []).length).toBe(2); // two articles, two prices, nothing summed
  });
});

describe('the chip — every in-stock article can be put in the panier, and a kept one shows it', () => {
  it('in-stock tiles carry the panier chip; a stored pid renders its chip pressed', () => {
    togglePanier('chez-awa-1', 'p3');
    const page = html();
    // The TILE chip (span class vt-pan…), not the band's « retirer » button —
    // both carry the same action, only the chip shows the pressed state.
    expect(page).toMatch(/<span class="vt-pan vt-pan-on"[^>]*data-action="panier" data-pid="p3"[^>]*aria-pressed="true"/);
    expect(page).toMatch(/<span class="vt-pan"[^>]*data-action="panier" data-pid="p2"[^>]*aria-pressed="false"/);
  });

  it('an épuisé tile carries NO panier chip — a dead add would lie', () => {
    const page = html(prods([{ pid: 'p3', inStock: false }]));
    expect(page).not.toContain('data-action="panier" data-pid="p3"');
  });
});

describe('the geometry laws the verifier held this slice to, pinned at the source', () => {
  it('the « retirer » BUTTON honors the 44px touch floor — the 30px disc is only the drawing', async () => {
    const { VITRINE_STYLES } = await import('../src/vitrine/styles');
    const rule = /\.vt-pan-retirer \{[^}]*\}/.exec(VITRINE_STYLES)?.[0] ?? '';
    expect(rule).toContain('width: 44px');
    expect(rule).toContain('height: 44px');
    const disc = /\.vt-pan-retirer::before \{[^}]*\}/.exec(VITRINE_STYLES)?.[0] ?? '';
    expect(disc).toContain('width: 30px');
  });

  it("the featured chip leaves « À LA UNE »'s corner — bottom-left, never over the badge", async () => {
    const { VITRINE_STYLES } = await import('../src/vitrine/styles');
    const rule = /\.vt-featured-artwrap \.vt-pan \{[^}]*\}/.exec(VITRINE_STYLES)?.[0] ?? '';
    expect(rule).toContain('bottom: 10px');
    expect(rule).toContain('top: auto');
  });

  it('a store holding the same pid twice renders it once (dedupe on load)', () => {
    localStorage.setItem('shopplus.panier.v1', JSON.stringify({ 'chez-awa-1': ['p2', 'p2'] }));
    resetPanierCache();
    expect(panierOf('chez-awa-1')).toEqual(['p2']);
  });
});

describe('applyPanierState — every chip carrying the pid flips (the favourites twin-sync law)', () => {
  it('flips class and aria-pressed on all matching chips, and only those', () => {
    const made: { classes: Set<string>; attrs: Map<string, string> }[] = [];
    const el = () => {
      const e = {
        classes: new Set<string>(),
        attrs: new Map<string, string>(),
        classList: { toggle: (c: string, on: boolean) => void (on ? e.classes.add(c) : e.classes.delete(c)) },
        setAttribute: (k: string, v: string) => void e.attrs.set(k, v),
      };
      made.push(e);
      return e;
    };
    const twins = [el(), el()];
    const scope = {
      querySelectorAll: (sel: string) =>
        sel.includes('data-pid="p2"') ? (twins as never) : ([] as never),
    };
    applyPanierState(scope as never, 'p2', true);
    for (const e of made) {
      expect(e.classes.has('vt-pan-on')).toBe(true);
      expect(e.attrs.get('aria-pressed')).toBe('true');
    }
  });
});
