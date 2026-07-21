import { expect, test } from '@playwright/test';
import { shopPlusTheme as theme } from '@platform/ui-tokens/legacy';

// DoD: "reseller shell + PWA shell boot with ui-tokens theme shop-plus".
// This drives the real built PWA in a real Chromium.

function hexToRgb(hex: string): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

test('the PWA shell boots on the shop-plus theme, S3 directory as root', async ({ page }) => {
  // WO-7.2a — root IS the S3 store directory now (« root » entry, founder-ruled).
  await page.goto('/');
  await expect(page).toHaveTitle('Shop+');

  // The S3 title « LES BOUTIQUES » owns the screen (the mockup carries no
  // separate brand bar). GRAND TEINT: quiet ink title on warm paper.
  const title = page.locator('h1.bq-title');
  await expect(title).toHaveText('LES BOUTIQUES');
  await expect(title).toHaveCSS('color', hexToRgb(theme.colours.ink));
  await expect(page.locator('body')).toHaveCSS('background-color', hexToRgb(theme.colours.paper));

  // SP-I11: the deterministic order is stated ON-SCREEN, never a hidden score.
  await expect(page.locator('[data-role="ordering-sentence"]')).toContainText(
    'Classées par dernière mise à jour',
  );
  // SP-I05: stores, not products — the first store card links to a vitrine.
  const firstStore = page.locator('[data-role="boutique"]').first();
  await expect(firstStore).toBeVisible();
  await expect(firstStore).toContainText('CHEZ AÏCHA');
  await expect(firstStore).toHaveAttribute('href', '/v/aicha-4821');
});

test('the page declares itself an installable-ready PWA (manifest present)', async ({ page }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  // WO-4.2E: base './' — the manifest link is RELATIVE so the same build
  // serves local preview and GitHub Pages project hosting.
  expect(manifestHref).toBe('./manifest.webmanifest');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect(await manifest.json()).toMatchObject({ name: 'Shop+', display: 'standalone' });
});

// The E2 order-view/checkout demos (?demo-order / ?demo-checkout) rode the
// legacy Grand Teint buyer surface, now retired. Equal-weight prominence in the
// pixel PARCOURS D'ACHAT is proven by e2e/achat.spec.ts (the « Un souci ? »
// danger-prominence lock) + the door/refusal semantics living in commerce-core.
