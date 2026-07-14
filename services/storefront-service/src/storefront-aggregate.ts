import {
  PlatformEventSchema,
  ResellerShortCodeSchema,
  StorefrontSchema,
  shortCodeToSlug,
  type PlatformEvent,
  type Storefront,
} from '@platform/contracts';

/**
 * STOREFRONT AGGREGATE (SP#001-A · §5.2 "Shop+ owns Storefront & Attribution").
 * The Seller #001 aggregate: create (idempotent on command_id) · publish /
 * unpublish · canon events with real envelopes · single writer per storefront ·
 * `updatedAt` moves ONLY on a real change (it is the directory's ordering truth,
 * SP#001-B). The shape is canon `StorefrontSchema` (v0.9.9, WO-5.13) consumed
 * VERBATIM — never redefined; the aggregate only decides transitions.
 *
 * Mirrors the ratified single-authority pattern (the attribution lock / the
 * reservation DO): a pure decision + an in-memory single-writer registry keyed
 * by storefront id. The DURABLE host (a StorefrontDO on workerd) is the same
 * separable substrate the lock got in its own slice — named, not built here.
 *
 * Canon has NO per-event payload shape (envelope + names only — see canon
 * docs/derivations/STOREFRONT-FIELDS.md §4); payloads are built at THIS service
 * boundary via `PlatformEventSchema`, exactly as the attribution lock does.
 * Canon has `storefront.created.v1` + `storefront.published.v1` but NO
 * `unpublished` name — so the discoverability toggle (both directions) is the
 * `storefront.published.v1` event carrying `discoverable: boolean`; it fires
 * ONCE per real change. (Surfaced: consuming the existing canon name, never
 * inventing an event schema — §7.)
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

export class StorefrontShortCodeError extends Error {
  override readonly name = 'StorefrontShortCodeError';
}

/** The bare canon slug (`seller-0001`) DERIVED from a valid short code, shape enforced. */
function slugFromShortCode(shortCode: string): string {
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

interface Entry {
  storefront: Storefront;
  createCommandId: string;
  /** Aggregate version — bumps on each real discoverability change (published event seq). */
  version: number;
}

/**
 * One writer per storefront by construction: exactly one `Entry` per id, all
 * transitions go through this registry, `updatedAt` advances only on a real
 * change. Ready to host inside a per-storefront Durable Object (idFromName(id)).
 */
export class StorefrontRegistry {
  private readonly byId = new Map<string, Entry>();

  create(cmd: CreateStorefrontCommand): CreateDecision {
    const existing = this.byId.get(cmd.id);
    if (existing) {
      // Idempotent on the create command_id; a different command_id can never
      // re-create an existing storefront (collision, surfaced).
      if (existing.createCommandId === cmd.commandId) {
        return { status: 'idempotent', storefront: existing.storefront };
      }
      return { status: 'collision', existing: existing.storefront };
    }
    const slug = slugFromShortCode(cmd.shortCode); // shape-enforced or throws
    const storefront: Storefront = StorefrontSchema.parse({
      id: cmd.id,
      resellerId: cmd.resellerId,
      slug,
      discoverable: false, // created unpublished; a real publish makes it discoverable
      curatedItems: [],
      name: cmd.name,
      zone: cmd.zone,
      category: cmd.category,
      createdAt: cmd.at,
      updatedAt: cmd.at,
    });
    this.byId.set(cmd.id, { storefront, createCommandId: cmd.commandId, version: 1 });
    return { status: 'created', storefront, event: createdEvent(storefront, cmd.correlationId) };
  }

  private setDiscoverable(id: string, discoverable: boolean, correlationId: string, at: string): ToggleDecision {
    const entry = this.byId.get(id);
    if (!entry) return { status: 'absent' };
    if (entry.storefront.discoverable === discoverable) {
      return { status: 'unchanged', storefront: entry.storefront }; // no event, updatedAt untouched
    }
    entry.version += 1;
    const storefront: Storefront = { ...entry.storefront, discoverable, updatedAt: at };
    entry.storefront = storefront;
    return { status: 'changed', storefront, event: publishedEvent(storefront, correlationId, at, entry.version) };
  }

  publish(args: { id: string; correlationId: string; at: string }): ToggleDecision {
    return this.setDiscoverable(args.id, true, args.correlationId, args.at);
  }

  unpublish(args: { id: string; correlationId: string; at: string }): ToggleDecision {
    return this.setDiscoverable(args.id, false, args.correlationId, args.at);
  }

  get(id: string): Storefront | undefined {
    return this.byId.get(id)?.storefront;
  }
}
