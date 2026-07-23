import {
  decideAutoHide,
  decidePublish,
  type HideDecision,
  type ListingEntry,
  type PublishDecision,
  type PublishListingCommand,
} from './listing-core.js';
import type { ResellerListing } from '@platform/contracts';

/**
 * LISTING AGGREGATE (SP#001-B · Building Plan SP1.3). A storefront lists an offer
 * at HER price and auto-hides it when the stock goes out. The record is canon
 * `ResellerListingSchema` consumed VERBATIM; the aggregate only decides transitions.
 *
 * The transition logic is the pure core in `listing-core.ts` (`decidePublish` /
 * `decideAutoHide`), shared VERBATIM with the per-listing Durable Object
 * (STOREFRONT-READ-PATH-1) — the ratified single-authority pattern. This registry
 * is the in-memory single-writer substrate (CI); the DURABLE host (idFromName(
 * listingId)) applies the SAME decisions to `this.state.storage`.
 *
 * HER price is CARRIED from the waterfall and never recomputed — the money path
 * stays frozen (the core does no arithmetic on any amount).
 */

// Re-exported so consumers keep their existing import surface (byte-stable).
export {
  LISTING_PUBLISHED,
  LISTING_AUTO_HIDDEN,
  type PublishListingCommand,
  type PublishDecision,
  type HideDecision,
  type ListingEntry,
} from './listing-core.js';

/**
 * One writer per listing by construction: one `ListingEntry` per listingId, all
 * transitions through the shared core. The same decisions run inside the
 * per-listing Durable Object; the Map is only this in-memory substrate's backing.
 */
export class ListingRegistry {
  private readonly byId = new Map<string, ListingEntry>();

  publish(cmd: PublishListingCommand): PublishDecision {
    const { decision, next } = decidePublish(this.byId.get(cmd.listingId), cmd);
    if (next) this.byId.set(cmd.listingId, next);
    return decision;
  }

  autoHide(args: { listingId: string; correlationId: string; at: string }): HideDecision {
    const { decision, next } = decideAutoHide(this.byId.get(args.listingId), args.correlationId, args.at);
    if (next) this.byId.set(args.listingId, next);
    return decision;
  }

  get(listingId: string): ResellerListing | undefined {
    return this.byId.get(listingId)?.listing;
  }
}
