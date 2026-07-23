import {
  decideCreate,
  decideToggle,
  type CreateDecision,
  type CreateStorefrontCommand,
  type StorefrontEntry,
} from '../src/storefront-core.js';

/**
 * StorefrontDO — the DURABLE storefront authority (STOREFRONT-READ-PATH-1). One
 * DO instance per storefront (addressed by idFromName(id)), so every command for
 * a storefront serializes through workerd's input gate — the same real mechanism
 * the attribution lock and the reservation DO use, not a shim. State survives via
 * DO storage; the decision logic is the pure core in src/storefront-core.ts
 * (`decideCreate` / `decideToggle`), byte-shared with the in-memory registry.
 *
 * SLUG INDEX — SHAPE C (founder ruling): a per-slug POINTER is its OWN instance
 * of this same class, addressed by idFromName('slug:'+slug), holding just
 * `{ storefrontId }`. Write-once (the slug is immutable), no second binding, no
 * global-directory hotspot. The router resolves a read GET /s/:slug by hitting
 * the pointer instance, then the storefront instance — two tiny hops.
 *
 * No money here: this is identity + discoverability only. The instance role
 * (storefront vs pointer) is chosen by the ROUTER's sub-path; the two never
 * collide because they are addressed by different names.
 */

const ENTRY_KEY = 'storefront-entry';
const POINTER_KEY = 'slug-pointer';

interface ToggleArgs {
  id: string;
  correlationId: string;
  at: string;
}
interface SlugPointer {
  storefrontId: string;
}

export class StorefrontDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    // ── storefront-instance ops (idFromName(id)) ─────────────────────────────
    if (request.method === 'POST' && pathname === '/entry/create') {
      let cmd: CreateStorefrontCommand;
      try {
        cmd = (await request.json()) as CreateStorefrontCommand;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideCreate(current, cmd);
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      return Response.json(decision);
    }
    if (request.method === 'POST' && (pathname === '/entry/publish' || pathname === '/entry/unpublish')) {
      let args: ToggleArgs;
      try {
        args = (await request.json()) as ToggleArgs;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      const { decision, next } = decideToggle(current, pathname === '/entry/publish', args.correlationId, args.at);
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      return Response.json(decision);
    }
    if (request.method === 'GET' && pathname === '/entry') {
      const entry = await this.state.storage.get<StorefrontEntry>(ENTRY_KEY);
      if (!entry) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json(entry.storefront);
    }

    // ── slug-pointer-instance ops (idFromName('slug:'+slug)) — Shape C ───────
    if (request.method === 'PUT' && pathname === '/pointer') {
      let ptr: SlugPointer;
      try {
        ptr = (await request.json()) as SlugPointer;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      await this.state.storage.put(POINTER_KEY, ptr);
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && pathname === '/pointer') {
      const ptr = await this.state.storage.get<SlugPointer>(POINTER_KEY);
      if (!ptr) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json(ptr);
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}

interface Env {
  STOREFRONT: DurableObjectNamespace;
}

const sfStub = (env: Env, id: string): DurableObjectStub =>
  env.STOREFRONT.get(env.STOREFRONT.idFromName(id));
const slugStub = (env: Env, slug: string): DurableObjectStub =>
  env.STOREFRONT.get(env.STOREFRONT.idFromName(`slug:${slug}`));

const forward = async (res: Response, status = res.status): Promise<Response> =>
  new Response(await res.text(), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Router — the durable storefront surface used by DurableStorefrontStore:
 *   POST /storefronts                     create (+ writes the slug pointer on 'created')
 *   POST /storefronts/:id/publish|unpublish   discoverability toggle
 *   GET  /storefronts/:id                 the raw canon Storefront (or 404)
 *   GET  /s/:slug                         THE READ PATH — pointer → id → storefront (or 404)
 * The DO name IS the id (or 'slug:'+slug); one authority per storefront by construction.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/storefronts') {
      const cmd = (await request.clone().json().catch(() => null)) as CreateStorefrontCommand | null;
      if (cmd == null || typeof cmd.id !== 'string') {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const res = await sfStub(env, cmd.id).fetch(
        new Request('https://do/entry/create', { method: 'POST', body: JSON.stringify(cmd) }),
      );
      const decision = (await res.clone().json()) as CreateDecision;
      // Shape C: the slug pointer lands on the REAL create only (slug immutable → write-once).
      if (decision.status === 'created') {
        await slugStub(env, decision.storefront.slug).fetch(
          new Request('https://do/pointer', { method: 'PUT', body: JSON.stringify({ storefrontId: cmd.id }) }),
        );
      }
      return forward(res);
    }

    let m = /^\/storefronts\/([^/]+)\/(publish|unpublish)$/.exec(pathname);
    if (m && request.method === 'POST') {
      const id = decodeURIComponent(m[1]!);
      const args = (await request.clone().json().catch(() => ({}))) as Partial<ToggleArgs>;
      const res = await sfStub(env, id).fetch(
        new Request(`https://do/entry/${m[2]}`, { method: 'POST', body: JSON.stringify({ ...args, id }) }),
      );
      return forward(res);
    }

    m = /^\/storefronts\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      const id = decodeURIComponent(m[1]!);
      const res = await sfStub(env, id).fetch(new Request('https://do/entry'));
      return forward(res);
    }

    m = /^\/s\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      const slug = decodeURIComponent(m[1]!);
      const ptrRes = await slugStub(env, slug).fetch(new Request('https://do/pointer'));
      if (ptrRes.status === 404) return Response.json({ error: 'not_found' }, { status: 404 });
      const ptr = (await ptrRes.json()) as SlugPointer;
      const res = await sfStub(env, ptr.storefrontId).fetch(new Request('https://do/entry'));
      // an orphaned pointer (storefront gone) reads as the SAME honest not-found
      if (res.status === 404) return Response.json({ error: 'not_found' }, { status: 404 });
      return forward(res, 200);
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
