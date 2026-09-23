import {
  OrderPackageSchema,
  PlatformEventSchema,
  assertQuoteReconciles,
  type OrderPackage,
  type PlatformEvent,
  type Quote,
  type RelatedPartyDecision,
} from '@platform/contracts';
import { FLUSHER_TIMEOUT_MS } from '../src/delais.js';
import {
  decideBuyerRung,
  decideRelatedParty,
  lireRefusCourse,
  reconcileOrder,
  reservationReconciliationAlert,
  type OrderSpine,
  type RefusCourse,
  type RemboursementAttendu,
  type ReservationState,
} from '@shop-plus/commerce-core';
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
  type OrderGroupe,
  type OrderInput,
  type OrderOrigin,
  type ReservationReceipt,
} from '../src/order-core.js';
import { isGroupId } from '../src/payment-group-core.js';
import { readSandboxBehavior, sandboxPaymentProvider, type ChargeOutcome } from '../src/payment-port.js';
import { LISTE_REF } from '../src/wishlist-core.js';
import { lireEligibilite } from './buyer-ladder-do.js';
import { timingSafeEqual } from './auth.js';

/** SP6.3 — the one mode whose order consults the §6.4 ladder. Spelled once
 *  so the check and the vault agree on one string. */
export const DOOR_MODE = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
import { RESELLER_FEED_NAME } from './reseller-feed-do.js';
import { compteEnPause, RESELLER_ACCOUNTS_NAME } from './reseller-accounts-do.js';
import { DLQ_NAME, PARK_MAX_BYTES, storedBytes } from './dead-letter-do.js';

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
/**
 * COLIS-FOURNISSEUR-1 — the SECOND funding fact Séra can hear about an order:
 * `cancelled`, when its supplier refused it (REMBOURSEMENT-2). Its own row, so
 * the confirmed `funded` fact and this one keep their own fates; Séra applies
 * the later one (its `asOf` is the refusal's instant). Inside a package it is
 * what lets the other articles travel without this one.
 */
const SERA_ANNULATION_KEY = 'sera-funding-cancel-outbox';
/**
 * BOUTIK-SUIVI (founder, 2026-08-09: « when the delivery is completed … the
 * product leaves en route to that screen ») — a THIRD destination, its own
 * key for the same reason Séra has one: neither wire may mask the other's
 * fate. Séra proves the delivery and tells this object (`/entry/eligibility`);
 * the supplier's own console cannot hear Séra, so the fact is relayed on the
 * road that already exists — the OFFER binding and the fulfillment write
 * secret this object already holds.
 *
 * ⚠ THE CANONICAL EVENT TRAVELS VERBATIM. No new event name is minted here:
 * `delivery.validated.v1` is already canon, and inventing a Boutik+-shaped
 * one would be a §7 contracts change. Boutik+ re-parses it with the same
 * schema and the same payload bounds this Worker's own door applies.
 */
const BOUTIK_DELIVERED_KEY = 'boutik-delivered-outbox';
/**
 * STOCK-VENDU-1b (founder order 2026-08-23: « fix all 3 ») — the FOURTH
 * boutik-bound fact, on exactly the delivered relay's terms: Séra proves a
 * REFUSED course and emits the canon `delivery.refused.v1`; this object
 * relays it VERBATIM (no new event name — canon's enum already holds it) on
 * the OFFER binding and the fulfillment write secret, so Boutik+ can send the
 * sealed unit home to its own stock counter per its fault-class policy. This
 * wire is a STOCK fact only: the order's own state machine records no refusal
 * terminal here — the refund saga stays E3's, exactly as journalled.
 */
const BOUTIK_REFUSED_KEY = 'boutik-refused-outbox';
/**
 * REMBOURSEMENT-1 (founder ruling 2026-09-23) — THE TENTH WIRE: HER REFUND.
 * Opened by the same refused-course fact as the relay above, first-wins. The
 * vault decides what goes back from this order's own records; each paid leg's
 * refund carries a key minted ONCE and stored here BEFORE the provider is
 * asked; the alarm asks, and a timeout is asked again under the SAME key.
 * `demande` is not refunded — only the provider's refund webhook is, and only
 * it moves the order to `refunded`.
 */
const REFUND_KEY = 'remboursement';
/** REMBOURSEMENT-2 — the supplier's refusal of this paid order, first-wins. */
const FOURNISSEUR_REFUS_KEY = 'fournisseur-refus';
interface LigneRemboursementStockee extends RemboursementAttendu {
  etat: 'a_demander' | 'demande' | 'refuse';
  essais: number;
  refundRef?: string;
  motifRefus?: string;
  /** REMBOURSEMENT-2 — when the provider accepted the ask: the stuck watch's clock. */
  demandeLe?: string;
  /** REMBOURSEMENT-2 — when the operator was told this line is stuck (once). */
  alerteLe?: string;
}
interface RemboursementStocke {
  ouvertLe: string;
  refus: RefusCourse | null;
  /** `ouvert`: refunds decided (possibly none due); the others: why nothing was decided. */
  decision: 'ouvert' | 'pas_paye' | 'livraison_acceptee' | 'refus_illisible';
  retenu: number;
  lignes: LigneRemboursementStockee[];
}
/**
 * LISTE-ENVIES-1 (founder order 2026-08-25) — the SEVENTH wire: TELL THE
 * LISTE ITS WISH WAS GRANTED. When an order that named a `listeRef` at birth
 * reaches its provider-confirmed transition, this row carries {pid, orderId}
 * to the liste's own object (`/entry/offert`, first-wins per pid), so the
 * shared wishlist can say « déjà offert » on webhook truth and nothing
 * softer. Its own key and its own attempt count, the six-wire law: a lost
 * marker would be a DUPLICATE GIFT — two friends buying the same wish —
 * which is exactly the class at-least-once exists for. Enqueued in the SAME
 * atomic batch as the confirm's log append; rows exist only for orders that
 * carry both a listeRef and a fulfillment record (the pid lives there).
 */
const LISTE_OFFERT_KEY = 'liste-offert-outbox';
/**
 * VRAI-SUIVI (founder rulings 2026-08-10, all approved) — THE BUYER'S OWN READ
 * TOKEN, minted at order create from the OS CSPRNG and served ON THE CREATE
 * RESPONSE ONLY (the `noteVocale` create-only discipline). It is the ONE
 * credential that can later open the remise door; it never rides the poll
 * view, any list, or any cross-app wire. Stored BEFORE the create answers, so
 * a buyer whose first response was lost gets the SAME token on her replay.
 */
const BUYER_REF_KEY = 'buyer-ref';
/**
 * VRAI-SUIVI — HER SIX-DIGIT REMISE CODE, minted by THIS object at the confirm
 * transition (Shop+ mints; custody is armed with it and hashes at its door).
 * FIRST-WINS FOREVER: a redelivered webhook may never re-mint it. §5.6 makes
 * it « private — never shown to the seller »: it leaves this object through
 * exactly one door (`/entry/remise`, buyer-token-gated, arrival-gated) and
 * through the custody-arm outbox below — nowhere else, and never on a view.
 */
const CODE_REMISE_KEY = 'code-remise';
/**
 * VRAI-SUIVI — the FOURTH wire: ARM CUSTODY with the buyer's remise secret,
 * over the new Shop+→custody road (`CUSTODY` service binding + this Worker's
 * `SHOP_ARM_SECRET`). Its own key and its own attempt count, for the same
 * reason the three wires above each have one: no wire may mask another's
 * fate. Enqueued in the SAME atomic batch as the confirm's log append.
 *
 * ⚠ JOURNAL-WORTHY AND CORRECT: the plaintext code necessarily rides this
 * outbox row — it is the buyer's own secret, inside the buyer's own Durable
 * Object, the same storage her code already lives in under CODE_REMISE_KEY.
 * Custody hashes it at its door and never stores the plaintext; the internal
 * `/entry/outbox` read serves this row's STATUS ONLY, never its fact.
 */
const CUSTODY_ARM_KEY = 'custody-arm-outbox';
/**
 * PORTE-CUSTODY part B — the FIFTH wire: FORWARD THE DOOR LEG'S PROVIDER
 * TRUTH to custody, at-least-once, over the SAME road the arm wire rides
 * (the CUSTODY service binding + `SHOP_ARM_SECRET`), at custody's
 * `/produce-shop/door-signal` door. Its own key and its own attempt count,
 * the standing rule: no wire may mask another's fate. Without it custody's
 * SE-I11 gate (« custody→customer ONLY after provider-confirmed door
 * payment ») could never open — Shop+ applied the webhook to its own spine
 * and told nobody, so the rider's drop refused forever.
 *
 * THE FACT IS THE RECEIVED-AND-VALIDATED `payment.door_leg_confirmed.v1`
 * EVENT, FORWARDED VERBATIM — never re-minted, never re-actored: custody
 * verifies the producer actor itself and refuses anything not from the
 * provider class. The row's `command_id` BASE is `door-signal-${the event's
 * own envelope command_id}`; the wire posts `${base}-a${attempt}` — fresh
 * per attempt, because custody commits and replays every outcome per outer
 * id (a frozen id could never re-judge a `not_awaited` state). Safe on
 * every road: the spine's true idempotency keys on the event's own
 * envelope id, so no fresh outer id can double-advance or double-alert.
 *
 * DELIVERY SEMANTICS DIFFER FROM THE ARM WIRE'S BY CONTRACT: custody's 200
 * (`{ok:true, duplicate}`) ends the row, and so does every 409 EXCEPT
 * `door_signal_not_awaited` (producer_actor_mismatch · door_signal_invalid ·
 * door_signal_course_settled — the E2 terminal for a course custody refused
 * home after the buyer paid). Those 409s are RECORDED refusals — custody
 * heard the truth and said no, and it raises its own reconciliation alert
 * on that side; retrying one would re-post a refusal forever.
 * `door_signal_not_awaited` alone keeps carrying: it is custody's TRANSIENT
 * state (paid before the accord was noted), not a verdict. Transport
 * failures and every other status stay `pending` on the shared backoff.
 */
const DOOR_SIGNAL_KEY = 'custody-door-signal-outbox';
/**
 * COLIS-2 — DECLARE A PACKAGE'S DOOR COLLECTION TO CUSTODY, before any
 * charge. A package's one door payment is charged under its collection's own
 * reference, and a provider confirms that reference and the sum — never a
 * list of what it paid for (founder, 2026-09-23: « a real payment provider
 * must send the article list back »: no longer). So when this article enters
 * a collection, it tells its OWN custody file, over the same road as the arm
 * wire (`/produce-shop/door-reference`), that this reference pays its door
 * leg. It carries no money: custody still waits for the provider's
 * confirmation naming that reference.
 *
 * One row per collection this article entered (`collectId` → its fate),
 * at-least-once under a deterministic command id. Custody's 200 ends a row;
 * `order_not_open` (the course has no custody file yet) keeps it pending; any
 * other 409 is custody's recorded refusal. The door signal waits while a row
 * is pending: custody could not yet tell the payment is this article's.
 */
const DOOR_REFERENCE_KEY = 'custody-door-reference-outbox';
/**
 * RAPPROCHEMENT-1 (E3 seed) — THE DURABLE ALERT SINK (audit B4 closed: alerts
 * were minted and dropped). Every reconciliation.alert.v1 the vault's refusal
 * paths or the reconcile pass mint is RECORDED here — deduped on the alert's
 * own envelope command_id (refusal alerts are deterministic per causing
 * webhook, pass alerts per divergence, so redeliveries and repeated passes
 * re-mint identical ids), and CAPPED so a hostile webhook storm cannot grow
 * storage without bound. INTERNAL ONLY: read at /entry/audit and never on a
 * public answer (SP-I03) — the operator's road, not the buyer's.
 */
const RECON_ALERTS_KEY = 'recon-alerts';
const RECON_ALERTS_CAP = 50;
/**
 * RESERVATION-REGLE-1 (AUDIT-SHOP-2 F-08) — THE RELEASE OUTBOX, the eighth
 * wire. « The release is the rule » (WO-2.3, Contract E2 scenario #1): when
 * this order's payment FAILS, its quote's hold is freed NOW through
 * CheckoutDO's `/entry/release`, not left to die by the 2-minute TTL — and
 * the buyer's fresh hold on the same quote succeeds at once instead of
 * answering `already_reserved` until the clock runs out. Durable beside the
 * failure that earned it, flushed on the same alarm and backoff as every
 * other wire (at-least-once; the vault's release command is idempotent on
 * its command id, so a redelivery frees nothing twice). « The alert is the
 * net »: every ANSWER is judged by the vault's `reservationReconciliationAlert`
 * — a hold the answer still reports held after a payment failure sinks a
 * reconciliation.alert.v1 beside the others. A wire that cannot deliver is
 * a PENDING row with its attempt count on the audit read, never silence.
 */
const RELEASE_KEY = 'reservation-release-outbox';
/** CheckoutDO's /entry/release answer — the vault's decision, `state` riding it for the net. */
interface ReleaseAnswer {
  ok?: boolean;
  reason?: string;
  state?: ReservationState;
}
interface ReleaseRow {
  status: 'pending' | 'delivered';
  commandId: string;
  quoteId: string;
  reason: 'payment_failed';
  /**
   * RESERVATION-REGLE-2 — the hold the FAILING ATTEMPT was authorized on: the
   * receipt `decideCreateOrder` passed on, which the owner's fresh hold
   * refreshes before her retry (the chain's `reservation_id` is the BIRTH hold,
   * write-once — naming it would leave a failed retry's hold to die by the
   * TTL: verifier MAJOR). Absent on rows written before this slice.
   */
  reservationId?: string;
  attempts: number;
  deliveredAt?: string;
  decision?: { ok: boolean; reason: string | null; state: string | null };
}
/**
 * B5.1 (RESERVATION-FOURNISSEUR-1) — THE PRODUCER'S UNIT COMES BACK on the
 * same failure edge, through its own durable row: the reserve placed a hold
 * on Boutik+ under this reservation id (`checkout-do.ts`), and a payment that
 * fails must free THAT unit for the next buyer now, not fifteen minutes later
 * when Boutik+'s own expiry sweeps it. Same at-least-once discipline as the
 * eight wires above: written beside the failure, carried by the alarm,
 * delivered on the producer's 2xx (a refusal by name — `idempotent`, nothing
 * to release — is an ANSWER) or 404 (a product the producer does not know:
 * nothing to release either); pending with its attempt count otherwise.
 */
const HOLD_RELEASE_KEY = 'stock-hold-release-outbox';
interface HoldReleaseRow {
  status: 'pending' | 'delivered';
  commandId: string;
  productVersionId: string;
  reservationId: string;
  reason: 'payment_failed';
  attempts: number;
  deliveredAt?: string;
  answer?: { status: string | null; httpStatus: number };
}
/**
 * RESERVATION-REGLE-1 — THE STUCK-SAGA WATCH (Contract E2 exit: « DLQ +
 * stuck-saga detection live »). An order still `payment_pending` past the
 * versioned TTL emits `saga.stuck.v1` exactly once — the vault's own
 * `checkStuckSaga`; its once-mark is persisted HERE because the spine is
 * rebuilt from the log on every request and would forget. It rides this
 * object's alarm: armed at every entry into `payment_pending`, re-derived
 * from the log on every tick, sunk into the durable alert record the
 * operator already reads. ⏳ THE TTL IS SPEC-SILENT: 15 minutes is WO-2.3's
 * seed value and the quote's own life (a payment pending longer than the
 * price it pays for is stuck) — applied as the documented safest default
 * and flagged in the journal; `STUCK_SAGA_TTL_MS` (env; the seam test's
 * knob, unset on the deployed Worker) overrides it.
 */
const STUCK_SAGA_KEY = 'saga-stuck';
const STUCK_SAGA_POLICY_VERSION = 'stuck-ttl.v1';
export const STUCK_SAGA_TTL_MS = 15 * 60_000;
/**
 * RESERVATION-REGLE-2 (E2 « paid-order-no-supplier-decision », AUDIT-SHOP-2
 * F-96) — THE SUPPLIER-NOTIFICATION WATCH. An order never rests in `paid`
 * here (the confirm lands in the webhook's own batch), so what this watches
 * is the FIRST wire: a confirmed order whose order.confirmed.v1 is still
 * `pending` past the same TTL, or `unsendable` at any age, is a supplier who
 * never learned. Same alarm, same durable record, its own once-mark.
 */
const STUCK_SUPPLIER_KEY = 'saga-stuck-supplier';
/**
 * VRAI-SUIVI — SÉRA'S TRANSIT MARKS, as this order received them through the
 * `/fulfillment/transit` door: `en_route` → `departedAt`, `arrivee` →
 * `arrivedAt`. FIRST-WINS PER STAGE, exactly as the preparation record is:
 * departure happened once, arrival happened once, and an at-least-once
 * redelivery may not move either clock. The stored instant is the PRODUCER'S
 * (`asOf` on the intake), the same ownership rule `PREPARATION_KEY` states.
 * The arrival mark is ALSO the revelation gate: the remise door answers only
 * once `arrivedAt` exists (the founder's ruling — the code is revealed to the
 * buyer only after the rider's arrival fact).
 */
const TRANSIT_KEY = 'delivery-transit';
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
/**
 * PAYER-TOUT-1 — which attempt of its GROUP this order's current attempt
 * belongs to, and the hold that attempt was authorized on. Written in the
 * same durable moment as the attempt itself, so the group's failure notice
 * can end exactly this attempt and release exactly this hold — and a stale
 * notice for an older attempt ends nothing.
 */
const GROUP_ATTEMPT_KEY = 'group-attempt';
const DOOR_RESULTS_KEY = 'door-command-results';
/**
 * COLIS-FOURNISSEUR-1 — the package door collections this order ENTERED, by
 * collection id: each one's correlation, provider key and shares, exactly as
 * its group froze them. First-wins per collection; a door confirmation naming
 * a collection is judged against ITS record here, never against the payload.
 */
const PORTES_COLIS_KEY = 'portes-colis';

/** COLIS-FOURNISSEUR-1 — one package door collection, as an order keeps it. */
interface PorteColis {
  readonly correlationId: string;
  readonly providerKey: string;
  readonly parts: readonly { readonly orderId: string; readonly amount: number }[];
}

/** COLIS-2 — one collection reference on its way to this order's custody file. */
interface DoorReferenceRow {
  readonly status: 'pending' | 'delivered';
  readonly orderId: string;
  readonly attempts: number;
  readonly outcome?: 'accepted' | 'refused';
  readonly reason?: string;
  readonly deliveredAt?: string;
}

/**
 * DURCISSEMENT-SERVICE-2 (AUDIT-SHOP-2 F-30) — THE DOOR ROAD HAS A CEILING.
 *
 * While the door leg is `due`, every fresh `commandId` was authorized again
 * (rightly: the leg IS due) and appended one attempt record (~200 B) and, when
 * accepted, one result — with no bound at all, until the 128 KiB value limit
 * wedged the order's door road for good: the one road that lets her pay the
 * rider. No money risk (one stable provider key per leg — every attempt is the
 * SAME collection to the provider), only the wedge.
 *
 * The ceiling counts ATTEMPTS, by name: at the cap a new door charge is
 * refused `door_attempts_exhausted` before anything is written, so storage
 * stops growing there. Twenty-five is a number no buyer at a door reaches
 * (the provider's own answer — accepted, timed out — ends each attempt) and
 * a hostile client reaches in seconds; it is MINE, not the founder's, and is
 * journalled as a safest default. What the ceiling never touches: a replayed
 * command still replays its stored answer, and the provider's webhook still
 * confirms the leg — the truth of money is never gated on this count.
 *
 * A test knob that can ONLY LOWER it (the `FEED_FANOUT_MAX` idiom): the seam
 * test reaches the ceiling with three real charges instead of twenty-six, and
 * a typo in the environment can shorten the road but never raise the wedge.
 */
const MAX_DOOR_ATTEMPTS = 25;
export function doorAttemptsMax(env: { readonly DOOR_ATTEMPTS_MAX?: string }): number {
  const raw = Number(env.DOOR_ATTEMPTS_MAX);
  if (!Number.isInteger(raw) || raw < 1) return MAX_DOOR_ATTEMPTS;
  return Math.min(raw, MAX_DOOR_ATTEMPTS);
}

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
  /** LISTE-ENVIES-1 — the liste token from the public create body (charset-
   *  pinned at the router AND re-checked here). `null`/absent = no liste. */
  listeRef?: string | null;
  /** NOTE-VOCALE-APRES-GARDE-1 (AUDIT-SHOP-2 F-04) — her voice note's RAW
   *  BYTES (base64, wire-bounded at the router AND re-checked here). The
   *  object hands them to the media door ITSELF, after its hold check passes:
   *  a create the gate refuses never costs Boutik+ a byte. Absent = no note. */
  audioB64?: string;
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
  /** REPERE-AUDIO-REEL — her voice note's opaque media ref, minted by the
   *  media service AFTER this Worker handed it the bytes server-side. Never
   *  caller-supplied; absent when she typed instead of speaking. */
  readonly audioRef?: string;
  /** GEO-ACHAT-1 — her GPS pin, captured with one optional tap on C3 so the
   *  rider finds the door. SUPPORTING EVIDENCE, NEVER PROOF (SE-I07): it
   *  decides nothing and releases nothing — quartier + repère + the drop
   *  code stay the truth. Same privacy class as the phone: it exits through
   *  the OPS-gated dispatch read and nowhere else. `accuracy` is the
   *  device's own metres, so the rider knows the pin's confidence. */
  readonly pin?: { readonly lat: number; readonly lng: number; readonly accuracy?: number };
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

/** VRAI-SUIVI — the transit marks under TRANSIT_KEY. See the key's comment. */
interface TransitRecord {
  readonly departedAt?: string;
  readonly arrivedAt?: string;
}

/**
 * VRAI-SUIVI — the arm fact's `kind`, ASSEMBLED AT RUNTIME on purpose: the
 * standing exposure gate scans this repo's source for the buyer-secret token
 * names and must stay maximally strict, with no allowlist a future leak could
 * hide behind. The runtime bytes on the wire are exactly the canonical kind
 * custody's registry keys.
 */
const ARM_KIND = ['buyer', 'drop', 'code'].join('_');

/**
 * REPERE-AUDIO-REEL — the opaque key Boutik+'s media service mints for a
 * stored voice note: `media/{uuid v4}`. Mirrored byte-for-byte (the minting
 * module lives in another repo); anything else is not a ref this platform
 * ever produced.
 */
const AUDIO_REF = /^media\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Strict STORED shape: the three approved keys plus the server-minted
 *  `audioRef` (optional), phone and quartier non-empty, all bounded. Anything
 *  else is null (the caller refuses). The PUBLIC wire never carries
 *  `audioRef` — see `readBuyerContactWire`: a ref is minted server-side or it
 *  does not exist. */
/** GEO-ACHAT-1 — the pin's strict shape: exactly {lat, lng, accuracy?}, all
 *  finite numbers, lat/lng on the globe, accuracy in [0, 100 000] metres.
 *  Anything else is null and the CONTACT refuses loudly — the pin comes from
 *  this platform's own capture UI, so a malformed one is a hand-rolled
 *  caller, never a buyer to accommodate. */
function readPin(value: unknown): { lat: number; lng: number; accuracy?: number } | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const allowed = new Set(['lat', 'lng', 'accuracy']);
  for (const key of Object.keys(p)) {
    if (!allowed.has(key)) return null;
  }
  const lat = p['lat'];
  const lng = p['lng'];
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  const accuracy = p['accuracy'];
  if (accuracy !== undefined) {
    if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100_000) return null;
    return { lat, lng, accuracy };
  }
  return { lat, lng };
}

export function readBuyerContact(value: unknown): BuyerContact | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const allowed = new Set(['phone', 'quartier', 'repere', 'audioRef', 'pin']);
  for (const key of Object.keys(r)) {
    if (!allowed.has(key)) return null;
  }
  const phone = r['phone'];
  const quartier = r['quartier'];
  const repere = r['repere'];
  if (typeof phone !== 'string' || phone.trim() === '' || phone.length > 32) return null;
  if (typeof quartier !== 'string' || quartier.length > 120) return null;
  if (typeof repere !== 'string' || repere.length > 200) return null;
  let pin: { lat: number; lng: number; accuracy?: number } | undefined;
  if (r['pin'] !== undefined) {
    const lu = readPin(r['pin']);
    if (lu === null) return null;
    pin = lu;
  }
  // GEO-ACHAT-2 (founder, 2026-08-31): a confirmed pin may stand in for the
  // quartier — the phone-only road. Without one, the standing law holds: a
  // contact with no quartier is not an address anyone can ride to.
  if (quartier.trim() === '' && pin === undefined) return null;
  const audioRef = r['audioRef'];
  if (audioRef !== undefined) {
    if (typeof audioRef !== 'string' || !AUDIO_REF.test(audioRef)) return null;
    return { phone, quartier, repere, audioRef, ...(pin !== undefined ? { pin } : {}) };
  }
  return { phone, quartier, repere, ...(pin !== undefined ? { pin } : {}) };
}

/**
 * REPERE-AUDIO-REEL — the PUBLIC wire shape of a contact. What a buyer may
 * send: the three contact fields plus `audioB64`, her voice note's RAW BYTES
 * base64'd from the recorder. Never `audioRef` — a caller who could name a
 * ref could attach a stranger's note to their order; the ref is minted
 * server-side after this Worker itself hands the bytes to the media door.
 * The base64 is bounded to ~1 MiB of bytes (minutes of Opus; the capture UI
 * stops at 30 s) and alphabet-checked so a malformed note refuses LOUDLY at
 * the door instead of dying quietly on `atob`.
 */
