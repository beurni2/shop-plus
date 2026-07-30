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

import type { ClienteProduit, ClienteQuote, LegSplits } from './screens';
import type { VitrineThemeKey } from '../vitrine/themes';
import type { VitrineProduct } from '../vitrine/catalog';
import type { ProductVoiceNote } from '../vitrine/profile';
import { DEMO_VOICE_URL } from '../vitrine/voice-asset';

/** Séra's public fee card (§3.2 — the only two legs the buyer can choose). */
const FRAIS_TODAY = 1000;
const FRAIS_TOMORROW = 800;

/**
 * The mock quote service — composes once, server-shaped; the UI renders as-is.
 *
 * IT COMPOSES THE §6.1 SPLITS TOO (SP3.3b1), one pair per leg, because that is
 * what the real service answers: mode A pays the whole total at checkout and
 * nothing at the door; mode B pays that leg's delivery fee at checkout and the
 * product at the door. The arithmetic lives HERE, in the mock playing the
 * service, exactly as `totalToday` already did — never in a renderer.
 *
 * ITS ONE DELIBERATE OPTIMISM, restated: it always offers mode B, while the
 * live service refuses every pay-at-door request today (`quote-port.ts` names
 * this gap). A `B` split in the harness is never evidence that mode B works.
 */
export function composeQuote(produitFcfa: number): ClienteQuote {
  const splits = (frais: number, totalLeg: number): LegSplits => ({
    A: { paidNow: totalLeg, dueAtDelivery: 0 },
    B: { paidNow: frais, dueAtDelivery: produitFcfa },
  });
  return {
    produitFcfa,
    feeToday: FRAIS_TODAY,
    feeTomorrow: FRAIS_TOMORROW,
    totalToday: produitFcfa + FRAIS_TODAY,
    totalTomorrow: produitFcfa + FRAIS_TOMORROW,
    splitsToday: splits(FRAIS_TODAY, produitFcfa + FRAIS_TODAY),
    splitsTomorrow: splits(FRAIS_TOMORROW, produitFcfa + FRAIS_TOMORROW),
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
  // The demo article has no real photograph — an honest empty array, never a
  // fabricated URL. C1 therefore renders the woven « SANS PHOTO » frame and does
  // NOT make the « photo réelle » promise (REAL-PRODUCT-RENDER-1).
  assetRefs: [],
  voiceDuree: '0:12',
  voiceUrl: DEMO_VOICE_URL,
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
  product: VitrineProduct,
  note: ProductVoiceNote | undefined,
): { produit: ClienteProduit; theme: VitrineThemeKey } {
  const prenom = storefront.name.replace(/^Chez\s+/i, '').split(' ')[0] ?? storefront.name;
  const voiceDuree = note?.status === 'ready' ? dureeLabel(note.durationMs) : undefined;
  const voiceUrl = note?.status === 'ready' && note.url ? note.url : undefined;
  return {
    produit: {
      shopName: storefront.name,
      prenom,
      slug: storefront.slug,
      productName: product.name,
      zone: storefront.zone,
      priceFcfa: product.priceFcfa, // HER frozen price, carried verbatim
      assetRefs: product.assetRefs,
      inStock: product.inStock,
      ...(voiceDuree !== undefined ? { voiceDuree } : {}),
      ...(voiceUrl !== undefined ? { voiceUrl } : {}),
    },
    theme: storefront.theme,
  };
}
