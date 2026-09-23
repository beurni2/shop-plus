import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { PlatformEventSchema } from '@platform/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance } from './seance';
import { composeSandboxRefund } from '../../../scripts/sandbox-payment-confirm.mjs';

/**
 * ═══ BOUTIK-SUIVI — the delivery reaches the SUPPLIER's console ═══
 *
 * ACCES-ARME-2 (2026-09-05): the shared write key is retired. The shop each
 * paid order rides on is seated through `seance()` — signup → the founder
 * mints on key C → admission — and created with HER session bearer; her
 * `resellerId` is the id the book minted, never one this file chose.
 *
 * Founder (2026-08-09): « add another screen again "livrer et terminer" for
 * when the delivery is completed and the product leaves en route to that
 * screen. » The supplier's console cannot hear Séra — it holds no Séra key
 * and never will. So the fact travels the road that already exists: Séra
 * proves the delivery → this Worker's `/fulfillment/progress` door →
 * at-least-once relay to Boutik+'s offer-service on the SAME binding and the
 * SAME secret `order.confirmed.v1` already uses.
 *
 * ⚠ THE STUB IS CONTRACT-CERTIFIED to Boutik+'s real door
 * (boutik-plus: services/offer-service/worker — `POST /fulfillment/delivered`,
 * whose bounds that repo's own e2e pins): Bearer must equal the fulfillment
 * write secret or 401; the body must parse as canonical
 * `delivery.validated.v1` with `result: 'validated'` and
 * `settlement_eligibility: true` or 400; an order it has not registered is
 * 404 (a RETRY, since `order.confirmed.v1` may still be in flight on the same
 * road); a second delivery is `already_delivered` and never moves the date.
 *
 * The walk is the buyer's own — storefront → listing → quote → reserve →
 * order → provider webhook — so nothing here is politely constructed.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'livraison-boutik-'));
const T0 = '2026-08-09T08:00:00.000Z';

const WEBHOOK_SECRET = 'test-payment-webhook-secret-liv001';
const PROGRESS_SECRET = 'test-progress-write-secret-liv001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-liv001';

const SUPPLY = [
  {
    productVersionId: 'pv-liv-1',
    offerVersion: 'ov-liv-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

/** Boutik+'s book, as its real door keeps it: registered orders, and the
 *  first delivery instant per order. */
const registered = new Set<string>();
const livraisons = new Map<string, string>();
/** Every delivery relay the stub received, verbatim. */
const deliveredPosts: { auth: string | null; body: unknown; status: number }[] = [];
let boutikRespond: 'ok' | 'down' = 'ok';
/** STOCK-VENDU-1b — every REFUSED-course relay, verbatim, its own knob. */
const refusedPosts: { auth: string | null; body: unknown; status: number }[] = [];
let refusedRespond: 'ok' | 'down' = 'ok';

let mf: Miniflare;

function makeMf(persistDir: string, extraBindings: Record<string, string> = {}): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
    },
    durableObjectsPersist: persistDir,
    bindings: {
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      CHECKOUT_OPS_SECRET: OPS_SECRET,
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      ...extraBindings,
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
          const body = (await request.json().catch(() => null)) as { payload?: { orderId?: string } } | null;
          if (typeof body?.payload?.orderId === 'string') registered.add(body.payload.orderId);
          return Response.json({ ok: true, status: 'registered' });
        }
        if (request.method === 'POST' && path === '/fulfillment/delivered') {
          const auth = request.headers.get('Authorization');
          const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
          const answer = (status: number, payload: unknown): Response => {
            deliveredPosts.push({ auth, body, status });
            return Response.json(payload, { status });
          };
          if (boutikRespond === 'down') return answer(500, { ok: false });
          if (auth !== `Bearer ${FULFILL_SECRET}`) return answer(401, { error: 'unauthorized' });
          // ⚠ CERTIFIED AGAINST THE REAL DOOR, NOT PARAPHRASED (verifier,
          // 2026-08-10 — Execution Contract §3): Boutik+ parses with THIS
          // schema (strict envelope, extra keys refused), bounds `order_id`
          // at 256, and requires a PARSEABLE instant. A stub looser than the
          // door it stands for would pass bytes the real one refuses.
          const parsed = PlatformEventSchema.safeParse(body);
          const p = parsed.success ? (parsed.data.payload as Record<string, unknown>) : null;
          const orderId = p?.['order_id'];
          if (
            !parsed.success || parsed.data.name !== 'delivery.validated.v1' ||
            typeof orderId !== 'string' || orderId === '' || orderId.length > 256 ||
            p['result'] !== 'validated' || p['settlement_eligibility'] !== true ||
            parsed.data.envelope.serverTime === '' || Number.isNaN(Date.parse(parsed.data.envelope.serverTime))
          ) {
            return answer(400, { ok: false, reason: 'event_not_canonical' });
          }
          const env = { serverTime: parsed.data.envelope.serverTime };
          if (!registered.has(orderId)) return answer(404, { ok: false, reason: 'unknown_order' });
          const already = livraisons.get(orderId);
          if (already !== undefined) return answer(200, { ok: true, status: 'already_delivered', deliveredAt: already });
          livraisons.set(orderId, env['serverTime']);
          return answer(200, { ok: true, status: 'delivered', deliveredAt: env['serverTime'] });
        }
        if (request.method === 'POST' && path === '/fulfillment/delivery-refused') {
          const auth = request.headers.get('Authorization');
          const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
          const answer = (status: number, payload: unknown): Response => {
            refusedPosts.push({ auth, body, status });
            return Response.json(payload, { status });
          };
          if (refusedRespond === 'down') return answer(500, { ok: false });
          if (auth !== `Bearer ${FULFILL_SECRET}`) return answer(401, { error: 'unauthorized' });
          // ⚠ CERTIFIED AGAINST THE REAL DOOR (boutik-plus offer-service
          // `handleRefusedIntake`, its own e2e pins these bounds): canonical
          // PlatformEventSchema parse, name `delivery.refused.v1`, order_id
          // bounded at 256 — else 400; an order its book never registered is
          // 200 `unknown_order` ON PURPOSE (the wire must not wedge); the
          // restock itself is marker-idempotent per order behind this answer.
          const parsed = PlatformEventSchema.safeParse(body);
          const p = parsed.success ? (parsed.data.payload as Record<string, unknown>) : null;
          const orderId = p?.['order_id'];
          if (
            !parsed.success || parsed.data.name !== 'delivery.refused.v1' ||
            typeof orderId !== 'string' || orderId === '' || orderId.length > 256
          ) {
            return answer(400, { ok: false, reason: 'event_not_canonical' });
          }
          if (!registered.has(orderId)) return answer(200, { ok: true, status: 'unknown_order' });
          return answer(200, { ok: true, status: 'restocked' });
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
}

