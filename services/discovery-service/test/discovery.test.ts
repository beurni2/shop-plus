import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  StoreDiscoveryResponseSchema,
  buildStoreDiscoveryResponse,
  projectStoreDiscovery,
  type StorePreview,
} from '../src/discovery.js';
import type { StoreProjectionEvent } from '@shop-plus/store-projection';

// CI gate: discovery-returns-stores (SP-I05) + deterministic order (SP-I11).

const stores: StorePreview[] = [
  { storefrontId: 'sf_2', resellerId: 'res_2', storeName: 'Chez Awa', zone: 'Gounghin' },
  {
    storefrontId: 'sf_1',
    resellerId: 'res_1',
    storeName: 'Boutique Mariam',
    zone: 'Dassasgho',
    matchingItemPreviews: [{ listingId: 'l_1', productName: 'Pagne tissé', customerPriceFcfa: 11_500 }],
  },
  { storefrontId: 'sf_3', resellerId: 'res_3', storeName: 'Aïcha Mode', zone: 'Dassasgho' },
];

describe('discovery-returns-stores', () => {
  it('the response is a store collection — top level carries stores, never products', () => {
    const r = buildStoreDiscoveryResponse(stores);
    expect(Object.keys(r)).toEqual(['stores']);
    for (const s of r.stores) {
      expect(s.storefrontId).toBeTruthy();
      expect(s.resellerId).toBeTruthy();
      expect(s.storeName).toBeTruthy();
    }
  });

  it('a flat product pool does not parse as a discovery response (strict schema)', () => {
    const flatPool = {
      products: [{ productVersionId: 'pv_1', name: 'Pagne tissé', price: 11_500 }],
    };
    expect(StoreDiscoveryResponseSchema.safeParse(flatPool).success).toBe(false);
  });

  it('ordering is deterministic: zone, then name — same input, same output', () => {
    const a = buildStoreDiscoveryResponse(stores);
    const b = buildStoreDiscoveryResponse([...stores].reverse());
    expect(a).toEqual(b);
    expect(a.stores.map((s) => s.storeName)).toEqual(['Aïcha Mode', 'Boutique Mariam', 'Chez Awa']);
  });

  it('the checked-in gate fixture matches this builder (pinning)', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../../../gates/fixtures/discovery/stores-response.json'),
        'utf8',
      ),
    );
    expect(buildStoreDiscoveryResponse(stores)).toEqual(fixture);
  });
});

describe('projectStoreDiscovery — fed by THE ONE PRODUCER (SP#001-B, live events)', () => {
  const T = (h: number) => `2026-07-14T${String(h).padStart(2, '0')}:00:00.000Z`;
  const events: StoreProjectionEvent[] = [
    { type: 'storefront.created', storefrontId: 'sf_a', resellerId: 'res_a', storeName: 'Aïcha Mode', zone: 'Dassasgho', slug: 'aicha-4821', at: T(8) },
    { type: 'storefront.published', storefrontId: 'sf_a', discoverable: true, at: T(9) },
    { type: 'listing.published', storefrontId: 'sf_a', listingId: 'l_a1', hubVerified: true, at: T(10) },
    { type: 'storefront.created', storefrontId: 'sf_b', resellerId: 'res_b', storeName: 'Boutique Mariam', zone: 'Dassasgho', slug: 'mariam-2170', at: T(8) },
    { type: 'storefront.published', storefrontId: 'sf_b', discoverable: true, at: T(9) },
    { type: 'storefront.created', storefrontId: 'sf_hidden', resellerId: 'res_h', storeName: 'Pas Publiée', zone: 'Gounghin', slug: 'cachee-0000', at: T(8) },
    // sf_hidden is created but NEVER published — must not appear in discovery.
  ];

  it('only DISCOVERABLE storefronts project, and the top level is a store collection (SP-I05, live)', () => {
    const r = projectStoreDiscovery(events);
    expect(Object.keys(r)).toEqual(['stores']);
    expect(r.stores.map((s) => s.storefrontId).sort()).toEqual(['sf_a', 'sf_b']); // sf_hidden absent
    for (const s of r.stores) {
      expect(s.storefrontId).toBeTruthy();
      expect(s.resellerId).toBeTruthy();
      expect(s).not.toHaveProperty('productName'); // never a product row
    }
  });

  it('keeps the deterministic zone→name→id envelope order over the producer output', () => {
    const r = projectStoreDiscovery(events);
    // both in Dassasgho → ordered by store name: "Aïcha Mode" before "Boutique Mariam"
    expect(r.stores.map((s) => s.storeName)).toEqual(['Aïcha Mode', 'Boutique Mariam']);
  });
});
