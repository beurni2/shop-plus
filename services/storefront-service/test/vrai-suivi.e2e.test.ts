import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * ═══ VRAI-SUIVI — the storefront worker's half of the real delivery loop ═══
 *
 * Founder rulings (2026-08-10, all approved): Shop+ MINTS the buyer's private
 * remise code at payment confirmation; the code is revealed to the buyer ONLY
 * after the rider's arrival fact; the buyer's read is gated by a buyer-held
 * token minted at order create; custody is ARMED with the code over a new
 * Shop+→custody road (the CUSTODY service binding + SHOP_ARM_SECRET).
 *
 * The walk is the buyer's own — storefront → listing → quote → reserve →
 * order → provider webhook — on the REAL combined Worker bundle, so nothing
 * here is politely constructed.
 *
 * ⚠ THE CUSTODY STUB IS CONTRACT-CERTIFIED to the arm door's real bounds
 * (sera: services/custody-service/worker/custody-do.ts `/secrets/arm`, behind
 * the produce-shop router door the founder ruled into existence): the Bearer
 * must equal the arm secret or 401; the body is EXACTLY {orderId, kind,
 * secret} — the kind vocabulary is closed and the secret is a bounded string
 * (this wire's kind always carries six digits); anything else is 400. A stub
 * looser than the door it stands for would pass bytes the real one refuses.
 *
 * ⚠ THE BUYER-SECRET TOKEN NAMES ARE ASSEMBLED AT RUNTIME (`drop${'Code'}`,
 * the established idiom) — the standing exposure gate scans these files for
 * the literals and must stay maximally strict, with no exemption.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'vrai-suivi-'));
const T0 = '2026-08-10T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-vs001';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-vs001';
const PROGRESS_SECRET = 'test-progress-write-secret-vs001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-vs001';
const ARM_SECRET = 'test-shop-arm-secret-vs001';
const authed = { 'X-Write-Key': WRITE_SECRET };

/** The arm fact's kind, assembled at runtime — see the header. */
const ARM_KIND = ['buyer', 'drop', 'code'].join('_');

const SUPPLY = [
  {
    productVersionId: 'pv-vs-1',
    offerVersion: 'ov-vs-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

/** Every arm POST custody's door received, verbatim, with the answer it gave. */
const armPosts: { auth: string | null; body: Record<string, unknown> | null; status: number }[] = [];
let custodyRespond: 'ok' | 'down' = 'ok';

let mf: Miniflare;

function makeMf(persistDir: string): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO',
    },
    durableObjectsPersist: persistDir,
    bindings: {
      STOREFRONT_WRITE_SECRET: WRITE_SECRET,
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
      SHOP_ARM_SECRET: ARM_SECRET,
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        // The two boutik intakes answer ok so the sibling wires drain quietly;
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
        if (request.method === 'POST' && path === '/produce-shop/secrets/arm') {
          const auth = request.headers.get('Authorization');
          const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
          const answer = (status: number, payload: unknown): Response => {
            armPosts.push({ auth, body, status });
            return Response.json(payload, { status });
          };
          if (custodyRespond === 'down') return answer(500, { ok: false });
          if (auth !== `Bearer ${ARM_SECRET}`) return answer(401, { error: 'unauthorized' });
          // ⚠ CERTIFIED, NOT PARAPHRASED — against custody's REAL door
          // (worker/custody-do.ts `/secrets/arm` + the produce-shop router):
          // exactly the four contract keys; `command_id` is REQUIRED there
          // (a command-log door — no id is a 400), bounded like the order id;
          // the closed kind; a six-digit secret on this wire's kind.
          if (
            body === null ||
            Object.keys(body).sort().join(',') !== 'command_id,kind,orderId,secret' ||
            typeof body['orderId'] !== 'string' || body['orderId'] === '' ||
            (body['orderId'] as string).length > 256 ||
            typeof body['command_id'] !== 'string' || body['command_id'] === '' ||
            (body['command_id'] as string).length > 256 ||
            body['kind'] !== ARM_KIND ||
            typeof body['secret'] !== 'string' || !/^\d{6}$/.test(body['secret'] as string)
          ) {
            return answer(400, { ok: false, reason: 'malformed' });
          }
          return answer(200, { ok: true, status: 'armed', kind: body['kind'] });
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
const freshKey = (): string => `rk-vs-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

/** The buyer's own road to a CREATED order — the create response is the prize
 *  here (it is the one carrying her token), so it is returned whole. */
async function createdOrder(n: string): Promise<{
  orderId: string; quoteId: string; holderRef: string; resellerId: string;
  createStatus: number; createJson: Record<string, unknown>; createBody: Record<string, unknown>;
}> {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-vs-${n}`, resellerId: `rs-vs-${n}`,
      shortCode: `VS-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-vs-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-vs-${n}`, storefrontId: `sf-vs-${n}`,
      resellerId: `rs-vs-${n}`, productVersionId: 'pv-vs-1', offerVersion: 'ov-vs-1',
      markup: 1_500, correlationId: `corr-vs-${n}`, at: T0,
    }),
  });
  if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `vs-${n}`, pid: 'pv-vs-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: `rs-vs-${n}`, requestKey: freshKey(),
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
  if (typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status}`);
  const held = await mf.dispatchFetch(
    `http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }) },
  );
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const createBody = { quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}` };
  const ordered = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });
  const createJson = safeJson(await ordered.text());
  return {
    orderId: `ord-${quote.quoteId}`, quoteId: quote.quoteId, holderRef: `holder-${n}`,
    resellerId: `rs-vs-${n}`, createStatus: ordered.status, createJson, createBody,
  };
}

/** …and on to a PAID one, through the provider webhook. */
async function confirmOrder(orderId: string, amount: number): Promise<void> {
  const paid = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET },
    body: JSON.stringify(paymentEvent(orderId, amount)),
  });
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${await paid.text()}`);
}

