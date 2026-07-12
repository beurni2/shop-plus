import { defineConfig } from 'vite';

export default defineConfig({
  // WO-4.2E: relative base — the SAME build serves the local harness, the
  // payload gate, and GitHub Pages project hosting (beurni2.github.io/shop-plus/).
  base: './',
  build: { outDir: 'dist' },
  // vitest reads this config: unit tests only — e2e/ belongs to Playwright
  test: {
    include: ['test/**/*.test.ts'],
  },
} as never);
