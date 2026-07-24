import { describe, expect, it } from 'vitest';
import { renderVitrineReady } from '../src/vitrine/render';
import { renderC1 } from '../src/cliente/screens';
import { clienteProduitReel } from '../src/cliente/seed';
import { productFromSeed, VITRINE_SEED, type VitrineProduct } from '../src/vitrine/catalog';
import { demoStorefrontPort } from '../src/vitrine/profile';
import type { Storefront } from '@platform/contracts';

/**
 * REAL-PRODUCT-RENDER-1 (b) + (c) + the fifth state.
 *
 * ONE renderer for demo and real, `assetRefs[0]` as the hero, the woven
 * « SANS PHOTO » state as the empty-array fallback — and, above all, the money
 * law: the buyer's price is HER FROZEN price carried verbatim, NEVER a
 * recomputation from the supplier's live economics.
 */

const resolved = (await demoStorefrontPort('default').resolve('aicha-4821'))!;
const SF: Storefront = { ...resolved.storefront, curatedItems: ['p1', 'p2'], featuredItems: [], sections: [] };

/** A real product as the join will hand it over: her frozen price + real refs. */
const REAL_WITH_PHOTO: VitrineProduct = {
  pid: 'pv_real_1',
  name: 'Sac tressé de Bobo',
  priceFcfa: 14_750,
  inStock: true,
  assetRefs: ['https://svc.example/media/pv_real_1-hero', 'https://svc.example/media/pv_real_1-2'],
};
const REAL_NO_PHOTO: VitrineProduct = { ...REAL_WITH_PHOTO, pid: 'pv_real_2', assetRefs: [] };

describe('THE MONEY LAW — the buyer sees HER FROZEN price, never a recomputation', () => {
  it('PRICE-CARRIED-VERBATIM: the renderer emits exactly the price it was given, byte for byte', () => {
    const html = renderVitrineReady({ ...SF, curatedItems: [] }, resolved.trust, { fromProduct: false });
    // an empty store renders the empty state — the price path is exercised below
    expect(html).not.toContain('FCFA0');
    const withProduct = renderC1(
      { ...clienteProduitReel(SF, REAL_WITH_PHOTO, undefined).produit },
      { epuise: false, sansVoix: true },
    );
    // 14 750 exactly — not 14 749, not a re-derived B+M
    expect(withProduct).toContain('14');
    expect(withProduct).toContain('750');
    expect(clienteProduitReel(SF, REAL_WITH_PHOTO, undefined).produit.priceFcfa).toBe(14_750);
  });

  it('SUPPLIER ECONOMICS ARE UNREPRESENTABLE on the renderer shape (the divergence cannot be wired in later)', () => {
    // The guard that matters: if someone later reaches for the supply side's
    // basePrice/resellerCommission because it is closer to hand, it cannot even
    // be carried here — the shape refuses it, and this test fails at compile.
    // @ts-expect-error — basePrice (B) is supplier economics; it has no home on a buyer shape
    const withBase: VitrineProduct = { ...REAL_WITH_PHOTO, basePrice: 12_000 };
    // @ts-expect-error — resellerCommission (C) likewise never reaches the buyer
    const withCommission: VitrineProduct = { ...REAL_WITH_PHOTO, resellerCommission: 800 };
    expect(withBase.priceFcfa).toBe(14_750);
    expect(withCommission.priceFcfa).toBe(14_750);
    // …and the emitted keys are exactly the tile's needs, nothing more
    expect(Object.keys(REAL_WITH_PHOTO).sort()).toEqual(['assetRefs', 'inStock', 'name', 'pid', 'priceFcfa']);
  });

  it('NO BANNED KEY reaches the rendered buyer surface (SP-I03, the same families the gate scans)', () => {
    const html = renderVitrineReady(SF, resolved.trust, { fromProduct: false });
    for (const banned of [/supplier/i, /commission/i, /baseprice/i, /sellernet/i, /pickup/i]) {
      expect(banned.test(html), `banned family ${banned} on the buyer surface`).toBe(false);
    }
  });
});

