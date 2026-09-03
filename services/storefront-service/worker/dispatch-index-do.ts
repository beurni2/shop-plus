/**
 * BC-1a — THE DISPATCH INDEX (founder-approved proposal, 2026-08-02): the one
 * list « which orders exist, newest first » that lets the founder's dispatch
 * view fan out to each order's own object. It exists because Durable Object
 * namespaces cannot enumerate: without a registry, a confirmed order with a
 * buyer's contact on it would be an object nobody can find.
 *
 * WHAT IT HOLDS — IDS AND CLOCKS, NOTHING ELSE. No contact, no state, no
 * money: those live on each OrderDO and are read through its own internal
 * dispatch projection at read time, so this index can never serve stale
 * contact or a stale state, and a leak of this object alone leaks a list of
 * opaque order ids.
 *
 * WRITE DISCIPLINE (journalled residue, stated not hidden): registration is
 * BEST-EFFORT from the composition root at TWO independent moments — after a
 * 200 order create, and again (idempotently) after a 200 payment webhook — so
 * a row is lost only if both writes fail. There is no outbox here: a missed
 * row means the dispatch list misses one order until any later webhook for it
 * lands, while the order itself, its money path, and the Boutik+ preparation
 * board are all untouched.
 *
 * FIRST-WINS on orderId: a replay never moves `firstSeenAt`, so the list's
 * order is stable under at-least-once registration.
 */

export const DISPATCH_INDEX_NAME = 'dispatch-orders';
const ROW_PREFIX = 'dispatch:';

interface DispatchRow {
  readonly orderId: string;
  readonly firstSeenAt: string;
}

export class DispatchIndexDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/register') {
      const body = (await request.json().catch(() => null)) as { orderId?: unknown } | null;
      const orderId = body?.orderId;
      if (typeof orderId !== 'string' || orderId === '' || orderId.length > 191) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const key = `${ROW_PREFIX}${orderId}`;
      const existing = await this.state.storage.get<DispatchRow>(key);
      if (existing !== undefined) return Response.json({ ok: true, status: 'already_registered' });
      await this.state.storage.put(key, { orderId, firstSeenAt: new Date().toISOString() } satisfies DispatchRow);
      return Response.json({ ok: true, status: 'registered' });
    }

    /**
     * The list — ids and first-seen clocks only, newest first.
     *
     * DISPATCH-PAGES-1 (AUDIT-SHOP-1 slice b): PAGED on request. The index
     * itself is one object's storage — listing it costs no subrequest — but
     * every caller of this list fans out ONE subrequest per row to the
     * order's own DO, and the platform caps subrequests per request. So a
     * caller may ask for a page: `?limit=` rows after `?cursor=` (the `next`
     * a previous page answered, echoed verbatim). NO limit = the whole list,
     * byte-compatible with every caller that predates this.
     *
     * THE ORDER IS TOTAL — `firstSeenAt` desc, then `orderId` desc — because
     * a cursor over a sort with ties is a cursor that can skip or repeat rows
     * whose clocks collide. And the cursor is a COMPARISON, not an index:
     * rows registered while the founder pages land BEFORE his cursor (newer)
     * and are simply absent from this sweep — no row he is walking ever
     * shifts, duplicates, or disappears.
     */
    if (request.method === 'GET' && pathname === '/list') {
      const params = new URL(request.url).searchParams;
      const limitRaw = params.get('limit');
      let limit: number | undefined;
      if (limitRaw !== null) {
        limit = Number(limitRaw);
        if (!Number.isInteger(limit) || limit < 1) {
          return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
        }
      }
      const cursorRaw = params.get('cursor');
      let apres: { seen: string; id: string } | undefined;
      if (cursorRaw !== null) {
        const sep = cursorRaw.indexOf('|');
        if (sep < 0) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
        try {
          apres = { seen: decodeURIComponent(cursorRaw.slice(0, sep)), id: decodeURIComponent(cursorRaw.slice(sep + 1)) };
        } catch {
          return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
        }
      }
      const rows = await this.state.storage.list<DispatchRow>({ prefix: ROW_PREFIX });
      const tri = [...rows.values()].sort((a, b) =>
        a.firstSeenAt === b.firstSeenAt
          ? a.orderId < b.orderId ? 1 : -1
          : a.firstSeenAt < b.firstSeenAt ? 1 : -1,
      );
      const debutIdx =
        apres === undefined
          ? 0
          : tri.findIndex(
              (r) => r.firstSeenAt < apres.seen || (r.firstSeenAt === apres.seen && r.orderId < apres.id),
            );
      const restant = debutIdx < 0 ? [] : tri.slice(debutIdx);
      const page = limit === undefined ? restant : restant.slice(0, limit);
      const orders = page.map((r) => ({ orderId: r.orderId, firstSeenAt: r.firstSeenAt }));
      const dernier = page[page.length - 1];
      const next =
        limit !== undefined && dernier !== undefined && page.length < restant.length
          ? `${encodeURIComponent(dernier.firstSeenAt)}|${encodeURIComponent(dernier.orderId)}`
          : undefined;
      return Response.json({ ok: true, orders, ...(next !== undefined ? { next } : {}) });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
