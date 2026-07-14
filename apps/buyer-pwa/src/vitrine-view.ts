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

/**
 * S8 réputation on the trust chrome — « N ventes livrées », the exact count of
 * delivered sales (never a rank, never a score). Kept OUT of the pinned
 * VitrineViewModel (the SP-I03 no-supplier fixture) so it stays a render-time
 * trust signal, not commercial-identity data.
 */
export interface VitrineReputation {
  /** The exact delivered-sales count; below the floor (0) the line is hidden. */
  readonly count: number;
  /** A demo (test-data) count → rendered with a « démo » marker, never a real claim. */
  readonly demo: boolean;
}

/**
 * The réputation count text, in correct French (Voice Standard §10.5): the
 * singular « 1 vente livrée » at exactly one delivered sale — the FIRST trust
 * state a reseller ever shows — and « N ventes livrées » at two or more. Both
 * strings live in the catalog; the render branches on the count.
 */
export function reputationText(count: number): string {
  return count === 1 ? t('reputation.ventes_livrees_une') : tf('reputation.ventes_livrees', { n: String(count) });
}

/** « N ventes livrées » — shown from the first delivered sale (floor = 1); else nothing. */
function reputationLine(rep: VitrineReputation | undefined): string {
  if (rep === undefined || rep.count < 1) return '';
  const count = `<span class="vitrine-reputation" data-role="reputation">${reputationText(rep.count)}</span>`;
  const demo = rep.demo ? ` <span class="reputation-demo" data-role="reputation-demo">${t('reputation.demo')}</span>` : '';
  return `<p class="vitrine-reputation-line">${count}${demo}</p>`;
}

function trustChrome(reputation: VitrineReputation | undefined): string {
  // Part 6.1 — shown before anything is asked. « Livré par Séra » / « Paiement
  // protégé » reuse the product-page trust strings; the privacy line is S5.
  // S8 — « N ventes livrées » rides the trust chrome (a delivered-sales count,
  // never a rank), from the first delivered sale.
  return [
    '<div class="vitrine-trust" data-role="vitrine-trust">',
    '<div class="trust-row">',
    `<span class="trust-chip">${t('produit.livre_par_sera')}</span>`,
    `<span class="trust-chip">${t('produit.paiement_protege')}</span>`,
    '</div>',
    reputationLine(reputation),
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

export function renderVitrine(model: VitrineViewModel, reputation?: VitrineReputation): string {
  return [
    '<section class="vitrine" data-screen="vitrine">',
    '<header class="vitrine-head">',
    `<h2 class="vitrine-store-name">${tf('vitrine.chez', { name: esc(model.resellerName) })}</h2>`,
    `<p class="vitrine-verified"><span class="verified-badge">${tf('vitrine.verifiee', { zone: esc(model.zone) })}</span></p>`,
    '</header>',
    trustChrome(reputation),
    '<div class="vitrine-products">',
    model.products.map(productCard).join(''),
    '</div>',
    // WO-7.2a — the ruled S3 entry point: every vitrine footer links to the
    // store directory (« root + vitrine footer »). Reuses the handoff string.
    `<a class="vitrine-boutiques link-quiet" data-role="vitrine-boutiques" href="/boutiques">${t('boutiques.aucun_action')}</a>`,
    '</section>',
  ].join('');
}
