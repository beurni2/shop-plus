import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { commeInvitee } from './invitee';

/**
 * ═══ POIDS-PAGE — every byte a boutique costs a buyer, counted on the real page ═══
 *
 * The plan: « the buyer page's total weight is measured ». docs/PERF-BUDGETS.md
 * names the reference phone (« 3G-class: 1.5 Mbps, 300 ms RTT », « Viewport
 * 360×800 ») and the rows held here:
 *   · « Product-card payload | ≤ 25 KB compressed per card, thumbnail included »
 *   · « Image sizes | thumbnail ≤ 15 KB · hero ≤ 80 KB · full view ≤ 150 KB »
 * There is NO canon number for a whole boutique page, so none is asserted: the
 * totals are printed, and only two things are held —
 *   (a) each of the 11 grid cards weighs ≤ 25 600 B, its tile picture included,
 *       on photos made after B8 (the canon row; « À la une » shows the full
 *       photograph on purpose — VIGNETTES-1 — and is governed by the image row,
 *       so its cost is printed, never held to the card row);
 *   (b) every tile picture downloaded asks the vignette (`?v=thumb`), and the
 *       featured card asks the full photograph.
 * The other half of (b) — her cover and portrait ask `?v=petite` — is already
 * pinned on real downloads, and is not repeated here: vitrine-vraie.spec.ts
 * (« PHOTOS-LEGERES-1 — her cover and portrait are asked small », in the
 * classique, pagne and royale headers) and compte.spec.ts (PHOTOS-LEGERES-1,
 * her portrait at the doors and on « Mon compte »).
 *
 * THE WALK. Port 4175 is the deploy's build (playwright.config.ts). A buyer
 * opens `/v/{slug}`: the site's host answers the build's own 404.html with a
 * 404, as the live host does, and that page re-addresses her to `/?/v/{slug}`.
 * The storefront service and both photo services are scripted at the network.
 * Every picture is a real JPEG padded after its end marker to EXACTLY its
 * variant's ceiling — never smaller — so each figure is the most a buyer can be
 * sent. Two moments: the first view (no scroll, the network still), then the
 * whole page (scrolled to the end, still). Chromium's own throttle is set to
 * the reference profile: it decides how far ahead the browser fetches lazy
 * pictures, and it slows the site's own files, but not the answers this walk
 * gives itself — so time is the printed lower bound, never the wall clock.
 *
 * The browser's HTTP cache is off in every walk: Playwright turns it off as
 * soon as a walk scripts the network. A cold first visit is what is measured.
 *
 * HOW A BYTE IS COUNTED. The site's own files: the encoded size the browser
 * received (the preview server gzips text at zlib's default level; fonts and
 * icons go raw). Pictures: the exact length served. The storefront read and the
 * 404 page, which the walk itself answers uncompressed: gzip level 9 of the body
 * served, its raw size beside it. Headers are not counted.
 *
 * Claims nothing about appearance.
 */

const BASE = 'http://127.0.0.1:4175';
const DIST = join(import.meta.dirname, '../.artifacts/dist-real');
test.use({ baseURL: BASE, viewport: { width: 360, height: 800 } });

const SLUG = 'aicha-4821';
const SERVICE = 'http://127.0.0.1:9099';
/** Boutik+'s photo service (her product photos) and Shop+'s own (her cover and portrait). */
const PHOTOS = 'https://boutik-plus-media.exemple.invalid';
const SES_PHOTOS = 'https://storefront.exemple.invalid';
const COUVERTURE = `${SES_PHOTOS}/media/storefronts/sf-e2e-poids-1/cover/5b0c7e1a-3f2d-4a8b-9c61-0d2e4f6a8b10.jpeg`;
const PORTRAIT = `${SES_PHOTOS}/media/storefronts/sf-e2e-poids-1/avatar/9e4d2c1b-7a6f-4e3d-8b2a-1c0f9e8d7b62.jpeg`;

const N = 12;
const pid = (i: number): string => `pv-poids-${String(i).padStart(4, '0')}`;
const UNE = pid(3); // her one pinned « À la une »
const NOMS = [
  'Pagne wax 6 yards, bleu nuit', 'Robe en bazin brodée, taille M', 'Sac en cuir tressé', 'Chemise Faso Dan Fani',
  'Boubou brodé pour enfant', 'Sandales en cuir, pointure 39', 'Foulard en coton teint', 'Ensemble pagne et camisole',
  'Faso Dan Fani, 2 mètres', 'Pochette perlée de soirée', 'Jupe longue en wax', 'Sac à main en raphia',
];
/** A Boutik+ photo address: `{base}/media/{token}` — four per product, the most a product carries. */
const photo = (i: number, k: number): string =>
  `${PHOTOS}/media/${String(i).padStart(8, '0')}-0000-4000-8000-${String(k).padStart(12, '0')}`;

