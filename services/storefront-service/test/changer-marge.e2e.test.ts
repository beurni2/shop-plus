import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleC, seance, type Seance } from './seance';

/**
 * ═══ CHANGER-MARGE-1 (founder « go 1 and 2 », 2026-10-01) — her price change,
 * through the app's OWN port, on the REAL Worker ═══
 *
 * Canon SP-I19: « markup changes expire old cards (never silent edits) …; the
 * signed page remains the live price/stock truth ». The app's port
 * (`HttpStorefrontService`, imported from the app, never re-implemented) signs
 * a new marge on a product she already sells; the LEDGERS decide:
 *   · her own read (`/listings/by-pid/…/economics`): the next version, the new
 *     marge, the price the service signed, the commission frozen with it;
 *   · the buyer's page (`GET /s/{slug}` → `priceFcfa`) and a NEW quote
 *     (`productSubtotal`): the new price;
 *   · an order placed BEFORE the change keeps the amount it was quoted;
 *   · a retry of the same change replays, never signs twice.
 * Only Boutik+'s OFFER service is stood in (base 10 000, C 1 000), as in
 * `vitrine-vraie.e2e`.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'changer-marge-'));
const WEBHOOK_SECRET = 'test-payment-webhook-secret-cm001';
const PV = 'pv-cm-1';
const SF_ID = 'sf-cm-0001';
const SLUG = 'cm-0001';
const BASE = 10_000;

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO', WISHLIST: 'WishlistDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CHECKOUT_OPS_SECRET: cleC.Authorization.slice('Bearer '.length),
  },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path === '/fulfillment/order-confirmed') return Response.json({ ok: true, status: 'registered' });
      if (/^\/supply-projection\/[^/]+$/.test(path)) {
        return Response.json({
          version: 1,
          asOf: new Date().toISOString(),
          value: {
            productVersionId: PV, offerVersion: 'ov-cm-1', basePrice: BASE, resellerCommission: 1_000, available: 9,
            productName: 'Bazin riche', assetRefs: [] as string[], category: 'fashion_bags_fabrics', sellerTier: 'verified',
          },
        });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
    },
  },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

let S: Seance;
beforeAll(async () => {
  S = await seance(mf, 'cm');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { signal: _signal, ...reste } = init ?? {};
    return (await mf.dispatchFetch(url, reste as never)) as unknown as Response;
  }) as typeof fetch;
});

type App = typeof import('../../../apps/reseller-app/src/vitrine/service.js');
async function app(): Promise<App> {
  return import('../../../apps/reseller-app/src/vitrine/service.js');
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** THE BUYER'S LEDGER — the price her page carries for the product. */
async function prixPage(): Promise<unknown> {
  const res = await mf.dispatchFetch(`http://sf/s/${SLUG}`);
  const body = safeJson(await res.text());
  return ((body['products'] as { pid: string; priceFcfa: number }[] | undefined) ?? []).find((p) => p.pid === PV)?.priceFcfa;
}

let keySeq = 0;
async function devis(): Promise<Record<string, unknown>> {
  keySeq += 1;
  const q = await mf.dispatchFetch('http://sf/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: SLUG, pid: PV, paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: S.accountId, requestKey: `rk-cm-${String(keySeq).padStart(4, '0')}-xxxxxxxxxx` }),
  });
  const body = safeJson(await q.text());
  if (q.status !== 200) throw new Error(`quote ${q.status} ${JSON.stringify(body)}`);
  return body;
}