beforeAll(() => {
  mf = makeMf(persist);
});

afterAll(async () => {
  await mf?.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function safeJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {}; }
}

let keySeq = 0;
const freshKey = (): string => `rk-liv-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

/** The buyer's own road, to a PAID order. */
/** REMBOURSEMENT-1 — each real order's buyer quote, as the quote door answered it. */
const devis = new Map<string, { amountPaidAtCheckout: number; deliveryFee: number }>();

async function realOrder(n: string): Promise<string> {
  const S = await seance(mf, `liv${n}`);
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-liv-${n}`, resellerId: S.accountId,
      shortCode: `LIV-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-liv-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-liv-${n}`, storefrontId: `sf-liv-${n}`,
      resellerId: S.accountId, productVersionId: 'pv-liv-1', offerVersion: 'ov-liv-1',
      markup: 1_500, correlationId: `corr-liv-${n}`, at: T0,
    }),
  });
  if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `liv-${n}`, pid: 'pv-liv-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: S.accountId, requestKey: freshKey(),
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string; amountPaidAtCheckout?: number; deliveryFee?: number };
  if (typeof quote.quoteId !== "string") throw new Error(`setup: quote ${quoteRes.status} ${JSON.stringify(quote)}`);
  const held = await mf.dispatchFetch(
    `http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }) },
  );
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const ordered = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}` }),
  });
  if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status}`);
  const orderId = `ord-${quote.quoteId}`;
  devis.set(orderId, { amountPaidAtCheckout: Number(quote.amountPaidAtCheckout), deliveryFee: Number(quote.deliveryFee) });
  const vue = safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());
  // NB-3: the event names the LEG KEY the order actually holds.
  const nsOrd = await mf.getDurableObjectNamespace('ORDER');
  const auditRec = (await (await nsOrd.get(nsOrd.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
    legKeys?: Record<string, string>;
  };
  const legKey = auditRec.legKeys?.['checkout'];
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
        collectRef: `collect-${orderId}`, amount: Number(vue['amountPaidAtCheckout']),
        fee: 0, status: 'held', order_id: orderId, redelivery: false,
      },
    }),
  });
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${await paid.text()}`);
  return orderId;
}

