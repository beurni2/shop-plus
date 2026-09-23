import { splitPackageDeliveryFee } from '@platform/contracts';
import { describe, expect, it } from 'vitest';
import { decideIssueQuote } from '../src/checkout-core.js';
import { BoundColisGrouping, AbsentColisGrouping, GROUPING_ROUTE } from '../src/colis-source.js';
import { quoteDeliveryFee } from '../src/delivery-source.js';
import type { ListingEntry } from '../src/listing-core.js';
import { colisIdFor, decideColis, type ColisEntry } from '../src/payment-group-core.js';

/**
 * COLIS-FOURNISSEUR-1 (founder rulings 2026-09-23) — the pure halves of the
 * Shop+ package, by value: the quote carries its share of the one fee; a
 * payment carries a package whole or not at all; the grouping client believes
 * only a grouping of exactly what it asked.
 */

/* ─────────────────────────── the quote's share ─────────────────────────── */

const T = '2026-09-23T08:00:00.000Z';
const entry = {
  listing: {
    id: 'lst-1', storefrontId: 'sf-1', resellerId: 'rs-1', productVersionId: 'pv-1', offerVersion: 'ov-1',
    markup: 1_500, status: 'published', publishedAt: T, correlationId: 'corr-1',
  },
  customerPriceFcfa: 11_500,
  resellerCommission: 1_000,
} as unknown as ListingEntry;
const request = { slug: 'shop', pid: 'pv-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: 'rs-1', requestKey: 'k'.repeat(16) };
const deps = { flags: { version: 't', flags: {}, kills: [], killedCategories: [] }, now: () => new Date(T), newId: () => 'quote-colis-1' };
const delivery = quoteDeliveryFee('Ouagadougou', 'Ouagadougou')!;

describe('the quote carries its share of the package\'s ONE fee', () => {
  it('D is the share when one is given, the whole fee otherwise — and the quote still reconciles', () => {
    const seul = decideIssueQuote(deps, { request, entry, delivery });
    const part = decideIssueQuote(deps, { request, entry, delivery, packageFeeShare: 334 });
    expect(seul.ok && seul.quote.deliveryFee).toBe(delivery.fee);
    expect(part.ok && part.quote.deliveryFee).toBe(334);
    expect(part.ok && part.quote.buyerTotal).toBe(11_500 + 334);
  });

  it('a share larger than the fee it splits, or not a whole franc, is refused — never issued', () => {
    for (const share of [delivery.fee + 1, 12.5, -1]) {
      expect(decideIssueQuote(deps, { request, entry, delivery, packageFeeShare: share })).toEqual({ ok: false, reason: 'stored_amounts_incoherent' });
    }
  });
});

/* ────────────────────────── whole or not at all ─────────────────────────── */

const D = 1_000;
const [s0, s1] = splitPackageDeliveryFee(D, 2) as [number, number];
const colis = { pids: ['pv-a', 'pv-b'], packageFee: D };
const art = (q: string, pid: string, fee: number, c?: typeof colis): ColisEntry => ({ quoteId: q, orderId: `ord-${q}`, pid, deliveryFee: fee, colis: c });

describe('a package is paid whole or not at all', () => {
  it('a whole package and an article alone: one package, in its own order, and two deliveries', () => {
    const d = decideColis([art('q3', 'pv-c', D), art('q2', 'pv-b', s1, colis), art('q1', 'pv-a', s0, colis)]);
    expect(d).toEqual({ ok: true, colis: [{ pids: ['pv-a', 'pv-b'], quoteIds: ['q1', 'q2'], orderIds: ['ord-q1', 'ord-q2'] }], livraisons: 2 });
  });

  it('refuses half a package, a share that is not its own, the same product priced alone, and two packages sharing a product', () => {
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q3', 'pv-c', D)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    // The leftover franc on the wrong article.
    const [u0, u1] = splitPackageDeliveryFee(1_001, 2) as [number, number];
    const impair = { pids: ['pv-a', 'pv-b'], packageFee: 1_001 };
    expect(decideColis([art('q1', 'pv-a', u1, impair), art('q2', 'pv-b', u0, impair)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    expect(decideColis([art('q1', 'pv-a', u0, impair), art('q2', 'pv-b', u1, impair)]).ok).toBe(true);
    // A package's product priced alone beside it.
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q2', 'pv-b', s1, colis), art('q9', 'pv-a', D)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    // Two articles of the same package claiming the same product.
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q2', 'pv-a', s1, colis)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    // A whole package plus a third quote for one of its products: more
    // articles than the package holds would ride it without being counted.
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q2', 'pv-b', s1, colis), art('q3', 'pv-a', s0, colis)])).toEqual({ ok: false, reason: 'colis_incomplet' });
    // A package that disagrees with its twin about its own products.
    expect(decideColis([art('q1', 'pv-a', s0, colis), art('q2', 'pv-b', s1, { pids: ['pv-a', 'pv-b', 'pv-c'], packageFee: D })])).toEqual({ ok: false, reason: 'colis_incomplet' });
  });

  it('with no package at all, every article is its own delivery', () => {
    expect(decideColis([art('q1', 'pv-a', D), art('q2', 'pv-b', D)])).toEqual({ ok: true, colis: [], livraisons: 2 });
  });

  it('the same articles are the same package, whatever order they come in', async () => {
    expect(await colisIdFor(['q2', 'q1'])).toBe(await colisIdFor(['q1', 'q2']));
    expect(await colisIdFor(['q1', 'q2'])).toMatch(/^colis-[0-9a-f]{40}$/);
    expect(await colisIdFor(['q1', 'q3'])).not.toBe(await colisIdFor(['q1', 'q2']));
  });
});

/* ───────────────────────── the grouping client ──────────────────────────── */

function producer(answer: (req: Request) => Response | Promise<Response>) {
  const asks: Request[] = [];
  return {
    asks,
    fetcher: { fetch: async (req: Request) => { asks.push(req.clone()); return answer(req); } },
  };
}

describe('Boutik+\'s grouping, asked and believed only when it is a grouping of what was asked', () => {
  it('asks the grouping door with the credential and the asked ids, and returns the groups', async () => {
    const p = producer(() => Response.json({ groups: [['pv-a', 'pv-b'], ['pv-c']] }));
    const groups = await new BoundColisGrouping(p.fetcher, 'secret-s').grouper(['pv-a', 'pv-b', 'pv-c']);
    expect(groups).toEqual([['pv-a', 'pv-b'], ['pv-c']]);
    const ask = p.asks[0]!;
    expect(new URL(ask.url).pathname).toBe(GROUPING_ROUTE);
    expect(ask.method).toBe('POST');
    expect(ask.headers.get('Authorization')).toBe('Bearer secret-s');
    expect(await ask.json()).toEqual({ productVersionIds: ['pv-a', 'pv-b', 'pv-c'] });
  });

  it('believes nothing else: a refusal, a malformed body, a grouping of other ids, a missing id, a thrown fetch', async () => {
    const cas: (() => Response)[] = [
      () => Response.json({ error: 'unauthorized' }, { status: 401 }),
      () => Response.json({ groups: 'no' }),
      () => Response.json({ groups: [['pv-a', 'pv-x'], ['pv-c']] }),
      () => Response.json({ groups: [['pv-a', 'pv-b']] }),
      () => Response.json({ groups: [['pv-a', 'pv-b'], ['pv-c']], supplierId: 'sup-1' }),
      () => { throw new Error('down'); },
    ];
    for (const c of cas) {
      expect(await new BoundColisGrouping(producer(c).fetcher, 's').grouper(['pv-a', 'pv-b', 'pv-c'])).toBeUndefined();
    }
    expect(await new AbsentColisGrouping().grouper()).toBeUndefined();
  });
});
