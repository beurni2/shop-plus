import {
  PlatformEventSchema,
  type EscrowTxn,
  type PlatformEvent,
  type Quote,
  type SettlementObligation,
} from '@platform/contracts';
import type { OrderState } from './order-machine.js';
import type { DoorLegState } from './order-spine.js';

/**
 * RAPPROCHEMENT-1 (E3 seed) — THE RECONCILIATION PASS (Contract E3:
 * « settlement reconciliation »; Contract §6/E2 exit: every divergence gets
 * « the defined recovery state + a reconciliation alert »).
 *
 * A pure comparison over COPIED records: the journey state, the door
 * projection, the EscrowTxn, the SettlementObligations, the immutable Quote —
 * and, when the caller has them, the provider's own charge records (today the
 * certified mock's; at the Real-Money Gate the aggregator's settlement
 * report). Every divergence is NAMED as a reconciliation.alert.v1 with a
 * deterministic command_id, so repeated passes re-mint identical alerts and a
 * durable sink dedupes instead of counting. A clean world yields [].
 *
 * NOT ONE FRANC IS COMPUTED HERE (Ten Laws #1/#2): every check is an equality
 * between values other authorities wrote — the pinned waterfall's Quote, the
 * provider's webhook, the ledger's copies. Recovery is runbook/E3-saga work;
 * this pass only refuses to let a divergence stay silent.
 */

export interface ReconciliationSnapshot {
  orderId: string | undefined;
  correlationId: string;
  aggregateVersion: number;
  state: OrderState;
  doorLeg: DoorLegState;
  quote: Quote;
  supplierRef: string;
  escrow: EscrowTxn | undefined;
  obligations: readonly SettlementObligation[];
}

/** One provider-side charge record, as the provider itself reports it. */
export interface ProviderChargeRecord {
  collectRef: string;
  paymentAttemptId: string;
  legType: 'checkout' | 'door';
  amount: number;
  status: 'held' | 'captured';
}

/** Journey states in which NO money may be recorded against the order. */
const UNPAID_STATES: readonly OrderState[] = [
  'quote_issued',
  'reserved',
  'payment_pending',
  'payment_failed',
  'cancelled',
];

export function reconcileOrder(
  snapshot: ReconciliationSnapshot,
  args: { serverTime: string; providerRecords?: readonly ProviderChargeRecord[] },
): PlatformEvent[] {
  const alerts: PlatformEvent[] = [];
  const anchor = snapshot.orderId ?? snapshot.correlationId;
  const mint = (scenario: string, discriminator: string, extra: Record<string, unknown>): void => {
    alerts.push(
      PlatformEventSchema.parse({
        name: 'reconciliation.alert.v1',
        envelope: {
          command_id: `recon-pass-${scenario}-${discriminator}`,
          correlation_id: snapshot.correlationId,
          aggregateVersion: snapshot.aggregateVersion,
          actor: 'commerce-core:ops',
          serverTime: args.serverTime,
          version: '1',
        },
        payload: {
          alert: scenario,
          ...(snapshot.orderId !== undefined ? { order_id: snapshot.orderId } : {}),
          state: snapshot.state,
          ...extra,
        },
      }),
    );
  };

  const legs = snapshot.escrow?.paymentLegs ?? [];

  // SP-I13 / the CI gate's runtime twin: no confirmed order without its
  // funded checkout leg, franc-exact against the immutable Quote.
  const checkoutFunded = legs.some(
    (leg) =>
      leg.legType === 'checkout' &&
      (leg.status === 'held' || leg.status === 'captured') &&
      leg.amount === snapshot.quote.amountPaidAtCheckout,
  );
  if (snapshot.state === 'confirmed' && !checkoutFunded) {
    mint('confirmed_without_funded_checkout_leg', anchor, {
      expected_amount: snapshot.quote.amountPaidAtCheckout,
    });
  }

  // The inverse hole: money recorded while the journey never reached paid.
  if (snapshot.escrow !== undefined && UNPAID_STATES.includes(snapshot.state)) {
    mint('escrow_without_paid_order', anchor, {
      collect_refs: legs.map((leg) => leg.collectRef),
    });
  }

  // WO-2.5's projection and the door leg record must tell one story,
  // franc-exact against amountDueAtDelivery in the paid direction.
  const doorLegRecord = legs.find((leg) => leg.legType === 'door');
  if (
    snapshot.doorLeg === 'paid' &&
    (doorLegRecord === undefined || doorLegRecord.amount !== snapshot.quote.amountDueAtDelivery)
  ) {
    mint('door_projection_diverges_from_escrow', anchor, {
      direction: 'projection_paid_record_missing_or_diverging',
      expected_amount: snapshot.quote.amountDueAtDelivery,
    });
  }
  if (doorLegRecord !== undefined && snapshot.doorLeg !== 'paid') {
    mint('door_projection_diverges_from_escrow', anchor, {
      direction: 'record_present_projection_not_paid',
      collect_ref: doorLegRecord.collectRef,
    });
  }

  // §5.6: obligations exist only for a confirmed order (refunded keeps its
  // history — the E3 refund saga owns reversal), exactly two, each a faithful
  // COPY of the Quote's nets to a non-empty payee (audit G1's law).
  if (snapshot.obligations.length > 0) {
    if (snapshot.state !== 'confirmed' && snapshot.state !== 'refunded') {
      mint('obligations_without_confirmed_order', anchor, {
        obligation_parties: snapshot.obligations.map((o) => o.party),
      });
    }
    const supplierOk = snapshot.obligations.some(
      (o) => /^supplier:.+/.test(o.party) && o.amount === snapshot.quote.sellerNet,
    );
    const resellerOk = snapshot.obligations.some(
      (o) =>
        o.party === `reseller:${snapshot.quote.attributionResellerId}` &&
        o.amount === snapshot.quote.resellerNet,
    );
    if (snapshot.obligations.length !== 2 || !supplierOk || !resellerOk) {
      mint('obligation_diverges_from_quote', anchor, {
        expected_seller_net: snapshot.quote.sellerNet,
        expected_reseller_net: snapshot.quote.resellerNet,
        obligations: snapshot.obligations.map((o) => ({ party: o.party, amount: o.amount })),
      });
    }
  }

  // Provider records vs the ledger — matched on collectRef, the id both
  // sides copied from the same charge. Only run when the caller HAS the
  // provider's records: absence of the report is not a clean bill.
  if (args.providerRecords !== undefined) {
    for (const record of args.providerRecords) {
      const match = legs.find((leg) => leg.collectRef === record.collectRef);
      if (match === undefined) {
        mint('provider_charge_unmatched_in_ledger', record.collectRef, {
          collect_ref: record.collectRef,
          provider_attempt_id: record.paymentAttemptId,
          provider_amount: record.amount,
          leg: record.legType,
        });
        continue;
      }
      if (match.amount !== record.amount) {
        mint('provider_amount_diverges_from_ledger', record.collectRef, {
          collect_ref: record.collectRef,
          provider_amount: record.amount,
          ledger_amount: match.amount,
        });
      }
    }
    for (const leg of legs) {
      if (!args.providerRecords.some((record) => record.collectRef === leg.collectRef)) {
        mint('ledger_leg_unmatched_at_provider', leg.collectRef, {
          collect_ref: leg.collectRef,
          ledger_amount: leg.amount,
          leg: leg.legType,
        });
      }
    }
  }

  return alerts;
}
