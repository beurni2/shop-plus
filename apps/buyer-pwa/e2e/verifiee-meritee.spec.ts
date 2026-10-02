import { expect, test, type Page } from '@playwright/test';
import { commeInvitee } from './invitee';

/**
 * ═══ VERIFIEE-MERITEE-1 — « Vendeuse vérifiée » is earned by a delivery
 * (founder ruling 2026-10-02; canon 3.27.0 §4.1) — driven on the REAL
 * http-port build ═══
 *
 * The port-4175 build made WITH `VITE_STOREFRONT_BASE`: the storefront port is
 * the REAL `httpStorefrontPort`, and the service is scripted at the network
 * with the body the Worker answers, `ventesLivrees` included (the count is
 * produced on workerd by `services/storefront-service/test/vitrine-vraie.e2e.test.ts`).
 *
 * The four walk questions: the tree survives both answers · the one way from
 * the product page to her boutique is present, pressable and lands there · no
 * act fires by itself here · she reaches the boutique from the product page.
 * The walk claims NOTHING about appearance — only words and their presence.
 */

const BASE = 'http://127.0.0.1:4175';
test.use({ baseURL: BASE });

const BOUTIQUE = {
  id: 'sf-e2e-vm-1',
  slug: 'aicha-4821',
  resellerId: 'rs-e2e-vm-1',
  name: 'Chez Aïcha Mode',
  zone: 'Rood Woko',
  curatedItems: ['p1'],
  featuredItems: [],
  cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite', sections: [], productNotes: {},
  headerStyle: 'classique', discoverable: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  products: [{ pid: 'p1', name: 'Bazin riche brodé', priceFcfa: 12_000, inStock: true, assetRefs: [] }],
};

async function service(page: Page, ventesLivrees: number, invitee = true): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  if (invitee) await commeInvitee(page);
  await page.route('**/api/s/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...BOUTIQUE, ventesLivrees }) }),
  );
  await page.route('**/checkout/**', (route) => route.abort('failed'));
  return errors;
}

test('no sale delivered yet: neither her boutique nor her product page says « Vendeuse vérifiée » — and « Voir la boutique » still takes her there', async ({ page }) => {
  const errors = await service(page, 0);
  await page.goto('/?/s/aicha-4821&pid=p1');
  const c1 = page.locator('[data-screen="C1"]');
  await expect(c1).toBeVisible();
  await expect(c1).not.toContainText('Vendeuse vérifiée');
  await expect(page.locator('.cl-veri-check')).toHaveCount(0);
  const voir = page.locator('[data-action="voir-boutique"]');
  await expect(voir).toBeVisible();
  // The tap leads to her boutique's address (the path form this local
  // preview does not serve — the same check `panier-payer.spec.ts` makes) …
  await Promise.all([page.waitForURL(/\/v\/aicha-4821/), voir.click()]);
  // … and her boutique, opened by its link, says the same true thing.
  await page.goto('/?/v/aicha-4821');
  const identite = page.locator('[data-role="vitrine-identity"]');
  await expect(identite).toBeVisible();
  await expect(identite).toContainText('Chez Aïcha Mode');
  await expect(identite).toContainText('Rood Woko');
  await expect(identite).not.toContainText('Vendeuse vérifiée');
  await expect(page.locator('.vt-rosette, .vt-avatar-badge')).toHaveCount(0);
  // The honest zero state is named instead.
  await expect(page.locator('[data-role="chip-nouvelle"]')).toBeVisible();
  expect(errors, 'the tree survived').toEqual([]);
});

test('the account doors on her boutique link, before any delivery: her city, no mention, no tick — and the guest door still opens her boutique', async ({ page }) => {
  const errors = await service(page, 0, false);
  await page.goto('/?/v/aicha-4821');
  const tete = page.locator('[data-role="porte-tete"]');
  await expect(tete).toHaveAttribute('data-etat', 'boutique');
  await expect(page.locator('[data-role="porte-verifiee"]')).toHaveText('Rood Woko');
  await expect(tete).not.toContainText('Vendeuse vérifiée');
  await expect(page.locator('.porte-avatar-bulle')).toHaveCount(0);
  await page.locator('[data-action="compte-invitee"]').click();
  await expect(page.locator('[data-role="vitrine-identity"]')).toContainText('Chez Aïcha Mode');
  expect(errors).toEqual([]);
});

test('CONTROL — her first deliveries earned it: the mention on her product page and on her boutique, beside « N ventes livrées »', async ({ page }) => {
  const errors = await service(page, 2);
  await page.goto('/?/s/aicha-4821&pid=p1');
  const c1 = page.locator('[data-screen="C1"]');
  await expect(c1).toContainText('Vendeuse vérifiée');
  await page.goto('/?/v/aicha-4821');
  const identite = page.locator('[data-role="vitrine-identity"]');
  await expect(identite).toContainText('Vendeuse vérifiée');
  await expect(page.locator('[data-role="reputation"]')).toContainText('2');
  expect(errors).toEqual([]);
});
