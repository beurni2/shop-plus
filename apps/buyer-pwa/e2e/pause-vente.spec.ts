import { expect, test, type Page } from '@playwright/test';

/**
 * ═══ PAUSE-VENTE-1 — « paused resellers can not sell anything until they
 * are reactivated » (founder ruling 2026-09-17) — driven on the REAL
 * http-port build ═══
 *
 * This walk runs against the port-4175 build made WITH `VITE_STOREFRONT_BASE`
 * (playwright.config.ts), so the storefront port is the REAL
 * `httpStorefrontPort` and the quote port the REAL HTTP adapter; the service
 * is scripted at the network with the exact bodies the Worker answers (the
 * seam test `services/storefront-service/test/pause-vente.e2e.test.ts` pins
 * those bodies on workerd).
 *
 * The four walk questions: the tree survives the pause answer (no pageerror,
 * the card is there) · the one ghost action is present, pressable and wired
 * to the root card · the act that fires by itself (the resolve, the price
 * ask) leaves a way out · from a refused price she reaches C3 again by the
 * back arrow. The walk claims NOTHING about appearance.
 */

const BASE = 'http://127.0.0.1:4175';
test.use({ baseURL: BASE });

/** The shop the service answers with while she is ACTIVE. */
const BOUTIQUE = {
  id: 'sf-e2e-pv-1',
  slug: 'aicha-4821',
  resellerId: 'rs-e2e-pv-1',
  name: 'Chez Aïcha Mode',
  zone: 'Rood Woko',
  curatedItems: ['p1'],
  featuredItems: [],
  cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite', sections: [], productNotes: {},
  headerStyle: 'classique', discoverable: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  products: [{ pid: 'p1', name: 'Bazin riche brodé', priceFcfa: 12_000, inStock: true, assetRefs: [] }],
};

/** …and while she is PAUSED: her name, and nothing of the shop. */
const PAUSE = { service: 'storefront-service', enPause: true, name: 'Chez Aïcha Mode', slug: 'aicha-4821' };

async function service(page: Page, shop: 'active' | 'pause', prix: 'muet' | 'pause' = 'muet'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  await page.route('**/api/s/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shop === 'pause' ? PAUSE : BOUTIQUE) }),
  );
  await page.route('**/checkout/**', (route) =>
    prix === 'pause'
      ? route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'reseller_paused' }) })
      : route.abort('failed'),
  );
  return errors;
}

test('the boutique link of a paused reseller draws the pause card with her name — no product, no « Commander »; the ghost way out reaches the root card', async ({ page }) => {
  const errors = await service(page, 'pause');
  await page.goto('/?/v/aicha-4821');
  const carte = page.locator('.vt-root[data-etat="pause"]');
  await expect(carte).toBeVisible();
  await expect(carte).toContainText('Chez Aïcha Mode fait une pause.');
  await expect(carte).toContainText('La vendeuse ne prend pas de commandes pour le moment.');
  await expect(page.locator('.vt-tile')).toHaveCount(0);
  await expect(page.locator('[data-action="commander"]')).toHaveCount(0);
  await expect(page.locator('[data-role="vitrine-identity"]')).toHaveCount(0);
  expect(errors, 'the tree survived the pause answer').toEqual([]);

  const sortie = page.locator('[data-action="decouvrir"]');
  await expect(sortie).toBeVisible();
  await sortie.click();
  await expect(page.locator('[data-screen="racine"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the signed offer link of a paused reseller lands on the SAME pause card — no offer, no price', async ({ page }) => {
  const errors = await service(page, 'pause');
  await page.goto('/?/s/aicha-4821&pid=p1');
  await expect(page.locator('.vt-root[data-etat="pause"]')).toBeVisible();
  await expect(page.locator('.vt-root[data-etat="pause"]')).toContainText('Chez Aïcha Mode fait une pause.');
  await expect(page.locator('[data-screen="C1"]')).toHaveCount(0);
  await expect(page.locator('.vt-root[data-etat="invalid"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a page she opened before the pause: the price ask is refused BY NAME on the honest surface, with no button into the same pause, and the back arrow lands her on C3', async ({ page }) => {
  const errors = await service(page, 'active', 'pause');
  await page.goto('/?/s/aicha-4821&pid=p1');
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-action="continuer-c3"]').click();

  const refus = page.locator('[data-screen="REFUS"]');
  await refus.waitFor({ timeout: 15_000 });
  expect(await refus.getAttribute('data-motif')).toBe('reseller_paused');
  await expect(refus).toContainText('Cette boutique fait une pause.');
  await expect(refus).toContainText('Rien n’a été payé');
  await expect(refus).not.toContainText('reseller_paused');
  await expect(page.locator('.cl-cta-step')).toHaveCount(0);
  expect(errors, 'the tree survived the refusal').toEqual([]);

  await page.locator('[data-action="retour-c3"]').click();
  await expect(page.locator('[data-screen="C3"]')).toBeVisible();
  expect(errors).toEqual([]);
});
