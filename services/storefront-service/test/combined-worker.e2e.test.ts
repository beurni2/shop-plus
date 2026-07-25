import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import type { StorefrontView } from '../src/customer-projection.js';

/**
 * STOREFRONT-DEPLOY-1 — the COMBINED Worker on the real workerd runtime
 * (Miniflare), with BOTH Durable Objects bound AND a real local R2 bucket. This
 * proves the composition-root wiring — the namespace→fetcher shim, so
 * `GET /s/{slug}` resolves through the DO — and the R2 media path: upload → store
 * in R2 → read back through `GET /media/{key}` with the immutable cache header.
 *
 * SERVICE-WRITE-AUTH-1 adds the write-gate proof below: every write is 401 without
 * the shared key and succeeds with it; every read answers with no credential; the
 * 401 is not an existence oracle; and a Worker with NO secret fails closed.
 *
 * WHAT THIS PROVES vs NOT: this exercises the real code paths (shim, R2 put/get,
 * the read route, the unguessable key, the auth gate). It does NOT prove the
 * wrangler.toml migration or a real Cloudflare deploy — Miniflare binds these by
 * its own config, not the wrangler file (founder's warning). Those stay unproven
 * until a deploy runs. The secret here is a TEST secret configured explicitly.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'combined-do-'));
const T0 = '2026-07-14T08:00:00.000Z';

/** The configured shared secret + the wire header (independently stated here so a
 * rename of the code constant that breaks the contract is caught by this test). */
const WRITE_SECRET = 'test-write-secret-0001';
const WRITE_KEY_HEADER = 'X-Write-Key';
const authed = { [WRITE_KEY_HEADER]: WRITE_SECRET };

const SELLER_001 = {
  commandId: 'cmd-seller001-create',
  id: 'sf-seller-0001',
  resellerId: 'rs-seller-0001',
  shortCode: 'SELLER-0001',
  name: 'Boutique du fondateur',
  zone: 'Ouagadougou',
  category: 'Général',
  correlationId: 'corr-001',
  at: T0,
};

/** A minimal VALID PNG the media validator accepts: sig + IHDR 256×256. */
function tinyPng(): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  b.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length 13
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  b.set([0x00, 0x00, 0x01, 0x00], 16); // width 256
  b.set([0x00, 0x00, 0x01, 0x00], 20); // height 256
  return b;
}

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO' },
  r2Buckets: ['BUCKET'],
  durableObjectsPersist: persist,
  bindings: { STOREFRONT_WRITE_SECRET: WRITE_SECRET },
  // BROWSE-SUPPLY-BINDING-1 — a REAL service binding through workerd (miniflare's
  // serviceBindings), emulating boutik's collection producer: fresh asOf computed
  // AT REQUEST TIME so the 15-minute bound passes, one Bazin item, exact-path
  // routing (anything else 404s naming itself, like a real Worker would).
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path !== '/supply-projections') {
        return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
      }
      const asOf = new Date().toISOString();
      return Response.json({
        asOf,
        items: [
          {
            version: 1,
            asOf,
            value: {
              productVersionId: 'pv-bazin-0001',
              offerVersion: 'ov-1',
              basePrice: 10_000,
              resellerCommission: 750,
              available: 10,
              productName: 'Bazin',
              assetRefs: [],
            },
          },
        ],
      });
    },
  },
});

// A SECOND Worker with NO secret configured — to prove the gate fails CLOSED.
const persistNoSecret = mkdtempSync(join(tmpdir(), 'combined-nosecret-'));
const mfNoSecret = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO' },
  r2Buckets: ['BUCKET'],
  durableObjectsPersist: persistNoSecret,
  // deliberately NO `bindings` → STOREFRONT_WRITE_SECRET is undefined
});

afterAll(async () => {
  await mf.dispose();
  await mfNoSecret.dispose();
  rmSync(persist, { recursive: true, force: true });
  rmSync(persistNoSecret, { recursive: true, force: true });
});

