import type { Storefront } from '@platform/contracts';
import { StorefrontRegistry } from './storefront-aggregate.js';
import type { CreateDecision, CreateStorefrontCommand, ToggleDecision } from './storefront-core.js';

/**
 * STOREFRONT STORE — the one persistence port for the storefront aggregate
 * (STOREFRONT-READ-PATH-1). Both substrates implement it and the read route
 * never knows which: `InMemoryStorefrontStore` (CI/tests/local — the registry
 * Map) and `DurableStorefrontStore` (prod — talks to the per-storefront Durable
 * Object worker over `fetch`, exactly as `GcsMediaStore` talks to the bucket
 * over fetch, so this module needs no workerd DO types). `resolveStorefrontStore`
 * picks by the environment — the DO service binding present ⇒ durable, absent ⇒
 * in-memory — the same env-gated swap as `resolveMediaStore`. CI sets no binding,
 * so it can never reach real storage; the mock-gate is enforced by construction.
 *
 * The slug→id resolution is SHAPE C (founder ruling): a per-slug pointer entry
 * (`idFromName('slug:'+slug)` → `{ storefrontId }`) beside the storefront entry
 * (`idFromName(id)`). Write-once because the slug is immutable; no second binding,
 * no global-directory hotspot. In-memory mirrors it with a `slug→id` Map.
 */

export interface ToggleArgs {
  readonly id: string;
  readonly correlationId: string;
  readonly at: string;
}

export interface StorefrontStore {
  create(cmd: CreateStorefrontCommand): Promise<CreateDecision>;
  publish(args: ToggleArgs): Promise<ToggleDecision>;
  unpublish(args: ToggleArgs): Promise<ToggleDecision>;
  getById(id: string): Promise<Storefront | undefined>;
  /** THE READ PATH: slug → storefront, or undefined = honest not-found. */
  getBySlug(slug: string): Promise<Storefront | undefined>;
}

/** The in-memory substrate: the registry + the slug→id pointer index (Shape C). */
export class InMemoryStorefrontStore implements StorefrontStore {
  private readonly registry = new StorefrontRegistry();
  private readonly slugToId = new Map<string, string>();

  async create(cmd: CreateStorefrontCommand): Promise<CreateDecision> {
    const decision = this.registry.create(cmd);
    // write-once: the slug pointer lands on the real create only (slug immutable).
    if (decision.status === 'created') this.slugToId.set(decision.storefront.slug, decision.storefront.id);
    return decision;
  }

  async publish(args: ToggleArgs): Promise<ToggleDecision> {
    return this.registry.publish(args);
  }

  async unpublish(args: ToggleArgs): Promise<ToggleDecision> {
    return this.registry.unpublish(args);
  }

  async getById(id: string): Promise<Storefront | undefined> {
    return this.registry.get(id);
  }

  async getBySlug(slug: string): Promise<Storefront | undefined> {
    const id = this.slugToId.get(slug);
    return id === undefined ? undefined : this.registry.get(id);
  }
}

/** A minimal fetch target — the DO worker in prod, miniflare's dispatch in CI. */
export interface StorefrontFetcher {
  fetch(request: Request): Promise<Response>;
}

/** The environment the store resolves from (the DO service binding, if bound). */
export interface StorefrontStoreEnv {
  readonly STOREFRONT_DO?: StorefrontFetcher;
}

/**
 * The durable substrate: forwards each aggregate op to the per-storefront DO
 * worker over `fetch`. The worker owns the DO-instance addressing (idFromName)
 * and the slug pointer (Shape C); this adapter is a thin, workerd-type-free
 * client — the through-a-binding analogue of `GcsMediaStore`.
 */
export class DurableStorefrontStore implements StorefrontStore {
  constructor(private readonly worker: StorefrontFetcher) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.worker.fetch(
      new Request(`https://storefront-do${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return (await res.json()) as T;
  }

  async create(cmd: CreateStorefrontCommand): Promise<CreateDecision> {
    return this.post<CreateDecision>('/storefronts', cmd);
  }

  async publish(args: ToggleArgs): Promise<ToggleDecision> {
    return this.post<ToggleDecision>(`/storefronts/${encodeURIComponent(args.id)}/publish`, args);
  }

  async unpublish(args: ToggleArgs): Promise<ToggleDecision> {
    return this.post<ToggleDecision>(`/storefronts/${encodeURIComponent(args.id)}/unpublish`, args);
  }

  async getById(id: string): Promise<Storefront | undefined> {
    const res = await this.worker.fetch(new Request(`https://storefront-do/storefronts/${encodeURIComponent(id)}`));
    if (res.status === 404) return undefined;
    return (await res.json()) as Storefront;
  }

  async getBySlug(slug: string): Promise<Storefront | undefined> {
    const res = await this.worker.fetch(new Request(`https://storefront-do/s/${encodeURIComponent(slug)}`));
    if (res.status === 404) return undefined;
    return (await res.json()) as Storefront;
  }
}

/**
 * Pick the store from the environment: durable iff the DO service binding is
 * present, the in-memory registry otherwise. CI/tests/local bind nothing, so they
 * can never reach real storage — the mock-gate is enforced by construction, not
 * by discipline (the `resolveMediaStore` precedent).
 */
export function resolveStorefrontStore(env?: StorefrontStoreEnv): StorefrontStore {
  const binding = env?.STOREFRONT_DO;
  if (binding && typeof binding.fetch === 'function') return new DurableStorefrontStore(binding);
  return new InMemoryStorefrontStore();
}
