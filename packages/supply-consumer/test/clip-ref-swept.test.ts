import { describe, expect, it } from 'vitest';
import { consumeSupplyItem } from '../src/consumer.js';

/**
 * ═══ FOUNDER REPORT (2026-09-12): « on opportunites i no longer see the
 * product with the video » — THE ONE ROAD THAT SINGLED OUT A VIDEO PRODUCT,
 * closed by SWEEP-CLIP-1 (founder, 2026-09-16: « fix the 3 that is still open ») ═══
 *
 * The phone-shape sweep (F-93) scanned every STRING value of a projection for
 * a Burkina number. Photo references ride in an ARRAY (`assetRefs`) and were
 * skipped; the clip's reference (`videoRef`) is a STRING and was scanned. So a
 * clip whose opaque `media/{uuid}` key happened to open on eight digits led by
 * 2, 5, 6 or 7 read as a landline or a mobile, and the WHOLE product was
 * refused (`identity_material_refused`) — silently to her, named only on the
 * operator diagnostic. This file pinned that asymmetry as it stood; it now
 * pins the fix, and the CONTROL that keeps the sweep honest: the same bytes in
 * a field a supplier TYPES are still refused.
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

describe('SWEEP-CLIP-1 — a media reference is not free text: the clip key is never read as a phone number', () => {
  it('a clip key that opens on a phone-shaped run is SERVED, with its video (the founder’s product comes back)', () => {
    const verdict = consumeSupplyItem(value({ videoRef: CLE_MALCHANCEUSE }), NOW);
    expect(verdict.status).toBe('fresh');
    if (verdict.status === 'fresh') expect(verdict.projection.videoRef).toBe(CLE_MALCHANCEUSE);
  });
  it('the SAME bytes as a photo reference pass, as they always did', () => {
    expect(consumeSupplyItem(value({ assetRefs: [CLE_MALCHANCEUSE] }), NOW).status).toBe('fresh');
  });
  it('an ordinary clip key passes (the product keeps its video)', () => {
    const verdict = consumeSupplyItem(value({ videoRef: CLE_ORDINAIRE }), NOW);
    expect(verdict.status).toBe('fresh');
    if (verdict.status === 'fresh') expect(verdict.projection.videoRef).toBe(CLE_ORDINAIRE);
  });
  it('CONTROL — the same phone-shaped run in a field a supplier TYPES (the name) is still refused, closed', () => {
    const verdict = consumeSupplyItem(value({ productName: 'Boubou brodé 70123456' }), NOW);
    expect(verdict.status).toBe('rejected');
    if (verdict.status === 'rejected') expect(verdict.reason).toBe('identity_material_refused');
  });
  it('CONTROL — an identity-shaped KEY is still refused whatever its value', () => {
    const verdict = consumeSupplyItem(value({ supplierPhone: 'x' }), NOW);
    expect(verdict.status).toBe('rejected');
    if (verdict.status === 'rejected') expect(verdict.reason).toBe('identity_material_refused');
  });
});

/**
 * ═══ SWEEP-ID-1 — FOUNDER REPORT (2026-09-16, after SWEEP-CLIP-1 was live):
 * « When I select the category maison on opportunité the product with the
 * video is still not showing » ═══
 *
 * The live check read Boutik+'s own list: the video product is LIVE there,
 * rayon « Maison », stock 5, clip attached. Its product version id begins
 * `b7875351-6d7…` — and « 7875351-6 » is, to the sweep, the mobile 78 75 35 16
 * (a single hyphen is a permitted separator; the « b » before and the « d »
 * after satisfy both bounds). The nine other products' ids happen to carry no
 * such run. Written red first: the founder's exact id shape was refused.
 */
const ID_DU_FONDATEUR = 'b7875351-6d7f-4a2b-8c3d-e5f6a7b8c9d0';

describe('SWEEP-ID-1 — a producer-minted identifier is not free text: the product version id is never read as a phone number', () => {
  it('the founder’s product — its id opening on « 7875351-6 » — is SERVED, with its video', () => {
    const verdict = consumeSupplyItem(value({ productVersionId: ID_DU_FONDATEUR, videoRef: CLE_ORDINAIRE }), NOW);
    expect(verdict.status).toBe('fresh');
    if (verdict.status === 'fresh') {
      expect(verdict.projection.productVersionId).toBe(ID_DU_FONDATEUR);
      expect(verdict.projection.videoRef).toBe(CLE_ORDINAIRE);
    }
  });
  it('an offer version that happens to be phone-shaped is served too (minted, never typed)', () => {
    expect(consumeSupplyItem(value({ offerVersion: '70123456' }), NOW).status).toBe('fresh');
  });
  it('CONTROL — the SAME run in the category (typed by a supplier) is still refused, closed', () => {
    const verdict = consumeSupplyItem(value({ category: 'Maison 7875351-6' }), NOW);
    expect(verdict.status).toBe('rejected');
    if (verdict.status === 'rejected') expect(verdict.reason).toBe('identity_material_refused');
  });
  it('CONTROL — the name still refuses it (the SWEEP-CLIP-1 control holds with the wider skip)', () => {
    const verdict = consumeSupplyItem(value({ productVersionId: ID_DU_FONDATEUR, productName: 'Coiffeuse 78 75 35 16' }), NOW);
    expect(verdict.status).toBe('rejected');
    if (verdict.status === 'rejected') expect(verdict.reason).toBe('identity_material_refused');
  });
});
