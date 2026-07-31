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
        'featuredItems', 'headerStyle', // ENTETES-B — deliberately admitted: presentation, never economics
        'id', 'name', 'resellerId', 'sections', 'slug', 'tagline', 'theme', 'updatedAt', 'zone',
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

  it('STOREFRONT-DELETE-1: DELETE erases the shop — entry, slug pointer AND directory row, durably', async () => {
    const cmd = { ...SELLER_001, commandId: 'c-del', id: 'sf-del', shortCode: 'SELLER-0007' };
    await create(cmd);
    expect((await readSlug('seller-0007')).code).toBe(200); // alive before

    const del = await mf.dispatchFetch('http://sf/storefronts/sf-del', { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect((await del.json()) as object).toEqual({ status: 'deleted', slug: 'seller-0007' });

    await restart(); // the erasure must be durable, not an in-memory illusion

    expect((await readSlug('seller-0007')).code).toBe(404); // buyer read: honest not-found
    const byId = await mf.dispatchFetch('http://sf/storefronts/sf-del', { method: 'GET' });
    expect(byId.status).toBe(404); // operator read: gone too
    const list = (await (await mf.dispatchFetch('http://sf/storefronts', { method: 'GET' })).json()) as { id: string }[];
    expect(list.some((r) => r.id === 'sf-del')).toBe(false); // directory forgot it
  });

  it('STOREFRONT-DELETE-1: an UNKNOWN id answers the honest 404 — never a phantom deletion', async () => {
    const del = await mf.dispatchFetch('http://sf/storefronts/sf-jamais-cree', { method: 'DELETE' });
    expect(del.status).toBe(404);
    expect(((await del.json()) as { status: string }).status).toBe('absent');
    // and a SECOND delete of an already-deleted shop is the same honest absent —
    // re-running a possibly interrupted cleanup is safe, not a new act.
    const again = await mf.dispatchFetch('http://sf/storefronts/sf-del', { method: 'DELETE' });
    expect(again.status).toBe(404);
  });

  it('STOREFRONT-DELETE-1: an INTERRUPTED cleanup CONVERGES on re-run — the index row recovers the slug', async () => {
    // Fabricate the exact mid-flight state a crash between steps leaves behind:
    // entry erased, slug pointer + directory row still standing. The public
    // surface cannot half-delete, so the entry is erased DIRECTLY on the DO
    // instance, bypassing the router's cleanup.
    const cmd = { ...SELLER_001, commandId: 'c-conv', id: 'sf-conv', shortCode: 'SELLER-0008' };
    await create(cmd);
    const ns = await mf.getDurableObjectNamespace('STOREFRONT');
    const stub = ns.get(ns.idFromName('sf-conv'));
    await stub.fetch('https://do/entry/delete', { method: 'POST' });

    // The interrupted state is buyer-safe already (orphaned-pointer rule)…
    expect((await readSlug('seller-0008')).code).toBe(404);
    // …but the directory still remembers the ghost:
    const before = (await (await mf.dispatchFetch('http://sf/storefronts', { method: 'GET' })).json()) as { id: string }[];
    expect(before.some((r) => r.id === 'sf-conv')).toBe(true);

    // Re-running the DELETE answers the honest absent AND finishes the cleanup.
    const rerun = await mf.dispatchFetch('http://sf/storefronts/sf-conv', { method: 'DELETE' });
    expect(rerun.status).toBe(404);
    const after = (await (await mf.dispatchFetch('http://sf/storefronts', { method: 'GET' })).json()) as { id: string }[];
    expect(after.some((r) => r.id === 'sf-conv')).toBe(false); // ghost row gone
    expect((await readSlug('seller-0008')).code).toBe(404); // pointer cleared, still honest
  });

  it('PERSONNALISER-REAL-1: a saved presentation is DURABLE and reaches the buyer read path', async () => {
    const cmd = { ...SELLER_001, commandId: 'c-ident', id: 'sf-ident', shortCode: 'SELLER-0021' };
    await create(cmd);
    const save = await mf.dispatchFetch('http://sf/storefronts/sf-ident/identity', {
      method: 'POST',
      body: JSON.stringify({
        patch: { name: 'Chez Bernard', tagline: 'Le bon tissu', bio: 'Ouaga', theme: 'indigo', featuredItems: ['pv-1'] },
        at: T1,
      }),
    });
    expect(save.status).toBe(200);
    expect(((await save.json()) as { status: string }).status).toBe('saved');

    await restart(); // the save must survive a process death, not just a re-read

    // THE BUYER READ PATH sees it — the whole point: personnalisation that never
    // reaches `/s/{slug}` is a screen that lies to her.
    const read = await readSlug('seller-0021');
    expect(read.code).toBe(200);
    const view = read.view as StorefrontView;
    expect(view.name).toBe('Chez Bernard');
    expect(view.tagline).toBe('Le bon tissu');
    expect(view.bio).toBe('Ouaga');
    expect(view.theme).toBe('indigo');
    expect(view.featuredItems).toEqual(['pv-1']);
    expect(view.slug).toBe('seller-0021'); // the slug is NEVER regenerated on a rename
  });

  it('PERSONNALISER-REAL-1: an absent shop is 404 and a bad patch is a NAMED 422 — never a silent no-op', async () => {
    const absent = await mf.dispatchFetch('http://sf/storefronts/sf-jamais-ident/identity', {
      method: 'POST',
      body: JSON.stringify({ patch: { name: 'Chez Bernard' }, at: T1 }),
    });
    expect(absent.status).toBe(404);
    expect(((await absent.json()) as { status: string }).status).toBe('absent');

    const refused = await mf.dispatchFetch('http://sf/storefronts/sf-ident/identity', {
      method: 'POST',
      body: JSON.stringify({ patch: { name: 'ab' }, at: T1 }),
    });
    expect(refused.status).toBe(422);
    expect((await refused.json()) as object).toEqual({ status: 'refused', reason: 'name_too_short' });
    // …and the refusal wrote NOTHING: her previous name still stands
    const read = await readSlug('seller-0021');
    expect((read.view as StorefrontView).name).toBe('Chez Bernard');
  });

  it('ENTETES-B: headerStyle saved via the identity route is DURABLE and rides the buyer read path', async () => {
    const cmd = { ...SELLER_001, commandId: 'c-entete', id: 'sf-entete', shortCode: 'SELLER-0022' };
    await create(cmd);
    // her page starts on the shipped default — the canon backfill, by value
    expect(((await readSlug('seller-0022')).view as StorefrontView).headerStyle).toBe('classique');

    const save = await mf.dispatchFetch('http://sf/storefronts/sf-entete/identity', {
      method: 'POST',
      body: JSON.stringify({ patch: { headerStyle: 'royale' }, at: T1 }),
    });
    expect(save.status).toBe(200);
    expect(((await save.json()) as { status: string }).status).toBe('saved');

    await restart(); // the header she chose must survive a process death

    const read = await readSlug('seller-0022');
    expect(read.code).toBe(200);
    expect((read.view as StorefrontView).headerStyle).toBe('royale');

    // …and an unknown key is the NAMED 422, with the stored value untouched
    const refused = await mf.dispatchFetch('http://sf/storefronts/sf-entete/identity', {
      method: 'POST',
      body: JSON.stringify({ patch: { headerStyle: 'baroque' }, at: T1 }),
    });
    expect(refused.status).toBe(422);
    expect((await refused.json()) as object).toEqual({ status: 'refused', reason: 'unknown_header_style' });
    expect(((await readSlug('seller-0022')).view as StorefrontView).headerStyle).toBe('royale');
  });

  it('ENTETES-L: EVERY newly-canon key SAVES through the real DO — the « Masque » failure, pinned', async () => {
    // THIS IS THE ASSERTION THAT WAS MISSING ON 2026-07-30. « Masque » shipped
    // in the seller's picker while the deployed Worker still held the previous
    // canon set, so `unknown_header_style` refused her save — a broken screen,
    // not a broken feature. The test above proves an UNKNOWN key is refused;
    // nothing proved a NEWLY-ADDED one is accepted, which is the half that
    // actually breaks a seller.
    //
    // Asserted as a SET over the six, and against the REAL Durable Object over
    // fetch, because that is the surface the deploy changes. It stays honest
    // for the next bump: add a key to canon without deploying and this is the
    // test that says so.
    const SIX = ['fildor', 'bazin', 'couverture', 'billet', 'enseigne', 'hologramme'] as const;
    const cmd = { ...SELLER_001, commandId: 'c-entl', id: 'sf-entl', shortCode: 'SELLER-0023' };
    await create(cmd);
    for (const key of SIX) {
      const save = await mf.dispatchFetch('http://sf/storefronts/sf-entl/identity', {
        method: 'POST',
        body: JSON.stringify({ patch: { headerStyle: key }, at: T1 }),
      });
      expect(save.status, `${key}: refused by the service`).toBe(200);
      expect(((await save.json()) as { status: string }).status, key).toBe('saved');
      expect(((await readSlug('seller-0023')).view as StorefrontView).headerStyle, `${key}: not on the buyer read path`).toBe(key);
    }
    // and it survives a process death on the last of them, as royale does above
    await restart();
    expect(((await readSlug('seller-0023')).view as StorefrontView).headerStyle).toBe('hologramme');
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

/**
 * ENTETES-C — her framing rides the DURABLE path: set via the identity route,
 * carried INSIDE `cover`/`avatar` on the buyer read (NO new StorefrontView
 * field — proven on the emitted keys), survives a restart, and a NEW media
 * write for that kind starts UNFRAMED while the other kind keeps its framing.
 */
describe('StorefrontDO — ENTETES-C: photo focus is durable and a new photo starts unframed', () => {
  const media = (id: string, kind: 'cover' | 'avatar', url: string) =>
    mf.dispatchFetch(`http://sf/storefronts/${id}/media`, {
      method: 'POST',
      body: JSON.stringify({ kind, url, at: T1 }),
    });
  const identity = (id: string, patch: object) =>
    mf.dispatchFetch(`http://sf/storefronts/${id}/identity`, {
      method: 'POST',
      body: JSON.stringify({ patch, at: T1 }),
    });

  it('focus set via /identity reaches GET /s/{slug} inside cover/avatar, survives restart, clears on a NEW photo', async () => {
    const cmd = { ...SELLER_001, commandId: 'c-focus', id: 'sf-focus', shortCode: 'SELLER-0023' };
    await create(cmd);
    expect((await media('sf-focus', 'cover', 'https://media.example/sf-focus/cover-1.jpg')).status).toBe(200);
    expect((await media('sf-focus', 'avatar', 'https://media.example/sf-focus/avatar-1.jpg')).status).toBe(200);

    const save = await identity('sf-focus', { coverFocus: { x: 10, y: 90 }, avatarFocus: { x: 40, y: 20 } });
    expect(save.status).toBe(200);
    expect(((await save.json()) as { status: string }).status).toBe('saved');

    // THE BUYER READ PATH carries the framing INSIDE the existing sub-objects…
    const read = await readSlug('seller-0023');
    expect(read.code).toBe(200);
    const view = read.view as StorefrontView;
    expect(view.cover).toEqual({ status: 'live', url: 'https://media.example/sf-focus/cover-1.jpg', focus: { x: 10, y: 90 } });
    expect(view.avatar).toEqual({ mode: 'photo', url: 'https://media.example/sf-focus/avatar-1.jpg', focus: { x: 40, y: 20 } });
    // …and the view grew NO new top-level field for it (the SP-I03 allowlist is unchanged)
    expect(Object.keys(view).some((k) => /focus/i.test(k))).toBe(false);

    await restart(); // her framing must survive a process death

    const after = (await readSlug('seller-0023')).view as StorefrontView;
    expect(after.cover.focus).toEqual({ x: 10, y: 90 });
    expect(after.avatar.focus).toEqual({ x: 40, y: 20 });

    // A NEW cover upload starts UNFRAMED — proven on the READ path — while the
    // avatar keeps the framing she chose for the portrait she still has.
    expect((await media('sf-focus', 'cover', 'https://media.example/sf-focus/cover-2.jpg')).status).toBe(200);
    const fresh = (await readSlug('seller-0023')).view as StorefrontView;
    expect(fresh.cover.url).toBe('https://media.example/sf-focus/cover-2.jpg');
    expect(fresh.cover.focus).toBeUndefined(); // stale framing never crops a new photo
    expect(fresh.avatar.focus).toEqual({ x: 40, y: 20 }); // the other kind survives
  });

  it('a malformed pair is the NAMED 422 `bad_focus`; framing a photo-less kind is `no_photo_to_frame`', async () => {
    const cmd = { ...SELLER_001, commandId: 'c-focus-r', id: 'sf-focus-r', shortCode: 'SELLER-0024' };
    await create(cmd);
    // no photo at all yet → no_photo_to_frame
    const noPhoto = await identity('sf-focus-r', { coverFocus: { x: 50, y: 50 } });
    expect(noPhoto.status).toBe(422);
    expect((await noPhoto.json()) as object).toEqual({ status: 'refused', reason: 'no_photo_to_frame' });
    // a real photo, then a malformed pair → bad_focus, and the store is untouched
    await media('sf-focus-r', 'cover', 'https://media.example/sf-focus-r/cover.jpg');
    const bad = await identity('sf-focus-r', { coverFocus: { x: 1.5, y: 2 } });
    expect(bad.status).toBe(422);
    expect((await bad.json()) as object).toEqual({ status: 'refused', reason: 'bad_focus' });
    expect(((await readSlug('seller-0024')).view as StorefrontView).cover.focus).toBeUndefined();
  });
});
