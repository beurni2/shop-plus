import { OrderConfirmedEventSchema } from '@platform/contracts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * SP3.3a — THE PAYMENT LEGS ON REAL WORKERD (Miniflare), through the COMBINED
 * Worker bundle: the composition root, the public exemption, the webhook secret
 * gate, the reservation mirror, the CheckoutDO and the OrderDO — all the real
 * code, none of it stubbed.
 *
 * EVERY DURABILITY CLAIM CROSSES A RESTART: the Miniflare instance is disposed
 * and re-created on the SAME persist dir, so « it survived » means a process
 * death, not a second request.
 *
 * THE WEBHOOK BYTES ARE THE FROZEN VAULT'S CERTIFIED MOCK, not hand-written
 * JSON: `MockPaymentProvider` builds every event this suite posts, through the
 * same pinned `PlatformEventSchema` the real producer will use.
 *
 * WHAT THIS SUITE CANNOT PROVE, stated rather than glossed: the 15-minute quote
 * expiry and the 2-minute reservation TTL cannot be reached against workerd's
 * real clock, and there is deliberately NO test-only clock binding on a money
 * path. Both are proven BY VALUE in `order-core.test.ts` against the very
 * functions the Durable Object calls.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'order-do-'));
const persistSlow = mkdtempSync(join(tmpdir(), 'order-do-slow-'));
const persistNoSecret = mkdtempSync(join(tmpdir(), 'order-do-nosecret-'));
const persistEmptySecret = mkdtempSync(join(tmpdir(), 'order-do-emptysecret-'));
const T0 = '2026-07-30T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-0001';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-0001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-0001';
const authed = { 'X-Write-Key': WRITE_SECRET };
const signed = { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' };

/** The producer behind the OFFER binding — publish signs HER price from it. */
const SUPPLY = [
  {
    productVersionId: 'pv-order-1',
    offerVersion: 'ov-order-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    // SELLER-TIER-WIRE-1 / ORDER-PAID-WIRE-1b: verified, so a DOOR order is
    // constructible in this harness at all — the verifier proved Option-B
    // emission was untestable without it.
    sellerTier: 'verified',
  },
  {
    // THE ALL-DISTINCT FIXTURE: B 22 000 · C 1 500 · M 3 000 · D 1 000 ⇒ every
    // derived amount is a different number, so a leak of any single one of them
    // is detectable on its own in the raw response bytes.
    productVersionId: 'pv-order-distinct',
    offerVersion: 'ov-order-distinct',
    basePrice: 22_000,
    resellerCommission: 1_500,
    available: 9,
    productName: 'Ensemble brodé',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
  },
];

/**
 * `webhookSecret` distinguishes the three deployments that matter to the gate:
 * a real secret, the EMPTY string (a secret set to nothing), and `null` — the
 * binding ABSENT entirely, which is what a Worker deployed before
 * `wrangler secret put` actually looks like.
 */
function makeMf(
  persistDir: string,
  sandboxBehavior?: string,
  webhookSecret: string | null = WEBHOOK_SECRET,
): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO',
      LISTING: 'ListingDO',
      CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO',
    },
    durableObjectsPersist: persistDir,
    bindings: {
      STOREFRONT_WRITE_SECRET: WRITE_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      ...(webhookSecret !== null ? { PAYMENT_WEBHOOK_SECRET: webhookSecret } : {}),
      ...(sandboxBehavior !== undefined ? { PAYMENT_SANDBOX_BEHAVIOR: sandboxBehavior } : {}),
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        // ORDER-PAID-WIRE-1b — the intake's stand-in: capture every emitted
        // event with its Authorization header, answer per the knob so a test
        // can be boutik-down without a second runtime.
        if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
          fulfillmentPosts.push({
            auth: request.headers.get('Authorization'),
            body: await request.json().catch(() => null),
          });
          return fulfillmentRespond === 'ok'
            ? Response.json({ ok: true, status: 'registered' })
            : new Response('boutik exploded', { status: 500 });
        }
        const asOf = new Date().toISOString();
        const single = /^\/supply-projection\/([^/]+)$/.exec(path);
        if (single) {
          const pid = decodeURIComponent(single[1]!);
          const value = SUPPLY.find((v) => v.productVersionId === pid);
          if (value === undefined) {
            return Response.json(
              { service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' },
              { status: 404 },
            );
          }
          return Response.json({ version: 1, asOf, value });
        }
        return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
      },
    },
  });
}

let mf = makeMf(persist);
async function restart(): Promise<void> {
  await mf.dispose();
  mf = makeMf(persist); // same persist dir = a real process death
}

/** A SECOND runtime whose certified provider TIMES OUT the first charge of every
 *  order — the only way a charge can fail, and therefore the only way the retry
 *  path (a NEW audit attempt id on ONE provider key) is reachable for real. */
const SLOW_BEHAVIOR = JSON.stringify({ timeoutFirstNInitiates: 1 });
let slow: Miniflare | undefined;
function slowMf(): Miniflare {
  slow ??= makeMf(persistSlow, SLOW_BEHAVIOR);
  return slow;
}
/** A real process death for the slow runtime, on the same persist dir. */
async function slowRestart(): Promise<Miniflare> {
  await slowMf().dispose();
  slow = makeMf(persistSlow, SLOW_BEHAVIOR);
  return slow;
}

/**
 * THE TWO DEPLOYMENTS THAT MUST REFUSE EVERY WEBHOOK: the secret UNSET (the
 * binding absent — a Worker deployed before `wrangler secret put`) and the
 * secret EMPTY. Their own persist dirs, so nothing they do can be confused with
 * the main runtime's state.
 */
let noSecret: Miniflare | undefined;
function noSecretMf(): Miniflare {
  noSecret ??= makeMf(persistNoSecret, undefined, null);
  return noSecret;
}
let emptySecret: Miniflare | undefined;
function emptySecretMf(): Miniflare {
  emptySecret ??= makeMf(persistEmptySecret, undefined, '');
  return emptySecret;
}

afterAll(async () => {
  await mf.dispose();
  if (slow !== undefined) await slow.dispose();
  if (noSecret !== undefined) await noSecret.dispose();
  if (emptySecret !== undefined) await emptySecret.dispose();
  for (const dir of [persist, persistSlow, persistNoSecret, persistEmptySecret]) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ────────────────────────────── the harness ──────────────────────────────── */

/** ORDER-PAID-WIRE-1b — every fulfillment POST any runtime emitted, in order. */
const fulfillmentPosts: { auth: string | null; body: unknown }[] = [];
let fulfillmentRespond: 'ok' | 'fail' = 'ok';

/** Poll until the emitter's alarm has delivered `n` posts (it fires ~immediately). */
async function waitForFulfillmentPosts(n: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (fulfillmentPosts.length < n && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** The outbox, read through the DO stub — internal wire, never routed publicly. */
async function outboxOf(m: Miniflare, orderId: string) {
  const ns = await m.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/outbox');
  return (await res.json()) as {
    ok: boolean;
    outbox?: { status: string; attempts: number; deliveredAt?: string; event?: unknown; reason?: string };
  };
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

let seq = 0;
const freshKey = (): string => `rk-order-${String(seq++).padStart(4, '0')}-${'x'.repeat(10)}`;

async function seedShop(
  m: Miniflare,
  n: string,
  opts: { markup?: number; pid?: string; offer?: string } = {},
): Promise<{ slug: string; resellerId: string; pid: string }> {
  const markup = opts.markup ?? 1_500;
  const pid = opts.pid ?? 'pv-order-1';
  const offer = opts.offer ?? 'ov-order-1';
  const shortCode = `ORDER-${n}`;
  const created = await m.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`,
      id: `sf-order-${n}`,
      resellerId: `rs-order-${n}`,
      shortCode,
      name: 'Boutique du fondateur',
      zone: 'Ouagadougou',
      category: 'Général',
      correlationId: `corr-${n}`,
      at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`seed: storefront create ${created.status}`);
  const pub = await m.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`,
      listingId: `lst-order-${n}`,
      storefrontId: `sf-order-${n}`,
      resellerId: `rs-order-${n}`,
      productVersionId: pid,
      offerVersion: offer,
      markup,
      correlationId: `corr-${n}`,
      at: T0,
    }),
  });
  const decision = (await pub.json()) as { status?: string };
  if (decision.status !== 'published') throw new Error(`seed: listing publish ${JSON.stringify(decision)}`);
  return { slug: shortCode.toLowerCase(), resellerId: `rs-order-${n}`, pid };
}

async function issueQuoteFor(m: Miniflare, shop: { slug: string; resellerId: string; pid: string }) {
  const res = await m.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: shop.slug,
      pid: shop.pid,
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: shop.resellerId,
      requestKey: freshKey(),
    }),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`setup: quote ${res.status} ${text}`);
  return safeJson(text) as { quoteId: string; buyerTotal: number; amountPaidAtCheckout: number };
}

/** The §6.1-eligible DOOR quote — tier and category come from SUPPLY above. */
async function issueDoorQuoteFor(m: Miniflare, shop: { slug: string; resellerId: string; pid: string }) {
  const res = await m.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: shop.slug,
      pid: shop.pid,
      paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
      zoneTo: 'Ouagadougou',
      attributionResellerId: shop.resellerId,
      requestKey: freshKey(),
      payAtDoorContext: {
        eligibility: { buyerRef: 'b1', state: 'allowed', buyerRefusalCount: 0, buyerRiskState: 'normal', requiredDeposit: 0 },
      },
    }),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`setup: door quote ${res.status} ${text}`);
  return safeJson(text) as { quoteId: string; amountPaidAtCheckout: number; amountDueAtDelivery: number };
}

