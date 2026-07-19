import { t, tf } from './i18n';
import { FCFA, esc } from './format';
import { renderEnt1, renderEnt2, renderEnt3 } from './vitrine/entries';

/**
 * WO-4.4 §6.2 / WO-5.3 (Grand Teint) — ARRIVAL: the signed link lands HERE,
 * on a real product page. SP-I03 (quoted): "Customer-facing pages MUST show
 * the reseller as the commercial relationship and MUST NOT expose supplier
 * identity/contact or commission." The view model therefore carries the
 * reseller's name and HER price (productSubtotal = B + M) — and NOTHING about
 * the supplier or the commission exists in the type or the markup.
 *
 * Grand Teint signatures on C1: the premium photo frame (corner ticks +
 * « Photo réelle » caption), the PRICE BAND (« L'argent en majesté » — the
 * amount is the biggest ink on the page, `money.amountScale.page`, tabular),
 * the verified badge, and the trust chips « Livré par Séra » / « Paiement
 * protégé ». One primary action (« Acheter »). The price element keeps its
 * `.fcfa-hero` class and byte-exact « 11 500 FCFA » figure (money never shifts).
 */

/** Vitrine-entry context (E1/E2 — HANDOFF §2): present when the product page
 * belongs to a reseller whose public vitrine is reachable. Presentation-only. */
export interface ProductVitrineEntry {
  readonly shopName: string;
  readonly prenom: string;
  readonly slug: string;
  readonly accent: string;
  readonly on: string;
  readonly soft: string;
  readonly deep: string;
}

export interface ProductViewModel {
  /** E1 entries render when present; absent keeps the pre-redesign page. */
  readonly vitrine?: ProductVitrineEntry | undefined;
  productName: string;
  /** The reseller — the ONLY commercial relationship on this page. */
  resellerName: string;
  /** HER price: productSubtotal (B + M). Never B, never C, never a split. */
  priceFcfa: number;
  inStock: boolean;
}

/** The demo Studio asset — a stand-in for the Boutik+ Studio derivative (real
 * photography arrives with real listings; the frame treats it with respect
 * either way). The four corner ticks frame it as documentary evidence
 * (GRAND-TEINT §5.4). Colours come from the token custom properties. */
function photoFrame(productName: string): string {
  return [
    '<figure class="product-photo-frame">',
    '<div class="product-photo" role="img" aria-label="' + esc(productName) + '">',
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">',
    '<rect width="100" height="100" fill="var(--c-sand)"/>',
    '<circle cx="50" cy="44" r="22" fill="var(--c-primary)" opacity="0.16"/>',
    '<circle cx="50" cy="44" r="14" fill="var(--c-primary)" opacity="0.28"/>',
    '<path d="M0 78 Q 25 68 50 78 T 100 78 V 100 H 0 Z" fill="var(--c-primary)" opacity="0.12"/>',
    '</svg>',
    `<span class="product-photo-initial">${esc(productName.charAt(0))}</span>`,
    '<span class="tick tick-tl" aria-hidden="true"></span>',
    '<span class="tick tick-tr" aria-hidden="true"></span>',
    '<span class="tick tick-bl" aria-hidden="true"></span>',
    '<span class="tick tick-br" aria-hidden="true"></span>',
    '</div>',
    `<figcaption class="photo-caption">${t('produit.photo_reelle')}</figcaption>`,
    '</figure>',
  ].join('');
}

/** The price band — the signature money moment (GRAND-TEINT §2.2): full-width
 * accent block, tiny caps label, big tabular amount, honesty note. */
function priceBand(priceFcfa: number): string {
  return [
    '<div class="price-band" data-role="price-band">',
    `<span class="price-band-label">${t('produit.prix')}</span>`,
    `<p class="fcfa-hero">${FCFA.format(priceFcfa)} FCFA</p>`,
    `<span class="price-band-note">${t('produit.livraison_note')}</span>`,
    '</div>',
  ].join('');
}

export function renderProductPage(model: ProductViewModel): string {
  return [
    '<section class="product-page" data-screen="produit">',
    photoFrame(model.productName),
    // E1 ① — C-ENT1: the reseller line becomes the tappable vitrine anchor
    // (§9.5 keeps BOTH entries); without vitrine context the line stays as-is.
    model.vitrine
      ? renderEnt1({ shopName: model.vitrine.shopName, slug: model.vitrine.slug, accent: model.vitrine.accent, on: model.vitrine.on })
      : `<p class="reseller-line"><span class="reseller-name">${esc(model.resellerName)}</span> <span class="verified-badge">${t('produit.vendeuse_verifiee')}</span></p>`,
    `<h2 class="product-name">${esc(model.productName)}</h2>`,
    priceBand(model.priceFcfa),
    '<div class="trust-row">',
    `<span class="trust-chip">${t('produit.livre_par_sera')}</span>`,
    `<span class="trust-chip">${t('produit.paiement_protege')}</span>`,
    model.inStock ? `<span class="trust-chip">${t('produit.stock')}</span>` : '',
    '</div>',
    `<button class="link-quiet" data-action="protections">${t('protections.ouvrir')}</button>`,
    // E1 ③ — C-ENT2: the labelled « Voir toute la boutique » affordance.
    model.vitrine
      ? renderEnt2({ prenom: model.vitrine.prenom, slug: model.vitrine.slug, accent: model.vitrine.accent })
      : '',
    // E2 — the épuisé encart + C-ENT3 (the only active CTA when Commander is off).
    model.vitrine && !model.inStock
      ? renderEnt3({ prenom: model.vitrine.prenom, slug: model.vitrine.slug, soft: model.vitrine.soft, deep: model.vitrine.deep })
      : '',
    `<button class="primary-action" data-action="acheter">${tf('produit.acheter', { amount: FCFA.format(model.priceFcfa) })}</button>`,
    '</section>',
  ].join('');
}

/**
 * The C1 skeleton (GRAND-TEINT §2.1 « La vitesse comme luxe »): it clones the
 * EXACT boxes of the loaded page — same photo frame, same price band, same
 * name/action rows — so cumulative layout shift is 0 by construction. Sand
 * pulse fills the boxes; no text arrives early, no spinner ever. Reachable
 * only via the demo surface (?demo-skeleton=produit); the walk never renders
 * it (the sandbox has no async load to fake).
 */
export function renderProductSkeleton(): string {
  return [
    '<section class="product-page product-page-skeleton" data-screen="produit-squelette" aria-busy="true">',
    '<figure class="product-photo-frame">',
    '<div class="product-photo skeleton-fill">',
    '<span class="tick tick-tl" aria-hidden="true"></span>',
    '<span class="tick tick-tr" aria-hidden="true"></span>',
    '<span class="tick tick-bl" aria-hidden="true"></span>',
    '<span class="tick tick-br" aria-hidden="true"></span>',
    '</div>',
    '<figcaption class="photo-caption skeleton-line skeleton-line-wide"></figcaption>',
    '</figure>',
    '<p class="reseller-line"><span class="skeleton-line skeleton-line-mid"></span></p>',
    '<h2 class="product-name"><span class="skeleton-line skeleton-line-wide"></span></h2>',
    '<div class="price-band price-band-skeleton" data-role="price-band"><span class="skeleton-line skeleton-line-band"></span></div>',
    '<div class="trust-row"><span class="trust-chip skeleton-fill"></span><span class="trust-chip skeleton-fill"></span></div>',
    '<div class="primary-action skeleton-fill"></div>',
    '</section>',
  ].join('');
}
