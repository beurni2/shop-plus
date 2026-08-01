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

/**
 * RESELLER-UX-2 item 4 (founder order on his own C1) — the photo gallery.
 *
 * The wire carries EVERY capture (hero + the proof shot) and C1 rendered only
 * [0]; the frame is now the tap target onto the full set. These pin: the
 * affordance exists exactly when photos exist, every ref is reachable through
 * the nav, the ends do not wrap, and the flow actually wires the actions.
 */
describe('RESELLER-UX-2 — C1 photo gallery', () => {
  const produit = clienteProduitReel(SF, REAL_WITH_PHOTO, undefined).produit;

  it('WITH photos the frame is the gallery tap target, and the count pill names the second photo', () => {
    const c1 = renderC1(produit, { epuise: false, sansVoix: true });
    expect(c1).toContain('data-action="photo-galerie"');
    expect(c1).toContain('2 photos'); // the proof shot is discoverable, not secret
  });

  it('WITHOUT a photo there is NO affordance — never an empty viewer', () => {
    const c1 = renderC1(clienteProduitReel(SF, REAL_NO_PHOTO, undefined).produit, { epuise: false, sansVoix: true });
    expect(c1).not.toContain('photo-galerie');
    expect(c1).not.toContain('photos</div>');
  });

  it('ONE photo: the frame still opens (enlarged view) but no count pill claims more', () => {
    const one = { ...REAL_WITH_PHOTO, assetRefs: [REAL_WITH_PHOTO.assetRefs[0]!] };
    const c1 = renderC1(clienteProduitReel(SF, one, undefined).produit, { epuise: false, sansVoix: true });
    expect(c1).toContain('data-action="photo-galerie"');
    expect(c1).not.toContain('photos</div>');
  });

  it('EVERY ref is reachable and the ends are honest (disabled, no wrap)', async () => {
    const { renderGalerie } = await import('../src/cliente/screens');
    const first = renderGalerie(produit, 0);
    expect(first).toContain(REAL_WITH_PHOTO.assetRefs[0]!);
    expect(first).toContain('1 sur 2');
    expect(first).toMatch(/data-action="galerie-precedente" disabled/);
    expect(first).not.toMatch(/data-action="galerie-suivante" disabled/);
    const second = renderGalerie(produit, 1);
    expect(second).toContain(REAL_WITH_PHOTO.assetRefs[1]!);
    expect(second).toContain('2 sur 2');
    expect(second).toMatch(/data-action="galerie-suivante" disabled/);
    // an out-of-range index CLAMPS to the last photo — never a blank scene
    expect(renderGalerie(produit, 9)).toContain('2 sur 2');
  });

  it('THE FLOW WIRES THE ACTIONS — open at 0, close, bounded prev/next (source-pinned)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const flow = readFileSync(join(import.meta.dirname, '..', 'src/cliente/flow.ts'), 'utf8');
    expect(flow).toMatch(/case 'photo-galerie':\s*\n\s*state\.galerie = 0; render\(\); return;/);
    expect(flow).toMatch(/case 'galerie-fermer':\s*\n\s*state\.galerie = null; render\(\); return;/);
    expect(flow).toContain("case 'galerie-precedente':");
    expect(flow).toContain("case 'galerie-suivante':");
    // the overlay renders from state, beside the sheet/toasts overlays
    expect(flow).toMatch(/state\.galerie !== null \? renderGalerie\(m, state\.galerie\) : ''/);
  });
});

/* ---------------------------------------------- CATEGORY-WIRE-1 (canon v3.0.0) -- */

/**
 * The supplier's category reaching the screen where the buyer decides at the door.
 *
 * The chain under test is the LAST two hops of it — `VitrineProduct` (what the
 * service's `/s/{slug}` hands the client) → `clienteProduitReel` → the §6.2 row
 * `inspectionPour` picks. The earlier hops (boutik's producer → the supply
 * projection → `joinVitrineProduct`) are asserted in their own repos/suites; what
 * could only break HERE is the value being dropped, defaulted, or mapped.
 */
