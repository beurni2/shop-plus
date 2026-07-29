import { RESERVATION_TTL_MS, type ReservationState, type ReserveCommand } from '@shop-plus/commerce-core';
import {
  decideIssueQuote,
  decideReserveForQuote,
  decideStoreQuote,
  readStoredQuote,
  toBuyerQuoteView,
  type PayAtDoorRequestContext,
  type QuoteRequest,
} from '../src/checkout-core.js';
import { quoteDeliveryFee } from '../src/delivery-source.js';
import type { ListingEntry } from '../src/listing-core.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CheckoutDO — THE DURABLE QUOTE AUTHORITY (SP3.2a).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One Durable Object instance PER QUOTE (`idFromName(quoteId)`), so every
 * command touching one quote — issue, read, reserve — serializes through one
 * workerd input gate. That is the real mechanism the storefront, listing and
 * reservation DOs already use, not a shim, and it is what makes « one
 * reservation per quote » and « one quote per id » structural rather than
 * enforced.
 *
 * A SECOND ROLE on the same class, addressed by `idFromName('key:'+requestKey)`:
 * the per-request-key POINTER — Shape C, the exact pattern the storefront slug
 * pointer already uses. It holds `{ quoteId }` and nothing else, is claimed
 * ONCE, and is the serialization point that makes the no-duplicate-charge
 * gate's foundation atomic: two concurrent requests carrying the same key reach
 * that one object one after the other, and the second is TOLD the first's quote
 * id rather than being allowed to mint a second quote.
 *
 * ═══ WHAT LIVES HERE AND WHAT DOES NOT ═══
 *
 * The DECISIONS are all in `../src/checkout-core.ts` (pure) and, behind it, the
 * FROZEN VAULT (`issueQuote`, `ImmutableQuoteStore`, `decideReservation`). This
 * file is storage plumbing and HTTP: it reads bytes, applies a decision, writes
 * bytes. It performs NO arithmetic on money — not one addition — and the only
 * amount that ever appears in it is the one the vault put on the Quote.
 *
 * ═══ THE ROUTER'S TWO LAWS ═══
 *
 *  1. NO AMOUNT MAY ARRIVE. The accepted body is an ALLOWLIST; any key outside
 *     it is REFUSED, never ignored. A buyer who sends `buyerTotal` is told no,
 *     and the shape it would have to land in does not exist (`QuoteRequest`).
 *  2. NO ECONOMICS MAY LEAVE. Every response is built by `toBuyerQuoteView` or
 *     by an explicit literal. The full Quote never crosses this boundary.
 */

const QUOTE_BYTES_KEY = 'quote-canonical-bytes';
const RESERVATION_KEY = 'reservation-state';
const KEY_POINTER_KEY = 'request-key-pointer';

/**
 * The kill-switch snapshot the vault reads. Shop+ CONSUMES a remotely served
 * snapshot (`@shop-plus/flags-client`) and the flag service is E0 ecosystem
 * infrastructure that is not wired to this Worker — so the honest value here is
 * the documented empty snapshot: nothing enabled, nothing killed. It is stated
 * as a literal (rather than imported) because `flags-client` is not a dependency
 * of this service; the shape is the one `premiere-commande-reelle.e2e.test.ts`
 * already drives `issueQuote` with. JOURNALLED: wiring the real snapshot is what
 * makes `checkout_killed` reachable in production; until then the refusal exists
 * and is tested, but nothing can trip it at runtime.
 */
const FLAGS = { version: 'e1-sandbox', flags: {}, kills: [], killedCategories: [] } as const;

interface IssueArgs {
  quoteId?: string;
  request?: QuoteRequest;
  /** `null` on the wire is the JSON spelling of « nothing resolved ». */
  entry?: ListingEntry | null;
  /** `null` when Séra's stand-in could not price the pair at all. */
  delivery?: ReturnType<typeof quoteDeliveryFee> | null;
}

