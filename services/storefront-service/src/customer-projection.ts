import type { Storefront, WaterfallResult } from '@platform/contracts';

/**
 * Customer-surface projection (SP-I03): "Customer-facing pages MUST show the
 * reseller as the commercial relationship and MUST NOT expose supplier
 * identity/contact or commission." The projection type is built so supplier
 * identity, supplier contact, commission, and seller economics structurally
 * cannot ride along — the no-supplier-contact CI gate scans emitted payloads
 * for the banned key families as the second line of defense.
 */
export interface CustomerProductView {
  listingId: string;
  productVersionId: string;
  productName: string;
  category: string;
  /** The reseller IS the commercial relationship on every customer surface. */
  resellerId: string;
  storeName: string;
  /** Customer price = productSubtotal (B + M). Never decomposed for the buyer. */
  customerPriceFcfa: number;
  deliveryFeeFcfa: number;
  buyerTotalFcfa: number;
  assetRefs: readonly string[];
}

export interface CustomerProjectionInput {
  listingId: string;
  productVersionId: string;
  productName: string;
  category: string;
  resellerId: string;
  storeName: string;
  money: WaterfallResult;
  assetRefs: readonly string[];
}

export function toCustomerProductView(input: CustomerProjectionInput): CustomerProductView {
  return {
    listingId: input.listingId,
    productVersionId: input.productVersionId,
    productName: input.productName,
    category: input.category,
    resellerId: input.resellerId,
    storeName: input.storeName,
    customerPriceFcfa: input.money.productSubtotal,
    deliveryFeeFcfa: input.money.deliveryFee,
    buyerTotalFcfa: input.money.buyerTotal,
    assetRefs: [...input.assetRefs],
  };
}

/**
 * STOREFRONT-level customer surface (STOREFRONT-READ-PATH-1) — the whole-store
 * response for `GET /s/{slug}`. Built as an EXPLICIT buyer-safe allowlist over the
 * canon Storefront (not a spread): the canon shape carries no supplier identity,
 * cost, margin, commission or economics field today, and this projection copies
 * ONLY the named fields — so a future canon field cannot silently ride onto the
 * customer surface, and the no-supplier-contact CI gate scans the emitted payload
 * as the second line of defense (SP-I03, same discipline as CustomerProductView).
 * `resellerId` IS carried: the reseller is the commercial relationship the buyer
 * sees; the SUPPLIER is never named here. No money field belongs on this shape —
 * prices ride the per-product surface, never the storefront envelope.
 */
export interface StorefrontView {
  readonly id: string;
  readonly resellerId: string;
  readonly slug: string;
  readonly name: string;
  readonly zone: string;
  readonly category: string;
  readonly tagline: string;
  readonly bio: string;
  readonly theme: Storefront['theme'];
  readonly cover: Storefront['cover'];
  readonly avatar: Storefront['avatar'];
  readonly curatedItems: readonly string[];
  readonly featuredItems: readonly string[];
  readonly sections: Storefront['sections'];
  readonly discoverable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toStorefrontView(sf: Storefront): StorefrontView {
  return {
    id: sf.id,
    resellerId: sf.resellerId,
    slug: sf.slug,
    name: sf.name,
    zone: sf.zone,
    category: sf.category,
    tagline: sf.tagline,
    bio: sf.bio,
    theme: sf.theme,
    cover: sf.cover,
    avatar: sf.avatar,
    curatedItems: [...sf.curatedItems],
    featuredItems: [...sf.featuredItems],
    sections: sf.sections,
    discoverable: sf.discoverable,
    createdAt: sf.createdAt,
    updatedAt: sf.updatedAt,
  };
}
