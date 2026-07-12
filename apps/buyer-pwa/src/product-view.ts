import { t, tf } from './i18n';
import { FCFA, esc } from './format';

/**
 * WO-4.4 §6.2 — ARRIVAL: the signed link lands HERE, on a real product page.
 * SP-I03 (quoted): "Customer-facing pages MUST show the reseller as the
 * commercial relationship and MUST NOT expose supplier identity/contact or
 * commission." The view model therefore carries the reseller's name and HER
 * price (productSubtotal = B + M) — and NOTHING about the supplier or the
 * commission exists in the type or the markup (the negative test feeds a
 * commission-poisoned fixture and asserts it never surfaces).
 * One primary action (« Acheter »). Trust lines: « Livré par Séra » ·
 * « Paiement protégé ». The price is a hero figure (money.amountScale.hero —
 * « L'argent en majesté »).
 */

export interface ProductViewModel {
  productName: string;
  /** The reseller — the ONLY commercial relationship on this page. */
  resellerName: string;
  /** HER price: productSubtotal (B + M). Never B, never C, never a split. */
  priceFcfa: number;
  inStock: boolean;
}

/** The demo Studio asset — a stand-in for the Boutik+ Studio derivative
 * (real photography arrives with real listings; the frame treats it with
 * respect either way). Colors come from the token custom properties. */
function demoStudioAsset(productName: string): string {
  return [
    '<div class="product-photo" role="img" aria-label="' + esc(productName) + '">',
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">',
    '<rect width="100" height="100" fill="var(--surface-sunken)"/>',
    '<circle cx="50" cy="44" r="22" fill="var(--primary)" opacity="0.18"/>',
    '<circle cx="50" cy="44" r="14" fill="var(--primary)" opacity="0.3"/>',
    '<path d="M0 78 Q 25 68 50 78 T 100 78 V 100 H 0 Z" fill="var(--primary)" opacity="0.12"/>',
    '</svg>',
    `<span class="product-photo-initial">${esc(productName.charAt(0))}</span>`,
    '</div>',
  ].join('');
}

export function renderProductPage(model: ProductViewModel): string {
  return [
    '<section class="product-page" data-screen="produit">',
    demoStudioAsset(model.productName),
    `<p class="reseller-line"><span class="reseller-name">${esc(model.resellerName)}</span> <span class="verified-badge">${t('produit.vendeuse_verifiee')}</span></p>`,
    `<h2 class="product-name">${esc(model.productName)}</h2>`,
    `<p class="fcfa-hero">${FCFA.format(model.priceFcfa)} F</p>`,
    '<div class="trust-row">',
    `<span class="trust-chip">${t('produit.livre_par_sera')}</span>`,
    `<span class="trust-chip">${t('produit.paiement_protege')}</span>`,
    model.inStock ? `<span class="trust-chip">${t('produit.stock')}</span>` : '',
    '</div>',
    `<button class="link-quiet" data-action="protections">${t('protections.ouvrir')}</button>`,
    `<button class="primary-action" data-action="acheter">${tf('produit.acheter', { amount: FCFA.format(model.priceFcfa) })}</button>`,
    '</section>',
  ].join('');
}
