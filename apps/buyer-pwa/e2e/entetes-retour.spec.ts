import { expect, test, type Page } from '@playwright/test';
import { ENTETE_KEYS, ENTETES_STYLES, renderEntete } from '../src/vitrine/entetes';
import { isLazyEntete, loadAllEntetes, loadedEnteteCss } from '../src/vitrine/entetes/registry';

/**
 * THE BACK BUTTON, ON EVERY STYLE — the coverage gap that let a real defect
 * ship.
 *
 * `controls()` renders « retour » ONLY when the buyer arrived from a product
 * (`fromProduct`). Every existing header suite mounts with `{}`, so the button
 * was never once drawn under test. It positions itself from a per-style CSS
 * rule, and five Série 4 units plus Indigo never wrote one: an absolutely
 * positioned button with no `left`/`right` falls back to its STATIC position —
 * x = 0, hard against the left edge, on top of the header's own content.
 * Measured, not assumed: the six read x=0 before this spec existed.
 *
 * So this asserts the property rather than six coordinates: on EVERY built
 * style, with a provenance, the button is a real ≥44px target that sits inside
 * the header with a margin, and never lands on top of « partager ». A new style
 * that forgets its rule fails here on the day it is written.
 */

const AVATAR_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="#8A5A3A"/><circle cx="240" cy="200" r="90" fill="#5C3A24"/></svg>',
  );

const SF = {
  id: 'sf-r', resellerId: 'rs-r', slug: 'retour-1',
  name: 'Beurni Boss', zone: 'Gounghin, Ouagadougou', category: 'Général',
  tagline: 'Bienvenue chez moi', bio: 'Tissus et accessoires choisis un par un.', theme: 'laterite',
  cover: { status: 'none' },
  avatar: { mode: 'photo', url: AVATAR_SVG },
  curatedItems: ['pv-1'], featuredItems: [], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 128, rating: '4,9', reviewCount: 28, demo: false };

/**
 * The keys that actually draw their own unit today: the compiled-in ten plus
 * whatever the registry can load. The vocabulary runs ahead of the renders, so
 * asking an unbuilt key here would only re-test `classique`.
 *
 * `classique` ITSELF IS EXCLUDED, and not as a convenience: it is the original
 * vitrine hero, whose retour lives in its own `.vt-topbar` and never goes
 * through `controls()`. This spec is about the `controls()` contract; the
 * classique topbar is a different mechanism with its own coverage.
 */
async function builtKeys(): Promise<string[]> {
  await loadAllEntetes();
  const classique = renderEntete('classique' as never, SF as never, TRUST as never, {});
  const compiled = ENTETE_KEYS.filter(
    (k) => !isLazyEntete(k) && k !== 'classique' && renderEntete(k, SF as never, TRUST as never, {}) !== classique,
  );
  const lazy = ENTETE_KEYS.filter((k) => isLazyEntete(k));
  return [...compiled, ...lazy];
}

async function mount(page: Page, key: string): Promise<void> {
  // fromProduct: true — the ONLY way the back button is ever drawn
  const unit = renderEntete(key as never, SF as never, TRUST as never, { fromProduct: true });
  await page.setContent(
    [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<style>${ENTETES_STYLES}${loadedEnteteCss()}</style>`,
      "<style>html,body{margin:0;padding:0}body{background:#F4EFE6;font-family:system-ui,sans-serif}.page{padding:76px 20px 0}</style>",
      `</head><body><div class="page">${unit}</div></body></html>`,
    ].join(''),
    { waitUntil: 'load' },
  );
}

for (const width of [360, 320] as const) {
  test(`retour @ ${width}: drawn, inside the header, never under partager`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const keys = await builtKeys();
    // the guard against a vacuous sweep: if the key list ever empties, this
    // test would pass by asserting nothing at all
    expect(keys.length, 'no styles under test').toBeGreaterThanOrEqual(11);

    for (const key of keys) {
      await mount(page, key);

      const box = await page.evaluate(() => {
        const q = (s: string): DOMRect | null => {
          const el = document.querySelector(s);
          return el === null ? null : el.getBoundingClientRect();
        };
        const hero = q('.vt-ent');
        const back = q('.vt-ent-back');
        const share = q('.vt-ent-share');
        return hero === null || back === null || share === null
          ? null
          : {
              back: { x: back.x, y: back.y, w: back.width, h: back.height, r: back.right, b: back.bottom },
              share: { x: share.x, w: share.width, r: share.right },
              hero: { x: hero.x, y: hero.y, r: hero.right, b: hero.bottom },
            };
      });

      expect(box, `${key}: retour or partager not drawn with fromProduct`).not.toBeNull();
      const { back, share, hero } = box!;

      // §6 — a real target, not a collapsed box
      expect(back.w, `${key}: retour width`).toBeGreaterThanOrEqual(44);
      expect(back.h, `${key}: retour height`).toBeGreaterThanOrEqual(44);

      // INSIDE the header, with a margin. 8px is deliberately loose: the styles
      // range from 10 to 20px insets, and this asserts « not jammed on the
      // edge », which is exactly the defect. x=0 fails it.
      expect(back.x, `${key}: retour jammed on the left edge`).toBeGreaterThanOrEqual(hero.x + 8);
      expect(back.r, `${key}: retour past the right edge`).toBeLessThanOrEqual(hero.r - 8);
      expect(back.y, `${key}: retour above the header`).toBeGreaterThanOrEqual(hero.y);
      expect(back.b, `${key}: retour below the header`).toBeLessThanOrEqual(hero.b);

      // and the two controls never occupy the same place
      const overlap = Math.min(back.r, share.r) - Math.max(back.x, share.x);
      expect(overlap, `${key}: retour and partager overlap`).toBeLessThanOrEqual(0);
    }
  });
}
