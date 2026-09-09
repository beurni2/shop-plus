import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { precacheEtVersion } from '../vite.config';

/**
 * ═══ COQUILLE-HORS-LIGNE-1 — the worker's own roads, driven deterministically ═══
 *
 * The cold-offline walk (e2e/hors-ligne.spec.ts) proves the USER truth on the
 * real bundle — but it cannot tell the redirect road from Chromium's own
 * response-URL resolution: with the redirect deleted, Chromium still resolves
 * './assets/*' against the CACHED response's URL and the vitrine boots anyway,
 * so the M2 mutation survives the walk honestly (the slice-b M4 precedent).
 * The redirect road is kept because it is the ONE road that replays the
 * production 404.html semantics — a plain 302 and a normal load, with no bet
 * on how OTHER engines resolve a navigation served from a foreign-URL cache
 * entry — and THIS file is its deterministic kill: it evaluates the shipped
 * template exactly as the build does and drives the fetch handler directly.
 *
 * SW-PRECACHE-1 (AUDIT-SHOP-2 F-23) adds the install and first-use roads: the
 * precache is the entry graph, fixed-name files revalidate (`no-cache`) rather
 * than re-download, and a content-addressed chunk is kept the first time it
 * is drawn.
 *
 * THE DOUBLES' BOUNDS, stated: only the SW PLATFORM GLOBALS are stood in
 * (self, caches, fetch — the native boundary; URL and Response are Node's own
 * real implementations). No app code is stubbed and nothing here claims
 * anything about appearance or about the browser's navigation pipeline — that
 * stays with the walk.
 */

const RACINE = 'https://h.example/shop-plus/';

type Gestionnaire = (event: unknown) => void;

