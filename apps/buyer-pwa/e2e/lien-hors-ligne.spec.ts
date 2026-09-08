import { expect, test, type Page } from '@playwright/test';

/**
 * ═══ LIEN-HORS-LIGNE-1 (AUDIT-SHOP-2 F-02 · F-52) — THE LINK SHE ACTUALLY
 * SENDS, WITH NO SERVICE BEHIND IT — driven on the REAL http-port build ═══
 *
 * The audit's BLOCKER: `/s/{slug}?pid=` — the one link a reseller shares —
 * awaited its storefront resolve with no catch. The port throws its offline
 * marker on purpose (so `/v/` can draw the designed card); on this road the
 * marker escaped as an unhandled rejection and NOTHING was appended: a white
 * page, no sentence, no way out, on the network the product is built for.
 * Measured twice (the area auditor, then the supervisor) before the fix.
 *
 * This walk runs against the port-4175 build made WITH `VITE_STOREFRONT_BASE`
 * (playwright.config.ts), so the storefront port is the REAL `httpStorefrontPort`
 * and its `fetch` really fails when the service route is aborted. The
 * `?/s/…` form is what the static host's 404.html hands the app; the restore
 * script in index.html turns it back into the real `/s/{slug}` path before
 * boot — exactly the road a shared link takes on Pages.
 *
 * Written RED first: before the fix the second `expect` below (the card
 * visible) timed out with `#app` empty and a `vitrine-offline` pageerror.
 *
 * The four walk questions: the tree survives the failed resolve (no pageerror,
 * the card is there) · the primary action « Réessayer » is present, pressable
 * and wired · the act that fires by itself (the resolve) leaves a way out ·
 * she reaches the next screen — HER OFFER, C1 — once the service answers.
 * F-52 rides the same walk: a 5xx is the SERVICE absent, its own sentence, the
 * same way out — never « lien invalide », which a 404 alone still earns.
 * The walk claims NOTHING about appearance.
 */

const BASE = 'http://127.0.0.1:4175';
test.use({ baseURL: BASE });

/** The shop the service answers with, in the wire shape the port validates. */
const BOUTIQUE = {
  id: 'sf-e2e-hl-1',
  slug: 'aicha-4821',
  resellerId: 'rs-e2e-hl-1',
  name: 'Chez Aïcha Mode',
  zone: 'Rood Woko',
  curatedItems: ['p1'],
  products: [{ pid: 'p1', name: 'Bazin riche brodé', priceFcfa: 12_000, inStock: true, assetRefs: [] }],
};

type Service = 'coupe' | 'cinq-cents' | 'introuvable' | 'ok';

/** Script the storefront read: unreachable, a 500, a 404, or the shop. */
async function service(page: Page, mode: Service): Promise<void> {
  await page.unroute('**/api/s/**');
  await page.route('**/api/s/**', (route) => {
    if (mode === 'coupe') return route.abort('failed');
    if (mode === 'cinq-cents') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Worker threw exception' });
    if (mode === 'introuvable') return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOUTIQUE) });
  });
}

async function ouvrir(page: Page, mode: Service): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  // the quote asks of the offer are not this walk's subject: they fail fast
  await page.route('**/checkout/**', (route) => route.abort('failed'));
  await service(page, mode);
  await page.goto('/?/s/aicha-4821&pid=p1');
  return errors;
}

test('F-02 — the service unreachable: the designed card, no pageerror; « Réessayer » re-runs HER road and reaches the offer', async ({ page }) => {
  const errors = await ouvrir(page, 'coupe');
  const carte = page.locator('[data-etat="horsligne"]');
  await expect(carte).toBeVisible();
  await expect(carte).toHaveAttribute('data-raison', 'reseau');
  const reessayer = page.locator('[data-action="reessayer"]');
  await expect(reessayer).toBeVisible();
  expect(errors, 'the tree survived the failed resolve').toEqual([]);

  // still no service: the retry lands on the same card, never a blank
  await reessayer.click();
  await expect(page.locator('[data-etat="horsligne"]')).toBeVisible();
  expect(errors).toEqual([]);

  // the network returns: « Réessayer » reaches THE OFFER (C1), not the boutique
  await service(page, 'ok');
  await page.locator('[data-action="reessayer"]').click();
  await expect(page.locator('[data-screen="C1"]')).toBeVisible();
  await expect(page.locator('main.cl-root')).toContainText('Bazin riche brodé');
  expect(page.locator('[data-etat="horsligne"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('F-52 — a 5xx is the SERVICE absent: its own sentence, the same way out; the retry reaches the offer', async ({ page }) => {
  const errors = await ouvrir(page, 'cinq-cents');
  const carte = page.locator('[data-etat="horsligne"]');
  await expect(carte).toBeVisible();
  await expect(carte).toHaveAttribute('data-raison', 'service');
  await expect(page.locator('.vt-root')).not.toHaveAttribute('data-etat', 'invalid');
  await expect(page.locator('main, .vt-root')).not.toContainText('aucune boutique');
  expect(errors).toEqual([]);

  await service(page, 'ok');
  await page.locator('[data-action="reessayer"]').click();
  await expect(page.locator('[data-screen="C1"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('control — a real 404 still earns the honest not-found, never the retry card', async ({ page }) => {
  const errors = await ouvrir(page, 'introuvable');
  await expect(page.locator('.vt-root[data-etat="invalid"]')).toBeVisible();
  await expect(page.locator('[data-etat="horsligne"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
