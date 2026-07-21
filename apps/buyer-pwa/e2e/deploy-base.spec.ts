import { expect, test } from '@playwright/test';

/**
 * BUG 2 — the storefront `/v/{slug}` deep link must BOOT on the real GitHub
 * Pages deploy (beurni2.github.io/shop-plus/), not 404. The failure mode a7381cf
 * never caught: vite's relative base ('./') + the 404.html SPA restore. On a
 * deep link Pages serves 404.html → it redirects to `/shop-plus/?/v/{slug}` →
 * index.html restores the path with replaceState, which moves document.baseURI
 * to `/shop-plus/v/` — so the RELATIVE `./assets/index-*.js` module script
 * resolved to `/shop-plus/v/assets/*` and 404'd; the app never booted.
 *
 * These drive the REAL path against the PAGES EMULATOR (project sub-path +
 * serve-file-else-404.html on :4174), which vite preview cannot reproduce.
 * The fix: the restore script pins a <base> to the app root before rewriting
 * the URL, so `./assets/*` always resolve to `/shop-plus/`.
 */

const PAGES = 'http://127.0.0.1:4174';

test('a bare-origin request redirects to the project base (Pages project-site shape)', async ({ page }) => {
  const resp = await page.goto(`${PAGES}/`);
  // ends up at /shop-plus/ (the app), never a dead origin root
  expect(new URL(page.url()).pathname).toBe('/shop-plus/');
  expect(resp?.status()).toBeLessThan(400);
});

test('the /shop-plus/v/{slug} deep link BOOTS the vitrine (404 → restore → assets load)', async ({ page }) => {
  // fail LOUD if any asset (the module script above all) 404s during the boot.
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => {
    if (r.status() === 404 && /\.(js|css|woff2)$/.test(new URL(r.url()).pathname)) failed.push(r.url());
  });

  await page.goto(`${PAGES}/shop-plus/v/aicha-4821`, { waitUntil: 'load' });

  // the app booted: the vitrine mounted (the module script resolved + ran).
  await expect(page.locator('.vt-root[data-screen="vitrine"]')).toBeVisible({ timeout: 10_000 });
  // the URL was restored to the canon /v/{slug} path (not left on `?/…`).
  expect(new URL(page.url()).pathname).toBe('/shop-plus/v/aicha-4821');
  // the module script + assets loaded under the project base — a <base>-pinned
  // resolution, NOT the /shop-plus/v/assets/* that caused the 404.
  const scriptSrc = await page.locator('script[type="module"]').first().getAttribute('src');
  expect(scriptSrc).toContain('assets/');
  expect(failed, `assets 404'd during boot: ${failed.join(', ')}`).toEqual([]);
});

test('the signed /shop-plus/s/{slug} deep link BOOTS the achat S1 (same restore path)', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() === 404 && /\.(js|css|woff2)$/.test(new URL(r.url()).pathname)) failed.push(r.url());
  });

  await page.goto(`${PAGES}/shop-plus/s/aicha-4821?pid=p2`, { waitUntil: 'load' });

  // the pixel achat S1 mounted for the REAL shared product (p2 = Pagne wax).
  await expect(page.locator('main.ac-root [data-screen="produit"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.ac-prodtitle')).toHaveText('Pagne wax 6 yards');
  expect(new URL(page.url()).pathname).toBe('/shop-plus/s/aicha-4821');
  expect(failed, `assets 404'd during boot: ${failed.join(', ')}`).toEqual([]);
});
