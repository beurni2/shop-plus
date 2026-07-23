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

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}

interface Env {
  LISTING: DurableObjectNamespace;
}

const stub = (env: Env, listingId: string): DurableObjectStub =>
  env.LISTING.get(env.LISTING.idFromName(listingId));
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

    m = /^\/listings\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      const listingId = decodeURIComponent(m[1]!);
      const res = await stub(env, listingId).fetch(new Request('https://do/entry'));
      return forward(res);
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
