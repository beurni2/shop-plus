import {
  PlatformEventSchema,
  ResellerListingSchema,
  type PlatformEvent,
  type ResellerListing,
} from '@platform/contracts';

/**
 * LISTING DECISION CORE (STOREFRONT-READ-PATH-1). The pure per-listing transition,
 * extracted so ONE decision logic serves both the in-memory registry (CI) and the
 * per-listing Durable Object (prod) — the same shared-core pattern as the
 * storefront aggregate and the attribution lock. No `Map` in here; the DO applies
 * these to `this.state.storage`.
 *
 * MONEY IS CARRIED, NEVER RECOMPUTED. HER price (`customerPriceFcfa` = productSubtotal
 * = B + M) comes from the immutable Quote/waterfall and only RIDES the event payload;
 * the canon `ResellerListing` record itself carries `markup`, not a recomputed total.
 * Nothing here adds, multiplies, or re-derives an amount — the money path stays frozen.
 */

export const LISTING_PUBLISHED = 'published';
export const LISTING_AUTO_HIDDEN = 'auto_hidden';

/**
 * HUB-ASSURANCE-1 — the provenance of a stock claim. Shop-local by verification,
 * not by assumption: `hubVerified` appears nowhere in `@platform/contracts`, and
 * canon's `PlatformEventSchema` declares its payload as a free-form record — so the
 * event NAME is canon while its SHAPE is ours. No canon cycle, no three-repo
 * migration. Mirrors `@shop-plus/store-projection`'s `StockAssurance`, declared
 * separately because that package is deliberately dependency-free.
 */
export interface StockAssurance {
  readonly source: 'declared' | 'hub';
}

export interface PublishListingCommand {
  readonly commandId: string;
  readonly listingId: string;
  readonly storefrontId: string;
  readonly resellerId: string;
  readonly productVersionId: string;
  readonly offerVersion: string;
  /** HER markup M (canon `markup`, FcfaSchema). */
  readonly markup: number;
  /** HER price = productSubtotal (B + M) — SUPPLIED from the waterfall, never recomputed. */
  readonly customerPriceFcfa: number;
  /**
   * HUB-ASSURANCE-1 — WHERE the stock claim came from, replacing a
   * `hubVerified: boolean`. A boolean could not distinguish « the seller says she
   * has stock » from « the Boutik+ hub confirmed it », and that same flag renders a
   * « Vérifiée » badge beside the shop name on the buyer directory
   * (`store-projection.ts` → `boutiques-view.ts:80`) — so publishing with declared
   * stock would have put a verification badge on a storefront ON THE SELLER'S OWN
   * WORD, in the platform's own trust language. Only `'hub'` may ever set it.
   *
   * The real hub wire is deferred, so every real publish today is `'declared'`.
   * That is the honest state: the claim is recorded, the badge stays dark.
   *
   * OPTIONAL, AND FAIL-CLOSED — an omitted assurance is `'declared'`, never `'hub'`.
   * Two reasons, and they agree. (1) A CONSTRAINT: `services/attribution-service` is
   * in the FROZEN VAULT (byte-identical, zero diff) and its `premiere-commande-reelle`
   * e2e publishes a listing without this field; a required field would have forced an
   * edit to a frozen file. (2) THE MERITS, which would have argued the same way
   * anyway: a caller who forgets this must land on "no badge", never on a verification
   * claim. Forgetting fails toward silence — the only safe direction for a trust mark.
   */
  readonly stockAssurance?: StockAssurance;
  readonly correlationId: string;
  readonly at: string;
}

export type PublishDecision =
  | { readonly status: 'published'; readonly listing: ResellerListing; readonly event: PlatformEvent }
  | { readonly status: 'idempotent'; readonly listing: ResellerListing };

export type HideDecision =
  | { readonly status: 'hidden'; readonly listing: ResellerListing; readonly event: PlatformEvent }
  | { readonly status: 'unchanged'; readonly listing: ResellerListing }
  | { readonly status: 'absent' };

/**
 * The serialisable per-listing durable state (one per idFromName(listingId)).
 *
 * THE SIGNED PRICE LIVES HERE, NOT IN CANON (founder ruling, REAL-PRODUCT-RENDER-1
 * piece (a)). Canon's `ResellerListing` is STRICT and carries `markup` (M) with no
 * price field — it models a listing as a STANDING MARKUP, so a price derived from
 * it moves whenever the supplier's base moves. The product promises the opposite:
 * « Le prix reste signé — il reviendra tel quel si le stock revient ». This
 * wrapper — which already carries the non-canon `storefrontId` / `publishCommandId`
 * — persists `customerPriceFcfa`, HER price (productSubtotal = B + M) as signed at
 * publish. **No canon change**; `ResellerListing` is untouched. The buyer's price is
 * READ from here and CARRIED verbatim, never recomputed from live supplier
 * economics. (Open question, journaled: if a second consumer ever needs the buyer
 * price, a signed-price concept becomes a CANON conversation, not a shop-plus one.)
 */
