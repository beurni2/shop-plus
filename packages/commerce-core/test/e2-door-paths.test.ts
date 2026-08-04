import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify } from '@platform/contracts';
import {
  PAY_AT_DOOR_POLICY_DEFAULTS,
  decidePayAtDoorEligibility,
  type PayAtDoorPolicy,
} from '../src/pay-at-door-policy.js';
import { issueQuote, type QuoteIssuanceDeps } from '../src/quote-issuance.js';
import { LedgerRecords } from '../src/ledger.js';
import { OrderSpine } from '../src/order-spine.js';
import { MockPaymentProvider } from '../src/mocks/payment-provider-mock.js';
import { WORKED_BASELINE_INPUT } from '../src/fixtures.js';

/**
 * WO-2.5 — Option-B door states (§5.5 · SP3.3 · SP4.2 · SE-I11 shop-side
 * half). The baseline: B 10,000 · C 1,000 · M 1,500 · D 1,000 →
 * amountPaidAtCheckout = 1,000 (D) · amountDueAtDelivery = 11,500
 * (productSubtotal) — both written by the PINNED waterfall.
 */

const T = '2026-07-10T12:00:00.000Z';
const flags = { version: 'e2-sandbox', flags: {}, kills: [], killedCategories: [] };
const deps = (): QuoteIssuanceDeps => ({ flags, now: () => new Date(T), newId: () => 'quote-b-0001' });

/** A policy with one reliable zone so the POSITIVE path is testable —
 * the shipped DEFAULT allowlist stays empty (conservative). */
const TEST_POLICY: PayAtDoorPolicy = {
  ...PAY_AT_DOOR_POLICY_DEFAULTS,
  version: 'option-b-policy.v0-conservative+test-zone',
  networkReliableZones: ['ouaga-centre'],
};

const ALLOWED_ELIGIBILITY = {
  buyerRef: 'buyer-b-1',
  state: 'allowed',
  buyerRefusalCount: 0,
  buyerRiskState: 'normal',
  requiredDeposit: 0,
};

const GATE_CONTEXT = {
  eligibility: ALLOWED_ELIGIBILITY,
  sellerTier: 'verified',
  category: 'fashion_bags_fabrics',
  zoneTo: 'ouaga-centre',
};

function optionBInput() {
  return {
    listingRef: 'lst-b',
    offerRef: 'offer-b',
    attributionResellerId: 'reseller-b',
    ...WORKED_BASELINE_INPUT,
    paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
    payAtDoor: { ...GATE_CONTEXT, policy: TEST_POLICY },
    nowIso: T,
  };
}

