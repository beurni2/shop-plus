import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, cleC, seance } from './seance';

/**
 * ═══ CODES-RETIRES-1 (founder ruling 2026-09-30, Boutik+ AUDIT-B+2 F-73) —
 * the old `SP-` feed codes are RETIRED, on the real built Worker ═══
 *
 * « Retire them. » Since RESELLER-ACCOUNTS-1 a reseller reads her sales with
 * HER ACCOUNT's session; the old feed codes the founder minted by hand could
 * no longer let anyone into the app, yet they still read her sales, and one
 * minted for a paused reseller still did. So:
 *
 * · the four founder doors that minted, listed, reread and cut them are
 *   gone: even on his key they answer as a door that never existed;
 * · a code minted BEFORE the retirement (still in the book's storage — it is
 *   not wiped) opens NOTHING: her sales answer the one uniform 401;
 * · her account session still opens her own sales (the control).
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'codes-retires-'));
const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');

/** A code the retired mint handed out, and the reseller it was minted for. */
const ANCIEN = 'SP-ABCD-EFGH-IJKL-MNOP';
const ANCIENNE_ID = 'rs-0042';

/**
 * BEFORE THE DEPLOY: the feed book's storage as the retired mint left it, on
 * the SAME persisted store the real Worker then opens. A stand-in object of
 * the same class name writes the two records the old `/code/mint` wrote (the
 * hash door and the founder-side pointer that kept the plaintext) and a sale
 * row — nothing else. A code that still opened the door would come back with
 * that row, so an empty or refused answer cannot hide a live door.
 */
async function laisserUnAncienCode(): Promise<void> {
  const mintedAt = '2026-08-10T08:00:00.000Z';
  const avant = new Miniflare({
    modules: true,
    script: `
      export class ResellerFeedDO {
        constructor(state) { this.state = state; }
        async fetch(request) { await this.state.storage.put(await request.json()); return new Response('ok'); }
      }
      export default {
        async fetch(request, env) { return env.RESELLER.get(env.RESELLER.idFromName('reseller-feed')).fetch(request); }
      };`,
    durableObjects: { RESELLER: 'ResellerFeedDO' },
    durableObjectsPersist: persist,
  });
  await avant.dispatchFetch('http://seed/', {
    method: 'POST',
    body: JSON.stringify({
      [`codehash:${sha256(ANCIEN)}`]: { resellerId: ANCIENNE_ID, mintedAt },
      [`resellercode:${ANCIENNE_ID}`]: { hash: sha256(ANCIEN), mintedAt, code: ANCIEN },
      [`row:${ANCIENNE_ID}:ord-cr-1`]: { orderId: 'ord-cr-1', at: mintedAt },
    }),
  });
  await avant.dispose();
}

let mf: Miniflare;
beforeAll(async () => {
  await laisserUnAncienCode();
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO',
      LISTING: 'ListingDO',
      CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
      DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO',
      COMPTES: 'ResellerAccountsDO',
    },
    durableObjectsPersist: persist,
    bindings: {
      PAYMENT_WEBHOOK_SECRET: 'test-payment-webhook-secret-cr001',
      FULFILLMENT_WRITE_SECRET: 'test-fulfillment-write-secret-cr001',
      CHECKOUT_OPS_SECRET: OPS_SECRET,
    },
  });
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

describe('CODES-RETIRES-1 — the old feed codes open nothing and are made nowhere', () => {
  it('the founder’s four code doors are gone: on his key AND on an admitted reseller’s session they answer exactly as a door that never existed — nothing is minted, listed, reread or cut', async () => {
    // Two credentials, because they meet different gates: his key is refused
    // at the write gate before any POST is routed, so a door re-added BELOW
    // that gate would only show on a caller the gate lets through — her.
    const S = await seance(mf, 'portes');
    for (const [qui, headers] of [
      ['key C', cleC],
      ['her session', { Authorization: `Bearer ${S.session}` }],
    ] as const) {
      /** The answer this Worker gives a door that never existed, for a method. */
      const jamais = async (method: 'GET' | 'POST'): Promise<{ status: number; text: string }> => {
        const res = await mf.dispatchFetch('http://c/reseller/porte-qui-n-a-jamais-existe', {
          method,
          headers,
          ...(method === 'POST' ? { body: JSON.stringify({ resellerId: 'rs-0001' }) } : {}),
        });
        return { status: res.status, text: await res.text() };
      };
      for (const [path, method] of [
        ['/reseller/code', 'POST'],
        ['/reseller/code/revoke', 'POST'],
        ['/reseller/code/reveal', 'POST'],
        ['/reseller/codes', 'GET'],
      ] as const) {
        const res = await mf.dispatchFetch(`http://c${path}`, {
          method,
          headers,
          ...(method === 'POST' ? { body: JSON.stringify({ resellerId: 'rs-0001' }) } : {}),
        });
        const text = await res.text();
        const attendu = await jamais(method);
        expect(attendu.status, 'a door that never existed is refused').not.toBe(200);
        expect({ status: res.status, text }, `${method} ${path} on ${qui}`).toEqual(attendu);
        expect(text.includes('"code"'), `${path} must hand out no code`).toBe(false);
      }
    }
  });

  it('a code minted BEFORE the retirement, still in the book, opens NOTHING — her sales answer the one 401', async () => {
    // Precondition: the old records really are in the store this Worker reads
    // — the row her id owns comes back through the id-keyed projection.
    const ns = await mf.getDurableObjectNamespace('RESELLER');
    const rows = await ns.get(ns.idFromName('reseller-feed')).fetch('https://do/rows', {
      method: 'POST',
      body: JSON.stringify({ resellerId: ANCIENNE_ID }),
    });
    expect(((await rows.json()) as { orders?: unknown[] }).orders?.length, 'the seeded store is the one this Worker reads').toBe(1);

    const res = await mf.dispatchFetch('http://c/reseller/ventes', { headers: { Authorization: `Bearer ${ANCIEN}` } });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"error":"unauthorized"}');
  });

  it('CONTROL — her account session still opens her own sales', async () => {
    const S = await seance(mf, 'controle');
    const res = await mf.dispatchFetch('http://c/reseller/ventes', { headers: { Authorization: `Bearer ${S.session}` } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; ventes?: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.ventes)).toBe(true);
  });
});
