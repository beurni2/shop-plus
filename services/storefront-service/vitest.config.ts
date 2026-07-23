import { defineConfig } from 'vitest/config';

/**
 * STOREFRONT-DEPLOY-1 — the service now runs THREE Miniflare workerd suites in
 * parallel (storefront DO, listing DO, the combined Worker + R2). Real workerd
 * startup + on-disk-persist restarts under parallel load exceed vitest's 5 s
 * default, so the miniflare e2e get headroom. The fast unit suites are unaffected
 * (they finish in ms); this only raises the ceiling for the heavy ones.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
