import type { Storefront, WaterfallResult } from '@platform/contracts';
import { rangeeInspection } from '@shop-plus/commerce-core';

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
  /**
   * CATEGORY-WIRE-1 — the supplier's category, carried verbatim from the supply
   * projection (canon v3.0.0). The buyer's at-door screen picks its §6.2
   * inspection row from this, and §6.1 decides Option-B eligibility from it.
   *
   * REQUIRED on this wire because the server always has one. The BUYER treats it
   * as optional, deliberately: an older deployed Worker omits the field, and the
   * client must fall back to the cautious inspection row rather than drop the
   * product off her page. Absent may only ever WITHHOLD, never reveal.
   */
  readonly category: string;
  /**
   * VIDEO-PRODUIT (canon v3.4.0) — the short clip's ABSOLUTE url, exactly as
   * `assetRefs` carries the images (absolutized server-side, same base).
   * OPTIONAL: most products have none, an older Worker omits it, and the
   * buyer treats absence as « photos only » — never a broken player.
   */
  readonly videoRef?: string;
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
  /** The supplier's live stock count. Stock, never economics — see `inStock` below. */
  readonly available: number;
  /** CATEGORY-WIRE-1 — display data, from the projection, never invented here. */
  readonly category: string;
  /** VIDEO-PRODUIT — the clip's ABSOLUTE url (the caller absolutized it with
   *  the images); absent when the product has none or the base is unset. */
  readonly videoRef?: string;
}

/**
 * PRODUCT-MEDIA-BASE-1 — RELATIVE REFS BECOME ABSOLUTE URLS **SERVER-SIDE**.
 *
 * ═══ WHY THE SERVER AND NOT THE CLIENT (founder ruling, and the stronger reason) ═══
 *
 * A canon `assetRef` is a RELATIVE path — boutik's media-service writes
 * `media/{kind}/{captureRef}`. The buyer PWA renders it straight into `src` with no
 * base joined, so a relative ref would resolve against the PWA'S OWN ORIGIN and
 * 404 — rendering a BROKEN IMAGE inside an otherwise-correct tile, which is worse
 * than no image because the designed « SANS PHOTO » state only fires on an EMPTY
 * array. The founder's ruling: the fix goes server-side, *"and for a stronger
 * reason than the freeze: the PWA is a static site on GitHub Pages, so a
 * client-side media base is another build-time variable that fails invisibly —
 * exactly the class that cost the founder an evening. The server knows where media
 * lives; the static client should not have to be told."*
 *
 * ═══ A NEW, DISTINCTLY NAMED VAR — TWO BUCKETS, TWO BASES ═══
 *
 * `MEDIA_PUBLIC_BASE` already exists and means THIS service's own origin for
 * `beurni-storefront-media` — her cover and avatar. PRODUCT photographs live in
 * `beurni-boutik-product-media`, behind boutik's media-service. **Conflating the two
 * 404s every ref**, so the product base is its own variable, in `[vars]`: readable
 * and versioned in the repo, never a secret. That is the SUPPLY_BASE lesson applied
 * correctly — the value that burned three founder round-trips was write-only, and
 * this one is a public origin with nothing to protect.
 *
 * ═══ AN EMPTY BASE IS THE HONEST « SANS PHOTO », NEVER A BARE REF ═══
 *
 * Unset or empty ⇒ `[]` ⇒ the woven, labelled no-image state the buyer surface
 * already draws. It must NEVER fall through to the raw relative ref: that is
 * precisely the broken-image failure this function exists to prevent, and a
 * misconfiguration must fail toward the designed state rather than toward a
 * half-rendered tile. Asserted by value in `customer-projection.test.ts`.
 */
