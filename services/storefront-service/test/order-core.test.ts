import { canonicalJsonStringify, type Quote } from '@platform/contracts';
import {
  MockPaymentProvider,
  PAY_AT_DOOR_POLICY_DEFAULTS,
  WORKED_BASELINE_INPUT,
  issueQuote,
} from '@shop-plus/commerce-core';
import { describe, expect, it } from 'vitest';
import {
  applyOrderInput,
  checkoutLegOf,
  decideCreateOrder,
  orderIdForQuote,
  rebuildOrderSpine,
  requiredLegsFor,
  toBuyerOrderView,
  type OrderInput,
  type OrderOrigin,
  type ReservationReceipt,
} from '../src/order-core.js';
import { readSandboxBehavior, sandboxPaymentProvider } from '../src/payment-port.js';

/**
 * SP3.3a — THE ORDER DECISION CORE, BY VALUE.
 *
 * Everything here is proven against the exact functions the Durable Object
 * calls, with a clock injected — so the two behaviours a real workerd test
 * cannot reach (a quote past its 15-minute expiry, a hold past its 2-minute TTL)
 * are proven here rather than left unproven, exactly as SP3.2a does for the
 * reservation. The DURABILITY claims are the e2e's, on real workerd.
 */

const T = '2026-07-30T08:00:00.000Z';
const FLAGS = { version: 'sp33a-test', flags: {}, kills: [], killedCategories: [] } as const;

/** The §5.4 worked baseline: B 10 000 · C 1 000 · M 1 500 · D 1 000. */
function fullPrepayQuote(id = 'quote-sp33a-1', at = T): { quote: Quote; bytes: string } {
  const issued = issueQuote(
    { flags: FLAGS, now: () => new Date(at), newId: () => id },
    {
      listingRef: 'lst-1',
      offerRef: 'ofr-1',
      attributionResellerId: 'rs-1',
      paymentMode: 'FULL_PREPAY',
      ...WORKED_BASELINE_INPUT,
    },
  );
  if (!issued.ok) throw new Error(`setup: quote refused ${JSON.stringify(issued)}`);
  return { quote: issued.quote, bytes: issued.canonicalBytes };
}

/** Option B needs a policy that names a zone — the shipped default names none. */
function doorQuote(id = 'quote-sp33a-b'): { quote: Quote; bytes: string } {
  const issued = issueQuote(
    { flags: FLAGS, now: () => new Date(T), newId: () => id },
    {
      listingRef: 'lst-1',
      offerRef: 'ofr-1',
      attributionResellerId: 'rs-1',
      // The spread carries `paymentMode: FULL_PREPAY`, so the mode is stated
      // AFTER it — the door mode is the point of this fixture.
      ...WORKED_BASELINE_INPUT,
      paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
      nowIso: T,
      payAtDoor: {
        eligibility: {
          buyerRef: 'b-1',
          state: 'allowed',
          buyerRefusalCount: 0,
          buyerRiskState: 'normal',
          requiredDeposit: 0,
        },
        sellerTier: 'verified',
        category: 'fashion_bags_fabrics',
        zoneTo: 'ouaga-centre',
        policy: {
          ...PAY_AT_DOOR_POLICY_DEFAULTS,
          version: `${PAY_AT_DOOR_POLICY_DEFAULTS.version}+sp33a-test-zone`,
          networkReliableZones: ['ouaga-centre'],
        },
      },
    },
  );
  if (!issued.ok) throw new Error(`setup: door quote refused ${JSON.stringify(issued)}`);
  return { quote: issued.quote, bytes: issued.canonicalBytes };
}

/** An ALL-DISTINCT quote: B 22 000 · C 1 500 · M 3 000 · D 1 000, so that every
 *  derived amount is a different number and a leak of any one is detectable. */