/** Drive a REAL spine to a confirmed Option-B order (D-funded checkout leg). */
function confirmedOptionBSpine() {
  const issued = issueQuote(deps(), optionBInput());
  if (!issued.ok) throw new Error(`setup: quote refused ${issued.reason}`);
  const spine = new OrderSpine({
    quote: issued.quote, supplierRef: 'supplier-b', correlationId: 'corr-b-0001',
    issueCommandId: 'c-issue', actor: 'commerce-core:test', serverTime: T,
  });
  spine.advance({ command_id: 'c-res', actor: 'commerce-core:test', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-b-1' } });
  spine.advance({ command_id: 'c-pay', actor: 'commerce-core:test', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'att-b-1', order_id: 'order-b-1' } });
  const provider = new MockPaymentProvider();
  provider.initiateCharge({ orderId: 'order-b-1', paymentAttemptId: 'att-b-1', amount: issued.quote.amountPaidAtCheckout, correlationId: 'corr-b-0001', requestedAtIso: T, legType: 'checkout' });
  const paid = spine.onProviderPaymentEvent(provider.webhookDeliveryPlan()[0]!.event);
  if (!paid.applied) throw new Error(`setup: checkout webhook refused`);
  const confirmed = spine.confirmOrder({ command_id: 'c-confirm', actor: 'commerce-core:test', serverTime: T });
  if (!confirmed.applied) throw new Error('setup: confirm refused');
  return { spine, quote: issued.quote, provider };
}

/** The provider's REAL door webhook for the confirmed order above. */
function doorWebhook(provider: MockPaymentProvider, amount: number) {
  provider.initiateCharge({ orderId: 'order-b-1', paymentAttemptId: 'door-att-1', amount, correlationId: 'corr-b-0001', requestedAtIso: T, legType: 'door' });
  return provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1')!.event;
}

describe('SP3.3 — the Option-B eligibility gate (§6.1, evaluated at quote, fails closed)', () => {
  it('an eligible request under a zone-configured policy issues a reconciling Option-B quote (paid=D, due=productSubtotal)', () => {
    const outcome = issueQuote(deps(), optionBInput());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.quote.paymentMode).toBe('DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    expect(outcome.quote.amountPaidAtCheckout).toBe(1_000);
    expect(outcome.quote.amountDueAtDelivery).toBe(11_500);
    expect(outcome.quote.buyerTotal).toBe(12_500);
  });

  it('NEGATIVE: an ineligible PAY_AT_DOOR request refuses closed — no quote exists', () => {
    const outcome = issueQuote(deps(), {
      ...optionBInput(),
      payAtDoor: { ...GATE_CONTEXT, policy: TEST_POLICY, sellerTier: 'provisional' },
    });
    expect(outcome).toEqual({
      ok: false,
      reason: 'pay_at_door_not_eligible',
      refusal: 'seller_tier_below_minimum',
      policyVersion: TEST_POLICY.version,
    });
    expect(outcome).not.toHaveProperty('quote');
  });

  it('every §6.1 condition refuses independently, each with its named reason', () => {
    const base = { ...GATE_CONTEXT, buyerTotalFcfa: 12_500, nowIso: T };
    expect(decidePayAtDoorEligibility({ ...base, eligibility: { ...ALLOWED_ELIGIBILITY, state: 'suspended' } }, TEST_POLICY))
      .toMatchObject({ eligible: false, reason: 'buyer_not_allowed' });
    expect(decidePayAtDoorEligibility({ ...base, eligibility: { ...ALLOWED_ELIGIBILITY, prepayOnlyUntil: '2026-08-01T00:00:00.000Z' } }, TEST_POLICY))
      .toMatchObject({ eligible: false, reason: 'buyer_not_allowed' });
    expect(decidePayAtDoorEligibility({ ...base, eligibility: { ...ALLOWED_ELIGIBILITY, requiredDeposit: 500 } }, TEST_POLICY))
      .toMatchObject({ eligible: false, reason: 'buyer_not_allowed' });
    expect(decidePayAtDoorEligibility({ ...base, eligibility: { not: 'canonical' } }, TEST_POLICY))
      .toMatchObject({ eligible: false, reason: 'eligibility_record_not_canonical' });
    expect(decidePayAtDoorEligibility({ ...base, category: 'electronics' }, TEST_POLICY))
      .toMatchObject({ eligible: false, reason: 'category_not_inspectable' });
    expect(decidePayAtDoorEligibility({ ...base, buyerTotalFcfa: 25_001 }, TEST_POLICY))
      .toMatchObject({ eligible: false, reason: 'over_price_cap' });
    expect(decidePayAtDoorEligibility({ ...base, zoneTo: 'zone-inconnue' }, TEST_POLICY))
      .toMatchObject({ eligible: false, reason: 'zone_not_network_reliable' });
  });

  /**
   * FOUNDER RULING 2026-08-01 — « remove the list of the eligibility rule of
   * neighbourhoods, it's open to every buyer who want that option. » This test
   * used to pin the opposite (the empty allowlist refusing everything) and is
   * rewritten rather than deleted, because the question it asks — WHAT DO THE
   * SHIPPED DEFAULTS DO? — is the one that matters most about this policy.
   */
  it('the SHIPPED defaults offer Option B in EVERY zone (founder ruling 2026-08-01)', () => {
    for (const zoneTo of ['ouaga-centre', 'Gounghin', 'Dassasgho', 'a-zone-nobody-has-named-yet']) {
      const decision = decidePayAtDoorEligibility(
        { ...GATE_CONTEXT, zoneTo, buyerTotalFcfa: 12_500, nowIso: T },
        PAY_AT_DOOR_POLICY_DEFAULTS,
      );
      expect(decision, zoneTo).toMatchObject({ eligible: true });
    }
  });

  it('…and the OTHER FOUR §6.1 conditions still refuse, each by its own name', () => {
    const base = { ...GATE_CONTEXT, buyerTotalFcfa: 12_500, nowIso: T };
    const cases = [
      [{ ...base, sellerTier: 'basic' }, 'seller_tier_below_minimum'],
      [{ ...base, category: 'electronics' }, 'category_not_inspectable'],
      [{ ...base, buyerTotalFcfa: 25_001 }, 'over_price_cap'],
      [{ ...base, eligibility: { ...GATE_CONTEXT.eligibility, state: 'suspended' } }, 'buyer_not_allowed'],
    ] as const;
    for (const [ctx, reason] of cases) {
      expect(decidePayAtDoorEligibility(ctx, PAY_AT_DOOR_POLICY_DEFAULTS), reason)
        .toMatchObject({ eligible: false, reason });
    }
  });

  it('AN EMPTY ARRAY STILL REFUSES EVERYTHING — « everywhere » is a sentinel, never an accident', () => {
    // The half of the rule that keeps a lost or half-written config fail-closed:
    // only the literal `'all'` opens it, never the absence of zones.
    const decision = decidePayAtDoorEligibility(
      { ...GATE_CONTEXT, buyerTotalFcfa: 12_500, nowIso: T },
      { ...PAY_AT_DOOR_POLICY_DEFAULTS, networkReliableZones: [] },
    );
    expect(decision).toMatchObject({ eligible: false, reason: 'zone_not_network_reliable' });
  });

  /**
   * ═══ OPTION-B-REACHABLE-1 — THE VOCABULARY GAP THAT REFUSED EVERY LISTING ═══
   *
   * Founder, 2026-08-04: « Option B still not reachable ». With the zones open
   * and the tier attested, this was the condition still refusing: Boutik+ writes
   * the SUPPLIER'S OWN CHIP into `category` (« Mode femme », « Chaussures »…)
   * and its producer explicitly defers the meaning to Shop+ — « Shop+ allowlists
   * what it recognises … the only side that may decide what a category MEANS ».
   * Shop+ compared those French words to §6.2's row names and never matched one.
   *
   * These are the eight strings a supplier can actually produce today, asserted
   * against the SHIPPED policy — not a fixture invented for the test.
   */
  it('THE EIGHT REAL BOUTIK+ CHIPS — seven reach §6.2 rows, « Maison » reaches none', () => {
    const verdict = (category: string) =>
      decidePayAtDoorEligibility({ ...GATE_CONTEXT, category, buyerTotalFcfa: 12_500, nowIso: T }, PAY_AT_DOOR_POLICY_DEFAULTS);
    for (const chip of ['Mode femme', 'Mode homme', 'Enfant', 'Sacs', 'Tissus', 'Chaussures', 'Beauté scellée']) {
      expect(verdict(chip), chip).toMatchObject({ eligible: true });
    }
    // §6.2 names four rows and « home goods » is not one of them, so this is the
    // fail-closed answer, not an omission: no row means no inspection rights.
    expect(verdict('Maison')).toMatchObject({ eligible: false, reason: 'category_not_inspectable' });
  });

  it('§6.2’s OWN ROW NAMES still pass — a producer already speaking canon is not broken by the map', () => {
    for (const row of ['fashion_bags_fabrics', 'shoes', 'sealed_beauty_cosmetics']) {
      expect(
        decidePayAtDoorEligibility({ ...GATE_CONTEXT, category: row, buyerTotalFcfa: 12_500, nowIso: T }, PAY_AT_DOOR_POLICY_DEFAULTS),
        row,
      ).toMatchObject({ eligible: true });
    }
  });

  it('ANYTHING ELSE REFUSES — free text, a typo, a prototype chain member', () => {
    // `rangeeInspection` is a Map for the reason `categorie-details.ts` states
    // on its twin: an object literal would resolve `constructor` to a function
    // and hand the gate a truthy non-row. These are the exact strings that
    // would have walked past that mistake.
    for (const junk of ['electronics', 'mode femme', 'MODE FEMME', 'Chaussure', 'constructor', 'toString', '__proto__', '']) {
      expect(
        decidePayAtDoorEligibility({ ...GATE_CONTEXT, category: junk, buyerTotalFcfa: 12_500, nowIso: T }, PAY_AT_DOOR_POLICY_DEFAULTS),
        junk,
      ).toMatchObject({ eligible: false, reason: 'category_not_inspectable' });
    }
  });

  it('THE POLICY STILL NARROWS — a mapped row the founder CLOSES is refused, chip and canon name alike', () => {
    // The two questions stay separate: `rangeeInspection` reads §6.2 (fixed),
    // `inspectableCategories` is ⏳ FOUNDER-TUNABLE. Closing a row must refuse
    // BOTH the canonical name and the chip that resolves to it, or the founder
    // would close a door that stayed open to whoever typed the French word.
    const noShoes = { ...PAY_AT_DOOR_POLICY_DEFAULTS, inspectableCategories: ['fashion_bags_fabrics'] };
    for (const shoe of ['shoes', 'Chaussures']) {
      expect(
        decidePayAtDoorEligibility({ ...GATE_CONTEXT, category: shoe, buyerTotalFcfa: 12_500, nowIso: T }, noShoes),
        shoe,
      ).toMatchObject({ eligible: false, reason: 'category_not_inspectable' });
    }
    // …and the row that stayed open is still open, so the narrowing is real and
    // not a blanket refusal (the control this assertion exists to provide).
    expect(
      decidePayAtDoorEligibility({ ...GATE_CONTEXT, category: 'Mode femme', buyerTotalFcfa: 12_500, nowIso: T }, noShoes),
    ).toMatchObject({ eligible: true });
  });

  it('a NAMED allowlist still allowlists — narrowing later stays possible', () => {
    const narrowed = { ...PAY_AT_DOOR_POLICY_DEFAULTS, networkReliableZones: ['ouaga-centre'] };
    expect(
      decidePayAtDoorEligibility({ ...GATE_CONTEXT, zoneTo: 'ouaga-centre', buyerTotalFcfa: 12_500, nowIso: T }, narrowed),
    ).toMatchObject({ eligible: true });
    expect(
      decidePayAtDoorEligibility({ ...GATE_CONTEXT, zoneTo: 'Pissy', buyerTotalFcfa: 12_500, nowIso: T }, narrowed),
    ).toMatchObject({ eligible: false, reason: 'zone_not_network_reliable' });
  });
});

describe('per-mode funded legs (SP3.2 extended — WO-2.5 item 2)', () => {
  it('an Option-B order confirms on its D-funded checkout leg (1,000 F, not buyerTotal)', () => {
    const { spine } = confirmedOptionBSpine();
    expect(spine.journey.state).toBe('confirmed');
    const escrow = spine.ledger.escrowFor('order-b-1')!;
    expect(escrow.paymentLegs).toHaveLength(1);
    expect(escrow.paymentLegs[0]).toMatchObject({ legType: 'checkout', amount: 1_000 });
    expect(spine.doorLegState).toBe('due');
  });

  it('NEGATIVE: a checkout webhook claiming FULL-PREPAY funding (buyerTotal) on a PAY_AT_DOOR order refuses — amount_mismatch', () => {
    const issued = issueQuote(deps(), optionBInput());
    if (!issued.ok) throw new Error('setup');
    const spine = new OrderSpine({
      quote: issued.quote, supplierRef: 'supplier-b', correlationId: 'corr-b-0001',
      issueCommandId: 'c-issue', actor: 'commerce-core:test', serverTime: T,
    });
    spine.advance({ command_id: 'c-res', actor: 'commerce-core:test', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-b-1' } });
    spine.advance({ command_id: 'c-pay', actor: 'commerce-core:test', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'att-b-1', order_id: 'order-b-1' } });
    const provider = new MockPaymentProvider();
    provider.initiateCharge({ orderId: 'order-b-1', paymentAttemptId: 'att-b-1', amount: 12_500, correlationId: 'corr-b-0001', requestedAtIso: T, legType: 'checkout' });
    const outcome = spine.onProviderPaymentEvent(provider.webhookDeliveryPlan()[0]!.event);
    expect(outcome).toEqual({ applied: false, reason: 'amount_mismatch' });
    expect(spine.journey.state).toBe('payment_pending'); // never paid, never confirmable
  });
});

describe('the door leg through the live spine (item 3 — provider truth only)', () => {
  it('a provider-confirmed door payment advances the door state and emits THE signal with the chain ids', () => {
    const { spine, quote, provider } = confirmedOptionBSpine();
    const outcome = spine.onProviderDoorPaymentEvent(doorWebhook(provider, quote.amountDueAtDelivery));
    expect(outcome.applied).toBe(true);
    if (!outcome.applied) return;
    expect(spine.doorLegState).toBe('paid');
    const signal = outcome.signal!;
    expect(signal.name).toBe('order.status_projection_updated.v1');
    expect(signal.payload).toMatchObject({
      quote_id: quote.id,
      reservation_id: 'res-b-1',
      order_id: 'order-b-1',
      door_leg: 'paid',
      amount_due_at_delivery_confirmed: 11_500,
      status: 'confirmed',
    });
    expect(signal.envelope.correlation_id).toBe('corr-b-0001');
    const escrow = spine.ledger.escrowFor('order-b-1')!;
    expect(escrow.paymentLegs.map((l) => `${l.legType}:${l.amount}`)).toEqual(['checkout:1000', 'door:11500']);
    expect(escrow.status).toBe('hold'); // aggregator stage unchanged pre-split
  });

  it('the door webhook is idempotent on command_id — one leg, one signal, replay flagged', () => {
    const { spine, quote, provider } = confirmedOptionBSpine();
    const webhook = doorWebhook(provider, quote.amountDueAtDelivery);
    spine.onProviderDoorPaymentEvent(webhook);
    const replay = spine.onProviderDoorPaymentEvent(webhook);
    expect(replay).toMatchObject({ applied: true, duplicate: true });
    expect(spine.ledger.escrowFor('order-b-1')!.paymentLegs).toHaveLength(2);
  });

  it('a door amount off by one franc refuses — amount_mismatch, no leg, no signal', () => {
    const { spine, quote, provider } = confirmedOptionBSpine();
    const outcome = spine.onProviderDoorPaymentEvent(doorWebhook(provider, quote.amountDueAtDelivery - 1));
    expect(outcome).toMatchObject({ applied: false, reason: 'amount_mismatch' });
    expect(spine.doorLegState).toBe('due');
    expect(spine.doorPaidSignal).toBeUndefined();
  });

  it('NEGATIVE (the Option-B law, shop-side half): NO door-paid signal exists without provider confirmation — a locally-asserted door payment cannot reach it', () => {
    const { spine } = confirmedOptionBSpine();
    // (a) the spine exposes no local door-paid mutator: the ONLY consumer is
    // onProviderDoorPaymentEvent, and a non-provider assertion refuses at parse.
    const locallyAsserted = spine.onProviderDoorPaymentEvent({
      claim: 'buyer paid at the door, rider saw it',
      amount: 11_500,
    });
    expect(locallyAsserted).toMatchObject({ applied: false, reason: 'not_a_platform_event' });
    // (b) a rider/app-fabricated event with a NON-door name refuses by name.
    const wrongName = spine.onProviderDoorPaymentEvent({
      name: 'order.status_projection_updated.v1',
      envelope: { command_id: 'fake-1', correlation_id: 'corr-b-0001', aggregateVersion: 6, actor: 'rider:app', serverTime: T, version: '1' },
      payload: { amount: 11_500, status: 'held' },
    });
    expect(wrongName).toMatchObject({ applied: false, reason: 'unexpected_event_name' });
    // After every attempt: door still due, no signal, no door leg.
    expect(spine.doorLegState).toBe('due');
    expect(spine.doorPaidSignal).toBeUndefined();
    expect(spine.ledger.escrowFor('order-b-1')!.paymentLegs).toHaveLength(1);
  });

  it('money records do not move by a byte on any refused door attempt', () => {
    const { spine, quote, provider } = confirmedOptionBSpine();
    const before = canonicalJsonStringify({
      escrow: spine.ledger.escrowFor('order-b-1'),
      obligations: spine.ledger.obligationsFor('order-b-1'),
    });
    spine.onProviderDoorPaymentEvent({ locally: 'asserted' });
    spine.onProviderDoorPaymentEvent(doorWebhook(provider, quote.amountDueAtDelivery + 1));
    const after = canonicalJsonStringify({
      escrow: spine.ledger.escrowFor('order-b-1'),
      obligations: spine.ledger.obligationsFor('order-b-1'),
    });
    expect(after).toBe(before);
  });
});

describe('item 5 — door confirmation vs local state (Contract §6 alert class)', () => {
  it('a door confirmation for an order NOT door-pending (still payment_pending) refuses AND raises reconciliation.alert.v1', () => {
    const issued = issueQuote(deps(), optionBInput());
    if (!issued.ok) throw new Error('setup');
    const spine = new OrderSpine({
      quote: issued.quote, supplierRef: 'supplier-b', correlationId: 'corr-b-0001',
      issueCommandId: 'c-issue', actor: 'commerce-core:test', serverTime: T,
    });
    spine.advance({ command_id: 'c-res', actor: 'commerce-core:test', serverTime: T, to: 'reserved', chainAdditions: { reservation_id: 'res-b-1' } });
    spine.advance({ command_id: 'c-pay', actor: 'commerce-core:test', serverTime: T, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'att-b-1', order_id: 'order-b-1' } });
    const provider = new MockPaymentProvider();
    const outcome = spine.onProviderDoorPaymentEvent(doorWebhook(provider, 11_500));
    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.reason).toBe('door_leg_not_expected');
    expect(outcome.alert?.name).toBe('reconciliation.alert.v1');
    expect(outcome.alert?.payload).toMatchObject({
      alert: 'door_confirmation_without_door_pending_order',
      local_state: 'payment_pending',
      local_door_leg: 'none',
    });
  });

  it('a door confirmation against a FULL_PREPAY order raises the same alert (no door leg can exist locally)', () => {
    const issued = issueQuote(deps(), {
      listingRef: 'lst-a', offerRef: 'offer-a', attributionResellerId: 'reseller-a',
      ...WORKED_BASELINE_INPUT,
    });
    if (!issued.ok) throw new Error('setup');
    const spine = new OrderSpine({
      quote: issued.quote, supplierRef: 'supplier-a', correlationId: 'corr-a-0001',
      issueCommandId: 'c-issue', actor: 'commerce-core:test', serverTime: T,
    });
    const provider = new MockPaymentProvider();
    provider.initiateCharge({ orderId: 'order-a-1', paymentAttemptId: 'door-att-x', amount: 11_500, correlationId: 'corr-a-0001', requestedAtIso: T, legType: 'door' });
    const webhook = provider.webhookDeliveryPlan()[0]!.event;
    const outcome = spine.onProviderDoorPaymentEvent(webhook);
    expect(outcome).toMatchObject({ applied: false, reason: 'door_leg_not_expected' });
    if (outcome.applied) return;
    expect(outcome.alert?.payload).toMatchObject({ payment_mode: 'FULL_PREPAY', local_door_leg: 'none' });
  });

  it('after the door leg is paid, a DIFFERENT door confirmation refuses with the alert (door no longer pending)', () => {
    const { spine, quote, provider } = confirmedOptionBSpine();
    spine.onProviderDoorPaymentEvent(doorWebhook(provider, quote.amountDueAtDelivery));
    const second = new MockPaymentProvider();
    second.initiateCharge({ orderId: 'order-b-1', paymentAttemptId: 'door-att-2', amount: 11_500, correlationId: 'corr-b-0001', requestedAtIso: T, legType: 'door' });
    const outcome = spine.onProviderDoorPaymentEvent(second.webhookDeliveryPlan()[0]!.event);
    expect(outcome).toMatchObject({ applied: false, reason: 'door_leg_not_expected' });
    if (outcome.applied) return;
    expect(outcome.alert?.payload).toMatchObject({ local_door_leg: 'paid' });
    // and the ledger held exactly the two legs — nothing merged or replaced.
    expect(spine.ledger.escrowFor('order-b-1')!.paymentLegs).toHaveLength(2);
  });
});