async function reserve(m: Miniflare, quoteId: string, commandId: string, holderRef: string) {
  const res = await m.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId, holderRef }),
  });
  const text = await res.text();
  return { status: res.status, json: safeJson(text) };
}

async function postOrder(m: Miniflare, body: Record<string, unknown>) {
  const res = await m.dispatchFetch('http://c/checkout/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text), headers: res.headers };
}

async function getOrder(m: Miniflare, orderId: string) {
  const res = await m.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`, { method: 'GET' });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text), headers: res.headers };
}

async function postWebhook(m: Miniflare, event: unknown, headers: Record<string, string> = signed) {
  const res = await m.dispatchFetch('http://c/checkout/webhook/payment', {
    method: 'POST',
    headers,
    body: JSON.stringify(event),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

/** The order's own internal record, read through the DO stub — never routed. */
async function audit(m: Miniflare, orderId: string) {
  const ns = await m.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit');
  return (await res.json()) as {
    ok: boolean;
    exists?: boolean;
    receipt?: { holderRef?: string; reservationId?: string } | null;
    state?: string | null;
    chain?: Record<string, string>;
    priorPaymentAttemptIds?: string[];
    attempts?: {
      attemptId: string;
      providerKey: string;
      amount: number;
      outcome: string;
      collectRef?: string;
    }[];
    escrow?: { paymentLegs: { legType: string; amount: number; status: string; collectRef: string }[] } | null;
  };
}

/**
 * A PROVIDER WEBHOOK, BUILT BY THE FROZEN VAULT'S CERTIFIED MOCK. The event's
 * `command_id` is `whk-collect-{attemptId}` — the mock's own redelivery
 * discipline — so the SAME attempt id posted twice is a genuine REDELIVERY of
 * one webhook, and a different attempt id is a genuinely different event.
 */
function webhookEvent(orderId: string, amount: number, attemptId: string): unknown {
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({
    orderId,
    paymentAttemptId: attemptId,
    amount,
    correlationId: `corr-${orderId}`,
    requestedAtIso: T0,
  });
  return provider.webhookDeliveryPlan()[0]!.event;
}

/**
 * ═══ PROVIDER TRUTH, READ BACK FROM THE PORT'S OWN RETURN VALUE ═══
 *
 * `collectRef` is what `initiateCharge` ANSWERED, and the certified mock builds
 * it as `collect-{paymentAttemptId}` — so it is the only value in this system
 * that names the key the provider actually saw. Every webhook this suite
 * fabricates is derived from it rather than from the record being audited: a
 * test that synthesises provider truth out of the field it is checking proves
 * nothing (verifier finding, round 2 — the leg-key fix was undefended for
 * exactly that reason).
 */
async function chargeKeySeenByProvider(m: Miniflare, orderId: string): Promise<string> {
  const record = await audit(m, orderId);
  const attempts = record.attempts ?? [];
  const last = attempts[attempts.length - 1];
  if (last?.collectRef === undefined) throw new Error(`no accepted charge on ${orderId}`);
  expect(last.collectRef.startsWith('collect-'), 'the mock names its own collect ref').toBe(true);
  return last.collectRef.slice('collect-'.length);
}

/** shop → quote → hold → order, the whole buyer path, on the real Worker. */
async function orderedQuote(
  m: Miniflare,
  n: string,
  opts: { markup?: number; pid?: string; offer?: string; holderRef?: string } = {},
) {
  const shop = await seedShop(m, n, opts);
  const quote = await issueQuoteFor(m, shop);
  const holderRef = opts.holderRef ?? `holder-${n}`;
  const held = await reserve(m, quote.quoteId, `cmd-reserve-${n}`, holderRef);
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status} ${JSON.stringify(held.json)}`);
  const created = await postOrder(m, {
    quoteId: quote.quoteId,
    holderRef,
    commandId: `cmd-order-${n}`,
  });
  return { shop, quote, holderRef, created, orderId: `ord-${quote.quoteId}` };
}

/* ═════════════════════ creation from a RESERVED quote ═════════════════════ */

describe('OrderDO — an order exists only for a quote its caller actually holds', () => {
  it('a held quote creates one order, payment_pending, with what is paid now and due at delivery', async () => {
    const { created, orderId, quote } = await orderedQuote(mf, '0001');
    expect(created.status, created.text).toBe(200);
    expect(created.json['orderId']).toBe(orderId);
    expect(created.json['state']).toBe('payment_pending');
    // §5.4 baseline: B 10 000 · C 1 000 · M 1 500 · D 1 000 ⇒ 12 500 paid now
    expect(created.json['amountPaidAtCheckout']).toBe(12_500);
    expect(created.json['amountDueAtDelivery']).toBe(0);
    expect(created.json['amountPaidAtCheckout']).toBe(quote.amountPaidAtCheckout);

    // the charge was initiated exactly once, against a SERVER-MINTED attempt id
    const record = await audit(mf, orderId);
    expect(record.attempts).toHaveLength(1);
    expect(record.attempts![0]!.outcome).toBe('accepted');
    expect(record.attempts![0]!.attemptId).toMatch(/^att-[0-9a-f-]{36}$/u);
    expect(record.chain!['payment_attempt_id']).toBe(record.attempts![0]!.attemptId);
    // THE AMOUNT ASKED FOR IS THE MODE'S OWN LEG, to the franc. Without this
    // assertion a broken leg derivation charged the wrong number and every other
    // test in this file still passed (found by mutation check).
    expect(record.attempts![0]!.amount).toBe(12_500);
    expect(record.attempts![0]!.amount).toBe(quote.amountPaidAtCheckout);
    // …and NOTHING is paid yet: an accepted charge is not payment.
    expect(record.escrow).toBeNull();
  });

  it('AN UNRESERVED QUOTE IS REFUSED — and the refusal does not quietly take the hold', async () => {
    const shop = await seedShop(mf, '0002');
    const quote = await issueQuoteFor(mf, shop);
    const refused = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-0002',
      commandId: 'cmd-order-0002',
    });
    expect(refused.status).toBe(422);
    expect(refused.json['error']).toBe('quote_not_reserved');
    expect(refused.json['amountPaidAtCheckout']).toBeUndefined();
    // THE HOLD IS STILL FREE: the refusal above did not reserve anything, so the
    // real buyer can still take her own hold and order.
    const held = await reserve(mf, quote.quoteId, 'cmd-reserve-0002', 'holder-0002');
    expect(held.status).toBe(200);
    const created = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-0002',
      commandId: 'cmd-order-0002b',
    });
    expect(created.status, created.text).toBe(200);
    expect(created.json['state']).toBe('payment_pending');
  });

  it('ANOTHER HOLDER IS REFUSED BY NAME — the SP3.2a ownership flag, closed at the order', async () => {
    const shop = await seedShop(mf, '0003');
    const quote = await issueQuoteFor(mf, shop);
    const held = await reserve(mf, quote.quoteId, 'cmd-reserve-0003', 'holder-vraie');
    expect(held.status).toBe(200);
    const stranger = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-etranger',
      commandId: 'cmd-order-0003-x',
    });
    expect(stranger.status).toBe(409);
    expect(stranger.json['error']).toBe('reservation_held_by_another');
    expect(stranger.text.includes('12500')).toBe(false); // no price crossed over
    // …and no order was created by the attempt (the HOLD is still there — that
    // is the point — but nothing was created against it)
    const record = await audit(mf, `ord-${quote.quoteId}`);
    expect(record.exists).toBe(false);
    expect(record.state).toBeNull();
    // the true holder still orders
    const hers = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-vraie',
      commandId: 'cmd-order-0003',
    });
    expect(hers.status).toBe(200);
  });

  it('an unknown quote is the honest 404, and a MIS-SHAPED body never reaches an object', async () => {
    const missing = await postOrder(mf, {
      quoteId: 'quote-jamais-emis-0001',
      holderRef: 'h',
      commandId: 'c',
    });
    expect(missing.status).toBe(404);
    expect(missing.json['error']).toBe('quote_unknown');

    // A PRICE THE BUYER NAMES IS REFUSED OUTRIGHT — unknown keys are never ignored.
    for (const extra of [
      { buyerTotal: 1 },
      { amount: 1 },
      { amountPaidAtCheckout: 0 },
      { paymentAttemptId: 'att-mine' },
    ]) {
      const res = await postOrder(mf, {
        quoteId: 'quote-x',
        holderRef: 'h',
        commandId: 'c',
        ...extra,
      });
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect(res.json['error']).toBe('unknown_field');
    }
  });
});

/* ═══════════════════ idempotency — no duplicate charge ════════════════════ */

