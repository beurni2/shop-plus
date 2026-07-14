/**
 * RÉPUTATION (S8) — THE COUNT LAW, as a pure fold.
 *
 * Founder ruling (canon Shop-Plus-Build-Spec §SP8 + docs/derivations/
 * REPUTATION-LAW.md, WO-5.15): « La réputation d'une revendeuse EST le nombre de
 * ventes livrées — an exact count, never a rank, never a score, never a
 * comparison. » Source: `delivery.validated.v1` delivered-sale events attributed
 * to her storefront via the LOCKED `Order.resellerId` (SP-I01).
 *
 * The canon five-hop linkage (all existing canonical fields, no shape invented):
 *   `delivery.validated.v1` → `ValidationDecision.taskId` → `DeliveryTask.orderId`
 *   → `Order.resellerId` (LOCKED, SP-I01) → `Storefront.resellerId`.
 * The join is resolved at the service boundary (canon envelopes carry no typed
 * per-event payload); this fold consumes the resolved fact — a validated
 * delivered sale, attributed to one reseller, on one order.
 *
 * So, for a reseller R:
 *   réputation(R) = |{ validated order : Order.resellerId = R }|
 *
 * Deterministic and un-rankable BY CONSTRUCTION: the fold answers for ONE
 * reseller and returns ONE integer. There is no window, no decay, no score, and
 * no API that compares or orders resellers — a rank is not representable here
 * (Ten Laws §5). Idempotent: a re-emitted validation of the same order counts
 * once (dedup by `orderId`).
 */

export interface DeliveredSaleEvent {
  readonly type: 'delivery.validated';
  /** The reseller the order is LOCKED to (SP-I01), resolved via the five-hop linkage. */
  readonly resellerId: string;
  /** The validated order — the dedup key; a re-validation of the same order counts once. */
  readonly orderId: string;
}

/**
 * réputation(resellerId) — the exact count of distinct delivered-and-validated
 * orders for ONE reseller. A bare integer: never a rank, never a comparison.
 */
export function countDeliveredSales(
  events: readonly DeliveredSaleEvent[],
  resellerId: string,
): number {
  const validatedOrders = new Set<string>();
  for (const ev of events) {
    if (ev.resellerId === resellerId) validatedOrders.add(ev.orderId);
  }
  return validatedOrders.size;
}
