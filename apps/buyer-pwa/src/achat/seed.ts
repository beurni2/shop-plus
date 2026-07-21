/**
 * PARCOURS D'ACHAT — the demo seed (the handoff's own product set).
 *
 * The signed page provides `prixClient` (here the seed price) and the shop's
 * identity + theme; the buyer never sees any purchase-side economics (§0 loi 1).
 * These three products are the handoff's exact demo articles (robe / sac épuisé
 * / foulard sans-voix), so the rebuilt screens match the pixel source to the
 * franc and the glyph.
 */

import type { AchatProduit } from './screens';
import type { VitrineThemeKey } from '../vitrine/themes';

/** Product-level fields (the storefront supplies name/prenom/slug/theme). */
type SeedProduit = Omit<AchatProduit, 'shopName' | 'prenom' | 'slug'>;

// `glyph` names a CANON SVG product glyph (the vitrine's set) — NOT an emoji:
// Grand Teint §8 / the no-emoji-in-chrome gate forbid emoji, so the handoff's
// dress/bag/scarf photo placeholders map to the shared line-glyphs, drawn white
// on the product gradient. Real photography replaces the whole placeholder later.
const PRODUITS: Record<string, SeedProduit> = {
  robe: {
    productName: 'Robe brodée bogolan', variant: 'TAILLE M', zone: 'Gounghin · Ouagadougou',
    priceFcfa: 11_500, glyph: 'tissu', photoGrad: '#B65C2E,#7A3014', voiceDuree: '0:12', inStock: true,
  },
  sac: {
    productName: 'Sac cuir artisanal', zone: 'Gounghin · Ouagadougou',
    priceFcfa: 17_000, glyph: 'sac', photoGrad: '#8A4F1D,#5C3210', inStock: false,
  },
  foulard: {
    productName: 'Foulard Faso Dan Fani', zone: 'Gounghin · Ouagadougou',
    priceFcfa: 6_300, glyph: 'foulard', photoGrad: '#A31D4E,#5E0F2C', inStock: true,
  },
};

/** The default offered product (a bare signed link, no pid). */
export const DEFAULT_PID = 'robe';

/** Build the AchatProduit from the resolved storefront + a product id. Unknown
 * pid falls back to the default (the signed link always lands on an offer). */
export function achatProduit(
  storefront: { name: string; slug: string; theme: VitrineThemeKey },
  pid: string,
): { produit: AchatProduit; theme: VitrineThemeKey } {
  const seed = PRODUITS[pid] ?? PRODUITS[DEFAULT_PID]!;
  const prenom = storefront.name.replace(/^Chez\s+/i, '').split(' ')[0] ?? storefront.name;
  return {
    produit: { shopName: storefront.name, prenom, slug: storefront.slug, ...seed },
    theme: storefront.theme,
  };
}

export { PRODUITS };
