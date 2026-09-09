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

test('the PWA shell boots on the shop-plus theme, the honest card as root', async ({ page }) => {
  // RACINE-HONNETE-1 (AUDIT-SHOP-2 F-19) — the root is the card that takes her
  // seller's link, never the demo directory. GRAND TEINT: quiet ink wordmark on
  // warm paper.
  await page.goto('/');
  await expect(page).toHaveTitle('Shop+');
  await expect(page.locator('[data-screen="racine"]')).toBeVisible();
  const marque = page.locator('h1.racine-marque');
  await expect(marque).toHaveText('Shop+');
  await expect(marque).toHaveCSS('color', hexToRgb(theme.colours.ink));
  await expect(page.locator('body')).toHaveCSS('background-color', hexToRgb(theme.colours.paper));
  await expect(page.locator('[data-role="boutique"]')).toHaveCount(0);
});

test('the S3 directory survives as the ?demo-boutiques= gallery, its laws intact', async ({ page }) => {
  await page.goto('/?demo-boutiques=default');
  // The S3 title « LES BOUTIQUES » owns the screen (the mockup carries no
  // separate brand bar).
  const title = page.locator('h1.bq-title');
  await expect(title).toHaveText('LES BOUTIQUES');
  await expect(title).toHaveCSS('color', hexToRgb(theme.colours.ink));

  // SP-I11: the deterministic order is stated ON-SCREEN, never a hidden score.
  await expect(page.locator('[data-role="ordering-sentence"]')).toContainText(
    'Classées par dernière mise à jour',
  );
  // SP-I05: stores, not products — the first store card links to a vitrine,
  // under the deploy base ('' at an origin root).
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
