import {
  PlatformEventSchema,
  ResellerShortCodeSchema,
  StorefrontSchema,
  shortCodeToSlug,
  type PlatformEvent,
  type Storefront,
} from '@platform/contracts';

/**
 * STOREFRONT DECISION CORE (STOREFRONT-READ-PATH-1). The pure per-storefront
 * transition, extracted so ONE decision logic serves both substrates — the
 * in-memory registry (CI) and the per-storefront Durable Object (prod) — exactly
 * as the attribution lock keeps `decideLock` and the reservation keeps
 * `decideReservation` pure and shared. The DO cannot import a `Map`; it imports
 * these functions and applies them to `this.state.storage`. No arithmetic on any
 * amount lives here — this is identity/discoverability, never money.
 *
 * An `entry` is the serialisable per-storefront state: the canon Storefront plus
 * the create command id (idempotency) and the aggregate version (bumps only on a
 * real discoverability change — the directory's ordering truth, SP#001-B). Every
 * `decide*` returns the DECISION (the caller returns to its caller) and, when the
 * state really changed, the `next` entry to PERSIST (Map.set here, storage.put in
 * the DO). No `next` = nothing to write (idempotent / unchanged / collision).
 */

export interface CreateStorefrontCommand {
  readonly commandId: string;
  readonly id: string;
  readonly resellerId: string;
  /** Validated to `ResellerShortCodeSchema`; the canon `slug` is DERIVED from it. */
  readonly shortCode: string;
  readonly name: string;
  readonly zone: string;
  readonly category: string;
  readonly correlationId: string;
  readonly at: string;
}

export type CreateDecision =
  | { readonly status: 'created'; readonly storefront: Storefront; readonly event: PlatformEvent }
  | { readonly status: 'idempotent'; readonly storefront: Storefront }
  | { readonly status: 'collision'; readonly existing: Storefront };

export type ToggleDecision =
  | { readonly status: 'changed'; readonly storefront: Storefront; readonly event: PlatformEvent }
  | { readonly status: 'unchanged'; readonly storefront: Storefront }
  | { readonly status: 'absent' };

/** The serialisable per-storefront durable state (one per idFromName(id)). */
export interface StorefrontEntry {
  readonly storefront: Storefront;
  readonly createCommandId: string;
  /** Aggregate version — bumps on each real discoverability change. */
  readonly version: number;
}

export class StorefrontShortCodeError extends Error {
  override readonly name = 'StorefrontShortCodeError';
}

