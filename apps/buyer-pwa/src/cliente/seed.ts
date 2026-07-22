/**
 * PWA CLIENTE — the demo seed + the server-frozen quote.
 *
 * The demo article is the pixel prototype's exact one (Robe brodée bogolan ·
 * TAILLE M · Rood Woko · 11 500 · voix 0:12); `stockOut` flips the SAME robe
 * épuisée, band struck through, price still signed (§4 C1).
 *
 * `composeQuote` plays the QUOTE SERVICE (a contract-certified mock, the
 * TOTAUX precedent): it composes the §3.2 waterfall ONCE, server-side-shaped
 * — produit · frais (1 000 aujourd'hui / 800 demain) · totaux — and the flow
 * renders those frozen fields as-is. No renderer ever adds two amounts
 * (§0 « argent = render-only »). For the §3.2 demo article the composed bytes
 * ARE the decree's: 12 500 = 11 500 + 1 000 · 12 300 = 11 500 + 800.
 *
 * `clienteProduitReel` keeps the BUG 3 law: a real signed link resolves the
 * pid against the RESELLER'S ACTUAL vitrine catalog, never a demo fallback.
 */

import type { ClienteProduit, ClienteQuote } from './screens';
import type { VitrineThemeKey } from '../vitrine/themes';
import type { VitrineSeedProduct } from '../vitrine/catalog';
import type { ProductVoiceNote } from '../vitrine/profile';

/** Séra's public fee card (§3.2 — the only two legs the buyer can choose). */
const FRAIS_TODAY = 1000;
const FRAIS_TOMORROW = 800;

/** The mock quote service — composes once, server-shaped; the UI renders as-is. */
export function composeQuote(produitFcfa: number): ClienteQuote {
  return {
    produitFcfa,
    feeToday: FRAIS_TODAY,
    feeTomorrow: FRAIS_TOMORROW,
    totalToday: produitFcfa + FRAIS_TODAY,
    totalTomorrow: produitFcfa + FRAIS_TOMORROW,
  };
}

/** The §3.2 demo article — the pixel prototype's exact bytes. */
export const ROBE: ClienteProduit = {
  shopName: 'Chez Aïcha Mode',
  prenom: 'Aïcha',
  slug: 'aicha-4821',
  productName: 'Robe brodée bogolan',
  variant: 'TAILLE M',
  zone: 'Rood Woko · Ouagadougou',
  priceFcfa: 11_500,
  glyph: 'tissu',
  voiceDuree: '0:12',
  inStock: true,
};

/** Build the harness product from the resolved demo storefront (no inline shop
 * identity in the shell) — the robe under HER name/slug. */
export function clienteProduit(storefront: { name: string; slug: string }): ClienteProduit {
  const prenom = storefront.name.replace(/^Chez\s+/i, '').split(' ')[0] ?? storefront.name;
  return { ...ROBE, shopName: storefront.name || ROBE.shopName, prenom: prenom || ROBE.prenom, slug: storefront.slug };
}

/** « 0:01 » from a note's durationMs (mm:ss). */
function dureeLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * BUG 3 law — a REAL signed link (`/s/{slug}?pid={pid}`) resolves the pid
 * against the RESELLER'S ACTUAL vitrine catalog (`seedProduct`), NOT a demo
 * seed: name · HER price · stock · real voice note, mapped into the C1 model.
 */
export function clienteProduitReel(
  storefront: { name: string; slug: string; theme: VitrineThemeKey; zone: string },
  product: VitrineSeedProduct,
  note: ProductVoiceNote | undefined,
): { produit: ClienteProduit; theme: VitrineThemeKey } {
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
      inStock: product.inStock,
      ...(voiceDuree !== undefined ? { voiceDuree } : {}),
    },
    theme: storefront.theme,
  };
}
