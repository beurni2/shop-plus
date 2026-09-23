import { describe, expect, it } from 'vitest';
import {
  MockPaymentProvider,
  OrderSpine,
  WORKED_BASELINE_INPUT,
  issueQuote,
  lireRefusCourse,
  partDesFrais,
  type RefusCourse,
  type RemboursementAttendu,
} from '../src/index.js';

/**
 * REMBOURSEMENT-1 (founder ruling 2026-09-23) — a delivery Séra refused home
 * refunds the buyer from the order's own paid legs, by fault, and the order is
 * `refunded` only on the provider's refund confirmation, to the franc. Driven
 * through the certified sandbox mock: the charge, the refund, both webhooks.
 */

const T = '2026-09-23T10:00:00.000Z';
const flags = { version: 'refund-test', flags: {}, kills: [], killedCategories: [] };

const PAY_AT_DOOR = {
  eligibility: { buyerRef: 'buyer-r-1', state: 'allowed', buyerRefusalCount: 0, buyerRiskState: 'normal', requiredDeposit: 0 },
  sellerTier: 'verified',
  category: 'fashion_bags_fabrics',
  zoneTo: 'ouaga-centre',
  policy: {
    version: 'option-b-policy.refund-test',
    priceCapFcfa: 25_000,
    minSellerTier: 'verified',
    inspectableCategories: ['fashion_bags_fabrics'],
    networkReliableZones: ['ouaga-centre'],
  },
};

type Mode = 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';

/** A REAL spine, charged and confirmed through the certified mock. */
function commandePayee(seed: string, mode: Mode = 'FULL_PREPAY', provider = new MockPaymentProvider()) {
  const issued = issueQuote(
    { flags, now: () => new Date(T), newId: () => `quote-${seed}` },
    {
      listingRef: 'lst-1',
      offerRef: 'offer-1',
      attributionResellerId: 'rs-1',
      ...WORKED_BASELINE_INPUT,
      paymentMode: mode,
      ...(mode === 'FULL_PREPAY' ? {} : { payAtDoor: PAY_AT_DOOR, nowIso: T }),
    } as Parameters<typeof issueQuote>[1],
  );
  if (!issued.ok) throw new Error(`quote refused: ${issued.reason}`);
  const orderId = `order-${seed}`;
  const correlationId = `corr-${seed}`;
  const spine = new OrderSpine({
    quote: issued.quote,
    supplierRef: 'sup-1',
    correlationId,
    issueCommandId: `issue-${seed}`,
    actor: 'test',
    serverTime: T,
  });
  spine.advance({ command_id: `rsv-${seed}`, actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: `res-${seed}` } });
  spine.advance({ command_id: `pay-${seed}`, actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: `att-${seed}`, order_id: orderId } });
  provider.initiateCharge({ orderId, paymentAttemptId: `att-${seed}`, amount: issued.quote.amountPaidAtCheckout, correlationId, requestedAtIso: T, legType: 'checkout' });
  const webhook = provider.webhookDeliveryPlan().find((d) => d.event.payload['order_id'] === orderId && d.event.name === 'payment.checkout_leg_confirmed.v1')!.event;
  if (!spine.onProviderPaymentEvent(webhook, `att-${seed}`).applied) throw new Error('setup: checkout refused');
  if (!spine.confirmOrder({ command_id: `cf-${seed}`, actor: 't', serverTime: T }).applied) throw new Error('setup: confirm refused');
  return { spine, quote: issued.quote, provider, orderId, correlationId };
}

/** Pays the Option-B door leg through the mock. */
function payerLaPorte(c: ReturnType<typeof commandePayee>): void {
  c.provider.initiateCharge({ orderId: c.orderId, paymentAttemptId: `door-${c.orderId}`, amount: c.quote.amountDueAtDelivery, correlationId: c.correlationId, requestedAtIso: T, legType: 'door' });
  const door = c.provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
  if (!c.spine.onProviderDoorPaymentEvent(door, `door-${c.orderId}`).applied) throw new Error('setup: door refused');
}

