import { describe, expect, it } from 'vitest';
import { GEO_ZOOM, baseTuiles, fmtCoords, geoVersMonde, mondeVersGeo, normaliserBase, urlTuile } from '../src/geo-carte';

/**
 * GEO-CARTE-PRO — the drag-map's arithmetic, pinned by value. The view's
 * whole honesty rests on this inverse pair: the pixels her finger moved
 * become the coordinates the sheet shows and the confirm keeps, so a broken
 * projection would hand her livreur a WRONG DOOR while every face looked
 * right. (The driven drag itself — press, move, release, the commit on the
 * wire — lives in the e2e walks; this file holds the numbers.)
 */
describe('geo-carte — Web-Mercator forward/inverse', () => {
  const OUAGA = { lat: 12.371532, lng: -1.519931 };

  it('roundtrips her fix to within a millimetre-class error', () => {
    const m = geoVersMonde(OUAGA.lat, OUAGA.lng, GEO_ZOOM);
    const back = mondeVersGeo(m.x, m.y, GEO_ZOOM);
    expect(Math.abs(back.lat - OUAGA.lat)).toBeLessThan(1e-9);
    expect(Math.abs(back.lng - OUAGA.lng)).toBeLessThan(1e-9);
  });

  it('axes point the right way: east grows x, NORTH SHRINKS y (the y-flip a sign error would invert)', () => {
    const m = geoVersMonde(OUAGA.lat, OUAGA.lng, GEO_ZOOM);
    const est = geoVersMonde(OUAGA.lat, OUAGA.lng + 0.01, GEO_ZOOM);
    const nord = geoVersMonde(OUAGA.lat + 0.01, OUAGA.lng, GEO_ZOOM);
    expect(est.x).toBeGreaterThan(m.x);
    expect(nord.y).toBeLessThan(m.y);
  });

  it('a 100 px eastward drag of the MAP moves the centre ~120 m WEST at z17 — the subtraction, by value', () => {
    // The tile layer translating +100 px means the town slid right under the
    // fixed pin: the centre the sheet must speak lies WEST of the fix.
    const c = geoVersMonde(OUAGA.lat, OUAGA.lng, GEO_ZOOM);
    const apres = mondeVersGeo(c.x - 100, c.y, GEO_ZOOM);
    expect(apres.lng).toBeLessThan(OUAGA.lng);
    // z17 world = 256·2^17 px for 360° ⇒ ~1.07e-5 °/px ⇒ 100 px ≈ 1.07e-3 °.
    expect(Math.abs(apres.lng - OUAGA.lng)).toBeCloseTo(100 * (360 / (256 * 2 ** 17)), 9);
    expect(apres.lat).toBeCloseTo(OUAGA.lat, 9);
  });

  /**
   * TUILES-PROXY (AUDIT-SHOP-2 F-24) — the tiles come through OUR Worker
   * (`GET {base}/tiles/{z}/{x}/{y}.png`), never straight from the tile host:
   * a direct ask sent her area (~300 m) and her IP to a third party under a
   * sentence that promised the point to her rider alone. The base is the one
   * the quote port and the liste already read; without it there is no proxy
   * to ask, and no tiles is the calm ground — her position is the FIX.
   */
  it('tile urls: through OUR Worker in the proxy path shape, x wraps the antimeridian, y off the globe is null', () => {
    const B = 'https://svc.test';
    expect(urlTuile(B, 17, 65000, 63000)).toBe('https://svc.test/tiles/17/65000/63000.png');
    // One full world east of tile 10 is tile 10 again.
    expect(urlTuile(B, 17, 10 + 2 ** 17, 63000)).toBe(urlTuile(B, 17, 10, 63000));
    expect(urlTuile(B, 17, -1, 63000)).toBe(urlTuile(B, 17, 2 ** 17 - 1, 63000));
    expect(urlTuile(B, 17, 10, -1)).toBeNull();
    expect(urlTuile(B, 17, 10, 2 ** 17)).toBeNull();
    // The tile host is never named by the buyer bundle: a url without a base is no url.
    expect(urlTuile(null, 17, 10, 10)).toBeNull();
    expect(urlTuile(B, 17, 10, 10)).not.toContain('openstreetmap');
  });

  describe('the proxy base — the same env the quote port reads', () => {
    // The env read itself (`import.meta.env.VITE_STOREFRONT_BASE`, inlined by
    // Vite at build) is proven where it is real: the real-path browser build in
    // `e2e/checkout-real.spec.ts`, which sets the base and watches the tiles
    // go to it. Here the RULE is pinned by value, and the unit run's own truth:
    it('unset (a demo build, this unit run): no base, so no tile is ever asked for', () => {
      expect(baseTuiles()).toBeNull();
      expect(normaliserBase(undefined)).toBeNull();
      expect(normaliserBase('')).toBeNull();
    });
    it('set: the base, with any trailing slash trimmed so the path joins once', () => {
      expect(normaliserBase('https://svc.test/')).toBe('https://svc.test');
      expect(normaliserBase('https://svc.test')).toBe('https://svc.test');
      expect(urlTuile(normaliserBase('http://127.0.0.1:9099/api'), GEO_ZOOM, 1, 2)).toBe('http://127.0.0.1:9099/api/tiles/17/1/2.png');
    });
  });

  it('the sheet speaks five decimals — the reference register, display only', () => {
    expect(fmtCoords(OUAGA)).toBe('12.37153, -1.51993');
  });
});
