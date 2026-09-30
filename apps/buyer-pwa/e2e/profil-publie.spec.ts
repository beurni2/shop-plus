import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * PROFIL-PUBLIÉ — CODES-EFFACES-1 (founder order 2026-09-30: the hidden
 * testing address must stop showing « Code de démonstration » on the live
 * site). The buyer site real links open (GitHub Pages) also answered
 * `?demo-cliente=`, the harness that walks every C1–C9 screen on a demo
 * order — including a demonstration delivery code, labelled as one.
 *
 * On the profile the deploy builds with, that address is not a harness: it is
 * an ordinary visit, and an ordinary visit to the root lands on the honest
 * card. Unset (local runs, the build the other walks use) keeps the harness —
 * the CONTROL below — so the founder's device walks still have it.
 *
 * The port-4175 build is made the deploy's way (its service base AND this
 * profile — playwright.config.ts); the port-4173 build is the preview.
 */

const PUBLIE = 'http://127.0.0.1:4175';
const APERCU = 'http://127.0.0.1:4173';
const DEMO_C9 = '/?demo-cliente=C9&revealed=1';

test('the deploy builds the published profile — a literal in the step that builds what Pages serves', () => {
  const wf = readFileSync(join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'pwa-preview.yml'), 'utf8');
  const debut = wf.indexOf('- name: Payload budget gate on THE deploy build');
  expect(debut, 'the deploy build step is not in the workflow').toBeGreaterThanOrEqual(0);
  const step = wf.slice(debut);
  const finEnv = step.indexOf('\n        run:');
  expect(finEnv, 'the deploy build step has no run: line').toBeGreaterThan(0);
  expect(step.slice(0, finEnv)).toMatch(/^\s+VITE_PROFILE: 'production'$/m);
});

test('on the published profile the testing address is an ordinary visit: the honest card, no demo order, no demonstration code — and its one act is wired', async ({ page }) => {
  await page.goto(`${PUBLIE}${DEMO_C9}`);
  await expect(page.locator('[data-screen="racine"]')).toBeVisible();
  await expect(page.locator('main.cl-root')).toHaveCount(0);
  await expect(page.locator('[data-role="code-demo"]')).toHaveCount(0);
  await expect(page.getByText('Code de démonstration')).toHaveCount(0);

  // The card's act is present, pressable and wired: a link that opens no
  // boutique earns its sentence, and she stays on the card with her field.
  const champ = page.locator('[data-role="racine-lien"]');
  await expect(champ).toBeVisible();
  await expect(page.locator('[data-action="racine-ouvrir"]')).toBeEnabled();
  await champ.fill('https://wa.me/22670000000');
  await page.locator('[data-action="racine-ouvrir"]').click();
  await expect(page.locator('[data-role="racine-refus"]')).toBeVisible();
  await expect(champ).toBeVisible();
});

test('CONTROL — the preview keeps the harness: the same address walks the demo order, and says its code is a demonstration', async ({ page }) => {
  await page.goto(`${APERCU}${DEMO_C9}`);
  await expect(page.locator('main.cl-root')).toBeVisible();
  await expect(page.locator('[data-role="code-demo"]')).toHaveText('Code de démonstration');
});
