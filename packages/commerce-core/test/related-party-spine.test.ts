import { describe, expect, it } from 'vitest';
import { PlatformEventSchema, type Quote } from '@platform/contracts';
import { LedgerRecords } from '../src/ledger.js';
import { OrderSpine, RELATED_PARTY_HOLD } from '../src/order-spine.js';
import { decideRelatedParty } from '../src/related-party.js';
import { issueQuote, type QuoteIssuanceDeps } from '../src/quote-issuance.js';
import { MockPaymentProvider } from '../src/mocks/payment-provider-mock.js';
import { WORKED_BASELINE_INPUT } from '../src/fixtures.js';

/**
 * RELATED-PARTY-1 — §6.5 on the LEDGER and the SPINE, pure and replayable:
 *   · a hold goes on ONE party's line, moves no franc, is idempotent; release
 *     takes every hold under the prefix off and the line is Eligible again;
 *   · the decision is recorded once, after the validated signal, never before;
 *     a non-clear decision holds HER line only; the appeal and the ruling
 *     follow §6.5's order and refuse by name out of it.
 */

const SERVER_TIME = '2026-09-17T10:00:00.000Z';
const flags = { version: 'rp-test', flags: {}, kills: [], killedCategories: [] };
let quoteSeq = 0;
const deps = (): QuoteIssuanceDeps => ({
  flags,
  now: () => new Date(SERVER_TIME),
  newId: () => `quote-rp-${String((quoteSeq += 1)).padStart(4, '0')}`,
});

function quoteDeTest(): Quote {
  const issued = issueQuote(deps(), {
    listingRef: 'lst-rp',
    offerRef: 'offer-rp',
    attributionResellerId: 'rs-awa',
    ...WORKED_BASELINE_INPUT,
    paymentMode: 'FULL_PREPAY',
    nowIso: SERVER_TIME,
  });
  if (!issued.ok) throw new Error(`quote refused: ${JSON.stringify(issued)}`);
  return issued.quote;
}

