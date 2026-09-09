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
 * reload · the primary action (the honest card's field and button —
 * RACINE-HONNETE-1 retired the demo directory from the root) is present and
 * usable, and the offline band is painted (F-63) · the worker's automatic
 * road (redirect + restore) leaves her ON the vitrine, not on an error page ·
 * she reaches the next screen with no network at all.
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
  // and the honest card renders — its field usable, its offline band painted,
  // no invented seller.
  await page.reload();
  await expect(page.locator('[data-screen="racine"]')).toBeVisible();
  await expect(page.locator('[data-role="racine-lien"]')).toBeEditable();
  await expect(page.locator('[data-action="racine-ouvrir"]')).toBeEnabled();
  await expect(page.locator('[data-role="offline"]')).toHaveText(
    'Pas de réseau pour le moment. Le lien s’ouvrira quand la connexion reviendra.',
  );
  await expect(page.locator('main')).not.toContainText('CHEZ AÏCHA');

  // Cold DEEP open, offline: /v/{slug} has no file behind it — online the
  // static host serves 404.html; offline the worker replays that exact road
  // (redirect to the root with the `?/` encoding), the restore script pins the
  // base and restores the path, and the vitrine mounts. RED: error page.
  await page.goto('/shop-plus/v/aicha-4821');
  await expect(page).toHaveURL(/\/shop-plus\/v\/aicha-4821$/);
  await expect(page.locator('[data-role="vitrine-hero"]')).toBeVisible();
  await expect(page.locator('[data-role="vitrine-identity"]')).toContainText('Chez Aïcha Mode');
});
