/**
 * ═══ LA COQUILLE HORS LIGNE — the buyer PWA app-shell service worker ═══
 * COQUILLE-HORS-LIGNE-1 (AUDIT-SHOP-1 slice d, MAJOR 3). Law 7: offline-first.
 *
 * Before this worker, an installed PWA cold-opened without network was the
 * browser's own error page. Now the shell — index.html, the hashed asset
 * chunks, the Faso Premium faces, the manifest — is cached at first visit,
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
 * This file is a TEMPLATE: vite.config.ts fills the two placeholders below —
 * the version (a hash over the precached bytes) and the precache list (the
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
 * under an unchanged name, so they may be copied forward across versions. The
 * fonts are the counter-example the verifier caught: fixed human names over
 * charset SUBSETS, the one kind of file whose bytes change under the same
 * name (re-subsetting when coverage grows) — copied forward, a stale face
 * would have been pinned on installed phones forever, cache-first hiding it
 * even online. Fonts therefore re-download with each new version (nine small
 * woff2s), never crossing versions.
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
      // cache:'reload' on every fixed-name file (index.html, the manifest,
      // the fonts) so the HTTP cache can never seed a new worker version
      // with old bytes.
      const reponse = await fetch(url.href, contenuAdresse(chemin) ? undefined : { cache: 'reload' });
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
  await Promise.all(
    noms
      .filter((nom) => nom.startsWith('coquille-shop-plus-') && nom !== CACHE)
      .map((nom) => caches.delete(nom)),
  );
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
  // Cache-first for exactly what THIS version precached: activate pruned the
  // older caches, so a match can only be this version's own bytes.
  if (chemin !== 'index.html' && EN_PRECACHE.has(chemin)) {
    event.respondWith(depuisCacheDabord(requete, url));
  }
  // Anything else in scope stays the browser's own business.
});

async function depuisCacheDabord(requete, url) {
  const en_cache = await caches.match(url.href);
  return en_cache ?? fetch(requete);
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
