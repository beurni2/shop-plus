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

  it('INDIGO — the real chunk loads, registers, and draws her identity on the photo', async () => {
    // the first of the twenty, exercised END TO END through the real dynamic
    // import rather than a stub: if the chunk fails to resolve or the unit is
    // shaped wrong, this fails here rather than on a seller's phone.
    expect(loadedEntete('indigo')).toBeUndefined();
    await loadEntete('indigo');
    expect(loadedEntete('indigo'), 'the indigo chunk did not register').toBeDefined();

    const html = renderEntete('indigo', SF as never, TRUST as never, {});
    expect(html).toContain('class="vt-ent vt-in"');
    expect(html).toContain('data-role="vitrine-hero"');
    expect(html).toContain('data-role="vitrine-identity"');
    expect(html).toContain('data-role="vitrine-trust"');
    // HER data, through vals — not a fixture of the module's own
    expect(html).toContain('Gounghin, Ouagadougou');
    expect(html).toContain('Chez');
    // the honesty rules hold in a lazily-loaded unit exactly as in a compiled
    // one: 12 deliveries ⇒ proof, never the « nouvelle » badge
    expect(html).toContain('data-role="reputation"');
    expect(html).not.toContain('data-role="chip-nouvelle"');
    // …and its CSS travels WITH it, so the rules reach the page only now
    expect(loadedEnteteCss()).toContain('.vt-in');
    expect(loadedEnteteCss()).toContain('#0D133A');
  });

  it('INDIGO at zero history — the badge replaces the proof, and no number reaches her screen', async () => {
    await loadEntete('indigo');
    const zero = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
    const html = renderEntete('indigo', SF as never, zero as never, {});
    expect(html).toContain('data-role="chip-nouvelle"');
    expect(html).not.toContain('data-role="reputation"');
    expect(html).not.toContain('data-role="chip-avis"');
    // THE BAN IS ON CLAIMS ABOUT HER, NOT ON DIGITS. « 100% sécurisé » is a
    // fixed trust label and says nothing about this seller; scoping the scan to
    // the identity block is what makes the assertion mean « no count of hers
    // reached the screen » instead of accidentally banning the copy.
    const ident = /data-role="vitrine-identity"[\s\S]*?(?=<div class="in-trust")/.exec(html)?.[0] ?? '';
    expect(ident.length, 'identity block not found — the scan would assert over nothing').toBeGreaterThan(100);
    const visible = ident.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    expect(visible, 'a count leaked into the MINIMAL state').not.toMatch(/\d/);
    expect(visible).toContain('Nouvelle');
  });

  it('only ARRIVED styles put CSS on the page — a chunk that never came adds no bytes', () => {
    expect(loadedEnteteCss()).toBe('');
    registerEntete('cristal', { render: () => '<i></i>', css: '.vt-xx { color: #111; }' });
    expect(loadedEnteteCss()).toContain('.vt-xx');
    resetEntetes();
    expect(loadedEnteteCss()).toBe('');
  });
});
