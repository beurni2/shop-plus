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
 * values, journalled as thin the day it was written. A feed gated by « send
 * me your resellerId » would therefore hand any reseller every other
 * reseller's economics after a few thousand guesses: her net plus her
 * displayed price yields the supplier's base by subtraction, which is the
 * exact leak SP-I03 and the `/listings*` gate exist to prevent. The
 * repo's own standing note says it plainly: « Real per-reseller identity is a
 * HARD GATE before any reseller other than the founder onboards. »
 *
 * So this object carries the SAME personal-code door the supplier surface
 * runs on (READINESS-WIRE-1b-i, founder-approved, released and verified
 * twice): 80 bits of CSPRNG, grouped for human handover, stored ONLY as its
 * SHA-256, one active code per reseller, re-mint replaces (which is also
 * revocation), every refusal one uniform 401. The code IS the identity — the
 * resellerId is DERIVED from it server-side and never claimed by a body.
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
const CODEHASH_PREFIX = 'codehash:';
const RESELLERCODE_PREFIX = 'resellercode:';
const ROW_PREFIX = 'row:';

export interface ResellerCodeRecord {
  readonly resellerId: string;
  readonly mintedAt: string;
}

/** One confirmed sale, as the INDEX holds it: ids and a clock, nothing more.
 *  Every fact the reseller reads is fetched from the order's own object at
 *  read time, so this index can never serve a stale state or a stale franc. */
interface FeedRow {
  readonly orderId: string;
  readonly at: string;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** RFC-4648-ish base32 (no padding) over CSPRNG bytes, grouped for handover.
 *  `SP-` for Shop+, as the supplier's is `BF-` — one look tells her which
 *  door a code opens. */
function mintResellerCode(): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.getRandomValues(new Uint8Array(10)); // 80 bits
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `SP-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

export class ResellerFeedDO {
  constructor(private readonly state: DurableObjectState) {}

  /** Hash the presented code and look it up — a miss, a non-string and a
   *  revoked code are all the SAME null (one uniform 401 upstream, never an
   *  oracle). No secret-dependent comparison exists: the hash is the key. */
  private async resolveCode(presented: unknown): Promise<ResellerCodeRecord | null> {
    if (typeof presented !== 'string' || presented === '') return null;
    const record = await this.state.storage.get<ResellerCodeRecord>(`${CODEHASH_PREFIX}${await sha256Hex(presented)}`);
    return record ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    /** THE FOUNDER MINTS a personal code (his ops credential gates it at the
     *  router). ONE active code per reseller: re-mint atomically replaces, so
     *  the previous code dies at that instant — which is also the revocation
     *  story. The plaintext appears in THIS response once and is never stored. */
    if (request.method === 'POST' && pathname === '/code/mint') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resellerId = body?.['resellerId'];
      // The 128 cap MATCHES `/register` below (verifier M2): without it a
      // mint could create a code for an id no row can ever name, i.e. a
      // permanent key that opens an eternally empty feed.
      if (
        typeof resellerId !== 'string' || resellerId === '' || resellerId.length > 128 ||
        Object.keys(body ?? {}).length !== 1
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const code = mintResellerCode();
      const hash = await sha256Hex(code);
      const mintedAt = new Date().toISOString();
      const previous = await this.state.storage.get<{ hash: string }>(`${RESELLERCODE_PREFIX}${resellerId}`);
      if (previous !== undefined) await this.state.storage.delete(`${CODEHASH_PREFIX}${previous.hash}`);
      await this.state.storage.put({
        [`${CODEHASH_PREFIX}${hash}`]: { resellerId, mintedAt } satisfies ResellerCodeRecord,
        [`${RESELLERCODE_PREFIX}${resellerId}`]: { hash, mintedAt },
      });
      return Response.json({ ok: true, code, resellerId, mintedAt });
    }

    /** REVOKE — the founder cuts a reseller's feed off. Idempotent. */
    if (request.method === 'POST' && pathname === '/code/revoke') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resellerId = body?.['resellerId'];
      if (typeof resellerId !== 'string' || resellerId === '' || Object.keys(body ?? {}).length !== 1) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const existing = await this.state.storage.get<{ hash: string }>(`${RESELLERCODE_PREFIX}${resellerId}`);
      if (existing === undefined) return Response.json({ ok: true, status: 'no_code' });
      await this.state.storage.delete([`${CODEHASH_PREFIX}${existing.hash}`, `${RESELLERCODE_PREFIX}${resellerId}`]);
      return Response.json({ ok: true, status: 'revoked' });
    }

    /** THE INVENTORY — who holds a feed door, since when. `{resellerId,
     *  mintedAt}` ONLY: the stored hash never leaves this object. */
    if (request.method === 'GET' && pathname === '/codes') {
      const entries = await this.state.storage.list<{ mintedAt: string }>({ prefix: RESELLERCODE_PREFIX });
      const codes = [...entries.entries()]
        .map(([key, v]) => ({ resellerId: key.slice(RESELLERCODE_PREFIX.length), mintedAt: v.mintedAt }))
        .sort((a, b) => (a.resellerId < b.resellerId ? -1 : 1));
      return Response.json({ ok: true, codes });
    }

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
      // so a code minted for `rs-AAA:BBB` listed another reseller's row — a
      // real breach of the first lock, contained end-to-end only by the
      // order's second check. `encodeURIComponent` makes the boundary exact.
      const key = `${ROW_PREFIX}${encodeURIComponent(resellerId)}:${orderId}`;
      const existing = await this.state.storage.get<FeedRow>(key);
      if (existing !== undefined) return Response.json({ ok: true, status: 'already_registered' });
      await this.state.storage.put(key, { orderId, at: new Date().toISOString() } satisfies FeedRow);
      return Response.json({ ok: true, status: 'registered' });
    }

    /** HER OWN LIST — the code is the identity; only HER rows leave, newest
     *  first. The router fans out from these ids to each order's own
     *  reseller projection. */
    if (request.method === 'POST' && pathname === '/mine') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const resolved = await this.resolveCode(body?.['code']);
      if (resolved === null) return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
      const rows = await this.state.storage.list<FeedRow>({ prefix: `${ROW_PREFIX}${encodeURIComponent(resolved.resellerId)}:` });
      const orders = [...rows.values()]
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .map((r) => ({ orderId: r.orderId, at: r.at }));
      return Response.json({ ok: true, resellerId: resolved.resellerId, orders });
    }

    /**
     * RESELLER-ACCOUNTS-1b — the SAME projection keyed by id, for callers the
     * ROUTER has already authenticated: a session resolved to this accountId
     * (accounts are minted in the rs-{4 digits} shape the feed already
     * speaks), or the founder's key-C suivi read. INTERNAL ONLY — a DO fetch
     * is reachable solely from the composition root, exactly like /register;
     * no external path leads here, so this is not a second door around the
     * code book, it is the code book's projection behind someone else's auth.
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

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
