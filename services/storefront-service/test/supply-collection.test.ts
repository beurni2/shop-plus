import { describe, expect, it } from 'vitest';
import {
  SUPPLY_COLLECTION_ROUTE,
  SUPPLY_TARGET_BINDING,
  readSupplyCollection,
  whoAnswered,
} from '../src/supply-collection.js';
import type { SupplySourceEnv } from '../src/supply-source.js';
import { handleRequest } from '../src/index.js';

/**
 * BROWSE-SUPPLY-1 / BROWSE-SUPPLY-BINDING-1 — the reseller browse read, its
 * DIAGNOSTIC, and the SERVICE BINDING that replaced the SUPPLY_BASE secret.
 *
 * The property under test is the one the founder ordered built: when a product is
 * missing, something must be able to say WHY — and WHAT IT WAS TALKING TO. The
 * fetcher is now the `OFFER` service binding; tests stub the binding's `fetch`
 * exactly as they stubbed `fetchImpl` before the binding existed.
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
    category: 'fashion_bags_fabrics',
  },
};

/** An env whose OFFER binding answers with the given body/status — the stub IS the
 *  bound Worker. Both `json` and `text`: a real Response always has both, and the
 *  non-2xx path reads `text()` to name who answered. */
function bound(body: unknown, status = 200): SupplySourceEnv {
  return {
    OFFER: {
      fetch: async () =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
          text: async () => JSON.stringify(body),
        }) as unknown as Response,
    },
  };
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
  it('UNCONFIGURED (no binding) is distinguishable from empty — and is now VISIBLE IN CONFIG', async () => {
    // No [[services]] block ⇒ no env.OFFER ⇒ unconfigured. The state is readable in
    // wrangler.toml rather than hidden in a write-only secret.
    const result = await readSupplyCollection(undefined, NOW);
    expect(result.status).toBe('unconfigured');
    expect(result.offers).toEqual([]);
    expect(result.target).toBeUndefined(); // nothing was called; there is no target to name
  });

  it('a bound producer with ZERO products is `ok`, NOT unconfigured — genuinely nothing published', async () => {
    const result = await readSupplyCollection(bound({ asOf: NOW, items: [] }), NOW);
    expect(result.status).toBe('ok');
    expect(result.offers).toEqual([]);
    // Same empty screen as the case above, DIFFERENT diagnosis. That distinction is
    // the entire reason this function exists.
  });

  it('a 401 through the binding is ANSWERED — not unreachable: something replied, and httpStatus says what', async () => {
    // DIAGNOSTIC-STATUS-SPLIT-1 — the conflation this removes is what made the last
    // diagnosis blame the platform: a service that answered perfectly well was
    // reported as « unreachable », pointing at a network that was fine.
    const result = await readSupplyCollection(bound({ service: 'offer-service', error: 'unauthorized' }, 401), NOW);
    expect(result.status).toBe('answered');
    expect(result.httpStatus).toBe(401);
  });

  it('THE TWO ARE NOW DISTINGUISHABLE: a thrown fetch and a non-2xx answer never share a status', async () => {
    const threw = await readSupplyCollection(
      { OFFER: { fetch: async () => { throw new Error('nothing came back'); } } },
      NOW,
    );
    const answered = await readSupplyCollection(bound({ service: 'offer-service' }, 500), NOW);
    expect(threw.status).toBe('unreachable'); // nothing came back
    expect(answered.status).toBe('answered'); // something came back
    expect(threw.status).not.toBe(answered.status);
    // …and only the one that answered can carry an httpStatus.
    expect(threw.httpStatus).toBeUndefined();
    expect(answered.httpStatus).toBe(500);
  });

  it('the vocabulary is a PROGRESSION — each status names the furthest point the exchange reached', async () => {
    // unconfigured → never called · unreachable → nothing back · answered → non-2xx
    // · malformed → 2xx, wrong shape · ok → 2xx, shaped, consumed.
    expect((await readSupplyCollection(undefined, NOW)).status).toBe('unconfigured');
    expect((await readSupplyCollection({ OFFER: { fetch: async () => { throw new Error('x'); } } }, NOW)).status).toBe('unreachable');
    expect((await readSupplyCollection(bound({}, 404), NOW)).status).toBe('answered');
    expect((await readSupplyCollection(bound({ notItems: true }), NOW)).status).toBe('malformed');
    expect((await readSupplyCollection(bound({ asOf: NOW, items: [] }), NOW)).status).toBe('ok');
  });

  it('a binding fetch that throws is UNREACHABLE, never a crash up the read path', async () => {
    const throwing: SupplySourceEnv = {
      OFFER: {
        fetch: async () => {
          throw new Error('binding down');
        },
      },
    };
    expect((await readSupplyCollection(throwing, NOW)).status).toBe('unreachable');
  });

  it('a STALE item is refused with reason `stale` AND names itself, so an operator knows which product', async () => {
    const stale = { ...BAZIN, asOf: minutesAgo(20) }; // past the 15-minute bound
    const result = await readSupplyCollection(bound({ asOf: NOW, items: [stale] }), NOW);
    expect(result.status).toBe('ok');
    expect(result.offers).toEqual([]); // the reseller surface still shows nothing
    expect(result.refusals).toEqual([{ productVersionId: 'pv-bazin-0001', reason: 'stale' }]);
  });

  it('a MALFORMED item is refused and does not take the good ones down with it', async () => {
    const result = await readSupplyCollection(bound({ asOf: NOW, items: [BAZIN, { nonsense: true }] }), NOW);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.productName).toBe('Bazin');
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]?.reason).toBe('not_a_read_model');
  });

  it('the REAL product parses to the eight canon fields, unaltered', async () => {
    const result = await readSupplyCollection(bound({ asOf: NOW, items: [BAZIN] }), NOW);
    expect(result.offers).toEqual([
      {
        productVersionId: 'pv-bazin-0001',
        offerVersion: 'ov-1',
        basePrice: 10_000,
        resellerCommission: 750,
        available: 10,
        productName: 'Bazin',
        assetRefs: [],
        category: 'fashion_bags_fabrics',
      },
    ]);
  });

  it('NO supplier identity or location rides through — zone is stripped at the producer and stays absent', async () => {
    const result = await readSupplyCollection(bound({ asOf: NOW, items: [BAZIN] }), NOW);
    const keys = Object.keys(result.offers[0] ?? {});
    expect(keys).not.toContain('zone');
    expect(keys).not.toContain('supplierId');
    expect(keys.sort()).toEqual(
      // CATEGORY-WIRE-1 — `category` joins the allowlist at canon v3.0.0. It is
      // the product's own category, not the supplier's: it names WHAT is being
      // sold, never WHO sells it, so it belongs on the buyer-safe side of this
      // assertion beside `productName`. `zone` and `supplierId` stay out.
      ['assetRefs', 'available', 'basePrice', 'category', 'offerVersion', 'productName', 'productVersionId', 'resellerCommission'].sort(),
    );
  });

  it('the bearer is SENT THROUGH THE BINDING when the secret is set, and OMITTED when it is not', async () => {
    // KEPT over the binding (founder ruling): boutik's Bearer gate is load-bearing
    // and the Authorization header flows fine through a service binding.
    const seen: Request[] = [];
    const spyEnv = (secret?: string): SupplySourceEnv => ({
      OFFER: {
        fetch: async (req: Request) => {
          seen.push(req);
          return { ok: true, status: 200, json: async () => ({ asOf: NOW, items: [] }), text: async () => '' } as unknown as Response;
        },
      },
      ...(secret !== undefined ? { SUPPLY_READ_SECRET: secret } : {}),
    });

    await readSupplyCollection(spyEnv('S'), NOW);
    expect(seen[0]?.headers.get('Authorization')).toBe('Bearer S');

    await readSupplyCollection(spyEnv(), NOW);
    // Absent secret ⇒ NO header, never a broken request: a 401 becomes the honest,
    // reportable answer.
    expect(seen[1]?.headers.get('Authorization')).toBeNull();
  });

  it('the binding is asked for THE COLLECTION ROUTE — the path still matters even with no public URL', async () => {
    const seen: Request[] = [];
    const env: SupplySourceEnv = {
      OFFER: {
        fetch: async (req: Request) => {
          seen.push(req);
          return { ok: true, status: 200, json: async () => ({ asOf: NOW, items: [] }), text: async () => '' } as unknown as Response;
        },
      },
    };
    await readSupplyCollection(env, NOW);
    expect(new URL(seen[0]!.url).pathname).toBe(SUPPLY_COLLECTION_ROUTE);
  });
});