export interface ListingEntry {
  readonly listing: ResellerListing;
  readonly storefrontId: string;
  readonly publishCommandId: string;
  /** HER price, FROZEN at publish (productSubtotal = B + M) — carried, never recomputed. */
  readonly customerPriceFcfa: number;
}

function publishedEvent(cmd: PublishListingCommand): PlatformEvent {
  return PlatformEventSchema.parse({
    name: 'listing.published.v1',
    envelope: {
      command_id: `listing-publish-${cmd.listingId}`,
      correlation_id: cmd.correlationId,
      aggregateVersion: 1,
      actor: 'storefront-service:listing-aggregate',
      serverTime: cmd.at,
      version: '1',
    },
    payload: {
      listing_id: cmd.listingId,
      storefront_id: cmd.storefrontId,
      reseller_id: cmd.resellerId,
      // HUB-ASSURANCE-1 — the PROVENANCE travels, not a verdict. The old
      // `hub_verified: boolean` collapsed « she said so » and « the hub confirmed »
      // into one flag that lit a customer-visible « Vérifiée » badge.
      // Fail-closed: an omitted assurance is `declared`, so a caller who forgets can
      // never accidentally publish a verification claim.
      stock_assurance: { source: cmd.stockAssurance?.source ?? 'declared' },
      customer_price_fcfa: cmd.customerPriceFcfa, // CARRIED, never recomputed
    },
  });
}

function autoHiddenEvent(listing: ResellerListing, storefrontId: string, correlationId: string, at: string): PlatformEvent {
  return PlatformEventSchema.parse({
    name: 'listing.auto_hidden.v1',
    envelope: {
      command_id: `listing-hide-${listing.id}`,
      correlation_id: correlationId,
      aggregateVersion: listing.version,
      actor: 'storefront-service:listing-aggregate',
      serverTime: at,
      version: '1',
    },
    payload: {
      listing_id: listing.id,
      storefront_id: storefrontId,
    },
  });
}

/**
 * PUBLISH — idempotent on the publish command_id; a new command_id (re)publishes.
 *
 * REPUBLISH IS A NEW VERSION, NEVER A MUTATION (founder ruling). A different
 * price means a new listing VERSION carrying the new signed price: `version`
 * increments from the current entry rather than resetting to 1. That is what
 * makes « le prix reste signé » honest rather than a snapshot that quietly rots —
 * the price a buyer was shown belongs to the version she was shown, and changing
 * what you charge is an act (a republish), not a drift.
 */
export function decidePublish(
  current: ListingEntry | undefined,
  cmd: PublishListingCommand,
): { decision: PublishDecision; next?: ListingEntry } {
  if (current && current.publishCommandId === cmd.commandId) {
    return { decision: { status: 'idempotent', listing: current.listing } };
  }
  const listing: ResellerListing = ResellerListingSchema.parse({
    id: cmd.listingId,
    resellerId: cmd.resellerId,
    productVersionId: cmd.productVersionId,
    offerVersion: cmd.offerVersion,
    markup: cmd.markup,
    version: current ? current.listing.version + 1 : 1,
    variants: [],
    status: LISTING_PUBLISHED,
  });
  const next: ListingEntry = {
    listing,
    storefrontId: cmd.storefrontId,
    publishCommandId: cmd.commandId,
    customerPriceFcfa: cmd.customerPriceFcfa, // SUPPLIED from the waterfall, frozen here
  };
  return { decision: { status: 'published', listing, event: publishedEvent(cmd) }, next };
}

/** AUTO-HIDE — absent → surfaced; already hidden → unchanged (no second event);
 * else flips the canon status and fires `listing.auto_hidden.v1` ONCE. */
export function decideAutoHide(
  current: ListingEntry | undefined,
  correlationId: string,
  at: string,
): { decision: HideDecision; next?: ListingEntry } {
  if (!current) return { decision: { status: 'absent' } };
  if (current.listing.status === LISTING_AUTO_HIDDEN) {
    return { decision: { status: 'unchanged', listing: current.listing } };
  }
  const listing: ResellerListing = { ...current.listing, status: LISTING_AUTO_HIDDEN };
  const next: ListingEntry = { ...current, listing };
  return {
    decision: { status: 'hidden', listing, event: autoHiddenEvent(listing, current.storefrontId, correlationId, at) },
    next,
  };
}
