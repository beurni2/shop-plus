import { expect, test } from '@playwright/test';

/**
 * WO-SIGNED-LINK — the signed product deep-link `/s/{slug}`, « the one she
 * sends » (§6.2.1 Arrival; SP-I09). The signed offer now mounts the pixel-for-
 * pixel PARCOURS D'ACHAT S1 (produit) in HER habillage. These lock the FROZEN
 * guarantees the redesign must preserve: (1) the offer's product page MOUNTS
 * with her signed price; (2) her arrival is RECORDED on land exactly as `/v/`
 * records it; (3) her full vitrine is REACHABLE from the offer; and the honest
 * not-found / out-of-stock / private paths.
 *
 * Driven through the `?demo-signed=` harness (pathname stays at root) — under
 * `vite preview`'s relative base a restored deep pathname never boots the app
 * (the SAME constraint the other reachability specs carry). The real-pathname
 * parse is pinned in test/signed-product-link.test.ts; both feed one block.
 */

const NNBSP = String.fromCharCode(0x202f);
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

test('the signed link opens the offer — S1 mounts, arrival is locked to her, her vitrine is one tap away', async ({ page }) => {
  await page.goto('/?demo-signed=aicha-4821');

  // (1) the OFFER mounts — the pixel S1 product page, in the achat namespace.
  const produit = page.locator('main.ac-root [data-screen="produit"]');
  await expect(produit).toBeVisible();
  await expect(page.locator('.ac-shopname')).toHaveText('Chez Aïcha Mode');
  // her signed price, byte-exact (money render-only).
  const amount = await page.locator('.ac-pb-hero').first().evaluate((el) => el.textContent);
  expect(amount).toBe(`11${NNBSP}500`);
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

  // (3) her full storefront is REACHABLE — the header « Voir la boutique › »
  // carries her canon /v/{slug}, and the click actually navigates there.
  const voir = page.locator('.ac-voir[data-action="vitrine"]');
  await expect(voir).toHaveAttribute('data-slug', 'aicha-4821');
  const [request] = await Promise.all([
    page.waitForRequest(/\/v\/aicha-4821$/),
    voir.click(),
  ]);
  expect(new URL(request.url()).pathname).toMatch(/\/v\/aicha-4821$/);
});

test('out-of-stock — the signed link still resolves and lands on the épuisé offer', async ({ page }) => {
  await page.goto('/?demo-signed=aicha-4821&pid=sac');

  const produit = page.locator('main.ac-root [data-screen="produit"]');
  await expect(produit).toBeVisible();
  // the sac is the out-of-stock seed — the offer resolves, price shown (struck),
  // « Commander » is disabled, and the épuisé exit routes to her boutique.
  await expect(page.locator('.ac-prodtitle')).toHaveText('Sac cuir artisanal');
  await expect(page.locator('.ac-cta-off')).toBeDisabled();
  await expect(page.locator('.ac-epuise-stamp')).toContainText('ÉPUISÉ');
  await expect(page.locator('.ac-soft[data-action="vitrine"]')).toHaveAttribute('data-slug', 'aicha-4821');
  // the offer still resolved, so her arrival is still recorded.
  expect(await arrivals(page)).toHaveLength(1);
});

test('unknown / expired slug — honest not-found, and it pays nobody (no arrival recorded)', async ({ page }) => {
  await page.goto('/?demo-signed=inconnue-0000');

  // the honest not-found is the /v/ invalid surface — never a bespoke error wall.
  await expect(page.locator('[data-etat="invalid"]')).toBeVisible();
  await expect(page.locator('[data-screen="produit"]')).toHaveCount(0);
  // SP-I09 fails closed: a slug that resolves to nobody records NO arrival.
  expect(await arrivals(page)).toHaveLength(0);
});

test('BUG 3 — the shared product opens THAT product (pid selects the offered article)', async ({ page }) => {
  await page.goto('/?demo-signed=aicha-4821&pid=foulard');
  const produit = page.locator('main.ac-root [data-screen="produit"]');
  await expect(produit).toBeVisible();
  // the foulard is 6 300 — NOT the default robe (11 500).
  await expect(page.locator('.ac-prodtitle')).toHaveText('Foulard Faso Dan Fani');
  const amount = await page.locator('.ac-pb-hero').first().evaluate((el) => el.textContent);
  expect(amount).toBe(`6${NNBSP}300`);
});

test('privée vitrine — not listed in Découvrir, but her signed link still resolves the offer (loi 4)', async ({ page }) => {
  await page.goto('/?demo-signed=aicha-4821&demo-signed-profil=prive');

  // « il n'y a pas de boutique fermée » — the private storefront's link opens
  // the offer exactly like a public one; only the directory would hide her.
  const produit = page.locator('main.ac-root [data-screen="produit"]');
  await expect(produit).toBeVisible();
  await expect(page.locator('.ac-voir[data-action="vitrine"]')).toHaveAttribute('data-slug', 'aicha-4821');
  // resolved → her arrival is recorded, same as the public path.
  const arr = await arrivals(page);
  expect(arr).toHaveLength(1);
  expect(arr[0]!.resellerId).toBe('res_aicha');
});
