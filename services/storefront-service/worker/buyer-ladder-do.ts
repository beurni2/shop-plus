import {
  appliquerRefus,
  cleAcheteur,
  eligibiliteInitiale,
  REFUSAL_REASONS,
  type RefusalReason,
} from '@shop-plus/commerce-core';

/**
 * SP6.3 — THE BUYER-REFUSAL LADDER BOOK (§6.4; OWNER: Risk).
 *
 * ONE DURABLE OBJECT PER BUYER, named by `cleAcheteur(phone)`. That naming is
 * the whole design: a Durable Object named by a key IS the per-buyer lock, so
 * two refusals reported for the same woman at the same moment serialize without
 * a transaction anywhere, and a refusal reported for a different woman cannot
 * touch her record.
 *
 * ═══ WHERE THE RUNG IS ENFORCED, AND WHY IT IS NOT AT QUOTE ═══
 *
 * Founder ruling, 2026-08-04. §6.1 says the Option-B gate is « evaluated at
 * quote » — but at quote time Shop+ knows no buyer: `QuoteRequest` carries slug,
 * pid, paymentMode, zoneTo, attributionResellerId and requestKey, and nothing
 * that identifies her. Her phone arrives one step later, with the dispatch
 * contact at ORDER CREATE (BC-1a). A ladder keyed to a buyer therefore has no
 * key at the moment the spec names.
 *
 * So the four conditions that ARE knowable at quote stay at quote (seller tier,
 * category, price cap, zone) and the buyer rung is evaluated the moment its
 * input exists — at order create, still **before any money moves and before any
 * custody**. The cost is honest and was stated to the founder before he ruled:
 * she chooses « payer à la livraison », fills in her details, and only then is
 * redirected to full prepayment. The alternative — asking her to type her phone
 * before she is shown a price so the check can run earlier — was rejected
 * because it is self-declared: one changed digit and she walks away from her own
 * history. This slice's sibling removed the last self-declared §6.1 input; it
 * would have been strange to add one back a slice later.
 *
 * ═══ WHAT THIS OBJECT DOES NOT DO ═══
 *
 * It holds no money, no order, no contact — only the canonical
 * `PayAtDoorEligibility` for one key. It never decides: `appliquerRefus`
 * (commerce-core, §6.4, pure and exhaustively tested) decides, and this object
 * stores what that returned. A rung rule must be readable in one file, not
 * spread between a decision and a database.
 */

const RECORD_KEY = 'eligibility';

/** The DO name for a buyer, or `null` when her phone cannot be keyed. */
export function ladderName(phone: string): string | null {
  const key = cleAcheteur(phone);
  return key === null ? null : `ladder:${key}`;
}

interface Env {
  readonly LADDER?: DurableObjectNamespace;
}

export class BuyerLadderDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    /**
     * READ. A buyer with no record is not an error — she is a buyer who has
     * never refused anything, and the honest answer is the top of the ladder.
     * Synthesised rather than written on read, so a read never mutates.
     */
    if (request.method === 'GET' && pathname === '/entry') {
      const stored = await this.state.storage.get<unknown>(RECORD_KEY);
      const buyerRef = (await this.state.storage.get<string>('buyerRef')) ?? 'anonyme';
      return Response.json({
        ok: true,
        record: stored ?? eligibiliteInitiale(buyerRef),
        known: stored !== undefined,
      });
    }

    /**
     * RECORD ONE REFUSAL. The reason is the caller's; everything that follows
     * from it is §6.4's. The route is reachable only through a secret-gated
     * outer door (`index.ts`) — a buyer can never move her own rung, and a
     * reseller can never move her customer's.
     */
    if (request.method === 'POST' && pathname === '/entry/refusal') {
      const body = (await request.json().catch(() => null)) as
        | { buyerRef?: unknown; reason?: unknown; at?: unknown }
        | null;
      if (body === null) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });

      const { buyerRef, reason, at } = body;
      if (typeof buyerRef !== 'string' || buyerRef === '' || buyerRef.length > 191) {
        return Response.json({ ok: false, reason: 'bad_field', field: 'buyerRef' }, { status: 400 });
      }
      // The vocabulary is CLOSED (§6.4). An unrecognised reason is refused by
      // name rather than treated as an ordinary fault — guessing which rung an
      // unknown word belongs on is exactly how a buyer gets punished for a typo.
      if (typeof reason !== 'string' || !(REFUSAL_REASONS as readonly string[]).includes(reason)) {
        return Response.json({ ok: false, reason: 'bad_field', field: 'reason' }, { status: 400 });
      }
      if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
        return Response.json({ ok: false, reason: 'bad_field', field: 'at' }, { status: 400 });
      }

      const stored = await this.state.storage.get<Parameters<typeof appliquerRefus>[0]>(RECORD_KEY);
      const current = stored ?? eligibiliteInitiale(buyerRef);
      const decision = appliquerRefus(current, reason as RefusalReason, at);
      await this.state.storage.put(RECORD_KEY, decision.record);
      await this.state.storage.put('buyerRef', buyerRef);
      return Response.json({ ok: true, record: decision.record, rung: decision.rung, escalated: decision.escalated });
    }

    return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
  }
}

/**
 * THE READ THE ORDER-CREATE PATH MAKES.
 *
 * `undefined` when there is no ladder binding at all (an unconfigured Worker) —
 * the caller decides what that means, and it decides FAIL-CLOSED for the door
 * mode, the same way an unreadable supply projection does.
 */
export async function lireEligibilite(env: Env, phone: string): Promise<unknown | undefined> {
  const name = ladderName(phone);
  if (name === null || env.LADDER === undefined) return undefined;
  const res = await env.LADDER.get(env.LADDER.idFromName(name))
    .fetch(new Request('https://do/entry'))
    .catch(() => null);
  if (res === null) return undefined;
  const body = (await res.json().catch(() => null)) as { ok?: boolean; record?: unknown } | null;
  if (body?.ok !== true) return undefined;
  return body.record;
}
