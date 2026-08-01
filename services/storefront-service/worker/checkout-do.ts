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
import type { ProductDescription } from '../src/supply-source.js';

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
/**
 * ORDER-PAID-WIRE-1b — the three facts `order.confirmed.v1` needs that the
 * canon Quote artifact does not carry: `productVersionId`, `zoneTo` (from the
 * VALIDATED request this object is issuing for) and `offerVersion` (from the
 * RESOLVED listing). Written in the SAME atomic batch as the bytes, so a quote
 * either carries its fulfillment facts or does not exist — there is no
 * interleaving in which the order later reads bytes without them. Internal
 * wire only; `toBuyerQuoteView` never sees this record.
 */
const QUOTE_FULFILLMENT_KEY = 'quote-fulfillment-facts';
/** The INTENT this quote answers, written beside its bytes (verifier BLOCKER,
 *  round 3): the one object that owns the quote also owns the question it was
 *  issued for, so the two can never be judged in separate, interleavable acts. */
const QUOTE_INTENT_KEY = 'quote-intent-fingerprint';
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
  /**
   * SELLER-TIER-WIRE-1 — the supply projection behind this listing, read
   * SERVER-SIDE by the router. `null` is the JSON spelling of « supply could not
   * be described », and it is NOT an error: §6.1 simply cannot prove its
   * conditions, so Option B refuses and FULL_PREPAY is untouched.
   *
   * IT IS AN INTERNAL-WIRE FIELD, not a buyer-wire one. It reaches this object
   * from the router's own read, never from `args.request` — the whole point of
   * the slice is that the buyer stopped being asked these two facts.
   */
  supply?: ProductDescription | null;
  /** The INTENT this quote answers — stored beside the bytes, same act. */
  fingerprint?: string;
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
          supply: args.supply ?? undefined,
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
      // THE QUOTE CARRIES ITS OWN INTENT, WRITTEN IN THE SAME ACT AS ITS BYTES.
      // (Verifier BLOCKER, round 3.) The intent used to live on the key POINTER
      // — a different Durable Object — so the router had to read one object and
      // then write the other, and two concurrent requests could interleave
      // between those steps: one buyer was served another shop's price, at 200,
      // durably, surviving a restart. A check in object A can never guard a
      // write in object B. Here the fingerprint lands beside the bytes inside
      // the one object that owns them, so « which intent does this quote
      // answer » is settled by a single-object read that cannot interleave.
      //
      // ORDER-PAID-WIRE-1b — the FULFILLMENT FACTS land in the same batch, for
      // the same reason: `pid` and `zoneTo` come off the request THIS object
      // just issued for, `offerVersion` off the listing it priced against, and
      // the order that later reads the bytes must find these or nothing.
      const batch: Record<string, unknown> = { [QUOTE_BYTES_KEY]: outcome.canonicalBytes };
      if (typeof args.fingerprint === 'string' && args.fingerprint !== '') {
        batch[QUOTE_INTENT_KEY] = args.fingerprint;
      }
      if (args.entry != null) {
        batch[QUOTE_FULFILLMENT_KEY] = {
          productVersionId: args.request.pid,
          zoneTo: args.request.zoneTo,
          offerVersion: args.entry.listing.offerVersion,
        };
      }
      await this.state.storage.put(batch);
      return Response.json({ ok: true, quote: outcome.quote });
    }

    /** READ. Absent → not_found; past its expiry → `expired`, never revived.
     *  Carries the stored INTENT so the caller can compare in this ONE read,
     *  and (ORDER-PAID-WIRE-1b) the FULFILLMENT FACTS so the order can carry
     *  them from birth. Internal wire only — never the buyer's. */
    if (request.method === 'GET' && pathname === '/entry') {
      const bytes = await this.state.storage.get<string>(QUOTE_BYTES_KEY);
      const read = readStoredQuote(bytes, new Date());
      const intent = (await this.state.storage.get<string>(QUOTE_INTENT_KEY)) ?? '';
      if (!read.ok) {
        return Response.json(
          { ok: false, reason: read.reason, intent },
          { status: read.reason === 'not_found' ? 404 : 422 },
        );
      }
      const fulfillment = await this.state.storage.get<Record<string, string>>(QUOTE_FULFILLMENT_KEY);
      // The stored BYTES ride along so the caller can prove byte-stability
      // without re-serializing (internal wire only — never the buyer's).
      return Response.json({
        ok: true,
        quote: read.quote,
        canonicalBytes: bytes,
        intent,
        ...(fulfillment !== undefined ? { fulfillment } : {}),
      });
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
      if (existing !== undefined) {
        // The pointer's ONLY job is « which id does this key name » — minted
        // once, then constant forever. It deliberately holds NO opinion about
        // intent: that lives beside the quote's bytes, in the object that owns
        // them, so the comparison is a single-object read. A pointer left by a
        // REFUSED attempt therefore locks nothing — the buyer corrects her zone
        // and retries under the same id, and that retry simply issues.
        return Response.json({ quoteId: existing.quoteId, claimed: false });
      }
      await this.state.storage.put(KEY_POINTER_KEY, { quoteId: body.candidateQuoteId });
      return Response.json({ quoteId: body.candidateQuoteId, claimed: true });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}