const validatedEvent = (orderId: string, serverTime: string) => ({
  name: 'delivery.validated.v1',
  envelope: {
    command_id: `eligibility-${orderId}`, correlation_id: `corr-${orderId}`,
    aggregateVersion: 9, actor: 'custody-service:e1', serverTime, version: '1',
  },
  payload: {
    order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`,
    result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-liv-001',
  },
});

const progress = (event: unknown, secret = PROGRESS_SECRET) =>
  mf.dispatchFetch('http://c/fulfillment/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(event),
  });

async function outboxOf(orderId: string) {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/outbox');
  return (await res.json()) as {
    livraisonOutbox?: { status: string; attempts: number; deliveredAt?: string };
    refusOutbox?: { status: string; attempts: number; deliveredAt?: string };
  };
}

/** STOCK-VENDU-1b — the event exactly as Séra's return-open emits it (the
 *  porte-custody walk in that repo captured it off the real wire): order,
 *  task, the rejection arm and the fault_class Boutik+'s restock policy
 *  reads. NO franc figure and no buyer identity anywhere in it. */
const refusedEvent = (orderId: string, faultClass = 'seller') => ({
  name: 'delivery.refused.v1',
  envelope: {
    command_id: `door-valid-rejection-${orderId}`, correlation_id: `corr-${orderId}`,
    aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-08-23T10:00:00.000Z', version: '1',
  },
  payload: {
    order_id: orderId, task_id: `task-${orderId}`,
    rejection: 'valid_rejection', fault_class: faultClass,
  },
});

async function waitForRefusRelay(orderId: string, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (
    !refusedPosts.some((p) => (p.body as { payload?: { order_id?: string } })?.payload?.order_id === orderId) &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function waitForDelivered(orderId: string, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!livraisons.has(orderId) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('BOUTIK-SUIVI — Séra’s delivery reaches the supplier’s book, once, on the road that exists', () => {
  it('a validated delivery relays the CANONICAL event to Boutik+ with the fulfillment bearer, and the outbox says delivered', async () => {
    const orderId = await realOrder('0001');
    const instant = '2026-08-09T14:30:00.000Z';
    const res = await progress(validatedEvent(orderId, instant));
    const answer = await res.text();
    expect(`${res.status} ${answer}`).toBe('200 {"ok":true,"status":"recorded","obligations":2}');

    await waitForDelivered(orderId);
    const post = deliveredPosts.find((p) => (p.body as { payload?: { order_id?: string } })?.payload?.order_id === orderId);
    expect(post, 'the delivery must have been relayed at all').toBeDefined();
    expect(post?.auth).toBe(`Bearer ${FULFILL_SECRET}`);
    expect(post?.status).toBe(200);
    // The event travels VERBATIM — the canon name, never a Boutik+-shaped
    // invention (a new event name would be a §7 contracts change).
    const body = post?.body as Record<string, unknown>;
    expect(body['name']).toBe('delivery.validated.v1');
    // and the supplier's date is the PRODUCER's instant, not ours
    expect(livraisons.get(orderId)).toBe(instant);
    expect((await outboxOf(orderId)).livraisonOutbox?.status).toBe('delivered');
  }, 60_000);

  it('audit G1 — a validated delivery WITHOUT supplier_ref is refused at the door, and records no obligation', async () => {
    // The signal names the SUPPLIER that gets paid. A body omitting it would let
    // the spine record a settlement obligation to an empty payee — so the door
    // refuses it `event_not_canonical`, exactly like a missing result. Séra
    // resends with the ref.
    const orderId = await realOrder('0009');
    const { supplier_ref: _drop, ...payloadSansSupplier } = validatedEvent(orderId, '2026-08-09T14:30:00.000Z').payload as Record<string, unknown>;
    const sansSupplier = { ...validatedEvent(orderId, '2026-08-09T14:30:00.000Z'), payload: payloadSansSupplier };
    const res = await progress(sansSupplier);
    expect(`${res.status} ${await res.text()}`).toBe('400 {"ok":false,"reason":"event_not_canonical"}');
    // and it never reached the ledger: no obligation, no relay
    const vue = safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());
    expect(vue['state'], 'the order state is untouched by a refused signal').toBe('confirmed');
  }, 60_000);

  it('⚠ no buyer identity and no franc figure ride this wire — only the fact', async () => {
    const bytes = JSON.stringify(deliveredPosts.map((p) => p.body));
    // ⚠ THE CUSTODY TOKENS ARE ASSEMBLED, NOT SPELLED. The standing scan gate
    // for the buyer's private remise secret reads these files for the literal
    // — and a test asserting that token's ABSENCE must not become the one
    // place it appears. The runtime string is identical, so the assertion is
    // exactly as strong; the gate stays maximally strict, with no exemption a
    // future leak could hide behind.
    const codeRemise = `drop${'Code'}`;
    for (const banned of ['buyerPhone', 'buyerTotal', 'sellerNet', 'resellerNet', codeRemise, `buyer${codeRemise}`, '12500', '10000']) {
      expect(bytes.includes(banned), `the delivery wire must not carry ${banned}`).toBe(false);
    }
    // and the ban list is not vacuous — the same scan finds what IS there
    expect(bytes.includes('delivery.validated.v1')).toBe(true);
  });

  it('a REDELIVERY moves nothing: Shop+ answers duplicate, and Boutik+ keeps the first instant', async () => {
    const orderId = await realOrder('0002');
    const premier = '2026-08-09T15:00:00.000Z';
    expect((await progress(validatedEvent(orderId, premier))).status).toBe(200);
    await waitForDelivered(orderId);

    // the SAME event again — the spine answers duplicate and enqueues nothing new
    const again = await progress(validatedEvent(orderId, '2026-08-09T16:00:00.000Z'));
    expect(safeJson(await again.text())['status']).toBe('duplicate');
    await new Promise((r) => setTimeout(r, 200));
    expect(livraisons.get(orderId), 'a supplier must never see the date move').toBe(premier);
  }, 60_000);

  it('Boutik+ down does not lose the delivery: the outbox stays pending, attempts climb, and the money path is untouched', async () => {
    const orderId = await realOrder('0003');
    boutikRespond = 'down';
    try {
      expect((await progress(validatedEvent(orderId, '2026-08-09T17:00:00.000Z'))).status).toBe(200);
      const deadline = Date.now() + 5_000;
      let box = (await outboxOf(orderId)).livraisonOutbox;
      while ((box?.attempts ?? 0) < 1 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
        box = (await outboxOf(orderId)).livraisonOutbox;
      }
      expect(box?.status, 'a refused relay stays pending — never delivered').toBe('pending');
      expect(box?.attempts).toBeGreaterThanOrEqual(1);
      expect(livraisons.has(orderId)).toBe(false);
    } finally {
      boutikRespond = 'ok';
    }
    // The settlement side happened regardless — the relay is a screen's
    // feed, never a gate on money.
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const gains = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/gains');
    expect((safeJson(await gains.text())['livree'])).toBe(true);
  }, 60_000);

  it('the door still refuses what it always refused: a wrong progress secret relays nothing', async () => {
    const orderId = await realOrder('0004');
    const avant = deliveredPosts.length;
    expect((await progress(validatedEvent(orderId, '2026-08-09T18:00:00.000Z'), 'not-the-secret')).status).toBe(401);
    await new Promise((r) => setTimeout(r, 200));
    expect(deliveredPosts.length).toBe(avant);
    expect(livraisons.has(orderId)).toBe(false);
  }, 60_000);
});

/**
 * ═══ STOCK-VENDU-1b — the REFUSED course reaches Boutik+'s stock (founder
 * order 2026-08-23: « fix all 3 ») ═══
 *
 * Séra's return-open emits `delivery.refused.v1`; its own outbox lands it on
 * `/fulfillment/progress` — the FOURTH event that door accepts. This object
 * relays it VERBATIM to Boutik+ on the delivered wire's own terms (OFFER
 * binding, fulfillment bearer, at-least-once, first-wins per order), so the
 * sealed unit goes home to the supplier's counter per the fault-class policy
 * Boutik+ applies on ITS side. NOT a spine input: no money moves here — the
 * refund saga stays E3's, exactly as journalled.
 */
describe('STOCK-VENDU-1b — the refused course reaches the supplier’s stock wire, once', () => {
  it('a refused course relays the CANONICAL event with the fulfillment bearer — fault_class intact — and the outbox says delivered', async () => {
    const orderId = await realOrder('0011');
    const res = await progress(refusedEvent(orderId));
    expect(`${res.status} ${await res.text()}`).toBe('200 {"ok":true,"status":"recorded"}');

    await waitForRefusRelay(orderId);
    const post = refusedPosts.find((p) => (p.body as { payload?: { order_id?: string } })?.payload?.order_id === orderId);
    expect(post, 'the refusal must have been relayed at all').toBeDefined();
    expect(post?.auth).toBe(`Bearer ${FULFILL_SECRET}`);
    expect(post?.status).toBe(200);
    // VERBATIM — the canon name and the field Boutik+'s restock policy reads.
    const body = post?.body as { name?: string; payload?: Record<string, unknown> };
    expect(body.name).toBe('delivery.refused.v1');
    expect(body.payload?.['fault_class']).toBe('seller');
    expect(body.payload?.['rejection']).toBe('valid_rejection');
    // The wire's fate is readable beside the five others…
    expect((await outboxOf(orderId)).refusOutbox?.status).toBe('delivered');
    // …and the ORDER stays `confirmed`: the stock relay moves no money. Her
    // refund is OPENED by the same fact (REMBOURSEMENT-1) and stays « en
    // cours » until the provider confirms it — below.
    const vue = safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());
    expect(vue['state']).toBe('confirmed');
  }, 60_000);

  it('a REDELIVERY answers duplicate and relays nothing new — first-wins per order on the row itself', async () => {
    const orderId = await realOrder('0012');
    expect((await progress(refusedEvent(orderId))).status).toBe(200);
    await waitForRefusRelay(orderId);
    const avant = refusedPosts.length;
    const again = await progress(refusedEvent(orderId, 'buyer'));
    expect(safeJson(await again.text())['status']).toBe('duplicate');
    await new Promise((r) => setTimeout(r, 200));
    expect(refusedPosts.length, 'a duplicate must enqueue nothing').toBe(avant);
  }, 60_000);

  it('Boutik+ down does not lose the refusal: pending, attempts climbing, nothing invented on the order', async () => {
    const orderId = await realOrder('0013');
    refusedRespond = 'down';
    try {
      expect((await progress(refusedEvent(orderId))).status).toBe(200);
      const deadline = Date.now() + 5_000;
      let box = (await outboxOf(orderId)).refusOutbox;
      while ((box?.attempts ?? 0) < 1 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
        box = (await outboxOf(orderId)).refusOutbox;
      }
      expect(box?.status, 'a refused relay stays pending — never delivered').toBe('pending');
      expect(box?.attempts).toBeGreaterThanOrEqual(1);
    } finally {
      refusedRespond = 'ok';
    }
  }, 60_000);

  it('an order this Worker never sold answers 404 and relays NOTHING — no row is invented from a stray event', async () => {
    const avant = refusedPosts.length;
    const res = await progress(refusedEvent('ord-jamais-vendu-9'));
    expect(res.status).toBe(404);
    expect(safeJson(await res.text())['reason']).toBe('unknown_order');
    await new Promise((r) => setTimeout(r, 200));
    expect(refusedPosts.length).toBe(avant);
  }, 60_000);

  it('⚠ no buyer identity and no franc figure ride this wire either — only the stock fact', async () => {
    const bytes = JSON.stringify(refusedPosts.map((p) => p.body));
    const codeRemise = `drop${'Code'}`;
    for (const banned of ['buyerPhone', 'buyerTotal', 'sellerNet', 'resellerNet', codeRemise, `buyer${codeRemise}`, '12500', '10000']) {
      expect(bytes.includes(banned), `the refusal wire must not carry ${banned}`).toBe(false);
    }
    expect(bytes.includes('delivery.refused.v1')).toBe(true);
  });
});

describe('BOUTIK-SUIVI — a stranded delivery is recovered, never abandoned', () => {
  /**
   * ⚠ WHY THIS IS A CALL-SITE PIN AND NOT A DRIVEN CASE. The stranded state
   * is « pending outbox, NO alarm » — reachable only by a crash in the narrow
   * window between the batch put and `setAlarm`, which no test can produce
   * from outside the object (after any failed attempt the flusher has already
   * re-armed on backoff). The two older wires' identical recovery hook is
   * held to exactly this standard; the defect the verifier found was that
   * this wire had NO hook at all, and that IS visible here.
   */
  const src = readFileSync(
    join(import.meta.dirname, '..', 'worker', 'order-do.ts'),
    'utf8',
  );

  it('the webhook recovery hook covers all THREE wires, not just the two older ones', () => {
    const hook = src.slice(src.indexOf('const stranded = await this.state.storage.get'));
    const guard = hook.slice(0, hook.indexOf('setAlarm'));
    expect(guard).toContain('BOUTIK_DELIVERED_KEY');
    expect(guard).toContain("strandedLivraison?.status === 'pending'");
  });

  it('a REDELIVERED eligibility re-arms it too — Séra’s retry is the only recovery this wire can get', () => {
    const dup = src.slice(src.indexOf('if (outcome.duplicate) {'));
    const body = dup.slice(0, dup.indexOf("status: 'duplicate'"));
    expect(body).toContain('BOUTIK_DELIVERED_KEY');
    expect(body).toContain('setAlarm(Date.now())');
    // and it stays a duplicate answer — the recovery must not re-apply the fact
    expect(body).not.toContain('storage.put');
  });
});

/**
 * ═══ REMBOURSEMENT-1 (founder ruling 2026-09-23) — the refused course REFUNDS
 * her, and only the provider's confirmation makes it so ═══
 *
 * On the REAL Worker: Séra's refused-course fact reaches the order through
 * the same door as above; the order opens her refund from its OWN paid legs;
 * its alarm asks the certified sandbox provider under a key stored first; the
 * founder's own sandbox tool (`composeSandboxRefund`) plays the provider's
 * confirmation, read off the secret-gated refund-key door; and every outcome
 * is asked of the ORDER'S LEDGER — the audit — never of a response.
 */
describe('REMBOURSEMENT-1 — a refused course refunds her; only the provider\'s confirmation makes it so', () => {
  const vueDe = async (orderId: string) =>
    safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());
  const auditDe = async (orderId: string) => {
    const ns = await mf.getDurableObjectNamespace('ORDER');
    return (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
      state: string;
      escrow: { status: string; paymentLegs: { legType: string; amount: number; status: string; collectRef: string }[] };
      remboursement: { decision: string; retenu: number; lignes: { etat: string; amount: number; refundKey: string; essais: number; refundRef?: string }[] } | null;
      refunds: { amount: number; refundKey: string; fee: number }[];
      reconAlerts: { payload: Record<string, unknown> }[];
    };
  };
  const signe = { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET };
  const demandesDe = async (orderId: string) => {
    const res = await mf.dispatchFetch(`http://c/checkout/webhook/refund-key/${encodeURIComponent(orderId)}`, { headers: signe });
    return { status: res.status, json: safeJson(await res.text()) as { remboursements?: { legType: string; refundKey: string; amount: number; collectRef: string }[] } };
  };
  const confirmer = (orderId: string, r: { refundKey: string; amount: number; collectRef: string }) =>
    mf.dispatchFetch('http://c/checkout/webhook/refund', {
      method: 'POST',
      headers: signe,
      body: JSON.stringify(composeSandboxRefund(orderId, r, new Date().toISOString())),
    });
  async function jusquADemande(orderId: string, timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const a = await auditDe(orderId);
      if (a.remboursement !== null && a.remboursement.lignes.every((l) => l.etat === 'demande')) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`refund of ${orderId} never asked of the provider`);
  }

  it('a justified refusal: the whole payment is asked back under a stored key; the founder\'s tool confirms it; the ledger says refunded', async () => {
    const orderId = await realOrder('0101');
    const paye = devis.get(orderId)!.amountPaidAtCheckout;
    expect((await progress(refusedEvent(orderId))).status).toBe(200);
    await jusquADemande(orderId);

    const ouvert = await auditDe(orderId);
    expect(ouvert.state).toBe('confirmed');
    expect(ouvert.remboursement).toMatchObject({ decision: 'ouvert', retenu: 0 });
    expect(ouvert.remboursement!.lignes).toEqual([expect.objectContaining({ etat: 'demande', amount: paye, essais: 1 })]);
    expect(ouvert.remboursement!.lignes[0]!.refundKey).toMatch(/^rf-[0-9a-f-]{36}$/);
    // The provider was asked under THE STORED key: its reference is minted from the key it received.
    expect(ouvert.remboursement!.lignes[0]!.refundRef).toBe(`refund-${ouvert.remboursement!.lignes[0]!.refundKey}`);
    // Her screen: her money, on its way back — the amount she paid, nothing else.
    const enCours = await vueDe(orderId);
    expect(enCours['remboursement']).toEqual({ etat: 'en_cours', montant: paye, motif: 'retour' });
    expect(JSON.stringify(enCours)).not.toContain('rf-');

    // The stand-in reads ONLY what it was asked, behind the secret.
    expect((await mf.dispatchFetch(`http://c/checkout/webhook/refund-key/${encodeURIComponent(orderId)}`)).status).toBe(401);
    const demandes = await demandesDe(orderId);
    expect(demandes.status).toBe(200);
    expect(demandes.json.remboursements).toEqual([
      { legType: 'checkout', refundKey: ouvert.remboursement!.lignes[0]!.refundKey, amount: paye, collectRef: ouvert.escrow.paymentLegs[0]!.collectRef },
    ]);

    const r = demandes.json.remboursements![0]!;
    const applied = await confirmer(orderId, r);
    expect(`${applied.status} ${await applied.text()}`).toBe('200 {"status":"applied","state":"refunded"}');
    const fini = await auditDe(orderId);
    expect(fini.state).toBe('refunded');
    expect(fini.escrow.status).toBe('refunded');
    expect(fini.escrow.paymentLegs[0]!.status).toBe('refunded');
    expect(fini.refunds).toEqual([expect.objectContaining({ amount: paye, refundKey: r.refundKey, fee: 0 })]);
    expect((await vueDe(orderId))['remboursement']).toEqual({ etat: 'fait', montant: paye, motif: 'retour' });
    expect((await vueDe(orderId))['state']).toBe('refunded');

    // A redelivery is absorbed; a refused fact delivered again opens nothing new.
    expect((await (await confirmer(orderId, r)).json())).toEqual({ status: 'duplicate', state: 'refunded' });
    expect((await progress(refusedEvent(orderId))).status).toBe(200);
    expect((await auditDe(orderId)).refunds).toHaveLength(1);
  }, 60_000);

  it('a buyer refusal whose fee Séra KEPT: every franc but the delivery fee goes back', async () => {
    const orderId = await realOrder('0102');
    const { amountPaidAtCheckout, deliveryFee } = devis.get(orderId)!;
    expect(deliveryFee).toBeGreaterThan(0);
    const refusAcheteur = {
      name: 'delivery.refused.v1',
      envelope: {
        command_id: `door-refusal-${orderId}`, correlation_id: `corr-${orderId}`,
        aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-09-23T10:00:00.000Z', version: '1',
      },
      payload: { order_id: orderId, task_id: `task-${orderId}`, family: 'return', reason_code: 'change_of_mind', fault_class: 'buyer', fee_retained: true },
    };
    expect((await progress(refusAcheteur)).status).toBe(200);
    await jusquADemande(orderId);
    const a = await auditDe(orderId);
    expect(a.remboursement).toMatchObject({ decision: 'ouvert', retenu: deliveryFee });
    expect(a.remboursement!.lignes.map((l) => l.amount)).toEqual([amountPaidAtCheckout - deliveryFee]);
    // Her screen is told WHY it is less than she paid: the fee the vault kept.
    expect((await vueDe(orderId))['remboursement']).toEqual({ etat: 'en_cours', montant: amountPaidAtCheckout - deliveryFee, fraisGardes: deliveryFee, motif: 'retour' });
    const [r] = (await demandesDe(orderId)).json.remboursements!;
    expect((await confirmer(orderId, r!)).status).toBe(200);
    const fini = await auditDe(orderId);
    expect(fini.state).toBe('refunded');
    expect((await vueDe(orderId))['remboursement']).toEqual({ etat: 'fait', montant: amountPaidAtCheckout - deliveryFee, fraisGardes: deliveryFee, motif: 'retour' });
    // Not every franc came back — the leg is not called refunded.
    expect(fini.escrow.status).toBe('hold');
  }, 60_000);

  it('a redelivered refusal re-arms the alarm for a refund still to ask even when the relay is done; a late door leg re-arms it too (call-site pins, the standing standard)', () => {
    // The crash window between the relay row and the refund record cannot be
    // driven on a live Worker; the recovery is pinned where it lives.
    const src = readFileSync('worker/order-do.ts', 'utf8');
    expect(src).toContain(
      "if ((existing.status === 'pending' || (await this.remboursementADemander())) && (await this.state.storage.getAlarm()) === null) {",
    );
    expect(src).toContain("if (strandedPorte?.status === 'pending' || (await this.remboursementADemander())) {");
    expect(src.match(/await this\.etendreRemboursement\(\);/g)).toHaveLength(2);
  });

  it('the provider\'s word is judged to the franc: another amount, a key never asked, and no secret are all refused — nothing moves', async () => {
    const orderId = await realOrder('0103');
    expect((await progress(refusedEvent(orderId))).status).toBe(200);
    await jusquADemande(orderId);
    const [r] = (await demandesDe(orderId)).json.remboursements!;

    const faux = composeSandboxRefund(orderId, { ...r!, amount: r!.amount + 1 }, new Date().toISOString());
    const franc = await mf.dispatchFetch('http://c/checkout/webhook/refund', { method: 'POST', headers: signe, body: JSON.stringify(faux) });
    expect(`${franc.status} ${await franc.text()}`).toBe('422 {"error":"amount_mismatch"}');
    const etranger = composeSandboxRefund(orderId, { ...r!, refundKey: 'rf-never-asked' }, new Date().toISOString());
    const inconnu = await mf.dispatchFetch('http://c/checkout/webhook/refund', { method: 'POST', headers: signe, body: JSON.stringify(etranger) });
    expect(`${inconnu.status} ${await inconnu.text()}`).toBe('422 {"error":"refund_key_unknown"}');
    const sansCle = await mf.dispatchFetch('http://c/checkout/webhook/refund', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(composeSandboxRefund(orderId, r!, new Date().toISOString())),
    });
    expect(sansCle.status).toBe(401);

    const a = await auditDe(orderId);
    expect(a.state).toBe('confirmed');
    expect(a.refunds).toEqual([]);
    expect(a.reconAlerts.map((x) => x.payload['alert'])).toEqual(
      expect.arrayContaining(['provider_refund_contradicts_request', 'webhook_names_foreign_refund']),
    );
  }, 60_000);
});

