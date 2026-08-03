import { describe, expect, it } from 'vitest';
import { StorefrontSchema } from '@platform/contracts';
import { InMemoryStorefrontStore, resolveStorefrontStore } from '../src/storefront-store.js';
import { toStorefrontView } from '../src/customer-projection.js';
import type { CreateStorefrontCommand } from '../src/storefront-core.js';

/**
 * STOREFRONT-READ-PATH-1 — the in-memory substrate (CI/local) + the StorefrontView
 * projection. The durable substrate and the real GET /s/{slug} read are proven on
 * workerd in storefront-do.e2e.test.ts; here the fast in-memory path proves the
 * SAME behaviour (create → getBySlug via the Shape-C slug index) and the env-gate
 * (no binding ⇒ in-memory, never real storage).
 */

const T0 = '2026-07-14T08:00:00.000Z';
const SELLER_001: CreateStorefrontCommand = {
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

describe('InMemoryStorefrontStore — create seeds the slug index; getBySlug is the read path', () => {
  it('create → getBySlug resolves THAT storefront by its derived slug', async () => {
    const store = new InMemoryStorefrontStore();
    const created = await store.create(SELLER_001);
    expect(created.status).toBe('created');
    const sf = await store.getBySlug('seller-0001');
    expect(sf?.id).toBe('sf-seller-0001');
    expect(sf?.resellerId).toBe('rs-seller-0001');
    expect(await store.getById('sf-seller-0001')).toEqual(sf);
  });

  it('an unknown slug is undefined — the honest not-found, never a neighbouring store', async () => {
    const store = new InMemoryStorefrontStore();
    await store.create(SELLER_001);
    expect(await store.getBySlug('aucune-boutique')).toBeUndefined();
  });

  it('a collision never rewrites the slug pointer (write-once) — the first storefront still resolves', async () => {
    const store = new InMemoryStorefrontStore();
    await store.create(SELLER_001);
    const collision = await store.create({ ...SELLER_001, commandId: 'other', name: 'Autre' });
    expect(collision.status).toBe('collision');
    expect((await store.getBySlug('seller-0001'))?.name).toBe('Boutique du fondateur');
  });
});

describe('resolveStorefrontStore — env-gated (no binding ⇒ in-memory, never real storage)', () => {
  it('with no env and with an empty env, returns the in-memory substrate', () => {
    expect(resolveStorefrontStore()).toBeInstanceOf(InMemoryStorefrontStore);
    expect(resolveStorefrontStore({})).toBeInstanceOf(InMemoryStorefrontStore);
  });
});

describe('toStorefrontView — the buyer-safe allowlist projection', () => {
  it('emits exactly the buyer-safe fields, parseable as a canon Storefront, no economics key', async () => {
    const store = new InMemoryStorefrontStore();
    await store.create(SELLER_001);
    const sf = (await store.getBySlug('seller-0001'))!;
    const view = toStorefrontView(sf);
    expect(Object.keys(view).sort()).toEqual(
      [
        'avatar', 'bio', 'category', 'cover', 'createdAt', 'curatedItems', 'discoverable',
        'featuredItems', 'headerStyle', // ENTETES-B — deliberately admitted: presentation, never economics
        'id', 'name', 'productNotes', // VOIX-PRODUIT — deliberately admitted: her recorded voice, ready-only, no economics
        'resellerId', 'sections', 'slug', 'tagline', 'theme', 'updatedAt', 'zone',
      ].sort(),
    );
    expect(() => StorefrontSchema.parse(view)).not.toThrow();
  });
});

describe('VOIX-PRODUIT — what reaches the buyer, and what never does', () => {
  const base = async () => {
    const store = new InMemoryStorefrontStore();
    await store.create(SELLER_001);
    return (await store.getBySlug('seller-0001'))!;
  };

  it('ONLY a ready note WITH a real url crosses to the buyer', async () => {
    const sf = await base();
    const view = toStorefrontView({
      ...sf,
      productNotes: {
        good: { status: 'ready', url: 'https://m/a.m4a', durationMs: 7_400 },
        // In flight: bytes accepted, nothing playable. A row for this on her
        // screen would be a button that does nothing.
        enVol: { status: 'pending', durationMs: 0 },
      },
    });
    expect(Object.keys(view.productNotes)).toEqual(['good']);
    expect(view.productNotes['good']).toEqual({ url: 'https://m/a.m4a', durationMs: 7_400 });
  });

  it('READY WITHOUT A URL IS DROPPED — the status alone is not the test', async () => {
    // Canon permits `url` to be absent while a note is pending, so a filter on
    // `status === 'ready'` alone would ship `url: undefined` to the browser and
    // give her a dead « Écouter la note ». Both halves are checked, and this is
    // the assertion that proves it.
    const sf = await base();
    const view = toStorefrontView({ ...sf, productNotes: { x: { status: 'ready', durationMs: 900 } } });
    expect(view.productNotes).toEqual({});
  });

  it('A STOREFRONT STORED BEFORE THIS FIELD EXISTED STILL RENDERS — the migration is real', async () => {
    // Canon defaults `productNotes` on PARSE, but a shop written before this
    // deploy sits in DO storage as a plain object that never re-parses on read.
    // `Object.entries(undefined)` throws, so without the `?? {}` in the
    // projection this is a 500 on GET /s/{slug} for EVERY pre-existing shop —
    // the vitrine down for all of them, over a feature none of them use.
    const sf = await base();
    const legacy = { ...sf } as Record<string, unknown>;
    delete legacy['productNotes'];
    expect(() => toStorefrontView(legacy as never)).not.toThrow();
    expect(toStorefrontView(legacy as never).productNotes).toEqual({});
  });
});
