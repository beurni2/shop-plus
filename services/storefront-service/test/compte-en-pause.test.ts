import { describe, expect, it } from 'vitest';
import { compteEnPause, RESELLER_ACCOUNTS_NAME } from '../worker/reseller-accounts-do.js';

/**
 * ═══ PAUSE-VENTE-1 — THE ACCESS PORT'S ONE LAW, pinned at the boundary ═══
 *
 * `compteEnPause` is what the buyer's three doors ask before a paused
 * reseller could sell (her page, the quote, the order). Its law: TRUE only on
 * the book's POSITIVE « paused »; FALSE on everything else — because an
 * outage that closed every shop would be a worse failure than one paused
 * reseller selling for the length of a hiccup. That « everything else » is
 * enumerated here, one case each, so a future edit that fails CLOSED on a 500
 * (and takes the whole platform's shops down with the book) turns this file
 * red.
 *
 * THE DOUBLE, AND ITS BOUND: the Durable Object NAMESPACE binding — `get` and
 * `idFromName` — with a scripted `fetch`. It records the request the port
 * sends (path, method, body), so the CALL SITE is asserted, not assumed. It
 * claims nothing about the real book's answers: those are proven on workerd
 * in `pause-vente.e2e.test.ts`.
 */

interface Appel { path: string; method: string; body: string }

function livre(reponse: () => Promise<Response> | Response, appels: Appel[] = []) {
  const ns = {
    idFromName: (name: string) => ({ name }),
    get: (id: { name: string }) => ({
      fetch: async (req: Request): Promise<Response> => {
        appels.push({ path: new URL(req.url).pathname, method: req.method, body: await req.text() });
        expect(id.name, 'the ONE singleton book').toBe(RESELLER_ACCOUNTS_NAME);
        return reponse();
      },
    }),
  } as unknown as DurableObjectNamespace;
  return { env: { COMPTES: ns }, appels };
}

const json = (status: number, body: unknown): Response => Response.json(body, { status });

describe('compteEnPause — true only on a positive « paused »', () => {
  it('asks the book /state-of for exactly that account, and reads « paused » as TRUE', async () => {
    const { env, appels } = livre(() => json(200, { ok: true, state: 'paused' }));
    expect(await compteEnPause(env, 'rs-0042')).toBe(true);
    expect(appels).toEqual([{ path: '/state-of', method: 'POST', body: '{"accountId":"rs-0042"}' }]);
  });

  it('an ACTIVE account is not paused; a PENDING one is not paused either', async () => {
    expect(await compteEnPause(livre(() => json(200, { ok: true, state: 'active' })).env, 'rs-1')).toBe(false);
    expect(await compteEnPause(livre(() => json(200, { ok: true, state: 'pending_access' })).env, 'rs-1')).toBe(false);
  });

  it('FAIL-OPEN, enumerated: no binding · an absent account (404) · a 500 · a thrown fetch · an unreadable body · a paused word on a non-200', async () => {
    expect(await compteEnPause({}, 'rs-1'), 'no binding').toBe(false);
    expect(await compteEnPause(livre(() => json(404, { ok: false, reason: 'not_found' })).env, 'rs-1'), 'absent').toBe(false);
    expect(await compteEnPause(livre(() => json(500, { ok: false })).env, 'rs-1'), 'a 500').toBe(false);
    expect(await compteEnPause(livre(() => Promise.reject(new Error('down'))).env, 'rs-1'), 'a thrown fetch').toBe(false);
    expect(await compteEnPause(livre(() => new Response('<html>', { status: 200 })).env, 'rs-1'), 'not JSON').toBe(false);
    expect(await compteEnPause(livre(() => json(503, { ok: true, state: 'paused' })).env, 'rs-1'), 'paused on a 503 is not the book speaking').toBe(false);
    expect(await compteEnPause(livre(() => json(200, { ok: false, state: 'paused' })).env, 'rs-1'), 'ok:false is a refusal, not a state').toBe(false);
  });
});
