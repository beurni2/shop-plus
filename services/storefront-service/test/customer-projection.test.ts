import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeWaterfall } from '@platform/contracts';
import { toCustomerProductView } from '../src/customer-projection.js';

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