/** Asks the mock for every refund the plan decided, and returns them keyed — as the order object will. */
function demander(c: ReturnType<typeof commandePayee>, refus: RefusCourse): RemboursementAttendu[] {
  const plan = c.spine.decideRefund(refus);
  if (!plan.ok) throw new Error(`plan refused: ${plan.reason}`);
  return plan.lignes.map((l, i) => {
    const refundKey = `rf-${c.orderId}-${i}`;
    const r = c.provider.initiateRefund({ orderId: c.orderId, refundKey, collectRef: l.collectRef, amount: l.amount, correlationId: c.correlationId, requestedAtIso: T, legType: l.legType });
    expect(r.outcome).toBe('accepted');
    return { ...l, refundKey };
  });
}

const refundEvents = (provider: MockPaymentProvider) =>
  provider.webhookDeliveryPlan().filter((d) => d.event.name === 'payment.refund_confirmed.v1').map((d) => d.event);

const JUSTIFIE: RefusCourse = { nature: 'refus_justifie', faultClass: 'seller' };

describe('REMBOURSEMENT-1 — what goes back, decided from the order\'s own records', () => {
  it('a justified refusal refunds the whole checkout leg; the confirmation makes the order refunded and the record says so', () => {
    const c = commandePayee('r1');
    const attendus = demander(c, JUSTIFIE);
    expect(attendus).toEqual([{ legType: 'checkout', collectRef: expect.any(String), amount: c.quote.amountPaidAtCheckout, refundKey: 'rf-order-r1-0' }]);
    const [event] = refundEvents(c.provider);
    expect(c.spine.onProviderRefundEvent(event, attendus)).toEqual({ applied: true, duplicate: false });
    expect(c.spine.journey.state).toBe('refunded');
    const escrow = c.spine.ledger.escrowFor(c.orderId)!;
    expect(escrow.status).toBe('refunded');
    expect(escrow.paymentLegs[0]).toMatchObject({ status: 'refunded', amount: c.quote.amountPaidAtCheckout });
    expect(c.spine.ledger.refundsFor(c.orderId)).toEqual([
      { legType: 'checkout', collectRef: attendus[0]!.collectRef, refundKey: 'rf-order-r1-0', amount: c.quote.amountPaidAtCheckout, fee: 0 },
    ]);
  });

  it('a buyer refusal whose fee Séra KEPT refunds every franc but D; the leg is not called refunded', () => {
    const c = commandePayee('r2');
    const plan = c.spine.decideRefund({ nature: 'refus_acheteur', faultClass: 'buyer', fraisRetenus: true });
    expect(plan).toEqual({
      ok: true,
      retenu: c.quote.deliveryFee,
      lignes: [{ legType: 'checkout', collectRef: expect.any(String), amount: c.quote.amountPaidAtCheckout - c.quote.deliveryFee }],
    });
    expect(c.quote.amountPaidAtCheckout - c.quote.deliveryFee).toBe(c.quote.productSubtotal);
    const attendus = demander(c, { nature: 'refus_acheteur', faultClass: 'buyer', fraisRetenus: true });
    expect(c.spine.onProviderRefundEvent(refundEvents(c.provider)[0], attendus).applied).toBe(true);
    expect(c.spine.journey.state).toBe('refunded');
    const escrow = c.spine.ledger.escrowFor(c.orderId)!;
    expect(escrow.status).toBe('hold');
    expect(escrow.paymentLegs[0]!.status).toBe('held');
  });

  it('a buyer refusal whose fee Séra did NOT keep, and a rejected delivery check, refund in full', () => {
    for (const refus of [{ nature: 'refus_acheteur', faultClass: 'buyer', fraisRetenus: false }, { nature: 'livraison_rejetee' }] as const) {
      const c = commandePayee(`r3-${refus.nature}`);
      expect(c.spine.decideRefund(refus)).toEqual({
        ok: true,
        retenu: 0,
        lignes: [{ legType: 'checkout', collectRef: expect.any(String), amount: c.quote.amountPaidAtCheckout }],
      });
    }
  });

  it('Option B: a buyer refusal with the fee kept owes nothing back when the door was not paid; a justified refusal after the door was paid refunds BOTH legs', () => {
    const b = commandePayee('r4', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    expect(b.spine.decideRefund({ nature: 'refus_acheteur', faultClass: 'buyer', fraisRetenus: true })).toEqual({ ok: true, retenu: b.quote.deliveryFee, lignes: [] });

    const d = commandePayee('r5', 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    payerLaPorte(d);
    const attendus = demander(d, JUSTIFIE);
    expect(attendus.map((a) => [a.legType, a.amount])).toEqual([
      ['checkout', d.quote.amountPaidAtCheckout],
      ['door', d.quote.amountDueAtDelivery],
    ]);
    const [premier, second] = refundEvents(d.provider);
    expect(d.spine.onProviderRefundEvent(premier, attendus)).toEqual({ applied: true, duplicate: false });
    // One of two confirmed: not refunded yet.
    expect(d.spine.journey.state).toBe('confirmed');
    expect(d.spine.onProviderRefundEvent(second, attendus)).toEqual({ applied: true, duplicate: false });
    expect(d.spine.journey.state).toBe('refunded');
    expect(d.spine.ledger.escrowFor(d.orderId)!.status).toBe('refunded');
  });

  it('nothing before the money moved, nothing after acceptance', () => {
    const issued = commandePayee('r6');
    issued.spine.ledger.recordObligationsOnEligibility(issued.orderId, issued.quote, 'sup-1');
    expect(issued.spine.decideRefund(JUSTIFIE)).toEqual({ ok: false, reason: 'livraison_acceptee' });

    const q = issueQuote(
      { flags, now: () => new Date(T), newId: () => 'quote-r7' },
      { listingRef: 'lst-1', offerRef: 'offer-1', attributionResellerId: 'rs-1', ...WORKED_BASELINE_INPUT } as Parameters<typeof issueQuote>[1],
    );
    if (!q.ok) throw new Error('quote');
    const pending = new OrderSpine({ quote: q.quote, supplierRef: 's', correlationId: 'corr-r7', issueCommandId: 'i', actor: 't', serverTime: T });
    pending.advance({ command_id: 'rsv', actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-r7' } });
    pending.advance({ command_id: 'pay', actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'att-r7', order_id: 'order-r7' } });
    expect(pending.decideRefund(JUSTIFIE)).toEqual({ ok: false, reason: 'pas_paye' });
  });

  it('no local command can mark an order refunded — only the provider\'s confirmation', () => {
    const c = commandePayee('r8');
    const tentative = c.spine.advance({ command_id: 'x', actor: 'ops', serverTime: T, to: 'refunded' });
    expect(tentative.ok).toBe(false);
    expect(c.spine.journey.state).toBe('confirmed');
  });
});

describe('REMBOURSEMENT-1 — the provider\'s refund confirmation, judged to the franc', () => {
  it('a redelivery is absorbed; a rival confirmation of the same refund is a replay, never a second refund', () => {
    const c = commandePayee('j1');
    const attendus = demander(c, JUSTIFIE);
    const [event] = refundEvents(c.provider);
    expect(c.spine.onProviderRefundEvent(event, attendus).applied).toBe(true);
    expect(c.spine.onProviderRefundEvent(event, attendus)).toEqual({ applied: true, duplicate: true });
    const rival = { ...event, envelope: { ...event.envelope, command_id: 'whk-rival' } };
    expect(c.spine.onProviderRefundEvent(rival, attendus)).toEqual({ applied: true, duplicate: true });
    expect(c.spine.ledger.refundsFor(c.orderId)).toHaveLength(1);
  });

  it('refuses, by name and with the alert where provider truth contradicts ours: a foreign key, an amount a franc off, another collection, a status that is not « refunded », another order, the wrong correlation', () => {
    const c = commandePayee('j2');
    const attendus = demander(c, JUSTIFIE);
    const [event] = refundEvents(c.provider);
    const avec = (payload: Record<string, unknown>, envelope: Record<string, unknown> = {}) => ({
      ...event,
      envelope: { ...event.envelope, command_id: `whk-${JSON.stringify(payload)}`, ...envelope },
      payload: { ...event.payload, ...payload },
    });

    const etranger = c.spine.onProviderRefundEvent(avec({ refund_key: 'rf-someone-else' }), attendus);
    expect(etranger).toMatchObject({ applied: false, reason: 'refund_key_unknown' });
    expect(etranger.applied === false && etranger.alert?.payload['alert']).toBe('webhook_names_foreign_refund');

    const franc = c.spine.onProviderRefundEvent(avec({ amount: attendus[0]!.amount + 1 }), attendus);
    expect(franc).toMatchObject({ applied: false, reason: 'amount_mismatch' });
    expect(franc.applied === false && franc.alert?.payload['alert']).toBe('provider_refund_contradicts_request');

    expect(c.spine.onProviderRefundEvent(avec({ collectRef: 'collect-other' }), attendus)).toMatchObject({ applied: false, reason: 'refund_leg_unknown' });
    expect(c.spine.onProviderRefundEvent(avec({ status: 'pending' }), attendus)).toMatchObject({ applied: false, reason: 'unconfirmed_refund_status' });
    expect(c.spine.onProviderRefundEvent(avec({ order_id: 'order-other' }), attendus)).toMatchObject({ applied: false, reason: 'order_mismatch' });
    expect(c.spine.onProviderRefundEvent(avec({}, { correlation_id: 'corr-other' }), attendus)).toMatchObject({ applied: false, reason: 'wrong_correlation' });
    expect(c.spine.onProviderRefundEvent(avec({ fee: -1 }), attendus)).toMatchObject({ applied: false, reason: 'malformed_payload' });
    expect(c.spine.journey.state).toBe('confirmed');
    expect(c.spine.ledger.refundsFor(c.orderId)).toHaveLength(0);
  });

  it('the refund fee is the platform\'s: recorded beside the refund, never taken off it', () => {
    const c = commandePayee('j3');
    const attendus = demander(c, JUSTIFIE);
    const [event] = refundEvents(c.provider);
    const avecFrais = { ...event, payload: { ...event.payload, fee: 75 } };
    expect(c.spine.onProviderRefundEvent(avecFrais, attendus).applied).toBe(true);
    expect(c.spine.ledger.refundsFor(c.orderId)[0]).toMatchObject({ amount: c.quote.amountPaidAtCheckout, fee: 75 });
  });

  it('the ledger never gives back more than the leg collected, whatever reaches it (the backstop under the judge)', () => {
    const c = commandePayee('j4');
    const leg = c.spine.ledger.escrowFor(c.orderId)!.paymentLegs[0]!;
    const rendre = (refundKey: string, amount: number) =>
      c.spine.ledger.recordRefundFromProvider({ orderId: c.orderId, legType: 'checkout', collectRef: leg.collectRef, refundKey, amount, fee: 0 });
    expect(rendre('rf-a', leg.amount - 100)).toMatchObject({ ok: true, replay: false });
    expect(rendre('rf-b', 101)).toEqual({ ok: false, reason: 'refund_exceeds_leg' });
    expect(c.spine.ledger.escrowFor(c.orderId)!.status).toBe('hold');
    expect(rendre('rf-c', 100)).toMatchObject({ ok: true, replay: false });
    expect(c.spine.ledger.escrowFor(c.orderId)!.status).toBe('refunded');
    expect(c.spine.ledger.refundsFor(c.orderId).map((r) => r.amount)).toEqual([leg.amount - 100, 100]);
  });
});

describe('REMBOURSEMENT-1 — the certified mock refunds like a provider would', () => {
  it('the same key never refunds twice, never with another amount, and a collection is never refunded beyond what it collected', () => {
    const provider = new MockPaymentProvider();
    provider.initiateCharge({ orderId: 'grp-x', paymentAttemptId: 'pk-x', amount: 10_000, correlationId: 'corr-grp-x', requestedAtIso: T, legType: 'checkout' });
    const base = { orderId: 'order-a', collectRef: 'collect-pk-x', correlationId: 'corr-a', requestedAtIso: T, legType: 'checkout' as const };
    expect(provider.initiateRefund({ ...base, refundKey: 'rf-a', amount: 6_000 }).outcome).toBe('accepted');
    expect(provider.initiateRefund({ ...base, refundKey: 'rf-a', amount: 6_000 })).toEqual({ outcome: 'accepted', refundKey: 'rf-a', refundRef: 'refund-rf-a' });
    expect(provider.initiateRefund({ ...base, refundKey: 'rf-a', amount: 5_000 })).toEqual({ outcome: 'rejected_invalid', reason: 'idempotency_key_amount_mismatch' });
    expect(provider.initiateRefund({ ...base, orderId: 'order-b', refundKey: 'rf-b', amount: 4_001 })).toEqual({ outcome: 'rejected_invalid', reason: 'refund_exceeds_collection' });
    expect(provider.initiateRefund({ ...base, orderId: 'order-b', refundKey: 'rf-b', amount: 4_000 }).outcome).toBe('accepted');
  });

  it('the first N refunds time out; the retry under the SAME key refunds once', () => {
    const provider = new MockPaymentProvider({ timeoutFirstNRefunds: 1 });
    const req = { orderId: 'o', refundKey: 'rf-o', collectRef: 'c', amount: 100, correlationId: 'corr-o', requestedAtIso: T, legType: 'checkout' as const };
    expect(provider.initiateRefund(req)).toEqual({ outcome: 'timeout' });
    expect(provider.initiateRefund(req).outcome).toBe('accepted');
    expect(provider.webhookDeliveryPlan().filter((d) => d.event.name === 'payment.refund_confirmed.v1')).toHaveLength(1);
  });
});

describe('REMBOURSEMENT-1 — one article refunded out of a grouped collection', () => {
  it('refunds its OWN amount against the collection it shared; the other order is untouched', () => {
    // Two orders paid in ONE collection: the grouped judge funds each with its share.
    const provider = new MockPaymentProvider();
    const a = commandePayeeEnGroupe('ga', provider);
    const b = commandePayeeEnGroupe('gb', provider);
    const total = a.quote.amountPaidAtCheckout + b.quote.amountPaidAtCheckout;
    const groupe = { groupId: 'grp-ab', correlationId: 'corr-grp-ab', parts: [
      { orderId: a.orderId, amount: a.quote.amountPaidAtCheckout },
      { orderId: b.orderId, amount: b.quote.amountPaidAtCheckout },
    ] };
    provider.initiateCharge({ orderId: 'grp-ab', paymentAttemptId: 'pk-grp-ab', amount: total, correlationId: 'corr-grp-ab', requestedAtIso: T, legType: 'checkout' });
    const collecte = provider.webhookDeliveryPlan().find((d) => d.event.payload['order_id'] === 'grp-ab')!.event;
    const avecFrais = { ...collecte, payload: { ...collecte.payload, fee: 90 } };
    for (const o of [a, b]) {
      expect(o.spine.onGroupProviderPaymentEvent(avecFrais, 'pk-grp-ab', groupe).applied).toBe(true);
      expect(o.spine.confirmOrder({ command_id: `cf-${o.orderId}`, actor: 't', serverTime: T }).applied).toBe(true);
    }
    expect(a.spine.ledger.escrowFor(a.orderId)!.paymentLegs[0]!.fee + b.spine.ledger.escrowFor(b.orderId)!.paymentLegs[0]!.fee).toBe(90);
    expect(a.spine.ledger.escrowFor(a.orderId)!.paymentLegs[0]!.fee).toBe(partDesFrais(groupe.parts, 90, a.orderId));

    const plan = a.spine.decideRefund(JUSTIFIE);
    if (!plan.ok) throw new Error('plan');
    expect(plan.lignes).toEqual([{ legType: 'checkout', collectRef: 'collect-pk-grp-ab', amount: a.quote.amountPaidAtCheckout }]);
    const attendus = plan.lignes.map((l) => ({ ...l, refundKey: 'rf-ga' }));
    expect(provider.initiateRefund({ orderId: a.orderId, refundKey: 'rf-ga', collectRef: 'collect-pk-grp-ab', amount: a.quote.amountPaidAtCheckout, correlationId: a.correlationId, requestedAtIso: T, legType: 'checkout' }).outcome).toBe('accepted');
    const refund = refundEvents(provider)[0]!;
    expect(a.spine.onProviderRefundEvent(refund, attendus)).toEqual({ applied: true, duplicate: false });
    expect(a.spine.journey.state).toBe('refunded');
    expect(b.spine.journey.state).toBe('confirmed');
    // The confirmation names order A's key and correlation: B can never take it as its own.
    expect(b.spine.onProviderRefundEvent(refund, attendus)).toMatchObject({ applied: false, reason: 'wrong_correlation' });
  });
});

function commandePayeeEnGroupe(seed: string, _provider: MockPaymentProvider) {
  const issued = issueQuote(
    { flags, now: () => new Date(T), newId: () => `quote-${seed}` },
    { listingRef: 'lst-1', offerRef: 'offer-1', attributionResellerId: 'rs-1', ...WORKED_BASELINE_INPUT } as Parameters<typeof issueQuote>[1],
  );
  if (!issued.ok) throw new Error('quote');
  const orderId = `order-${seed}`;
  const spine = new OrderSpine({ quote: issued.quote, supplierRef: 'sup-1', correlationId: `corr-${seed}`, issueCommandId: `issue-${seed}`, actor: 't', serverTime: T });
  spine.advance({ command_id: `rsv-${seed}`, actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: `res-${seed}` } });
  spine.advance({ command_id: `pay-${seed}`, actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: `att-${seed}`, order_id: orderId } });
  return { spine, quote: issued.quote, orderId, correlationId: `corr-${seed}` };
}

describe('REMBOURSEMENT-1 — Séra\'s refused-course fact, read', () => {
  it('reads the three payloads the custody spine emits, and nothing else', () => {
    expect(lireRefusCourse({ order_id: 'o', task_id: 't', rejection: 'valid_rejection', fault_class: 'seller' })).toEqual({ nature: 'refus_justifie', faultClass: 'seller' });
    expect(lireRefusCourse({ order_id: 'o', task_id: 't', family: 'return', reason_code: 'change_of_mind', fault_class: 'buyer', fee_retained: true })).toEqual({ nature: 'refus_acheteur', faultClass: 'buyer', fraisRetenus: true });
    expect(lireRefusCourse({ order_id: 'o', task_id: 't', family: 'return', reason_code: 'honest_absence', fault_class: 'buyer', fee_retained: false })).toEqual({ nature: 'refus_acheteur', faultClass: 'buyer', fraisRetenus: false });
    expect(lireRefusCourse({ order_id: 'o', task_id: 't', result: 'rejected', reasons: ['evidence'] })).toEqual({ nature: 'livraison_rejetee' });
    for (const autre of [null, [], {}, { rejection: 'valid_rejection' }, { family: 'return', fault_class: 'buyer' }, { result: 'validated' }]) {
      expect(lireRefusCourse(autre)).toBeUndefined();
    }
  });
});
