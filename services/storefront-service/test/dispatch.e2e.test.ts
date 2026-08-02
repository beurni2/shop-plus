import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockPaymentProvider } from '@shop-plus/commerce-core';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * BC-1a — THE BUYER'S DISPATCH CONTACT, END TO END on real workerd (founder-
 * approved proposal, 2026-08-02): the buyer gives phone + quartier + repère at
 * order creation; the FOUNDER — and only a caller holding CHECKOUT_OPS_SECRET
 * (« value C ») — reads it back on `GET /checkout/dispatch`.
 *
 * THE PROPERTY ABOVE ALL OTHERS: the contact NEVER appears on the public
 * order view. `GET /checkout/order/:id` is reachable by anyone holding the
 * order link; a phone number there would leak with every screenshot. The
 * suite asserts absence on the RAW RESPONSE BYTES, not on parsed fields.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'dispatch-'));
const T0 = '2026-08-02T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-d001';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-d001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-d001';
const OPS_SECRET = 'test-checkout-ops-secret-d001';
const authed = { 'X-Write-Key': WRITE_SECRET };
const signed = { 'X-Payment-Webhook-Key': WEBHOOK_SECRET, 'Content-Type': 'application/json' };

const CONTACT = { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'Face à la pharmacie' };

const SUPPLY = [
  {
    productVersionId: 'pv-dispatch-1',
    offerVersion: 'ov-dispatch-1',
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
    DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    STOREFRONT_WRITE_SECRET: WRITE_SECRET,
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
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
        const pid = decodeURIComponent(single[1]!);
        const value = SUPPLY.find((v) => v.productVersionId === pid);
        if (value === undefined) {
          return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
        }
        return Response.json({ version: 1, asOf: new Date().toISOString(), value });
      }
      return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
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

let keyN = 0;
const freshKey = (): string => `rk-dispatch-${String((keyN += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

async function seedShop(n: string): Promise<{ slug: string; resellerId: string; pid: string }> {
  const shortCode = `DISP-${n}`;
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-disp-${n}`, resellerId: `rs-disp-${n}`, shortCode,
      name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général',
      correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`seed: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-disp-${n}`, storefrontId: `sf-disp-${n}`,
      resellerId: `rs-disp-${n}`, productVersionId: 'pv-dispatch-1', offerVersion: 'ov-dispatch-1',
      markup: 1_500, correlationId: `corr-${n}`, at: T0,
    }),
  });
  const decision = (await pub.json()) as { status?: string };
  if (decision.status !== 'published') throw new Error(`seed: listing ${JSON.stringify(decision)}`);
  return { slug: shortCode.toLowerCase(), resellerId: `rs-disp-${n}`, pid: 'pv-dispatch-1' };
}

/** shop → quote → hold → order (with or without contact), the whole buyer path. */
async function orderWith(n: string, contact: unknown): Promise<{ orderId: string; quoteId: string; created: { status: number; text: string; json: Record<string, unknown> } }> {
  const shop = await seedShop(n);
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: shop.slug, pid: shop.pid, paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: shop.resellerId, requestKey: freshKey(),
    }),
  });
  const quoteText = await quoteRes.text();
  const quote = safeJson(quoteText) as { quoteId?: string };
  if (quoteRes.status !== 200 || typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status} ${quoteText}`);
  const held = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
  });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const res = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`,
      ...(contact !== undefined ? { contact } : {}),
    }),
  });
  const text = await res.text();
  return { orderId: `ord-${quote.quoteId}`, quoteId: quote.quoteId, created: { status: res.status, text, json: safeJson(text) } };
}

async function dispatchRead(bearer: string | null = OPS_SECRET) {
  const res = await mf.dispatchFetch('http://c/checkout/dispatch', {
    headers: bearer !== null ? { Authorization: `Bearer ${bearer}` } : {},
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text), headers: res.headers };
}

function webhookEvent(orderId: string, amount: number, attemptId: string): unknown {
  const provider = new MockPaymentProvider({});
  provider.initiateCharge({ orderId, paymentAttemptId: attemptId, amount, correlationId: `corr-${orderId}`, requestedAtIso: T0 });
  return provider.webhookDeliveryPlan()[0]!.event;
}

