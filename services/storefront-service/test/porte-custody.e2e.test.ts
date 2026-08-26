import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlatformEventSchema } from '@platform/contracts';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ PORTE-CUSTODY part B — the door leg's provider truth reaches custody ═══
 *
 * When `payment.door_leg_confirmed.v1` arrives on a pay-at-door order, Shop+
 * must FORWARD the provider truth to custody, at-least-once, or custody's
 * SE-I11 gate (« custody→customer ONLY after provider-confirmed door
 * payment ») never opens and the rider's drop refuses forever.
 *
 * The walk is the buyer's own — storefront → listing → DOOR quote → reserve →
 * order (with contact, §6.4 ladder clean) → checkout webhook → DOOR webhook —
 * on the REAL combined Worker bundle, so nothing here is politely constructed.
 * The webhook bytes are the frozen vault's certified mock, never hand-written.
 *
 * THE FIXED CONTRACT (custody's side is built concurrently against these
 * exact bytes): POST `${custody}/produce-shop/door-signal`, Bearer = the SAME
 * SHOP_ARM_SECRET the arm wire presents, body `{orderId, command_id, event}`
 * with the event FORWARDED VERBATIM (never re-minted, never re-actored) and
 * `command_id = door-signal-${the event's own envelope.command_id}-a${attempt}`
 * — PER-ATTEMPT (custody commits and replays every outcome per outer id, so a
 * frozen id could never re-judge `door_signal_not_awaited` after the accord;
 * the spine's true idempotency keys on the event's own envelope id). Custody
 * answers 200 `{ok:true, duplicate}` or 409 `{ok:false, reason}`; 2xx and
 * every 409 EXCEPT `door_signal_not_awaited` are DELIVERED (verdicts on the
 * event, and the settled-course terminal `door_signal_course_settled`);
 * `door_signal_not_awaited` keeps carrying; everything else retries.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'porte-custody-'));
