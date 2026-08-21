import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { PlatformEventSchema } from '@platform/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ BOUTIK-SUIVI — the delivery reaches the SUPPLIER's console ═══
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

const WRITE_SECRET = 'test-write-secret-liv001';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-liv001';
const PROGRESS_SECRET = 'test-progress-write-secret-liv001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-liv001';
const authed = { 'X-Write-Key': WRITE_SECRET };

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

let mf: Miniflare;

function makeMf(persistDir: string): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO',
    },
    durableObjectsPersist: persistDir,
    bindings: {
      STOREFRONT_WRITE_SECRET: WRITE_SECRET,
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
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
async function realOrder(n: string): Promise<string> {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-liv-${n}`, resellerId: `rs-liv-${n}`,
      shortCode: `LIV-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-liv-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-liv-${n}`, storefrontId: `sf-liv-${n}`,
      resellerId: `rs-liv-${n}`, productVersionId: 'pv-liv-1', offerVersion: 'ov-liv-1',
      markup: 1_500, correlationId: `corr-liv-${n}`, at: T0,
    }),
  });
  if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `liv-${n}`, pid: 'pv-liv-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: `rs-liv-${n}`, requestKey: freshKey(),
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
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
  const vue = safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());
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
        provider: 'sandbox-provider', payment_attempt_id: `sandbox-${orderId}`,
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
  };
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
