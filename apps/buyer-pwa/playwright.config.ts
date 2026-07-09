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
    ...(process.env.PW_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PW_EXECUTABLE } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
