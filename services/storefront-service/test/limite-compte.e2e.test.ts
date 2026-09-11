import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ LIMITE-REVENDEUSE-1 — THE RESELLER'S TWO DOORS, EACH ITS OWN BUDGET, ON THE REAL BUNDLE ═══
 *
 * The real combined Worker on miniflare, with miniflare's OWN rate limiters
 * bound under the two names wrangler.toml declares for the reseller —
 * and NONE for the buyer's doors, which is the control that the budgets are
 * separate. What must be true, and is asked here:
 *
 *   · signup: within the ceiling every ask from one address REACHES the door
 *     (the book answers its own word to an empty body — never the ceiling's);
 *     the ask past it is `429 { ok:false, reason:'too_many_requests' }` with a
 *     `Retry-After` and the reseller surface's CORS, so the app reads « attendez »;
 *     another address is untouched;
 *   · login has its OWN budget: an address whose signup budget is spent still
 *     logs in; past its own ceiling the same refusal;
 *   · the PBKDF2 probe (`GET /health?pbkdf2=1`) answers the live count and
 *     SPENDS the login budget — it costs what a login costs; a plain /health
 *     carries no probe and costs nothing;
 *   · the buyer's budgets are SEPARATE: with the create budget spent first,
 *     signups and logins from the same address still reach their doors, and
 *     the create door's own refusal stands on its own count.
 *
 * MINIFLARE'S LIMITER IS A FIXED WINDOW aligned on the wall clock; `beforeAll`
 * waits out the last seconds of a minute so the walk cannot straddle a reset.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const A = '203.0.113.9';
const B = '198.51.100.7';
const C = '192.0.2.44';
const PERIODE_MS = 60_000;
const MARGE_MS = 5_000;

const persist = mkdtempSync(join(tmpdir(), 'limite-revendeuse-'));
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
  ratelimits: {
    // The buyer's two limiters are bound TOO, at small ceilings, so « separate
    // budgets » is proven by spending one and watching the others stand —
    // not by a door that was open for want of a binding (verifier, MINOR 1).
    LIMITE_TUILES: { namespace_id: '1001', simple: { limit: 2, period: 60 } },
    LIMITE_CREATIONS: { namespace_id: '1002', simple: { limit: 2, period: 60 } },
    LIMITE_INSCRIPTIONS: { namespace_id: '1003', simple: { limit: 2, period: 60 } },
    LIMITE_CONNEXIONS: { namespace_id: '1004', simple: { limit: 3, period: 60 } },
  },
});

beforeAll(async () => {
  await mf.ready;
  const reste = PERIODE_MS - (Date.now() % PERIODE_MS);
  if (reste < MARGE_MS) await new Promise((r) => setTimeout(r, reste + 50));
}, 15_000);

afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

const de = (ip: string, path: string, init: RequestInit = {}): Promise<Response> =>
  mf.dispatchFetch(`https://svc${path}`, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), 'CF-Connecting-IP': ip } });
const corps = { headers: { 'Content-Type': 'application/json' }, method: 'POST', body: '{}' } as const;

describe('LIMITE-REVENDEUSE-1 — signup and login, two budgets per address', () => {
  it('signup: the asks within the ceiling reach the book; the one past it is 429 by name, readable by the app; login is a SEPARATE budget; another address is untouched', async () => {
    // FIRST the buyer's create budget is SPENT from address A — so whatever the
    // reseller doors answer below, it cannot be that budget speaking for them.
    for (let i = 0; i < 2; i += 1) expect((await de(A, '/checkout/quote', corps)).status, `create ${i + 1} of 2`).not.toBe(429);
    expect((await de(A, '/checkout/quote', corps)).status).toBe(429);
    // Two signups within the ceiling: the book's own answer to an empty body
    // (a 400 by field), never the ceiling's — the door itself was reached.
    for (let i = 0; i < 2; i += 1) {
      const res = await de(A, '/reseller/signup', corps);
      expect(res.status, `signup ${i + 1} of 2`).not.toBe(429);
    }
    const trop = await de(A, '/reseller/signup', corps);
    expect(trop.status).toBe(429);
    expect(await trop.json()).toEqual({ ok: false, reason: 'too_many_requests' });
    expect(trop.headers.get('retry-after')).toBe('60');
    expect(trop.headers.get('access-control-allow-origin')).toBe('*');
    // The signup budget is spent, and A still LOGS IN: three asks reach the
    // book (401 bad_credentials to an empty body), the fourth is the ceiling's.
    for (let i = 0; i < 3; i += 1) {
      const res = await de(A, '/reseller/login', corps);
      expect(res.status, `login ${i + 1} of 3`).toBe(401);
    }
    const tropLogin = await de(A, '/reseller/login', corps);
    expect(tropLogin.status).toBe(429);
    expect(await tropLogin.json()).toEqual({ ok: false, reason: 'too_many_requests' });
    // Another address has its own budgets.
    expect((await de(B, '/reseller/signup', corps)).status).not.toBe(429);
    expect((await de(B, '/reseller/login', corps)).status).toBe(401);
    // A preflight is never refused, budget or no budget.
    expect((await de(A, '/reseller/login', { method: 'OPTIONS' })).status).toBe(204);
  });

  it('the PBKDF2 probe answers the live count and SPENDS the login budget; a plain /health costs nothing', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await de(C, '/health?pbkdf2=1');
      expect(res.status, `probe ${i + 1} of 3`).toBe(200);
      const body = (await res.json()) as { pbkdf2?: { iterations?: number; ok?: boolean; digest?: string } };
      expect(body.pbkdf2?.iterations).toBe(100_000);
      expect(body.pbkdf2?.ok).toBe(true);
      expect(body.pbkdf2?.digest).toMatch(/^[0-9a-f]{16}$/);
    }
    // The fourth ask on C's login budget — a real login — is refused: the
    // probe spent it, as it must (it costs what a login costs).
    expect((await de(C, '/reseller/login', corps)).status).toBe(429);
    // …and a further probe is refused too, in the read surface's shape.
    const tropSonde = await de(C, '/health?pbkdf2=1');
    expect(tropSonde.status).toBe(429);
    expect(await tropSonde.json()).toEqual({ error: 'too_many_requests' });
    // A HEAD with the flag is neither counted nor refused: it derives nothing
    // (the service runs the probe on GET only), so there is nothing to bound.
    expect((await de(C, '/health?pbkdf2=1', { method: 'HEAD' })).status).toBe(200);
    // A plain /health from the same spent address: 200, no probe field — it
    // was neither counted nor derived.
    const sante = await de(C, '/health');
    expect(sante.status).toBe(200);
    expect((await sante.json()) as Record<string, unknown>).not.toHaveProperty('pbkdf2');
  });
});