describe('CHANGER-MARGE-1 — a new marge on a product she already sells, signed by the service', () => {
  it('signs the next version at the new marge; the buyer page and a new quote carry the new price; an earlier order keeps its own; a retry replays', async () => {
    const svc = await app();
    const port = new svc.HttpStorefrontService('https://sf', async () => S.session);
    const created = await port.create({
      commandId: 'c-cm-001', id: SF_ID, resellerId: S.accountId, shortCode: 'CM-0001',
      name: 'Boutique marge', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-cm-001',
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    expect((await port.publish(SF_ID, 'corr-cm-001')).ok).toBe(true);
    const pub = await port.publishListing({ storefrontId: SF_ID, resellerId: S.accountId, productVersionId: PV, markup: 2_000, correlationId: 'corr-cm-001' });
    expect(pub.ok && pub.value.status).toBe('published');

    // HER read, through the app's port: everything the card needs, as signed.
    const v1 = await port.readListing(SF_ID, PV);
    expect(v1).toEqual({
      ok: true,
      value: { listingId: `lst-${SF_ID}-${PV}`, productVersionId: PV, customerPriceFcfa: 12_000, status: 'published', markup: 2_000, version: 1, resellerCommission: 1_000 },
    });
    expect(await prixPage()).toBe(12_000);

    // An order placed BEFORE the change.
    const avant = await devis();
    expect(avant['productSubtotal']).toBe(12_000);
    const quoteId = avant['quoteId'] as string;
    const held = await mf.dispatchFetch(`http://sf/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: 'cmd-reserve-cm-1', holderRef: 'holder-cm-1' }),
    });
    expect(held.status).toBe(200);
    const ordered = await mf.dispatchFetch('http://sf/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, holderRef: 'holder-cm-1', commandId: 'cmd-order-cm-1', contact: { phone: '70 11 22 33', quartier: 'Gounghin', repere: 'près du marché' } }),
    });
    expect(ordered.status, await ordered.clone().text()).toBe(200);
    const orderId = `ord-${quoteId}`;
    const lireCommande = async () => safeJson(await (await mf.dispatchFetch(`http://sf/checkout/order/${encodeURIComponent(orderId)}`)).text());
    const commandeAvant = await lireCommande();
    expect(Number(commandeAvant['amountPaidAtCheckout'])).toBe(Number(avant['buyerTotal']));

    // THE CHANGE, through the app's port.
    const change = await port.changerMarge({ storefrontId: SF_ID, resellerId: S.accountId, productVersionId: PV, markup: 2_400, correlationId: 'corr-cm-001', versionActuelle: 1 });
    expect(change).toEqual({ ok: true, value: { status: 'published' } });

    const v2 = await port.readListing(SF_ID, PV);
    expect(v2.ok && v2.value).toMatchObject({ customerPriceFcfa: BASE + 2_400, markup: 2_400, version: 2, resellerCommission: 1_000 });
    expect(await prixPage(), 'the buyer page shows the price now signed').toBe(12_400);
    expect((await devis())['productSubtotal'], 'a new quote is priced at the new marge').toBe(12_400);
    expect(Number((await lireCommande())['amountPaidAtCheckout']), 'an order placed before keeps its own amount').toBe(Number(avant['buyerTotal']));

    // A retry of the SAME change replays — no third version.
    const encore = await port.changerMarge({ storefrontId: SF_ID, resellerId: S.accountId, productVersionId: PV, markup: 2_400, correlationId: 'corr-cm-001', versionActuelle: 1 });
    expect(encore.ok && encore.value.status).toBe('idempotent');
    const v3 = await port.readListing(SF_ID, PV);
    expect(v3.ok && v3.value?.version, 'the retry signed nothing').toBe(2);
  }, 120_000);

  it('a marge over the cap is refused by name and nothing is signed', async () => {
    const svc = await app();
    const port = new svc.HttpStorefrontService('https://sf', async () => S.session);
    const refus = await port.changerMarge({ storefrontId: SF_ID, resellerId: S.accountId, productVersionId: PV, markup: 9_999_999, correlationId: 'corr-cm-001', versionActuelle: 2 });
    expect(refus).toEqual({ ok: false, reason: 'markup_over_cap' });
    const lu = await port.readListing(SF_ID, PV);
    expect(lu.ok && lu.value).toMatchObject({ version: 2, customerPriceFcfa: 12_400 });
  }, 60_000);
});
