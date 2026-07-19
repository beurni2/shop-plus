import { describe, expect, it } from 'vitest';
import {
  DEMO_PRODUCT,
  DEMO_RESELLER_SLUG,
  resolveVitrineEntry,
  vitrineJourneyContext,
} from '../src/journey';

/**
 * VITRINE-ENTRY-REACH (fix) — the entry components must be REACHABLE, not only
 * correct. The e2e gate proves the route mounts them; these prove the pure
 * resolution the mount depends on: the product's reseller resolves to its
 * storefront ENTRY on EVERY page, and the direct-landing entry is byte-identical
 * to the round-trip entry (one shape, both arrivals). The bug pinned: a landing
 * that never resolved the reseller rendered no entry at all.
 */
describe('the product reseller resolves to its storefront entry (reachable on every page)', () => {
  it('DEMO_PRODUCT binds to a storefront slug that resolves — her boutique is reachable', () => {
    const entry = resolveVitrineEntry(DEMO_RESELLER_SLUG);
    expect(entry).toBeDefined();
    expect(entry!.slug).toBe('aicha-4821');
    // the product page's reseller and the C-ENT1 anchor name the SAME store
    expect(entry!.shopName).toBe(DEMO_PRODUCT.resellerName);
    expect(entry!.prenom).toBe('Aïcha');
    // her habillage rides the entry — the closed §1.2 laterite palette, not free colours
    expect(entry).toMatchObject({ accent: '#C2571B', on: '#FFF6EC', soft: '#F7E7D8', deep: '#7A340E' });
  });

  it('an unknown reseller slug resolves to nothing — the plain reseller line is the honest fallback', () => {
    expect(resolveVitrineEntry('inconnue-0000')).toBeUndefined();
  });

  it('the round-trip context reuses the SAME entry resolution (one shape, both arrivals)', () => {
    const ctx = vitrineJourneyContext('aicha-4821', 'p3');
    expect(ctx?.vitrine).toEqual(resolveVitrineEntry('aicha-4821'));
    // p3 is the épuisé seed — the round trip carries its out-of-stock fact
    expect(ctx?.product).toMatchObject({ inStock: false });
  });
});
