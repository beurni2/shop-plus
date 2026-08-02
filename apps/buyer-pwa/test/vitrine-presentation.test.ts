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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENTETES_AVEC_BIO, enteteMontreBio, type EnteteKey } from '../src/vitrine/entetes';
import { loadAllEntetes, resetEntetes } from '../src/vitrine/entetes/registry';
import { renderVitrineReady } from '../src/vitrine/render';

/**
 * VITRINE-PRESENTATION-1 — the sentence she typed in K2 REACHES her cliente
 * (founder defect report 2026-08-02: « the presentation typed is not showing on
 * the en-tête »). Only eight styled units carry the bio inside the header; for
 * every other drawn header the page now renders it once, directly underneath.
 *
 * The law under test: her présentation appears EXACTLY ONCE on a ready page —
 * in the header when the unit has a slot, in the block when it does not, and
 * never twice, never zero.
 */

const BIO = 'Du bon tissu, choisi à la main, pour vous.';
const SF = {
  id: 'sf-pres', resellerId: 'rs-pres', slug: 'chez-pres-1',
  name: 'Chez Awa', zone: 'Dassasgho, Ouagadougou', category: 'Général',
  tagline: 'Bienvenue', bio: BIO, theme: 'foret' as const,
  cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const },
  curatedItems: ['pv-1'], featuredItems: [], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 12, rating: '4,8', reviewCount: 17, demo: false };
const PRODUCTS = [
  { pid: 'pv-1', name: 'Bazin riche', priceFcfa: 9_400, inStock: true, assetRefs: [] as string[] },
];

const ready = (entete: EnteteKey, bio = BIO): string =>
  renderVitrineReady({ ...SF, bio } as never, TRUST as never, {} as never, {}, PRODUCTS as never, entete);

const blocks = (html: string): number => html.split('data-role="vitrine-presentation"').length - 1;
const bioCount = (html: string): number => html.split(BIO).length - 1;

describe('the pinned set matches what the unit modules ACTUALLY consume', () => {
  it('ENTETES_AVEC_BIO = exactly the lazy modules whose render reads v.bio/hasBio', () => {
    const dir = join(__dirname, '..', 'src', 'vitrine', 'entetes');
    const registry = readFileSync(join(dir, 'registry.ts'), 'utf8');
    // The LOADERS mapping is the resolution truth — including the four renamed
    // keys (harmattan→terracotta.ts …), so the scan follows the same edges the
    // dispatch does rather than assuming filename === key.
    const fromSource = new Set<string>();
    for (const m of registry.matchAll(/(\w+): \(\) => import\('\.\/(\w+)'\)/g)) {
      const [, key, module] = m;
      const src = readFileSync(join(dir, `${module}.ts`), 'utf8');
      if (/v\.bio|hasBio/.test(src)) fromSource.add(key!);
    }
    expect(fromSource.size).toBeGreaterThan(0); // the scan saw units — never vacuous
    expect([...fromSource].sort()).toEqual([...ENTETES_AVEC_BIO].sort());
  });
});

describe('her présentation appears EXACTLY ONCE, whatever header she chose', () => {
  it('a slotless styled header gets the block under the en-tête (once, her words)', async () => {
    await loadAllEntetes();
    const html = ready('braise');
    expect(blocks(html)).toBe(1);
    expect(bioCount(html)).toBe(1);
  });

  it('a header WITH a bio slot shows it in the header — and the block does NOT double it', async () => {
    await loadAllEntetes();
    for (const key of ENTETES_AVEC_BIO) {
      const html = ready(key);
      expect(blocks(html), key).toBe(0);
      expect(bioCount(html), key).toBe(1);
    }
  });

  it('the once-law is BEHAVIORAL for a slotted unit, not just the pinned set — indigo, by name', async () => {
    // Mutation-measured: dropping 'indigo' from ENTETES_AVEC_BIO passed the
    // loop above (it iterates the shrunken set) and only the mechanical pin
    // fired. This literal-key assertion is the behavioral half: if the set
    // ever lies about a slotted unit, the page doubles her sentence and this
    // counts it.
    await loadAllEntetes();
    expect(bioCount(ready('indigo'))).toBe(1);
  });

  it('classique has always shown it in the hero panel — no block', async () => {
    await loadAllEntetes();
    const html = ready('classique');
    expect(blocks(html)).toBe(0);
    expect(bioCount(html)).toBe(1);
  });

  it('an UNLOADED chunk draws the classique fallback, whose hero shows the bio — no block', () => {
    resetEntetes();
    try {
      expect(enteteMontreBio('braise')).toBe(true); // resolution says: the hero will draw
      const html = ready('braise');
      expect(blocks(html)).toBe(0);
      expect(bioCount(html)).toBe(1);
    } finally {
      resetEntetes();
    }
  });

  it('no présentation typed ⇒ no block, no empty card', async () => {
    await loadAllEntetes();
    for (const key of ['braise', 'classique'] as const) {
      const html = ready(key, '');
      expect(blocks(html), key).toBe(0);
    }
  });

  it('her words are ESCAPED on the way in — the block is not an injection door', async () => {
    await loadAllEntetes();
    const html = ready('braise', 'Tissu <img src=x onerror=alert(1)> & co');
    expect(html.includes('<img src=x')).toBe(false);
    expect(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; co')).toBe(true);
  });
});