function produit(i: number) {
  return {
    pid: pid(i),
    name: NOMS[i - 1]!,
    priceFcfa: 7_500 + i * 1_250,
    inStock: true,
    assetRefs: [1, 2, 3, 4].map((k) => photo(i, k)),
    category: 'fashion_bags_fabrics',
  };
}
type Produit = ReturnType<typeof produit>;

/** Her boutique as the service answers it: 12 products in one read (the service pages above 14). */
function boutique(): Record<string, unknown> & { products: Produit[] } {
  const products = Array.from({ length: N }, (_, k) => produit(k + 1));
  return {
    id: 'sf-e2e-poids-1', slug: SLUG, resellerId: 'rs-e2e-poids-1', name: 'Chez Aïcha Mode', zone: 'Rood Woko',
    curatedItems: products.map((p) => p.pid), featuredItems: [UNE],
    cover: { status: 'live', url: COUVERTURE }, avatar: { mode: 'photo', url: PORTRAIT },
    theme: 'laterite', sections: [], productNotes: {}, headerStyle: 'classique', discoverable: true,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    products,
  };
}

interface Tailles { readonly nom: string; readonly vignette: number; readonly petite: number; readonly photo: number }
const APRES_B8: Tailles = { nom: 'photos made after B8', vignette: 15_360, petite: 81_920, photo: 153_600 };
const AVANT_B8: Tailles = { nom: 'photos stored before B8', vignette: 98_304, petite: 81_920, photo: 5_242_880 };
const CARTE_MAX = 25_600;

/** An 8×8 JPEG; the bytes after its end marker are ignored by every decoder. */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCvRRRXkHtn/9k=',
  'base64',
);
const images = new Map<number, Buffer>();
function image(octets: number): Buffer {
  let b = images.get(octets);
  if (b === undefined) {
    b = Buffer.alloc(octets);
    JPEG.copy(b);
    images.set(octets, b);
  }
  return b;
}

// ─── the ledger ──────────────────────────────────────────────────────────────

type Genre = 'code' | 'fonts' | 'data' | 'pictures';
type Compte = 'encoded' | 'served' | 'gzip-9' | 'from the worker\'s cache' | 'no size reported';
interface Ligne {
  readonly url: string;
  readonly genre: Genre;
  readonly octets: number;
  readonly brut: number | null;
  readonly compte: Compte;
  readonly statut: number;
  readonly debut: number;
  readonly fin: number;
  readonly duTravailleur: boolean;
}
interface Servi { readonly octets: number; readonly brut: number | null; readonly compte: Compte }

function genreDe(url: string): Genre {
  const u = new URL(url);
  if (u.origin === PHOTOS || u.origin === SES_PHOTOS) return 'pictures';
  if (u.origin === SERVICE) return 'data';
  if (u.pathname.endsWith('.woff2')) return 'fonts';
  return 'code';
}

interface Livre {
  readonly lignes: Ligne[];
  readonly echecs: string[];
  readonly erreurs: string[];
  servi(r: Request, s: Servi): void;
  auRepos(page: Page): Promise<void>;
}

