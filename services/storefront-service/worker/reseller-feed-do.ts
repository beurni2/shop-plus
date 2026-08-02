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
 * Shop+ can prove three states about an order: it is waiting for the
 * operator (`payment_pending`), the operator confirmed the money
 * (`confirmed`), or the payment failed (`payment_failed`). THAT IS ALL.
 * « En préparation » lives in Boutik+'s book (acceptedAt / readyAt) and no
 * wire carries it back here; « en route », « à la porte » and « livrée »
 * belong to Séra, which does not exist yet. This object therefore reports
 * the three real states and NOTHING ELSE — the missing steps are named as
 * missing on her screen rather than invented here. Closing that gap needs a
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
      if (typeof resellerId !== 'string' || resellerId === '' || Object.keys(body ?? {}).length !== 1) {
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
      const key = `${ROW_PREFIX}${resellerId}:${orderId}`;
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
      const rows = await this.state.storage.list<FeedRow>({ prefix: `${ROW_PREFIX}${resolved.resellerId}:` });
      const orders = [...rows.values()]
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .map((r) => ({ orderId: r.orderId, at: r.at }));
      return Response.json({ ok: true, resellerId: resolved.resellerId, orders });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
