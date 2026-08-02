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
  return orderOnShop(shop, n, contact);
}

/** A SECOND order on a shop that already exists — so a test can put two orders
 *  under the SAME reseller. `orderWith` mints one shop per `n`, which made the
 *  RF-1a "unpaid never reaches her" assertion vacuous: the unpaid order simply
 *  belonged to a different reseller and could not have appeared under any
 *  implementation (verifier, vacuous test #1). */
async function orderOnShop(
  shop: { slug: string; resellerId: string; pid: string },
  n: string,
  contact: unknown,
): Promise<{ orderId: string; quoteId: string; created: { status: number; text: string; json: Record<string, unknown> } }> {
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
    // A REAL code must EXIST while these are refused (verifier, vacuous #4):
    // on an empty store this matrix passed even with the hash lookup deleted,
    // because there was nothing to match against. Now there is.
    const live = await opsPost('/reseller/code', { resellerId: 'rs-door-live' });
    expect(live.json['ok']).toBe(true);
    expect((await ventes(live.json['code'] as string)).status).toBe(200);
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
    const shop = await seedShop('0011');
    const paid = await orderOnShop(shop, '0011', CONTACT);
    expect(paid.created.status, paid.created.text).toBe(200);
    // a SECOND order, left unpaid, on the SAME shop — so it is HER order and
    // its absence proves the confirm gate, not a mismatched reseller id
    // (verifier, vacuous #1).
    const unpaid = await orderOnShop(shop, '0012', CONTACT);
    expect(unpaid.created.status, unpaid.created.text).toBe(200);

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
    /**
     * HER NET, TO THE FRANC (verifier B1 — the first cut asserted only
     * `typeof === 'number'`, and swapping this field for the SUPPLIER'S BASE
     * PRICE left all 429 tests green). The fixture is B 10 000 · C 1 000 ·
     * M 1 500, so the reseller fee base is C+M = 2 500 and her net is
     * 0.8 × 2 500 = 2 000. Any other figure on this wire — gross 2 500, base
     * 10 000, subtotal 11 500 — now fails here.
     */
    expect(row['resellerNet']).toBe(2_000);
    expect(Object.keys(row).sort()).toEqual(
      ['createdAt', 'orderId', 'productVersionId', 'resellerNet', 'state', 'zoneTo'],
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
    /**
     * AND THE FORBIDDEN FRANCS AS VALUES (verifier B1, vacuous #3). Scanning
     * keys catches an ADDED field; it cannot catch a SUBSTITUTED one — the
     * supplier's base price riding under the key `resellerNet` passed the key
     * scan cleanly. These are the fixture's other figures: base 10 000,
     * commission 1 000, markup 1 500, her gross 2 500, subtotal 11 500.
     */
    for (const franc of [10_000, 1_000, 1_500, 2_500, 11_500]) {
      expect(res.text.includes(String(franc)), `a franc that is not her net rode her wire: ${franc}`).toBe(false);
    }
  });

  it('ANOTHER reseller’s code sees NOTHING of hers, end to end (the two locks are each proven separately below)', async () => {
    const other = await opsPost('/reseller/code', { resellerId: 'rs-someone-else' });
    const res = await ventes(other.json['code'] as string);
    expect(res.status).toBe(200);
    expect(res.json['ventes']).toEqual([]);
    // and the emptiness is SCOPING, not an empty store: hers is non-empty at
    // this very instant, read through her own code.
    const hers = await opsPost('/reseller/code', { resellerId: 'rs-disp-0011' });
    expect(((await ventes(hers.json['code'] as string)).json['ventes'] as unknown[]).length).toBe(1);
  });

  it('B3 — a feed the server could not fully read is DECLARED incomplete, never served as a short complete list', async () => {
    const ns = await mf.getDurableObjectNamespace('RESELLER');
    const feed = ns.get(ns.idFromName('reseller-feed'));
    // a row naming an order that was never created: its projection says
    // exists:false, so the router cannot read it
    await feed.fetch('https://do/register', {
      method: 'POST',
      body: JSON.stringify({ resellerId: 'rs-incomplet', orderId: 'ord-does-not-exist' }),
    });
    const code = (await opsPost('/reseller/code', { resellerId: 'rs-incomplet' })).json['code'] as string;
    const res = await ventes(code);
    expect(res.status).toBe(200);
    expect(res.json['ventes']).toEqual([]);
    expect(res.json['incomplet'], 'an unreadable row must be declared, not silently dropped').toBe(true);
  });

  it('B3 — a feed read in full says so: incomplet is false, so the flag means something', async () => {
    const code = (await opsPost('/reseller/code', { resellerId: 'rs-disp-0011' })).json['code'] as string;
    const res = await ventes(code);
    expect((res.json['ventes'] as unknown[]).length).toBe(1);
    expect(res.json['incomplet']).toBe(false);
  });

  it('B4 — the founder’s feed-code routes answer his CONSOLE: preflight and exact-origin stamp, never the buyer PWA’s origin', async () => {
    for (const [path, method] of [
      ['/reseller/code', 'POST'],
      ['/reseller/code/revoke', 'POST'],
      ['/reseller/codes', 'GET'],
    ] as const) {
      const pre = await mf.dispatchFetch(`http://c${path}`, { method: 'OPTIONS' });
      expect(pre.status, `${path} preflight`).toBe(204);
      expect(pre.headers.get('access-control-allow-origin')).toBe('https://boutik-plus-web.pages.dev');
      expect(pre.headers.get('access-control-allow-methods')).toBe(method);

      const answered = await mf.dispatchFetch(`http://c${path}`, {
        method,
        headers: { Authorization: `Bearer ${OPS_SECRET}` },
        ...(method === 'POST' ? { body: JSON.stringify({ resellerId: 'rs-cors-1' }) } : {}),
      });
      expect(answered.status, `${path} ${method}`).toBe(200);
      expect(answered.headers.get('access-control-allow-origin'), path).toBe('https://boutik-plus-web.pages.dev');
      expect(answered.headers.get('cache-control'), path).toBe('private, no-store');
    }
  });

  it('B4 — a wrong method on the ops routes is refused WITH the console stamp, never a 404 wearing the buyer PWA’s origin', async () => {
    const res = await mf.dispatchFetch('http://c/reseller/codes', { method: 'DELETE' });
    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://boutik-plus-web.pages.dev');
  });

  it('M8 — the inventory lists who holds a door, and NEVER the stored hash', async () => {
    await opsPost('/reseller/code', { resellerId: 'rs-inv-1' });
    const res = await mf.dispatchFetch('http://c/reseller/codes', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    const text = await res.text();
    expect(res.status).toBe(200);
    const codes = (safeJson(text)['codes'] as Record<string, unknown>[]).filter((c) => c['resellerId'] === 'rs-inv-1');
    expect(codes.length).toBe(1);
    expect(Object.keys(codes[0]!).sort()).toEqual(['mintedAt', 'resellerId']);
    expect(text.includes('hash')).toBe(false);
    // and it is HIS door only
    for (const bearer of [null, WRITE_SECRET, 'wrong']) {
      const refused = await mf.dispatchFetch('http://c/reseller/codes', {
        headers: bearer !== null ? { Authorization: `Bearer ${bearer}` } : {},
      });
      expect(refused.status, String(bearer)).toBe(401);
    }
  });

  it('M8 — her code opens NOTHING of the founder’s, and a non-GET on her feed is refused', async () => {
    const mine = (await opsPost('/reseller/code', { resellerId: 'rs-cross-1' })).json['code'] as string;
    for (const path of ['/reseller/code', '/reseller/code/revoke']) {
      const res = await mf.dispatchFetch(`http://c${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mine}` },
        body: JSON.stringify({ resellerId: 'rs-cross-1' }),
      });
      expect(res.status, path).toBe(401);
    }
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await mf.dispatchFetch('http://c/reseller/ventes', {
        method,
        headers: { Authorization: `Bearer ${mine}` },
      });
      expect(res.status, method).toBe(401);
    }
  });

  it('M1 — a colon in a reseller id cannot make one reseller’s code list another’s row', async () => {
    const ns = await mf.getDurableObjectNamespace('RESELLER');
    const feed = ns.get(ns.idFromName('reseller-feed'));
    await feed.fetch('https://do/register', {
      method: 'POST',
      body: JSON.stringify({ resellerId: 'rs-AAA', orderId: 'BBB:ord-secret' }),
    });
    const attacker = (await opsPost('/reseller/code', { resellerId: 'rs-AAA:BBB' })).json['code'] as string;
    const mineRes = await feed.fetch('https://do/mine', { method: 'POST', body: JSON.stringify({ code: attacker }) });
    const rows = ((await mineRes.json()) as { orders: { orderId: string }[] }).orders;
    expect(rows, 'a crafted id must not read another reseller’s index rows').toEqual([]);
  });

  it('M2 — an oversized reseller id is refused at mint, matching the /register cap', async () => {
    const res = await opsPost('/reseller/code', { resellerId: 'r'.repeat(200) });
    expect(res.status).toBe(400);
    expect(res.json['reason']).toBe('malformed');
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

  it('FIRST-WINS on /register: the same (reseller, order) never doubles her feed and never moves the row’s clock', async () => {
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

/**
 * RF-1a B2 — THE SELF-HEAL, PROVEN THE ONLY WAY IT CAN BE: two Workers over
 * ONE durable store. The first has NO `RESELLER` binding, so its confirmation
 * writes the order, the log and the outbox but cannot write her index row —
 * exactly the transient failure the swallowed registration is designed to
 * survive. The second has the binding and receives the provider's REDELIVERY.
 *
 * If registration lives only inside the first-confirmation branch, the row is
 * gone forever and this suite fails. That is the whole point: the original
 * code claimed a self-heal in a comment and did not have one.
 */
describe('RF-1a B2 — a row lost at confirmation time is repaired by the next webhook', () => {
  const persistB2 = mkdtempSync(join(tmpdir(), 'rf1a-b2-'));
  const commonBindings = {
    STOREFRONT_WRITE_SECRET: WRITE_SECRET,
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
    CHECKOUT_OPS_SECRET: OPS_SECRET,
  };
  const offerBinding = {
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
  };
  const build = (withFeed: boolean): Miniflare =>
    new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      durableObjects: {
        STOREFRONT: 'StorefrontDO',
        LISTING: 'ListingDO',
        CHECKOUT: 'CheckoutDO',
        ORDER: 'OrderDO',
        DISPATCH: 'DispatchIndexDO',
        ...(withFeed ? { RESELLER: 'ResellerFeedDO' } : {}),
      },
      durableObjectsPersist: persistB2,
      bindings: commonBindings,
      serviceBindings: offerBinding,
    });

  it('the row lost while the feed was unreachable comes back on the redelivery — and her net is right when it does', async () => {
    const N = 'b201';
    const blind = build(false);
    let orderId = '';
    let amount = 0;
    let webhookBody = '';
    try {
      // seed + order + confirm on the Worker that CANNOT write her index
      const created = await blind.dispatchFetch('http://c/storefronts', {
        method: 'POST',
        headers: authed,
        body: JSON.stringify({
          commandId: `cmd-create-${N}`, id: `sf-disp-${N}`, resellerId: `rs-disp-${N}`, shortCode: `DISP-0021`,
          name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général',
          correlationId: `corr-${N}`, at: T0,
        }),
      });
      expect(created.status).toBe(200);
      const pub = await blind.dispatchFetch('http://c/listings', {
        method: 'POST',
        headers: authed,
        body: JSON.stringify({
          commandId: `cmd-listing-${N}`, listingId: `lst-disp-${N}`, storefrontId: `sf-disp-${N}`,
          resellerId: `rs-disp-${N}`, productVersionId: 'pv-dispatch-1', offerVersion: 'ov-dispatch-1',
          markup: 1_500, correlationId: `corr-${N}`, at: T0,
        }),
      });
      expect(((await pub.json()) as { status?: string }).status).toBe('published');
      const quoteRes = await blind.dispatchFetch('http://c/checkout/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'disp-0021', pid: 'pv-dispatch-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
          attributionResellerId: `rs-disp-${N}`, requestKey: `rk-b2-0001-${'x'.repeat(10)}`,
        }),
      });
      const quoteId = ((await quoteRes.json()) as { quoteId: string }).quoteId;
      const held = await blind.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: `cmd-reserve-${N}`, holderRef: `holder-${N}` }),
      });
      expect(held.status).toBe(200);
      const orderRes = await blind.dispatchFetch('http://c/checkout/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId, holderRef: `holder-${N}`, commandId: `cmd-order-${N}`, contact: CONTACT }),
      });
      expect(orderRes.status).toBe(200);
      amount = ((await orderRes.json()) as { amountPaidAtCheckout: number }).amountPaidAtCheckout;
      orderId = `ord-${quoteId}`;

      const ns = await blind.getDurableObjectNamespace('ORDER');
      const audit = (await (await ns.get(ns.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as {
        attempts?: { attemptId: string }[];
      };
      const attemptId = audit.attempts![audit.attempts!.length - 1]!.attemptId;
      webhookBody = JSON.stringify(webhookEvent(orderId, amount, attemptId));
      const hook = await blind.dispatchFetch('http://c/checkout/webhook/payment', {
        method: 'POST', headers: signed, body: webhookBody,
      });
      expect(((await hook.json()) as { status?: string }).status).toBe('applied');
    } finally {
      await blind.dispose();
    }

    // Same store, a Worker that CAN write her index.
    const healed = build(true);
    try {
      const mint = await healed.dispatchFetch('http://c/reseller/code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resellerId: `rs-disp-${N}` }),
      });
      const code = ((await mint.json()) as { code: string }).code;
      const read = async (): Promise<Record<string, unknown>[]> => {
        const res = await healed.dispatchFetch('http://c/reseller/ventes', {
          headers: { Authorization: `Bearer ${code}` },
        });
        return ((await res.json()) as { ventes: Record<string, unknown>[] }).ventes;
      };

      // the sale is real and confirmed, but her row was never written
      expect(await read(), 'precondition: the row really was lost').toEqual([]);

      // the provider redelivers the SAME webhook — at-least-once, as designed
      const again = await healed.dispatchFetch('http://c/checkout/webhook/payment', {
        method: 'POST', headers: signed, body: webhookBody,
      });
      expect(((await again.json()) as { status?: string }).status).toBe('duplicate');

      const rows = await read();
      expect(rows.length, 'the redelivery must restore her lost sale').toBe(1);
      expect(rows[0]!['orderId']).toBe(orderId);
      expect(rows[0]!['state']).toBe('confirmed');
      expect(rows[0]!['resellerNet']).toBe(2_000);
    } finally {
      await healed.dispose();
      rmSync(persistB2, { recursive: true, force: true });
    }
  });
});
