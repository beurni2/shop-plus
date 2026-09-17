import { expect, test, type Page } from '@playwright/test';

/**
 * ═══ PRODUIT-REFUSÉ-1 — the real browser half (founder order 2026-09-17:
 * « fix the 5 that is still open ») ═══
 *
 * A buyer opened a product page BEFORE the product was frozen (B5.2), expired
 * or retired. She fills the delivery step and asks for the price. The service
 * now refuses `product_unavailable` (422), and the page must name it on the
 * honest surface, with « Voir la boutique » as the one way out and the back
 * arrow still standing. The REAL app, the REAL http quote port; only the
 * service is scripted at the network, byte for byte as the Worker answers.
 */

/** THE REAL-PATH BUILD (port 4175, see playwright.config.ts): the default
 *  build's quote port is the certified harness, which never refuses — a spec
 *  about a refusal must drive the REAL http quote port against the scripted
 *  service, or it proves nothing. */
const BASE = 'http://127.0.0.1:4175';
test.use({ baseURL: BASE });

const BOUTIQUE = {
  id: 'sf-e2e-pr-1',
  slug: 'aicha-4821',
  resellerId: 'rs-e2e-pr-1',
  name: 'Chez Aïcha Mode',
  zone: 'Rood Woko',
  curatedItems: ['p1'],
  featuredItems: [],
  cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite', sections: [], productNotes: {},
  headerStyle: 'classique', discoverable: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  products: [{ pid: 'p1', name: 'Bazin riche brodé', priceFcfa: 12_000, inStock: true, assetRefs: [] }],
};

async function service(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  await page.route('**/api/s/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOUTIQUE) }),
  );
  await page.route('**/checkout/**', (route) =>
    route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'product_unavailable' }) }),
  );
  return errors;
}

test('a page she opened before the freeze: the price ask is refused BY NAME, « Voir la boutique » is the one way out and reaches the boutique, and the back arrow lands her on C3', async ({ page }) => {
  const errors = await service(page);
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
  expect(await refus.getAttribute('data-motif')).toBe('product_unavailable');
  await expect(refus).toContainText('Cet article n’est pas en vente en ce moment.');
  await expect(refus).toContainText('Rien n’a été payé');
  await expect(refus).not.toContainText('product_unavailable');
  await expect(refus).not.toContainText('épuisé');
  await expect(page.locator('.cl-cta-step')).toHaveCount(1);
  expect(errors, 'the tree survived the refusal').toEqual([]);

  // the back arrow first — she is never trapped
  await page.locator('[data-action="retour-c3"]').click();
  await expect(page.locator('[data-screen="C3"]')).toBeVisible();
  // …then the same refusal again, and the one way out: the boutique
  await page.locator('[data-action="continuer-c3"]').click();
  await refus.waitFor({ timeout: 15_000 });
  await page.locator('[data-screen="REFUS"] [data-action="voir-boutique"]').click();
  // THE WIRING IS THE CLAIM: the button leaves the refusal for HER boutique's
  // own URL. Booting a boutique from a `/v/{slug}` deep link is a road vite
  // preview cannot reproduce (playwright.config.ts: the Pages emulator on its
  // own port exists for exactly that, and `deploy-base.spec.ts` proves it), so
  // this walk stops at the URL rather than asserting a render the harness
  // cannot serve.
  await page.waitForURL(/\/v\/aicha-4821$/, { timeout: 15_000 });
  expect(new URL(page.url()).pathname.endsWith('/v/aicha-4821')).toBe(true);
  expect(errors).toEqual([]);
});
