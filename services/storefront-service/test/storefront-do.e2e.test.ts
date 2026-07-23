import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { StorefrontSchema } from '@platform/contracts';
import type { StorefrontView } from '../src/customer-projection.js';
import { DurableStorefrontStore, type StorefrontFetcher } from '../src/storefront-store.js';

/**
 * STOREFRONT-READ-PATH-1 — the REAL durable read path on the Workers runtime
 * (workerd via Miniflare) with ON-DISK persistence. Create through the command →
 * read GET /s/{slug} → the buyer-safe StorefrontView, and every durability test
 * crosses a RESTART (the Miniflare instance disposed and re-created on the SAME
 * persist dir), so the storefront + its slug pointer (Shape C) are proven to
 * survive a process death — not merely a second request. CI reaches only this
 * temp dir, never real storage. Mirrors the attribution-lock DO e2e.
 */

const SCRIPT = 'dist/worker/storefront-worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'storefront-do-'));
const T0 = '2026-07-14T08:00:00.000Z';
const T1 = '2026-07-14T09:00:00.000Z';

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

function makeMf(): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: { STOREFRONT: 'StorefrontDO' },
    durableObjectsPersist: persist,
  });
}
let mf = makeMf();
async function restart(): Promise<void> {
  await mf.dispose();
  mf = makeMf(); // same persist dir = a real restart
}
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

async function create(cmd: object): Promise<{ code: number; body: { status?: string; storefront?: { slug: string; id: string } } }> {
  const res = await mf.dispatchFetch('http://sf/storefronts', { method: 'POST', body: JSON.stringify(cmd) });
  return { code: res.status, body: (await res.json()) as { status?: string; storefront?: { slug: string; id: string } } };
}
async function readSlug(slug: string): Promise<{ code: number; view: StorefrontView | { error: string } }> {
  const res = await mf.dispatchFetch(`http://sf/s/${slug}`, { method: 'GET' });
  return { code: res.status, view: (await res.json()) as StorefrontView | { error: string } };
}

describe('StorefrontDO — the durable read path GET /s/{slug}, Shape C slug pointer', () => {
  it('create → GET /s/{slug} returns the buyer-safe StorefrontView (slug DERIVED, discoverable=false)', async () => {
    const created = await create(SELLER_001);
    expect(created.body.status).toBe('created');
    expect(created.body.storefront?.slug).toBe('seller-0001');

    const read = await readSlug('seller-0001');
    expect(read.code).toBe(200);
    const view = read.view as StorefrontView;
    expect(view.id).toBe('sf-seller-0001');
    expect(view.resellerId).toBe('rs-seller-0001'); // the reseller IS the relationship (SP-I03)
    expect(view.slug).toBe('seller-0001');
    expect(view.name).toBe('Boutique du fondateur');
    expect(view.discoverable).toBe(false); // created unpublished
    // the emitted view is parseable as a canon Storefront (superset of the fields)
    expect(() => StorefrontSchema.parse(view)).not.toThrow();
  });

  it('SP-I03: the emitted StorefrontView is EXACTLY the buyer-safe allowlist — no supplier/cost/margin/commission key can ride', async () => {
    await create({ ...SELLER_001, commandId: 'c-i03', id: 'sf-i03', shortCode: 'SELLER-0009' });
    const read = await readSlug('seller-0009');
    const view = read.view as StorefrontView;
    // the top-level keys ARE the allowlist and nothing else (a new canon field
    // cannot silently leak onto the customer surface through this projection).
    expect(Object.keys(view).sort()).toEqual(
      [
        'avatar', 'bio', 'category', 'cover', 'createdAt', 'curatedItems', 'discoverable',
        'featuredItems', 'id', 'name', 'resellerId', 'sections', 'slug', 'tagline', 'theme', 'updatedAt', 'zone',
      ].sort(),
    );
  });

  it('UNKNOWN slug → the honest 404 not-found, never a 500, never a neighbouring store', async () => {
    const read = await readSlug('aucune-boutique-9999');
    expect(read.code).toBe(404);
    expect((read.view as { error: string }).error).toBe('not_found');
  });

  it('DURABLE ACROSS RESTART: a storefront + its slug pointer read back after a process death', async () => {
    await create({ ...SELLER_001, commandId: 'c-survive', id: 'sf-survive', shortCode: 'SELLER-0002' });
    const before = await readSlug('seller-0002');
    expect(before.code).toBe(200);

    await restart();

    const after = await readSlug('seller-0002');
    expect(after.code).toBe(200); // pointer + storefront both survived
    expect((after.view as StorefrontView).id).toBe('sf-survive');
  });

  it('IDEMPOTENT ACROSS RESTART: the same create command after a crash returns idempotent, no re-create', async () => {
    const cmd = { ...SELLER_001, commandId: 'c-idem', id: 'sf-idem', shortCode: 'SELLER-0003' };
    const first = await create(cmd);
    expect(first.body.status).toBe('created');
    await restart();
    const replay = await create(cmd);
    expect(replay.body.status).toBe('idempotent');
  });

  it('COLLISION SURFACED: a different command_id on an existing id is refused, the existing name kept', async () => {
    const cmd = { ...SELLER_001, commandId: 'c-base', id: 'sf-collide', shortCode: 'SELLER-0004', name: 'Premier nom' };
    await create(cmd);
    const collision = await create({ ...cmd, commandId: 'c-other', name: 'Autre nom' });
    expect(collision.body.status).toBe('collision');
    const read = await readSlug('seller-0004');
    expect((read.view as StorefrontView).name).toBe('Premier nom'); // never overwritten
  });

  it('PUBLISH toggle is durable: discoverable flips true and survives a restart', async () => {
    const cmd = { ...SELLER_001, commandId: 'c-pub', id: 'sf-pub', shortCode: 'SELLER-0005' };
    await create(cmd);
    const pub = await mf.dispatchFetch('http://sf/storefronts/sf-pub/publish', {
      method: 'POST',
      body: JSON.stringify({ correlationId: 'corr-001', at: T1 }),
    });
    expect(pub.status).toBe(200);
    expect(((await pub.json()) as { status: string }).status).toBe('changed');

    await restart();

    const read = await readSlug('seller-0005');
    expect((read.view as StorefrontView).discoverable).toBe(true); // toggle survived
  });

  it('MOCK-CERTIFIED: DurableStorefrontStore forwards over fetch to the REAL DO — the adapter is not a lie', async () => {
    // the same StorefrontStore interface the route uses, wired to the workerd DO
    const worker: StorefrontFetcher = {
      async fetch(req: Request): Promise<Response> {
        const body = req.method === 'GET' ? undefined : await req.text();
        return (await mf.dispatchFetch(req.url, {
          method: req.method,
          ...(body !== undefined ? { body } : {}),
        })) as unknown as Response;
      },
    };
    const store = new DurableStorefrontStore(worker);
    const created = await store.create({ ...SELLER_001, commandId: 'c-adapter', id: 'sf-adapter', shortCode: 'SELLER-0006' });
    expect(created.status).toBe('created');
    expect(await store.getBySlug('seller-0006').then((s) => s?.id)).toBe('sf-adapter'); // read through the adapter
    expect(await store.getBySlug('nope-9999')).toBeUndefined(); // 404 → undefined, honest
  });
});
