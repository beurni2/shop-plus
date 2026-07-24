import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MockSupplyProjectionSource,
  consumeSupplyProjection,
  customerSurfaceFromSupply,
} from '../src/index.js';

/**
 * SW-2 item 4 — supplier identity NEVER reaches a customer surface on the LIVE
 * path. The customer-surface fixture the no-supplier-contact CI gate scans is
 * PRODUCED by the consumer path here (a fresh projection → the buyer view), so
 * the gate is re-anchored on live data, not a hand-authored surface.
 */

// The same banned key families the no-supplier-contact gate enforces (SP-I03).
const BANNED = [/supplier/i, /commission/i, /seller(net|baseprice|platformfee)/i, /baseprice/i, /pickup/i];

const NOW = '2026-07-14T12:00:00.000Z';

function liveCustomerSurface() {
  const src = new MockSupplyProjectionSource();
  // productName + assetRefs now travel ON the wire (canon v2.0.0); the surface reads
  // them from the parsed projection — no hand-passed name. A single opaque,
  // productVersionId-keyed ref proves the images path carries no supplier identity.
  src.set({ productVersionId: 'pv_o1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4, productName: 'Pagne wax (démo)', assetRefs: ['asset/pv_o1/cover'], asOf: '2026-07-14T11:59:00.000Z', version: 1 });
  const verdict = consumeSupplyProjection(src, 'pv_o1', NOW);
  if (verdict.status !== 'fresh') throw new Error('fixture projection must be fresh');
  return customerSurfaceFromSupply(verdict.projection, { resellerMarkup: 1_200, deliveryFee: 1_000, paymentMode: 'FULL_PREPAY' });
}

describe('no-supplier-contact on the LIVE path', () => {
  it('the customer surface from a live projection carries NO banned key family (recursive scan)', () => {
    const surface = liveCustomerSurface();
    for (const [k, v] of Object.entries(surface)) {
      for (const banned of BANNED) expect(banned.test(k), `key ${k}`).toBe(false);
      // values are a number (price), a string (name), or an array of string refs (images)
      const okType = typeof v === 'number' || typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
      expect(okType, `value for ${k}`).toBe(true);
    }
    // the buyer sees the product name, HER price, and the product's own images — never
    // B, C, or seller economics. assetRefs is a display key, not an identity key.
    expect(Object.keys(surface).sort()).toEqual(['assetRefs', 'customerPriceFcfa', 'productName']);
  });

  it('the checked-in gate fixture IS the live consumer output (pinning — the gate scans real data)', () => {
    const fixture = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../../gates/fixtures/supply/live-customer-surface.json'), 'utf8'),
    );
    expect(liveCustomerSurface()).toEqual(fixture);
  });
});
