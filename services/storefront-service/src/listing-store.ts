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

/**
 * A DO transport failure this shim could not complete. Thrown, never returned as a
 * decision — see `ListingStoreError` below for why the two must not be confused.
 */
export class ListingStoreError extends Error {
  constructor(
    readonly op: 'publish' | 'autoHide' | 'getById',
    readonly reason: 'http_error' | 'unparseable' | 'unshaped',
    readonly httpStatus?: number,
  ) {
    super(`listing store ${op} failed: ${reason}${httpStatus === undefined ? '' : ` (http ${httpStatus})`}`);
    this.name = 'ListingStoreError';
  }
}

/**
 * The durable substrate: forwards each op to the per-listing DO worker over fetch.
 *
 * ═══ LISTING-SHIM-HONESTY-1 — THE FABRICATED SUCCESS THIS REMOVES ═══
 *
 * Every method used to do `(await res.json()) as Decision` with NO STATUS CHECK. A
 * 500 from the DO, or an HTML error page, was either cast to a `PublishDecision`
 * whose `.status` is `undefined` — matching neither `published` nor `idempotent`,
 * and distinguished by no caller — or threw a raw JSON parse error up the request.
 * `getById` checked only 404 and cast every other non-2xx to a `ResellerListing`.
 *
 * **This is the same fabricated-success shape removed from the reseller seam
 * (RESELLER-SEAM-HONESTY-1), and it was worse here: this is the path that SIGNS A
 * PRICE.** A publish that failed at the DO could return an object the caller would
 * not recognise as a failure, on the write that decides what a buyer is charged.
 *
 * ═══ WHY A THROW AND NOT A DECISION VALUE ═══
 *
 * `PublishDecision` is the LISTING DOMAIN'S vocabulary — `published` / `idempotent`
 * are things the aggregate DECIDED. A transport failure is not a decision; it is the
 * absence of one. Adding a `failed` member to the decision union would let a
 * transport fault be pattern-matched as if the aggregate had ruled, which is the
 * conflation the whole diagnostic-status work exists to prevent (the same reason
 * `refused` was rejected as a supply status: `refusals: []` on a « refused » answer
 * is a contradiction on one screen). So the shim throws, the route turns it into an
 * honest 502, and NOTHING can mistake it for an outcome.
 */
export class DurableListingStore implements ListingStore {
  constructor(private readonly worker: StorefrontFetcher) {}

  /** One status-checked, parse-checked read. The shape guard is the load-bearing
   *  half: a 200 carrying `{"error":"…"}` is still not a decision. */
  private async decide<T>(
    op: 'publish' | 'autoHide' | 'getById',
    request: Request,
    shaped: (v: unknown) => v is T,
  ): Promise<T> {
    const res = await this.worker.fetch(request);
    if (!res.ok) throw new ListingStoreError(op, 'http_error', res.status);
    const body: unknown = await res.json().catch(() => undefined);
    if (body === undefined) throw new ListingStoreError(op, 'unparseable', res.status);
    if (!shaped(body)) throw new ListingStoreError(op, 'unshaped', res.status);
    return body;
  }

  async publish(cmd: PublishListingCommand): Promise<PublishDecision> {
    return this.decide(
      'publish',
      new Request('https://listing-do/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd),
      }),
      isPublishDecision,
    );
  }

  async autoHide(args: HideArgs): Promise<HideDecision> {
    return this.decide(
      'autoHide',
      new Request(`https://listing-do/listings/${encodeURIComponent(args.listingId)}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      }),
      isHideDecision,
    );
  }

  async getById(listingId: string): Promise<ResellerListing | undefined> {
    const res = await this.worker.fetch(new Request(`https://listing-do/listings/${encodeURIComponent(listingId)}`));
    // 404 is the DO's HONEST « no such listing » — an answer, not a fault.
    if (res.status === 404) return undefined;
    if (!res.ok) throw new ListingStoreError('getById', 'http_error', res.status);
    const body: unknown = await res.json().catch(() => undefined);
    if (body === undefined) throw new ListingStoreError('getById', 'unparseable', res.status);
    if (!isResellerListing(body)) throw new ListingStoreError('getById', 'unshaped', res.status);
    return body;
  }
}

/* --- shape guards: the minimum that distinguishes a decision from an error body --- */

function statusOf(v: unknown): string | undefined {
  return v !== null && typeof v === 'object' ? (v as { status?: unknown }).status as string | undefined : undefined;
}
function isPublishDecision(v: unknown): v is PublishDecision {
  const s = statusOf(v);
  return s === 'published' || s === 'idempotent';
}
function isHideDecision(v: unknown): v is HideDecision {
  const s = statusOf(v);
  return s === 'hidden' || s === 'unchanged' || s === 'absent';
}
function isResellerListing(v: unknown): v is ResellerListing {
  return v !== null && typeof v === 'object' && typeof (v as ResellerListing).id === 'string';
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
