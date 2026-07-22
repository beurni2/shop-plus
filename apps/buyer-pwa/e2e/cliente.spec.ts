import { expect, test, type Page } from '@playwright/test';

/**
 * PWA CLIENTE — the pixel-for-pixel gate (Édition Indigo). Proves, in a real
 * Chromium against the real build:
 *  (1) every C1–C9 screen AND state mounts (reachability — a component nobody
 *      mounts must fail here), and the retired S1–S7 routes are un-generatable;
 *  (2) every amount carries the U+202F byte, read raw from the live DOM
 *      (textContent), never a normalized comparison — and a page-wide scan
 *      finds no amount grouped with a space/NBSP;
 *  (3) the four §1.2 habillages drive the chrome (indigo the themeless
 *      default), proven live by a var-flip repaint;
 *  (4) the problème/signalement surfaces keep their danger prominence
 *      (#F8E1DE / #7E1A15 / #8C1D18 / #C4574B / #D9A49C) under EVERY theme —
 *      gate-locked, never ghost, never themed;
 *  (5) no purchase-side economics term ever reaches a buyer surface;
 *  (6) « Le code de remise fait foi » — C9 reveals only after « Tout est bon »
 *      (mode A) or the operator's confirmation (mode B), never before.
 */

const NNBSP = String.fromCharCode(0x202f);
const CODE = '734 921';

/** The four §1.2 habillages → their accent as computed rgb(). */
const THEMES: Record<string, string> = {
  laterite: 'rgb(194, 87, 27)',
  danfani: 'rgb(163, 29, 78)',
  indigo: 'rgb(62, 75, 140)',
  foret: 'rgb(11, 91, 71)',
};

async function noEconomicsLeak(page: Page, label: string): Promise<void> {
  const text = (await page.locator('main.cl-root').innerText()).toLowerCase();
  for (const term of ['coût', 'marge', 'fournisseur', ' net ']) {
    expect(text.includes(term), `${label} leaks « ${term.trim()} »`).toBe(false);
  }
}

/** Raw body text must never group an amount with a space/NBSP — the only
 * digit-space-digits token allowed is the C9 drop code (a code, not an amount,
 * plain space per the pixel source). */
async function noSpaceGroupedAmount(page: Page, label: string): Promise<void> {
  const text = await page.locator('main.cl-root').innerText();
  const scrubbed = text.split(CODE).join(' ');
  expect(scrubbed, `${label} groups an amount with a space/NBSP`).not.toMatch(/\d[ \u00a0]\d{3}(?!\d)/);
}

test('every C1–C9 screen and state mounts (reachability), with zero economics leak', async ({ page }) => {
  const cases: Array<[string, string]> = [
    ['C1', 'C1'],
    ['C1&stock=out', 'C1'],
    ['C1&voix=0', 'C1'],
    ['C1&etat=loading', 'squelette'],
    ['C2', 'C2'],
    ['C3', 'C3'],
    ['C3&micro=refuse', 'C3'],
    ['C4', 'C4'],
    ['C5', 'C5'],
    ['C5&b=indisponible', 'C5'],
    ['C6', 'C6'],
    ['C6&conf=attente', 'C6'],
    ['C6&conf=hors-ligne', 'C6'],
    ['C7', 'C7'],
    ['C8', 'C8'],
    ['C9', 'C9'],
    ['C9&revealed=1', 'C9'],
  ];
  for (const [q, screen] of cases) {
    await page.goto(`/?demo-cliente=${q}`);
    await expect(page.locator('main.cl-root')).toBeVisible();
    await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
    await noEconomicsLeak(page, q);
    await noSpaceGroupedAmount(page, q);
  }
});

test('SCREEN-FIT — every screen/state fills a 360px phone with ZERO horizontal overflow (founder, 2026-07-22)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const cases = ['C1', 'C1&stock=out', 'C2', 'C3', 'C4', 'C5', 'C5&b=indisponible', 'C6', 'C7', 'C8', 'C9', 'C9&revealed=1'];
  for (const q of cases) {
    await page.goto(`/?demo-cliente=${q}`);
    await expect(page.locator('main.cl-root')).toBeVisible();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, `${q} overflows a 360px phone (scrollWidth ${w})`).toBeLessThanOrEqual(360);
    // and the flow owns the full width — no legacy box around it.
    const rootW = await page.locator('main.cl-root').evaluate((el) => el.getBoundingClientRect().width);
    expect(rootW, `${q} — the flow does not fill the phone width`).toBe(360);
  }
  // the dead status spacer is gone in a browser tab (safe-area handles devices).
  await page.goto('/?demo-cliente=C1');
  const statusH = await page.locator('.cl-status').evaluate((el) => el.getBoundingClientRect().height);
  expect(statusH).toBe(0);
});

