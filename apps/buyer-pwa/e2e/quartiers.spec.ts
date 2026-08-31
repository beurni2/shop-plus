import { expect, test } from '@playwright/test';

/**
 * QUARTIERS-OUAGA-1/2 — THE WALK, on the live C3 screen: the official list is
 * really there, the filter really narrows without stealing her caret's
 * field, a deep quartier is really choosable, and a name our répertoire
 * does not know still gets her through (her own text offered back).
 */
test('the quartier picker: full official list, live filter, deep pick, and the no-match road', async ({ page }) => {
  await page.goto('/?demo-cliente=C3');
  await expect(page.locator('[data-screen="C3"]')).toBeVisible();

  // The FULL official répertoire stands ready — the founder's 2026-08-28
  // répartition carries 101 names (the exact pin lives with the module).
  const chips = page.locator('[data-role="quartier-chips"] [data-action="zone"]');
  expect(await chips.count()).toBeGreaterThanOrEqual(100);

  // She types — the cloud narrows to her quartier, the field keeps her text.
  const filtre = page.locator('[data-role="quartier-filtre"]');
  await filtre.fill('rimkieta');
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveAttribute('data-zone', 'Rimkiéta');
  await expect(filtre).toHaveValue('rimkieta');

  // The deep pick takes — and FOLDS the picker (QUARTIER-CHOISI, founder
  // 2026-08-31): one calm row with her quartier and CHANGER, no field, no
  // cloud.
  await chips.first().click();
  await expect(page.locator('[data-role="zone-choisie"]')).toContainText('Rimkiéta');
  await expect(filtre).toHaveCount(0);
  await expect(page.locator('[data-role="quartier-chips"]')).toHaveCount(0);

  // CHANGER reopens it: her chip pressed (the choice is never lost), the
  // filter fresh for the next search.
  await page.locator('[data-action="zone-changer"]').click();
  await expect(
    page.locator('[data-role="quartier-chips"] .cl-chip-on[data-zone="Rimkiéta"]'),
  ).toBeVisible();
  await expect(page.locator('[data-role="quartier-filtre"]')).toHaveValue('');

  // A quartier our doc does not know is NEVER a dead end: her text, offered.
  // (Tanghin-Dassouri is a real place OUTSIDE the commune's répartition —
  // the villages-rattachés case the free-text road exists for.)
  await page.locator('[data-role="quartier-filtre"]').fill('Tanghin-Dassouri');
  await expect(chips).toHaveCount(2); // her earlier choice stays visible + the offer
  const libre = page.locator('[data-role="quartier-chips"] .cl-chip-libre');
  await expect(libre).toContainText('Tanghin-Dassouri');
  await libre.click();
  await expect(page.locator('[data-role="zone-choisie"]')).toContainText('Tanghin-Dassouri');
});
