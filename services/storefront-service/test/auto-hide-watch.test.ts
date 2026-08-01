import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index.js';

/**
 * AUTO-HIDE-WATCH-1 — the watcher lives on the buyer read path.
 *
 * There is no listings enumeration (per-listing DOs, no index), so the join —
 * which already reads supply for every curated pid on every `GET /s/{slug}` — IS
 * the watch. These tests drive the REAL handler with fake bindings and pin the
 * three behaviours that make the watcher safe:
 *
 *   1. POSITIVE ABSENCE HIDES: the producer answering 404
 *      `unknown_product_version` flips the standing published listing to
 *      auto_hidden through the existing hide route — and the record is omitted.
 *   2. THE INSTRUMENT LAW: a supply read that FAILS (network throw, 5xx) fires
 *      NO hide — a supply outage renders as omission, never as a shop-wide
 *      erasure of her listings. This is the founder's law — AN ABSENCE IS ONLY
 *      EVIDENCE IF THE INSTRUMENT COULD HAVE SEEN THE PRESENCE — as a test.
 *   3. NO DOUBLE ACT: an already-hidden listing gets no second hide call from
 *      the read path (the join drops it at `status`), and a present offer gets
 *      none at all.
 */

const SF = {
  id: 'sf-watch-0001',
  resellerId: 'res_aicha',
  slug: 'aicha-watch',
  name: 'Chez Aïcha Mode',
  zone: 'Gounghin, Ouagadougou',
  category: 'mode',
  tagline: '',
  bio: '',
  theme: 'indigo',
  cover: { status: 'none' },
  avatar: { mode: 'monogram' },
  curatedItems: ['pv-real-1'],
  featuredItems: [],
  sections: [],
  discoverable: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const freshEnvelope = (pv: string): unknown => ({
  version: 1,
  asOf: new Date().toISOString(),
  value: {
    productVersionId: pv,
    offerVersion: 'ov-1',
    basePrice: 10_000,
    resellerCommission: 750,
    available: 3,
    productName: 'Bazin riche brodé',
    assetRefs: [],
    category: 'fashion_bags_fabrics',
  },
});

/** The storefront DO fake: answers the slug read the durable store performs. */
const storefrontDo = () => ({
  fetch: async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url);
    if (req.method === 'GET' && pathname === `/s/${SF.slug}`) return Response.json(SF);
    return Response.json({ error: 'not_found' }, { status: 404 });
  },
});

/** The listing DO fake: serves by-pid and RECORDS every hide POST it receives. */
function listingDo(status: 'published' | 'auto_hidden') {
  const hides: { path: string; body: unknown }[] = [];
  return {
    hides,
    binding: {
      fetch: async (req: Request): Promise<Response> => {
        const { pathname } = new URL(req.url);
        if (req.method === 'GET' && pathname.startsWith('/listings/by-pid/')) {
          return Response.json({
            listingId: 'lst-watch-0001',
            productVersionId: 'pv-real-1',
            customerPriceFcfa: 11_900,
            status,
          });
        }
        if (req.method === 'POST' && /^\/listings\/[^/]+\/hide$/.test(pathname)) {
          hides.push({ path: pathname, body: await req.json() });
          return Response.json({ status: 'hidden', listing: { id: 'lst-watch-0001' } });
        }
        return Response.json({ error: 'not_found' }, { status: 404 });
      },
    },
  };
}

const offerAnswering = (status: number, body: unknown) => ({
  fetch: async (): Promise<Response> =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => '' }) as unknown as Response,
});

const offerThrowing = () => ({
  fetch: async (): Promise<Response> => {
    throw new Error('connection refused');
  },
});

const read = (env: object): Promise<Response> =>
  handleRequest(new Request(`https://svc/s/${SF.slug}`), { STOREFRONT_DO: storefrontDo(), ...env } as never);

describe('AUTO-HIDE-WATCH-1 — the read path is the watch', () => {
  it('PRODUCER-DENIED (404 unknown_product_version) ⇒ ONE hide fired at THAT listing, record omitted', async () => {
    const lst = listingDo('published');
    const res = await read({
      LISTING_DO: lst.binding,
      OFFER: offerAnswering(404, { service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { products: unknown[] };
    expect(body.products).toEqual([]); // omitted, never invented
    expect(lst.hides).toHaveLength(1);
    expect(lst.hides[0]!.path).toBe('/listings/lst-watch-0001/hide');
    const args = lst.hides[0]!.body as { correlationId: string; at: string };
    // the correlation names the evidence site, and `at` is a real timestamp
    expect(args.correlationId).toBe(`supply-gone:${SF.id}:pv-real-1`);
    expect(Number.isNaN(Date.parse(args.at))).toBe(false);
  });

  it('THE INSTRUMENT LAW — a supply read that THROWS fires NO hide (outage ≠ lapse)', async () => {
    // RED CHECK against the tempting wrong build: a watcher keyed on
    // `describe() === undefined` would hide here, because describe collapses
    // failure and lapse into one undefined. presence() exists so this test can
    // demand the difference.
    const lst = listingDo('published');
    const res = await read({ LISTING_DO: lst.binding, OFFER: offerThrowing() });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { products: unknown[] }).products).toEqual([]); // still omitted
    expect(lst.hides).toEqual([]); // but NEVER hidden on ignorance
  });

  it('5xx and STALE also fire NO hide — every instrument failure is ignorance, not evidence', async () => {
    const lst5 = listingDo('published');
    await read({ LISTING_DO: lst5.binding, OFFER: offerAnswering(500, {}) });
    expect(lst5.hides).toEqual([]);
    const stale = {
      version: 1,
      asOf: new Date(Date.now() - 16 * 60_000).toISOString(),
      value: (freshEnvelope('pv-real-1') as { value: unknown }).value,
    };
    const lstStale = listingDo('published');
    await read({ LISTING_DO: lstStale.binding, OFFER: offerAnswering(200, stale) });
    expect(lstStale.hides).toEqual([]);
  });

  it('an UNCONFIGURED supply source (no OFFER binding) can never hide — absent instrument, no absences', async () => {
    const lst = listingDo('published');
    const res = await read({ LISTING_DO: lst.binding });
    expect(res.status).toBe(200);
    expect(lst.hides).toEqual([]);
  });

  it('a PRESENT offer fires no hide and the record renders with its description', async () => {
    const lst = listingDo('published');
    const res = await read({ LISTING_DO: lst.binding, OFFER: offerAnswering(200, freshEnvelope('pv-real-1')) });
    const body = (await res.json()) as { products: { pid: string; name: string; priceFcfa: number }[] };
    expect(body.products).toHaveLength(1);
    expect(body.products[0]!.pid).toBe('pv-real-1');
    expect(body.products[0]!.name).toBe('Bazin riche brodé');
    expect(body.products[0]!.priceFcfa).toBe(11_900); // HER signed price, verbatim
    expect(lst.hides).toEqual([]);
  });

  it('an ALREADY-HIDDEN listing gets no second hide from the read path', async () => {
    const lst = listingDo('auto_hidden');
    const res = await read({
      LISTING_DO: lst.binding,
      OFFER: offerAnswering(404, { service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' }),
    });
    expect(((await res.json()) as { products: unknown[] }).products).toEqual([]); // hidden stays invisible
    expect(lst.hides).toEqual([]); // status gate: no pointless DO write per read
  });
});
