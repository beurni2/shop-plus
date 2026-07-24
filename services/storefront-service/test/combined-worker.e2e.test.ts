import { mkdtempSync, rmSync } from 'node:fs';
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
      hubVerified: true,
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
