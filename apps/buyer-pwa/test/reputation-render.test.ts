import { describe, expect, it } from 'vitest';
import { countDeliveredSales } from '@shop-plus/store-projection';
import { reputationText } from '../src/vitrine-view';
import { renderVitrineReady } from '../src/vitrine/render';
import { demoStorefrontPort } from '../src/vitrine/profile';
import { resolveVitrineSlug } from '../src/vitrine-link';
import { demoDeliveredSaleEvents } from '../src/demo-stores';

/**
 * S8 — « N ventes livrées » on the vitrine trust chrome + the directory card.
 * The two render gates the count law owes the screen: hidden-below-floor and
 * badge-only-where-true (SP-I19 adjacency); plus count-exact and never-a-rank at
 * the render.
 */

// The LIVE vitrine surface (PWA-CLEANUP-1 §4: the Grand Teint renderVitrine is
// deleted): réputation renders in src/vitrine/render.ts off the resolved trust.
const resolved = (await demoStorefrontPort('default').resolve('aicha-4821'))!;
const vitrineAt = (count: number): string =>
  renderVitrineReady(resolved.storefront, { ...resolved.trust, deliveredCount: count }, { fromProduct: false });

describe('réputation render — the exact count, verbatim, never a rank', () => {
  it('COUNT-EXACT-VERBATIM (render): the trust chrome + card show exactly the fold count — never one more', () => {
    const trueCount = countDeliveredSales(demoDeliveredSaleEvents(), 'res_aicha');
    const vitrine = vitrineAt(trueCount);
    expect(vitrine).toContain(`<v>${trueCount}</v> ventes livrées par Séra`);
    expect(vitrine).not.toContain(`<v>${trueCount + 1}</v>`); // a +1 render mutation fails here
  });

  it('HIDDEN-BELOW-FLOOR: count 0 renders NO réputation line (floor = 1) — and NAMES the state « Nouvelle vendeuse »', () => {
    const vitrine = vitrineAt(0);
    expect(vitrine).not.toContain('ventes livrées');
    expect(vitrine).not.toMatch(/data-role="reputation"/);
    // BUYER-REAL-HONESTY-1 (founder ruling): the no-history state is EXPLICIT —
    // not blank space (which reads as a broken page), never a borrowed count.
    // `vitrineAt` keeps the demo's 12 reviews, so this asserts the delivered-count
    // half only; the both-zero case is asserted in buyer-real-honesty.test.ts.
    expect(vitrine).not.toContain('Nouvelle vendeuse'); // reviews ≥ 3 ⇒ she HAS earned proof
  });

  it('NO-HISTORY: zero deliveries AND zero reviews renders « Nouvelle vendeuse » — the honest no-history state', () => {
    const vitrine = renderVitrineReady(
      resolved.storefront,
      { deliveredCount: 0, rating: '', reviewCount: 0, demo: false },
      { fromProduct: false },
    );
    expect(vitrine).toContain('Nouvelle vendeuse');
    expect(vitrine).toMatch(/data-role="chip-nouvelle"/);
    // …and it fabricates NOTHING: no count, no rating, no review chip.
    expect(vitrine).not.toContain('ventes livrées');
    expect(vitrine).not.toMatch(/data-role="chip-avis"/);
    expect(vitrine).not.toContain('4,8');
    // the two SYSTEM chips are promises, not history — they stay.
    expect(vitrine).toContain('Livraison Séra vérifiée & scellée');
    expect(vitrine).toContain('Paiement protégé');
  });

  it('BADGE-ONLY-WHERE-TRUE (SP-I19 adjacency): the rendered count IS the fold count — never a fabricated number', () => {
    const events = demoDeliveredSaleEvents();
    // the vitrine identity's count is fold-derived — nothing hard-coded in the view
    const id = resolveVitrineSlug('aicha-4821');
    expect(id?.reputation.count).toBe(countDeliveredSales(events, 'res_aicha'));
  });

  it('NEVER-A-RANK (render): the vitrine states the count and never a reputation ordinal, leaderboard or comparison word — there is no directory to rank her against (DECOUVERTE-RETIREE-1, SP-I05)', () => {
    const vitrine = vitrineAt(47);
    expect(vitrine).toMatch(/ventes livrées/); // the count is present
    expect(vitrine).not.toMatch(/\b(1er|1ère|meilleure?|top ?\d|numéro ?\d|rang|palmarès|classement)\b/i);
    expect(vitrine).not.toMatch(/n°\s*\d|\bsur \d+ (ventes|vendeuses|boutiques)/i);
  });

  it('SINGULAR-AT-1 (French Voice §10.5, bbeb4af): reputationText — « 1 vente livrée » at 1, plural above', () => {
    expect(reputationText(1)).toBe('1 vente livrée'); // correct singular — the FIRST trust state
    expect(reputationText(1)).not.toContain('ventes livrées');
    expect(reputationText(2)).toBe('2 ventes livrées');
    expect(reputationText(47)).toBe('47 ventes livrées');
  });

  // FLAGGED CANON GAP (PWA-CLEANUP-1 report, not fixed here): the LIVE vitrine
  // (src/vitrine/render.ts) renders « {n} ventes livrées par Séra » with NO
  // singular branch at count 1 and NO « démo » marker on demo trust — the S8
  // conformance (bbeb4af) was not ported when the vitrine was redesigned.
  // Founder decision needed: port S8 singular + démo discipline to the live
  // vitrine as its own slice.
});
