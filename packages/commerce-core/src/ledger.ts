import {
  EscrowTxnSchema,
  SettlementObligationSchema,
  type EscrowTxn,
  type Quote,
  type SettlementObligation,
} from '@platform/contracts';

/**
 * LEDGER RECORDS (WO-1.1 d; Contract §2.3 steps 13–15). RECORDS ONLY: this
 * module appends canonical EscrowTxn and SettlementObligation records. It
 * holds nothing, sums nothing, executes no payout, and COPIES every
 * amount from provider truth or the immutable Quote — it never recomputes.
 * The settlement-copies-never-recomputes gate scans this file: importing the
 * waterfall or fee constants here is a CI failure by name.
 */

export interface ProviderLegConfirmation {
  orderId: string;
  provider: string;
  paymentAttemptId: string;
  legType: 'checkout' | 'door';
  collectRef: string;
  /** Provider-confirmed amount — provider truth, copied as-is. */
  amount: number;
  /** Provider-charged fee — provider truth, copied as-is. */
  fee: number;
  status: 'held' | 'captured';
}

export class LedgerRecords {
  private readonly escrowByOrderId = new Map<string, EscrowTxn>();
  private readonly obligationsByOrderId = new Map<string, SettlementObligation[]>();

  /**
   * Provider payment confirmation → one EscrowTxn record. Idempotent on
   * (orderId, collectRef): a replay returns the existing record untouched.
   */
  recordEscrowFromProvider(
    confirmation: ProviderLegConfirmation,
  ):
    | { ok: true; record: EscrowTxn; replay: boolean }
    | { ok: false; reason: 'conflicting_escrow_for_order' } {
    const existing = this.escrowByOrderId.get(confirmation.orderId);
    if (existing) {
      const sameLeg = existing.paymentLegs.some((leg) => leg.collectRef === confirmation.collectRef);
      if (sameLeg) return { ok: true, record: existing, replay: true };
      // E1 is FULL_PREPAY: exactly one checkout leg. A second, different leg
      // on the same order is not expressible until Option B (E2/E3) — refuse
      // closed, never merge or overwrite a money record.
      return { ok: false, reason: 'conflicting_escrow_for_order' };
    }
    const record = EscrowTxnSchema.parse({
      orderId: confirmation.orderId,
      provider: confirmation.provider,
      paymentLegs: [
        {
          legType: confirmation.legType,
          collectRef: confirmation.collectRef,
          amount: confirmation.amount, // provider truth, copied
          fee: confirmation.fee, // provider truth, copied
          status: confirmation.status,
        },
      ],
      status: confirmation.status,
      splitBreakdown: {},
      payoutRefs: [],
    });
    this.escrowByOrderId.set(confirmation.orderId, record);
    return { ok: true, record, replay: false };
  }

  /**
   * Séra eligibility signal → exactly TWO SettlementObligation records whose
   * amounts are COPIED from the immutable Quote's sellerNet / resellerNet.
   * Idempotent on orderId: a duplicate signal returns the same pair.
   */
  recordObligationsOnEligibility(
    orderId: string,
    quote: Quote,
    supplierRef: string,
  ): { obligations: readonly SettlementObligation[]; replay: boolean } {
    const existing = this.obligationsByOrderId.get(orderId);
    if (existing) return { obligations: existing, replay: true };
    const obligations = [
      SettlementObligationSchema.parse({
        orderId,
        party: `supplier:${supplierRef}`,
        amount: quote.sellerNet, // COPIED from the Quote — never recomputed
        state: 'Eligible',
        holds: [],
      }),
      SettlementObligationSchema.parse({
        orderId,
        party: `reseller:${quote.attributionResellerId}`,
        amount: quote.resellerNet, // COPIED from the Quote — never recomputed
        state: 'Eligible',
        holds: [],
      }),
    ];
    this.obligationsByOrderId.set(orderId, obligations);
    return { obligations, replay: false };
  }

  escrowFor(orderId: string): EscrowTxn | undefined {
    return this.escrowByOrderId.get(orderId);
  }

  obligationsFor(orderId: string): readonly SettlementObligation[] {
    return this.obligationsByOrderId.get(orderId) ?? [];
  }
}