function distinctQuote(): { quote: Quote; bytes: string } {
  const issued = issueQuote(
    { flags: FLAGS, now: () => new Date(T), newId: () => 'quote-distinct' },
    {
      listingRef: 'lst-d',
      offerRef: 'ofr-d',
      attributionResellerId: 'rs-distinct',
      paymentMode: 'FULL_PREPAY',
      sellerBasePrice: 22_000,
      sellerFundedCommission: 1_500,
      resellerMarkup: 3_000,
      deliveryFee: 1_000,
    },
  );
  if (!issued.ok) throw new Error('setup: distinct quote refused');
  return { quote: issued.quote, bytes: issued.canonicalBytes };
}

function receiptFor(quoteId: string, holderRef = 'holder-1', expiresAt = '2026-07-30T08:02:00.000Z'): ReservationReceipt {
  return { quoteId, reservationId: 'res-sp33a-1', holderRef, expiresAt };
}

function originFor(orderId: string): OrderOrigin {
  return {
    orderId,
    quoteId: orderId.replace(/^ord-/u, ''),
    correlationId: `corr-${orderId}`,
    issueCommandId: 'ord-issue-c1',
    actor: 'storefront-service:checkout',
    createdAt: T,
    supplierRef: '',
  };
}

/* ═════════════════ the legs come from the MODE, never the caller ═══════════ */

describe('requiredLegsFor — §5.5 per mode, read off the quote bytes', () => {
  it('FULL_PREPAY derives ONE checkout leg of buyerTotal, due now', () => {
    const { quote } = fullPrepayQuote();
    const derived = requiredLegsFor(quote);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.legs).toEqual([{ legType: 'checkout', amount: 12_500, due: 'now' }]);
    expect(derived.legs[0]!.amount).toBe(quote.buyerTotal);
    // and the amount the provider is asked for IS that leg — never a caller's
    expect(checkoutLegOf(derived.legs)!.amount).toBe(quote.amountPaidAtCheckout);
  });

  it('Option B derives a checkout leg of D and a door leg of productSubtotal, DUE at delivery', () => {
    const { quote } = doorQuote();
    const derived = requiredLegsFor(quote);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.legs).toEqual([
      { legType: 'checkout', amount: 1_000, due: 'now' },
      { legType: 'door', amount: 11_500, due: 'at_delivery' },
    ]);
    expect(derived.legs[0]!.amount).toBe(quote.deliveryFee);
    expect(derived.legs[1]!.amount).toBe(quote.productSubtotal);
    // §5.5 to the franc, on the wire the order will be charged against
    expect(derived.legs[0]!.amount).toBe(quote.amountPaidAtCheckout);
    expect(derived.legs[1]!.amount).toBe(quote.amountDueAtDelivery);
  });

  it('A SPLIT-SHIFTED QUOTE IS REFUSED — the coherent lie the funded-legs gate exists for', () => {
    const { quote } = fullPrepayQuote();
    // paid + due still sums to buyerTotal, so the pinned reconciliation checker
    // is satisfied — but the SPLIT no longer matches the mode. This is exactly
    // `gates/fixtures/negative/order-journey.option-b.split-lie.json`'s shape.
    const shifted: Quote = { ...quote, amountPaidAtCheckout: 11_500, amountDueAtDelivery: 1_000 };
    expect(requiredLegsFor(shifted)).toEqual({ ok: false, reason: 'quote_split_incoherent' });

    const { quote: door } = doorQuote();
    const doorShifted: Quote = { ...door, amountPaidAtCheckout: door.buyerTotal, amountDueAtDelivery: 0 };
    expect(requiredLegsFor(doorShifted)).toEqual({ ok: false, reason: 'quote_split_incoherent' });
  });
});

/* ═══════════════ the reservation is PROVEN, never assumed ═════════════════ */

