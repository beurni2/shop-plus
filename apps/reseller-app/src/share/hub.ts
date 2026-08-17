/**
 * WO-7.1 Part A — THE SHARE HUB (S5, reseller side), REDUCED BY PARTAGER-PRO
 * (founder, 2026-08-15: « remove all the mocks as well and use the real data »).
 * The composed demo card (`composeShareCard` + its `ShareCard` shape and the
 * `assertCardAuthoritative` refusal) lived here while the Partager screen was a
 * demo; the screen now composes from the LIVE offer and HER storefront, so the
 * factory and its frozen clock left with it. What remains is what the app still
 * renders: the demo IDENTITY (the accueil header still shows it — its own
 * slice) and `frenchDate` (the validity line, now dated the day she shares).
 *
 * SP-I19 survives the removal BY CONSTRUCTION: the screen cannot render the
 * card without `partage.lienProduit` — the `partage` derivation requires the
 * live shop and the live offer, and the walk (`test/rendu-partager.test.tsx`)
 * asserts the signed link is on screen and in the shared message.
 *
 * METRO-SAFETY (repo law, demo/store.ts docblock + demo-store.test §Metro): the
 * RN bundle must NOT import the `@platform/contracts` barrel. So this module
 * imports ZERO contracts values — the identity link suffix (`/v/aicha-4821`) is
 * a FROZEN SNAPSHOT (plain data), generated THROUGH canon `shortCodeToSlug` and
 * PINNED to it byte-for-byte in `test/share-hub.test.ts` (same derive-through-
 * snapshot law as seed.json ↔ computeWaterfall). Her price snapshot is likewise
 * PINNED to `computeWaterfall(WORKED_BASELINE_INPUT).productSubtotal` (§5.4) in
 * that test — the literal below is proven, never hand-authored truth.
 */

export interface ResellerShareIdentity {
  readonly resellerName: string;
  /** ASCII per canon ResellerShortCodeSchema (`AICHA-4821`); display carries « Aïcha ». */
  readonly shortCode: string;
  readonly productName: string;
  /** HER price: productSubtotal (B + M). Never B, never C, never a split (§5.4). */
  readonly priceFcfa: number;
  /**
   * The canon identity link suffix (`/v/aicha-4821`) — never a query-string.
   * FROZEN SNAPSHOT: pinned to canon `shortCodeToSlug(shortCode)` in the test,
   * so the RN bundle never imports the contracts barrel to compute it.
   */
  readonly identityLinkSuffix: string;
}

/** The demo reseller (frozen store carries no vitrine identity). §5.4 price. */
export const DEMO_SHARE_IDENTITY: ResellerShareIdentity = {
  resellerName: 'Aïcha',
  shortCode: 'AICHA-4821',
  productName: 'Bazin riche brodé',
  priceFcfa: 11_500,
  identityLinkSuffix: '/v/aicha-4821',
};

/** French « {day} {mois} » — deterministic, no Intl/locale dependency (Metro-safe). */
const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;
export function frenchDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${FR_MONTHS[d.getUTCMonth()]}`;
}
