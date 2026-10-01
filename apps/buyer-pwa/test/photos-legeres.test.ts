import { describe, expect, it } from 'vitest';
import type { Storefront } from '@platform/contracts';
import { renderVitrineEmpty, renderVitrineIndisponible, renderVitrineReady } from '../src/vitrine/render';
import { ENTETE_KEYS } from '../src/vitrine/entetes';
import { loadAllEntetes } from '../src/vitrine/entetes/registry';
import { petite } from '../src/vitrine/profile';

/**
 * ═══ PHOTOS-LEGERES-1 (AUDIT-4 B-02) — no buyer screen asks for her full-size photo ═══
 *
 * AUDIT-4 measured her 2048 px cover and portrait drawn into 44–280 px boxes
 * on every boutique's first screen. Every header now asks the service for the
 * small copy (`?v=petite`). This census renders EVERY header style, in every
 * state that draws one, and reads each `<img>` it emits for her photos: none
 * may ask the stored address bare. (The browser walk in
 * `e2e/vitrine-vraie.spec.ts` checks what the page actually downloads.)
 */
const COUVERTURE = 'https://storefront.example.dev/media/storefronts/sf-1/cover/c.jpeg';
const PORTRAIT = 'https://storefront.example.dev/media/storefronts/sf-1/avatar/a.jpeg';
const sf = (headerStyle: string, avecCouverture = true) =>
  ({
    id: 'sf-1', resellerId: 'rs-1', slug: 'fatou-1234', name: 'Chez Fatou', tagline: 'Pagnes', bio: 'Depuis 2019', zone: 'Gounghin',
    category: 'mode', createdAt: 'x', updatedAt: 'x', theme: 'laterite',
    cover: avecCouverture ? { status: 'live', url: COUVERTURE } : { status: 'none' },
    avatar: { mode: 'photo', url: PORTRAIT },
    curatedItems: ['p1'], featuredItems: [], sections: [], discoverable: true, headerStyle, productNotes: {},
  }) as unknown as Storefront;
const trust = { deliveredCount: 3, rating: '4,8', reviewCount: 5, demo: false };
const produits = [{ pid: 'p1', name: 'Pagne', priceFcfa: 9_000, inStock: true, assetRefs: [] }];

/** Every src the markup gives her two photos — whatever it asks for. */
function sesPhotos(html: string): string[] {
  return [...html.matchAll(/src="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&')).filter((s) => s.startsWith(COUVERTURE) || s.startsWith(PORTRAIT));
}

describe('PHOTOS-LEGERES-1 — every header asks for her photos small', () => {
  it('petite() asks a served address small, and leaves anything else alone', () => {
    expect(petite(COUVERTURE)).toBe(`${COUVERTURE}?v=petite`);
    expect(petite(`${COUVERTURE}?x=1`)).toBe(`${COUVERTURE}?x=1&v=petite`);
    expect(petite('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('all header styles × ready / empty / unavailable, with and without a cover: no bare photo address', async () => {
    await loadAllEntetes();
    let vues = 0;
    for (const key of ENTETE_KEYS) {
      for (const avecCouverture of [true, false]) {
        const s = sf(key, avecCouverture);
        for (const [etat, html] of [
          ['ready', renderVitrineReady(s, trust, { fromProduct: false }, {}, produits, key)],
          ['empty', renderVitrineEmpty(s, trust, { fromProduct: false }, key)],
          ['indispo', renderVitrineIndisponible(s, trust, { fromProduct: false }, key)],
        ] as const) {
          const photos = sesPhotos(html);
          for (const src of photos) expect(src, `${key}/${etat}: asks her photo full-size`).toMatch(/\?v=petite$/);
          vues += photos.length;
        }
      }
    }
    // A census that found no photo would pass by having nothing to check.
    expect(ENTETE_KEYS.length).toBe(43);
    expect(vues, 'no header drew her photos at all').toBeGreaterThan(43 * 2);
  });
});
