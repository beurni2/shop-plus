import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * WO-4.4 — the full §6.2 buyer journey in a real Chromium, end to end:
 * signed-link arrival → location capture (with a REAL MediaRecorder take on
 * the fake media stream) → Séra's delivery quote → the two-option checkout
 * (icons + audio placeholders) → confirmation → tracking. Plus the DoD's
 * offline queueing proof (context.setOffline) and the §6.3 drop-code law.
 */

const F = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

test('the whole journey walks: product → location (voice note) → delivery → checkout → confirmation → tracking', async ({
  page,
}) => {
  // ARRIVAL — the signed link lands on the product page.
  await page.goto('/?demo-journey=produit');
  const product = page.locator('[data-screen="produit"]');
  await expect(product).toBeVisible();
  await expect(product.locator('.fcfa-hero')).toHaveText(`${F(11_500)} FCFA`);
  // C-ENT1 — the reseller line is the tappable vitrine anchor now (her boutique
  // one tap away on EVERY landing, not only a round trip); it names her store.
  await expect(product.locator('.ent1[data-action="vitrine"] .ent1-name')).toHaveText('Chez Aïcha Mode');
  await expect(product).toContainText('Livré par Séra');
  await expect(product).toContainText('Paiement protégé');
  // SP-I03 on the rendered page: no commission, no supplier, anywhere.
  const bodyText = (await page.locator('body').innerText()).toLowerCase();
  expect(bodyText).not.toContain('commission');
  expect(bodyText).not.toContain('fournisseur');

  // LOCATION — landmark-first; no street-address input exists.
  await page.locator('[data-action="acheter"]').click();
  const location = page.locator('[data-screen="localisation"]');
  await expect(location).toBeVisible();
  expect(
    await location
      .locator('[name="adresse"], [name="address"], [name="rue"], [name="voie"], textarea, select')
      .count(),
  ).toBe(0);
  await expect(location).toContainText('Votre numéro reste privé');
  await location.locator('[data-zone="Dassasgho"]').click();
  await page.locator('input[name="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('input[name="telephone"]').fill('70 12 34 56');

  // VOICE NOTE — record → stop → playback → re-record on the fake stream.
  await page.locator('[data-action="voix-enregistrer"]').click();
  await expect(page.locator('[data-voice="recording"]')).toBeVisible();
  await page.waitForTimeout(300); // let the fake stream produce audio
  await page.locator('[data-action="voix-arreter"]').click();
  await expect(page.locator('[data-voice="recorded"]')).toBeVisible();
  await page.locator('[data-action="voix-ecouter"]').click();
  await expect(page.locator('audio[data-role="voice-playback"]')).toHaveAttribute('src', /^blob:/);
  await page.locator('[data-action="voix-reprendre"]').click();
  await expect(page.locator('[data-voice="recording"]')).toBeVisible();
  await page.waitForTimeout(200);
  await page.locator('[data-action="voix-arreter"]').click();
  await expect(page.locator('[data-voice="recorded"]')).toBeVisible();

  // DELIVERY — Séra's quote is the price authority; D separate and honest.
  await page.locator('[data-action="lieu-continuer"]').click();
  const delivery = page.locator('[data-screen="livraison"]');
  await expect(delivery).toBeVisible();
  await expect(delivery).toContainText('Le prix de la course vient de Séra.');
  await expect(delivery.locator('[data-delivery="standard"]')).toContainText(`${F(1_000)} FCFA`);
  await expect(delivery.locator('[data-delivery="express"]')).toContainText(`${F(1_500)} FCFA`);

  // CHECKOUT — absorbed §6.1 with icons + audio placeholders; SP-I13 lines.
  await page.locator('[data-action="livraison-continuer"]').click();
  const checkout = page.locator('[data-screen="paiement"]');
  await expect(checkout).toBeVisible();
  await expect(checkout.locator('[data-icon="cadenas"] svg')).toBeVisible();
  await expect(checkout.locator('[data-icon="moto"] svg')).toBeVisible();
  await expect(checkout.locator('[data-audio-slot]')).toHaveCount(2);
  await expect(checkout).toContainText('La note vocale arrive bientôt.');
  await expect(checkout).toContainText('À payer maintenant :');
  await expect(checkout).toContainText('À payer à la livraison :');
  await expect(checkout).toContainText(`${F(12_500)} FCFA`); // total = X+Y once

  // CONFIRMATION — honest pending (queued = pending, never done) + the kept note.
  await page.locator('[data-key="checkout.option_a.choose"]').click();
  const confirmation = page.locator('[data-screen="confirmation"]');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('En attente du réseau');
  await expect(confirmation.locator('[data-voice="queued"]')).toContainText(
    'envoyée dès que le réseau revient',
  );

  // TRACKING — the coarse timeline, problem path present, protections reachable.
  await page.locator('[data-action="voir-suivi"]').click();
  const tracking = page.locator('[data-screen="suivi"]');
  await expect(tracking).toBeVisible();
  await expect(tracking.locator('.timeline-step')).toHaveCount(6);
  await expect(tracking.locator('[data-action="souci"]')).toBeVisible();
  await expect(tracking.locator('[data-action="protections"]')).toBeVisible();
});

test('offline queueing is honest: the banner appears, the note stays QUEUED, coming back online never fakes done', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 }); // the gallery viewport
  // Deterministic capture: the screen-in animation must not race the
  // screenshot (this file re-encoded differently run-to-run — tooling law).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo-journey=localisation');
  await page.locator('[data-action="voix-enregistrer"]').click();
  await expect(page.locator('[data-voice="recording"]')).toBeVisible();
  await page.waitForTimeout(300);
  await page.locator('[data-action="voix-arreter"]').click();
  await expect(page.locator('[data-voice="recorded"]')).toBeVisible();

  // The network drops. Offline is a designed state, not an alert.
  await context.setOffline(true);
  await expect(page.locator('[data-role="offline"]')).toContainText('Hors ligne — rien n\'est perdu.');
  const imgDir = join(import.meta.dirname, '../../../gallery/img');
  mkdirSync(imgDir, { recursive: true });
  await page.screenshot({ path: join(imgDir, 'parcours-hors-ligne.png'), fullPage: true });

  // Continuing offline: the note is KEPT as queued — pending, never sent.
  await page.locator('[data-action="lieu-continuer"]').click();
  await page.locator('[data-action="livraison-continuer"]').click();
  await page.locator('[data-key="checkout.option_a.choose"]').click();
  const confirmation = page.locator('[data-screen="confirmation"]');
  await expect(confirmation).toContainText('Hors ligne — votre commande est gardée sur ce téléphone.');
  await expect(confirmation.locator('[data-voice="queued"]')).toBeVisible();

  // Back online: the banner lifts; NOTHING flips to « done » (no server exists).
  await context.setOffline(false);
  await expect(page.locator('[data-role="offline"]')).toHaveCount(0);
  await expect(confirmation).toContainText('En attente du réseau — rien n\'est perdu.');
  await expect(confirmation.locator('[data-voice="queued"]')).toBeVisible();
});

