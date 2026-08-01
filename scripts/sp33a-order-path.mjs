#!/usr/bin/env node
// SP3.3a DoD — THE NEW ORDER PATH, DRIVEN END TO END THROUGH ITS OWN CODE.
//
// This is the `e1-happy-path.mjs` idiom applied to the payment legs: it calls
// the EXACT functions `worker/order-do.ts` calls — `decideCreateOrder`,
// `requiredLegsFor`, `rebuildOrderSpine`, `applyOrderInput`, `toBuyerOrderView`,
// `sandboxPaymentProvider` — with ids and a clock injected, so the emitted
// journey is byte-reproducible and the CI gate beside it reads the REAL path's
// output rather than a fixture somebody typed.
//
// WHAT IT PROVES, and exits 1 if any of it stops being true:
//   1. the legs come FROM THE MODE (FULL_PREPAY and Option B), to the franc;
//   2. A CONFIRM WITHOUT A FUNDED LEG IS REFUSED — SP-I13 at runtime, on the new
//      path, in both modes;
//   3. an amount that is not the leg is refused and records nothing;
//   4. after a franc-exact provider webhook the order confirms with its funded
//      leg, and a redelivery is absorbed;
//   5. the committed gate fixtures ARE this run's output (no stale fixture).
//
// `--write-fixture` regenerates the two committed journeys from this exact run.
import { readFileSync, writeFileSync } from 'node:fs';
import { canonicalJsonStringify } from '@platform/contracts';
import {
  MockPaymentProvider,
  PAY_AT_DOOR_POLICY_DEFAULTS,
  WORKED_BASELINE_INPUT,
  decideReservation,
  issueQuote,
} from '@shop-plus/commerce-core';
import {
  applyOrderInput,
  checkoutLegOf,
  decideCreateOrder,
  orderIdForQuote,
  rebuildOrderSpine,
  requiredLegsFor,
  toBuyerOrderView,
} from '../services/storefront-service/dist/order-core.js';
import { sandboxPaymentProvider } from '../services/storefront-service/dist/payment-port.js';

const T = '2026-07-30T12:00:00.000Z';
const NOW = new Date(T);
const FLAGS = { version: 'sp33a-sandbox', flags: {}, kills: [], killedCategories: [] };
const LIVE_FIXTURE = 'gates/fixtures/order-journey.sp33a-live.json';
const SHORT_LEG_FIXTURE = 'gates/fixtures/negative/order-journey.sp33a-short-leg.json';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

/** The §6.1 gate allowlists no zone by default; Option B needs one named. */
const DOOR_CONTEXT = {
  eligibility: {
    buyerRef: 'buyer-sp33a',
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
    version: `${PAY_AT_DOOR_POLICY_DEFAULTS.version}+sp33a-sandbox-zone`,
    networkReliableZones: ['ouaga-centre'],
  },
};

function issue(quoteId, mode) {
  const outcome = issueQuote(
    { flags: FLAGS, now: () => NOW, newId: () => quoteId },
    {
      listingRef: 'lst-sp33a',
      offerRef: 'ofr-sp33a',
      attributionResellerId: 'reseller-sp33a',
      ...WORKED_BASELINE_INPUT,
      paymentMode: mode,
      nowIso: T,
      ...(mode === 'FULL_PREPAY' ? {} : { payAtDoor: DOOR_CONTEXT }),
    },
  );
  if (!outcome.ok) {
    console.error(`quote refused for ${mode}: ${JSON.stringify(outcome)}`);
    process.exit(1);
  }
  return outcome;
}

/**
 * ONE RUN OF THE REAL ORDER PATH: the vault reserves, the order core decides,
 * the DO's input journal is built and replayed, the seam charges, the certified
 * mock's webhook is consumed, and the order confirms on its funded leg.
 */
