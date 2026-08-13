import { K_SEED } from './storefront';

/**
 * PERSONNALISER-PARITY-1 — HER REAL LISTINGS reach the arrangement screens.
 *
 * K5 (à la une + order) and K7 (the preview) mapped `curatedItems` through
 * K_SEED — the EIGHT DEMO PRODUCTS. (K6b, section contents, consumed this seam
 * too until it left with the sections editor — founder order 2026-08-13.)
 * Her real pids found nothing there, so K5 listed nothing to pin: she could
 * not feature a real product at all, which is why her live page had no
 * « Produit à la une ».
 *
 * RN-free on purpose: the seam is a pure function so a node test can EXECUTE it
 * (the vacuous-test lesson — a source-text grep proves nothing).
 */
export interface KCatalogItem {
  readonly pid: string;
  readonly name: string;
  readonly priceFcfa: number;
  readonly inStock: boolean;
  readonly assetRefs: readonly string[];
}

/** Resolve a pid against her REAL catalog; K_SEED only when none was provided
 *  (tests, the demo profile) — never as a silent fallback beside real data. */
export function fromCatalog(catalog: readonly KCatalogItem[] | undefined, pid: string): KCatalogItem | undefined {
  if (catalog !== undefined) return catalog.find((p) => p.pid === pid);
  const seed = K_SEED.find((p) => p.pid === pid);
  return seed ? { pid: seed.pid, name: seed.name, priceFcfa: seed.priceFcfa, inStock: seed.inStock, assetRefs: [] } : undefined;
}
