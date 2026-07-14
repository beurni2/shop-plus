import { describe, expect, it } from 'vitest';
import {
  projectStores,
  resolvePublishedStore,
  type StoreProjectionEvent,
} from '../src/store-projection.js';

/**
 * SP#001-B — THE ONE PRODUCER obeys the discovery invariants on LIVE data.
 * The five RED-first fixtures: only-discoverable-storefronts-project ·
 * ordering-follows-real-events · unknown-slug-honest-not-found ·
 * verified-renders-only-where-true · stores-never-products (SP-I05 on live data).
 */

// A small realistic event log for SELLER #001 and two neighbours, built the way
// the real aggregate emits: created (unpublished) → published → listings.
const T = (h: number) => `2026-07-14T${String(h).padStart(2, '0')}:00:00.000Z`;

function created(id: string, resellerId: string, name: string, zone: string, slug: string, at: string): StoreProjectionEvent {
  return { type: 'storefront.created', storefrontId: id, resellerId, storeName: name, zone, slug, at };
}
function published(id: string, discoverable: boolean, at: string): StoreProjectionEvent {
  return { type: 'storefront.published', storefrontId: id, discoverable, at };
}
function listed(id: string, listingId: string, hubVerified: boolean, at: string): StoreProjectionEvent {
  return { type: 'listing.published', storefrontId: id, listingId, hubVerified, at };
}
function hidden(id: string, listingId: string, at: string): StoreProjectionEvent {
  return { type: 'listing.auto_hidden', storefrontId: id, listingId, at };
}

describe('projectStores — the live directory projection', () => {
  it('ONLY-DISCOVERABLE-STOREFRONTS-PROJECT: a created-but-unpublished store never appears; unpublishing removes it', () => {
    const events: StoreProjectionEvent[] = [
      created('sf_a', 'res_a', 'CHEZ AÏCHA', 'Rood Woko', 'aicha-4821', T(8)),
      published('sf_a', true, T(9)),
      created('sf_b', 'res_b', 'CHEZ MARIAM', 'Gounghin', 'mariam-2170', T(8)),
      // sf_b is created but NEVER published — it must not project.
      created('sf_c', 'res_c', 'CHEZ FANTA', 'Tanghin', 'fanta-8090', T(8)),
      published('sf_c', true, T(9)),
      published('sf_c', false, T(10)), // unpublished again → removed
    ];
    const stores = projectStores(events);
    expect(stores.map((s) => s.storefrontId)).toEqual(['sf_a']); // ONLY the published, still-discoverable one
    expect(stores.every((s) => s.discoverable)).toBe(true);
  });

  it('ORDERING-FOLLOWS-REAL-EVENTS: order is lastUpdated desc — a later listing event lifts its store above one published later', () => {
    const base: StoreProjectionEvent[] = [
      created('sf_a', 'res_a', 'A', 'Zone', 'a-1', T(8)),
      published('sf_a', true, T(9)), // A last touched at 09:00
      created('sf_b', 'res_b', 'B', 'Zone', 'b-1', T(8)),
      published('sf_b', true, T(10)), // B last touched at 10:00 → B above A
    ];
    expect(projectStores(base).map((s) => s.storefrontId)).toEqual(['sf_b', 'sf_a']);

    // Now a REAL listing event on A at 11:00 lifts A above B — order followed the event, not a baked rank.
    const withListing: StoreProjectionEvent[] = [...base, listed('sf_a', 'l_a1', false, T(11))];
    const ordered = projectStores(withListing);
    expect(ordered.map((s) => s.storefrontId)).toEqual(['sf_a', 'sf_b']);
    expect(ordered[0]?.lastUpdated).toBe(T(11)); // A's lastUpdated moved to the real listing time
  });

  it('productCount and lastUpdated come from live listings — an auto-hidden listing drops from the count and still advances lastUpdated', () => {
    const events: StoreProjectionEvent[] = [
      created('sf_a', 'res_a', 'A', 'Zone', 'a-1', T(8)),
      published('sf_a', true, T(9)),
      listed('sf_a', 'l1', false, T(10)),
      listed('sf_a', 'l2', false, T(11)),
      hidden('sf_a', 'l1', T(12)), // out of stock → auto-hidden (SP1.3)
    ];
    const store = projectStores(events)[0];
    expect(store?.productCount).toBe(1); // l2 live, l1 hidden
    expect(store?.lastUpdated).toBe(T(12)); // the hide is a real update
  });

  it('VERIFIED-RENDERS-ONLY-WHERE-TRUE (SP-I19): verified iff a live listing is hub-verified; a hidden verified listing does not keep the badge lit', () => {
    const unverified = projectStores([
      created('sf_a', 'res_a', 'A', 'Zone', 'a-1', T(8)),
      published('sf_a', true, T(9)),
      listed('sf_a', 'l1', false, T(10)), // stock NOT hub-verified
    ]);
    expect(unverified[0]?.verified).toBe(false); // no badge where it is not true

    const verified = projectStores([
      created('sf_b', 'res_b', 'B', 'Zone', 'b-1', T(8)),
      published('sf_b', true, T(9)),
      listed('sf_b', 'l1', true, T(10)), // hub-verified stock
    ]);
    expect(verified[0]?.verified).toBe(true);

    // The one verified listing is auto-hidden → the badge goes dark (only-where-true).
    const wentDark = projectStores([
      created('sf_c', 'res_c', 'C', 'Zone', 'c-1', T(8)),
      published('sf_c', true, T(9)),
      listed('sf_c', 'l1', true, T(10)),
      hidden('sf_c', 'l1', T(11)),
    ]);
    expect(wentDark[0]?.verified).toBe(false);
  });

  it('STORES-NEVER-PRODUCTS (SP-I05) on live data: the top level is a store collection; a listing never rises to a top-level row', () => {
    const events: StoreProjectionEvent[] = [
      created('sf_a', 'res_a', 'A', 'Zone', 'a-1', T(8)),
      published('sf_a', true, T(9)),
      listed('sf_a', 'l1', false, T(10)),
      listed('sf_a', 'l2', false, T(11)),
    ];
    const stores = projectStores(events);
    expect(stores).toHaveLength(1); // ONE store, not two products
    expect(stores[0]?.storefrontId).toBe('sf_a');
    // every top-level row is a STORE identity, never a listing id
    for (const s of stores) {
      expect(s).toHaveProperty('storeName');
      expect(s).not.toHaveProperty('listingId');
      expect(s).not.toHaveProperty('productName');
    }
  });
});