export class CheckoutDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    // ── quote-instance ops (idFromName(quoteId)) ─────────────────────────────

    /**
     * ISSUE. The immutable put, durable. The occupancy check reads DO STORAGE —
     * the durable extension of the vault's Map lookup — and the vault's own
     * `put` then decides whether the bytes may be stored at all. Nothing is
     * written on any refusal, so a refused issue leaves the id free for the
     * retry the buyer can make with the same request key.
     */
    if (request.method === 'POST' && pathname === '/entry/issue') {
      let args: IssueArgs;
      try {
        args = (await request.json()) as IssueArgs;
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      if (typeof args.quoteId !== 'string' || args.quoteId === '' || args.request === undefined) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const quoteId = args.quoteId;
      const outcome = decideIssueQuote(
        {
          flags: FLAGS,
          now: () => new Date(),
          // The id is the DO's own address, minted by the router before it could
          // address this object. One variable, so the quote's id and the object
          // holding it cannot diverge.
          newId: () => quoteId,
        },
        {
          request: args.request,
          entry: args.entry ?? undefined,
          delivery: args.delivery ?? undefined,
        },
      );
      if (!outcome.ok) {
        // Passed through by NAME only. The §6.1 ops detail (`refusal`,
        // `policyVersion`) and the reconciliation `failures` stop here — the
        // buyer is owed one honest line, never the risk model's internals.
        return Response.json({ ok: false, reason: outcome.reason }, { status: 422 });
      }
      const existing = await this.state.storage.get<string>(QUOTE_BYTES_KEY);
      const stored = decideStoreQuote(existing, outcome.quote, outcome.canonicalBytes);
      if (!stored.ok) {
        return Response.json({ ok: false, reason: stored.reason }, { status: 409 });
      }
      await this.state.storage.put(QUOTE_BYTES_KEY, outcome.canonicalBytes);
      return Response.json({ ok: true, quote: outcome.quote });
    }

    /** READ. Absent → not_found; past its expiry → `expired`, never revived. */
    if (request.method === 'GET' && pathname === '/entry') {
      const bytes = await this.state.storage.get<string>(QUOTE_BYTES_KEY);
      const read = readStoredQuote(bytes, new Date());
      if (!read.ok) {
        return Response.json({ ok: false, reason: read.reason }, { status: read.reason === 'not_found' ? 404 : 422 });
      }
      // The stored BYTES ride along so the caller can prove byte-stability
      // without re-serializing (internal wire only — never the buyer's).
      return Response.json({ ok: true, quote: read.quote, canonicalBytes: bytes });
    }

    /**
     * RESERVE. Atomic by construction: this object IS the quote, so two
     * concurrent reserves arrive one after the other and exactly one creates
     * the reservation. A reservation against a quote that does not exist, or
     * whose price has expired, is refused — a hold on a dead price is a lie.
     */
    if (request.method === 'POST' && pathname === '/entry/reserve') {
      let args: { commandId?: string; holderRef?: string; newReservationId?: string };
      try {
        args = (await request.json()) as { commandId?: string; holderRef?: string; newReservationId?: string };
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      if (
        typeof args.commandId !== 'string' ||
        args.commandId === '' ||
        typeof args.holderRef !== 'string' ||
        args.holderRef === '' ||
        typeof args.newReservationId !== 'string' ||
        args.newReservationId === ''
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const bytes = await this.state.storage.get<string>(QUOTE_BYTES_KEY);
      const read = readStoredQuote(bytes, new Date());
      if (!read.ok) {
        return Response.json({ ok: false, reason: read.reason }, { status: read.reason === 'not_found' ? 404 : 422 });
      }
      const current = (await this.state.storage.get<ReservationState>(RESERVATION_KEY)) ?? { status: 'none' as const };
      const cmd: ReserveCommand = {
        kind: 'reserve',
        command_id: args.commandId,
        quoteId: read.quote.id,
        holderRef: args.holderRef,
        nowIso: new Date().toISOString(), // server clock; the core never reads one
        newReservationId: args.newReservationId,
      };
      const decision = decideReserveForQuote(current, cmd);
      if (decision.ok && !decision.idempotentReplay) {
        await this.state.storage.put(RESERVATION_KEY, decision.state);
      }
      return Response.json(decision, { status: decision.ok ? 200 : 409 });
    }

    // ── request-key-pointer ops (idFromName('key:'+requestKey)) — Shape C ────

    /**
     * CLAIM-OR-TELL. Write-once, and the write and the read are one act inside
     * one object — that indivisibility is the whole reason this is a DO and not
     * a lookup table. The claimer learns which id won; a later caller with the
     * same key is told that same id forever, across restarts.
     */
    if (request.method === 'POST' && pathname === '/key/claim') {
      let body: { candidateQuoteId?: string };
      try {
        body = (await request.json()) as { candidateQuoteId?: string };
      } catch {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      if (typeof body.candidateQuoteId !== 'string' || body.candidateQuoteId === '') {
        return Response.json({ error: 'malformed' }, { status: 400 });
      }
      const existing = await this.state.storage.get<{ quoteId: string }>(KEY_POINTER_KEY);
      if (existing !== undefined) return Response.json({ quoteId: existing.quoteId, claimed: false });
      await this.state.storage.put(KEY_POINTER_KEY, { quoteId: body.candidateQuoteId });
      return Response.json({ quoteId: body.candidateQuoteId, claimed: true });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}

/* ───────────────────────────────── the router ────────────────────────────── */

interface Env {
  CHECKOUT: DurableObjectNamespace;
  /** The storefront DO router, reached through the composition root's shim. */
  STOREFRONT_DO: { fetch(request: Request): Promise<Response> };
  /** The listing DO router, same shim. Internal: `/listings*` stays key-gated. */
  LISTING_DO: { fetch(request: Request): Promise<Response> };
}

const quoteStub = (env: Env, quoteId: string): DurableObjectStub =>
  env.CHECKOUT.get(env.CHECKOUT.idFromName(quoteId));
const keyStub = (env: Env, requestKey: string): DurableObjectStub =>
  env.CHECKOUT.get(env.CHECKOUT.idFromName(`key:${requestKey}`));

/** The wire vocabulary a caller may send. Anything else is REFUSED, not ignored. */
const REQUEST_FIELDS = ['slug', 'pid', 'paymentMode', 'zoneTo', 'attributionResellerId', 'requestKey', 'payAtDoorContext'];
const DOOR_FIELDS = ['eligibility', 'sellerTier', 'category'];
const RESERVE_FIELDS = ['commandId', 'holderRef'];

/**
 * Refusal → HTTP. Absent things are 404, refusals are 422, a killed checkout is
 * 503 (« come back », not « you did something wrong »). Nothing else exists:
 * there is no generic 500 path, because a money refusal that reads as a server
 * fault teaches a buyer to retry into the same wall.
 */
function statusFor(reason: string): number {
  if (reason === 'checkout_killed') return 503;
  if (reason === 'listing_unknown' || reason === 'not_found') return 404;
  return 422;
}

const refuse = (reason: string): Response => Response.json({ error: reason }, { status: statusFor(reason) });
const badRequest = (error: string, field?: string): Response =>
  Response.json(field === undefined ? { error } : { error, field }, { status: 400 });

function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

type Validated = { ok: true; request: QuoteRequest } | { ok: false; response: Response };

/**
 * SHAPE FIRST, AND THE ALLOWLIST IS THE SHAPE. An unknown key is a caller with a
 * wrong model of who owns what — most dangerously a caller sending an AMOUNT —
 * and telling them so is the only way they find out. Silently dropping it is how
 * `customerPriceFcfa` was once accepted-and-ignored on the publish path
 * (MONEY-SHAPE-1); the same mistake is not repeated on the buyer's side.
 *
 * `attributionResellerId` is deliberately allowed to be ABSENT here and refused
 * downstream as the NAMED `attribution_missing`: « no locked reseller » is a
 * commerce refusal the buyer's screen must speak to (SP-I09, CI gate « every
 * order has a locked reseller_id »), not a malformed-body error.
 */
function validateQuoteRequest(body: unknown): Validated {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, response: badRequest('malformed') };
  }
  const raw = body as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!REQUEST_FIELDS.includes(key)) return { ok: false, response: badRequest('unknown_field', key) };
  }
  for (const key of ['slug', 'pid', 'paymentMode', 'zoneTo']) {
    if (!bounded(raw[key], 128)) return { ok: false, response: badRequest('bad_field', key) };
  }
  // CTO REVIEW (SP3.2a) — `slug` and `pid` are the ONLY buyer-supplied values
  // that reach a URL PATH (the internal authority reads below). They are
  // charset-pinned to the id alphabet every real slug and productVersionId
  // already uses, so a dot-segment is UNREPRESENTABLE rather than merely
  // unreachable. `encodeURIComponent` already escapes a slash, and the internal
  // reads are GET-only, so traversal cannot reach a mutating route today — but
  // that safety rests on the CURRENT router shape, and a money path must not
  // rest on another file staying the way it is. `zoneTo` is deliberately NOT
  // pinned: it is a table key, never a path segment, and real zone names carry
  // spaces and accents (« Gounghin, Ouagadougou »).
  const ID_ALPHABET = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  for (const key of ['slug', 'pid']) {
    if (!ID_ALPHABET.test(raw[key] as string)) return { ok: false, response: badRequest('bad_field', key) };
  }
  // The buyer's idempotency token. Bounded and charset-checked so it can be a DO
  // name safely; entropy is the caller's to supply (the PWA mints a uuid).
  if (typeof raw['requestKey'] !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(raw['requestKey'])) {
    return { ok: false, response: badRequest('bad_field', 'requestKey') };
  }
  const attribution = raw['attributionResellerId'];
  if (attribution !== undefined && !bounded(attribution, 128)) {
    return { ok: false, response: badRequest('bad_field', 'attributionResellerId') };
  }
  let door: PayAtDoorRequestContext | undefined;
  const doorRaw = raw['payAtDoorContext'];
  if (doorRaw !== undefined) {
    if (doorRaw === null || typeof doorRaw !== 'object' || Array.isArray(doorRaw)) {
      return { ok: false, response: badRequest('bad_field', 'payAtDoorContext') };
    }
    const d = doorRaw as Record<string, unknown>;
    // `policy` is the key that must never be reachable from the wire: it is the
    // yardstick the §6.1 gate measures against, and a caller who could send one
    // could measure themselves. It is not in DOOR_FIELDS, so it lands here.
    for (const key of Object.keys(d)) {
      if (!DOOR_FIELDS.includes(key)) return { ok: false, response: badRequest('unknown_field', `payAtDoorContext.${key}`) };
    }
    if (!bounded(d['sellerTier'], 64) || !bounded(d['category'], 64)) {
      return { ok: false, response: badRequest('bad_field', 'payAtDoorContext') };
    }
    door = { eligibility: d['eligibility'], sellerTier: d['sellerTier'], category: d['category'] };
  }
  return {
    ok: true,
    request: {
      slug: raw['slug'] as string,
      pid: raw['pid'] as string,
      paymentMode: raw['paymentMode'] as string,
      zoneTo: raw['zoneTo'] as string,
      attributionResellerId: typeof attribution === 'string' ? attribution : '',
      requestKey: raw['requestKey'],
      ...(door !== undefined ? { payAtDoorContext: door } : {}),
    },
  };
}