const T0 = '2026-08-12T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-pc001';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-pc001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-pc001';
const PROGRESS_SECRET = 'test-progress-write-secret-pc001';
const ARM_SECRET = 'test-shop-arm-secret-pc001';
const authed = { 'X-Write-Key': WRITE_SECRET };
const signed = { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' };

/** The arm fact's kind, assembled at runtime — the standing exposure-gate idiom. */
const ARM_KIND = ['buyer', 'drop', 'code'].join('_');

/** Verified tier, so a §6.1-eligible DOOR quote is constructible at all.
 *  §5.4 baseline: B 10 000 · C 1 000 · M 1 500 · D 1 000 ⇒ paid now 1 000 (D),
 *  due at the door 11 500 (B + M). */
const SUPPLY = [
  {
    productVersionId: 'pv-pc-1',
    offerVersion: 'ov-pc-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

/**
 * ═══ THE CUSTODY DOOR-SIGNAL DOUBLE — CONTRACT-CERTIFIED, AND ITS BOUNDS ═══
 *
 * NEVER KINDER THAN THE REAL DOOR (sera: custody-spine.ts
 * `consumeDoorPaidSignal` + the `/produce-shop/*` router gate), in this order,
 * which is the spine's own:
 *
 *  · `down` knob ⇒ 500 — an outage, which the wire must retry.
 *  · Bearer must equal the arm secret or 401 (the produce-shop router's gate;
 *    401 is neither 2xx nor 409, so the wire must retry it too).
 *  · The body is EXACTLY `{orderId, command_id, event}` — three keys,
 *    non-empty strings for the ids; anything else is 400 (a command-log door
 *    refuses a body it cannot read; a malformed forward is a producer bug,
 *    retried loudly into both logs).
 *  · The event must parse as canon `PlatformEvent` NAMED
 *    `payment.door_leg_confirmed.v1`, else 409 `door_signal_invalid`.
 *  · The producer actor must be of the payment-provider class — here the
 *    `payment-provider:` namespace, the class the certified provider mock
 *    emits under and the class custody's actor-provenance registry names for
 *    this event — else 409 `producer_actor_mismatch`. Custody verifies this
 *    ITSELF, which is why the wire must forward verbatim and never re-actor.
 *  · A REPLAYED `command_id` absorbs: 200 `{ok:true, duplicate:true}` — a
 *    redelivery never advances anything twice.
 *  · An order custody is NOT AWAITING a door signal for (the `awaitingDoor`
 *    knob stands in for: Option-B task, door inspection accepted, not yet
 *    confirmed) refuses 409 `door_signal_not_awaited` — driven out of order,
 *    the double says no, exactly as the real spine does.
 *  · An order whose course custody SETTLED — refused home by a valid
 *    rejection or an opened return (the `settledDoorOrders` knob) — refuses
 *    409 `door_signal_course_settled`, the E2 TERMINAL: the real spine
 *    answers it by name (raising its own refund-feedstock alert on that
 *    side) so this at-least-once sender can stop. A settled order is never
 *    also awaiting — tests move an order from one knob to the other, as the
 *    real course does.
 *
 * WHAT IT MAY NEVER CLAIM: nothing about custody's ledger, seals, or the
 * rider — only this door's answers. It stores no amount (SE-I09).
 */
let custodyDoorRespond: 'ok' | 'down' | 'actor_mismatch' = 'ok';
const awaitingDoor = new Set<string>();
const settledDoorOrders = new Set<string>();
/** EVERY judged command's outcome, replayed VERBATIM on a reused id — the
 * real custody-do commits refusals too (verifier BLOCKER, proven on the
 * bundle): a repeated command_id never re-judges the world. Fresh judgment
 * needs a fresh outer id, which is exactly the wire's per-attempt mint. */
const judgedDoorCommands = new Map<string, { status: number; payload: Record<string, unknown> }>();

function doorSignalDoor(
  auth: string | null,
  body: Record<string, unknown> | null,
): { status: number; payload: unknown } {
  if (custodyDoorRespond === 'down') return { status: 500, payload: { ok: false } };
  if (auth !== `Bearer ${ARM_SECRET}`) return { status: 401, payload: { error: 'unauthorized' } };
  // Forced permanent verdict — stands in for any event-verdict 409 the real
  // door could mint that this double's own checks cannot reach through the
  // verbatim wire (order-do pre-validates name/schema before arming).
  if (custodyDoorRespond === 'actor_mismatch') {
    return { status: 409, payload: { ok: false, reason: 'producer_actor_mismatch' } };
  }
  if (
    body === null ||
    Object.keys(body).sort().join(',') !== 'command_id,event,orderId' ||
    typeof body['orderId'] !== 'string' || body['orderId'] === '' ||
    typeof body['command_id'] !== 'string' || body['command_id'] === ''
  ) {
    return { status: 400, payload: { ok: false, reason: 'malformed' } };
  }
  const parsed = PlatformEventSchema.safeParse(body['event']);
  if (!parsed.success || parsed.data.name !== 'payment.door_leg_confirmed.v1') {
    return { status: 409, payload: { ok: false, reason: 'door_signal_invalid' } };
  }
  // EXACT, like the real registry's entry — a prefix here was kinder than
  // custody ('payment-provider:evil' must refuse).
  if (parsed.data.envelope.actor !== 'payment-provider:sandbox') {
    return { status: 409, payload: { ok: false, reason: 'producer_actor_mismatch' } };
  }
  const commandId = body['command_id'];
  const prior = judgedDoorCommands.get(commandId);
  if (prior !== undefined) {
    return { status: prior.status, payload: { ...prior.payload, duplicate: true } };
  }
  const judged = settledDoorOrders.has(body['orderId'])
    ? { status: 409, payload: { ok: false, reason: 'door_signal_course_settled' } as Record<string, unknown> }
    : !awaitingDoor.has(body['orderId'])
      ? { status: 409, payload: { ok: false, reason: 'door_signal_not_awaited' } as Record<string, unknown> }
      : { status: 200, payload: { ok: true, duplicate: false } as Record<string, unknown> };
  judgedDoorCommands.set(commandId, judged);
  return judged;
}

/** Every door-signal POST custody's door received over the WIRE, verbatim. */
const doorPosts: { auth: string | null; body: Record<string, unknown> | null; status: number }[] = [];

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
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      SHOP_ARM_SECRET: ARM_SECRET,
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        // The boutik intakes answer ok so the sibling wires drain quietly;
        // they are not under test here (ORDER-PAID-WIRE / BOUTIK-SUIVI own them).
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
      CUSTODY: async (request: Request) => {
        const path = new URL(request.url).pathname;
        // The ARM door, certified in vrai-suivi.e2e.test.ts where it is under
        // test; here it answers so the fourth wire drains quietly beside the
        // fifth. Same bounds: the Bearer, the four exact keys, the closed kind.
        if (request.method === 'POST' && path === '/produce-shop/secrets/arm') {
          const auth = request.headers.get('Authorization');
          const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
          if (auth !== `Bearer ${ARM_SECRET}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
          if (
            body === null ||
            Object.keys(body).sort().join(',') !== 'command_id,kind,orderId,secret' ||
            body['kind'] !== ARM_KIND ||
            typeof body['secret'] !== 'string' || !/^\d{6}$/.test(body['secret'] as string)
          ) {
            return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
          }
          return Response.json({ ok: true, status: 'armed', kind: body['kind'] });
        }
        if (request.method === 'POST' && path === '/produce-shop/door-signal') {
          const auth = request.headers.get('Authorization');
          const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
          const answer = doorSignalDoor(auth, body);
          doorPosts.push({ auth, body, status: answer.status });
          return Response.json(answer.payload, { status: answer.status });
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
const freshKey = (): string => `rk-pc-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

const CONTACT = { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'près du marché' };

/** The buyer's road to a CREATED pay-at-door order, over the public routes. */
async function createdDoorOrder(n: string): Promise<{ orderId: string; quoteId: string; buyerRef: string }> {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-pc-${n}`, resellerId: `rs-pc-${n}`,
      shortCode: `PC-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-pc-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-pc-${n}`, storefrontId: `sf-pc-${n}`,
      resellerId: `rs-pc-${n}`, productVersionId: 'pv-pc-1', offerVersion: 'ov-pc-1',
      markup: 1_500, correlationId: `corr-pc-${n}`, at: T0,
    }),
  });
  if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `pc-${n}`, pid: 'pv-pc-1', paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
      zoneTo: 'Ouagadougou', attributionResellerId: `rs-pc-${n}`, requestKey: freshKey(),
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
  if (typeof quote.quoteId !== 'string') throw new Error(`setup: door quote ${quoteRes.status}`);
  const held = await mf.dispatchFetch(
    `http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }) },
  );
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const ordered = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`,
      contact: CONTACT,
    }),
  });
  if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status} ${await ordered.text()}`);
  const createJson = safeJson(await ordered.text());
  return { orderId: `ord-${quote.quoteId}`, quoteId: quote.quoteId, buyerRef: createJson['buyerRef'] as string };
}

/** A CHECKOUT-leg webhook (D = 1 000) built by the frozen vault's certified mock. */
function checkoutWebhookEvent(orderId: string, attemptId: string): unknown {
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({
    orderId, paymentAttemptId: attemptId, amount: 1_000,
    correlationId: `corr-${orderId}`, requestedAtIso: T0,
  });
  return provider.webhookDeliveryPlan()[0]!.event;
}

/** A DOOR-leg webhook (B + M = 11 500) from the same certified mock. */
function doorWebhookEvent(orderId: string, attemptId: string): unknown {
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({
    orderId, paymentAttemptId: attemptId, amount: 11_500,
    correlationId: `corr-${orderId}`, requestedAtIso: T0, legType: 'door',
  });
  const plan = provider.webhookDeliveryPlan().find((d) => d.event.name === 'payment.door_leg_confirmed.v1');
  if (plan === undefined) throw new Error('the certified mock emitted no door event');
  return plan.event;
}

async function postWebhook(path: string, event: unknown) {
  const res = await mf.dispatchFetch(`http://c${path}`, {
    method: 'POST', headers: signed, body: JSON.stringify(event),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

/** NB-3 (E2) — the per-leg provider keys off the order's own record: a genuine
 *  webhook names its leg's key, so the suite reads it rather than fabricating. */
async function legKeyOf(orderId: string, leg: 'checkout' | 'door'): Promise<string> {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit');
  const record = (await res.json()) as { legKeys?: Record<string, string> };
  const key = record.legKeys?.[leg];
  if (key === undefined) throw new Error(`no ${leg} leg key on ${orderId}`);
  return key;
}

/** The buyer ASKS for the door collection — the real road that mints the door
 *  leg's key. NB-3 refuses a door webhook for a charge never initiated, so
 *  every door confirmation in this suite now walks this first. */
async function porteDemandee(orderId: string, n: string): Promise<void> {
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}/door-charge`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holderRef: `holder-${n}`, commandId: `cmd-door-${n}` }),
  });
  if (res.status !== 200) throw new Error(`setup: door-charge ${res.status} ${await res.text()}`);
}

/** shop → door order → confirmed (checkout leg paid): the door leg now `due`. */
async function confirmedDoorOrder(n: string): Promise<{ orderId: string; buyerRef: string }> {
  const o = await createdDoorOrder(n);
  const paid = await postWebhook(
    '/checkout/webhook/payment',
    checkoutWebhookEvent(o.orderId, await legKeyOf(o.orderId, 'checkout')),
  );
  if (paid.status !== 200) throw new Error(`setup: checkout webhook ${paid.status} ${paid.text}`);
  return o;
}

/** confirmed + door collection asked: the door webhook that names the real charge. */
async function trueDoorEvent(orderId: string): Promise<unknown> {
  return doorWebhookEvent(orderId, await legKeyOf(orderId, 'door'));
}

/** Séra's arrival fact, over the PROGRESS_WRITE_SECRET-gated transit intake. */
async function transitArrivee(orderId: string, asOf: string) {
  const res = await mf.dispatchFetch('http://c/fulfillment/transit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    body: JSON.stringify({ orderId, stage: 'arrivee', asOf }),
  });
  return { status: res.status, text: await res.text() };
}

/** The buyer's remise read, over the public route, with her order token. */
async function remiseRead(orderId: string, jeton: string) {
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}/remise`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${jeton}` },
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

async function vue(orderId: string) {
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
  return safeJson(await res.text());
}

async function outboxOf(orderId: string) {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/outbox');
  return safeJson(await res.text()) as {
    doorSignal?: { status?: string; attempts?: number; outcome?: string; reason?: string; deliveredAt?: string };
  };
}

const doorPostsFor = (orderId: string) =>
  doorPosts.filter((p) => p.body?.['orderId'] === orderId);

async function waitForDoorPosts(orderId: string, n = 1, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (doorPostsFor(orderId).length < n && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function waitForDoorSignalDone(orderId: string, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let box = await outboxOf(orderId);
  while (box.doorSignal?.status !== 'delivered' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    box = await outboxOf(orderId);
  }
  return box;
}

/* ═══════════ the double itself, certified before anything rides it ═══════════ */

describe('PORTE-CUSTODY — the custody double is certified: never kinder than the real door', () => {
  const okAuth = `Bearer ${ARM_SECRET}`;
  const bodyFor = (orderId: string, event: unknown, attempt = 0) => {
    const parsed = PlatformEventSchema.parse(event);
    return { orderId, command_id: `door-signal-${parsed.envelope.command_id}-a${attempt}`, event };
  };

  it('driven OUT OF ORDER (custody not awaiting) it refuses 409 door_signal_not_awaited', () => {
    const event = doorWebhookEvent('ord-cert-a', 'att-cert-a');
    const res = doorSignalDoor(okAuth, bodyFor('ord-cert-a', event));
    expect(res.status).toBe(409);
    expect(res.payload).toEqual({ ok: false, reason: 'door_signal_not_awaited' });
  });

  it('a REPLAYED command_id absorbs: {ok:true, duplicate:true} — even once no longer awaited', () => {
    awaitingDoor.add('ord-cert-b');
    const event = doorWebhookEvent('ord-cert-b', 'att-cert-b');
    const body = bodyFor('ord-cert-b', event);
    expect(doorSignalDoor(okAuth, body)).toEqual({ status: 200, payload: { ok: true, duplicate: false } });
    expect(doorSignalDoor(okAuth, body)).toEqual({ status: 200, payload: { ok: true, duplicate: true } });
    awaitingDoor.delete('ord-cert-b');
    // Still absorbed after the await window closed — the spine's own order.
    expect(doorSignalDoor(okAuth, body)).toEqual({ status: 200, payload: { ok: true, duplicate: true } });
  });

  it('a renamed event is 409 door_signal_invalid; a re-actored one 409 producer_actor_mismatch', () => {
    awaitingDoor.add('ord-cert-c');
    const event = doorWebhookEvent('ord-cert-c', 'att-cert-c') as {
      name: string; envelope: Record<string, unknown>; payload: unknown;
    };
    const renamed = { ...event, name: 'payment.checkout_leg_confirmed.v1' };
    expect(doorSignalDoor(okAuth, bodyFor('ord-cert-c', renamed)).status).toBe(409);
    expect(doorSignalDoor(okAuth, bodyFor('ord-cert-c', renamed)).payload).toMatchObject({ reason: 'door_signal_invalid' });
    // Re-actored: the exact temptation the verbatim law forbids — a forwarder
    // stamping ITS actor over the provider's would be refused by custody.
    const reactored = { ...event, envelope: { ...event.envelope, actor: 'storefront-service:checkout' } };
    expect(doorSignalDoor(okAuth, bodyFor('ord-cert-c', reactored)).payload).toMatchObject({ reason: 'producer_actor_mismatch' });
    awaitingDoor.delete('ord-cert-c');
  });

  it('a SETTLED course refuses 409 door_signal_course_settled — the terminal the real spine answers by name', () => {
    settledDoorOrders.add('ord-cert-e');
    const event = doorWebhookEvent('ord-cert-e', 'att-cert-e');
    const res = doorSignalDoor(okAuth, bodyFor('ord-cert-e', event));
    expect(res.status).toBe(409);
    expect(res.payload).toEqual({ ok: false, reason: 'door_signal_course_settled' });
    settledDoorOrders.delete('ord-cert-e');
  });

  it('the wrong Bearer is 401 and a malformed body 400 — both non-terminal for the wire', () => {
    const event = doorWebhookEvent('ord-cert-d', 'att-cert-d');
    expect(doorSignalDoor('Bearer pas-le-bon', bodyFor('ord-cert-d', event)).status).toBe(401);
    expect(doorSignalDoor(okAuth, null).status).toBe(400);
    expect(doorSignalDoor(okAuth, { orderId: 'ord-cert-d', event }).status).toBe(400);
    const extra = { ...bodyFor('ord-cert-d', event), amount: 11_500 };
    expect(doorSignalDoor(okAuth, extra).status).toBe(400);
  });
});

/* ══════════════════ the wire, on the real Worker bundle ══════════════════ */

describe('PORTE-CUSTODY — the applied door webhook arms the wire and the alarm posts the contract bytes', () => {
  it('door confirmed → ONE POST {orderId, command_id, event} — Bearer, deterministic id, event VERBATIM', async () => {
    custodyDoorRespond = 'ok';
    const { orderId } = await confirmedDoorOrder('0001');
    awaitingDoor.add(orderId);
    await porteDemandee(orderId, '0001');
    const event = await trueDoorEvent(orderId);
    const applied = await postWebhook('/checkout/webhook/door', event);
    expect(applied.status, applied.text).toBe(200);
    expect(applied.json['doorLeg']).toBe('paid');

    await waitForDoorPosts(orderId);
    const posts = doorPostsFor(orderId);
    expect(posts, 'the signal must have been attempted at all').toHaveLength(1);
    const post = posts[0]!;
    expect(post.auth).toBe(`Bearer ${ARM_SECRET}`);
    expect(post.status, 'the certified double accepted it').toBe(200);
    // EXACTLY the contract keys — no amount, no extra field can ride this wire.
    expect(Object.keys(post.body!).sort()).toEqual(['command_id', 'event', 'orderId']);
    expect(post.body!['orderId']).toBe(orderId);
    // DETERMINISTIC command id, derived from the EVENT'S OWN envelope: a
    // redelivery replays at custody's command log instead of counting twice.
    const envelope = (event as { envelope: { command_id: string; actor: string } }).envelope;
    expect(post.body!['command_id']).toBe(`door-signal-${envelope.command_id}-a0`);
    // THE EVENT TRAVELS VERBATIM — same name, same envelope (actor included:
    // custody verifies the producer itself), same payload. Never re-minted.
    expect(post.body!['event']).toEqual(event);

    // …and the row records the delivery, durably, as ACCEPTED.
    const box = await waitForDoorSignalDone(orderId);
    expect(box.doorSignal?.status).toBe('delivered');
    expect(box.doorSignal?.outcome).toBe('accepted');
    expect(typeof box.doorSignal?.deliveredAt).toBe('string');
    awaitingDoor.delete(orderId);
  }, 60_000);

  it('a REDELIVERED door webhook is absorbed and arms NO second row — still exactly one POST', async () => {
    custodyDoorRespond = 'ok';
    const { orderId } = await confirmedDoorOrder('0002');
    awaitingDoor.add(orderId);
    await porteDemandee(orderId, '0002');
    const event = await trueDoorEvent(orderId);
    expect((await postWebhook('/checkout/webhook/door', event)).status).toBe(200);
    await waitForDoorPosts(orderId);
    await waitForDoorSignalDone(orderId);

    const again = await postWebhook('/checkout/webhook/door', event);
    expect(again.status).toBe(200);
    expect(again.json['status']).toBe('duplicate');
    await new Promise((r) => setTimeout(r, 400));
    // The spine absorbed it, so the outbox armed only on the newly-applied
    // branch: one POST ever, and the recorded row did not move.
    expect(doorPostsFor(orderId)).toHaveLength(1);
    const box = await outboxOf(orderId);
    expect(box.doorSignal?.status).toBe('delivered');
    expect(box.doorSignal?.attempts).toBe(1);
    awaitingDoor.delete(orderId);
  }, 60_000);

  it('custody DOWN: the row stays pending with attempts counted and the retry booked — the money path never notices', async () => {
    custodyDoorRespond = 'down';
    try {
      const { orderId } = await confirmedDoorOrder('0003');
      awaitingDoor.add(orderId);
      await porteDemandee(orderId, '0003');
      expect((await postWebhook('/checkout/webhook/door', await trueDoorEvent(orderId))).status).toBe(200);
      await waitForDoorPosts(orderId);
      const deadline = Date.now() + 5_000;
      let box = await outboxOf(orderId);
      while ((box.doorSignal?.attempts ?? 0) < 1 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
        box = await outboxOf(orderId);
      }
      // A 500 is an outage, not an answer: pending, attempts counted, the next
      // alarm booked on the shared backoff (its instant is minutes away — the
      // STATE is the proof, the repo's standing precedent for these wires; the
      // schedule itself is outboxBackoffMs, proven by value in order-core).
      expect(box.doorSignal?.status, 'an unheard signal stays pending — never delivered').toBe('pending');
      expect(box.doorSignal?.attempts).toBeGreaterThanOrEqual(1);
      expect(box.doorSignal?.outcome).toBeUndefined();
      // The door leg itself is untouched — the wire is a relay, never a gate.
      expect((await vue(orderId))['doorLeg']).toBe('paid');
      awaitingDoor.delete(orderId);
    } finally {
      custodyDoorRespond = 'ok';
    }
  }, 60_000);

  it('custody says door_signal_not_awaited: the wire KEEPS CARRYING — she paid before the accord was noted, and the signal lands once it is', async () => {
    custodyDoorRespond = 'ok';
    const { orderId } = await confirmedDoorOrder('0004');
    // NOT in `awaitingDoor` — the genuinely reachable race: the buyer pays on
    // her page BEFORE the rider records her accord. `not_awaited` is custody's
    // STATE, not a verdict on the event — treating it as carriage complete
    // stranded the order forever (the provider never redelivers; custody
    // would await a signal nobody re-sends). The row must stay PENDING.
    await porteDemandee(orderId, '0004');
    const event0004 = await trueDoorEvent(orderId);
    expect((await postWebhook('/checkout/webhook/door', event0004)).status).toBe(200);
    await waitForDoorPosts(orderId);
    let box = await outboxOf(orderId);
    expect(box.doorSignal?.status).toBe('pending');
    expect(box.doorSignal?.outcome).toBeUndefined();
    expect(box.doorSignal?.attempts).toBe(1);

    // The rider records the accord — custody now awaits. The provider's
    // redelivery of the SAME webhook (its own at-least-once) trips the
    // duplicate-branch revival hook, so the retry fires now rather than on
    // the backoff rung — same command_id, and the signal lands.
    awaitingDoor.add(orderId);
    expect((await postWebhook('/checkout/webhook/door', event0004)).status).toBe(200);
    box = await waitForDoorSignalDone(orderId);
    expect(box.doorSignal?.status).toBe('delivered');
    expect(box.doorSignal?.outcome).toBe('accepted');
    const posts = doorPostsFor(orderId);
    expect(posts.length).toBeGreaterThanOrEqual(2);
    // FRESH outer id per attempt (custody replays a recorded 409 verbatim for
    // a reused id — the frozen id was the stranding); one shared base, and
    // the EVENT'S envelope id constant, which is what keeps custody's
    // consumption and alert idempotent across the re-judgments.
    const ids = posts.map((p) => String((p.body as Record<string, unknown>)['command_id']));
    expect(new Set(ids).size).toBeGreaterThanOrEqual(2);
    expect(new Set(ids.map((i) => i.replace(/-a\d+$/, ''))).size).toBe(1);
    expect(
      new Set(posts.map((p) => (PlatformEventSchema.parse((p.body as Record<string, unknown>)['event'])).envelope.command_id)).size,
    ).toBe(1);
    awaitingDoor.delete(orderId);
  }, 60_000);

  it('custody says door_signal_course_settled: she paid, then the course was refused home — TERMINAL, recorded with its reason, never re-posted', async () => {
    custodyDoorRespond = 'ok';
    const { orderId } = await confirmedDoorOrder('0008');
    // NOT in `awaitingDoor`: she paid before the accord was noted, so the
    // wire is carrying on `not_awaited` — exactly the 0004 race, until…
    await porteDemandee(orderId, '0008');
    const event0008 = await trueDoorEvent(orderId);
    expect((await postWebhook('/checkout/webhook/door', event0008)).status).toBe(200);
    await waitForDoorPosts(orderId);
    let box = await outboxOf(orderId);
    expect(box.doorSignal?.status).toBe('pending');

    // …the rider records her VALID refusal: custody settles the course home
    // and will never await this signal again. The provider's redelivery
    // trips the revival hook; custody answers the E2 terminal by name, and
    // the wire STOPS — refused, reason kept, nothing re-posted.
    settledDoorOrders.add(orderId);
    expect((await postWebhook('/checkout/webhook/door', event0008)).status).toBe(200);
    box = await waitForDoorSignalDone(orderId);
    expect(box.doorSignal?.status).toBe('delivered');
    expect(box.doorSignal?.outcome).toBe('refused');
    expect(box.doorSignal?.reason).toBe('door_signal_course_settled');
    const after = doorPostsFor(orderId).length;
    await new Promise((r) => setTimeout(r, 400));
    expect(doorPostsFor(orderId)).toHaveLength(after);
    // Shop+'s own record of the provider truth is untouched by custody's no
    // — the refund routing is E3's, fed by custody's alert on its side.
    expect((await vue(orderId))['doorLeg']).toBe('paid');
    settledDoorOrders.delete(orderId);
  }, 60_000);

  it("custody's verdict on the EVENT ITSELF is terminal: recorded as refused, reason kept, never re-posted", async () => {
    custodyDoorRespond = 'actor_mismatch';
    try {
      const { orderId } = await confirmedDoorOrder('0006');
      await porteDemandee(orderId, '0006');
      expect((await postWebhook('/checkout/webhook/door', await trueDoorEvent(orderId))).status).toBe(200);
      await waitForDoorPosts(orderId);
      const box = await waitForDoorSignalDone(orderId);
      expect(box.doorSignal?.status).toBe('delivered');
      expect(box.doorSignal?.outcome).toBe('refused');
      expect(box.doorSignal?.reason).toBe('producer_actor_mismatch');
      expect(box.doorSignal?.attempts).toBe(1);
      // Terminal: custody judged the event itself (and raised its own
      // reconciliation alert on that side) — no further POST arrives.
      await new Promise((r) => setTimeout(r, 400));
      expect(doorPostsFor(orderId)).toHaveLength(1);
      // …and Shop+'s own spine is untouched by custody's no.
      expect((await vue(orderId))['doorLeg']).toBe('paid');
    } finally {
      custodyDoorRespond = 'ok';
    }
  }, 60_000);

  it('a MEGABYTE command_id on the door event is refused BY NAME before anything is applied or armed', async () => {
    const { orderId } = await confirmedDoorOrder('0005');
    await porteDemandee(orderId, '0005');
    const event = (await trueDoorEvent(orderId)) as { envelope: { command_id: string } };
    event.envelope.command_id = 'x'.repeat(1_048_576);
    const res = await postWebhook('/checkout/webhook/door', event);
    expect(res.status).toBe(422);
    expect(res.json['error']).toBe('envelope_field_too_long');
    const box = await outboxOf(orderId);
    expect(box.doorSignal, 'nothing armed for a refused event').toBeUndefined();
    // The order is untouched: a NORMAL door webhook still lands afterwards.
    awaitingDoor.add(orderId);
    const ok = await postWebhook('/checkout/webhook/door', await trueDoorEvent(orderId));
    expect(ok.status, ok.text).toBe(200);
    awaitingDoor.delete(orderId);
  }, 60_000);
});

/* ═══ the stranded row is recovered, never abandoned (call-site pins) ═══ */

describe('PORTE-CUSTODY — crash-window recovery, held to the standing call-site-pin standard', () => {
  /**
   * ⚠ WHY THESE ARE CALL-SITE PINS AND NOT DRIVEN CASES — the same argument
   * the VRAI-SUIVI and BOUTIK-SUIVI pins carry verbatim: the stranded state
   * is « pending outbox, NO alarm », reachable only by a crash in the narrow
   * window between the batch put and `setAlarm`, which no test can produce
   * from outside the object. The four older wires' hooks are held to exactly
   * this standard. Every anchor is asserted found before it is used — an
   * anchor that did not match proves nothing.
   */
  const src = readFileSync(
    join(import.meta.dirname, '..', 'worker', 'order-do.ts'),
    'utf8',
  );
  const anchored = (needle: string): number => {
    const at = src.indexOf(needle);
    expect(at, `anchor not found: ${needle}`).toBeGreaterThan(-1);
    return at;
  };

  it('the row enters the SAME atomic batch as the door log append', () => {
    const rowAt = anchored('[DOOR_SIGNAL_KEY]: {');
    const putStart = src.lastIndexOf('await this.state.storage.put({', rowAt);
    expect(putStart, 'the row is written inside a batch put').toBeGreaterThan(-1);
    const batch = src.slice(putStart, src.indexOf('});', putStart));
    expect(batch).toContain('[LOG_KEY]: [...log, input]');
    expect(batch).toContain('[DOOR_SIGNAL_KEY]: {');
  });

  it('the checkout-webhook recovery hook covers the FIFTH wire', () => {
    const hook = src.slice(anchored('const stranded = await this.state.storage.get'));
    const guard = hook.slice(0, hook.indexOf('setAlarm'));
    expect(guard).toContain('DOOR_SIGNAL_KEY');
    expect(guard).toContain("strandedPorte?.status === 'pending'");
  });

  it('a REDELIVERED door webhook re-arms a stranded pending row', () => {
    // The `strandedPorte` read exists at THREE sites (checkout hook,
    // eligibility hook, door hook) — anchor on the DOOR branch's own
    // distinctive comment so this pin cannot be satisfied by the wrong site.
    const hookAt = anchored('the redelivery IS a recovery hook for a');
    const branch = src.slice(hookAt, src.indexOf("status: 'duplicate', doorLeg: spine.doorLegState", hookAt));
    expect(branch).toContain('DOOR_SIGNAL_KEY');
    expect(branch).toContain("strandedPorte?.status === 'pending'");
    expect(branch).toContain('setAlarm(Date.now())');
    // …and NO alarm-is-null guard survives here: a pending row's booked
    // backoff rung is deliberately pulled FORWARD by a redelivery — a
    // not_awaited retry waits on that rung while a rider stands at a door.
    expect(branch).not.toContain('getAlarm');
    expect(branch).not.toContain('storage.put');
  });

  it('a REDELIVERED eligibility re-arms it too', () => {
    const dup = src.slice(anchored('if (outcome.duplicate) {'));
    const body = dup.slice(0, dup.indexOf("status: 'duplicate'"));
    expect(body).toContain('DOOR_SIGNAL_KEY');
    expect(body).not.toContain('storage.put');
  });

  it('the alarm flushes the fifth wire and re-arms on its pending count', () => {
    anchored('const doorSignalPending = await this.flushDoorSignalOutbox();');
    // STOCK-VENDU-1b widened the shared re-arm to the SIXTH wire (the
    // refused-course relay), LISTE-ENVIES-1 to the SEVENTH (the offert
    // marker); the pin follows each widening so the fifth wire's count is
    // still provably inside it.
    anchored('Math.max(boutikPending, seraPending, livraisonPending, armPending, doorSignalPending, refusPending, offertPending)');
  });
});

/**
 * ═══ §6.3 — THE DROP CODE COMES LAST, AFTER THE DOOR LEG IS PAID ═══
 *
 * Spec §6.3: « the buyer enters the drop code last, after any door payment is
 * provider-confirmed. » On an Option-B order the code is minted at CONFIRM —
 * which for Option B is the delivery-fee leg — while the product (B+M) is still
 * owed at the door (doorLeg = 'due'). The server remise route is the reveal
 * authority; it must withhold the code while the door leg is due, in the SAME
 * constant-shape 404 as every other « pas encore ».
 *
 * The audit (2026-08-21) found the route gated on arrival + token only, never
 * on the door leg — and arrival precedes door payment, so an arrived buyer
 * could read her code before paying the product. This walk drives the real
 * Worker to prove the gate. It was RED before the door-leg condition was added.
 */
describe('§6.3 — the code is withheld while the door leg is due, revealed once paid', () => {
  it('Option-B, arrived, door DUE → 404 (withheld); after the door leg is paid → the code', async () => {
    const o = await confirmedDoorOrder('0007');
    expect((await vue(o.orderId))['doorLeg'], 'the product is still owed at the door').toBe('due');
    expect(typeof o.buyerRef, 'the buyer token was minted at create').toBe('string');

    // Séra records the rider's arrival — the ONLY gate the route had before.
    expect((await transitArrivee(o.orderId, '2026-08-10T15:00:00.000Z')).status).toBe(200);

    // §6.3: arrived is not paid. Her own token learns « pas encore », the same
    // 404 bytes as before-arrival — the code is NOT released while B+M is owed.
    const due = await remiseRead(o.orderId, o.buyerRef);
    expect(`${due.status} ${due.text}`, 'the code must be withheld while the door leg is due').toBe('404 {"ok":false}');

    // The buyer pays the product at the door; the provider confirms it.
    await porteDemandee(o.orderId, '0007');
    const paid = await postWebhook('/checkout/webhook/door', await trueDoorEvent(o.orderId));
    expect(paid.status, paid.text).toBe(200);
    expect((await vue(o.orderId))['doorLeg']).toBe('paid');

    // NOW — and only now — her token reveals the code, colis en main.
    const revealed = await remiseRead(o.orderId, o.buyerRef);
    expect(revealed.status, revealed.text).toBe(200);
    expect(revealed.json['ok']).toBe(true);
    expect(/^\d{6}$/.test(revealed.json['code'] as string), 'six digits, as armed').toBe(true);
  });
});