describe('decideCreateOrder — the hold must be the caller\'s own', () => {
  const now = new Date('2026-07-30T08:01:00.000Z');

  it('a quote held by THIS holder, unexpired, creates the order', () => {
    const { quote, bytes } = fullPrepayQuote();
    const decision = decideCreateOrder({
      quoteBytes: bytes,
      quoteId: quote.id,
      holderRef: 'holder-1',
      receipt: receiptFor(quote.id),
      now,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.reservationId).toBe('res-sp33a-1');
    expect(decision.quote.id).toBe(quote.id);
  });

  it('NO RESERVATION AT ALL is refused by name — an order is never created on a free quote', () => {
    const { quote, bytes } = fullPrepayQuote();
    expect(
      decideCreateOrder({ quoteBytes: bytes, quoteId: quote.id, holderRef: 'holder-1', receipt: undefined, now }),
    ).toEqual({ ok: false, reason: 'quote_not_reserved' });
  });

  it('A RECEIPT FOR ANOTHER QUOTE proves nothing about this one', () => {
    const { quote, bytes } = fullPrepayQuote();
    expect(
      decideCreateOrder({
        quoteBytes: bytes,
        quoteId: quote.id,
        holderRef: 'holder-1',
        receipt: receiptFor('quote-someone-else'),
        now,
      }),
    ).toEqual({ ok: false, reason: 'quote_not_reserved' });
  });

  it('ANOTHER HOLDER IS REFUSED BY NAME — the SP3.2a flag, closed', () => {
    // The flag: anyone who learns a quote id can take its 2-minute hold. The
    // order path cannot give the hold back, but it can refuse to let a caller
    // who does NOT hold it order on top of one who does.
    const { quote, bytes } = fullPrepayQuote();
    expect(
      decideCreateOrder({
        quoteBytes: bytes,
        quoteId: quote.id,
        holderRef: 'holder-2',
        receipt: receiptFor(quote.id, 'holder-1'),
        now,
      }),
    ).toEqual({ ok: false, reason: 'reservation_held_by_another' });
  });

  it('AN EXPIRED HOLD is refused — proven by value, since no test can wait out a TTL', () => {
    const { quote, bytes } = fullPrepayQuote();
    expect(
      decideCreateOrder({
        quoteBytes: bytes,
        quoteId: quote.id,
        holderRef: 'holder-1',
        receipt: receiptFor(quote.id, 'holder-1', '2026-07-30T08:00:30.000Z'),
        now, // 08:01:00 — thirty seconds past the hold
      }),
    ).toEqual({ ok: false, reason: 'reservation_expired' });
  });

  it('AN EXPIRED QUOTE is refused — a revived price is a price nobody agreed to', () => {
    const { quote, bytes } = fullPrepayQuote();
    expect(
      decideCreateOrder({
        quoteBytes: bytes,
        quoteId: quote.id,
        holderRef: 'holder-1',
        receipt: receiptFor(quote.id, 'holder-1', '2026-07-30T09:00:00.000Z'),
        now: new Date('2026-07-30T08:16:00.000Z'), // one minute past the 15-min TTL
      }),
    ).toEqual({ ok: false, reason: 'quote_expired' });
  });

  it('absent, mismatched and unreadable bytes are three named refusals, never a crash', () => {
    const { quote, bytes } = fullPrepayQuote();
    const receipt = receiptFor(quote.id);
    expect(
      decideCreateOrder({ quoteBytes: undefined, quoteId: quote.id, holderRef: 'holder-1', receipt, now }),
    ).toEqual({ ok: false, reason: 'quote_unknown' });
    expect(
      decideCreateOrder({ quoteBytes: bytes, quoteId: 'quote-another', holderRef: 'holder-1', receipt, now }),
    ).toEqual({ ok: false, reason: 'quote_unknown' });
    expect(
      decideCreateOrder({ quoteBytes: '{not json', quoteId: quote.id, holderRef: 'holder-1', receipt, now }),
    ).toEqual({ ok: false, reason: 'stored_quote_unreadable' });
    // BYTES THAT PARSE TO A VALID QUOTE BUT ARE NOT ITS CANONICAL FORM. The
    // vault's store keeps the BYTES and re-checks that they ARE the quote, so a
    // record whose serialization has drifted — by so much as a trailing byte —
    // is refused rather than parsed-and-trusted. Byte-stability is the property
    // the whole immutable-quote design rests on.
    const drifted = `${canonicalJsonStringify(quote)}\n`;
    expect(
      decideCreateOrder({ quoteBytes: drifted, quoteId: quote.id, holderRef: 'holder-1', receipt, now }),
    ).toEqual({ ok: false, reason: 'stored_quote_unreadable' });
    // …and a quote whose SPLIT has drifted from its mode is a different, equally
    // named refusal — never a charge.
    const shifted = canonicalJsonStringify({ ...quote, amountPaidAtCheckout: 1, amountDueAtDelivery: 12_499 });
    expect(
      decideCreateOrder({ quoteBytes: shifted, quoteId: quote.id, holderRef: 'holder-1', receipt, now }),
    ).toEqual({ ok: false, reason: 'quote_split_incoherent' });
  });

  it('the order id is a pure function of the quote id — one quote can never grow two orders', () => {
    expect(orderIdForQuote('quote-abc')).toBe('ord-quote-abc');
    expect(orderIdForQuote('quote-abc')).toBe(orderIdForQuote('quote-abc'));
  });
});

/* ══════════════════════ the buyer wire (the boundary) ═════════════════════ */

describe('toBuyerOrderView — four fields, and not one franc of economics', () => {
  it('the keys ARE the allowlist and no banned name or value appears in the bytes', () => {
    const { quote } = distinctQuote();
    const view = toBuyerOrderView({ orderId: 'ord-quote-distinct', state: 'payment_pending', quote });
    expect(Object.keys(view).sort()).toEqual(
      ['amountDueAtDelivery', 'amountPaidAtCheckout', 'orderId', 'state'].sort(),
    );
    const bytes = JSON.stringify(view);
    for (const banned of [
      'sellerBasePrice',
      'sellerFundedCommission',
      'sellerNet',
      'sellerPlatformFee',
      'resellerGrossEarnings',
      'resellerPlatformFee',
      'resellerNet',
      'resellerMarkup',
      'platformProductFeeRevenue',
      'paymentProcessingFeeEstimate',
      'attributionResellerId',
      'productSubtotal',
      'deliveryFee',
      'buyerTotal',
      'collectRef',
      'paymentAttemptId',
      'payment_attempt_id',
      'holderRef',
      'reservationId',
      'provider',
    ]) {
      expect(bytes.includes(banned), banned).toBe(false);
    }
    // EVERY DERIVED AMOUNT IS DISTINCT in this fixture, so a leaked VALUE is
    // detectable on its own: B, C, M, both fees, both nets, the platform revenue
    // and the subtotal must all be absent.
    for (const value of ['22000', '1500', '3000', '25000', '1100', '19400', '4500', '900', '3600', '2000']) {
      expect(bytes.includes(value), value).toBe(false);
    }
    // …and what the buyer IS owed is present and correct to the franc (SP-I13).
    expect(view.amountPaidAtCheckout).toBe(26_000);
    expect(view.amountDueAtDelivery).toBe(0);
  });

  it('an Option-B order shows what is paid now and what is due at delivery, separately', () => {
    const { quote } = doorQuote();
    const view = toBuyerOrderView({ orderId: 'ord-x', state: 'confirmed', quote });
    expect(view.amountPaidAtCheckout).toBe(1_000); // D
    expect(view.amountDueAtDelivery).toBe(11_500); // productSubtotal
    expect(view.amountPaidAtCheckout + view.amountDueAtDelivery).toBe(quote.buyerTotal);
  });
});

/* ════════════ the durable journal replays the vault's own decisions ═══════ */

describe('the input journal — the same log replays to the same state, on any process', () => {
  const orderId = 'ord-quote-sp33a-1';
  const origin = originFor(orderId);

  function toPaymentPending(): OrderInput[] {
    return [
      {
        kind: 'advance',
        to: 'reserved',
        command_id: 'ord-reserved-c1',
        actor: origin.actor,
        serverTime: T,
        chainAdditions: { reservation_id: 'res-sp33a-1' },
      },
      {
        kind: 'advance',
        to: 'payment_pending',
        command_id: 'ord-payinit-c1',
        actor: origin.actor,
        serverTime: T,
        chainAdditions: { order_id: orderId, payment_attempt_id: 'att-1' },
      },
    ];
  }

  function webhookFor(quote: Quote, attemptId: string, amount = quote.amountPaidAtCheckout): unknown {
    // THE CERTIFIED MOCK builds the bytes — not a hand-written event.
    const provider = new MockPaymentProvider({});
    provider.initiateCharge({
      orderId,
      paymentAttemptId: attemptId,
      amount,
      correlationId: origin.correlationId,
      requestedAtIso: T,
    });
    return provider.webhookDeliveryPlan()[0]!.event;
  }

  it('replaying the log twice yields the identical state, chain and escrow', () => {
    const { quote } = fullPrepayQuote();
    const log = toPaymentPending();
    const a = rebuildOrderSpine(quote, origin, log);
    const b = rebuildOrderSpine(quote, origin, log);
    expect(a.journey.state).toBe('payment_pending');
    expect(b.journey.state).toBe(a.journey.state);
    expect(b.journey.chain).toEqual(a.journey.chain);
    expect(b.journey.aggregateVersion).toBe(a.journey.aggregateVersion);
  });

  it('A CONFIRM BEFORE ANY FUNDED LEG IS REFUSED by the vault — SP-I13, at runtime', () => {
    const { quote } = fullPrepayQuote();
    const spine = rebuildOrderSpine(quote, origin, toPaymentPending());
    expect(applyOrderInput(spine, { kind: 'confirm', command_id: 'c', actor: 'a', serverTime: T })).toEqual({
      applied: false,
      reason: 'out_of_order', // not even `paid` yet — the money never moved
    });
  });

  it('AN AMOUNT THAT DOES NOT MATCH THE LEG IS REFUSED, and the order stays unpaid', () => {
    const { quote } = fullPrepayQuote();
    const spine = rebuildOrderSpine(quote, origin, toPaymentPending());
    const short = webhookFor(quote, 'att-1', quote.amountPaidAtCheckout - 1);
    expect(applyOrderInput(spine, { kind: 'provider', event: short })).toEqual({
      applied: false,
      reason: 'amount_mismatch',
    });
    expect(spine.journey.state).toBe('payment_pending');
    expect(spine.ledger.escrowFor(orderId)).toBeUndefined();
  });

  it('the provider event pays, the confirm lands on a FUNDED leg, and a duplicate is absorbed', () => {
    const { quote } = fullPrepayQuote();
    const event = webhookFor(quote, 'att-1');
    const log = toPaymentPending();
    const spine = rebuildOrderSpine(quote, origin, log);
    expect(applyOrderInput(spine, { kind: 'provider', event })).toEqual({ applied: true, duplicate: false });
    expect(spine.journey.state).toBe('paid');
    const confirm: OrderInput = { kind: 'confirm', command_id: 'ord-confirm-1', actor: 'a', serverTime: T };
    expect(applyOrderInput(spine, confirm)).toEqual({ applied: true, duplicate: false });
    expect(spine.journey.state).toBe('confirmed');
    const escrow = spine.ledger.escrowFor(orderId)!;
    expect(escrow.paymentLegs).toHaveLength(1);
    expect(escrow.paymentLegs[0]!.amount).toBe(quote.amountPaidAtCheckout);

    // THE REDELIVERY: the same webhook again, on the REBUILT spine (the shape a
    // restart produces), is absorbed — not a second leg, not a second payment.
    const rebuilt = rebuildOrderSpine(quote, origin, [...log, { kind: 'provider', event }, confirm]);
    expect(rebuilt.journey.state).toBe('confirmed');
    expect(applyOrderInput(rebuilt, { kind: 'provider', event })).toEqual({ applied: true, duplicate: true });
    expect(rebuilt.ledger.escrowFor(orderId)!.paymentLegs).toHaveLength(1);
  });

  it('A RETRY AFTER FAILURE DEMANDS A NEW ATTEMPT ID — the vault refuses a reused one', () => {
    const { quote } = fullPrepayQuote();
    const log: OrderInput[] = [
      ...toPaymentPending(),
      { kind: 'fail', command_id: 'ord-fail-c1', actor: 'a', serverTime: T, reason: 'charge_timeout' },
    ];
    const spine = rebuildOrderSpine(quote, origin, log);
    expect(spine.journey.state).toBe('payment_failed');
    expect(
      applyOrderInput(spine, {
        kind: 'retry',
        command_id: 'ord-retry-c2',
        actor: 'a',
        serverTime: T,
        newPaymentAttemptId: 'att-1', // the SAME attempt — a second charge on one key
      }),
    ).toEqual({ applied: false, reason: 'retry_requires_new_attempt_id' });

    const fresh = rebuildOrderSpine(quote, origin, log);
    expect(
      applyOrderInput(fresh, {
        kind: 'retry',
        command_id: 'ord-retry-c2',
        actor: 'a',
        serverTime: T,
        newPaymentAttemptId: 'att-2',
      }),
    ).toEqual({ applied: true, duplicate: false });
    expect(fresh.journey.state).toBe('payment_pending');
    expect(fresh.journey.chain.payment_attempt_id).toBe('att-2');
    expect(fresh.journey.priorPaymentAttemptIds).toEqual(['att-1']);
  });
});

/* ═════════════════════════════ the provider seam ══════════════════════════ */

describe('the provider seam — one verb, the certified mock, no aggregator', () => {
  it('an accepted charge answers a collect reference and NOTHING about payment', async () => {
    const provider = sandboxPaymentProvider({}, 0);
    const outcome = await provider.initiateCharge({
      orderId: 'ord-1',
      paymentAttemptId: 'att-1',
      amount: 12_500,
      correlationId: 'corr-1',
      requestedAtIso: T,
      legType: 'checkout',
    });
    expect(outcome.accepted).toBe(true);
    if (!outcome.accepted) return;
    expect(outcome.collectRef).toBe('collect-att-1');
  });

  it('the timeout budget is measured against the attempts ALREADY initiated, so a restart cannot re-arm it', async () => {
    const behavior = { timeoutFirstNInitiates: 1 };
    const first = await sandboxPaymentProvider(behavior, 0).initiateCharge({
      orderId: 'ord-1',
      paymentAttemptId: 'att-1',
      amount: 12_500,
      correlationId: 'corr-1',
      requestedAtIso: T,
      legType: 'checkout',
    });
    // The outcome ECHOES the amount the port was called with — the record and
    // the charge read one value, so they cannot diverge.
    expect(first).toEqual({ accepted: false, reason: 'timeout', chargedAmount: 12_500 });
    // The SECOND charge on a fresh instance (what a Durable Object rebuild is)
    // must NOT time out again — otherwise « the first initiate times out »
    // silently becomes « every initiate times out » and no retry could ever pass.
    const second = await sandboxPaymentProvider(behavior, 1).initiateCharge({
      orderId: 'ord-1',
      paymentAttemptId: 'att-2',
      amount: 12_500,
      correlationId: 'corr-1',
      requestedAtIso: T,
      legType: 'checkout',
    });
    expect(second.accepted).toBe(true);
  });

  it('an unreadable behaviour config is the WELL-BEHAVED provider, never an unknown one', () => {
    expect(readSandboxBehavior(undefined)).toEqual({});
    expect(readSandboxBehavior('')).toEqual({});
    expect(readSandboxBehavior('{not json')).toEqual({});
    expect(readSandboxBehavior('[1,2]')).toEqual({});
    expect(readSandboxBehavior('{"timeoutFirstNInitiates":2}')).toEqual({ timeoutFirstNInitiates: 2 });
  });

  it('the seam names no aggregator and carries no credential', async () => {
    // A source-level claim would be a source-grep test; this is the BEHAVIOUR:
    // the only provider identity that exists anywhere on this path is the
    // sandbox one the frozen vault stamps on its own webhook.
    const provider = new MockPaymentProvider({});
    provider.initiateCharge({
      orderId: 'ord-1',
      paymentAttemptId: 'att-1',
      amount: 1,
      correlationId: 'c',
      requestedAtIso: T,
    });
    const event = provider.webhookDeliveryPlan()[0]!.event;
    expect((event.payload as Record<string, unknown>)['provider']).toBe('sandbox-provider');
  });
});
