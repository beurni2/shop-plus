import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// WO-7.2b — the composeur PWA. Mirrors the buyer-pwa idiom: relative base (the
// same build serves the local harness, the payload gate, and GitHub Pages
// project hosting), vitest reads this config for the unit tests. `@qr` shares
// the reseller-app vendored encoder by SOURCE — never a fork, never a copy.
const qr = fileURLToPath(new URL('../reseller-app/src/qr', import.meta.url));

export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
  resolve: { alias: { '@qr': qr } },
  test: {
    include: ['test/**/*.test.ts'],
  },
} as never);
