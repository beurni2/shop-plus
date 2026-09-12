import { describe, expect, it } from 'vitest';
import { consumeSupplyItem } from '../src/consumer.js';

/**
 * ═══ FOUNDER REPORT (2026-09-12): « on opportunites i no longer see the
 * product with the video » — THE ONE ROAD THAT SINGLES OUT A VIDEO PRODUCT ═══
 *
 * The phone-shape sweep (F-93) scans every STRING value of a projection for a
 * Burkina number. Photo references ride in an ARRAY (`assetRefs`) and are
 * skipped; the clip's reference (`videoRef`) is a STRING and is scanned. So a
 * clip whose opaque `media/{uuid}` key happens to open on eight digits led by
 * 2, 5, 6 or 7 reads as a landline or a mobile, and the WHOLE product is
 * refused (`identity_material_refused`) — silently to her, named only on the
 * operator diagnostic. The very same bytes in `assetRefs` pass. This pins the
 * asymmetry as it stands; whether the founder's clip carries such a key is a
 * fact of the live feed this test cannot see.
 */
const NOW = '2026-09-12T10:00:00.000Z';
const value = (extra: Record<string, unknown>) => ({
  version: 2,
  asOf: '2026-09-12T09:59:00.000Z',
  value: {
    productVersionId: 'pv_video', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4,
    productName: 'Boubou brodé', assetRefs: [] as string[], category: 'fashion_bags_fabrics', ...extra,
  },
});
// an opaque media key whose first uuid segment is eight digits led by 7 AND
// whose next segment opens on a letter (a digit there reads as « part of a
// longer grouped run » and passes — the lookahead's own bound)
const CLE_MALCHANCEUSE = 'media/70123456-c9e2-4a1b-8d3f-0a1b2c3d4e5f';
const CLE_ORDINAIRE = 'media/7c3d5a1e-2b4f-4c6e-9a8b-1d2e3f4a5b6c';

describe('the clip reference is swept as free text; photo references are not', () => {
  it('a clip key that opens on a phone-shaped run refuses the WHOLE product', () => {
    const verdict = consumeSupplyItem(value({ videoRef: CLE_MALCHANCEUSE }), NOW);
    expect(verdict.status).toBe('rejected');
    if (verdict.status === 'rejected') expect(verdict.reason).toBe('identity_material_refused');
  });
  it('the SAME bytes as a photo reference pass — the asymmetry', () => {
    expect(consumeSupplyItem(value({ assetRefs: [CLE_MALCHANCEUSE] }), NOW).status).toBe('fresh');
  });
  it('an ordinary clip key passes (the product keeps its video)', () => {
    const verdict = consumeSupplyItem(value({ videoRef: CLE_ORDINAIRE }), NOW);
    expect(verdict.status).toBe('fresh');
    if (verdict.status === 'fresh') expect(verdict.projection.videoRef).toBe(CLE_ORDINAIRE);
  });
});
