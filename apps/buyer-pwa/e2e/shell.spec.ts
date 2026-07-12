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
  // WO-4.2E: base './' — the manifest link is RELATIVE so the same build
  // serves local preview and GitHub Pages project hosting.
  expect(manifestHref).toBe('./manifest.webmanifest');
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect(await manifest.json()).toMatchObject({ name: 'Shop+', display: 'standalone' });
});

test('E2 payment-failed view: retry and abandon carry IDENTICAL weight classes (M4 equal prominence)', async ({ page }) => {
  await page.goto('/?demo-order=payment_failed');
  const section = page.locator('.order-view[data-state="payment_failed"]');
  await expect(section).toBeVisible();
  await expect(section.locator('h2')).toHaveText("Le paiement n'est pas passé.");
  const retry = section.locator('button[data-key="order.action.retry"]');
  const abandon = section.locator('button[data-key="order.action.abandon"]');
  await expect(retry).toBeVisible();
  await expect(abandon).toBeVisible();
  await expect(retry).toHaveClass('action action-equal');
  await expect(abandon).toHaveClass('action action-equal');
  const [rBox, aBox] = [await retry.boundingBox(), await abandon.boundingBox()];
  expect(Math.abs((rBox?.height ?? 0) - (aBox?.height ?? 0))).toBeLessThanOrEqual(1); // same rendered size
});

test('E2 confirmed view: report-a-problem is as prominent as confirm-receipt', async ({ page }) => {
  await page.goto('/?demo-order=confirmed');
  const section = page.locator('.order-view[data-state="confirmed"]');
  await expect(section).toBeVisible();
  const confirm = section.locator('button[data-key="order.action.confirm_receipt"]');
  const problem = section.locator('button[data-key="order.action.report_problem"]');
  await expect(confirm).toHaveClass('action action-equal');
  await expect(problem).toHaveClass('action action-equal');
  const [cBox, pBox] = [await confirm.boundingBox(), await problem.boundingBox()];
  expect(Math.abs((cBox?.height ?? 0) - (pBox?.height ?? 0))).toBeLessThanOrEqual(1);
});
