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
 * WHAT THIS PROVES vs NOT: this exercises the real code paths (shim, R2 put/get,
 * the read route, the unguessable key). It does NOT prove the wrangler.toml
 * migration or a real Cloudflare deploy — Miniflare binds these by its own config,
 * not the wrangler file (founder's warning). Those stay unproven until a deploy runs.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'combined-do-'));
const T0 = '2026-07-14T08:00:00.000Z';

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
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

describe('combined Worker — the shim + the R2 media path, on real workerd', () => {
  it('COMPOSITION: POST /storefronts then GET /s/{slug} resolves through the shim to the StorefrontView', async () => {
    const created = await mf.dispatchFetch('http://c/storefronts', { method: 'POST', body: JSON.stringify(SELLER_001) });
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