/**
 * THE AUTHORITY READS. Her shop by slug (which also supplies `zoneFrom` — the
 * delivery origin is HER zone, never a value a buyer names), then the listing
 * that sells this pid IN THAT SHOP. Every failure yields `undefined`, which
 * `decideIssueQuote` turns into the NAMED `listing_unknown` — the same answer
 * for an unknown shop and an unknown product, so this surface is not an
 * existence oracle for either.
 */
async function readAuthority(
  env: Env,
  slug: string,
  pid: string,
): Promise<{ entry: ListingEntry | undefined; zoneFrom: string }> {
  const sfRes = await env.STOREFRONT_DO.fetch(new Request(`https://do/s/${encodeURIComponent(slug)}`)).catch(() => undefined);
  if (sfRes === undefined || sfRes.status !== 200) return { entry: undefined, zoneFrom: '' };
  const sf = (await sfRes.json().catch(() => null)) as { id?: string; zone?: string } | null;
  if (sf === null || typeof sf.id !== 'string' || typeof sf.zone !== 'string') return { entry: undefined, zoneFrom: '' };
  const lstRes = await env.LISTING_DO.fetch(
    new Request(`https://do/listings/by-pid/${encodeURIComponent(sf.id)}/${encodeURIComponent(pid)}/economics`),
  ).catch(() => undefined);
  if (lstRes === undefined || lstRes.status !== 200) return { entry: undefined, zoneFrom: sf.zone };
  const entry = (await lstRes.json().catch(() => null)) as ListingEntry | null;
  return { entry: entry ?? undefined, zoneFrom: sf.zone };
}

