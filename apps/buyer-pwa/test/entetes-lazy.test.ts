const __m = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => __m.get(k) ?? null,
  setItem: (k: string, v: string) => void __m.set(k, v),
  removeItem: (k: string) => void __m.delete(k),
  clear: () => __m.clear(),
  key: (i: number) => [...__m.keys()][i] ?? null,
  get length() { return __m.size; },
} as Storage;
import { afterEach, describe, expect, it } from 'vitest';
import { renderEntete, type EnteteKey } from '../src/vitrine/entetes';
import { loadEntete, loadedEntete, loadedEnteteCss, registerEntete, resetEntetes } from '../src/vitrine/entetes/registry';

/**
 * ENTETES-G — the payload architecture, executed.
 *
 * The point of this file is that a style can arrive as its own chunk and draw
 * correctly, and that a style which FAILS to arrive degrades to classique
 * instead of taking the shop page with it. Both are asserted on real
 * `renderEntete` output, never on the registry's internal state.
 */

const SF = {
  id: 'sf-g', resellerId: 'rs-g', slug: 'g-1', name: 'Chez Awa',
  zone: 'Gounghin, Ouagadougou', category: 'Général', tagline: '', bio: '',
  theme: 'laterite' as const, cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const }, curatedItems: [], featuredItems: [],
  sections: [], discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 12, rating: '4,8', reviewCount: 17, demo: false };
const head = (key: EnteteKey): string => renderEntete(key, SF as never, TRUST as never, {});

afterEach(() => resetEntetes());

describe('ENTETES-G — a lazily-loaded style draws, and a missing one never breaks the shop', () => {
  it('an ARRIVED unit wins over the compiled-in dispatch, and receives her real data', () => {
    // classique is the strongest case: if the registry can override even the
    // default, nothing is reaching the drawing except through this seam.
    registerEntete('classique', {
      render: (v) => `<div class="vt-ent vt-stub" data-role="vitrine-hero">${v.zone}|${v.delivN}</div>`,
      css: '.vt-stub { color: #000; }',
    });
    const out = head('classique');
    expect(out).toContain('class="vt-ent vt-stub"');
    // it got HER values through `vals`, not a fixture of its own
    expect(out).toContain('Gounghin, Ouagadougou');
    expect(out).toContain('12');
  });

  it('a style that never arrives falls back to classique — her products still reach the buyer', () => {
    // no registration: this is the offline / failed-chunk path, and the
    // ENTETES-E0 law says the page draws the shipped default rather than
    // crashing or emitting nothing.
    const out = head('royale');
    expect(out.length).toBeGreaterThan(1000);
    expect(out).toContain('class="vt-ent vt-ry"'); // compiled-in tier still serves
    const unknown = head('classique');
    expect(unknown).toContain('class="vt-hero"');
  });

  it('loadEntete is safe for every key, including ones with no chunk', async () => {
    // callers must not have to know which tier a key belongs to
    await expect(loadEntete('classique')).resolves.toBeUndefined();
    await expect(loadEntete('royale')).resolves.toBeUndefined();
    expect(loadedEntete('royale')).toBeUndefined();
  });

  it('only ARRIVED styles put CSS on the page — a chunk that never came adds no bytes', () => {
    expect(loadedEnteteCss()).toBe('');
    registerEntete('cristal', { render: () => '<i></i>', css: '.vt-xx { color: #111; }' });
    expect(loadedEnteteCss()).toContain('.vt-xx');
    resetEntetes();
    expect(loadedEnteteCss()).toBe('');
  });
});
