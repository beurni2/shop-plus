import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TUILES_CACHE_S, TUILES_USER_AGENT } from '../src/tuiles';

/**
 * ═══ TUILES-PROXY (AUDIT-SHOP-2 F-24) — THE SEAM, ON THE REAL BUNDLE ═══
 *
 * The buyer's map asks `GET /tiles/17/{x}/{y}.png` on THIS Worker. What must
 * be true, and is asked here of the built combined Worker on miniflare — the
 * workerd Cache API, the composition root's own gates, and the ONE outbound
 * seam (`outboundService`: every `fetch()` the Worker makes lands in the
 * scripted tile host below, which records exactly what reached it):
 *
 *   · a buyer holds no key and needs none: the route answers above the write
 *     gate, to a bare GET;
 *   · what reaches OpenStreetMap is OUR request — our User-Agent (their
 *     policy), the tile's coordinates — and nothing of hers: not her cookie,
 *     not her referer, not her address, not a bearer she happened to carry;
 *   · the second ask for the same tile is served from the edge cache and never
 *     reaches the host;
 *   · a path outside the map's one zoom and range is 404 by name, a write is
 *     405, and neither reaches the host;
 *   · a failing host is 502 by name and NOT cached — the next ask tries again.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);

const amont: { url: string; method: string; headers: Record<string, string> }[] = [];
let etatAmont: 'ok' | 'panne' = 'ok';

const persist = mkdtempSync(join(tmpdir(), 'tuiles-proxy-'));
const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
    DLQ: 'DeadLetterDO',
  },
  durableObjectsPersist: persist,
  bindings: {},
  // THE SCRIPTED TILE HOST — every outbound fetch of the Worker lands here.
  outboundService: async (req: Request): Promise<Response> => {
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    amont.push({ url: req.url, method: req.method, headers });
    if (etatAmont === 'panne') return new Response('boom', { status: 500 });
    return new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' } });
  },
});

beforeAll(async () => {
  await mf.ready;
});

afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const tuile = (path: string, init: RequestInit = {}): Promise<Response> => mf.dispatchFetch(`https://svc${path}`, init);

describe('TUILES-PROXY — the real Worker serves the buyer’s tiles as itself', () => {
  it('a bare GET (no key, no session) is served, and what reached the tile host is OUR request with nothing of hers', async () => {
    const res = await tuile('/tiles/17/65432/32109.png', {
      headers: {
        Cookie: 'sp=1',
        Referer: 'https://beurni2.github.io/shop-plus/',
        'X-Forwarded-For': '203.0.113.9',
        Authorization: 'Bearer nope',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 9; 1 GB)',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe(`public, max-age=${TUILES_CACHE_S}`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);

    expect(amont).toHaveLength(1);
    const asked = amont[0]!;
    expect(asked.url).toBe('https://tile.openstreetmap.org/17/65432/32109.png');
    expect(asked.method).toBe('GET');
    expect(asked.headers['user-agent']).toBe(TUILES_USER_AGENT);
    // NOT `cf-connecting-ip` here: miniflare's outbound interceptor strips that
    // one itself before any scripted host sees it, so asserting it at this seam
    // would prove nothing (verifier). The unit test asserts it on a bare
    // scripted fetch, where it is real; these four ride through untouched.
    for (const jamais of ['cookie', 'referer', 'x-forwarded-for', 'authorization']) {
      expect(asked.headers[jamais], `${jamais} rode upstream`).toBeUndefined();
    }
  });

  it('the same tile again is served from the edge cache — the host is not asked twice', async () => {
    const res = await tuile('/tiles/17/65432/32109.png');
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect(amont).toHaveLength(1);
  });

  it('outside the map’s one zoom and range: 404 by name; a write: 405 — and the host is never asked', async () => {
    for (const p of ['/tiles/16/65432/32109.png', '/tiles/17/131072/1.png', '/tiles/17/1/1.jpg']) {
      const res = await tuile(p);
      expect(res.status, p).toBe(404);
      expect(await res.json()).toEqual({ error: 'tile_not_found' });
    }
    const post = await tuile('/tiles/17/1/1.png', { method: 'POST', body: 'x' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    expect(amont).toHaveLength(1);
  });

  it('a failing host is 502 by name and NOT cached: the next ask reaches the host again and recovers', async () => {
    etatAmont = 'panne';
    const panne = await tuile('/tiles/17/1000/2000.png');
    expect(panne.status).toBe(502);
    expect(await panne.json()).toEqual({ error: 'tile_upstream' });
    expect(amont).toHaveLength(2);
    etatAmont = 'ok';
    const retour = await tuile('/tiles/17/1000/2000.png');
    expect(retour.status).toBe(200);
    expect(amont).toHaveLength(3);
    // …and the recovered tile is now cached like any other.
    await tuile('/tiles/17/1000/2000.png');
    expect(amont).toHaveLength(3);
  });
});