describe('resolvePublishedStore — vitrine resolution goes real', () => {
  const events: StoreProjectionEvent[] = [
    created('sf_a', 'res_a', 'CHEZ AÏCHA', 'Rood Woko', 'aicha-4821', T(8)),
    published('sf_a', true, T(9)),
    created('sf_b', 'res_b', 'CHEZ MARIAM', 'Gounghin', 'mariam-2170', T(8)),
    // sf_b never published — its slug must NOT resolve.
    created('sf_c', 'res_c', 'BOUTIQUE KADI', 'Dassasgho', 'kadi-5530', T(8)),
    published('sf_c', true, T(9)), // a SECOND published store — a 1-of-5 hack would miss this
  ];

  it('resolves ANY published storefront by its canon slug — TWO different published stores, not a 1-of-5 hack', () => {
    const aicha = resolvePublishedStore(events, 'aicha-4821');
    expect(aicha?.storefrontId).toBe('sf_a');
    expect(aicha?.storeName).toBe('CHEZ AÏCHA');
    // the second published store MUST resolve too — this is what kills the 1-of-5 hack
    const kadi = resolvePublishedStore(events, 'kadi-5530');
    expect(kadi?.storefrontId).toBe('sf_c');
    expect(kadi?.storeName).toBe('BOUTIQUE KADI');
  });

  it('UNKNOWN-SLUG-HONEST-NOT-FOUND: an unknown slug AND a known-but-unpublished slug both resolve to undefined', () => {
    expect(resolvePublishedStore(events, 'inconnu-0000')).toBeUndefined(); // never existed
    expect(resolvePublishedStore(events, 'mariam-2170')).toBeUndefined(); // exists but unpublished
  });
});