/**
 * Serve a stored quote ONLY to the intent it was issued for. The intent is read
 * from the same object that holds the bytes, so this is one atomic read — no
 * check-then-act across two Durable Objects (the shape that produced the
 * round-3 blocker).
 */
async function projectIfIntentMatches(env: Env, quoteId: string, fingerprint: string): Promise<Response> {
  const res = await quoteStub(env, quoteId).fetch(new Request('https://do/entry'));
  const body = (await res.json().catch(() => null)) as { ok?: boolean; intent?: string } | null;
  if (body?.ok !== true) return refuse('not_found');
  if ((body.intent ?? '') !== fingerprint) {
    return Response.json({ error: 'request_key_reused' }, { status: 409 });
  }
  return readAndProject(env, quoteId);
}

/* ───────────────────────────────── the router ────────────────────────────── */

interface Env {
  CHECKOUT: DurableObjectNamespace;
  /** The storefront DO router, reached through the composition root's shim. */
  STOREFRONT_DO: { fetch(request: Request): Promise<Response> };
  /** The listing DO router, same shim. Internal: `/listings*` stays key-gated. */
  LISTING_DO: { fetch(request: Request): Promise<Response> };
  /**
   * SELLER-TIER-WIRE-1 — the supply read, narrowed to the ONE method this router
   * needs. The composition root hands in `resolveSupplySource(env)`, which is
   * `AbsentSupplySource` when no `OFFER` binding exists — so the mock stays
   * unreachable from here by construction, exactly as it is from `src/index.ts`.
   *
   * OPTIONAL, and absence is fail-closed, not a fault: no supply source ⇒ no
   * description ⇒ §6.1 cannot prove « seller tier ≥ verified » or « category
   * inspectable » ⇒ Option B refuses. FULL_PREPAY never touches this field.
   */
  SUPPLY?: { describe(productVersionId: string): Promise<ProductDescription | undefined> };
}

const quoteStub = (env: Env, quoteId: string): DurableObjectStub =>
  env.CHECKOUT.get(env.CHECKOUT.idFromName(quoteId));
const keyStub = (env: Env, requestKey: string): DurableObjectStub =>
  env.CHECKOUT.get(env.CHECKOUT.idFromName(`key:${requestKey}`));

/** The wire vocabulary a caller may send. Anything else is REFUSED, not ignored. */
const REQUEST_FIELDS = ['slug', 'pid', 'paymentMode', 'zoneTo', 'attributionResellerId', 'requestKey', 'payAtDoorContext'];
/**
 * SELLER-TIER-WIRE-1 — `sellerTier` AND `category` LEFT THIS LIST.
 *
 * They are no longer dropped-if-sent; they are REFUSED if sent
 * (`unknown_field · payAtDoorContext.sellerTier`), on the same allowlist law
 * `policy` has always been held to: a caller who could answer a §6.1 condition
 * could measure themselves against it, and the only way a caller finds out that
 * the server stopped asking is to be told. Both facts now come from the supply
 * projection this Worker reads for itself.
 */
const DOOR_FIELDS = ['eligibility'];

/**
 * The one payment mode whose quote consults §6.1 — and therefore the only mode
 * that may cause this Worker to read supply. Spelled here rather than inline so
 * the amplification guard below and the vault agree on one string; the vault
 * remains the authority on what the mode MEANS (an unknown mode still refuses
 * `payment_mode_unknown` there, never here).
 */