describe('OrderDO — one command, one charge, forever', () => {
  it('THE SAME commandId REPLAYS BYTE-IDENTICALLY and charges nothing more, ACROSS A RESTART', async () => {
    const { created, orderId, quote, holderRef } = await orderedQuote(mf, '0004');
    expect(created.status).toBe(200);
    const body = { quoteId: quote.quoteId, holderRef, commandId: 'cmd-order-0004' };

    const replay = await postOrder(mf, body);
    expect(replay.status).toBe(200);
    expect(replay.text).toBe(created.text); // the SAME order, byte for byte

    await restart();

    const afterCrash = await postOrder(mf, body);
    expect(afterCrash.status).toBe(200);
    expect(afterCrash.text).toBe(created.text);

    const record = await audit(mf, orderId);
    expect(record.attempts).toHaveLength(1); // ONE charge across three commands
    expect(record.priorPaymentAttemptIds).toEqual([]);
  });

  it('A DIFFERENT commandId ON A LIVE ORDER answers the order as it stands — never a second charge', async () => {
    const { created, orderId, quote, holderRef } = await orderedQuote(mf, '0005');
    expect(created.status).toBe(200);
    const again = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef,
      commandId: 'cmd-order-0005-impatient',
    });
    expect(again.status).toBe(200);
    expect(again.json['orderId']).toBe(orderId);
    expect(again.json['state']).toBe('payment_pending');
    const record = await audit(mf, orderId);
    expect(record.attempts).toHaveLength(1); // the double tap charged nothing
  });

  /**
   * ═══ THE VERIFIER'S OWN BLOCKER SCENARIO, ROUND 2 ═══
   *
   * An `initiateCharge` TIMEOUT is the canonically ambiguous case: the money may
   * already have moved. The buyer retries. Before this round the retry minted a
   * fresh PROVIDER IDEMPOTENCY KEY, so one 12 500 F leg carried two keys a
   * provider cannot dedupe: the buyer debited twice, Shop+ recording one leg, and
   * the second webhook refused `out_of_order` and lost — no alert, no
   * reconciliation, no refund path.
   *
   * The audit attempt id must still be new (the state machine demands it). The
   * PROVIDER KEY must not be. Both halves are asserted here.
   */
  it('A RETRY AFTER A TIMEOUT REUSES THE LEG\'S PROVIDER KEY — a new AUDIT id, never a second collection', async () => {
    // This runtime's certified provider TIMES OUT the first charge of every
    // order (`timeoutFirstNInitiates: 1`), which is the only way a charge can
    // fail and therefore the only way this path is reachable for real.
    let m = slowMf();
    const shop = await seedShop(m, '0006');
    const quote = await issueQuoteFor(m, shop);
    const held = await reserve(m, quote.quoteId, 'cmd-reserve-0006', 'holder-0006');
    expect(held.status).toBe(200);
    const orderId = `ord-${quote.quoteId}`;

    const first = await postOrder(m, {
      quoteId: quote.quoteId,
      holderRef: 'holder-0006',
      commandId: 'cmd-order-0006',
    });
    expect(first.status, first.text).toBe(200);
    // THE ORDER EXISTS AND THE MONEY MAY OR MAY NOT HAVE MOVED — and `state`
    // says so. The HTTP code answers the command; only `state` answers the money.
    expect(first.json['state']).toBe('payment_failed');

    const failed = await audit(m, orderId);
    expect(failed.attempts).toHaveLength(1);
    expect(failed.attempts![0]!.outcome).toBe('timeout');
    const firstAttempt = failed.attempts![0]!.attemptId;
    const legKey = failed.attempts![0]!.providerKey;
    expect(legKey).toMatch(/^pk-[0-9a-f-]{36}$/u);
    expect(legKey).not.toBe(firstAttempt); // two identifiers, never one

    // A PROCESS DEATH BETWEEN THE TIMEOUT AND THE RETRY — the leg's key must
    // survive it, or the retry mints a second collection after every crash.
    m = await slowRestart();

    const retry = await postOrder(m, {
      quoteId: quote.quoteId,
      holderRef: 'holder-0006',
      commandId: 'cmd-order-0006-retry',
    });
    expect(retry.status, retry.text).toBe(200);
    expect(retry.json['state']).toBe('payment_pending');

    const after = await audit(m, orderId);
    expect(after.attempts).toHaveLength(2);
    const secondAttempt = after.attempts![1]!.attemptId;
    // THE AUDIT ID IS NEW — the vault refuses the retry edge otherwise.
    expect(secondAttempt).not.toBe(firstAttempt);
    // THE PROVIDER KEY IS THE SAME — ONE LEG, ONE COLLECTION, across a restart.
    expect(after.attempts![1]!.providerKey).toBe(legKey);
    expect(new Set(after.attempts!.map((a) => a.providerKey)).size).toBe(1);
    expect(after.attempts![1]!.outcome).toBe('accepted');

    /**
     * ═══ AND THE PORT ITSELF SAYS SO ═══
     *
     * `providerKey` above is a value this object WROTE; `collectRef` is a value
     * the PORT RETURNED, built by the certified mock from the key it was handed.
     * Asserting only the former let a one-line revert — handing the provider the
     * audit attempt id instead of the leg key — pass the whole suite while two
     * keys reached the provider for one 12 500 F leg. This is the assertion that
     * reads the call rather than the bookkeeping.
     */
    expect(after.attempts![1]!.collectRef).toBe(`collect-${legKey}`);
    expect(after.attempts![1]!.collectRef!.startsWith('collect-pk-')).toBe(true);
    expect(after.attempts![1]!.collectRef).not.toBe(`collect-${secondAttempt}`);
    expect(after.attempts![1]!.collectRef).not.toBe(`collect-${firstAttempt}`);
    // the superseded attempt is AUDITED, not erased
    expect(after.priorPaymentAttemptIds).toEqual([firstAttempt]);
    expect(after.chain!['payment_attempt_id']).toBe(secondAttempt);

    // THE CONSEQUENCE THAT MAKES IT MONEY-SAFE: because the key is the leg's,
    // the provider's confirmation for THIS leg is one event with one command id.
    // It pays the order once…
    // DERIVED FROM PROVIDER TRUTH — the key the port's own collect ref names,
    // never the `legKey` this test is checking.
    const seenByProvider = await chargeKeySeenByProvider(m, orderId);
    expect(seenByProvider).toBe(legKey);
    const event = webhookEvent(orderId, 12_500, seenByProvider);
    const paid = await postWebhook(m, event);
    expect(paid.status, paid.text).toBe(200);
    expect(paid.json['status']).toBe('applied');
    expect(paid.json['state']).toBe('confirmed');

    // …and the LATE confirmation of the ambiguous first charge — which carries
    // the same key, hence the same collect ref and the same command id — is
    // ABSORBED. Before this fix it arrived under a different key, was refused
    // `out_of_order`, and was lost while the buyer had been debited for it.
    const late = await postWebhook(m, event);
    expect(late.status).toBe(200);
    expect(late.json['status']).toBe('duplicate');
    expect(late.json['status']).not.toBe('out_of_order');
    const settled = await audit(m, orderId);
    expect(settled.escrow!.paymentLegs).toHaveLength(1);
    expect(settled.escrow!.paymentLegs[0]!.amount).toBe(12_500);
    expect(settled.escrow!.paymentLegs[0]!.collectRef).toBe(`collect-${seenByProvider}`);

    // AND THE REPLAY OF THE RETRY COMMAND CHARGES NOTHING MORE.
    const replay = await postOrder(m, {
      quoteId: quote.quoteId,
      holderRef: 'holder-0006',
      commandId: 'cmd-order-0006-retry',
    });
    expect(replay.text).toBe(retry.text);
    expect((await audit(m, orderId)).attempts).toHaveLength(2);
  });

  it('THE PROVIDER KEY IS THE LEG\'S FROM THE VERY FIRST CHARGE — distinct from the audit id, and durable', async () => {
    const { created, orderId } = await orderedQuote(mf, '0019');
    expect(created.status).toBe(200);
    const before = await audit(mf, orderId);
    expect(before.attempts![0]!.providerKey).toMatch(/^pk-/u);
    expect(before.attempts![0]!.attemptId).toMatch(/^att-/u);
    expect(before.attempts![0]!.providerKey).not.toBe(before.attempts![0]!.attemptId);
    // THE PORT'S OWN ANSWER names the key it was handed — the leg's, not the
    // attempt's. This is the assertion that reads the call.
    expect(before.attempts![0]!.collectRef).toBe(`collect-${before.attempts![0]!.providerKey}`);
    expect(before.attempts![0]!.collectRef).not.toBe(`collect-${before.attempts![0]!.attemptId}`);

    /**
     * THE DURABILITY CLAIM, THROUGH A REAL PROCESS DEATH: the charge has gone
     * out and this process dies. The key must come back, and the retry path must
     * find it — otherwise the next attempt mints a second collection, which is
     * the same money consequence as the conflation, reached by a crash instead
     * of an edit. (The key is handed to the provider only after storage answers
     * with it, so a charge cannot precede its own key.)
     */
    await restart();
    const after = await audit(mf, orderId);
    expect(after.attempts![0]!.providerKey).toBe(before.attempts![0]!.providerKey);
    expect(after.attempts![0]!.collectRef).toBe(before.attempts![0]!.collectRef);
  });

  /**
   * VERIFIER FINDING 4 — authorization must run BEFORE the idempotency cache.
   * A stranger replaying the owner's command id used to be handed the cached
   * answer at 200, while the same stranger under a different command id was
   * correctly refused. Nothing leaked, because that payload is what the public
   * GET already returns — but the ordering is the defect, and SP3.3b will grow
   * that answer.
   */
  it('A STRANGER REPLAYING THE OWNER\'S commandId IS REFUSED — the hold is proven before the cache is served', async () => {
    const { created, quote, holderRef } = await orderedQuote(mf, '0020');
    expect(created.status).toBe(200);
    const stranger = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-etranger-0020',
      commandId: 'cmd-order-0020', // the OWNER's command id, replayed
    });
    expect(stranger.status).toBe(409);
    expect(stranger.json['error']).toBe('reservation_held_by_another');
    expect(stranger.json['orderId']).toBeUndefined();
    expect(stranger.json['amountPaidAtCheckout']).toBeUndefined();
    // …and the owner's own replay is still byte-identical
    const owner = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef,
      commandId: 'cmd-order-0020',
    });
    expect(owner.text).toBe(created.text);
  });

  /**
   * VERIFIER FINDING 5 — the results lookup walked the prototype chain, so a
   * command id of `constructor` or `toString` returned a prototype member, an
   * unparseable body and a permanent failure for that id. `__proto__` is now
   * refused at the wire by the id alphabet; the other two must work normally.
   */
  it('a commandId that names an Object.prototype member behaves like any other', async () => {
    for (const [n, commandId] of [
      ['0021', 'constructor'],
      ['0022', 'toString'],
      ['0023', 'valueOf'],
    ] as const) {
      const shop = await seedShop(mf, n);
      const quote = await issueQuoteFor(mf, shop);
      const held = await reserve(mf, quote.quoteId, `cmd-reserve-${n}`, `holder-${n}`);
      expect(held.status).toBe(200);
      const created = await postOrder(mf, { quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId });
      expect(created.status, `${commandId}: ${created.text}`).toBe(200);
      expect(created.json['state']).toBe('payment_pending');
      // …and it REPLAYS as itself, not as a prototype member
      const replay = await postOrder(mf, { quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId });
      expect(replay.status).toBe(200);
      expect(replay.text).toBe(created.text);
    }
    // `__proto__` (and anything else outside the id alphabet) never reaches the
    // object at all — a command id is an audit identifier, not free bytes.
    const bad = await postOrder(mf, {
      quoteId: 'quote-whatever',
      holderRef: 'h',
      commandId: '__proto__',
    });
    expect(bad.status).toBe(400);
    expect(bad.json['field']).toBe('commandId');
  });
});