/**
 * DIAGNOSTIC-TARGET-1 — A DIAGNOSTIC MUST NAME ITS TARGET, NOT ONLY ITS FAILURE.
 *
 * The first real fault this instrument met: `unreachable · 404 · refusals []` named
 * the LAYER in one request, then stopped helping — the base was a write-only secret
 * pointing at the wrong service, and the diagnostic never said which URL it had
 * called. With a binding the target is the BINDING NAME, readable in wrangler.toml;
 * `answeredBy` still matters, because a binding can point at the WRONG SERVICE in
 * config, and the responder naming itself is what exposes that in one read.
 */
describe('the diagnostic names its target', () => {
  it('the target rides every non-unconfigured outcome — including the healthy one — and is the binding name', async () => {
    const ok = await readSupplyCollection(bound({ asOf: NOW, items: [] }), NOW);
    expect(ok.target).toEqual({ base: SUPPLY_TARGET_BINDING });

    const down: SupplySourceEnv = {
      OFFER: {
        fetch: async () => {
          throw new Error('down');
        },
      },
    };
    expect((await readSupplyCollection(down, NOW)).target).toEqual({ base: SUPPLY_TARGET_BINDING });
  });

  it('THE REAL FAULT CLASS, replayed through the binding: a wrong bound SERVICE answering 404 names WHO answered — a diagnosis rather than a clue', async () => {
    // wrangler.toml could bind OFFER to the wrong service; media-service 404s
    // anything it does not route. The responder naming itself is what turns
    // « unreachable 404 » into « the OFFER binding reached MEDIA-SERVICE ».
    const result = await readSupplyCollection(bound({ service: 'media-service', status: 'not_found' }, 404), NOW);
    expect(result.status).toBe('answered');
    expect(result.httpStatus).toBe(404);
    expect(result.target).toEqual({ base: SUPPLY_TARGET_BINDING, answeredBy: 'media-service' });
  });

  it('a non-JSON upstream body is captured TRUNCATED — an arbitrary response never becomes an unbounded operator field', async () => {
    const hugeHtml: SupplySourceEnv = {
      OFFER: {
        fetch: async () =>
          ({ ok: false, status: 502, json: async () => null, text: async () => '<html>' + 'x'.repeat(10_000) }) as unknown as Response,
      },
    };
    const result = await readSupplyCollection(hugeHtml, NOW);
    expect(result.target?.answeredBy).toBeDefined();
    expect(result.target!.answeredBy!.length).toBeLessThanOrEqual(120);
  });

  it('whoAnswered prefers the self-reported service name and falls back to the bounded raw body', () => {
    expect(whoAnswered(JSON.stringify({ service: 'offer-service', error: 'x' }))).toBe('offer-service');
    expect(whoAnswered('plain text error')).toBe('plain text error');
    expect(whoAnswered('')).toBeUndefined();
    expect(whoAnswered('y'.repeat(500))!.length).toBe(120);
  });
});

