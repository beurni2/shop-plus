import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { OPS_SECRET, cleC, seance } from './seance';

/**
 * ═══ RESERVATION-REGLE — the doors the two seam files drive, once ═══
 *
 * `reservation-regle.e2e.test.ts` (REGLE-1) and `reservation-regle-2.e2e.test.ts`
 * (REGLE-2) each mount their OWN real combined Worker on miniflare — different
 * certified misbehaviours, different persist directories — and walk the same
 * doors: a reseller's storefront and listing, a buyer's quote, hold and order,
 * the provider's webhook, the founder's key-C reads. Nothing here is a stub of
 * app code: every helper is an HTTP request to the Worker, and the ONE double
 * is the Boutik+ door the wire posts to (a service binding, certified below).
 */

export const SCRIPT = 'dist/worker/worker.mjs';
export const T0 = '2026-09-09T05:00:00.000Z';
export const WEBHOOK_SECRET = 'test-payment-webhook-secret-rr1';

export const SUPPLY = [
  {
    productVersionId: 'pv-rr-1',
    offerVersion: 'ov-rr-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

export function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}
export const sha256Hex = (raw: string): string => createHash('sha256').update(raw, 'utf8').digest('hex');
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * THE BOUTIK+ DOOR, DOUBLED — certified to the real service's bounds: the
 * confirmed wire is answered 200 `registered`, a supply read answers the
 * projection or 404, and nothing else exists. `porte.supplier = true` makes
 * the confirmed wire answer 503 — an OUTAGE, the one behaviour a real service
 * shows that a fixture never does — and every such refusal is counted, so a
 * test can prove the wire really knocked.
 */
export interface PorteBoutik {
  supplier: boolean;
  refusals: number;
}
export function offerDouble(porte: PorteBoutik) {
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
      if (porte.supplier) {
        porte.refusals += 1;
        return Response.json({ ok: false, reason: 'unavailable' }, { status: 503 });
      }
      return Response.json({ ok: true, status: 'registered' });
    }
    const single = /^\/supply-projection\/([^/]+)$/.exec(path);
    if (single) {
      const value = SUPPLY.find((v) => v.productVersionId === decodeURIComponent(single[1]!));
      if (value === undefined) return Response.json({ status: 'not_found' }, { status: 404 });
      return Response.json({ version: 1, asOf: new Date().toISOString(), value });
    }
    return Response.json({ status: 'not_found' }, { status: 404 });
  };
}

/** The REAL combined Worker on miniflare, every Durable Object bound, the DLQ included. */
export function regleWorker(args: {
  persistPrefix: string;
  bindings: Record<string, string>;
  offer: (request: Request) => Promise<Response>;
}): { mf: Miniflare; persist: string } {
  const persist = mkdtempSync(join(tmpdir(), args.persistPrefix));
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
    bindings: {
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      CHECKOUT_OPS_SECRET: OPS_SECRET,
      ...args.bindings,
    },
    serviceBindings: { OFFER: args.offer },
  });
  return { mf, persist };
}

export interface Audit {
  state?: string;
  legKeys?: Record<string, string>;
  release?: {
    status: string;
    commandId: string;
    reservationId?: string;
    attempts: number;
    decision?: { ok: boolean; reason: string | null; state: string | null };
  } | null;
  stuck?: { emittedAt: string; commandId: string } | null;
  stuckSupplier?: { emittedAt: string; commandId: string; notificationStatus: string } | null;
  reconAlerts?: { name: string; envelope: { command_id: string }; payload: Record<string, unknown> }[];
}

export interface LivreParque {
  status: number;
  book: {
    ok?: boolean;
    entries?: { parkId: string; original: string; originalSha256: string; reason: string; bytes: number }[];
    events?: { name: string; payload: Record<string, unknown> }[];
    /** the index's own slot count — equals `entries.length` in a healthy book */
    held?: number;
    dropped?: number;
    oversize?: unknown[];
    acknowledged?: { parkId: string; sha256Hex: string; reason: string; at: string }[];
    acknowledgedClipped?: number;
  };
}

