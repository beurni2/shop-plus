import { expect, test } from '@playwright/test';

/**
 * WO-5.3 — THE FONT-LOAD GUARD (founder-ordered). WO-5.1 shipped the Archivo
 * woff2 substrate at public/fonts/archivo-latin-var.woff2; WO-5.3 consumes it
 * in main.ts's @font-face. Because the face is font-display:optional, a WRONG
 * src path fails SILENTLY — the page renders in system-ui forever and no error
 * surfaces. This test makes that failure LOUD:
 *   (1) the woff2 the @font-face points at actually responds 200;
 *   (2) document.fonts.load('1em Archivo') resolves and check() is true — which
 *       exercises the REAL @font-face src, so a broken path (404) turns
 *       document.fonts.load into a rejection / empty set and FAILS this test.
 * Proven non-vacuous: it fails on the old /assets/ path and passes on the real
 * ./fonts/ path (both runs logged in the WO-5.3 journal + packet).
 */

test('the Archivo @font-face resolves: woff2 responds 200 AND document.fonts.check passes (font-display:optional never ships system-font on a broken path)', async ({
  page,
}) => {
  await page.goto('/?demo-journey=produit', { waitUntil: 'load' });

  // (1) the served path the @font-face resolves to (./fonts/… → /fonts/… under
  //     base:'./' at the root document) must actually deliver the font.
  const resp = await page.request.get('/fonts/archivo-latin-var.woff2');
  expect(resp.status(), 'the woff2 is served (not a 404 optional would swallow)').toBe(200);

  // (2) the REAL @font-face src loads — document.fonts.load uses the declared
  //     src, so a wrong path makes this reject/empty and check() false.
  const loaded = await page.evaluate(async () => {
    try {
      const faces = await document.fonts.load('1em Archivo');
      return faces.length > 0 && document.fonts.check('1em Archivo');
    } catch {
      return false;
    }
  });
  expect(loaded, 'document.fonts.load resolved and check() is true — the @font-face path is live').toBe(true);
});