/** Every request the context makes — the page's and its worker's — with what it cost. */
function ouvrirLivre(context: BrowserContext): Livre {
  const lignes: Ligne[] = [];
  const echecs: string[] = [];
  const erreurs: string[] = [];
  const servis = new Map<Request, Servi>();
  /** Requests with no end yet, and when each began. */
  const enVol = new Map<Request, number>();
  const debuts = new Map<Request, number>();
  /** Finished requests whose line is still being written. */
  const enCours = new Map<Request, Promise<void>>();
  let dernier = Date.now();
  context.on('request', (r) => {
    dernier = Date.now();
    enVol.set(r, dernier);
    debuts.set(r, dernier);
  });
  // A worker that closes takes its unfinished requests with it: Playwright then
  // sends neither « finished » nor « failed » for them. Each one is ended here
  // and named, its bytes not counted, so the walk cannot wait for it forever.
  context.on('serviceworker', (w) => {
    w.on('close', () => {
      for (const r of [...enVol.keys()]) {
        if (r.serviceWorker() !== w) continue;
        enVol.delete(r);
        echecs.push(`${r.url()} — ended when its worker closed, never finished; its bytes are not counted`);
        dernier = Date.now();
      }
    });
  });
  context.on('requestfinished', (r) => {
    const fin = Date.now();
    enVol.delete(r);
    // The answer that came with « finished », taken as it is, never awaited:
    // Chromium now and then finishes a request without ever reporting its answer
    // (the worker's own script), and Playwright's `response()` then never
    // settles. Such a request is ended, named, and counted as the line says.
    const rep = r.existingResponse();
    if (rep === null) {
      const s = servis.get(r);
      const compte = s !== undefined ? `counted the ${n(s.octets)} B this walk served it (${s.compte})` : 'counted 0 B';
      echecs.push(`${r.url()} — finished with no answer reported to the harness; ${compte}`);
    }
    const p = (async () => {
      try {
        const s = servis.get(r);
        // An answer the worker gave from its cache crossed no network; Chromium
        // reports it as a negative size, so it is counted 0 and named.
        const duCache = rep?.fromServiceWorker() === true;
        const taille = s !== undefined || duCache || rep === null ? 0 : (await r.sizes()).responseBodySize;
        lignes.push({
          url: r.url(),
          genre: genreDe(r.url()),
          octets: s !== undefined ? s.octets : duCache || taille <= 0 ? 0 : taille,
          brut: s !== undefined ? s.brut : null,
          compte: s !== undefined ? s.compte : duCache ? 'from the worker\'s cache' : taille <= 0 ? 'no size reported' : 'encoded',
          statut: rep?.status() ?? 0,
          debut: debuts.get(r) ?? fin,
          fin,
          duTravailleur: r.serviceWorker() !== null,
        });
      } catch (e) {
        // Its worker closed while its size was being read (« Worker closed »).
        const raison = e instanceof Error ? e.message.split('\n')[0] : String(e);
        echecs.push(`${r.url()} — finished, but its size could not be read (${raison}); its bytes are not counted`);
      }
    })().finally(() => {
      dernier = Date.now();
      enCours.delete(r);
    });
    enCours.set(r, p);
  });
  context.on('requestfailed', (r) => {
    echecs.push(`${r.url()} — ${r.failure()?.errorText ?? '?'}`);
    enVol.delete(r);
    dernier = Date.now();
  });
  return {
    lignes,
    echecs,
    erreurs,
    servi: (r, s) => servis.set(r, s),
    // Still = nothing in flight, every line written, and nothing new for 1.5 s.
    // The cap sits under every test's own timeout, so a page that never goes
    // still is named here, never left to a bare timeout.
    async auRepos(page) {
      const t0 = Date.now();
      while (!(enVol.size === 0 && enCours.size === 0 && Date.now() - dernier >= 1_500)) {
        if (Date.now() - t0 > 45_000) {
          const noms = (rs: Iterable<Request>): string => [...rs].map((r) => r.url()).join(', ') || 'none';
          throw new Error(`the page never went still — in flight: ${noms(enVol.keys())} · finished, its line not written: ${noms(enCours.keys())}`);
        }
        await page.waitForTimeout(100);
      }
    },
  };
}

/** The scripted host, service and photo services, on the whole context (its worker included). */
async function servir(context: BrowserContext, livre: Livre, tailles: Tailles, lus: string[]): Promise<void> {
  const page404 = readFileSync(join(DIST, '404.html'));
  await context.route(/^http:\/\/127\.0\.0\.1:4175\/v\//, (route) => {
    livre.servi(route.request(), { octets: gzipSync(page404, { level: 9 }).length, brut: page404.length, compte: 'gzip-9' });
    return route.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: page404 });
  });
  await context.route(`${SERVICE}/api/s/**`, (route) => {
    const u = new URL(route.request().url());
    lus.push(u.pathname + u.search);
    const corps = Buffer.from(JSON.stringify(boutique()));
    livre.servi(route.request(), { octets: gzipSync(corps, { level: 9 }).length, brut: corps.length, compte: 'gzip-9' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: corps });
  });
  await context.route('**/checkout/**', (route) => route.abort('failed'));
  // Each service reads the variant as `searchParams.get('v')`, as the real ones do.
  await context.route(`${PHOTOS}/**`, (route) => {
    const corps = image(new URL(route.request().url()).searchParams.get('v') === 'thumb' ? tailles.vignette : tailles.photo);
    livre.servi(route.request(), { octets: corps.length, brut: null, compte: 'served' });
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: corps });
  });
  await context.route(`${SES_PHOTOS}/**`, (route) => {
    const corps = image(new URL(route.request().url()).searchParams.get('v') === 'petite' ? tailles.petite : tailles.photo);
    livre.servi(route.request(), { octets: corps.length, brut: null, compte: 'served' });
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: corps });
  });
}

