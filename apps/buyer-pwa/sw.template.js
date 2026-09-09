/**
 * ═══ LA COQUILLE HORS LIGNE — the buyer PWA app-shell service worker ═══
 * COQUILLE-HORS-LIGNE-1 (AUDIT-SHOP-1 slice d, MAJOR 3). Law 7: offline-first.
 *
 * Before this worker, an installed PWA cold-opened without network was the
 * browser's own error page. Now the shell — index.html, the ENTRY chunks, the
 * Faso Premium faces, the manifest and its icons — is cached at first visit,
 * and answers only when the network has already failed:
 *
 *   · NAVIGATIONS are NETWORK-FIRST. Online behaviour is byte-identical to
 *     before this worker existed; the cache speaks only on a network failure.
 *   · A failed ROOT navigation is served the cached shell.
 *   · A failed DEEP navigation (/v/{slug}, /s/{slug}…) is redirected to the
 *     root with the same `?/` encoding public/404.html uses online, so the
 *     restore script and its <base> pin run identically on and off line —
 *     serving index.html AT the deep path would re-root './assets/*' and the
 *     app would never boot (the BUG 2 lesson, replayed).
 *   · Hashed assets and fonts are cache-first (content-addressed, immutable
 *     by name); everything else — cross-origin, the storefront service, POSTs
 *     — is NEVER touched: no respondWith, the browser behaves as if no worker
 *     existed. The worker holds no app logic, no money logic, no state beyond
 *     the file cache; « queued = pending » is never implicated because nothing
 *     is queued.
 *
 * SW-PRECACHE-1 (AUDIT-SHOP-2 F-23) — WHAT IS PRECACHED, AND WHAT WAITS.
 * The install used to fetch every `assets/*` chunk — the twenty-odd header
 * styles behind dynamic import(), ≈ 105 KB gzip a buyer never draws (a shop
 * wears ONE header) — and re-downloaded all nine faces (177 KB) on every
 * deploy. Now:
 *   · The precache is the ENTRY GRAPH (what index.html references) plus the
 *     manifest, the icons and the faces. The faces stay precached on purpose:
 *     every one is `font-display: optional`, which uses a face only if it is
 *     already at hand when the page paints — a face that is not cached before
 *     first paint is a face no buyer ever sees.
 *   · A LAZY chunk (any other `assets/*`) is cached ON FIRST USE: the first
 *     shop that wears « pagne » fetches its chunk once, and from then on that
 *     header draws offline too — across redeploys as well, because activate
 *     copies the outgoing version's content-addressed entries forward before
 *     deleting it. Only content-addressed names are cached this way — a
 *     chunk's bytes can never change under its name.
 *   · Fixed-name files (index.html, the manifest, the icons, the faces) are
 *     fetched with `cache: 'no-cache'`: the browser REVALIDATES with the
 *     origin (a conditional request, a 304 when unchanged) instead of
 *     re-downloading. The HTTP cache can still never seed a new worker with
 *     old bytes — the origin is asked every time — but unchanged bytes cost a
 *     header, not a transfer.
 *   · The version is a hash over EVERY file the worker may ever serve (the
 *     lazy chunks and the faces included, precached or not), so a re-subset
 *     face or a changed chunk is a new version and a fresh cache; nothing
 *     fixed-name is ever copied forward across versions.
 *
 * This file is a TEMPLATE: vite.config.ts fills the two placeholders below —
 * the version (a hash over the served bytes) and the precache list (the
 * built files) — into dist/sw.js at the end of every build. The placeholder
 * names appear NOWHERE else in this file: the plugin's replace() takes the
 * first occurrence, and a mention in this comment once swallowed it, shipping
 * a worker that failed evaluation. It ships as a classic script at the app
 * root, so its scope is the deploy base (/shop-plus/ on Pages, / locally) by
 * construction.
 */

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const EN_PRECACHE = new Set(PRECACHE);
const CACHE = `coquille-shop-plus-${VERSION}`;
const RACINE = new URL('./', self.location.href);

/**
 * ONLY vite-hashed names are content-addressed — those bytes can never change
 * under an unchanged name, so they may be copied forward across versions and
 * cached on first use. The fonts are the counter-example the verifier caught:
 * fixed human names over charset SUBSETS, the one kind of file whose bytes
 * change under the same name (re-subsetting when coverage grows) — copied
 * forward, a stale face would have been pinned on installed phones forever.
 * Fixed-name files therefore live only in their own version's cache, and are
 * revalidated with the origin at install.
 */
