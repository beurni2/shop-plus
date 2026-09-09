import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

/**
 * COQUILLE-HORS-LIGNE-1 — write dist/sw.js at the end of every build.
 *
 * The worker source is sw.template.js (a classic script at the app root, so
 * its scope is the deploy base by construction); this plugin fills in the
 * precache list and a version that is a hash over the served BYTES — any
 * changed byte is a new worker, an unchanged rebuild is not, so installed
 * phones never re-download an identical shell. No dependency: the asset
 * graph vite just wrote IS the manifest.
 *
 * SW-PRECACHE-1 (AUDIT-SHOP-2 F-23) — the precache is the ENTRY GRAPH: the
 * `assets/*` files index.html itself references (the same reading of « first
 * load » as scripts/gates/pwa-payload-budget.mjs), never every chunk on disk —
 * the header styles behind dynamic import() are cached by the worker on first
 * use instead. The faces, the manifest and the icons stay precached (see the
 * template's docblock for why the faces must). The VERSION hashes every file
 * the worker may serve, precached or not, so a re-subset face or a changed
 * lazy chunk rolls the cache.
 */
export function precacheEtVersion(sortie: string): { fichiers: string[]; version: string } {
  const html = readFileSync(join(sortie, 'index.html'), 'utf8');
  const entree = new Set([...html.matchAll(/(?:src|href)="(?:\.?\/)?(assets\/[^"]+)"/g)].map((m) => m[1] as string));
  const fichiers = ['index.html', 'manifest.webmanifest'];
  const servis = [...fichiers];
  for (const dossier of ['assets', 'fonts', 'icons']) {
    for (const nom of readdirSync(join(sortie, dossier))) {
      // fonts/ also carries licences and budget notes — the faces only;
      // icons/ (INSTALLABLE-1) holds the manifest icons and the touch icon.
      if (dossier === 'fonts' && !nom.endsWith('.woff2')) continue;
      if (dossier === 'icons' && !nom.endsWith('.png')) continue;
      const chemin = `${dossier}/${nom}`;
      servis.push(chemin);
      if (dossier !== 'assets' || entree.has(chemin)) fichiers.push(chemin);
    }
  }
  fichiers.sort();
  servis.sort();
  const h = createHash('sha256');
  for (const chemin of servis) {
    h.update(chemin);
    h.update(readFileSync(join(sortie, chemin)));
  }
  return { fichiers, version: h.digest('hex').slice(0, 16) };
}

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
      const { fichiers, version } = precacheEtVersion(sortie);
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
