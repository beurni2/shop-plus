import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ENTETES_STYLES, renderEntete } from '../src/vitrine/entetes';

/**
 * ENTETES-E — the Beurni Boss acceptance matrix, executed on the live DOM
 * (design/shopplus-beurni-boss/04_ACCEPTANCE_MATRIX.md, CTO-adapted: NO app
 * bar, so the functional header = hero + trust strip — 320 px tall at 360
 * wide, 308 at 320 — and the whole unit, status padding included, measures
 * 380 / 368).
 *
 * The harness renders the REAL `renderEntete` output (the exact bytes a
 * cliente receives) inside the vitrine's page geometry, against the served
 * dist so the committed woff2 faces load. `font-display: optional` is
 * rewritten to `block` HERE ONLY: a screenshot harness must show the real
 * faces deterministically; the shipped page keeps `optional` (the cold-start
 * e2es own that law).
 */

const AVATAR_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="#8A5A3A"/><circle cx="240" cy="200" r="90" fill="#5C3A24"/><rect x="140" y="300" width="200" height="340" rx="60" fill="#5C3A24"/></svg>',
  );

const BASE = {
  id: 'sf-bb', resellerId: 'rs-bb', slug: 'beurni-1',
  name: 'Beurni Boss', zone: 'Gounghin, Ouagadougou', category: 'Général',
  tagline: '', bio: '', theme: 'laterite',
  cover: { status: 'none' },
  avatar: { mode: 'photo', url: AVATAR_SVG },
  curatedItems: ['pv-1'], featuredItems: [], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};

/** The matrix fixtures, in the repo's native shapes. */
const FIXTURES = {
  complete: { sf: BASE, trust: { deliveredCount: 128, rating: '4,9', reviewCount: 28, demo: false } },
  minimal: { sf: BASE, trust: { deliveredCount: 0, rating: '', reviewCount: 0, demo: false } },
  'sans-avis': { sf: BASE, trust: { deliveredCount: 1, rating: '5', reviewCount: 2, demo: false } },
  'long-name': {
    sf: { ...BASE, name: 'Atelier Élégance-Burkina', zone: 'Secteur 30, Bobo-Dioulasso' },
    trust: { deliveredCount: 1287, rating: '4,75', reviewCount: 307, demo: false },
  },
  'sans-photo': {
    sf: { ...BASE, avatar: { mode: 'monogram' } },
    trust: { deliveredCount: 0, rating: '', reviewCount: 0, demo: false },
  },
  'sans-photo-complete': {
    sf: { ...BASE, avatar: { mode: 'monogram' } },
    trust: { deliveredCount: 42, rating: '4,6', reviewCount: 9, demo: false },
  },
} as const;
type FixtureName = keyof typeof FIXTURES;

const STYLES = [
  { key: 'masque', root: 'vt-ma', p: 'ma', scene360: 246, trust360: 74 },
  { key: 'harmattan', root: 'vt-ha', p: 'ha', scene360: 246, trust360: 74 },
  { key: 'balafon', root: 'vt-ba', p: 'ba', scene360: 248, trust360: 72 },
  { key: 'seance', root: 'vt-se', p: 'se', scene360: 246, trust360: 74 },
  { key: 'cauris', root: 'vt-ca', p: 'ca', scene360: 248, trust360: 72 },
] as const;

/** Which screenshots each width owes the matrix (30 required + F3/F6 = 40). */
const SHOTS: Record<number, readonly FixtureName[]> = {
  360: ['complete', 'minimal', 'sans-avis', 'sans-photo-complete'],
  320: ['complete', 'minimal', 'long-name', 'sans-photo'],
};

const ART = join(import.meta.dirname, '../.artifacts/shopplus-headers');

let fontsCss = readFileSync(join(import.meta.dirname, '../src/fonts.css'), 'utf8')
  .replaceAll("url('./fonts/", "url('/fonts/")
  .replaceAll('font-display: optional', 'font-display: block');

