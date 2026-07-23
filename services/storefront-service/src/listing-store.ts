import type { ResellerListing } from '@platform/contracts';
import { ListingRegistry } from './listing-aggregate.js';
import type { HideDecision, PublishDecision, PublishListingCommand } from './listing-core.js';
import type { StorefrontFetcher } from './storefront-store.js';

/**
 * LISTING STORE — the one persistence port for the listing aggregate, the SAME
 * env-gated swap the storefront store gets (STOREFRONT-READ-PATH-1, "same
 * treatment"): `InMemoryListingStore` (CI — the registry Map) and
 * `DurableListingStore` (prod — the per-listing DO over `fetch`). `resolveListingStore`
 * picks by the environment; CI sets no binding, so it can never reach real storage.
 * HER price is carried, never recomputed — this port moves records, not money.
 */

export interface HideArgs {
  readonly listingId: string;
  readonly correlationId: string;
  readonly at: string;
}

export interface ListingStore {
  publish(cmd: PublishListingCommand): Promise<PublishDecision>;
  autoHide(args: HideArgs): Promise<HideDecision>;
  getById(listingId: string): Promise<ResellerListing | undefined>;
}

/** The in-memory substrate: the listing registry. */
export class InMemoryListingStore implements ListingStore {
  private readonly registry = new ListingRegistry();

  async publish(cmd: PublishListingCommand): Promise<PublishDecision> {
    return this.registry.publish(cmd);
  }

  async autoHide(args: HideArgs): Promise<HideDecision> {
    return this.registry.autoHide(args);
  }

  async getById(listingId: string): Promise<ResellerListing | undefined> {
    return this.registry.get(listingId);
  }
}

/** The environment the store resolves from (the listing DO binding, if bound). */
export interface ListingStoreEnv {
  readonly LISTING_DO?: StorefrontFetcher;
}

/** The durable substrate: forwards each op to the per-listing DO worker over fetch. */
export class DurableListingStore implements ListingStore {
  constructor(private readonly worker: StorefrontFetcher) {}

  async publish(cmd: PublishListingCommand): Promise<PublishDecision> {
    const res = await this.worker.fetch(
      new Request('https://listing-do/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
      }),
    );
    return (await res.json()) as PublishDecision;
  }

  async autoHide(args: HideArgs): Promise<HideDecision> {
    const res = await this.worker.fetch(
      new Request(`https://listing-do/listings/${encodeURIComponent(args.listingId)}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      }),
    );
    return (await res.json()) as HideDecision;
  }

  async getById(listingId: string): Promise<ResellerListing | undefined> {
    const res = await this.worker.fetch(new Request(`https://listing-do/listings/${encodeURIComponent(listingId)}`));
    if (res.status === 404) return undefined;
    return (await res.json()) as ResellerListing;
  }
}

/**
 * Pick the store from the environment: durable iff the listing DO binding is
 * present, in-memory otherwise. CI/tests/local bind nothing (the `resolveMediaStore`
 * / `resolveStorefrontStore` precedent) — never real storage by construction.
 */
export function resolveListingStore(env?: ListingStoreEnv): ListingStore {
  const binding = env?.LISTING_DO;
  if (binding && typeof binding.fetch === 'function') return new DurableListingStore(binding);
  return new InMemoryListingStore();
}
