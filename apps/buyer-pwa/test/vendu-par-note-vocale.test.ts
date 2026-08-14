import { describe, expect, it } from 'vitest';
import { renderC1, renderC6 } from '../src/cliente/screens';
import { clienteProduitReel } from '../src/cliente/seed';
import type { VitrineProduct } from '../src/vitrine/catalog';
import type { ProductVoiceNote } from '../src/vitrine/profile';
import { demoStorefrontPort } from '../src/vitrine/profile';
import type { Storefront } from '@platform/contracts';

/**
 * VENDU-PAR + NOTE-VOCALE (founder, 2026-08-14) — the two sentences, red first:
 *
 * « On the buyer's payment pwa it is written la voix d'Maman, find something
 *   professional and cool. And on vendu par Maman make sure the whole name the
 *   reseller has put is displayed »
 *
 * (1) « Vendu par » showed only the FIRST WORD of the boutique name (the seed
 *     mapping split on spaces) — the whole name SHE typed must display, verbatim.
 * (2) The voice card title hardcoded the elision « La voix d’{first word} » —
 *     wrong French before a consonant (« d’Maman ») and retired outright: the
 *     card now says « Note vocale », the word Ma Vitrine already uses for the
 *     same object (reseller catalog: « Note vocale », « Refaire la note vocale »).
 *
 * The storefront name here is multi-word and consonant-initial ON PURPOSE: it
 * is the exact shape that produced both broken renderings.
 */

const resolved = (await demoStorefrontPort('default').resolve('aicha-4821'))!;
const SF_MAMAN: Storefront = {
  ...resolved.storefront,
  name: 'Chez Maman Couture du Faso',
  curatedItems: ['p1'],
  featuredItems: [],
  sections: [],
};

const PRODUIT: VitrineProduct = {
  pid: 'pv_nom_1',
  name: 'Pagne tissé main',
  priceFcfa: 9_500,
  inStock: true,
  assetRefs: [],
};

const NOTE_PRETE: ProductVoiceNote = {
  status: 'ready',
  url: 'https://svc.example/media/pv_nom_1-voix',
  durationMs: 12_000,
};

describe('VENDU-PAR — the whole boutique name, verbatim, never a first-word cut', () => {
  it('C1 attributes the sale to the FULL name the reseller typed', () => {
    const c1 = renderC1(clienteProduitReel(SF_MAMAN, PRODUIT, undefined).produit, {
      epuise: false,
      sansVoix: true,
    });
    expect(c1).toContain('Vendu par Chez Maman Couture du Faso');
    // and never the truncated attribution the founder photographed
    expect(c1).not.toContain('Vendu par Maman<');
  });

  it('C6 step 1 names the FULL boutique too (verifier: « La prépare votre commande » for a « La … » name)', () => {
    const { produit } = clienteProduitReel(SF_MAMAN, PRODUIT, undefined);
    const c6 = renderC6(produit, { confirmState: 'confirmed', paid: undefined });
    expect(c6).toContain('Chez Maman Couture du Faso prépare votre commande');
    expect(c6).not.toContain('>Maman prépare');
  });
});

describe('NOTE-VOCALE — the card title is the house word, never a broken elision', () => {
  it('the voice card says « Note vocale » and « voix d’ » is gone from C1', () => {
    const { produit } = clienteProduitReel(SF_MAMAN, PRODUIT, NOTE_PRETE);
    const c1 = renderC1(produit, { epuise: false, sansVoix: false });
    expect(c1).toContain('cl-voix-title');
    expect(c1).toContain('Note vocale');
    // the exact broken rendering he reported — « la voix d’Maman » — and its
    // whole family: no name-elided voice label survives anywhere on C1
    expect(c1).not.toContain('voix d’');
    expect(c1).not.toContain("voix d'");
  });

  it('the play control announces the note, not an elided name', () => {
    const { produit } = clienteProduitReel(SF_MAMAN, PRODUIT, NOTE_PRETE);
    const c1 = renderC1(produit, { epuise: false, sansVoix: false });
    expect(c1).toContain('aria-label="Écouter la note vocale"');
  });

  it('the épuisé card carries no broken elision either (same family, same screen)', () => {
    const { produit } = clienteProduitReel(SF_MAMAN, PRODUIT, NOTE_PRETE);
    const c1 = renderC1(produit, { epuise: true, sansVoix: false });
    expect(c1).not.toContain('d’Maman');
    expect(c1).not.toContain("d'Maman");
  });
});