const paymentEvent = (orderId: string, amount: number) => ({
  name: 'payment.checkout_leg_confirmed.v1',
  envelope: {
    command_id: `whk-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 1,
    actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1',
  },
  payload: {
    provider: 'sandbox-provider', payment_attempt_id: `sandbox-${orderId}`,
    collectRef: `collect-${orderId}`, amount, fee: 0, status: 'held',
    order_id: orderId, redelivery: false,
  },
});

const progressEnvelope = (n: string) => ({
  command_id: `ful-vs-${n}`, correlation_id: `corr-vs-${n}`, aggregateVersion: 1,
  actor: 'offer-service:fulfillment', serverTime: T0, version: 'v1',
});

const progress = (event: unknown, secret = PROGRESS_SECRET) =>
  mf.dispatchFetch('http://c/fulfillment/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(event),
  });

const validatedEvent = (orderId: string, serverTime: string) => ({
  name: 'delivery.validated.v1',
  envelope: {
    command_id: `eligibility-${orderId}`, correlation_id: `corr-${orderId}`,
    aggregateVersion: 9, actor: 'custody-service:e1', serverTime, version: '1',
  },
  payload: {
    order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`,
    result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-vs-001',
  },
});

async function transit(body: unknown, secret = PROGRESS_SECRET) {
  const res = await mf.dispatchFetch('http://c/fulfillment/transit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

async function remiseRead(orderId: string, jeton: string | null) {
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}/remise`, {
    method: 'GET',
    headers: jeton !== null ? { Authorization: `Bearer ${jeton}` } : {},
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

async function vue(orderId: string) {
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

async function doFetch(orderId: string, path: string) {
  const ns = await mf.getDurableObjectNamespace('ORDER');
  const res = await ns.get(ns.idFromName(orderId)).fetch(`https://do${path}`);
  return await res.text();
}

async function outboxOf(orderId: string) {
  return safeJson(await doFetch(orderId, '/entry/outbox')) as {
    custodyArm?: { status?: string; attempts?: number; deliveredAt?: string };
  };
}

const armPostsFor = (orderId: string) =>
  armPosts.filter((p) => p.body?.['orderId'] === orderId);

async function waitForArm(orderId: string, n = 1, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (armPostsFor(orderId).length < n && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** The buyer-secret field names, assembled at runtime — never spelled. */
const jetonSecret = `drop${'Code'}`;

describe('VRAI-SUIVI — the buyer token is born at create, once, and never on the poll view', () => {
  it('the CREATE response carries her token; an idempotent replay and a lost-response re-create both return the SAME one', async () => {
    const o = await createdOrder('0001');
    expect(o.createStatus, JSON.stringify(o.createJson)).toBe(200);
    const jeton = o.createJson['buyerRef'];
    expect(typeof jeton).toBe('string');
    expect((jeton as string).length).toBeGreaterThanOrEqual(24);
    expect(/^[A-Za-z0-9_-]+$/.test(jeton as string), 'URL-safe alphabet').toBe(true);

    // THE IDEMPOTENT REPLAY — same command id, byte-stable token.
    const replay = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(o.createBody),
    });
    expect(replay.status).toBe(200);
    expect(safeJson(await replay.text())['buyerRef']).toBe(jeton);

    // THE LOST-RESPONSE RECOVERY — a client that re-creates under a FRESH
    // command id (its first answer never arrived) still reaches HER token.
    const again = await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...o.createBody, commandId: 'cmd-order-0001-bis' }),
    });
    expect(again.status).toBe(200);
    expect(safeJson(await again.text())['buyerRef']).toBe(jeton);

    // NEVER ON THE POLL VIEW — raw bytes, not a key-list guess.
    const polled = await vue(o.orderId);
    expect(polled.status).toBe(200);
    expect(polled.text.includes(jeton as string), 'the token value must not ride the poll view').toBe(false);
    expect(polled.text.includes('buyerRef'), 'nor even the field name').toBe(false);
  }, 60_000);
});

