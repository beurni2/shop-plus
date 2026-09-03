import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

/**
 * COQUILLE-HORS-LIGNE-1 — write dist/sw.js at the end of every build.
 *
 * The worker source is sw.template.js (a classic script at the app root, so
 * its scope is the deploy base by construction); this plugin fills in the
 * built file list and a version that is a hash over the precached BYTES —
 * any changed shell byte is a new worker, an unchanged rebuild is not, so
 * installed phones never re-download an identical shell. No dependency: the
 * asset graph vite just wrote IS the manifest.
 */
function coquilleHorsLigne(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'coquille-hors-ligne',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const sortie = resolve(config.root, config.build.outDir);
      const fichiers = ['index.html', 'manifest.webmanifest'];
      for (const dossier of ['assets', 'fonts']) {
        for (const nom of readdirSync(join(sortie, dossier))) {
          // fonts/ also carries licences and budget notes — cache the faces only.
          if (dossier === 'fonts' && !nom.endsWith('.woff2')) continue;
          fichiers.push(`${dossier}/${nom}`);
        }
      }
      fichiers.sort();
      const h = createHash('sha256');
      for (const chemin of fichiers) {
        h.update(chemin);
        h.update(readFileSync(join(sortie, chemin)));
      }
      const version = h.digest('hex').slice(0, 16);
      const gabarit = readFileSync(resolve(config.root, 'sw.template.js'), 'utf8');
      writeFileSync(
        join(sortie, 'sw.js'),
        gabarit.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(fichiers)),
      );
    },
  };
}

export default defineConfig({
  // WO-4.2E: relative base — the SAME build serves the local harness, the
  // payload gate, and GitHub Pages project hosting (beurni2.github.io/shop-plus/).
  base: './',
  build: { outDir: 'dist' },
  plugins: [coquilleHorsLigne()],
  // vitest reads this config: unit tests only — e2e/ belongs to Playwright
  test: {
    include: ['test/**/*.test.ts'],
  },
} as never);
