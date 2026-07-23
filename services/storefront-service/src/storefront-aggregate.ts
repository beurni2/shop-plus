import {
  decideCreate,
  decideToggle,
  StorefrontShortCodeError,
  type CreateDecision,
  type CreateStorefrontCommand,
  type StorefrontEntry,
  type ToggleDecision,
} from './storefront-core.js';
import type { Storefront } from '@platform/contracts';

/**
 * STOREFRONT AGGREGATE (SP#001-A · §5.2 "Shop+ owns Storefront & Attribution").
 * The Seller #001 aggregate: create (idempotent on command_id) · publish /
 * unpublish · canon events with real envelopes · single writer per storefront ·
 * `updatedAt` moves ONLY on a real change (it is the directory's ordering truth,
 * SP#001-B). The shape is canon `StorefrontSchema` consumed VERBATIM.
 *
 * The transition logic is the pure core in `storefront-core.ts` (`decideCreate` /
 * `decideToggle`), shared VERBATIM with the per-storefront Durable Object
 * (STOREFRONT-READ-PATH-1) — the ratified single-authority pattern (the
 * attribution lock's `decideLock`, the reservation DO's `decideReservation`).
 * This registry is the in-memory single-writer substrate (CI): one `Entry` per
 * id, all transitions through the core, the DURABLE host addressed by
 * idFromName(id) applies the SAME decisions to `this.state.storage`.
 */

// Re-exported so consumers keep their existing import surface (byte-stable).
export {
  StorefrontShortCodeError,
  type CreateStorefrontCommand,
  type CreateDecision,
  type ToggleDecision,
  type StorefrontEntry,
} from './storefront-core.js';

/**
 * One writer per storefront by construction: exactly one `StorefrontEntry` per
 * id, all transitions go through the shared core, `updatedAt` advances only on a
 * real change. The same decisions run inside the per-storefront Durable Object
 * (idFromName(id)); the Map is only this in-memory substrate's backing.
 */
export class StorefrontRegistry {
  private readonly byId = new Map<string, StorefrontEntry>();

  create(cmd: CreateStorefrontCommand): CreateDecision {
    const { decision, next } = decideCreate(this.byId.get(cmd.id), cmd);
    if (next) this.byId.set(cmd.id, next);
    return decision;
  }

  publish(args: { id: string; correlationId: string; at: string }): ToggleDecision {
    const { decision, next } = decideToggle(this.byId.get(args.id), true, args.correlationId, args.at);
    if (next) this.byId.set(args.id, next);
    return decision;
  }

  unpublish(args: { id: string; correlationId: string; at: string }): ToggleDecision {
    const { decision, next } = decideToggle(this.byId.get(args.id), false, args.correlationId, args.at);
    if (next) this.byId.set(args.id, next);
    return decision;
  }

  get(id: string): Storefront | undefined {
    return this.byId.get(id)?.storefront;
  }
}
