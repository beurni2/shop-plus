import { describe, expect, it } from 'vitest';
import { paginerRegistre } from '../worker/dispatch-index-do';

/**
 * DISPATCH-PAGES-1 — the page computation under the one condition the e2e
 * cannot manufacture: rows registered on the SAME millisecond. The DO mints
 * `firstSeenAt` itself, so no test driving the real object can force the
 * collision — and it is exactly there that a tie-less sort lets a cursor
 * repeat or skip rows. The walk below is the console's own loop, verbatim:
 * follow `next` until absent, and the union must be the whole list, once.
 */

const T = '2026-09-03T10:00:00.000Z';
const T2 = '2026-09-03T10:00:00.001Z';

const row = (orderId: string, firstSeenAt: string) => ({ orderId, firstSeenAt });

function marcher(rows: { orderId: string; firstSeenAt: string }[], limit: number): string[] {
  const vus: string[] = [];
  let apres: { seen: string; id: string } | undefined;
  for (let tours = 0; tours < 20; tours += 1) {
    const { orders, next } = paginerRegistre(rows, limit, apres);
    vus.push(...orders.map((o) => o.orderId));
    if (next === undefined) return vus;
    const sep = next.indexOf('|');
    apres = { seen: decodeURIComponent(next.slice(0, sep)), id: decodeURIComponent(next.slice(sep + 1)) };
  }
  throw new Error(`the walk did not terminate; seen so far: ${JSON.stringify(vus)}`);
}

describe('paginerRegistre — a cursor over colliding clocks neither repeats nor skips', () => {
  it('five rows sharing ONE millisecond, pages of 2: the union is all five, once each, in the total order', () => {
    const rows = [row('ord-a', T), row('ord-c', T), row('ord-e', T), row('ord-b', T), row('ord-d', T)];
    const vus = marcher(rows, 2);
    // total order: firstSeenAt equal everywhere ⇒ orderId desc
    expect(vus).toEqual(['ord-e', 'ord-d', 'ord-c', 'ord-b', 'ord-a']);
  });

  it('a collision straddling a page BOUNDARY — the exact skip/repeat spot', () => {
    // newest first: [x@T2, b@T, a@T] — page 1 of 2 ends INSIDE the T tie
    const rows = [row('ord-a', T), row('ord-b', T), row('ord-x', T2)];
    expect(marcher(rows, 2)).toEqual(['ord-x', 'ord-b', 'ord-a']);
  });

  it('mixed clocks page whole: newest first across boundaries, next absent exactly at the end', () => {
    const rows = [row('ord-1', '2026-09-01T00:00:00.000Z'), row('ord-2', T), row('ord-3', T2)];
    const p1 = paginerRegistre(rows, 2, undefined);
    expect(p1.orders.map((o) => o.orderId)).toEqual(['ord-3', 'ord-2']);
    expect(typeof p1.next).toBe('string');
    const sep = p1.next!.indexOf('|');
    const p2 = paginerRegistre(rows, 2, { seen: decodeURIComponent(p1.next!.slice(0, sep)), id: decodeURIComponent(p1.next!.slice(sep + 1)) });
    expect(p2.orders.map((o) => o.orderId)).toEqual(['ord-1']);
    expect(p2.next).toBeUndefined();
  });

  it('a row registered MID-WALK lands before the cursor: nothing walked shifts, repeats, or is lost', () => {
    const anciens = [row('ord-a', T), row('ord-b', T), row('ord-c', T2)];
    const p1 = paginerRegistre(anciens, 2, undefined);
    expect(p1.orders.map((o) => o.orderId)).toEqual(['ord-c', 'ord-b']);
    // a NEW order arrives between his page 1 and page 2
    const avecNouveau = [...anciens, row('ord-z', '2026-09-03T10:00:01.000Z')];
    const sep = p1.next!.indexOf('|');
    const p2 = paginerRegistre(avecNouveau, 2, { seen: decodeURIComponent(p1.next!.slice(0, sep)), id: decodeURIComponent(p1.next!.slice(sep + 1)) });
    expect(p2.orders.map((o) => o.orderId)).toEqual(['ord-a']);
  });

  it('no limit is the whole list in the same total order — the pre-slice callers, byte-compatible', () => {
    const rows = [row('ord-a', T), row('ord-b', T), row('ord-c', T2)];
    const { orders, next } = paginerRegistre(rows, undefined, undefined);
    expect(orders.map((o) => o.orderId)).toEqual(['ord-c', 'ord-b', 'ord-a']);
    expect(next).toBeUndefined();
  });

  it('a cursor whose row is GONE still lands on the right next row (comparison, never an index)', () => {
    const rows = [row('ord-a', T), row('ord-c', T)];
    const { orders } = paginerRegistre(rows, 2, { seen: T, id: 'ord-b' });
    expect(orders.map((o) => o.orderId)).toEqual(['ord-a']);
  });
});