describe('combined Worker — the shim + the R2 media path, on real workerd', () => {
  it('COMPOSITION: POST /storefronts then GET /s/{slug} resolves through the shim to the StorefrontView', async () => {
    const created = await mf.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify(SELLER_001),
    });
    expect(((await created.json()) as { status: string }).status).toBe('created');

    const read = await mf.dispatchFetch('http://c/s/seller-0001', { method: 'GET' });
    expect(read.status).toBe(200);
    const view = (await read.json()) as StorefrontView;
    expect(view.id).toBe('sf-seller-0001');
    expect(view.slug).toBe('seller-0001'); // the DO answered via the fetcher shim
  });

  it('R2 WRITE→READ: an upload lands in R2 and reads back through GET /media/{key} with the immutable cache', async () => {
    const up = await mf.dispatchFetch('http://c/media/upload?kind=cover&storefrontId=sf-seller-0001', {
      method: 'POST',
      headers: authed,
      body: tinyPng(),
    });
    expect(up.status).toBe(201);
    const rec = (await up.json()) as { url: string; kind: string; status: string };
    expect(rec.kind).toBe('cover');
    // the read URL is the SERVICE route, never the bucket; the key is an unguessable
    // uuid, never a sequential media-${seq} (founder ruling).
    expect(rec.url).toMatch(/^\/media\/storefronts\/sf-seller-0001\/cover\/[0-9a-f-]{36}\.png$/);
    expect(rec.url).not.toMatch(/media-\d+/);

    const read = await mf.dispatchFetch(`http://c${rec.url}`, { method: 'GET' });
    expect(read.status).toBe(200);
    expect(read.headers.get('content-type')).toBe('image/png');
    expect(read.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const bytes = new Uint8Array(await read.arrayBuffer());
    expect(bytes.length).toBe(64); // the exact bytes we uploaded, round-tripped through R2
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('an unknown media key → the honest 404, never a 500', async () => {
    const read = await mf.dispatchFetch('http://c/media/storefronts/sf-x/cover/nope.png', { method: 'GET' });
    expect(read.status).toBe(404);
  });
});

/**
 * SERVICE-WRITE-AUTH-1 — the write gate. Every write endpoint is 401 without the
 * shared key and processed with it; every read answers with no key; the 401 leaks
 * nothing about existence; and a Worker with no secret refuses all writes.
 */
describe('SERVICE-WRITE-AUTH-1 — the shared-secret write gate', () => {
  const AUTH_SF = {
    commandId: 'cmd-auth-create',
    id: 'sf-auth-0001',
    resellerId: 'rs-seller-0001',
    shortCode: 'AUTH-0001',
    name: 'Boutique gate',
    zone: 'Ouagadougou',
    category: 'Général',
    correlationId: 'corr-auth',
    at: T0,
  };

  it('POST /storefronts is gated: 401 without the key, created with it', async () => {
    const noKey = await mf.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      body: JSON.stringify(AUTH_SF),
    });
    expect(noKey.status).toBe(401);
    expect((await noKey.json()) as unknown).toEqual({ error: 'unauthorized' });

    const withKey = await mf.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify(AUTH_SF),
    });
    expect(withKey.status).toBe(200);
    expect(((await withKey.json()) as { status: string }).status).toBe('created');
  });

  it('POST /storefronts/:id/publish and /unpublish are gated', async () => {
    const toggleBody = JSON.stringify({ id: 'sf-auth-0001', correlationId: 'corr-auth', at: T0 });

    const pubNoKey = await mf.dispatchFetch('http://c/storefronts/sf-auth-0001/publish', { method: 'POST', body: toggleBody });
    expect(pubNoKey.status).toBe(401);
    const pubOk = await mf.dispatchFetch('http://c/storefronts/sf-auth-0001/publish', {
      method: 'POST',
      headers: authed,
      body: toggleBody,
    });
    expect(pubOk.status).toBe(200);

    const unpubNoKey = await mf.dispatchFetch('http://c/storefronts/sf-auth-0001/unpublish', { method: 'POST', body: toggleBody });
    expect(unpubNoKey.status).toBe(401);
    const unpubOk = await mf.dispatchFetch('http://c/storefronts/sf-auth-0001/unpublish', {
      method: 'POST',
      headers: authed,
      body: toggleBody,
    });
    expect(unpubOk.status).toBe(200);
  });

  it('POST /listings and /listings/:id/hide are gated', async () => {
    const publishCmd = JSON.stringify({
      commandId: 'cmd-auth-listing-1',
      listingId: 'lst-auth-0001',
      storefrontId: 'sf-auth-0001',
      resellerId: 'rs-seller-0001',
      productVersionId: 'pv-auth-1',
      offerVersion: 'ov-auth-1',
      markup: 500,
      customerPriceFcfa: 2000,
      stockAssurance: { source: 'hub' },
      correlationId: 'corr-auth-lst',
      at: T0,
    });

    const pubNoKey = await mf.dispatchFetch('http://c/listings', { method: 'POST', body: publishCmd });
    expect(pubNoKey.status).toBe(401);
    const pubOk = await mf.dispatchFetch('http://c/listings', { method: 'POST', headers: authed, body: publishCmd });
    expect(pubOk.status).toBe(200);
    expect(((await pubOk.json()) as { status: string }).status).toBe('published');

    const hideBody = JSON.stringify({ correlationId: 'corr-auth-hide', at: T0 });
    const hideNoKey = await mf.dispatchFetch('http://c/listings/lst-auth-0001/hide', { method: 'POST', body: hideBody });
    expect(hideNoKey.status).toBe(401);
    const hideOk = await mf.dispatchFetch('http://c/listings/lst-auth-0001/hide', {
      method: 'POST',
      headers: authed,
      body: hideBody,
    });
    expect(hideOk.status).toBe(200);
    expect(((await hideOk.json()) as { status: string }).status).toBe('hidden');
  });

  it('LISTING-READ-GATE-1 — GET /listings/:id is KEY-GATED: her markup is never readable without the key', async () => {
    // THE LEAK THIS CLOSES: the canon ResellerListing carries `markup` (M). With her
    // displayed price (B + M), M yields the SUPPLIER'S BASE PRICE B by subtraction —
    // the exact economics leak SP-I03 exists to prevent (it was live on the deployed
    // Worker, harmless only because no listing existed yet).
    const noKey = await mf.dispatchFetch('http://c/listings/lst-auth-0001', { method: 'GET' });
    expect(noKey.status).toBe(401);
    expect((await noKey.json()) as unknown).toEqual({ error: 'unauthorized' }); // same non-oracle 401

    const withKey = await mf.dispatchFetch('http://c/listings/lst-auth-0001', { method: 'GET', headers: authed });
    expect(withKey.status).toBe(200);
    const listing = (await withKey.json()) as { markup?: number };
    expect(listing.markup).toBe(500); // the operator read still works, unchanged
  });

  it('/health is uncacheable THROUGH THE REAL BUNDLED WORKER — a cached release is indistinguishable from a stale deploy', async () => {
    const res = await mf.dispatchFetch('http://c/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('BROWSE-SUPPLY-1 — GET /supply-projections is KEY-GATED, and the gate is an EXACT match not a prefix', async () => {
    // WHY THIS ROUTE IS GATED: it returns basePrice and resellerCommission for every
    // offer — the same economics the listings gate protects. Open would be the exact
    // fail-open leak APPS caught on boutik's side, where a prefix check written for
    // `/supply-projection/` did not cover `/supply-projections`.
    const noKey = await mf.dispatchFetch('http://c/supply-projections', { method: 'GET' });
    expect(noKey.status).toBe(401);
    expect((await noKey.json()) as unknown).toEqual({ error: 'unauthorized' }); // the same non-oracle 401

    // With the key it answers 200 THROUGH THE REAL SERVICE BINDING: the bound
    // producer serves one fresh Bazin, and the whole chain — binding fetch, canon
    // envelope, freshness bound, identity sweep — runs inside workerd, the same
    // runtime production uses. This is the hop that had NEVER succeeded over a
    // public URL; here it is exercised the way it will actually run.
    const withKey = await mf.dispatchFetch('http://c/supply-projections', { method: 'GET', headers: authed });
    expect(withKey.status).toBe(200);
    const body = (await withKey.json()) as {
      offers?: { productName?: string; basePrice?: number }[];
      diagnostic?: { status?: string; target?: { base?: string } };
    };
    expect(body.offers).toHaveLength(1);
    expect(body.offers?.[0]?.productName).toBe('Bazin');
    expect(body.offers?.[0]?.basePrice).toBe(10_000);
    expect(body.diagnostic?.status).toBe('ok');
    // The diagnostic names its target: the binding name, readable in wrangler.toml.
    expect(body.diagnostic?.target?.base).toBe('service-binding:OFFER');
  });

  it('LISTING-READ-GATE-1 — an UNKNOWN listing id is the SAME 401 without the key (never an existence oracle)', async () => {
    const unknown = await mf.dispatchFetch('http://c/listings/lst-does-not-exist', { method: 'GET' });
    expect(unknown.status).toBe(401);
    expect((await unknown.json()) as unknown).toEqual({ error: 'unauthorized' });
    // with the key it is an honest 404 — so the gate, not existence, drives the 401
    const authedUnknown = await mf.dispatchFetch('http://c/listings/lst-does-not-exist', { method: 'GET', headers: authed });
    expect(authedUnknown.status).toBe(404);
  });

  it('LISTING-READ-GATE-1 — the buyer read path is UNAFFECTED: GET /s/{slug} still answers with no credential', async () => {
    // Gating the whole listings surface must cost the buyer nothing: her storefront
    // page is a different, stripped projection and carries no credential.
    const sf = await mf.dispatchFetch('http://c/s/auth-0001', { method: 'GET' });
    expect([200, 404]).toContain(sf.status); // resolves or honest not-found — never 401
    expect(sf.status).not.toBe(401);
  });

  it('POST /media/upload is gated: 401 without the key, 201 with it', async () => {
    const noKey = await mf.dispatchFetch('http://c/media/upload?kind=avatar&storefrontId=sf-auth-0001', {
      method: 'POST',
      body: tinyPng(),
    });
    expect(noKey.status).toBe(401);

    const withKey = await mf.dispatchFetch('http://c/media/upload?kind=avatar&storefrontId=sf-auth-0001', {
      method: 'POST',
      headers: authed,
      body: tinyPng(),
    });
    expect(withKey.status).toBe(201);
  });

  it('the read routes answer with NO credential at all', async () => {
    const health = await mf.dispatchFetch('http://c/health', { method: 'GET' });
    expect(health.status).toBe(200);
    expect(((await health.json()) as { status: string }).status).toBe('ok');

    const slug = await mf.dispatchFetch('http://c/s/nope-does-not-exist', { method: 'GET' });
    expect(slug.status).toBe(404); // honest not-found, NOT 401

    const media = await mf.dispatchFetch('http://c/media/storefronts/x/cover/nope.png', { method: 'GET' });
    expect(media.status).toBe(404); // honest not-found, NOT 401
  });

  it('a wrong key is rejected just like a missing one', async () => {
    const res = await mf.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      headers: { [WRITE_KEY_HEADER]: 'not-the-secret' },
      body: JSON.stringify(AUTH_SF),
    });
    expect(res.status).toBe(401);
  });

  it('the 401 is NOT an existence oracle: same response whether the target exists or not', async () => {
    // sf-auth-0001 exists (created above); sf-ghost-9999 never has.
    const onExisting = await mf.dispatchFetch('http://c/storefronts/sf-auth-0001/publish', {
      method: 'POST',
      body: JSON.stringify({ id: 'sf-auth-0001', correlationId: 'c', at: T0 }),
    });
    const onAbsent = await mf.dispatchFetch('http://c/storefronts/sf-ghost-9999/publish', {
      method: 'POST',
      body: JSON.stringify({ id: 'sf-ghost-9999', correlationId: 'c', at: T0 }),
    });
    expect(onExisting.status).toBe(401);
    expect(onAbsent.status).toBe(401);
    expect(await onExisting.text()).toBe(await onAbsent.text()); // byte-identical body
  });

  it('FAIL CLOSED: a Worker with no secret configured refuses writes even WITH a header', async () => {
    const withHeader = await mfNoSecret.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify(AUTH_SF),
    });
    expect(withHeader.status).toBe(401);

    const withoutHeader = await mfNoSecret.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      body: JSON.stringify(AUTH_SF),
    });
    expect(withoutHeader.status).toBe(401);

    // and a read still works with no secret configured
    const health = await mfNoSecret.dispatchFetch('http://c/health', { method: 'GET' });
    expect(health.status).toBe(200);
  });
});

