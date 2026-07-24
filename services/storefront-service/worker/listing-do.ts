import {
  decideAutoHide,
  decidePublish,
  type ListingEntry,
  type PublishListingCommand,
} from '../src/listing-core.js';

/**
 * ListingDO — the DURABLE listing authority (STOREFRONT-READ-PATH-1, "same
 * treatment" as the storefront DO). One DO instance per listing (idFromName(
 * listingId)); every command serializes through workerd's input gate. State
 * survives via DO storage; the decision logic is the pure core in
 * src/listing-core.ts, byte-shared with the in-memory registry. HER price is
 * carried in the event payload, never recomputed here — no arithmetic on money.
 */

const ENTRY_KEY = 'listing-entry';
const PID_POINTER_KEY = 'pid-pointer';

interface HideArgs {
  listingId: string;
  correlationId: string;
  at: string;
}

export class ListingDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/entry/publish') {
      let cmd: PublishListingCommand;
      try {
        cmd = (await request.json()) as PublishListingCommand;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<ListingEntry>(ENTRY_KEY);
      const { decision, next } = decidePublish(current, cmd);
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      return Response.json(decision);
    }
    if (request.method === 'POST' && pathname === '/entry/hide') {
      let args: HideArgs;
      try {
        args = (await request.json()) as HideArgs;
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const current = await this.state.storage.get<ListingEntry>(ENTRY_KEY);
      const { decision, next } = decideAutoHide(current, args.correlationId, args.at);
      if (next) await this.state.storage.put(ENTRY_KEY, next);
      return Response.json(decision);
    }
    if (request.method === 'GET' && pathname === '/entry') {
      const entry = await this.state.storage.get<ListingEntry>(ENTRY_KEY);
      if (!entry) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json(entry.listing);
    }
    // REAL-PRODUCT-RENDER-1 (a2) — the JOIN's read: the canon listing PLUS the
    // service-side signed price. Internal only (the /listings* surface is
    // key-gated at the composition root; the service reaches it through the shim).
    if (request.method === 'GET' && pathname === '/entry/full') {
      const entry = await this.state.storage.get<ListingEntry>(ENTRY_KEY);
      if (!entry) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json({
        productVersionId: entry.listing.productVersionId,
        customerPriceFcfa: entry.customerPriceFcfa,
        status: entry.listing.status,
      });
    }
    // ── pid-pointer role (idFromName('pid:{storefrontId}:{pid}')) ────────────
    // "WHICH LISTING SELLS THIS PID, IN THIS SHOP" — the operational lookup, and
    // the ONLY question the index is ever asked. It is not a second answer to
    // "what is in her shop": curatedItems is that, and is authoritative for the
    // buyer. Scoped by storefront because two resellers may list the same product.
    if (request.method === 'PUT' && pathname === '/pid-pointer') {
      let ptr: { listingId?: string };
      try {
        ptr = (await request.json()) as { listingId?: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if (typeof ptr.listingId !== 'string') return Response.json({ error: 'malformed' }, { status: 400 });
      await this.state.storage.put(PID_POINTER_KEY, { listingId: ptr.listingId });
      return Response.json({ ok: true });
    }
    if (request.method === 'GET' && pathname === '/pid-pointer') {
      const ptr = await this.state.storage.get<{ listingId: string }>(PID_POINTER_KEY);
      if (!ptr) return Response.json({ error: 'not_found' }, { status: 404 });
      return Response.json(ptr);
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}

interface Env {
  LISTING: DurableObjectNamespace;
}

const stub = (env: Env, listingId: string): DurableObjectStub =>
  env.LISTING.get(env.LISTING.idFromName(listingId));
/** The pid pointer instance for THIS shop's product (Shape C, same as slug). */
const pidStub = (env: Env, storefrontId: string, pid: string): DurableObjectStub =>
  env.LISTING.get(env.LISTING.idFromName(`pid:${storefrontId}:${pid}`));
const forward = async (res: Response): Promise<Response> =>
  new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } });

/**
 * Router — the durable listing surface used by DurableListingStore:
 *   POST /listings                 publish (idempotent on command_id)
 *   POST /listings/:id/hide        auto-hide
 *   GET  /listings/:id             the raw canon ResellerListing (or 404)
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/listings') {
      const cmd = (await request.clone().json().catch(() => null)) as PublishListingCommand | null;
      if (cmd == null || typeof cmd.listingId !== 'string') {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const res = await stub(env, cmd.listingId).fetch(
        new Request('https://do/entry/publish', { method: 'POST', body: JSON.stringify(cmd) }),
      );
      const decision = (await res.clone().json().catch(() => null)) as { status?: string } | null;
      if (decision?.status === 'published') {
        // The pid pointer is the LOOKUP that resolves a pid to its listing — same
        // namespace, so it belongs here. The MEMBERSHIP statement (appending the
        // pid to her canon curatedItems) is CROSS-AGGREGATE and is therefore made
        // at the composition root (worker/index.ts), which holds both namespaces;
        // this router deliberately depends on LISTING alone, so the standalone
        // listing worker keeps working.
        await pidStub(env, cmd.storefrontId, cmd.productVersionId).fetch(
          new Request('https://do/pid-pointer', { method: 'PUT', body: JSON.stringify({ listingId: cmd.listingId }) }),
        );
      }
      return forward(res);
    }

    let m = /^\/listings\/([^/]+)\/hide$/.exec(pathname);
    if (m && request.method === 'POST') {
      const listingId = decodeURIComponent(m[1]!);
      const args = (await request.clone().json().catch(() => ({}))) as Partial<HideArgs>;
      const res = await stub(env, listingId).fetch(
        new Request('https://do/entry/hide', { method: 'POST', body: JSON.stringify({ ...args, listingId }) }),
      );
      return forward(res);
    }

    m = /^\/listings\/by-pid\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      const storefrontId = decodeURIComponent(m[1]!);
      const pid = decodeURIComponent(m[2]!);
      const ptrRes = await pidStub(env, storefrontId, pid).fetch(new Request('https://do/pid-pointer'));
      if (ptrRes.status === 404) return Response.json({ error: 'not_found' }, { status: 404 });
      const ptr = (await ptrRes.json()) as { listingId: string };
      const entryRes = await stub(env, ptr.listingId).fetch(new Request('https://do/entry/full'));
      // an orphaned pointer reads as the SAME honest not-found — the join then
      // OMITS the pid rather than papering over the inconsistency.
      if (entryRes.status === 404) return Response.json({ error: 'not_found' }, { status: 404 });
      return forward(entryRes);
    }

    m = /^\/listings\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      const listingId = decodeURIComponent(m[1]!);
      const res = await stub(env, listingId).fetch(new Request('https://do/entry'));
      return forward(res);
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