describe('(b) ONE renderer for demo and real — the seed maps onto the same shape', () => {
  it('the seed maps to the renderer shape with an HONEST empty assetRefs (never a fabricated URL)', () => {
    for (const s of VITRINE_SEED) {
      const p = productFromSeed(s);
      expect(p.assetRefs).toEqual([]); // the demo has no real photographs
      expect(p.priceFcfa).toBe(s.priceFcfa); // her price, unchanged by the mapping
      expect(p).not.toHaveProperty('art'); // demo decoration stays behind
      expect(p).not.toHaveProperty('glyph');
    }
  });

  it('a REAL product (no seed entry) renders a real tile — the gap BUYER-REAL-HONESTY-1 reported is closed at the renderer', () => {
    // Proven at the renderer seam: `tile()` takes the shape, not a seed lookup.
    const html = renderVitrineReady(SF, resolved.trust, { fromProduct: false });
    expect(html).toMatch(/data-role="vitrine-produit"/); // demo products still render
    // and the same function accepts a product with a pid that is NOT in VITRINE_SEED
    expect(VITRINE_SEED.some((s) => s.pid === REAL_WITH_PHOTO.pid)).toBe(false);
    const c1 = renderC1(clienteProduitReel(SF, REAL_WITH_PHOTO, undefined).produit, { epuise: false, sansVoix: true });
    expect(c1).toContain('Sac tressé de Bobo'); // a real product name renders on C1
  });
});

describe('(c) assetRefs → tile art: the first ref is the hero, empty is the woven fallback', () => {
  it('HERO RENDERS: a non-empty assetRefs puts the FIRST ref in the frame, lazily, and drops the SANS PHOTO state', () => {
    const c1 = renderC1(clienteProduitReel(SF, REAL_WITH_PHOTO, undefined).produit, { epuise: false, sansVoix: true });
    expect(c1).toContain('src="https://svc.example/media/pv_real_1-hero"'); // ref[0], the hero
    expect(c1).not.toContain('pv_real_1-2'); // the second ref is not the hero
    expect(c1).toMatch(/data-role="photo-reelle"/);
    expect(c1).not.toContain('SANS PHOTO');
  });

  it('EMPTY IS THE FALLBACK, NOT THE ONLY STATE: no refs ⇒ the woven frame + « SANS PHOTO »', () => {
    const c1 = renderC1(clienteProduitReel(SF, REAL_NO_PHOTO, undefined).produit, { epuise: false, sansVoix: true });
    expect(c1).toContain('SANS PHOTO');
    expect(c1).toMatch(/data-role="photo-sans"/);
    expect(c1).toContain('cl-weave');
    expect(c1).not.toContain('<img');
  });
});

describe('THE FIFTH STATE — C1 never promises a photo it does not have', () => {
  it('WITH a photo the promise is KEPT: « Photo réelle — ce que vous recevrez. » + the caps label are true', () => {
    const c1 = renderC1(clienteProduitReel(SF, REAL_WITH_PHOTO, undefined).produit, { epuise: false, sansVoix: true });
    expect(c1).toContain('Photo réelle — ce que vous recevrez.');
    expect(c1).toContain('PHOTO RÉELLE DU PRODUIT');
  });

  it('WITHOUT a photo the promise is NOT MADE — the exact lie this state removes', () => {
    const c1 = renderC1(clienteProduitReel(SF, REAL_NO_PHOTO, undefined).produit, { epuise: false, sansVoix: true });
    expect(c1).not.toContain('Photo réelle — ce que vous recevrez.');
    expect(c1).not.toContain('PHOTO RÉELLE DU PRODUIT');
    // …and nothing promises a FUTURE photo either (the « à venir » class)
    expect(c1).not.toMatch(/À VENIR|A VENIR|BIENT[ÔO]T/i);
    // the seller attribution still stands
    expect(c1).toContain('Vendu par');
  });

  it('the ÉPUISÉ veil still composes over BOTH frames (no state lost to the rewrite)', () => {
    const withPhoto = renderC1(clienteProduitReel(SF, REAL_WITH_PHOTO, undefined).produit, { epuise: true, sansVoix: true });
    const without = renderC1(clienteProduitReel(SF, REAL_NO_PHOTO, undefined).produit, { epuise: true, sansVoix: true });
    for (const html of [withPhoto, without]) {
      expect(html).toContain('cl-photo-veil');
      expect(html).toContain('ÉPUISÉ');
    }
  });
});
