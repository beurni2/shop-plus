import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ResellerShortCodeSchema,
  computeWaterfall,
  shortCodeToSlug,
} from '@platform/contracts';
import { WORKED_BASELINE_INPUT } from '@shop-plus/commerce-core';
import { DEMO_SHARE_LINK } from '../src/demo/store.js';
import {
  DEMO_SHARE_IDENTITY,
  DEMO_RENDER_DATE,
  ShareCardAuthorityError,
  assertCardAuthoritative,
  composeShareCard,
  frenchDate,
  type ShareCard,
} from '../src/share/hub.js';

/**
 * WO-7.1 Part A — the share hub's card + both links. These pin the snapshot to
 * canon (the RN bundle stays Metro-safe: hub.ts imports no contracts value, so
 * the derive-through-snapshot proof lives HERE, node-side, exactly like
 * seed.json ↔ computeWaterfall), and they hold the S5 money invariants:
 * SP-I03 (no supplier/commission on any customer-facing surface), SP-I19
 * (reseller price snapshot; the signed link is the live-truth authority).
 */

describe('the identity snapshot IS canon (derive-through-snapshot, never hand-authored)', () => {
  it('the frozen /v/{slug} suffix equals canon shortCodeToSlug(shortCode)', () => {
    // The RN-safe plain-data suffix is byte-identical to what canon would emit.
    expect(DEMO_SHARE_IDENTITY.identityLinkSuffix).toBe(
      shortCodeToSlug(DEMO_SHARE_IDENTITY.shortCode),
    );
    expect(DEMO_SHARE_IDENTITY.identityLinkSuffix).toBe('/v/aicha-4821');
  });

  it('her short code is a valid canon ResellerShortCode (public, ASCII, PRENOM-NNNN)', () => {
    expect(ResellerShortCodeSchema.safeParse(DEMO_SHARE_IDENTITY.shortCode).success).toBe(true);
  });

  it('her printed price IS the §5.4 baseline customer price from the pinned waterfall (B + M)', () => {
    // Not a hand-typed 11 500: it is computeWaterfall(WORKED_BASELINE_INPUT).productSubtotal.
    expect(DEMO_SHARE_IDENTITY.priceFcfa).toBe(
      computeWaterfall(WORKED_BASELINE_INPUT).productSubtotal,
    );
  });
});

describe('SP-I03 — the card carries HER economics only; supplier and commission NEVER', () => {
  const card = composeShareCard(DEMO_SHARE_IDENTITY);

  it('the card carries her name, product, price snapshot, both links, and « Livré par Séra »', () => {
    expect(card.resellerName).toBe('Aïcha');
    expect(card.productName).toBe('Bazin riche brodé');
    expect(card.priceFcfa).toBe(11_500);
    expect(card.signedProductLink).toBe(DEMO_SHARE_LINK); // the frozen signed product link
    expect(card.identityLinkSuffix).toBe('/v/aicha-4821');
    expect(card.shortCode).toBe('AICHA-4821');
    expect(card.seraDelivery).toBe(true);
    // WO-7.2a — the price-validity date (« 13 juillet »), the render day.
    expect(card.priceValidityDate).toBe('13 juillet');
  });

  it('no supplier identity, no commission, no split — structurally and in the bytes', () => {
    // Structural: the ShareCard type has no field to carry supplier/commission.
    // @ts-expect-error — supplierId is not a field on ShareCard
    const leak: ShareCard = { ...card, supplierId: 'sup_x' };
    expect(leak.priceFcfa).toBe(11_500);
    // In the bytes: nothing that names the supplier's domain or the reseller's cut.
    expect(JSON.stringify(card)).not.toMatch(
      /supplier|fournisseur|commission|marge|markup|gross|sellerBase|resellerNet|sup_/i,
    );
  });

  it('the checked-in no-supplier-contact gate fixture matches the composed card (pinning)', () => {
    // The standing SP-I03 gate (no-supplier-contact.mjs) scans THIS surface; the
    // fixture is pinned to the real card so the gate can never drift from render.
    const fixture = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../../../gates/fixtures/customer-surfaces/share-card.json'),
        'utf8',
      ),
    );
    expect(card).toEqual(fixture);
  });
});

describe('SP-I19 — the card binds nothing; its authority is the signed live-truth link', () => {
  it('a composed card is authoritative (it carries the signed link)', () => {
    expect(() => assertCardAuthoritative(composeShareCard(DEMO_SHARE_IDENTITY))).not.toThrow();
  });

  it('a price-only card (no signed link) is REFUSED — a printed number is never the authority', () => {
    const priceOnly: ShareCard = { ...composeShareCard(DEMO_SHARE_IDENTITY), signedProductLink: '' };
    expect(() => assertCardAuthoritative(priceOnly)).toThrow(ShareCardAuthorityError);
  });
});

describe('WO-7.2a — the card carries the price-validity hint WITH its render date (SP-I19)', () => {
  it('frenchDate is deterministic (no Intl/locale) — the render day is « {day} {mois} »', () => {
    expect(frenchDate(DEMO_RENDER_DATE)).toBe('13 juillet');
    expect(frenchDate('2026-01-01T00:00:00.000Z')).toBe('1 janvier');
    expect(frenchDate('2026-12-25T00:00:00.000Z')).toBe('25 décembre');
  });

  it('the validity hint renders WITH the render date (« Prix du 13 juillet — … »)', () => {
    // The card carries the date; the copy.md canon string states which day.
    const card = composeShareCard(DEMO_SHARE_IDENTITY);
    const hint = 'Prix du {date} — le lien dit le prix du jour.'.replace('{date}', card.priceValidityDate);
    expect(hint).toBe('Prix du 13 juillet — le lien dit le prix du jour.');
  });

  it('a card with no validity date is REFUSED — the print must say which day it shows', () => {
    const noDate: ShareCard = { ...composeShareCard(DEMO_SHARE_IDENTITY), priceValidityDate: '' };
    expect(() => assertCardAuthoritative(noDate)).toThrow(ShareCardAuthorityError);
  });
});