test('the retired S1–S7 achat routes are UN-GENERATABLE (they fall to the directory)', async ({ page }) => {
  for (const q of ['produit', 'recap', 'localisation', 'livraison', 'confirmation', 'suivi', 'protections']) {
    await page.goto(`/?demo-achat=${q}`);
    await expect(page.locator('.cl-root')).toHaveCount(0);
    await expect(page.locator('.ac-root')).toHaveCount(0);
    // the shell falls through to the S3 découverte root — never a dead screen.
    await expect(page.locator('.boutiques')).toBeVisible();
  }
  // and an unknown screen id is refused too (closed enum — C2 is now legal,
  // an S-era or invented id is not).
  await page.goto('/?demo-cliente=S1');
  await expect(page.locator('.cl-root')).toHaveCount(0);
});

test('C1 — the price band carries the signed price with the U+202F byte (live DOM)', async ({ page }) => {
  await page.goto('/?demo-cliente=C1&theme=indigo');
  const hero = page.locator('.cl-pb-hero').first();
  const amount = await hero.evaluate((el) => el.textContent);
  expect(amount).toBe(`11${NNBSP}500`);
  expect(amount).not.toMatch(/[ \u00a0]/);
  const band = await page.locator('[data-role="price-band"]').first().evaluate((el) => el.textContent);
  expect(band).toContain(`${NNBSP}FCFA`);
  expect(band).not.toMatch(/\d[ \u00a0]FCFA/);
  // épuisé: the price stays signed, struck, with the same bytes.
  await page.goto('/?demo-cliente=C1&stock=out');
  await expect(page.locator('.cl-epuise-stamp')).toContainText('ÉPUISÉ');
  await expect(page.locator('.cl-cta-off')).toBeDisabled();
  const struck = await page.locator('.cl-pb-epuise .cl-pb-hero').evaluate((el) => el.textContent);
  expect(struck).toBe(`11${NNBSP}500`);
});

test('C5 — totals, CTA and the reconciliation line hold the money bytes for BOTH fees', async ({ page }) => {
  await page.goto('/?demo-cliente=C5&theme=indigo');
  // jump() prefill: livraison today (1 000). The MODE is hers to pick — the
  // CTA mounts disabled, « Choisissez pour continuer » (§4 C5).
  const cta0 = page.locator('.cl-cta-c5');
  await expect(cta0).toBeDisabled();
  await expect(cta0).toHaveText('Choisissez pour continuer');
  const reconcile = await page.locator('[data-role="reconcile"]').evaluate((el) => el.textContent);
  expect(reconcile).toBe(`12${NNBSP}500 = 11${NNBSP}500 + 1${NNBSP}000 — chaque franc a sa place.`);
  await page.locator('[data-action="choix-paiement"][data-mode="B"]').click();
  const cta = await page.locator('.cl-cta-c5').evaluate((el) => el.textContent);
  expect(cta).toBe(`Payer 1${NNBSP}000${NNBSP}FCFA maintenant`);
  // switch to mode A — the CTA reads the frozen total.
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  const ctaA = await page.locator('.cl-cta-c5').evaluate((el) => el.textContent);
  expect(ctaA).toBe(`Payer 12${NNBSP}500${NNBSP}FCFA`);
  // the 800-leg reconciliation: pick « Demain » on C4, continue to C5.
  await page.goto('/?demo-cliente=C4');
  await page.locator('[data-action="choix-livraison"][data-choix="tomorrow"]').click();
  await page.locator('[data-action="continuer-c4"]').click();
  const rec800 = await page.locator('[data-role="reconcile"]').evaluate((el) => el.textContent);
  expect(rec800).toBe(`12${NNBSP}300 = 11${NNBSP}500 + 800 — chaque franc a sa place.`);
});

test('the four habillages drive the chrome, indigo is the themeless default, proven live', async ({ page }) => {
  for (const [theme, rgb] of Object.entries(THEMES)) {
    await page.goto(`/?demo-cliente=C1&theme=${theme}`);
    await expect(page.locator('.cl-cta')).toHaveCSS('background-color', rgb);
    const accent = await page
      .locator('main.cl-root')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--vt-accent').trim());
    expect(accent.length).toBeGreaterThan(0);
  }
  // no theme param → indigo (the founder-decreed fallback).
  await page.goto('/?demo-cliente=C1');
  await expect(page.locator('.cl-cta')).toHaveCSS('background-color', THEMES.indigo!);
  // THE DRIVE, proven live: flip --vt-accent → the CTA repaints (consumes, not copies).
  await page.locator('main.cl-root').evaluate((el) => el.style.setProperty('--vt-accent', 'rgb(11, 91, 71)'));
  await expect(page.locator('.cl-cta')).toHaveCSS('background-color', 'rgb(11, 91, 71)');
});

