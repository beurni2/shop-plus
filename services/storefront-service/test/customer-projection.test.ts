import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeWaterfall, type Storefront } from '@platform/contracts';
import { toCustomerProductView, toStorefrontView } from '../src/customer-projection.js';
import { decideCreate } from '../src/storefront-core.js';

// CI gate: no-supplier-contact (SP-I03) — the customer surface never carries
// supplier identity/contact, commission, or seller economics.

const money = computeWaterfall({
  sellerBasePrice: 10_000,
  sellerFundedCommission: 1_000,
  resellerMarkup: 1_500,
  deliveryFee: 1_000,
  paymentMode: 'FULL_PREPAY',
});

const view = toCustomerProductView({
  listingId: 'l_1',
  productVersionId: 'pv_1',
  productName: 'Pagne tissé',
  category: 'fashion',
  resellerId: 'res_1',
  storeName: 'Boutique Mariam',
  money,
  assetRefs: ['asset_hero_1'],
});

const BANNED_KEY = /supplier|commission|sellernet|baseprice|pickup/i;

describe('no-supplier-contact', () => {
  it('the customer view carries the reseller as the relationship and no banned key', () => {
    expect(view.resellerId).toBe('res_1');
    for (const key of Object.keys(view)) {
      expect(key).not.toMatch(BANNED_KEY);
    }
  });

  it('the buyer price is the subtotal — commission is never in the buyer price (§5.4)', () => {
    expect(view.customerPriceFcfa).toBe(11_500);
    expect(view.buyerTotalFcfa).toBe(12_500);
    // and the waterfall itself proves commission is not added on top:
    expect(money.productSubtotal).toBe(10_000 + 1_500);
  });

  it('the checked-in gate fixture matches this projection (pinning)', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../../../gates/fixtures/customer-surfaces/product-view.json'),
        'utf8',
      ),
    );
    expect(view).toEqual(fixture);
  });
});

/**
 * DURCISSEMENT-SERVICE-1 (AUDIT-SHOP-2 F-31) — A RAW PRE-CANON ENTRY STILL
 * PROJECTS. A storefront written before `featuredItems` / `sections` existed
 * sits in DO storage as a plain object that never re-parses on read (canon
 * defaults apply on PARSE only — the `productNotes ?? {}` precedent in the
 * same function). `[...undefined]` THROWS, and a throw on the public read is a
 * 500 for that shop's every buyer. The projection defaults the two fields the
 * way it already defaults the notes.
 */
describe('DURCISSEMENT-SERVICE-1 (F-31) — the buyer projection survives an entry from before featuredItems/sections', () => {
  it('a canon storefront with those fields stripped (the stored pre-canon shape) projects to empty arrays, never a throw', () => {
    const { decision } = decideCreate(undefined, {
      commandId: 'cmd-precanon', id: 'sf-precanon', resellerId: 'rs-precanon', shortCode: 'PRECANON-0001',
      name: 'Boutique d’avant', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-precanon', at: '2026-07-01T08:00:00.000Z',
    });
    if (decision.status !== 'created') throw new Error('fixture: create');
    const stocke = JSON.parse(JSON.stringify(decision.storefront)) as Record<string, unknown>;
    delete stocke['featuredItems'];
    delete stocke['sections'];
    delete stocke['productNotes'];
    const view = toStorefrontView(stocke as unknown as Storefront);
    expect(view.featuredItems).toEqual([]);
    expect(view.sections).toEqual([]);
    expect(view.productNotes).toEqual({});
    expect(view.id).toBe('sf-precanon');
  });
});
