import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance } from './seance';

/**
 * ═══ GARDE-PAIEMENT-1 (AUDIT-SHOP-1 slice f) — the two money doors hardened,
 * on the REAL combined Worker, the LEDGER consulted after every refusal ═══
 *
 * ACCES-ARME-2 (2026-09-05): the shared write key is retired. The shop each
 * order rides on is seated through `seance()` — signup → the founder mints on
 * key C → admission — and created with HER session bearer; her `resellerId`
 * is the id the book minted, never one this file chose.
 *
 * TWO closable Real-Money-Gate code items:
 *
 *  (1) THE RECEIPT IS FROZEN ONCE THE ORDER EXISTS (the COMMANDE-REJOUER-1
 *      verifier's standing MAJOR). The receipt is the identity `decideCreateOrder`
 *      and the replay road trust. After an order is created against a quote, the
 *      2-minute hold dies while the 15-minute quote stays fresh — a stranger who
 *      has the quoteId could take a fresh hold whose mirror rewrote the order's
 *      receipt to him, and the origin-exists create road answers `buyerRef` (her
 *      suivi + remise door) to whoever the receipt names. Written RED FIRST:
 *      before the fix the mirror stored the stranger's receipt and his create
 *      returned HER buyerRef.
 *
 *      THE MIRROR IS PLUMBING, THE OBJECT'S DEFENCE IS UNDER TEST: the fresh
 *      hold's mirror is POSTed to the REAL ORDER object's real `/entry/reserved`
 *      — byte-for-byte the wire the composition root sends at index.ts (the
 *      reserve road's own mirror) — so no CheckoutDO hold-timing wait is needed
 *      to exercise the freeze, which is a function of the order's existence, not
 *      the clock. The stranger's create then runs the REAL `/checkout/order`
 *      road, and the LEDGER (`/entry/audit`) is asked whose receipt stands.
 *
 *  (2) AN AUTHENTICATED-BUT-MALFORMED WEBHOOK IS REFUSED 422 BY NAME, never a
 *      5xx the provider retries forever. A `fee` that is not a non-negative
 *      integer, or an empty `collectRef`/`provider`, would crash the canon
 *      `EscrowTxnSchema.parse` out of the vault as an unnamed 500 (audit MINOR,
 *      measured: fee 1.5 → 500). Now `malformed_payload`, 422, nothing applied,
 *      and a genuine webhook still confirms after.
 *
 * NOT IN SCOPE, flagged: provider HMAC + timestamp on the webhook is the open
 * aggregator Decision (⏳) and lands with the real provider at the Real-Money
 * Gate — the shared bearer stays adequate for the sandbox era.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'garde-paiement-'));
const T0 = '2026-09-03T08:00:00.000Z';

const WEBHOOK_SECRET = 'test-payment-webhook-secret-gp201';

const SUPPLY = [
  {
    productVersionId: 'pv-gp-1',
    offerVersion: 'ov-gp-1',
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
  const S = await seance(mf, `gp${n}`);
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-gp-${n}`, resellerId: S.accountId,
      shortCode: `GARDE-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-gp-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-gp-${n}`, storefrontId: `sf-gp-${n}`,
      resellerId: S.accountId, productVersionId: 'pv-gp-1', offerVersion: 'ov-gp-1',
      markup: 1_500, correlationId: `corr-gp-${n}`, at: T0,
    }),
  });
  if ((safeJson(await pub.text()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `garde-${n}`, pid: 'pv-gp-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: S.accountId, requestKey: `rk-gp-${n}-${'x'.repeat(12)}`,
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
  return {
    orderId: `ord-${quote.quoteId}`,
    quoteId: quote.quoteId,
    holderRef: `holder-${n}`,
    buyerRef: createJson['buyerRef'] as string,
    amount: createJson['amountPaidAtCheckout'] as number,
  };
}

async function orderNs() {
  return mf.getDurableObjectNamespace('ORDER');
}

async function audit(orderId: string) {
  const ns = await orderNs();
  return (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
    receipt?: { holderRef?: string; reservationId?: string; expiresAt?: string } | null;
    legKeys?: Record<string, string>;
    state?: string;
    escrow?: unknown;
  };
}

describe('GARDE-PAIEMENT-1 — (1) the receipt is frozen once the order exists', () => {
  it("a fresh hold's mirror after create is refused, the buyer's receipt stands, and a stranger's create never reaches her buyerRef", async () => {
    const elle = await creerCommande('0001');
    expect(typeof elle.buyerRef, elle.buyerRef).toBe('string');
    expect(elle.buyerRef.length).toBeGreaterThan(0);

    // The stranger's fresh-hold mirror — the exact bytes the composition root
    // POSTs from the reserve road — arrives at the REAL order object AFTER the
    // order exists. Its expiry is derived STRICTLY LATER than the buyer's own
    // receipt (read from the ledger, not the wall clock) — so before the fix
    // the monotone guard provably moved it; the red-first is clock-independent.
    const before = await audit(elle.orderId);
    const ownExpiry = Date.parse(before.receipt?.expiresAt ?? '');
    expect(Number.isNaN(ownExpiry), 'her receipt carries an expiry').toBe(false);
    const later = new Date(ownExpiry + 3_600_000).toISOString();
    const ns = await orderNs();
    const mirror = await ns.get(ns.idFromName(elle.orderId)).fetch('https://do/entry/reserved', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: elle.quoteId, reservationId: 'res-stranger', holderRef: 'holder-stranger', expiresAt: later,
      }),
    });
    const mirrorBody = safeJson(await mirror.text());
    // RED before the fix: { ok:true, stored:true } — the receipt moved.
    expect(mirrorBody['stored'], JSON.stringify(mirrorBody)).toBe(false);
    expect(mirrorBody['reason']).toBe('order_frozen');

    // THE LEDGER: the receipt still names the buyer, not the stranger.
    const a = await audit(elle.orderId);
    expect(a.receipt?.holderRef, 'the order owner may never change').toBe(elle.holderRef);

    // A redelivered mirror of HER OWN hold, after the order exists, stays the
    // harmless no-op — the freeze must not rename that road (recheck NOTE).
    const redeliver = await ns.get(ns.idFromName(elle.orderId)).fetch('https://do/entry/reserved', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: elle.quoteId, reservationId: before.receipt?.reservationId,
        holderRef: elle.holderRef, expiresAt: before.receipt?.expiresAt,
      }),
    });
    expect(safeJson(await redeliver.text())['reason']).toBe('already_decided');

    // HER OWN fresh hold REFRESHES her receipt — the recovery road the
    // holder-blind first cut killed (recheck MAJOR: a payment-failed order
    // whose hold lapsed could never be retried, because the receipt had no
    // writer left). RED before the holder-aware freeze: order_frozen.
    const refresh = await ns.get(ns.idFromName(elle.orderId)).fetch('https://do/entry/reserved', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: elle.quoteId, reservationId: 'res-elle-2', holderRef: elle.holderRef,
        expiresAt: new Date(ownExpiry + 7_200_000).toISOString(),
      }),
    });
    const refreshBody = safeJson(await refresh.text());
    expect(refreshBody['stored'], JSON.stringify(refreshBody)).toBe(true);
    const rafraichie = await audit(elle.orderId);
    expect(rafraichie.receipt?.reservationId).toBe('res-elle-2');
    expect(rafraichie.receipt?.holderRef, 'refreshed, never re-owned').toBe(elle.holderRef);

    // …and the stranger is STILL refused against her refreshed receipt.
    const volEncore = await ns.get(ns.idFromName(elle.orderId)).fetch('https://do/entry/reserved', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: elle.quoteId, reservationId: 'res-stranger-2', holderRef: 'holder-stranger',
        expiresAt: new Date(ownExpiry + 10_800_000).toISOString(),
      }),
    });
    expect(safeJson(await volEncore.text())['reason']).toBe('order_frozen');

    // The stranger now runs the REAL create road under his own holderRef on the
    // still-fresh quote. RED before the fix: 200 carrying HER buyerRef. Now the
    // frozen receipt refuses him — reservation_held_by_another — and no body he
    // gets carries her token.
    const vol = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: elle.quoteId, holderRef: 'holder-stranger', commandId: 'cmd-order-stranger' }),
    });
    const volText = await vol.text();
    expect(vol.status, volText).not.toBe(200);
    expect(volText).not.toContain(elle.buyerRef);
    expect(volText).not.toContain('buyerRef');
    expect(safeJson(volText)['error']).toBe('reservation_held_by_another');

    // …and HER own retry still recovers her answer — the freeze protects the
    // owner without locking her out.
    const sien = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: elle.quoteId, holderRef: elle.holderRef, commandId: `cmd-order-0001` }),
    });
    expect(sien.status).toBe(200);
    expect(safeJson(await sien.text())['buyerRef']).toBe(elle.buyerRef);
  }, 60_000);
});

describe('GARDE-PAIEMENT-1 — (2) a malformed but authenticated webhook is 422 by name, never a retried 500', () => {
  it('fee 1.5 and an empty collectRef each refuse malformed_payload with the order still unpaid; a genuine webhook then confirms', async () => {
    const elle = await creerCommande('0002');
    const a = await audit(elle.orderId);
    const legKey = a.legKeys?.['checkout'];
    expect(typeof legKey, JSON.stringify(a.legKeys)).toBe('string');

    const event = (over: Record<string, unknown>) => ({
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: {
        command_id: `whk-${elle.orderId}`, correlation_id: `corr-${elle.orderId}`, aggregateVersion: 1,
        actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1',
      },
      payload: {
        provider: 'sandbox-provider', payment_attempt_id: legKey,
        collectRef: `collect-${elle.orderId}`, amount: elle.amount, fee: 0, status: 'held',
        order_id: elle.orderId, redelivery: false, ...over,
      },
    });
    const post = (body: unknown) =>
      mf.dispatchFetch('http://c/checkout/webhook/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET },
        body: JSON.stringify(body),
      });

    for (const over of [{ fee: 1.5 }, { fee: -5 }, { collectRef: '' }, { provider: '' }]) {
      const res = await post(event(over));
      const text = await res.text();
      // RED before the fix: 500 (the ZodError thrown out of the vault), retried
      // by the provider forever. The public webhook refusal field is `error`.
      expect(`${res.status} ${safeJson(text)['error']}`, JSON.stringify(over)).toBe('422 malformed_payload');
    }

    // Nothing landed — the order is still payment_pending AND the ledger's
    // own escrow record is absent (the recheck: state alone was one field
    // short of « the ledger asked after every refusal »).
    const mid = await audit(elle.orderId);
    expect(mid.state).toBe('payment_pending');
    expect(mid.escrow, 'no phantom money record behind a refusal').toBeNull();

    // The genuine webhook is accepted after all the malformed ones — the door
    // refuses the bad shape without poisoning the good one.
    const good = await post(event({}));
    expect(good.status, await good.text()).toBe(200);
    const after = await audit(elle.orderId);
    expect(after.state === 'paid' || after.state === 'confirmed', after.state).toBe(true);
  }, 60_000);
});
