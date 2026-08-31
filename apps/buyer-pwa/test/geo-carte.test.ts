import { describe, expect, it } from 'vitest';
import { GEO_ZOOM, fmtCoords, geoVersMonde, mondeVersGeo, urlTuile } from '../src/geo-carte';

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

  it('tile urls: OSM host pinned, x wraps the antimeridian, y off the globe is null', () => {
    expect(urlTuile(17, 65000, 63000)).toBe('https://tile.openstreetmap.org/17/65000/63000.png');
    // One full world east of tile 10 is tile 10 again.
    expect(urlTuile(17, 10 + 2 ** 17, 63000)).toBe(urlTuile(17, 10, 63000));
    expect(urlTuile(17, -1, 63000)).toBe(urlTuile(17, 2 ** 17 - 1, 63000));
    expect(urlTuile(17, 10, -1)).toBeNull();
    expect(urlTuile(17, 10, 2 ** 17)).toBeNull();
  });

  it('the sheet speaks five decimals — the reference register, display only', () => {
    expect(fmtCoords(OUAGA)).toBe('12.37153, -1.51993');
  });
});