function contenuAdresse(chemin) {
  return chemin.startsWith('assets/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacher());
});

async function precacher() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    PRECACHE.map(async (chemin) => {
      const url = new URL(chemin, RACINE);
      if (contenuAdresse(chemin)) {
        // A redeploy re-downloads only what actually changed: an unchanged
        // vite-hashed file is copied from the previous version's cache.
        const deja = await caches.match(url.href);
        if (deja !== undefined) {
          await cache.put(url.href, deja);
          return;
        }
      }
      // cache:'no-cache' on every fixed-name file: revalidate with the origin
      // (304 when unchanged) — never a stale HTTP-cache seed, never a full
      // re-download of bytes the origin says are the same.
      const reponse = await fetch(url.href, contenuAdresse(chemin) ? undefined : { cache: 'no-cache' });
      if (!reponse.ok) throw new Error(`précache ${chemin}: ${reponse.status}`);
      await cache.put(url.href, reponse.clone());
      // The shell also answers the root URL itself (…/ and …/?/v/… restores).
      if (chemin === 'index.html') await cache.put(RACINE.href, reponse.clone());
    }),
  );
  await self.skipWaiting();
}

self.addEventListener('activate', (event) => {
  event.waitUntil(activer());
});

async function activer() {
  const noms = await caches.keys();
  const anciens = noms.filter((nom) => nom.startsWith('coquille-shop-plus-') && nom !== CACHE);
  // A header chunk kept on first use survives a redeploy: the outgoing
  // version's content-addressed entries are copied into this one before it
  // is deleted (their bytes can never change under their names). Fixed-name
  // files are never copied — see contenuAdresse.
  const cache = await caches.open(CACHE);
  for (const nom of anciens) {
    const ancien = await caches.open(nom);
    for (const requete of await ancien.keys()) {
      const url = new URL(requete.url);
      if (!contenuAdresse(url.pathname.slice(RACINE.pathname.length))) continue;
      if ((await cache.match(url.href)) !== undefined) continue;
      const reponse = await ancien.match(requete);
      if (reponse !== undefined) await cache.put(url.href, reponse);
    }
  }
  await Promise.all(anciens.map((nom) => caches.delete(nom)));
  await self.clients.claim();
}

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== RACINE.origin || !url.pathname.startsWith(RACINE.pathname)) return;

  if (requete.mode === 'navigate') {
    event.respondWith(naviguer(requete, url));
    return;
  }

  const chemin = url.pathname.slice(RACINE.pathname.length);
  // Cache-first for what THIS version precached, and for every content-
  // addressed chunk (cached on first use): activate pruned the older caches,
  // so a match can only be this version's own bytes.
  if (contenuAdresse(chemin) || (chemin !== 'index.html' && EN_PRECACHE.has(chemin))) {
    event.respondWith(depuisCacheDabord(requete, url, contenuAdresse(chemin)));
  }
  // Anything else in scope stays the browser's own business.
});

async function depuisCacheDabord(requete, url, garderAuPassage) {
  const en_cache = await caches.match(url.href);
  if (en_cache !== undefined) return en_cache;
  const reponse = await fetch(requete);
  // SW-PRECACHE-1 — a lazy chunk is kept the first time it is drawn. Only a
  // content-addressed name may be kept this way (see contenuAdresse), and
  // only a good answer: a 404 or a proxy page must never be pinned.
  if (garderAuPassage && reponse.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(url.href, reponse.clone());
  }
  return reponse;
}

async function naviguer(requete, url) {
  try {
    return await fetch(requete);
  } catch (erreur) {
    if (url.pathname !== RACINE.pathname) {
      // The 404.html road, replayed offline — same `?/` and `~and~` encoding,
      // so the shell's restore script sees exactly what Pages sends it online.
      const reste = url.pathname.slice(RACINE.pathname.length).replace(/&/g, '~and~');
      const recherche = url.search ? `&${url.search.slice(1).replace(/&/g, '~and~')}` : '';
      return Response.redirect(new URL(`?/${reste}${recherche}`, RACINE).href, 302);
    }
    const coquille = await caches.match(RACINE.href);
    if (coquille !== undefined) return coquille;
    throw erreur;
  }
}
