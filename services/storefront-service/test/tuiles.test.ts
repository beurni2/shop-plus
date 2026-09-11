import { describe, expect, it } from 'vitest';
import {
  TUILES_AMONT,
  TUILES_CACHE_S,
  TUILES_USER_AGENT,
  TUILES_ZOOM,
  lireCheminTuile,
  servirTuile,
  urlAmont,
  type CacheTuiles,
} from '../src/tuiles';

/**
 * TUILES-PROXY (AUDIT-SHOP-2 F-24) — the buyer's map tiles come through THIS
 * Worker, never straight from OpenStreetMap: a direct ask sent her area
 * (~300 m at z17) and her IP to a third party under a sentence that promised
 * the point to her rider alone, and OSM's tile policy forbids an app loading
 * their tiles with no identifying User-Agent. This file holds the pure rules
 * (the path the map may ask for, the upstream shape) and drives `servirTuile`
 * with an in-memory cache and a scripted upstream; the REAL bundle on
 * miniflare, with the workerd cache and the outbound seam, is
 * `tuiles.e2e.test.ts`.
 */

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);

function cacheMemoire(): CacheTuiles & { readonly cles: string[] } {
  const store = new Map<string, { status: number; headers: [string, string][]; body: Uint8Array }>();
  const cles: string[] = [];
  return {
    cles,
    async match(key) {
      const hit = store.get(key.url);
      if (hit === undefined) return undefined;
      return new Response(hit.body, { status: hit.status, headers: hit.headers });
    },
    async put(key, res) {
      cles.push(key.url);
      store.set(key.url, { status: res.status, headers: [...res.headers], body: new Uint8Array(await res.arrayBuffer()) });
    },
  };
}

function amontScripte(reponse: () => Response | Promise<Response>): { fetch: typeof fetch; appels: Request[] } {
  const appels: Request[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    appels.push(new Request(input, init));
    return reponse();
  }) as typeof fetch;
  return { fetch: f, appels };
}

const ok = (): Response =>
  new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' } });

describe('TUILES-PROXY — the path the buyer map may ask for', () => {
  it('accepts the map’s ONE zoom with in-range integers, and nothing else', () => {
    expect(TUILES_ZOOM).toBe(17);
    expect(lireCheminTuile('/tiles/17/65432/32109.png')).toEqual({ z: 17, x: 65432, y: 32109 });
    expect(lireCheminTuile('/tiles/17/0/0.png')).toEqual({ z: 17, x: 0, y: 0 });
    expect(lireCheminTuile('/tiles/17/131071/131071.png')).toEqual({ z: 17, x: 131071, y: 131071 });
    for (const mauvais of [
      '/tiles/16/1/1.png', // not the map's zoom — an open zoom would make this a general-purpose tile CDN
      '/tiles/18/1/1.png',
      '/tiles/17/131072/1.png', // = 2^17: off the globe
      '/tiles/17/1/131072.png',
      '/tiles/17/-1/1.png',
      '/tiles/17/1.5/1.png',
      '/tiles/17/1/1.jpg',
      '/tiles/17/1/1',
      '/tiles/17/1/1.png/',
      '/tiles/17/1/1/1.png',
      '/tiles/17/1/0001.png', // leading zeros would make two urls for one tile
      '/tiles//17/1/1.png',
      '/tiles/17/1/1.PNG',
      '/tuiles/17/1/1.png',
    ]) {
      expect(lireCheminTuile(mauvais), mauvais).toBeNull();
    }
  });

  it('the upstream url is the tile host’s canonical shape, and the identity we present is ours', () => {
    expect(TUILES_AMONT).toBe('https://tile.openstreetmap.org');
    expect(urlAmont({ z: 17, x: 1, y: 2 })).toBe('https://tile.openstreetmap.org/17/1/2.png');
    expect(TUILES_USER_AGENT).toMatch(/^Shop\+ /);
    expect(TUILES_USER_AGENT).toContain('beurni2.github.io/shop-plus');
  });
});

