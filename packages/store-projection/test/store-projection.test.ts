import { describe, expect, it } from 'vitest';
import {
  resolvePublishedStore,
  type StoreProjectionEvent,
} from '../src/store-projection.js';

/**
 * SP#001-B — THE ONE PRODUCER on LIVE data. DECOUVERTE-RETIREE-1 (SP-I05
 * amended, 2026-09-17): the whole-directory projection and its five directory
 * fixtures are gone with the directory; what stays is one store, by its slug —
 * unknown-slug-honest-not-found · stock assurance only from a hub signal.
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
  // HUB-ASSURANCE-1 — the fixture keeps its boolean argument for readability, but the
  // EVENT now carries provenance: only a real hub signal maps to `'hub'`.
  return { type: 'listing.published', storefrontId: id, listingId, stockAssurance: { source: hubVerified ? 'hub' : 'declared' }, at };
}
function hidden(id: string, listingId: string, at: string): StoreProjectionEvent {
  return { type: 'listing.auto_hidden', storefrontId: id, listingId, at };
}

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

/**
 * HUB-ASSURANCE-1 — DECLARED STOCK MUST NEVER EARN THE BADGE.
 *
 * `verified` renders a check mark and « Vérifiée » beside the shop name on the
 * vitrine, in the same visual language as the ecosystem's own trust marks. Before this change the field was a `hubVerified: boolean`, so « the
 * seller says she has stock » and « the Boutik+ hub confirmed it » set the SAME flag.
 * These assert the distinction a rename could not have carried.
 */
describe('stock assurance — only a hub signal may light the customer-visible badge', () => {
  const base = (id: string): StoreProjectionEvent[] => [
    created(id, `res_${id}`, 'Boutique', 'Ouagadougou', `${id}-1`, T(8)),
    published(id, true, T(9)),
  ];

  it('DECLARED stock counts as a live product but leaves the badge DARK', () => {
    const store = resolvePublishedStore([
      ...base('sf_d'),
      { type: 'listing.published', storefrontId: 'sf_d', listingId: 'l1', stockAssurance: { source: 'declared' }, at: T(10) },
    ], 'sf_d-1');
    expect(store?.productCount).toBe(1); // it is a real, live, sellable product
    expect(store?.verified).toBe(false); // but nobody verified it — no trust mark
  });

  it('a HUB signal lights it', () => {
    const store = resolvePublishedStore([
      ...base('sf_h'),
      { type: 'listing.published', storefrontId: 'sf_h', listingId: 'l1', stockAssurance: { source: 'hub' }, at: T(10) },
    ], 'sf_h-1');
    expect(store?.verified).toBe(true);
  });

  it('MANY declared listings never add up to a badge — assurance does not accumulate', () => {
    const store = resolvePublishedStore([
      ...base('sf_m'),
      { type: 'listing.published', storefrontId: 'sf_m', listingId: 'l1', stockAssurance: { source: 'declared' }, at: T(10) },
      { type: 'listing.published', storefrontId: 'sf_m', listingId: 'l2', stockAssurance: { source: 'declared' }, at: T(11) },
      { type: 'listing.published', storefrontId: 'sf_m', listingId: 'l3', stockAssurance: { source: 'declared' }, at: T(12) },
    ], 'sf_m-1');
    expect(store?.productCount).toBe(3);
    expect(store?.verified).toBe(false);
  });

  it('one HUB listing among declared ones lights it, and hiding that one puts it out again', () => {
    const events: StoreProjectionEvent[] = [
      ...base('sf_x'),
      { type: 'listing.published', storefrontId: 'sf_x', listingId: 'l1', stockAssurance: { source: 'declared' }, at: T(10) },
      { type: 'listing.published', storefrontId: 'sf_x', listingId: 'l2', stockAssurance: { source: 'hub' }, at: T(11) },
    ];
    expect(resolvePublishedStore(events, 'sf_x-1')?.verified).toBe(true);
    // The hub-backed listing goes out of stock; the declared one remains live.
    const after = resolvePublishedStore([...events, { type: 'listing.auto_hidden', storefrontId: 'sf_x', listingId: 'l2', at: T(12) }], 'sf_x-1');
    expect(after?.productCount).toBe(1); // the declared listing is still sellable
    expect(after?.verified).toBe(false); // but the badge goes dark with its evidence
  });
});