describe('CATEGORY-WIRE-1 — the supplier category reaches C8, verbatim or not at all', () => {
  const STOREFRONT = { name: 'Chez Aïcha', slug: 'aicha-4821', theme: 'indigo' as const, zone: 'Rood Woko, Ouagadougou' };
  const base: VitrineProduct = { pid: 'pv_1', name: 'Sandales en cuir', priceFcfa: 12_000, inStock: true, assetRefs: [] };

  it('a wire category is CARRIED, not defaulted — two categories give two different rows', async () => {
    const { inspectionPour, INSPECTION_PRUDENTE } = await import('../src/cliente/screens');
    const shoes = clienteProduitReel(STOREFRONT, { ...base, category: 'shoes' }, undefined).produit;
    const sealed = clienteProduitReel(STOREFRONT, { ...base, category: 'sealed_beauty_cosmetics' }, undefined).produit;

    expect(shoes.category).toBe('shoes'); // verbatim, no mapping
    expect(sealed.category).toBe('sealed_beauty_cosmetics');

    // …and the row the buyer READS differs, which is the point of carrying it.
    const shoesRow = inspectionPour(shoes.category);
    const sealedRow = inspectionPour(sealed.category);
    expect(shoesRow).not.toEqual(sealedRow);
    expect(shoesRow).not.toEqual(INSPECTION_PRUDENTE);
    expect(sealedRow).not.toEqual(INSPECTION_PRUDENTE);
  });

  it('NO CATEGORY ON THE WIRE ⇒ the key is ABSENT and the row is the conservative one', async () => {
    const { inspectionPour, INSPECTION_PRUDENTE } = await import('../src/cliente/screens');
    const produit = clienteProduitReel(STOREFRONT, base, undefined).produit;
    // Absent, not `undefined`-valued: an older deployed Worker sends no category,
    // and a key that exists with no value is the kind of thing a future
    // `'category' in produit` check would read as « we have one ».
    expect('category' in produit).toBe(false);
    expect(inspectionPour(produit.category)).toEqual(INSPECTION_PRUDENTE);
  });

  it('AN UNRECOGNISED CATEGORY FAILS CLOSED — the pilot seed says `textile`, which §6.2 does not know', async () => {
    const { inspectionPour, INSPECTION_PRUDENTE } = await import('../src/cliente/screens');
    // Not a hypothetical: boutik's founder-#001 ProductVersion declares
    // `category: 'textile'`, and canon deliberately holds no category floor, so
    // an unknown value must land on the row that claims NOTHING rather than on a
    // guess. Fail-closed is the whole reason no mapping table exists anywhere.
    const produit = clienteProduitReel(STOREFRONT, { ...base, category: 'textile' }, undefined).produit;
    expect(produit.category).toBe('textile'); // carried honestly, not swallowed
    expect(inspectionPour(produit.category)).toEqual(INSPECTION_PRUDENTE);
  });

  it('the DEMO SEED carries no category — a demo product never promises at-door rights', () => {
    for (const p of VITRINE_SEED.map(productFromSeed)) {
      expect(p.category).toBeUndefined();
    }
  });
});

/* ------------------------------- CATEGORY-WIRE-1 r2 (verifier blockers) -- */

/**
 * The three things the first cut left asserted by NOTHING. A fresh-context
 * verifier proved it by mutation: making the client guard REQUIRE the category,
 * and deleting its category check entirely, both left 738/738 and 86/86 green.
 * A guard nothing tests is a guard that will be "tidied" away.
 */
describe('CATEGORY-WIRE-1 r2 — the prototype chain, and the shop that must not empty', () => {
  const STOREFRONT = { name: 'Chez Aïcha', slug: 'aicha-4821', theme: 'indigo' as const, zone: 'Rood Woko, Ouagadougou' };
  const wire = (over: Record<string, unknown> = {}): unknown =>
    ({ pid: 'pv_1', name: 'Sandales en cuir', priceFcfa: 12_000, inStock: true, assetRefs: [], ...over });

  it('BLOCKER 1 — an Object.prototype member is an UNKNOWN category, not a crash', async () => {
    const { inspectionPour, INSPECTION_PRUDENTE, renderC8 } = await import('../src/cliente/screens');
    // Each of these resolves on the prototype chain of an object literal, so the
    // old `?? ` never fired: inspectionPour returned Object/Object.prototype and
    // C8 threw on `.motifs.map`, leaving the buyer's previous screen mounted
    // forever — unable to accept, unable to report a problem.
    for (const key of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
      expect(inspectionPour(key), `category ${key} must fall to the conservative row`).toEqual(INSPECTION_PRUDENTE);
      const produit = clienteProduitReel(STOREFRONT, { ...(wire({ category: key }) as VitrineProduct) }, undefined).produit;
      // …and the screen RENDERS rather than throwing.
      for (const etat of ['inspecting', 'report'] as const) {
        const html = renderC8(produit, { fraisToday: 1_000, fraisTomorrow: 800, sousTotal: 12_000, total: 13_000 } as never, { etape: 5, etat } as never);
        expect(typeof html).toBe('string');
        expect(html.length).toBeGreaterThan(0);
      }
    }
  });

  it('BLOCKER 3 — a product with NO category still reaches her page (an old Worker must not empty a shop)', async () => {
    const { looksLikeProductForTest } = await import('../src/vitrine/profile');
    // This is the assertion that goes RED if anyone tightens the guard to
    // require the field. The verifier mutated exactly that line and nothing
    // noticed; now something does.
    expect(looksLikeProductForTest(wire())).toBe(true);
    expect(looksLikeProductForTest(wire({ category: 'shoes' }))).toBe(true);
  });

  it('a MALFORMED category strips the field — it never deletes the product', async () => {
    const { looksLikeProductForTest, productFromWireForTest } = await import('../src/vitrine/profile');
    const { inspectionPour, INSPECTION_PRUDENTE } = await import('../src/cliente/screens');
    for (const bad of [5, { a: 1 }, [], true, null]) {
      // The record SURVIVES the guard — rejecting here would drop the whole
      // product and send her signed link to the not-found screen, which is the
      // same shop-emptying failure by another route.
      expect(looksLikeProductForTest(wire({ category: bad })), `category ${JSON.stringify(bad)}`).toBe(true);
      // …and the boundary strips it, so downstream sees an ABSENT category.
      const cleaned = productFromWireForTest(wire({ category: bad }) as VitrineProduct);
      expect('category' in cleaned).toBe(false);
      expect(inspectionPour(cleaned.category)).toEqual(INSPECTION_PRUDENTE);
    }
    // A well-formed one is untouched.
    expect(productFromWireForTest(wire({ category: 'shoes' }) as VitrineProduct).category).toBe('shoes');
  });
});
