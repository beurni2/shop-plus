import { expect, test, type Page } from '@playwright/test';
import { commeInvitee } from './invitee';

/**
 * ═══ EN-LIGNE-1 — a boutique that is not en ligne is closed to buyers
 * (founder ruling 2026-10-02, « fix this »; canon 3.27.0 §4.1) — driven on the
 * REAL http-port build ═══
 *
 * The port-4175 build made WITH `VITE_STOREFRONT_BASE`, so the storefront port
 * is the REAL `httpStorefrontPort` and the quote port the REAL HTTP adapter;
 * the service is scripted at the network with the exact bodies the Worker
 * answers (pinned on workerd by `services/storefront-service/test/en-ligne.e2e.test.ts`).
 *
 * The four walk questions: the tree survives the closed answer · the one ghost
 * way out is present, pressable and wired to the home card · the act that
 * fires by itself (the resolve, the price ask) leaves a way out · from a
 * refused price she reaches C3 again by the back arrow. The walk claims
 * NOTHING about appearance.
 */

const BASE = 'http://127.0.0.1:4175';
test.use({ baseURL: BASE });

const BOUTIQUE = {
  id: 'sf-e2e-el-1',
  slug: 'aicha-4821',
  resellerId: 'rs-e2e-el-1',
  name: 'Chez Aïcha Mode',
  zone: 'Rood Woko',
  curatedItems: ['p1'],
  featuredItems: [],
  cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite', sections: [], productNotes: {},
  headerStyle: 'classique', discoverable: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  products: [{ pid: 'p1', name: 'Bazin riche brodé', priceFcfa: 12_000, inStock: true, assetRefs: [] }],
};

/** …and while it is NOT EN LIGNE: her name, and nothing of the shop. */
const FERMEE = { service: 'storefront-service', horsLigne: true, name: 'Chez Aïcha Mode', slug: 'aicha-4821' };

async function service(page: Page, shop: 'ouverte' | 'fermee', prix: 'muet' | 'fermee' = 'muet'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  await commeInvitee(page);
  await page.route('**/api/s/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shop === 'fermee' ? FERMEE : BOUTIQUE) }),
  );
  await page.route('**/checkout/**', (route) =>
    prix === 'fermee'
      ? route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'boutique_hors_ligne' }) })
      : route.abort('failed'),
  );
  return errors;
}

test('the boutique link of a shop not en ligne draws the closed card with her name — no product, no « Commander »; the way out reaches the home card', async ({ page }) => {
  const errors = await service(page, 'fermee');
  await page.goto('/?/v/aicha-4821');
  const carte = page.locator('.vt-state[data-raison="hors_ligne"]');
  await expect(carte).toBeVisible();
  await expect(carte).toContainText('Chez Aïcha Mode n’est pas en ligne.');
  await expect(carte).not.toContainText('fait une pause');
  await expect(page.locator('.vt-tile')).toHaveCount(0);
  await expect(page.locator('[data-action="commander"]')).toHaveCount(0);
  await expect(page.locator('[data-role="vitrine-identity"]')).toHaveCount(0);
  expect(errors, 'the tree survived the closed answer').toEqual([]);

  const sortie = page.locator('[data-action="decouvrir"]');
  await expect(sortie).toBeVisible();
  await sortie.click();
  await expect(page.locator('[data-screen="racine"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the product link of a shop not en ligne lands on the SAME closed card — no offer, no price', async ({ page }) => {
  const errors = await service(page, 'fermee');
  await page.goto('/?/s/aicha-4821&pid=p1');
  const carte = page.locator('.vt-state[data-raison="hors_ligne"]');
  await expect(carte).toBeVisible();
  await expect(carte).toContainText('Chez Aïcha Mode n’est pas en ligne.');
  await expect(page.locator('[data-screen="C1"]')).toHaveCount(0);
  await expect(page.locator('.vt-root[data-etat="invalid"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a page she opened before the shop went offline: the price ask is refused BY NAME, with no button into the same closed shop, and the back arrow lands her on C3', async ({ page }) => {
  const errors = await service(page, 'ouverte', 'fermee');
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
  expect(await refus.getAttribute('data-motif')).toBe('boutique_hors_ligne');
  await expect(refus).toContainText('Cette boutique n’est pas en ligne.');
  await expect(refus).toContainText('Rien n’a été payé');
  await expect(refus).not.toContainText('boutique_hors_ligne');
  await expect(page.locator('.cl-cta-step')).toHaveCount(0);
  expect(errors, 'the tree survived the refusal').toEqual([]);

  await page.locator('[data-action="retour-c3"]').click();
  await expect(page.locator('[data-screen="C3"]')).toBeVisible();
  expect(errors).toEqual([]);
});
