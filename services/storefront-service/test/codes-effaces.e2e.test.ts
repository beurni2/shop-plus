import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance } from './seance';

/**
 * ═══ CODES-EFFACES-1 (founder order 2026-09-30: « erase the old codes still
 * stored on shop+ server ») — the retired `SP-` records are ERASED, on the
 * real built Worker, and the book is asked afterwards ═══
 *
 * CODES-RETIRES-1 closed every door the old codes opened but left their
 * records in the feed book: `codehash:*` (the hash door) and `resellercode:*`
 * (the founder-side pointer, which kept each code IN CLEAR). This walk writes
 * a store exactly as the retired mint left it — more records than one delete
 * call takes, so the erase must page — then runs the REAL Worker over that
 * store and wakes the book the way production does (her sales read), then
 * reopens the store with a plain reader and asks it what is left: no old
 * record, every sale row intact, and the erase's own receipt.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'codes-effaces-'));
const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');
/** More than the 128 keys one storage delete accepts, per prefix. */
const N = 130;
const LIGNES = ['row:rs-0042:ord-ce-1', 'row:rs-0042:ord-ce-2', 'row:rs-0107:ord-ce-3'];

/** A stand-in object of the same class name, over the same store: it writes
 *  what it is sent, or lists everything the store holds. Nothing else. */
async function magasin<T>(corps: unknown): Promise<T> {
  const mf = new Miniflare({
    modules: true,
    script: `
      export class ResellerFeedDO {
        constructor(state) { this.state = state; }
        async fetch(request) {
          const body = await request.json();
          if (body === 'lister') return Response.json(Object.fromEntries(await this.state.storage.list()));
          await this.state.storage.put(body);
          return Response.json({ ok: true });
        }
      }
      export default {
        async fetch(request, env) { return env.RESELLER.get(env.RESELLER.idFromName('reseller-feed')).fetch(request); }
      };`,
    durableObjects: { RESELLER: 'ResellerFeedDO' },
    durableObjectsPersist: persist,
  });
  try {
    const res = await mf.dispatchFetch('http://magasin/', { method: 'POST', body: JSON.stringify(corps) });
    return (await res.json()) as T;
  } finally {
    await mf.dispose();
  }
}

function laisseParLAncienneMonnaie(): Record<string, unknown> {
  const mintedAt = '2026-08-10T08:00:00.000Z';
  const recs: Record<string, unknown> = {};
  for (let i = 0; i < N; i += 1) {
    const code = `SP-OLD${String(i).padStart(4, '0')}-AAAA-BBBB-CCCC`;
    const resellerId = `rs-${String(i).padStart(4, '0')}`;
    recs[`codehash:${sha256(code)}`] = { resellerId, mintedAt };
    recs[`resellercode:${resellerId}`] = { hash: sha256(code), mintedAt, code };
  }
  for (const k of LIGNES) recs[k] = { orderId: k.split(':')[2], at: mintedAt };
  return recs;
}

let apres: Record<string, unknown> = {};
beforeAll(async () => {
  // put() takes at most 128 pairs per call, like delete — the seed pages too.
  const tout = Object.entries(laisseParLAncienneMonnaie());
  for (let i = 0; i < tout.length; i += 100) await magasin(Object.fromEntries(tout.slice(i, i + 100)));
  const avant = await magasin<Record<string, unknown>>('lister');
  expect(Object.keys(avant).filter((k) => k.startsWith('resellercode:')).length, 'the seed is in the store').toBe(N);

  const mf = new Miniflare({
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
      PAYMENT_WEBHOOK_SECRET: 'test-payment-webhook-secret-ce001',
      FULFILLMENT_WRITE_SECRET: 'test-fulfillment-write-secret-ce001',
      CHECKOUT_OPS_SECRET: OPS_SECRET,
    },
  });
  try {
    // The book wakes the way production wakes it: a reseller reads her sales.
    const S = await seance(mf, 'efface');
    const res = await mf.dispatchFetch('http://c/reseller/ventes', { headers: { Authorization: `Bearer ${S.session}` } });
    expect(res.status, 'her sales read must answer').toBe(200);
  } finally {
    await mf.dispose();
  }
  apres = await magasin<Record<string, unknown>>('lister');
});
afterAll(() => {
  rmSync(persist, { recursive: true, force: true });
});

describe('CODES-EFFACES-1 — the old codes are erased from the store the Worker opens', () => {
  it('no old record is left — neither the hash door nor the pointer that kept each code in clear', () => {
    const restes = Object.keys(apres).filter((k) => k.startsWith('codehash:') || k.startsWith('resellercode:'));
    expect(restes.length, `${restes.length} old records left, e.g. ${restes.slice(0, 2).join(', ')}`).toBe(0);
    expect(JSON.stringify(apres).includes('SP-OLD'), 'no code in clear anywhere in the store').toBe(false);
  });

  it('every sale row is kept — her sales index is not touched', () => {
    for (const k of LIGNES) expect(apres[k], `${k} was erased`).toBeDefined();
  });

  it('the erase leaves its receipt: when, and how many records it erased', () => {
    const recu = apres['purge:codes-retires'] as { at?: unknown; erased?: unknown } | undefined;
    expect(recu, `no receipt among ${Object.keys(apres).length} keys`).toBeDefined();
    expect(recu!.erased).toBe(2 * N);
    expect(typeof recu!.at).toBe('string');
  });
});
