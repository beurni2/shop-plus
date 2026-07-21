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
import type { VitrineSeedProduct } from '../vitrine/catalog';
import type { ProductVoiceNote } from '../vitrine/profile';

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

/* ---------------------------------------------------------------- REAL -- */

/** « 0:01 » from a note's durationMs (mm:ss). */
function dureeLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * BUG 3 fix — a REAL signed link (`/s/{slug}?pid={pid}`) resolves the pid
 * against the RESELLER'S ACTUAL vitrine catalog (`seedProduct`), NOT the
 * 3-product demo seed. This maps that real product (name · HER price · art ·
 * stock) plus its real voice note into the achat S1 renderer, so a shared
 * product opens as ITSELF — the robe only appears when the robe is shared.
 * The 3-product `achatProduit` above stays for the `?demo-achat=` harness only.
 */
export function achatProduitReel(
  storefront: { name: string; slug: string; theme: VitrineThemeKey; zone: string },
  product: VitrineSeedProduct,
  note: ProductVoiceNote | undefined,
): { produit: AchatProduit; theme: VitrineThemeKey } {
  const prenom = storefront.name.replace(/^Chez\s+/i, '').split(' ')[0] ?? storefront.name;
  const voiceDuree = note?.status === 'ready' ? dureeLabel(note.durationMs) : undefined;
  return {
    produit: {
      shopName: storefront.name,
      prenom,
      slug: storefront.slug,
      productName: product.name,
      zone: storefront.zone,
      priceFcfa: product.priceFcfa,
      glyph: product.glyph,
      photoGrad: `${product.art[0]},${product.art[1]}`,
      inStock: product.inStock,
      ...(voiceDuree !== undefined ? { voiceDuree } : {}),
    },
    theme: storefront.theme,
  };
}