/** Chromium's own throttle, at the reference profile. */
async function etrangler(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 300,
    downloadThroughput: 1_500_000 / 8,
    uploadThroughput: 1_500_000 / 8,
    connectionType: 'cellular3g',
  });
}

/** Which product, and which of her photos, a picture address is. */
function photoDe(url: string): { pid: string; k: number } | null {
  const m = /\/media\/(\d{8})-0000-4000-8000-(\d{12})$/.exec(new URL(url).pathname);
  return m === null ? null : { pid: pid(Number(m[1])), k: Number(m[2]) };
}
const variante = (url: string): string | null => new URL(url).searchParams.get('v');
/** A picture the page received: from a photo service, answered 200. Anything else at a photo's path is not that photo. */
const photoRecue = (l: Ligne): boolean => l.genre === 'pictures' && l.statut === 200;

interface Marche { readonly premiere: Ligne[]; readonly entiere: Ligne[]; readonly fenetre: string; readonly defile: string; readonly lus: string[]; readonly livre: Livre }

async function marcher(context: BrowserContext, page: Page, tailles: Tailles, o: { etrangle: boolean; jusquauBout: boolean }): Promise<Marche> {
  const livre = ouvrirLivre(context);
  const lus: string[] = [];
  page.on('pageerror', (e) => livre.erreurs.push(String(e.message ?? e)));
  await commeInvitee(page);
  await servir(context, livre, tailles, lus);
  if (o.etrangle) await etrangler(context, page);
  await page.goto(`/v/${SLUG}`);
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible({ timeout: 60_000 });
  await livre.auRepos(page);
  const premiere = [...livre.lignes];
  const fenetre = await page.evaluate(() => `${innerWidth}×${innerHeight}`);
  let defile = 'not scrolled';
  if (o.jusquauBout) {
    // A thumb's scroll, 400 px at a time, until the page has no more below.
    let pas = 0;
    for (; pas < 200; pas++) {
      const fini = await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
      if (fini) break;
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(150);
    }
    await livre.auRepos(page);
    defile = await page.evaluate((k) => `scrolled to the end: the page is ${document.documentElement.scrollHeight} px tall, its last view starts at ${Math.round(scrollY)} px, ${k} steps of 400 px`, pas);
  }
  return { premiere, entiere: [...livre.lignes], fenetre, defile, lus, livre };
}

// ─── what is printed ─────────────────────────────────────────────────────────

const n = (x: number): string => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const dire = (s = ''): void => console.log(s);

function etiquette(l: Ligne): string {
  const u = new URL(l.url);
  if (u.origin === BASE) return u.pathname + u.search;
  if (u.origin === SERVICE) return `storefront read ${u.pathname}${u.search}`;
  if (l.url.startsWith(COUVERTURE)) return `her cover ?v=${variante(l.url) ?? '(full)'}`;
  if (l.url.startsWith(PORTRAIT)) return `her portrait ?v=${variante(l.url) ?? '(full)'}`;
  const ph = photoDe(l.url);
  if (ph !== null) return `${ph.pid === UNE ? '« À la une »' : 'tile'} ${ph.pid} photo ${ph.k} ?v=${variante(l.url) ?? '(full)'}`;
  return l.url;
}

function tuilesDe(lignes: readonly Ligne[]): Set<string> {
  return new Set(lignes.map((l) => photoDe(l.url)).filter((p) => p !== null && p.pid !== UNE).map((p) => p!.pid));
}

/** Rounds: the longest chain of requests where each started only after the one before it ended. */
function tours(lignes: readonly Ligne[]): number {
  const tri = [...lignes].sort((a, b) => a.debut - b.debut);
  const rang = new Map<Ligne, number>();
  let max = 0;
  for (const l of tri) {
    let r = 1;
    for (const q of tri) {
      const rq = rang.get(q);
      if (q !== l && rq !== undefined && q.fin <= l.debut) r = Math.max(r, rq + 1);
    }
    rang.set(l, r);
    max = Math.max(max, r);
  }
  return max;
}