/** The doors, bound to one Worker. */
export function porteRegle(mf: Miniflare) {
  async function audit(orderId: string): Promise<Audit> {
    const ns = await mf.getDurableObjectNamespace('ORDER');
    return (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as Audit;
  }

  /** Poll the ledger until `pick` answers true, or the deadline passes. */
  async function jusqua(orderId: string, pick: (a: Audit) => boolean, deadlineMs = 15_000): Promise<Audit> {
    const start = Date.now();
    let last = await audit(orderId);
    while (!pick(last) && Date.now() - start < deadlineMs) {
      await sleep(200);
      last = await audit(orderId);
    }
    return last;
  }

  async function creerCommande(n: string) {
    const S = await seance(mf, `rr${n}`);
    const created = await mf.dispatchFetch('http://c/storefronts', {
      method: 'POST', headers: S.bearer,
      body: JSON.stringify({
        commandId: `cmd-create-${n}`, id: `sf-rr-${n}`, resellerId: S.accountId,
        shortCode: `REGLE-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
        category: 'Général', correlationId: `corr-rr-${n}`, at: T0,
      }),
    });
    if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
    const pub = await mf.dispatchFetch('http://c/listings', {
      method: 'POST', headers: S.bearer,
      body: JSON.stringify({
        commandId: `cmd-listing-${n}`, listingId: `lst-rr-${n}`, storefrontId: `sf-rr-${n}`,
        resellerId: S.accountId, productVersionId: 'pv-rr-1', offerVersion: 'ov-rr-1',
        markup: 1_500, correlationId: `corr-rr-${n}`, at: T0,
      }),
    });
    if ((safeJson(await pub.text()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
    const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: `regle-${n}`, pid: 'pv-rr-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
        attributionResellerId: S.accountId, requestKey: `rk-rr-${n}-${'x'.repeat(12)}`,
      }),
    });
    const quote = safeJson(await quoteRes.text()) as { quoteId?: string; amountPaidAtCheckout?: number };
    if (typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status}`);
    const held = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
    });
    const holdJson = safeJson(await held.text()) as { reservationId?: string };
    if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
    const ordered = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}` }),
    });
    const createText = await ordered.text();
    const createJson = safeJson(createText);
    if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status} ${createText}`);
    return {
      n,
      orderId: `ord-${quote.quoteId}`,
      quoteId: quote.quoteId,
      holderRef: `holder-${n}`,
      firstReservationId: holdJson.reservationId as string,
      state: (createJson['view'] as { state?: string } | undefined)?.state ?? (createJson['state'] as string | undefined),
      amount: quote.amountPaidAtCheckout,
    };
  }

  async function reserver(quoteId: string, holderRef: string, commandId: string) {
    const res = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId, holderRef }),
    });
    return { status: res.status, body: safeJson(await res.text()) as { status?: string; reservationId?: string; error?: string } };
  }

  async function retenter(quoteId: string, holderRef: string, commandId: string) {
    const res = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, holderRef, commandId }),
    });
    const body = safeJson(await res.text());
    // The create road answers the buyer's projection at the top level (with
    // `buyerRef` beside it), as garde-paiement.e2e reads it.
    return {
      status: res.status,
      state: (body['state'] as string | undefined) ?? (body['view'] as { state?: string } | undefined)?.state,
      body,
    };
  }

  const postWebhook = (body: string) =>
    mf.dispatchFetch('http://c/checkout/webhook/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET },
      body,
    });
  /** The door leg's road — the same secret, the same book (verifier finding). */
  const postDoorWebhook = (body: string) =>
    mf.dispatchFetch('http://c/checkout/webhook/door', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET },
      body,
    });

  async function livreParque(): Promise<LivreParque> {
    const res = await mf.dispatchFetch('http://c/checkout/dlq', { headers: cleC });
    return { status: res.status, book: safeJson(await res.text()) as LivreParque['book'] };
  }

  /** A genuine checkout-leg webhook for an order, from the leg key the order actually holds. */
  const webhookPour = (order: { orderId: string; amount?: number }, legKey: string, over: Record<string, unknown>) =>
    JSON.stringify({
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: {
        command_id: `whk-${order.orderId}-${Object.keys(over).join('-') || 'ok'}`, correlation_id: `corr-${order.orderId}`,
        aggregateVersion: 1, actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1',
      },
      payload: {
        provider: 'sandbox-provider', payment_attempt_id: legKey,
        collectRef: `collect-${order.orderId}`, amount: order.amount, fee: 0, status: 'held',
        order_id: order.orderId, redelivery: false, ...over,
      },
    });

  return { audit, jusqua, creerCommande, reserver, retenter, postWebhook, postDoorWebhook, livreParque, webhookPour };
}