/* ------------------------------------------------------ RESELLER-PHOTOS-1 -- */

describe('RESELLER-PHOTOS-1 — the browse wire carries ABSOLUTE photo urls', () => {
  const fresh = () => new Date().toISOString();
  const envWith = (base?: string) => ({
    OFFER: {
      fetch: async () =>
        Response.json({
          asOf: fresh(),
          items: [
            {
              version: 1,
              asOf: fresh(),
              value: {
                productVersionId: 'pv-photo-1',
                offerVersion: 'ov-1',
                basePrice: 10_000,
                resellerCommission: 750,
                available: 3,
                productName: 'Bazin',
                assetRefs: ['media/hero-square/cap-1', 'media/proof/cap-1'],
                category: 'fashion_bags_fabrics',
              },
            },
          ],
        }),
    },
    ...(base !== undefined ? { PRODUCT_MEDIA_BASE: base } : {}),
  });

  it('REFS ARE ABSOLUTIZED WITH THE SAME BASE AS THE BUYER WIRE — a phone can render them', async () => {
    // The founder's walk: boutik publishes WITH photos, Opportunités shows none.
    // The projection carries RELATIVE paths; an <Image uri> resolves a relative
    // path against nothing. The handler now joins PRODUCT_MEDIA_BASE exactly as
    // the buyer join does — one base, one function, two consumers.
    const res = await handleRequest(
      new Request('https://svc/supply-projections'),
      envWith('https://media-service.example.workers.dev') as never,
    );
    const body = (await res.json()) as { offers: { assetRefs: string[] }[] };
    expect(body.offers[0]!.assetRefs).toEqual([
      'https://media-service.example.workers.dev/media/hero-square/cap-1',
      'https://media-service.example.workers.dev/media/proof/cap-1',
    ]);
  });

  it('AN UNSET BASE YIELDS [] — the app draws its designed glyph tile, never a broken image', async () => {
    const res = await handleRequest(new Request('https://svc/supply-projections'), envWith() as never);
    const body = (await res.json()) as { offers: { assetRefs: string[] }[] };
    expect(body.offers[0]!.assetRefs).toEqual([]);
  });

  /* ---------------------------------------------------- VIDEO-PRODUIT -- */

  // `null` means NO CLIP — not `undefined`, which a defaulted parameter
  // silently replaces with the default (this helper's first cut did exactly
  // that and the no-clip case was secretly testing the with-clip case).
  const envWithClip = (base?: string, clip: string | null = 'media/video/vid-1') => ({
    OFFER: {
      fetch: async () =>
        Response.json({
          asOf: fresh(),
          items: [
            {
              version: 1,
              asOf: fresh(),
              value: {
                productVersionId: 'pv-clip-1',
                offerVersion: 'ov-1',
                basePrice: 10_000,
                resellerCommission: 750,
                available: 3,
                productName: 'Bazin',
                assetRefs: ['media/hero-square/cap-1'],
                category: 'fashion_bags_fabrics',
                ...(clip !== null ? { videoRef: clip } : {}),
              },
            },
          ],
        }),
    },
    ...(base !== undefined ? { PRODUCT_MEDIA_BASE: base } : {}),
  });

  const clipOf = async (env: object): Promise<{ videoRef?: string; assetRefs: string[] }> => {
    const res = await handleRequest(new Request('https://svc/supply-projections'), env as never);
    const body = (await res.json()) as { offers: { videoRef?: string; assetRefs: string[] }[] };
    return body.offers[0]!;
  };

  it('THE CLIP RIDES THIS WIRE TOO, absolutized through the SAME base as the photographs', async () => {
    const o = await clipOf(envWithClip('https://media-service.example.workers.dev'));
    expect(o.videoRef).toBe('https://media-service.example.workers.dev/media/video/vid-1');
    expect(o.assetRefs).toEqual(['https://media-service.example.workers.dev/media/hero-square/cap-1']);
  });

  it('AN UNSET BASE OMITS THE CLIP — the relative ref must NOT reach a phone', async () => {
    // THE RED CHECK for a naive `...o` spread: with the base set the absolute
    // ref masks the leak; only here does `media/video/vid-1` survive into a
    // device that resolves it against nothing and plays nothing.
    const o = await clipOf(envWithClip(undefined));
    expect('videoRef' in o).toBe(false);
  });

  it('NO CLIP ⇒ no key, base set or not — never invented', async () => {
    const o = await clipOf(envWithClip('https://media-service.example.workers.dev', null));
    expect('videoRef' in o).toBe(false);
    expect(o.assetRefs).toHaveLength(1); // photos untouched by the clip's absence
  });
});
