import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ ORIGINE-ACHETEUSE — THE BUYER SITE HAS ITS OWN ADDRESS ═══
 *
 * The buyer site moves to an address of its own, so what her phone keeps (her
 * session, her order keys, her door keys) shares an origin with no other page.
 * Asked of the real combined Worker on workerd, door by door:
 *   · her new address is the one each buyer door answers to;
 *   · the old address is still answered while old links forward from it — by
 *     name, the exact old origin, never a pattern;
 *   · any third origin is never named back, so its browser refuses the answer;
 *   · every such answer says `Vary: Origin`, so no cache hands one origin's
 *     answer to the other;
 *   · the founder console's doors and the reseller's `*` doors are untouched.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const NOUVELLE = 'https://shop-plus.pages.dev';
const ANCIENNE = 'https://beurni2.github.io';
const TIERCE = 'https://autre-page.github.io';
const CONSOLE = 'https://boutik-plus-web.pages.dev';
const DOS = {
  STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
  ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
  DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
};

const persist = mkdtempSync(join(tmpdir(), 'origine-acheteuse-'));
const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { ...DOS, COMPTES_CLIENTES: 'BuyerAccountsDO' },
  durableObjectsPersist: persist,
  bindings: {},
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

type Porte = { nom: string; methode: 'GET' | 'POST' | 'OPTIONS'; chemin: string };
/** One door of each buyer family, its answer and its preflight. */
const PORTES: Porte[] = [
  { nom: 'lecture boutique', methode: 'GET', chemin: '/s/aicha-4821' },
  { nom: 'lecture boutique (preflight)', methode: 'OPTIONS', chemin: '/s/aicha-4821' },
  { nom: 'santé', methode: 'GET', chemin: '/health' },
  { nom: 'prix (checkout)', methode: 'POST', chemin: '/checkout/quote' },
  { nom: 'prix (preflight)', methode: 'OPTIONS', chemin: '/checkout/quote' },
  { nom: 'commande (checkout)', methode: 'POST', chemin: '/checkout/order' },
  { nom: 'liste', methode: 'POST', chemin: '/listes' },
  { nom: 'liste (preflight)', methode: 'OPTIONS', chemin: '/listes' },
  { nom: 'compte cliente', methode: 'POST', chemin: '/buyer/login' },
  { nom: 'compte cliente (preflight)', methode: 'OPTIONS', chemin: '/buyer/login' },
];

function frapper(p: Porte, origine: string): Promise<Response> {
  const headers: Record<string, string> = { Origin: origine };
  if (p.methode === 'POST') headers['Content-Type'] = 'application/json';
  if (p.methode === 'OPTIONS') {
    headers['Access-Control-Request-Method'] = 'POST';
    headers['Access-Control-Request-Headers'] = 'content-type';
  }
  return mf.dispatchFetch(`https://svc${p.chemin}`, {
    method: p.methode,
    headers,
    ...(p.methode === 'POST' ? { body: '{}' } : {}),
  });
}

describe('the buyer doors answer her own address', () => {
  for (const p of PORTES) {
    it(`${p.nom}: the new address is named back, with Vary: Origin`, async () => {
      const r = await frapper(p, NOUVELLE);
      await r.arrayBuffer();
      expect(r.headers.get('access-control-allow-origin')).toBe(NOUVELLE);
      expect(r.headers.get('vary') ?? '').toMatch(/\bOrigin\b/);
    }, 60_000);

    it(`${p.nom}: the old address is still named back while its links forward`, async () => {
      const r = await frapper(p, ANCIENNE);
      await r.arrayBuffer();
      expect(r.headers.get('access-control-allow-origin')).toBe(ANCIENNE);
      expect(r.headers.get('vary') ?? '').toMatch(/\bOrigin\b/);
    }, 60_000);

    it(`${p.nom}: a third origin is never named back`, async () => {
      const r = await frapper(p, TIERCE);
      await r.arrayBuffer();
      const accordee = r.headers.get('access-control-allow-origin');
      expect(accordee).not.toBe(TIERCE);
      expect(accordee).not.toBe('*');
      expect(accordee).toBe(NOUVELLE);
    }, 60_000);
  }

  it('an answer with no Origin at all names the new address', async () => {
    const r = await mf.dispatchFetch('https://svc/health');
    await r.arrayBuffer();
    expect(r.headers.get('access-control-allow-origin')).toBe(NOUVELLE);
  }, 60_000);
});

describe('doors that are not the buyer site are untouched', () => {
  for (const origine of [NOUVELLE, ANCIENNE, TIERCE]) {
    it(`the founder console door still names only the console (asked from ${origine})`, async () => {
      const r = await mf.dispatchFetch('https://svc/buyer/accounts/recovery-code', {
        method: 'OPTIONS',
        headers: { Origin: origine, 'Access-Control-Request-Method': 'POST' },
      });
      await r.arrayBuffer();
      expect(r.headers.get('access-control-allow-origin')).toBe(CONSOLE);
    }, 60_000);

    it(`the reseller door still answers * (asked from ${origine})`, async () => {
      const r = await mf.dispatchFetch('https://svc/reseller/ventes', {
        method: 'OPTIONS',
        headers: { Origin: origine, 'Access-Control-Request-Method': 'GET' },
      });
      await r.arrayBuffer();
      expect(r.headers.get('access-control-allow-origin')).toBe('*');
    }, 60_000);
  }
});
