import { t, tf } from './i18n';
import { FCFA, esc } from './format';

/**
 * WO-7.1 Part B — THE VITRINE (S5, buyer side, /v/{slug}). Awa lands on a
 * stranger's link; her first three seconds decide whether Ouaga trusts it.
 *
 * SP-I03 (quoted): "Customer-facing pages MUST show the reseller as the
 * commercial relationship and MUST NOT expose supplier identity/contact or
 * commission." The view model carries the reseller and HER prices ONLY — no
 * supplier, no commission, no split exists in the type or the markup (the same
 * structural guarantee as the product page). Products are projected through
 * the storefront SP-I03 projection before they ever reach here.
 *
 * Build Spec Part 6.1 — the TRUST CHROME (« Livré par Séra » · « Paiement
 * protégé » · « Le paiement est protégé. Votre numéro reste privé. ») renders
 * BEFORE any product is tapped and before anything is asked of her. Grand
 * Teint: ink-on-paper, the store name as the poster header, hairline product
 * rows, HER price « L'argent en majesté ». An out-of-stock product is honest —
 * a muted, non-tappable « Épuisé » card (flows.md S2: « carte muette »), never
 * hidden and never a dead tap. Copy is derived from copy.md S5 + components.md;
 * nothing is invented.
 */

export interface VitrineProduct {
  productName: string;
  /** HER price: productSubtotal (B + M). Never B, never C, never a split. */
  priceFcfa: number;
  inStock: boolean;
}

export interface VitrineViewModel {
  /** The reseller's display name — the ONLY commercial relationship shown. */
  resellerName: string;
  /** Her zone, a landmark not an address (« Rood Woko, Ouagadougou »). */
  zone: string;
  products: readonly VitrineProduct[];
}

function trustChrome(): string {
  // Part 6.1 — shown before anything is asked. « Livré par Séra » / « Paiement
  // protégé » reuse the product-page trust strings; the privacy line is S5.
  return [
    '<div class="vitrine-trust" data-role="vitrine-trust">',
    '<div class="trust-row">',
    `<span class="trust-chip">${t('produit.livre_par_sera')}</span>`,
    `<span class="trust-chip">${t('produit.paiement_protege')}</span>`,
    '</div>',
    `<p class="vitrine-privacy">${t('vitrine.protege')}</p>`,
    '</div>',
  ].join('');
}

function productCard(p: VitrineProduct): string {
  const price = `<span class="vitrine-price fcfa-line">${tf('vitrine.prix', { amount: FCFA.format(p.priceFcfa) })}</span>`;
  const name = `<span class="vitrine-product-name">${esc(p.productName)}</span>`;
  if (!p.inStock) {
    // « carte muette » — muted, non-tappable, honestly labelled (never hidden).
    return [
      '<div class="vitrine-product vitrine-product-epuise" data-role="vitrine-product" aria-disabled="true">',
      name,
      price,
      `<span class="vitrine-epuise-chip">${t('vitrine.epuise')}</span>`,
      '</div>',
    ].join('');
  }
  // A tap flows into the EXISTING buyer journey (product → … → checkout); the
  // spine is entered, never modified.
  return [
    '<a class="vitrine-product" data-role="vitrine-product" data-action="acheter" href="?demo-journey=produit">',
    name,
    price,
    '</a>',
  ].join('');
}

export function renderVitrine(model: VitrineViewModel): string {
  return [
    '<section class="vitrine" data-screen="vitrine">',
    '<header class="vitrine-head">',
    `<h2 class="vitrine-store-name">${tf('vitrine.chez', { name: esc(model.resellerName) })}</h2>`,
    `<p class="vitrine-verified"><span class="verified-badge">${tf('vitrine.verifiee', { zone: esc(model.zone) })}</span></p>`,
    '</header>',
    trustChrome(),
    '<div class="vitrine-products">',
    model.products.map(productCard).join(''),
    '</div>',
    '</section>',
  ].join('');
}
