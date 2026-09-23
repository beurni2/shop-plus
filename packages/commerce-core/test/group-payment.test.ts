import { describe, expect, it } from 'vitest';
import {
  NON_DIVISIBLE_REGRESSION_INPUT,
  OrderSpine,
  WORKED_BASELINE_INPUT,
  issueQuote,
  partDesFrais,
  type GroupPaymentShares,
} from '../src/index.js';

/**
 * PAYER-TOUT-1 (founder ruling 2026-09-22) — ONE provider collection for
 * several orders of one boutique. Each order judges the SAME webhook against
 * its OWN records and funds its OWN leg only; the provider's amount must be
 * the sum of the parts to the franc; the fee is copied once, never N times.
 */

const T = '2026-09-22T09:00:00.000Z';
const flags = { version: 'group-test', flags: {}, kills: [], killedCategories: [] };
/** The §6.1 door gate, satisfied — the same conservative rules the door tests use. */
const PAY_AT_DOOR = {
  eligibility: { buyerRef: 'buyer-g-1', state: 'allowed', buyerRefusalCount: 0, buyerRiskState: 'normal', requiredDeposit: 0 },
  sellerTier: 'verified',
  category: 'fashion_bags_fabrics',
  zoneTo: 'ouaga-centre',
  policy: {
    version: 'option-b-policy.group-test',
    priceCapFcfa: 25_000,
    minSellerTier: 'verified',
    inspectableCategories: ['fashion_bags_fabrics'],
    networkReliableZones: ['ouaga-centre'],
  },
};

function spineFor(seed: string, input = WORKED_BASELINE_INPUT, paymentMode: 'FULL_PREPAY' | 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' = 'FULL_PREPAY') {
  const issued = issueQuote(
    { flags, now: () => new Date(T), newId: () => `quote-${seed}` },
    {
      listingRef: 'lst-1',
      offerRef: 'offer-1',
      attributionResellerId: 'rs-1',
      ...input,
      paymentMode,
      ...(paymentMode === 'FULL_PREPAY' ? {} : { payAtDoor: PAY_AT_DOOR, nowIso: T }),
    } as Parameters<typeof issueQuote>[1],
  );
  if (!issued.ok) throw new Error(`quote refused: ${issued.reason}`);
  const spine = new OrderSpine({
    quote: issued.quote,
    supplierRef: 'sup-1',
    correlationId: `corr-ord-${seed}`,
    issueCommandId: `issue-${seed}`,
    actor: 'test',
    serverTime: T,
  });
  spine.advance({ command_id: `rsv-${seed}`, actor: 'a', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: `res-${seed}` } });
  spine.advance({ command_id: `pay-${seed}`, actor: 'a', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: `att-${seed}`, order_id: `ord-${seed}` } });
  return { spine, quote: issued.quote };
}

const KEY = 'pk-group-1';

function groupOf(a: { quote: { amountPaidAtCheckout: number } }, b: { quote: { amountPaidAtCheckout: number } }): GroupPaymentShares {
  return {
    groupId: 'grp-1',
    correlationId: 'corr-grp-1',
    parts: [
      { orderId: 'ord-a', amount: a.quote.amountPaidAtCheckout },
      { orderId: 'ord-b', amount: b.quote.amountPaidAtCheckout },
    ],
  };
}

function webhook(over: Record<string, unknown> = {}, envelope: Record<string, unknown> = {}) {
  return {
    name: 'payment.checkout_leg_confirmed.v1',
    envelope: {
      command_id: 'whk-grp-1',
      correlation_id: 'corr-grp-1',
      aggregateVersion: 1,
      actor: 'payment-provider:sandbox',
      serverTime: T,
      version: '1',
      ...envelope,
    },
    payload: {
      provider: 'sandbox-provider',
      payment_attempt_id: KEY,
      collectRef: 'col-grp-1',
      amount: 0,
      fee: 150,
      status: 'held',
      order_id: 'grp-1',
      redelivery: false,
      ...over,
    },
  };
}

