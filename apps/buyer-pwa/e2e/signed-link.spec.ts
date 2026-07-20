import { expect, test } from '@playwright/test';

/**
 * WO-SIGNED-LINK — the signed product deep-link `/s/{slug}`, « the one she
 * sends » (§6.2.1 Arrival; SP-I09). The GAP this closes: the reseller shares a
 * `/s/{slug}` link but `main.ts` handled only `/v/`, `?demo-journey=`, and the
 * directory — so a product share fell through to `/boutiques` and never landed
 * on the offer.
 *
 * REACHABILITY GATE (the C-ENT lesson): a route nobody can reach must fail the
 * gate. These drive the ACTUAL `/s/` routing branch in `main.ts` and assert
 * (1) the offer's product page MOUNTS, (2) the reseller's arrival is RECORDED on
 * land exactly as `/v/` records it, and (3) her C-ENT vitrine entries are
 * REACHABLE from the offer (the request the click fires proves it).
 *
 * The branch is driven through the `?demo-signed=` harness (pathname stays at
 * root) rather than the literal `/s/{slug}` path: under `vite preview`'s
 * relative base (`base: './'`) a restored deep pathname resolves the module
 * script against `/s/…` and the app never boots — the SAME constraint the E1
 * reachability tests carry (journey.spec.ts). The REAL-pathname parse
 * (`/s/{slug}` → slug) is pinned separately in test/signed-product-link.test.ts;
 * both branches of the `??` feed the identical routing block.
 */

const ARRIVALS_KEY = 'shop-plus.arrivals.v1';

async function arrivals(page: import('@playwright/test').Page) {
  return page.evaluate((key) => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as { scope: string; resellerId: string }[]) : [];
    } catch {
      return [];
    }
  }, ARRIVALS_KEY);
}

test('the signed link opens the offer — product mounts, arrival is locked to her, her vitrine is one tap away', async ({ page }) => {
  await page.goto('/?demo-signed=aicha-4821');

  // (1) the OFFER mounts — the signed product page, her price, her store named.
  const product = page.locator('[data-screen="produit"]');
  await expect(product).toBeVisible();
  await expect(product.locator('.fcfa-hero')).toHaveText('11 500 FCFA');
  await expect(product.locator('.ent1[data-action="vitrine"] .ent1-name')).toHaveText('Chez Aïcha Mode');
  // SP-I03 on the rendered offer: no commission, no supplier, anywhere.
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).not.toContain('commission');
  expect(body).not.toContain('fournisseur');

  // (2) attribution is recorded on land EXACTLY as /v/ does — one identity-scope
  // arrival locked to her (SP-I09). A direct signed land never touched the
  // vitrine, so this is the only place it could have been recorded.
  const arr = await arrivals(page);
  expect(arr).toHaveLength(1);
  expect(arr[0]!.scope).toBe('identity');
  expect(arr[0]!.resellerId).toBe('res_aicha');

  // (3) her full storefront is REACHABLE from the offer — C-ENT1 and C-ENT2
  // carry her canon /v/{slug}, and the click actually navigates there (the
  // request proves the route, independent of the /v/ page booting under preview).
  const ent1 = product.locator('.ent1[data-action="vitrine"]');
  const ent2 = product.locator('.ent2[data-action="vitrine"]');
  await expect(ent1).toHaveAttribute('data-slug', 'aicha-4821');
  await expect(ent2).toBeVisible();
  const [request] = await Promise.all([
    page.waitForRequest(/\/v\/aicha-4821$/),
    ent2.click(),
  ]);
  expect(request.url()).toMatch(/\/v\/aicha-4821$/);
});