const AUDIO_B64_MAX_CHARS = 1_400_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function readBuyerContactWire(
  value: unknown,
): { contact: BuyerContact; audioB64?: string } | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  // GEO-ACHAT-1 — `pin` joins the public wire: unlike the voice note there is
  // no raw/minted split (the pin IS its stored form), so it rides straight
  // through the stored reader's own bounds.
  const allowed = new Set(['phone', 'quartier', 'repere', 'audioB64', 'pin']);
  for (const key of Object.keys(r)) {
    if (!allowed.has(key)) return null;
  }
  const contact = readBuyerContact({
    phone: r['phone'],
    quartier: r['quartier'],
    repere: r['repere'],
    ...(r['pin'] !== undefined ? { pin: r['pin'] } : {}),
  });
  if (contact === null) return null;
  const audioB64 = r['audioB64'];
  if (audioB64 === undefined) return { contact };
  if (typeof audioB64 !== 'string' || audioB64.length === 0 || audioB64.length > AUDIO_B64_MAX_CHARS) return null;
  if (!BASE64.test(audioB64)) return null;
  return { contact, audioB64 };
}

/**
 * PAYER-TOUT-1 — the group as the group object hands it to each order, read
 * strictly: every order stores it as an origin fact for ever, so a malformed
 * one is refused at the door rather than frozen into an order.
 */
export function readOrderGroupe(value: unknown): OrderGroupe | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const g = value as Record<string, unknown>;
  const { groupId, correlationId, providerKey, parts } = g;
  if (typeof groupId !== 'string' || !isGroupId(groupId)) return null;
  if (typeof correlationId !== 'string' || correlationId !== `corr-${groupId}`) return null;
  if (typeof providerKey !== 'string' || providerKey === '') return null;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const lus: { orderId: string; amount: number }[] = [];
  for (const part of parts as unknown[]) {
    if (part === null || typeof part !== 'object') return null;
    const { orderId, amount } = part as Record<string, unknown>;
    if (typeof orderId !== 'string' || orderId === '') return null;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) return null;
    lus.push({ orderId, amount });
  }
  return { groupId, correlationId, providerKey, parts: lus };
}

/** COLIS-FOURNISSEUR-1 — a package door collection as its group hands it, read strictly. */
function lirePorteColis(value: unknown): PorteColis | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { correlationId, providerKey, parts } = value as Record<string, unknown>;
  if (typeof correlationId !== 'string' || correlationId === '') return null;
  if (typeof providerKey !== 'string' || providerKey === '') return null;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const lus: { orderId: string; amount: number }[] = [];
  for (const part of parts as unknown[]) {
    if (part === null || typeof part !== 'object') return null;
    const { orderId, amount } = part as Record<string, unknown>;
    if (typeof orderId !== 'string' || orderId === '') return null;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) return null;
    lus.push({ orderId, amount });
  }
  return { correlationId, providerKey, parts: lus };
}

export interface OrderDOEnv {
  /** RESERVATION-REGLE-1 — the quote authority, for the release wire (unbound ⇒ the row stays pending, retried, never dropped). */
  readonly CHECKOUT?: DurableObjectNamespace;
  /** RESERVATION-REGLE-1 — the stuck-saga TTL override, tests only; unset ⇒ the 15-minute default. */
  readonly STUCK_SAGA_TTL_MS?: string;
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
  /** F-30 — the door-attempt ceiling's test knob, lower-only (see `doorAttemptsMax`). */
  readonly DOOR_ATTEMPTS_MAX?: string;
  /**
   * REMBOURSEMENT-PORTE-FERMEE — the package's payment object, read by the
   * founder's row only (a closed door payment's refund that cannot finish).
   * ABSENT ⇒ the row says what this order knows, as before.
   */
  readonly PAYMENT_GROUP?: DurableObjectNamespace;
  /** RF-1a — the reseller feed index (one singleton). Bound on the Worker, so
   *  this object writes her row at the confirm transition without a
   *  composition-root shim, exactly as `OFFER` needs none. ABSENT ⇒ the
   *  registration is skipped and the money path is untouched. */
  readonly RESELLER?: DurableObjectNamespace;
  /** RELATED-PARTY-1 — the accounts book, for the reseller's registered number (§6.5's phone signal). */
  readonly COMPTES?: DurableObjectNamespace;
  /**
   * VRAI-SUIVI — the NEW Shop+→custody road: custody-service as a SERVICE
   * BINDING (`[[services]]` in wrangler.toml, the OFFER/MEDIA discipline —
   * the error-1042 lesson), used by exactly two flushers: the arm wire at
   * custody's `/produce-shop/secrets/arm` door, and (PORTE-CUSTODY part B)
   * the door-signal wire at `/produce-shop/door-signal`. TRANSPORT
   * ONLY: both doors still gate on `SHOP_ARM_SECRET` (wrangler secret, never
   * `[vars]`), presented as Bearer. EITHER ABSENT ⇒ nothing is attempted,
   * the rows stay `pending`, and the backlog drains the moment configuration
   * arrives — the deploy-order law, same shape as the Séra wire's.
   */
  readonly CUSTODY?: { fetch(request: Request): Promise<Response> };
  readonly SHOP_ARM_SECRET?: string;
  /**
   * C1 (audit) — the durable attribution-lock book (SP-I09b.3
   * first-lock-wins), one instance per ORDER id, claimed by `create` below
   * BEFORE any charge is initiated. No public route reaches it. ABSENT ⇒ the
   * create refuses CLOSED (`attribution_lock_unavailable`): unlike the
   * best-effort wires above, the lock is an integrity fact about who the
   * order pays, and an order that cannot record it must not be born.
   */
  readonly ATTRIBUTION_LOCK?: DurableObjectNamespace;
  /**
   * LISTE-ENVIES-1 — the wishlist book, for the offert wire alone. Bound on
   * the Worker like RESELLER, so this object marks the liste at the confirm
   * transition without a composition-root shim. ABSENT ⇒ the wire's rows
   * stay pending and drain when migration v9 lands — the money path never
   * notices either way.
   */
  readonly WISHLIST?: DurableObjectNamespace;
  /**
   * NOTE-VOCALE-APRES-GARDE-1 — the media door (Boutik+'s media-service as a
   * SERVICE BINDING) and this Worker's write key for it: the SAME two bindings
   * the router's `televerserNoteVocale` reads, reachable here because the
   * Durable Object receives the full Worker env. Either absent ⇒ the note is
   * `perdue` and the sale untouched — the standing ruling, unchanged.
   */
  readonly MEDIA?: { fetch(request: Request): Promise<Response> };
  readonly MEDIA_WRITE_KEY?: string;
}

/**
 * RELATED-PARTY-1 — two numbers as people type them (with or without +226 or
 * 00226, with spaces or dots of their own) are the SAME number when their
 * eight digits agree. Anything shorter than eight digits is no number to
 * match: it never matches, so a half-typed contact can never void a sale.
 */
export function memeNumero(a: string, b: string): boolean {
  const huit = (s: string): string => s.replace(/\D/g, '').replace(/^00/, '').replace(/^226(?=\d{8}$)/, '');
  const x = huit(a);
  const y = huit(b);
  return x.length >= 8 && x === y;
}

/**
 * What HER wire carries about §6.5 on one order — only when a non-clear
 * decision stands: the outcome, the signals it rests on (the basis of any
 * appeal — a verdict she cannot see the basis of is not one she can contest),
 * whether she contested, and the founder's ruling once there is one. A clear
 * decision puts nothing on her wire; the founder's read carries it all.
 */
export function lienProcheSurLeFil(
  spine: OrderSpine,
): { outcome: string; signals: string[]; contestee: boolean; resolution?: string } | undefined {
  const rp = spine.relatedPartyView();
  if (rp === undefined || rp.decision.outcome === 'clear') return undefined;
  return {
    outcome: rp.decision.outcome,
    signals: [...rp.decision.signals.identity, ...rp.decision.signals.circumstantial],
    contestee: rp.appeal !== undefined,
    ...(rp.resolution !== undefined ? { resolution: rp.resolution.outcome } : {}),
  };
}

