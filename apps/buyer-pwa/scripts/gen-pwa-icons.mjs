#!/usr/bin/env node
/**
 * INSTALLABLE-1 (AUDIT-SHOP-2 F-20) — render the PWA icons.
 *
 * The manifest declared no icons, so Chrome's install criteria were never
 * met: no `beforeinstallprompt`, and « Ajouter à l'écran d'accueil » made a
 * plain bookmark with a letter tile. This writes the pair Chrome needs (192
 * and 512, `purpose: "any maskable"`) plus the 180 px apple-touch-icon:
 * the Shop+ wordmark in the Faso Premium display face, white on the Shop+
 * `primary` token, full-bleed. The wordmark sits inside the maskable SAFE
 * ZONE (the central 80 % circle), so a launcher that crops to a circle or a
 * squircle keeps every letter.
 *
 * The device rendering is Chromium's own (the Playwright binary already in
 * the harness; no new dependency): the face is inlined as a data URI because
 * a file:// page may not load a file:// font. Run from apps/buyer-pwa:
 *
 *   PW_EXECUTABLE=/opt/pw-browsers/chromium node scripts/gen-pwa-icons.mjs
 *
 * The PNGs are committed; test/manifest.test.ts pins their dimensions and the
 * manifest's declaration to them.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { shopPlusTheme } from '@platform/ui-tokens/legacy';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = join(APP, 'public', 'icons');
const FACE = readFileSync(join(APP, 'public', 'fonts', 'Bricolage-ExtraBold.woff2')).toString('base64');

const TAILLES = [
  { fichier: 'icon-192.png', taille: 192 },
  { fichier: 'icon-512.png', taille: 512 },
  { fichier: 'apple-touch-icon.png', taille: 180 },
];

function page(taille) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'Bricolage Grotesque'; font-weight: 800; src: url(data:font/woff2;base64,${FACE}) format('woff2'); }
    html, body { margin: 0; background: ${shopPlusTheme.colours.primary}; }
    #icone { width: ${taille}px; height: ${taille}px; display: grid; place-items: center; background: ${shopPlusTheme.colours.primary}; }
    #mot { font-family: 'Bricolage Grotesque'; font-weight: 800; color: ${shopPlusTheme.colours.onPrimary}; letter-spacing: -0.03em; line-height: 1; white-space: nowrap; font-size: ${Math.round(taille * 0.34)}px; }
  </style></head><body><div id="icone"><span id="mot">Shop+</span></div></body></html>`;
}

mkdirSync(SORTIE, { recursive: true });
const navigateur = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {});
try {
  for (const { fichier, taille } of TAILLES) {
    const onglet = await navigateur.newPage({ viewport: { width: taille, height: taille }, deviceScaleFactor: 1 });
    await onglet.setContent(page(taille));
    await onglet.evaluate(() => document.fonts.ready);
    const chargee = await onglet.evaluate(() => document.fonts.check("800 20px 'Bricolage Grotesque'"));
    if (!chargee) throw new Error('the Bricolage face did not load — the icon would fall back to a system font');
    // Keep the wordmark inside the maskable safe zone (≤ 62 % of the edge).
    await onglet.evaluate((max) => {
      const mot = document.getElementById('mot');
      let taillePolice = parseFloat(getComputedStyle(mot).fontSize);
      while (mot.getBoundingClientRect().width > max && taillePolice > 8) {
        taillePolice -= 1;
        mot.style.fontSize = `${taillePolice}px`;
      }
    }, taille * 0.62);
    const png = await onglet.locator('#icone').screenshot({ type: 'png' });
    writeFileSync(join(SORTIE, fichier), png);
    console.log(`${fichier}: ${taille}×${taille}, ${png.length} B`);
    await onglet.close();
  }
} finally {
  await navigateur.close();
}
