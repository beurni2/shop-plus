import { describe, expect, it } from 'vitest';
import {
  MockPaymentProvider,
  OrderSpine,
  WORKED_BASELINE_INPUT,
  issueQuote,
  partDesFrais,
  type GroupPaymentShares,
  type RemboursementAttendu,
} from '../src/index.js';

/**
 * Shop-Plus-Build-Spec §7 SP6 (founder ruling 2026-11-28, « Refund it
 * automatically »): money the provider confirms for an order whose payment had
 * already failed here never pays the order; it is refunded under its own
 * refund key, for exactly the amount the order asked the provider for, to the
 * franc (a grouped collection: each order its own share); a confirmation
 * naming any other amount is not refunded by itself; once that refund is
 * asked no retry of the order charges again; the order reads `refunded` only
 * when the provider confirms the refund.
 *
 * Driven through the certified sandbox mock with its time-out knob: the charge
 * times out here while the provider in fact collected (`timeoutCollects`), so
 * the confirmation below is the one the provider itself emits.
 */

const T = '2026-11-28T08:00:00.000Z';
const LATER = '2026-11-28T08:05:00.000Z';
const flags = { version: 'p14-test', flags: {}, kills: [], killedCategories: [] };
const COLLECTE = { timeoutFirstNInitiates: 1, timeoutCollects: true };

function quoteFor(seed: string) {
  const issued = issueQuote(
    { flags, now: () => new Date(T), newId: () => `quote-${seed}` },
    { listingRef: 'lst-1', offerRef: 'offer-1', attributionResellerId: 'rs-1', ...WORKED_BASELINE_INPUT } as Parameters<typeof issueQuote>[1],
  );
  if (!issued.ok) throw new Error(`quote refused: ${issued.reason}`);
  return issued.quote;
}

/** A REAL spine whose first charge timed out here: `payment_failed`, its key on record. */
function commandeEchouee(seed: string) {
  const quote = quoteFor(seed);
  const orderId = `order-${seed}`;
  const correlationId = `corr-${seed}`;
  const key = `pk-${seed}`;
  const spine = new OrderSpine({ quote, supplierRef: 'sup-1', correlationId, issueCommandId: `issue-${seed}`, actor: 'test', serverTime: T });
  spine.advance({ command_id: `rsv-${seed}`, actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: `res-${seed}` } });
  spine.advance({ command_id: `pay-${seed}`, actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: `att-${seed}`, order_id: orderId } });
  const provider = new MockPaymentProvider(COLLECTE);
  expect(provider.initiateCharge({ orderId, paymentAttemptId: key, amount: quote.amountPaidAtCheckout, correlationId, requestedAtIso: T, legType: 'checkout' }).outcome).toBe('timeout');
  const failed = spine.failPayment({ command_id: `fail-${seed}`, actor: 'a', serverTime: T, reason: 'charge_timeout' });
  if (!failed.ok) throw new Error('setup: fail refused');
  const genuine = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.checkout_leg_confirmed.v1')!.event;
  return { spine, quote, orderId, correlationId, key, provider, genuine };
}

type Echouee = ReturnType<typeof commandeEchouee>;

const avec = (event: Echouee['genuine'], over: { envelope?: Record<string, unknown>; payload?: Record<string, unknown> }) => ({
  ...event,
  envelope: { ...event.envelope, ...(over.envelope ?? {}) },
  payload: { ...event.payload, ...(over.payload ?? {}) },
});

/** Ask the provider for every line the vault decides, keyed as the order object keys them. */
function demander(c: Echouee): RemboursementAttendu[] {
  const plan = c.spine.decideRefund({ nature: 'paiement_apres_echec' });
  if (!plan.ok) throw new Error(`plan refused: ${plan.reason}`);
  return plan.lignes.map((l, i) => {
    const refundKey = `rf-${c.orderId}-${i}`;
    expect(c.provider.initiateRefund({ orderId: c.orderId, refundKey, collectRef: l.collectRef, amount: l.amount, correlationId: c.correlationId, requestedAtIso: T, legType: l.legType }).outcome).toBe('accepted');
    return { ...l, refundKey };
  });
}

const refundEvents = (provider: MockPaymentProvider) =>
  provider.webhookDeliveryPlan().filter((d) => d.event.name === 'payment.refund_confirmed.v1').map((d) => d.event);

