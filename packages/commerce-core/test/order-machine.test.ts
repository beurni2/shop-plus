import { describe, expect, it } from 'vitest';
import { EventEnvelopeSchema, PlatformEventSchema } from '@platform/contracts';
import { advanceOrder, beginJourney, type OrderJourney } from '../src/order-machine.js';

const T = '2026-07-09T12:00:00.000Z';
const cmd = (command_id: string, to: string, chainAdditions?: Record<string, string>) => ({
  command_id,
  actor: 'commerce-core:test',
  serverTime: T,
  to,
  chainAdditions,
});

function fullJourney(): OrderJourney {
  let j = beginJourney({ correlationId: 'corr-1', quoteId: 'q-1', command_id: 'c0', actor: 'commerce-core:test', serverTime: T });
  for (const [id, to, add] of [
    ['c1', 'reserved', { reservation_id: 'res-1' }],
    ['c2', 'payment_pending', { payment_attempt_id: 'pay-1', order_id: 'ord-1' }],
    ['c3', 'paid', undefined],
    ['c4', 'confirmed', undefined],
  ] as const) {
    const out = advanceOrder(j, cmd(id, to, add as Record<string, string> | undefined));
    if (!out.ok) throw new Error(`setup failed at ${to}: ${out.reason}`);
    j = out.journey;
  }
  return j;
}

describe('thin order state machine — five states, refuse closed (WO-1.1 c)', () => {
  it('walks quote_issued → reserved → payment_pending → paid → confirmed, one enveloped event per transition', () => {
    const j = fullJourney();
    expect(j.state).toBe('confirmed');
    expect(j.events).toHaveLength(5);
    // aggregateVersion strictly increments 1..5.
    expect(j.events.map((e) => e.envelope.aggregateVersion)).toEqual([1, 2, 3, 4, 5]);
    // One correlation id across the journey.
    expect(new Set(j.events.map((e) => e.envelope.correlation_id))).toEqual(new Set(['corr-1']));
    // Every event validates against the pinned strict envelope + event schema.
    for (const e of j.events) {
      expect(PlatformEventSchema.safeParse(e).success).toBe(true);
      expect(EventEnvelopeSchema.safeParse(e.envelope).success).toBe(true);
    }
    // Canon event names only.
    expect(j.events.map((e) => e.name)).toEqual([
      'checkout.quote_created.v1',
      'order.status_projection_updated.v1',
      'order.status_projection_updated.v1',
      'order.status_projection_updated.v1',
      'order.confirmed.v1',
    ]);
  });

  it('the final event payload carries the FULL chain quote_id → reservation_id → payment_attempt_id → order_id', () => {
    const j = fullJourney();
    const last = j.events.at(-1)!;
    expect(last.payload).toMatchObject({
      quote_id: 'q-1',
      reservation_id: 'res-1',
      payment_attempt_id: 'pay-1',
      order_id: 'ord-1',
      status: 'confirmed',
    });
  });

  it('SKIPPING a state refuses closed (quote_issued → payment_pending)', () => {
    const j = beginJourney({ correlationId: 'corr-1', quoteId: 'q-1', command_id: 'c0', actor: 'a', serverTime: T });
    const out = advanceOrder(j, cmd('cx', 'payment_pending'));
    expect(out).toMatchObject({ ok: false, reason: 'out_of_order' });
    expect(out.journey.state).toBe('quote_issued'); // nothing moved
    expect(out.journey.events).toHaveLength(1); // nothing emitted
  });

  it('going BACKWARD refuses closed (paid → reserved)', () => {
    let j = beginJourney({ correlationId: 'corr-1', quoteId: 'q-1', command_id: 'c0', actor: 'a', serverTime: T });
    for (const [id, to] of [['c1', 'reserved'], ['c2', 'payment_pending'], ['c3', 'paid']] as const) {
      const out = advanceOrder(j, cmd(id, to));
      if (!out.ok) throw new Error('setup');
      j = out.journey;
    }
    expect(advanceOrder(j, cmd('cb', 'reserved'))).toMatchObject({ ok: false, reason: 'out_of_order' });
  });

  it('UNKNOWN states refuse closed — no terminal/failure state exists at E1 (E2 owns those)', () => {
    const j = fullJourney();
    for (const attempted of ['failed', 'cancelled', 'refunded', 'delivered', 'anything_else']) {
      const out = advanceOrder(j, cmd(`c-${attempted}`, attempted));
      expect(out, attempted).toMatchObject({ ok: false, reason: 'unknown_state' });
    }
    // confirmed is the E1 end: even a valid state name cannot advance past it.
    expect(advanceOrder(j, cmd('c-again', 'confirmed'))).toMatchObject({ ok: false, reason: 'out_of_order' });
  });

  it('chain ids are write-once: a transition trying to REWRITE quote_id refuses closed', () => {
    const j = beginJourney({ correlationId: 'corr-1', quoteId: 'q-1', command_id: 'c0', actor: 'a', serverTime: T });
    const out = advanceOrder(j, cmd('c1', 'reserved', { quote_id: 'q-EVIL' }));
    expect(out).toMatchObject({ ok: false, reason: 'chain_id_conflict' });
  });
});
