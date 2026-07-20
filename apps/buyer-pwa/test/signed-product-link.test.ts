import { describe, expect, it } from 'vitest';
import { signedProductSlugFromPath, vitrineSlugFromPath } from '../src/vitrine-link';
import { demoStorefrontPort } from '../src/vitrine/profile';

/**
 * WO-SIGNED-LINK — the signed product deep-link `/s/{slug}` (« the one she
 * sends », §6.2.1 Arrival). These pin the two properties the route depends on:
 * (1) the SAME slug scheme as `/v/` is parsed from the pathname (no second
 * scheme, base-tolerant, cleanly separate from `/v/`); (2) resolution goes
 * through the storefront port, which resolves a privée vitrine too (loi 4 — a
 * privée vitrine isn't listed but its link resolves). The route mount, the
 * arrival attribution, and the three states are driven end-to-end at the REAL
 * `/s/{slug}` route in e2e/signed-link.spec.ts.
 */

describe('signed product deep-link — the /s/{slug} slug scheme (same as /v/, base-tolerant)', () => {
  it('parses the slug from the pathname, tolerant of the deployed base and a trailing slash', () => {
    expect(signedProductSlugFromPath('/s/aicha-4821')).toBe('aicha-4821');
    expect(signedProductSlugFromPath('/shop-plus/s/aicha-4821')).toBe('aicha-4821');
    expect(signedProductSlugFromPath('/shop-plus/s/aicha-4821/')).toBe('aicha-4821');
  });

  it('is undefined off a non-/s/ path (root, directory, the identity path)', () => {
    expect(signedProductSlugFromPath('/shop-plus/')).toBeUndefined();
    expect(signedProductSlugFromPath('/')).toBeUndefined();
    expect(signedProductSlugFromPath('/boutiques')).toBeUndefined();
    // the signed PRODUCT link and the IDENTITY link never cross-match
    expect(signedProductSlugFromPath('/v/aicha-4821')).toBeUndefined();
  });

  it('the identity parser never claims a /s/ path — the two routes stay separate', () => {
    expect(vitrineSlugFromPath('/s/aicha-4821')).toBeUndefined();
    expect(vitrineSlugFromPath('/v/aicha-4821')).toBe('aicha-4821');
  });
});

describe('signed product deep-link — resolution goes through the storefront port (loi 4)', () => {
  it('the demo slug resolves; an unknown/expired slug is honest not-found (undefined)', () => {
    expect(demoStorefrontPort().resolve('aicha-4821')).toBeDefined();
    expect(demoStorefrontPort().resolve('inconnue-0000')).toBeUndefined();
    expect(demoStorefrontPort().resolve('aicha-expiree-9999')).toBeUndefined();
  });

  it('a privée vitrine still resolves — its LINK works though the directory would hide her (loi 4)', () => {
    const publique = demoStorefrontPort('default').resolve('aicha-4821');
    const privee = demoStorefrontPort('private').resolve('aicha-4821');
    // both resolve — the signed link opens the offer either way
    expect(publique).toBeDefined();
    expect(privee).toBeDefined();
    // the ONLY difference is discoverability: the privée store is absent from
    // Découvrir (allBoutiques projects on `discoverable`), but the link resolves.
    expect(publique!.storefront.discoverable).toBe(true);
    expect(privee!.storefront.discoverable).toBe(false);
    // resolution does not depend on discoverability — the product, price, and
    // reputation are identical; only the directory listing differs.
    expect(privee!.storefront.resellerId).toBe(publique!.storefront.resellerId);
    expect(privee!.storefront.name).toBe(publique!.storefront.name);
  });
});