describe('money the provider confirms after the payment failed here', () => {
  it('the late confirmation still never pays the order; recorded after the failure, it is held for the refund and the state does not move', () => {
    const c = commandeEchouee('p1');
    // The payment judge's refusal and its alert are exactly today's.
    const refus = c.spine.onProviderPaymentEvent(c.genuine, c.key);
    expect(refus).toMatchObject({ applied: false, reason: 'out_of_order' });
    expect((refus as { alert?: { payload: Record<string, unknown> } }).alert?.payload).toMatchObject({
      alert: 'genuine_webhook_after_local_failure',
      provider_amount: c.quote.amountPaidAtCheckout,
    });

    expect(c.spine.onProviderPaymentAfterFailure(c.genuine, c.key)).toEqual({ applied: true, duplicate: false });
    expect(c.spine.journey.state).toBe('payment_failed');
    const escrow = c.spine.ledger.escrowFor(c.orderId)!;
    expect(escrow.paymentLegs).toHaveLength(1);
    expect(escrow.paymentLegs[0]).toMatchObject({
      legType: 'checkout',
      amount: c.quote.amountPaidAtCheckout,
      collectRef: `collect-${c.key}`,
    });
    expect(c.spine.paidAfterFailure).toBe(true);
    // The same confirmation again is absorbed: nothing new.
    expect(c.spine.onProviderPaymentAfterFailure(c.genuine, c.key)).toEqual({ applied: true, duplicate: true });
    expect(c.spine.ledger.escrowFor(c.orderId)!.paymentLegs).toHaveLength(1);
  }, 10_000);

  it('only THIS charge, for exactly the amount the order asked, funded: every other confirmation records nothing', () => {
    const autres: [string, (c: Echouee) => unknown, string][] = [
      ['a franc more', (c) => avec(c.genuine, { envelope: { command_id: 'whk-plus' }, payload: { amount: c.quote.amountPaidAtCheckout + 1 } }), 'amount_mismatch'],
      ['a franc less', (c) => avec(c.genuine, { envelope: { command_id: 'whk-moins' }, payload: { amount: c.quote.amountPaidAtCheckout - 1 } }), 'amount_mismatch'],
      ['another charge', (c) => avec(c.genuine, { envelope: { command_id: 'whk-autre' }, payload: { payment_attempt_id: 'pk-someone-else' } }), 'attempt_mismatch'],
      ['another order', (c) => avec(c.genuine, { envelope: { command_id: 'whk-ordre' }, payload: { order_id: 'order-other' } }), 'order_mismatch'],
      ['not funded', (c) => avec(c.genuine, { envelope: { command_id: 'whk-statut' }, payload: { status: 'pending' } }), 'unfunded_leg_status'],
    ];
    for (const [nom, fabriquer, raison] of autres) {
      const c = commandeEchouee(`p2-${nom.replace(/\s/g, '')}`);
      expect(c.spine.onProviderPaymentAfterFailure(fabriquer(c), c.key), nom).toMatchObject({ applied: false, reason: raison });
      expect(c.spine.ledger.escrowFor(c.orderId), nom).toBeUndefined();
      expect(c.spine.paidAfterFailure, nom).toBe(false);
      expect(c.spine.decideRefund({ nature: 'paiement_apres_echec' }), nom).toEqual({ ok: false, reason: 'pas_paye' });
    }
  }, 10_000);

  it('an order whose payment has NOT failed here is not its road: pending pays by the ordinary judge, paid refuses', () => {
    const c = commandeEchouee('p3');
    expect(c.spine.retryPayment({ command_id: 'retry-p3', actor: 'a', serverTime: LATER, newPaymentAttemptId: 'att-p3-2' }).ok).toBe(true);
    expect(c.spine.journey.state).toBe('payment_pending');
    // While a retry is in flight under the SAME key, the confirmation is that collection: it pays the order.
    expect(c.spine.onProviderPaymentAfterFailure(c.genuine, c.key)).toMatchObject({ applied: false, reason: 'out_of_order' });
    expect(c.spine.onProviderPaymentEvent(c.genuine, c.key)).toEqual({ applied: true, duplicate: false });
    expect(c.spine.journey.state).toBe('paid');
    expect(c.spine.onProviderPaymentAfterFailure(avec(c.genuine, { envelope: { command_id: 'whk-again' } }), c.key)).toMatchObject({ applied: false, reason: 'out_of_order' });
    expect(c.spine.ledger.escrowFor(c.orderId)!.paymentLegs).toHaveLength(1);
  }, 10_000);

  it('the refund decided: the whole checkout leg, nothing kept — and a provider fee never comes off her refund', () => {
    const c = commandeEchouee('p4');
    const avecFrais = avec(c.genuine, { payload: { fee: 150 } });
    expect(c.spine.onProviderPaymentAfterFailure(avecFrais, c.key)).toEqual({ applied: true, duplicate: false });
    expect(c.spine.ledger.escrowFor(c.orderId)!.paymentLegs[0]).toMatchObject({ amount: c.quote.amountPaidAtCheckout, fee: 150 });
    expect(c.spine.decideRefund({ nature: 'paiement_apres_echec' })).toEqual({
      ok: true,
      retenu: 0,
      lignes: [{ legType: 'checkout', collectRef: `collect-${c.key}`, amount: c.quote.amountPaidAtCheckout }],
    });
  }, 10_000);

  it('`refunded` only on the provider\'s refund confirmation, to the franc; a confirmation twice changes nothing', () => {
    const c = commandeEchouee('p5');
    expect(c.spine.onProviderPaymentAfterFailure(c.genuine, c.key).applied).toBe(true);
    const attendus = demander(c);
    // Asked is not refunded, and no local command can say it is.
    expect(c.spine.journey.state).toBe('payment_failed');
    expect(c.spine.advance({ command_id: 'local-refund', actor: 'ops', serverTime: LATER, to: 'refunded' })).toMatchObject({ ok: false });
    expect(c.spine.journey.state).toBe('payment_failed');

    const [refund] = refundEvents(c.provider);
    expect(c.spine.onProviderRefundEvent(refund!, attendus)).toEqual({ applied: true, duplicate: false });
    expect(c.spine.journey.state).toBe('refunded');
    expect(c.spine.ledger.refundsFor(c.orderId)).toHaveLength(1);
    expect(c.spine.ledger.refundsFor(c.orderId)[0]).toMatchObject({ amount: c.quote.amountPaidAtCheckout, refundKey: attendus[0]!.refundKey });
    expect(c.spine.onProviderRefundEvent(refund!, attendus)).toEqual({ applied: true, duplicate: true });
    expect(c.spine.onProviderRefundEvent(avec(refund!, { envelope: { command_id: 'whk-refund-rival' } }), attendus)).toEqual({ applied: true, duplicate: true });
    expect(c.spine.ledger.refundsFor(c.orderId)).toHaveLength(1);
  }, 10_000);

  it('once refunded from a failure, a fresh confirmation of the same charge changes nothing — never back to paid', () => {
    const c = commandeEchouee('p6');
    expect(c.spine.onProviderPaymentAfterFailure(c.genuine, c.key).applied).toBe(true);
    const attendus = demander(c);
    expect(c.spine.onProviderRefundEvent(refundEvents(c.provider)[0]!, attendus).applied).toBe(true);
    expect(c.spine.journey.state).toBe('refunded');
    const frais = avec(c.genuine, { envelope: { command_id: 'whk-fresh-after-refund' } });
    expect(c.spine.onProviderPaymentEvent(frais, c.key)).toMatchObject({ applied: false, reason: 'out_of_order' });
    expect(c.spine.onProviderPaymentAfterFailure(frais, c.key)).toMatchObject({ applied: false, reason: 'out_of_order' });
    expect(c.spine.journey.state).toBe('refunded');
    expect(c.spine.ledger.escrowFor(c.orderId)!.paymentLegs).toHaveLength(1);
    expect(c.spine.decideRefund({ nature: 'paiement_apres_echec' })).toMatchObject({ ok: true, lignes: [{ legType: 'checkout' }] });
  }, 10_000);

  it('once that money is recorded, no retry of the order may start — refused by name', () => {
    const c = commandeEchouee('p7');
    expect(c.spine.onProviderPaymentAfterFailure(c.genuine, c.key).applied).toBe(true);
    const retry = c.spine.retryPayment({ command_id: 'retry-p7', actor: 'a', serverTime: LATER, newPaymentAttemptId: 'att-p7-2' });
    expect(retry).toMatchObject({ ok: false, reason: 'paiement_rembourse' });
    expect(c.spine.journey.state).toBe('payment_failed');
  }, 10_000);

  it('a refund confirmation on a failed order with no refund asked is refused, and nothing reaches the ledger', () => {
    const c = commandeEchouee('p8');
    c.provider.initiateRefund({ orderId: c.orderId, refundKey: 'rf-never-asked', collectRef: `collect-${c.key}`, amount: c.quote.amountPaidAtCheckout, correlationId: c.correlationId, requestedAtIso: T, legType: 'checkout' });
    const out = c.spine.onProviderRefundEvent(refundEvents(c.provider)[0]!, []);
    expect(out).toMatchObject({ applied: false, reason: 'refund_key_unknown' });
    expect(c.spine.ledger.refundsFor(c.orderId)).toEqual([]);
    expect(c.spine.journey.state).toBe('payment_failed');
  }, 10_000);

  it('`cancelled` after such a failure is refunded the same way', () => {
    const c = commandeEchouee('p9');
    expect(c.spine.cancelOrder({ command_id: 'cancel-p9', actor: 'a', serverTime: LATER }).ok).toBe(true);
    expect(c.spine.onProviderPaymentAfterFailure(c.genuine, c.key)).toEqual({ applied: true, duplicate: false });
    expect(c.spine.journey.state).toBe('cancelled');
    const attendus = demander(c);
    expect(c.spine.onProviderRefundEvent(refundEvents(c.provider)[0]!, attendus).applied).toBe(true);
    expect(c.spine.journey.state).toBe('refunded');
  }, 10_000);

  it('replayed from the same inputs, the ledger and the decided refund are byte-equal', () => {
    const c = commandeEchouee('p10');
    expect(c.spine.onProviderPaymentAfterFailure(avec(c.genuine, { payload: { fee: 75 } }), c.key).applied).toBe(true);
    const rejeu = new OrderSpine({ quote: c.quote, supplierRef: 'sup-1', correlationId: c.correlationId, issueCommandId: 'issue-p10', actor: 'test', serverTime: T });
    rejeu.advance({ command_id: 'rsv-p10', actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-p10' } });
    rejeu.advance({ command_id: 'pay-p10', actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'att-p10', order_id: c.orderId } });
    rejeu.failPayment({ command_id: 'fail-p10', actor: 'a', serverTime: T, reason: 'charge_timeout' });
    expect(rejeu.onProviderPaymentAfterFailure(avec(c.genuine, { payload: { fee: 75 } }), c.key).applied).toBe(true);
    expect(JSON.stringify(rejeu.ledger.escrowFor(c.orderId))).toBe(JSON.stringify(c.spine.ledger.escrowFor(c.orderId)));
    expect(JSON.stringify(rejeu.decideRefund({ nature: 'paiement_apres_echec' }))).toBe(JSON.stringify(c.spine.decideRefund({ nature: 'paiement_apres_echec' })));
    expect(rejeu.journey.state).toBe(c.spine.journey.state);
  }, 10_000);
});

/* ─────────────────────────── a grouped collection ─────────────────────────── */

function groupeEchoue(seeds: [string, string], quotes?: [ReturnType<typeof quoteFor>, ReturnType<typeof quoteFor>]) {
  const membres = seeds.map((seed, i) => {
    const quote = quotes?.[i] ?? quoteFor(seed);
    const orderId = `order-${seed}`;
    const spine = new OrderSpine({ quote, supplierRef: 'sup-1', correlationId: `corr-${seed}`, issueCommandId: `issue-${seed}`, actor: 't', serverTime: T });
    spine.advance({ command_id: `rsv-${seed}`, actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: `res-${seed}` } });
    spine.advance({ command_id: `pay-${seed}`, actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: `att-${seed}`, order_id: orderId } });
    return { spine, quote, orderId, correlationId: `corr-${seed}` };
  });
  const groupId = `grp-${seeds.join('')}`;
  const groupe: GroupPaymentShares = {
    groupId,
    correlationId: `corr-${groupId}`,
    parts: membres.map((m) => ({ orderId: m.orderId, amount: m.quote.amountPaidAtCheckout })),
  };
  const total = groupe.parts.reduce((s, p) => s + p.amount, 0);
  const key = `pk-${groupId}`;
  const provider = new MockPaymentProvider(COLLECTE);
  expect(provider.initiateCharge({ orderId: groupId, paymentAttemptId: key, amount: total, correlationId: groupe.correlationId, requestedAtIso: T, legType: 'checkout' }).outcome).toBe('timeout');
  for (const m of membres) {
    if (!m.spine.failPayment({ command_id: `fail-${m.orderId}`, actor: 'a', serverTime: T, reason: 'charge_timeout' }).ok) throw new Error('setup: fail');
  }
  const genuine = provider.webhookDeliveryPlan().find((d) => d.event.payload['order_id'] === groupId)!.event;
  return { membres, groupe, total, key, provider, genuine };
}

