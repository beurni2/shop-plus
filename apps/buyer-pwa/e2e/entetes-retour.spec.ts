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
 * the header with a margin. A new style that forgets its rule fails here on the
 * day it is written.
 *
 * PARTAGE-HORS-ENTÊTE (2026-08-18) — it used to also check that retour never
 * landed on top of « partager ». That control left the header, so the pairing
 * check became a count: zero share signs, on every style.
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
/** zero history ⇒ the « Nouvelle vendeuse » badge, never a proof line. */
const ZERO = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };

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

async function mount(page: Page, key: string, trust: unknown = TRUST): Promise<void> {
  // fromProduct: true — the ONLY way the back button is ever drawn
  const unit = renderEntete(key as never, SF as never, trust as never, { fromProduct: true });
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
  test(`retour @ ${width}: drawn, inside the header, with a margin on every style`, async ({ page }) => {
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
        return hero === null || back === null
          ? null
          : {
              back: { x: back.x, y: back.y, w: back.width, h: back.height, r: back.right, b: back.bottom },
              hero: { x: hero.x, y: hero.y, r: hero.right, b: hero.bottom },
              // PARTAGE-HORS-ENTÊTE (2026-08-18) — nothing to collide with any
              // more; the count proves the share sign did not come back.
              partages: document.querySelectorAll('[data-action="partager"]').length,
            };
      });

      expect(box, `${key}: retour not drawn with fromProduct`).not.toBeNull();
      const { back, hero, partages } = box!;
      expect(partages, `${key}: the share sign is back on the en-tête`).toBe(0);

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
    }
  });

  test(`chip @ ${width}: the controls never sit on « Nouvelle vendeuse »`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const keys = await builtKeys();

    // WHY THIS EXISTS: série 3's boards carry an app bar instead of floating
    // controls, so their MINIMAL badges are placed in the top-right corner —
    // exactly where the CTO adaptation puts the floating controls. Fleurie
    // collided there for real: at 320 a control covered the sage disc and
    // « vendeuse » was unreadable. Nine more série 3 styles are coming and each
    // places its own badge, so this checks the whole set rather than one style.
    //
    // THE SET SHRANK ON 2026-08-18 — the share sign left the header, so each
    // style now floats ONE control instead of two. `boutons` counts them, or
    // this sweep could go quietly vacuous the day a style stops drawing any.
    let chips = 0;
    for (const key of keys) {
      await mount(page, key, ZERO); // zero history ⇒ the badge, never the proof

      const hit = await page.evaluate(() => {
        const chip = document.querySelector('[data-role="chip-nouvelle"]');
        if (chip === null) return null;
        const c = chip.getBoundingClientRect();
        const btns = [...document.querySelectorAll('.vt-ent-btn')];
        const worst = btns.map((b) => {
          const r = b.getBoundingClientRect();
          return Math.max(0, Math.min(c.right, r.right) - Math.max(c.left, r.left)) *
            Math.max(0, Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top));
        });
        return { area: Math.max(0, ...worst), boutons: btns.length };
      });

      expect(hit, `${key}: no « Nouvelle vendeuse » badge at zero history`).not.toBeNull();
      chips += 1;
      expect(hit!.boutons, `${key}: no floating control drawn — the overlap check has nothing to check`).toBeGreaterThanOrEqual(1);
      expect(hit!.area, `${key}: a control overlaps the « Nouvelle vendeuse » badge`).toBe(0);
    }
    expect(chips, 'no badges found — this test would pass vacuously').toBeGreaterThanOrEqual(11);
  });
}
