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

  /**
   * Audit H2 — the order is FRENCH-AWARE without the runtime's collation
   * tables. `localeCompare(x,'fr')` delegates to ICU, which differs across
   * runtimes (workerd vs Node vs an upgrade) — the « deterministic » SP-I11
   * order could silently differ between the deployed Worker and the CI that
   * certified it. The comparator now folds accents/case via Unicode NFD
   * (engine-stable by spec) with a raw tiebreak. These pin the two properties
   * a naive codepoint sort loses: accents sort WITH their base letter, and
   * case does not split the alphabet.
   */
  it('accented names sort beside their base letters, never after Z (audit H2)', () => {
    const zone = 'Dassasgho';
    const mk = (id: string, storeName: string): StorePreview => ({
      storefrontId: id, resellerId: `res-${id}`, storeName, zone,
    });
    const r = buildStoreDiscoveryResponse([
      mk('sf_a', 'Zanré Style'),
      mk('sf_b', 'Épicerie du Marché'), // U+00C9 > 'Z' by codepoint — a naive sort puts it LAST
      mk('sf_c', 'Etoile Boutique'),
      mk('sf_d', 'aïcha couture'),      // lowercase + diaeresis — a naive sort splits it from 'Aicha'
      mk('sf_e', 'Aicha Mode'),
    ]);
    expect(r.stores.map((s) => s.storeName)).toEqual([
      'aïcha couture', // folds to « aicha couture » — before « aicha mode »
      'Aicha Mode',
      'Épicerie du Marché',
      'Etoile Boutique',
      'Zanré Style',
    ]);
  });

  it('two names equal after folding still order totally (raw tiebreak, never a coin flip)', () => {
    const zone = 'Gounghin';
    const mk = (id: string, storeName: string): StorePreview => ({
      storefrontId: id, resellerId: `res-${id}`, storeName, zone,
    });
    const a = buildStoreDiscoveryResponse([mk('sf_1', 'Awa'), mk('sf_2', 'AWA'), mk('sf_3', 'awa')]);
    const b = buildStoreDiscoveryResponse([mk('sf_3', 'awa'), mk('sf_1', 'Awa'), mk('sf_2', 'AWA')]);
    expect(a).toEqual(b);
    expect(a.stores.map((s) => s.storeName)).toEqual(['AWA', 'Awa', 'awa']);
  });

  it('the comparator never reaches for the runtime collation tables (no localeCompare call in the module)', () => {
    // Comments stripped first: the header documents WHY localeCompare left,
    // so the word may appear in prose — never as a call.
    const src = readFileSync(join(import.meta.dirname, '../src/discovery.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toContain('localeCompare');
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
    { type: 'listing.published', storefrontId: 'sf_a', listingId: 'l_a1', stockAssurance: { source: 'hub' }, at: T(10) },
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
