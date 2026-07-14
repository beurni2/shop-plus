import {
  PlatformEventSchema,
  ResellerListingSchema,
  type PlatformEvent,
  type ResellerListing,
} from '@platform/contracts';

/**
 * LISTING AGGREGATE (SP#001-B · Building Plan SP1.3 "Listing + markup +
 * storefront"). A storefront lists an offer at HER price and can auto-hide it
 * when the stock goes out (SP1.3: "auto-hide on out-of-stock/blocked/expired").
 * This is the MINIMAL seam that feeds THE PRODUCER (`@shop-plus/store-projection`):
 * a listing's published/auto-hidden lifecycle drives the store's productCount,
 * lastUpdated, and hub-verified badge. Full SP1.3 (markup-cap enforcement, the
 * net-preview UI, version-on-price-change) is NOT this slice.
 *
 * The record is canon `ResellerListingSchema` (v0.9.9) consumed VERBATIM — the
 * aggregate only decides transitions. Canon has NO per-event payload shape
 * (envelope + name only), so payloads are built at THIS boundary via
 * `PlatformEventSchema`, exactly as the storefront aggregate does. Canon event
 * names `listing.published.v1` and `listing.auto_hidden.v1` are consumed; no
 * event name is invented.
 *
 * HER price (`customerPriceFcfa` = productSubtotal = B + M) and the Boutik+
 * hub-verified-stock signal (`hubVerified`, SP-I19) are SUPPLIED to the command
 * and ride the event payload. HER price is NEVER recomputed here — it comes from
 * the immutable Quote / waterfall (commerce-core); the money path stays frozen.
 * The real Boutik hub wire is deferred (the demo-supply seam supplies it).
 */

/** The app-boundary listing status (canon `status` is a free string). */
export const LISTING_PUBLISHED = 'published';
export const LISTING_AUTO_HIDDEN = 'auto_hidden';

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
  /** Boutik+ hub-verified-stock signal (SP-I19); real wire deferred. */
  readonly hubVerified: boolean;
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
      hub_verified: cmd.hubVerified,
      customer_price_fcfa: cmd.customerPriceFcfa,
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

interface Entry {
  listing: ResellerListing;
  storefrontId: string;
  publishCommandId: string;
}

/**
 * One writer per listing by construction: one `Entry` per listingId, all
 * transitions through this registry. `publish` is idempotent on the command_id;
 * `autoHide` flips the canon `status` to auto-hidden and fires the event once.
 */
export class ListingRegistry {
  private readonly byId = new Map<string, Entry>();

  publish(cmd: PublishListingCommand): PublishDecision {
    const existing = this.byId.get(cmd.listingId);
    if (existing && existing.publishCommandId === cmd.commandId) {
      return { status: 'idempotent', listing: existing.listing };
    }
    const listing: ResellerListing = ResellerListingSchema.parse({
      id: cmd.listingId,
      resellerId: cmd.resellerId,
      productVersionId: cmd.productVersionId,
      offerVersion: cmd.offerVersion,
      markup: cmd.markup,
      version: 1,
      variants: [],
      status: LISTING_PUBLISHED,
    });
    this.byId.set(cmd.listingId, { listing, storefrontId: cmd.storefrontId, publishCommandId: cmd.commandId });
    return { status: 'published', listing, event: publishedEvent(cmd) };
  }

  autoHide(args: { listingId: string; correlationId: string; at: string }): HideDecision {
    const entry = this.byId.get(args.listingId);
    if (!entry) return { status: 'absent' };
    if (entry.listing.status === LISTING_AUTO_HIDDEN) {
      return { status: 'unchanged', listing: entry.listing };
    }
    const listing: ResellerListing = { ...entry.listing, status: LISTING_AUTO_HIDDEN };
    entry.listing = listing;
    return {
      status: 'hidden',
      listing,
      event: autoHiddenEvent(listing, entry.storefrontId, args.correlationId, args.at),
    };
  }

  get(listingId: string): ResellerListing | undefined {
    return this.byId.get(listingId)?.listing;
  }
}
