import { expect, test } from '@playwright/test';

/**
 * ═══ RACINE-HONNETE-1 (AUDIT-SHOP-2 F-19, F-63) — the honest front door,
 * DRIVEN on the real built bundle ═══
 *
 * The audit's F-19: the deployed root was a fictional store directory whose
 * every link was dead (five invented sellers, origin-absolute `/v/` hrefs
 * that left `/shop-plus/`). The root is now the card that says the one true
 * thing — a boutique opens from the link her seller sent — and takes it.
 *
 * The four walk questions: the tree survives a refused paste · the primary
 * action is present, pressable and wired to the two canon routes · a refusal
 * leaves the field, the sentence and the button all standing · she reaches
 * the boutique (and the signed offer) from the card. Nothing here claims a
 * colour or a layout.
 */

/**
 * Every walk drives the PAGES EMULATOR (4174: project sub-path + 404.html
 * fallback): the canon `/v/` and `/s/` paths the card navigates to have no
 * file behind them, and vite preview (4173) cannot replay the 404 → restore
 * road the real deploy serves (deploy-base.spec.ts, same reason).
 */
const PAGES = 'http://127.0.0.1:4174';

test('the root is the honest card: no invented seller, one field, one act — and a pasted /v/ link opens the boutique', async ({ page }) => {
  await page.goto(`${PAGES}/shop-plus/`);
  await expect(page.locator('[data-screen="racine"]')).toBeVisible();
  // the fiction is gone from the front door
  await expect(page.locator('[data-role="boutique"]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('CHEZ AÏCHA');
  await expect(page.locator('[data-role="offline"]')).toBeHidden();

  const champ = page.locator('[data-role="racine-lien"]');
  const ouvrir = page.locator('[data-action="racine-ouvrir"]');
  await expect(champ).toBeVisible();
  await expect(ouvrir).toBeEnabled();

  await champ.fill('  « https://beurni2.github.io/shop-plus/v/aicha-4821. »  ');
  await ouvrir.click();
  await expect(page).toHaveURL(`${PAGES}/shop-plus/v/aicha-4821`);
  await expect(page.locator('.vt-root[data-screen="vitrine"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-role="vitrine-identity"]')).toContainText('Chez Aïcha Mode');
});

test('a refused paste keeps her on the card with the sentence and the field; the bare slug then opens the boutique', async ({ page }) => {
  await page.goto(`${PAGES}/shop-plus/`);
  const champ = page.locator('[data-role="racine-lien"]');
  const refus = page.locator('[data-role="racine-refus"]');
  await expect(refus).toBeHidden();

  await champ.fill('https://wa.me/22670000000');
  await champ.press('Enter');
  // the tree survived, nothing navigated, the refusal is earned and visible
  await expect(page).toHaveURL(`${PAGES}/shop-plus/`);
  await expect(refus).toBeVisible();
  await expect(refus).toHaveText('Ce lien n’ouvre pas de boutique. Demandez un nouveau lien à votre vendeuse.');
  await expect(champ).toHaveAttribute('aria-invalid', 'true');
  await expect(champ).toBeFocused();
  await expect(page.locator('[data-action="racine-ouvrir"]')).toBeEnabled();

  // typing again clears the refusal; the bare slug is enough
  await champ.fill('AICHA-4821');
  await expect(refus).toBeHidden();
  await champ.press('Enter');
  await expect(page).toHaveURL(`${PAGES}/shop-plus/v/aicha-4821`);
  await expect(page.locator('.vt-root[data-screen="vitrine"]')).toBeVisible({ timeout: 10_000 });
});

test('the signed offer link opens THAT product on the cliente C1', async ({ page }) => {
  await page.goto(`${PAGES}/shop-plus/`);
  await page.locator('[data-role="racine-lien"]').fill('/s/aicha-4821?pid=p2');
  await page.locator('[data-action="racine-ouvrir"]').click();
  await expect(page).toHaveURL(`${PAGES}/shop-plus/s/aicha-4821?pid=p2`);
  await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.cl-prodtitle')).toHaveText('Pagne wax 6 yards');
});

test('on project-page hosting the card lands the link UNDER the deploy base (the F-19 404), and so does every directory href', async ({ page }) => {
  await page.goto(`${PAGES}/shop-plus/`);
  await expect(page.locator('[data-screen="racine"]')).toBeVisible();
  await page.locator('[data-role="racine-lien"]').fill('/v/aicha-4821');
  await page.locator('[data-action="racine-ouvrir"]').click();
  await expect(page).toHaveURL(`${PAGES}/shop-plus/v/aicha-4821`);
  await expect(page.locator('.vt-root[data-screen="vitrine"]')).toBeVisible({ timeout: 10_000 });

  // the demo directory survives only behind its harness lever, base-aware
  await page.goto(`${PAGES}/shop-plus/?demo-boutiques=default`);
  await expect(page.locator('h1.bq-title')).toHaveText('LES BOUTIQUES');
  await expect(page.locator('[data-role="boutique"]').first()).toHaveAttribute('href', '/shop-plus/v/aicha-4821');
  await page.goto(`${PAGES}/shop-plus/?demo-boutiques=empty`);
  await expect(page.locator('[data-action="voir-tout"]')).toHaveAttribute('href', '/shop-plus/?demo-boutiques=default');

  // the retired /boutiques path is the honest card too, and its base is still the app root
  await page.goto(`${PAGES}/shop-plus/boutiques`);
  await expect(page.locator('[data-screen="racine"]')).toBeVisible({ timeout: 10_000 });
  await page.locator('[data-role="racine-lien"]').fill('aicha-4821');
  await page.locator('[data-action="racine-ouvrir"]').click();
  await expect(page).toHaveURL(`${PAGES}/shop-plus/v/aicha-4821`);
  await expect(page.locator('.vt-root[data-screen="vitrine"]')).toBeVisible({ timeout: 10_000 });
});

test('the vitrine\'s invalid-link exit returns to the honest card under the deploy base', async ({ page }) => {
  await page.goto(`${PAGES}/shop-plus/v/inconnue-0000`);
  const sortie = page.locator('[data-action="decouvrir"]');
  await expect(sortie).toBeVisible({ timeout: 10_000 });
  await expect(sortie).toHaveText('Ouvrir une autre boutique');
  await sortie.click();
  await expect(page).toHaveURL(`${PAGES}/shop-plus/`);
  await expect(page.locator('[data-screen="racine"]')).toBeVisible();
});