describe('servirTuile — read-only, our identity upstream, cached at the edge, honest on failure', () => {
  const GET = (path: string, headers: Record<string, string> = {}): Request =>
    new Request(`https://svc${path}`, { method: 'GET', headers });

  it('a miss asks the tile host ONCE, as us — none of her request rides along — and stores the copy', async () => {
    const cache = cacheMemoire();
    const amont = amontScripte(ok);
    const res = await servirTuile(
      GET('/tiles/17/65432/32109.png', {
        Cookie: 'sp=1',
        Referer: 'https://beurni2.github.io/shop-plus/',
        'X-Forwarded-For': '203.0.113.9',
        Authorization: 'Bearer nope',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 9)',
      }),
      { fetch: amont.fetch, cache },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Cache-Control')).toBe(`public, max-age=${TUILES_CACHE_S}`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);

    expect(amont.appels).toHaveLength(1);
    const asked = amont.appels[0]!;
    expect(asked.url).toBe('https://tile.openstreetmap.org/17/65432/32109.png');
    expect(asked.method).toBe('GET');
    expect(asked.headers.get('User-Agent')).toBe(TUILES_USER_AGENT);
    for (const jamais of ['Cookie', 'Referer', 'X-Forwarded-For', 'Authorization', 'CF-Connecting-IP']) {
      expect(asked.headers.get(jamais), `${jamais} rode upstream`).toBeNull();
    }
    expect(cache.cles).toEqual(['https://tile.openstreetmap.org/17/65432/32109.png']);
  });

  it('a hit never reaches the tile host', async () => {
    const cache = cacheMemoire();
    const amont = amontScripte(ok);
    await servirTuile(GET('/tiles/17/1/2.png'), { fetch: amont.fetch, cache });
    const encore = await servirTuile(GET('/tiles/17/1/2.png'), { fetch: amont.fetch, cache });
    expect(encore.status).toBe(200);
    expect(new Uint8Array(await encore.arrayBuffer())).toEqual(PNG);
    expect(amont.appels).toHaveLength(1);
  });

  it('a path outside the map’s shape is 404 by name, and the tile host is never asked', async () => {
    const cache = cacheMemoire();
    const amont = amontScripte(ok);
    for (const p of ['/tiles/16/1/1.png', '/tiles/17/131072/1.png', '/tiles/17/1/1.jpg']) {
      const res = await servirTuile(GET(p), { fetch: amont.fetch, cache });
      expect(res.status, p).toBe(404);
      expect(await res.json()).toEqual({ error: 'tile_not_found' });
    }
    expect(amont.appels).toHaveLength(0);
    expect(cache.cles).toEqual([]);
  });

  it('only GET and HEAD: a write is 405 with the allowed methods named, and the tile host is never asked', async () => {
    const cache = cacheMemoire();
    const amont = amontScripte(ok);
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const res = await servirTuile(new Request('https://svc/tiles/17/1/1.png', { method }), { fetch: amont.fetch, cache });
      expect(res.status, method).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET, HEAD');
    }
    expect(amont.appels).toHaveLength(0);
    const head = await servirTuile(new Request('https://svc/tiles/17/1/1.png', { method: 'HEAD' }), { fetch: amont.fetch, cache });
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Type')).toBe('image/png');
    expect(await head.text()).toBe('');
  });

  it('an upstream that fails is 502 by name, NOT cached — the next ask tries the host again', async () => {
    const cache = cacheMemoire();
    let etat: 'panne' | 'ok' = 'panne';
    const amont = amontScripte(() => (etat === 'panne' ? new Response('boom', { status: 500 }) : ok()));
    const panne = await servirTuile(GET('/tiles/17/3/4.png'), { fetch: amont.fetch, cache });
    expect(panne.status).toBe(502);
    expect(await panne.json()).toEqual({ error: 'tile_upstream' });
    expect(cache.cles).toEqual([]);
    etat = 'ok';
    const retour = await servirTuile(GET('/tiles/17/3/4.png'), { fetch: amont.fetch, cache });
    expect(retour.status).toBe(200);
    expect(amont.appels).toHaveLength(2);
  });

  it('an upstream that cannot be reached at all (throw, timeout) is the same 502, never a crash', async () => {
    const cache = cacheMemoire();
    const amont = amontScripte(() => {
      throw new TypeError('fetch failed');
    });
    const res = await servirTuile(GET('/tiles/17/3/4.png'), { fetch: amont.fetch, cache });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'tile_upstream' });
  });
});
