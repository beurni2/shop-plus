/**
 * GitHub-Pages emulator for the deployed-base e2e (BUG 2).
 *
 * `vite preview` serves the SPA at root with NO 404 fallback, so it cannot
 * reproduce the real Pages behaviour: a deep link like `/shop-plus/v/{slug}`
 * hits the static host, finds no file, and is served `404.html` (which
 * client-side-redirects to `/shop-plus/?/v/{slug}`, and the app's restore
 * script rewrites it back). This tiny static server mimics exactly that —
 * project sub-path base + serve-file-else-404.html — so the e2e can drive the
 * REAL deep-link → restore → boot path and prove the app mounts (not a blank
 * 404 from a mis-resolved asset). No dependencies; Node http only.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

const DIST = resolve(process.cwd(), process.env.DIST ?? 'dist');
const BASE = process.env.BASE ?? '/shop-plus/'; // the project sub-path
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

async function sendFile(res, filePath, status = 200) {
  const body = await readFile(filePath);
  res.writeHead(status, { 'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    // Bare root → redirect to the project base (like Pages project sites).
    if (pathname === '/' || pathname === '') {
      res.writeHead(302, { location: BASE });
      return res.end();
    }
    // Only the project base is served; anything else is a hard 404 (no file).
    if (!pathname.startsWith(BASE)) {
      return sendFile(res, join(DIST, '404.html'), 404);
    }
    const rel = pathname.slice(BASE.length); // path within dist
    // The base itself (or its index) serves index.html.
    if (rel === '' || rel === 'index.html') {
      return sendFile(res, join(DIST, 'index.html'));
    }
    const filePath = join(DIST, rel);
    try {
      const s = await stat(filePath);
      if (s.isFile()) return sendFile(res, filePath);
    } catch {
      /* fall through to the SPA 404.html fallback */
    }
    // No such file → GitHub Pages serves 404.html (which restores the SPA route).
    return sendFile(res, join(DIST, '404.html'), 404);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`pages-emulator serving ${DIST} at http://127.0.0.1:${PORT}${BASE}\n`);
});
