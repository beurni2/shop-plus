import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index.js';

/**
 * VIDEO-PRODUIT × PRODUCT-MEDIA-BASE — the ABSOLUTIZE seam for the clip ref,
 * pinned at the REAL handler (verifier M4, 2026-08-03).
 *
 * The images' law already holds by test: an unset `PRODUCT_MEDIA_BASE` yields
 * `assetRefs: []` — the designed no-image state, never a bare relative ref.
 * The clip must obey the SAME law, and the tempting wrong build is precisely
 * the naive `...described` spread: with the base set it looks identical
 * (the absolute videoRef overwrites the relative one), and only with the base
 * UNSET does the relative `media/v-…` survive the spread into the record —
 * where the buyer renders it into `src`, resolves it against the PWA's own
 * origin, and draws a broken player. These tests exist to make that build RED.
 */

const SF = {
  id: 'sf-video-0001',
  resellerId: 'res_aicha',
  slug: 'aicha-video',
  name: 'Chez Aïcha Mode',
  zone: 'Gounghin, Ouagadougou',
  category: 'mode',
  tagline: '',
  bio: '',
  theme: 'indigo',
  cover: { status: 'none' },
  avatar: { mode: 'monogram' },
  curatedItems: ['pv-video-1'],
  featuredItems: [],
  sections: [],
  discoverable: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

/** The producer's 200 shape — canon envelope, fresh, with the optional clip. */
const freshEnvelope = (value: Record<string, unknown> = {}): unknown => ({
  version: 1,
  asOf: new Date().toISOString(),
  value: {
    productVersionId: 'pv-video-1',
    offerVersion: 'ov-1',
    basePrice: 10_000,
    resellerCommission: 750,
    available: 3,
    productName: 'Bazin riche brodé',
    assetRefs: ['media/p-cover'],
    category: 'fashion_bags_fabrics',
    ...value,
  },
});

const storefrontDo = () => ({
  fetch: async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url);
    if (req.method === 'GET' && pathname === `/s/${SF.slug}`) return Response.json(SF);
    return Response.json({ error: 'not_found' }, { status: 404 });
  },
});

const listingDo = () => ({
  fetch: async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url);
    if (req.method === 'GET' && pathname.startsWith('/listings/by-pid/')) {
      return Response.json({
        listingId: 'lst-video-0001',
        productVersionId: 'pv-video-1',
        customerPriceFcfa: 11_900,
        status: 'published',
      });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  },
});

const offerAnswering = (body: unknown) => ({
  fetch: async (): Promise<Response> =>
    ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as unknown as Response,
});

type Rec = { pid: string; assetRefs: string[]; videoRef?: string };

const read = async (env: object): Promise<Rec> => {
  const res = await handleRequest(new Request(`https://svc/s/${SF.slug}`), {
    STOREFRONT_DO: storefrontDo(),
    LISTING_DO: listingDo(),
    ...env,
  } as never);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { products: Rec[] };
  expect(body.products).toHaveLength(1);
  return body.products[0]!;
};

describe('VIDEO-PRODUIT — the clip ref through PRODUCT_MEDIA_BASE, at the real read path', () => {
  it('BASE SET ⇒ the record carries the ABSOLUTE videoRef, same origin as the images', async () => {
    const rec = await read({
      OFFER: offerAnswering(freshEnvelope({ videoRef: 'media/v-abc' })),
      PRODUCT_MEDIA_BASE: 'https://media.boutik.example',
    });
    expect(rec.videoRef).toBe('https://media.boutik.example/media/v-abc');
    expect(rec.assetRefs).toEqual(['https://media.boutik.example/media/p-cover']); // one base, both kinds
  });

  it('BASE UNSET ⇒ the videoRef key is ABSENT — the relative ref must NOT survive the spread', async () => {
    // THE M4 RED CHECK: `{ ...described, assetRefs: … }` keeps `videoRef:
    // 'media/v-abc'` alive here and only here — every other case masks it.
    const rec = await read({ OFFER: offerAnswering(freshEnvelope({ videoRef: 'media/v-abc' })) });
    expect('videoRef' in rec).toBe(false);
    expect(rec.assetRefs).toEqual([]); // the images' existing law, same seam
  });

  it("BASE EMPTY ('') ⇒ same honest absence as unset", async () => {
    const rec = await read({
      OFFER: offerAnswering(freshEnvelope({ videoRef: 'media/v-abc' })),
      PRODUCT_MEDIA_BASE: '',
    });
    expect('videoRef' in rec).toBe(false);
  });

  it('NO CLIP on the projection ⇒ no videoRef key, base set or not — never invented', async () => {
    const rec = await read({
      OFFER: offerAnswering(freshEnvelope()),
      PRODUCT_MEDIA_BASE: 'https://media.boutik.example',
    });
    expect('videoRef' in rec).toBe(false);
    expect(rec.assetRefs).toEqual(['https://media.boutik.example/media/p-cover']); // photos untouched
  });
});
