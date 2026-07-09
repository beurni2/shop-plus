import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  StoreDiscoveryResponseSchema,
  buildStoreDiscoveryResponse,
  type StorePreview,
} from '../src/discovery.js';

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
