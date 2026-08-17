import { expect, test } from '@playwright/test';

/**
 * ═══ AFFICHE-QR, DRIVEN — the printable poster in a real browser ═══
 *
 * FOUNDER, 2026-08-15: « the option to print the QR code as well ». The
 * reseller app opens `/v/{slug}?affiche=qr`; this spec drives what answers it,
 * in the browser that will actually print it. The standing order's four
 * questions, on the buyer PWA's newest screen: the page mounts (the tree
 * survived), the print button is present AND wired (it reaches the browser's
 * own `window.print`), and the sheet is complete BEFORE any storefront read
 * lands — the QR, the link and the spoken code owe nothing to the network.
 *
 * `?demo-vitrine=` supplies the slug the same way every entêtes spec does —
 * the poster branch reads the slug exactly where the vitrine mount would.
 */

test('the poster mounts complete: QR, link, spoken code, and a wired print button', async ({ page }) => {
  await page.goto('/?demo-vitrine=aicha-4821&affiche=qr');

  const poster = page.locator('[data-role="affiche-qr"]');
  await expect(poster).toBeVisible();

  // The QR is real drawn geometry, not an empty svg shell.
  const rects = poster.locator('svg rect');
  expect(await rects.count(), 'the QR drew no modules').toBeGreaterThan(10);

  // The link she prints is the boutique URL derived from THIS deploy's base.
  await expect(poster).toContainText('/v/aicha-4821');
  // …and the spoken fallback for a phone that cannot scan.
  await expect(poster).toContainText('AICHA-4821');

  // The print button: present, visible, and wired to the browser's own dialog.
  const imprimer = page.locator('[data-role="affiche-imprimer"]');
  await expect(imprimer).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __imprime: number }).__imprime = 0;
    window.print = () => {
      (window as unknown as { __imprime: number }).__imprime += 1;
    };
  });
  await imprimer.click();
  expect(
    await page.evaluate(() => (window as unknown as { __imprime: number }).__imprime),
    'the button did not reach window.print',
  ).toBe(1);
});

test('the poster is NOT the shop — and the shop is NOT the poster', async ({ page }) => {
  // The same slug without the dress mounts the vitrine, untouched.
  await page.goto('/?demo-vitrine=aicha-4821');
  await expect(page.locator('[data-role="affiche-qr"]')).toHaveCount(0);

  // And the poster carries no product tiles, no prices — it is a sheet, not a shop.
  await page.goto('/?demo-vitrine=aicha-4821&affiche=qr');
  await expect(page.locator('[data-role="affiche-qr"]')).toBeVisible();
  await expect(page.locator('.vt-root')).toHaveCount(0);
});
