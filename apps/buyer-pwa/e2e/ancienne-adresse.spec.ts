import { createServer, type Server } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { construire } from '../scripts/ancienne-adresse.mjs';

/**
 * ═══ ANCIENNE-ADRESSE — AN OLD LINK STILL OPENS, AND THE OLD ADDRESS FORGETS SHOP+ ═══
 *
 * The buyer site moved to an address of its own. Every link already sent — on
 * WhatsApp, on a printed poster, in an installed reseller app — names the old
 * project address, which every other page of the account shares. Driven in a
 * real browser, two real origins:
 *   · OLD: a GitHub-Pages-shaped host on :4179 (project path /shop-plus/, file
 *     else 404.html) that first serves the real built app — its worker
 *     installed, Shop+'s keys on the phone beside another page's key — and
 *     then the forwarder, as the release publishes it;
 *   · NEW: the buyer site's own host on :4174 (playwright.config.ts).
 * An old `/shop-plus/v/…?x#y` link lands on the SAME path, query and hash at
 * the new address, Shop+'s keys are gone from the old origin and the other
 * page's keys are kept, and the old worker has removed itself and its caches.
 *
 * The forwarder is the BUILT one, byte for byte, but for its one address: the
 * pinned public address is swapped for :4174 in a temp copy (each page asserted
 * to carry it exactly once), so no request ever leaves this machine. The
 * address sits in the page's link, outside its script, so the swap leaves the
 * script — and the hash its policy allows it by — unchanged.
 * Claims nothing about appearance.
 */

test.use({ serviceWorkers: 'allow' });

const APP = join(import.meta.dirname, '..');
const NOUVELLE_PUBLIQUE = 'https://shop-plus.pages.dev';
const NOUVELLE = 'http://127.0.0.1:4174';
const PORT_ANCIENNE = 4179;
const ANCIENNE = `http://127.0.0.1:${PORT_ANCIENNE}`;
const PROJET = '/shop-plus/';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};

/** The old host: GitHub project Pages, whose content the test switches. */
let servi = join(APP, 'dist');
let serveur: Server | undefined;
let forwarder: string;

test.beforeAll(async () => {
  // The forwarder as the release builds it, its one address pointed at the
  // local new host.
  const construit = construire();
  forwarder = mkdtempSync(join(tmpdir(), 'ancienne-adresse-'));
  cpSync(construit, forwarder, { recursive: true });
  for (const page of ['index.html', '404.html']) {
    const chemin = join(forwarder, page);
    const html = readFileSync(chemin, 'utf8');
    expect(html.split(NOUVELLE_PUBLIQUE).length - 1, `${page} names the address once`).toBe(1);
    writeFileSync(chemin, html.replace(NOUVELLE_PUBLIQUE, NOUVELLE));
  }

  serveur = createServer((req, res) => {
    const chemin = decodeURIComponent(new URL(req.url ?? '/', ANCIENNE).pathname);
    if (!chemin.startsWith(PROJET)) {
      // Another repository's page on the same origin.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>autre page</title><p>autre page</p>');
      return;
    }
    const rel = chemin.slice(PROJET.length);
    const fichier = join(servi, rel === '' ? 'index.html' : rel);
    let present = false;
    try {
      present = fichier.startsWith(servi) && statSync(fichier).isFile();
    } catch {
      present = false;
    }
    const envoye = present ? fichier : join(servi, '404.html');
    res.writeHead(present ? 200 : 404, { 'content-type': TYPES[extname(envoye)] ?? 'application/octet-stream' });
    res.end(readFileSync(envoye));
  });
  await new Promise<void>((ok) => serveur!.listen(PORT_ANCIENNE, '127.0.0.1', ok));
});

test.afterAll(async () => {
  const s = serveur;
  if (s !== undefined) await new Promise<void>((ok) => s.close(() => ok()));
  rmSync(forwarder, { recursive: true, force: true });
});

const SHOP_LOCAL = ['sp-compte:v1', 'sp-liens-dus:v1', 'sp-portes:v1', 'sp-quote-key:abc123', 'shopplus.listes.v1', 'shop-plus.arrivals.v1'];
const SHOP_SESSION = ['sp-reprise:v1', 'sp-panier-lie:xyz'];
const AUTRES = ['autre-page:session', 'sp_autre', 'spectacle'];

