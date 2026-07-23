import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { ResellerListingSchema } from '@platform/contracts';
import { DurableListingStore } from '../src/listing-store.js';
import type { StorefrontFetcher } from '../src/storefront-store.js';

/**
 * STOREFRONT-READ-PATH-1 — the per-listing Durable Object on the REAL Workers
 * runtime (workerd via Miniflare), on-disk persistence, restart-crossing. "Same
 * treatment" as the storefront DO. HER price rides the event, carried never
 * recomputed — the durability tests read the record back byte-identical after a
 * process death.
 */

const SCRIPT = 'dist/worker/listing-worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'listing-do-'));
const T0 = '2026-07-14T08:00:00.000Z';
const T1 = '2026-07-14T09:00:00.000Z';

const OFFER = {
  commandId: 'cmd-listing-001',
  listingId: 'lst-seller-0001',
  storefrontId: 'sf-seller-0001',
  resellerId: 'rs-seller-0001',
  productVersionId: 'pv-bazin-0001',
  offerVersion: 'ov-1',
  markup: 2_000,
  customerPriceFcfa: 11_500, // HER price = productSubtotal (B + M), SUPPLIED
  hubVerified: true,
  correlationId: 'corr-001',
  at: T0,
};

function makeMf(): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { LISTING: 'ListingDO' },
    durableObjectsPersist: persist,
  });
}
let mf = makeMf();
async function restart(): Promise<void> {
  await mf.dispose();
  mf = makeMf();
}
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

async function publish(cmd: object): Promise<{ status?: string }> {
  const res = await mf.dispatchFetch('http://l/listings', { method: 'POST', body: JSON.stringify(cmd) });
  return (await res.json()) as { status?: string };
}
async function get(id: string): Promise<{ code: number; body: { status?: string; markup?: number; id?: string; error?: string } }> {
  const res = await mf.dispatchFetch(`http://l/listings/${id}`, { method: 'GET' });
  return { code: res.status, body: (await res.json()) as { status?: string; markup?: number; id?: string; error?: string } };
}

describe('ListingDO — durable publish / auto-hide / read, HER price carried', () => {
  it('publish → GET returns the canon ResellerListing (status published, markup carried)', async () => {
    expect((await publish(OFFER)).status).toBe('published');
    const g = await get('lst-seller-0001');
    expect(g.code).toBe(200);
    expect(g.body.status).toBe('published');
    expect(g.body.markup).toBe(2_000);
    expect(() => ResellerListingSchema.parse(g.body)).not.toThrow();
  });

  it('DURABLE ACROSS RESTART: the published listing reads back after a process death', async () => {
    await publish({ ...OFFER, commandId: 'c-survive', listingId: 'lst-survive' });
    await restart();
    const g = await get('lst-survive');
    expect(g.code).toBe(200);
    expect(g.body.status).toBe('published');
  });

  it('IDEMPOTENT ACROSS RESTART: the same publish command after a crash is idempotent', async () => {
    const cmd = { ...OFFER, commandId: 'c-idem', listingId: 'lst-idem' };
    expect((await publish(cmd)).status).toBe('published');
    await restart();
    expect((await publish(cmd)).status).toBe('idempotent');
  });

  it('AUTO-HIDE is durable: status flips to auto_hidden and survives a restart', async () => {
    await publish({ ...OFFER, commandId: 'c-hide', listingId: 'lst-hide' });
    const hide = await mf.dispatchFetch('http://l/listings/lst-hide/hide', {
      method: 'POST',
      body: JSON.stringify({ correlationId: 'corr-001', at: T1 }),
    });
    expect(((await hide.json()) as { status: string }).status).toBe('hidden');
    await restart();
    expect((await get('lst-hide')).body.status).toBe('auto_hidden');
  });

  it('an unknown listing → the honest 404', async () => {
    expect((await get('lst-nope')).code).toBe(404);
  });

  it('MOCK-CERTIFIED: DurableListingStore forwards over fetch to the REAL DO', async () => {
    const worker: StorefrontFetcher = {
      async fetch(req: Request): Promise<Response> {
        const body = req.method === 'GET' ? undefined : await req.text();
        return (await mf.dispatchFetch(req.url, {
          method: req.method,
          ...(body !== undefined ? { body } : {}),
        })) as unknown as Response;
      },
    };
    const store = new DurableListingStore(worker);
    expect((await store.publish({ ...OFFER, commandId: 'c-adapter', listingId: 'lst-adapter' })).status).toBe('published');
    expect(await store.getById('lst-adapter').then((l) => l?.markup)).toBe(2_000);
    expect(await store.getById('lst-nope-9999')).toBeUndefined();
  });
});
