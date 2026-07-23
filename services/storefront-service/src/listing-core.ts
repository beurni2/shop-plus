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

/** The serialisable per-listing durable state (one per idFromName(listingId)). */
export interface ListingEntry {
  readonly listing: ResellerListing;
  readonly storefrontId: string;
  readonly publishCommandId: string;
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
      hub_verified: cmd.hubVerified,
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

/** PUBLISH — idempotent on the publish command_id; a new command_id (re)publishes. */
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
    version: 1,
    variants: [],
    status: LISTING_PUBLISHED,
  });
  const next: ListingEntry = { listing, storefrontId: cmd.storefrontId, publishCommandId: cmd.commandId };
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
