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
        'featuredItems', 'id', 'name', 'resellerId', 'sections', 'slug', 'tagline', 'theme', 'updatedAt', 'zone',
      ].sort(),
    );
    expect(() => StorefrontSchema.parse(view)).not.toThrow();
  });
});
