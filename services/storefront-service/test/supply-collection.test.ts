import { describe, expect, it } from 'vitest';
import { SUPPLY_COLLECTION_ROUTE, readSupplyCollection } from '../src/supply-collection.js';

/**
 * BROWSE-SUPPLY-1 — the reseller browse read and its DIAGNOSTIC.
 *
 * The property under test is the one the founder ordered built: when a product is
 * missing, something must be able to say WHY. `supply-source.ts` collapses every
 * non-2xx and every non-fresh verdict to `undefined` — correct for the buyer, but it
 * discards the answer, and five distinct faults then look identical on screen.
 */

const NOW = '2026-07-25T12:00:00.000Z';
const minutesAgo = (m: number): string => new Date(Date.parse(NOW) - m * 60_000).toISOString();

/** The real product the founder authored from his phone, in boutik's envelope. */
const BAZIN = {
  version: 1,
  asOf: minutesAgo(1),
  value: {
    productVersionId: 'pv-bazin-0001',
    offerVersion: 'ov-1',
    basePrice: 10_000,
    resellerCommission: 750,
    available: 10,
    productName: 'Bazin',
    assetRefs: [],
  },
};

function respond(body: unknown, status = 200): typeof fetch {
  return (async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
}

describe('the collection route name — exact, never a prefix', () => {
  it('is the PLURAL route, and does not start with the singular one', () => {
    expect(SUPPLY_COLLECTION_ROUTE).toBe('/supply-projections');
    // THE LESSON, asserted rather than commented: `/supply-projections` does NOT
    // start with `/supply-projection/`, which is how a prefix-based auth check
    // failed OPEN on boutik's side — one unauthenticated request handing over every
    // offer's economics. If someone ever "tidies" the route to a prefix-matchable
    // name, this fails first.
    expect(SUPPLY_COLLECTION_ROUTE.startsWith('/supply-projection/')).toBe(false);
  });
});

describe('readSupplyCollection — the reason is PRESERVED, never collapsed', () => {
  it('UNCONFIGURED is distinguishable from empty — the fault the empty screen hides', async () => {
    const result = await readSupplyCollection(undefined, NOW, respond({ items: [] }));
    expect(result.status).toBe('unconfigured');
    expect(result.offers).toEqual([]);
  });

  it('a configured base with ZERO products is `ok`, NOT unconfigured — genuinely nothing published', async () => {
    const result = await readSupplyCollection({ SUPPLY_BASE: 'https://b.example' }, NOW, respond({ asOf: NOW, items: [] }));
    expect(result.status).toBe('ok');
    expect(result.offers).toEqual([]);
    // Same empty screen as the line above, DIFFERENT diagnosis. That distinction is
    // the entire reason this function exists.
  });

  it('a 401 is UNREACHABLE and carries the status — the secret-mismatch fault, named', async () => {
    const result = await readSupplyCollection({ SUPPLY_BASE: 'https://b.example' }, NOW, respond({}, 401));
    expect(result.status).toBe('unreachable');
    expect(result.httpStatus).toBe(401);
  });

  it('a network throw is UNREACHABLE, never a crash up the read path', async () => {
    const throwing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect((await readSupplyCollection({ SUPPLY_BASE: 'https://b.example' }, NOW, throwing)).status).toBe('unreachable');
  });

  it('a STALE item is refused with reason `stale` AND names itself, so an operator knows which product', async () => {
    const stale = { ...BAZIN, asOf: minutesAgo(20) }; // past the 15-minute bound
    const result = await readSupplyCollection({ SUPPLY_BASE: 'https://b.example' }, NOW, respond({ asOf: NOW, items: [stale] }));
    expect(result.status).toBe('ok');
    expect(result.offers).toEqual([]); // the buyer/reseller surface still shows nothing
    expect(result.refusals).toEqual([{ productVersionId: 'pv-bazin-0001', reason: 'stale' }]);
  });

  it('a MALFORMED item is refused and does not take the good ones down with it', async () => {
    const result = await readSupplyCollection(
      { SUPPLY_BASE: 'https://b.example' },
      NOW,
      respond({ asOf: NOW, items: [BAZIN, { nonsense: true }] }),
    );
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.productName).toBe('Bazin');
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]?.reason).toBe('not_a_read_model');
  });

  it('the REAL product parses to the seven canon fields, unaltered', async () => {
    const result = await readSupplyCollection({ SUPPLY_BASE: 'https://b.example' }, NOW, respond({ asOf: NOW, items: [BAZIN] }));
    expect(result.offers).toEqual([
      {
        productVersionId: 'pv-bazin-0001',
        offerVersion: 'ov-1',
        basePrice: 10_000,
        resellerCommission: 750,
        available: 10,
        productName: 'Bazin',
        assetRefs: [],
      },
    ]);
  });

  it('NO supplier identity or location rides through — zone is stripped at the producer and stays absent', async () => {
    const result = await readSupplyCollection({ SUPPLY_BASE: 'https://b.example' }, NOW, respond({ asOf: NOW, items: [BAZIN] }));
    const keys = Object.keys(result.offers[0] ?? {});
    expect(keys).not.toContain('zone');
    expect(keys).not.toContain('supplierId');
    expect(keys.sort()).toEqual(
      ['assetRefs', 'available', 'basePrice', 'offerVersion', 'productName', 'productVersionId', 'resellerCommission'].sort(),
    );
  });

  it('the bearer is sent when the secret is set, and OMITTED when it is not', async () => {
    const seen: RequestInit[] = [];
    const spy = (async (_url: string, init: RequestInit) => {
      seen.push(init);
      return { ok: true, status: 200, json: async () => ({ asOf: NOW, items: [] }) } as unknown as Response;
    }) as unknown as typeof fetch;

    await readSupplyCollection({ SUPPLY_BASE: 'https://b.example', SUPPLY_READ_SECRET: 'S' }, NOW, spy);
    expect((seen[0]?.headers as Record<string, string>).Authorization).toBe('Bearer S');

    await readSupplyCollection({ SUPPLY_BASE: 'https://b.example' }, NOW, spy);
    // Absent secret ⇒ NO header, never a broken request: the same env-gating the
    // lookup path uses, so a 401 becomes the honest reportable answer.
    expect((seen[1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