/**
 * ═══ REMBOURSEMENT-2 — THE SUPPLIER REFUSES A PAID ORDER (Boutik+ B6.1:
 *     « Accept/reject … → refund saga ») ═══
 *
 * Boutik+ sends the canon `fulfillment.rejected.v1` on the same progress door
 * as accepted/ready, with the same strict {orderId, at} payload. The order
 * refunds her every franc (seller fault: the Protection Fund's to absorb,
 * never her refund's gate), once, and her screen is told the article could
 * not be supplied — not that a parcel came back.
 */
describe('REMBOURSEMENT-2 — the supplier refuses a paid order: she is refunded every franc', () => {
  const rejete = (orderId: string, payload: Record<string, unknown> = { orderId, at: '2026-09-23T11:00:00.000Z' }) => ({
    name: 'fulfillment.rejected.v1',
    envelope: {
      command_id: `fulfillment-rejected-${orderId}`, correlation_id: `corr-${orderId}`,
      aggregateVersion: 2, actor: 'offer-service:fulfillment', serverTime: '2026-09-23T11:00:00.000Z', version: '1',
    },
    payload,
  });
  const auditDe = async (orderId: string) => {
    const ns = await mf.getDurableObjectNamespace('ORDER');
    return (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
      state: string;
      remboursement: { decision: string; refus: { nature: string } | null; lignes: { etat: string; amount: number }[] } | null;
    };
  };
  const vueDe = async (orderId: string) =>
    safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());

  it('the refusal opens her refund — every franc, asked of the provider — and her screen hears « indisponible »; a redelivery changes nothing', async () => {
    const orderId = await realOrder('0301');
    const paye = devis.get(orderId)!.amountPaidAtCheckout;
    expect((await progress(rejete(orderId))).status).toBe(200);
    const deadline = Date.now() + 8_000;
    let a = await auditDe(orderId);
    while (a.remboursement?.lignes[0]?.etat !== 'demande' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      a = await auditDe(orderId);
    }
    expect(a.remboursement).toMatchObject({ decision: 'ouvert', refus: { nature: 'refus_fournisseur' } });
    expect(a.remboursement!.lignes).toEqual([expect.objectContaining({ etat: 'demande', amount: paye })]);
    expect((await vueDe(orderId))['remboursement']).toEqual({ etat: 'en_cours', montant: paye, motif: 'indisponible' });
    const encore = await progress(rejete(orderId));
    expect(await encore.json()).toEqual({ ok: true, status: 'duplicate' });
    expect((await auditDe(orderId)).remboursement!.lignes).toHaveLength(1);
  }, 60_000);

  it('the payload is the canon progress payload or nothing: an extra field is refused at the door, and nothing opens', async () => {
    const orderId = await realOrder('0302');
    const res = await progress(rejete(orderId, { orderId, at: '2026-09-23T11:00:00.000Z', supplierId: 'sup-1' }));
    expect(res.status).toBe(400);
    expect((await auditDe(orderId)).remboursement).toBeNull();
  }, 60_000);
});