describe('BC-1a — the contact travels to exactly one reader', () => {
  it('the whole road: order WITH contact → the founder reads it (with state and zone) → NEVER on the public order view', async () => {
    const { orderId, created } = await orderWith('0001', CONTACT);
    expect(created.status, created.text).toBe(200);
    // the create answer itself never echoes the contact — the buyer's screen
    // shows what she typed from local state
    expect(created.text.includes(CONTACT.phone)).toBe(false);

    const read = await dispatchRead();
    expect(read.status, read.text).toBe(200);
    const rows = read.json['orders'] as Record<string, unknown>[];
    const row = rows.find((r) => r['orderId'] === orderId);
    if (row === undefined) throw new Error(`no dispatch row for ${orderId} in ${read.text}`);
    expect(row['contact']).toEqual(CONTACT);
    expect(row['state']).toBe('payment_pending');
    expect(row['zoneTo']).toBe('Ouagadougou');
    expect(row['productVersionId']).toBe('pv-dispatch-1');
    // the projection is an allowlist: no quote bytes, no attempts, no amounts
    expect(Object.keys(row).sort()).toEqual(['contact', 'createdAt', 'exists', 'ok', 'orderId', 'productVersionId', 'state', 'zoneTo']);

    // THE PROPERTY: the public order view — raw bytes — carries no contact.
    const pub = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
    const pubText = await pub.text();
    expect(pub.status).toBe(200);
    for (const secret of [CONTACT.phone, CONTACT.quartier, CONTACT.repere, 'contact']) {
      expect(pubText.includes(secret), `public view leaked: ${secret}`).toBe(false);
    }
  });

  it('the door matrix: no key, the write key, the webhook secret, and a wrong value all answer ONE 401', async () => {
    for (const bearer of [null, WRITE_SECRET, WEBHOOK_SECRET, FULFILL_SECRET, 'wrong']) {
      const res = await dispatchRead(bearer);
      expect(res.status, String(bearer)).toBe(401);
      expect(res.text).toBe('{"error":"unauthorized"}');
    }
  });

  it('FAIL CLOSED: a Worker deployed before `wrangler secret put CHECKOUT_OPS_SECRET` refuses EVERYONE — including the caller who sends nothing (verifier MAJOR-1)', async () => {
    // The verifier's finding, verbatim in spirit: the old title claimed this
    // world and no test built it — and deleting the `secret.length > 0`
    // guard in rejectUnauthorizedOpsRead left every suite green while an
    // unconfigured deploy served buyer phone numbers to any caller sending
    // NO Authorization header (empty presented vs empty secret: HMACs match).
    // This world has NO CHECKOUT_OPS_SECRET binding at all — what a real
    // deploy looks like before the founder acts.
    const bare = mkdtempSync(join(tmpdir(), 'dispatch-nosecret-'));
    const mfBare = new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      durableObjects: {
        STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
        ORDER: 'OrderDO', DISPATCH: 'DispatchIndexDO',
      },
      durableObjectsPersist: bare,
      bindings: {
        STOREFRONT_WRITE_SECRET: WRITE_SECRET,
        PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
        FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
        // deliberately NO CHECKOUT_OPS_SECRET
      },
    });
    try {
      for (const headers of [
        {},                                       // the dangerous case: nothing at all
        { Authorization: 'Bearer ' },             // an empty bearer
        { Authorization: `Bearer ${OPS_SECRET}` } // even the "right" value opens nothing
      ] as const) {
        const res = await mfBare.dispatchFetch('http://c/checkout/dispatch', { headers });
        expect(res.status, JSON.stringify(headers)).toBe(401);
        expect(await res.text()).toBe('{"error":"unauthorized"}');
      }
    } finally {
      await mfBare.dispose();
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('a confirmed order shows its TRUE state on the dispatch row — the webhook moved it, nothing else can', async () => {
    const { orderId, created } = await orderWith('0002', CONTACT);
    expect(created.status, created.text).toBe(200);
    const amount = created.json['amountPaidAtCheckout'] as number;
    const attempts = created.json['paymentAttemptId'];
    // the attempt id rides the create answer? — if not, read it from the audit
    let attemptId = typeof attempts === 'string' ? attempts : undefined;
    if (attemptId === undefined) {
      const ns = await mf.getDurableObjectNamespace('ORDER');
      const audit = (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
        attempts?: { attemptId: string }[];
      };
      attemptId = audit.attempts?.[audit.attempts.length - 1]?.attemptId;
    }
    if (attemptId === undefined) throw new Error('no attempt id');
    const hook = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
      method: 'POST',
      headers: signed,
      body: JSON.stringify(webhookEvent(orderId, amount, attemptId)),
    });
    expect(hook.status, await hook.clone().text()).toBe(200);

    const read = await dispatchRead();
    const row = (read.json['orders'] as Record<string, unknown>[]).find((r) => r['orderId'] === orderId);
    expect(row?.['state']).toBe('confirmed');
    expect(row?.['contact']).toEqual(CONTACT);
  });

  it('an order WITHOUT contact is an honest null on the dispatch row — never invented, never dropped', async () => {
    const { orderId, created } = await orderWith('0003', undefined);
    expect(created.status, created.text).toBe(200);
    const read = await dispatchRead();
    const row = (read.json['orders'] as Record<string, unknown>[]).find((r) => r['orderId'] === orderId);
    expect(row).toBeDefined();
    expect(row?.['contact']).toBeNull();
  });

  it('a malformed contact REFUSES the create with the field named, BEFORE any object is touched — a smuggled key, a missing phone, an overlong repère never half-store', async () => {
    for (const bad of [
      { ...CONTACT, note: 'smuggled' },
      { phone: '', quartier: 'Gounghin', repere: '' },
      { phone: '70 12 34 56', quartier: '', repere: '' },
      { phone: '70 12 34 56', quartier: 'Gounghin' },
      { phone: '70 12 34 56', quartier: 'Gounghin', repere: 'x'.repeat(201) },
      { phone: 'x'.repeat(33), quartier: 'Gounghin', repere: '' },
      'just a string',
      42,
    ]) {
      // the refusal precedes the vault read, so no quote needs to exist —
      // which is itself the property: a bad contact never reaches an object
      const res = await mf.dispatchFetch('http://c/checkout/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: 'q-never', holderRef: 'h', commandId: 'cmd-x', contact: bad }),
      });
      const json = safeJson(await res.text());
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(json['field'], JSON.stringify(bad)).toBe('contact');
    }
  });

  it('the dispatch answer is CORS-stamped for the CONSOLE origin exactly — never *', async () => {
    const read = await dispatchRead();
    expect(read.headers.get('Access-Control-Allow-Origin')).toBe('https://boutik-plus-web.pages.dev');
    const preflight = await mf.dispatchFetch('http://c/checkout/dispatch', { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://boutik-plus-web.pages.dev');
  });
});

