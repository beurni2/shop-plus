import { expect, test } from '@playwright/test';

/**
 * QUARTIERS-OUAGA-1 — THE WALK, on the live C3 screen: the official list is
 * really there, the filter really narrows without stealing her caret's
 * field, a deep quartier is really choosable, and a name our répertoire
 * does not know still gets her through (her own text offered back).
 */
test('the quartier picker: full official list, live filter, deep pick, and the no-match road', async ({ page }) => {
  await page.goto('/?demo-cliente=C3');
  await expect(page.locator('[data-screen="C3"]')).toBeVisible();

  // The FULL official répertoire stands ready — far beyond the old eight.
  const chips = page.locator('[data-role="quartier-chips"] [data-action="zone"]');
  expect(await chips.count()).toBeGreaterThanOrEqual(70);

  // She types — the cloud narrows to her quartier, the field keeps her text.
  const filtre = page.locator('[data-role="quartier-filtre"]');
  await filtre.fill('rimkieta');
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveAttribute('data-zone', 'Rimkièta');
  await expect(filtre).toHaveValue('rimkieta');

  // The deep pick takes — pressed state on the chip she chose.
  await chips.first().click();
  await expect(
    page.locator('[data-role="quartier-chips"] .cl-chip-on[data-zone="Rimkièta"]'),
  ).toBeVisible();

  // A quartier our doc does not know is NEVER a dead end: her text, offered.
  await filtre.fill('Zone du Bois');
  await expect(chips).toHaveCount(2); // her earlier choice stays visible + the offer
  const libre = page.locator('[data-role="quartier-chips"] .cl-chip-libre');
  await expect(libre).toContainText('Zone du Bois');
  await libre.click();
  await expect(
    page.locator('[data-role="quartier-chips"] .cl-chip-on[data-zone="Zone du Bois"]'),
  ).toBeVisible();
});
