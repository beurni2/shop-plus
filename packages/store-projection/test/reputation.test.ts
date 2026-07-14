import { describe, expect, it } from 'vitest';
import * as reputationModule from '../src/reputation.js';
import { countDeliveredSales, type DeliveredSaleEvent } from '../src/reputation.js';

/**
 * S8 — the réputation count law. Two RED-first fold gates:
 * count-exact-verbatim (a +1 mutation must fail) · never-a-rank (a comparison is
 * not representable — the structural-absence pattern).
 */

function validated(resellerId: string, orderId: string): DeliveredSaleEvent {
  return { type: 'delivery.validated', resellerId, orderId };
}

describe('countDeliveredSales — réputation is the exact count of delivered sales', () => {
  it('COUNT-EXACT-VERBATIM: exactly the number of distinct validated orders for the reseller — not one more, not one less', () => {
    const events: DeliveredSaleEvent[] = [
      validated('res_aicha', 'ord_1'),
      validated('res_aicha', 'ord_2'),
      validated('res_aicha', 'ord_3'),
      validated('res_mariam', 'ord_9'), // a different reseller — never counted for Aïcha
    ];
    expect(countDeliveredSales(events, 'res_aicha')).toBe(3); // a +1 mutation of the fold fails here
    expect(countDeliveredSales(events, 'res_mariam')).toBe(1);
    expect(countDeliveredSales(events, 'res_nobody')).toBe(0); // no delivered sale → zero, honest
  });

  it('is idempotent — a re-emitted validation of the SAME order counts once (dedup by orderId)', () => {
    const events: DeliveredSaleEvent[] = [
      validated('res_aicha', 'ord_1'),
      validated('res_aicha', 'ord_1'), // replay of the same validated order
      validated('res_aicha', 'ord_2'),
    ];
    expect(countDeliveredSales(events, 'res_aicha')).toBe(2); // two distinct orders, not three
  });

  it('NEVER-A-RANK: the module answers per-reseller with a bare integer — no comparison/ordering API is representable', () => {
    const events: DeliveredSaleEvent[] = [
      validated('res_top', 'o1'),
      validated('res_top', 'o2'),
      validated('res_top', 'o3'),
      validated('res_low', 'o4'),
    ];
    // Each reseller gets THEIR OWN count — never a position, never a "who is ahead".
    expect(typeof countDeliveredSales(events, 'res_top')).toBe('number');
    // Structural absence: the package exports NO function that ranks/sorts/compares
    // resellers by their count (no leaderboard, no top-N, no percentile).
    const exported = Object.keys(reputationModule);
    const rankish = exported.filter((k) => /rank|top|leaderboard|compare|sort|best|percentile|position|order/i.test(k));
    expect(rankish).toEqual([]);
    // The only reputation export is the per-reseller count.
    expect(exported).toContain('countDeliveredSales');
  });
});
