import { PlatformEventSchema } from '@platform/contracts';
import {
  applyOrderInput,
  checkoutLegOf,
  decideCreateOrder,
  orderIdForQuote,
  parseStoredQuote,
  rebuildOrderSpine,
  toBuyerOrderView,
  type OrderInput,
  type OrderOrigin,
  type ReservationReceipt,
} from '../src/order-core.js';
import { readSandboxBehavior, sandboxPaymentProvider, type ChargeOutcome } from '../src/payment-port.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OrderDO — THE DURABLE ORDER AUTHORITY (SP3.3a).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One Durable Object instance PER ORDER (`idFromName(orderId)`, and the order id
 * is a function of the quote id — see `orderIdForQuote`), so every command
 * touching one order — create, retry, the provider webhook, the buyer's read —
 * serializes through one workerd input gate. That is the real mechanism the
 * storefront, listing, reservation and checkout DOs already use.
 *
 * ═══ WHAT LIVES HERE AND WHAT DOES NOT ═══
 *
 * The DECISIONS are in `../src/order-core.ts` (pure) and, behind it, the FROZEN
 * VAULT (`OrderSpine`, `advanceOrder`, `LedgerRecords`, `ImmutableQuoteStore`).
 * This file is storage plumbing, HTTP and one server-side mint. IT PERFORMS NO
 * ARITHMETIC ON MONEY — not one addition — and the only amount that ever appears
 * in it is the one the vault put on the Quote.
 *
 * ═══ HOW A MEMORY-ONLY SPINE IS MADE RESTART-PROOF ═══
 *
 * The object stores the INPUTS the spine has accepted, in order, and rebuilds the
 * spine by replaying them on every request (`rebuildOrderSpine`). The spine draws
 * no randomness and reads no clock, so the same log replays to the same state on
 * any process — which is what makes « the order survived a process death » a fact
 * about storage rather than a hope about memory.
 *
 * ═══ THE THREE THINGS THIS OBJECT REFUSES TO DO ═══
 *
 *  1. It never charges twice for one attempt id. An attempt is RECORDED durably
 *     BEFORE the provider is called, and a recorded attempt is never re-charged —
 *     including after a restart, when the in-memory provider has forgotten it.
 *  2. It never confirms an order on anything but a provider event, and even then
 *     only through the vault's `confirmOrder`, which re-reads the recorded
 *     EscrowTxn and refuses `no_funded_checkout_leg` (SP-I13).
 *  3. It never lets economics out. The buyer projection is built field by field
 *     INSIDE this object, so the full Quote does not even cross the wire to the
 *     router.
 */

const ORIGIN_KEY = 'order-origin';
const LOG_KEY = 'order-input-log';
const ATTEMPTS_KEY = 'payment-attempts';
const RESULTS_KEY = 'command-results';
const RECEIPT_KEY = 'reservation-receipt';

/** The actor every command from this service carries into the canon envelope. */
const ORDER_ACTOR = 'storefront-service:checkout';

/** The origin PLUS the frozen bytes of the quote this order was created from. */
interface StoredOrigin extends OrderOrigin {
  /** The canonical bytes, copied ONCE at creation. The order's price is frozen. */
  readonly quoteBytes: string;
}

/**
 * A payment attempt, durably. `outcome` starts as `pending` and is written BEFORE
 * the provider is called — a crash mid-charge therefore leaves an attempt that
 * can never be charged again, which is the safe direction: the webhook is the
 * only payment truth, and an un-answered charge stays un-answered rather than
 * becoming a second charge.
 */
interface AttemptRecord {
  readonly attemptId: string;
  readonly requestedAt: string;
  /**
   * THE AMOUNT THIS ATTEMPT WAS CHARGED FOR, recorded so that « the charge was
   * for the mode's own leg » is OBSERVABLE rather than asserted. It is copied
   * from the derived leg — which is itself read verbatim off the immutable
   * Quote — and never computed here. (A mutation check found this: with the leg
   * derivation broken to charge `productSubtotal` instead of `buyerTotal`, every
   * end-to-end test still passed, because nothing on the durable record named
   * the amount that had actually been asked for.)
   */
  readonly amount: number;
  outcome: 'pending' | 'accepted' | 'timeout' | 'idempotency_key_amount_mismatch';
  collectRef?: string;
}