const validated = (orderId: string, correlationId: string) =>
  PlatformEventSchema.parse({
    name: 'delivery.validated.v1',
    envelope: {
      command_id: `elig-${orderId}`, correlation_id: correlationId, aggregateVersion: 3,
      actor: 'custody-service:e1', serverTime: SERVER_TIME, version: '1',
    },
    payload: { order_id: orderId, task_id: 't', validation_id: 'v', result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-1' },
  });

/** A REAL confirmed order: reserved → payment pending → the provider's webhook → confirmed. */
function commandeConfirmee(): { spine: OrderSpine; orderId: string; quote: Quote } {
  const quote = quoteDeTest();
  const orderId = `ord-${quote.id}`;
  const spine = new OrderSpine({ quote, supplierRef: 'supplier-1', correlationId: 'corr-1', issueCommandId: 'cmd-issue', actor: 'commerce-core:test', serverTime: SERVER_TIME });
  spine.advance({ command_id: 'c-res', actor: 'commerce-core:test', serverTime: SERVER_TIME, to: 'reserved', chainAdditions: { reservation_id: 'res-1' } });
  spine.advance({ command_id: 'c-pay', actor: 'commerce-core:test', serverTime: SERVER_TIME, to: 'payment_pending', chainAdditions: { payment_attempt_id: 'att-1', order_id: orderId } });
  const provider = new MockPaymentProvider();
  provider.initiateCharge({ orderId, paymentAttemptId: 'att-1', amount: quote.amountPaidAtCheckout, correlationId: 'corr-1', requestedAtIso: SERVER_TIME, legType: 'checkout' });
  const paid = spine.onProviderPaymentEvent(provider.webhookDeliveryPlan()[0]!.event);
  if (!paid.applied) throw new Error('setup: checkout webhook refused');
  const confirmed = spine.confirmOrder({ command_id: 'c-confirm', actor: 'commerce-core:test', serverTime: SERVER_TIME });
  if (!confirmed.applied) throw new Error('setup: confirm refused');
  return { spine, orderId, quote };
}

/** A confirmed, DELIVERED order: obligations exist, nothing held. */
function commandeLivree(): { spine: OrderSpine; orderId: string; quote: Quote } {
  const c = commandeConfirmee();
  const elig = c.spine.onEligibilityEvent(validated(c.orderId, 'corr-1'));
  if (!elig.applied) throw new Error(`eligibility refused: ${JSON.stringify(elig)}`);
  return c;
}

const autoVoid = (orderId: string) =>
  decideRelatedParty({ orderId, signals: { identity: ['phone'], circumstantial: [] }, nowIso: SERVER_TIME });
const clair = (orderId: string) =>
  decideRelatedParty({ orderId, signals: { identity: [], circumstantial: [] }, nowIso: SERVER_TIME });
const revue = (orderId: string) =>
  decideRelatedParty({ orderId, signals: { identity: [], circumstantial: ['household'] }, nowIso: SERVER_TIME });

describe('LedgerRecords — a hold on one party\'s obligation', () => {
  it('holds ONE line, moves no franc, is idempotent on the reason; release under the prefix makes it Eligible again', () => {
    const { spine, orderId, quote } = commandeLivree();
    const ledger: LedgerRecords = spine.ledger;
    const avant = ledger.obligationsFor(orderId).map((o) => o.amount);
    expect(ledger.holdObligation(orderId, `reseller:${quote.attributionResellerId}`, 'related_party:auto_void')).toBe(true);
    expect(ledger.holdObligation(orderId, `reseller:${quote.attributionResellerId}`, 'related_party:auto_void')).toBe(true);
    const [fournisseur, elle] = ledger.obligationsFor(orderId);
    expect(elle?.state).toBe('Held');
    expect(elle?.holds).toEqual(['related_party:auto_void']);
    expect(fournisseur?.state).toBe('Eligible');
    expect(fournisseur?.holds).toEqual([]);
    expect(ledger.obligationsFor(orderId).map((o) => o.amount), 'no franc moved').toEqual(avant);

    expect(ledger.releaseHold(orderId, `reseller:${quote.attributionResellerId}`, 'related_party:')).toBe(true);
    const apres = ledger.obligationsFor(orderId)[1];
    expect(apres?.state).toBe('Eligible');
    expect(apres?.holds).toEqual([]);
  });

  it('an unknown order or party holds nothing (false), and a hold under another prefix keeps the line Held on release', () => {
    const { spine, orderId, quote } = commandeLivree();
    const party = `reseller:${quote.attributionResellerId}`;
    expect(spine.ledger.holdObligation('ord-nope', party, 'x')).toBe(false);
    expect(spine.ledger.holdObligation(orderId, 'reseller:someone-else', 'x')).toBe(false);
    spine.ledger.holdObligation(orderId, party, 'related_party:auto_void');
    spine.ledger.holdObligation(orderId, party, 'other:reason');
    spine.ledger.releaseHold(orderId, party, 'related_party:');
    const elle = spine.ledger.obligationsFor(orderId)[1];
    expect(elle?.state).toBe('Held');
    expect(elle?.holds).toEqual(['other:reason']);
  });
});

describe('OrderSpine — §6.5 decision · appeal · ruling', () => {
  it('BEFORE the validated signal there is no commission to judge: the decision is refused by name (out_of_order)', () => {
    const { spine, orderId } = commandeConfirmee();
    expect(spine.onRelatedPartyDecision(autoVoid(orderId))).toEqual({ applied: false, reason: 'out_of_order' });
    expect(spine.relatedPartyView()).toBeUndefined();
  });

  it('a decision for ANOTHER order is refused (order_mismatch)', () => {
    const { spine } = commandeLivree();
    expect(spine.onRelatedPartyDecision(autoVoid('ord-other'))).toEqual({ applied: false, reason: 'order_mismatch' });
  });

  it('auto_void: recorded once, HER line held under related_party:auto_void, the supplier\'s untouched; a second decision is a duplicate that changes nothing', () => {
    const { spine, orderId, quote } = commandeLivree();
    expect(spine.onRelatedPartyDecision(autoVoid(orderId))).toEqual({ applied: true, duplicate: false });
    expect(spine.relatedPartyView()?.decision.outcome).toBe('auto_void');
    const [fournisseur, elle] = spine.ledger.obligationsFor(orderId);
    expect(elle?.party).toBe(`reseller:${quote.attributionResellerId}`);
    expect(elle?.state).toBe('Held');
    expect(elle?.holds).toEqual([`${RELATED_PARTY_HOLD}auto_void`]);
    expect(fournisseur?.state).toBe('Eligible');
    expect(spine.onRelatedPartyDecision(clair(orderId))).toEqual({ applied: true, duplicate: true });
    expect(spine.relatedPartyView()?.decision.outcome, 'the first decision stands').toBe('auto_void');
  });

  it('held_for_review (a circumstantial signal): held too — « during investigation commission is held » — under its own name', () => {
    const { spine, orderId } = commandeLivree();
    spine.onRelatedPartyDecision(revue(orderId));
    const elle = spine.ledger.obligationsFor(orderId)[1];
    expect(elle?.state).toBe('Held');
    expect(elle?.holds).toEqual([`${RELATED_PARTY_HOLD}held_for_review`]);
  });

  it('clear: recorded, nothing held; then nothing to contest and nothing to resolve', () => {
    const { spine, orderId } = commandeLivree();
    expect(spine.onRelatedPartyDecision(clair(orderId))).toEqual({ applied: true, duplicate: false });
    expect(spine.ledger.obligationsFor(orderId).map((o) => o.state)).toEqual(['Eligible', 'Eligible']);
    expect(spine.onRelatedPartyAppeal({ at: SERVER_TIME, texte: 'Ma voisine.' })).toEqual({ applied: false, reason: 'nothing_to_contest' });
    expect(spine.onRelatedPartyResolution({ at: SERVER_TIME, outcome: 'clear' })).toEqual({ applied: false, reason: 'nothing_to_resolve' });
  });

  it('the appeal: once, only while unresolved; her first words stand (already_contested); after the ruling, already_resolved', () => {
    const { spine, orderId } = commandeLivree();
    expect(spine.onRelatedPartyAppeal({ at: SERVER_TIME, texte: 'Avant toute décision.' })).toEqual({ applied: false, reason: 'nothing_to_contest' });
    spine.onRelatedPartyDecision(autoVoid(orderId));
    expect(spine.onRelatedPartyAppeal({ at: SERVER_TIME, texte: 'Ma cliente a pris mon téléphone.' })).toEqual({ applied: true, duplicate: false });
    expect(spine.onRelatedPartyAppeal({ at: SERVER_TIME, texte: 'Encore.' })).toEqual({ applied: false, reason: 'already_contested' });
    expect(spine.relatedPartyView()?.appeal?.texte).toBe('Ma cliente a pris mon téléphone.');
    spine.onRelatedPartyResolution({ at: SERVER_TIME, outcome: 'clear' });
    const { spine: autre, orderId: autreId } = commandeLivree();
    autre.onRelatedPartyDecision(autoVoid(autreId));
    autre.onRelatedPartyResolution({ at: SERVER_TIME, outcome: 'violation' });
    expect(autre.onRelatedPartyAppeal({ at: SERVER_TIME, texte: 'Trop tard.' })).toEqual({ applied: false, reason: 'already_resolved' });
  });

  it('the ruling — clear: the hold comes off, the line is Eligible, no franc moved; the same ruling twice is once; a different one is refused (already_resolved)', () => {
    const { spine, orderId } = commandeLivree();
    spine.onRelatedPartyDecision(autoVoid(orderId));
    const avant = spine.ledger.obligationsFor(orderId).map((o) => o.amount);
    expect(spine.onRelatedPartyResolution({ at: SERVER_TIME, outcome: 'clear' })).toEqual({ applied: true, duplicate: false });
    const elle = spine.ledger.obligationsFor(orderId)[1];
    expect(elle?.state).toBe('Eligible');
    expect(elle?.holds).toEqual([]);
    expect(spine.ledger.obligationsFor(orderId).map((o) => o.amount)).toEqual(avant);
    expect(spine.onRelatedPartyResolution({ at: SERVER_TIME, outcome: 'clear' })).toEqual({ applied: true, duplicate: true });
    expect(spine.onRelatedPartyResolution({ at: SERVER_TIME, outcome: 'violation' })).toEqual({ applied: false, reason: 'already_resolved' });
    expect(spine.ledger.obligationsFor(orderId)[1]?.state, 'a refused ruling changes nothing').toBe('Eligible');
  });

  it('the ruling — violation: the line stays Held and names the violation; no franc moved on EITHER line (« returned to seller » is the founder\'s §7 call)', () => {
    const { spine, orderId } = commandeLivree();
    spine.onRelatedPartyDecision(autoVoid(orderId));
    const avant = spine.ledger.obligationsFor(orderId).map((o) => o.amount);
    expect(spine.onRelatedPartyResolution({ at: SERVER_TIME, outcome: 'violation' })).toEqual({ applied: true, duplicate: false });
    const [fournisseur, elle] = spine.ledger.obligationsFor(orderId);
    expect(elle?.state).toBe('Held');
    expect(elle?.holds).toEqual([`${RELATED_PARTY_HOLD}auto_void`, `${RELATED_PARTY_HOLD}violation`]);
    expect(fournisseur?.state).toBe('Eligible');
    expect(spine.ledger.obligationsFor(orderId).map((o) => o.amount)).toEqual(avant);
  });
});