test('an old /shop-plus/v/… link lands on the same page at the new address; the old address forgets only Shop+', async ({ page, context }) => {
  // 1. The phone knows the old site: its worker installed, keys kept.
  servi = join(APP, 'dist');
  await page.goto(`${ANCIENNE}${PROJET}`);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(
    ([shopLocal, shopSession, autres]) => {
      for (const k of shopLocal) localStorage.setItem(k, 'secret');
      for (const k of shopSession) sessionStorage.setItem(k, 'secret');
      for (const k of autres) {
        localStorage.setItem(k, 'garde');
        sessionStorage.setItem(k, 'garde');
      }
    },
    [SHOP_LOCAL, SHOP_SESSION, AUTRES] as const,
  );
  // Another page of the account keeps a cache of its own on this origin.
  await page.evaluate(async () => {
    await (await caches.open('autre-page-v1')).put('/autre/x', new Response('x'));
  });
  const avant = await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith('coquille-shop-plus-')).length);
  expect(avant).toBeGreaterThan(0);
  // A second tab left open on the old site, under its old worker.
  const ouverte = await context.newPage();
  await ouverte.goto(`${ANCIENNE}${PROJET}`);
  await ouverte.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // 2. The release publishes the forwarder at the old address.
  servi = forwarder;

  // 3. An old shared link: same path, query and hash, at the new address.
  await page.goto(`${ANCIENNE}${PROJET}v/aicha-4821?x=1&y=2#suite`);
  await expect(page).toHaveURL(`${NOUVELLE}/v/aicha-4821?x=1&y=2#suite`);
  await expect(page.locator('.vt-root[data-screen="vitrine"]')).toBeVisible({ timeout: 10_000 });

  // The forwarder's worker reloads the tab left open, which then forwards too.
  await expect(ouverte).toHaveURL(`${NOUVELLE}/`, { timeout: 15_000 });
  await ouverte.close();

  // 4. Back on the old origin (another page of the account, same tab so its
  //    sessionStorage is the one the forwarder saw): Shop+ forgotten, the
  //    other page's keys and cache kept, the old worker and its caches gone.
  await page.goto(`${ANCIENNE}/autre/`);
  const restes = await page.evaluate(() => ({
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage).sort(),
  }));
  expect(restes.local).toEqual([...AUTRES].sort());
  expect(restes.session).toEqual([...AUTRES].sort());
  await expect
    .poll(
      () =>
        page.evaluate(async () => ({
          enregistrements: (await navigator.serviceWorker.getRegistrations()).length,
          caches: (await caches.keys()).filter((n) => n.startsWith('coquille-shop-plus-')).length,
          autre: (await caches.keys()).includes('autre-page-v1'),
        })),
      { timeout: 15_000 },
    )
    .toEqual({ enregistrements: 0, caches: 0, autre: true });
});

test('the gift and liste links keep their query on the way (old project root)', async ({ page }) => {
  servi = forwarder;
  await page.goto(`${ANCIENNE}${PROJET}?cadeau=ord_123`);
  await expect(page).toHaveURL(`${NOUVELLE}/?cadeau=ord_123`);
  await page.goto(`${ANCIENNE}${PROJET}s/aicha-4821?pid=p2&liste=${'T'.repeat(32)}`);
  await expect(page).toHaveURL(`${NOUVELLE}/s/aicha-4821?pid=p2&liste=${'T'.repeat(32)}`);
});

test('the forwarder speaks only through its catalog sentence, as a link to the new address', () => {
  // Seen only where its script cannot run; built from the catalog, never inline.
  for (const page of ['index.html', '404.html']) {
    const html = readFileSync(join(APP, 'ancienne-adresse/dist', page), 'utf8');
    expect(html).toContain(`<a id="suite" href="${NOUVELLE_PUBLIQUE}/">Shop+ a une nouvelle adresse. Touchez ici pour continuer.</a>`);
  }
});