interface CreateArgs {
  quoteId?: string;
  holderRef?: string;
  commandId?: string;
  quoteBytes?: string;
  orderId?: string;
}

export interface OrderDOEnv {
  /**
   * SANDBOX ONLY. The certified mock's misbehaviour, as JSON, so a test against
   * the REAL Worker can make a charge time out deterministically. UNSET on the
   * deploy, which is the well-behaved provider. It configures the MOCK and
   * nothing else: no real provider reads it, and no payment truth comes from it
   * (webhooks are the only payment truth).
   */
  readonly PAYMENT_SANDBOX_BEHAVIOR?: string;
}

export class OrderDO {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: OrderDOEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    /**
     * THE RESERVATION RECEIPT (see `ReservationReceipt` for the whole argument).
     * Written by the composition root the moment `CheckoutDO` has DECIDED a hold,
     * so that « does this caller hold this quote » is answerable here by a
     * single-object read instead of by a probe that would take the hold to ask
     * about it.
     *
     * MONOTONE IN TIME: a receipt is never replaced by one that expires EARLIER.
     * A fresh hold always carries a later `expiresAt` than any hold before it, so
     * this makes a late-landing older mirror write a no-op rather than a way to
     * resurrect a dead hold. Nothing here can make an order more reachable than
     * the reservation itself.
     */
    if (request.method === 'POST' && pathname === '/entry/reserved') {
      let body: Partial<ReservationReceipt>;
      try {
        body = (await request.json()) as Partial<ReservationReceipt>;
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      if (
        typeof body.quoteId !== 'string' ||
        body.quoteId === '' ||
        typeof body.reservationId !== 'string' ||
        body.reservationId === '' ||
        typeof body.holderRef !== 'string' ||
        body.holderRef === '' ||
        typeof body.expiresAt !== 'string' ||
        body.expiresAt === ''
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const receipt: ReservationReceipt = {
        quoteId: body.quoteId,
        reservationId: body.reservationId,
        holderRef: body.holderRef,
        expiresAt: body.expiresAt,
      };
      const existing = await this.state.storage.get<ReservationReceipt>(RECEIPT_KEY);
      if (existing !== undefined && existing.expiresAt > receipt.expiresAt) {
        return Response.json({ ok: true, stored: false });
      }
      await this.state.storage.put(RECEIPT_KEY, receipt);
      return Response.json({ ok: true, stored: true });
    }

    if (request.method === 'POST' && pathname === '/entry/create') {
      let args: CreateArgs;
      try {
        args = (await request.json()) as CreateArgs;
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      if (
        typeof args.quoteId !== 'string' ||
        args.quoteId === '' ||
        typeof args.holderRef !== 'string' ||
        args.holderRef === '' ||
        typeof args.commandId !== 'string' ||
        args.commandId === ''
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.create(args.quoteId, args.holderRef, args.commandId, args.quoteBytes);
    }

    /** THE BUYER READ. Already projected — the Quote does not leave this object. */
    if (request.method === 'GET' && pathname === '/entry') {
      const view = await this.projectForBuyer();
      if (view === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      return Response.json({ ok: true, view });
    }

    /**
     * THE AUDIT READ — the order's internal record: attempt ids, collect refs,
     * the EscrowTxn, the journey. INTERNAL ONLY, exactly as `CheckoutDO`'s own
     * `/entry` returns the full Quote internally: the public router maps no path
     * to it, so it is reachable only by code holding this namespace binding. It
     * is what makes « the retry used a NEW attempt id » and « nothing charged
     * twice » provable against the real Worker rather than asserted.
     */
    if (request.method === 'GET' && pathname === '/entry/audit') {
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const attempts = (await this.state.storage.get<AttemptRecord[]>(ATTEMPTS_KEY)) ?? [];
      const receipt = await this.state.storage.get<ReservationReceipt>(RECEIPT_KEY);
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) {
        return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
      }
      const spine = rebuildOrderSpine(quote, origin, log);
      return Response.json({
        ok: true,
        orderId: origin.orderId,
        quoteId: origin.quoteId,
        correlationId: origin.correlationId,
        state: spine.journey.state,
        chain: spine.journey.chain,
        priorPaymentAttemptIds: spine.journey.priorPaymentAttemptIds,
        attempts,
        escrow: spine.ledger.escrowFor(origin.orderId) ?? null,
        doorLeg: spine.doorLegState,
        receipt: receipt ?? null,
        inputCount: log.length,
      });
    }

    if (request.method === 'POST' && pathname === '/entry/webhook') {
      let body: { event?: unknown };
      try {
        body = (await request.json()) as { event?: unknown };
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.onProviderEvent(body.event);
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  /* ───────────────────────────── creation ──────────────────────────────── */

  /**
   * CREATE THE ORDER FROM A RESERVED QUOTE — or refuse, by name.
   *
   * IDEMPOTENT ON `commandId`, and deliberately only for ACCEPTED outcomes: a
   * command that moved something replays its stored answer byte-for-byte and
   * never charges again, while a REFUSAL is simply re-decided (it wrote nothing,
   * so re-deciding it IS idempotent — and a buyer who fixes what was wrong must
   * not be pinned to a stale « no » by the command id she already used).
   */
  private async create(
    quoteId: string,
    holderRef: string,
    commandId: string,
    wireQuoteBytes: string | undefined,
  ): Promise<Response> {
    const results = (await this.state.storage.get<Record<string, unknown>>(RESULTS_KEY)) ?? {};
    const replayed = results[commandId];
    if (replayed !== undefined) return Response.json(replayed);

    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    const receipt = await this.state.storage.get<ReservationReceipt>(RECEIPT_KEY);
    // THE ORDER'S OWN FROZEN BYTES WIN once it exists: an order is priced by the
    // quote it was created from, and no later read can re-price it.
    const bytes = origin?.quoteBytes ?? wireQuoteBytes;
    const decision = decideCreateOrder({
      quoteBytes: bytes,
      quoteId,
      holderRef,
      ...(receipt !== undefined ? { receipt } : { receipt: undefined }),
      now: new Date(),
    });
    if (!decision.ok) {
      return Response.json({ ok: false, reason: decision.reason }, { status: 422 });
    }
    const quote = decision.quote;
    const leg = checkoutLegOf(decision.legs);
    if (leg === undefined) {
      // Unreachable: every mode derives a checkout leg. Named rather than thrown.
      return Response.json({ ok: false, reason: 'quote_split_incoherent' }, { status: 422 });
    }

    const orderId = orderIdForQuote(quoteId);
    const now = new Date().toISOString();
    let stored: StoredOrigin;
    let log: OrderInput[];
    let attempts: AttemptRecord[];
    let attemptId: string;

    if (origin === undefined) {
      /* ── the first creation: quote_issued → reserved → payment_pending ── */
      stored = {
        orderId,
        quoteId,
        // The correlation id is DERIVED from the order id, so every command and
        // every event on this order carries one constant chain — and a replayed
        // spine reproduces it without storing a second random value. It is a log
        // correlator, never a secret and never a credential.
        correlationId: `corr-${orderId}`,
        issueCommandId: `ord-issue-${commandId}`,
        actor: ORDER_ACTOR,
        createdAt: now,
        // NOT KNOWN, deliberately empty — see `OrderOrigin.supplierRef`.
        supplierRef: '',
        quoteBytes: bytes as string,
      };
      attemptId = mintPaymentAttemptId();
      log = [
        {
          kind: 'advance',
          to: 'reserved',
          command_id: `ord-reserved-${commandId}`,
          actor: ORDER_ACTOR,
          serverTime: now,
          chainAdditions: { reservation_id: decision.reservationId },
        },
        {
          kind: 'advance',
          to: 'payment_pending',
          command_id: `ord-payinit-${commandId}`,
          actor: ORDER_ACTOR,
          serverTime: now,
          chainAdditions: { order_id: orderId, payment_attempt_id: attemptId },
        },
      ];
      const walked = rebuildOrderSpine(quote, stored, log);
      if (walked.journey.state !== 'payment_pending') {
        // The vault refused a transition this service believed legal. Refuse
        // rather than persist a journey nobody can explain.
        return Response.json({ ok: false, reason: 'order_not_startable' }, { status: 422 });
      }
      attempts = [{ attemptId, requestedAt: now, amount: leg.amount, outcome: 'pending' }];
    } else {
      const existingLog = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const existingAttempts = (await this.state.storage.get<AttemptRecord[]>(ATTEMPTS_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, existingLog);
      if (spine.journey.state !== 'payment_failed') {
        /**
         * AN ORDER ALREADY EXISTS AND ITS PAYMENT HAS NOT FAILED. A second
         * command is answered with the order AS IT STANDS — never a second order
         * (one quote, one order, structurally), and never a second charge. This
         * is the branch that makes an impatient double-tap harmless.
         */
        const view = await this.projectForBuyer();
        return Response.json(view === undefined ? { ok: false, reason: 'unknown_order' } : { ok: true, view });
      }
      /* ── the retry: payment_failed → payment_pending, a NEW attempt id ── */
      stored = origin;
      attemptId = mintPaymentAttemptId();
      log = [
        ...existingLog,
        {
          kind: 'retry',
          command_id: `ord-retry-${commandId}`,
          actor: ORDER_ACTOR,
          serverTime: now,
          newPaymentAttemptId: attemptId,
        },
      ];
      const walked = rebuildOrderSpine(quote, stored, log);
      if (walked.journey.state !== 'payment_pending') {
        // The vault's `retry_requires_new_attempt_id` is the only way here.
        return Response.json({ ok: false, reason: 'retry_refused' }, { status: 409 });
      }
      attempts = [...existingAttempts, { attemptId, requestedAt: now, amount: leg.amount, outcome: 'pending' }];
    }

    // THE ATTEMPT IS DURABLE BEFORE THE PROVIDER IS CALLED. If this process dies
    // mid-charge, the attempt id survives and can never be charged again.
    await this.state.storage.put(ORIGIN_KEY, stored);
    await this.state.storage.put(LOG_KEY, log);
    await this.state.storage.put(ATTEMPTS_KEY, attempts);

    const charge = await this.charge({
      orderId: stored.orderId,
      attemptId,
      // READ VERBATIM off the immutable Quote, through the mode's own leg.
      amount: leg.amount,
      correlationId: stored.correlationId,
      requestedAtIso: now,
      attemptsAlreadyInitiated: attempts.length - 1,
    });

    const record = attempts[attempts.length - 1] as AttemptRecord;
    if (charge.accepted) {
      record.outcome = 'accepted';
      record.collectRef = charge.collectRef;
    } else {
      record.outcome = charge.reason;
      // LOCAL KNOWLEDGE, NOT AN EVENT: no canon event exists for a provider
      // charge that timed out or was rejected — the webhook is the only provider
      // truth and it never came. The vault's `failPayment` records exactly that.
      log = [
        ...log,
        {
          kind: 'fail',
          command_id: `ord-fail-${commandId}`,
          actor: ORDER_ACTOR,
          serverTime: new Date().toISOString(),
          reason: charge.reason === 'timeout' ? 'charge_timeout' : 'charge_rejected',
        },
      ];
      await this.state.storage.put(LOG_KEY, log);
    }
    await this.state.storage.put(ATTEMPTS_KEY, attempts);

    const view = toBuyerOrderView({
      orderId: stored.orderId,
      state: rebuildOrderSpine(quote, stored, log).journey.state,
      quote,
    });
    const answer = { ok: true, view };
    await this.state.storage.put(RESULTS_KEY, { ...results, [commandId]: answer });
    return Response.json(answer);
  }

  /** The provider seam, wired to the ONE implementation this slice has. */
  private charge(args: {
    orderId: string;
    attemptId: string;
    amount: number;
    correlationId: string;
    requestedAtIso: string;
    attemptsAlreadyInitiated: number;
  }): Promise<ChargeOutcome> {
    const provider = sandboxPaymentProvider(
      readSandboxBehavior(this.env.PAYMENT_SANDBOX_BEHAVIOR),
      args.attemptsAlreadyInitiated,
    );
    return provider.initiateCharge({
      orderId: args.orderId,
      paymentAttemptId: args.attemptId,
      amount: args.amount,
      correlationId: args.correlationId,
      requestedAtIso: args.requestedAtIso,
      legType: 'checkout',
    });
  }

  /* ──────────────────────── the provider webhook ────────────────────────── */

  /**
   * THE ONLY PAYMENT TRUTH (Ten Laws #2), consumed through the FROZEN VAULT.
   *
   * Every validation below is the spine's, not this file's: the event must parse
   * as a canon `PlatformEvent`, be `payment.checkout_leg_confirmed.v1`, carry
   * THIS order's correlation id, arrive while the order is `payment_pending`,
   * and its amount must equal the immutable Quote's `amountPaidAtCheckout` TO THE
   * FRANC. A replay of a `command_id` already applied is ABSORBED, and — because
   * the spine is rebuilt from the durable log — that absorption survives a
   * process death, which is the only kind worth claiming.
   *
   * CONFIRMATION IS DRIVEN BY THIS EVENT AND NOTHING ELSE, and even then it goes
   * through `confirmOrder`, which re-reads the recorded EscrowTxn and refuses
   * `no_funded_checkout_leg`. A provider event that funds nothing confirms
   * nothing.
   */
  private async onProviderEvent(event: unknown): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    const quote = parseStoredQuote(origin.quoteBytes);
    if (quote === undefined) {
      return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
    }
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = rebuildOrderSpine(quote, origin, log);

    const outcome = applyOrderInput(spine, { kind: 'provider', event });
    if (!outcome.applied) {
      return Response.json({ ok: false, reason: outcome.reason }, { status: statusForWebhook(outcome.reason) });
    }
    if (outcome.duplicate) {
      // ABSORBED. Nothing appended, nothing charged, nothing moved.
      return Response.json({ ok: true, status: 'duplicate', state: spine.journey.state });
    }

    const parsed = PlatformEventSchema.parse(event);
    let next: OrderInput[] = [...log, { kind: 'provider', event }];
    const confirm: OrderInput = {
      kind: 'confirm',
      // Derived from the provider event's own command id, so a redelivery can
      // never produce a second confirmation command.
      command_id: `ord-confirm-${parsed.envelope.command_id}`,
      actor: ORDER_ACTOR,
      serverTime: parsed.envelope.serverTime,
    };
    const confirmed = applyOrderInput(spine, confirm);
    if (confirmed.applied) next = [...next, confirm];
    await this.state.storage.put(LOG_KEY, next);
    return Response.json({ ok: true, status: 'applied', state: spine.journey.state });
  }

  /* ───────────────────────────── the projection ─────────────────────────── */

  /** Built INSIDE the object, field by field — the Quote never crosses the wire. */
  private async projectForBuyer(): Promise<ReturnType<typeof toBuyerOrderView> | undefined> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return undefined;
    const quote = parseStoredQuote(origin.quoteBytes);
    if (quote === undefined) return undefined;
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = rebuildOrderSpine(quote, origin, log);
    return toBuyerOrderView({ orderId: origin.orderId, state: spine.journey.state, quote });
  }
}

/**
 * THE IDEMPOTENCY KEY, MINTED SERVER-SIDE FROM THE OS CSPRNG. `crypto.randomUUID`
 * is the platform's CSPRNG-backed v4 — the same mint the reservation id already
 * uses. It is NEVER a caller's value: an idempotency key a buyer could choose is
 * a key a buyer could collide with someone else's charge.
 */
function mintPaymentAttemptId(): string {
  return `att-${crypto.randomUUID()}`;
}

function statusForWebhook(reason: string): number {
  if (reason === 'not_a_platform_event' || reason === 'unexpected_event_name') return 400;
  if (reason === 'unknown_order') return 404;
  // Out-of-order and correlation mismatches are STATES, not malformed input: the
  // emitter redelivers. A wrong AMOUNT is neither — it is refused, never applied.
  if (reason === 'out_of_order' || reason === 'wrong_correlation') return 409;
  if (reason === 'conflicting_escrow_for_order' || reason === 'door_leg_before_checkout_leg') return 409;
  return 422;
}

/* ───────────────────────────────── the router ────────────────────────────── */

interface Env {
  ORDER: DurableObjectNamespace;
  /** The quote authority — read-only from here: the order copies, never writes. */
  CHECKOUT: DurableObjectNamespace;
}

const orderStub = (env: Env, orderId: string): DurableObjectStub =>
  env.ORDER.get(env.ORDER.idFromName(orderId));

/** The wire vocabulary a caller may send. Anything else is REFUSED, not ignored. */
const ORDER_FIELDS = ['quoteId', 'holderRef', 'commandId'];

/** The id alphabet every server-minted id in this repo already uses. */
const ID_ALPHABET = /^[A-Za-z0-9][A-Za-z0-9_-]{0,191}$/;

function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** A malformed id is simply not an id — it decodes to `undefined`, never a 500. */
function decodeId(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

function statusForRefusal(reason: string): number {
  if (reason === 'quote_unknown' || reason === 'unknown_order' || reason === 'not_found') return 404;
  // Someone else holds this quote: a STATE, spoken plainly, with no money on it.
  if (reason === 'reservation_held_by_another' || reason === 'retry_refused') return 409;
  return 422;
}

const refuse = (reason: string): Response =>
  Response.json({ error: reason }, { status: statusForRefusal(reason) });
const badRequest = (error: string, field?: string): Response =>
  Response.json(field === undefined ? { error } : { error, field }, { status: 400 });

/**
 * Router — the order surface:
 *   POST /checkout/order              create from a RESERVED quote (public)
 *   GET  /checkout/order/:id          the buyer view of an order (public)
 *   POST /checkout/webhook/payment    the provider's confirmation (SECRET-GATED
 *                                     at the composition root, before dispatch)
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/checkout/order') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return badRequest('malformed');
      /**
       * SHAPE FIRST, AND THE ALLOWLIST IS THE SHAPE — the same law the quote
       * route carries. An unknown key is a caller with a wrong model of who owns
       * what, most dangerously a caller sending an AMOUNT, and telling them so is
       * the only way they find out. There is no amount field here to land in.
       */
      for (const key of Object.keys(body)) {
        if (!ORDER_FIELDS.includes(key)) return badRequest('unknown_field', key);
      }
      if (!bounded(body['quoteId'], 191) || !ID_ALPHABET.test(body['quoteId'])) {
        return badRequest('bad_field', 'quoteId');
      }
      if (!bounded(body['holderRef'], 128)) return badRequest('bad_field', 'holderRef');
      if (!bounded(body['commandId'], 128)) return badRequest('bad_field', 'commandId');
      const quoteId = body['quoteId'];

      // THE QUOTE'S OWN BYTES, read server-side from the object that owns them.
      // The caller sends no amount and could not: the value that decides what is
      // charged never touches the wire.
      const quoteRes = await env.CHECKOUT.get(env.CHECKOUT.idFromName(quoteId)).fetch(
        new Request('https://do/entry'),
      );
      const quoteBody = (await quoteRes.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; canonicalBytes?: string }
        | null;
      if (quoteBody === null) return refuse('quote_unknown');
      if (quoteBody.ok !== true || typeof quoteBody.canonicalBytes !== 'string') {
        return refuse(quoteBody.reason === 'not_found' ? 'quote_unknown' : (quoteBody.reason ?? 'quote_unknown'));
      }

      const res = await orderStub(env, orderIdForQuote(quoteId)).fetch(
        new Request('https://do/entry/create', {
          method: 'POST',
          body: JSON.stringify({
            quoteId,
            holderRef: body['holderRef'],
            commandId: body['commandId'],
            quoteBytes: quoteBody.canonicalBytes,
          }),
        }),
      );
      const decided = (await res.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; view?: unknown }
        | null;
      if (decided === null) return refuse('not_found');
      if (decided.ok !== true || decided.view === undefined) return refuse(decided.reason ?? 'not_found');
      // THE BOUNDARY. Only the object's own projection ever reaches a buyer.
      return Response.json(decided.view, { status: 200 });
    }

    const byId = /^\/checkout\/order\/([^/]+)$/.exec(pathname);
    if (byId && request.method === 'GET') {
      const orderId = decodeId(byId[1]!);
      if (orderId === undefined || !ID_ALPHABET.test(orderId)) return badRequest('bad_field', 'orderId');
      const res = await orderStub(env, orderId).fetch(new Request('https://do/entry'));
      const body = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string; view?: unknown } | null;
      if (body === null || body.ok !== true || body.view === undefined) {
        return refuse(body?.reason ?? 'unknown_order');
      }
      return Response.json(body.view, { status: 200 });
    }

    if (request.method === 'POST' && pathname === '/checkout/webhook/payment') {
      /**
       * ═══ THE MOST DANGEROUS ROUTE IN THIS REPO ═══
       *
       * AUTHENTICATION HAS ALREADY HAPPENED before this line: the composition
       * root refuses an unsigned or wrongly-signed request with 401 BEFORE any
       * dispatch, so this handler cannot answer — and cannot become an existence
       * oracle for order ids — for a caller without the secret.
       *
       * WHAT AN ATTACKER WHO COULD POST HERE WOULD ACHIEVE, stated plainly
       * because a defence nobody named is a defence nobody checked: they would be
       * asserting that money arrived. A single accepted event moves an order to
       * `paid` and then to `confirmed`, which is the state Séra reads before
       * custody and the state settlement obligations are later copied from — so a
       * forged event is a free order, a real delivery, and a real payout against
       * money that never existed. THAT is why the secret fails closed, why it is
       * a `wrangler secret` and never a `[vars]` entry (all repos are public),
       * and why the amount is matched to the franc against the immutable Quote
       * rather than trusted from the payload.
       *
       * WHAT THE SECRET DOES NOT BUY, equally plainly: it is a shared bearer
       * secret, so anyone who holds it can post any event this route accepts.
       * Signature verification against the real provider's scheme is part of the
       * open aggregator Decision and lands with it at the Real-Money Gate.
       */
      const raw = await request.json().catch(() => null);
      const parsed = PlatformEventSchema.safeParse(raw);
      if (!parsed.success) return badRequest('malformed_event');
      const payload = parsed.data.payload as Record<string, unknown>;
      const orderId = payload['order_id'];
      if (!bounded(orderId, 191) || !ID_ALPHABET.test(orderId)) return badRequest('bad_field', 'order_id');

      const res = await orderStub(env, orderId).fetch(
        new Request('https://do/entry/webhook', {
          method: 'POST',
          body: JSON.stringify({ event: parsed.data }),
        }),
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; status?: string; state?: string }
        | null;
      if (body === null) return refuse('unknown_order');
      if (body.ok !== true) {
        return Response.json({ error: body.reason ?? 'refused' }, { status: res.status });
      }
      // The provider learns what happened to ITS event and nothing about money.
      return Response.json({ status: body.status, state: body.state }, { status: 200 });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
