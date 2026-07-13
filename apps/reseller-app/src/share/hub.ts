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
 * The QR and the visible price-validity-hint COPY are DERIVE-OR-STOP → WO-7.2
 * (no Grand Teint QR component; no canon validity-hint string in copy.md S5 —
 * both belong to the build-gated PackLab Media Kit composeur, components.md:177
 * « next commission; reserved names »). SP-I19's STRUCTURAL core — « the image
 * may circulate but binds nothing; the signed page remains the live truth » —
 * ships THIS slice as `assertCardAuthoritative` (the card always carries the
 * live-truth signed link). The hub ships composed of what exists — no
 * placeholder, no apology state, and the layout does not foreclose the QR.
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
}

export function composeShareCard(identity: ResellerShareIdentity): ShareCard {
  return {
    resellerName: identity.resellerName,
    productName: identity.productName,
    priceFcfa: identity.priceFcfa,
    signedProductLink: DEMO_SHARE_LINK, // the frozen signed product link
    identityLinkSuffix: identity.identityLinkSuffix,
    shortCode: identity.shortCode,
    seraDelivery: true,
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
}