async function runMode(mode, quoteId) {
  console.log(`\n=== SP3.3a — ${mode} ===`);
  const { quote, canonicalBytes } = issue(quoteId, mode);
  const orderId = orderIdForQuote(quote.id);
  const correlationId = `corr-${orderId}`;

  // 1. THE HOLD — the vault's own reservation core, then the receipt the
  //    composition root mirrors into the order's object.
  const reserved = decideReservation(
    { status: 'none' },
    {
      kind: 'reserve',
      command_id: 'cmd-reserve-sp33a',
      quoteId: quote.id,
      holderRef: 'holder-sp33a',
      nowIso: T,
      newReservationId: `res-${quoteId}`,
    },
  );
  if (!reserved.ok) {
    console.error('reserve refused in setup');
    process.exit(1);
  }
  const receipt = {
    quoteId: quote.id,
    reservationId: reserved.reservationId,
    holderRef: reserved.state.holderRef,
    expiresAt: reserved.state.expiresAt,
  };

  // 2. THE DECISION — refuses for a stranger, decides for the holder.
  const stranger = decideCreateOrder({
    quoteBytes: canonicalBytes,
    quoteId: quote.id,
    holderRef: 'holder-quelquun-dautre',
    receipt,
    now: NOW,
  });
  check(
    `${mode}: a caller who does not hold the quote is refused`,
    !stranger.ok && stranger.reason === 'reservation_held_by_another',
    stranger.ok ? 'ACCEPTED — the hold was not proven' : stranger.reason,
  );

  const decision = decideCreateOrder({
    quoteBytes: canonicalBytes,
    quoteId: quote.id,
    holderRef: 'holder-sp33a',
    receipt,
    now: NOW,
  });
  if (!decision.ok) {
    console.error(`order refused: ${decision.reason}`);
    process.exit(1);
  }

  // 3. THE LEGS COME FROM THE MODE, and §5.5 to the franc.
  const legs = requiredLegsFor(quote);
  if (!legs.ok) {
    console.error(`legs refused: ${legs.reason}`);
    process.exit(1);
  }
  const leg = checkoutLegOf(legs.legs);
  if (mode === 'FULL_PREPAY') {
    check(
      'FULL_PREPAY: one checkout leg of buyerTotal, nothing due at delivery',
      legs.legs.length === 1 && leg.amount === quote.buyerTotal && quote.amountDueAtDelivery === 0,
      `leg=${leg.amount} buyerTotal=${quote.buyerTotal}`,
    );
  } else {
    const door = legs.legs.find((l) => l.legType === 'door');
    check(
      'Option B: checkout leg = D, door leg = productSubtotal, DUE at delivery',
      legs.legs.length === 2 &&
        leg.amount === quote.deliveryFee &&
        door.amount === quote.productSubtotal &&
        door.due === 'at_delivery',
      `checkout=${leg.amount} (D=${quote.deliveryFee}) door=${door.amount} (subtotal=${quote.productSubtotal})`,
    );
  }
  check(
    `${mode}: the charged leg IS the quote's amountPaidAtCheckout`,
    leg.amount === quote.amountPaidAtCheckout,
    `${leg.amount} == ${quote.amountPaidAtCheckout}`,
  );

  // 4. THE JOURNAL, exactly as OrderDO writes it, replayed through the vault.
  const attemptId = `att-${quoteId}`;
  const origin = {
    orderId,
    quoteId: quote.id,
    correlationId,
    issueCommandId: 'ord-issue-sp33a',
    actor: 'storefront-service:checkout',
    createdAt: T,
    supplierRef: '',
  };
  let log = [
    {
      kind: 'advance',
      to: 'reserved',
      command_id: 'ord-reserved-sp33a',
      actor: origin.actor,
      serverTime: T,
      chainAdditions: { reservation_id: receipt.reservationId },
    },
    {
      kind: 'advance',
      to: 'payment_pending',
      command_id: 'ord-payinit-sp33a',
      actor: origin.actor,
      serverTime: T,
      chainAdditions: { order_id: orderId, payment_attempt_id: attemptId },
    },
  ];

  // 5. THE SEAM — one charge, through the certified sandbox provider.
  const charge = await sandboxPaymentProvider({}, 0).initiateCharge({
    orderId,
    paymentAttemptId: attemptId,
    amount: leg.amount,
    correlationId,
    requestedAtIso: T,
    legType: 'checkout',
  });
  check(`${mode}: the charge was initiated once and accepted`, charge.accepted === true);

  // 6. THE GATE'S OWN LAW, ON THE NEW PATH: NO CONFIRMED ORDER WITHOUT FUNDED
  //    LEGS. Before any provider event, a confirmation must be impossible.
  const beforePayment = rebuildOrderSpine(quote, origin, log);
  const prematureConfirm = applyOrderInput(beforePayment, {
    kind: 'confirm',
    command_id: 'ord-confirm-premature',
    actor: origin.actor,
    serverTime: T,
  });
  check(
    `${mode}: a confirm with NO funded leg is refused`,
    prematureConfirm.applied === false,
    prematureConfirm.applied ? 'CONFIRMED WITHOUT MONEY' : prematureConfirm.reason,
  );
  check(
    `${mode}: and the order is still not confirmed`,
    beforePayment.journey.state !== 'confirmed',
    beforePayment.journey.state,
  );

  // 7. AN AMOUNT THAT IS NOT THE LEG RECORDS NOTHING.
  const shortProvider = new MockPaymentProvider({});
  shortProvider.initiateCharge({
    orderId,
    paymentAttemptId: `${attemptId}-short`,
    amount: leg.amount - 1,
    correlationId,
    requestedAtIso: T,
  });
  const shortSpine = rebuildOrderSpine(quote, origin, log);
  const shortOutcome = applyOrderInput(shortSpine, {
    kind: 'provider',
    event: shortProvider.webhookDeliveryPlan()[0].event,
  });
  check(
    `${mode}: a webhook one franc short is refused, and no escrow is recorded`,
    shortOutcome.applied === false &&
      shortOutcome.reason === 'amount_mismatch' &&
      shortSpine.ledger.escrowFor(orderId) === undefined,
    shortOutcome.applied ? 'APPLIED' : shortOutcome.reason,
  );

  // 8. THE PROVIDER'S OWN WEBHOOK — the certified mock builds the bytes.
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({
    orderId,
    paymentAttemptId: attemptId,
    amount: leg.amount,
    correlationId,
    requestedAtIso: T,
  });
  const event = provider.webhookDeliveryPlan()[0].event;
  const spine = rebuildOrderSpine(quote, origin, log);
  const paid = applyOrderInput(spine, { kind: 'provider', event });
  check(`${mode}: the franc-exact webhook pays the order`, paid.applied === true && paid.duplicate === false);
  log = [...log, { kind: 'provider', event }];

  const confirmInput = {
    kind: 'confirm',
    command_id: `ord-confirm-${event.envelope.command_id}`,
    actor: origin.actor,
    serverTime: event.envelope.serverTime,
  };
  const confirmed = applyOrderInput(spine, confirmInput);
  check(`${mode}: the order confirms on its FUNDED leg`, confirmed.applied === true && spine.journey.state === 'confirmed');
  log = [...log, confirmInput];

  // A DRIVER THAT CRASHES IS A DRIVER THAT REPORTS NOTHING. If the payment or the
  // confirmation did not land, the checks above have already said so by name;
  // reading an escrow that does not exist would replace those names with a stack
  // trace, so the run stops here and exits on its recorded failures.
  if (!paid.applied || !confirmed.applied) {
    check(`${mode}: the run cannot continue without a paid, confirmed order`, false);
    return { quote, order: { id: orderId, status: spine.journey.state }, escrow: null, events: spine.journey.events };
  }

  // 9. A REDELIVERY IS ABSORBED — on a spine REBUILT from the log, which is the
  //    shape a restarted Durable Object produces.
  const rebuilt = rebuildOrderSpine(quote, origin, log);
  const redelivery = applyOrderInput(rebuilt, { kind: 'provider', event });
  const legsAfter = rebuilt.ledger.escrowFor(orderId).paymentLegs;
  check(
    `${mode}: a redelivered webhook is absorbed — one leg, one payment`,
    redelivery.applied === true && redelivery.duplicate === true && legsAfter.length === 1,
    `legs=${legsAfter.length}`,
  );

  const escrow = spine.ledger.escrowFor(orderId);
  const view = toBuyerOrderView({ orderId, state: spine.journey.state, quote, doorLeg: spine.doorLegState });
  console.log(
    `  buyer view: ${JSON.stringify(view)}  (keys: ${Object.keys(view).sort().join(',')})`,
  );
  console.log(
    `  reconciliation: paid ${quote.amountPaidAtCheckout} + due ${quote.amountDueAtDelivery} = buyerTotal ${quote.buyerTotal}` +
      ` · escrow leg ${escrow.paymentLegs[0].legType} ${escrow.paymentLegs[0].amount} (${escrow.paymentLegs[0].status})`,
  );
  check(
    `${mode}: the buyer view carries FIVE fields and no economics`,
    Object.keys(view).sort().join(',') === 'amountDueAtDelivery,amountPaidAtCheckout,doorLeg,orderId,state',
  );
  // SP4.2a — the door leg reads what the MODE owes, before anything is paid at
  // the door: nothing for FULL_PREPAY, `due` for Option B.
  check(
    `${mode}: the door leg starts at ${mode === 'FULL_PREPAY' ? 'none' : 'due'}`,
    view.doorLeg === (mode === 'FULL_PREPAY' ? 'none' : 'due'),
  );

  /* ═══ SP4.2a — THE DOOR LEG, THROUGH THE SAME CODE THE DO REPLAYS ═══
   *
   * §6.3: « the buyer enters the drop code last, AFTER any door payment is
   * provider-confirmed. » §5.5: the product leg is « paid by MoMo at the door
   * BEFORE custody transfer; not COD ». This runs `applyOrderInput` with the
   * new `door_provider` kind — the exact call `worker/order-do.ts` makes — so
   * the gate reads the real path's answer and not a fixture.
   */
  const doorProvider = new MockPaymentProvider({});
  doorProvider.initiateCharge({
    orderId,
    paymentAttemptId: `att-door-${orderId}`,
    amount: quote.amountDueAtDelivery,
    correlationId: spine.journey.correlationId,
    requestedAtIso: T,
    legType: 'door',
  });
  const doorEvent = doorProvider
    .webhookDeliveryPlan()
    .find((d) => d.event.name === 'payment.door_leg_confirmed.v1')?.event;
  check(`${mode}: the certified mock emits a door webhook to drive this with`, doorEvent !== undefined);

  // A DOOR CONFIRMATION ONE FRANC OFF THE QUOTE IS REFUSED, and records nothing.
  const doorShortProvider = new MockPaymentProvider({});
  doorShortProvider.initiateCharge({
    orderId,
    paymentAttemptId: `att-door-short-${orderId}`,
    amount: Math.max(0, quote.amountDueAtDelivery - 1),
    correlationId: spine.journey.correlationId,
    requestedAtIso: T,
    legType: 'door',
  });
  const doorShortEvent = doorShortProvider
    .webhookDeliveryPlan()
    .find((d) => d.event.name === 'payment.door_leg_confirmed.v1')?.event;
  const doorShortOutcome = applyOrderInput(spine, { kind: 'door_provider', event: doorShortEvent });
  check(`${mode}: a door amount off by one franc is REFUSED`, doorShortOutcome.applied === false);
  check(`${mode}: …and the door leg did not move`, spine.doorLegState === view.doorLeg);

  const doorOutcome = applyOrderInput(spine, { kind: 'door_provider', event: doorEvent });
  if (mode === 'FULL_PREPAY') {
    // NOTHING IS OWED AT THE DOOR, so provider truth asserting otherwise must
    // not stick — this is the whole defence for every mode-A order today.
    check('FULL_PREPAY: a door confirmation is REFUSED — nothing is due there', doorOutcome.applied === false);
    check('FULL_PREPAY: …and the door leg is still none', spine.doorLegState === 'none');
  } else {
    check('Option B: the door leg is PAID only after the provider says so', doorOutcome.applied === true);
    check('Option B: …and the state moved due → paid', spine.doorLegState === 'paid');
    // A REDELIVERY IS ABSORBED — one payment, one leg, whatever the provider retries.
    const replay = applyOrderInput(spine, { kind: 'door_provider', event: doorEvent });
    check('Option B: a redelivered door webhook is ABSORBED', replay.applied === true && replay.duplicate === true);
    const legs = spine.ledger.escrowFor(orderId).paymentLegs;
    const doorLegs = legs.filter((l) => l.legType === 'door');
    check('Option B: exactly ONE door leg is recorded, never two', doorLegs.length === 1);
    check(
      `Option B: the recorded door leg is the Quote's amountDueAtDelivery (${quote.amountDueAtDelivery})`,
      doorLegs[0]?.amount === quote.amountDueAtDelivery,
    );
    console.log(
      `  door leg: ${spine.doorLegState} · recorded ${doorLegs[0]?.amount} = amountDueAtDelivery ${quote.amountDueAtDelivery}`,
    );
  }

  return {
    quote,
    order: { id: orderId, status: spine.journey.state },
    escrow,
    events: spine.journey.events,
  };
}