/* ═══════════ RF-1a — THE RESELLER'S FEED: her sales, her net, her door ═══════════ */

describe('RF-1a — a reseller reads HER OWN confirmed sales, and only hers', () => {
  async function opsPost(path: string, body: unknown, bearer: string | null = OPS_SECRET) {
    const res = await mf.dispatchFetch(`http://c${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer !== null ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: safeJson(text) };
  }

  async function ventes(code: string | null) {
    const res = await mf.dispatchFetch('http://c/reseller/ventes', {
      headers: code !== null ? { Authorization: `Bearer ${code}` } : {},
    });
    const text = await res.text();
    return { status: res.status, text, json: safeJson(text), headers: res.headers };
  }

  /** Confirm an order through the REAL signed webhook — the only thing that
   *  can make a sale true, here as everywhere. */
  async function confirmOrder(orderId: string, amount: number): Promise<void> {
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const audit = (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
      attempts?: { attemptId: string }[];
    };
    const attemptId = audit.attempts?.[audit.attempts.length - 1]?.attemptId;
    if (attemptId === undefined) throw new Error('no attempt id');
    const hook = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
      method: 'POST',
      headers: signed,
      body: JSON.stringify(webhookEvent(orderId, amount, attemptId)),
    });
    if (hook.status !== 200) throw new Error(`webhook ${hook.status} ${await hook.text()}`);
  }

  it('the door matrix: no code, a wrong code, the write key, the webhook secret and the FOUNDER’S OWN ops key all answer ONE 401 — a shared credential opens nothing here', async () => {
    for (const bearer of [null, 'wrong', WRITE_SECRET, WEBHOOK_SECRET, OPS_SECRET]) {
      const res = await ventes(bearer);
      expect(res.status, String(bearer)).toBe(401);
      expect(res.text).toBe('{"error":"unauthorized"}');
    }
  });

  it('minting is the FOUNDER’S act — his ops key mints, everyone else is refused, and a smuggled field is malformed', async () => {
    for (const bearer of [null, WRITE_SECRET, 'wrong']) {
      const res = await opsPost('/reseller/code', { resellerId: 'rs-disp-0001' }, bearer);
      expect(res.status, String(bearer)).toBe(401);
    }
    const smuggled = await opsPost('/reseller/code', { resellerId: 'rs-x', note: 'smuggled' });
    expect(smuggled.status).toBe(400);
    expect(smuggled.json['reason']).toBe('malformed');
  });

  it('THE WHOLE ROAD: a confirmed sale reaches her feed with her NET — and an unpaid one never does', async () => {
    // her shop, her order, paid
    const paid = await orderWith('0011', CONTACT);
    expect(paid.created.status, paid.created.text).toBe(200);
    // a SECOND order left unpaid — an unpaid order is not a sale
    const unpaid = await orderWith('0012', CONTACT);
    expect(unpaid.created.status).toBe(200);

    const mint = await opsPost('/reseller/code', { resellerId: 'rs-disp-0011' });
    expect(mint.json['ok']).toBe(true);
    const code = mint.json['code'] as string;
    expect(code.startsWith('SP-')).toBe(true);

    // before the webhook: nothing is a sale yet
    const before = await ventes(code);
    expect(before.status).toBe(200);
    expect(before.json['ventes']).toEqual([]);

    await confirmOrder(paid.orderId, paid.created.json['amountPaidAtCheckout'] as number);

    const after = await ventes(code);
    const rows = after.json['ventes'] as Record<string, unknown>[];
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row['orderId']).toBe(paid.orderId);
    expect(row['state']).toBe('confirmed');
    // HER NET is present and is a franc integer; the ALLOWLIST is the shape
    expect(typeof row['resellerNet']).toBe('number');
    expect(Object.keys(row).sort()).toEqual(
      ['createdAt', 'exists', 'ok', 'orderId', 'productVersionId', 'resellerNet', 'state', 'zoneTo'],
    );
    // the unpaid order is absent — a sale is a CONFIRMED sale
    expect(rows.some((r) => r['orderId'] === unpaid.orderId)).toBe(false);
  });

  it('THE ECONOMICS BOUNDARY on raw bytes: no base price, no commission, no gross, no buyer contact ever rides her wire', async () => {
    const mint = await opsPost('/reseller/code', { resellerId: 'rs-disp-0011' });
    const res = await ventes(mint.json['code'] as string);
    // NEVER scan an empty feed for leaks — that proves nothing. This is the
    // reseller whose confirmed sale the previous test put on the wire.
    expect((res.json['ventes'] as unknown[]).length).toBe(1);
    // FIELD NAMES are matched in their JSON key form — `"sellerNet"` with its
    // quotes — because a bare substring scan cannot tell `sellerNet` from the
    // legitimate `resellerNet` that ends the same way. A leaked field is always
    // a quoted key, so the anchored form still catches every real one.
    for (const banned of [
      'sellerBasePrice', 'sellerFundedCommission', 'sellerNet', 'sellerPlatformFee',
      'resellerGrossEarnings', 'platformProductFeeRevenue', 'markup', 'buyerTotal',
      'contact', 'phone', 'quartier', 'repere',
    ]) {
      expect(res.text.includes(`"${banned}"`), `her feed leaked: ${banned}`).toBe(false);
    }
    // RAW VALUES are matched bare — the buyer's actual number must not appear
    // anywhere in her bytes, under any key or none.
    for (const secret of [CONTACT.phone, CONTACT.quartier, CONTACT.repere]) {
      expect(res.text.includes(secret), `her feed leaked a buyer value`).toBe(false);
    }
  });

  it('ANOTHER reseller’s code sees NOTHING of hers — the index scopes it and the order re-checks its own attribution', async () => {
    const other = await opsPost('/reseller/code', { resellerId: 'rs-someone-else' });
    const res = await ventes(other.json['code'] as string);
    expect(res.status).toBe(200);
    expect(res.json['ventes']).toEqual([]);
    // and the emptiness is SCOPING, not an empty store: hers is non-empty at
    // this very instant, read through her own code.
    const hers = await opsPost('/reseller/code', { resellerId: 'rs-disp-0011' });
    expect(((await ventes(hers.json['code'] as string)).json['ventes'] as unknown[]).length).toBe(1);
  });

  it('THE FIRST LOCK, proven directly on the index: `/mine` hands back HER rows and no one else’s — proven at its own level, because the order’s re-check would otherwise hide a broken index', async () => {
    const ns = await mf.getDurableObjectNamespace('RESELLER');
    const feed = ns.get(ns.idFromName('reseller-feed'));
    const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
      const res = await feed.fetch(`https://do${path}`, { method: 'POST', body: JSON.stringify(body) });
      return (await res.json()) as Record<string, unknown>;
    };
    await post('/register', { resellerId: 'rs-lock-a', orderId: 'ord-lock-a1' });
    await post('/register', { resellerId: 'rs-lock-a', orderId: 'ord-lock-a2' });
    await post('/register', { resellerId: 'rs-lock-b', orderId: 'ord-lock-b1' });

    const codeA = (await post('/code/mint', { resellerId: 'rs-lock-a' }))['code'] as string;
    const listA = await post('/mine', { code: codeA });
    expect(listA['resellerId']).toBe('rs-lock-a');
    const idsA = (listA['orders'] as { orderId: string }[]).map((o) => o.orderId).sort();
    expect(idsA).toEqual(['ord-lock-a1', 'ord-lock-a2']);

    const codeB = (await post('/code/mint', { resellerId: 'rs-lock-b' }))['code'] as string;
    const idsB = ((await post('/mine', { code: codeB }))['orders'] as { orderId: string }[]).map((o) => o.orderId);
    expect(idsB).toEqual(['ord-lock-b1']);
  });

  it('FIRST-WINS on a redelivered confirmation: the same (reseller, order) never doubles her feed and never moves the row’s clock', async () => {
    const ns = await mf.getDurableObjectNamespace('RESELLER');
    const feed = ns.get(ns.idFromName('reseller-feed'));
    const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
      const res = await feed.fetch(`https://do${path}`, { method: 'POST', body: JSON.stringify(body) });
      return (await res.json()) as Record<string, unknown>;
    };
    const first = await post('/register', { resellerId: 'rs-dup-1', orderId: 'ord-dup-1' });
    expect(first['status']).toBe('registered');
    const code = (await post('/code/mint', { resellerId: 'rs-dup-1' }))['code'] as string;
    const at1 = ((await post('/mine', { code }))['orders'] as { at: string }[])[0]!.at;

    const again = await post('/register', { resellerId: 'rs-dup-1', orderId: 'ord-dup-1' });
    expect(again['status']).toBe('already_registered');
    const rows = (await post('/mine', { code }))['orders'] as { at: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0]!.at).toBe(at1); // the clock did not move
  });

  it('THE SECOND LOCK, proven directly on the order: even asked point-blank for a reseller it does not belong to, the order refuses — the index scoping is not the only thing standing there', async () => {
    const mine = await orderWith('0013', CONTACT);
    expect(mine.created.status).toBe(200);
    const ns = await mf.getDurableObjectNamespace('ORDER');
    const stub = ns.get(ns.idFromName(mine.orderId));

    const stranger = await stub.fetch('https://do/entry/reseller/rs-someone-else');
    expect(stranger.status).toBe(404);
    expect(((await stranger.json()) as { reason?: string }).reason).toBe('not_yours');

    // and the same door opens for the reseller it IS attributed to
    const owner = await stub.fetch('https://do/entry/reseller/rs-disp-0013');
    expect(owner.status).toBe(200);
    expect(((await owner.json()) as { orderId?: string }).orderId).toBe(mine.orderId);
  });

  it('RE-MINTING replaces: the old code dies at that instant (which is also how the founder cuts a feed off)', async () => {
    const first = await opsPost('/reseller/code', { resellerId: 'rs-rotate-1' });
    const firstCode = first.json['code'] as string;
    expect((await ventes(firstCode)).status).toBe(200);
    const second = await opsPost('/reseller/code', { resellerId: 'rs-rotate-1' });
    expect(second.json['code']).not.toBe(firstCode);
    expect((await ventes(firstCode)).status).toBe(401); // the old door is shut
    expect((await ventes(second.json['code'] as string)).status).toBe(200);
    const revoke = await opsPost('/reseller/code/revoke', { resellerId: 'rs-rotate-1' });
    expect(revoke.json['status']).toBe('revoked');
    expect((await ventes(second.json['code'] as string)).status).toBe(401);
  });
});
