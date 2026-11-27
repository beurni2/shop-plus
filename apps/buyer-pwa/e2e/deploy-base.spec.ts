import { expect, test } from '@playwright/test';

/**
 * BUG 2 — the storefront `/v/{slug}` deep link must BOOT on the real deploy,
 * not 404. The failure mode a7381cf never caught: vite's relative base ('./')
 * + the 404.html SPA restore. On a deep link the host serves 404.html → it
 * redirects to `/?/v/{slug}` → index.html restores the path with
 * replaceState, which moves document.baseURI to `/v/` — so the RELATIVE
 * `./assets/index-*.js` module script resolved to `/v/assets/*` and 404'd;
 * the app never booted.
 *
 * These drive the REAL path against the site's OWN HOST, emulated (the root
 * of its address + serve-file-else-404.html on :4174, scripts/pages-racine.mjs),
 * which vite preview cannot reproduce. ADRESSE-PROPRE: the site moved from a
 * shared project sub-path to the root of its own address; the road is the
 * same. The fix: the restore script pins a <base> to the app root before
 * rewriting the URL, so `./assets/*` always resolve to `/`.
 */

const PAGES = 'http://127.0.0.1:4174';

test('the root of its own address IS the app (no project sub-path, no redirect)', async ({ page }) => {
  const resp = await page.goto(`${PAGES}/`);
  expect(new URL(page.url()).pathname).toBe('/');
  expect(resp?.status()).toBe(200);
  await expect(page.locator('[data-screen="racine"]')).toBeVisible({ timeout: 10_000 });
});

test('the /v/{slug} deep link BOOTS the vitrine (404 → restore → assets load)', async ({ page }) => {
  // fail LOUD if any asset (the module script above all) 404s during the boot.
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => {
    if (r.status() === 404 && /\.(js|css|woff2)$/.test(new URL(r.url()).pathname)) failed.push(r.url());
  });

  await page.goto(`${PAGES}/v/aicha-4821`, { waitUntil: 'load' });

  // the app booted: the vitrine mounted (the module script resolved + ran).
  await expect(page.locator('.vt-root[data-screen="vitrine"]')).toBeVisible({ timeout: 10_000 });
  // the URL was restored to the canon /v/{slug} path (not left on `?/…`).
  expect(new URL(page.url()).pathname).toBe('/v/aicha-4821');
  // the module script + assets loaded under the app root — a <base>-pinned
  // resolution, NOT the /v/assets/* that caused the 404.
  const scriptSrc = await page.locator('script[type="module"]').first().getAttribute('src');
  expect(scriptSrc).toContain('assets/');
  expect(failed, `assets 404'd during boot: ${failed.join(', ')}`).toEqual([]);
});

test('the signed /s/{slug} deep link BOOTS the cliente C1 (same restore path)', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() === 404 && /\.(js|css|woff2)$/.test(new URL(r.url()).pathname)) failed.push(r.url());
  });

  await page.goto(`${PAGES}/s/aicha-4821?pid=p2`, { waitUntil: 'load' });

  // the pixel cliente C1 mounted for the REAL shared product (p2 = Pagne wax).
  await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.cl-prodtitle')).toHaveText('Pagne wax 6 yards');
  expect(new URL(page.url()).pathname).toBe('/s/aicha-4821');
  expect(failed, `assets 404'd during boot: ${failed.join(', ')}`).toEqual([]);
});

test('SHARE-IDENTITY — tapping a vitrine product opens THAT product on the buyer C1, name and price identical (founder, 2026-07-22)', async ({ page }) => {
  // The founder's scenario end-to-end on the REAL deploy shape: open her
  // vitrine, tap a product tile, ride the /s/{slug}?pid= link through the
  // Pages 404→restore, and land on the C1 of the SAME product — same name,
  // same signed price bytes. A different product opening here is the exact
  // bug the strict-pid law forbids.
  await page.goto(`${PAGES}/v/aicha-4821`, { waitUntil: 'load' });
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