/** Read a stored quote through its DO and project it for the buyer. */
async function readAndProject(env: Env, quoteId: string): Promise<Response> {
  const res = await quoteStub(env, quoteId).fetch(new Request('https://do/entry'));
  const body = (await res.json().catch(() => null)) as { ok?: boolean; quote?: unknown; reason?: string } | null;
  if (body === null) return refuse('not_found');
  if (body.ok !== true || body.quote === undefined) return refuse(body.reason ?? 'not_found');
  // THE BOUNDARY. Only this projection ever reaches a buyer.
  return Response.json(toBuyerQuoteView(body.quote as Parameters<typeof toBuyerQuoteView>[0]), { status: 200 });
}

/**
 * Router — the buyer-facing checkout surface:
 *   POST /checkout/quote                  issue (idempotent on requestKey)
 *   GET  /checkout/quote/:id              the buyer view of a stored quote
 *   POST /checkout/quote/:id/reserve      the short atomic hold
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/checkout/quote') {
      const parsed = validateQuoteRequest(await request.json().catch(() => null));
      if (!parsed.ok) return parsed.response;
      const req = parsed.request;

      // 1. CLAIM THE KEY FIRST — atomically, inside one object. The quote id
      //    becomes a function of the request key, so a concurrent twin cannot
      //    mint a second one, and a retry after a refusal reuses the SAME id
      //    (the immutable store then guarantees at most one quote under it).
      const candidateQuoteId = `quote-${crypto.randomUUID()}`;
      const claimRes = await keyStub(env, req.requestKey).fetch(
        new Request('https://do/key/claim', { method: 'POST', body: JSON.stringify({ candidateQuoteId }) }),
      );
      const claim = (await claimRes.json().catch(() => null)) as { quoteId?: string } | null;
      if (claim === null || typeof claim.quoteId !== 'string') return refuse('not_found');
      const quoteId = claim.quoteId;

      // 2. ALREADY ISSUED UNDER THIS KEY? Then that quote is the answer —
      //    byte-identical, and never a second one. An expired one is refused,
      //    not silently replaced: a new price needs a new key.
      const existingRes = await quoteStub(env, quoteId).fetch(new Request('https://do/entry'));
      const existing = (await existingRes.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (existing?.ok === true) return readAndProject(env, quoteId);
      if (existing !== null && existing.ok === false && existing.reason !== 'not_found') {
        return refuse(existing.reason ?? 'not_found');
      }

      // 3. THE AUTHORITY READS, then the delivery price — both server-side.
      const { entry, zoneFrom } = await readAuthority(env, req.slug, req.pid);
      const delivery = quoteDeliveryFee(zoneFrom, req.zoneTo);

      // 4. ISSUE INSIDE THE OBJECT, so the immutable put is serialized with it.
      const issueRes = await quoteStub(env, quoteId).fetch(
        new Request('https://do/entry/issue', {
          method: 'POST',
          body: JSON.stringify({ quoteId, request: req, entry: entry ?? null, delivery: delivery ?? null }),
        }),
      );
      const issued = (await issueRes.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; quote?: { id?: string } }
        | null;
      if (issued === null) return refuse('not_found');
      if (issued.ok !== true) {
        // A concurrent twin won the race inside the object: the ONE quote that
        // exists is the answer. The refusal is the law working, not an error.
        if (issued.reason === 'quote_id_exists') return readAndProject(env, quoteId);
        return refuse(issued.reason ?? 'not_found');
      }
      // The quote must be the one this object is named for. A divergence would
      // mean a stored quote unreachable by its own id; refuse rather than serve.
      if (issued.quote?.id !== quoteId) return refuse('stored_quote_unreadable');
      return readAndProject(env, quoteId);
    }

    let m = /^\/checkout\/quote\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      return readAndProject(env, decodeURIComponent(m[1]!));
    }

    m = /^\/checkout\/quote\/([^/]+)\/reserve$/.exec(pathname);
    if (m && request.method === 'POST') {
      const quoteId = decodeURIComponent(m[1]!);
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return badRequest('malformed');
      for (const key of Object.keys(body)) {
        if (!RESERVE_FIELDS.includes(key)) return badRequest('unknown_field', key);
      }
      if (!bounded(body['commandId'], 128)) return badRequest('bad_field', 'commandId');
      if (!bounded(body['holderRef'], 128)) return badRequest('bad_field', 'holderRef');
      const res = await quoteStub(env, quoteId).fetch(
        new Request('https://do/entry/reserve', {
          method: 'POST',
          body: JSON.stringify({
            commandId: body['commandId'],
            holderRef: body['holderRef'],
            // MINTED SERVER-SIDE, from the OS CSPRNG — never a caller's value.
            newReservationId: `res-${crypto.randomUUID()}`,
          }),
        }),
      );
      const decision = (await res.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; reservationId?: string; state?: { status?: string; expiresAt?: string } }
        | null;
      if (decision === null) return refuse('not_found');
      if (decision.ok !== true) {
        if (res.status === 404 || res.status === 422) return refuse(decision.reason ?? 'not_found');
        // A reservation refusal is a STATE, spoken plainly: someone already holds
        // this quote. 409, with the name, and no money on the wire.
        return Response.json({ error: decision.reason ?? 'already_reserved' }, { status: 409 });
      }
      // The state only — an explicit literal, never the decision object spread.
      const status = decision.state?.status ?? 'reserved';
      return Response.json(
        {
          status,
          reservationId: decision.reservationId,
          ...(status === 'reserved' && decision.state?.expiresAt !== undefined
            ? { expiresAt: decision.state.expiresAt, holdMs: RESERVATION_TTL_MS }
            : {}),
        },
        { status: 200 },
      );
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
