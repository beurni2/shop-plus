import { describe, expect, it } from 'vitest';
import type { Storefront } from '@platform/contracts';
import { renderVitrineEmpty, renderVitrineIndisponible, renderVitrineReady } from '../src/vitrine/render';
import { ENTETE_KEYS } from '../src/vitrine/entetes';
import { loadAllEntetes } from '../src/vitrine/entetes/registry';
import { signedProductSlugFromPath, vitrineSlugFromPath } from '../src/vitrine-link';

/**
 * COPIE-ACCES-1 (AUDIT-4 minors) — the unit half. The walks are in
 * e2e/vitrine-vraie.spec.ts and e2e/cliente-*.spec.ts.
 */
const texte = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('B-04 — « Livré par Séra » and « Paiement protégé » on every header, in every state', () => {
  it('ready, empty and unavailable, all header styles', async () => {
    await loadAllEntetes();
    const sf = {
      id: 'sf-1', resellerId: 'rs-1', slug: 'fatou-1234', name: 'Chez Fatou', tagline: '', bio: '', zone: 'Secteur 22, Bobo-Dioulasso',
      category: 'mode', createdAt: 'x', updatedAt: 'x', theme: 'laterite', cover: { status: 'none' }, avatar: { mode: 'monogram' },
      curatedItems: ['p1'], featuredItems: [], sections: [], discoverable: true, productNotes: {},
    };
    const trust = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false, inconnu: true };
    const produits = [{ pid: 'p1', name: 'Coque', priceFcfa: 2_500, inStock: true, assetRefs: [] }];
    const manque: string[] = [];
    for (const key of ENTETE_KEYS) {
      const s = { ...sf, headerStyle: key } as unknown as Storefront;
      for (const [etat, html] of [
        ['ready', renderVitrineReady(s, trust, { fromProduct: false }, {}, produits, key)],
        ['empty', renderVitrineEmpty(s, trust, { fromProduct: false }, key)],
        ['indispo', renderVitrineIndisponible(s, trust, { fromProduct: false }, key)],
      ] as const) {
        const txt = texte(html);
        if (!(/Séra/.test(txt) && /[Ll]ivr/.test(txt)) || !/[Pp]aiement protégé/.test(txt)) manque.push(`${key}/${etat}`);
      }
    }
    expect(ENTETE_KEYS.length).toBe(43);
    expect(manque).toEqual([]);
  });
});

describe('B-05 — her code in capitals is still her address, read in lowercase', () => {
  it('/v/ and /s/ accept capitals and answer the lowercase slug', () => {
    expect(vitrineSlugFromPath('/shop-plus/v/FATOU-1234')).toBe('fatou-1234');
    expect(vitrineSlugFromPath('/v/Fatou-1234/')).toBe('fatou-1234');
    expect(signedProductSlugFromPath('/shop-plus/s/FATOU-1234')).toBe('fatou-1234');
    expect(vitrineSlugFromPath('/v/fatou 1234')).toBeUndefined();
  });
});

describe('B-06 — no control a keyboard cannot reach, and no button inside a button', () => {
  it('every boutique state: real buttons only, product cards are focusable links', async () => {
    const { renderArticleAbsent, renderVitrineOffline, renderVitrinePause, renderVitrineInvalid } = await import('../src/vitrine/render');
    const sf = {
      id: 'sf-1', resellerId: 'rs-1', slug: 'fatou-1234', name: 'Chez Fatou', tagline: '', bio: '', zone: 'Gounghin',
      category: 'mode', createdAt: 'x', updatedAt: 'x', theme: 'laterite', cover: { status: 'none' }, avatar: { mode: 'monogram' },
      curatedItems: ['p1', 'p2', 'p3'], featuredItems: ['p1'], sections: [], discoverable: true, headerStyle: 'classique', productNotes: {},
    } as unknown as Storefront;
    const trust = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
    const produits = [
      { pid: 'p1', name: 'Pagne', priceFcfa: 9_000, inStock: true, assetRefs: [] },
      { pid: 'p2', name: 'Sac', priceFcfa: 5_000, inStock: true, assetRefs: [] },
      { pid: 'p3', name: 'Foulard', priceFcfa: 3_000, inStock: false, assetRefs: [] },
    ];
    const notes = { p2: { status: 'ready' as const, url: 'https://m/a.m4a', durationMs: 5_000 } };
    const pages = [
      renderVitrineReady(sf, trust, { fromProduct: false, incomplet: true }, notes, produits),
      renderVitrineEmpty(sf, trust, { fromProduct: false }),
      renderVitrineIndisponible(sf, trust, { fromProduct: false }),
      renderArticleAbsent('retire', 'Chez Fatou'),
      renderArticleAbsent('indisponible', 'Chez Fatou'),
      renderVitrineOffline('reseau'),
      renderVitrineOffline('service'),
      renderVitrinePause('Chez Fatou'),
      renderVitrineInvalid(),
    ];
    for (const html of pages) {
      expect(html, 'a pseudo-button a keyboard cannot reach').not.toContain('role="button"');
      // no <button> opens before the previous one closed
      const ouverts = html.match(/<\/?button\b/g) ?? [];
      let profondeur = 0;
      for (const b of ouverts) {
        profondeur += b === '<button' ? 1 : -1;
        expect(profondeur, 'a button inside a button').toBeLessThanOrEqual(1);
      }
    }
    const ready = pages[0]!;
    expect(ready).toMatch(/<article class="vt-tile" data-role="vitrine-produit" data-action="produit" data-pid="p2" role="link" tabindex="0">/);
    expect(ready).toMatch(/<article class="vt-featured" data-role="vitrine-a-la-une" data-action="produit" data-pid="p1" role="link" tabindex="0">/);
    // an épuisé card is not a link and is not focusable
    expect(ready).toMatch(/<article class="vt-tile vt-tile-epuise" data-role="vitrine-produit" aria-disabled="true">/);
  });
});
