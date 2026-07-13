import { DEMO_SHARE_LINK } from '../demo/store';

/**
 * WO-7.1 Part A — THE SHARE HUB (S5, reseller side). The card and the two
 * links are the reseller's whole economics: the signed PRODUCT link (opens the
 * offer, carries the signed attribution — the live price/stock truth) and the
 * IDENTITY link (`/v/{slug}`, her permanent vitrine, for the bio). Composition
 * is DETERMINISTIC from her price-free canonical assets + her price snapshot
 * (§5.4); commission appears NOWHERE and the supplier NEVER (SP-I03/SP-I19).
 * The card composition is components.md:178 (« built from PriceBand + premium
 * frame + ShortCodeChip, no commission ever rendered »).
 *
 * METRO-SAFETY (repo law, demo/store.ts docblock + demo-store.test §Metro): the
 * RN bundle must NOT import the `@platform/contracts` barrel. So this module
 * imports ZERO contracts values — the identity link suffix (`/v/aicha-4821`) is
 * a FROZEN SNAPSHOT (plain data), generated THROUGH canon `shortCodeToSlug` and
 * PINNED to it byte-for-byte in `test/share-hub.test.ts` (same derive-through-
 * snapshot law as seed.json ↔ computeWaterfall). Her price snapshot is likewise
 * PINNED to `computeWaterfall(WORKED_BASELINE_INPUT).productSubtotal` (§5.4) in
 * that test — the literal below is proven, never hand-authored truth.
 *
 * WO-7.2a — THE VALIDITY HINT LANDS (the WO-7.1 deferral closes). Grand Teint
 * v1.0.0's handoff copy.md now carries the canon string « Prix du {date} — le
 * lien dit le prix du jour. » (money), so the card footer states WHICH day's
 * price it shows and points at the live link as the truth (zero fabricated
 * urgency). `assertCardAuthoritative` now requires BOTH the signed link AND the
 * validity date — a card that hides either could let a stale print pass for
 * truth (SP-I19). The QR and the composeur stay WO-7.2b (their specs are
 * design-ahead against canon ruling #4); the hub layout still does not foreclose
 * the QR.
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

/** The composed WhatsApp card — HER name, HER price, « Livré par Séra », the
 * signed link. No supplier, no commission field exists on this type. */
export interface ShareCard {
  readonly resellerName: string;
  readonly productName: string;
  readonly priceFcfa: number;
  /** The live-truth resolver — the card's authority is this link, not the print. */
  readonly signedProductLink: string;
  readonly identityLinkSuffix: string;
  readonly shortCode: string;
  /** « Livré par Séra » always rides the card; never a fake « vérifié ». */
  readonly seraDelivery: true;
  /**
   * WO-7.2a — the price-validity date (« 13 juillet »), the day the card was
   * rendered. SP-I19: the printed price is a snapshot; the hint says WHICH day's
   * price this is, and the live link stays the truth. Zero fabricated urgency —
   * it points at the truth (the link), it never presses.
   */
  readonly priceValidityDate: string;
}

/** French « {day} {mois} » — deterministic, no Intl/locale dependency (Metro-safe). */
const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;
export function frenchDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${FR_MONTHS[d.getUTCMonth()]}`;
}

/** The demo render date (« 13 juillet ») — the frozen demo clock, not a live now(). */
export const DEMO_RENDER_DATE = '2026-07-13T00:00:00.000Z';

export function composeShareCard(
  identity: ResellerShareIdentity,
  renderDateIso: string = DEMO_RENDER_DATE,
): ShareCard {
  return {
    resellerName: identity.resellerName,
    productName: identity.productName,
    priceFcfa: identity.priceFcfa,
    signedProductLink: DEMO_SHARE_LINK, // the frozen signed product link
    identityLinkSuffix: identity.identityLinkSuffix,
    shortCode: identity.shortCode,
    seraDelivery: true,
    priceValidityDate: frenchDate(renderDateIso),
  };
}

export class ShareCardAuthorityError extends Error {
  override readonly name = 'ShareCardAuthorityError';
}

/**
 * SP-I19 (« the image may circulate but binds nothing; the signed page remains
 * the live price/stock truth »): a card's authority is its signed link, never
 * the printed number. A card composed without the live-truth link would let a
 * stale print pass for truth — that card is refused, not shipped.
 */
export function assertCardAuthoritative(card: ShareCard): void {
  if (!card.signedProductLink || card.signedProductLink.trim() === '') {
    throw new ShareCardAuthorityError(
      'share card has no signed live-truth link — a printed price must never be the authority (SP-I19)',
    );
  }
  if (!card.priceValidityDate || card.priceValidityDate.trim() === '') {
    throw new ShareCardAuthorityError(
      'share card has no price-validity date — the print must say which day it shows, the link stays the truth (SP-I19)',
    );
  }
}