describe('ledger door-leg law (append-only, amounts copied)', () => {
  const CONF = {
    orderId: 'order-l-1', provider: 'sandbox-provider', paymentAttemptId: 'att-l-1',
    collectRef: 'collect-l-1', amount: 1_000, fee: 0, status: 'held',
  } as const;

  it('a door leg with NO checkout leg before it refuses closed', () => {
    const ledger = new LedgerRecords();
    const out = ledger.recordEscrowFromProvider({ ...CONF, legType: 'door', amount: 11_500 });
    expect(out).toEqual({ ok: false, reason: 'door_leg_before_checkout_leg' });
    expect(ledger.escrowFor('order-l-1')).toBeUndefined();
  });

  it('exactly one leg of each type: a SECOND different door confirmation refuses closed', () => {
    const ledger = new LedgerRecords();
    ledger.recordEscrowFromProvider({ ...CONF, legType: 'checkout' });
    ledger.recordEscrowFromProvider({ ...CONF, legType: 'door', collectRef: 'collect-d-1', amount: 11_500 });
    const second = ledger.recordEscrowFromProvider({ ...CONF, legType: 'door', collectRef: 'collect-d-2', amount: 11_500 });
    expect(second).toEqual({ ok: false, reason: 'conflicting_escrow_for_order' });
    const third = ledger.recordEscrowFromProvider({ ...CONF, legType: 'checkout', collectRef: 'collect-c-2' });
    expect(third).toEqual({ ok: false, reason: 'conflicting_escrow_for_order' });
    expect(ledger.escrowFor('order-l-1')!.paymentLegs).toHaveLength(2);
  });

  it('door-leg replay on the same collectRef returns the record untouched', () => {
    const ledger = new LedgerRecords();
    ledger.recordEscrowFromProvider({ ...CONF, legType: 'checkout' });
    const first = ledger.recordEscrowFromProvider({ ...CONF, legType: 'door', collectRef: 'collect-d-1', amount: 11_500 });
    const replay = ledger.recordEscrowFromProvider({ ...CONF, legType: 'door', collectRef: 'collect-d-1', amount: 11_500 });
    expect(replay).toMatchObject({ ok: true, replay: true });
    if (first.ok && replay.ok) {
      expect(canonicalJsonStringify(replay.record)).toBe(canonicalJsonStringify(first.record));
    }
  });
});