/* ══════════════════════════ the webhook — the spine ═══════════════════════ */

describe('OrderDO — the webhook is the ONLY payment truth, and it is authenticated first', () => {
  it('NO SECRET AND A WRONG SECRET ARE BOTH 401 — and nothing about the order moves', async () => {
    const { created, orderId } = await orderedQuote(mf, '0007');
    expect(created.status).toBe(200);
    const event = webhookEvent(orderId, 12_500, 'att-forged-0007');

    const none = await postWebhook(mf, event, { 'Content-Type': 'application/json' });
    expect(none.status).toBe(401);
    expect(none.json['error']).toBe('unauthorized');

    const wrong = await postWebhook(mf, event, {
      'X-Payment-Webhook-Key': 'not-the-secret',
      'Content-Type': 'application/json',
    });
    expect(wrong.status).toBe(401);
    // The 401 is IDENTICAL in both cases and says nothing about the order.
    expect(wrong.text).toBe(none.text);
    expect(wrong.text.includes(orderId)).toBe(false);

    // …and the order is untouched: still pending, still unconfirmed, no escrow.
    const state = await getOrder(mf, orderId);
    expect(state.json['state']).toBe('payment_pending');
    expect((await audit(mf, orderId)).escrow).toBeNull();

    // the WRITE key is not a payment key — the blast radius does not cross over
    const withWriteKey = await postWebhook(mf, event, {
      'X-Payment-Webhook-Key': WRITE_SECRET,
      'Content-Type': 'application/json',
    });
    expect(withWriteKey.status).toBe(401);
  });

  it('A SIGNED, AMOUNT-EXACT WEBHOOK PAYS AND CONFIRMS — with a funded checkout leg recorded', async () => {
    const { created, orderId } = await orderedQuote(mf, '0008');
    expect(created.status).toBe(200);
    const applied = await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0008'));
    expect(applied.status, applied.text).toBe(200);
    expect(applied.json['status']).toBe('applied');
    expect(applied.json['state']).toBe('confirmed');

    const record = await audit(mf, orderId);
    expect(record.state).toBe('confirmed');
    expect(record.escrow!.paymentLegs).toHaveLength(1);
    expect(record.escrow!.paymentLegs[0]).toMatchObject({
      legType: 'checkout',
      amount: 12_500,
      status: 'held',
    });
    const buyer = await getOrder(mf, orderId);
    expect(buyer.json['state']).toBe('confirmed');
  });

  it('A DUPLICATE WEBHOOK IS ABSORBED — one leg, one payment, no second confirmation', async () => {
    const { created, orderId } = await orderedQuote(mf, '0009');
    expect(created.status).toBe(200);
    const event = webhookEvent(orderId, 12_500, 'att-0009');
    const first = await postWebhook(mf, event);
    expect(first.json['status']).toBe('applied');

    for (const _ of [1, 2]) {
      const again = await postWebhook(mf, event);
      expect(again.status).toBe(200);
      expect(again.json['status']).toBe('duplicate');
    }
    const record = await audit(mf, orderId);
    expect(record.escrow!.paymentLegs).toHaveLength(1);

    // …AND THE ABSORPTION SURVIVES A PROCESS DEATH, which is the only kind of
    // idempotency worth claiming: the dedupe lives in the durable input log.
    await restart();
    const afterCrash = await postWebhook(mf, event);
    expect(afterCrash.json['status']).toBe('duplicate');
    expect((await audit(mf, orderId)).escrow!.paymentLegs).toHaveLength(1);
  });

  it('AN AMOUNT THAT IS NOT THE LEG IS REFUSED — one franc over, one franc under, and zero', async () => {
    const { created, orderId } = await orderedQuote(mf, '0010');
    expect(created.status).toBe(200);
    for (const amount of [12_499, 12_501, 0, 1_000]) {
      const res = await postWebhook(mf, webhookEvent(orderId, amount, `att-0010-${amount}`));
      expect(res.status, `amount ${amount}`).toBe(422);
      expect(res.json['error'], `amount ${amount}`).toBe('amount_mismatch');
    }
    // NOTHING was recorded and the order NEVER confirmed.
    const record = await audit(mf, orderId);
    expect(record.escrow).toBeNull();
    expect(record.state).toBe('payment_pending');
    expect((await getOrder(mf, orderId)).json['state']).toBe('payment_pending');

    // …and the CORRECT amount still pays, so the refusals above closed nothing else
    const ok = await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0010-true'));
    expect(ok.json['state']).toBe('confirmed');
  });

  it('AN OUT-OF-ORDER WEBHOOK REFUSES CLOSED — before the order exists, and after it is paid', async () => {
    const shop = await seedShop(mf, '0011');
    const quote = await issueQuoteFor(mf, shop);
    const orderId = `ord-${quote.quoteId}`;

    // BEFORE: an order that does not exist cannot be paid into existence.
    const early = await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0011-early'));
    expect(early.status).toBe(404);
    expect(early.json['error']).toBe('unknown_order');

    const held = await reserve(mf, quote.quoteId, 'cmd-reserve-0011', 'holder-0011');
    expect(held.status).toBe(200);
    const created = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-0011',
      commandId: 'cmd-order-0011',
    });
    expect(created.status).toBe(200);
    // …and the early event is NOT quietly applied afterwards either: it was
    // refused, not parked, so the order is still unpaid.
    expect((await audit(mf, orderId)).escrow).toBeNull();

    await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0011'));
    // AFTER: a DIFFERENT confirmation arriving on an already-paid order is
    // refused closed — never a second leg on one order.
    const late = await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0011-second'));
    expect(late.status).toBe(409);
    expect(late.json['error']).toBe('out_of_order');
    expect((await audit(mf, orderId)).escrow!.paymentLegs).toHaveLength(1);
  });

  it('A WEBHOOK FOR ANOTHER ORDER\'S CORRELATION IS REFUSED — a signed event still has to be THIS order\'s', async () => {
    const a = await orderedQuote(mf, '0012');
    const b = await orderedQuote(mf, '0013');
    expect(a.created.status).toBe(200);
    expect(b.created.status).toBe(200);
    // B's correlation, A's order id: the router addresses A, the spine refuses.
    const crossed = webhookEvent(b.orderId, 12_500, 'att-0012-crossed') as {
      payload: Record<string, unknown>;
    };
    crossed.payload['order_id'] = a.orderId;
    const res = await postWebhook(mf, crossed);
    expect(res.status).toBe(409);
    expect(res.json['error']).toBe('wrong_correlation');
    expect((await audit(mf, a.orderId)).escrow).toBeNull();
  });

  it('A LOST WEBHOOK LEAVES THE ORDER UNCONFIRMED — never quietly confirmed, across a restart', async () => {
    const { created, orderId } = await orderedQuote(mf, '0014');
    expect(created.status).toBe(200);
    // The charge was accepted and NO webhook is ever delivered (the certified
    // mock's `loseWebhook` partial failure, reproduced by simply not posting).
    const record = await audit(mf, orderId);
    expect(record.attempts![0]!.outcome).toBe('accepted');
    expect(record.state).toBe('payment_pending');
    expect(record.escrow).toBeNull();

    await restart();

    const afterCrash = await getOrder(mf, orderId);
    expect(afterCrash.status).toBe(200);
    expect(afterCrash.json['state']).toBe('payment_pending');
    expect(afterCrash.json['state']).not.toBe('confirmed');
    expect((await audit(mf, orderId)).escrow).toBeNull();
  });

  it('a malformed body and a body with no order_id are 400 — never a 500 on the money route', async () => {
    const notAnEvent = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
      method: 'POST',
      headers: signed,
      body: '{not json',
    });
    expect(notAnEvent.status).toBe(400);
    const noOrder = await postWebhook(mf, webhookEvent('ord-quote-x', 1, 'att-x') as { payload: object }, signed);
    expect([400, 404]).toContain(noOrder.status);
  });
});

/* ═══════════════════ durability across a real process death ═══════════════ */