test('out-of-stock — the signed link still resolves and lands on the épuisé offer with C-ENT3', async ({ page }) => {
  await page.goto('/?demo-signed=aicha-4821&pid=p3');

  const product = page.locator('[data-screen="produit"]');
  await expect(product).toBeVisible();
  // p3 is the out-of-stock seed product — the offer resolves, price shown, but
  // « En stock » is absent and Commander is not the active CTA.
  await expect(product.locator('.product-name')).toHaveText('Sac cuir artisanal');
  await expect(product.locator('.fcfa-hero')).toHaveText('17 000 FCFA');
  await expect(product.locator('.trust-chip', { hasText: 'En stock' })).toHaveCount(0);
  // C-ENT3 — the épuisé encart routes to her boutique (the dignified way on).
  const ent3 = product.locator('.ent3[data-action="vitrine"]');
  await expect(ent3).toBeVisible();
  await expect(ent3).toHaveAttribute('data-slug', 'aicha-4821');
  // the offer still resolved, so her arrival is still recorded.
  expect(await arrivals(page)).toHaveLength(1);
});

test('unknown / expired slug — honest not-found, and it pays nobody (no arrival recorded)', async ({ page }) => {
  await page.goto('/?demo-signed=inconnue-0000');

  // the honest not-found is the /v/ invalid surface — never the boutiques
  // directory, never a bespoke error wall.
  await expect(page.locator('[data-etat="invalid"]')).toBeVisible();
  await expect(page.locator('[data-screen="produit"]')).toHaveCount(0);
  // SP-I09 fails closed: a slug that resolves to nobody records NO arrival — it
  // must never silently attribute to a reseller.
  expect(await arrivals(page)).toHaveLength(0);
});

test('BUG 3 — the shared product opens THAT product, not the default (pid resolves to its signed facts)', async ({ page }) => {
  // the reseller shares /s/{slug}?pid={productId}; opening it must land on THAT
  // product. Before the fix the reseller sent no pid, so every share fell back to
  // the buyer's default product.
  await page.goto('/?demo-signed=aicha-4821&pid=p2');
  const product = page.locator('[data-screen="produit"]');
  await expect(product).toBeVisible();
  // p2 is « Pagne wax 6 yards » (20 500) — NOT the default landing product
  await expect(product.locator('.product-name')).toHaveText('Pagne wax 6 yards');
  await expect(product.locator('.fcfa-hero')).toHaveText('20 500 FCFA');
  await expect(product.locator('.product-name')).not.toHaveText('Pagne tissé Faso Dan Fani');
});

test('BUG 2 — « Voir la boutique » navigates to the base-aware /v/{slug} (never the origin root → 404)', async ({ page }) => {
  // the C-ENT « Voir la boutique » entry must reach her vitrine. It used to
  // navigate to a hardcoded `/v/{slug}` off the ORIGIN root, which 404s on the
  // Pages sub-path deploy. The fix builds the URL against the deploy base the
  // current route carries; the request the click fires proves the target (under
  // vite preview the base is empty, so the canon root form — the sub-path base
  // preservation is pinned in test/vitrine.test.ts, which preview cannot vary).
  await page.goto('/?demo-journey=produit');
  const ent2 = page.locator('[data-screen="produit"] .ent2[data-action="vitrine"]');
  await expect(ent2).toBeVisible();
  await expect(ent2).toHaveAttribute('data-slug', 'aicha-4821');
  const [request] = await Promise.all([
    page.waitForRequest(/\/v\/aicha-4821$/),
    ent2.click(),
  ]);
  // the navigation target is the canon /v/{slug} vitrine path (not a bare product
  // path, not a wrong root) — base-correct by construction (vitrineHref).
  expect(new URL(request.url()).pathname).toMatch(/\/v\/aicha-4821$/);
});

test('privée vitrine — not listed in Découvrir, but her signed link still resolves the offer (loi 4)', async ({ page }) => {
  await page.goto('/?demo-signed=aicha-4821&demo-signed-profil=prive');

  // « il n'y a pas de boutique fermée » — the private storefront's link opens
  // the offer exactly like a public one; only the directory would hide her.
  const product = page.locator('[data-screen="produit"]');
  await expect(product).toBeVisible();
  await expect(product.locator('.ent1[data-action="vitrine"]')).toHaveAttribute('data-slug', 'aicha-4821');
  await expect(product.locator('.ent2[data-action="vitrine"]')).toBeVisible();
  // resolved → her arrival is recorded, same as the public path.
  const arr = await arrivals(page);
  expect(arr).toHaveLength(1);
  expect(arr[0]!.resellerId).toBe('res_aicha');
});
