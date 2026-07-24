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

/* ------------------------------------------ REAL-PRODUCT-RENDER-1 piece (a) -- */

/**
 * THE BUYER'S PER-PRODUCT RECORD — the wire shape, identical to the renderer's
 * `VitrineProduct` so the buyer parses into the shape it already draws (ZERO
 * transformation). Deliberately NOT `CustomerProductView`: that carries
 * `deliveryFeeFcfa` / `buyerTotalFcfa`, which need a delivery quote that does not
 * exist at vitrine render time.
 *
 * TWO LAWS ARE STRUCTURAL HERE:
 *  1. **MONEY** — `priceFcfa` is HER SIGNED price, read from the listing entry and
 *     carried verbatim. There is no `basePrice`, no `resellerCommission`, no
 *     `markup` on this shape, so a price recomputed from live supplier economics
 *     is unrepresentable, not merely discouraged.
 *  2. **`pid` IS THE PRODUCT VERSION, NEVER THE LISTING ID** (founder standing law).
 *     Listing ids stay off the buyer wire: the moment a public payload carries
 *     one, listing ids become enumerable and the key-gate on `/listings*`
 *     (LISTING-READ-GATE-1) degrades from protecting against holders to failing
 *     against counters. `test/supply-source.test.ts` fails if one appears.
 */
export interface VitrineProductRecord {
  readonly pid: string;
  readonly name: string;
  /** HER signed price (productSubtotal = B + M) — carried, never recomputed. */
  readonly priceFcfa: number;
  readonly inStock: boolean;
  readonly assetRefs: readonly string[];
}

/** What the join needs from the LISTING side (never from supply). */
export interface ListingSide {
  /** The product version this listing sells — becomes the buyer-facing `pid`. */
  readonly productVersionId: string;
  /** HER price, frozen at publish and read from the service's ListingEntry. */
  readonly customerPriceFcfa: number;
  /** Canon listing status; anything but `published` is not buyer-visible. */
  readonly status: string;
}

/** What the join needs from the SUPPLY side — display data ONLY. */
export interface SupplySide {
  readonly productName: string;
  readonly assetRefs: readonly string[];
}

/**
 * THE JOIN — listing (price, identity, stock) × supply (name, images).
 *
 * ABSENT SUPPLY ⇒ `undefined` ⇒ THE RECORD IS OMITTED (founder ruling: absent is
 * the honest state, and the mock is never the fallback). A product whose name is
 * unknown is not rendered as a nameless tile carrying a price — that reads as a
 * broken product, and a price without an identity is worse than silence. The
 * storefront then shows the products it CAN describe, and a storefront that can
 * describe none renders the existing designed empty state. Nothing is invented.
 */
export function joinVitrineProduct(listing: ListingSide, supply: SupplySide | undefined): VitrineProductRecord | undefined {
  if (supply === undefined) return undefined; // undescribable → omitted, never invented
  if (listing.status !== 'published') return undefined; // hidden listings are not buyer-visible
  return {
    pid: listing.productVersionId, // NEVER the listing id
    name: supply.productName,
    priceFcfa: listing.customerPriceFcfa, // from the LISTING, never recomputed from supply
    inStock: true,
    assetRefs: [...supply.assetRefs],
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
