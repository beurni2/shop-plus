import { ORDER_STATUSES, PlatformEventSchema, type PlatformEvent } from '@platform/contracts';

/**
 * ORDER STATE MACHINE (WO-1.1 c, extended WO-2.3 for E2 failure paths).
 * The state LIST is the canon enum (§2.2 single definition — v0.5.0 carries
 * the three derived failure states); the transitions are app work:
 *
 *   happy:   quote_issued → reserved → payment_pending → paid → confirmed
 *   failure: payment_pending → payment_failed        (provider fail/timeout)
 *            payment_failed  → payment_pending        (retry, NEW attempt id)
 *            payment_failed  → cancelled               (abandon)
 *            quote_issued | reserved | payment_pending → cancelled (pre-payment)
 *
 *   paid|confirmed → cancelled REFUSES CLOSED (`refund_required_e3`):
 *   money has moved — un-moving it is the E3 refund/earning-reversal saga.
 *   `refunded` exists in the canon enum but NO transition reaches it at E2.
 *
 * Unknown or out-of-order transitions REFUSE CLOSED. Every accepted
 * transition emits one enveloped PlatformEvent. Chain ids are write-once,
 * with EXACTLY ONE modeled exception: a payment RETRY replaces
 * payment_attempt_id with a new one — the prior id is preserved in
 * priorPaymentAttemptIds and named in the event payload (auditable
 * replacement, never silent mutation).
 */

export const ORDER_STATES = ORDER_STATUSES;
export type OrderState = (typeof ORDER_STATES)[number];

const HAPPY_NEXT: Readonly<Partial<Record<OrderState, OrderState>>> = {
  quote_issued: 'reserved',
  reserved: 'payment_pending',
  payment_pending: 'paid',
  paid: 'confirmed',
};

const FAILURE_NEXT: Readonly<Partial<Record<OrderState, readonly OrderState[]>>> = {
  quote_issued: ['cancelled'],
  reserved: ['cancelled'],
  payment_pending: ['payment_failed', 'cancelled'],
  payment_failed: ['payment_pending', 'cancelled'],
};

/** The correlation chain (§2.3 steps 6–8): grows monotonically, never mutates. */
export interface OrderChain {
  quote_id: string;
  reservation_id?: string;
  payment_attempt_id?: string;
  order_id?: string;
}

export interface OrderJourney {
  correlationId: string;
  state: OrderState;
  aggregateVersion: number;
  chain: OrderChain;
  /** attempts superseded by a modeled payment retry (audit trail). */
  priorPaymentAttemptIds: readonly string[];
  events: PlatformEvent[];
}

export interface TransitionCommand {
  command_id: string;
  actor: string;
  serverTime: string;
  to: string;
  /** New chain ids learned by this transition (e.g. reservation_id at reserved). */
  chainAdditions?: Partial<OrderChain>;
}

export type TransitionRefusalReason =
  | 'unknown_state'
  | 'out_of_order'
  | 'chain_id_conflict'
  | 'refund_required_e3'
  | 'retry_requires_new_attempt_id';

export type TransitionOutcome =
  | { ok: true; journey: OrderJourney; event: PlatformEvent }
  | {
      ok: false;
      journey: OrderJourney;
      reason: TransitionRefusalReason;
      attempted: string;
    };

export function beginJourney(args: {
  correlationId: string;
  quoteId: string;
  command_id: string;
  actor: string;
  serverTime: string;
}): OrderJourney {
  const journey: OrderJourney = {
    correlationId: args.correlationId,
    state: 'quote_issued',
    aggregateVersion: 1,
    chain: { quote_id: args.quoteId },
    priorPaymentAttemptIds: [],
    events: [],
  };
  journey.events.push(
    emit(journey, 'checkout.quote_created.v1', args.command_id, args.actor, args.serverTime, {}),
  );
  return journey;
}

const STATE_EVENT: Readonly<Partial<Record<OrderState, PlatformEvent['name']>>> = {
  reserved: 'order.status_projection_updated.v1',
  payment_pending: 'order.status_projection_updated.v1',
  paid: 'order.status_projection_updated.v1',
  confirmed: 'order.confirmed.v1',
  payment_failed: 'order.status_projection_updated.v1',
  cancelled: 'order.status_projection_updated.v1',
};

export function advanceOrder(journey: OrderJourney, cmd: TransitionCommand): TransitionOutcome {
  if (!(ORDER_STATES as readonly string[]).includes(cmd.to)) {
    return { ok: false, journey, reason: 'unknown_state', attempted: cmd.to };
  }
  const to = cmd.to as OrderState;
  const happyAllowed = HAPPY_NEXT[journey.state] === to;
  const failureAllowed = (FAILURE_NEXT[journey.state] ?? []).includes(to);
  if (!happyAllowed && !failureAllowed) {
    // A cancel against moved money is not out-of-order noise — it is the E3
    // refund saga's job, and the refusal says so honestly.
    if (to === 'cancelled' && (journey.state === 'paid' || journey.state === 'confirmed')) {
      return { ok: false, journey, reason: 'refund_required_e3', attempted: cmd.to };
    }
    return { ok: false, journey, reason: 'out_of_order', attempted: cmd.to };
  }

  const isRetry = journey.state === 'payment_failed' && to === 'payment_pending';
  let priorPaymentAttemptIds = journey.priorPaymentAttemptIds;
  let retryPayload: Record<string, string> = {};
  if (isRetry) {
    const newAttempt = cmd.chainAdditions?.payment_attempt_id;
    const prior = journey.chain.payment_attempt_id;
    if (
      newAttempt === undefined ||
      newAttempt === prior ||
      priorPaymentAttemptIds.includes(newAttempt)
    ) {
      return { ok: false, journey, reason: 'retry_requires_new_attempt_id', attempted: cmd.to };
    }
    if (prior !== undefined) {
      priorPaymentAttemptIds = [...priorPaymentAttemptIds, prior];
      retryPayload = { previous_payment_attempt_id: prior };
    }
  }

  // Chain ids are write-once: a transition may add ids, never overwrite one
  // (the modeled retry replacement above is the single audited exception).
  for (const [key, value] of Object.entries(cmd.chainAdditions ?? {})) {
    if (isRetry && key === 'payment_attempt_id') continue;
    const existing = journey.chain[key as keyof OrderChain];
    if (existing !== undefined && existing !== value) {
      return { ok: false, journey, reason: 'chain_id_conflict', attempted: cmd.to };
    }
  }

  const next: OrderJourney = {
    ...journey,
    state: to,
    aggregateVersion: journey.aggregateVersion + 1,
    chain: { ...journey.chain, ...cmd.chainAdditions },
    priorPaymentAttemptIds,
    events: [...journey.events],
  };
  const event = emit(next, STATE_EVENT[to]!, cmd.command_id, cmd.actor, cmd.serverTime, retryPayload);
  next.events.push(event);
  return { ok: true, journey: next, event };
}

function emit(
  journey: OrderJourney,
  name: PlatformEvent['name'],
  command_id: string,
  actor: string,
  serverTime: string,
  extra: Record<string, string>,
): PlatformEvent {
  // Runtime-validated against the pinned strict schema — an event this
  // module cannot prove canonical is an event it does not emit.
  return PlatformEventSchema.parse({
    name,
    envelope: {
      command_id,
      correlation_id: journey.correlationId,
      aggregateVersion: journey.aggregateVersion,
      actor,
      serverTime,
      version: '1',
    },
    payload: { ...journey.chain, status: journey.state, ...extra },
  });
}
