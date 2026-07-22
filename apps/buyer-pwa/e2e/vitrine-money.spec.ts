import { expect, test } from '@playwright/test';

/**
 * VITRINE — the money bytes on the live DOM (PWA-CLEANUP-1 §2). The vitrine
 * now rides the ONE formatter (cliente/money): every price tile must carry
 * U+202F between thousands AND before FCFA, read raw from textContent —
 * never an Intl artifact, never a space/NBSP, never a bare « F ».
 */

const NNBSP = String.fromCharCode(0x202f);
const AMOUNT = new RegExp(`^\\d{1,3}(?:${NNBSP}\\d{3})*${NNBSP}FCFA$`);

test('every vitrine price tile carries the exact money bytes (live DOM)', async ({ page }) => {
  await page.goto('/?demo-vitrine=aicha-4821');
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  const prices = page.locator('.vt-tile-price v, .vt-featured-price v');
  const count = await prices.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const text = await prices.nth(i).evaluate((el) => el.textContent ?? '');
    expect(text, `price tile ${i} carries wrong bytes: ${JSON.stringify(text)}`).toMatch(AMOUNT);
    expect(text, `price tile ${i} carries a space/NBSP`).not.toMatch(/[ \u00a0]/);
  }
  // and the page-wide law: no bare « F » after a digit anywhere on the vitrine.
  const body = await page.locator('.vt-root').innerText();
  expect(body).not.toMatch(new RegExp(`\\d[${NNBSP} \u00a0]?F(?![A-Za-z])`));
});
