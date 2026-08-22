import { beforeEach, describe, expect, it } from 'vitest';
import { inPanier, panierOf, resetPanierCache, togglePanier } from '../src/vitrine/panier';

// Same node-environment Storage fake as favorites.test.ts — the module's real
// surface, Map-backed.
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
 * PANIER-VITRINE-1 — continuity without an account (founder order 2026-08-22):
 * what she puts in her panier on a boutique is still there when she comes
 * back. Device-local like the heart (NORTH-STAR-1 precedent): no account, no
 * backend, no sync claim. KEYED PER BOUTIQUE — her intent on one reseller's
 * vitrine must never surface on another's (the same product version can be
 * listed by two resellers; the panier is intent bound to THIS boutique's own
 * checkout, so it never bleeds attribution across shops).
 */
describe('panier — a device-local, per-boutique saved list', () => {
  beforeEach(() => {
    resetPanierCache();
    localStorage.clear();
  });

  it('TOGGLE ON, TOGGLE OFF — and the answer is the state it just became', () => {
    expect(inPanier('aicha-4821', 'pv-1')).toBe(false);
    expect(togglePanier('aicha-4821', 'pv-1')).toBe(true);
    expect(inPanier('aicha-4821', 'pv-1')).toBe(true);
    expect(togglePanier('aicha-4821', 'pv-1')).toBe(false);
    expect(inPanier('aicha-4821', 'pv-1')).toBe(false);
  });

  it('IT PERSISTS — a fresh load re-reads what the last visit kept, in the order she added', () => {
    togglePanier('aicha-4821', 'pv-2');
    togglePanier('aicha-4821', 'pv-1');
    resetPanierCache(); // a new page load
    expect(panierOf('aicha-4821')).toEqual(['pv-2', 'pv-1']);
  });

  it('PER BOUTIQUE — one vitrine\'s panier never appears on another, even for the same pid', () => {
    togglePanier('aicha-4821', 'pv-1');
    expect(inPanier('binta-7305', 'pv-1')).toBe(false);
    expect(panierOf('binta-7305')).toEqual([]);
    togglePanier('binta-7305', 'pv-9');
    resetPanierCache();
    expect(panierOf('aicha-4821')).toEqual(['pv-1']);
    expect(panierOf('binta-7305')).toEqual(['pv-9']);
  });

  it('an emptied panier leaves no residue for its boutique', () => {
    togglePanier('aicha-4821', 'pv-1');
    togglePanier('aicha-4821', 'pv-1');
    resetPanierCache();
    expect(panierOf('aicha-4821')).toEqual([]);
  });

  it('A BROKEN STORE DEGRADES TO SESSION-ONLY, never to a crash', () => {
    const original = localStorage.setItem.bind(localStorage);
    // eslint-disable-next-line no-global-assign
    localStorage.setItem = () => { throw new Error('quota'); };
    try {
      expect(togglePanier('aicha-4821', 'pv-9')).toBe(true); // no throw
      expect(inPanier('aicha-4821', 'pv-9')).toBe(true); // the session still works
    } finally {
      localStorage.setItem = original;
    }
  });

  it('an unreadable stored value starts empty instead of crashing the page', () => {
    localStorage.setItem('shopplus.panier.v1', '{not json');
    resetPanierCache();
    expect(panierOf('aicha-4821')).toEqual([]);
  });
});