describe('OrderDO — the order survives a process death', () => {
  it('a CONFIRMED order reads back identically after dispose(), with its funded leg intact', async () => {
    const { created, orderId } = await orderedQuote(mf, '0015');
    expect(created.status).toBe(200);
    const paid = await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0015'));
    expect(paid.json['state']).toBe('confirmed');
    const before = await getOrder(mf, orderId);

    await restart();

    const after = await getOrder(mf, orderId);
    expect(after.status).toBe(200);
    expect(after.text).toBe(before.text); // byte-identical, not merely equal
    const record = await audit(mf, orderId);
    expect(record.state).toBe('confirmed');
    expect(record.escrow!.paymentLegs).toHaveLength(1);
    expect(record.escrow!.paymentLegs[0]!.amount).toBe(12_500);
    expect(record.attempts).toHaveLength(1);
  });

  it('an unknown order id is the honest 404 — never an empty or invented order', async () => {
    const missing = await getOrder(mf, 'ord-quote-jamais-cree');
    expect(missing.status).toBe(404);
    expect(missing.json['error']).toBe('unknown_order');
  });
});

/* ═══════════ the buyer wire — SP-I03 / SP-I13 on the real bytes ═══════════ */

describe('OrderDO — the emitted bytes carry no supplier economics and no payment key', () => {
  it('the response keys ARE the allowlist, and no banned NAME or VALUE appears in the raw bytes or the headers', async () => {
    const { created, orderId } = await orderedQuote(mf, '0016', {
      markup: 3_000,
      pid: 'pv-order-distinct',
      offer: 'ov-order-distinct',
    });
    expect(created.status, created.text).toBe(200);
    // THE ALL-DISTINCT FIXTURE, to the franc: B 22 000 · C 1 500 · M 3 000 · D
    // 1 000 ⇒ subtotal 25 000 · total 26 000 · sellerFee 1 100 · sellerNet
    // 19 400 · resellerGross 4 500 · resellerFee 900 · resellerNet 3 600 ·
    // platform 2 000. Every one of those is a different number.
    expect(created.json['amountPaidAtCheckout']).toBe(26_000);

    for (const res of [created, await getOrder(mf, orderId)]) {
      // FIVE KEYS since SP4.2a — `doorLeg` is a STATE (`none|due|paid`), never
      // an amount, and the value scan below runs over it unchanged. Growing this
      // list is an edit somebody had to make on purpose; that is the point.
      expect(Object.keys(res.json).sort()).toEqual(
        ['amountDueAtDelivery', 'amountPaidAtCheckout', 'doorLeg', 'orderId', 'state'].sort(),
      );
      // …and on a FULL_PREPAY order nothing is owed at the door, so the only
      // honest value here is `none`.
      expect(res.json['doorLeg']).toBe('none');
      // The order id is the only random token in the payload, and a v4 uuid can
      // contain any digit run by chance — so it is EXCISED before the value scan
      // and asserted separately, rather than left to make the scan lucky.
      expect(res.text.includes(orderId)).toBe(true);
      const scannable = res.text.split(orderId).join('');
      const headerBytes = [...res.headers].map(([k, v]) => `${k}:${v}`).join('\n');
      for (const banned of [
        'sellerBasePrice',
        'sellerFundedCommission',
        'sellerNet',
        'sellerPlatformFee',
        'resellerGrossEarnings',
        'resellerPlatformFee',
        'resellerNet',
        'resellerMarkup',
        'platformProductFeeRevenue',
        'resellerCommission',
        'basePrice',
        'markup',
        'productSubtotal',
        'deliveryFee',
        'buyerTotal',
        'collectRef',
        'payment_attempt_id',
        'paymentAttemptId',
        'attempt',
        'providerKey',
        'pk-',
        'att-',
        'holderRef',
        'reservationId',
        'quoteId',
        'provider',
        'correlation',
      ]) {
        expect(scannable.includes(banned), `body ${banned}`).toBe(false);
        expect(headerBytes.includes(banned), `header ${banned}`).toBe(false);
      }
      for (const value of ['22000', '1500', '3000', '25000', '1100', '19400', '4500', '900', '3600', '2000']) {
        expect(scannable.includes(value), `body ${value}`).toBe(false);
        expect(headerBytes.includes(value), `header ${value}`).toBe(false);
      }
      // …and the supplier's identity and the reseller's are absent too
      expect(scannable.includes('rs-order-0016')).toBe(false);
      expect(scannable.includes('lst-order-0016')).toBe(false);
    }
  });

  it('the buyer read carries the EXACT-ORIGIN CORS header, never a wildcard', async () => {
    const { created, orderId } = await orderedQuote(mf, '0017');
    expect(created.headers.get('access-control-allow-origin')).toBe('https://beurni2.github.io');
    const read = await getOrder(mf, orderId);
    expect(read.headers.get('access-control-allow-origin')).toBe('https://beurni2.github.io');
    expect(read.headers.get('access-control-allow-origin')).not.toBe('*');
    const preflight = await mf.dispatchFetch('http://c/checkout/order', { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

/* ═══════════════════════ the public/gated boundary ════════════════════════ */

describe('OrderDO — public by design, and it opens nothing else', () => {
  it('the order routes answer WITHOUT a key, while the webhook and every other write stay gated', async () => {
    const { created } = await orderedQuote(mf, '0018');
    expect(created.status).toBe(200); // a buyer holds no key, by design

    const sf = await mf.dispatchFetch('http://c/storefronts', { method: 'POST', body: '{}' });
    expect(sf.status).toBe(401);
    const webhook = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
      method: 'POST',
      body: '{}',
    });
    expect(webhook.status).toBe(401);
  });

  it('a NEIGHBOURING order path is NOT exempt — the exemption matches exactly, never by prefix', async () => {
    for (const path of [
      '/checkout/orders',
      '/checkout/order/abc/pay',
      '/checkout/order/a/b/c',
      '/checkout/webhook',
      '/checkout/webhook/payments',
    ]) {
      const res = await mf.dispatchFetch(`http://c${path}`, { method: 'POST', body: '{}' });
      expect(res.status, path).toBe(401);
    }
    // …and a non-exempt METHOD on an exempt path is still gated
    const del = await mf.dispatchFetch('http://c/checkout/order/abc', { method: 'DELETE' });
    expect(del.status).toBe(401);
    // …including the webhook path under a safe method (it reaches no order)
    const get = await mf.dispatchFetch('http://c/checkout/webhook/payment', { method: 'GET' });
    expect(get.status).not.toBe(200);
  });

  it('a malformed id in the order path is a named refusal, not a 500', async () => {
    const res = await mf.dispatchFetch('http://c/checkout/order/%FF', { method: 'GET' });
    expect(res.status).toBe(400);
  });
});

/* ═══════════ the reservation receipt — a hold never changes hands ══════════ */

describe('OrderDO — a receipt for a given reservationId is IMMUTABLE', () => {
  /**
   * ═══ THE VERIFIER'S FIVE-STEP BLOCKER, ROUND 2 ═══
   *
   * The vault replays an existing hold idempotently when the reserve
   * `command_id` matches, answering with the ORIGINAL hold's ids — while the
   * mirror took `holderRef` from the REQUEST. So an attacker who knew the
   * victim's reserve command id could replay it under his own holderRef, flip
   * this receipt, and have HIS order created while `CheckoutDO` still held the
   * VICTIM's reservation. The equal `expiresAt` of a replay walked straight
   * through a monotone-only guard.
   */
  it('an attacker replaying the victim\'s reserve commandId under his own holderRef cannot take the order', async () => {
    const shop = await seedShop(mf, '0030');
    const quote = await issueQuoteFor(mf, shop);
    const orderId = `ord-${quote.quoteId}`;

    // 1. THE VICTIM reserves.
    const victimHold = await reserve(mf, quote.quoteId, 'cmd-reserve-0030', 'holder-victime');
    expect(victimHold.status).toBe(200);
    const reservationId = victimHold.json['reservationId'];

    // 2. THE ATTACKER replays HER command id under HIS holderRef. The vault
    //    answers 200 — it is an idempotent replay of HER hold, by design.
    const attackerReplay = await reserve(mf, quote.quoteId, 'cmd-reserve-0030', 'holder-attaquant');
    expect(attackerReplay.status).toBe(200);
    expect(attackerReplay.json['reservationId']).toBe(reservationId); // HER hold

    // 3. THE RECEIPT STILL NAMES HER. An idempotent replay is not a new
    //    decision, so it cannot carry a new holder.
    const receipt = (await audit(mf, orderId)).receipt;
    expect(receipt?.holderRef).toBe('holder-victime');
    expect(receipt?.reservationId).toBe(reservationId);

    // 4. THE ATTACKER'S ORDER IS REFUSED.
    const attackerOrder = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-attaquant',
      commandId: 'cmd-order-0030-attaquant',
    });
    expect(attackerOrder.status).toBe(409);
    expect(attackerOrder.json['error']).toBe('reservation_held_by_another');

    // 5. THE VICTIM'S ORDER IS CREATED — she still holds what she reserved.
    const victimOrder = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-victime',
      commandId: 'cmd-order-0030',
    });
    expect(victimOrder.status, victimOrder.text).toBe(200);
    expect(victimOrder.json['state']).toBe('payment_pending');

    // …and it survives a process death naming the same holder.
    await restart();
    const afterCrash = (await audit(mf, orderId)).receipt;
    expect(afterCrash?.holderRef).toBe('holder-victime');
  });

  /**
   * The OTHER half of the same sentence: a genuinely NEW hold — a different
   * reservation id with a strictly later expiry, which is what a re-reserve
   * after the 2-minute TTL produces — DOES replace the receipt. Driven straight
   * at the object, because workerd's real clock cannot be wound forward in a
   * test and there is deliberately no test-only clock on a money path (the TTL
   * decision itself is proven by value in `order-core.test.ts`).
   */
  it('a genuinely NEW hold replaces the receipt, while a STALE mirror write never does', async () => {
    const shop = await seedShop(mf, '0031');
    const quote = await issueQuoteFor(mf, shop);
    const orderId = `ord-${quote.quoteId}`;
    const held = await reserve(mf, quote.quoteId, 'cmd-reserve-0031', 'holder-premier');
    expect(held.status).toBe(200);
    const firstExpiry = held.json['expiresAt'] as string;

    const ns = await mf.getDurableObjectNamespace('ORDER');
    const stub = ns.get(ns.idFromName(orderId));
    const mirror = async (body: Record<string, string>) => {
      const res = await stub.fetch('https://do/entry/reserved', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return (await res.json()) as { ok: boolean; stored: boolean; reason?: string };
    };

    // A STALE MIRROR WRITE — a DIFFERENT hold, but one that expires EARLIER. It
    // is an older write landing out of order and must change nothing. (This is
    // the monotonicity guard; without it a dead hold could be resurrected.)
    const stale = await mirror({
      quoteId: quote.quoteId,
      reservationId: 'res-ancienne-0031',
      holderRef: 'holder-ancien',
      expiresAt: new Date(Date.parse(firstExpiry) - 60_000).toISOString(),
    });
    expect(stale.stored).toBe(false);
    expect(stale.reason).toBe('not_later');
    expect((await audit(mf, orderId)).receipt?.holderRef).toBe('holder-premier');
    // an EQUAL expiry under a different id is not later either
    const equal = await mirror({
      quoteId: quote.quoteId,
      reservationId: 'res-egale-0031',
      holderRef: 'holder-egal',
      expiresAt: firstExpiry,
    });
    expect(equal.stored).toBe(false);
    expect((await audit(mf, orderId)).receipt?.holderRef).toBe('holder-premier');

    // A GENUINELY NEW HOLD — different id, strictly later expiry — replaces it,
    // which is what makes a legitimate re-reserve after expiry work.
    const fresh = await mirror({
      quoteId: quote.quoteId,
      reservationId: 'res-nouvelle-0031',
      holderRef: 'holder-second',
      expiresAt: new Date(Date.parse(firstExpiry) + 60_000).toISOString(),
    });
    expect(fresh.stored).toBe(true);
    expect((await audit(mf, orderId)).receipt?.holderRef).toBe('holder-second');

    // …and the NEW holder is the one who may order; the old one may not.
    const oldHolder = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-premier',
      commandId: 'cmd-order-0031-ancien',
    });
    expect(oldHolder.status).toBe(409);
    const newHolder = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-second',
      commandId: 'cmd-order-0031',
    });
    expect(newHolder.status, newHolder.text).toBe(200);
  });

  /**
   * ═══ THE IMMUTABILITY BRANCH, ISOLATED FROM THE MONOTONE ONE ═══
   *
   * The two guards overlapped: the equal-`expiresAt` replay that the attack used
   * is ALSO caught by the `>=` compare, so deleting the reservation-id branch
   * changed nothing observable and the test named for it passed on its
   * neighbour's work (verifier finding, round 2). This drives the ONE case only
   * the id branch can answer — the SAME hold presented with a LATER expiry —
   * straight at the object, because the public path cannot produce it.
   *
   * It is not exploitable through the reserve route today. It is tested because
   * a guard nothing exercises is a guard nobody knows is there, and the next
   * caller of this route will not be `CheckoutDO`'s mirror alone.
   */
  it('THE SAME reservationId with a LATER expiry cannot change the holder either', async () => {
    const shop = await seedShop(mf, '0032');
    const quote = await issueQuoteFor(mf, shop);
    const orderId = `ord-${quote.quoteId}`;
    const held = await reserve(mf, quote.quoteId, 'cmd-reserve-0032', 'holder-titulaire');
    expect(held.status).toBe(200);
    const reservationId = held.json['reservationId'] as string;
    const expiry = held.json['expiresAt'] as string;

    const ns = await mf.getDurableObjectNamespace('ORDER');
    const stub = ns.get(ns.idFromName(orderId));
    // THE SAME HOLD, a DIFFERENT holder, and an expiry an hour further out — so
    // the monotone compare would wave it through. Only « same id ⇒ already
    // decided » stops it.
    const res = await stub.fetch('https://do/entry/reserved', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: quote.quoteId,
        reservationId,
        holderRef: 'holder-usurpateur',
        expiresAt: new Date(Date.parse(expiry) + 3_600_000).toISOString(),
      }),
    });
    const decided = (await res.json()) as { stored: boolean; reason?: string };
    expect(decided.stored).toBe(false);
    expect(decided.reason).toBe('already_decided');
    expect((await audit(mf, orderId)).receipt?.holderRef).toBe('holder-titulaire');

    // …and the consequence: the usurper cannot order, the titleholder can.
    const usurper = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-usurpateur',
      commandId: 'cmd-order-0032-usurpateur',
    });
    expect(usurper.status).toBe(409);
    expect(usurper.json['error']).toBe('reservation_held_by_another');
    const titular = await postOrder(mf, {
      quoteId: quote.quoteId,
      holderRef: 'holder-titulaire',
      commandId: 'cmd-order-0032',
    });
    expect(titular.status, titular.text).toBe(200);
  });
});