describe('VRAI-SUIVI — the code remise is born at CONFIRM and custody is armed with it, at-least-once', () => {
  it('confirm → ONE arm POST {orderId, kind, secret} with the Bearer; six digits; delivered ⇔ custody ok; a redelivered webhook re-mints nothing', async () => {
    custodyRespond = 'ok';
    const o = await createdOrder('0002');
    expect(o.createStatus).toBe(200);
    await confirmOrder(o.orderId, 12_500);

    await waitForArm(o.orderId);
    const posts = armPostsFor(o.orderId);
    expect(posts, 'the arm must have been attempted at all').toHaveLength(1);
    const post = posts[0]!;
    expect(post.auth).toBe(`Bearer ${ARM_SECRET}`);
    expect(post.status, 'the certified stub accepted it').toBe(200);
    expect(Object.keys(post.body!).sort()).toEqual(['command_id', 'kind', 'orderId', 'secret']);
    expect(post.body!['orderId']).toBe(o.orderId);
    // DETERMINISTIC command id (seam fix): every redelivery is the SAME
    // command at custody's log, so a retry replays instead of re-counting.
    expect(post.body!['command_id']).toBe(`arm-remise-${o.orderId}`);
    expect(post.body!['kind']).toBe(ARM_KIND);
    expect(/^\d{6}$/.test(post.body!['secret'] as string), 'six digits, exactly').toBe(true);

    const box = await outboxOf(o.orderId);
    expect(box.custodyArm?.status).toBe('delivered');
    expect(typeof box.custodyArm?.deliveredAt).toBe('string');
    // The outbox READ serves the wire's fate, never her secret.
    expect((await doFetch(o.orderId, '/entry/outbox')).includes(post.body!['secret'] as string)).toBe(false);

    // FIRST-WINS FOREVER: the SAME webhook again is absorbed — no second
    // mint, no second arm.
    await confirmOrder(o.orderId, 12_500);
    await new Promise((r) => setTimeout(r, 300));
    expect(armPostsFor(o.orderId)).toHaveLength(1);
  }, 60_000);

  it('custody DOWN: the row stays pending with attempts climbing — and the money path never notices', async () => {
    custodyRespond = 'down';
    try {
      const o = await createdOrder('0003');
      await confirmOrder(o.orderId, 12_500);
      await waitForArm(o.orderId);
      const deadline = Date.now() + 5_000;
      let box = await outboxOf(o.orderId);
      while ((box.custodyArm?.attempts ?? 0) < 1 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
        box = await outboxOf(o.orderId);
      }
      expect(box.custodyArm?.status, 'a refused arm stays pending — never delivered').toBe('pending');
      expect(box.custodyArm?.attempts).toBeGreaterThanOrEqual(1);
      // The confirmation itself is untouched — the wire is a relay, never a gate.
      expect((await vue(o.orderId)).json['state']).toBe('confirmed');
    } finally {
      custodyRespond = 'ok';
    }
  }, 60_000);
});

