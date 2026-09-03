import { expect, test } from '@playwright/test';

/**
 * ═══ COQUILLE-HORS-LIGNE-1 — the cold-offline walk (AUDIT-SHOP-1 slice d) ═══
 *
 * The audit's MAJOR (3): the installed PWA, cold-opened without network, was
 * the browser's own error page — Law 7 broken at the front door. This walk
 * drives the REAL built bundle on the Pages emulator (4174: project sub-path
 * + 404.html fallback, the same shape as beurni2.github.io/shop-plus/) with
 * the service worker ALLOWED — the rest of the suite blocks workers so its
 * route stubs stay honest (playwright.config.ts).
 *
 * Written RED first: before sw.js existed, the offline reload and the offline
 * deep open below both landed on chrome-error:// and every assertion failed.
 *
 * The four walk questions, answered here: the tree survives the offline
 * reload · the primary action (a boutique card) is present and pressable ·
 * the worker's automatic road (redirect + restore) leaves her ON the vitrine,
 * not on an error page · she reaches the next screen with no network at all.
 * The walk claims NOTHING about appearance — no colour, no layout; those stay
 * with the token checks and the founder's eyes.
 */

test.use({ serviceWorkers: 'allow', baseURL: 'http://127.0.0.1:4174' });

test('installed once, the shell cold-opens offline — the directory, then a deep /v/ link', async ({
  page,
  context,
}) => {
  // First visit, online: the worker installs and claims the page. Waiting on
  // `controller` waits on the whole install (precache is install's waitUntil).
  await page.goto('/shop-plus/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);

  // Cold reload at the root, offline: the cached shell answers, the app boots,
  // and the directory renders with its primary action pressable.
  await page.reload();
  const carte = page.locator('a[data-role="boutique"]').first();
  await expect(carte).toBeVisible();
  await expect(page.locator('main')).toContainText('CHEZ AÏCHA');

  // Cold DEEP open, offline: /v/{slug} has no file behind it — online the
  // static host serves 404.html; offline the worker replays that exact road
  // (redirect to the root with the `?/` encoding), the restore script pins the
  // base and restores the path, and the vitrine mounts. RED: error page.
  await page.goto('/shop-plus/v/aicha-4821');
  await expect(page).toHaveURL(/\/shop-plus\/v\/aicha-4821$/);
  await expect(page.locator('[data-role="vitrine-hero"]')).toBeVisible();
  await expect(page.locator('[data-role="vitrine-identity"]')).toContainText('Chez Aïcha Mode');
});
