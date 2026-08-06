import { PlatformEventSchema, type Quote } from '@platform/contracts';
import { decideBuyerRung } from '@shop-plus/commerce-core';
import {
  acceptChargeForLeg,
  applyOrderInput,
  chargeFaultInput,
  checkoutLegOf,
  decideCreateOrder,
  decideDoorCharge,
  orderIdForQuote,
  parseStoredQuote,
  composeOrderConfirmedEvent,
  outboxBackoffMs,
  rebuildOrderSpine,
  toBuyerOrderView,
  type ChargeFault,
  type OrderInput,
  type OrderOrigin,
  type ReservationReceipt,
} from '../src/order-core.js';
import { readSandboxBehavior, sandboxPaymentProvider, type ChargeOutcome } from '../src/payment-port.js';
import { lireEligibilite } from './buyer-ladder-do.js';

/** SP6.3 — the one mode whose order consults the §6.4 ladder. Spelled once
 *  so the check and the vault agree on one string. */
const DOOR_MODE = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
import { RESELLER_FEED_NAME } from './reseller-feed-do.js';

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
 *  1. It never collects twice for one LEG. The provider's idempotency key belongs
 *     to the (order, legType) pair, is minted once, and is stored durably BEFORE
 *     the provider is called — so a retry after an ambiguous timeout, and a
 *     retry after a process death, both present the SAME key. The audit attempt
 *     id, which the state machine requires to be new on the retry edge, is a
 *     separate value and never reaches the provider.
 *  2. It never confirms an order on anything but a provider event, and even then
 *     only through the vault's `confirmOrder`, which re-reads the recorded
 *     EscrowTxn and refuses `no_funded_checkout_leg` (SP-I13).
 *  3. It never lets economics out. The buyer projection is built field by field
 *     INSIDE this object, so the full Quote does not even cross the wire to the
 *     router.
 */

const ORIGIN_KEY = 'order-origin';
/**
 * ORDER-PAID-WIRE-1b — THE OUTBOX: the preparation signal, durably beside the
 * order it announces. Written in the SAME atomic batch as the confirm's log
 * append, so « the order is confirmed » and « boutik will be told » become true
 * together or not at all. Delivery is the ALARM's job, never the webhook
 * response's: the provider's call answers fast, and a boutik outage costs
 * nothing but delay. AT-LEAST-ONCE rests on TWO legs, named precisely
 * (verifier correction — an earlier comment argued the wrong window): the
 * alarm is a coalesced storage write beside the batch put, and the
 * duplicate-webhook path re-arms any pending outbox found without an alarm —
 * so neither a crash between the two writes nor a scheduling throw can strand
 * the signal. The intake absorbs redeliveries first-wins on `orderId`.
 */
const OUTBOX_KEY = 'order-confirmed-outbox';
/**
 * SE-LIVE-2a — the SÉRA FUNDING-FACT outbox, a SECOND destination for the
 * same confirm transition, kept under its own key so neither wire can ever
 * mask the other's fate (boutik delivered / séra pending is a real and
 * visible state). Séra's dispatch gate (SE-I02) admits a delivery task only
 * for a « funded per payment mode + non-cancelled » order, and Séra never
 * computes that truth — it consumes this fact. Shop+ sends the FACT, never a
 * task and never an amount: no franc figure crosses this wire.
 */
const SERA_OUTBOX_KEY = 'sera-funding-outbox';
const LOG_KEY = 'order-input-log';
const ATTEMPTS_KEY = 'payment-attempts';
const RESULTS_KEY = 'command-results';
const RECEIPT_KEY = 'reservation-receipt';
/** One provider idempotency key PER LEG, minted once, never re-minted. */
const LEG_KEYS_KEY = 'provider-leg-keys';
/**
 * SP4.2a-bis — the DOOR leg's own attempt log and command results, kept apart
 * from the checkout leg's.
 *
 * THEY ARE SEPARATE BECAUSE THE TWO LEGS ARE. The checkout attempts drive the
 * state machine (`payment_pending`, the retry edge, `priorPaymentAttemptIds`)
 * and their COUNT is what the certified mock's timeout budget is computed
 * from; a door attempt in that list would silently change how the mock behaves
 * for the checkout leg. Two lists means « which attempt, which leg » is never
 * a question anyone has to answer by inspection.
 */
const DOOR_ATTEMPTS_KEY = 'door-payment-attempts';
const DOOR_RESULTS_KEY = 'door-command-results';

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
  /**
   * THE AUDIT ATTEMPT ID — the state machine's. `order-machine.ts` REQUIRES a
   * new one on the `payment_failed → payment_pending` edge and preserves the
   * superseded one in `priorPaymentAttemptIds`. It never reaches the provider.
   */
  readonly attemptId: string;
  /**
   * THE PROVIDER IDEMPOTENCY KEY — the LEG's, not this attempt's. Every attempt
   * at one leg carries the SAME key, so a retry after an ambiguous timeout is a
   * retry the provider can dedupe rather than a second collection. Recorded per
   * attempt so « which attempt » and « which charge » stay separately
   * answerable, exactly as the audit needs them to be.
   */
  readonly providerKey: string;
  readonly requestedAt: string;
  /**
   * THE AMOUNT THIS ATTEMPT WAS CHARGED FOR — ECHOED BACK BY THE PORT, never
   * re-read from the leg here, so the charge and the record cannot diverge.
   * (Two mutation checks found this the hard way: first that nothing named the
   * amount at all, then that naming it independently let the charge be changed
   * while the record stayed truthful-looking.)
   */
  amount: number;
  outcome: 'pending' | 'accepted' | 'timeout' | 'idempotency_key_amount_mismatch';
  collectRef?: string;
}

interface CreateArgs {
  quoteId?: string;
  holderRef?: string;
  commandId?: string;
  quoteBytes?: string;
  orderId?: string;
  /** ORDER-PAID-WIRE-1b — the quote's fulfillment facts, from the internal
   *  checkout read on the same hop as the bytes. `null` = an old quote. */
  fulfillment?: { productVersionId?: string; zoneTo?: string; offerVersion?: string } | null;
  /** BC-1a — the buyer's own dispatch contact, from the public create body
   *  (strict-validated at the router AND here). `null`/absent = none given. */
  contact?: BuyerContact | null;
}

/**
 * ═══ BC-1a — THE BUYER'S DISPATCH CONTACT (founder-approved, 2026-08-02) ═══
 *
 * Phone + quartier + repère, entered by the buyer at checkout so the FOUNDER
 * can dispatch a rider himself. The three approved fields and nothing else.
 *
 * WHERE IT LIVES AND WHERE IT NEVER GOES:
 *  · stored under its OWN key on this object — never inside `quoteBytes`
 *    (the frozen money bytes stay money-only, byte-stable);
 *  · NEVER on the buyer projection (`projectForBuyer` untouched): the public
 *    order view is reachable by anyone holding the order link, and a phone
 *    number there would leak to every screenshot of it;
 *  · NEVER on `order.confirmed.v1` (no contracts change; the supplier wire
 *    stays contact-free, the founder's standing privacy ruling);
 *  · read by exactly one door: the founder's CHECKOUT_OPS_SECRET-gated
 *    dispatch route, through `/entry/dispatch` below.
 *
 * LIFECYCLE, for free from create()'s own branches: written atomically with
 * the order's birth, REPLACEABLE on the payment_failed retry (a buyer fixing
 * a typo'd phone before paying), and FROZEN after confirm — the
 * already-exists-not-failed branch answers without writing anything.
 */
export interface BuyerContact {
  readonly phone: string;
  readonly quartier: string;
  /** The landmark. May be '' — not every address has one to name. */
  readonly repere: string;
}

const CONTACT_KEY = 'buyer-contact';

/**
 * READINESS-RETURN-1c — BOUTIK+'S PREPARATION FACTS, as this order received
 * them. Stored under their OWN key, never merged into the frozen quote bytes
 * and never into the order's own journey: this is another domain's news about
 * the same order, not a transition of the payment machine. Keeping it separate
 * is what lets it be absent without the order being wrong.
 *
 * FIRST-WINS PER FACT: acceptance happened once, readiness happened once, and
 * an at-least-once redelivery may not move either clock. The stored instant is
 * BOUTIK+'S, carried on the event — the domain that observed the act owns its
 * time, exactly as `paidAt` is this Worker's clock and not the provider's.
 */
const PREPARATION_KEY = 'fulfillment-preparation';