const DOOR_PAYMENT_MODE = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
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

/**
 * DECODE A PATH SEGMENT WITHOUT A 500 (verifier finding, SP3.2a).
 *
 * `decodeURIComponent` THROWS a `URIError` on a lone escape (`%FF`), and an
 * uncaught throw on a public money route answers 500 — the one shape the DoD
 * bans (« every failure is a named refusal »). A malformed id is simply not an
 * id: it decodes to `undefined` and refuses by name.
 */
function decodeId(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

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
  // An EMPTY string means the same thing as an omitted field — « no locked
  // reseller » — and must reach the NAMED `attribution_missing` downstream
  // rather than a shape error (verifier finding: the comment above promised
  // that, but `bounded()` rejected '' first, so only omission ever got there).
  // A non-string, or one over the bound, is still a malformed body.
  if (attribution !== undefined && attribution !== '' && !bounded(attribution, 128)) {
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
    // `eligibility` is NOT shape-checked here on purpose: the vault parses it
    // against the canonical `PayAtDoorEligibility` record and refuses anything
    // else by name. A second, weaker copy of that check in the router is how two
    // halves of a validation drift apart.
    door = { eligibility: d['eligibility'] };
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
      // WHAT THE KEY IS BOUND TO: the request's identity, not its bytes. The
      // five values that decide an amount — shop, product, mode, destination,
      // payee. A retry of the SAME intent matches and is idempotent; a
      // different intent under a reused key is refused by name.
      const fingerprint = [req.slug, req.pid, req.paymentMode, req.zoneTo, req.attributionResellerId].join('\u0000');
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
      const existing = (await existingRes.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; intent?: string }
        | null;
      if (existing?.ok === true) {
        // A QUOTE EXISTS UNDER THIS KEY, and the quote itself says which intent
        // it answers. A key replayed with a different shop, product, mode,
        // destination or payee is REFUSED BY NAME rather than served the first
        // quote's amount — the buyer view carries no product reference, so a
        // silent mismatch is undetectable by the client.
        if ((existing.intent ?? '') !== fingerprint) {
          return Response.json({ error: 'request_key_reused' }, { status: 409 });
        }
        return readAndProject(env, quoteId);
      }
      // NOTHING WAS ISSUED under this key (a previous attempt refused). The key
      // is NOT spent and nothing needs re-pointing: the intent is written with
      // the quote, so a buyer who corrects her delivery zone and retries simply
      // issues now, under the same id, with her corrected intent.
      if (existing !== null && existing.ok === false && existing.reason !== 'not_found') {
        return refuse(existing.reason ?? 'not_found');
      }

      // 3. THE AUTHORITY READS, then the delivery price — both server-side.
      const { entry, zoneFrom } = await readAuthority(env, req.slug, req.pid);
      const delivery = quoteDeliveryFee(zoneFrom, req.zoneTo);

      // ═══ SELLER-TIER-WIRE-1 — THE §6.1 FACTS, READ BY THE SERVER ═══
      //
      // FOUR CONDITIONS, AND EACH ONE EARNS ITS PLACE. An earlier cut of this
      // gated on `payAtDoorContext !== undefined` alone, and a verifier showed
      // what that costs: `payAtDoorContext` is a field ANY caller may add to ANY
      // request, so an anonymous `POST /checkout/quote` carrying
      // `{paymentMode:'FULL_PREPAY', payAtDoorContext:{}}` and an INVENTED `pid`
      // forced this Worker to fetch boutik — with `SUPPLY_READ_SECRET` on the
      // request — for a product nobody sells, before refusing `listing_unknown`.
      // An unauthenticated route that makes another service work is an
      // amplifier, and this one reached across a trust boundary.
      //
      //  · `paymentMode` IS the door mode — the vault consults these facts for
      //    no other mode, so no other mode may pay for the fetch. This is also
      //    what makes the sentence « only for an Option-B request » TRUE rather
      //    than merely intended.
      //  · `payAtDoorContext` is present — without it `checkout-core.ts` omits
      //    the block regardless, so the read would be pure waste.
      //  · `entry !== undefined` — the listing RESOLVED. An unknown listing
      //    already refuses `listing_unknown` before supply is consulted, so this
      //    read can no longer be aimed at an arbitrary productVersionId; the pid
      //    must be one a real published listing in a real shop actually sells.
      //  · `env.SUPPLY` is configured.
      //
      // The safety property is unchanged and still the reason for the whole
      // shape: a supply hiccup — unreachable producer, stale projection,
      // unconfigured binding — must never be able to refuse an ORDINARY
      // FULL_PREPAY checkout, which does not consult this value at all. The cost
      // argument stands too: a cross-Worker fetch charged to every buyer to
      // serve the minority who choose the door is a latency tax on the majority,
      // on the low-end networks Law #7 designs for.
      //
      // ⚠ THE `.catch()` BELOW IS DEAD DEFENCE, AND SAYING SO IS THE POINT.
      // A verifier mutated it to fail OPEN — fabricating a `verified` supplier
      // out of a failed read — and the ENTIRE suite stayed green, including the
      // three broken-producer e2e cases. Not a gap in those tests: BOTH shipped
      // ports resolve for every hostile input (`BoundSupplySource` catches its
      // own fetch and both `json()` calls; `AbsentSupplySource` cannot fail), so
      // nothing can reach this catch and no behavioural test can tell its bodies
      // apart. It stays because an uncaught rejection on this route answers 500
      // and the DoD bans that — insurance against a FUTURE port, not the
      // mechanism protecting today's. The premise that makes it dead is asserted
      // directly in `test/supply-source.test.ts` (« THE SUPPLY PORT NEVER
      // REJECTS »), so the day a port starts rejecting, that test says so.
      // **This branch is deliberately NOT claimed as mutation-covered.**
      //
      // The real fail-closed mechanism is the line below and the two after it:
      // `undefined` is not repaired and not substituted — it travels as `null`
      // and `checkout-core.ts` omits the whole block, which the vault refuses
      // `context_missing`. THAT path is covered, three ways, over HTTP.
      let supply: ProductDescription | undefined;
      if (
        req.paymentMode === DOOR_PAYMENT_MODE &&
        req.payAtDoorContext !== undefined &&
        entry !== undefined &&
        env.SUPPLY !== undefined
      ) {
        supply = await env.SUPPLY.describe(req.pid).catch(() => undefined);
      }

      // 4. ISSUE INSIDE THE OBJECT, so the immutable put is serialized with it.
      const issueRes = await quoteStub(env, quoteId).fetch(
        new Request('https://do/entry/issue', {
          method: 'POST',
          body: JSON.stringify({
            quoteId,
            request: req,
            entry: entry ?? null,
            delivery: delivery ?? null,
            supply: supply ?? null,
            fingerprint,
          }),
        }),
      );
      const issued = (await issueRes.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; quote?: { id?: string } }
        | null;
      if (issued === null) return refuse('not_found');
      if (issued.ok !== true) {
        // A concurrent twin won the race INSIDE the object: exactly one quote
        // exists. It is the answer ONLY if it answers this same intent — the
        // loser of a race between two DIFFERENT intents must be refused, never
        // handed the winner's price (verifier BLOCKER, round 3: this branch is
        // where the wrong shop's total reached a buyer at HTTP 200).
        if (issued.reason === 'quote_id_exists') return projectIfIntentMatches(env, quoteId, fingerprint);
        return refuse(issued.reason ?? 'not_found');
      }
      // The quote must be the one this object is named for. A divergence would
      // mean a stored quote unreachable by its own id; refuse rather than serve.
      if (issued.quote?.id !== quoteId) return refuse('stored_quote_unreadable');
      return readAndProject(env, quoteId);
    }

    let m = /^\/checkout\/quote\/([^/]+)$/.exec(pathname);
    if (m && request.method === 'GET') {
      const quoteId = decodeId(m[1]!);
      if (quoteId === undefined) return badRequest('bad_field', 'quoteId');
      return readAndProject(env, quoteId);
    }

    m = /^\/checkout\/quote\/([^/]+)\/reserve$/.exec(pathname);
    if (m && request.method === 'POST') {
      const quoteId = decodeId(m[1]!);
      if (quoteId === undefined) return badRequest('bad_field', 'quoteId');
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
