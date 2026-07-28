import { beforeEach, describe, expect, it } from 'vitest';
import { isFavorite, toggleFavorite, resetFavoritesCache } from '../src/vitrine/favorites';

// The vitrine tests run in the node environment, which has no localStorage —
// a Map-backed fake with the real Storage surface the module touches.
function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}
(globalThis as { localStorage?: Storage }).localStorage = makeStorage();

/**
 * NORTH-STAR-1 — the heart is REAL (founder order). A decorative heart would be
 * a dead button, so this store must genuinely toggle and genuinely persist.
 */
describe('favoris — a working device-local wishlist', () => {
  beforeEach(() => {
    resetFavoritesCache();
    localStorage.clear();
  });

  it('TOGGLE ON, TOGGLE OFF — and the answer is the state it just became', () => {
    expect(isFavorite('pv-1')).toBe(false);
    expect(toggleFavorite('pv-1')).toBe(true);
    expect(isFavorite('pv-1')).toBe(true);
    expect(toggleFavorite('pv-1')).toBe(false);
    expect(isFavorite('pv-1')).toBe(false);
  });

  it('IT PERSISTS — a fresh load re-reads what the last session kept', () => {
    toggleFavorite('pv-7');
    resetFavoritesCache(); // simulate a new page load
    expect(isFavorite('pv-7')).toBe(true);
    expect(JSON.parse(localStorage.getItem('shopplus.favoris.v1') ?? '[]')).toEqual(['pv-7']);
  });

  it('A BROKEN STORE DEGRADES TO SESSION-ONLY, never to a crash', () => {
    const original = localStorage.setItem.bind(localStorage);
    // eslint-disable-next-line no-global-assign
    localStorage.setItem = () => { throw new Error('quota'); };
    try {
      expect(toggleFavorite('pv-9')).toBe(true); // no throw
      expect(isFavorite('pv-9')).toBe(true); // the session still works
    } finally {
      localStorage.setItem = original;
    }
  });
});
