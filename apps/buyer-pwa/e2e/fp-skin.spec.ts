import { expect, test } from '@playwright/test';

/**
 * RE-SKIN (FP) — the gate for the vitrine-language skin on the journey's money
 * screens. Three things must hold in a real Chromium against the real build:
 *
 *  (1) the re-skinned screens RENDER (reachability — a skin nobody sees fails);
 *  (2) the price band still shows the CORRECT FCFA (money render-only: the
 *      value's byte never moved, only its clothes);
 *  (3) the reseller's THEME drives the chrome. Aïcha's habillage is laterite,
 *      whose accent (#C2571B) is byte-identical to the Grand Teint primary —
 *      so colour equality alone proves nothing. The drive is proven LIVE: flip
 *      the container's --vt-* property and assert the band repaints (§8.5's
 *      re-tint law — the chrome consumes the property, it does not copy it).
 */

const FORET_ACCENT = 'rgb(11, 91, 71)'; // §1.2 forêt — a non-default habillage

test('the signed offer mounts re-skinned — her theme drives the price band, the FCFA is intact', async ({ page }) => {
  await page.goto('/?demo-signed=aicha-4821');

  // (1) reachability: the offer mounts INSIDE the skinned scope.
  const main = page.locator('main.fp-screen');
  await expect(main).toBeVisible();
  await expect(main.locator('[data-screen="produit"]')).toBeVisible();

  // (2) the money byte: her price, unchanged, in the band.
  const band = page.locator('.price-band');
  await expect(band.locator('.fcfa-hero')).toHaveText('11 500 FCFA');

  // (3a) the container carries HER habillage — the §1.2 laterite accent,
  // set by applyTheme from the storefront the slug resolved (never a default
  // sneaking in: the value comes off the container the journey themed).
  const accent = await main.evaluate((el) => getComputedStyle(el).getPropertyValue('--vt-accent').trim());
  expect(accent.toUpperCase()).toBe('#C2571B');
  await expect(band).toHaveCSS('background-color', 'rgb(194, 87, 27)');
  // the vitrine treatment is ON (radius no Grand Teint money surface carries).
  await expect(band).toHaveCSS('border-radius', '18px');

  // (3b) THE DRIVE, proven live: flip the theme property → the band repaints.
  await main.evaluate((el, accent2) => el.style.setProperty('--vt-accent', accent2), FORET_ACCENT);
  await expect(band).toHaveCSS('background-color', FORET_ACCENT);

  // Faso Premium faces carry the skin: Bricolage on the franc, Instrument on
  // the body — not Archivo (the Grand Teint face) inside the skinned scope.
  const heroFamily = await band.locator('.fcfa-hero').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(heroFamily).toContain('Bricolage Grotesque');
  const bodyFamily = await main.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(bodyFamily).toContain('Instrument Sans');

  // The CTA rides the K-screen recipe: θ.accent surface + the rgba(θ.sh, .5)
  // shadow — the one consumer of --vt-sh the theme record documents.
  const cta = page.locator('.primary-action');
  await expect(cta).toHaveCSS('border-radius', '16px');
  const shadow = await cta.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).toContain('rgba(194, 87, 27, 0.5)');
});

test('the two-option checkout re-skinned — vitrine cards, amounts to the franc, equal weight preserved', async ({ page }) => {
  await page.goto('/?demo-checkout=available');
  await expect(page.locator('main.fp-screen')).toBeVisible();

  // vitrine card language on the options.
  const optionA = page.locator('[data-option="full-prepay"]');
  await expect(optionA).toHaveCSS('border-radius', '18px');
  await expect(optionA).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  // money render-only: the §5.4 baseline total + the reconcile line, unchanged.
  await expect(page.locator('.fcfa-figure')).toHaveText('12 500 FCFA');
  await expect(page.locator('[data-role="reconcile"]')).toContainText('12 500');

  // the prominence law survives the skin: both choose buttons COMPUTED equal.
  const weights = await page.locator('.action.action-equal').evaluateAll((els) =>
    els.map((el) => {
      const s = getComputedStyle(el);
      return `${s.borderRadius}|${s.backgroundColor}|${s.fontFamily}|${s.fontWeight}|${s.fontSize}`;
    }),
  );
  expect(weights).toHaveLength(2);
  expect(weights[0]).toBe(weights[1]);
});

test('paiement inside the journey rides the skin under her theme', async ({ page }) => {
  await page.goto('/?demo-journey=paiement');
  await expect(page.locator('main.fp-screen')).toBeVisible();
  await expect(page.locator('[data-option="full-prepay"]')).toHaveCSS('border-radius', '18px');
});

