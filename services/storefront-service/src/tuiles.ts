/**
 * ═══ TUILES-PROXY (AUDIT-SHOP-2 F-24) — THE BUYER'S MAP TILES COME THROUGH US ═══
 *
 * WHAT WAS HAPPENING: the buyer map (apps/buyer-pwa/src/geo-carte.ts) asked
 * `tile.openstreetmap.org` for ~20 z17 tiles around her fix the moment the map
 * opened — her area to ~300 m, with her IP, to a third party, under a sentence
 * that promised the point to her rider alone. And OSM's tile usage policy
 * forbids an app loading their tiles without a User-Agent that names it.
 * TUILES-PRIVEES-1 made the sentence true; the founder then chose this road.
 *
 * WHAT THIS IS: `GET /tiles/{z}/{x}/{y}.png` on this Worker. It asks the tile
 * host as ITSELF — our User-Agent, the tile's coordinates, and nothing that
 * arrived with her request (no cookie, no referer, no address, no bearer) —
 * keeps the copy at the edge for a week, and answers the map. Her phone speaks
 * only to us; the host sees a Cloudflare address asking for a tile.
 *
 * WHAT IT IS NOT: a general tile CDN. It answers the map's ONE zoom (GEO_ZOOM,
 * 17) and in-range integer coordinates, GET/HEAD only; everything else is a
 * named 404/405 that never reaches the host. A per-address ceiling stands in
 * front of it since LIMITE-ANONYME-1 (worker/index.ts asks it before the
 * cache; src/limite.ts has the numbers and what they do not close).
 *
 * DETERMINISTIC AND HONEST ON FAILURE: a host that answers anything but 200,
 * or does not answer within TUILES_DELAI_MS, is a 502 by name and is NOT
 * cached; the map drops that tile (calm ground) and the next ask tries again.
 * The bytes are never decoded here — a PNG is what the host says it is.
 */

/** The buyer map's one fixed zoom — `GEO_ZOOM` in apps/buyer-pwa/src/geo-carte.ts. */
export const TUILES_ZOOM = 17;
export const TUILES_AMONT = 'https://tile.openstreetmap.org';
/** OSM's tile usage policy: a User-Agent that identifies the application. */
export const TUILES_USER_AGENT = 'Shop+ buyer map (https://beurni2.github.io/shop-plus/)';
/** A week at the edge and in her browser: a street map of Ouaga does not move faster. */
export const TUILES_CACHE_S = 7 * 24 * 3600;
/** The host's budget before the tile is declared unreachable. */
export const TUILES_DELAI_MS = 5_000;

export interface Tuile {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** The edge cache, as the two operations this road uses (`caches.default` in the Worker). */
export interface CacheTuiles {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
}

// Integers without leading zeros, so one tile has exactly one url (and one cache key).
const CHEMIN = /^\/tiles\/(\d{1,2})\/(0|[1-9]\d{0,6})\/(0|[1-9]\d{0,6})\.png$/;

export function lireCheminTuile(pathname: string): Tuile | null {
  const m = CHEMIN.exec(pathname);
  if (m === null) return null;
  const z = Number(m[1]);
  if (z !== TUILES_ZOOM) return null;
  const x = Number(m[2]);
  const y = Number(m[3]);
  const cote = 2 ** z;
  if (x >= cote || y >= cote) return null;
  return { z, x, y };
}

export function urlAmont(t: Tuile): string {
  return `${TUILES_AMONT}/${t.z}/${t.x}/${t.y}.png`;
}

const ENTETES_TUILE = { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${TUILES_CACHE_S}` };

/** A HEAD answers the headers of the same tile, and no bytes. */
function corps(res: Response, method: string): Response {
  return method === 'HEAD' ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

export async function servirTuile(
  request: Request,
  deps: { fetch: typeof fetch; cache: CacheTuiles },
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const tuile = lireCheminTuile(new URL(request.url).pathname);
  if (tuile === null) return Response.json({ error: 'tile_not_found' }, { status: 404 });

  // Keyed by the upstream url: the same tile is the same copy whatever host
  // name this Worker answers under.
  const cle = new Request(urlAmont(tuile));
  const gardee = await deps.cache.match(cle);
  if (gardee !== undefined) return corps(gardee, request.method);

  // OUR request, built from nothing: the tile's coordinates and our name.
  let octets: ArrayBuffer;
  try {
    const amont = await deps.fetch(cle.url, {
      method: 'GET',
      headers: { 'User-Agent': TUILES_USER_AGENT, Accept: 'image/png' },
      signal: AbortSignal.timeout(TUILES_DELAI_MS),
    });
    if (amont.status !== 200) return Response.json({ error: 'tile_upstream' }, { status: 502 });
    // The body is read INSIDE the budget too: a stream that resets or times
    // out after the headers is the same failure, by the same name (verifier).
    octets = await amont.arrayBuffer();
  } catch {
    return Response.json({ error: 'tile_upstream' }, { status: 502 });
  }

  const copie = new Response(octets, { status: 200, headers: ENTETES_TUILE });
  await deps.cache.put(cle, copie.clone());
  return corps(copie, request.method);
}