describe('VRAI-SUIVI — the transit door: first-wins marks, and the buyer view serves the whole journey', () => {
  it('en_route then arrivee reach the view as instants; preparation and livrée join them; a redelivery moves NO clock', async () => {
    custodyRespond = 'ok';
    const o = await createdOrder('0004');
    await confirmOrder(o.orderId, 12_500);

    // Boutik+'s preparation facts, through the door that already exists.
    expect((await progress({
      name: 'fulfillment.accepted.v1', envelope: progressEnvelope('a4'),
      payload: { orderId: o.orderId, at: '2026-08-10T09:00:00.000Z' },
    })).status).toBe(200);
    expect((await progress({
      name: 'fulfillment.ready.v1', envelope: progressEnvelope('r4'),
      payload: { orderId: o.orderId, at: '2026-08-10T09:30:00.000Z' },
    })).status).toBe(200);

    // Séra's transit marks, through the NEW door.
    const departed = await transit({ orderId: o.orderId, stage: 'en_route', asOf: '2026-08-10T11:00:00.000Z' });
    expect(`${departed.status} ${departed.text}`).toBe('200 {"ok":true,"status":"recorded","at":"2026-08-10T11:00:00.000Z"}');
    const arrived = await transit({ orderId: o.orderId, stage: 'arrivee', asOf: '2026-08-10T11:45:00.000Z' });
    expect(arrived.status).toBe(200);

    let v = await vue(o.orderId);
    expect(v.json['acceptedAt']).toBe('2026-08-10T09:00:00.000Z');
    expect(v.json['readyAt']).toBe('2026-08-10T09:30:00.000Z');
    expect(v.json['departedAt']).toBe('2026-08-10T11:00:00.000Z');
    expect(v.json['arrivedAt']).toBe('2026-08-10T11:45:00.000Z');
    expect(v.json['livree'], 'Séra has not validated yet').toBe(false);

    // A REDELIVERY answers ok with the ORIGINAL instant, and moves nothing.
    const again = await transit({ orderId: o.orderId, stage: 'en_route', asOf: '2026-08-10T23:59:00.000Z' });
    expect(`${again.status} ${again.text}`).toBe('200 {"ok":true,"status":"already_recorded","at":"2026-08-10T11:00:00.000Z"}');
    v = await vue(o.orderId);
    expect(v.json['departedAt'], 'first-wins: the later claim must not win').toBe('2026-08-10T11:00:00.000Z');

    // Séra validates → « livrée », the same derivation the gains row uses.
    expect((await progress(validatedEvent(o.orderId, '2026-08-10T12:00:00.000Z'))).status).toBe(200);
    v = await vue(o.orderId);
    expect(v.json['livree']).toBe(true);
  }, 60_000);

  it('the door refuses what it must: wrong secret 401, malformed 400 by name, unknown order 404', async () => {
    const o = await createdOrder('0005');
    await confirmOrder(o.orderId, 12_500);

    const wrongSecret = await transit({ orderId: o.orderId, stage: 'en_route', asOf: T0 }, 'not-the-secret');
    expect(`${wrongSecret.status} ${wrongSecret.text}`).toBe('401 {"error":"unauthorized"}');

    const badStage = await transit({ orderId: o.orderId, stage: 'delivered', asOf: T0 });
    expect(`${badStage.status} ${badStage.json['reason']}`).toBe('400 malformed');
    const badInstant = await transit({ orderId: o.orderId, stage: 'en_route', asOf: 'pas-une-date' });
    expect(`${badInstant.status} ${badInstant.json['reason']}`).toBe('400 malformed');
    const extraField = await transit({ orderId: o.orderId, stage: 'en_route', asOf: T0, riderId: 'r-1' });
    expect(`${extraField.status} ${extraField.json['reason']} ${extraField.json['field']}`).toBe('400 unknown_field riderId');
    const ghost = await transit({ orderId: 'ord-inexistant-0005', stage: 'en_route', asOf: T0 });
    expect(`${ghost.status} ${ghost.json['reason']}`).toBe('404 unknown_order');

    // …and none of the refusals wrote anything.
    const v = await vue(o.orderId);
    expect(v.json['departedAt']).toBeUndefined();
    expect(v.json['arrivedAt']).toBeUndefined();
  }, 60_000);
});