describe('a grouped collection whose charge failed here and was collected anyway', () => {
  it('each order holds ITS OWN share against the collection\'s reference; the fee is shared; each refund is its own amount', () => {
    const autre = issueQuote(
      { flags, now: () => new Date(T), newId: () => 'quote-g2' },
      { listingRef: 'lst-2', offerRef: 'offer-2', attributionResellerId: 'rs-1', ...WORKED_BASELINE_INPUT, resellerMarkup: 2_500 } as Parameters<typeof issueQuote>[1],
    );
    if (!autre.ok) throw new Error('quote');
    const g = groupeEchoue(['g1', 'g2'], [quoteFor('g1'), autre.quote]);
    expect(g.groupe.parts[0]!.amount).not.toBe(g.groupe.parts[1]!.amount);
    const avecFrais = avec(g.genuine, { payload: { fee: 90 } });
    for (const m of g.membres) {
      expect(m.spine.onGroupProviderPaymentEvent(avecFrais, g.key, g.groupe)).toMatchObject({ applied: false, reason: 'out_of_order' });
      expect(m.spine.onGroupProviderPaymentAfterFailure(avecFrais, g.key, g.groupe)).toEqual({ applied: true, duplicate: false });
      expect(m.spine.journey.state).toBe('payment_failed');
      const leg = m.spine.ledger.escrowFor(m.orderId)!.paymentLegs[0]!;
      expect(leg.amount).toBe(m.quote.amountPaidAtCheckout);
      expect(leg.amount).not.toBe(g.total);
      expect(leg.collectRef).toBe(`collect-${g.key}`);
      expect(leg.fee).toBe(partDesFrais(g.groupe.parts, 90, m.orderId));
      expect(m.spine.decideRefund({ nature: 'paiement_apres_echec' })).toEqual({
        ok: true,
        retenu: 0,
        lignes: [{ legType: 'checkout', collectRef: `collect-${g.key}`, amount: m.quote.amountPaidAtCheckout }],
      });
      expect(m.spine.retryPayment({ command_id: `retry-${m.orderId}`, actor: 'a', serverTime: LATER, newPaymentAttemptId: `att-${m.orderId}-2` })).toMatchObject({ ok: false, reason: 'paiement_rembourse' });
    }
  }, 10_000);

  it('a collection confirmed for any other total, or a share that is not the order\'s own, records nothing', () => {
    const g = groupeEchoue(['h1', 'h2']);
    for (const m of g.membres) {
      expect(m.spine.onGroupProviderPaymentAfterFailure(avec(g.genuine, { payload: { amount: g.total + 1 } }), g.key, g.groupe)).toMatchObject({ applied: false, reason: 'amount_mismatch' });
      const faux = { ...g.groupe, parts: g.groupe.parts.map((p) => (p.orderId === m.orderId ? { ...p, amount: p.amount + 1 } : p)) };
      expect(m.spine.onGroupProviderPaymentAfterFailure(avec(g.genuine, { payload: { amount: g.total + 1 } }), g.key, faux)).toMatchObject({ applied: false, reason: 'group_share_mismatch' });
      expect(m.spine.onGroupProviderPaymentAfterFailure(g.genuine, 'pk-someone-else', g.groupe)).toMatchObject({ applied: false, reason: 'attempt_mismatch' });
      expect(m.spine.ledger.escrowFor(m.orderId)).toBeUndefined();
      expect(m.spine.paidAfterFailure).toBe(false);
    }
  }, 10_000);
});
