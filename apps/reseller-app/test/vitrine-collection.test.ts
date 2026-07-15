import { describe, expect, it } from 'vitest';
import {
  DemoVitrineCollection,
  capShareSelection,
  VITRINE_SHARE_CAP,
  type VitrineCollectionPort,
} from '../src/vitrine/collection.js';

/**
 * WO-VITRINE-FLOW — the vitrine-collection SEAM fixtures. The seam is
 * production-shaped (StoreProjectionEvent vocabulary, real /v/ slug, the
 * `resolvePublishedStore` discoverable rule) and demo-fed. These prove the seam
 * BEHAVES like the real listing-membership op — not a direct demo-state mutation.
 *
 * A deterministic clock makes the event log byte-stable.
 */
let tick = 0;
const clock = () => `2026-07-15T00:00:${String(tick++).padStart(2, '0')}.000Z`;
const REAL_SLUG = '/v/aicha-4821'; // the canon shortCodeToSlug identity link (SP#001-B)

const fresh = (): VitrineCollectionPort => {
  tick = 0;
  return new DemoVitrineCollection(REAL_SLUG, clock);
};

describe('WO-VITRINE-FLOW — vitrine-collection seam', () => {
  it('add-writes-collection: addToVitrine goes THROUGH the seam (a listing.published), the collection reflects it', () => {
    const v = fresh();
    expect(v.listings()).toEqual([]); // empty vitrine — the honest start
    v.addToVitrine('p1');
    v.addToVitrine('p2');
    expect(v.has('p1')).toBe(true);
    expect(v.listings().map((l) => l.listingId)).toEqual(['p1', 'p2']);
    // remove is a listing.auto_hidden — the membership op, not a splice
    v.removeFromVitrine('p1');
    expect(v.has('p1')).toBe(false);
    expect(v.listings().map((l) => l.listingId)).toEqual(['p2']);
  });

  it('vitrine-renders-collection: MA VITRINE reads its rows from the seam, not from private state', () => {
    const v = fresh();
    ['p1', 'p2', 'p3', 'p4'].forEach((id) => v.addToVitrine(id));
    v.removeFromVitrine('p3');
    // what the vitrine screen renders === the seam's live listings
    const rendered = v.listings().map((l) => l.listingId);
    expect(rendered).toEqual(['p1', 'p2', 'p4']);
  });

  it('share-cap-≤3: the share selection is capped at 3 (UI-enforced), order preserved', () => {
    expect(VITRINE_SHARE_CAP).toBe(3);
    expect(capShareSelection(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c']);
    expect(capShareSelection(['a', 'b'])).toEqual(['a', 'b']); // under the cap is untouched
    expect(capShareSelection([])).toEqual([]);
  });

  it('share-uses-real-slug: the share link is the REAL /v/ canon slug (SP#001-B), never a fake link', () => {
    const v = fresh();
    expect(v.shareSlug()).toBe(REAL_SLUG);
    expect(v.shareSlug()).toMatch(/^\/v\//); // the canon identity path, not shop-plus.demo/…
  });

  it('discoverable rule mirrors resolvePublishedStore: privée = accessible par lien but NOT in the directory; publique = both', () => {
    const v = fresh();
    // default privée — the link works (accessible par lien), directory does not
    expect(v.isDiscoverable()).toBe(false);
    expect(v.shareSlug()).toBe(REAL_SLUG); // link always valid
    expect(v.resolvesInDirectory()).toBe(false); // resolvePublishedStore → undefined when unpublished
    // publish → publique: now in the directory too
    v.setDiscoverable(true);
    expect(v.isDiscoverable()).toBe(true);
    expect(v.resolvesInDirectory()).toBe(true);
    // toggle back to privée — latest storefront.published wins
    v.setDiscoverable(false);
    expect(v.resolvesInDirectory()).toBe(false);
  });
});