/** The bare canon slug (`seller-0001`) DERIVED from a valid short code, shape enforced. */
export function slugFromShortCode(shortCode: string): string {
  const parsed = ResellerShortCodeSchema.safeParse(shortCode);
  if (!parsed.success) {
    throw new StorefrontShortCodeError(`invalid reseller short code: ${JSON.stringify(shortCode)}`);
  }
  // shortCodeToSlug → `/v/seller-0001`; the storefront `slug` is the bare tail.
  return shortCodeToSlug(parsed.data).replace(/^\/v\//, '');
}

function createdEvent(sf: Storefront, correlationId: string): PlatformEvent {
  return PlatformEventSchema.parse({
    name: 'storefront.created.v1',
    envelope: {
      command_id: `sf-create-${sf.id}`,
      correlation_id: correlationId,
      aggregateVersion: 1,
      actor: 'storefront-service:aggregate',
      serverTime: sf.createdAt,
      version: '1',
    },
    payload: {
      storefront_id: sf.id,
      reseller_id: sf.resellerId,
      slug: sf.slug,
      name: sf.name,
      zone: sf.zone,
      category: sf.category,
    },
  });
}

function publishedEvent(sf: Storefront, correlationId: string, at: string, seq: number): PlatformEvent {
  return PlatformEventSchema.parse({
    name: 'storefront.published.v1',
    envelope: {
      command_id: `sf-publish-${sf.id}-${seq}`,
      correlation_id: correlationId,
      aggregateVersion: seq,
      actor: 'storefront-service:aggregate',
      serverTime: at,
      version: '1',
    },
    payload: {
      storefront_id: sf.id,
      discoverable: sf.discoverable,
    },
  });
}

/**
 * CREATE — idempotent on the create command_id; a different command_id can never
 * re-create an existing storefront (collision, surfaced). A first create derives
 * the slug (shape-enforced or throws) and builds the canon Storefront
 * (discoverable=false — a real publish makes it discoverable).
 */
export function decideCreate(
  current: StorefrontEntry | undefined,
  cmd: CreateStorefrontCommand,
): { decision: CreateDecision; next?: StorefrontEntry } {
  if (current) {
    if (current.createCommandId === cmd.commandId) {
      return { decision: { status: 'idempotent', storefront: current.storefront } };
    }
    return { decision: { status: 'collision', existing: current.storefront } };
  }
  const slug = slugFromShortCode(cmd.shortCode); // shape-enforced or throws
  const storefront: Storefront = StorefrontSchema.parse({
    id: cmd.id,
    resellerId: cmd.resellerId,
    slug,
    discoverable: false,
    curatedItems: [],
    name: cmd.name,
    zone: cmd.zone,
    category: cmd.category,
    createdAt: cmd.at,
    updatedAt: cmd.at,
  });
  const next: StorefrontEntry = { storefront, createCommandId: cmd.commandId, version: 1 };
  return { decision: { status: 'created', storefront, event: createdEvent(storefront, cmd.correlationId) }, next };
}

/**
 * TOGGLE discoverability. Absent → surfaced (never a phantom write). No real
 * change → unchanged (no event, `updatedAt` untouched). A real change bumps the
 * version, moves `updatedAt`, and fires `storefront.published.v1` ONCE.
 */
export function decideToggle(
  current: StorefrontEntry | undefined,
  discoverable: boolean,
  correlationId: string,
  at: string,
): { decision: ToggleDecision; next?: StorefrontEntry } {
  if (!current) return { decision: { status: 'absent' } };
  if (current.storefront.discoverable === discoverable) {
    return { decision: { status: 'unchanged', storefront: current.storefront } };
  }
  const version = current.version + 1;
  const storefront: Storefront = { ...current.storefront, discoverable, updatedAt: at };
  const next: StorefrontEntry = { storefront, createCommandId: current.createCommandId, version };
  return { decision: { status: 'changed', storefront, event: publishedEvent(storefront, correlationId, at, version) }, next };
}

/* ------------------------------------------ REAL-PRODUCT-RENDER-1 (a2) -- */

export type AddItemDecision =
  | { readonly status: 'added'; readonly storefront: Storefront }
  | { readonly status: 'already_present'; readonly storefront: Storefront }
  | { readonly status: 'absent' };

/**
 * MEMBERSHIP — publishing a listing puts its product IN her shop (founder ruling).
 *
 * `curatedItems` is the canon, buyer-facing MEMBERSHIP statement — what is in her
 * shop — and it is authoritative for the buyer. Curation (the « à la une et ordre »
 * screen) is about ARRANGEMENT over the articles already present, not about
 * membership: a seller who publishes a product and then finds an empty shop, with a
 * second screen to hunt for, is a design failure.
 *
 * APPEND-IF-ABSENT, POSITION PRESERVED. A pid already present is left exactly where
 * it is and reports `already_present` — republishing must never silently rearrange a
 * shop she arranged. Appending is the ONLY mutation here: nothing reorders, nothing
 * removes, and `updatedAt` moves only on a real change.
 */
export function decideAddItem(
  current: StorefrontEntry | undefined,
  pid: string,
  at: string,
): { decision: AddItemDecision; next?: StorefrontEntry } {
  if (!current) return { decision: { status: 'absent' } };
  if (current.storefront.curatedItems.includes(pid)) {
    return { decision: { status: 'already_present', storefront: current.storefront } };
  }
  const storefront: Storefront = {
    ...current.storefront,
    curatedItems: [...current.storefront.curatedItems, pid], // appended, never reordered
    updatedAt: at,
  };
  return { decision: { status: 'added', storefront }, next: { ...current, storefront } };
}

/* --------------------------------------------- STOREFRONT-DELETE-1 ------ */

export type DeleteDecision =
  | { readonly status: 'deleted'; readonly slug: string }
  | { readonly status: 'absent' };

/**
 * DELETE — the operator cleanup act (the route this was built for: the two
 * orphan live shops created before the DELETE surface existed). Absent →
 * surfaced, never a phantom success. Deleted carries the SLUG so the caller can
 * clear the slug pointer — the entry is the only place the slug is known.
 *
 * DELIBERATELY EVENT-FREE: canon names no `storefront.deleted.v1`, and canon
 * event names are not invented here (a §7 stop if one is ever wanted). Listing
 * cleanup is likewise OUT of this decision: a deleted shop's reads die at the
 * slug (`getBySlug` → honest 404), so anything a listing points at is already
 * unreachable — and the orphans this serves have no listings at all.
 */
export function decideDelete(current: StorefrontEntry | undefined): { decision: DeleteDecision; erase: boolean } {
  if (!current) return { decision: { status: 'absent' }, erase: false };
  return { decision: { status: 'deleted', slug: current.storefront.slug }, erase: true };
}
