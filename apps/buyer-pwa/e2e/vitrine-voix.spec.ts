import { expect, test } from '@playwright/test';

/**
 * VITRINE — « La voix » on a real page, after the host-reference fix.
 *
 * WHAT THIS IS AND IS NOT. The defect it accompanies was LATENT, not live: the
 * handler held the tapped ELEMENT, and a vitrine rebuild would have left it
 * writing the clock into a detached node — but after the first `ready` render
 * the only path back through `render()` is the retry button on the offline
 * screen, where no chip exists and no note can be playing. So this does not
 * reproduce a bug a buyer could hit today.
 *
 * It proves the thing that IS at risk: the rewrite that removed the trap must
 * not have broken the player that works. The host is now re-found by URL on
 * every tick, so if that lookup is wrong the face never appears at all — and
 * that is exactly what these assertions read, off the live DOM.
 */
test('a vitrine voice chip shows playback on the live DOM, and returns to rest', async ({ page }) => {
  await page.goto('/?demo-vitrine=aicha-4821');
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();

  const chip = page.locator('[data-action="voix-produit-play"]').first();
  await chip.waitFor();
  const horloge = chip.locator('.vt-tile-voix-dur, .voix-duration');
  const total = (await horloge.textContent())?.trim() ?? '';
  expect(total, 'the chip shows the note length at rest').toMatch(/^\d+:\d\d$/);
  await expect(chip).not.toHaveAttribute('data-voix-etat', 'lecture');

  await chip.click();
  // THE FACE IS DRESSED — and it is found by the URL lookup, not by a held node.
  await expect(chip).toHaveAttribute('data-voix-etat', 'lecture', { timeout: 5_000 });
  await expect(horloge).toHaveText('0:00', { timeout: 5_000 });

  // …and every way playback stops puts it back. The demo asset is a 1.1 s tone,
  // so this lands via `ended`; the same restore serves pause and error.
  await expect(chip).not.toHaveAttribute('data-voix-etat', 'lecture', { timeout: 8_000 });
  await expect(horloge).toHaveText(total);
});