test('danger prominence is GATE-LOCKED — never ghost, never themed, under any habillage', async ({ page }) => {
  for (const theme of ['indigo', 'danfani']) {
    // C7: the problem banner + « Signaler un problème ».
    await page.goto(`/?demo-cliente=C7&theme=${theme}`);
    await page.locator('[data-action="signaler-c7"]').click();
    const banner = page.locator('[data-role="problem-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS('background-color', 'rgb(248, 225, 222)'); // #F8E1DE
    await expect(banner).toHaveCSS('color', 'rgb(126, 26, 21)'); // #7E1A15
    const report = page.locator('.cl-c7-report');
    await expect(report).toHaveCSS('border-top-color', 'rgb(217, 164, 156)'); // #D9A49C
    await expect(report).toHaveCSS('color', 'rgb(140, 29, 24)'); // #8C1D18
    // C8: « Un problème » holds equal weight with its danger border.
    await page.goto(`/?demo-cliente=C8&theme=${theme}`);
    const bad = page.locator('.cl-door-bad');
    await expect(bad).toBeVisible();
    await expect(bad).toHaveCSS('border-top-color', 'rgb(196, 87, 75)'); // #C4574B
    await expect(bad).toHaveCSS('color', 'rgb(140, 29, 24)'); // #8C1D18
    // C8 report note keeps the danger tint too.
    await bad.click();
    await page.locator('[data-action="motif"]').first().click();
    const note = page.locator('[data-role="report-note"]');
    await expect(note).toHaveCSS('background-color', 'rgb(248, 225, 222)');
    await expect(note).toHaveCSS('color', 'rgb(126, 26, 21)');
  }
});

test('chemin B complet — the code reveals ONLY after the operator confirms the rest', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?demo-cliente=C5');
  // she picks mode B, then pays the delivery leg: envoi (1.2 s) → opérateur (2.4 s) → C6.
  await page.locator('[data-action="choix-paiement"][data-mode="B"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect(page.locator('[data-etat="envoi"]')).toBeVisible();
  await expect(page.locator('[data-etat="operateur"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[data-screen="C6"] [data-etat="confirmee"]')).toBeVisible({ timeout: 5_000 });
  // C6 states the confirmed franc: 1 000 now (mode B, today).
  expect(await page.locator('[data-etat="confirmee"]').innerText()).toContain(`1${NNBSP}000${NNBSP}FCFA`);
  // suivre → C7; simulate to step 5; the door CTA appears.
  await page.locator('[data-action="suivre"]').click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  for (let i = 0; i < 4; i += 1) await page.locator('[data-action="simuler"]').click();
  await page.locator('[data-action="porte"]').click();
  await expect(page.locator('[data-screen="C8"] [data-etat="inspection"]')).toBeVisible();
  // mode B owes the product leg at the door, byte-exact.
  expect(await page.locator('[data-role="owing"]').innerText()).toContain(`11${NNBSP}500${NNBSP}FCFA`);
  // « Tout est bon » → the operator screen — the code is NOT revealed yet.
  await page.locator('[data-action="porte-bon"]').click();
  await expect(page.locator('[data-etat="paiement-porte"]')).toBeVisible();
  expect(await page.locator('main.cl-root').innerText()).not.toContain(CODE);
  // 2.6 s later the operator confirms → C9 révélé, the pixel code.
  await expect(page.locator('[data-role="code-revele"]')).toBeVisible({ timeout: 6_000 });
  expect(await page.locator('.cl-code-figure').innerText()).toBe(CODE);
});

test('chemin A — « Tout est bon » reveals C9 with NO door payment; refus keeps step 5 + banner', async ({ page }) => {
  // mode A: no owing band, no operator wait at the door.
  await page.goto('/?demo-cliente=C5');
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect(page.locator('[data-screen="C6"]')).toBeVisible({ timeout: 6_000 });
  await page.locator('[data-action="suivre"]').click();
  for (let i = 0; i < 4; i += 1) await page.locator('[data-action="simuler"]').click();
  await page.locator('[data-action="porte"]').click();
  await expect(page.locator('[data-role="owing"]')).toHaveCount(0);
  await page.locator('[data-action="porte-bon"]').click();
  await expect(page.locator('[data-role="code-revele"]')).toBeVisible();
  expect(await page.locator('.cl-code-figure').innerText()).toBe(CODE);

  // the refusal path is as dignified: motif → « C'est noté » → C7, step 5 kept, banner on.
  await page.goto('/?demo-cliente=C8');
  await page.locator('[data-action="porte-probleme"]').click();
  await page.locator('[data-action="motif"]').nth(1).click();
  await page.locator('[data-action="confirmer-signalement"]').click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  await expect(page.locator('[data-role="problem-banner"]')).toBeVisible();
  // step 5 is the current step (« À votre porte » wears MAINTENANT).
  await expect(page.locator('.cl-tl-t-now')).toHaveText('À votre porte');
  // problem set → no door CTA, no sim.
  await expect(page.locator('[data-action="porte"]')).toHaveCount(0);
  await expect(page.locator('[data-action="simuler"]')).toHaveCount(0);
});

test('C9 direct — the code stays hidden until its leg is confirmed. Jamais avant.', async ({ page }) => {
  await page.goto('/?demo-cliente=C9');
  await expect(page.locator('[data-role="code-cache"]')).toBeVisible();
  await expect(page.locator('[data-role="code-revele"]')).toHaveCount(0);
  expect(await page.locator('main.cl-root').innerText()).not.toContain(CODE);
  await page.goto('/?demo-cliente=C9&revealed=1');
  await expect(page.locator('[data-role="code-revele"]')).toBeVisible();
});

test('hors ligne — the ink banner rides every screen; payNow lands on C6 hors-ligne; the voice queues', async ({ page }) => {
  await page.goto('/?demo-cliente=C5&offline=1');
  await expect(page.locator('[data-role="offline-banner"]')).toBeVisible();
  await page.locator('[data-action="choix-paiement"][data-mode="B"]').click();
  await page.locator('[data-action="payer"]').click();
  // immediate — no fake operator wait offline, never a « payé » lie.
  await expect(page.locator('[data-screen="C6"] [data-etat="hors-ligne"]')).toBeVisible();
  expect(await page.locator('[data-etat="hors-ligne"]').innerText()).toContain('Nous ne dirons jamais « payé »');

  await page.goto('/?demo-cliente=C3&offline=1');
  await page.locator('[data-action="voix-demarrer"]').click();
  await expect(page.locator('[data-role="voice-recording"]')).toBeVisible();
  await page.locator('[data-action="voix-arreter"]').click();
  await expect(page.locator('[data-role="voice-queued"]')).toBeVisible();
});

test('C3 — the five voice states + the gate (zone + repère/voix) drive the CTA', async ({ page }) => {
  await page.goto('/?demo-cliente=C3');
  // pixel truth: C3 mounts EMPTY — no zone picked, no repère typed; the CTA
  // sleeps until canC3 = zone && (repère || voix) turns true.
  const cta = page.locator('[data-action="continuer-c3"]');
  await expect(cta).toBeDisabled();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await expect(cta).toBeDisabled();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await expect(cta).toBeEnabled();
  await page.locator('[data-role="repere"]').fill('');
  await expect(cta).toBeDisabled();
  // record instead: idle → recording (chrono) → recorded (wave + REFAIRE) → CTA on again.
  await page.locator('[data-action="voix-demarrer"]').click();
  await expect(page.locator('[data-role="voice-recording"]')).toBeVisible();
  await page.locator('[data-action="voix-arreter"]').click();
  await expect(page.locator('[data-role="voice-recorded"]')).toBeVisible();
  await expect(cta).toBeEnabled();
  await page.locator('[data-action="voix-refaire"]').click();
  await expect(page.locator('[data-role="voice-recording"]')).toBeVisible();
  // micro refusé — the dignified fallback note.
  await page.goto('/?demo-cliente=C3&micro=refuse');
  await expect(page.locator('[data-role="voice-refused"]')).toBeVisible();
});

test('C2 — the protections sheet opens over C1 and closes on « Compris »', async ({ page }) => {
  await page.goto('/?demo-cliente=C1');
  await page.locator('.cl-shield').click();
  await expect(page.locator('[data-screen="C2"]')).toBeVisible();
  await expect(page.locator('[data-screen="C2"]')).toContainText('Le code de remise fait foi');
  await page.locator('[data-action="fermer-protections-cta"]').click();
  await expect(page.locator('[data-screen="C2"]')).toHaveCount(0);
});
