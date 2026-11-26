import { type Quote } from '@platform/contracts';
import {
  MockPaymentProvider,
  MockSeraEligibilityEmitter,
  PAY_AT_DOOR_POLICY_DEFAULTS,
  WORKED_BASELINE_INPUT,
  issueQuote,
  reconcileOrder,
} from '@shop-plus/commerce-core';
import { describe, expect, it } from 'vitest';
import { applyOrderInput, rebuildOrderSpine, type OrderInput, type OrderOrigin } from '../src/order-core.js';

/**
 * A logged input was admitted under the rules of its day. Rebuilding an order
 * from its saved inputs re-applies those facts and never re-judges them by a
 * rule added since — otherwise payout lines already written (and already told
 * to the supplier and the reseller) would vanish silently on the next read.
 * The funded-leg rule for pay-at-door orders binds the LIVE admission only.
 */

const T = '2026-11-26T08:00:00.000Z';
const FLAGS = { version: 'rebuild-admis-test', flags: {}, kills: [], killedCategories: [] } as const;
const orderId = 'ord-quote-admis-1';
const origin: OrderOrigin = {
  orderId,
  quoteId: 'quote-admis-1',
  correlationId: `corr-${orderId}`,
  issueCommandId: 'ord-issue-c1',
  actor: 'storefront-service:checkout',
  createdAt: T,
  supplierRef: '',
};

function doorQuote(): Quote {
  const issued = issueQuote(
    { flags: FLAGS, now: () => new Date(T), newId: () => 'quote-admis-1' },
    {
      listingRef: 'lst-1',
      offerRef: 'ofr-1',
      attributionResellerId: 'rs-1',
      ...WORKED_BASELINE_INPUT,
      paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
      nowIso: T,
      payAtDoor: {
        eligibility: { buyerRef: 'b-1', state: 'allowed', buyerRefusalCount: 0, buyerRiskState: 'normal', requiredDeposit: 0 },
        sellerTier: 'verified',
        category: 'fashion_bags_fabrics',
        zoneTo: 'ouaga-centre',
        policy: {
          ...PAY_AT_DOOR_POLICY_DEFAULTS,
          version: `${PAY_AT_DOOR_POLICY_DEFAULTS.version}+admis-test-zone`,
          networkReliableZones: ['ouaga-centre'],
        },
      },
    },
  );
  if (!issued.ok || issued.quote.paymentMode !== 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') throw new Error('setup: door quote');
  return issued.quote;
}

/** Each fact built by the certified mocks, never by hand. */
function checkoutWebhook(quote: Quote): unknown {
  const p = new MockPaymentProvider({});
  p.initiateCharge({ orderId, paymentAttemptId: 'att-1', amount: quote.amountPaidAtCheckout, correlationId: origin.correlationId, requestedAtIso: T });
  return p.webhookDeliveryPlan()[0]!.event;
}
function doorWebhook(quote: Quote): unknown {
  const p = new MockPaymentProvider({});
  p.initiateCharge({ orderId, paymentAttemptId: 'door-att-1', amount: quote.amountDueAtDelivery, correlationId: origin.correlationId, requestedAtIso: T, legType: 'door' });
  return p.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
}
function validated(): unknown {
  const sera = new MockSeraEligibilityEmitter({});
  sera.recordDelivered(orderId);
  sera.requestValidation({ orderId, correlationId: origin.correlationId, deliveredAtIso: T });
  const event = sera.eligibilityDeliveryPlan()[0]!.event;
  return { ...event, payload: { ...(event.payload as object), supplier_ref: 'supplier-1' } };
}

/** A pay-at-door order confirmed on its delivery fee: the door leg is due. */
function confirmedLog(quote: Quote): OrderInput[] {
  return [
    { kind: 'advance', to: 'reserved', command_id: 'ord-reserved-c1', actor: origin.actor, serverTime: T, chainAdditions: { reservation_id: 'res-1' } },
    { kind: 'advance', to: 'payment_pending', command_id: 'ord-payinit-c1', actor: origin.actor, serverTime: T, chainAdditions: { order_id: orderId, payment_attempt_id: 'att-1' } },
    { kind: 'provider', event: checkoutWebhook(quote), expectedProviderKey: 'att-1' },
    { kind: 'confirm', command_id: 'ord-confirm-c1', actor: origin.actor, serverTime: T },
  ];
}

describe('a rebuild re-applies what was admitted; the funded-leg rule binds the live admission only', () => {
  it('a log written under the earlier rule — eligibility while the door leg was due, then the door payment — rebuilds with both lines equal to the Quote\'s nets', () => {
    const quote = doorQuote();
    const log: OrderInput[] = [
      ...confirmedLog(quote),
      { kind: 'eligibility', event: validated() },
      { kind: 'door_provider', event: doorWebhook(quote), expectedProviderKey: 'door-att-1' },
    ];
    const spine = rebuildOrderSpine(quote, origin, log);
    expect(spine.journey.state).toBe('confirmed');
    expect(spine.doorLegState).toBe('paid');
    const lines = spine.ledger.obligationsFor(orderId);
    expect(lines).toHaveLength(2);
    expect(lines.find((o) => o.party.startsWith('supplier:'))!.amount).toBe(quote.sellerNet);
    expect(lines.find((o) => o.party.startsWith('reseller:'))!.amount).toBe(quote.resellerNet);
    expect(reconcileOrder(spine.reconciliationSnapshot(), { serverTime: T })).toEqual([]);
  });

  it('the same eligibility applied LIVE to a spine whose door leg is due is still refused by name, and writes nothing', () => {
    const quote = doorQuote();
    const spine = rebuildOrderSpine(quote, origin, confirmedLog(quote));
    expect(spine.doorLegState).toBe('due');
    const outcome = applyOrderInput(spine, { kind: 'eligibility', event: validated() });
    expect(outcome).toMatchObject({ applied: false, reason: 'eligibility_before_funded_legs' });
    expect(spine.ledger.obligationsFor(orderId)).toHaveLength(0);
  });

  it('the same log without the door payment rebuilds with its lines and the door leg due — and the reconciliation pass names it', () => {
    const quote = doorQuote();
    const spine = rebuildOrderSpine(quote, origin, [...confirmedLog(quote), { kind: 'eligibility', event: validated() }]);
    expect(spine.doorLegState).toBe('due');
    expect(spine.ledger.obligationsFor(orderId)).toHaveLength(2);
    const alerts = reconcileOrder(spine.reconciliationSnapshot(), { serverTime: T });
    expect(alerts.map((a) => a.payload['alert'])).toEqual(['obligations_while_door_leg_due']);
  });
});
