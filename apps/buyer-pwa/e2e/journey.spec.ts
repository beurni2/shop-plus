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
  await expect(product.locator('.fcfa-hero')).toHaveText(`${F(11_500)} F`);
  await expect(product.locator('.reseller-name')).toHaveText('Chez Awa — Dassasgho');
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
  await expect(delivery.locator('[data-delivery="standard"]')).toContainText(`${F(1_000)} F`);
  await expect(delivery.locator('[data-delivery="express"]')).toContainText(`${F(1_500)} F`);

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
  await expect(checkout).toContainText(`${F(12_500)} F CFA`); // total = X+Y once

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