/* ═════════ the webhook gate FAILS CLOSED on an unset or empty secret ═══════ */

describe('OrderDO — an unconfigured webhook secret refuses EVERY webhook', () => {
  /**
   * `auth.ts`'s `secret.length > 0 && match` is the whole guard, and
   * `timingSafeEqual('', '')` is TRUE — so without the length half, a Worker
   * deployed before `wrangler secret put` would authenticate every webhook and
   * anyone could declare any order paid. That order then goes into real custody
   * and later into settlement. This test is what stands between that line and a
   * silent regression.
   */
  async function orderInRuntime(m: Miniflare, n: string): Promise<string> {
    const shop = await seedShop(m, n);
    const quote = await issueQuoteFor(m, shop);
    const held = await reserve(m, quote.quoteId, `cmd-reserve-${n}`, `holder-${n}`);
    expect(held.status).toBe(200);
    const created = await postOrder(m, {
      quoteId: quote.quoteId,
      holderRef: `holder-${n}`,
      commandId: `cmd-order-${n}`,
    });
    expect(created.status, created.text).toBe(200);
    return `ord-${quote.quoteId}`;
  }

  it('SECRET UNSET (the binding absent): every webhook is 401 and the order never moves', async () => {
    const m = noSecretMf();
    const orderId = await orderInRuntime(m, '0040');
    const event = webhookEvent(orderId, 12_500, 'pk-forge-0040');
    // no header at all — the shape an attacker who knows nothing would send
    for (const headers of [
      { 'Content-Type': 'application/json' },
      { 'X-Payment-Webhook-Key': '', 'Content-Type': 'application/json' },
      { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' },
      { 'X-Payment-Webhook-Key': WRITE_SECRET, 'Content-Type': 'application/json' },
    ]) {
      const res = await postWebhook(m, event, headers);
      expect(res.status, JSON.stringify(headers)).toBe(401);
      expect(res.json['error']).toBe('unauthorized');
    }
    // NOTHING MOVED: no escrow, still payment_pending, still unconfirmed.
    const record = await audit(m, orderId);
    expect(record.state).toBe('payment_pending');
    expect(record.escrow).toBeNull();
    expect((await getOrder(m, orderId)).json['state']).toBe('payment_pending');
  });

  it('SECRET EMPTY: an empty configured secret matches nothing — 401, and the order never moves', async () => {
    const m = emptySecretMf();
    const orderId = await orderInRuntime(m, '0041');
    const event = webhookEvent(orderId, 12_500, 'pk-forge-0041');
    for (const headers of [
      { 'Content-Type': 'application/json' },
      { 'X-Payment-Webhook-Key': '', 'Content-Type': 'application/json' },
      { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' },
    ]) {
      const res = await postWebhook(m, event, headers);
      expect(res.status, JSON.stringify(headers)).toBe(401);
    }
    const record = await audit(m, orderId);
    expect(record.state).toBe('payment_pending');
    expect(record.escrow).toBeNull();
  });
});

/* ═════════════ the webhook's order_id is an id, not free bytes ═════════════ */

describe('OrderDO — a hostile order_id on the webhook never reaches an object', () => {
  /**
   * `order_id` comes off an authenticated but otherwise untrusted payload and is
   * used as a DURABLE OBJECT NAME. The alphabet pin is what keeps it an id: an
   * unpinned name lets a caller address arbitrary objects in the ORDER
   * namespace, and it is the same charset discipline `slug`/`pid` already carry
   * on the quote route.
   */
  it('a path-shaped, spaced, or non-id order_id is 400 bad_field — never a 404 lookup', async () => {
    const { created, orderId } = await orderedQuote(mf, '0050');
    expect(created.status).toBe(200);
    for (const hostile of [
      '../ord-quote-x',
      'ord/quote/x',
      'ord quote x',
      'ord%2Fquote',
      '-leading-dash',
      '_leading-underscore',
      'ord\tquote',
      '..',
      'ord..quote/..',
      'ord#quote',
      'ord?quote=1',
      'ord\nquote',
      'é-accentué',
    ]) {
      const event = webhookEvent(orderId, 12_500, 'pk-hostile') as { payload: Record<string, unknown> };
      event.payload['order_id'] = hostile;
      const res = await postWebhook(mf, event);
      expect(res.status, JSON.stringify(hostile)).toBe(400);
      expect(res.json['error'], JSON.stringify(hostile)).toBe('bad_field');
      expect(res.json['field']).toBe('order_id');
    }
    // …and the real order is untouched by every one of them
    const record = await audit(mf, orderId);
    expect(record.escrow).toBeNull();
    expect(record.state).toBe('payment_pending');
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * SP4.2a — THE DOOR LEG'S WEBHOOK, ON THE REAL WORKER
 *
 * §5.5: « Option B: … product paid by MoMo AT THE DOOR BEFORE CUSTODY TRANSFER;
 * not COD ». §6.3: « the buyer enters the drop code last, AFTER any door payment
 * is provider-confirmed. » Ten Laws #3: custody transfers only after
 * provider-confirmed payment of every due leg.
 *
 * ═══ WHAT THIS SUITE REACHES — REVISED 2026-08-01, THE CAVEAT IS DEAD ═══
 *
 * This block used to open: « IT CANNOT CREATE AN OPTION-B ORDER through the
 * public routes », because `PAY_AT_DOOR_POLICY_DEFAULTS` shipped an EMPTY
 * `networkReliableZones` allowlist and the Worker never overrode it. It then
 * said proving `due → paid` across workerd « needs a way to open the gate for a
 * test, and that is a founder decision, not one to take at the keyboard ».
 *
 * The founder took that decision: every zone is open. An Option-B quote is now
 * issuable over HTTP on the SHIPPED policy — `checkout-do.e2e.test.ts` proves
 * exactly that. So the sentence above is no longer true, and it is corrected
 * here rather than left to mislead the next reader into thinking a proof is
 * unreachable when it is merely unwritten.
 *
 * WHAT THIS SUITE STILL PROVES is the half that guards a real buyer: that this
 * route cannot mark anything paid that should not be, that it is behind the
 * secret, and that the two legs cannot be confused for one another. The
 * end-to-end `due → paid` walk across workerd is now BUILDABLE and NOT YET
 * BUILT — it is the honest gap, named, not a limitation. `due → paid` itself
 * remains proved in the frozen vault's suite
 * (`packages/commerce-core/test/e2-door-paths.test.ts`).
 * ════════════════════════════════════════════════════════════════════════════ */

/** POST to the DOOR webhook — the sibling of `postWebhook`, different path. */
async function postDoorWebhook(m: Miniflare, event: unknown, headers: Record<string, string> = signed) {
  const res = await m.dispatchFetch('http://c/checkout/webhook/door', {
    method: 'POST',
    headers,
    body: JSON.stringify(event),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

/**
 * A DOOR webhook built by the frozen vault's certified mock — its own
 * `payment.door_leg_confirmed.v1`, not one hand-written here. A test that
 * fabricates the event shape it is checking proves nothing about the provider.
 */
function doorWebhookEvent(orderId: string, amount: number, attemptId: string): unknown {
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({
    orderId,
    paymentAttemptId: attemptId,
    amount,
    correlationId: `corr-${orderId}`,
    requestedAtIso: T0,
    legType: 'door',
  });
  const plan = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1');
  if (plan === undefined) throw new Error('the certified mock emitted no door event');
  return plan.event;
}

describe('SP4.2a — the door leg is provider truth, behind the secret, and never the checkout leg', () => {
  it('the door webhook is SECRET-GATED, and the 401 is not an existence oracle', async () => {
    const { orderId } = await orderedQuote(mf, '4201');
    // A REAL order id and a REAL event — only the key is missing.
    const event = doorWebhookEvent(orderId, 11_500, 'att-door-auth');
    const unsigned = await postDoorWebhook(mf, event, { 'Content-Type': 'application/json' });
    expect(unsigned.status).toBe(401);
    // …and an order id that does not exist answers THE SAME, so the status
    // cannot be used to learn which orders are real.
    const ghost = await postDoorWebhook(mf, doorWebhookEvent('ord-nope', 11_500, 'att-x'), {
      'Content-Type': 'application/json',
    });
    expect(ghost.status).toBe(401);
  });

  it('a door confirmation for an order that owes NOTHING at the door REFUSES', async () => {
    const { orderId } = await orderedQuote(mf, '4202');
    // Every order reachable here is FULL_PREPAY: amountDueAtDelivery is 0 and
    // the door leg is `none`. A provider asserting a door payment against it
    // is provider truth contradicting local state, and it must not stick.
    const res = await postDoorWebhook(mf, doorWebhookEvent(orderId, 11_500, 'att-door-modea'));
    expect(res.status).not.toBe(200);
    expect((res.json as { error?: string }).error).toBe('door_leg_not_expected');

    // …and NOTHING moved: the buyer's own projection still says `none`.
    const view = await getOrder(mf, orderId);
    expect(view.status).toBe(200);
    expect((view.json as { doorLeg?: string }).doorLeg).toBe('none');
  });

  it('THE TWO LEGS CANNOT BE CONFUSED — each route refuses the other’s event', async () => {
    const { orderId } = await orderedQuote(mf, '4203');
    const attemptId = await chargeKeySeenByProvider(mf, orderId);

    // A CHECKOUT confirmation posted to the DOOR route: refused by NAME on the
    // event name, so a checkout payment can never mark the product leg paid.
    const checkoutEvent = webhookEvent(orderId, 12_500, attemptId);
    const wrongWay = await postDoorWebhook(mf, checkoutEvent);
    expect(wrongWay.status).not.toBe(200);
    expect((wrongWay.json as { error?: string }).error).toBe('unexpected_event_name');

    // …and a DOOR confirmation posted to the CHECKOUT route, likewise.
    const doorEvent = doorWebhookEvent(orderId, 11_500, 'att-door-cross');
    const otherWay = await postWebhook(mf, doorEvent);
    expect(otherWay.status).not.toBe(200);
    expect((otherWay.json as { error?: string }).error).toBe('unexpected_event_name');

    // Neither attempt touched anything.
    const view = await getOrder(mf, orderId);
    expect((view.json as { doorLeg?: string }).doorLeg).toBe('none');
  });

  it('the buyer projection carries the door state, and it SURVIVES a restart', async () => {
    const { orderId } = await orderedQuote(mf, '4204');
    const before = await getOrder(mf, orderId);
    expect(before.status).toBe(200);
    const shape = before.json as Record<string, unknown>;
    // FIVE FIELDS, and the fifth is a STATE — no amount rides in with it.
    expect(Object.keys(shape).sort()).toEqual(
      ['amountDueAtDelivery', 'amountPaidAtCheckout', 'doorLeg', 'orderId', 'state'],
    );
    expect(shape['doorLeg']).toBe('none');

    // A REAL PROCESS DEATH on the same persist dir: the door leg is REPLAYED
    // from the durable log, never held in an object's memory.
    await restart();
    const after = await getOrder(mf, orderId);
    expect(after.status).toBe(200);
    expect((after.json as { doorLeg?: string }).doorLeg).toBe('none');
  });

  /* ── SP4.2a-bis — asking for the product leg to be collected ─────────── */

  it('the door-charge route is PUBLIC (no write key) and still refuses what it must', async () => {
    const { orderId } = await orderedQuote(mf, '4205');
    // NO KEY AT ALL — she holds none. It must not 401: this route cannot declare
    // that money arrived, so it belongs on the public side of the gate.
    const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}/door-charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holderRef: 'holder-4205', commandId: 'cmd-door-4205' }),
    });
    expect(res.status, 'a buyer-facing route answered 401').not.toBe(401);
    // …and a FULL_PREPAY order owes nothing at a door, so it refuses BY NAME.
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error?: string }).error).toBe('door_leg_not_expected');

    // NOTHING MOVED — not the door leg, not the order.
    const view = await getOrder(mf, orderId);
    expect((view.json as { doorLeg?: string }).doorLeg).toBe('none');
  });

  it('a caller who did not take the hold cannot ask for her money', async () => {
    const { orderId } = await orderedQuote(mf, '4206');
    const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}/door-charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holderRef: 'not-her', commandId: 'cmd-door-4206' }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error?: string }).error).toBe('reservation_held_by_another');
  });

  it('NO AMOUNT CAN RIDE THIS WIRE — the two-key allowlist refuses one by name', async () => {
    const { orderId } = await orderedQuote(mf, '4207');
    for (const body of [
      { holderRef: 'holder-4207', commandId: 'cmd-a', amount: 11_500 },
      { holderRef: 'holder-4207', commandId: 'cmd-b', amountDueAtDelivery: 11_500 },
    ]) {
      const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}/door-charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(((await res.json()) as { error?: string }).error).toBe('unknown_field');
    }
  });

  it('a malformed body and a bad order id are refused BEFORE any object is reached', async () => {
    const bad = await postDoorWebhook(mf, { not: 'an event' });
    expect(bad.status).toBe(400);
    expect((bad.json as { error?: string }).error).toBe('malformed_event');

    // A well-formed event whose order_id is not a legal id: 400, never a 404
    // that would confirm which ids are legal.
    const evt = doorWebhookEvent('ord-shape', 11_500, 'att-shape') as {
      payload: Record<string, unknown>;
    };
    const tampered = { ...evt, payload: { ...evt.payload, order_id: '../../admin' } };
    const shaped = await postDoorWebhook(mf, tampered);
    expect(shaped.status).toBe(400);
  });
});