async function mount(page: Page, key: string, fixture: FixtureName): Promise<void> {
  const { sf, trust } = FIXTURES[fixture];
  const unit = renderEntete(key as never, sf as never, trust as never, {});
  const html = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${fontsCss}</style>`,
    `<style>${ENTETES_STYLES}</style>`,
    // the vitrine page geometry the unit bleeds out of: status 54 + liseré 6 +
    // pad 16 = 76 top, side pad 20 (see .vt-ent margin), page surface below.
    '<style>html,body{margin:0;padding:0}body{background:#F4EFE6;font-family:\'Instrument Sans\',system-ui,sans-serif}.page{padding:76px 20px 0}</style>',
    `</head><body><div class="page">${unit}</div></body></html>`,
  ].join('');
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [360, 320] as const) {
  for (const style of STYLES) {
    test(`${style.key} @ ${width}: matrix geometry, honesty, overflow, screenshots`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/'); // origin only — /fonts/*.woff2 resolve from dist
      mkdirSync(join(ART, style.key), { recursive: true });

      const sceneH = width === 360 ? style.scene360 : 236;
      const trustH = width === 360 ? style.trust360 : 72;

      for (const fixture of Object.keys(FIXTURES) as FixtureName[]) {
        await mount(page, style.key, fixture);
        const unit = page.locator(`.${style.root}`);
        await expect(unit).toBeVisible();

        // no horizontal overflow, page-wide
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scroll, `${fixture}: horizontal overflow`).toBe(width);

        // hero + trust strip carry the handoff heights (±1 for rounding)
        const scene = await page.locator(`.${style.p}-scene`).boundingBox();
        expect(Math.abs(scene!.height - sceneH), `${fixture}: scene ${scene!.height}`).toBeLessThanOrEqual(1);
        const trust = await page.locator('[data-role="vitrine-trust"]').boundingBox();
        expect(Math.abs(trust!.height - trustH), `${fixture}: trust ${trust!.height}`).toBeLessThanOrEqual(1);
        // the functional header (unit incl. its 60px status pad) = 380 / 368
        const box = await unit.boundingBox();
        expect(Math.abs(box!.height - (60 + sceneH + trustH)), `${fixture}: unit ${box!.height}`).toBeLessThanOrEqual(2);
        expect(box!.width, `${fixture}: full bleed`).toBe(width);

        // proof and badge are mutually exclusive, per the data — and whichever
        // exists must sit WHOLLY inside the scene: DOM presence is not enough,
        // a chip clipped by the hero's overflow is invisible to her (this
        // exact defect shipped in the first build of this slice and only the
        // pixels showed it).
        for (const role of ['reputation', 'chip-nouvelle', 'chip-avis']) {
          const el = page.locator(`[data-role="${role}"]`);
          if ((await el.count()) === 1) {
            const b = (await el.boundingBox())!;
            expect(b.y + b.height, `${fixture}: ${role} clipped below the scene`).toBeLessThanOrEqual(
              scene!.y + scene!.height + 1,
            );
            expect(b.y, `${fixture}: ${role} above the scene`).toBeGreaterThanOrEqual(scene!.y - 1);
          }
        }
        const proof = await page.locator('[data-role="reputation"]').count();
        const badge = await page.locator('[data-role="chip-nouvelle"]').count();
        expect(proof + badge, `${fixture}: proof XOR badge`).toBeLessThanOrEqual(1);
        const { trust: tr } = FIXTURES[fixture];
        expect(proof, fixture).toBe(tr.deliveredCount >= 1 ? 1 : 0);
        expect(badge, fixture).toBe(tr.deliveredCount === 0 && tr.reviewCount === 0 ? 1 : 0);
        // the rating chip obeys the floor of 3
        expect(await page.locator('[data-role="chip-avis"]').count(), fixture).toBe(tr.reviewCount >= 3 ? 1 : 0);

        // the seller portrait is the ONLY runtime image inside the header
        const imgs = await unit.locator('img').count();
        expect(imgs, fixture).toBe((FIXTURES[fixture].sf.avatar as { url?: string }).url ? 1 : 0);

        // no running-text element overflows its own box
        const overflowing = await unit.evaluate((el) => {
          const bad: string[] = [];
          for (const node of el.querySelectorAll<HTMLElement>('*')) {
            if (node.childElementCount === 0 && (node.textContent ?? '').trim().length > 0) {
              if (node.scrollWidth > node.clientWidth + 1) bad.push(`${node.className}:${node.scrollWidth}/${node.clientWidth}`);
            }
          }
          return bad;
        });
        expect(overflowing, `${fixture}: text overflow`).toEqual([]);

        // name ≤ 2 lines, tail nowrap; zone ≤ 2 lines (17px line)
        const nameEl = page.locator(`.${style.p}-name`);
        const lines = await nameEl.evaluate((el) => {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          const lh = parseFloat(getComputedStyle(el).lineHeight) || fs * 0.9;
          return Math.round(el.getBoundingClientRect().height / lh);
        });
        expect(lines, `${fixture}: name lines`).toBeLessThanOrEqual(2);
        expect(await page.locator('.vt-ent-tail').first().evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
        const zoneH = await page.locator(`.${style.p}-zone`).evaluate((el) => el.getBoundingClientRect().height);
        expect(zoneH, `${fixture}: zone lines`).toBeLessThanOrEqual(35);

        // the share control keeps the 44px touch floor
        const share = await page.locator('.vt-ent-share').boundingBox();
        expect(share!.width).toBeGreaterThanOrEqual(44);
        expect(share!.height).toBeGreaterThanOrEqual(44);

        // decorative layers never intercept taps
        const decor = await unit.evaluate((el) =>
          [...el.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].every(
            (d) => getComputedStyle(d).pointerEvents === 'none',
          ),
        );
        expect(decor, `${fixture}: decor taps`).toBe(true);

        // the three trust labels, word for word, visible
        for (const label of ['Livraison Séra vérifiée & scellée', 'Paiement protégé', 'Les meilleurs prix garantis']) {
          await expect(unit.getByText(label, { exact: true })).toBeVisible();
        }

        if (SHOTS[width]!.includes(fixture)) {
          await page.screenshot({ path: join(ART, style.key, `${fixture}-${width}x800.png`) });
        }
      }
    });
  }
}

test('app path: each of the five keys mounts its own unit through ?entete=', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const style of STYLES) {
    await page.goto(`/?demo-vitrine=aicha-4821&entete=${style.key}`);
    await expect(page.locator(`.vt-root[data-etat="ready"]`)).toBeVisible();
    await expect(page.locator(`.${style.root}`)).toBeVisible();
    // the demo shop has 16 deliveries — proof, never the badge
    await expect(page.locator('[data-role="reputation"]')).toBeVisible();
    expect(await page.locator('[data-role="chip-nouvelle"]').count()).toBe(0);
  }
});