describe('PAYER-TOUT-1 — the grouped checkout collection, judged per order', () => {
  it('funds each order with ITS OWN share, the provider amount being the exact sum; the fee is SHARED to the franc', () => {
    const a = spineFor('a');
    const b = spineFor('b', NON_DIVISIBLE_REGRESSION_INPUT);
    const groupe = groupOf(a, b);
    const total = a.quote.amountPaidAtCheckout + b.quote.amountPaidAtCheckout;
    expect(a.quote.amountPaidAtCheckout).not.toBe(b.quote.amountPaidAtCheckout);
    const event = webhook({ amount: total });

    expect(a.spine.onGroupProviderPaymentEvent(event, KEY, groupe)).toEqual({ applied: true, duplicate: false });
    expect(b.spine.onGroupProviderPaymentEvent(event, KEY, groupe)).toEqual({ applied: true, duplicate: false });
    expect(a.spine.journey.state).toBe('paid');
    expect(b.spine.journey.state).toBe('paid');

    const legA = a.spine.ledger.escrowFor('ord-a')!.paymentLegs[0]!;
    const legB = b.spine.ledger.escrowFor('ord-b')!.paymentLegs[0]!;
    expect(legA).toMatchObject({ legType: 'checkout', amount: a.quote.amountPaidAtCheckout, collectRef: 'col-grp-1' });
    expect(legB).toMatchObject({ legType: 'checkout', amount: b.quote.amountPaidAtCheckout, collectRef: 'col-grp-1' });
    expect(legA.amount + legB.amount).toBe(total);
    // FRAIS-PARTAGES-1 — each order carries ITS share of the one fee; the shares add up to it.
    expect(legA.fee).toBe(partDesFrais(groupe.parts, 150, 'ord-a'));
    expect(legB.fee).toBe(partDesFrais(groupe.parts, 150, 'ord-b'));
    expect(legA.fee).toBeGreaterThan(0);
    expect(legB.fee).toBeGreaterThan(0);
    expect(legA.fee + legB.fee).toBe(150);

    // « no confirmed order without funded legs » holds per order.
    expect(a.spine.confirmOrder({ command_id: 'cf-a', actor: 't', serverTime: T })).toEqual({ applied: true, duplicate: false });
    expect(b.spine.confirmOrder({ command_id: 'cf-b', actor: 't', serverTime: T })).toEqual({ applied: true, duplicate: false });
  });

  it('a redelivery is absorbed; a RIVAL confirmation after funding refuses with the double-charge alert', () => {
    const a = spineFor('a');
    const b = spineFor('b');
    const groupe = groupOf(a, b);
    const total = a.quote.amountPaidAtCheckout * 2;
    a.spine.onGroupProviderPaymentEvent(webhook({ amount: total }), KEY, groupe);
    expect(a.spine.onGroupProviderPaymentEvent(webhook({ amount: total }), KEY, groupe)).toEqual({ applied: true, duplicate: true });
    const rival = a.spine.onGroupProviderPaymentEvent(webhook({ amount: total, collectRef: 'col-other' }, { command_id: 'whk-rival' }), KEY, groupe);
    expect(rival.applied).toBe(false);
    if (!rival.applied) {
      expect(rival.reason).toBe('out_of_order');
      expect(rival.alert?.payload['alert']).toBe('conflicting_provider_confirmation');
      expect(rival.alert?.payload['group_id']).toBe('grp-1');
    }
  });

  it('refuses a provider amount a franc off the sum, with the contradiction alert', () => {
    const a = spineFor('a');
    const b = spineFor('b');
    const groupe = groupOf(a, b);
    const total = a.quote.amountPaidAtCheckout * 2;
    for (const off of [total - 1, total + 1, a.quote.amountPaidAtCheckout]) {
      const out = a.spine.onGroupProviderPaymentEvent(webhook({ amount: off }, { command_id: `whk-${off}` }), KEY, groupe);
      expect(out.applied).toBe(false);
      if (!out.applied) {
        expect(out.reason).toBe('amount_mismatch');
        expect(out.alert?.payload['alert']).toBe('provider_amount_contradicts_quote');
        expect(out.alert?.payload['expected_amount']).toBe(total);
      }
    }
    expect(a.spine.journey.state).toBe('payment_pending');
    expect(a.spine.ledger.escrowFor('ord-a')).toBeUndefined();
  });

  it('refuses a foreign key, a payload naming another reference, and the ORDER correlation instead of the group\'s', () => {
    const a = spineFor('a');
    const b = spineFor('b');
    const groupe = groupOf(a, b);
    const total = a.quote.amountPaidAtCheckout * 2;
    const foreignKey = a.spine.onGroupProviderPaymentEvent(webhook({ amount: total, payment_attempt_id: 'pk-other' }), KEY, groupe);
    expect(foreignKey.applied === false && foreignKey.reason).toBe('attempt_mismatch');
    const noKeyOnRecord = a.spine.onGroupProviderPaymentEvent(webhook({ amount: total }), null, groupe);
    expect(noKeyOnRecord.applied === false && noKeyOnRecord.reason).toBe('attempt_mismatch');
    const namesTheOrder = a.spine.onGroupProviderPaymentEvent(webhook({ amount: total, order_id: 'ord-a' }), KEY, groupe);
    expect(namesTheOrder.applied === false && namesTheOrder.reason).toBe('order_mismatch');
    const orderCorrelation = a.spine.onGroupProviderPaymentEvent(webhook({ amount: total }, { correlation_id: 'corr-ord-a' }), KEY, groupe);
    expect(orderCorrelation.applied === false && orderCorrelation.reason).toBe('wrong_correlation');
    expect(a.spine.journey.state).toBe('payment_pending');
  });

  it('refuses when this order is not a part, or its share disagrees with its own Quote', () => {
    const a = spineFor('a');
    const b = spineFor('b');
    const total = a.quote.amountPaidAtCheckout * 2;
    const withoutA: GroupPaymentShares = { groupId: 'grp-1', correlationId: 'corr-grp-1', parts: [{ orderId: 'ord-b', amount: total }] };
    const out1 = a.spine.onGroupProviderPaymentEvent(webhook({ amount: total }), KEY, withoutA);
    expect(out1.applied === false && out1.reason).toBe('group_share_mismatch');
    const skewed: GroupPaymentShares = {
      groupId: 'grp-1',
      correlationId: 'corr-grp-1',
      parts: [
        { orderId: 'ord-a', amount: a.quote.amountPaidAtCheckout - 100 },
        { orderId: 'ord-b', amount: b.quote.amountPaidAtCheckout + 100 },
      ],
    };
    const out2 = a.spine.onGroupProviderPaymentEvent(webhook({ amount: total }), KEY, skewed);
    expect(out2.applied === false && out2.reason).toBe('group_share_mismatch');
    expect(a.spine.ledger.escrowFor('ord-a')).toBeUndefined();
  });

  it('a genuine group webhook after this order LOCALLY failed refuses with the late-webhook alert', () => {
    const a = spineFor('a');
    const b = spineFor('b');
    const groupe = groupOf(a, b);
    a.spine.failPayment({ command_id: 'fail-a', actor: 't', serverTime: T, reason: 'charge_timeout' });
    const out = a.spine.onGroupProviderPaymentEvent(webhook({ amount: a.quote.amountPaidAtCheckout * 2 }), KEY, groupe);
    expect(out.applied).toBe(false);
    if (!out.applied) {
      expect(out.reason).toBe('out_of_order');
      expect(out.alert?.payload['alert']).toBe('genuine_webhook_after_local_failure');
      expect(out.alert?.payload['group_id']).toBe('grp-1');
    }
  });

  it('Option B: the group collects only the delivery fees; each door leg stays due on its own order', () => {
    const a = spineFor('a', WORKED_BASELINE_INPUT, 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const b = spineFor('b', NON_DIVISIBLE_REGRESSION_INPUT, 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    expect(a.quote.amountPaidAtCheckout).toBe(a.quote.deliveryFee);
    const groupe = groupOf(a, b);
    const event = webhook({ amount: a.quote.deliveryFee + b.quote.deliveryFee });
    expect(a.spine.onGroupProviderPaymentEvent(event, KEY, groupe).applied).toBe(true);
    expect(b.spine.onGroupProviderPaymentEvent(event, KEY, groupe).applied).toBe(true);
    a.spine.confirmOrder({ command_id: 'cf-a', actor: 't', serverTime: T });
    b.spine.confirmOrder({ command_id: 'cf-b', actor: 't', serverTime: T });
    expect(a.spine.doorLegState).toBe('due');
    expect(b.spine.doorLegState).toBe('due');
  });
});

/**
 * COLIS-FOURNISSEUR-1 (decision d, founder ruling 2026-09-23) — ONE door
 * payment for the articles she keeps from one package. The same webhook is
 * judged by each article against its OWN records: its door leg must be due,
 * the key and reference the collection's, the provider's amount the exact sum
 * of the parts, its own part its own Quote's `amountDueAtDelivery`.
 */
describe('COLIS-FOURNISSEUR-1 — one door payment for a package, judged per article', () => {
  const PORTE_KEY = 'pk-porte-1';
  function colisConfirme() {
    const a = spineFor('a', WORKED_BASELINE_INPUT, 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const b = spineFor('b', NON_DIVISIBLE_REGRESSION_INPUT, 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    const groupe = groupOf(a, b);
    const event = webhook({ amount: a.quote.deliveryFee + b.quote.deliveryFee });
    a.spine.onGroupProviderPaymentEvent(event, KEY, groupe);
    b.spine.onGroupProviderPaymentEvent(event, KEY, groupe);
    a.spine.confirmOrder({ command_id: 'cf-a', actor: 't', serverTime: T });
    b.spine.confirmOrder({ command_id: 'cf-b', actor: 't', serverTime: T });
    const collecte: GroupPaymentShares = {
      groupId: 'grp-1-porte-1',
      correlationId: 'corr-grp-1-porte-1',
      parts: [
        { orderId: 'ord-a', amount: a.quote.amountDueAtDelivery },
        { orderId: 'ord-b', amount: b.quote.amountDueAtDelivery },
      ],
    };
    const total = a.quote.amountDueAtDelivery + b.quote.amountDueAtDelivery;
    const porte = (over: Record<string, unknown> = {}, envelope: Record<string, unknown> = {}) => ({
      ...webhook({
        payment_attempt_id: PORTE_KEY, collectRef: 'col-porte-1', order_id: 'grp-1-porte-1', amount: total, fee: 99,
        ...over,
      }, { command_id: 'whk-porte-1', correlation_id: 'corr-grp-1-porte-1', ...envelope }),
      name: 'payment.door_leg_confirmed.v1',
    });
    return { a, b, collecte, total, porte };
  }

  it('funds EACH article\'s own door leg with its own amount; the fee is shared; each emits its own door signal', () => {
    const { a, b, collecte, total, porte } = colisConfirme();
    const ra = a.spine.onGroupDoorPaymentEvent(porte(), PORTE_KEY, collecte);
    const rb = b.spine.onGroupDoorPaymentEvent(porte(), PORTE_KEY, collecte);
    expect(ra.applied && rb.applied).toBe(true);
    expect(a.spine.doorLegState).toBe('paid');
    expect(b.spine.doorLegState).toBe('paid');
    const la = a.spine.ledger.escrowFor('ord-a')!.paymentLegs.find((l) => l.legType === 'door')!;
    const lb = b.spine.ledger.escrowFor('ord-b')!.paymentLegs.find((l) => l.legType === 'door')!;
    expect(la.amount).toBe(a.quote.amountDueAtDelivery);
    expect(lb.amount).toBe(b.quote.amountDueAtDelivery);
    expect(la.amount + lb.amount).toBe(total);
    expect(la.fee + lb.fee).toBe(99);
    expect(ra.applied && ra.signal?.payload).toMatchObject({ door_leg: 'paid', amount_due_at_delivery_confirmed: a.quote.amountDueAtDelivery });
    // A redelivery is absorbed, nothing recorded twice.
    expect(a.spine.onGroupDoorPaymentEvent(porte(), PORTE_KEY, collecte)).toMatchObject({ applied: true, duplicate: true });
    expect(a.spine.ledger.escrowFor('ord-a')!.paymentLegs.filter((l) => l.legType === 'door')).toHaveLength(1);
  });

  it('refuses a franc off the sum (alerted), a foreign key or reference, the ORDER\'s correlation, and a checkout event', () => {
    const { a, collecte, total, porte } = colisConfirme();
    const court = a.spine.onGroupDoorPaymentEvent(porte({ amount: total - 1 }), PORTE_KEY, collecte);
    expect(court).toMatchObject({ applied: false, reason: 'amount_mismatch' });
    expect(court.applied === false && court.alert?.payload).toMatchObject({ alert: 'provider_amount_contradicts_quote' });
    expect(a.spine.onGroupDoorPaymentEvent(porte({}, { command_id: 'w2' }), 'pk-autre', collecte)).toMatchObject({ applied: false, reason: 'attempt_mismatch' });
    expect(a.spine.onGroupDoorPaymentEvent(porte({ order_id: 'grp-1-porte-9' }, { command_id: 'w3' }), PORTE_KEY, collecte)).toMatchObject({ applied: false, reason: 'order_mismatch' });
    expect(a.spine.onGroupDoorPaymentEvent(porte({}, { command_id: 'w4', correlation_id: 'corr-ord-a' }), PORTE_KEY, collecte)).toMatchObject({ applied: false, reason: 'wrong_correlation' });
    expect(a.spine.onGroupDoorPaymentEvent({ ...porte({}, { command_id: 'w5' }), name: 'payment.checkout_leg_confirmed.v1' }, PORTE_KEY, collecte)).toMatchObject({ applied: false, reason: 'unexpected_event_name' });
    expect(a.spine.doorLegState).toBe('due');
  });

  it('refuses when this article is not a part, or its part is not its own door leg', () => {
    const { a, collecte, porte } = colisConfirme();
    const sansMoi = { ...collecte, parts: collecte.parts.filter((p) => p.orderId !== 'ord-a') };
    expect(a.spine.onGroupDoorPaymentEvent(porte({ amount: sansMoi.parts[0]!.amount }), PORTE_KEY, sansMoi)).toMatchObject({ applied: false, reason: 'group_share_mismatch' });
    const faux = { ...collecte, parts: collecte.parts.map((p) => (p.orderId === 'ord-a' ? { ...p, amount: p.amount + 1 } : p)) };
    const total = faux.parts.reduce((t, p) => t + p.amount, 0);
    expect(a.spine.onGroupDoorPaymentEvent(porte({ amount: total }), PORTE_KEY, faux)).toMatchObject({ applied: false, reason: 'group_share_mismatch' });
    expect(a.spine.doorLegState).toBe('due');
  });

  it('refuses on an article that owes nothing at the door (prepaid), with the door-mismatch alert', () => {
    const a = spineFor('a');
    const b = spineFor('b', NON_DIVISIBLE_REGRESSION_INPUT);
    const groupe = groupOf(a, b);
    a.spine.onGroupProviderPaymentEvent(webhook({ amount: a.quote.amountPaidAtCheckout + b.quote.amountPaidAtCheckout }), KEY, groupe);
    a.spine.confirmOrder({ command_id: 'cf-a', actor: 't', serverTime: T });
    const collecte = { groupId: 'grp-1-porte-1', correlationId: 'corr-grp-1-porte-1', parts: [{ orderId: 'ord-a', amount: 1_000 }] };
    const r = a.spine.onGroupDoorPaymentEvent(
      { ...webhook({ payment_attempt_id: 'pk-porte-1', order_id: 'grp-1-porte-1', amount: 1_000 }, { command_id: 'wp', correlation_id: 'corr-grp-1-porte-1' }), name: 'payment.door_leg_confirmed.v1' },
      'pk-porte-1',
      collecte,
    );
    expect(r).toMatchObject({ applied: false, reason: 'door_leg_not_expected' });
    expect(r.applied === false && r.alert).not.toBeNull();
  });
});

describe('FRAIS-PARTAGES-1 — the collection\'s one fee, shared by amount, to the franc', () => {
  const parts = (...xs: [string, number][]) => xs.map(([orderId, amount]) => ({ orderId, amount }));
  const partage = (ps: ReturnType<typeof parts>, frais: number) => ps.map((p) => partDesFrais(ps, frais, p.orderId));

  it('in proportion to each order\'s amount when it divides exactly', () => {
    expect(partage(parts(['ord-a', 10_000], ['ord-b', 20_000]), 150)).toEqual([50, 100]);
  });

  it('the francs left over go to the largest remainders; a tie goes to the lower order id', () => {
    // 100 over three equal parts: 33 each, one franc left, three equal remainders → ord-a.
    expect(partage(parts(['ord-a', 1], ['ord-b', 1], ['ord-c', 1]), 100)).toEqual([34, 33, 33]);
    // 5 over 3 and 7: floors 1 and 3, remainders 5 and 5 → the tie to ord-a.
    expect(partage(parts(['ord-a', 3], ['ord-b', 7]), 5)).toEqual([2, 3]);
    // 10 over 1 and 2: floors 3 and 6, remainders 1 and 2 → the larger (ord-b).
    expect(partage(parts(['ord-a', 1], ['ord-b', 2]), 10)).toEqual([3, 7]);
  });

  it('always adds up to the provider\'s fee exactly, and a zero fee is zero everywhere', () => {
    const cas: [ReturnType<typeof parts>, number][] = [
      [parts(['ord-1', 12_500], ['ord-2', 26_500], ['ord-3', 9_999]), 777],
      [parts(['ord-1', 1], ['ord-2', 999_999]), 1],
      [parts(['ord-1', 7], ['ord-2', 7], ['ord-3', 7], ['ord-4', 7], ['ord-5', 7], ['ord-6', 7], ['ord-7', 7]), 3],
    ];
    for (const [ps, frais] of cas) {
      const shares = partage(ps, frais);
      expect(shares.reduce((x, y) => x + y, 0)).toBe(frais);
      expect(shares.every((v) => Number.isSafeInteger(v) && v >= 0)).toBe(true);
    }
    expect(partage(parts(['ord-a', 3], ['ord-b', 7]), 0)).toEqual([0, 0]);
  });
});
