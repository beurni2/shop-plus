import { PlatformEventSchema, type PlatformEvent } from '@platform/contracts';

/**
 * THIN E1 ORDER STATE MACHINE (WO-1.1 c). Exactly five states, one linear
 * path — no terminal/failure states (E2 owns those; WO FORBIDDEN). Unknown
 * or out-of-order transitions REFUSE CLOSED. Every accepted transition emits
 * one enveloped PlatformEvent {command_id, correlation_id, aggregateVersion,
 * actor, serverTime} whose payload carries the correlation chain
 * quote_id → reservation_id → payment_attempt_id → order_id as the ids
 * become known. All event names come from the pinned EVENT_NAMES — none
 * invented here.
 */

export const ORDER_STATES = [
  'quote_issued',
  'reserved',
  'payment_pending',
  'paid',
  'confirmed',
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

const NEXT: Readonly<Record<OrderState, OrderState | undefined>> = {
  quote_issued: 'reserved',
  reserved: 'payment_pending',
  payment_pending: 'paid',
  paid: 'confirmed',
  confirmed: undefined,
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

export type TransitionOutcome =
  | { ok: true; journey: OrderJourney; event: PlatformEvent }
  | {
      ok: false;
      journey: OrderJourney;
      reason: 'unknown_state' | 'out_of_order' | 'chain_id_conflict';
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
    events: [],
  };
  journey.events.push(
    emit(journey, 'checkout.quote_created.v1', args.command_id, args.actor, args.serverTime),
  );
  return journey;
}

const STATE_EVENT: Readonly<Record<Exclude<OrderState, 'quote_issued'>, PlatformEvent['name']>> = {
  reserved: 'order.status_projection_updated.v1',
  payment_pending: 'order.status_projection_updated.v1',
  paid: 'order.status_projection_updated.v1',
  confirmed: 'order.confirmed.v1',
};

export function advanceOrder(journey: OrderJourney, cmd: TransitionCommand): TransitionOutcome {
  if (!(ORDER_STATES as readonly string[]).includes(cmd.to)) {
    return { ok: false, journey, reason: 'unknown_state', attempted: cmd.to };
  }
  const to = cmd.to as OrderState;
  if (to === 'quote_issued' || NEXT[journey.state] !== to) {
    // Nothing ever transitions INTO quote_issued; everything else must be
    // the single next state on the linear path.
    return { ok: false, journey, reason: 'out_of_order', attempted: cmd.to };
  }
  // Chain ids are write-once: a transition may add ids, never overwrite one.
  for (const [key, value] of Object.entries(cmd.chainAdditions ?? {})) {
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
    events: [...journey.events],
  };
  const event = emit(next, STATE_EVENT[to], cmd.command_id, cmd.actor, cmd.serverTime);
  next.events.push(event);
  return { ok: true, journey: next, event };
}

function emit(
  journey: OrderJourney,
  name: PlatformEvent['name'],
  command_id: string,
  actor: string,
  serverTime: string,
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
    payload: { ...journey.chain, status: journey.state },
  });
}