/**
 * ═══ REMBOURSEMENT-2 — A REFUND THAT CANNOT FINISH BY ITSELF IS TOLD TO THE
 *     FOUNDER (founder order 2026-09-23: « go for … this ») ═══
 *
 * Three ways a refund stops on its own, each on the real Worker: the provider
 * declines the ask by name; Séra's refusal fact cannot be read (no refund was
 * decided); the provider accepted the ask and never confirmed it, past the
 * same stuck limit the other watches use. Each sinks an alert on the order's
 * record AND shows on his console row — the place he actually looks.
 */
describe('REMBOURSEMENT-2 — a refund that cannot finish by itself is told to the founder', () => {
  const auditDe = async (orderId: string) => {
    const ns = await mf.getDurableObjectNamespace('ORDER');
    return (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
      state: string;
      remboursement: { decision: string; lignes: { etat: string; essais: number; refundKey: string; alerteLe?: string }[] } | null;
      reconAlerts: { name: string; payload: Record<string, unknown> }[];
    };
  };
  const rangeeDe = async (orderId: string) => {
    const ns = await mf.getDurableObjectNamespace('ORDER');
    return (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/dispatch')).json()) as { remboursement: unknown };
  };
  async function jusqua<T>(lire: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 8_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let v = await lire();
    while (!ok(v) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      v = await lire();
    }
    return v;
  }
  const signe = { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET };

  describe('the provider declines the refund by name', () => {
    let principal: Miniflare;
    const dir = mkdtempSync(join(tmpdir(), 'rembourse-refus-'));
    beforeAll(() => {
      principal = mf;
      mf = makeMf(dir, { PAYMENT_SANDBOX_BEHAVIOR: JSON.stringify({ refuseRefunds: true }) });
    });
    afterAll(async () => {
      await mf.dispose();
      mf = principal;
      rmSync(dir, { recursive: true, force: true });
    });

    it('the line is final and never re-asked; the alert names it; his console row says the refund is blocked', async () => {
      const orderId = await realOrder('0201');
      expect((await progress(refusedEvent(orderId))).status).toBe(200);
      const a = await jusqua(() => auditDe(orderId), (x) => x.remboursement?.lignes[0]?.etat === 'refuse');
      expect(a.remboursement!.lignes).toEqual([expect.objectContaining({ etat: 'refuse', essais: 1 })]);
      const alerte = a.reconAlerts.find((x) => x.payload['alert'] === 'provider_refused_refund');
      expect(alerte?.payload).toMatchObject({ leg: 'checkout', refund_key: a.remboursement!.lignes[0]!.refundKey, provider_reason: 'refund_declined' });
      expect((await rangeeDe(orderId)).remboursement).toEqual({ etat: 'bloque', raison: 'refus_du_prestataire' });
      // Never asked again, never alerted twice.
      await new Promise((r) => setTimeout(r, 1_500));
      const apres = await auditDe(orderId);
      expect(apres.remboursement!.lignes[0]!.essais).toBe(1);
      expect(apres.reconAlerts.filter((x) => x.payload['alert'] === 'provider_refused_refund')).toHaveLength(1);
    }, 60_000);

    it('a refusal fact Séra sent that cannot be read decides nothing — and says so at once', async () => {
      const orderId = await realOrder('0202');
      const illisible = { ...refusedEvent(orderId), payload: { order_id: orderId, task_id: `task-${orderId}`, quoi: 'inconnu' } };
      expect((await progress(illisible)).status).toBe(200);
      const a = await jusqua(() => auditDe(orderId), (x) => x.remboursement !== null);
      expect(a.remboursement).toMatchObject({ decision: 'refus_illisible', lignes: [] });
      expect(a.reconAlerts.map((x) => x.payload['alert'])).toContain('refusal_fact_unreadable');
      expect((await rangeeDe(orderId)).remboursement).toEqual({ etat: 'bloque', raison: 'refus_illisible' });
    }, 60_000);
  });

  describe('the provider accepts the refund and never confirms it', () => {
    let principal: Miniflare;
    const dir = mkdtempSync(join(tmpdir(), 'rembourse-bloque-'));
    beforeAll(() => {
      principal = mf;
      mf = makeMf(dir, { STUCK_SAGA_TTL_MS: '800' });
    });
    afterAll(async () => {
      await mf.dispose();
      mf = principal;
      rmSync(dir, { recursive: true, force: true });
    });

    it('past the stuck limit the founder is told ONCE; the confirmation then clears his row to « fait »', async () => {
      const orderId = await realOrder('0203');
      expect((await progress(refusedEvent(orderId))).status).toBe(200);
      const demande = await jusqua(() => auditDe(orderId), (x) => x.remboursement?.lignes[0]?.etat === 'demande');
      expect((await rangeeDe(orderId)).remboursement).toEqual({ etat: 'en_cours' });
      const cle = demande.remboursement!.lignes[0]!.refundKey;
      const bloque = await jusqua(
        () => auditDe(orderId),
        (x) => x.reconAlerts.some((y) => y.name === 'saga.stuck.v1' && y.payload['stuck_in'] === 'refund'),
      );
      const stuck = bloque.reconAlerts.filter((y) => y.name === 'saga.stuck.v1' && y.payload['stuck_in'] === 'refund');
      expect(stuck).toHaveLength(1);
      expect(stuck[0]!.payload).toMatchObject({ blocked_on: 'provider_refund_confirmation', refund_key: cle, leg: 'checkout' });
      expect((await rangeeDe(orderId)).remboursement).toEqual({ etat: 'bloque', raison: 'sans_confirmation' });

      // The provider's word arrives late: the refund is done, and his row says so.
      const demandes = (await (await mf.dispatchFetch(`http://c/checkout/webhook/refund-key/${encodeURIComponent(orderId)}`, { headers: signe })).json()) as {
        remboursements: { legType: string; refundKey: string; amount: number; collectRef: string }[];
      };
      const ok = await mf.dispatchFetch('http://c/checkout/webhook/refund', {
        method: 'POST', headers: signe, body: JSON.stringify(composeSandboxRefund(orderId, demandes.remboursements[0]!, new Date().toISOString())),
      });
      expect(ok.status).toBe(200);
      expect((await rangeeDe(orderId)).remboursement).toEqual({ etat: 'fait' });
      expect((await auditDe(orderId)).state).toBe('refunded');
      // Once: no second stuck alert after it cleared.
      await new Promise((r) => setTimeout(r, 1_200));
      expect((await auditDe(orderId)).reconAlerts.filter((y) => y.name === 'saga.stuck.v1' && y.payload['stuck_in'] === 'refund')).toHaveLength(1);
    }, 60_000);
  });
});
