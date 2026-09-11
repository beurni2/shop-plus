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

/**
 * POLITIQUE-CONTENU-1 (AUDIT-SHOP-2 F-61) — the Content-Security-Policy and the
 * referrer policy, as `<meta>` in both pages, because GitHub Pages sets no
 * response header. Defence in depth: escaping is total (§7), so the policy is
 * the fence behind the fence — an injected script never runs, an injected
 * fetch never leaves, and a link a buyer shares never carries her `?liste=`
 * token or `?pid=` in a Referer to the site she opens.
 *
 * BUILT, NOT WRITTEN BY HAND, for two reasons that would each rot a static
 * line: the inline restore scripts (index.html's, 404.html's) are allowed by
 * their sha256 over the EXACT bytes emitted — any edit to either script
 * changes the hash, and a stale hash blocks the very script that boots every
 * deep link; and the origin the page may `connect` to is the service base
 * Vite inlines from `VITE_STOREFRONT_BASE` — the deploy's Worker, or the
 * harness's 127.0.0.1 build, never both, never guessed.
 *
 * WHAT EACH LINE SAYS, and why it is as loose or as tight as it is:
 *   · script-src 'self' + the hashes — no 'unsafe-inline', no 'unsafe-eval':
 *     chunks are ours, the two inline scripts are named by their bytes.
 *   · style-src 'self' 'unsafe-inline' — the screens inject their `<style>`
 *     at runtime and carry `style=""` on markup (cover crop, tile offsets);
 *     hashing runtime CSS is impossible and CSS cannot exfiltrate here.
 *   · img-src / media-src: 'self', data: (the QR, the demo tone), blob: (her
 *     recorded voice note), and any https origin — her media rides the
 *     storefront Worker's origin, product photographs and clips ride Boutik+'s
 *     media origin, and both are the service's deploy values, not this
 *     page's to duplicate. An http base (the local harness only) is added
 *     explicitly so the harness's tiles and voice notes load.
 *   · connect-src 'self' + the service base — the ONE origin the page talks
 *     to; an injected `fetch` anywhere else is refused by the browser.
 *   · base-uri 'self' — the restore script pins a same-origin `<base>`;
 *     form-action 'self' — the root's one form; object-src and frame-src
 *     'none' — nothing is embedded (the map embed is long retired).
 *   · referrer: strict-origin-when-cross-origin — the modern default, made
 *     explicit so an old WebView that would send the full URL sends the
 *     origin alone. The WhatsApp opens add `noreferrer` on top (flow.ts,
 *     flows.ts), so wa.me sees not even the origin.
 *
 * NOT here, because a `<meta>` cannot carry them: frame-ancestors (Pages
 * serves no header; the page holds nothing a frame could steal) and any
 * report-uri. `upgrade-insecure-requests` is left out on purpose: it would
 * upgrade the harness's http://127.0.0.1 base and break every real-path walk.
 */
export const REFERRER_POLICY = 'strict-origin-when-cross-origin';

/** The classic inline scripts of a page — never `src=`, never a module. */
const SCRIPT_INLINE = /<script(?![^>]*\bsrc=)(?![^>]*\btype="module")[^>]*>([\s\S]*?)<\/script>/g;

export function hachagesInline(html: string): string[] {
  return [...html.matchAll(SCRIPT_INLINE)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1] as string, 'utf8').digest('base64')}'`,
  );
}

export function politiqueContenu(html: string, base: string | undefined): string {
  const origine = base !== undefined && base !== '' ? new URL(base).origin : null;
  // An https base is already covered by `https:`; only the local http harness
  // needs naming, and only it ever will — the deploy base is https by law.
  const local = origine !== null && origine.startsWith('http:') ? ` ${origine}` : '';
  const directives = [
    "default-src 'self'",
    `script-src 'self' ${hachagesInline(html).join(' ')}`.trimEnd(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${local}`,
    `media-src 'self' data: blob: https:${local}`,
    "font-src 'self'",
    `connect-src 'self'${origine !== null ? ` ${origine}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-src 'none'",
  ];
  return directives.join('; ');
}

/** The two metas, placed right after the charset — BEFORE any script, so the
 *  policy governs the inline restore script it names. */
export function injecterPolitique(html: string, base: string | undefined): string {
  const ancre = '<meta charset="UTF-8" />';
  if (!html.includes(ancre)) throw new Error('politique-contenu: the charset meta the policy is anchored to is missing');
  const metas =
    `<meta http-equiv="Content-Security-Policy" content="${politiqueContenu(html, base)}" />\n` +
    `    <meta name="referrer" content="${REFERRER_POLICY}" />`;
  return html.replace(ancre, `${ancre}\n    ${metas}`);
}

function politiqueContenuPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'politique-contenu',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    // 'post': the html as vite emits it, assets injected, the inline restore
    // script byte-for-byte what the browser will hash.
    transformIndexHtml: {
      order: 'post',
      handler: (html) => injecterPolitique(html, process.env['VITE_STOREFRONT_BASE']),
    },
    // Every other page vite copies from public/ untouched (404.html, the
    // font-check harness): the same policy, each page's own inline script
    // hash. (None of them is in the offline shell's served set, so the
    // worker's version is unaffected by this rewrite.)
    closeBundle() {
      const sortie = resolve(config.root, config.build.outDir);
      for (const nom of readdirSync(sortie)) {
        if (!nom.endsWith('.html') || nom === 'index.html') continue;
        const chemin = join(sortie, nom);
        writeFileSync(chemin, injecterPolitique(readFileSync(chemin, 'utf8'), process.env['VITE_STOREFRONT_BASE']));
      }
    },
  };
}

export default defineConfig({
  // WO-4.2E: relative base — the SAME build serves the local harness, the
  // payload gate, and GitHub Pages project hosting (beurni2.github.io/shop-plus/).
  base: './',
  build: { outDir: 'dist' },
  plugins: [politiqueContenuPlugin(), coquilleHorsLigne()],
  // vitest reads this config: unit tests only — e2e/ belongs to Playwright
  test: {
    include: ['test/**/*.test.ts'],
  },
} as never);
