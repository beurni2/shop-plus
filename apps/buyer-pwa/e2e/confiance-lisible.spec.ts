import { expect, test } from '@playwright/test';

/**
 * ═══ CONFIANCE-LISIBLE-1 (AUDIT-SHOP-2 F-56, F-57) — targets, names and focus,
 * MEASURED on the real built bundle ═══
 *
 * F-56: the audit found « Voir » at 12 px with no height, the round discs at
 * 40×40, the chips at 40, the stop and « Refaire » under 44 — while the hearts,
 * the panier disc and the CHANGER/MODIFIER pills were 44 (the law was known
 * here). Chromium's own boxes say what a thumb meets.
 *
 * F-57: C3's inputs had no accessible name; every state change replaced
 * innerHTML and focus fell to <body>. Now `getByLabel` resolves the three
 * fields, and a NEW screen leaves the stage focused so it is announced.
 */

test('F-56 — the buyer flow\'s controls meet a 44px thumb (C1 discs and « Voir », C3 chips, the voice bar); the vitrine back button too', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?demo-cliente=C1');
  await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible();
  const mesurer = async (sel: string, ecran: string) => {
    const boxes = await page.locator(sel).evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((b) => [b.width, b.height]));
    expect(boxes.length, `${sel} present on ${ecran}`).toBeGreaterThan(0);
    // the flow is drawn under a ×1.15 module zoom, so a 44px box measures
    // 43.99999… in device space — half a pixel of slack absorbs that rounding
    for (const [w, h] of boxes) {
      expect(h, `${sel} on ${ecran}: height ${h}`).toBeGreaterThanOrEqual(43.5);
      expect(w, `${sel} on ${ecran}: width ${w}`).toBeGreaterThanOrEqual(43.5);
    }
  };
  await mesurer('.cl-shield', 'C1');
  await mesurer('.cl-voir', 'C1');
  // (verifier) a box is not a target if the row clips it: the thumb must MEET
  // the button at the top and bottom of its 44px, by hit-test, not by geometry
  const touche = await page.locator('.cl-voir').first().evaluate((el) => {
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    return [b.top + 3, b.top + b.height / 2, b.bottom - 3].map((y) => {
      const cible = document.elementFromPoint(cx, y);
      return cible !== null && (cible === el || el.contains(cible));
    });
  });
  expect(touche, 'the thumb meets « Voir » at the top, middle and bottom of its 44px').toEqual([true, true, true]);
  // the step back disc lives on the étape screens, the chips and the voice bar on C3
  await page.goto('/?demo-cliente=C3');
  await expect(page.locator('main.cl-root [data-screen="C3"]')).toBeVisible();
  await mesurer('.cl-round-btn', 'C3');
  const chips = await page.locator('.cl-chip').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(chips.length).toBeGreaterThan(0);
  for (const h of chips) expect(h).toBeGreaterThanOrEqual(43.5);

  // the vitrine's back button, on a shop opened from a product page
  await page.goto('/?demo-vitrine=aicha-4821&demo-vitrine-depuis=produit');
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  const retour = page.locator('.vt-topbtn').first();
  await expect(retour).toBeVisible();
  const boite = await retour.boundingBox();
  expect(boite?.width ?? 0).toBeGreaterThanOrEqual(43.5);
  expect(boite?.height ?? 0).toBeGreaterThanOrEqual(43.5);
});

test('F-57 — C3\'s fields resolve by their name; a new screen leaves the stage focused, a same-screen change leaves her caret alone', async ({ page }) => {
  await page.goto('/?demo-cliente=C1');
  await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible();
  // the first paint focuses nothing
  expect(await page.evaluate(() => document.activeElement?.className ?? '')).not.toContain('cl-stage');

  // C1 → C3 through the real primary action: the stage is focused, so the
  // screen change is announced rather than silently swapped under <body>.
  await page.locator('[data-action="commander"], [data-action="continuer-c1"], .cl-cta').first().click();
  await expect(page.locator('main.cl-root [data-screen="C3"]')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.className ?? '')).toContain('cl-stage');

  // the three fields, by name — the audit's « no accessible name » closed
  const repere = page.getByLabel('Le repère');
  await expect(repere).toBeVisible();
  await expect(page.getByLabel('Votre quartier')).toBeVisible();
  await expect(page.getByLabel('Votre numéro, pour la livraison')).toBeVisible();

  // typing is a same-screen change: the caret stays hers
  await repere.click();
  await repere.type('Face à la pharmacie');
  await expect(repere).toBeFocused();
  await expect(repere).toHaveValue('Face à la pharmacie');
});
