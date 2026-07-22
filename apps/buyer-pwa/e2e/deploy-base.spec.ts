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

test('the signed /shop-plus/s/{slug} deep link BOOTS the cliente C1 (same restore path)', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() === 404 && /\.(js|css|woff2)$/.test(new URL(r.url()).pathname)) failed.push(r.url());
  });

  await page.goto(`${PAGES}/shop-plus/s/aicha-4821?pid=p2`, { waitUntil: 'load' });

  // the pixel cliente C1 mounted for the REAL shared product (p2 = Pagne wax).
  await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.cl-prodtitle')).toHaveText('Pagne wax 6 yards');
  expect(new URL(page.url()).pathname).toBe('/shop-plus/s/aicha-4821');
  expect(failed, `assets 404'd during boot: ${failed.join(', ')}`).toEqual([]);
});

test('SHARE-IDENTITY — tapping a vitrine product opens THAT product on the buyer C1, name and price identical (founder, 2026-07-22)', async ({ page }) => {
  // The founder's scenario end-to-end on the REAL deploy shape: open her
  // vitrine, tap a product tile, ride the /s/{slug}?pid= link through the
  // Pages 404→restore, and land on the C1 of the SAME product — same name,
  // same signed price bytes. A different product opening here is the exact
  // bug the strict-pid law forbids.
  await page.goto(`${PAGES}/shop-plus/v/aicha-4821`, { waitUntil: 'load' });
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible({ timeout: 10_000 });

  // pick the SECOND in-stock tile — deliberately NOT the featured/default
  // product, so a silent curated-first fallback cannot pass this test.
  const tile = page.locator('.vt-tile[data-action="produit"]').nth(1);
  const tileName = (await tile.locator('.vt-tile-name v').innerText()).trim();
  const tilePrice = (await tile.locator('.vt-tile-price v').innerText()).trim();
  const tilePid = await tile.getAttribute('data-pid');
  expect(tileName.length).toBeGreaterThan(0);
  expect(tilePid).toBeTruthy();

  await tile.click();
  // the C1 of THAT product mounted, through the real restore path.
  await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible({ timeout: 10_000 });
  expect(new URL(page.url()).searchParams.get('pid')).toBe(tilePid);
  await expect(page.locator('.cl-prodtitle')).toHaveText(tileName);
  // the signed price is byte-identical to the tile's (both ride the ONE
  // formatter) — textContent, so span boundaries add no layout newlines.
  const band = await page.locator('[data-role="price-band"]').evaluate((el) => el.textContent ?? '');
  expect(band).toContain(tilePrice);
});
