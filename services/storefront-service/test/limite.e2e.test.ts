import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ LIMITE-ANONYME-1 — THE CEILING, ON THE REAL BUNDLE ═══
 *
 * The real combined Worker on miniflare, with miniflare's OWN rate limiters
 * bound under the names wrangler.toml declares — small ceilings so the walk
 * can cross them. What must be true, and is asked here:
 *
 *   · the map tiles: within the ceiling every ask from one address is served
 *     (the first reaches the scripted host, the rest the edge copy — the
 *     ceiling counts ASKS, not misses, because every ask spends the budget);
 *     the ask past the ceiling is `429 too_many_requests` with a
 *     `Retry-After`; another address is untouched;
 *   · the anonymous create doors share ONE budget: quote asks and order asks
 *     from one address count together, the ask past the ceiling is a 429
 *     the browser can READ (the read CORS rides it), and a bare read of a
 *     quote by id is never counted — only creation is bounded;
 *   · a Worker bound with NO limiter leaves every door open (fail open) — the
 *     other suites, which bind none, are that proof; here the tile suite's
 *     own miniflare is the control.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 4, 4]);
const A = '203.0.113.9';
const B = '198.51.100.7';

const persist = mkdtempSync(join(tmpdir(), 'limite-anonyme-'));
const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
    DLQ: 'DeadLetterDO',
  },
  durableObjectsPersist: persist,
  bindings: {},
  // The names wrangler.toml declares, with ceilings a test can cross.
  ratelimits: {
    LIMITE_TUILES: { namespace_id: '1001', simple: { limit: 3, period: 60 } },
    LIMITE_CREATIONS: { namespace_id: '1002', simple: { limit: 2, period: 60 } },
  },
  outboundService: async (): Promise<Response> =>
    new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' } }),
});

beforeAll(async () => {
  await mf.ready;
});

afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const de = (ip: string, path: string, init: RequestInit = {}): Promise<Response> =>
  mf.dispatchFetch(`https://svc${path}`, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), 'CF-Connecting-IP': ip } });

describe('LIMITE-ANONYME-1 — the map tiles', () => {
  it('within the ceiling every ask from one address is served; the ask past it is 429 by name; another address is untouched', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await de(A, '/tiles/17/65432/32109.png');
      expect(res.status, `ask ${i + 1} of 3`).toBe(200);
    }
    const trop = await de(A, '/tiles/17/65432/32109.png');
    expect(trop.status).toBe(429);
    expect(trop.headers.get('retry-after')).toBe('60');
    expect(await trop.json()).toEqual({ error: 'too_many_requests' });
    // A different tile from the same address is the same budget, spent.
    expect((await de(A, '/tiles/17/1/2.png')).status).toBe(429);
    // Another address has its own budget.
    expect((await de(B, '/tiles/17/65432/32109.png')).status).toBe(200);
  });
});

describe('LIMITE-ANONYME-1 — the anonymous create doors', () => {
  const corps = { headers: { 'Content-Type': 'application/json' }, method: 'POST', body: '{}' } as const;

  it('quote and order asks share one budget per address; the ask past it is a 429 the browser can read; a read by id is never counted', async () => {
    // Two creates within the ceiling: whatever the door answers to an empty
    // body, it is NOT the ceiling's refusal — the door itself was reached.
    const un = await de(A, '/checkout/quote', corps);
    expect(un.status).not.toBe(429);
    const deux = await de(A, '/checkout/order', corps);
    expect(deux.status).not.toBe(429);
    // The third create, on either door, is over the ceiling — named, readable.
    const trop = await de(A, '/checkout/quote', corps);
    expect(trop.status).toBe(429);
    expect(await trop.json()).toEqual({ error: 'too_many_requests' });
    expect(trop.headers.get('access-control-allow-origin')).toBe('https://beurni2.github.io');
    expect((await de(A, '/checkout/order', corps)).status).toBe(429);
    // Reads are not creates: a quote read by id from the same address answers
    // the door's own word (a 404 for an unknown quote), never the ceiling's.
    const lecture = await de(A, '/checkout/quote/zz-no-such-quote');
    expect(lecture.status).not.toBe(429);
    // Another address still creates.
    expect((await de(B, '/checkout/quote', corps)).status).not.toBe(429);
  });
});