function bilan(nom: string, lignes: readonly Ligne[], etrangle: boolean): void {
  const par: Record<Genre, number> = { code: 0, fonts: 0, data: 0, pictures: 0 };
  for (const l of lignes) par[l.genre] += l.octets;
  const total = par.code + par.fonts + par.data + par.pictures;
  const origines = new Set(lignes.map((l) => new URL(l.url).origin));
  // On the live site her cover and portrait come from the storefront service's own address.
  const surLeSite = new Set([...origines].map((o) => (o === SES_PHOTOS ? SERVICE : o)));
  const t = tours(lignes);
  const secondes = (total * 8) / 1_500_000 + 0.3 * t + 0.6 * surLeSite.size;
  const horloge = lignes.length === 0 ? 0 : (Math.max(...lignes.map((l) => l.fin)) - Math.min(...lignes.map((l) => l.debut))) / 1000;
  dire(`  ${nom}: ${n(total)} B in ${lignes.length} requests — code ${n(par.code)} · fonts ${n(par.fonts)} · data ${n(par.data)} · pictures ${n(par.pictures)}`);
  dire(`    origins here (${origines.size}): ${[...origines].join(' · ')} — on the live site ${surLeSite.size}: her cover and portrait come from the storefront service's own address`);
  dire(`    seconds on the reference network, a LOWER BOUND (no slow start, no loss, no phone CPU): ${secondes.toFixed(1)} s`);
  dire(`      = ${n(total)} B × 8 / 1 500 000 (${((total * 8) / 1_500_000).toFixed(1)} s) + 0.3 s × ${t} rounds + 0.6 s (2 RTT) × ${surLeSite.size} origins`);
  dire(`    wall clock of this walk${etrangle ? ', throttled' : ' (NOT throttled)'}: ${horloge.toFixed(1)} s — a cross-check only`);
  if (etrangle) {
    // What the throttle really slowed: a file the site's server sent, and a picture this walk answered itself.
    const plusLourd = (g: readonly Genre[]): Ligne | undefined => lignes.filter((l) => g.includes(l.genre)).sort((a, b) => b.octets - a.octets)[0];
    for (const [quoi, l] of [['the largest file the site sent', plusLourd(['code', 'fonts'])], ['the largest picture this walk served', plusLourd(['pictures'])]] as const) {
      if (l !== undefined) dire(`      ${quoi}: ${n(l.octets)} B arrived in ${n(l.fin - l.debut)} ms; 1.5 Mbps alone needs ${n(Math.round((l.octets * 8) / 1_500))} ms`);
    }
    const img = plusLourd(['pictures']);
    if (img !== undefined && img.fin - img.debut < (img.octets * 8) / 1_500) {
      dire('      so the throttle slows what the site\'s server sends, not what this walk answers itself: read the lower bound, not the wall clock');
    }
  }
}

function detail(m: Marche): void {
  const premiere = new Set(m.premiere);
  dire('  every request (* = already in the first view):');
  for (const l of m.entiere) {
    const comment = l.compte === 'gzip-9' ? `gzip-9 of ${n(l.brut ?? 0)} B raw` : l.compte;
    dire(`    ${premiere.has(l) ? '*' : ' '} ${l.genre.padEnd(8)} ${n(l.octets).padStart(11)} B ${n(l.fin - l.debut).padStart(7)} ms  ${String(l.statut).padEnd(3)} ${etiquette(l)}  [${comment}${l.duTravailleur ? ', the worker' : ''}]`);
  }
  if (m.livre.echecs.length > 0) dire(`  failed or cancelled: ${m.livre.echecs.join(' | ')}`);
  dire(`  page errors: ${m.livre.erreurs.length === 0 ? 'none' : m.livre.erreurs.join(' | ')}`);
  dire(`  storefront reads asked: ${m.lus.join(' , ')}`);
}

/** One product card: its raw record, its pid in curatedItems, and what the page downloaded for its picture. */
function carte(p: Produit, lignes: readonly Ligne[]): { record: number; gzip: number; place: number; image: number; total: number; asks: string[] } {
  const json = Buffer.from(JSON.stringify(p));
  const place = Buffer.byteLength(JSON.stringify(p.pid));
  const siennes = lignes.filter((l) => photoRecue(l) && photoDe(l.url)?.pid === p.pid);
  const img = siennes.reduce((s, l) => s + l.octets, 0);
  return { record: json.length, gzip: gzipSync(json, { level: 9 }).length, place, image: img, total: json.length + place + img, asks: siennes.map((l) => variante(l.url) ?? '(full)') };
}

