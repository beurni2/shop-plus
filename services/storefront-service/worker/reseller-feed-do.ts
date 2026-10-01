/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RF-1a — THE RESELLER'S OWN FEED: her sales, her net, her door.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FOUNDER ORDER (2026-08-02): « the reseller gets the notification and the
 * follow-up until delivery », riding the same confirmed-payment event that
 * already feeds the founder's board.
 *
 * ═══ WHY THIS NEEDS A REAL CREDENTIAL, AND WHY THAT IS NOT OPTIONAL ═══
 *
 * A reseller's id is `rs-{4 digits}` (`identity/mint.ts`) — NINE THOUSAND
 * values. A feed gated by « send me your resellerId » would therefore hand
 * any reseller every other reseller's economics after a few thousand guesses:
 * her net plus her displayed price yields the supplier's base by subtraction,
 * which is the exact leak SP-I03 and the `/listings*` gate exist to prevent.
 *
 * So the identity is never claimed by a body: the ROUTER resolves HER ACCOUNT
 * SESSION (RESELLER-ACCOUNTS-1b) to her account id, refuses a paused or
 * pending account by name, and only then asks this object for her rows by id.
 *
 * CODES-RETIRES-1 (founder ruling 2026-09-30, « Retire them ») — this object
 * used to carry its own personal-code door (`SP-` codes the founder minted by
 * hand, `/code/*`, `/codes`, `/mine`). Accounts replaced them: the reseller
 * app had no field to type one, yet a code still read her sales, one minted
 * for a paused reseller included. The doors are gone.
 *
 * CODES-EFFACES-1 (founder order 2026-09-30: « erase the old codes still
 * stored on shop+ server ») — and so are the records a past mint left:
 * `codehash:*` (the hash door) and `resellercode:*` (the founder-side pointer,
 * which kept each code IN CLEAR). The object erases them itself the first
 * time it wakes after this deploy, before it answers anything, and writes one
 * receipt (`purge:codes-retires`: when, how many) so a later wake does not
 * list again. The sale rows (`row:*`) are her index and are never touched.
 *
 * ═══ WHAT THE FEED CAN HONESTLY SAY TODAY (and what it must not) ═══
 *
 * Shop+ can prove three states about an order — waiting for the operator
 * (`payment_pending`), confirmed (`confirmed`), or failed (`payment_failed`)
 * — and THIS WIRE CARRIES ONLY THE MIDDLE ONE, because a row enters the index
 * at the confirm transition and nowhere else (verifier M9: the first draft of
 * this comment claimed all three rode here, which was never true).
 * « En préparation » lives in Boutik+'s book (acceptedAt / readyAt) and no
 * wire carries it back here; « en route », « à la porte » and « livrée »
 * belong to Séra, which does not exist yet. This object therefore reports
 * only what it can prove — the missing steps are named as missing on her
 * screen rather than invented here. Closing that gap needs a
 * return event (`package.ready.v1`), which is a canon contracts change and
 * the founder's call, not mine.
 *
 * ═══ WHAT NEVER CROSSES ═══
 * No buyer contact (BC-1a is founder-only — a reseller surface has never
 * seen a buyer's number and does not start now), no supplier identity, no
 * base price, no commission, no gross earnings. Her NET, copied from the
 * frozen Quote, is the only franc figure on this wire (SP-I04/SP-I12: net
 * first, gross-first prohibited, commission unrepresentable).
 */

export const RESELLER_FEED_NAME = 'reseller-feed';
const ROW_PREFIX = 'row:';
/** VITRINE-VRAIE-1 — one mark per delivered order (`livree:{reseller}:{order}`), and her count (`livrees:{reseller}`). */
const LIVREE_PREFIX = 'livree:';
const LIVREES_PREFIX = 'livrees:';
/** What the retired `SP-` mint wrote — erased, never written again. */
const RETIRED_PREFIXES = ['codehash:', 'resellercode:'] as const;
const PURGE_RECEIPT = 'purge:codes-retires';
/** The most keys one storage delete accepts. */
const DELETE_BATCH = 128;

async function effacerAnciensCodes(storage: DurableObjectStorage): Promise<void> {
  if ((await storage.get(PURGE_RECEIPT)) !== undefined) return;
  let erased = 0;
  for (const prefix of RETIRED_PREFIXES) {
    for (;;) {
      const keys = [...(await storage.list({ prefix, limit: DELETE_BATCH })).keys()];
      if (keys.length === 0) break;
      erased += await storage.delete(keys);
    }
  }
  await storage.put(PURGE_RECEIPT, { at: new Date().toISOString(), erased });
}

/** One confirmed sale, as the INDEX holds it: ids and a clock, nothing more.
 *  Every fact the reseller reads is fetched from the order's own object at
 *  read time, so this index can never serve a stale state or a stale franc. */
interface FeedRow {
  readonly orderId: string;
  readonly at: string;
}

export class ResellerFeedDO {
  constructor(private readonly state: DurableObjectState) {
    // Before the first request is served (blockConcurrencyWhile holds them).
    void state.blockConcurrencyWhile(() => effacerAnciensCodes(state.storage));
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    /** REGISTER a confirmed sale into ITS reseller's index. Written by the
     *  OrderDO at the confirm transition — the same instant the outbox is
     *  armed — so a sale reaches her feed exactly when it becomes true, and
     *  never before. FIRST-WINS on (reseller, order): a redelivered webhook
     *  cannot move the row's clock or double it. */
    if (request.method === 'POST' && pathname === '/register') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resellerId = body?.['resellerId'];
      const orderId = body?.['orderId'];
      if (
        typeof resellerId !== 'string' || resellerId === '' || resellerId.length > 128 ||
        typeof orderId !== 'string' || orderId === '' || orderId.length > 191
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      // VERIFIER M1 — the id is ESCAPED into the key. Unescaped, the pair
      // (`rs-AAA`, `BBB:ord-x`) built the same key as (`rs-AAA:BBB`, `ord-x`),
      // so a list asked for `rs-AAA:BBB` held another reseller's row — a
      // real breach of the first lock, contained end-to-end only by the
      // order's second check. `encodeURIComponent` makes the boundary exact.
      const key = `${ROW_PREFIX}${encodeURIComponent(resellerId)}:${orderId}`;
      const existing = await this.state.storage.get<FeedRow>(key);
      if (existing !== undefined) return Response.json({ ok: true, status: 'already_registered' });
      await this.state.storage.put(key, { orderId, at: new Date().toISOString() } satisfies FeedRow);
      return Response.json({ ok: true, status: 'registered' });
    }

    /**
     * RESELLER-ACCOUNTS-1b — HER LIST, keyed by id, for callers the ROUTER
     * has already authenticated: a session resolved to this accountId
     * (accounts are minted in the rs-{4 digits} shape the feed already
     * speaks), or the founder's key-C suivi read. INTERNAL ONLY — a DO fetch
     * is reachable solely from the composition root, exactly like /register;
     * no external path leads here. Newest first.
     */
    if (request.method === 'POST' && pathname === '/rows') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resellerId = body?.['resellerId'];
      if (typeof resellerId !== 'string' || resellerId === '' || resellerId.length > 128) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const rows = await this.state.storage.list<FeedRow>({ prefix: `${ROW_PREFIX}${encodeURIComponent(resellerId)}:` });
      const orders = [...rows.values()]
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .map((r) => ({ orderId: r.orderId, at: r.at }));
      return Response.json({ ok: true, resellerId, orders });
    }

    /**
     * DURCISSEMENT-SERVICE-1 (AUDIT-SHOP-2 F-28) — the SAME projection for MANY
     * ids in ONE read, for the founder's suivi: one subrequest for the whole
     * board instead of one per account, so the board's declared budget can
     * cover everything it spends. Same validation per id as `/rows`; at most
     * 50 ids (the roster's own page); an id with no row is present and EMPTY,
     * never missing — absence must never read as « unreadable » upstream.
     */
    if (request.method === 'POST' && pathname === '/rows-for-many') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const ids = body?.['resellerIds'];
      if (
        !Array.isArray(ids) || ids.length > 50 ||
        !ids.every((id) => typeof id === 'string' && id !== '' && id.length <= 128)
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const rows: Record<string, { orderId: string; at: string }[]> = {};
      for (const resellerId of ids as string[]) {
        const listed = await this.state.storage.list<FeedRow>({ prefix: `${ROW_PREFIX}${encodeURIComponent(resellerId)}:` });
        rows[resellerId] = [...listed.values()]
          .sort((a, b) => (a.at < b.at ? 1 : -1))
          .map((r) => ({ orderId: r.orderId, at: r.at }));
      }
      return Response.json({ ok: true, rows });
    }

    /**
     * ═══ VITRINE-VRAIE-1 — « N VENTES LIVRÉES » (SP8) ═══
     *
     * SP8: « la réputation d'une revendeuse EST le nombre de ventes livrées »,
     * sourced from `delivery.validated.v1` through the locked
     * `Order.resellerId`. Nothing produced that number, so every boutique
     * said « Nouvelle vendeuse » for ever. The OrderDO marks an order here
     * when Séra's validation lands (and her sales read re-marks what it sees
     * delivered, which carries the orders validated before this existed).
     * ONE MARK PER ORDER, so a redelivered signal never counts twice; the
     * count moves only when a mark is new. INTERNAL ONLY, like /register.
     */
    if (request.method === 'POST' && pathname === '/livrees/marquer') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resellerId = body?.['resellerId'];
      const orderIds = body?.['orderIds'];
      if (
        typeof resellerId !== 'string' || resellerId === '' || resellerId.length > 128 ||
        !Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 50 ||
        !orderIds.every((o) => typeof o === 'string' && o !== '' && o.length <= 191)
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const qui = encodeURIComponent(resellerId);
      const cles = [...new Set(orderIds as string[])].map((o) => `${LIVREE_PREFIX}${qui}:${o}`);
      const deja = await this.state.storage.get(cles);
      const nouvelles = cles.filter((c) => !deja.has(c));
      if (nouvelles.length > 0) {
        const compte = (await this.state.storage.get<number>(`${LIVREES_PREFIX}${qui}`)) ?? 0;
        const at = new Date().toISOString();
        const ecrire: Record<string, unknown> = { [`${LIVREES_PREFIX}${qui}`]: compte + nouvelles.length };
        for (const c of nouvelles) ecrire[c] = at;
        await this.state.storage.put(ecrire);
      }
      return Response.json({ ok: true, nouvelles: nouvelles.length });
    }

    if (request.method === 'POST' && pathname === '/livrees') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resellerId = body?.['resellerId'];
      if (typeof resellerId !== 'string' || resellerId === '' || resellerId.length > 128) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const compte = (await this.state.storage.get<number>(`${LIVREES_PREFIX}${encodeURIComponent(resellerId)}`)) ?? 0;
      return Response.json({ ok: true, compte });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