/* ═════ ORDER-PAID-WIRE-1b — the preparation signal leaves this Worker ═════ */

describe('ORDER-PAID-WIRE-1b — order.confirmed.v1 is emitted on confirm, canon-shaped, at-least-once', () => {
  it('THE HAPPY WIRE: webhook confirms → the alarm delivers ONE canon event carrying the seven approved fields', async () => {
    fulfillmentPosts.length = 0;
    fulfillmentRespond = 'ok';
    const { created, orderId } = await orderedQuote(mf, '0060');
    expect(created.status).toBe(200);
    const applied = await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0060'));
    expect(applied.json['state']).toBe('confirmed');

    await waitForFulfillmentPosts(1);
    expect(fulfillmentPosts).toHaveLength(1);
    const post = fulfillmentPosts[0]!;
    // The credential travels: this Worker presented ITS copy of the shared secret.
    expect(post.auth).toBe(`Bearer ${FULFILL_SECRET}`);
    // THE BYTES PARSE THROUGH CANON — the same schema the intake will parse.
    const parsed = OrderConfirmedEventSchema.safeParse(post.body);
    expect(parsed.success, JSON.stringify(post.body)).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.payload.orderId).toBe(orderId);
    expect(parsed.data.payload.productVersionId).toBe('pv-order-1');
    expect(parsed.data.payload.paymentMode).toBe('FULL_PREPAY');
    expect(parsed.data.payload.sellerBasePrice).toBe(10_000); // B verbatim — never the 12 500 the buyer paid
    expect(parsed.data.payload.zoneTo).toBe('Ouagadougou');
    // No banned name in the raw bytes, on the REAL wire.
    const bytes = JSON.stringify(post.body);
    for (const banned of ['supplierId', 'buyerPhone', 'buyerDropCode', 'buyerTotal', 'resellerMarkup', 'holderRef']) {
      expect(bytes.includes(banned), banned).toBe(false);
    }
    // …and the outbox records the delivery, durably.
    const ob = await outboxOf(mf, orderId);
    expect(ob.outbox?.status).toBe('delivered');

    // A PROCESS DEATH does not resurrect the delivery: still exactly one post.
    await restart();
    await new Promise((r) => setTimeout(r, 300));
    expect(fulfillmentPosts).toHaveLength(1);
    expect((await outboxOf(mf, orderId)).outbox?.status).toBe('delivered');
  });

  it('A DUPLICATE WEBHOOK EMITS NOTHING NEW — the outbox is first-wins beside the log it rode in with', async () => {
    fulfillmentPosts.length = 0;
    fulfillmentRespond = 'ok';
    const { orderId } = await orderedQuote(mf, '0061');
    const event = webhookEvent(orderId, 12_500, 'att-0061');
    await postWebhook(mf, event);
    await waitForFulfillmentPosts(1);
    await postWebhook(mf, event);
    await postWebhook(mf, event);
    await new Promise((r) => setTimeout(r, 400));
    expect(fulfillmentPosts).toHaveLength(1);
  });

  it('BOUTIK DOWN: the confirmation is UNTOUCHED, the outbox stays pending with the retry booked', async () => {
    fulfillmentPosts.length = 0;
    fulfillmentRespond = 'fail';
    const { orderId } = await orderedQuote(mf, '0062');
    const applied = await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0062'));
    // THE MONEY PATH NEVER NOTICES: confirmed, 200, exactly as when boutik is up.
    expect(applied.status).toBe(200);
    expect(applied.json['state']).toBe('confirmed');

    await waitForFulfillmentPosts(1); // the attempt WAS made…
    await new Promise((r) => setTimeout(r, 200));
    const ob = await outboxOf(mf, orderId);
    // …and refused, so the outbox holds: pending, attempts counted, alarm booked
    // (the backoff instant itself is minutes away — the STATE is the proof).
    expect(ob.outbox?.status).toBe('pending');
    expect(ob.outbox?.attempts).toBeGreaterThanOrEqual(1);
    fulfillmentRespond = 'ok';
  });

  it('AN ORDER BORN BEFORE THE SLICE (no fulfillment facts) confirms fine and records UNSENDABLE — never a guessed payload', async () => {
    fulfillmentPosts.length = 0;
    fulfillmentRespond = 'ok';
    // Build the order the way the ROUTER builds one from an OLD quote: seed and
    // reserve normally (so the receipt exists), then drive the DO's own create
    // with the quote bytes and NO fulfillment record — byte-for-byte what the
    // internal hop carries when the checkout entry predates this slice.
    const shop = await seedShop(mf, '0063');
    const quote = await issueQuoteFor(mf, shop);
    const holderRef = 'holder-0063';
    const held = await reserve(mf, quote.quoteId, 'cmd-reserve-0063', holderRef);
    expect(held.status).toBe(200);
    const cns = await mf.getDurableObjectNamespace('CHECKOUT');
    const entry = (await (
      await cns.get(cns.idFromName(quote.quoteId)).fetch('https://do/entry')
    ).json()) as { canonicalBytes?: string };
    const orderId = `ord-${quote.quoteId}`;
    const ons = await mf.getDurableObjectNamespace('ORDER');
    const created = await ons.get(ons.idFromName(orderId)).fetch('https://do/entry/create', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: quote.quoteId,
        holderRef,
        commandId: 'cmd-order-0063',
        quoteBytes: entry.canonicalBytes,
        fulfillment: null,
      }),
    });
    expect(created.status).toBe(200);
    const applied = await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0063'));
    expect(applied.json['state']).toBe('confirmed');
    await new Promise((r) => setTimeout(r, 300));
    expect(fulfillmentPosts).toHaveLength(0);
    const ob = await outboxOf(mf, orderId);
    expect(ob.outbox?.status).toBe('unsendable');
    expect(ob.outbox?.reason).toBe('missing_fulfillment_fields');
  });
});

