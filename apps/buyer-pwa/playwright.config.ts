import { defineConfig, devices } from '@playwright/test';

/**
 * Buyer PWA Playwright harness (WO-SP0.1). Chromium is preinstalled in this
 * environment (PLAYWRIGHT_BROWSERS_PATH); PW_EXECUTABLE overrides the
 * browser binary when the pinned @playwright/test build differs from the
 * preinstalled one.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // COQUILLE-HORS-LIGNE-1 — the app now registers a service worker, and a
    // fetch a worker answers (or re-issues) is INVISIBLE to page.route
    // (Playwright's documented limitation): every stubbed **/listes/**,
    // **/checkout/**, /s/… and font route in this suite would be silently
    // bypassed, passing or failing for the wrong reason. These specs assert
    // app flows, not caching — so the worker is blocked everywhere and driven
    // deliberately by hors-ligne.spec.ts, which opts back in.
    serviceWorkers: 'block',
    launchOptions: {
      ...(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {}),
      // WO-4.4: the voice-note e2e records from Chromium's fake media stream
      // (a REAL MediaRecorder take, no mic prompt) — harmless elsewhere.
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // --host 127.0.0.1: vite preview binds `localhost` by default, which on
      // GitHub runners resolves to ::1 only — the 127.0.0.1 probe then times
      // out. Bind exactly what we probe.
      command: 'pnpm preview --host 127.0.0.1',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // SP3.2b — THE REAL-PATH BUILD (port 4175).
      //
      // WHY A SECOND BUILD EXISTS AT ALL: `dist` is built with NO
      // `VITE_STOREFRONT_BASE`, so `resolveQuotePort` returns the certified
      // HARNESS port — which never refuses, never expires oddly and always
      // reserves. Every refusal, expiry, clock-skew and reservation branch of
      // `createCliente` is therefore invisible to the existing e2e, and the
      // verifier proved it: five lines that fix three blockers could be deleted
      // with every gate still green. This build points the base at an origin
      // `checkout-real.spec.ts` INTERCEPTS, so the spec drives the REAL
      // `httpQuotePort` through a real `fetch` in a real browser against a
      // scripted service — the shape the verifier's own attack harness used.
      //
      // It builds into `.artifacts/` (gitignored, and excluded from the gate
      // source scans) so it can never be mistaken for the shipped bundle, and
      // costs no lockfile change.
      command:
        'VITE_STOREFRONT_BASE=http://127.0.0.1:9099/api pnpm exec vite build --outDir .artifacts/dist-real --emptyOutDir' +
        ' && pnpm exec vite preview --outDir .artifacts/dist-real --port 4175 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // BUG 2 — the GitHub-Pages emulator (project sub-path + 404.html fallback)
      // so deploy-base.spec.ts can drive the REAL `/shop-plus/v/{slug}` deep-link
      // → restore → boot path that vite preview cannot reproduce. Serves the
      // SAME built dist.
      command: 'DIST=dist BASE=/shop-plus/ PORT=4174 node ../../scripts/pages-emulator.mjs',
      url: 'http://127.0.0.1:4174/shop-plus/',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