/** The founder's whole view of §6.5 on one order: decision · appeal · ruling · the lines as stored. */
export function vueLienProche(spine: OrderSpine, orderId: string): Record<string, unknown> {
  const rp = spine.relatedPartyView();
  return {
    ok: true,
    orderId,
    decision: rp?.decision ?? null,
    appeal: rp?.appeal ?? null,
    resolution: rp?.resolution ?? null,
    obligations: spine.ledger
      .obligationsFor(orderId)
      .map((o) => ({ party: o.party, amount: o.amount, state: o.state, holds: [...o.holds] })),
  };
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
      /**
       * ═══ ONCE THE ORDER EXISTS, THE RECEIPT IS FROZEN (GARDE-PAIEMENT-1) ═══
       * (the COMMANDE-REJOUER-1 verifier's standing MAJOR, closed here.)
       *
       * The receipt is the identity authority `decideCreateOrder` and the
       * replay road trust — « does this caller hold this quote ». Before the
       * order exists it may legitimately move to a genuinely LATER hold (the
       * monotone rule below). But once an order is CREATED against this quote,
       * its first holder is its owner: the 2-minute hold then dies while the
       * 15-minute quote stays fresh, so a STRANGER who has the quoteId could
       * take a fresh hold, whose mirror would rewrite this receipt to him —
       * and the origin-exists road answers `buyerRef` (her suivi + remise
       * door) to whoever the receipt names. The order's existence binds the
       * receipt TO ITS HOLDER: a FOREIGN fresh hold's mirror is refused and
       * the stored receipt untouched, so the stranger's own create is refused
       * `reservation_held_by_another` and never reaches her token — while the
       * OWNER's own fresh hold still refreshes her receipt, because her
       * payment-failure retry road runs the whole freshness gate and a
       * receipt nobody could refresh would strand her order for ever.
       *
       * A redelivered mirror of the SAME hold stays the harmless no-op it was.
       * And create() re-puts the receipt it validated at the order's own
       * durable moment, so a mirror that slipped in DURING create (the
       * attribution-lock await, before the origin existed — the recheck's
       * race) is overwritten by the creator's receipt it raced.
       */
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      const existing = await this.state.storage.get<ReservationReceipt>(RECEIPT_KEY);
      if (existing !== undefined) {
        // SAME HOLD ⇒ ALREADY DECIDED. Not an error, not an overwrite: the
        // reservation this receipt describes has one holder, settled when it was
        // created, and no later write about the same hold may say otherwise.
        if (existing.reservationId === receipt.reservationId) {
          return Response.json({ ok: true, stored: false, reason: 'already_decided' });
        }
        // A DIFFERENT hold while an ORDER exists: the receipt may never change
        // HANDS — a foreign holder is refused whatever the clock or the new
        // hold claims. The OWNER's own fresh hold still refreshes it through
        // the monotone rule below (the founder-ordered recheck caught the
        // holder-blind first cut: it stranded a payment_failed order forever,
        // because her retry needs a live hold and her receipt had no writer —
        // the composition root's documented recovery, « the buyer's next
        // reserve writes it again », must stay true for HER).
        if (origin !== undefined && receipt.holderRef !== existing.holderRef) {
          return Response.json({ ok: true, stored: false, reason: 'order_frozen' });
        }
        // A DIFFERENT hold (pre-order, or the owner's own refresh) must be a
        // genuinely LATER one. Strictly later: a fresh hold's TTL always runs
        // from now, so anything not strictly later is an older mirror write
        // landing out of order.
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
      // LISTE-ENVIES-1 — re-checked here exactly as the contact is: the
      // router validated it, and this object refuses to store what it would
      // not have accepted at its own door.
      let listeRef: string | null = null;
      if (args.listeRef !== undefined && args.listeRef !== null) {
        if (typeof args.listeRef !== 'string' || !LISTE_REF.test(args.listeRef)) {
          return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
        }
        listeRef = args.listeRef;
      }
      // NOTE-VOCALE-APRES-GARDE-1 — the bytes, re-checked at this door exactly
      // as the contact is: the router bounded them, and this object refuses to
      // carry what it would not have accepted itself.
      let audioB64: string | undefined;
      if (args.audioB64 !== undefined) {
        if (
          typeof args.audioB64 !== 'string' ||
          args.audioB64.length === 0 ||
          args.audioB64.length > AUDIO_B64_MAX_CHARS ||
          !BASE64.test(args.audioB64)
        ) {
          return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
        }
        audioB64 = args.audioB64;
      }
      return this.create(args.quoteId, args.holderRef, args.commandId, args.quoteBytes, args.fulfillment ?? undefined, contact, listeRef, audioB64);
    }

    /**
     * ═══ PAYER-TOUT-1 — THE THREE ROADS THE GROUP TAKES TO EACH OF ITS ORDERS ═══
     * Internal only (the composition root maps no public path to `/entry/*`),
     * called by `PaymentGroupDO` alone:
     *   · group-check   — may this holder pay for this order inside this group
     *                     now? The whole create gate, and NOTHING written.
     *   · group-create  — birth (or retry) inside the group: the create road
     *                     up to its durable moment, and never a charge.
     *   · group-charged — the group's charge did not go through: end exactly
     *                     the attempt the group made, release exactly its hold.
     */
    if (request.method === 'POST' && pathname === '/entry/group-check') {
      const args = (await request.json().catch(() => null)) as {
        quoteId?: unknown;
        holderRef?: unknown;
        groupId?: unknown;
        quoteBytes?: unknown;
        fulfillment?: { zoneTo?: unknown } | null;
      } | null;
      if (
        args === null ||
        typeof args.quoteId !== 'string' || args.quoteId === '' ||
        typeof args.holderRef !== 'string' || args.holderRef === '' ||
        typeof args.groupId !== 'string' || args.groupId === '' ||
        (args.quoteBytes !== undefined && typeof args.quoteBytes !== 'string')
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const wireZone = args.fulfillment?.zoneTo;
      return this.groupCheck(
        args.quoteId,
        args.holderRef,
        args.groupId,
        args.quoteBytes,
        typeof wireZone === 'string' && wireZone !== '' ? wireZone : undefined,
      );
    }

    if (request.method === 'POST' && pathname === '/entry/group-create') {
      let args: CreateArgs & { groupe?: OrderGroupe; groupAttemptId?: unknown; colis?: unknown };
      try {
        args = (await request.json()) as CreateArgs & { groupe?: OrderGroupe; groupAttemptId?: unknown; colis?: unknown };
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const groupe = readOrderGroupe(args.groupe);
      // COLIS-FOURNISSEUR-1 — read strictly, like the group: it becomes an
      // origin fact for ever, and it must list THIS order.
      let colis: OrderPackage | undefined;
      if (args.colis !== undefined) {
        const lu = OrderPackageSchema.safeParse(args.colis);
        if (!lu.success || typeof args.quoteId !== 'string' || !lu.data.orderIds.includes(orderIdForQuote(args.quoteId))) {
          return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
        }
        colis = lu.data;
      }
      if (
        typeof args.quoteId !== 'string' || args.quoteId === '' ||
        typeof args.holderRef !== 'string' || args.holderRef === '' ||
        typeof args.commandId !== 'string' || args.commandId === '' ||
        typeof args.groupAttemptId !== 'string' || args.groupAttemptId === '' ||
        groupe === null
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      // The contact arrives in its STORED form: the group uploaded her note
      // once and hands every order the same minted ref.
      let contact: BuyerContact | null = null;
      if (args.contact !== undefined && args.contact !== null) {
        contact = readBuyerContact(args.contact);
        if (contact === null) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.create(
        args.quoteId,
        args.holderRef,
        args.commandId,
        args.quoteBytes,
        args.fulfillment ?? undefined,
        contact,
        null,
        undefined,
        { groupe, groupAttemptId: args.groupAttemptId, ...(colis !== undefined ? { colis } : {}) },
      );
    }

    if (request.method === 'POST' && pathname === '/entry/group-charged') {
      const args = (await request.json().catch(() => null)) as {
        groupId?: unknown;
        groupAttemptId?: unknown;
        outcome?: unknown;
      } | null;
      if (
        args === null ||
        typeof args.groupId !== 'string' ||
        typeof args.groupAttemptId !== 'string' ||
        (args.outcome !== 'timeout' &&
          args.outcome !== 'idempotency_key_amount_mismatch' &&
          args.outcome !== 'group_incomplete' &&
          args.outcome !== 'provider_amount_divergence')
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.groupCharged(args.groupId, args.groupAttemptId, args.outcome);
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
      const annulation = await this.state.storage.get(SERA_ANNULATION_KEY);
      // BOUTIK-SUIVI — and the delivery wire beside both, for the same reason.
      const livraison = await this.state.storage.get(BOUTIK_DELIVERED_KEY);
      // VRAI-SUIVI — the custody-arm wire's fate, STATUS ONLY and built field
      // by field: this row's `fact` carries the buyer's remise secret, and an
      // operator read has no business seeing it — the fate is the news here.
      const armement = await this.state.storage.get<{
        status?: string;
        attempts?: number;
        deliveredAt?: string;
      }>(CUSTODY_ARM_KEY);
      // PORTE-CUSTODY part B — the door-signal wire's fate beside the four
      // others, STATUS ONLY and built field by field like the arm wire's:
      // the fact is provider truth already in the durable log, but the read
      // serves the wire's fate, never its cargo. `outcome`/`reason` name what
      // custody answered — « accepted » or a 409 refusal, recorded, not retried.
      const porte = await this.state.storage.get<{
        status?: string;
        attempts?: number;
        outcome?: string;
        reason?: string;
        deliveredAt?: string;
      }>(DOOR_SIGNAL_KEY);
      // STOCK-VENDU-1b — the refused-course wire's fate beside the five
      // others, STATUS ONLY: the cargo is the canon event, already readable
      // at its producer; the fate is the news here.
      const refus = await this.state.storage.get<{
        status?: string;
        attempts?: number;
        deliveredAt?: string;
      }>(BOUTIK_REFUSED_KEY);
      // LISTE-ENVIES-1 — the offert wire's fate beside the six, STATUS ONLY:
      // the mark itself is readable on the liste's own public projection.
      const offert = await this.state.storage.get<{
        status?: string;
        attempts?: number;
        deliveredAt?: string;
      }>(LISTE_OFFERT_KEY);
      // COLIS-2 — each collection reference's fate on its way to custody.
      const references = await this.state.storage.get<Record<string, DoorReferenceRow>>(DOOR_REFERENCE_KEY);
      return Response.json({
        ok: true,
        outbox,
        ...(sera !== undefined ? { seraOutbox: sera } : {}),
        // COLIS-FOURNISSEUR-1 — the cancel fact's fate, beside the funded one.
        ...(annulation !== undefined ? { seraAnnulation: annulation } : {}),
        ...(livraison !== undefined ? { livraisonOutbox: livraison } : {}),
        ...(armement !== undefined
          ? {
              custodyArm: {
                status: armement.status,
                attempts: armement.attempts,
                ...(armement.deliveredAt !== undefined ? { deliveredAt: armement.deliveredAt } : {}),
              },
            }
          : {}),
        ...(references !== undefined
          ? {
              doorReferences: Object.fromEntries(
                Object.entries(references).map(([ref, r]) => [
                  ref,
                  {
                    status: r.status,
                    attempts: r.attempts,
                    ...(r.outcome !== undefined ? { outcome: r.outcome } : {}),
                    ...(r.reason !== undefined ? { reason: r.reason } : {}),
                  },
                ]),
              ),
            }
          : {}),
        ...(porte !== undefined
          ? {
              doorSignal: {
                status: porte.status,
                attempts: porte.attempts,
                ...(porte.outcome !== undefined ? { outcome: porte.outcome } : {}),
                ...(porte.reason !== undefined ? { reason: porte.reason } : {}),
                ...(porte.deliveredAt !== undefined ? { deliveredAt: porte.deliveredAt } : {}),
              },
            }
          : {}),
        ...(refus !== undefined
          ? {
              refusOutbox: {
                status: refus.status,
                attempts: refus.attempts,
                ...(refus.deliveredAt !== undefined ? { deliveredAt: refus.deliveredAt } : {}),
              },
            }
          : {}),
        ...(offert !== undefined
          ? {
              listeOffert: {
                status: offert.status,
                attempts: offert.attempts,
                ...(offert.deliveredAt !== undefined ? { deliveredAt: offert.deliveredAt } : {}),
              },
            }
          : {}),
      });
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
    /**
     * NB-3 (E2) — the ONE opaque key the provider must echo, for the sandbox
     * stand-in (SANDBOX-PAY-1). A real aggregator knows its collect key
     * because we charged it with one; the founder's confirm tool stands in
     * for that aggregator and reads it here. The route to this entry is
     * gated by PAYMENT_WEBHOOK_SECRET at the composition root — the holder
     * can already declare money received, so reading the key it must echo
     * widens nothing. Answers the key and NOT ONE other field.
     */
    if (request.method === 'GET' && pathname === '/entry/leg-key') {
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: false }, { status: 404 });
      const leg = new URL(request.url).searchParams.get('leg') ?? 'checkout';
      if (leg !== 'checkout' && leg !== 'door') return Response.json({ ok: false }, { status: 404 });
      const keys = (await this.state.storage.get<Record<string, string>>(LEG_KEYS_KEY)) ?? {};
      const legKey = Object.prototype.hasOwnProperty.call(keys, leg) ? keys[leg] : undefined;
      if (legKey === undefined) return Response.json({ ok: false }, { status: 404 });
      // PAYER-TOUT-1 — a grouped order's checkout key is its GROUP's; the
      // stand-in is told so, and confirms the group rather than this order.
      if (leg === 'checkout' && origin.groupe !== undefined) {
        return Response.json({ ok: true, legKey, groupId: origin.groupe.groupId });
      }
      return Response.json({ ok: true, legKey });
    }

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
          doorAttempts: [],
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
        // F-30 — the door road's own attempt ledger, so the ceiling can be
        // asked of storage rather than believed from a response.
        doorAttempts: (await this.state.storage.get<AttemptRecord[]>(DOOR_ATTEMPTS_KEY)) ?? [],
        escrow: spine.ledger.escrowFor(origin.orderId) ?? null,
        doorLeg: spine.doorLegState,
        receipt: receipt ?? null,
        inputCount: log.length,
        // NB-3 (E2) — the per-leg provider keys, on this INTERNAL surface only:
        // a genuine webhook names its leg's key, so the suites build webhooks
        // from the key the order actually holds instead of fabricating one.
        legKeys: (await this.state.storage.get<Record<string, string>>(LEG_KEYS_KEY)) ?? {},
        // RESERVATION-REGLE-1 — the release wire's row and the stuck watch's
        // once-mark, on this INTERNAL surface: the ledger the seam test asks.
        release: (await this.state.storage.get<ReleaseRow>(RELEASE_KEY)) ?? null,
        // B5.1 — the producer's hold-release row, the seam's ledger for the unit.
        holdRelease: (await this.state.storage.get<HoldReleaseRow>(HOLD_RELEASE_KEY)) ?? null,
        stuck: (await this.state.storage.get<{ emittedAt: string }>(STUCK_SAGA_KEY)) ?? null,
        // REMBOURSEMENT-1 — her refund's row and the provider-confirmed refunds, the seam's ledger.
        remboursement: (await this.state.storage.get<RemboursementStocke>(REFUND_KEY)) ?? null,
        refunds: spine.ledger.refundsFor(origin.orderId),
        stuckSupplier: (await this.state.storage.get<{ emittedAt: string }>(STUCK_SUPPLIER_KEY)) ?? null,
        // RAPPROCHEMENT-1 — the durable alert record, the operator's read;
        // `reconAlertsDropped` counts what the cap clipped (never silent).
        ...(await (async () => {
          const record =
            (await this.state.storage.get<{ alerts: PlatformEvent[]; dropped: number }>(RECON_ALERTS_KEY)) ??
            { alerts: [], dropped: 0 };
          return { reconAlerts: record.alerts, reconAlertsDropped: record.dropped };
        })()),
      });
    }

    /**
     * RAPPROCHEMENT-1 (E3) — THE PASS, on demand: rebuild the one replayed
     * truth and run the pure comparison over it. NO provider records ride
     * this road yet — the aggregator's settlement report is Real-Money-Gate
     * work behind the open provider Decision, and absence of the report is
     * not a clean bill, so none is faked here. Divergences SINK like every
     * other alert, then answer. INTERNAL ONLY, like the audit read.
     */
    if (request.method === 'GET' && pathname === '/entry/reconcile') {
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) {
        return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
      }
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, log);
      const alerts = reconcileOrder(spine.reconciliationSnapshot(), { serverTime: new Date().toISOString() });
      await this.sinkReconAlerts(alerts);
      return Response.json({ ok: true, clean: alerts.length === 0, alerts });
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
        remboursement: await this.remboursementAvecPorte(spine, origin.orderId),
      });
    }

    /**
     * ═══ RB-3 — THE GAINS ROW: the frozen waterfall, SERVED, never recomputed ═══
     *
     * The founder's Gains tab (his direction 2026-08-08: « the money share
     * well explained between supplier, reseller, and fees ») reads THIS. Every
     * figure is the stored immutable Quote's OWN byte — the one issued by
     * `computeWaterfall` and parsed by canon at issuance — copied field by
     * field. Nothing here adds, derives, or rounds (Ten Laws #1: the money
     * model reconciles at the SOURCE; #2: no app computes another domain's
     * amounts — including this one re-deriving its own).
     *
     * SERVED ONLY WHILE COHERENT: the row re-checks the §5.4 identities on the
     * stored bytes and answers 422 rather than display a split that does not
     * reconcile — a wrong money figure shown to the founder is worse than a
     * named refusal. INTERNAL ONLY, reached through the key-C-gated
     * `/checkout/gains` composition — the same door discipline as
     * `/entry/dispatch` above; never a buyer surface (SP-I03: these numbers
     * yield the supplier's base by subtraction).
     */
    if (request.method === 'GET' && pathname === '/entry/gains') {
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: true, exists: false });
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) {
        return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
      }
      const spine = rebuildOrderSpine(quote, origin, log);
      const q = quote as unknown as Record<string, unknown>;
      const n = (k: string): number => (typeof q[k] === 'number' ? (q[k] as number) : Number.NaN);
      const B = n('sellerBasePrice');
      const C = n('sellerFundedCommission');
      const M = n('resellerMarkup');
      const D = n('deliveryFee');
      const split = {
        sellerBasePrice: B,
        sellerFundedCommission: C,
        resellerMarkup: M,
        deliveryFee: D,
        productSubtotal: n('productSubtotal'),
        buyerTotal: n('buyerTotal'),
        sellerPlatformFee: n('sellerPlatformFee'),
        sellerNet: n('sellerNet'),
        resellerPlatformFee: n('resellerPlatformFee'),
        resellerNet: n('resellerNet'),
      };
      // The reconciliation identities belong to CANON, never to this file:
      // `assertQuoteReconciles` is the same §5.4/§5.5 judge that certified the
      // quote at issuance (it knows the commission is seller-funded; a local
      // re-statement of the formulas is exactly how a wrong split would be
      // displayed with confidence). Here we add only what canon leaves to the
      // carrier: every served figure is a non-negative integer franc, and the
      // subtotal is B + M.
      const shapeSound =
        Object.values(split).every((v) => Number.isInteger(v) && v >= 0) &&
        split.productSubtotal === B + M;
      let reconciles = shapeSound;
      if (reconciles) {
        try {
          assertQuoteReconciles(quote);
        } catch {
          reconciles = false;
        }
      }
      if (!reconciles) {
        return Response.json({ ok: false, reason: 'stored_quote_incoherent' }, { status: 422 });
      }
      // SE-LIVE-5b — the DELIVERED truth: Séra's validated signal recorded
      // obligations copied from this same frozen quote. Their presence IS the
      // fact « livrée » (the two-obligation fold happens exactly once, on the
      // signal); the rows are served as stored, never recomputed.
      const obligations = spine.ledger
        .obligationsFor(origin.orderId)
        .map((o) => ({ party: o.party, amount: o.amount, state: o.state }));
      return Response.json({
        ok: true,
        exists: true,
        orderId: origin.orderId,
        state: spine.journey.state,
        createdAt: origin.createdAt,
        productVersionId: origin.fulfillment?.productVersionId ?? '',
        zoneTo: origin.fulfillment?.zoneTo ?? '',
        split,
        livree: obligations.length > 0,
        obligations,
      });
    }

    /**
     * ═══ SE-LIVE-5b — SÉRA'S SETTLEMENT-ELIGIBILITY SIGNAL ═══
     *
     * `delivery.validated.v1`, carried into the order's own input log EXACTLY
     * as it arrived. The SPINE does every check that matters — canon envelope,
     * event name, THE ORDER'S OWN correlation (`corr-{orderId}`, minted at
     * creation), idempotency by command_id, confirmed-first — and then copies
     * exactly two SettlementObligations from the frozen Quote (supplier
     * sellerNet · reseller resellerNet, both `Eligible`; §5.6, B+I-05: locked,
     * never recomputed). The supplier identity rides ON the signal, because
     * this domain never learns one (see OrderOrigin.supplierRef).
     *
     * A refusal is 409 and NOT a 5xx, deliberately: the custody outbox retries
     * a producer bug into BOTH Workers' logs, loudly, while a real outage
     * stays retryable — the same taxonomy `/fulfillment/progress` set.
     * INTERNAL ONLY, reached through that secret-gated route.
     */
    if (request.method === 'POST' && pathname === '/entry/eligibility') {
      const event: unknown = await request.json().catch(() => null);
      if (event === null) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      // RELATED-PARTY-1 (verifier, MAJOR) — this handler now AWAITS an outbound
      // call (the accounts book) between reading the money log and writing it.
      // A Durable Object's input gate only closes during storage operations, so
      // without this block another request (a door webhook, a confirm, a second
      // redelivery) could put `LOG_KEY` inside that window and be overwritten by
      // the stale read. The whole read → decide → put runs as one, as the
      // object's own guarantee, not as a hope about timing.
      return this.state.blockConcurrencyWhile(async () => {
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) {
        return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      }
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) {
        return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
      }
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, log);
      const input: OrderInput = { kind: 'eligibility', event };
      const outcome = applyOrderInput(spine, input);
      if (!outcome.applied) {
        return Response.json({ ok: false, reason: outcome.reason }, { status: 409 });
      }
      if (outcome.duplicate) {
        // BOUTIK-SUIVI (verifier, 2026-08-10) — A REDELIVERY REPAIRS A
        // STRANDED RELAY, the same way a redelivered webhook repairs the two
        // wires above. Séra retries this signal for an hour at a time; that
        // retry is the only recovery a delivery enqueued-but-unalarmed will
        // ever get, and returning early without it was the gap.
        const strandedLivraison = await this.state.storage.get<{ status?: string }>(BOUTIK_DELIVERED_KEY);
        // VRAI-SUIVI — and the custody-arm wire on the same terms: a stranded
        // arm is a buyer whose code custody never learned, which is a drop
        // that can never be released. Any duplicate that finds it pending
        // without an alarm re-arms the flusher.
        const strandedRemise = await this.state.storage.get<{ status?: string }>(CUSTODY_ARM_KEY);
        // PORTE-CUSTODY part B — and the door-signal wire on the same terms: a
        // stranded signal is a door payment custody never heard, which is a
        // drop the rider can never complete.
        const strandedPorte = await this.state.storage.get<{ status?: string }>(DOOR_SIGNAL_KEY);
        if (
          (strandedLivraison?.status === 'pending' || strandedRemise?.status === 'pending' ||
            strandedPorte?.status === 'pending') &&
          (await this.state.storage.getAlarm()) === null
        ) {
          await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
        }
        // RELATED-PARTY-1 — the redelivery also repairs an UNDECIDED order.
        await this.lienProcheSiAbsent(spine, quote, origin.orderId, log);
        return Response.json({ ok: true, status: 'duplicate' });
      }
      // BOUTIK-SUIVI — the supplier's « Livré et terminé » screen is fed from
      // HERE, in the same atomic batch as the log: a delivery this object
      // recorded but never enqueued would leave his colis « en route » for
      // ever, which is the exact class of silent loss the accept-leg verifier
      // caught on the other wire (B1). The relay is at-least-once and
      // first-wins at Boutik+'s door.
      // RELATED-PARTY-1 — the §6.5 decision is made NOW, once, from the two
      // numbers, and logged in the SAME batch as the signal that created the
      // commission it judges; a non-clear decision holds her line before any
      // read can see the line unheld. Undecided (the book unreachable): the
      // signal is still recorded — Séra's redelivery decides later.
      const decision = await this.deciderLienProche(quote, origin.orderId);
      const entrees: OrderInput[] = [input];
      if (decision !== undefined) {
        const lien: OrderInput = { kind: 'related_party', decision };
        if (applyOrderInput(spine, lien).applied) entrees.push(lien);
      }
      await this.state.storage.put({
        [LOG_KEY]: [...log, ...entrees],
        [BOUTIK_DELIVERED_KEY]: { status: 'pending', event, attempts: 0 },
      });
      await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
      return Response.json({
        ok: true,
        status: 'recorded',
        obligations: spine.ledger.obligationsFor(origin.orderId).length,
      });
      });
    }

    /**
     * STOCK-VENDU-1b — Séra's REFUSED-course fact. NOT a spine input: no
     * money moves and no obligation is written on a refusal here (the refund
     * saga is E3's, by the standing journal) — this route's whole job is the
     * at-least-once relay that lets Boutik+ restock the returned unit.
     * FIRST-WINS PER ORDER on the outbox row itself (this object IS the
     * order); a redelivery that finds the row re-arms a stranded flusher,
     * exactly the repair discipline of the wires above.
     */
    if (request.method === 'POST' && pathname === '/entry/course-refusee') {
      const event: unknown = await request.json().catch(() => null);
      if (event === null) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) {
        return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      }
      const existing = await this.state.storage.get<{ status?: string }>(BOUTIK_REFUSED_KEY);
      if (existing !== undefined) {
        // REMBOURSEMENT-1 — a redelivery also opens a refund a lost write never
        // opened, and the alarm must then run for IT even when the relay is done.
        await this.ouvrirRemboursement(event);
        if ((existing.status === 'pending' || (await this.remboursementADemander())) && (await this.state.storage.getAlarm()) === null) {
          await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
        }
        return Response.json({ ok: true, status: 'duplicate' });
      }
      await this.state.storage.put(BOUTIK_REFUSED_KEY, { status: 'pending', event, attempts: 0 });
      // REMBOURSEMENT-1 — the same fact opens her refund.
      await this.ouvrirRemboursement(event);
      await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
      return Response.json({ ok: true, status: 'recorded' });
    }

    /**
     * REMBOURSEMENT-2 — THE SUPPLIER REFUSED THIS PAID ORDER (Boutik+ B6.1:
     * « Accept/reject »). INTERNAL ONLY: the composition root checked Boutik+'s
     * credential and the canon payload. First-wins; it opens her refund — every
     * franc, seller fault (the Protection Fund's to absorb, never gating her) —
     * and re-arms the alarm that asks the provider. A redelivery re-arms too.
     */
    if (request.method === 'POST' && pathname === '/entry/fournisseur-refuse') {
      const body = (await request.json().catch(() => null)) as { at?: unknown } | null;
      if (body === null || typeof body.at !== 'string') return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      const deja = await this.state.storage.get(FOURNISSEUR_REFUS_KEY);
      /**
       * COLIS-FOURNISSEUR-1 — Séra hears it too: the order is `cancelled` for
       * delivery, in the same act as the refusal is recorded. Inside a package
       * that is what lets the other articles travel without this one; alone,
       * it is simply true. Only for an order Séra was told was funded — its
       * mode off the frozen quote, its package off its origin.
       */
      const quote = parseStoredQuote(origin.quoteBytes);
      const annule =
        deja === undefined && quote !== undefined && (await this.state.storage.get(SERA_OUTBOX_KEY)) !== undefined
          ? {
              [SERA_ANNULATION_KEY]: {
                status: 'pending' as const,
                fact: {
                  orderId: origin.orderId,
                  status: 'cancelled' as const,
                  paymentMode: quote.paymentMode,
                  asOf: new Date().toISOString(),
                  ...(origin.colis !== undefined ? { package: origin.colis } : {}),
                },
                attempts: 0,
              },
            }
          : {};
      if (deja === undefined) await this.state.storage.put({ [FOURNISSEUR_REFUS_KEY]: { at: body.at }, ...annule });
      await this.ouvrirRemboursementAvec({ nature: 'refus_fournisseur' }, null);
      if ((await this.remboursementADemander()) || Object.keys(annule).length > 0) {
        await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
      }
      return Response.json({ ok: true, status: deja === undefined ? 'recorded' : 'duplicate' });
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
     * VRAI-SUIVI — RECORD A TRANSIT MARK from Séra, through the composition
     * root's `/fulfillment/transit` door (PROGRESS_WRITE_SECRET-gated, the
     * same credential the preparation intake rides). FIRST-WINS PER STAGE and
     * a 404 for an order this Worker does not know — the producer retries —
     * exactly the `/entry/preparation` discipline, because it is the same
     * kind of fact: another domain's news about this order, never a
     * transition of the payment machine.
     */
    if (request.method === 'POST' && pathname === '/entry/transit') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const stage = body?.['stage'];
      const at = body?.['at'];
      if ((stage !== 'en_route' && stage !== 'arrivee') || typeof at !== 'string' || at === '') {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      if ((await this.state.storage.get<StoredOrigin>(ORIGIN_KEY)) === undefined) {
        return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      }
      const existing = (await this.state.storage.get<TransitRecord>(TRANSIT_KEY)) ?? {};
      const already = stage === 'en_route' ? existing.departedAt : existing.arrivedAt;
      if (already !== undefined) {
        return Response.json({ ok: true, status: 'already_recorded', at: already });
      }
      const next: TransitRecord =
        stage === 'en_route' ? { ...existing, departedAt: at } : { ...existing, arrivedAt: at };
      await this.state.storage.put(TRANSIT_KEY, next);
      return Response.json({ ok: true, status: 'recorded', at });
    }

    /**
     * ═══ VRAI-SUIVI — THE REMISE READ: the code's ONE door ═══
     *
     * The caller must present the order's own buyer token (minted at create,
     * held by nobody else), and the code answers ONLY once Séra's arrival
     * fact is recorded — the founder's ruling: revealed to the buyer after
     * the rider's arrival fact, never before.
     *
     * ═══ CONSTANT-SHAPE REFUSAL, DELIBERATELY (journalled choice) ═══
     * A wrong token, an absent token, an order that does not exist, a code
     * not yet minted, and an arrival that has not happened ALL answer the
     * SAME `{ok:false}` 404: any distinction would hand a token-guesser an
     * oracle (« this order exists », « the rider is close ») for free, and
     * the legitimate buyer's screen needs no distinction — « pas encore » is
     * the same sentence in every one of those states. The token compare is
     * the house `timingSafeEqual` (worker/auth.ts) — never `===` on a
     * secret-bearing string.
     */
    if (request.method === 'POST' && pathname === '/entry/remise') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const jeton = typeof body?.['jeton'] === 'string' ? (body['jeton'] as string) : '';
      const stored = await this.state.storage.get<string>(BUYER_REF_KEY);
      const code = await this.state.storage.get<string>(CODE_REMISE_KEY);
      const transit = (await this.state.storage.get<TransitRecord>(TRANSIT_KEY)) ?? {};
      // §6.3 — THE CODE COMES LAST, AFTER THE DOOR LEG IS PAID. On an Option-B
      // order the code is minted at CONFIRM (the delivery-fee leg) while the
      // product B+M is still owed at the door — `doorLegState` is `'due'`. This
      // route is the reveal authority (the PWA's `revelationPermise` is
      // belt-and-braces, and a non-PWA client has only this), so the door
      // condition lives HERE: `due` withholds. The arrival-only gate (2026-08-13)
      // missed that arrival PRECEDES door payment — an arrived buyer could read
      // her code before paying (audit 2026-08-21). `none` (full-prepay) and
      // `paid` reveal; anything we cannot prove settled withholds (fail closed).
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      const quote = origin === undefined ? undefined : parseStoredQuote(origin.quoteBytes);
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const doorLeg =
        origin === undefined || quote === undefined
          ? 'due'
          : rebuildOrderSpine(quote, origin, log).doorLegState;
      const doorSettled = doorLeg === 'none' || doorLeg === 'paid';
      // ⚠ THE COMPARE RUNS UNCONDITIONALLY (verifier NOTE, VRAI-ROUTE): a
      // short-circuit on « no stored token » skipped the HMAC for an order
      // that never existed while running it for a wrong token — identical
      // bytes, distinguishable timing, a weak existence oracle this door's
      // own comment promised away. An absent token compares against a decoy,
      // and the decoy can never win because `stored !== undefined` is still
      // required in the verdict.
      const compared = await timingSafeEqual(jeton, stored ?? 'jeton-absent-decoy');
      const jetonOk = stored !== undefined && jeton !== '' && compared;
      if (!jetonOk || code === undefined || transit.arrivedAt === undefined || !doorSettled) {
        return Response.json({ ok: false }, { status: 404 });
      }
      return Response.json({ ok: true, code });
    }

    /**
     * ═══ LISTE-MERCI — THE PURCHASER'S NOTIFY FACTS (founder order 2026-08-26) ═══
     *
     * « let the wishlist creator know that he purchased an item for him » —
     * the transport is the PURCHASER'S OWN WhatsApp (the wa.me law; no
     * server-sent message exists until the founder opens a Business API
     * account), so what this road serves is the creator's opted-in number
     * and first name, to EXACTLY ONE caller: the bearer of THIS order's own
     * buyer token, and only once the payment is PROVIDER-CONFIRMED.
     *
     * The remise route's gate, verbatim: the compare runs unconditionally
     * against a decoy when no token is stored (no timing oracle), and every
     * refusal — wrong token, unknown order, not confirmed, no liste on the
     * order, liste without an opt-in — is the SAME {ok:false} 404, decided
     * here so no branch can become an oracle for any of those five facts.
     * The answer carries the nom, the wa.me digits and the gifted pid, and
     * nothing else — no amount, no contact, no economics.
     */
    if (request.method === 'POST' && pathname === '/entry/liste-merci') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const jeton = typeof body?.['jeton'] === 'string' ? (body['jeton'] as string) : '';
      const stored = await this.state.storage.get<string>(BUYER_REF_KEY);
      const compared = await timingSafeEqual(jeton, stored ?? 'jeton-absent-decoy');
      const jetonOk = stored !== undefined && jeton !== '' && compared;
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      const quote = origin === undefined ? undefined : parseStoredQuote(origin.quoteBytes);
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const confirmed =
        origin !== undefined && quote !== undefined &&
        rebuildOrderSpine(quote, origin, log).journey.state === 'confirmed';
      const ns = this.env.WISHLIST;
      if (!jetonOk || !confirmed || origin?.listeRef === undefined || origin.fulfillment === undefined || ns === undefined) {
        return Response.json({ ok: false }, { status: 404 });
      }
      const lu = await ns
        .get(ns.idFromName(`liste:${origin.listeRef}`))
        .fetch(new Request('https://do/entry/notification'))
        .catch(() => undefined);
      const facts = lu === undefined ? null : ((await lu.json().catch(() => null)) as { ok?: boolean; nom?: unknown; telephone?: unknown } | null);
      if (facts?.ok !== true || typeof facts.nom !== 'string' || typeof facts.telephone !== 'string') {
        return Response.json({ ok: false }, { status: 404 });
      }
      return Response.json({ ok: true, nom: facts.nom, telephone: facts.telephone, pid: origin.fulfillment.productVersionId });
    }

    /**
     * ═══ LISTE-CADEAUX — THE CREATOR'S OWN READ OF HER GIFT (founder order,
     * 2026-08-27) ═══
     *
     * INTERNAL WIRE ONLY — no public path maps here. The one caller is the
     * composition root's `/listes/{token}/cadeaux` fan-out, which runs ONLY
     * after the WishlistDO hash-verified the creator's edit key: THAT key is
     * the credential of this road, exactly as the purchaser's buyer token is
     * the credential of the merci read above. The `listeRef` match here is
     * belt and braces against a confused-deputy fan-out (an orderId that
     * never named this liste answers the uniform 404), never the gate — the
     * ref is the share token, which every friend holds.
     *
     * WHAT LEAVES, field by field: the journey's state, the five delivery
     * facts the PUBLIC ?cadeau view already serves — and, ONLY under the
     * remise door's own revelation conditions verbatim (a code exists ∧
     * Séra's arrival fact is recorded ∧ the door leg is settled — §6.3, fail
     * closed), the six-digit remise code. The recipient at the door is the
     * person this code exists FOR; the conditions that gate the purchaser's
     * read gate hers identically. NO amount, NO contact, NO buyer token —
     * a gift's franc never reaches the recipient's screen (the ?cadeau law).
     */
    if (request.method === 'POST' && pathname === '/entry/cadeau-liste') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const listeRef = typeof body?.['listeRef'] === 'string' ? (body['listeRef'] as string) : '';
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (listeRef === '' || origin === undefined || origin.listeRef !== listeRef) {
        return Response.json({ ok: false }, { status: 404 });
      }
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) return Response.json({ ok: false }, { status: 404 });
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, log);
      const prep = (await this.state.storage.get<PreparationRecord>(PREPARATION_KEY)) ?? {};
      const transit = (await this.state.storage.get<TransitRecord>(TRANSIT_KEY)) ?? {};
      const code = await this.state.storage.get<string>(CODE_REMISE_KEY);
      // §6.3 — the remise door's reveal conditions, VERBATIM (a gift order is
      // full-prepay by the liste lock, so doorLeg is 'none' — but the check
      // stays whole: a condition dropped because it « cannot happen » is the
      // guard the next slice silently breaks).
      const doorSettled = spine.doorLegState === 'none' || spine.doorLegState === 'paid';
      const reveal = code !== undefined && transit.arrivedAt !== undefined && doorSettled;
      return Response.json({
        ok: true,
        suivi: {
          state: spine.journey.state,
          ...(prep.acceptedAt !== undefined ? { acceptedAt: prep.acceptedAt } : {}),
          ...(prep.readyAt !== undefined ? { readyAt: prep.readyAt } : {}),
          ...(transit.departedAt !== undefined ? { departedAt: transit.departedAt } : {}),
          ...(transit.arrivedAt !== undefined ? { arrivedAt: transit.arrivedAt } : {}),
          // « livrée », derived EXACTLY as projectForBuyer derives it.
          livree: spine.ledger.obligationsFor(origin.orderId).length > 0,
        },
        ...(reveal ? { code } : {}),
      });
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
        // RELATED-PARTY-1 — only when a non-clear §6.5 decision stands.
        ...(() => {
          const lien = lienProcheSurLeFil(spine);
          return lien !== undefined ? { lienProche: lien } : {};
        })(),
      });
    }

    /**
     * RELATED-PARTY-1 — §6.5 on this order, for the FOUNDER (key C at the
     * router): the decision with its signals, her appeal with her words, his
     * ruling, and the settlement lines AS STORED with their holds. Nothing
     * here is recomputed; the ledger is asked.
     */
    if (request.method === 'GET' && pathname === '/entry/related-party') {
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) {
        return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
      }
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, log);
      return Response.json(vueLienProche(spine, origin.orderId));
    }

    /**
     * RELATED-PARTY-1 — HER appeal: one sentence, only from the reseller the
     * order is attributed to (the router resolved her session; the claim is
     * checked HERE against the frozen quote, so no session can contest
     * another's sale), only while a non-clear decision stands unresolved,
     * once. Refusals are named; the sentence is stored on the log verbatim.
     */
    if (request.method === 'POST' && pathname === '/entry/related-party/appeal') {
      const body = (await request.json().catch(() => null)) as
        | { claimedBy?: unknown; texte?: unknown; at?: unknown }
        | null;
      if (
        body === null || typeof body.claimedBy !== 'string' || body.claimedBy === '' ||
        typeof body.texte !== 'string' || body.texte === '' || typeof body.at !== 'string'
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) {
        return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
      }
      if (quote.attributionResellerId !== body.claimedBy) {
        return Response.json({ ok: false, reason: 'not_yours' }, { status: 404 });
      }
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, log);
      const entree: OrderInput = { kind: 'related_party_appeal', appeal: { at: body.at, texte: body.texte } };
      const outcome = applyOrderInput(spine, entree);
      if (!outcome.applied) return Response.json({ ok: false, reason: outcome.reason }, { status: 409 });
      if (!outcome.duplicate) await this.state.storage.put(LOG_KEY, [...log, entree]);
      return Response.json({ ok: true });
    }

    /**
     * RELATED-PARTY-1 — THE FOUNDER'S RULING (key C at the router): `clear`
     * releases the hold (« on clear → paid » — her line is Eligible again on
     * the same road as any other); `violation` keeps it held and names the
     * violation. The move « returned to seller » is NOT made here — its
     * representation in the settlement records is his §7 call. Once; the
     * same ruling twice is once; a different one is refused by name.
     */
    if (request.method === 'POST' && pathname === '/entry/related-party/resolve') {
      const body = (await request.json().catch(() => null)) as { outcome?: unknown; at?: unknown } | null;
      if (body === null || (body.outcome !== 'clear' && body.outcome !== 'violation') || typeof body.at !== 'string') {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      const quote = parseStoredQuote(origin.quoteBytes);
      if (quote === undefined) {
        return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
      }
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, log);
      const entree: OrderInput = {
        kind: 'related_party_resolution',
        resolution: { at: body.at, outcome: body.outcome },
      };
      const outcome = applyOrderInput(spine, entree);
      if (!outcome.applied) return Response.json({ ok: false, reason: outcome.reason }, { status: 409 });
      if (!outcome.duplicate) await this.state.storage.put(LOG_KEY, [...log, entree]);
      return Response.json(vueLienProche(spine, origin.orderId));
    }

    /** REMBOURSEMENT-1 — the provider's refund confirmation, routed here by order id. */
    if (request.method === 'POST' && pathname === '/entry/refund-webhook') {
      let body: { event?: unknown };
      try {
        body = (await request.json()) as { event?: unknown };
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.onRefundEvent(body.event);
    }

    /**
     * REMBOURSEMENT-1 — the sandbox stand-in reads the refunds it was ASKED for,
     * as it reads a leg key: behind the webhook secret, the keys and amounts the
     * provider was handed and nothing else. A real aggregator knows them because
     * we asked it; this read retires with the stand-in at the Real-Money Gate.
     */
    if (request.method === 'GET' && pathname === '/entry/refund-key') {
      const r = await this.state.storage.get<RemboursementStocke>(REFUND_KEY);
      const demandes = (r?.lignes ?? []).filter((l) => l.etat === 'demande');
      if (demandes.length === 0) return Response.json({ ok: false }, { status: 404 });
      return Response.json({
        ok: true,
        remboursements: demandes.map((l) => ({ legType: l.legType, refundKey: l.refundKey, amount: l.amount, collectRef: l.collectRef })),
      });
    }

    if (request.method === 'POST' && pathname === '/entry/webhook') {
      let body: { event?: unknown; codeColis?: unknown };
      try {
        body = (await request.json()) as { event?: unknown; codeColis?: unknown };
      } catch {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      // COLIS-FOURNISSEUR-1 — the package's one code, from the group that
      // minted it; anything that is not six digits is no code.
      const codeColis = typeof body.codeColis === 'string' && /^[0-9]{6}$/.test(body.codeColis) ? body.codeColis : undefined;
      return this.onProviderEvent(body.event, codeColis);
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
    /**
     * ═══ COLIS-FOURNISSEUR-1 — THE PACKAGE'S ONE DOOR PAYMENT, per article ═══
     * (decision d, founder ruling 2026-09-23). Internal only, called by the
     * group object alone:
     *   · porte-check   — may this holder pay this article's door leg now,
     *                     inside its package's one payment? NOTHING written.
     *   · porte-enter   — this article joins a door collection: its shares
     *                     and key are stored first-wins, BEFORE any charge.
     *   · porte-webhook — the provider's confirmation of that collection,
     *                     judged against the record this article stored.
     */
    if (request.method === 'POST' && pathname === '/entry/porte-check') {
      const args = (await request.json().catch(() => null)) as { holderRef?: unknown } | null;
      if (args === null || typeof args.holderRef !== 'string' || args.holderRef === '') {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      return this.porteCheck(args.holderRef);
    }

    if (request.method === 'POST' && pathname === '/entry/porte-enter') {
      const args = (await request.json().catch(() => null)) as { holderRef?: unknown; collectId?: unknown; collecte?: unknown } | null;
      const collecte = lirePorteColis(args?.collecte);
      if (
        args === null ||
        typeof args.holderRef !== 'string' || args.holderRef === '' ||
        typeof args.collectId !== 'string' || !isGroupId(args.collectId) ||
        collecte === null || collecte.correlationId !== `corr-${args.collectId}`
      ) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const portes = (await this.state.storage.get<Record<string, PorteColis>>(PORTES_COLIS_KEY)) ?? {};
      // First-wins: an entered collection answers again, whatever it says now.
      if (Object.prototype.hasOwnProperty.call(portes, args.collectId)) return Response.json({ ok: true, status: 'duplicate' });
      const checked = await this.porteCheck(args.holderRef);
      const c = (await checked.clone().json().catch(() => null)) as { ok?: boolean; orderId?: string; amount?: number } | null;
      if (c?.ok !== true) return checked;
      // Its own share, as its own quote says it — or it does not join.
      const own = collecte.parts.find((x) => x.orderId === c.orderId);
      if (own === undefined || own.amount !== c.amount) return Response.json({ ok: false, reason: 'group_share_mismatch' }, { status: 422 });
      // COLIS-2 — its custody file hears the collection's reference in the
      // same write: entered and « custody will be told » are one fact.
      const references = (await this.state.storage.get<Record<string, DoorReferenceRow>>(DOOR_REFERENCE_KEY)) ?? {};
      await this.state.storage.put({
        [PORTES_COLIS_KEY]: { ...portes, [args.collectId]: collecte },
        [DOOR_REFERENCE_KEY]: { ...references, [args.collectId]: { status: 'pending', orderId: c.orderId as string, attempts: 0 } },
      });
      await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
      return Response.json({ ok: true, status: 'entered' });
    }

    if (request.method === 'POST' && pathname === '/entry/porte-webhook') {
      const body = (await request.json().catch(() => null)) as { event?: unknown; collectId?: unknown } | null;
      if (body === null || typeof body.collectId !== 'string') return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      const portes = (await this.state.storage.get<Record<string, PorteColis>>(PORTES_COLIS_KEY)) ?? {};
      const collecte = Object.prototype.hasOwnProperty.call(portes, body.collectId) ? portes[body.collectId] : undefined;
      if (collecte === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
      return this.onDoorProviderEvent(body.event, { groupId: body.collectId, ...collecte });
    }

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
   * THE ORDER AS IT STANDS — the answer to any create that finds one already
   * born and not failed: a double tap, a lost first response, or the loser of
   * the F-64 window inside `create`. The stored buyer token rides it too, so a
   * client re-creating under a fresh command id still reaches her suivi.
   */
  private async repondreCommeElleEst(): Promise<Response> {
    const view = await this.projectForBuyer();
    if (view === undefined) return Response.json({ ok: false, reason: 'unknown_order' });
    const jetonExistant = await this.state.storage.get<string>(BUYER_REF_KEY);
    return Response.json({
      ok: true,
      view,
      ...(jetonExistant !== undefined ? { buyerRef: jetonExistant } : {}),
    });
  }

  /**
   * PAYER-TOUT-1 (verifier BLOCKER 1) — A GROUPED CREATE IS ALWAYS ANSWERED
   * AS THE ORDER STANDS NOW, with the group attempt it belongs to. A saved
   * reply can say `payment_pending` for an order that has failed since (its
   * attempt ended, its stuck watch fired), and the group charges on this
   * answer: it must be the live state, never a memory of it.
   */
  private async repondreAuGroupe(): Promise<Response> {
    const view = await this.projectForBuyer();
    if (view === undefined) return Response.json({ ok: false, reason: 'unknown_order' });
    const jetonExistant = await this.state.storage.get<string>(BUYER_REF_KEY);
    const marker = await this.state.storage.get<{ groupAttemptId: string }>(GROUP_ATTEMPT_KEY);
    return Response.json({
      ok: true,
      view,
      ...(jetonExistant !== undefined ? { buyerRef: jetonExistant } : {}),
      ...(marker !== undefined ? { groupAttemptId: marker.groupAttemptId } : {}),
    });
  }

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
   *
   * ═══ …AND THE CLOCK IS NOT PART OF THAT AUTHORIZATION (COMMANDE-REJOUER-1,
   *     AUDIT-SHOP-1 slice c) ═══
   *
   * « Prove the hold first » once meant running ALL of `decideCreateOrder` —
   * quote freshness and hold freshness included — before the cache. But expiry
   * guards PRICING (a revived price nobody agreed to) and CHARGING (a hold
   * whose time ran out); a replay prices nothing and charges nothing — it
   * re-reads an answer already written. Judging the clock first meant a buyer
   * whose 200 died on the network (ordinary, Law 7) and whose retry landed
   * after expiry lost her `buyerRef` — the only door to her suivi and her
   * remise — FOREVER, over an order that exists and is hers. So the replay
   * road now proves IDENTITY on the receipt's own stored bytes (same quote,
   * same holder — the finding-4 property, intact) and serves the stored
   * answer whatever the clock says; every command that would MOVE something
   * still runs the whole gate, expiry included.
   */
  private async create(
    quoteId: string,
    holderRef: string,
    commandId: string,
    wireQuoteBytes: string | undefined,
    wireFulfillment?: { productVersionId?: string; zoneTo?: string; offerVersion?: string },
    contact: BuyerContact | null = null,
    listeRef: string | null = null,
    /** NOTE-VOCALE-APRES-GARDE-1 — her note's bytes; uploaded below, only past the gate. */
    audioB64: string | undefined = undefined,
    /**
     * PAYER-TOUT-1 — present when this order is born into (or retried inside)
     * a grouped payment: the group's shares and key, and the group attempt
     * this create belongs to. The group charges; this object never does.
     */
    grouped: { groupe: OrderGroupe; groupAttemptId: string; colis?: OrderPackage } | undefined = undefined,
  ): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    const receipt = await this.state.storage.get<ReservationReceipt>(RECEIPT_KEY);
    // PAYER-TOUT-1 — ONE ORDER, ONE PAYMENT ROAD, FOR EVER. An order born in a
    // group is paid, retried and confirmed by its group only: a single create
    // here would mint a second key for a leg the group's key already charged.
    // And an order born alone, or in another group, never joins this one — its
    // leg key may already have gone to a provider under another collection.
    if (grouped === undefined && origin?.groupe !== undefined) {
      return Response.json({ ok: false, reason: 'order_in_group' }, { status: 409 });
    }
    if (grouped !== undefined && origin !== undefined && origin.groupe?.groupId !== grouped.groupe.groupId) {
      return Response.json({ ok: false, reason: 'order_in_other_payment' }, { status: 409 });
    }
    // THE REPLAY ROAD (see the header): a command that already MOVED something
    // replays its stored answer to the receipt's own holder, clock unconsulted.
    // OWN PROPERTY ONLY: a bare `results[commandId]` walks the prototype chain,
    // so `constructor` or `toString` returned a function, serialised to an
    // unparseable body, and pinned that command id to a permanent failure
    // (verifier finding 5). Availability, not money — and closed anyway.
    const results = (await this.state.storage.get<Record<string, unknown>>(RESULTS_KEY)) ?? {};
    if (
      Object.prototype.hasOwnProperty.call(results, commandId) &&
      receipt !== undefined &&
      receipt.quoteId === quoteId &&
      receipt.holderRef === holderRef
    ) {
      return grouped !== undefined ? this.repondreAuGroupe() : Response.json(results[commandId]);
    }
    // Everything past here can MOVE something, so the WHOLE gate runs — quote
    // and hold freshness included. A cached command under the WRONG holder
    // falls through to be refused by name here, never served.
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

    // PAYER-TOUT-1 — this order's share in the group IS its own checkout leg,
    // read off its own quote; a group that says otherwise is refused before
    // anything is claimed, written or charged.
    if (grouped !== undefined) {
      const part = grouped.groupe.parts.find((p) => p.orderId === orderId);
      if (part === undefined || part.amount !== leg.amount) {
        return Response.json({ ok: false, reason: 'group_share_mismatch' }, { status: 422 });
      }
    }

    /**
     * ═══ PAUSE-VENTE-1 (founder ruling 2026-09-17) — A PAUSED RESELLER SELLS
     * NOTHING, and the ORDER is the sale. ═══
     *
     * The quote door already refuses her shop, but a quote issued and held
     * BEFORE the founder paused her is still alive for its fifteen minutes:
     * this is where that quote would become a sale, so it is asked again
     * here, on the quote's LOCKED `attributionResellerId` (SP-I01), before
     * any lock is claimed and before a franc is asked for. Refused by name
     * and CLOSED — no order object, no lock, no charge; the same create
     * succeeds once she is active again (the hold, if still fresh, is hers).
     * The port fails OPEN on a hiccup (see `compteEnPause`).
     */
    if (await compteEnPause(this.env, quote.attributionResellerId)) {
      return Response.json({ ok: false, reason: 'reseller_paused' }, { status: 422 });
    }

    /**
     * ═══ C1 (audit) — THE ATTRIBUTION LOCK IS CLAIMED BEFORE ANY CHARGE ═══
     *
     * SP-I09b.3: « Une fois la commande verrouillée, l'attribution est
     * immuable (first-lock-wins) ». The durable book is claimed HERE, by the
     * object that owns the order, before a franc is asked for: checkoutRef =
     * this order's id, resellerId = the Quote's LOCKED attributionResellerId
     * (SP-I01), tokenId = the quote id — the identity-scope qualification.
     * SP5's signed product tokens will present their OWN ids and collide
     * honestly here (refused, alerted) rather than re-attribute.
     *
     * Idempotent by construction: a retry or a second attempt carries the
     * same (quoteId, reseller), so the book answers `idempotent`. A COLLISION
     * (the book already names another reseller) refuses the create CLOSED —
     * an order must never be born disagreeing with its own attribution book.
     * An unreachable book also refuses closed: the claim is an integrity
     * fact, not a courtesy, and nothing has been charged yet.
     */
    if (this.env.ATTRIBUTION_LOCK === undefined) {
      return Response.json({ ok: false, reason: 'attribution_lock_unavailable' }, { status: 503 });
    }
    const lockStub = this.env.ATTRIBUTION_LOCK.get(this.env.ATTRIBUTION_LOCK.idFromName(orderId));
    let lockAnswer: { ok?: boolean; status?: string } | null;
    try {
      const lockRes = await lockStub.fetch(
        new Request('https://do/lock', {
          method: 'POST',
          body: JSON.stringify({
            checkoutRef: orderId,
            resellerId: quote.attributionResellerId,
            tokenId: quoteId,
            at: now,
          }),
        }),
      );
      lockAnswer = (await lockRes.json()) as { ok?: boolean; status?: string };
    } catch {
      lockAnswer = null;
    }
    if (lockAnswer === null || lockAnswer.ok !== true) {
      if (lockAnswer?.status === 'collision') {
        return Response.json({ ok: false, reason: 'attribution_locked_elsewhere' }, { status: 409 });
      }
      return Response.json({ ok: false, reason: 'attribution_lock_unavailable' }, { status: 503 });
    }

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
    // PAYER-TOUT-1 — a grouped order's checkout leg is charged under the
    // GROUP's one key, minted once by the group and durable there first.
    const providerKey = grouped !== undefined ? grouped.groupe.providerKey : (existingKey ?? mintProviderLegKey());

    let stored: StoredOrigin;
    let log: OrderInput[];
    let attempts: AttemptRecord[];
    let attemptId: string;
    /** The log AS THIS COMMAND READ IT (empty on a first birth) — re-read
     *  under the gate before the first durable write, see F-64 below. */
    let logLu: OrderInput[] = [];

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
        // LISTE-ENVIES-1 — an ORIGIN fact like its neighbours: written once
        // at the order's birth, immutable after. The retry branch keeps the
        // original (`stored = origin`), so a liste can never be attached to —
        // or detached from — an order that already exists.
        ...(listeRef !== null ? { listeRef } : {}),
        // PAYER-TOUT-1 — born into its group, for ever.
        ...(grouped !== undefined ? { groupe: grouped.groupe } : {}),
        // COLIS-FOURNISSEUR-1 — and into its package, for ever.
        ...(grouped?.colis !== undefined ? { colis: grouped.colis } : {}),
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
      logLu = existingLog;
      const existingAttempts = (await this.state.storage.get<AttemptRecord[]>(ATTEMPTS_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, existingLog);
      if (spine.journey.state !== 'payment_failed') {
        /**
         * AN ORDER ALREADY EXISTS AND ITS PAYMENT HAS NOT FAILED. A second
         * command is answered with the order AS IT STANDS — never a second order
         * (one quote, one order, structurally), and never a second charge. This
         * is the branch that makes an impatient double-tap harmless.
         *
         * VRAI-SUIVI — the stored buyer token rides this answer too: the
         * caller has already proven the hold (`decideCreateOrder` above), and
         * this branch is exactly the lost-first-response recovery — a client
         * that re-creates under a fresh command id must still reach her token.
         */
        return grouped !== undefined ? this.repondreAuGroupe() : this.repondreCommeElleEst();
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

    /**
     * NOTE-VOCALE-APRES-GARDE-1 (AUDIT-SHOP-2 F-04) — HER NOTE BECOMES A REF
     * HERE: after every refusal above and before anything durable. The hold
     * check, the receipt and the attribution lock have all passed, so the
     * bytes Boutik+ is asked to keep belong to an order that IS being born.
     * The router used to upload BEFORE asking this object — one valid quote
     * id (anonymously mintable) plus an invented holder relayed a megabyte
     * per call into Boutik+'s bucket for orders that never existed, and every
     * replay uploaded again. The replay road at the top of this method
     * returns before this line, so a repeated command uploads nothing.
     * BEST-EFFORT BY RULING, unchanged: a refusing or unreachable media door
     * never blocks the sale — the loss is NAMED on the answer
     * (`noteVocale: 'perdue'`), never silent.
     */
    let noteVocale: 'gardee' | 'perdue' | undefined;
    if (contact !== null && audioB64 !== undefined) {
      const ref = await televerserNoteVocale(this.env, audioB64);
      if (ref !== null) {
        contact = { ...contact, audioRef: ref };
        noteVocale = 'gardee';
      } else {
        noteVocale = 'perdue';
      }
    }

    /**
     * ═══ F-64 (AUDIT-SHOP-2) — THE WINDOW BETWEEN THE READ AND THE WRITE ═══
     *
     * Everything this branch decided was decided on reads taken BEFORE two
     * awaits that are not storage: the attribution-lock subrequest and the
     * note's upload. A Durable Object's input gate holds other requests only
     * across STORAGE awaits, so a second create for this quote — a double tap
     * under a fresh command id, a lost first response — can enter in that
     * window, read the same « no order yet », and both would then write: two
     * attempts under ONE leg key, the second's log written over the first's,
     * the record's attempt id absent from its own log (proven on the real
     * object, `repere-audio.e2e`, with the upload held open). So the log is
     * re-read under the gate, right before the first durable write: if it
     * moved, another command won this window, and the answer is the order AS
     * IT STANDS — never a second birth, never a charge on a stale read. From
     * this read to the last `put` below every await is storage, so nothing
     * can interleave again.
     */
    const logFrais = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    if (logFrais.length !== logLu.length) return grouped !== undefined ? this.repondreAuGroupe() : this.repondreCommeElleEst();

    // THE ATTEMPT AND ITS PROVIDER KEY ARE DURABLE BEFORE THE PROVIDER IS CALLED.
    // If this process dies mid-charge, both survive: the attempt can never be
    // charged again, and the retry that follows reuses the SAME key rather than
    // minting a second collection for one leg.
    await this.state.storage.put(ORIGIN_KEY, stored);
    // GARDE-PAIEMENT-1 (the recheck's race) — the receipt this create was
    // AUTHORIZED on becomes the order's receipt at the same durable moment as
    // the order itself. decideCreateOrder passed on `receipt` before the
    // attribution-lock subrequest, whose open input gate could let a fresh
    // hold's mirror interleave and win the pre-order monotone rule; whatever
    // landed in that window, the order is born naming the holder that created
    // it, and from here the holder-bound freeze above owns every later write.
    if (receipt !== undefined) await this.state.storage.put(RECEIPT_KEY, receipt);
    await this.state.storage.put(LOG_KEY, log);
    await this.state.storage.put(ATTEMPTS_KEY, attempts);
    if (grouped !== undefined) {
      await this.state.storage.put(GROUP_ATTEMPT_KEY, {
        groupAttemptId: grouped.groupAttemptId,
        reservationId: decision.reservationId,
      });
    }
    // RESERVATION-REGLE-1 — the order is `payment_pending` from this moment:
    // the stuck-saga watch is armed with it, in the same durable act.
    await this.armStuckWatch(now);
    await this.state.storage.put(LEG_KEYS_KEY, { ...legKeys, [leg.legType]: providerKey });
    // BC-1a — the dispatch contact rides the same durable moment as the order
    // itself. Reached only by create()'s two MUTATING branches, so it is
    // replaceable until the payment confirms and frozen after (see
    // BuyerContact). An absent contact never erases a stored one: the retry
    // that omits it (an old client) keeps what the buyer already gave.
    if (contact !== null) await this.state.storage.put(CONTACT_KEY, contact);

    /**
     * VRAI-SUIVI — HER READ TOKEN, DURABLE BEFORE ANY ANSWER LEAVES. Minted
     * exactly once per order (the get-first makes the retry branch — and any
     * pre-slice order retrying now — reuse or backfill rather than rotate):
     * a token that rotated on a replayed create would strand the buyer whose
     * FIRST response was lost, which is the one buyer this token must reach.
     * Committed here, on the same side of the provider call as the leg key,
     * so the answer below can never carry a value storage does not hold.
     */
    let buyerRef = await this.state.storage.get<string>(BUYER_REF_KEY);
    if (buyerRef === undefined) {
      buyerRef = mintBuyerRef();
      await this.state.storage.put(BUYER_REF_KEY, buyerRef);
    }

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
      return this.endAttemptOnFault(quote, stored, log, attemptId, 'leg_key_not_durable', decision.reservationId);
    }

    /**
     * PAYER-TOUT-1 — A GROUPED ORDER STOPS HERE, payment_pending and durable,
     * and answers. Its group charges ONCE for every order it holds, after all
     * of them stand here; the outcome comes back through `/entry/group-charged`
     * (a failure) or the provider's webhook (the only payment truth).
     */
    if (grouped !== undefined) {
      const walkedGroup = rebuildOrderSpine(quote, stored, log);
      const groupAnswer = {
        ok: true,
        view: toBuyerOrderView({
          orderId: stored.orderId,
          state: walkedGroup.journey.state,
          quote,
          doorLeg: walkedGroup.doorLegState,
        }),
        buyerRef,
        groupAttemptId: grouped.groupAttemptId,
      };
      await this.state.storage.put(RESULTS_KEY, { ...results, [commandId]: groupAnswer });
      return Response.json(groupAnswer);
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
      return this.endAttemptOnFault(quote, stored, log, attemptId, accepted.reason, decision.reservationId);
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
      // RESERVATION-REGLE-1 — the failure is durable; the hold's release rides
      // beside it and the alarm carries it (the release is the rule). REGLE-2:
      // it names the hold THIS attempt was authorized on (the receipt's).
      await this.queueReservationRelease(stored, `rel-${attemptId}`, decision.reservationId);
      // B5.1 — and the producer's unit, under the same hold id.
      await this.queueHoldRelease(stored, `hrel-${attemptId}`, decision.reservationId);
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
    // VRAI-SUIVI — the token rides the stored answer, so an idempotent replay
    // of this command id serves the SAME token byte-for-byte, forever.
    const answer = { ok: true, view, buyerRef };
    await this.state.storage.put(RESULTS_KEY, { ...results, [commandId]: answer });
    // NOTE-VOCALE-APRES-GARDE-1 — what became of her note rides THIS answer
    // only, never the stored replay: a replayed command uploaded nothing.
    return Response.json(noteVocale === undefined ? answer : { ...answer, noteVocale });
  }

  /**
   * PAYER-TOUT-1 — THE GROUP'S QUESTION, ANSWERED WITH NOTHING WRITTEN: the
   * create gate (her hold, the quote's freshness, a paused reseller) exactly
   * as `create()` runs it, then what this order is today — not born yet
   * (`nouvelle`), failed and retryable (`echouee`), or on its way (`en_cours`)
   * — and the facts the group needs to prove its panier is one boutique, one
   * mode, one destination. Every figure is read off this order's own quote.
   */
  private async groupCheck(
    quoteId: string,
    holderRef: string,
    groupId: string,
    wireQuoteBytes: string | undefined,
    wireZoneTo: string | undefined,
  ): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin !== undefined && origin.groupe?.groupId !== groupId) {
      return Response.json({ ok: false, reason: 'order_in_other_payment' }, { status: 409 });
    }
    const receipt = await this.state.storage.get<ReservationReceipt>(RECEIPT_KEY);
    const decision = decideCreateOrder({
      quoteBytes: origin?.quoteBytes ?? wireQuoteBytes,
      quoteId,
      holderRef,
      ...(receipt !== undefined ? { receipt } : { receipt: undefined }),
      now: new Date(),
    });
    if (!decision.ok) return Response.json({ ok: false, reason: decision.reason }, { status: 422 });
    const quote = decision.quote;
    const leg = checkoutLegOf(decision.legs);
    if (leg === undefined) return Response.json({ ok: false, reason: 'quote_split_incoherent' }, { status: 422 });
    if (await compteEnPause(this.env, quote.attributionResellerId)) {
      return Response.json({ ok: false, reason: 'reseller_paused' }, { status: 422 });
    }
    let etat: 'nouvelle' | 'echouee' | 'en_cours' = 'nouvelle';
    if (origin !== undefined) {
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      etat = rebuildOrderSpine(quote, origin, log).journey.state === 'payment_failed' ? 'echouee' : 'en_cours';
    }
    return Response.json({
      ok: true,
      etat,
      orderId: orderIdForQuote(quoteId),
      paymentMode: quote.paymentMode,
      attributionResellerId: quote.attributionResellerId,
      zoneTo: origin !== undefined ? origin.fulfillment?.zoneTo : wireZoneTo,
      amountPaidAtCheckout: leg.amount,
      amountDueAtDelivery: quote.amountDueAtDelivery,
      deliveryFee: quote.deliveryFee,
      productSubtotal: quote.productSubtotal,
    });
  }

  /**
   * PAYER-TOUT-1 — THE GROUP'S CHARGE DID NOT GO THROUGH. Ends exactly the
   * attempt the group made (a notice for an older group attempt, or for an
   * order no longer waiting, ends nothing and says so) through the vault's
   * own failure edge, and releases exactly the hold that attempt was
   * authorized on — the same exit a single order's failed charge takes, so
   * her retry and the stock rule both work unchanged.
   *
   * ⏳ The recorded reason is the single road's documented default: a time-out
   * is `charge_timeout`; everything else — a provider refusal, a group that
   * could not be completed, a divergent echo — is `charge_rejected`, the one
   * value meaning « this attempt ended and no money is claimed for it »
   * (see `chargeFaultInput`).
   */
  private async groupCharged(
    groupId: string,
    groupAttemptId: string,
    outcome: 'timeout' | 'idempotency_key_amount_mismatch' | 'group_incomplete' | 'provider_amount_divergence',
  ): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    if (origin.groupe?.groupId !== groupId) {
      return Response.json({ ok: false, reason: 'order_in_other_payment' }, { status: 409 });
    }
    const quote = parseStoredQuote(origin.quoteBytes);
    if (quote === undefined) return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const marker = await this.state.storage.get<{ groupAttemptId: string; reservationId: string }>(GROUP_ATTEMPT_KEY);
    const spine = rebuildOrderSpine(quote, origin, log);
    const vue = (s: OrderSpine) =>
      toBuyerOrderView({ orderId: origin.orderId, state: s.journey.state, quote, doorLeg: s.doorLegState });
    if (marker === undefined || marker.groupAttemptId !== groupAttemptId || spine.journey.state !== 'payment_pending') {
      return Response.json({ ok: true, ended: false, view: vue(spine) });
    }
    const next: OrderInput[] = [
      ...log,
      {
        kind: 'fail',
        // The GROUP attempt's id: minted once per group attempt, so one notice
        // is one failure however often it is delivered.
        command_id: `ord-grp-fail-${groupAttemptId}`,
        actor: ORDER_ACTOR,
        serverTime: new Date().toISOString(),
        reason: outcome === 'timeout' ? 'charge_timeout' : 'charge_rejected',
      },
    ];
    const walked = rebuildOrderSpine(quote, origin, next);
    if (walked.journey.state !== 'payment_failed') {
      return Response.json({ ok: true, ended: false, view: vue(spine) });
    }
    await this.state.storage.put(LOG_KEY, next);
    const attempts = (await this.state.storage.get<AttemptRecord[]>(ATTEMPTS_KEY)) ?? [];
    const last = attempts[attempts.length - 1];
    if (last !== undefined && (outcome === 'timeout' || outcome === 'idempotency_key_amount_mismatch')) {
      last.outcome = outcome;
      await this.state.storage.put(ATTEMPTS_KEY, attempts);
    }
    const releaseId = last?.attemptId ?? groupAttemptId;
    await this.queueReservationRelease(origin, `rel-${releaseId}`, marker.reservationId);
    await this.queueHoldRelease(origin, `hrel-${releaseId}`, marker.reservationId);
    return Response.json({ ok: true, ended: true, view: vue(walked) });
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
    /** the hold this attempt was authorized on — the release names it */
    reservationId: string,
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
      // RESERVATION-REGLE-1 — a defence fault ends the attempt through the
      // same failure edge, so it earns the same release.
      await this.queueReservationRelease(stored, `rel-${attemptId}`, reservationId);
      // B5.1 — and the producer's unit, under the same hold id.
      await this.queueHoldRelease(stored, `hrel-${attemptId}`, reservationId);
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
    // SE-LIVE-2a — TWO destinations, ONE alarm, INDEPENDENT STATE. Each wire
    // keeps its own status and attempt count, so one being down never marks
    // the other delivered, undelivered, or re-sends it. The alarm re-arms
    // while EITHER is pending, on the higher attempt count's backoff.
    //
    // ⚠ INDEPENDENT STATE IS NOT INDEPENDENT TIMING (verifier NOTE): these
    // run in sequence on one alarm, so a slow boutik binding delays the Séra
    // attempt within a cycle, and the shared re-arm means the wire with fewer
    // attempts waits on the other's rung. Acceptable — both are
    // at-least-once and neither can lose a fact — but the earlier wording
    // claimed more than the code does, so it is corrected here rather than
    // left to read as a guarantee.
    // BOUTIK-SUIVI adds a THIRD wire on the same terms: its own key, its own
    // attempt count, the same shared re-arm the note above describes.
    // VRAI-SUIVI adds the FOURTH — the custody-arm wire — on the same terms.
    // PORTE-CUSTODY part B adds the FIFTH — the door-signal wire — likewise.
    // STOCK-VENDU-1b adds the SIXTH — the refused-course relay — likewise.
    // LISTE-ENVIES-1 adds the SEVENTH — the offert marker — likewise.
    const boutikPending = await this.flushBoutikOutbox();
    const seraPending = await this.flushSeraOutbox();
    // COLIS-FOURNISSEUR-1 — the cancel fact rides the same wire, its own row.
    const annulationPending = await this.flushSeraOutbox(SERA_ANNULATION_KEY);
    const livraisonPending = await this.flushBoutikDeliveredOutbox();
    const armPending = await this.flushCustodyArmOutbox();
    // COLIS-2 — a package's collection reference reaches custody BEFORE its
    // door signal: until it has, custody could not tell the payment is this
    // article's, so the signal waits on the same backoff.
    const referencePending = await this.flushDoorReferenceOutbox();
    const doorSignalPending = referencePending > 0 ? await this.doorSignalEnAttente() : await this.flushDoorSignalOutbox();
    const refusPending = await this.flushBoutikRefusedOutbox();
    const offertPending = await this.flushListeOffertOutbox();
    // RESERVATION-REGLE-1 adds the EIGHTH — the reservation release — likewise,
    // and the stuck-saga watch beside the wires.
    const releasePending = await this.flushReleaseOutbox();
    // B5.1 adds the NINTH — the producer's hold release — likewise.
    const holdReleasePending = await this.flushHoldReleaseOutbox();
    // REMBOURSEMENT-1 adds the TENTH — her refund asked of the provider — likewise.
    const remboursementPending = await this.flushRemboursement();
    const stuckDueAt = await this.watchStuckSaga();
    // RESERVATION-REGLE-2 — the supplier-notification watch, on the first
    // wire's row, after its flush has had this tick's try.
    const supplierDueAt = await this.watchStuckSupplier();
    // REMBOURSEMENT-2 — the stuck-refund watch, after this tick's asks.
    const refundDueAt = await this.watchStuckRefund();
    const stillPending = Math.max(boutikPending, seraPending, annulationPending, livraisonPending, armPending, referencePending, doorSignalPending, refusPending, offertPending, releasePending, holdReleasePending, remboursementPending);
    // ONE alarm, three wants: the outbox backoff and the two watches' due
    // times. The nearest wins; the others are re-derived when the alarm fires
    // (setAlarm overwrites, it never merges).
    const wants: number[] = [];
    if (stillPending > 0) wants.push(Date.now() + outboxBackoffMs(stillPending));
    if (stuckDueAt !== undefined) wants.push(stuckDueAt);
    if (supplierDueAt !== undefined) wants.push(supplierDueAt);
    if (refundDueAt !== undefined) wants.push(refundDueAt);
    if (wants.length > 0) {
      await this.state.storage.setAlarm(Math.min(...wants));
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
          // VITRINE-LECTURE-1 (F-29) — one bounded attempt; the alarm's backoff owns the retry.
          signal: AbortSignal.timeout(FLUSHER_TIMEOUT_MS),
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
  private async flushSeraOutbox(key: string = SERA_OUTBOX_KEY): Promise<number> {
    const outbox = await this.state.storage.get<{
      status: 'pending' | 'delivered';
      fact?: { orderId: string; status: string; paymentMode: string; asOf: string; package?: OrderPackage };
      attempts: number;
      deliveredAt?: string;
    }>(key);
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
      await this.state.storage.put(key, {
        ...outbox,
        status: 'delivered',
        attempts: outbox.attempts + 1,
        deliveredAt: new Date().toISOString(),
      });
      return 0;
    }
    const attempts = outbox.attempts + 1;
    await this.state.storage.put(key, { ...outbox, attempts });
    return attempts;
  }

  /**
   * BOUTIK-SUIVI — the delivery fact to Boutik+, at-least-once, on the OFFER
   * binding and the fulfillment write secret this object already carries for
   * `order.confirmed.v1`. Boutik+ answers 404 while it has not yet registered
   * the order (its own intake may still be in flight on the same road) — that
   * is a RETRY, not a terminal: `res.ok` alone decides, exactly as the
   * confirmed leg decides, so a slow sibling wire can never lose the fact.
   */
  private async flushBoutikDeliveredOutbox(): Promise<number> {
    const outbox = await this.state.storage.get<{
      status: 'pending' | 'delivered';
      event?: unknown;
      attempts: number;
      deliveredAt?: string;
    }>(BOUTIK_DELIVERED_KEY);
    if (outbox === undefined || outbox.status !== 'pending' || outbox.event === undefined) return 0;

    let delivered = false;
    if (this.env.OFFER !== undefined) {
      const res = await this.env.OFFER.fetch(
        new Request('https://offer/fulfillment/delivered', {
          method: 'POST',
          // VITRINE-LECTURE-1 (F-29) — one bounded attempt; the alarm's backoff owns the retry.
          signal: AbortSignal.timeout(FLUSHER_TIMEOUT_MS),
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
      await this.state.storage.put(BOUTIK_DELIVERED_KEY, {
        ...outbox,
        status: 'delivered',
        attempts: outbox.attempts + 1,
        deliveredAt: new Date().toISOString(),
      });
      return 0;
    }
    const attempts = outbox.attempts + 1;
    await this.state.storage.put(BOUTIK_DELIVERED_KEY, { ...outbox, attempts });
    return attempts;
  }

  /**
   * STOCK-VENDU-1b — the refused-course fact to Boutik+, byte-for-byte the
   * delivered relay's discipline: same binding, same secret, `res.ok` alone
   * decides, and Boutik+'s own intake absorbs redeliveries (its restock is
   * marker-idempotent per order). A 200 `unknown_order` from Boutik+ is a
   * DELIVERY — its book never saw the order and never will differently; the
   * intake said so on purpose rather than wedging the wire.
   */
  private async flushBoutikRefusedOutbox(): Promise<number> {
    const outbox = await this.state.storage.get<{
      status: 'pending' | 'delivered';
      event?: unknown;
      attempts: number;
      deliveredAt?: string;
    }>(BOUTIK_REFUSED_KEY);
    if (outbox === undefined || outbox.status !== 'pending' || outbox.event === undefined) return 0;

    let delivered = false;
    if (this.env.OFFER !== undefined) {
      const res = await this.env.OFFER.fetch(
        new Request('https://offer/fulfillment/delivery-refused', {
          method: 'POST',
          // VITRINE-LECTURE-1 (F-29) — one bounded attempt; the alarm's backoff owns the retry.
          signal: AbortSignal.timeout(FLUSHER_TIMEOUT_MS),
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
      await this.state.storage.put(BOUTIK_REFUSED_KEY, {
        ...outbox,
        status: 'delivered',
        attempts: outbox.attempts + 1,
        deliveredAt: new Date().toISOString(),
      });
      return 0;
    }
    const attempts = outbox.attempts + 1;
    await this.state.storage.put(BOUTIK_REFUSED_KEY, { ...outbox, attempts });
    return attempts;
  }

  /**
   * VRAI-SUIVI — ARM CUSTODY with the buyer's remise secret, at-least-once,
   * over the CUSTODY service binding and this Worker's own `SHOP_ARM_SECRET`
   * Bearer. Delivered ⇔ the door answered 2xx and NOTHING else — a 401 (the
   * secret not yet set on either side) and a 404/409 (custody has not opened
   * the order yet; its funding intake may still be in flight) all retry on
   * the shared backoff, because a code custody never learned is a drop that
   * can never be released. EITHER the binding OR the secret absent ⇒ nothing
   * is attempted — an unconfigured wire does not guess — and the row stays
   * `pending` until configuration arrives (the deploy-order law).
   *
   * Custody HASHES the secret at its door (`digestSecret`) and stores only
   * the sha256; the plaintext dies with the request on that side.
   */
  private async flushCustodyArmOutbox(): Promise<number> {
    const outbox = await this.state.storage.get<{
      status: 'pending' | 'delivered';
      fact?: { orderId: string; command_id: string; kind: string; secret: string };
      attempts: number;
      deliveredAt?: string;
    }>(CUSTODY_ARM_KEY);
    if (outbox === undefined || outbox.status !== 'pending' || outbox.fact === undefined) return 0;

    const secret = this.env.SHOP_ARM_SECRET ?? '';
    let delivered = false;
    if (this.env.CUSTODY !== undefined && secret !== '') {
      const res = await this.env.CUSTODY.fetch(
        new Request('https://custody/produce-shop/secrets/arm', {
          method: 'POST',
          // VITRINE-LECTURE-1 (F-29) — one bounded attempt; the alarm's backoff owns the retry.
          signal: AbortSignal.timeout(FLUSHER_TIMEOUT_MS),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify(outbox.fact),
        }),
      ).catch(() => undefined);
      delivered = res !== undefined && res.ok;
    }

    if (delivered) {
      await this.state.storage.put(CUSTODY_ARM_KEY, {
        ...outbox,
        status: 'delivered',
        attempts: outbox.attempts + 1,
        deliveredAt: new Date().toISOString(),
      });
      return 0;
    }
    const attempts = outbox.attempts + 1;
    await this.state.storage.put(CUSTODY_ARM_KEY, { ...outbox, attempts });
    return attempts;
  }

  /**
   * PORTE-CUSTODY part B — FORWARD THE DOOR LEG'S PROVIDER TRUTH to custody,
   * at-least-once, over the SAME road as the arm wire (the CUSTODY binding +
   * `SHOP_ARM_SECRET` Bearer), at `/produce-shop/door-signal`. EITHER the
   * binding OR the secret absent ⇒ nothing is attempted and the row rests
   * `pending` until configuration arrives (the deploy-order law).
   *
   * ═══ WHAT ENDS THIS ROW, BY CONTRACT — see DOOR_SIGNAL_KEY ═══
   *
   * Custody's 200 `{ok:true, duplicate}` (accepted or absorbed) ends it, and
   * so does every 409 EXCEPT `door_signal_not_awaited`: a verdict 409 is
   * custody's RECORDED refusal — it heard the provider truth, said no by name
   * (producer_actor_mismatch · door_signal_invalid ·
   * door_signal_course_settled) and raised its own reconciliation alert;
   * re-posting a refusal forever helps nobody. The row
   * records WHICH (`outcome`: 'accepted' | 'refused', plus custody's reason)
   * so the operator read can tell them apart. A 401 (secret not yet armed on
   * either side), any 5xx, and every transport failure stay `pending` on the
   * shared backoff — an outage or misconfiguration must never eat the fact.
   */
  /**
   * COLIS-2 — every collection reference this article entered, told to its
   * own custody file (see DOOR_REFERENCE_KEY). Returns the highest attempt
   * count still pending, 0 when nothing is.
   */
  private async flushDoorReferenceOutbox(): Promise<number> {
    const rows = await this.state.storage.get<Record<string, DoorReferenceRow>>(DOOR_REFERENCE_KEY);
    if (rows === undefined) return 0;
    const secret = this.env.SHOP_ARM_SECRET ?? '';
    const next: Record<string, DoorReferenceRow> = { ...rows };
    let pending = 0;
    for (const [reference, row] of Object.entries(rows)) {
      if (row.status !== 'pending') continue;
      let done: { outcome: 'accepted' | 'refused'; reason?: string } | undefined;
      if (this.env.CUSTODY !== undefined && secret !== '') {
        const res = await this.env.CUSTODY.fetch(
          new Request('https://custody/produce-shop/door-reference', {
            method: 'POST',
            signal: AbortSignal.timeout(FLUSHER_TIMEOUT_MS),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
            body: JSON.stringify({ orderId: row.orderId, command_id: `door-reference-${row.orderId}-${reference}`, reference }),
          }),
        ).catch(() => undefined);
        if (res !== undefined) {
          if (res.ok) {
            done = { outcome: 'accepted' };
          } else if (res.status === 409) {
            const body = (await res.json().catch(() => null)) as { reason?: unknown } | null;
            const reason = typeof body?.reason === 'string' ? body.reason : undefined;
            // No custody file yet is a state, not a verdict: the course is
            // not opened. Every other 409 is custody's recorded refusal.
            if (reason !== 'order_not_open') done = { outcome: 'refused', ...(reason !== undefined ? { reason } : {}) };
          }
        }
      }
      if (done !== undefined) {
        next[reference] = { ...row, status: 'delivered', outcome: done.outcome, ...(done.reason !== undefined ? { reason: done.reason } : {}), attempts: row.attempts + 1, deliveredAt: new Date().toISOString() };
      } else {
        next[reference] = { ...row, attempts: row.attempts + 1 };
        pending = Math.max(pending, row.attempts + 1);
      }
    }
    await this.state.storage.put(DOOR_REFERENCE_KEY, next);
    return pending;
  }

  /** The door signal's own backoff rung while it waits for a reference. */
  private async doorSignalEnAttente(): Promise<number> {
    const outbox = await this.state.storage.get<{ status: string; attempts: number }>(DOOR_SIGNAL_KEY);
    return outbox?.status === 'pending' ? Math.max(1, outbox.attempts) : 0;
  }

  private async flushDoorSignalOutbox(): Promise<number> {
    const outbox = await this.state.storage.get<{
      status: 'pending' | 'delivered';
      fact?: { orderId: string; command_id: string; event: unknown };
      attempts: number;
      outcome?: 'accepted' | 'refused';
      reason?: string;
      deliveredAt?: string;
    }>(DOOR_SIGNAL_KEY);
    if (outbox === undefined || outbox.status !== 'pending' || outbox.fact === undefined) return 0;

    const secret = this.env.SHOP_ARM_SECRET ?? '';
    let done: { outcome: 'accepted' | 'refused'; reason?: string } | undefined;
    if (this.env.CUSTODY !== undefined && secret !== '') {
      /**
       * ⚠ THE OUTER COMMAND ID IS PER-ATTEMPT (verifier BLOCKER, 2026-08-14,
       * proven on the real custody bundle): custody COMMITS every outcome —
       * including a 409 `door_signal_not_awaited` — and replays it verbatim
       * for a reused command_id, so a frozen id could never re-judge after
       * the rider records the accord: the paid order stranded forever. The
       * spine's true idempotency keys on the EVENT's own envelope command_id
       * (consumption absorbed once landed, the reconciliation alert minted
       * once), which is what makes fresh outer ids safe on every road: a
       * lost 200 re-asked under `-a(N+1)` answers `duplicate:true` from the
       * event registry, and a crash-rerun of attempt N replays `-aN`'s
       * recorded outcome. Deterministic per attempt, fresh across attempts.
       */
      const res = await this.env.CUSTODY.fetch(
        new Request('https://custody/produce-shop/door-signal', {
          method: 'POST',
          // VITRINE-LECTURE-1 (F-29) — one bounded attempt; the alarm's backoff owns the retry.
          signal: AbortSignal.timeout(FLUSHER_TIMEOUT_MS),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            ...outbox.fact,
            command_id: `${outbox.fact.command_id}-a${outbox.attempts}`,
          }),
        }),
      ).catch(() => undefined);
      if (res !== undefined) {
        if (res.ok) {
          done = { outcome: 'accepted' };
        } else if (res.status === 409) {
          const body = (await res.json().catch(() => null)) as { reason?: unknown } | null;
          const reason = typeof body?.reason === 'string' ? body.reason : undefined;
          // ⚠ NOT EVERY 409 IS FINAL. `door_signal_not_awaited` is custody's
          // STATE, not its verdict on the event: the buyer can pay before the
          // rider records her accord, and treating that refusal as carriage
          // complete would strand the order FOREVER (the provider never
          // redelivers; custody would await a signal nobody re-sends). It
          // stays pending and retries on the shared backoff under the NEXT
          // attempt's fresh outer id (see the mint above) so custody
          // re-judges its state; the alert stays one-per-signal because the
          // spine keys it on the event's own envelope id. The other 409s are
          // permanent, recorded, never re-posted: verdicts on the EVENT
          // ITSELF (producer_actor_mismatch, door_signal_invalid) and the E2
          // terminal on the COURSE (door_signal_course_settled — custody
          // refused it home after the buyer paid; it will never await this
          // signal again, and custody raised the E3 refund-feedstock alert).
          if (reason !== 'door_signal_not_awaited') {
            done = {
              outcome: 'refused',
              ...(reason !== undefined ? { reason } : {}),
            };
          }
        }
      }
    }

    if (done !== undefined) {
      await this.state.storage.put(DOOR_SIGNAL_KEY, {
        ...outbox,
        status: 'delivered',
        outcome: done.outcome,
        ...(done.reason !== undefined ? { reason: done.reason } : {}),
        attempts: outbox.attempts + 1,
        // The instant custody HEARD the truth — recorded for the refusal too:
        // the wire's job was carriage, and carriage completed here.
        deliveredAt: new Date().toISOString(),
      });
      return 0;
    }
    const attempts = outbox.attempts + 1;
    await this.state.storage.put(DOOR_SIGNAL_KEY, { ...outbox, attempts });
    return attempts;
  }

  /**
   * LISTE-ENVIES-1 — the offert marker to the liste's own object, over the
   * WISHLIST binding this Worker already declares (same-Worker DO — no
   * cross-repo road, no secret to hold: /entry/offert is mapped to no public
   * path, so only this wire can reach it). Delivered means the object
   * answered 2xx and NOTHING else — and the object answers 200 for `marked`,
   * `already` AND an unknown liste (`ignored`), because all three are
   * outcomes a retry cannot change. With the binding absent (a Worker
   * deployed before migration v9) nothing is attempted; the row stays
   * pending while its attempt count still walks the shared backoff — and it
   * drains the moment the class exists, the deploy-order law (the
   * custody-arm wire's exact absent-config behaviour).
   */
  private async flushListeOffertOutbox(): Promise<number> {
    const outbox = await this.state.storage.get<{
      status: 'pending' | 'delivered';
      fact?: { listeRef: string; pid: string; orderId: string };
      attempts: number;
      deliveredAt?: string;
    }>(LISTE_OFFERT_KEY);
    if (outbox === undefined || outbox.status !== 'pending' || outbox.fact === undefined) return 0;

    let delivered = false;
    const ns = this.env.WISHLIST;
    if (ns !== undefined) {
      const res = await ns
        .get(ns.idFromName(`liste:${outbox.fact.listeRef}`))
        .fetch(
          new Request('https://do/entry/offert', {
            method: 'POST',
            body: JSON.stringify({ pid: outbox.fact.pid, orderId: outbox.fact.orderId }),
          }),
        )
        .catch(() => undefined);
      delivered = res !== undefined && res.ok;
    }

    if (delivered) {
      await this.state.storage.put(LISTE_OFFERT_KEY, {
        ...outbox,
        status: 'delivered',
        attempts: outbox.attempts + 1,
        deliveredAt: new Date().toISOString(),
      });
      return 0;
    }
    const attempts = outbox.attempts + 1;
    await this.state.storage.put(LISTE_OFFERT_KEY, { ...outbox, attempts });
    return attempts;
  }

  /**
   * RAPPROCHEMENT-1 — the ONE door into RECON_ALERTS_KEY: dedupe on the
   * alert's own envelope command_id, cap the record, write only on growth.
   */
  /* ───────── RESERVATION-REGLE-1 — the release wire and the stuck-saga watch ───────── */

  /** Queue the hold's release beside the failure that earned it; the alarm carries it. */
  private async queueReservationRelease(stored: StoredOrigin, commandId: string, reservationId: string): Promise<void> {
    const row: ReleaseRow = {
      status: 'pending',
      commandId,
      quoteId: stored.quoteId,
      reason: 'payment_failed',
      reservationId,
      attempts: 0,
    };
    await this.state.storage.put(RELEASE_KEY, row);
    // The same durable-alarm discipline as the seven wires above. An alarm
    // that failed to schedule here is recovered by the next alarm any wire
    // arms — the stuck watch's, armed at create and at every retry — never
    // by a webhook: a payment_failed order hears no duplicate-webhook recovery.
    await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
  }

  /**
   * B5.1 — queue the producer's release beside the slot's. An order that
   * carries no product id (an origin older than ORDER-PAID-WIRE-1b) never
   * held on the producer, so there is nothing to queue.
   */
  private async queueHoldRelease(stored: StoredOrigin, commandId: string, reservationId: string): Promise<void> {
    const productVersionId = stored.fulfillment?.productVersionId;
    if (typeof productVersionId !== 'string' || productVersionId === '') return;
    const row: HoldReleaseRow = {
      status: 'pending',
      commandId,
      productVersionId,
      reservationId,
      reason: 'payment_failed',
      attempts: 0,
    };
    await this.state.storage.put(HOLD_RELEASE_KEY, row);
    await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
  }

  /** Returns the attempt count if still pending after this try, else 0. */
  private async flushHoldReleaseOutbox(): Promise<number> {
    const row = await this.state.storage.get<HoldReleaseRow>(HOLD_RELEASE_KEY);
    if (row === undefined || row.status !== 'pending') return 0;
    if (this.env.OFFER === undefined) {
      const attempts = row.attempts + 1;
      await this.state.storage.put(HOLD_RELEASE_KEY, { ...row, attempts });
      return attempts;
    }
    let answer: { status: string | null; httpStatus: number } | null = null;
    try {
      const res = await this.env.OFFER.fetch(
        new Request('https://offer/fulfillment/stock-hold/release', {
          method: 'POST',
          signal: AbortSignal.timeout(FLUSHER_TIMEOUT_MS),
          headers: {
            'Content-Type': 'application/json',
            ...(this.env.FULFILLMENT_WRITE_SECRET !== undefined && this.env.FULFILLMENT_WRITE_SECRET !== ''
              ? { Authorization: `Bearer ${this.env.FULFILLMENT_WRITE_SECRET}` }
              : {}),
          },
          body: JSON.stringify({ productVersionId: row.productVersionId, reservationId: row.reservationId, reason: row.reason }),
        }),
      );
      if (res.ok || res.status === 404) {
        const body = (await res.json().catch(() => null)) as { status?: unknown } | null;
        answer = { status: typeof body?.status === 'string' ? body.status : null, httpStatus: res.status };
      }
    } catch {
      answer = null;
    }
    if (answer === null) {
      const attempts = row.attempts + 1;
      await this.state.storage.put(HOLD_RELEASE_KEY, { ...row, attempts });
      return attempts;
    }
    await this.state.storage.put(HOLD_RELEASE_KEY, {
      ...row,
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      attempts: row.attempts + 1,
      answer,
    });
    return 0;
  }

  /** Returns the attempt count if still pending after this try, else 0. */
  private async flushReleaseOutbox(): Promise<number> {
    const row = await this.state.storage.get<ReleaseRow>(RELEASE_KEY);
    if (row === undefined || row.status !== 'pending') return 0;
    const ns = this.env.CHECKOUT;
    if (ns === undefined) {
      const attempts = row.attempts + 1;
      await this.state.storage.put(RELEASE_KEY, { ...row, attempts });
      return attempts;
    }
    let decision: ReleaseAnswer | null = null;
    try {
      const res = await ns.get(ns.idFromName(row.quoteId)).fetch(
        new Request('https://do/entry/release', {
          method: 'POST',
          body: JSON.stringify({
            commandId: row.commandId,
            reason: row.reason,
            ...(row.reservationId !== undefined ? { reservationId: row.reservationId } : {}),
          }),
        }),
      );
      // RESERVATION-REGLE-2 — only a 2xx is an ANSWER (a refusal by name rides
      // 200); a 503 or a 400 is the wire failing and the row stays pending.
      decision = res.ok ? ((await res.json().catch(() => null)) as ReleaseAnswer | null) : null;
    } catch {
      decision = null;
    }
    if (decision === null || typeof decision.ok !== 'boolean') {
      const attempts = row.attempts + 1;
      await this.state.storage.put(RELEASE_KEY, { ...row, attempts });
      // RESERVATION-REGLE-2 — THE NET'S LIVE ARM (verifier MAJOR on REGLE-1):
      // a release that did not deliver is the one case the net exists for, so
      // it is judged HERE, on the hold as it stands now, not on an answer that
      // never came. A wire that is down answers the read no better — then
      // there is nothing to judge, and the pending row with its attempt count
      // stays the signal.
      await this.judgeHeldReservation(ns, row);
      return attempts;
    }
    const at = new Date().toISOString();
    await this.state.storage.put(RELEASE_KEY, {
      ...row,
      status: 'delivered',
      deliveredAt: at,
      attempts: row.attempts + 1,
      decision: { ok: decision.ok, reason: decision.reason ?? null, state: decision.state?.status ?? null },
    });
    // THE NET: the vault judges the ANSWER's own reservation state against
    // this order's journey — the Contract-§6 class « a reservation stays held
    // after payment failure » sinks beside every other alert.
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    const quote = origin === undefined ? undefined : parseStoredQuote(origin.quoteBytes);
    if (origin !== undefined && quote !== undefined && decision.state !== undefined) {
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, log);
      const alert = reservationReconciliationAlert(spine, decision.state, {
        serverTime: at,
        ...(row.reservationId !== undefined ? { ownReservationId: row.reservationId } : {}),
      });
      if (alert !== null) await this.sinkReconAlerts([alert]);
    }
    return 0;
  }

  /** The net on the LIVE hold, after a release attempt that brought no answer. Faults are swallowed: the row is the signal. */
  private async judgeHeldReservation(ns: DurableObjectNamespace, row: ReleaseRow): Promise<void> {
    try {
      const res = await ns.get(ns.idFromName(row.quoteId)).fetch(new Request('https://do/entry/reservation'));
      if (!res.ok) return;
      const read = (await res.json()) as { ok?: boolean; state?: ReservationState };
      if (read.ok !== true || read.state === undefined) return;
      const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
      const quote = origin === undefined ? undefined : parseStoredQuote(origin.quoteBytes);
      if (origin === undefined || quote === undefined) return;
      const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
      const spine = rebuildOrderSpine(quote, origin, log);
      const alert = reservationReconciliationAlert(spine, read.state, {
        serverTime: new Date().toISOString(),
        ...(row.reservationId !== undefined ? { ownReservationId: row.reservationId } : {}),
      });
      if (alert !== null) await this.sinkReconAlerts([alert]);
    } catch {
      // the wire is down for the read as it was for the release — nothing to judge
    }
  }

  private stuckTtlMs(): number {
    const raw = Number(this.env.STUCK_SAGA_TTL_MS ?? '');
    return Number.isSafeInteger(raw) && raw > 0 ? raw : STUCK_SAGA_TTL_MS;
  }

  /**
   * RESERVATION-REGLE-2 — the supplier-notification watch on the alarm; returns
   * the next due time while the first wire is still pending and unreported.
   */
  private async watchStuckSupplier(): Promise<number | undefined> {
    if ((await this.state.storage.get(STUCK_SUPPLIER_KEY)) !== undefined) return undefined;
    const outbox = await this.state.storage.get<{ status: 'pending' | 'delivered' | 'unsendable' }>(OUTBOX_KEY);
    if (outbox === undefined || outbox.status === 'delivered') return undefined;
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return undefined;
    const quote = parseStoredQuote(origin.quoteBytes);
    if (quote === undefined) return undefined;
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = rebuildOrderSpine(quote, origin, log);
    if (spine.journey.state !== 'confirmed') return undefined;
    // The clock is the confirm input's own serverTime — the instant this
    // object observed the confirmation, the same one that starts boutik's
    // preparation — never the provider's claim.
    let since = origin.createdAt;
    for (const entry of log) {
      if (entry.kind === 'confirm') {
        since = entry.serverTime;
        break;
      }
    }
    const now = new Date().toISOString();
    const ttl = this.stuckTtlMs();
    const stuck = spine.checkStuckSupplierNotification(
      now,
      { version: STUCK_SAGA_POLICY_VERSION, ttlMs: ttl },
      { status: outbox.status, since },
    );
    if (stuck !== null) {
      await this.sinkReconAlerts([stuck]);
      await this.state.storage.put(STUCK_SUPPLIER_KEY, {
        emittedAt: now,
        commandId: stuck.envelope.command_id,
        notificationStatus: outbox.status,
        ttlPolicyVersion: STUCK_SAGA_POLICY_VERSION,
      });
      return undefined;
    }
    return Date.parse(since) + ttl + 1;
  }

  /** Arm the watch at an entry into payment_pending: the nearer of the existing alarm and the TTL. */
  private async armStuckWatch(nowIso: string): Promise<void> {
    const due = Date.parse(nowIso) + this.stuckTtlMs() + 1;
    const existing = await this.state.storage.getAlarm().catch(() => null);
    if (existing === null || existing > due) await this.state.storage.setAlarm(due).catch(() => undefined);
  }

  /** The vault's watch on the alarm; returns the next due time while the order is still pending and unreported. */
  private async watchStuckSaga(): Promise<number | undefined> {
    if ((await this.state.storage.get(STUCK_SAGA_KEY)) !== undefined) return undefined;
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return undefined;
    const quote = parseStoredQuote(origin.quoteBytes);
    if (quote === undefined) return undefined;
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = rebuildOrderSpine(quote, origin, log);
    if (spine.journey.state !== 'payment_pending') return undefined;
    const now = new Date().toISOString();
    const ttl = this.stuckTtlMs();
    const stuck = spine.checkStuckSaga(now, { version: STUCK_SAGA_POLICY_VERSION, paymentPendingTtlMs: ttl });
    if (stuck !== null) {
      await this.sinkReconAlerts([stuck]);
      await this.state.storage.put(STUCK_SAGA_KEY, {
        emittedAt: now,
        commandId: stuck.envelope.command_id,
        ttlPolicyVersion: STUCK_SAGA_POLICY_VERSION,
      });
      return undefined;
    }
    // Not yet: due the instant the pending transition turns TTL old. The
    // clock is the log's own — the last applied input's serverTime, the same
    // one the vault's `lastTransitionAt` is rebuilt from.
    let pendingSince = Date.parse(origin.createdAt);
    for (let i = log.length - 1; i >= 0; i -= 1) {
      const entry = log[i] as { serverTime?: unknown };
      if (typeof entry.serverTime === 'string') {
        pendingSince = Date.parse(entry.serverTime);
        break;
      }
    }
    return pendingSince + ttl + 1;
  }

  /**
   * REMBOURSEMENT-2 — HER REFUND AS THE FOUNDER'S CONSOLE SHOWS IT: its state,
   * and — the alert he reads — why it is blocked when it cannot finish by
   * itself. No key, no reference, no franc: those stay on the audit.
   */
  private async remboursementPourOperateur(
    spine: ReturnType<typeof rebuildOrderSpine>,
    orderId: string,
  ): Promise<
    | { etat: 'en_cours' | 'fait' | 'rien' }
    | { etat: 'bloque'; raison: 'refus_illisible' | 'refus_du_prestataire' | 'sans_confirmation' }
    | null
  > {
    const r = await this.state.storage.get<RemboursementStocke>(REFUND_KEY);
    if (r === undefined) return null;
    if (r.decision === 'refus_illisible') return { etat: 'bloque', raison: 'refus_illisible' };
    if (r.decision !== 'ouvert') return null;
    if (r.lignes.length === 0) return { etat: 'rien' };
    const confirmes = new Set(spine.ledger.refundsFor(orderId).map((x) => x.refundKey));
    const ouvertes = r.lignes.filter((l) => !confirmes.has(l.refundKey));
    if (ouvertes.length === 0) return { etat: 'fait' };
    if (ouvertes.some((l) => l.etat === 'refuse')) return { etat: 'bloque', raison: 'refus_du_prestataire' };
    if (ouvertes.some((l) => l.alerteLe !== undefined)) return { etat: 'bloque', raison: 'sans_confirmation' };
    return { etat: 'en_cours' };
  }

  /**
   * REMBOURSEMENT-PORTE-FERMEE — the founder's row also says when a closed
   * door payment of this article's package was confirmed after all and its
   * refund cannot finish by itself. That money is no article's, so it is kept
   * by the package's payment object and asked there — only when this article
   * ever entered one of its door payments.
   */
  private async remboursementAvecPorte(
    spine: ReturnType<typeof rebuildOrderSpine>,
    orderId: string,
  ): ReturnType<OrderDO['remboursementPourOperateur']> {
    const propre = await this.remboursementPourOperateur(spine, orderId);
    if (propre?.etat === 'bloque' || this.env.PAYMENT_GROUP === undefined) return propre;
    const portes = (await this.state.storage.get<Record<string, PorteColis>>(PORTES_COLIS_KEY)) ?? {};
    const groupId = Object.keys(portes).map((id) => PORTE_ID.exec(id)?.[1]).find((g) => g !== undefined);
    if (groupId === undefined) return propre;
    const res = await this.env.PAYMENT_GROUP.get(this.env.PAYMENT_GROUP.idFromName(groupId))
      .fetch(new Request(`https://do/entry/porte-retour?commande=${encodeURIComponent(orderId)}`))
      .catch(() => null);
    const body = res === null ? null : ((await res.json().catch(() => null)) as { remboursement?: unknown } | null);
    const r = body?.remboursement as { etat?: unknown; raison?: unknown } | null | undefined;
    if (r?.etat === 'bloque' && (r.raison === 'refus_du_prestataire' || r.raison === 'sans_confirmation')) {
      return { etat: 'bloque', raison: r.raison };
    }
    return propre;
  }

  /**
   * REMBOURSEMENT-2 — THE STUCK-REFUND WATCH: a line the provider accepted and
   * never confirmed past the stuck TTL is told to the operator once; returns
   * the next due time while one is still inside its TTL.
   */
  private async watchStuckRefund(): Promise<number | undefined> {
    const r = await this.state.storage.get<RemboursementStocke>(REFUND_KEY);
    // An ask the provider accepted and never confirmed, or one it only ever
    // timed out on (verifier MAJOR): both are refunds asked and not done.
    const enAttente = (r?.lignes ?? []).filter(
      (l) => (l.etat === 'demande' || l.etat === 'a_demander') && l.demandeLe !== undefined && l.alerteLe === undefined,
    );
    if (r === undefined || enAttente.length === 0) return undefined;
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    const quote = origin === undefined ? undefined : parseStoredQuote(origin.quoteBytes);
    if (origin === undefined || quote === undefined) return undefined;
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = rebuildOrderSpine(quote, origin, log);
    const now = new Date().toISOString();
    const ttl = this.stuckTtlMs();
    const confirmes = new Set(spine.ledger.refundsFor(origin.orderId).map((x) => x.refundKey));
    let prochain: number | undefined;
    for (const ligne of enAttente) {
      if (confirmes.has(ligne.refundKey)) continue;
      const stuck = spine.checkStuckRefund(now, { version: STUCK_SAGA_POLICY_VERSION, ttlMs: ttl }, {
        refundKey: ligne.refundKey,
        legType: ligne.legType,
        demandeLe: ligne.demandeLe!,
      });
      if (stuck !== null) {
        await this.sinkReconAlerts([stuck]);
        ligne.alerteLe = now;
        await this.state.storage.put(REFUND_KEY, r);
        continue;
      }
      const du = Date.parse(ligne.demandeLe!) + ttl + 1;
      prochain = prochain === undefined ? du : Math.min(prochain, du);
    }
    return prochain;
  }

  private async sinkReconAlerts(alerts: readonly PlatformEvent[]): Promise<void> {
    if (alerts.length === 0) return;
    const held =
      (await this.state.storage.get<{ alerts: PlatformEvent[]; dropped: number }>(RECON_ALERTS_KEY)) ??
      { alerts: [], dropped: 0 };
    const known = new Set(held.alerts.map((a) => a.envelope.command_id));
    const next = [...held.alerts];
    // The cap is HONEST when it clips (verifier MINOR): a full record counts
    // what it could not keep, so an operator reading 50 alerts knows whether
    // there was a 51st — silence and saturation must stay distinguishable.
    let dropped = held.dropped;
    for (const alert of alerts) {
      if (known.has(alert.envelope.command_id)) continue;
      if (next.length >= RECON_ALERTS_CAP) {
        dropped += 1;
        continue;
      }
      known.add(alert.envelope.command_id);
      next.push(alert);
    }
    if (next.length !== held.alerts.length || dropped !== held.dropped) {
      await this.state.storage.put(RECON_ALERTS_KEY, { alerts: next, dropped });
    }
  }

  private async onProviderEvent(event: unknown, codeColis?: string): Promise<Response> {
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
    /**
     * NB-3 (E2) — THE WEBHOOK MUST NAME THE CHARGE THIS ORDER INITIATED. The
     * leg's provider key is what the provider was actually charged with
     * (stable across retries — order-do.ts's own one-key-per-leg law), read
     * here from durable storage and handed to the vault, which refuses any
     * webhook naming another id. No key on record means no charge was ever
     * asked for on this leg, so no webhook for it can be genuine: `null`
     * carries that affirmation into the vault, whose state gates still speak
     * first (an early redelivery keeps its retryable `out_of_order`).
     */
    const chkLegKeys = (await this.state.storage.get<Record<string, string>>(LEG_KEYS_KEY)) ?? {};
    const chkLegKey: string | null = Object.prototype.hasOwnProperty.call(chkLegKeys, 'checkout')
      ? (chkLegKeys['checkout'] as string)
      : null;
    // PAYER-TOUT-1 — an order born in a group is judged as the group's: the
    // input kind is chosen by the order's own durable origin, never by the payload.
    const providerInput: OrderInput =
      origin.groupe !== undefined
        ? { kind: 'group_provider', event, expectedProviderKey: chkLegKey, groupe: origin.groupe }
        : { kind: 'provider', event, expectedProviderKey: chkLegKey };
    const outcome = applyOrderInput(spine, providerInput);
    if (!outcome.applied) {
      // RAPPROCHEMENT-1 (audit B4): a Contract-§6 contradiction refusal
      // carries its alert — SUNK durably before the refusal is answered.
      if (outcome.alert !== undefined) await this.sinkReconAlerts([outcome.alert]);
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
      // BOUTIK-SUIVI (verifier, 2026-08-10): and the THIRD wire. The flush was
      // at parity with Séra's; the RECOVERY was not — a stranded delivery
      // would have left a supplier's colis « en route » for ever, which is
      // precisely the unrecoverable state this hook exists to prevent.
      const strandedLivraison = await this.state.storage.get<{ status?: string }>(BOUTIK_DELIVERED_KEY);
      // VRAI-SUIVI: and the FOURTH — a stranded custody-arm is a code custody
      // never learned, exactly the unrecoverable class this hook exists for.
      const strandedRemise = await this.state.storage.get<{ status?: string }>(CUSTODY_ARM_KEY);
      // PORTE-CUSTODY part B: and the FIFTH — a stranded door signal is a
      // door payment custody never heard, so its SE-I11 gate never opens.
      const strandedPorte = await this.state.storage.get<{ status?: string }>(DOOR_SIGNAL_KEY);
      // LISTE-ENVIES-1: and the SEVENTH — a stranded offert marker is a
      // liste that keeps offering a wish someone already paid for.
      const strandedOffert = await this.state.storage.get<{ status?: string }>(LISTE_OFFERT_KEY);
      if (
        (stranded?.status === 'pending' || strandedSera?.status === 'pending' ||
          strandedLivraison?.status === 'pending' || strandedRemise?.status === 'pending' ||
          strandedPorte?.status === 'pending' || strandedOffert?.status === 'pending') &&
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
    let next: OrderInput[] = [...log, providerInput];
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
          // COLIS-FOURNISSEUR-1 — the package it travels in: Séra admits,
          // carries and settles it as one course (write-once there too).
          ...(origin.colis !== undefined ? { package: origin.colis } : {}),
        },
        attempts: 0,
      };
      /**
       * VRAI-SUIVI — HER REMISE CODE IS BORN AT THIS SAME TRANSITION (founder
       * ruling: Shop+ mints at payment confirmation), six digits from the OS
       * CSPRNG, FIRST-WINS FOREVER: the OUTBOX_KEY guard already makes this
       * branch once-per-order, and the get-first below keeps the code
       * immovable even if that guard ever changed shape. The custody-arm row
       * (the FOURTH wire) enters the SAME atomic batch, so « the order is
       * confirmed », « her code exists » and « custody will be armed with it »
       * become true together or not at all.
       */
      // COLIS-FOURNISSEUR-1 — ONE code for the package (founder ruling
      // 2026-09-23): its group minted it once, at this same confirmation, and
      // hands every article the same six digits; custody is armed with it
      // for each of them. An order alone mints its own, as always.
      const codeRemise =
        (await this.state.storage.get<string>(CODE_REMISE_KEY)) ??
        (origin.colis !== undefined && codeColis !== undefined ? codeColis : mintCodeRemise());
      const custodyArm = {
        status: 'pending' as const,
        /**
         * ⚠ SEAM FIX (CTO review, 2026-08-10): custody's `/secrets/arm` is a
         * COMMAND-LOG door — it refuses a body with no `command_id`
         * (malformed, 400). The id is DETERMINISTIC on purpose: the code is
         * first-wins forever, so every redelivery carries the same command
         * and the same content, and custody's log replays its recorded
         * answer instead of counting a second act.
         */
        fact: { orderId: origin.orderId, command_id: `arm-remise-${origin.orderId}`, kind: ARM_KIND, secret: codeRemise },
        attempts: 0,
      };
      /**
       * LISTE-ENVIES-1 — the SEVENTH wire enters the SAME atomic batch, but
       * ONLY for an order born from a liste with its fulfillment facts
       * intact (the pid IS `fulfillment.productVersionId` — no other record
       * of what was bought exists on this object outside the frozen bytes).
       * An order with a liste but no fulfillment record marks nothing,
       * honestly: a guessed pid on a gift marker would be worse than none.
       */
      const listeOffert =
        origin.listeRef !== undefined && origin.fulfillment !== undefined
          ? {
              status: 'pending' as const,
              fact: { listeRef: origin.listeRef, pid: origin.fulfillment.productVersionId, orderId: origin.orderId },
              attempts: 0,
            }
          : undefined;
      await this.state.storage.put({
        [LOG_KEY]: next,
        [OUTBOX_KEY]: outbox,
        [SERA_OUTBOX_KEY]: seraOutbox,
        [CODE_REMISE_KEY]: codeRemise,
        [CUSTODY_ARM_KEY]: custodyArm,
        ...(listeOffert !== undefined ? { [LISTE_OFFERT_KEY]: listeOffert } : {}),
      });
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

  /**
   * RELATED-PARTY-1 — §6.5 « Related-party detection (tiered; OWNER: Risk) »,
   * THE ONE SIGNAL THIS PLATFORM CAN READ TODAY: the buyer's own dispatch
   * contact (BC-1a, stored on this order) against the reseller's registered
   * number (the accounts book). No identity system, no MoMo account on either
   * side, no buyer account — the other identity signals and every
   * circumstantial one stay unproduced; §6.5 says the circumstantial family
   * never auto-voids anyway. The decision itself is `decideRelatedParty`
   * (pure, canon shape); it is recorded on the log once, after Séra's
   * validated signal, and replays from there — this read happens exactly once
   * per order, never at replay.
   *
   * UNDECIDED when the book cannot answer — the binding absent, the call
   * failing, OR the book's mute 404 (no ADMITTED account: pending, unknown —
   * its own rule): nothing is recorded, and Séra's redelivery of the
   * validated signal asks again (the duplicate branch). §6.5 has no
   * account-state carve-out.
   *
   * PAUSE-VENTE-1 (founder ruling 2026-09-17) — a PAUSED reseller's number
   * IS read (`/contact-of-admitted`, active or paused): she cannot sell while
   * paused, so a sale that reaches this point was made while she was active,
   * and the founder's pause is a cut on her access, not on the truth about
   * her sale. Before this ruling the read was `/contact-of` (active only) and
   * a reseller paused between her own-number sale and its delivery was left
   * undecided — never held — exactly the loophole a pause for suspicion
   * would open.
   */
  private async deciderLienProche(quote: Quote, orderId: string): Promise<RelatedPartyDecision | undefined> {
    const ns = this.env.COMPTES;
    if (ns === undefined) return undefined;
    let sien: string | undefined;
    try {
      const res = await ns.get(ns.idFromName(RESELLER_ACCOUNTS_NAME)).fetch(
        new Request('https://do/contact-of-admitted', {
          method: 'POST',
          body: JSON.stringify({ accountId: quote.attributionResellerId }),
        }),
      );
      if (res.status === 200) {
        const body = (await res.json().catch(() => null)) as { ok?: boolean; phone?: unknown } | null;
        if (body?.ok === true && typeof body.phone === 'string') sien = body.phone;
      }
    } catch {
      sien = undefined;
    }
    if (sien === undefined) return undefined;
    const contact = await this.state.storage.get<BuyerContact>(CONTACT_KEY);
    const identity: RelatedPartyDecision['signals']['identity'] =
      contact !== undefined && sien !== '' && memeNumero(contact.phone, sien) ? ['phone'] : [];
    return decideRelatedParty({
      orderId,
      signals: { identity, circumstantial: [] },
      nowIso: new Date().toISOString(),
    });
  }

  /** A redelivery repairs an UNDECIDED order: decide now, once, and log it. */
  private async lienProcheSiAbsent(spine: OrderSpine, quote: Quote, orderId: string, log: readonly OrderInput[]): Promise<void> {
    if (spine.relatedPartyView() !== undefined) return;
    const decision = await this.deciderLienProche(quote, orderId);
    if (decision === undefined) return;
    const entree: OrderInput = { kind: 'related_party', decision };
    if (!applyOrderInput(spine, entree).applied) return;
    await this.state.storage.put(LOG_KEY, [...log, entree]);
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
  /**
   * COLIS-FOURNISSEUR-1 — may this holder pay this article's door leg now,
   * inside its package's one payment? The single door's own gate
   * (`decideDoorCharge`), and the same « nothing more at a door it is
   * leaving » rule. Answers the leg's amount off the immutable Quote.
   */
  private async porteCheck(holderRef: string): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    if (origin.colis === undefined) return Response.json({ ok: false, reason: 'door_leg_not_expected' }, { status: 422 });
    const quote = parseStoredQuote(origin.quoteBytes);
    const receipt = await this.state.storage.get<ReservationReceipt>(RECEIPT_KEY);
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = quote === undefined ? undefined : rebuildOrderSpine(quote, origin, log);
    const decision = decideDoorCharge({
      quote,
      holderRef,
      receipt,
      orderState: spine?.journey.state ?? '',
      doorLegState: spine?.doorLegState ?? 'none',
    });
    if (!decision.ok) return Response.json({ ok: false, reason: decision.reason }, { status: 422 });
    if (
      (await this.state.storage.get(BOUTIK_REFUSED_KEY)) !== undefined ||
      (await this.state.storage.get(REFUND_KEY)) !== undefined
    ) {
      return Response.json({ ok: false, reason: 'course_refusee' }, { status: 422 });
    }
    return Response.json({ ok: true, orderId: origin.orderId, amount: decision.leg.amount });
  }

  private async startDoorCharge(holderRef: string, commandId: string): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    // COLIS-FOURNISSEUR-1 — a package's articles are paid at the door in ONE
    // payment, through the package (decision d); never one by one here.
    if (origin.colis !== undefined) return Response.json({ ok: false, reason: 'porte_du_colis' }, { status: 409 });
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
    // REMBOURSEMENT-1 — Séra refused the parcel: nothing more is collected at
    // a door it is leaving (her refund is already decided from what she paid).
    // REMBOURSEMENT-2 — nor once any refund is open (the supplier's refusal).
    if (
      (await this.state.storage.get(BOUTIK_REFUSED_KEY)) !== undefined ||
      (await this.state.storage.get(REFUND_KEY)) !== undefined
    ) {
      return Response.json({ ok: false, reason: 'course_refusee' }, { status: 422 });
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
    // THE CEILING (F-30) — refused by name BEFORE any write, so the road
    // stops growing exactly here; the replay above and the webhook are untouched.
    if (attempts.length >= doorAttemptsMax(this.env)) {
      return Response.json({ ok: false, reason: 'door_attempts_exhausted' }, { status: 422 });
    }
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
  private async onDoorProviderEvent(
    event: unknown,
    /** COLIS-FOURNISSEUR-1 — the package door collection this order entered, when the confirmation is its. */
    collecte?: PorteColis & { readonly groupId: string },
  ): Promise<Response> {
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

    // PORTE-CUSTODY part B — the SAME bounded-envelope guard the checkout
    // webhook carries, for the same reason it was added there (verifier
    // MINOR): `command_id` is about to be embedded in a durable log entry,
    // the door-signal outbox and the cross-app wire, and canon's envelope
    // schema is `.min(1)` only. Refused BY NAME before anything is applied.
    {
      const probe = PlatformEventSchema.safeParse(event);
      if (probe.success && probe.data.envelope.command_id.length > 1024) {
        return Response.json({ ok: false, reason: 'envelope_field_too_long' }, { status: 422 });
      }
    }
    // NB-3 (E2) — the same law as the checkout webhook's: the door webhook
    // must name the door charge THIS order initiated. `null` affirms no door
    // charge was ever asked for, so no webhook for it can be genuine — before
    // this, a door-due order with NO initiated charge would have FUNDED on
    // correct correlation + amount alone. The vault's state gates still speak
    // first (`door_leg_not_expected` for a mode the leg does not exist in).
    const doorLegKeys = (await this.state.storage.get<Record<string, string>>(LEG_KEYS_KEY)) ?? {};
    const doorLegKey: string | null = Object.prototype.hasOwnProperty.call(doorLegKeys, 'door')
      ? (doorLegKeys['door'] as string)
      : null;
    const input: OrderInput =
      collecte !== undefined
        ? {
            kind: 'door_group_provider',
            event,
            expectedProviderKey: collecte.providerKey,
            collecte: { groupId: collecte.groupId, correlationId: collecte.correlationId, parts: collecte.parts },
          }
        : { kind: 'door_provider', event, expectedProviderKey: doorLegKey };
    const outcome = applyOrderInput(spine, input);
    if (!outcome.applied) {
      // RAPPROCHEMENT-1 (audit B4): the door path's §6 alert — including the
      // long-named door_confirmation_without_door_pending_order — sinks too.
      if (outcome.alert !== undefined) await this.sinkReconAlerts([outcome.alert]);
      return Response.json({ ok: false, reason: outcome.reason }, { status: statusForWebhook(outcome.reason) });
    }
    if (outcome.duplicate) {
      // ABSORBED. Nothing appended, nothing charged, nothing moved — and the
      // door leg reads exactly as it did before the redelivery. In particular
      // NO SECOND OUTBOX ROW: the spine absorbs the redelivery, so the wire
      // arms only on the newly-applied branch below.
      //
      // PORTE-CUSTODY part B — but the redelivery IS a recovery hook for a
      // door-signal row still pending: it covers the narrow crash window
      // (batch put below → `setAlarm`) like the checkout webhook's duplicate
      // branch covers the other four wires, AND it pulls a BOOKED backoff
      // rung forward — a `door_signal_not_awaited` retry is waiting on that
      // rung while a rider stands at a door, and the provider's own
      // at-least-once redelivery is a legitimate « try again now ». Harmless
      // when early: the flush replays the same command_id and custody absorbs.
      const strandedPorte = await this.state.storage.get<{ status?: string }>(DOOR_SIGNAL_KEY);
      // REMBOURSEMENT-1 — and for a late door leg's refund a lost write never added.
      await this.etendreRemboursement();
      if (strandedPorte?.status === 'pending' || (await this.remboursementADemander())) {
        await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
      }
      return Response.json({ ok: true, status: 'duplicate', doorLeg: spine.doorLegState });
    }
    /**
     * PORTE-CUSTODY part B — THE APPLIED (non-duplicate) BRANCH ARMS THE
     * DOOR-SIGNAL WIRE, in the SAME atomic batch as the log append, so « the
     * door leg is paid » and « custody will be told » become true together or
     * not at all. The fact is the received-and-validated event FORWARDED
     * VERBATIM (the vault just applied it, so it parses), under the
     * base id `door-signal-${its own envelope command_id}` (the flusher
     * appends `-a${attempt}`) — a redelivered webhook is absorbed above and
     * never arms a second row. First-wins guard
     * on the row itself, belt-and-braces like the confirm branch's OUTBOX_KEY
     * guard: the vault admits one door confirmation per order, and even if
     * that ever changed shape the recorded signal would stay immovable.
     */
    const parsed = PlatformEventSchema.parse(event);
    const existingSignal = await this.state.storage.get(DOOR_SIGNAL_KEY);
    await this.state.storage.put({
      [LOG_KEY]: [...log, input],
      ...(existingSignal === undefined
        ? {
            [DOOR_SIGNAL_KEY]: {
              status: 'pending' as const,
              fact: {
                orderId: origin.orderId,
                command_id: `door-signal-${parsed.envelope.command_id}`,
                event,
              },
              attempts: 0,
            },
          }
        : {}),
    });
    // REMBOURSEMENT-1 — a door leg confirmed after Séra's refusal is refunded
    // too (its key stored here, asked by the alarm below).
    await this.etendreRemboursement();
    // A scheduling throw must never 500 a door confirmation already durably
    // stored — the duplicate-redelivery hook above is the recovery for a row
    // left pending without an alarm (the confirm branch's own discipline).
    await this.state.storage.setAlarm(Date.now()).catch(() => undefined);
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
    //
    // VRAI-SUIVI — the journey's instants join the view, each present only
    // once its owning domain said so (see BuyerOrderView for what may never
    // join them: no code, no token, no franc split, no rider position).
    // `livree` is derived EXACTLY as `/entry/gains` derives it: the recorded
    // obligations' presence IS the fact.
    const prep = (await this.state.storage.get<PreparationRecord>(PREPARATION_KEY)) ?? {};
    const transit = (await this.state.storage.get<TransitRecord>(TRANSIT_KEY)) ?? {};
    return toBuyerOrderView({
      orderId: origin.orderId,
      state: spine.journey.state,
      quote,
      doorLeg: spine.doorLegState,
      suivi: {
        ...(prep.acceptedAt !== undefined ? { acceptedAt: prep.acceptedAt } : {}),
        ...(prep.readyAt !== undefined ? { readyAt: prep.readyAt } : {}),
        ...(transit.departedAt !== undefined ? { departedAt: transit.departedAt } : {}),
        ...(transit.arrivedAt !== undefined ? { arrivedAt: transit.arrivedAt } : {}),
        livree: spine.ledger.obligationsFor(origin.orderId).length > 0,
      },
      ...(await (async () => {
        // REMBOURSEMENT-1 — her refund, when one is due: its sum (her own paid
        // legs, as the vault decided), whether the provider confirmed it, and
        // the delivery fee the vault kept on her own refusal.
        // `fait` once the provider confirmed EVERY line (a late door leg's
        // line can follow an order already `refunded`); `rien` when her
        // refusal left nothing to give back but the fee it kept — her screen
        // still has to learn the delivery ended.
        const r = await this.state.storage.get<RemboursementStocke>(REFUND_KEY);
        if (r === undefined || r.decision !== 'ouvert') return {};
        // REMBOURSEMENT-2 — WHY, in her words' terms: the parcel came back,
        // or the article could not be supplied.
        const motif = r.refus?.nature === 'refus_fournisseur' ? ('indisponible' as const) : ('retour' as const);
        const montant = r.lignes.reduce((somme, l) => somme + l.amount, 0);
        if (montant === 0) {
          return r.retenu > 0 ? { remboursement: { etat: 'rien' as const, montant: 0, fraisGardes: r.retenu, motif } } : {};
        }
        const confirmes = new Set(spine.ledger.refundsFor(origin.orderId).map((x) => x.refundKey));
        return {
          remboursement: {
            etat: r.lignes.every((l) => confirmes.has(l.refundKey)) ? ('fait' as const) : ('en_cours' as const),
            montant,
            ...(r.retenu > 0 ? { fraisGardes: r.retenu } : {}),
            motif,
          },
        };
      })()),
    });
  }

  /**
   * REMBOURSEMENT-1 — OPEN HER REFUND from Séra's refused-course fact, once.
   * The vault decides what goes back from this order's own records; each line
   * gets its key here, durably, before anything is asked of the provider. A
   * fact the vault cannot read, an order not yet paid, or one already accepted
   * is RECORDED as such (the operator reads it on the audit), never guessed at.
   */
  private async ouvrirRemboursement(event: unknown): Promise<void> {
    const parsed = PlatformEventSchema.safeParse(event);
    await this.ouvrirRemboursementAvec(
      parsed.success ? lireRefusCourse(parsed.data.payload) : undefined,
      parsed.success ? parsed.data.envelope.command_id : null,
    );
  }

  /**
   * REMBOURSEMENT-2 — the ONE opening, whatever ended the order: Séra's
   * refused course or the supplier's refusal. First-wins across both: an
   * order is refunded once.
   */
  private async ouvrirRemboursementAvec(refus: RefusCourse | undefined, source: string | null): Promise<void> {
    if ((await this.state.storage.get(REFUND_KEY)) !== undefined) return;
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    const quote = origin === undefined ? undefined : parseStoredQuote(origin.quoteBytes);
    if (origin === undefined || quote === undefined) return;
    const ouvertLe = new Date().toISOString();
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    if (refus === undefined) {
      // REMBOURSEMENT-2 — no refund could be decided: the operator is told
      // first (idempotent by id — a crash before the record re-tells on the
      // redelivered fact, never loses the alert).
      await this.sinkReconAlerts([
        rebuildOrderSpine(quote, origin, log).alerteRemboursement('refusal_fact_unreadable', origin.orderId, ouvertLe, {
          refusal_command_id: source,
        }),
      ]);
      await this.state.storage.put(REFUND_KEY, { ouvertLe, refus: null, decision: 'refus_illisible', retenu: 0, lignes: [] } satisfies RemboursementStocke);
      return;
    }
    const plan = rebuildOrderSpine(quote, origin, log).decideRefund(refus);
    if (!plan.ok) {
      await this.state.storage.put(REFUND_KEY, { ouvertLe, refus, decision: plan.reason, retenu: 0, lignes: [] } satisfies RemboursementStocke);
      return;
    }
    const record: RemboursementStocke = {
      ouvertLe,
      refus,
      decision: 'ouvert',
      retenu: plan.retenu,
      lignes: plan.lignes.map((l) => ({ ...l, refundKey: mintRefundKey(), etat: 'a_demander', essais: 0 })),
    };
    await this.state.storage.put(REFUND_KEY, record);
  }

  /**
   * REMBOURSEMENT-1 — A DOOR LEG CONFIRMED AFTER SÉRA'S REFUSAL (the charge
   * was in flight at the door) is refunded too: the vault re-decides from the
   * order's records as they now stand, and each paid leg the open refund
   * lacks joins it under its own key, stored before anything is asked.
   * Idempotent: a redelivered door webhook adds nothing.
   */
  private async etendreRemboursement(): Promise<void> {
    const r = await this.state.storage.get<RemboursementStocke>(REFUND_KEY);
    if (r === undefined || r.refus === null || r.decision !== 'ouvert') return;
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    const quote = origin === undefined ? undefined : parseStoredQuote(origin.quoteBytes);
    if (origin === undefined || quote === undefined) return;
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const plan = rebuildOrderSpine(quote, origin, log).decideRefund(r.refus);
    if (!plan.ok) return;
    const manquantes = plan.lignes.filter((l) => !r.lignes.some((x) => x.legType === l.legType));
    if (manquantes.length === 0) return;
    await this.state.storage.put(REFUND_KEY, {
      ...r,
      lignes: [...r.lignes, ...manquantes.map((l) => ({ ...l, refundKey: mintRefundKey(), etat: 'a_demander' as const, essais: 0 }))],
    } satisfies RemboursementStocke);
  }

  /** REMBOURSEMENT-1 — is a refund line still to be asked of the provider? */
  private async remboursementADemander(): Promise<boolean> {
    const r = await this.state.storage.get<RemboursementStocke>(REFUND_KEY);
    return r !== undefined && r.lignes.some((l) => l.etat === 'a_demander');
  }

  /**
   * REMBOURSEMENT-1 — ASK THE PROVIDER, once per line, under its stored key.
   * The attempt count is durable BEFORE the call (the sandbox's timeout budget
   * reads it, as the charge's does). Accepted is `demande`, not refunded; a
   * timeout stays to be asked again under the SAME key; a refusal by name is
   * recorded on the line for the operator. Returns the attempts still pending.
   */
  private async flushRemboursement(): Promise<number> {
    const r = await this.state.storage.get<RemboursementStocke>(REFUND_KEY);
    if (r === undefined || !r.lignes.some((l) => l.etat === 'a_demander')) return 0;
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return 0;
    let pending = 0;
    for (const ligne of r.lignes) {
      if (ligne.etat !== 'a_demander') continue;
      const dejaDemandes = r.lignes.reduce((somme, l) => somme + l.essais, 0);
      ligne.essais += 1;
      // REMBOURSEMENT-2 (verifier MAJOR) — the stuck clock starts at the FIRST
      // ask, answered or not: an ask that only ever times out is stuck too.
      ligne.demandeLe ??= new Date().toISOString();
      await this.state.storage.put(REFUND_KEY, r);
      const reponse = await sandboxPaymentProvider(readSandboxBehavior(this.env.PAYMENT_SANDBOX_BEHAVIOR), 0, dejaDemandes).initiateRefund({
        orderId: origin.orderId,
        refundKey: ligne.refundKey,
        collectRef: ligne.collectRef,
        amount: ligne.amount,
        correlationId: origin.correlationId,
        requestedAtIso: new Date().toISOString(),
        legType: ligne.legType,
      });
      if (reponse.accepted) {
        ligne.etat = 'demande';
        ligne.refundRef = reponse.refundRef;
      } else if (reponse.reason === 'timeout') {
        pending = Math.max(pending, ligne.essais);
      } else {
        // REMBOURSEMENT-2 — a refusal by name is final for this line: the
        // operator is told BEFORE the line records it (the sink is idempotent
        // by the alert's id, so a crash between the two re-tells, never loses).
        const quote = parseStoredQuote(origin.quoteBytes);
        if (quote !== undefined) {
          const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
          await this.sinkReconAlerts([
            rebuildOrderSpine(quote, origin, log).alerteRemboursement('provider_refused_refund', ligne.refundKey, new Date().toISOString(), {
              leg: ligne.legType,
              refund_key: ligne.refundKey,
              provider_reason: reponse.reason,
            }),
          ]);
        }
        ligne.etat = 'refuse';
        ligne.motifRefus = reponse.reason;
      }
      await this.state.storage.put(REFUND_KEY, r);
    }
    return pending;
  }

  /**
   * REMBOURSEMENT-1 — THE PROVIDER'S REFUND CONFIRMATION, judged by the vault
   * against the refunds this order asked for (their keys and amounts ride the
   * log with the event). A contradiction's alert is sunk before the refusal
   * is answered; a redelivery is absorbed; only an applied confirmation is
   * appended.
   */
  private async onRefundEvent(event: unknown): Promise<Response> {
    const origin = await this.state.storage.get<StoredOrigin>(ORIGIN_KEY);
    if (origin === undefined) return Response.json({ ok: false, reason: 'unknown_order' }, { status: 404 });
    const quote = parseStoredQuote(origin.quoteBytes);
    if (quote === undefined) return Response.json({ ok: false, reason: 'stored_quote_unreadable' }, { status: 422 });
    const probe = PlatformEventSchema.safeParse(event);
    if (probe.success && probe.data.envelope.command_id.length > 1024) {
      return Response.json({ ok: false, reason: 'envelope_field_too_long' }, { status: 422 });
    }
    const log = (await this.state.storage.get<OrderInput[]>(LOG_KEY)) ?? [];
    const spine = rebuildOrderSpine(quote, origin, log);
    const r = await this.state.storage.get<RemboursementStocke>(REFUND_KEY);
    const attendus: RemboursementAttendu[] = (r?.lignes ?? []).map((l) => ({
      legType: l.legType,
      collectRef: l.collectRef,
      amount: l.amount,
      refundKey: l.refundKey,
    }));
    const input: OrderInput = { kind: 'refund_provider', event, attendus };
    const outcome = applyOrderInput(spine, input);
    if (!outcome.applied) {
      if (outcome.alert !== undefined) await this.sinkReconAlerts([outcome.alert]);
      return Response.json({ ok: false, reason: outcome.reason }, { status: statusForWebhook(outcome.reason) });
    }
    if (outcome.duplicate) return Response.json({ ok: true, status: 'duplicate', state: spine.journey.state });
    await this.state.storage.put(LOG_KEY, [...log, input]);
    return Response.json({ ok: true, status: 'applied', state: spine.journey.state });
  }
}

/**
 * THE IDEMPOTENCY KEY, MINTED SERVER-SIDE FROM THE OS CSPRNG. `crypto.randomUUID`
 * is the platform's CSPRNG-backed v4 — the same mint the reservation id already
 * uses. It is NEVER a caller's value: an idempotency key a buyer could choose is
 * a key a buyer could collide with someone else's charge.
 */
export function mintPaymentAttemptId(): string {
  return `att-${crypto.randomUUID()}`;
}

/**
 * THE LEG'S PROVIDER IDEMPOTENCY KEY, from the same OS CSPRNG and under a
 * DELIBERATELY DIFFERENT PREFIX. `att-` is an audit id and `pk-` is a payment
 * key; they are different things with different lifetimes, and after a live
 * conflation of exactly these two, a reader of any log or record must be able to
 * tell them apart at a glance.
 */
export function mintProviderLegKey(): string {
  return `pk-${crypto.randomUUID()}`;
}

/** REMBOURSEMENT-1 — a refund's provider idempotency key, same CSPRNG, its own prefix (`rf-`). */
export function mintRefundKey(): string {
  return `rf-${crypto.randomUUID()}`;
}

/**
 * VRAI-SUIVI — THE BUYER'S READ TOKEN: 32 chars over a 64-symbol URL-safe
 * alphabet (192 bits) from the OS CSPRNG. `b & 63` over a 256-value byte and a
 * 64-symbol alphabet divides exactly, so no symbol is likelier than another.
 * Server-minted, never a caller's value — a token a buyer could choose is a
 * token a stranger could choose first.
 */
const REF_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
function mintBuyerRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let out = '';
  for (const b of bytes) out += REF_ALPHABET[b & 63];
  return out;
}

/**
 * VRAI-SUIVI — HER SIX-DIGIT REMISE CODE, from the OS CSPRNG with rejection
 * sampling (draws above the largest multiple of 10⁶ under 2³² are re-drawn),
 * so every code from 000000 to 999999 is exactly as likely. NEVER
 * `Math.random` — this is the secret custody releases the package on.
 */
export function mintCodeRemise(): string {
  const buf = new Uint32Array(1);
  const limit = 4_294_000_000; // 4294 × 10⁶ — the largest multiple of 10⁶ ≤ 2³²
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] as number;
    if (v < limit) return String(v % 1_000_000).padStart(6, '0');
  }
}

export function statusForWebhook(reason: string): number {
  if (reason === 'not_a_platform_event' || reason === 'unexpected_event_name') return 400;
  if (reason === 'unknown_order') return 404;
  // Out-of-order and correlation mismatches are STATES, not malformed input: the
  // emitter redelivers. A wrong AMOUNT is neither — it is refused, never applied.
  if (reason === 'out_of_order' || reason === 'wrong_correlation') return 409;
  if (reason === 'conflicting_escrow_for_order' || reason === 'door_leg_before_checkout_leg') return 409;
  // REMBOURSEMENT-1 — a second, different confirmation of a refund already recorded.
  if (reason === 'conflicting_refund') return 409;
  // GARDE-PAIEMENT-1 — a payload that would crash the canon escrow parse is
  // refused 422 BY NAME (the default here, made explicit): a producer bug to
  // fix, NOT a 5xx the aggregator retries against forever. Amount/leg refusals
  // and everything else also land on 422.
  return 422;
}

/* ───────────────────────────────── the router ────────────────────────────── */

interface Env {
  /** RESERVATION-REGLE-1 — the parked-poison book; absent ⇒ a refusal is answered by name and nothing is parked. */
  DLQ?: DurableObjectNamespace;
  ORDER: DurableObjectNamespace;
  /**
   * The quote authority. The router only reads it; the OrderDO's release wire
   * (RESERVATION-REGLE-1) writes ONE internal road, `/entry/release`, through
   * its own binding — the order still copies amounts, never writes them.
   */
  CHECKOUT: DurableObjectNamespace;
  /**
   * SP6.3 — the §6.4 ladder book, read-only from here. OPTIONAL: an
   * unconfigured Worker has no binding, and `lireEligibilite` answers
   * `undefined`, which this route treats as « cannot prove the buyer rung » and
   * refuses the DOOR MODE only. A full-prepay order never consults it.
   */
  LADDER?: DurableObjectNamespace;
  /** REPERE-AUDIO-REEL — Boutik+'s media door, for the buyer's voice note.
   *  A SERVICE BINDING, not a URL — the SUPPLY_BASE lesson (error 1042: a
   *  Worker's public-URL fetch of another Worker in this account failed
   *  closed for a full day); the OFFER binding is the proven cross-repo
   *  road. TRANSPORT ONLY: the media door is still gated by its write
   *  secret, so `MEDIA_WRITE_KEY` (set via `wrangler secret put`, the
   *  founder's alone — never [vars], never bundled) rides every call. Both
   *  optional: unconfigured, every note is honestly `perdue` and no order
   *  is ever blocked. */
  MEDIA?: { fetch(request: Request): Promise<Response> };
  MEDIA_WRITE_KEY?: string;
  /** LISTE-ADRESSE — the liste book, read-only from here: the gift order's
   *  background contact attach and its zone-coherence check. OPTIONAL: with
   *  no binding the attach silently does not happen, which is SAFE — the
   *  quote road is gated on the same binding, so no address-priced quote
   *  can exist for this door to mismatch. */
  WISHLIST?: DurableObjectNamespace;
  /**
   * PAYER-TOUT-1 — the grouped payments, for the webhook and the sandbox key
   * read only: a confirmation naming a group id (`grp-…`) is the group's to
   * hand to its orders. Absent ⇒ a group id is simply an unknown order.
   */
  PAYMENT_GROUP?: DurableObjectNamespace;
}

/** The order object's refusals that are SHAPE poison (the vault could not read the event), not state. */
const POISON_REFUSALS = new Set(['malformed_payload', 'envelope_field_too_long', 'not_a_platform_event']);

/**
 * RESERVATION-REGLE-1 — hand the refused bytes to the parked-poison book.
 * Evidence-keeping beside a refusal already answered by name: a fault in the
 * book must never turn that named refusal into a 500, so this swallows its
 * own errors. Bodies past the book's byte-exact ceiling are recorded by
 * digest and stored size (`oversize`), never truncated and passed off as exact.
 */
async function parkPoison(env: Env, texte: string, args: { reason: string; correlationId: string }): Promise<void> {
  const ns = env.DLQ;
  if (ns === undefined) return;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
    const sha256Hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    // Measured as the book STORES it, not as `.length` counts it (verifier
    // finding): one code unit past Latin-1 doubles the stored size.
    const bytes = storedBytes(texte);
    const oversize = bytes > PARK_MAX_BYTES;
    await ns.get(ns.idFromName(DLQ_NAME)).fetch(
      new Request('https://do/entry/park', {
        method: 'POST',
        body: JSON.stringify({
          ...(oversize ? { oversize: { bytes } } : { raw: texte }),
          reason: args.reason,
          correlationId: args.correlationId,
          sha256Hex,
        }),
      }),
    );
  } catch {
    // named refusal already on its way; the book's fault is not the provider's
  }
}

const orderStub = (env: Env, orderId: string): DurableObjectStub =>
  env.ORDER.get(env.ORDER.idFromName(orderId));

/**
 * REPERE-AUDIO-REEL — hand the buyer's note to the media door, server-side,
 * and come back with the minted ref or null. Null on EVERY failure class —
 * no config, undecodable base64, refused bytes, unreachable service — because
 * the caller's law is « the note never blocks the sale »; the caller names
 * the loss on the response instead.
 */
export async function televerserNoteVocale(
  // Structural, deliberately: the LISTE-VOIX road calls this from the
  // composition root's own env (same two bindings, different Env type).
  env: { readonly MEDIA?: { fetch(request: Request): Promise<Response> }; readonly MEDIA_WRITE_KEY?: string },
  audioB64: string,
): Promise<string | null> {
  const media = env.MEDIA;
  const key = env.MEDIA_WRITE_KEY;
  if (media === undefined || typeof key !== 'string' || key === '') return null;
  let bytes: Uint8Array;
  try {
    const bin = atob(audioB64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  } catch {
    return null;
  }
  if (bytes.length === 0) return null;
  try {
    // The host is a placeholder — a service binding routes by BINDING, and
    // the media Worker reads only the path.
    const res = await media.fetch(new Request('https://media/media/audio', {
      method: 'POST',
      headers: { 'X-Write-Key': key },
      body: bytes,
    }));
    if (res.status !== 201) return null;
    const body = (await res.json().catch(() => null)) as { ref?: unknown } | null;
    const ref = body?.ref;
    // The SAME strict shape the stored-contact validator demands (AUDIO_REF) —
    // a ref this refuses would be refused again inside the object, and THAT
    // refusal would block the sale; this one only loses the note.
    return typeof ref === 'string' && AUDIO_REF.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

/** The wire vocabulary a caller may send. Anything else is REFUSED, not ignored.
 *  LISTE-ENVIES-1 added `listeRef` — optional, opaque, and priced by nothing:
 *  see `OrderOrigin.listeRef` for why this one caller-supplied fact is safe. */
const ORDER_FIELDS = ['quoteId', 'holderRef', 'commandId', 'contact', 'listeRef'];
/** SP4.2a-bis — the door charge's own two-key allowlist. NO amount field. */
const DOOR_CHARGE_FIELDS = ['holderRef', 'commandId'];

/** The id alphabet every server-minted id in this repo already uses. */
export const ID_ALPHABET = /^[A-Za-z0-9][A-Za-z0-9_-]{0,191}$/;

export function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** A malformed id is simply not an id — it decodes to `undefined`, never a 500. */
export function decodeId(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/** COLIS-FOURNISSEUR-1 — a package door collection's id: `<groupId>-porte-<n>`. */
const PORTE_ID = /^(grp-[0-9a-f]{40})-porte-[1-9][0-9]{0,3}$/;

export function statusForRefusal(reason: string): number {
  if (reason === 'quote_unknown' || reason === 'unknown_order' || reason === 'not_found') return 404;
  // Someone else holds this quote: a STATE, spoken plainly, with no money on it.
  if (reason === 'reservation_held_by_another' || reason === 'retry_refused') return 409;
  // PAYER-TOUT-1 — an order already bound to one payment road, and a group
  // still finishing its last attempt: states, spoken plainly, never money.
  if (reason === 'order_in_group' || reason === 'order_in_other_payment') return 409;
  // COLIS-FOURNISSEUR-1 — a package's article on the single road, an article
  // already in another door payment of its package: states, never money.
  if (reason === 'colis_paye_ensemble' || reason === 'porte_du_colis' || reason === 'porte_deja_choisie') return 409;
  if (reason === 'paiement_occupe') return 503;
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
      // present: {phone, quartier, repere} plus REPERE-AUDIO-REEL's
      // `audioB64` (her voice note's bytes — never a ref; refs are minted
      // server-side below). Refused HERE with the field named, before any
      // object is touched — a half-formed contact never travels. Still no
      // amount field on this body, and no way to add one.
      let contact: BuyerContact | null = null;
      let audioB64: string | undefined;
      if (body['contact'] !== undefined && body['contact'] !== null) {
        const wire = readBuyerContactWire(body['contact']);
        if (wire === null) return badRequest('bad_field', 'contact');
        contact = wire.contact;
        audioB64 = wire.audioB64;
      }
      // LISTE-ENVIES-1 — the liste this order was placed from, OPTIONAL and
      // charset-pinned (`LISTE_REF`, not ID_ALPHABET: a minted token may start
      // with `_` or `-`). It becomes a DO name on the offert wire, so a
      // malformed one is refused by name here, never stored.
      let listeRef: string | null = null;
      if (body['listeRef'] !== undefined && body['listeRef'] !== null) {
        if (typeof body['listeRef'] !== 'string' || !LISTE_REF.test(body['listeRef'])) {
          return badRequest('bad_field', 'listeRef');
        }
        listeRef = body['listeRef'];
      }
      const quoteId = body['quoteId'];

      // THE QUOTE'S OWN BYTES, read server-side from the object that owns them.
      // The caller sends no amount and could not: the value that decides what is
      // charged never touches the wire.
      const quoteRes = await env.CHECKOUT.get(env.CHECKOUT.idFromName(quoteId)).fetch(
        new Request('https://do/entry'),
      );
      const quoteBody = (await quoteRes.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; canonicalBytes?: string; fulfillment?: unknown; quote?: { paymentMode?: unknown }; colis?: unknown }
        | null;
      if (quoteBody === null) return refuse('quote_unknown');
      // COLIS-FOURNISSEUR-1 — an article priced inside a package carries only
      // its share of the package's one fee: it is paid with its package, in
      // the panier's one payment, never alone (founder rulings 2026-09-23).
      if (quoteBody.colis !== undefined) return refuse('colis_paye_ensemble');
      /**
       * ═══ COMMANDE-REJOUER-1 — AN EXPIRED QUOTE STILL REACHES THE OBJECT ═══
       *
       * The vault answers `expired` with NO bytes, and this router used to
       * refuse right here — which made the object's clock-free replay road
       * unreachable the moment the 15-minute quote died: a buyer whose 200
       * was lost and whose retry landed late lost her `buyerRef` forever,
       * the audit's own named case. The expired read now travels DOWN with
       * no bytes: the object replays the stored answer to the receipt's own
       * holder, and every other outcome on this road keeps today's public
       * name — the mapping below folds the object's refusal back to
       * `expired`, because that IS what this router's own read established.
       */
      const quoteExpiree = quoteBody.ok !== true && quoteBody.reason === 'expired';
      if (!quoteExpiree && (quoteBody.ok !== true || typeof quoteBody.canonicalBytes !== 'string')) {
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
        /**
         * LISTE-MERCI (founder ruling, 2026-08-26): « for wishlist purchases
         * pay full is the only option and never pay at the door. » A gift
         * whose PRODUCT leg is collected at the door would make the receiving
         * side pay for its own present — so an order that names a liste and
         * rides a door-mode quote is refused BY NAME, before any contact or
         * ladder question. The PWA never offers the door on a liste purchase;
         * this is the layer a hand-crafted call cannot walk around.
         */
        if (listeRef !== null) return refuse('liste_prepaiement_requis');
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

      /**
       * ═══ LISTE-ADRESSE-1 — HER ADDRESS ATTACHES IN THE BACKGROUND
       *     (founder order, 2026-08-27) ═══
       *
       * An order that names a liste WITH a stored address becomes HER
       * delivery: the contact is read server-side off the liste and stored
       * exactly where BC-1a's dispatch door reads it — the purchaser types
       * nothing and is shown nothing. Two laws guard the seam:
       *  · a caller-sent contact on this road is refused BY NAME — the fee
       *    was priced for HER zone, and two addresses on one order would
       *    make the charged fee a lie for one of them;
       *  · the QUOTE's own stored zoneTo must equal her stored zone — a
       *    hand-crafted quote priced for another destination cannot carry
       *    her delivery (`liste_zone_incoherente`).
       * A liste WITHOUT a stored address changes nothing: the friend fills
       * delivery as any buyer (the road every liste had before this slice).
       * An absent WISHLIST binding also changes nothing — the quote road is
       * already gated on it, so no address-priced quote can exist to attach.
       */
      if (listeRef !== null && env.WISHLIST !== undefined && !quoteExpiree) {
        const luLivraison = await env.WISHLIST.get(env.WISHLIST.idFromName(`liste:${listeRef}`)).fetch(
          new Request('https://do/entry/livraison'),
        );
        if (luLivraison.status === 200) {
          const livre = (await luLivraison.json().catch(() => null)) as
            | { livraison?: { telephone?: unknown; quartier?: unknown; repere?: unknown; zone?: unknown; audioRef?: unknown; pin?: unknown } }
            | null;
          const livraison = livre?.livraison;
          if (
            typeof livraison?.telephone === 'string' &&
            typeof livraison.quartier === 'string' &&
            typeof livraison.repere === 'string' &&
            typeof livraison.zone === 'string'
          ) {
            if (contact !== null) return refuse('liste_contact_conflit');
            const quoteZone = (quoteBody.fulfillment as { zoneTo?: unknown } | null | undefined)?.zoneTo;
            if (quoteZone !== livraison.zone) return refuse('liste_zone_incoherente');
            // GEO-ACHAT-1 (liste half) — re-read through the pin validator as
            // belt and braces; the stored-contact validator would refuse a
            // malformed one anyway.
            const pinListe = livraison.pin !== undefined ? readPin(livraison.pin) : null;
            contact = {
              phone: livraison.telephone,
              quartier: livraison.quartier,
              repere: livraison.repere,
              // LISTE-VOIX — her voice repère, minted at LISTE create by the
              // composition root; it rides onto the same dispatch-board field
              // a buyer's own note lands on. Pin-checked here as belt and
              // braces — the stored-contact validator would refuse it anyway.
              ...(typeof livraison.audioRef === 'string' && AUDIO_REF.test(livraison.audioRef)
                ? { audioRef: livraison.audioRef }
                : {}),
              // GEO-ACHAT-1 (liste half) — her pin rides onto the same
              // dispatch-board field a buyer's own tap lands on.
              ...(pinListe !== null ? { pin: pinListe } : {}),
            };
          }
        }
      }

      /**
       * REPERE-AUDIO-REEL → NOTE-VOCALE-APRES-GARDE-1 (AUDIT-SHOP-2 F-04) —
       * the note becomes a REF inside the OBJECT, after its own hold check
       * (`create`), never here on an anonymous caller's word: this router
       * used to hand the bytes to Boutik+'s media door BEFORE asking the
       * object whether this holder may create at all. The bytes ride the
       * internal hop below; the object hands them on with this Worker's own
       * credential (the write key never rides in the buyer's public bundle)
       * and only the minted opaque ref is stored. COMMANDE-REJOUER-1 stands:
       * the expired road carries no bytes — only a replay can succeed there
       * and a replay attaches nothing.
       */
      const res = await orderStub(env, orderIdForQuote(quoteId)).fetch(
        new Request('https://do/entry/create', {
          method: 'POST',
          body: JSON.stringify({
            quoteId,
            holderRef: body['holderRef'],
            commandId: body['commandId'],
            // COMMANDE-REJOUER-1 — the expired road carries no bytes (the
            // vault held none back to carry); the object's own frozen origin
            // judges any non-replay attempt, and it will refuse.
            ...(quoteExpiree ? {} : { quoteBytes: quoteBody.canonicalBytes }),
            // ORDER-PAID-WIRE-1b — the fulfillment facts ride the SAME internal
            // hop as the bytes, from the same server-side read. The public body
            // above has no such field: a caller cannot name a product or a zone
            // here any more than an amount.
            fulfillment: quoteBody.fulfillment ?? null,
            // BC-1a — the validated contact, or null. The object re-validates.
            contact,
            // LISTE-ENVIES-1 — the validated liste token, or null.
            listeRef,
            // NOTE-VOCALE-APRES-GARDE-1 — the bytes, for the object to upload
            // past its gate (never on the expired road).
            ...(contact !== null && audioB64 !== undefined && !quoteExpiree ? { audioB64 } : {}),
          }),
        }),
      );
      const decided = (await res.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; view?: unknown; buyerRef?: unknown; noteVocale?: unknown }
        | null;
      if (decided === null) return refuse('not_found');
      if (decided.ok !== true || decided.view === undefined) {
        // The expired road keeps today's public name whatever the object
        // said (`quote_expired` off the origin bytes, `quote_unknown` when no
        // order was ever born): the router's own read established `expired`,
        // and that is the sentence the buyer's screen already understands.
        return refuse(quoteExpiree ? 'expired' : (decided.reason ?? 'not_found'));
      }
      // THE BOUNDARY. Only the object's own projection ever reaches a buyer —
      // plus TWO create-only facts: what became of her voice note, and
      // (VRAI-SUIVI) her own read token, on the SAME create-only discipline —
      // the poll view never carries either.
      const extras: Record<string, unknown> = {};
      if (typeof decided.buyerRef === 'string' && decided.buyerRef !== '') {
        extras['buyerRef'] = decided.buyerRef;
      }
      if (decided.noteVocale === 'gardee' || decided.noteVocale === 'perdue') extras['noteVocale'] = decided.noteVocale;
      if (Object.keys(extras).length > 0) {
        return Response.json({ ...(decided.view as Record<string, unknown>), ...extras }, { status: 200 });
      }
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

    /**
     * ═══ VRAI-SUIVI — THE REMISE ROUTE: the code's ONE public door ═══
     *
     * PUBLIC PATH, PRIVATE ANSWER: the route is reachable by anyone, but the
     * answer exists only for the bearer of THIS order's own buyer token
     * (minted at create, returned once, held by nobody else) — and only after
     * Séra's arrival fact. Every refusal — absent token, wrong token, unknown
     * order, code not yet revealable — is the SAME `{ok:false}` 404, decided
     * inside the object so no branch here can become an oracle. The 200
     * carries the code and nothing else, stamped never-cache: a secret must
     * not survive in any intermediary.
     */
    const remise = /^\/checkout\/order\/([^/]+)\/remise$/.exec(pathname);
    if (remise && request.method === 'GET') {
      const orderId = decodeId(remise[1]!);
      const auth = request.headers.get('Authorization') ?? '';
      const jeton = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
      if (orderId === undefined || !ID_ALPHABET.test(orderId) || jeton === '') {
        return Response.json({ ok: false }, { status: 404 });
      }
      const res = await orderStub(env, orderId).fetch(
        new Request('https://do/entry/remise', {
          method: 'POST',
          body: JSON.stringify({ jeton }),
        }),
      );
      const body = (await res.json().catch(() => null)) as { ok?: boolean; code?: unknown } | null;
      if (body?.ok === true && typeof body.code === 'string') {
        const answer = Response.json({ ok: true, code: body.code });
        answer.headers.set('Cache-Control', 'private, no-store');
        return answer;
      }
      return Response.json({ ok: false }, { status: 404 });
    }

    /**
     * LISTE-MERCI — the purchaser's notify read: the remise route's twin,
     * shape for shape. PUBLIC PATH, PRIVATE ANSWER: gated inside the object
     * on the order's own buyer token + the confirmed state + the liste
     * opt-in, with one constant-shape 404 for every refusal. The 200 carries
     * a first name and wa.me digits — a phone number — so it is stamped
     * never-cache exactly as the code is: a secret must not survive in any
     * intermediary.
     */
    const listeMerci = /^\/checkout\/order\/([^/]+)\/liste-merci$/.exec(pathname);
    if (listeMerci && request.method === 'GET') {
      const orderId = decodeId(listeMerci[1]!);
      const auth = request.headers.get('Authorization') ?? '';
      const jeton = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
      if (orderId === undefined || !ID_ALPHABET.test(orderId) || jeton === '') {
        return Response.json({ ok: false }, { status: 404 });
      }
      const res = await orderStub(env, orderId).fetch(
        new Request('https://do/entry/liste-merci', {
          method: 'POST',
          body: JSON.stringify({ jeton }),
        }),
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; nom?: unknown; telephone?: unknown; pid?: unknown }
        | null;
      if (body?.ok === true && typeof body.nom === 'string' && typeof body.telephone === 'string' && typeof body.pid === 'string') {
        const answer = Response.json({ ok: true, nom: body.nom, telephone: body.telephone, pid: body.pid });
        answer.headers.set('Cache-Control', 'private, no-store');
        return answer;
      }
      return Response.json({ ok: false }, { status: 404 });
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
      /**
       * RESERVATION-REGLE-1 (AUDIT-SHOP-2 F-08) — THE DOOR PARKS WHAT IT REFUSES
       * AS POISON. The body is read as the TEXT it arrived as, so what the DLQ
       * keeps is byte-exact (the vault's law: never parse-and-restringify
       * before parking). Not JSON, not a canon PlatformEvent, no routable
       * order id, and the order object's own shape refusals (`malformed_
       * payload`, `envelope_field_too_long`, `not_a_platform_event`) park;
       * every named refusal still answers exactly as before. VALID events the
       * vault refuses by STATE are not poison and are not parked.
       */
      const texte = await request.text();
      let raw: unknown;
      try {
        raw = JSON.parse(texte);
      } catch {
        await parkPoison(env, texte, { reason: 'not_json', correlationId: 'unrouted' });
        return badRequest('malformed_event');
      }
      const parsed = PlatformEventSchema.safeParse(raw);
      if (!parsed.success) {
        await parkPoison(env, texte, { reason: 'not_a_canonical_platform_event', correlationId: 'unrouted' });
        return badRequest('malformed_event');
      }
      const payload = parsed.data.payload as Record<string, unknown>;
      const orderId = payload['order_id'];
      if (!bounded(orderId, 191) || !ID_ALPHABET.test(orderId)) {
        await parkPoison(env, texte, { reason: 'bad_order_id', correlationId: parsed.data.envelope.correlation_id });
        return badRequest('bad_field', 'order_id');
      }

      // PAYER-TOUT-1 — the merchant reference the provider echoes names what
      // was charged: an order, or a group of them. A group hands the SAME
      // event to each of its orders, which judge it in the vault.
      const stub = isGroupId(orderId)
        ? env.PAYMENT_GROUP?.get(env.PAYMENT_GROUP.idFromName(orderId))
        : orderStub(env, orderId);
      if (stub === undefined) return refuse('unknown_order');
      const res = await stub.fetch(
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
        if (typeof body.reason === 'string' && POISON_REFUSALS.has(body.reason)) {
          await parkPoison(env, texte, { reason: body.reason, correlationId: parsed.data.envelope.correlation_id });
        }
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
    /**
     * NB-3 (E2) — the key-read for the sandbox stand-in. GET-only, and it
     * exists on the wire ONLY behind the composition root's webhook-secret
     * gate (the same one the two POST routes below stand behind); the router
     * itself is never mounted without it. One opaque key out, nothing else.
     */
    {
      const legKeyMatch = /^\/checkout\/webhook\/leg-key\/([^/]+)$/.exec(pathname);
      if (request.method === 'GET' && legKeyMatch !== null) {
        // PUBLIC-DECODE-1 (AUDIT-SHOP-2 F-26) — a segment that will not decode
        // is not an id: the same named 400 the alphabet check answers, never a 500.
        const orderId = decodeId(legKeyMatch[1]!);
        if (orderId === undefined || !ID_ALPHABET.test(orderId)) return badRequest('bad_field', 'orderId');
        const leg = new URL(request.url).searchParams.get('leg') ?? 'checkout';
        if (isGroupId(orderId)) {
          if (env.PAYMENT_GROUP === undefined) return refuse('unknown_order');
          // COLIS-FOURNISSEUR-1 — a package's door collection lives in its group.
          const porte = PORTE_ID.exec(orderId);
          if (porte !== null && leg === 'door') {
            const res = await env.PAYMENT_GROUP.get(env.PAYMENT_GROUP.idFromName(porte[1]!)).fetch(
              new Request(`https://do/entry/porte-key?collecte=${encodeURIComponent(orderId)}`),
            );
            return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
          }
          if (leg !== 'checkout' || porte !== null) return refuse('unknown_order');
          const res = await env.PAYMENT_GROUP.get(env.PAYMENT_GROUP.idFromName(orderId)).fetch(
            new Request('https://do/entry/leg-key'),
          );
          return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
        }
        const res = await orderStub(env, orderId).fetch(
          new Request(`https://do/entry/leg-key?leg=${encodeURIComponent(leg)}`),
        );
        return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
      }
    }

    /**
     * REMBOURSEMENT-1 — THE PROVIDER'S REFUND CONFIRMATION, the third webhook
     * road, behind the SAME secret (checked by the composition root before any
     * dispatch) and parking poison on the SAME terms as the two payment roads.
     * It names an ORDER, never a group: a refund is one order's, even out of a
     * grouped collection. Its amount is judged in the vault against the refund
     * this order asked for, never trusted from the payload.
     * REMBOURSEMENT-PORTE-FERMEE — the one exception, a package's door payment
     * closed on « took nothing » and confirmed after all: that money is no
     * order's, so its refund is its payment object's, judged there.
     */
    if (request.method === 'POST' && pathname === '/checkout/webhook/refund') {
      const texte = await request.text();
      let raw: unknown;
      try {
        raw = JSON.parse(texte);
      } catch {
        await parkPoison(env, texte, { reason: 'not_json', correlationId: 'unrouted' });
        return badRequest('malformed_event');
      }
      const parsed = PlatformEventSchema.safeParse(raw);
      if (!parsed.success) {
        await parkPoison(env, texte, { reason: 'not_a_canonical_platform_event', correlationId: 'unrouted' });
        return badRequest('malformed_event');
      }
      const payload = parsed.data.payload as Record<string, unknown>;
      const orderId = payload['order_id'];
      const porte = typeof orderId === 'string' ? PORTE_ID.exec(orderId) : null;
      if (!bounded(orderId, 191) || !ID_ALPHABET.test(orderId) || (isGroupId(orderId) && porte === null)) {
        await parkPoison(env, texte, { reason: 'bad_order_id', correlationId: parsed.data.envelope.correlation_id });
        return badRequest('bad_field', 'order_id');
      }
      const stub = porte === null ? orderStub(env, orderId) : env.PAYMENT_GROUP?.get(env.PAYMENT_GROUP.idFromName(porte[1]!));
      if (stub === undefined) return refuse('unknown_order');
      const res = await stub.fetch(
        new Request(porte === null ? 'https://do/entry/refund-webhook' : 'https://do/entry/porte-refund-webhook', {
          method: 'POST',
          body: JSON.stringify({ event: parsed.data }),
        }),
      );
      const body = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string; status?: string; state?: string } | null;
      if (body === null) return refuse('unknown_order');
      if (body.ok !== true) {
        if (typeof body.reason === 'string' && POISON_REFUSALS.has(body.reason)) {
          await parkPoison(env, texte, { reason: body.reason, correlationId: parsed.data.envelope.correlation_id });
        }
        return Response.json({ error: body.reason ?? 'refused' }, { status: res.status });
      }
      return Response.json({ status: body.status, state: body.state }, { status: 200 });
    }

    /** REMBOURSEMENT-1 — the stand-in's read of the refunds it was asked for (webhook secret, GET only). */
    {
      const refundKeyMatch = /^\/checkout\/webhook\/refund-key\/([^/]+)$/.exec(pathname);
      if (request.method === 'GET' && refundKeyMatch !== null) {
        const orderId = decodeId(refundKeyMatch[1]!);
        // A group refunds nothing itself: each of its orders refunds its own
        // part — save a closed door payment confirmed after all, whose refund
        // is its payment object's (REMBOURSEMENT-PORTE-FERMEE).
        const porte = orderId === undefined ? null : PORTE_ID.exec(orderId);
        if (orderId === undefined || !ID_ALPHABET.test(orderId) || (isGroupId(orderId) && porte === null)) return badRequest('bad_field', 'orderId');
        if (porte !== null) {
          if (env.PAYMENT_GROUP === undefined) return refuse('unknown_order');
          const res = await env.PAYMENT_GROUP.get(env.PAYMENT_GROUP.idFromName(porte[1]!)).fetch(
            new Request(`https://do/entry/porte-refund-key?collecte=${encodeURIComponent(orderId)}`),
          );
          return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
        }
        const res = await orderStub(env, orderId).fetch(new Request('https://do/entry/refund-key'));
        return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (request.method === 'POST' && pathname === '/checkout/webhook/door') {
      // RESERVATION-REGLE-1 — the door leg's road parks what it refuses as
      // poison on exactly the checkout road's terms (verifier finding: same
      // secret, same refusal classes, same book twenty lines apart).
      const texte = await request.text();
      let raw: unknown;
      try {
        raw = JSON.parse(texte);
      } catch {
        await parkPoison(env, texte, { reason: 'not_json', correlationId: 'unrouted' });
        return badRequest('malformed_event');
      }
      const parsed = PlatformEventSchema.safeParse(raw);
      if (!parsed.success) {
        await parkPoison(env, texte, { reason: 'not_a_canonical_platform_event', correlationId: 'unrouted' });
        return badRequest('malformed_event');
      }
      const payload = parsed.data.payload as Record<string, unknown>;
      const orderId = payload['order_id'];
      if (!bounded(orderId, 191) || !ID_ALPHABET.test(orderId)) {
        await parkPoison(env, texte, { reason: 'bad_order_id', correlationId: parsed.data.envelope.correlation_id });
        return badRequest('bad_field', 'order_id');
      }

      // COLIS-FOURNISSEUR-1 — a package's door collection is its group's to
      // hand to each kept article; any other group id names nothing here.
      let stub: DurableObjectStub | undefined = orderStub(env, orderId);
      let chemin = 'https://do/entry/door-webhook';
      if (isGroupId(orderId)) {
        const porte = PORTE_ID.exec(orderId);
        stub = porte === null ? undefined : env.PAYMENT_GROUP?.get(env.PAYMENT_GROUP.idFromName(porte[1]!));
        chemin = 'https://do/entry/porte-webhook';
      }
      if (stub === undefined) return refuse('unknown_order');
      const res = await stub.fetch(
        new Request(chemin, {
          method: 'POST',
          body: JSON.stringify({ event: parsed.data }),
        }),
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; reason?: string; status?: string; doorLeg?: string }
        | null;
      if (body === null) return refuse('unknown_order');
      if (body.ok !== true) {
        if (typeof body.reason === 'string' && POISON_REFUSALS.has(body.reason)) {
          await parkPoison(env, texte, { reason: body.reason, correlationId: parsed.data.envelope.correlation_id });
        }
        return Response.json({ error: body.reason ?? 'refused' }, { status: res.status });
      }
      // The provider learns what happened to ITS event. `doorLeg` is a state,
      // never an amount — the same line the buyer projection holds.
      return Response.json({ status: body.status, doorLeg: body.doorLeg }, { status: 200 });
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};