/* ═══ ORDER-PAID-WIRE-1b, verifier round — the three cases it proved missing ═══ */

describe('ORDER-PAID-WIRE-1b verifier round — Option B, the honest clock, the bounded envelope', () => {
  it("OPTION B EMITS EXACTLY ONCE, ON THE CHECKOUT LEG, WITH ITS OWN MODE — and the door leg's webhook emits NOTHING", async () => {
    fulfillmentPosts.length = 0;
    fulfillmentRespond = 'ok';
    // A REAL door order over HTTP: quote (D now, product at the door), reserve, order.
    const shop = await seedShop(mf, '0070');
    const quote = await issueDoorQuoteFor(mf, shop);
    expect(quote.amountPaidAtCheckout).toBe(1_000); // D
    expect(quote.amountDueAtDelivery).toBe(11_500); // B + M
    const holderRef = 'holder-0070';
    const held = await reserve(mf, quote.quoteId, 'cmd-reserve-0070', holderRef);
    expect(held.status).toBe(200);
    const created = await postOrder(mf, { quoteId: quote.quoteId, holderRef, commandId: 'cmd-order-0070' });
    expect(created.status, created.text).toBe(200);
    const orderId = `ord-${quote.quoteId}`;

    // The CHECKOUT leg (D = 1 000) confirms → the ONE emission, door-mode.
    const applied = await postWebhook(mf, webhookEvent(orderId, 1_000, 'att-0070'));
    expect(applied.json['state'], applied.text).toBe('confirmed');
    await waitForFulfillmentPosts(1);
    expect(fulfillmentPosts).toHaveLength(1);
    const parsed = OrderConfirmedEventSchema.safeParse(fulfillmentPosts[0]!.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.payload.paymentMode).toBe('DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR');
    expect(parsed.data.payload.sellerBasePrice).toBe(10_000); // B — never D, never the door amount

    // The DOOR leg (11 500) confirms → state moves, and STILL exactly one post.
    const door = await postDoorWebhook(mf, doorWebhookEvent(orderId, 11_500, 'att-door-0070'));
    expect(door.status, door.text).toBe(200);
    await new Promise((r) => setTimeout(r, 400));
    expect(fulfillmentPosts).toHaveLength(1);
  });

  it("`paidAt` IS THIS WORKER'S OWN CLOCK — the provider's claimed serverTime does not reach the wire (canon pin)", async () => {
    fulfillmentPosts.length = 0;
    fulfillmentRespond = 'ok';
    const { orderId } = await orderedQuote(mf, '0071');
    const before = Date.now();
    const event = webhookEvent(orderId, 12_500, 'att-0071') as { envelope: { serverTime: string } };
    // The certified mock's claimed time is T0-era — days before "now". If the
    // emitter trusted it, paidAt would be that claim; the canon pin says the
    // CONFIRMED transition's own instant instead.
    const claimed = event.envelope.serverTime;
    await postWebhook(mf, event);
    await waitForFulfillmentPosts(1);
    const parsed = OrderConfirmedEventSchema.safeParse(fulfillmentPosts[0]!.body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.payload.paidAt).not.toBe(claimed);
    const paidAtMs = Date.parse(parsed.data.payload.paidAt);
    expect(paidAtMs).toBeGreaterThanOrEqual(before - 1_000);
    expect(paidAtMs).toBeLessThanOrEqual(Date.now() + 1_000);
  });

  it('A SIGNED WEBHOOK WITH A MEGABYTE command_id IS REFUSED BY NAME — nothing applied, nothing stored', async () => {
    const { orderId } = await orderedQuote(mf, '0072');
    const event = webhookEvent(orderId, 12_500, 'att-0072') as { envelope: { command_id: string } };
    event.envelope.command_id = 'x'.repeat(1_048_576);
    const res = await postWebhook(mf, event);
    expect(res.status).toBe(422);
    expect(res.json['error']).toBe('envelope_field_too_long'); // the route maps `reason` → `error`
    // The order is untouched: a NORMAL webhook still confirms it afterwards.
    const ok = await postWebhook(mf, webhookEvent(orderId, 12_500, 'att-0072'));
    expect(ok.json['state']).toBe('confirmed');
  });
});
