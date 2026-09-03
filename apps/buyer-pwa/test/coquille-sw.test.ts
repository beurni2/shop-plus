import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
 * THE DOUBLES' BOUNDS, stated: only the SW PLATFORM GLOBALS are stood in
 * (self, caches, fetch — the native boundary; URL and Response are Node's own
 * real implementations). No app code is stubbed and nothing here claims
 * anything about appearance or about the browser's navigation pipeline — that
 * stays with the walk.
 */

const RACINE = 'https://h.example/shop-plus/';

type Gestionnaire = (event: unknown) => void;

function evaluerTemplate(options: { fetchEchoue: boolean; enCache: Map<string, Response> }) {
  const source = readFileSync(resolve(__dirname, '../sw.template.js'), 'utf8')
    .replace("'__VERSION__'", "'test-version'")
    .replace('__PRECACHE__', '[]');
  const gestionnaires = new Map<string, Gestionnaire>();
  const self = {
    location: { href: `${RACINE}sw.js` },
    addEventListener: (nom: string, g: Gestionnaire) => gestionnaires.set(nom, g),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const caches = {
    match: async (cle: string) => options.enCache.get(cle),
    open: async () => ({ put: async () => undefined }),
    keys: async () => [],
    delete: async () => true,
  };
  const fetchDouble = async () => {
    if (options.fetchEchoue) throw new TypeError('Failed to fetch');
    return new Response('reseau');
  };
  new Function('self', 'caches', 'fetch', source)(self, caches, fetchDouble);
  return gestionnaires;
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

describe('la coquille hors ligne — le routeur du worker', () => {
  it("une navigation profonde qui échoue est REDIRIGÉE vers la racine avec l'encodage exact de 404.html (`?/` + `~and~`)", async () => {
    const g = evaluerTemplate({ fetchEchoue: true, enCache: new Map() });
    const { event, reponse } = requeteNavigation(`${RACINE}v/aicha-4821?x=1&y=2`);
    g.get('fetch')!(event);
    const res = await reponse()!;
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${RACINE}?/v/aicha-4821&x=1~and~y=2`);
  });

  it('une navigation racine qui échoue est servie la coquille en cache, jamais une redirection', async () => {
    const coquille = new Response('coquille');
    const g = evaluerTemplate({ fetchEchoue: true, enCache: new Map([[RACINE, coquille]]) });
    const { event, reponse } = requeteNavigation(RACINE);
    g.get('fetch')!(event);
    expect(await reponse()!).toBe(coquille);
  });

  it('en ligne, une navigation est réseau-d’abord : la réponse du réseau passe telle quelle', async () => {
    const g = evaluerTemplate({ fetchEchoue: false, enCache: new Map([[RACINE, new Response('coquille')]]) });
    const { event, reponse } = requeteNavigation(`${RACINE}v/aicha-4821`);
    g.get('fetch')!(event);
    expect(await (await reponse()!).text()).toBe('reseau');
  });

  it('hors périmètre, le worker ne répond JAMAIS : POST, autre origine, et un chemin hors base restent au navigateur', () => {
    const g = evaluerTemplate({ fetchEchoue: true, enCache: new Map() });
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
