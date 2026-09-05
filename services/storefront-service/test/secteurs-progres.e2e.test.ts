import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance } from './seance';

/**
 * ═══ SECTEURS-PROGRES-1 (AUDIT-SHOP-1 slice e) — one credential per writer,
 * on the REAL combined Worker ═══
 *
 * ACCES-ARME-2 (2026-09-05): the shared write key is retired. The shop each
 * paid order rides on is seated through `seance()` — signup → the founder
 * mints on key C → admission — and created with HER session bearer; her
 * `resellerId` is the id the book minted. Key C is bound here for that
 * minting alone; the two progress doors under test stay their own secrets.
 *
 * The audit's MAJOR (4): one shared `PROGRESS_WRITE_SECRET` unlocked BOTH
 * Boutik+'s preparation facts AND Séra's delivery marks — up to
 * `delivery.validated.v1`, the signal that feeds settlement eligibility. A
 * compromised Boutik+ credential could declare deliveries validated; a
 * compromised Séra credential could fake preparation.
 *
 * This suite binds BOTH secrets (the split ARMED, the deployed shape once the
 * founder mints the Séra value) and proves, asking the LEDGER after every
 * refusal: each credential opens exactly its own events, the wrong pairing is
 * 403 `wrong_writer` BY NAME with NOTHING recorded, and an unknown credential
 * stays the uniform 401. The legacy world (binding absent ⇒ the shared value
 * opens every door, byte-identical) is not re-proven here — it IS the entire
 * existing suite: vrai-suivi, livraison-boutik, sandbox-payment and dispatch
 * all run without `SERA_PROGRESS_SECRET` and stay green.
 *
 * Written RED FIRST against the pre-slice bundle: every `wrong_writer`
 * assertion failed — the wrong credential's write landed with a 200.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'secteurs-'));
const T0 = '2026-09-03T08:00:00.000Z';

const WEBHOOK_SECRET = 'test-payment-webhook-secret-sp201';
const BOUTIK_SECRET = 'test-progress-write-secret-sp201';
const SERA_SECRET = 'test-sera-progress-secret-sp201';

const SUPPLY = [
  {
    productVersionId: 'pv-sp-1',
    offerVersion: 'ov-sp-1',
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
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO', RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CHECKOUT_OPS_SECRET: OPS_SECRET,
    PROGRESS_WRITE_SECRET: BOUTIK_SECRET,
    SERA_PROGRESS_SECRET: SERA_SECRET,
  },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
        return Response.json({ ok: true, status: 'registered' });
      }
      if (request.method === 'POST' && path === '/fulfillment/delivered') {
        return Response.json({ ok: true, status: 'delivered' });
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

async function createdPaidOrder(n: string): Promise<string> {
  const S = await seance(mf, `sp${n}`);
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-sp-${n}`, resellerId: S.accountId,
      shortCode: `SPLIT-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-sp-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-sp-${n}`, storefrontId: `sf-sp-${n}`,
      resellerId: S.accountId, productVersionId: 'pv-sp-1', offerVersion: 'ov-sp-1',
      markup: 1_500, correlationId: `corr-sp-${n}`, at: T0,
    }),
  });
  if ((safeJson(await pub.text()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `split-${n}`, pid: 'pv-sp-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: S.accountId, requestKey: `rk-sp-${n}-${'x'.repeat(12)}`,
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
  if (typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status}`);
  const held = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
  });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const ordered = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}` }),
  });
  const createJson = safeJson(await ordered.text());
  if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status}`);
  const orderId = `ord-${quote.quoteId}`;
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const audit = (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
    legKeys?: Record<string, string>;
  };
  const legKey = audit.legKeys?.['checkout'];
  if (legKey === undefined) throw new Error(`no checkout leg key on ${orderId}`);
  const paid = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET },
    body: JSON.stringify({
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: {
        command_id: `whk-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 1,
        actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1',
      },
      payload: {
        provider: 'sandbox-provider', payment_attempt_id: legKey,
        collectRef: `collect-${orderId}`, amount: createJson['amountPaidAtCheckout'],
        fee: 0, status: 'held', order_id: orderId, redelivery: false,
      },
    }),
  });
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${await paid.text()}`);
  return orderId;
}

const progressEnvelope = (n: string) => ({
  command_id: `ful-sp-${n}`, correlation_id: `corr-sp-${n}`, aggregateVersion: 1,
  actor: 'offer-service:fulfillment', serverTime: T0, version: 'v1',
});

const progress = (event: unknown, secret: string) =>
  mf.dispatchFetch('http://c/fulfillment/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(event),
  });

const accepted = (orderId: string, n: string, at: string) => ({
  name: 'fulfillment.accepted.v1', envelope: progressEnvelope(n),
  payload: { orderId, at },
});

const validated = (orderId: string) => ({
  name: 'delivery.validated.v1',
  envelope: {
    command_id: `eligibility-${orderId}`, correlation_id: `corr-${orderId}`,
    aggregateVersion: 9, actor: 'custody-service:e1', serverTime: T0, version: '1',
  },
  payload: {
    order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`,
    result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-sp-001',
  },
});

const refused = (orderId: string) => ({
  name: 'delivery.refused.v1',
  envelope: {
    command_id: `refus-${orderId}`, correlation_id: `corr-${orderId}`,
    aggregateVersion: 9, actor: 'custody-service:e1', serverTime: T0, version: '1',
  },
  payload: { order_id: orderId, task_id: `task-${orderId}`, result: 'refused' },
});

const transit = async (body: unknown, secret: string) => {
  const res = await mf.dispatchFetch('http://c/fulfillment/transit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
};

async function vue(orderId: string) {
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
  return safeJson(await res.text());
}

describe('SECTEURS-PROGRES-1 — with both secrets bound, each writer opens exactly its own doors', () => {
  it("THE AUDIT'S ATTACK, closed: Boutik+'s credential can no longer mint Séra's delivery marks — and Séra's still can", async () => {
    const orderId = await createdPaidOrder('0001');

    // Boutik+'s credential on Séra's settlement signal: 403 BY NAME…
    const vol = await progress(validated(orderId), BOUTIK_SECRET);
    expect(`${vol.status} ${(safeJson(await vol.text()))['reason']}`).toBe('403 wrong_writer');
    // …and the LEDGER agrees nothing landed: the order is not « livrée ».
    expect((await vue(orderId))['livree']).toBe(false);

    // Boutik+'s credential on the refusal signal: refused BY NAME, and the
    // ledger's outbox shows the refused-course wire was never even born.
    const volRefus = await progress(refused(orderId), BOUTIK_SECRET);
    expect(`${volRefus.status} ${(safeJson(await volRefus.text()))['reason']}`).toBe('403 wrong_writer');
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const boite = safeJson(await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/outbox')).text());
    expect(boite['refusOutbox'], 'no refused mark may land under the wrong credential').toBeUndefined();

    // Boutik+'s credential on the transit door: refused before any body work.
    const volTransit = await transit({ orderId, stage: 'en_route', asOf: T0 }, BOUTIK_SECRET);
    expect(`${volTransit.status} ${volTransit.json['reason']}`).toBe('403 wrong_writer');
    expect((await vue(orderId))['departedAt']).toBeUndefined();

    // Séra's own credential: the marks land, first-wins, view updated.
    const depart = await transit({ orderId, stage: 'en_route', asOf: '2026-09-03T11:00:00.000Z' }, SERA_SECRET);
    expect(`${depart.status} ${depart.text}`).toBe('200 {"ok":true,"status":"recorded","at":"2026-09-03T11:00:00.000Z"}');
    expect((await progress(validated(orderId), SERA_SECRET)).status).toBe(200);
    const v = await vue(orderId);
    expect(v['departedAt']).toBe('2026-09-03T11:00:00.000Z');
    expect(v['livree']).toBe(true);
  }, 60_000);

  it("the mirror: Séra's credential cannot write Boutik+'s preparation facts — and Boutik+'s still can", async () => {
    const orderId = await createdPaidOrder('0002');

    const vol = await progress(accepted(orderId, 'v2', '2026-09-03T09:00:00.000Z'), SERA_SECRET);
    expect(`${vol.status} ${(safeJson(await vol.text()))['reason']}`).toBe('403 wrong_writer');
    expect((await vue(orderId))['acceptedAt']).toBeUndefined();

    expect((await progress(accepted(orderId, 'b2', '2026-09-03T09:05:00.000Z'), BOUTIK_SECRET)).status).toBe(200);
    expect((await vue(orderId))['acceptedAt']).toBe('2026-09-03T09:05:00.000Z');

    // …and ready.v1 walks the same guard, both ways: Séra refused by name
    // with nothing written, Boutik+ landing the instant.
    const ready = (at: string, n: string) => ({
      name: 'fulfillment.ready.v1', envelope: progressEnvelope(n), payload: { orderId, at },
    });
    const volReady = await progress(ready('2026-09-03T09:10:00.000Z', 'vr2'), SERA_SECRET);
    expect(`${volReady.status} ${(safeJson(await volReady.text()))['reason']}`).toBe('403 wrong_writer');
    expect((await vue(orderId))['readyAt']).toBeUndefined();
    expect((await progress(ready('2026-09-03T09:15:00.000Z', 'br2'), BOUTIK_SECRET)).status).toBe(200);
    expect((await vue(orderId))['readyAt']).toBe('2026-09-03T09:15:00.000Z');
  }, 60_000);

  it('an unknown credential stays the uniform 401 on both doors — the split adds no oracle', async () => {
    const orderId = await createdPaidOrder('0003');

    const porte = await progress(accepted(orderId, 'x3', T0), 'pas-un-secret');
    expect(porte.status).toBe(401);
    const porteTransit = await transit({ orderId, stage: 'en_route', asOf: T0 }, 'pas-un-secret');
    expect(`${porteTransit.status} ${porteTransit.text}`).toBe('401 {"error":"unauthorized"}');
    // A refused credential never differentiates by event: the SAME 401 for a
    // Séra-shaped body — whether the door exists is not readable from outside.
    const porteSera = await progress(validated(orderId), 'pas-un-secret');
    expect(`${porteSera.status} ${await porteSera.text()}`).toBe(`${porte.status} ${'{"error":"unauthorized"}'}`);

    const v = await vue(orderId);
    expect(v['acceptedAt']).toBeUndefined();
    expect(v['departedAt']).toBeUndefined();
    expect(v['livree']).toBe(false);
  }, 60_000);
});