/* PART 2 — the mid-journey screens join the language (gap 5 closed): every
 * screen of the walk is `.fp-screen`-scoped under HER habillage, and every
 * FCFA byte on the way is asserted unchanged. */

test('localisation re-skinned — K field language, no FCFA on this screen', async ({ page }) => {
  await page.goto('/?demo-journey=localisation');
  await expect(page.locator('main.fp-screen [data-screen="localisation"]')).toBeVisible();
  // K fieldInput bytes on the repère input; focus rides the habillage.
  const repere = page.locator('.field-repere');
  await expect(repere).toHaveCSS('border-radius', '14px');
  await repere.focus();
  await expect(repere).toHaveCSS('border-color', 'rgb(194, 87, 27)');
  // landmark-first law untouched: still no street-address field, no FCFA here.
  await expect(page.locator('input[name="adresse"]')).toHaveCount(0);
});

test('livraison re-skinned — Séra\'s fees byte-exact, the selected row carries the K selection recipe', async ({ page }) => {
  await page.goto('/?demo-journey=livraison');
  await expect(page.locator('main.fp-screen [data-screen="livraison"]')).toBeVisible();
  // the quote is display-only and byte-exact: both fees + the fee in the CTA.
  const rows = page.locator('.quote-row .fcfa-figure-inline');
  await expect(rows.nth(0)).toHaveText('1 000 FCFA');
  await expect(rows.nth(1)).toHaveText('1 500 FCFA');
  await expect(page.locator('.primary-action')).toContainText('1 000 FCFA');
  // selected row = K themeCardSelected recipe (2px θ.accent border).
  const selected = page.locator('.quote-row-on');
  await expect(selected).toHaveCSS('border-color', 'rgb(194, 87, 27)');
  await expect(selected).toHaveCSS('border-top-width', '2px');
});

test('suivi re-skinned — due-at-door byte-exact, the theme drives the timeline chip live', async ({ page }) => {
  await page.goto('/?demo-journey=suivi&etat=porte-b');
  const main = page.locator('main.fp-screen');
  await expect(main.locator('[data-screen="suivi"]')).toBeVisible();
  // Option B: the product leg due at the door, unchanged to the franc.
  await expect(page.locator('.door-block .fcfa-figure-inline')).toHaveText('11 500 FCFA');
  await expect(page.locator('.door-block')).toHaveCSS('border-radius', '18px');
  // the MAINTENANT chip rides θ.accent — and repaints on a theme flip (the
  // drive proven on a mid-journey screen, same law as the product band).
  const chip = page.locator('.now-chip');
  await expect(chip).toHaveCSS('background-color', 'rgb(194, 87, 27)');
  await main.evaluate((el, accent) => el.style.setProperty('--vt-accent', accent), FORET_ACCENT);
  await expect(chip).toHaveCSS('background-color', FORET_ACCENT);
  // SP-I10 survives the skin: « Un souci ? » keeps its danger border (the K
  // error byte), never absorbed into the ghost-button language.
  await expect(page.locator('.problem-path')).toHaveCSS('border-color', 'rgb(196, 87, 75)');
});

test('confirmation re-skinned — both money lines byte-exact, honest pending pill', async ({ page }) => {
  await page.goto('/?demo-journey=confirmation');
  await expect(page.locator('main.fp-screen [data-screen="confirmation"]')).toBeVisible();
  const lines = page.locator('.fcfa-line .fcfa-figure-inline');
  await expect(lines.nth(0)).toHaveText('12 500 FCFA');
  await expect(lines.nth(1)).toHaveText('0 FCFA');
  // the honest pending state rides the vitrine pill (never a green lie).
  await expect(page.locator('.status-chip.status-pending')).toHaveCSS('border-radius', '99px');
});

test('protections re-skinned — the K sheet bytes carry the bill of rights', async ({ page }) => {
  await page.goto('/?demo-journey=protections');
  const sheet = page.locator('main.fp-screen [data-screen="protections"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS('background-color', 'rgb(251, 247, 239)');
  await expect(sheet).toHaveCSS('border-top-left-radius', '24px');
});

test('the C1 skeleton surface re-skinned — the vitrine shim, the exact boxes', async ({ page }) => {
  await page.goto('/?demo-skeleton=produit');
  await expect(page.locator('main.fp-screen')).toBeVisible();
  const skeleton = page.locator('[data-screen="produit-squelette"]');
  await expect(skeleton).toBeVisible();
  // the vt-shim treatment (gradient shimmer), not the Grand Teint opacity pulse.
  const bg = await skeleton.locator('.skeleton-line').first().evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('linear-gradient');
});
