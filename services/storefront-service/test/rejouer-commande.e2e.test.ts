import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ COMMANDE-REJOUER-1 (AUDIT-SHOP-1 slice c) — A LOST CREATE ANSWER IS
 * RECOVERABLE, on the real combined Worker, across the REAL hold expiry ═══
 *
 * The audit's MAJOR (5): the create ran its whole authorization — quote
 * freshness and hold freshness included — BEFORE the replay cache, so a buyer
 * whose 200 answer died on the network (an ordinary event on the network Law 7
 * names) and whose retry landed after expiry was refused BY NAME… and the
 * answer already written for her — her `buyerRef`, the only door to her suivi
 * and her remise code — became unrecoverable forever. Nothing was at risk;
 * everything was lost.
 *
 * THIS SUITE WAITS OUT THE REAL CLOCK: the reservation TTL is 2 minutes
 * (commerce-core `RESERVATION_TTL_MS`), so a ~130 s wait crosses it on real
 * workerd while the 15-minute quote stays fresh. The replay road it proves
 * precedes the WHOLE authorization decision, so quote expiry — untestable
 * against a real clock — is barred by the same bypass this test drives.
 * Written RED first: before the fix, the retry answered 422
 * `reservation_expired`.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'rejouer-'));
const T0 = '2026-09-03T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-r201';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-r201';
const OPS_SECRET = 'test-checkout-ops-secret-r201';
const authed = { 'X-Write-Key': WRITE_SECRET };

const CONTACT = { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'Face à la pharmacie' };

const SUPPLY = [
  {
    productVersionId: 'pv-rejoue-1',
    offerVersion: 'ov-rejoue-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO',
    LISTING: 'ListingDO',
    CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO',
    ATTRIBUTION_LOCK: 'AttributionLockDO',
    LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    STOREFRONT_WRITE_SECRET: WRITE_SECRET,
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CHECKOUT_OPS_SECRET: OPS_SECRET,
  },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
        return Response.json({ ok: true, status: 'registered' });
      }
      const single = /^\/supply-projection\/([^/]+)$/.exec(path);
      if (single) {
        const value = SUPPLY.find((v) => v.productVersionId === decodeURIComponent(single[1]!));
        if (value === undefined) return Response.json({ status: 'not_found' }, { status: 404 });
        return Response.json({ version: 1, asOf: new Date().toISOString(), value });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
    },
  },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function creerCommande(n: string) {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-rejoue-${n}`, resellerId: `rs-rejoue-${n}`, shortCode: `REJOU-${n}`,
      name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général',
      correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`seed: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-rejoue-${n}`, storefrontId: `sf-rejoue-${n}`,
      resellerId: `rs-rejoue-${n}`, productVersionId: 'pv-rejoue-1', offerVersion: 'ov-rejoue-1',
      markup: 1_500, correlationId: `corr-${n}`, at: T0,
    }),
  });
  if ((safeJson(await pub.text()) as { status?: string }).status !== 'published') throw new Error('seed: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `rejou-${n}`, pid: 'pv-rejoue-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: `rs-rejoue-${n}`, requestKey: `rk-rejoue-${n}-${'x'.repeat(12)}`,
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
  if (quoteRes.status !== 200 || typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status}`);
  const held = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
  });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const res = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`, contact: CONTACT }),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`setup: order ${res.status} ${text}`);
  return { quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`, premier: text };
}

async function rejouer(quoteId: string, holderRef: string, commandId: string) {
  const res = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId, holderRef, commandId, contact: CONTACT }),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

describe('COMMANDE-REJOUER-1 — the answer already written survives the clock', () => {
  it('the whole road: create → the HOLD genuinely expires (real ~130 s) → the same command replays the stored answer; a wrong holder never gets it; a NEW command still refuses by name', async () => {
    const elle = await creerCommande('0001');
    const attendu = safeJson(elle.premier);
    expect(typeof attendu['orderId'], elle.premier).toBe('string');
    expect(typeof attendu['buyerRef'], 'the answer she must be able to recover carries her buyerRef').toBe('string');

    // the clock does the real work: the 2-minute hold dies, the 15-minute quote lives
    await new Promise((r) => setTimeout(r, 130_000));

    // A NEW command on the dead hold refuses BY NAME — expiry still guards
    // every create that would move something. (Asserted FIRST, so the replay
    // below cannot be explained by the hold somehow still standing.)
    const nouvelle = await rejouer(elle.quoteId, elle.holderRef, 'cmd-order-toute-neuve');
    expect(nouvelle.status, nouvelle.text).toBe(422);
    expect(nouvelle.json['error'], nouvelle.text).toBe('reservation_expired');

    // A WRONG holder replaying her command id gets a refusal, never the cache —
    // « who is asking » is still settled before anything is served.
    const etranger = await rejouer(elle.quoteId, 'holder-quelqu-un-d-autre', elle.commandId);
    expect(etranger.status, etranger.text).not.toBe(200);
    expect(etranger.text).not.toContain('buyerRef');

    // HER OWN retry — same command, same holder — gets the stored answer back,
    // byte for byte: the buyerRef door reopens. RED before the fix:
    // 422 reservation_expired, and the answer was lost forever.
    const rejoue = await rejouer(elle.quoteId, elle.holderRef, elle.commandId);
    expect(rejoue.status, rejoue.text).toBe(200);
    expect(safeJson(rejoue.text)).toEqual(attendu);

    // …and the replay MOVED nothing: the ledger's audit still shows exactly one
    // checkout leg key — no second charge was ever initiated.
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const audit = (await (await ns.get(ns.idFromName(`ord-${elle.quoteId}`)).fetch('https://do/entry/audit')).json()) as {
      legKeys?: Record<string, string>;
    };
    expect(Object.keys(audit.legKeys ?? {})).toEqual(['checkout']);
  }, 200_000);
});