interface PreparationRecord {
  readonly acceptedAt?: string;
  readonly readyAt?: string;
}

/** Strict shape: EXACTLY the three approved keys, phone and quartier
 *  non-empty, all bounded. Anything else is null (the caller refuses). */
export function readBuyerContact(value: unknown): BuyerContact | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const keys = Object.keys(r).sort();
  if (keys.length !== 3 || keys[0] !== 'phone' || keys[1] !== 'quartier' || keys[2] !== 'repere') {
    return null;
  }
  const phone = r['phone'];
  const quartier = r['quartier'];
  const repere = r['repere'];
  if (typeof phone !== 'string' || phone.trim() === '' || phone.length > 32) return null;
  if (typeof quartier !== 'string' || quartier.trim() === '' || quartier.length > 120) return null;
  if (typeof repere !== 'string' || repere.length > 200) return null;
  return { phone, quartier, repere };
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
  /**
   * ORDER-PAID-WIRE-1b — the wire to Boutik+. `OFFER` is the SAME service
   * binding the supply read uses (one bound Worker, two routes on it); the
   * Durable Object receives the full Worker env, so no composition-root shim is
   * needed. `FULFILLMENT_WRITE_SECRET` is this Worker's copy of the shared
   * intake credential (`wrangler secret put`, never `[vars]`), presented as
   * `Authorization: Bearer`. ABSENT EITHER ⇒ deliveries stay `pending` and the
   * alarm retries hourly — the money path never notices, and the backlog
   * drains the moment configuration arrives.
   */
  readonly OFFER?: { fetch(request: Request): Promise<Response> };
  readonly FULFILLMENT_WRITE_SECRET?: string;
  /**
   * SE-LIVE-2a — the wire to Séra's intake door. A PLAIN HTTPS base (a var —
   * the URL is public) rather than a service binding, deliberately: a binding
   * to a Worker that does not exist yet fails the DEPLOY, and the deploy-order
   * law puts the consumer's door first. With the base or the secret absent the
   * fact stays `pending` and the alarm retries — the same at-least-once shape
   * the boutik wire uses, so a Shop+ deployed before Séra loses nothing and
   * drains the moment the founder sets both.
   */
  readonly SERA_INTAKE_BASE?: string;
  readonly SERA_INTAKE_SECRET?: string;
  /** RF-1a — the reseller feed index (one singleton). Bound on the Worker, so
   *  this object writes her row at the confirm transition without a
   *  composition-root shim, exactly as `OFFER` needs none. ABSENT ⇒ the
   *  registration is skipped and the money path is untouched. */
  readonly RESELLER?: DurableObjectNamespace;
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
     * ═══ A RECEIPT FOR A GIVEN `reservationId` IS IMMUTABLE ═══
     * (Verifier BLOCKER, round 2 — the defect this closes was live.)
     *
     * AN IDEMPOTENT REPLAY IS BY DEFINITION NOT A NEW DECISION, SO IT MAY NOT
     * CARRY A NEW HOLDER. The vault replays an existing hold when the reserve
     * `command_id` matches (`reservation.ts`) and answers with the ORIGINAL
     * hold's ids — while the mirror takes `holderRef` from the REQUEST. So an
     * attacker who replayed the victim's reserve command id under his own
     * holderRef flipped this receipt, and HIS order was created while
     * `CheckoutDO` still held the VICTIM's reservation. The equal `expiresAt` of
     * a replay walked straight through a monotone-only guard.
     *
     * The rule is therefore the reservation id, not the clock: the SAME
     * reservation can never change hands here, whatever a write claims. Only a
     * DIFFERENT reservation — a genuinely new hold, which always carries a
     * strictly LATER `expiresAt` — may replace it. The monotone check stays as
     * the second half of that sentence: it is what stops a late-landing older
     * mirror write from resurrecting a dead hold.
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
      if (existing !== undefined) {
        // SAME HOLD ⇒ ALREADY DECIDED. Not an error, not an overwrite: the
        // reservation this receipt describes has one holder, settled when it was
        // created, and no later write about the same hold may say otherwise.
        if (existing.reservationId === receipt.reservationId) {
          return Response.json({ ok: true, stored: false, reason: 'already_decided' });
        }
        // A DIFFERENT hold must be a genuinely LATER one. Strictly later: a
        // fresh hold's TTL always runs from now, so anything not strictly later
        // is an older mirror write landing out of order.
        if (existing.expiresAt >= receipt.expiresAt) {
          return Response.json({ ok: true, stored: false, reason: 'not_later' });
        }
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
      // BC-1a — a PRESENT contact must be whole or the create refuses: a
      // half-formed contact stored quietly would surface at dispatch time, on
      // the one screen whose worth is that every line on it is true.
      let contact: BuyerContact | null = null;
      if (args.contact !== undefined && args.contact !== null) {
        contact = readBuyerContact(args.contact);
        if (contact === null) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.create(args.quoteId, args.holderRef, args.commandId, args.quoteBytes, args.fulfillment ?? undefined, contact);
    }

    /** ORDER-PAID-WIRE-1b — the OUTBOX READ. Internal wire only (the composition
     *  root never routes it publicly): evidence for tests, state for the future
     *  operator console. Absent = the order never confirmed. */
    if (request.method === 'GET' && pathname === '/entry/outbox') {
      const outbox = await this.state.storage.get(OUTBOX_KEY);
      if (outbox === undefined) return Response.json({ ok: false, reason: 'no_outbox' }, { status: 404 });
      // SE-LIVE-2a: the Séra wire's fate is reported BESIDE boutik's, never
      // folded into it — « boutik delivered, Séra still pending » is a real
      // state an operator must be able to see.
      const sera = await this.state.storage.get(SERA_OUTBOX_KEY);
      return Response.json({ ok: true, outbox, ...(sera !== undefined ? { seraOutbox: sera } : {}) });
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
      if (origin === undefined) {
        // NO ORDER YET — but this object may already hold a reservation receipt,
        // and « a hold exists and no order was created against it » is a real
        // state that must be inspectable. `exists: false` says so plainly rather
        // than through an absent body.
        const held = await this.state.storage.get<ReservationReceipt>(RECEIPT_KEY);
        return Response.json({
          ok: true,
          exists: false,
          state: null,
          attempts: [],
          escrow: null,
          receipt: held ?? null,
        });
      }
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
        exists: true,
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

    /**
     * BC-1a — THE DISPATCH PROJECTION. INTERNAL ONLY, like the audit read: the
     * public router maps no path here; it is reachable only through the
     * founder's CHECKOUT_OPS_SECRET-gated dispatch route at the composition
     * root. Built FIELD BY FIELD (never a spread): the state, the contact,
     * and the fulfillment facts — no quote bytes, no attempts, no provider
     * refs, no economics.
     */
    if (request.method === 'GET' && pathname === '/entry/dispatch') {
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: true, exists: false });
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) {
        return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
      }
      const spine = rebuildOrderSpine(quote, origin, log);
      const contact = await this.state.storage.get<BuyerContact>(CONTACT_KEY);
      return Response.json({
        ok: true,
        exists: true,
        orderId: origin.orderId,
        state: spine.journey.state,
        createdAt: origin.createdAt,
        contact: contact ?? null,
        productVersionId: origin.fulfillment?.productVersionId ?? '',
        zoneTo: origin.fulfillment?.zoneTo ?? '',
      });
    }

    /**
     * READINESS-RETURN-1c — RECORD A PREPARATION FACT from Boutik+. INTERNAL
     * ONLY: the composition root parses the canon event, checks its own
     * secret, and passes just the fact and its instant. FIRST-WINS per fact,
     * so an at-least-once redelivery can never move a clock a reseller has
     * already been shown.
     *
     * An order this Worker does not know is a 404 and NOT a write: inventing
     * an empty order from a preparation event would create a row no buyer
     * ever paid for. Boutik+ treats a non-2xx as undelivered and retries,
     * which is the honest outcome if the two Workers ever disagree.
     */
    if (request.method === 'POST' && pathname === '/entry/preparation') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const fact = body?.['fact'];
      const at = body?.['at'];
      if ((fact !== 'accepted' && fact !== 'ready') || typeof at !== 'string' || at === '') {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      if ((await this.state.storage.get<StoredOrigin>(ORIGIN_KEY)) === undefined) {
        return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      }
      const existing = (await this.state.storage.get<PreparationRecord>(PREPARATION_KEY)) ?? {};
      const already = fact === 'accepted' ? existing.acceptedAt : existing.readyAt;
      if (already !== undefined) {
        return Response.json({ ok: true, status: 'already_recorded', at: already });
      }
      const next: PreparationRecord =
        fact === 'accepted' ? { ...existing, acceptedAt: at } : { ...existing, readyAt: at };
      await this.state.storage.put(PREPARATION_KEY, next);
      return Response.json({ ok: true, status: 'recorded', at });
    }

    /**
     * RF-1a — THE RESELLER'S PROJECTION. INTERNAL ONLY (the public router
     * maps no path here); reachable only through her personal-code door at
     * the composition root, and only for the orders HER index names.
     *
     * BUILT FIELD BY FIELD, and the omissions are the point: her NET —
     * COPIED from the frozen Quote, never recomputed (Ten Laws #1/#2) — and
     * no other franc. No base price, no commission, no gross earnings (SP-I04
     * / SP-I12: net first, gross-first prohibited, commission
     * unrepresentable), no buyer contact (founder-only, BC-1a), no supplier
     * identity, no quote bytes, no payment attempts, no provider refs.
     *
     * THE STATE IS THE ORDER'S OWN, unembellished: `payment_pending`,
     * `payment_failed` or `confirmed`. This object will not invent a
     * preparation or a delivery it cannot prove.
     *
     * `claimedBy` is checked here as DEFENCE IN DEPTH: her index already
     * scopes the fan-out, but an order that does not name her as its
     * attributed reseller answers `not_yours` rather than a projection.
     */
    if (request.method === 'GET' && pathname.startsWith('/entry/reseller/')) {
      const claimedBy = decodeURIComponent(pathname.slice('/entry/reseller/'.length));
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: true, exists: false });
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) {
        return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
      }
      if (quote.attributionResellerId !== claimedBy) {
        return Response.json({ ok: false, reason: 'not_yours' }, { status: 404 });
      }
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, log);
      const prep = (await this.state.storage.get<PreparationRecord>(PREPARATION_KEY)) ?? {};
      return Response.json({
        ok: true,
        exists: true,
        orderId: origin.orderId,
        state: spine.journey.state,
        createdAt: origin.createdAt,
        // HER NET, copied off the immutable Quote. The one figure on this wire.
        resellerNet: quote.resellerNet,
        productVersionId: origin.fulfillment?.productVersionId ?? '',
        zoneTo: origin.fulfillment?.zoneTo ?? '',
        /**
         * READINESS-RETURN-1c — the preparation facts, each present ONLY once
         * Boutik+ has actually said so. Absent means « not yet », never
         * « no »: a missing key is how her screen knows to say the step has
         * not happened rather than inventing that it has. Instants only — the
         * supplier's identity, his challenge and his photo stay in Boutik+.
         */
        ...(prep.acceptedAt !== undefined ? { acceptedAt: prep.acceptedAt } : {}),
        ...(prep.readyAt !== undefined ? { readyAt: prep.readyAt } : {}),
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

    /**
     * SP4.2a — THE DOOR LEG'S WEBHOOK. A SEPARATE PATH FROM THE CHECKOUT ONE,
     * for the same reason the input kind is separate: which leg a payment funds
     * is decided by the ROUTE the provider posted to, never by reading the
     * payload and guessing. Two legs, two paths, two vault methods.
     */
    /**
     * SP4.2a-bis — SHE ASKS US TO COLLECT THE PRODUCT LEG, at her door, after
     * she has opened the package. The route above CONFIRMS a door payment; this
     * one STARTS it, and until it existed the Option-B loop had no closing half.
     */
    if (request.method === 'POST' && pathname === '/entry/door-charge') {
      let args: { holderRef?: string; commandId?: string };
      try {
        args = (await request.json()) as { holderRef?: string; commandId?: string };
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      if (
        typeof args.holderRef !== 'string' || args.holderRef === '' ||
        typeof args.commandId !== 'string' || args.commandId === ''
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.startDoorCharge(args.holderRef, args.commandId);
    }

    if (request.method === 'POST' && pathname === '/entry/door-webhook') {
      let body: { event?: unknown };
      try {
        body = (await request.json()) as { event?: unknown };
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.onDoorProviderEvent(body.event);
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
   *
   * ═══ AUTHORIZATION RUNS BEFORE THE CACHE IS SERVED (verifier finding 4) ═══
   *
   * The cache lookup used to come first, so a stranger replaying the owner's
   * command id under a WRONG `holderRef` was handed the cached answer with a
   * 200, while the same wrong holder under a different command id was correctly
   * refused 409. Nothing leaks TODAY — the cached payload is the same projection
   * the public GET already serves — but « who is asking » must be settled before
   * anything is served, or the day that answer grows (SP3.3b) the leak arrives
   * with it. Prove the hold first; only then replay.
   */
  private async create(
    quoteId: string,
    holderRef: string,
    commandId: string,
    wireQuoteBytes: string | undefined,
    wireFulfillment?: { productVersionId?: string; zoneTo?: string; offerVersion?: string },
    contact: BuyerContact | null = null,
  ): Promise<Response> {
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

    // AUTHORIZED. Now — and only now — a replayed command replays its answer.
    // OWN PROPERTY ONLY: a bare `results[commandId]` walks the prototype chain,
    // so `constructor` or `toString` returned a function, serialised to an
    // unparseable body, and pinned that command id to a permanent failure
    // (verifier finding 5). Availability, not money — and closed anyway.
    const results = (await this.state.storage.get<Record<string, unknown>>(RESULTS_KEY)) ?? {};
    if (Object.prototype.hasOwnProperty.call(results, commandId)) {
      return Response.json(results[commandId]);
    }
    const quote = decision.quote;
    const leg = checkoutLegOf(decision.legs);
    if (leg === undefined) {
      // Unreachable: every mode derives a checkout leg. Named rather than thrown.
      return Response.json({ ok: false, reason: 'quote_split_incoherent' }, { status: 422 });
    }

    const orderId = orderIdForQuote(quoteId);
    const now = new Date().toISOString();

    /**
     * ═══ ONE PROVIDER KEY PER LEG, MINTED ONCE, FOREVER (verifier BLOCKER) ═══
     *
     * The audit attempt id below is minted fresh on every attempt because the
     * state machine demands it. THE PROVIDER KEY IS NOT THAT ID: it belongs to
     * the (order, legType) pair, it is read from durable storage here, and it is
     * minted only when this leg has never been charged. After an `initiateCharge`
     * TIMEOUT — the canonically ambiguous case, where the money may already have
     * moved — a retry under a fresh key would be a second collection no provider
     * could dedupe: the buyer debited twice, one leg recorded, no alert and no
     * refund path. Reusing the key is the certified mock's own documented
     * contract, and it is also what makes the late webhook for the first charge
     * arrive with the SAME `command_id` and be ABSORBED rather than lost.
     *
     * ⏳ OPEN DECISION, NOT MINE TO CLOSE: whether a DEFINITELY-REJECTED charge
     * (as opposed to an ambiguous timeout) may be retried under a FRESH key is
     * aggregator semantics, and the aggregator — with the BCEAO perimeter, the
     * two-leg/refund fees and auth/capture — is an open Decision in Build Spec
     * §12, settled at the Real-Money Gate. No rejection-specific policy is
     * modelled here: the documented safest default, one stable key per leg,
     * applies to every retry regardless of why the previous one failed.
     */
    const legKeys = (await this.state.storage.get<Record<string, string>>(LEG_KEYS_KEY)) ?? {};
    const existingKey = Object.prototype.hasOwnProperty.call(legKeys, leg.legType)
      ? legKeys[leg.legType]
      : undefined;
    const providerKey = existingKey ?? mintProviderLegKey();

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
        // ORDER-PAID-WIRE-1b — stored ONLY when all three facts arrived intact
        // from the internal wire. A partial record is worse than none: the
        // outbox's `unsendable_missing_fields` is an honest state, a payload
        // with a guessed zone is not.
        ...(typeof wireFulfillment?.productVersionId === 'string' &&
        wireFulfillment.productVersionId !== '' &&
        typeof wireFulfillment.zoneTo === 'string' &&
        wireFulfillment.zoneTo !== '' &&
        typeof wireFulfillment.offerVersion === 'string' &&
        wireFulfillment.offerVersion !== ''
          ? {
              fulfillment: {
                productVersionId: wireFulfillment.productVersionId,
                zoneTo: wireFulfillment.zoneTo,
                offerVersion: wireFulfillment.offerVersion,
              },
            }
          : {}),
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
      attempts = [{ attemptId, providerKey, requestedAt: now, amount: leg.amount, outcome: 'pending' }];
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
      attempts = [
        ...existingAttempts,
        { attemptId, providerKey, requestedAt: now, amount: leg.amount, outcome: 'pending' },
      ];
    }

    // THE ATTEMPT AND ITS PROVIDER KEY ARE DURABLE BEFORE THE PROVIDER IS CALLED.
    // If this process dies mid-charge, both survive: the attempt can never be
    // charged again, and the retry that follows reuses the SAME key rather than
    // minting a second collection for one leg.
    await this.state.storage.put(ORIGIN_KEY, stored);
    await this.state.storage.put(LOG_KEY, log);
    await this.state.storage.put(ATTEMPTS_KEY, attempts);
    await this.state.storage.put(LEG_KEYS_KEY, { ...legKeys, [leg.legType]: providerKey });
    // BC-1a — the dispatch contact rides the same durable moment as the order
    // itself. Reached only by create()'s two MUTATING branches, so it is
    // replaceable until the payment confirms and frozen after (see
    // BuyerContact). An absent contact never erases a stored one: the retry
    // that omits it (an old client) keeps what the buyer already gave.
    if (contact !== null) await this.state.storage.put(CONTACT_KEY, contact);

    /**
     * ═══ THE ORDERING IS STRUCTURAL, NOT A COMMENT (verifier finding, round 2) ═══
     *
     * The paragraph above claimed the key is durable before the provider is
     * called — and moving that `put` to AFTER the charge passed the entire
     * suite, because no test can observe an ordering without a crash between the
     * two. So the key handed to the provider is no longer the one in this
     * variable: it is the one STORAGE ANSWERS WITH. A charge cannot go out under
     * a key that was not committed first, because the code cannot obtain such a
     * key to charge with.
     *
     * WHAT THIS PROVES, EXACTLY, so nobody reads more into it: the value is in
     * this object's storage — the same write workerd's output gate flushes
     * before any response leaves — at the moment the provider is called. It does
     * not (and cannot) prove a disk fsync. A missing key ENDS THE ATTEMPT by
     * name — it does not charge under an uncommitted key: ending the attempt
     * costs the buyer one ordinary retry (the order moves to `payment_failed`,
     * which is the state her retry needs), while the alternative costs her a
     * second collection nobody can dedupe.
     *
     * NOTHING WAS CHARGED on this path — the refusal is BEFORE the provider call
     * — so `payment_pending` would have been simply false, quite apart from
     * being inescapable. See `chargeFaultInput` for why the recorded canon
     * reason is imprecise and why a fourth value is a founder decision.
     */
    const durableLegKeys = (await this.state.storage.get<Record<string, string>>(LEG_KEYS_KEY)) ?? {};
    const durableKey = Object.prototype.hasOwnProperty.call(durableLegKeys, leg.legType)
      ? durableLegKeys[leg.legType]
      : undefined;
    if (durableKey === undefined || durableKey !== providerKey) {
      return this.endAttemptOnFault(quote, stored, log, attemptId, 'leg_key_not_durable');
    }

    const charge = await this.charge({
      orderId: stored.orderId,
      // THE LEG'S KEY AS STORAGE HOLDS IT — not this attempt's id, and not a
      // value that exists only in memory.
      providerKey: durableKey,
      // READ VERBATIM off the immutable Quote, through the mode's own leg.
      amount: leg.amount,
      correlationId: stored.correlationId,
      requestedAtIso: now,
      attemptsAlreadyInitiated: attempts.length - 1,
      legType: 'checkout',
    });

    /**
     * THE PORT WAS ASKED FOR THE LEG'S AMOUNT, OR NO AMOUNT IS RECORDED. The
     * echo and the leg are COMPARED (`acceptChargeForLeg`), and a disagreement
     * is a refusal: neither figure is written down, because trusting the echo
     * records a charge the mode never authorised and trusting the leg records a
     * number the provider never saw.
     *
     * THE ATTEMPT ENDS — it does not hang. This fires AFTER the charge has gone
     * out, so if the provider collected the amount it echoed, no webhook could
     * ever match this order's leg: leaving it `payment_pending` meant her money
     * sat there with no order, no refund trigger and no reconciliation case,
     * and no command she could send would move it. Ending the attempt gives her
     * the ordinary retry — under the SAME leg key, so the retry cannot
     * double-collect and a webhook for the original charge still confirms — and
     * lets the E2 reservation-release rule, which keys on payment failure, fire
     * at all. See `chargeFaultInput` for the ⏳ imprecision of the canon reason.
     */
    const accepted = acceptChargeForLeg(leg, charge.chargedAmount);
    if (!accepted.ok) {
      return this.endAttemptOnFault(quote, stored, log, attemptId, accepted.reason);
    }

    const record = attempts[attempts.length - 1] as AttemptRecord;
    // THE ACCEPTED ECHO — the amount the provider was demonstrably asked for.
    record.amount = accepted.amount;
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

    // ONE REBUILD, READ TWICE. The journey state and the door leg must describe
    // the SAME replay — rebuilding a second spine for the second field is how
    // two fields of one view end up disagreeing about one order.
    const walked = rebuildOrderSpine(quote, stored, log);
    const view = toBuyerOrderView({
      orderId: stored.orderId,
      state: walked.journey.state,
      quote,
      doorLeg: walked.doorLegState,
    });
    const answer = { ok: true, view };
    await this.state.storage.put(RESULTS_KEY, { ...results, [commandId]: answer });
    return Response.json(answer);
  }

  /**
   * END THE ATTEMPT ON A DEFENCE-IN-DEPTH FAULT — the ONE exit both faults need.
   *
   * The order is already persisted at `payment_pending` with a pending attempt
   * by the time either fault can be raised, and `payment_pending` is a state
   * only a webhook or a failure can leave. So the attempt is ENDED through the
   * vault's own `failPayment` edge, which is what the buyer's retry, and the E2
   * reservation-release rule, both key on. The refusal is still returned BY NAME
   * — the buyer is told what went wrong, not merely that something did.
   *
   * If the vault refuses the transition (a state where failing is not legal),
   * nothing is persisted and the refusal still goes back: a fault handler may
   * not invent a journey the machine would not accept.
   */
  private async endAttemptOnFault(
    quote: Quote,
    stored: StoredOrigin,
    log: readonly OrderInput[],
    attemptId: string,
    fault: ChargeFault,
  ): Promise<Response> {
    const ended = chargeFaultInput({
      fault,
      attemptId,
      actor: ORDER_ACTOR,
      serverTime: new Date().toISOString(),
    });
    const next = [...log, ended];
    if (rebuildOrderSpine(quote, stored, next).journey.state === 'payment_failed') {
      await this.state.storage.put(LOG_KEY, next);
    }
    return Response.json({ ok: false, reason: fault }, { status: 422 });
  }

  /** The provider seam, wired to the ONE implementation this slice has. */
  private charge(args: {
    orderId: string;
    providerKey: string;
    amount: number;
    correlationId: string;
    requestedAtIso: string;
    attemptsAlreadyInitiated: number;
    /** WHICH LEG. Required, never defaulted — see `ChargeCommand.legType`. */
    legType: 'checkout' | 'door';
  }): Promise<ChargeOutcome> {
    const provider = sandboxPaymentProvider(
      readSandboxBehavior(this.env.PAYMENT_SANDBOX_BEHAVIOR),
      args.attemptsAlreadyInitiated,
    );
    return provider.initiateCharge({
      orderId: args.orderId,
      // The LEG's idempotency key — stable across every retry of this leg.
      paymentAttemptId: args.providerKey,
      amount: args.amount,
      correlationId: args.correlationId,
      requestedAtIso: args.requestedAtIso,
      legType: args.legType,
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
  /**
   * ═══ ORDER-PAID-WIRE-1b — THE DELIVERY LOOP, OWNED ENTIRELY BY THE ALARM ═══
   *
   * One code path for first attempt and every retry, so there is no inline
   * half that behaves differently from the recovery half. Backoff doubles from
   * one minute and caps at one hour, FOREVER: at-least-once means the signal
   * outlives any boutik outage, an unset secret (401s retry too — the backlog
   * drains the moment the founder sets it), and any process death (the alarm is
   * durable). What counts as delivered is the intake's 2xx and NOTHING ELSE.
   *
   * THE `.catch` HERE IS LOAD-BEARING, unlike the checkout supply read's: a
   * service binding fetch CAN reject (boutik down), and an uncaught rejection
   * in an alarm handler would burn the alarm without rescheduling it.
   */
  async alarm(): Promise<void> {
    // SE-LIVE-2a — TWO destinations, ONE alarm, INDEPENDENT fates. Each wire
    // keeps its own status and attempt count, so boutik being down can never
    // hold Séra's fact back (or the reverse), and a delivered wire is never
    // re-sent. The alarm re-arms while EITHER is still pending, on the
    // higher of the two attempt counts' backoffs — the retry cadence of the
    // wire that is actually still failing.
    const boutikPending = await this.flushBoutikOutbox();
    const seraPending = await this.flushSeraOutbox();
    const stillPending = Math.max(boutikPending, seraPending);
    if (stillPending > 0) {
      await this.state.storage.setAlarm(Date.now() + outboxBackoffMs(stillPending));
    }
  }

  /** Returns the attempt count if still pending after this try, else 0. */
  private async flushBoutikOutbox(): Promise<number> {
    const outbox = await this.state.storage.get<{
      status: 'pending' | 'delivered' | 'unsendable';
      event?: unknown;
      attempts: number;
      deliveredAt?: string;
    }>(OUTBOX_KEY);
    if (outbox === undefined || outbox.status !== 'pending' || outbox.event === undefined) return 0;

    let delivered = false;
    if (this.env.OFFER !== undefined) {
      const res = await this.env.OFFER.fetch(
        new Request('https://offer/fulfillment/order-confirmed', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.env.FULFILLMENT_WRITE_SECRET !== undefined && this.env.FULFILLMENT_WRITE_SECRET !== ''
              ? { Authorization: `Bearer ${this.env.FULFILLMENT_WRITE_SECRET}` }
              : {}),
          },
          body: JSON.stringify(outbox.event),
        }),
      ).catch(() => undefined);
      delivered = res !== undefined && res.ok;
    }

    if (delivered) {
      await this.state.storage.put(OUTBOX_KEY, {
        ...outbox,
        status: 'delivered',
        attempts: outbox.attempts + 1,
        deliveredAt: new Date().toISOString(),
      });
      return 0;
    }
    const attempts = outbox.attempts + 1;
    await this.state.storage.put(OUTBOX_KEY, { ...outbox, attempts });
    return attempts;
  }

  /**
   * SE-LIVE-2a — the funding fact to Séra's intake door. Delivered means the
   * door answered 2xx and NOTHING else: a 401 (secret not yet set) and a 422
   * (Séra refused the fact) both retry, exactly like the boutik wire, because
   * an undelivered dispatch signal must outlive any outage or misconfiguration.
   * With the base or the secret unset nothing is even attempted — the fact
   * stays pending and drains when configuration arrives.
   */
  private async flushSeraOutbox(): Promise<number> {
    const outbox = await this.state.storage.get<{
      status: 'pending' | 'delivered';
      fact?: { orderId: string; status: string; paymentMode: string; asOf: string };
      attempts: number;
      deliveredAt?: string;
    }>(SERA_OUTBOX_KEY);
    if (outbox === undefined || outbox.status !== 'pending' || outbox.fact === undefined) return 0;

    const base = (this.env.SERA_INTAKE_BASE ?? '').replace(/\/+$/, '');
    const secret = this.env.SERA_INTAKE_SECRET ?? '';
    let delivered = false;
    if (base !== '' && secret !== '') {
      const res = await fetch(`${base}/intake/funding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify(outbox.fact),
      }).catch(() => undefined);
      delivered = res !== undefined && res.ok;
    }

    if (delivered) {
      await this.state.storage.put(SERA_OUTBOX_KEY, {
        ...outbox,
        status: 'delivered',
        attempts: outbox.attempts + 1,
        deliveredAt: new Date().toISOString(),
      });
      return 0;
    }
    const attempts = outbox.attempts + 1;
    await this.state.storage.put(SERA_OUTBOX_KEY, { ...outbox, attempts });
    return attempts;
  }

  private async onProviderEvent(event: unknown): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    /**
     * ⚠ CARRIED, NOT CLOSED (verifier note, round 2 — for the provider decision):
     * a webhook arriving BEFORE the order exists answers 404, and a provider that
     * treats 404 as NON-RETRYABLE would silently drop a valid confirmation. The
     * right answer (retryable 409? park-and-replay? a reconciliation case?) is
     * aggregator-shaped and belongs with the open aggregator Decision at the
     * Real-Money Gate, so it is named here rather than guessed at now.
     */
    if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    const quote = parseStoredQuote(origin.quoteBytes);
    if (quote === undefined) {
      return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
    }
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = rebuildOrderSpine(quote, origin, log);

    // A SIGNED event's envelope fields are still UNBOUNDED strings (canon's
    // envelope schema is `.min(1)` only), and `command_id` is about to be
    // embedded in a durable log entry, the outbox, and the cross-app wire
    // (verifier MINOR). A multi-megabyte value is not a payment truth anyone
    // emits honestly — refuse it BY NAME before anything is applied or stored.
    // 1024 is generous beyond any real aggregator's id.
    {
      const probe = PlatformEventSchema.safeParse(event);
      if (probe.success && probe.data.envelope.command_id.length > 1024) {
        return Response.json({ ok: false, reason: 'envelope_field_too_long' }, { status: 422 });
      }
    }
    const outcome = applyOrderInput(spine, { kind: 'provider', event });
    if (!outcome.applied) {
      return Response.json({ ok: false, reason: outcome.reason }, { status: statusForWebhook(outcome.reason) });
    }
    if (outcome.duplicate) {
      // ABSORBED. Nothing appended, nothing charged, nothing moved — but if a
      // PENDING outbox has lost its alarm (the narrow crash window between the
      // batch put and `setAlarm`, or an alarm-scheduling throw), this redelivery
      // is the recovery hook that re-arms it (verifier MINOR: belt-and-braces
      // so at-least-once never rests on write-coalescing subtleties alone).
      // SE-LIVE-2a: the recovery hook now covers BOTH wires — a stranded Séra
      // funding fact is exactly as unrecoverable as a stranded boutik event.
      const stranded = await this.state.storage.get<{ status?: string }>(OUTBOX_KEY);
      const strandedSera = await this.state.storage.get<{ status?: string }>(SERA_OUTBOX_KEY);
      if (
        (stranded?.status === 'pending' || strandedSera?.status === 'pending') &&
        (await this.state.storage.getAlarm()) === null
      ) {
        await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
      }
      /**
       * RF-1a (verifier B2) — AND THE SAME REDELIVERY REPAIRS HER FEED. The
       * first cut registered her row ONLY inside the first-confirmation
       * branch below, then claimed in a comment that « the next confirmation
       * re-registers it ». That was FALSE: this early return means a
       * redelivered webhook never reaches that branch, so a row lost to a
       * transient binding failure was lost FOREVER — her feed silently
       * missing a real, paid sale that the founder's board still showed.
       * Registration is first-wins, so re-firing it here costs nothing and
       * makes the self-heal real rather than asserted.
       */
      if (spine.journey.state === 'confirmed') {
        await this.registerForReseller(quote.attributionResellerId, origin.orderId);
      }
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
      // THIS WORKER'S OWN CLOCK, not the provider's claim (verifier MAJOR,
      // ORDER-PAID-WIRE-1b). The canon pin says `paidAt` is « the CONFIRMED
      // transition's server time » — and the first cut stamped the WEBHOOK's
      // `serverTime` here instead, a value the secret-holder writes freely and
      // canon's timestamp type barely checks. The provider's claimed time still
      // exists, untouched, inside the provider event in the log; what starts
      // boutik's first-wins preparation clock is the one instant this object
      // observed the confirmation itself.
      serverTime: new Date().toISOString(),
    };
    const confirmed = applyOrderInput(spine, confirm);
    if (confirmed.applied) next = [...next, confirm];
    if (confirmed.applied && (await this.state.storage.get(OUTBOX_KEY)) === undefined) {
      // COMPOSE THROUGH CANON before anything is stored: the event below IS
      // `OrderConfirmedEventSchema.parse`'s output, so a banned field cannot be
      // in it (the canon verifier named the producer-skips-the-schema gap; this
      // producer cannot skip it). `unsendable` outcomes are STORED, visibly —
      // an operator can see them; nothing retries what can never send.
      const composition = composeOrderConfirmedEvent(origin, quote, confirm, next.length);
      const outbox = composition.ok
        ? { status: 'pending' as const, event: composition.event, attempts: 0 }
        : { status: 'unsendable' as const, reason: composition.reason, attempts: 0 };
      /**
       * SE-LIVE-2a — the SAME transition arms Séra's funding fact. It carries
       * the order, the payment mode, and the instant THIS object observed the
       * confirmation (`confirm.serverTime` — the same clock that starts
       * boutik's preparation, never the provider's claimed time). NO AMOUNT:
       * Séra's gate asks « funded per mode? », never « how much? » (SE-I09 —
       * Séra never computes proceeds). Stored in the same batch as the log, so
       * a confirmation and its two outboxes are one durable fact.
       */
      const seraOutbox = {
        status: 'pending' as const,
        fact: {
          orderId: origin.orderId,
          status: 'funded' as const,
          paymentMode: quote.paymentMode,
          asOf: confirm.serverTime,
        },
        attempts: 0,
      };
      await this.state.storage.put({ [LOG_KEY]: next, [OUTBOX_KEY]: outbox, [SERA_OUTBOX_KEY]: seraOutbox });
      // A scheduling throw must never 500 a confirmation that is already
      // durably stored (verifier MINOR); the duplicate-webhook re-arm above is
      // the recovery for an outbox left pending without an alarm.
      // SE-LIVE-2a: armed for EITHER wire — Séra's fact is always pending at
      // this point, so an unsendable boutik composition must no longer leave
      // the alarm unset (it would strand the funding fact forever).
      await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
    } else {
      await this.state.storage.put(LOG_KEY, next);
    }
    /**
     * RF-1a — HER FEED LEARNS AT THE SAME INSTANT BOUTIK+ DOES. The sale
     * becomes true here, so it enters her index here — never earlier (an
     * unpaid order is not a sale) and never from a screen's guess.
     *
     * OUTSIDE the outbox branch on purpose (verifier B2): that branch runs
     * only for the FIRST confirmation of an order, so registering inside it
     * made a lost row unrecoverable. Here it fires on every applied
     * confirmation, and the duplicate path above fires on every redelivery —
     * which is what makes the self-heal real. BEST-EFFORT AND SWALLOWED: a
     * confirmation already durably stored must never be 500'd by an index
     * write, and the buyer's money path must never depend on a reseller's
     * convenience.
     */
    if (confirmed.applied) {
      await this.registerForReseller(quote.attributionResellerId, origin.orderId);
    }
    return Response.json({ ok: true, status: 'applied', state: spine.journey.state });
  }

  /** RF-1a — put the confirmed sale in its reseller's index. Every failure is
   *  swallowed: see the call site for why a confirmation may never depend on
   *  it. An unattributed order (no reseller on the quote) registers nothing. */
  private async registerForReseller(resellerId: string, orderId: string): Promise<void> {
    try {
      const ns = this.env.RESELLER;
      if (ns === undefined || typeof resellerId !== 'string' || resellerId === '') return;
      await ns.get(ns.idFromName(RESELLER_FEED_NAME)).fetch(
        new Request('https://do/register', {
          method: 'POST',
          body: JSON.stringify({ resellerId, orderId }),
        }),
      );
    } catch {
      // the sale is already durably confirmed; her feed self-heals on the
      // next confirmation for this order (the row write is first-wins)
    }
  }

  /**
   * ═══ SP4.2a-bis — ASK THE PROVIDER TO COLLECT THE PRODUCT LEG ═══
   *
   * §5.5: « Option B: … product paid by MoMo **at the door before custody
   * transfer**; **not COD** ». This is the call that makes « paid by MoMo »
   * possible; before it, nothing in this repo could ask for that money.
   *
   * ═══ WHAT IT DOES NOT DO, AND THE CODE SAYS SO STRUCTURALLY ═══
   *
   * IT MOVES NO STATE. Not one line below appends to the input log, and there is
   * no branch in which the door leg becomes `paid`. An accepted charge means a
   * charge was INITIATED — Ten Laws #2 — and the only thing that can mark the
   * leg paid is a signed `payment.door_leg_confirmed.v1` on the route above.
   * The buyer view it returns still says `due`, deliberately.
   *
   * IT NEVER ENDS THE ATTEMPT THROUGH `endAttemptOnFault` either, and that is
   * not an oversight: that helper drives the order to `payment_failed`, which on
   * this path would UN-CONFIRM an order whose checkout leg is genuinely funded —
   * turning a failed door collection into a repudiation of money the provider
   * already confirmed. A door charge that faults is a named refusal and nothing
   * more; her retry is an ordinary second call under the SAME leg key.
   *
   * ═══ ONE PROVIDER KEY PER LEG, DURABLE BEFORE THE CALL ═══
   *
   * The identical discipline `create()` documents at length, applied to the door
   * leg's own key: minted once for (order, door), committed to storage FIRST,
   * and the key actually handed to the provider is THE ONE STORAGE ANSWERS WITH
   * — so a charge cannot go out under a key that was not committed, because the
   * code cannot obtain such a key to charge with. After an ambiguous timeout at
   * a doorstep, where the money may already have moved, a second key would be a
   * second collection no provider could dedupe.
   */
  private async startDoorCharge(holderRef: string, commandId: string): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    const quote = parseStoredQuote(origin.quoteBytes);
    const receipt = await this.state.storage.get<ReservationReceipt>(RECEIPT_KEY);
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = quote === undefined ? undefined : rebuildOrderSpine(quote, origin, log);

    const decision = decideDoorCharge({
      quote,
      holderRef,
      ...(receipt !== undefined ? { receipt } : { receipt: undefined }),
      orderState: spine?.journey.state ?? '',
      doorLegState: spine?.doorLegState ?? 'none',
    });
    if (!decision.ok) {
      return Response.json({ ok: false, reason: decision.reason }, { status: 422 });
    }

    // AUTHORIZED. Only now may a replayed command replay its answer — the same
    // ordering `create()` uses, and for the same reason: a refusal must be
    // re-decided every time, never served from a cache.
    const results = (await this.state.storage.get<Record<string, unknown>>(DOOR_RESULTS_KEY)) ?? {};
    if (Object.prototype.hasOwnProperty.call(results, commandId)) {
      return Response.json(results[commandId]);
    }

    const legKeys = (await this.state.storage.get<Record<string, string>>(LEG_KEYS_KEY)) ?? {};
    const existingKey = Object.prototype.hasOwnProperty.call(legKeys, 'door') ? legKeys['door'] : undefined;
    const providerKey = existingKey ?? mintProviderLegKey();
    const now = new Date().toISOString();
    const attempts = (await this.state.storage.get<AttemptRecord[]>(DOOR_ATTEMPTS_KEY)) ?? [];
    const attemptId = mintPaymentAttemptId();
    const record: AttemptRecord = {
      attemptId,
      providerKey,
      requestedAt: now,
      amount: decision.leg.amount,
      outcome: 'pending',
    };
    // DURABLE BEFORE THE PROVIDER IS CALLED, both of them.
    await this.state.storage.put(LEG_KEYS_KEY, { ...legKeys, door: providerKey });
    await this.state.storage.put(DOOR_ATTEMPTS_KEY, [...attempts, record]);

    // THE KEY AS STORAGE HOLDS IT — not the one in the variable above.
    const durableLegKeys = (await this.state.storage.get<Record<string, string>>(LEG_KEYS_KEY)) ?? {};
    const durableKey = Object.prototype.hasOwnProperty.call(durableLegKeys, 'door')
      ? durableLegKeys['door']
      : undefined;
    if (durableKey === undefined || durableKey !== providerKey) {
      return Response.json({ ok: false, reason: 'leg_key_not_durable' }, { status: 422 });
    }

    const charge = await this.charge({
      orderId: origin.orderId,
      providerKey: durableKey,
      // READ VERBATIM off the immutable Quote, through the DOOR leg.
      amount: decision.leg.amount,
      correlationId: origin.correlationId,
      requestedAtIso: now,
      attemptsAlreadyInitiated: attempts.length,
      legType: 'door',
    });

    // THE ECHO AND THE LEG ARE COMPARED. A divergence records neither figure:
    // trusting the echo records a charge the mode never authorised, trusting the
    // leg records a number the provider never saw.
    const accepted = acceptChargeForLeg(decision.leg, charge.chargedAmount);
    if (!accepted.ok) {
      return Response.json({ ok: false, reason: accepted.reason }, { status: 422 });
    }
    // THE ACCEPTED ECHO — the amount the provider was demonstrably asked for.
    const settled: AttemptRecord = charge.accepted
      ? { ...record, amount: accepted.amount, outcome: 'accepted', collectRef: charge.collectRef }
      : { ...record, amount: accepted.amount, outcome: charge.reason };
    await this.state.storage.put(DOOR_ATTEMPTS_KEY, [...attempts, settled]);

    if (!charge.accepted) {
      // The provider did not take it. NOTHING moved — and in particular the
      // order is still `confirmed` and the door leg still `due`, which is
      // exactly the state her retry needs.
      return Response.json({ ok: false, reason: charge.reason }, { status: 422 });
    }

    // ACCEPTED IS NOT PAID. The view below still says `due`, and it will say
    // `due` until a signed webhook says otherwise.
    const view = toBuyerOrderView({
      orderId: origin.orderId,
      state: spine!.journey.state,
      quote: quote!,
      doorLeg: spine!.doorLegState,
    });
    const answer = { ok: true, view };
    await this.state.storage.put(DOOR_RESULTS_KEY, { ...results, [commandId]: answer });
    return Response.json(answer);
  }

  /**
   * ═══ SP4.2a — THE DOOR LEG, CONFIRMED BY THE PROVIDER AND BY NOTHING ELSE ═══
   *
   * §5.5: « Option B: … product paid by MoMo **at the door before custody
   * transfer**; **not COD** ». §6.3: « the buyer enters the drop code last,
   * **after** any door payment is provider-confirmed. » Ten Laws #3: custody
   * transfers only after provider-confirmed payment of every due leg.
   *
   * WHAT THIS METHOD IS NOT ALLOWED TO BE, said plainly: a place where a rider's
   * tap, a buyer's tap, or a screenshot can mark the product leg paid. It takes
   * a signed provider event and hands it to the vault, which refuses it unless
   * the correlation matches, the command is new, the door leg is actually
   * `due`, the amount is FRANC-EXACT against the immutable Quote's
   * `amountDueAtDelivery`, and the status is genuinely funded. Nothing here
   * relaxes any of that and nothing here adds an amount.
   *
   * IT WRITES THE INPUT TO THE DURABLE LOG, so the door leg's state survives a
   * process death by REPLAY rather than by a second stored flag that could
   * disagree with the spine.
   */
  private async onDoorProviderEvent(event: unknown): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    // Same ⚠ as the checkout webhook, carried not closed: a door confirmation
    // arriving before the order exists answers 404, and whether a provider
    // should retry that is aggregator-shaped (open Decision, Real-Money Gate).
    if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    const quote = parseStoredQuote(origin.quoteBytes);
    if (quote === undefined) {
      return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
    }
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = rebuildOrderSpine(quote, origin, log);

    const input: OrderInput = { kind: 'door_provider', event };
    const outcome = applyOrderInput(spine, input);
    if (!outcome.applied) {
      return Response.json({ ok: false, reason: outcome.reason }, { status: statusForWebhook(outcome.reason) });
    }
    if (outcome.duplicate) {
      // ABSORBED. Nothing appended, nothing charged, nothing moved — and the
      // door leg reads exactly as it did before the redelivery.
      return Response.json({ ok: true, status: 'duplicate', doorLeg: spine.doorLegState });
    }
    await this.state.storage.put(LOG_KEY, [...log, input]);
    return Response.json({ ok: true, status: 'applied', doorLeg: spine.doorLegState });
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
    // SP4.2a — the door leg's state comes off the REBUILT SPINE, so it is the
    // vault's own answer replayed from the durable log, not a field this object
    // maintains beside it. One source, and a process death changes nothing.
    return toBuyerOrderView({
      orderId: origin.orderId,
      state: spine.journey.state,
      quote,
      doorLeg: spine.doorLegState,
    });
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

/**
 * THE LEG'S PROVIDER IDEMPOTENCY KEY, from the same OS CSPRNG and under a
 * DELIBERATELY DIFFERENT PREFIX. `att-` is an audit id and `pk-` is a payment
 * key; they are different things with different lifetimes, and after a live
 * conflation of exactly these two, a reader of any log or record must be able to
 * tell them apart at a glance.
 */
function mintProviderLegKey(): string {
  return `pk-${crypto.randomUUID()}`;
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
  /**
   * SP6.3 — the §6.4 ladder book, read-only from here. OPTIONAL: an
   * unconfigured Worker has no binding, and `lireEligibilite` answers
   * `undefined`, which this route treats as « cannot prove the buyer rung » and
   * refuses the DOOR MODE only. A full-prepay order never consults it.
   */
  LADDER?: DurableObjectNamespace;
}

const orderStub = (env: Env, orderId: string): DurableObjectStub =>
  env.ORDER.get(env.ORDER.idFromName(orderId));

/** The wire vocabulary a caller may send. Anything else is REFUSED, not ignored. */
const ORDER_FIELDS = ['quoteId', 'holderRef', 'commandId', 'contact'];
/** SP4.2a-bis — the door charge's own two-key allowlist. NO amount field. */
const DOOR_CHARGE_FIELDS = ['holderRef', 'commandId'];

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
 *   POST /checkout/order                    create from a RESERVED quote (public)
 *   GET  /checkout/order/:id                the buyer view of an order (public)
 *   POST /checkout/order/:id/door-charge    SP4.2a-bis — the buyer asks for the
 *                                           product leg to be collected at her
 *                                           door (public; it CANNOT declare that
 *                                           money arrived)
 *   POST /checkout/webhook/payment          the provider's confirmation of the
 *                                           CHECKOUT leg (SECRET-GATED at the
 *                                           composition root, before dispatch)
 *   POST /checkout/webhook/door             SP4.2a — …and of the DOOR leg. The
 *                                           only thing that can mark it paid.
 *                                           (SECRET-GATED, same secret)
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
      /**
       * ═══ WHY TWO OF THESE THREE ARE CHARSET-PINNED AND ONE IS NOT ═══
       * (The asymmetry the verifier asked to have decided and stated.)
       *
       *  · `quoteId` is a DURABLE OBJECT NAME and reaches an internal read —
       *    pinned, as it already was.
       *  · `commandId` is pinned TOO, from this round on: it is embedded into
       *    canon `command_id` envelope fields (`ord-reserved-{id}`) that live in
       *    the audit forever, and it is a key in the durable results map. An
       *    audit identifier a caller can fill with arbitrary bytes is an audit
       *    nobody can read back with confidence.
       *  · `holderRef` is DELIBERATELY length-bounded ONLY. It is never a name,
       *    never a path, never a key — it is compared byte-for-byte against what
       *    the RESERVE route accepted, and that route accepts any bounded
       *    string. Pinning it here would create holds that can be taken and then
       *    never ordered against: a refusal caused by this file disagreeing with
       *    its neighbour about what a holder may be called.
       */
      if (!bounded(body['quoteId'], 191) || !ID_ALPHABET.test(body['quoteId'])) {
        return badRequest('bad_field', 'quoteId');
      }
      if (!bounded(body['holderRef'], 128)) return badRequest('bad_field', 'holderRef');
      if (!bounded(body['commandId'], 128) || !ID_ALPHABET.test(body['commandId'])) {
        return badRequest('bad_field', 'commandId');
      }
      // BC-1a — the buyer's dispatch contact, OPTIONAL and strict when
      // present: exactly {phone, quartier, repere}, bounded, phone and
      // quartier non-empty. Refused HERE with the field named, before any
      // object is touched — a half-formed contact never travels. Still no
      // amount field on this body, and no way to add one.
      let contact: BuyerContact | null = null;
      if (body['contact'] !== undefined && body['contact'] !== null) {
        contact = readBuyerContact(body['contact']);
        if (contact === null) return badRequest('bad_field', 'contact');
      }
      const quoteId = body['quoteId'];

      // THE QUOTE'S OWN BYTES, read server-side from the object that owns them.
      // The caller sends no amount and could not: the value that decides what is
      // charged never touches the wire.
      const quoteRes = await env.CHECKOUT.get(env.CHECKOUT.idFromName(quoteId)).fetch(
        new Request('https://do/entry'),
      );
      const quoteBody = (await quoteRes.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; canonicalBytes?: string; fulfillment?: unknown; quote?: { paymentMode?: unknown } }
        | null;
      if (quoteBody === null) return refuse('quote_unknown');
      if (quoteBody.ok !== true || typeof quoteBody.canonicalBytes !== 'string') {
        return refuse(quoteBody.reason === 'not_found' ? 'quote_unknown' : (quoteBody.reason ?? 'quote_unknown'));
      }

      /**
       * ═══ SP6.3 — THE §6.4 BUYER RUNG, EVALUATED WHERE ITS KEY EXISTS ═══
       *
       * Founder ruling 2026-08-04. §6.1 evaluates the Option-B gate « at
       * quote », and four of its five conditions genuinely are (seller tier,
       * category, price cap, zone — `pay-at-door-policy.ts`). The fifth is
       * about the BUYER, and at quote time this service knows of no buyer:
       * `QuoteRequest` carries nothing that identifies her. Her phone arrives
       * HERE, with the dispatch contact.
       *
       * So the rung is read here — still before any money moves and before any
       * custody, which is what keeps Law #3 untouched. The cost was stated to
       * the founder before he ruled: she chooses the door, fills in her
       * details, and only then may be redirected to full prepayment.
       *
       * FAIL-CLOSED, THREE WAYS, and each is a real state:
       *   · no contact on a door order  — nothing to key on
       *   · a phone that cannot be keyed — `cleAcheteur` returned null
       *   · no ladder binding at all     — an unconfigured Worker
       * All three refuse the DOOR MODE only. A full-prepay order is never
       * touched by any of this: her ladder has no say over money paid up front.
       */
      const doorMode = quoteBody.quote?.paymentMode === DOOR_MODE;
      if (doorMode) {
        // NO CONTACT ON A DOOR ORDER IS ITS OWN REFUSAL, and deliberately not
        // folded into the eligibility one. Two different things are true and a
        // buyer deserves the actionable one: « we need your phone » is a field
        // she can fill, « pay-at-door is not available » is not. Naming them
        // apart also means the eligibility refusal never fires for a reason
        // that has nothing to do with her history.
        //
        // A door delivery with no phone was never deliverable anyway — the
        // rider has no way to reach her — so this refuses something that could
        // not have worked, one step earlier and by name.
        if (contact === null) return refuse('contact_required_for_door');
        const eligibility = await lireEligibilite(env, contact.phone);
        // `undefined` = an unkeyable phone, or no ladder binding at all. Both
        // are « the buyer rung cannot be proved », and §6.1's posture
        // everywhere is that an unprovable condition is a refused condition.
        if (eligibility === undefined) return refuse('pay_at_door_not_eligible');
        const verdict = decideBuyerRung(eligibility, new Date().toISOString());
        if (!verdict.allowed) return refuse('pay_at_door_not_eligible');
      }

      const res = await orderStub(env, orderIdForQuote(quoteId)).fetch(
        new Request('https://do/entry/create', {
          method: 'POST',
          body: JSON.stringify({
            quoteId,
            holderRef: body['holderRef'],
            commandId: body['commandId'],
            quoteBytes: quoteBody.canonicalBytes,
            // ORDER-PAID-WIRE-1b — the fulfillment facts ride the SAME internal
            // hop as the bytes, from the same server-side read. The public body
            // above has no such field: a caller cannot name a product or a zone
            // here any more than an amount.
            fulfillment: quoteBody.fulfillment ?? null,
            // BC-1a — the validated contact, or null. The object re-validates.
            contact,
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

    /**
     * ═══ SP4.2a-bis — THE BUYER ASKS US TO COLLECT THE PRODUCT LEG ═══
     *
     * PUBLIC, on the SAME terms as `POST /checkout/order`: she holds no key, no
     * amount can arrive (the body is a two-key allowlist with no money field),
     * and no economics can leave (the projection is built inside the object).
     * Her claim to the order is the SAME `holderRef` that took the hold and
     * created the order, compared byte-for-byte — a stranger who guessed the
     * order id cannot make her pay, and cannot make himself pay for her.
     *
     * IT IS NOT ON THE WEBHOOK'S SECRET, and that is correct rather than lax:
     * this route cannot declare that money arrived. It asks a provider to
     * collect; the provider answers on the secret-gated webhook. The dangerous
     * capability and the buyer-facing one are on opposite sides of the gate.
     */
    const doorCharge = /^\/checkout\/order\/([^/]+)\/door-charge$/.exec(pathname);
    if (doorCharge && request.method === 'POST') {
      const orderId = decodeId(doorCharge[1]!);
      if (orderId === undefined || !ID_ALPHABET.test(orderId)) return badRequest('bad_field', 'orderId');
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return badRequest('malformed');
      // THE ALLOWLIST IS THE SHAPE — most dangerously, a caller sending an
      // AMOUNT. There is no amount field here for one to land in.
      for (const key of Object.keys(body)) {
        if (!DOOR_CHARGE_FIELDS.includes(key)) return badRequest('unknown_field', key);
      }
      if (!bounded(body['holderRef'], 128)) return badRequest('bad_field', 'holderRef');
      if (!bounded(body['commandId'], 128) || !ID_ALPHABET.test(body['commandId'])) {
        return badRequest('bad_field', 'commandId');
      }
      const res = await orderStub(env, orderId).fetch(
        new Request('https://do/entry/door-charge', {
          method: 'POST',
          body: JSON.stringify({ holderRef: body['holderRef'], commandId: body['commandId'] }),
        }),
      );
      const answered = (await res.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; view?: unknown }
        | null;
      if (answered === null) return refuse('unknown_order');
      // THROUGH `refuse`, so the ONE status map decides — `reservation_held_by_another`
      // is a 409 here exactly as it is on order creation. Passing the object's own
      // status through would have made the same refusal two different codes on two
      // routes, which is how a client ends up with two ways to read one answer.
      if (answered.ok !== true || answered.view === undefined) {
        return refuse(answered.reason ?? 'refused');
      }
      // THE BOUNDARY. Only the object's own projection ever reaches a buyer —
      // and it still says the door leg is `due`, because it is.
      return Response.json(answered.view, { status: 200 });
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

    /**
     * ═══ SP4.2a — THE DOOR LEG'S WEBHOOK: THE SECOND MOST DANGEROUS ROUTE ═══
     *
     * AUTHENTICATED BEFORE IT IS ROUTED, on exactly the same terms and by the
     * same secret as the route above — the composition root refuses an unsigned
     * request with 401 before any dispatch, so this cannot become an existence
     * oracle for order ids either.
     *
     * WHAT AN ATTACKER WHO COULD POST HERE WOULD ACHIEVE: they would assert that
     * the buyer paid for the product at her door. That is the single fact §6.3
     * puts in front of the drop code and Ten Laws #3 puts in front of custody
     * transfer — so a forged event here is a rider walking away with a package
     * nobody paid for, and a buyer holding a code she was told proves payment.
     * The amount is matched TO THE FRANC against the immutable Quote's
     * `amountDueAtDelivery` inside the vault, never trusted from the payload.
     *
     * IT IS A SEPARATE PATH FROM THE CHECKOUT WEBHOOK ON PURPOSE. Which leg a
     * payment funds is decided by where the provider posted, not by inspecting
     * the payload — so a checkout confirmation can never, by any payload shape,
     * mark the door leg paid.
     */
    if (request.method === 'POST' && pathname === '/checkout/webhook/door') {
      const raw = await request.json().catch(() => null);
      const parsed = PlatformEventSchema.safeParse(raw);
      if (!parsed.success) return badRequest('malformed_event');
      const payload = parsed.data.payload as Record<string, unknown>;
      const orderId = payload['order_id'];
      if (!bounded(orderId, 191) || !ID_ALPHABET.test(orderId)) return badRequest('bad_field', 'order_id');

      const res = await orderStub(env, orderId).fetch(
        new Request('https://do/entry/door-webhook', {
          method: 'POST',
          body: JSON.stringify({ event: parsed.data }),
        }),
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; status?: string; doorLeg?: string }
        | null;
      if (body === null) return refuse('unknown_order');
      if (body.ok !== true) {
        return Response.json({ error: body.reason ?? 'refused' }, { status: res.status });
      }
      // The provider learns what happened to ITS event. `doorLeg` is a state,
      // never an amount — the same line the buyer projection holds.
      return Response.json({ status: body.status, doorLeg: body.doorLeg }, { status: 200 });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
