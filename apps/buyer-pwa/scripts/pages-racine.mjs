/**
 * The buyer site's own host, emulated for the e2e: a Cloudflare Pages project
 * at the ROOT of its address. Pages serves a file when one exists, and answers
 * an unknown path with the top-level 404.html and a 404 status (it does so
 * whenever the build carries that file) — the page whose script restores
 * `/v/{slug}`, `/s/{slug}` and every other deep link. `vite preview` has no
 * such fallback, so it cannot drive that road. No dependency: Node http only.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), process.env.DIST ?? 'dist');
const PORT = Number(process.env.PORT ?? 4174);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function envoyer(res, chemin, statut = 200) {
  const corps = await readFile(chemin);
  res.writeHead(statut, { 'content-type': TYPES[extname(chemin)] ?? 'application/octet-stream' });
  res.end(corps);
}

createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://h').pathname).replace(/^\/+/, '');
    if (rel === '' || rel === 'index.html') return await envoyer(res, join(DIST, 'index.html'));
    const chemin = join(DIST, rel);
    // Never outside the build.
    if (!chemin.startsWith(DIST)) return await envoyer(res, join(DIST, '404.html'), 404);
    try {
      if ((await stat(chemin)).isFile()) return await envoyer(res, chemin);
    } catch {
      /* no such file: the host's 404.html */
    }
    return await envoyer(res, join(DIST, '404.html'), 404);
  } catch (erreur) {
    res.writeHead(500);
    res.end(String(erreur));
  }
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`pages-racine serving ${DIST} at http://127.0.0.1:${PORT}/\n`);
});
