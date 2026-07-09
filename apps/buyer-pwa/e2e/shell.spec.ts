import { expect, test } from '@playwright/test';
import { shopPlusTheme as theme } from '@platform/ui-tokens';

// DoD: "reseller shell + PWA shell boot with ui-tokens theme shop-plus".
// This drives the real built PWA in a real Chromium.

function hexToRgb(hex: string): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

test('the PWA shell boots on the shop-plus theme with catalog strings', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Shop+');

  const brand = page.locator('h1');
  await expect(brand).toHaveText('Shop+');
  await expect(brand).toHaveCSS('color', hexToRgb(theme.colors.primary));

  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    hexToRgb(theme.colors.surface),
  );

  await expect(page.locator('h2')).toHaveText('Découvrez les boutiques de votre quartier.');
  await expect(page.locator('.empty-state')).toHaveText('Les premières boutiques arrivent bientôt.');
});

test('the page declares itself an installable-ready PWA (manifest present)', async ({ page }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('/manifest.webmanifest');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect(await manifest.json()).toMatchObject({ name: 'Shop+', display: 'standalone' });
});