/* ------------------------------ CATEGORY-WIRE-1 r2 — the §6.1 tier bypass -- */

/**
 * `SELLER_TIER_RANK[ctx.sellerTier]` was an unguarded lookup into an object
 * literal. A prototype member is not `undefined`, and `someFunction < 1` is
 * `false`, so the refusal never fired: measured before the fix, `toString`,
 * `constructor`, `valueOf` and `__proto__` ALL returned eligible:true against
 * the shipped policy, while `provisional` and `garbage` refused correctly.
 *
 * §6.1's first condition — « seller tier ≥ verified » — was therefore
 * unenforceable by anyone who typed one of five words, and `sellerTier` is
 * caller-supplied on the checkout wire today. Found by a fresh-context verifier
 * reviewing an unrelated field; the defect predates that change.
 */
describe('§6.1 — the seller-tier condition cannot be walked past on the prototype chain', () => {
  const ctx = (sellerTier: string) => ({
    eligibility: { buyerRef: 'b1', state: 'allowed', buyerRefusalCount: 0, buyerRiskState: 'normal', requiredDeposit: 0 },
    sellerTier,
    category: 'shoes',
    zoneTo: 'Ouagadougou',
    buyerTotalFcfa: 10_000,
    nowIso: '2026-08-01T00:00:00.000Z',
  });

  it('an Object.prototype member is BELOW MINIMUM, exactly like any other non-tier', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
      const d = decidePayAtDoorEligibility(ctx(key));
      expect(d.eligible, `sellerTier '${key}' must NOT be eligible`).toBe(false);
      if (!d.eligible) expect(d.reason).toBe('seller_tier_below_minimum');
    }
  });

  /**
   * THE EMPTY STRING IS NOT A COSMETIC CASE — IT IS A CROSS-PACKAGE CONTRACT.
   * (Verifier finding, SELLER-TIER-WIRE-1.)
   *
   * `storefront-service`'s checkout path reads `supply.sellerTier ?? ''` and
   * hands the result here: an offer-service older than canon v3.1.0 publishes no
   * tier, so `''` is exactly what a pre-v3.1.0 producer looks like on this wire.
   * That read is fail-CLOSED only because of the `Object.hasOwn` guard above —
   * before it, `SELLER_TIER_RANK[''] === undefined` and `undefined < 1` is
   * `false`, so an untiered producer was ELIGIBLE.
   *
   * The consumer cannot pin a guard it does not own, so the pin lives here. If
   * this line ever goes green-to-red, a §6.1 gate in another package silently
   * opened.
   */
  it("THE EMPTY TIER — what a pre-canon-v3.1.0 producer looks like — refuses, and this is the pin storefront-service's `?? ''` depends on", () => {
    const d = decidePayAtDoorEligibility(ctx(''));
    expect(d.eligible, 'an absent producer tier must never be eligible').toBe(false);
    if (!d.eligible) expect(d.reason).toBe('seller_tier_below_minimum');
  });

  it('the POLICY side is guarded too — an unreadable minimum REFUSES, it does not wave everyone through', () => {
    // The first cut of this fix stopped one line short and left
    // `SELLER_TIER_RANK[policy.minSellerTier]!`. That half failed OPEN, which is
    // the worse direction: an unrecognised minimum is `undefined`,
    // `anyRank < undefined` is `false`, and the refusal is skipped — a
    // PROVISIONAL seller came back eligible. Not wire-reachable while the policy
    // is a TypeScript literal; reachable the day a ⏳ founder-tuned policy is
    // loaded from config. An unreadable rule must never be an absent rule.
    for (const minSellerTier of ['toString', '__proto__', 'constructor', 'valueOf', 'pas-un-palier']) {
      const d = decidePayAtDoorEligibility(ctx('provisional'), {
        ...PAY_AT_DOOR_POLICY_DEFAULTS,
        minSellerTier: minSellerTier as 'verified',
      });
      expect(d.eligible, `minSellerTier '${minSellerTier}' must not admit a provisional seller`).toBe(false);
      if (!d.eligible) expect(d.reason).toBe('seller_tier_below_minimum');
    }
    // …and a REAL minimum still discriminates exactly as before.
    expect(decidePayAtDoorEligibility(ctx('verified'), { ...PAY_AT_DOOR_POLICY_DEFAULTS, minSellerTier: 'verified' }).eligible).toBe(true);
    expect(decidePayAtDoorEligibility(ctx('verified'), { ...PAY_AT_DOOR_POLICY_DEFAULTS, minSellerTier: 'trusted' }).eligible).toBe(false);
  });

  it('…and the REAL tiers are untouched — this refuses impostors, not sellers', () => {
    expect(decidePayAtDoorEligibility(ctx('provisional')).eligible).toBe(false);
    expect(decidePayAtDoorEligibility(ctx('verified')).eligible).toBe(true);
    expect(decidePayAtDoorEligibility(ctx('trusted')).eligible).toBe(true);
    const garbage = decidePayAtDoorEligibility(ctx('pas-un-palier'));
    expect(garbage.eligible).toBe(false);
    if (!garbage.eligible) expect(garbage.reason).toBe('seller_tier_below_minimum');
  });
});