export function absoluteAssetRefs(base: string | undefined, refs: readonly string[]): string[] {
  if (base === undefined || base === '') return []; // honest SANS PHOTO — never a bare relative ref
  const root = base.replace(/\/+$/, '');
  return refs.filter((r) => r !== '').map((r) => `${root}/${r.replace(/^\/+/, '')}`);
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
    // PUBLISH-PRICE-1 — DERIVED FROM LIVE STOCK, previously hardcoded `true`.
    // `buildSupplyProjection` has no `available > 0` guard, so a zero-stock offer is
    // still a valid projection; combined with a hardcoded `true` that made an
    // out-of-stock product render as an in-stock buyer tile — a lie on the buyer
    // wire, and the épuisé veil the renderer already draws was unreachable.
    inStock: supply.available > 0,
    assetRefs: [...supply.assetRefs],
    // From SUPPLY, like the name and the images — never from the listing, and
    // never a default. The reseller sets a markup, not what a product IS.
    //
    // ═══ OPTION-B-REACHABLE-1 — RESOLVED TO ITS §6.2 ROW, NOT CARRIED RAW ═══
    //
    // This used to be `supply.category` verbatim: the supplier's own chip word
    // (« Mode femme », « Chaussures »…). The buyer's only consumer of this field
    // is `inspectionPour()`, which looks it up in a table keyed by §6.2's ROW
    // NAMES — so every real product missed, and every at-door screen showed the
    // cautious row. The identical mismatch refused Option B at the gate.
    //
    // `rangeeInspection` is the SAME function §6.1 consults (commerce-core), so
    // one product cannot be door-eligible under one vocabulary while its
    // checklist is drawn under another. That is the whole reason it is imported
    // rather than re-tabulated here.
    //
    // '' WHEN §6.2 NAMES NO ROW (« Maison », a supplier's free text). The field
    // is required on this wire, and an empty string is the honest « no row »:
    // the buyer's lookup misses and she gets the cautious checklist, which is
    // exactly what a product with no at-door inspection rights should show.
    category: rangeeInspection(supply.category) ?? '',
    // VIDEO-PRODUIT — carried exactly as the images are; absent stays absent.
    ...(supply.videoRef !== undefined && supply.videoRef !== '' ? { videoRef: supply.videoRef } : {}),
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
  /** ENTETES-B — her chosen boutique header; presentation, never economics. */
  readonly headerStyle: Storefront['headerStyle'];
  readonly cover: Storefront['cover'];
  readonly avatar: Storefront['avatar'];
  readonly curatedItems: readonly string[];
  readonly featuredItems: readonly string[];
  readonly sections: Storefront['sections'];
  /**
   * VOIX-PRODUIT — pid → her recorded note, READY ONES ONLY.
   *
   * A `pending` note is bytes in flight: it has no playable url, and shipping
   * it would put a « Écouter la note » row on the buyer's screen with nothing
   * behind it. The projection is where that is decided, not the browser — the
   * buyer receives only what can actually be played, the same rule the media
   * projection applies to a held photograph.
   */
  readonly productNotes: Readonly<Record<string, { readonly url: string; readonly durationMs: number }>>;
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
    headerStyle: sf.headerStyle,
    cover: sf.cover,
    avatar: sf.avatar,
    curatedItems: [...sf.curatedItems],
    featuredItems: [...sf.featuredItems],
    sections: sf.sections,
    // READY + a real url, or the pid is not on the buyer's surface at all.
    // Both halves are checked: canon lets `url` be absent while pending, so
    // testing the status alone would let `undefined` through as a url.
    //
    // `?? {}` IS THE MIGRATION, AND IT IS LOAD-BEARING. Canon defaults this
    // field on PARSE, but a storefront written before this deploy sits in DO
    // storage as a plain object that never re-parses on read — so `productNotes`
    // is genuinely `undefined` there, and `Object.entries(undefined)` THROWS.
    // Without this, `GET /s/{slug}` would 500 for every shop that existed
    // before today: the vitrine down for all of them, on a feature none of them
    // use. The service tests caught it; it is not hypothetical.
    productNotes: Object.fromEntries(
      Object.entries(sf.productNotes ?? {})
        .filter(([, n]) => n.status === 'ready' && typeof n.url === 'string' && n.url !== '')
        .map(([pid, n]) => [pid, { url: n.url as string, durationMs: n.durationMs }]),
    ),
    discoverable: sf.discoverable,
    createdAt: sf.createdAt,
    updatedAt: sf.updatedAt,
  };
}

/**
 * CONTACT-WHATSAPP-1 — the registration phone, made wa.me-ready. DETERMINISTIC
 * digits only (Ten Laws #5): a leading `+` or `00` comes off, separators
 * (spaces, dots, dashes, parens) come off, and what remains must be digits. A
 * bare 8-digit Burkina number gets the country code, because `wa.me` requires
 * the full international form; anything 10–15 digits is carried as she gave it
 * (a `226…` is 11). Everything else — letters, too short, too long — is
 * `undefined`, and undefined means the tap simply does not render: a number
 * this function cannot vouch for must never become a dead WhatsApp link on a
 * buyer's screen.
 */
export function whatsappDigits(raw: string): string | undefined {
  const stripped = raw.trim().replace(/^\+/, '').replace(/^00/, '').replace(/[\s.\-()]/g, '');
  if (!/^\d+$/.test(stripped)) return undefined;
  if (stripped.length === 8) return `226${stripped}`;
  if (stripped.length >= 10 && stripped.length <= 15) return stripped;
  return undefined;
}
