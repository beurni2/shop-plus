import { expect, test } from '@playwright/test';

/**
 * PANIER-VITRINE-1 — THE WALK (the 2026-08-10 screen law, on this repo's own
 * harness: Playwright drives the REAL page in a real browser with real
 * localStorage). The founder's exact claim is the thing driven: she puts an
 * article in her panier, LEAVES (a genuine page reload — a fresh document,
 * a fresh script world), COMES BACK, and it is still there.
 *
 * The four questions, answered on the live DOM:
 *   · did the tree survive the tap — the band renders and the page stays alive;
 *   · is the action present AND pressable AND wired — the chip tap writes the
 *     store and the band appears without navigation;
 *   · a way out — « retirer » removes it, band folds honestly;
 *   · the next step — the band's card carries the product action that opens
 *     the article's own page (per-product checkout — no combined cart).
 */

test('the panier survives leaving and coming back — no account, her phone remembers', async ({ page }) => {
  await page.goto('/?demo-vitrine=aicha-4821');
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  // A clean start: no band, and the shelf is honestly absent (not an empty box).
  await expect(page.locator('[data-role="vitrine-panier"]')).toHaveCount(0);

  // She puts the first in-stock article in her panier — the tap goes to the
  // chip, never to the product navigation (closest() law).
  const chip = page.locator('.vt-tile .vt-pan').first();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-role="vitrine-panier"]')).toBeVisible();
  await expect(page).toHaveURL(/demo-vitrine=aicha-4821/); // no navigation happened
  const nom = await page.locator('[data-role="panier-article"] .vt-pan-name').first().innerText();
  expect(nom.length).toBeGreaterThan(0);

  // SHE LEAVES AND COMES BACK — a real reload: new document, new script world,
  // only her phone's storage carries the continuity.
  await page.reload();
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  await expect(page.locator('[data-role="vitrine-panier"]')).toBeVisible();
  await expect(page.locator('[data-role="panier-article"] .vt-pan-name').first()).toHaveText(nom);
  // …and the tile chip shows the kept state again.
  await expect(page.locator('.vt-tile .vt-pan').first()).toHaveAttribute('aria-pressed', 'true');
  // The band's card is wired to the product page (the next step exists).
  await expect(
    page.locator('[data-role="panier-article"] [data-action="produit"]').first(),
  ).toBeVisible();
  // NO TOTAL: one price per article, nothing summed (per-product truth).
  const bandPrices = page.locator('[data-role="vitrine-panier"] .vt-pan-price');
  await expect(bandPrices).toHaveCount(1);

  // THE WAY OUT — « retirer » empties the shelf and it folds honestly.
  await page.locator('[data-role="panier-article"] .vt-pan-retirer').first().click();
  await expect(page.locator('[data-role="vitrine-panier"]')).toHaveCount(0);
  await expect(page.locator('.vt-tile .vt-pan').first()).toHaveAttribute('aria-pressed', 'false');
  // …and staying gone across another return.
  await page.reload();
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  await expect(page.locator('[data-role="vitrine-panier"]')).toHaveCount(0);
});
