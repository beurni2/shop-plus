import { expect, test, type Page } from '@playwright/test';

/**
 * BORNES-VITRINE-1 (AUDIT-SHOP-2 F-55) — a malformed wire field never blanks
 * her shop. THE DRIVEN WALK, on the port-4175 build (made WITH
 * `VITE_STOREFRONT_BASE`, so the REAL http port runs in a real browser against
 * a scripted service).
 *
 * The audit measured the blank: the service answered a shop whose product
 * carried `assetRefs: [123]`, and a shop without `cover` — both threw in the
 * renderer BEFORE `innerHTML`, so the buyer saw nothing at all. This walk
 * scripts exactly that answer and asks the four questions: did the tree
 * survive · is the primary action (a product tile) present, pressable and
 * wired · can she reach the next screen (HER OFFER, C1, opened as the host
 * hands it to the app) · no pageerror.
 * The walk claims NOTHING about appearance.
 */

const BASE = 'http://127.0.0.1:4175';
test.use({ baseURL: BASE });

/** The audit's shop, as the service would hand it back: no cover, no avatar,
 *  no featured list, no sections, no bio, no tagline, no zone — and three
 *  products whose photograph references are a number, a null beside a real
 *  one, and not a list at all. */
const MALFORMEE = {
  id: 'sf-e2e-bv-1',
  slug: 'aicha-4821',
  resellerId: 'rs-e2e-bv-1',
  name: 'Chez Aïcha Mode',
  discoverable: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  curatedItems: ['p1', 'p2', 'p3', 404],
  products: [
    { pid: 'p1', name: 'Bazin riche brodé', priceFcfa: 12_000, inStock: true, assetRefs: [123] },
    { pid: 'p2', name: 'Pagne wax 6 yards', priceFcfa: 8_500, inStock: true, assetRefs: [null, 'https://media.example/media/p2-hero'] },
    { pid: 'p3', name: 'Foulard', priceFcfa: 3_000, inStock: false, assetRefs: 'pas-une-liste' },
  ],
};

async function ouvrir(page: Page, path: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  await page.route('**/api/s/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MALFORMEE) }),
  );
  // photographs and quotes are not this walk's subject: they fail fast
  await page.route('https://media.example/**', (route) => route.abort('failed'));
  await page.route('**/checkout/**', (route) => route.abort('failed'));
  await page.goto(path);
  return errors;
}

test('F-55 — the boutique: the shop the audit blanked now draws, every product is a tile, and a tile reaches her offer', async ({ page }) => {
  const errors = await ouvrir(page, '/?/v/aicha-4821');
  // the tree survived: her identity is on the page
  await expect(page.locator('[data-role="vitrine-identity"]')).toContainText('Chez Aïcha Mode');
  // every product survived the boundary — none vanished on its photographs
  const p1 = page.locator('[data-action="produit"][data-pid="p1"]').first();
  const p2 = page.locator('[data-action="produit"][data-pid="p2"]').first();
  // p3 is épuisé: a muted tile by design (no tap action), drawn all the same —
  // its name is on the page and its « sans photo » art beside it.
  const p3 = page.locator('.vt-tile-epuise', { hasText: 'Foulard' }).first();
  await expect(p1).toBeVisible();
  await expect(p2).toBeVisible();
  await expect(p3).toBeVisible();
  await expect(p3.locator('[data-role="tile-sans-photo"]')).toHaveCount(1);
  // the number became « sans photo »; the real reference beside a null still draws a photo
  await expect(p1.locator('[data-role="tile-sans-photo"]')).toHaveCount(1);
  await expect(p2.locator('[data-role="tile-photo"]')).toHaveCount(1);
  expect(errors, 'no pageerror while the shop drew').toEqual([]);

  // the primary action is wired: the tile carries her to HER signed offer —
  // the same `/s/{slug}?pid=` link the reseller shares. The preview server on
  // this port has no 404 restore for a deep path (the Pages host does), so the
  // offer itself is walked below through the `?/s/` form the host hands the app.
  await p1.click();
  await expect(page).toHaveURL(`${BASE}/s/aicha-4821?pid=p1`);
  expect(errors, 'no pageerror on the way to the offer').toEqual([]);
});

test('F-55 — the offer opened directly for the product whose photograph reference is a number', async ({ page }) => {
  const errors = await ouvrir(page, '/?/s/aicha-4821&pid=p1');
  await expect(page.locator('[data-screen="C1"]')).toBeVisible();
  await expect(page.locator('main.cl-root')).toContainText('Bazin riche brodé');
  expect(errors).toEqual([]);
});
