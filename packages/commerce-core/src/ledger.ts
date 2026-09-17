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
   * Provider payment confirmation → the order's EscrowTxn record. Idempotent
   * on (orderId, collectRef): a replay returns the existing record untouched.
   *
   * Legs per §5.5/§5.6 `paymentLegs[{legType(checkout|door)...}]`:
   * the FIRST confirmation for an order MUST be its checkout leg; an Option-B
   * order's DOOR leg is APPENDED to that record (WO-2.5) — exactly one of
   * each, ever. A second different leg of a type already recorded refuses
   * closed; a door leg with no checkout leg before it refuses closed. Money
   * records are never merged or overwritten — append-only, amounts copied.
   */
  recordEscrowFromProvider(
    confirmation: ProviderLegConfirmation,
  ):
    | { ok: true; record: EscrowTxn; replay: boolean }
    | { ok: false; reason: 'conflicting_escrow_for_order' | 'door_leg_before_checkout_leg' } {
    const existing = this.escrowByOrderId.get(confirmation.orderId);
    if (existing) {
      const sameLeg = existing.paymentLegs.some((leg) => leg.collectRef === confirmation.collectRef);
      if (sameLeg) return { ok: true, record: existing, replay: true };
      const legOfSameType = existing.paymentLegs.some((leg) => leg.legType === confirmation.legType);
      if (legOfSameType) {
        // A DIFFERENT confirmation for a leg type already funded — refuse
        // closed, never merge or overwrite a money record.
        return { ok: false, reason: 'conflicting_escrow_for_order' };
      }
      // The one modeled append: an Option-B door leg joining its checkout leg.
      const record = EscrowTxnSchema.parse({
        ...existing,
        paymentLegs: [
          ...existing.paymentLegs,
          {
            legType: confirmation.legType,
            collectRef: confirmation.collectRef,
            amount: confirmation.amount, // provider truth, copied
            fee: confirmation.fee, // provider truth, copied
            status: confirmation.status,
          },
        ],
      });
      this.escrowByOrderId.set(confirmation.orderId, record);
      return { ok: true, record, replay: false };
    }
    if (confirmation.legType === 'door') {
      // §5.5 boundary: select mode → fund legs → ... the checkout leg (D)
      // funds FIRST; a door confirmation with no escrow record is provider
      // truth arriving against an order this ledger never saw funded.
      return { ok: false, reason: 'door_leg_before_checkout_leg' };
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
      // v0.5.0 canon: EscrowTxn.status is the aggregator-flow stage
      // (collect|hold|split|payout|refunded). A provider-confirmed checkout
      // leg means the provider HOLDS the funds; the leg itself carries the
      // held/captured provider truth above. Split/payout are later stages.
      status: 'hold',
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

  /**
   * RELATED-PARTY-1 (§6.5) — a HOLD on one party's obligation: the state goes
   * to the canon's `Held` and the reason rides in `holds` (the field §5.6 gave
   * every obligation for exactly this). The AMOUNT never changes here: a hold
   * pauses a payout, it moves no franc. Idempotent on the reason. False when
   * the order or the party has no obligation (before Séra's validated signal
   * there is no commission to hold).
   */
  holdObligation(orderId: string, party: string, hold: string): boolean {
    const rows = this.obligationsByOrderId.get(orderId);
    const i = rows?.findIndex((o) => o.party === party) ?? -1;
    if (rows === undefined || i < 0) return false;
    const o = rows[i]!;
    rows[i] = SettlementObligationSchema.parse({
      ...o,
      state: 'Held',
      holds: o.holds.includes(hold) ? o.holds : [...o.holds, hold],
    });
    return true;
  }

  /**
   * The hold's release — « on clear → paid »: every hold under the prefix
   * comes off, and with no hold left the obligation is `Eligible` again, the
   * one state a line ever holds before a hold today (no payout stage exists
   * yet to return it to). A hold under another prefix keeps the line Held.
   */
  releaseHold(orderId: string, party: string, prefix: string): boolean {
    const rows = this.obligationsByOrderId.get(orderId);
    const i = rows?.findIndex((o) => o.party === party) ?? -1;
    if (rows === undefined || i < 0) return false;
    const o = rows[i]!;
    const holds = o.holds.filter((h) => !h.startsWith(prefix));
    rows[i] = SettlementObligationSchema.parse({ ...o, holds, state: holds.length === 0 ? 'Eligible' : o.state });
    return true;
  }
}