const fullPrepay = await runMode('FULL_PREPAY', 'quote-sp33a-a');
const optionB = await runMode('DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', 'quote-sp33a-b');

// The LIVE journey the existing `no-confirmed-order-without-funded-legs` gate
// reads. Option B is the one carried, because it is the mode whose per-mode
// split the gate is strictest about (`amountPaidAtCheckout == D`).
const liveJourney = optionB;
// THE NEGATIVE, derived from the SAME run: a confirmed order whose funded leg is
// one franc short of its mode's `amountPaidAtCheckout`. The path above cannot
// produce it — the vault refuses — so it is written by hand FROM the live run,
// which is exactly what a negative fixture is for.
const shortLegJourney = {
  ...fullPrepay,
  escrow: {
    ...fullPrepay.escrow,
    paymentLegs: fullPrepay.escrow.paymentLegs.map((leg) => ({ ...leg, amount: leg.amount - 1 })),
  },
};

if (process.argv.includes('--write-fixture')) {
  writeFileSync(LIVE_FIXTURE, `${canonicalJsonStringify(liveJourney)}\n`);
  writeFileSync(SHORT_LEG_FIXTURE, `${canonicalJsonStringify(shortLegJourney)}\n`);
  console.log(`\nfixtures written: ${LIVE_FIXTURE} · ${SHORT_LEG_FIXTURE}`);
} else {
  // THE FIXTURES ARE THIS RUN'S OUTPUT, OR THE GATE IS READING A LIE. A committed
  // fixture that has drifted from the code it claims to describe is worse than no
  // fixture: it goes on passing after the path it was cut from has changed.
  for (const [path, journey] of [
    [LIVE_FIXTURE, liveJourney],
    [SHORT_LEG_FIXTURE, shortLegJourney],
  ]) {
    let committed;
    try {
      committed = readFileSync(path, 'utf8').trim();
    } catch {
      committed = undefined;
    }
    const same = committed === canonicalJsonStringify(journey);
    check(
      `committed fixture matches this run: ${path}`,
      same,
      same ? 'byte-identical' : committed === undefined ? 'MISSING — run with --write-fixture' : 'DRIFTED',
    );
  }
}

console.log('');
if (failures > 0) {
  console.error(`SP3.3a ORDER PATH: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('SP3.3a ORDER PATH: every check passed');