/** The gate's own formula (scripts/gates/pwa-payload-budget.mjs), applied to the build this walk ran. */
function compteDuPortail(): { total: number; fichiers: { f: string; t: number }[] } {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const referencees = new Set([...html.matchAll(/(?:src|href)="(?:\.?\/)?((?:assets|fonts)\/[^"]+)"/g)].map((m) => m[1]));
  const assets = readdirSync(join(DIST, 'assets')).map((f) => `assets/${f}`);
  const polices = readdirSync(join(DIST, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => `fonts/${f}`);
  const fichiers = ['index.html', ...(existsSync(join(DIST, 'manifest.webmanifest')) ? ['manifest.webmanifest'] : []), ...assets.filter((f) => referencees.has(f)), ...polices];
  const taille = (f: string): number => {
    const brut = readFileSync(join(DIST, f));
    return f.endsWith('.woff2') ? brut.length : gzipSync(brut, { level: 9 }).length;
  };
  const mesures = fichiers.map((f) => ({ f, t: taille(f) }));
  return { total: mesures.reduce((s, x) => s + x.t, 0), fichiers: mesures };
}

/** The gate's count beside this walk's first view, file by file. */
function direPortail(premiere: readonly Ligne[]): void {
  const portail = compteDuPortail();
  // The shell itself is fetched at `/` (the `/?/v/…` address); the gate names it index.html.
  const vu = (f: string): Ligne | undefined =>
    premiere.find((l) => { const u = new URL(l.url); return u.origin === BASE && u.pathname === (f === 'index.html' ? '/' : `/${f}`) && l.statut === 200; });
  dire('  the gate\'s formula on this same build, beside this walk\'s first view (gate: gzip-9, faces raw · walk: as received):');
  let walk = 0;
  for (const { f, t } of portail.fichiers) {
    const l = vu(f);
    walk += l?.octets ?? 0;
    dire(`    ${f.padEnd(42)} gate ${n(t).padStart(8)} B · walk ${l === undefined ? '       — not fetched by this page' : `${n(l.octets).padStart(8)} B`}`);
  }
  dire(`    ${'total'.padEnd(42)} gate ${n(portail.total).padStart(8)} B · walk ${n(walk).padStart(8)} B`);
  const ailleurs = premiere.filter((l) => new URL(l.url).origin === BASE && !portail.fichiers.some(({ f }) => vu(f) === l));
  for (const l of ailleurs) dire(`    beyond the gate's list: ${etiquette(l)} ${n(l.octets)} B (status ${l.statut})`);
  dire('  The gate counts every face and compresses at gzip-9; the walk counts the faces this page drew, as the preview server');
  dire('  compressed them (zlib\'s default level). The gate stays the gate: it is not touched.');
}

const GRILLE = Array.from({ length: N }, (_, k) => produit(k + 1)).filter((p) => p.pid !== UNE);

// ─── the walks ───────────────────────────────────────────────────────────────

test.describe('POIDS-PAGE — what one boutique costs a buyer on the reference network', () => {
  test(`${APRES_B8.nom}: the first view and the whole page — each grid card ≤ 25 600 B, every tile asks the vignette`, async ({ page, context, browser }) => {
    test.setTimeout(150_000);
    const m = await marcher(context, page, APRES_B8, { etrangle: true, jusquauBout: true });

    // The same first view without the throttle — does the throttle change how far ahead Chromium fetches?
    const ctx0 = await browser.newContext();
    const m0 = await marcher(ctx0, await ctx0.newPage(), APRES_B8, { etrangle: false, jusquauBout: false });
    await ctx0.close();

    dire();
    dire(`═══ POIDS-PAGE · ${APRES_B8.nom} (vignette ${n(APRES_B8.vignette)} · petite ${n(APRES_B8.petite)} · full photograph ${n(APRES_B8.photo)}) ═══`);
    dire(`  window ${m.fenetre} · 12 products, 1 pinned « À la une », her cover and portrait · header classique · throttled 1.5 Mbps / 300 ms`);
    dire(`  ${m.defile}`);
    bilan('first view', m.premiere, true);
    bilan('whole page', m.entiere, true);
    dire(`  tiles fetched in the first view: ${tuilesDe(m.premiere).size} throttled · ${tuilesDe(m0.premiere).size} not throttled (window ${m0.fenetre})`);
    bilan('first view, NOT throttled', m0.premiere, false);
    detail(m);

    direPortail(m.premiere);

    const une = carte(produit(3), m.entiere);
    dire(`  « À la une » (${UNE}), the full photograph on purpose — printed, held to the image row, not the card row: ${n(une.total)} B = record ${n(une.record)} (gzip-9 ${n(une.gzip)}) + place ${une.place} + picture ${n(une.image)} [${une.asks.join(', ')}]`);
    dire('  where this stand-in is KINDER than the real service (each a sentence and a figure, not run):');
    dire(`    · a tile whose photo has no vignette yet is answered the photograph itself: up to ${n(APRES_B8.photo)} B for that tile after B8, up to ${n(AVANT_B8.photo)} B before;`);
    dire(`    · her cover or portrait with no small copy yet is answered her photo itself: up to ${n(AVANT_B8.photo)} B each, instead of ${n(APRES_B8.petite)} B;`);
    dire(`    · a clip that starts playing on 3G downloads up to ${n(12 * 1024 * 1024)} B (Boutik+'s video ceiling). This boutique has no clip.`);
    dire('  each grid card (a), raw record + its place in curatedItems + its downloaded picture:');

    // (a) — exactly the 11 grid cards, each ≤ 25 600 B, and a card whose tile was never downloaded FAILS.
    const grille = await page.locator('.vt-grid [data-role="vitrine-produit"][data-pid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-pid') ?? ''));
    expect.soft(grille.sort(), '(a) covers exactly the 11 grid cards').toEqual(GRILLE.map((p) => p.pid).sort());
    for (const p of GRILLE) {
      const c = carte(p, m.entiere);
      dire(`    ${p.pid}: ${n(c.total)} B = record ${n(c.record)} (gzip-9 ${n(c.gzip)}) + place ${c.place} + picture ${n(c.image)} [${c.asks.join(', ') || 'never downloaded'}]`);
      expect.soft(c.image, `(a) ${p.pid}: its tile picture was never downloaded`).toBeGreaterThan(0);
      expect.soft(c.total, `(a) ${p.pid}: the card weighs more than ${CARTE_MAX} B`).toBeLessThanOrEqual(CARTE_MAX);
    }

    // (b) — every downloaded tile picture asks the vignette; the featured card asks the full photograph.
    const photosTuiles = m.entiere.filter((l) => { const ph = photoDe(l.url); return photoRecue(l) && ph !== null && ph.pid !== UNE; });
    expect.soft(photosTuiles.map((l) => `${etiquette(l)}`).filter((e) => !e.endsWith('?v=thumb')), '(b) a tile downloaded something other than its vignette').toEqual([]);
    const photosUne = m.entiere.filter((l) => photoRecue(l) && photoDe(l.url)?.pid === UNE);
    expect.soft(photosUne.length, '(b) the featured card\'s photograph was never downloaded').toBeGreaterThan(0);
    expect.soft(photosUne.map((l) => variante(l.url)), '(b) the featured card asks the full photograph').toEqual(photosUne.map(() => null));
  });

  test(`${AVANT_B8.nom}: the first view and the whole page — printed only, the known gap`, async ({ page, context }) => {
    test.setTimeout(240_000);
    const m = await marcher(context, page, AVANT_B8, { etrangle: true, jusquauBout: true });
    dire();
    dire(`═══ POIDS-PAGE · ${AVANT_B8.nom} (vignette ${n(AVANT_B8.vignette)} · petite ${n(AVANT_B8.petite)} · full photograph ${n(AVANT_B8.photo)}) ═══`);
    dire(`  ${n(AVANT_B8.photo)} B is the most the service allows, not what a typical photo weighs.`);
    dire(`  window ${m.fenetre} · the same boutique · throttled 1.5 Mbps / 300 ms`);
    dire(`  ${m.defile}`);
    bilan('first view', m.premiere, true);
    bilan('whole page', m.entiere, true);
    dire(`  tiles fetched in the first view: ${tuilesDe(m.premiere).size}`);
    detail(m);
    const une = carte(produit(3), m.entiere);
    dire(`  « À la une » (${UNE}): ${n(une.total)} B = record ${n(une.record)} + place ${une.place} + picture ${n(une.image)} [${une.asks.join(', ')}]`);
    dire(`  each grid card against the ${n(CARTE_MAX)} B row — the known gap, printed, never asserted:`);
    for (const p of GRILLE) {
      const c = carte(p, m.entiere);
      dire(`    ${p.pid}: ${n(c.total)} B (record ${n(c.record)} + place ${c.place} + picture ${n(c.image)} [${c.asks.join(', ') || 'never downloaded'}]) — ${c.total > CARTE_MAX ? `over by ${n(c.total - CARTE_MAX)} B` : 'within'}`);
    }
  });
});