function evaluerTemplate(options: {
  fetchEchoue: boolean;
  enCache: Map<string, Response>;
  precache?: string[];
  reponseReseau?: (url: string) => Response;
}) {
  const source = readFileSync(resolve(__dirname, '../sw.template.js'), 'utf8')
    .replace("'__VERSION__'", "'test-version'")
    .replace('__PRECACHE__', JSON.stringify(options.precache ?? []));
  const gestionnaires = new Map<string, Gestionnaire>();
  const puts: string[] = [];
  const appelsFetch: Array<{ url: string; init: RequestInit | undefined }> = [];
  const self = {
    location: { href: `${RACINE}sw.js` },
    addEventListener: (nom: string, g: Gestionnaire) => gestionnaires.set(nom, g),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const caches = {
    match: async (cle: string) => options.enCache.get(cle),
    open: async () => ({
      put: async (cle: string, reponse: Response) => {
        puts.push(cle);
        options.enCache.set(cle, reponse);
      },
    }),
    keys: async () => [],
    delete: async () => true,
  };
  const fetchDouble = async (entree: string | { url: string }, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree.url;
    appelsFetch.push({ url, init });
    if (options.fetchEchoue) throw new TypeError('Failed to fetch');
    return options.reponseReseau !== undefined ? options.reponseReseau(url) : new Response('reseau');
  };
  new Function('self', 'caches', 'fetch', source)(self, caches, fetchDouble);
  return { gestionnaires, puts, appelsFetch };
}

function requeteNavigation(url: string) {
  let promesse: Promise<Response> | undefined;
  const event = {
    request: { method: 'GET', url, mode: 'navigate' },
    respondWith: (p: Promise<Response>) => {
      promesse = p;
    },
  };
  return { event, reponse: () => promesse };
}

function requeteRessource(url: string) {
  let promesse: Promise<Response> | undefined;
  const event = {
    request: { method: 'GET', url, mode: 'cors' },
    respondWith: (p: Promise<Response>) => {
      promesse = p;
    },
  };
  return { event, reponse: () => promesse };
}

describe('la coquille hors ligne — le routeur du worker', () => {
  it("une navigation profonde qui échoue est REDIRIGÉE vers la racine avec l'encodage exact de 404.html (`?/` + `~and~`)", async () => {
    const { gestionnaires: g } = evaluerTemplate({ fetchEchoue: true, enCache: new Map() });
    const { event, reponse } = requeteNavigation(`${RACINE}v/aicha-4821?x=1&y=2`);
    g.get('fetch')!(event);
    const res = await reponse()!;
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${RACINE}?/v/aicha-4821&x=1~and~y=2`);
  });

  it('une navigation racine qui échoue est servie la coquille en cache, jamais une redirection', async () => {
    const coquille = new Response('coquille');
    const { gestionnaires: g } = evaluerTemplate({ fetchEchoue: true, enCache: new Map([[RACINE, coquille]]) });
    const { event, reponse } = requeteNavigation(RACINE);
    g.get('fetch')!(event);
    expect(await reponse()!).toBe(coquille);
  });

  it('en ligne, une navigation est réseau-d’abord : la réponse du réseau passe telle quelle', async () => {
    const { gestionnaires: g } = evaluerTemplate({ fetchEchoue: false, enCache: new Map([[RACINE, new Response('coquille')]]) });
    const { event, reponse } = requeteNavigation(`${RACINE}v/aicha-4821`);
    g.get('fetch')!(event);
    expect(await (await reponse()!).text()).toBe('reseau');
  });

  it('hors périmètre, le worker ne répond JAMAIS : POST, autre origine, et un chemin hors base restent au navigateur', () => {
    const { gestionnaires: g } = evaluerTemplate({ fetchEchoue: true, enCache: new Map() });
    for (const request of [
      { method: 'POST', url: `${RACINE}listes`, mode: 'cors' },
      { method: 'GET', url: 'https://ailleurs.example/x', mode: 'no-cors' },
      { method: 'GET', url: 'https://h.example/autre/chemin', mode: 'navigate' },
    ]) {
      let repondu = false;
      g.get('fetch')!({ request, respondWith: () => (repondu = true) });
      expect(repondu, `${request.method} ${request.url}`).toBe(false);
    }
  });
});

describe('SW-PRECACHE-1 — l’installation : la trame d’entrée, revalidée, jamais retéléchargée pour rien', () => {
  it('un fichier à nom fixe est demandé avec cache:no-cache (revalidation, 304 si inchangé) ; un chunk adressé par contenu sans option', async () => {
    const { gestionnaires: g, appelsFetch, puts } = evaluerTemplate({
      fetchEchoue: false,
      enCache: new Map(),
      precache: ['index.html', 'fonts/Bricolage-Bold.woff2', 'assets/index-abc.js', 'icons/icon-192.png'],
    });
    let attendu: Promise<unknown> | undefined;
    g.get('install')!({ waitUntil: (p: Promise<unknown>) => { attendu = p; } });
    await attendu;
    const init = (chemin: string) => appelsFetch.find((a) => a.url === `${RACINE}${chemin}`)?.init;
    expect(init('index.html')).toEqual({ cache: 'no-cache' });
    expect(init('fonts/Bricolage-Bold.woff2')).toEqual({ cache: 'no-cache' });
    expect(init('icons/icon-192.png')).toEqual({ cache: 'no-cache' });
    expect(init('assets/index-abc.js')).toBeUndefined();
    // never the old `reload`: that was the full re-download of every face on every deploy
    expect(appelsFetch.some((a) => (a.init as { cache?: string } | undefined)?.cache === 'reload')).toBe(false);
    // the shell also answers the root URL itself
    expect(puts).toContain(RACINE);
    expect(puts).toContain(`${RACINE}index.html`);
  });

  it('un chunk adressé par contenu déjà présent dans l’ancien cache est COPIÉ, jamais refetché ; un fichier à nom fixe ne l’est jamais', async () => {
    const enCache = new Map<string, Response>([
      [`${RACINE}assets/index-abc.js`, new Response('ancien chunk')],
      [`${RACINE}fonts/Bricolage-Bold.woff2`, new Response('ancienne face')],
    ]);
    const { gestionnaires: g, appelsFetch } = evaluerTemplate({
      fetchEchoue: false,
      enCache,
      precache: ['assets/index-abc.js', 'fonts/Bricolage-Bold.woff2'],
    });
    let attendu: Promise<unknown> | undefined;
    g.get('install')!({ waitUntil: (p: Promise<unknown>) => { attendu = p; } });
    await attendu;
    expect(appelsFetch.map((a) => a.url)).toEqual([`${RACINE}fonts/Bricolage-Bold.woff2`]);
  });
});

describe('SW-PRECACHE-1 — un chunk paresseux est gardé au premier usage ; le reste ne l’est jamais', () => {
  it('assets/pagne-x.js hors précache : réseau puis cache.put ; la seconde demande vient du cache sans réseau', async () => {
    const enCache = new Map<string, Response>();
    const { gestionnaires: g, appelsFetch, puts } = evaluerTemplate({ fetchEchoue: false, enCache, precache: ['assets/index-abc.js'] });
    const url = `${RACINE}assets/pagne-BoV2a2bb.js`;
    const premiere = requeteRessource(url);
    g.get('fetch')!(premiere.event);
    expect(await (await premiere.reponse()!).text()).toBe('reseau');
    expect(appelsFetch.map((a) => a.url)).toEqual([url]);
    expect(puts).toEqual([url]);

    const seconde = requeteRessource(url);
    g.get('fetch')!(seconde.event);
    await seconde.reponse()!;
    expect(appelsFetch.length, 'the second draw of the same header costs no network').toBe(1);
  });

  it('une réponse qui n’est pas ok (404, page de proxy) n’est JAMAIS épinglée', async () => {
    const enCache = new Map<string, Response>();
    const { gestionnaires: g, puts } = evaluerTemplate({
      fetchEchoue: false,
      enCache,
      reponseReseau: () => new Response('absent', { status: 404 }),
    });
    const { event, reponse } = requeteRessource(`${RACINE}assets/pagne-BoV2a2bb.js`);
    g.get('fetch')!(event);
    expect((await reponse()!).status).toBe(404);
    expect(puts).toEqual([]);
  });

  it('un fichier à nom fixe hors précache (une face inconnue) reste au navigateur ; une face précachée est cache-d’abord sans put au passage', async () => {
    const enCache = new Map<string, Response>();
    const { gestionnaires: g, puts, appelsFetch } = evaluerTemplate({ fetchEchoue: false, enCache, precache: ['fonts/Sora-ExtraBold.woff2'] });
    let repondu = false;
    g.get('fetch')!({ request: { method: 'GET', url: `${RACINE}fonts/Inconnue.woff2`, mode: 'cors' }, respondWith: () => (repondu = true) });
    expect(repondu).toBe(false);

    const { event, reponse } = requeteRessource(`${RACINE}fonts/Sora-ExtraBold.woff2`);
    g.get('fetch')!(event);
    expect(await (await reponse()!).text()).toBe('reseau');
    expect(appelsFetch.map((a) => a.url)).toEqual([`${RACINE}fonts/Sora-ExtraBold.woff2`]);
    // a fixed name is never kept at runtime — its bytes may change under that name
    expect(puts).toEqual([]);
  });
});

describe('SW-PRECACHE-1 — la liste de précache est la trame d’entrée, la version hache tout ce qui peut être servi', () => {
  function distFactice(): string {
    const dist = mkdtempSync(join(tmpdir(), 'coquille-'));
    mkdirSync(join(dist, 'assets'));
    mkdirSync(join(dist, 'fonts'));
    mkdirSync(join(dist, 'icons'));
    writeFileSync(join(dist, 'index.html'), '<script type="module" crossorigin src="./assets/index-abc.js"></script><link rel="stylesheet" href="./assets/index-def.css">');
    writeFileSync(join(dist, 'manifest.webmanifest'), '{}');
    writeFileSync(join(dist, 'assets', 'index-abc.js'), 'entree');
    writeFileSync(join(dist, 'assets', 'index-def.css'), 'style');
    writeFileSync(join(dist, 'assets', 'pagne-xyz.js'), 'paresseux');
    writeFileSync(join(dist, 'fonts', 'Sora-ExtraBold.woff2'), 'face');
    writeFileSync(join(dist, 'fonts', 'OFL-Sora.txt'), 'licence');
    writeFileSync(join(dist, 'icons', 'icon-192.png'), 'png');
    return dist;
  }

  it('précache = index + manifest + trame d’entrée + faces + icônes ; le chunk paresseux et la licence n’y sont pas', () => {
    const { fichiers } = precacheEtVersion(distFactice());
    expect(fichiers).toEqual([
      'assets/index-abc.js',
      'assets/index-def.css',
      'fonts/Sora-ExtraBold.woff2',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('un chunk paresseux ou une face qui change roule la version même s’il n’est pas précaché', () => {
    const dist = distFactice();
    const avant = precacheEtVersion(dist).version;
    writeFileSync(join(dist, 'assets', 'pagne-xyz.js'), 'paresseux, autre');
    const apresChunk = precacheEtVersion(dist).version;
    expect(apresChunk).not.toBe(avant);
    writeFileSync(join(dist, 'fonts', 'Sora-ExtraBold.woff2'), 'face re-subset');
    expect(precacheEtVersion(dist).version).not.toBe(apresChunk);
    // and an unchanged tree is the same version (installed phones never re-download an identical shell)
    expect(precacheEtVersion(dist).version).toBe(precacheEtVersion(dist).version);
  });
});
