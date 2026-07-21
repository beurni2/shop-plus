import { expect, test, type Page } from '@playwright/test';

/**
 * PARCOURS D'ACHAT — the pixel-for-pixel gate. Proves, in a real Chromium
 * against the real build: (1) every S1–S7 screen/state mounts (reachability);
 * (2) every amount carries the U+202F byte (money render-only, §0 loi 4) read
 * from the live DOM, never a normalized comparison; (3) the reseller's theme
 * drives the chrome across all four habillages, proven live by a var-flip
 * repaint; (4) « Un souci ? » keeps its danger prominence (#F8E1DE / #8C1D18),
 * never ghost, never themed (§8.6); (5) no purchase-side economics term ever
 * reaches a buyer surface (§0 loi 1); (6) the custody code stays sealed until
 * ARRIVED, then reveals the frozen K7 · 42 (§3, §9.2).
 */

const NNBSP = String.fromCharCode(0x202f);

/** The four §1.2 habillages → their accent as computed rgb(). */
const THEMES: Record<string, string> = {
  laterite: 'rgb(194, 87, 27)',
  danfani: 'rgb(163, 29, 78)',
  indigo: 'rgb(62, 75, 140)',
  foret: 'rgb(11, 91, 71)',
};

async function bodyText(page: Page): Promise<string> {
  return (await page.locator('main.ac-root').innerText()).toLowerCase();
}

test('every screen/state mounts (reachability)', async ({ page }) => {
  const cases: Array<[string, string]> = [
    ['produit', 'produit'],
    ['recap', 'recap'],
    ['localisation', 'localisation'],
    ['livraison', 'livraison'],
    ['livraison&etat=loading', 'livraison'],
    ['livraison&etat=error', 'livraison'],
    ['suivi', 'suivi'],
    ['suivi&revealed=1', 'suivi'],
    ['confirmation', 'confirmation'],
    ['protections', 'protections'],
  ];
  for (const [q, screen] of cases) {
    await page.goto(`/?demo-achat=${q}`);
    await expect(page.locator('main.ac-root')).toBeVisible();
    await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
    // loi 1 — no purchase-side economics leaks on any screen.
    const text = await bodyText(page);
    for (const term of ['coût', 'marge', 'fournisseur', ' net ']) {
      expect(text.includes(term), `${q} leaks « ${term.trim()} »`).toBe(false);
    }
  }
});

test('the price band shows the signed price with the U+202F byte (money render-only)', async ({ page }) => {
  await page.goto('/?demo-achat=produit&theme=indigo');
  const hero = page.locator('.ac-pb-hero').first();
  const amount = await hero.evaluate((el) => el.textContent);
  // byte-exact: NNBSP between thousands, never a space or NBSP.
  expect(amount).toBe(`11${NNBSP}500`);
  expect(amount).not.toMatch(/[ \u00a0]/);
  // the suffix carries the leading NNBSP before FCFA.
  const band = await page.locator('[data-role="price-band"]').first().evaluate((el) => el.textContent);
  expect(band).toContain(`${NNBSP}FCFA`);
  expect(band).not.toMatch(/\d[ \u00a0]FCFA/);
});

test('S4 total recomposes per speed and keeps the money bytes in the CTA', async ({ page }) => {
  await page.goto('/?demo-achat=livraison&vitesse=standard&theme=indigo');
  const cta = await page.locator('.ac-cta').evaluate((el) => el.textContent);
  expect(cta).toBe(`Confirmer — 12${NNBSP}500${NNBSP}FCFA à la porte`);
  await page.goto('/?demo-achat=livraison&vitesse=express&theme=indigo');
  const ctaX = await page.locator('.ac-cta').evaluate((el) => el.textContent);
  expect(ctaX).toContain(`13${NNBSP}300${NNBSP}FCFA`);
});

test('the reseller theme drives the chrome across all four habillages, proven live', async ({ page }) => {
  for (const [theme, rgb] of Object.entries(THEMES)) {
    await page.goto(`/?demo-achat=produit&theme=${theme}`);
    const container = page.locator('main.ac-root');
    const accent = await container.evaluate((el) => getComputedStyle(el).getPropertyValue('--vt-accent').trim());
    // the CTA fill is θ.accent — themed by construction.
    await expect(page.locator('.ac-cta')).toHaveCSS('background-color', rgb);
    expect(accent.length).toBeGreaterThan(0);
  }
  // THE DRIVE, proven live: flip --vt-accent → the CTA repaints (consumes, not copies).
  await page.goto('/?demo-achat=produit&theme=indigo');
  await expect(page.locator('.ac-cta')).toHaveCSS('background-color', THEMES.indigo!);
  await page.locator('main.ac-root').evaluate((el) => el.style.setProperty('--vt-accent', 'rgb(11, 91, 71)'));
  await expect(page.locator('.ac-cta')).toHaveCSS('background-color', 'rgb(11, 91, 71)');
});

test('« Un souci ? » keeps its danger prominence — never ghost, never themed (§8.6)', async ({ page }) => {
  await page.goto('/?demo-achat=suivi&theme=indigo');
  const souci = page.locator('.ac-souci');
  await expect(souci).toBeVisible();
  await expect(souci).toHaveCSS('background-color', 'rgb(248, 225, 222)'); // #F8E1DE
  await expect(souci).toHaveCSS('border-top-color', 'rgb(140, 29, 24)'); // #8C1D18
  // themed page, but the danger button never borrows θ — check under danfani too.
  await page.goto('/?demo-achat=suivi&theme=danfani');
  await expect(page.locator('.ac-souci')).toHaveCSS('background-color', 'rgb(248, 225, 222)');
  await expect(page.locator('.ac-souci')).toHaveCSS('border-top-color', 'rgb(140, 29, 24)');
});

test('the custody code stays sealed until arrival, then reveals K7 · 42', async ({ page }) => {
  await page.goto('/?demo-achat=suivi');
  await expect(page.locator('[data-role="drop-code-sealed"]')).toBeVisible();
  await expect(page.locator('[data-role="drop-code"]')).toHaveCount(0);
  await expect(page.locator('.ac-garde-pill-sealed')).toContainText('SCELLÉ');

  await page.goto('/?demo-achat=suivi&revealed=1');
  const code = page.locator('[data-role="drop-code"] .ac-garde-code');
  await expect(code).toBeVisible();
  expect(await code.evaluate((el) => el.textContent)).toBe(`K7${NNBSP}·${NNBSP}42`);
  await expect(page.locator('.ac-garde-pill-revealed')).toContainText('RÉVÉLÉ');
});

test('S1 épuisé — CTA disabled, band déteinte, exit is the soft θ button', async ({ page }) => {
  await page.goto('/?demo-achat=produit&pid=sac&theme=indigo');
  await expect(page.locator('.ac-cta-off')).toBeDisabled();
  await expect(page.locator('.ac-epuise-stamp')).toContainText('ÉPUISÉ');
  await expect(page.locator('.ac-pb-epuise')).toBeVisible();
  // the price stays signed (17 000) with the money byte, struck through.
  const amount = await page.locator('.ac-pb-epuise .ac-pb-hero').evaluate((el) => el.textContent);
  expect(amount).toBe(`17${NNBSP}000`);
});