/**
 * RESELLER-STOREFRONT-WRITE-1 — CORS on the buyer read routes (the browser
 * boundary the miniflare e2e otherwise never crosses) and the key-gated admin list.
 */
const ORIGIN = 'https://beurni2.github.io';
describe('RESELLER-STOREFRONT-WRITE-1 — CORS on reads + the admin list', () => {
  it('the READ routes carry the exact-origin CORS header (never a wildcard)', async () => {
    // sf-seller-0001 exists from the composition test above.
    const slug = await mf.dispatchFetch('http://c/s/seller-0001', { method: 'GET', headers: { Origin: ORIGIN } });
    expect(slug.status).toBe(200);
    expect(slug.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(slug.headers.get('access-control-allow-origin')).not.toBe('*');

    const health = await mf.dispatchFetch('http://c/health', { method: 'GET', headers: { Origin: ORIGIN } });
    expect(health.headers.get('access-control-allow-origin')).toBe(ORIGIN);

    const media = await mf.dispatchFetch('http://c/media/nope.png', { method: 'GET', headers: { Origin: ORIGIN } });
    expect(media.status).toBe(404); // honest not-found still carries CORS so the browser can read it
    expect(media.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('a preflight OPTIONS on a read route answers 204 + CORS with NO key (never hits the write gate)', async () => {
    const pre = await mf.dispatchFetch('http://c/s/seller-0001', {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(pre.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('the WRITE route carries NO CORS header (browser origins must never write)', async () => {
    const up = await mf.dispatchFetch('http://c/media/upload?kind=cover&storefrontId=sf-seller-0001', {
      method: 'POST',
      headers: { ...authed, Origin: ORIGIN },
      body: tinyPng(),
    });
    expect(up.status).toBe(201);
    expect(up.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('GET /storefronts is key-gated and lists created storefronts with live discoverable', async () => {
    // create a fresh storefront, publish it, and assert the list reflects it.
    const create = await mf.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({
        commandId: 'cmd-list-create',
        id: 'sf-list-0001',
        resellerId: 'rs-seller-0001',
        shortCode: 'LIST-0001',
        name: 'Boutique liste',
        zone: 'Ouagadougou',
        category: 'Général',
        correlationId: 'corr-list',
        at: T0,
      }),
    });
    expect(((await create.json()) as { status: string }).status).toBe('created');

    const noKey = await mf.dispatchFetch('http://c/storefronts', { method: 'GET' });
    expect(noKey.status).toBe(401); // GET, but the admin list is explicitly gated

    const listed = await mf.dispatchFetch('http://c/storefronts', { method: 'GET', headers: authed });
    expect(listed.status).toBe(200);
    const rows = (await listed.json()) as { id: string; slug: string; name: string; discoverable: boolean }[];
    const mine = rows.find((r) => r.id === 'sf-list-0001');
    expect(mine).toEqual({ id: 'sf-list-0001', slug: 'list-0001', name: 'Boutique liste', discoverable: false });

    // publish it → the list must reflect the LIVE discoverable, not a stale snapshot.
    const pub = await mf.dispatchFetch('http://c/storefronts/sf-list-0001/publish', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ id: 'sf-list-0001', correlationId: 'corr-list', at: T0 }),
    });
    expect(pub.status).toBe(200);
    const after = (await (await mf.dispatchFetch('http://c/storefronts', { method: 'GET', headers: authed })).json()) as {
      id: string;
      discoverable: boolean;
    }[];
    expect(after.find((r) => r.id === 'sf-list-0001')?.discoverable).toBe(true);
  });
});

/**
 * REAL-PRODUCT-RENDER-1 (a2) — MEMBERSHIP + THE JOIN, on real workerd.
 *
 * Publish states membership (the pid lands in her canon `curatedItems`) and writes
 * the pid→listing lookup; `GET /s/{slug}` then carries per-product records built
 * server-side. With NO supply source configured — the default, and the truth today
 * — every product is UNDESCRIBABLE and therefore OMITTED, never invented.
 */
describe('REAL-PRODUCT-RENDER-1 (a2) — publish states membership; the read path joins', () => {
  const SF_A2 = {
    commandId: 'cmd-a2-create',
    id: 'sf-a2-0001',
    resellerId: 'rs-a2-0001',
    shortCode: 'AATWO-0001',
    name: 'Boutique jointure',
    zone: 'Ouagadougou',
    category: 'Général',
    correlationId: 'corr-a2',
    at: T0,
  };
  const publishCmd = (over: Partial<Record<string, unknown>> = {}): string =>
    JSON.stringify({
      commandId: 'cmd-a2-listing-1',
      listingId: 'lst-a2-0001',
      storefrontId: 'sf-a2-0001',
      resellerId: 'rs-a2-0001',
      productVersionId: 'pv-a2-1',
      offerVersion: 'ov-a2-1',
      markup: 1_200,
      customerPriceFcfa: 9_200,
      stockAssurance: { source: 'hub' },
      correlationId: 'corr-a2-lst',
      at: T0,
      ...over,
    });

  it('PUBLISH APPENDS THE PID to her canon curatedItems (membership), and republish does not append twice', async () => {
    await mf.dispatchFetch('http://c/storefronts', { method: 'POST', headers: authed, body: JSON.stringify(SF_A2) });
    const pub = await mf.dispatchFetch('http://c/listings', { method: 'POST', headers: authed, body: publishCmd() });
    expect(((await pub.json()) as { status: string }).status).toBe('published');

    const read = await mf.dispatchFetch('http://c/s/aatwo-0001', { method: 'GET' });
    expect(read.status).toBe(200);
    const view = (await read.json()) as StorefrontView & { products: unknown[] };
    expect(view.curatedItems).toEqual(['pv-a2-1']); // membership stated by the publish

    // REPUBLISH (new commandId, same pid) — position preserved, never duplicated
    const re = await mf.dispatchFetch('http://c/listings', {
      method: 'POST',
      headers: authed,
      body: publishCmd({ commandId: 'cmd-a2-listing-1-again' }),
    });
    expect(((await re.json()) as { status: string }).status).toBe('published');
    const read2 = await mf.dispatchFetch('http://c/s/aatwo-0001', { method: 'GET' });
    const view2 = (await read2.json()) as StorefrontView;
    expect(view2.curatedItems).toEqual(['pv-a2-1']); // appended ONCE, not reordered
  });

  it('NO SUPPLY SOURCE ⇒ the product is UNDESCRIBABLE ⇒ OMITTED (never mock data, never a nameless tile)', async () => {
    const read = await mf.dispatchFetch('http://c/s/aatwo-0001', { method: 'GET' });
    const view = (await read.json()) as StorefrontView & { products: unknown[] };
    // her membership is stated…
    expect(view.curatedItems).toEqual(['pv-a2-1']);
    // …but nothing can describe it, so the buyer payload carries NO product record
    expect(view.products).toEqual([]);
    // and absolutely no fabricated name or ref leaked in
    expect(JSON.stringify(view)).not.toMatch(/Pagne|Produit |démo/i);
  });

  it('THE BUYER PAYLOAD CARRIES NO LISTING ID and no supplier economics (standing law + SP-I03)', async () => {
    const read = await mf.dispatchFetch('http://c/s/aatwo-0001', { method: 'GET' });
    const body = await read.text();
    expect(body).not.toContain('lst-a2-0001'); // the listing id never reaches the wire
    expect(body).not.toMatch(/lst[-_]/i);
    expect(body).not.toMatch(/markup|basePrice|resellerCommission|supplier/i);
  });

  it('the READ PATH stays open to the buyer while /listings* stays gated (both true at once)', async () => {
    const buyer = await mf.dispatchFetch('http://c/s/aatwo-0001', { method: 'GET' });
    expect(buyer.status).toBe(200); // no credential
    const listing = await mf.dispatchFetch('http://c/listings/lst-a2-0001', { method: 'GET' });
    expect(listing.status).toBe(401); // still gated
  });
});

/**
 * SERVICE-PROVENANCE-1 — the deploy-freshness stamp, proven ON THE BUNDLE.
 *
 * The point of the stamp is that the DEPLOYED ARTIFACT can answer which build it
 * is and which wire shape it speaks. So this asserts it through the real bundled
 * Worker on workerd — a unit test of `provenance()` would prove the function, not
 * the artifact, and it is the artifact that was wrong four times this session.
 */
describe('SERVICE-PROVENANCE-1 — /health answers which build is live', () => {
  it('the 200 carries release + canon, from the BUNDLE (unstamped ⇒ the honest "dev")', async () => {
    const res = await mf.dispatchFetch('http://c/health', { method: 'GET' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { service: string; status: string; release?: string; canon?: string };
    expect(body.status).toBe('ok');
    // Both fields are PRESENT on every build — the CI bundle is unstamped, so both
    // read `dev`, which is the honest answer for a build the deploy did not stamp.
    // A deployed build carries the sha and the pinned contracts version instead.
    expect(body.release).toBeDefined();
    expect(body.canon).toBeDefined();
    expect(typeof body.release).toBe('string');
    expect(typeof body.canon).toBe('string');
  });

  it('the 404 is UNCHANGED — the stamp rides the health answer only', async () => {
    const res = await mf.dispatchFetch('http://c/nope-not-a-route', { method: 'GET' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['status']).toBe('not_found');
    expect(body['release']).toBeUndefined();
    expect(body['canon']).toBeUndefined();
  });

  it('the DEFINES are wired into the deployed bundle script, and canon is read from the INSTALLED package', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '../package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const combined = pkg.scripts['bundle:worker:combined']!;
    expect(combined).toContain('--define:__SHOP_RELEASE__');
    expect(combined).toContain('--define:__SHOP_CANON__');
    // the deploy workflow supplies them; canon comes from node_modules, never a constant
    const wf = readFileSync(join(import.meta.dirname, '../../../.github/workflows/storefront-deploy.yml'), 'utf8');
    expect(wf).toContain('SHOP_RELEASE=${{ github.sha }}');
    expect(wf).toContain("require('./node_modules/@platform/contracts/package.json').version");
    // …and the stamp is resolved BEFORE the bundle step, or it would define nothing
    expect(wf.indexOf('Resolve the provenance stamp')).toBeLessThan(wf.indexOf('bundle:worker:combined'));
  });
});
