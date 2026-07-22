import { t, tf } from './i18n';

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

/* (The Grand Teint vitrine renderer — renderVitrine + its trustChrome /
 * productCard / reputationLine helpers — is DELETED: PWA-CLEANUP-1 §4. The
 * live vitrine is src/vitrine/render.ts, mounted via mountVitrine; the
 * retired renderer emitted the retired demo route, and no code may
 * generate that route again — the un-generatability test locks it. This file
 * keeps the SP-I03 view-model types (pinned by the no-supplier-contact gate
 * fixture) and `reputationText`, the S8 count text the directory card
 * consumes — singular « 1 vente livrée » at exactly 1, plural above.) */