test('§6.3 — the drop code enters LAST: hidden while the door payment is pending, framed as proof at handoff', async ({
  page,
}) => {
  await page.goto('/?demo-journey=suivi&etat=porte-b-attente');
  await expect(page.locator('[data-door="pending"]')).toBeVisible();
  await expect(page.locator('[data-role="drop-code"]')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('4732');

  await page.goto('/?demo-journey=suivi&etat=code');
  const code = page.locator('[data-role="drop-code"]');
  await expect(code).toBeVisible();
  await expect(code.locator('.code-figure')).toHaveText('4732');
  await expect(code).toContainText('Ce code est votre preuve.');
});

test('WO-4.2E — the sandbox ribbon rides EVERY screen and no URL param removes it', async ({ page }) => {
  const RIBBON = "Aperçu — données d'essai. Rien ici n'est réel.";
  for (const url of [
    '/',
    '/?demo-journey=produit',
    '/?demo-journey=paiement',
    '/?demo-journey=suivi&etat=code',
    '/?demo-order=payment_failed',
    // hostile params: nothing switches it off
    '/?demo-journey=produit&apercu=off&ribbon=0&sandbox=false',
  ]) {
    await page.goto(url);
    const ribbon = page.locator('[data-role="sandbox-ribbon"]');
    await expect(ribbon, url).toBeVisible();
    await expect(ribbon, url).toHaveText(RIBBON);
  }
  // and it survives in-journey navigation (no re-render drops it)
  await page.goto('/?demo-journey=produit');
  await page.locator('[data-action="acheter"]').click();
  await expect(page.locator('[data-role="sandbox-ribbon"]')).toBeVisible();
});

test('§6.3 — « Vos protections » opens from the product page and closes back to it', async ({ page }) => {
  await page.goto('/?demo-journey=produit');
  await page.locator('[data-action="protections"]').click();
  const sheet = page.locator('[data-screen="protections"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Vous refusez, vous êtes remboursé.');
  await expect(sheet).toContainText("Jamais d'argent liquide au livreur.");
  await page.locator('[data-action="protections-fermer"]').click();
  await expect(page.locator('[data-screen="produit"]')).toBeVisible();
});

/**
 * REACHABILITY GATE (VITRINE-ENTRY-REACH) — the property diff proved the C-ENT
 * components render CORRECTLY; it never proved they are MOUNTED on a real route.
 * A component nobody reaches must fail the gate. These drive the ACTUAL routes
 * and assert (1) the entry is in the DOM and (2) its data-action="vitrine"
 * targets the reseller's canon /v/{slug} — proven by the request the click
 * fires (request-level, so it never depends on the /v/ page booting under the
 * preview's relative base). The bug this pins: a direct landing rendered no
 * entry because the reseller was never resolved off the round trip.
 */
test('E1 reachable — the default product landing mounts C-ENT1 + C-ENT2, resolving to /v/aicha-4821', async ({ page }) => {
  await page.goto('/?demo-journey=produit');
  const product = page.locator('[data-screen="produit"]');
  const ent1 = product.locator('.ent1[data-action="vitrine"]');
  const ent2 = product.locator('.ent2[data-action="vitrine"]');
  await expect(ent1).toBeVisible();
  await expect(ent2).toBeVisible();
  await expect(ent1).toHaveAttribute('data-slug', 'aicha-4821');
  await expect(ent2).toHaveAttribute('data-slug', 'aicha-4821');
  // the entry actually navigates to the canon /v/{slug} (the request proves it)
  const [request] = await Promise.all([
    page.waitForRequest(/\/v\/aicha-4821$/),
    ent2.click(),
  ]);
  expect(request.url()).toMatch(/\/v\/aicha-4821$/);
});

test('E2 reachable — the épuisé product landing mounts C-ENT3, resolving to /v/aicha-4821', async ({ page }) => {
  await page.goto('/?demo-journey=produit&stock=epuise');
  const product = page.locator('[data-screen="produit"]');
  const ent3 = product.locator('.ent3[data-action="vitrine"]');
  await expect(ent3).toBeVisible();
  await expect(ent3).toHaveAttribute('data-slug', 'aicha-4821');
  const [request] = await Promise.all([
    page.waitForRequest(/\/v\/aicha-4821$/),
    ent3.click(),
  ]);
  expect(request.url()).toMatch(/\/v\/aicha-4821$/);
});

test('E3 reachable — the confirmation screen mounts C-ENT4, resolving to /v/aicha-4821', async ({ page }) => {
  await page.goto('/?demo-journey=confirmation');
  const confirmation = page.locator('[data-screen="confirmation"]');
  const ent4 = confirmation.locator('.ent4[data-action="vitrine"]');
  await expect(ent4).toBeVisible();
  await expect(ent4).toHaveAttribute('data-slug', 'aicha-4821');
  const [request] = await Promise.all([
    page.waitForRequest(/\/v\/aicha-4821$/),
    ent4.click(),
  ]);
  expect(request.url()).toMatch(/\/v\/aicha-4821$/);
});