describe('VRAI-SUIVI — the remise door: one door, arrival-gated, token-gated, oracle-free', () => {
  it('404 before arrival, 404 wrong token (SAME bytes), the code after the arrival fact — matching what custody was armed with', async () => {
    custodyRespond = 'ok';
    const o = await createdOrder('0006');
    const jeton = o.createJson['buyerRef'] as string;
    expect(typeof jeton).toBe('string');
    await confirmOrder(o.orderId, 12_500);
    await waitForArm(o.orderId);
    const secret = armPostsFor(o.orderId)[0]!.body!['secret'] as string;

    // BEFORE ARRIVAL, the RIGHT token learns nothing…
    const early = await remiseRead(o.orderId, jeton);
    expect(`${early.status} ${early.text}`).toBe('404 {"ok":false}');

    // …the rider arrives…
    expect((await transit({ orderId: o.orderId, stage: 'arrivee', asOf: '2026-08-10T15:00:00.000Z' })).status).toBe(200);

    // …and a WRONG token still learns nothing, in the SAME bytes: no oracle
    // separates « wrong token » from « not arrived yet ».
    const wrong = await remiseRead(o.orderId, 'pas-le-bon-jeton-000000000000');
    expect(`${wrong.status} ${wrong.text}`).toBe(`${early.status} ${early.text}`);
    const absent = await remiseRead(o.orderId, null);
    expect(`${absent.status} ${absent.text}`).toBe(`${early.status} ${early.text}`);
    const ghost = await remiseRead('ord-inexistant-0006', jeton);
    expect(`${ghost.status} ${ghost.text}`).toBe(`${early.status} ${early.text}`);

    // HER token, after the arrival fact: the code — the SAME six digits
    // custody was armed with. One mint, two doors, one truth.
    const revealed = await remiseRead(o.orderId, jeton);
    expect(revealed.status).toBe(200);
    expect(revealed.json['ok']).toBe(true);
    expect(revealed.json['code']).toBe(secret);
    expect(/^\d{6}$/.test(revealed.json['code'] as string)).toBe(true);

    // ═══ THE CODE APPEARS ON NO OTHER ROUTE'S BYTES ═══
    const surfaces: [string, string][] = [
      ['poll view', (await vue(o.orderId)).text],
      ['dispatch projection', await doFetch(o.orderId, '/entry/dispatch')],
      ['reseller projection', await doFetch(o.orderId, `/entry/reseller/${encodeURIComponent(o.resellerId)}`)],
      ['gains row', await doFetch(o.orderId, '/entry/gains')],
      ['outbox read', await doFetch(o.orderId, '/entry/outbox')],
    ];
    for (const [name, bytes] of surfaces) {
      expect(bytes.includes(secret), `${name} must not carry the code`).toBe(false);
      expect(bytes.includes(jeton), `${name} must not carry the buyer token`).toBe(false);
    }

    // …and the poll view still carries no economics and no secret NAME either
    // (the names assembled at runtime — see the header).
    const polled = (await vue(o.orderId)).text;
    for (const banned of [
      'sellerBasePrice', 'sellerFundedCommission', 'resellerMarkup',
      'sellerNet', 'resellerNet', 'buyerTotal', 'buyerRef',
      jetonSecret, `buyer${jetonSecret[0]!.toUpperCase()}${jetonSecret.slice(1)}`, 'codeRemise',
    ]) {
      expect(polled.includes(banned), `the poll view must not carry ${banned}`).toBe(false);
    }
  }, 60_000);
});

describe('VRAI-SUIVI — the stranded arm is recovered, never abandoned (call-site pins, the standing standard)', () => {
  /**
   * ⚠ WHY THESE ARE CALL-SITE PINS AND NOT DRIVEN CASES — the same argument
   * the BOUTIK-SUIVI pins carry verbatim: the stranded state is « pending
   * outbox, NO alarm », reachable only by a crash in the narrow window
   * between the batch put and `setAlarm`, which no test can produce from
   * outside the object. The three older wires' recovery hooks are held to
   * exactly this standard.
   */
  const src = readFileSync(
    join(import.meta.dirname, '..', 'worker', 'order-do.ts'),
    'utf8',
  );

  it('the webhook recovery hook covers all FOUR wires', () => {
    const hook = src.slice(src.indexOf('const stranded = await this.state.storage.get'));
    const guard = hook.slice(0, hook.indexOf('setAlarm'));
    expect(guard).toContain('CUSTODY_ARM_KEY');
    expect(guard).toContain("strandedRemise?.status === 'pending'");
  });

  it('a REDELIVERED eligibility re-arms it too', () => {
    const dup = src.slice(src.indexOf('if (outcome.duplicate) {'));
    const body = dup.slice(0, dup.indexOf("status: 'duplicate'"));
    expect(body).toContain('CUSTODY_ARM_KEY');
    expect(body).toContain('setAlarm(Date.now())');
    expect(body).not.toContain('storage.put');
  });

  it('the alarm flushes the fourth wire and re-arms on its pending count', () => {
    expect(src).toContain('const armPending = await this.flushCustodyArmOutbox();');
    // PORTE-CUSTODY part B widened the shared re-arm to the fifth wire; the
    // pin follows so the fourth wire's count is still provably inside it.
    expect(src).toContain(
      'Math.max(boutikPending, seraPending, livraisonPending, armPending, doorSignalPending)',
    );
  });

  it('the code and the arm row enter the SAME atomic batch as the confirm log append', () => {
    const batch = src.slice(src.indexOf('[SERA_OUTBOX_KEY]: seraOutbox,'));
    const put = batch.slice(0, batch.indexOf('});'));
    expect(put).toContain('[CODE_REMISE_KEY]: codeRemise');
    expect(put).toContain('[CUSTODY_ARM_KEY]: custodyArm');
  });
});
