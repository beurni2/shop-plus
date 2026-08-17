import { describe, expect, it } from 'vitest';
import {
  ResellerShortCodeSchema,
  computeWaterfall,
  shortCodeToSlug,
} from '@platform/contracts';
import { WORKED_BASELINE_INPUT } from '@shop-plus/commerce-core';
import { DEMO_SHARE_IDENTITY, frenchDate } from '../src/share/hub.js';

/**
 * WO-7.1 Part A — the share hub, REDUCED BY PARTAGER-PRO (founder, 2026-08-15:
 * « remove all the mocks as well and use the real data »). The composed demo
 * card (`composeShareCard`, `assertCardAuthoritative`, the frozen « 13
 * juillet » clock) is gone with the mocked screen; the live card is proven by
 * `test/rendu-partager.test.tsx` on the MOUNTED screen, and the SP-I03 gate
 * fixture (`gates/fixtures/customer-surfaces/share-card.json`) is pinned there
 * too. What this file still holds: the derive-through-snapshot proofs for the
 * demo IDENTITY (the accueil header still renders it — Metro-safe, so the
 * contracts-side derivation is proven HERE, node-side, exactly like
 * seed.json ↔ computeWaterfall) and `frenchDate`, which now dates the REAL
 * card's validity line.
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

describe('frenchDate — the validity line’s clock (now the day she shares, never frozen)', () => {
  it('is deterministic (no Intl/locale) — the render day is « {day} {mois} »', () => {
    expect(frenchDate('2026-07-13T00:00:00.000Z')).toBe('13 juillet');
    expect(frenchDate('2026-01-01T00:00:00.000Z')).toBe('1 janvier');
    expect(frenchDate('2026-12-25T00:00:00.000Z')).toBe('25 décembre');
  });
});