test.describe('POIDS-PAGE — the third moment: the service worker\'s install on a first visit', () => {
  test.use({ serviceWorkers: 'allow' });

  test('its install fetches, counted apart from the page', async ({ page, context }) => {
    test.setTimeout(90_000);
    const m = await marcher(context, page, APRES_B8, { etrangle: false, jusquauBout: false });
    const actif = await page.evaluate(() =>
      Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 20_000))]),
    );
    await m.livre.auRepos(page);
    const precache = JSON.parse(/const PRECACHE = (\[[^\]]*\]);/.exec(readFileSync(join(DIST, 'sw.js'), 'utf8'))![1]!) as string[];
    const duTravailleur = m.livre.lignes.filter((l) => l.duTravailleur);
    const vus = new Set(duTravailleur.map((l) => new URL(l.url).pathname.slice(1)));
    const manquants = precache.filter((f) => !vus.has(f));

    dire();
    dire('═══ POIDS-PAGE · the service worker\'s first-visit install (not throttled) ═══');
    dire(`  worker active: ${actif} · its list: ${precache.length} files · seen fetched by the worker: ${precache.length - manquants.length}`);
    bilan('the page itself, first view', m.livre.lignes.filter((l) => !l.duTravailleur), false);
    if (manquants.length === 0) {
      // Playwright turns the browser's HTTP cache off whenever a walk scripts the network, so here the worker
      // downloads again what the page already had. The page's own network fetches, by file:
      const chemin = (l: Ligne): string => { const p = new URL(l.url).pathname; return p === '/' ? '/index.html' : p; };
      const parLaPage = new Set(m.livre.lignes.filter((l) => !l.duTravailleur && l.compte !== 'from the worker\'s cache').map(chemin));
      const total = duTravailleur.reduce((s, l) => s + l.octets, 0);
      const deuxFois = duTravailleur.filter((l) => parLaPage.has(chemin(l)));
      const doublon = deuxFois.reduce((s, l) => s + l.octets, 0);
      dire(`  the install, MEASURED: ${n(total)} B in ${duTravailleur.length} requests, on top of the page:`);
      for (const l of duTravailleur) {
        const note = l.compte === 'no size reported' && l.url.endsWith('/sw.js')
          ? `no size reported; the built file is ${n(gzipSync(readFileSync(join(DIST, 'sw.js')), { level: 9 }).length)} B at gzip-9 — computed, not measured`
          : parLaPage.has(chemin(l)) ? `${l.compte}; the page had already fetched it` : l.compte;
        dire(`    ${l.genre.padEnd(8)} ${n(l.octets).padStart(9)} B  ${String(l.statut).padEnd(3)} ${etiquette(l)}  [${note}]`);
      }
      dire(`  of which fetched twice in this harness: ${n(doublon)} B in ${deuxFois.length} files. On a phone the worker asks the entry script`);
      dire('  without `no-cache`, so the phone\'s own cache answers it, and it revalidates index.html and the faces already drawn');
      dire(`  (a 304 when the host sends a validator). What the install adds that the page had not fetched: ${n(total - doublon)} B (derived from the lines above).`);
      const depuisLeCache = new Set(m.livre.lignes.filter((l) => l.compte === 'from the worker\'s cache').map(chemin));
      const prises = duTravailleur.filter((l) => !parLaPage.has(chemin(l)) && depuisLeCache.has(chemin(l)));
      const prisesOctets = prises.reduce((s, l) => s + l.octets, 0);
      dire(`  Of that, ${n(prisesOctets)} B are ${prises.length} faces the page then drew from the worker's cache (without the worker it fetches them itself);`);
      dire(`  the rest, ${n(total - doublon - prisesOctets)} B, is what the worker costs a first visit beyond the page — faces not drawn, icons, manifest —`);
      dire('  plus its own script, whose size the harness does not report (see its line).');
    } else {
      let total = 0;
      for (const f of precache) {
        const brut = readFileSync(join(DIST, f));
        total += /\.(woff2|png)$/.test(f) ? brut.length : gzipSync(brut, { level: 9 }).length;
      }
      dire(`  the harness did not see ${manquants.length} of the worker's fetches (${manquants.join(', ')})`);
      dire(`  the install, COMPUTED, NOT MEASURED, from the built files (text gzip-9, fonts and icons raw): ${n(total)} B for ${precache.length} files`);
    }
    detail(m);
  });
});
