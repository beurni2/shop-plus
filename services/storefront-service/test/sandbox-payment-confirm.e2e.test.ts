import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * ═══ SANDBOX-PAY-1 — the founder's tool, run EXACTLY as the workflow runs it ═══
 *
 * REQUIRED BY THE NO-LOOP LAW: « a slice that crosses a seam is not done until
 * ONE test crosses that seam end to end. » The seam here is the founder's
 * dispatch: `node scripts/sandbox-payment-confirm.mjs` with three env vars,
 * against the deployed Worker. So this suite does not import a composition
 * function and call it politely — it SPAWNS THE SCRIPT AS A CHILD PROCESS
 * against the REAL combined Worker listening on a REAL port, and believes only
 * (a) the child's exit code and (b) what the Worker's own order view says
 * afterwards. If the script's hand-mirrored event shape ever drifts from what
 * the vault accepts, this fails in CI instead of failing the founder mid-demo.
 *
 * The walk is the buyer's own: storefront → listing → quote → reserve → order —
 * the same routes the deployed PWA calls — then the script plays the provider.
 */

const execFileAsync = promisify(execFile);
const SCRIPT = 'dist/worker/worker.mjs';
const CONFIRM_SCRIPT = resolve(import.meta.dirname, '../../../scripts/sandbox-payment-confirm.mjs');
const persist = mkdtempSync(join(tmpdir(), 'sandbox-pay-'));
const T0 = '2026-08-08T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-sp001';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-sp001';
const OPS_SECRET = 'test-checkout-ops-secret-sp001';
const PROGRESS_SECRET = 'test-progress-write-secret-sp001';
const authed = { 'X-Write-Key': WRITE_SECRET };

const SUPPLY = [
  {
    productVersionId: 'pv-sandbox-1',
    offerVersion: 'ov-sandbox-1',
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
  // A REAL LISTENING PORT (0 = ephemeral): the child process reaches the
  // Worker over HTTP exactly as the workflow reaches workers.dev.
  port: 0,
  durableObjects: {
    STOREFRONT: 'StorefrontDO',
    LISTING: 'ListingDO',
    CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO',
    LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    STOREFRONT_WRITE_SECRET: WRITE_SECRET,
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CHECKOUT_OPS_SECRET: OPS_SECRET,
    PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
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
const freshKey = (): string => `rk-sandbox-${String((keyN += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

/** The buyer's own road: storefront → listing → quote → reserve → order. */
async function realOrder(n: string): Promise<{ orderId: string }> {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-sand-${n}`, resellerId: `rs-sand-${n}`,
      shortCode: `SAND-${n}`, name: 'Boutique du fondateur', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-sand-${n}`, storefrontId: `sf-sand-${n}`,
      resellerId: `rs-sand-${n}`, productVersionId: 'pv-sandbox-1', offerVersion: 'ov-sandbox-1',
      markup: 1_500, correlationId: `corr-${n}`, at: T0,
    }),
  });
  const decision = (await pub.json()) as { status?: string };
  if (decision.status !== 'published') throw new Error(`setup: listing ${JSON.stringify(decision)}`);

  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `sand-${n}`, pid: 'pv-sandbox-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: `rs-sand-${n}`, requestKey: freshKey(),
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
  if (quoteRes.status !== 200 || typeof quote.quoteId !== 'string') {
    throw new Error(`setup: quote ${quoteRes.status}`);
  }
  const held = await mf.dispatchFetch(
    `http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
    },
  );
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const res = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}` }),
  });
  if (res.status !== 200) throw new Error(`setup: order ${res.status} ${await res.text()}`);
  return { orderId: `ord-${quote.quoteId}` };
}

async function publicState(orderId: string): Promise<{ state: string; body: Record<string, unknown> }> {
  const res = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
  const body = safeJson(await res.text());
  return { state: String(body['state'] ?? `http-${res.status}`), body };
}

/** The founder's dispatch, verbatim: the script, three env vars, an exit code. */
async function runScript(
  orderId: string,
  secret: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const base = String(await mf.ready);
  try {
    const out = await execFileAsync(process.execPath, [CONFIRM_SCRIPT], {
      env: { ...process.env, STOREFRONT_BASE: base, ORDER_ID: orderId, PAYMENT_WEBHOOK_SECRET: secret },
    });
    return { code: 0, stdout: out.stdout, stderr: out.stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('SANDBOX-PAY-1 — the founder plays the provider against the real Worker', () => {
  it('a wrong secret is refused at the door, and the order does not move', async () => {
    const { orderId } = await realOrder('0001');
    expect((await publicState(orderId)).state).toBe('payment_pending');

    const run = await runScript(orderId, 'not-the-webhook-secret');
    expect(run.code, run.stdout + run.stderr).not.toBe(0);
    expect(run.stderr).toContain('401');
    expect((await publicState(orderId)).state, 'a refused webhook must move nothing').toBe(
      'payment_pending',
    );
  }, 60_000);

  it('the whole road: buyer orders → the script confirms → the vault agrees, franc-exact', async () => {
    const { orderId } = await realOrder('0002');
    const before = await publicState(orderId);
    expect(before.state).toBe('payment_pending');
    // FULL_PREPAY on B=10 000 + M=1 500 (+ delivery per zone): whatever the
    // immutable Quote says is what the script must echo — read, not computed.
    const amount = Number(before.body['amountPaidAtCheckout']);
    expect(amount).toBeGreaterThan(0);

    const run = await runScript(orderId, WEBHOOK_SECRET);
    expect(run.code, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain('CONFIRMED');

    // The Worker's own word — never the script's.
    const after = await publicState(orderId);
    expect(after.state).toBe('confirmed');
    expect(Number(after.body['amountPaidAtCheckout']), 'the paid figure is the quoted figure').toBe(
      amount,
    );

    // ⚠ AND THE FOUNDER'S OWN READ SEES IT — the console's Livraisons zone
    // reads GET /checkout/dispatch under key C; this is the row he watches.
    const read = await mf.dispatchFetch('http://c/checkout/dispatch', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    expect(read.status).toBe(200);
    const rows = (safeJson(await read.text())['orders'] ?? []) as Record<string, unknown>[];
    const row = rows.find((r) => r['orderId'] === orderId);
    expect(row, 'the dispatch board must carry the order').toBeDefined();
    expect(row?.['state']).toBe('confirmed');
  }, 60_000);

  it('a second dispatch is a no-op that says so — a double-tap cannot double-confirm', async () => {
    const { orderId } = await realOrder('0003');
    expect((await runScript(orderId, WEBHOOK_SECRET)).code).toBe(0);

    const again = await runScript(orderId, WEBHOOK_SECRET);
    expect(again.code, again.stdout + again.stderr).toBe(0);
    expect(again.stdout).toContain('ALREADY CONFIRMED');
    expect((await publicState(orderId)).state).toBe('confirmed');
  }, 60_000);

  it('a typo’d order id fails BY NAME, and nothing is sent', async () => {
    const run = await runScript('ord-does-not-exist', WEBHOOK_SECRET);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('NO SUCH ORDER');
  }, 60_000);
});

describe('RB-3 — the gains read serves the FROZEN waterfall, franc-exact, founder-only', () => {
  it('a confirmed order’s split reconciles on the served bytes; unconfirmed and wrong keys get nothing', async () => {
    const { orderId } = await realOrder('0010');

    // ── BEFORE confirmation: no gains to explain — the row must be absent ──
    const gate = await mf.dispatchFetch('http://c/checkout/gains', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    expect(gate.status).toBe(200);
    const before = (safeJson(await gate.text())['gains'] ?? []) as { orderId?: string }[];
    expect(before.some((g) => g.orderId === orderId)).toBe(false);

    // ── confirm through the founder's own tool (the real webhook road) ─────
    expect((await runScript(orderId, WEBHOOK_SECRET)).code).toBe(0);

    const read = await mf.dispatchFetch('http://c/checkout/gains', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    expect(read.status).toBe(200);
    const rows = (safeJson(await read.text())['gains'] ?? []) as Record<string, unknown>[];
    const row = rows.find((g) => g['orderId'] === orderId);
    expect(row, 'the confirmed order must carry a gains row').toBeDefined();
    const s = row!['split'] as Record<string, number>;

    // ═══ TEN LAWS #1 ON THE SERVED BYTES — to the franc, not to the idea ═══
    // The listing: B=10 000 · C=1 000 · M=1 500; the quote's own delivery fee
    // rides in s.deliveryFee. Every identity checked on what the FOUNDER will
    // actually read:
    expect(s['sellerBasePrice']).toBe(10_000);
    expect(s['sellerFundedCommission']).toBe(1_000);
    expect(s['resellerMarkup']).toBe(1_500);
    expect(s['productSubtotal'], 'productSubtotal = B + M').toBe(11_500);
    expect(s['buyerTotal'], 'buyerTotal = B + M + D').toBe(11_500 + s['deliveryFee']!);
    expect(s['sellerPlatformFee'], 'seller fee = 5% · B').toBe(500);
    expect(s['sellerNet'], 'seller net = B − C − fee (the commission is SELLER-funded)').toBe(8_500);
    expect(s['resellerPlatformFee'], 'reseller fee = 20% · (C + M)').toBe(500);
    expect(s['resellerNet'], 'reseller net = (C + M) − fee').toBe(2_000);

    // ── the door: founder key only, one uniform refusal ────────────────────
    expect(
      (await mf.dispatchFetch('http://c/checkout/gains', { headers: { Authorization: 'Bearer wrong' } }))
        .status,
    ).toBe(401);
    expect((await mf.dispatchFetch('http://c/checkout/gains')).status).toBe(401);

    // ── and the PUBLIC order view still leaks none of it (SP-I03) ──────────
    const pub = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
    const pubText = await pub.text();
    for (const secret of ['sellerNet', 'resellerNet', 'sellerPlatformFee', 'sellerBasePrice']) {
      expect(pubText, `${secret} on the buyer view`).not.toContain(secret);
    }
  }, 60_000);
});

/**
 * ═══ SE-LIVE-5b — SÉRA'S VALIDATED SIGNAL BECOMES SETTLEMENT RECORDS ═══
 *
 * The event below is byte-shaped as the CUSTODY SPINE emits it
 * (sera `custody-spine.ts`, `confirmDropAndEmitEligibility`): name
 * `delivery.validated.v1`, envelope correlation `corr-{orderId}` (the
 * order's own, minted at creation — order-do.ts), actor
 * `custody-service:e1`, payload {order_id, task_id, validation_id,
 * result, settlement_eligibility} + the 5b `supplier_ref` the signal
 * carries because the storefront domain never learns a supplier. Any
 * drift in the sera emitter must be mirrored here BY HAND, eyes open.
 */
describe('SE-LIVE-5b — the delivered order settles, copied from the frozen quote', () => {
  const validatedEvent = (orderId: string, over: Record<string, unknown> = {}) => ({
    name: 'delivery.validated.v1',
    envelope: {
      command_id: `eligibility-${orderId}`,
      correlation_id: `corr-${orderId}`,
      aggregateVersion: 9,
      actor: 'custody-service:e1',
      serverTime: new Date().toISOString(),
      version: '1',
      ...(typeof over['correlation_id'] === 'string' ? { correlation_id: over['correlation_id'] } : {}),
    },
    payload: {
      order_id: orderId,
      task_id: `task-${orderId}`,
      validation_id: `val-${orderId}`,
      result: 'validated',
      settlement_eligibility: true,
      supplier_ref: 'supplier-sp001',
    },
  });

  const progress = (event: unknown, secret: string) =>
    mf.dispatchFetch('http://c/fulfillment/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(event),
    });

  it('confirm → validated signal → exactly two Eligible obligations, franc-exact, once — and the buyer view leaks none of it', async () => {
    const { orderId } = await realOrder('0011');
    expect((await runScript(orderId, WEBHOOK_SECRET)).code).toBe(0);

    const res = await progress(validatedEvent(orderId), PROGRESS_SECRET);
    const body = (safeJson(await res.text())) as { ok?: boolean; status?: string; obligations?: number };
    expect(res.status, 'the signal must be recorded').toBe(200);
    expect(body.status).toBe('recorded');
    expect(body.obligations, 'exactly two obligations — supplier and reseller').toBe(2);

    // ── the founder's gains row now says LIVRÉE, with the records ─────────
    const gains = await mf.dispatchFetch('http://c/checkout/gains', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    const g = (safeJson(await gains.text())) as { gains?: Record<string, unknown>[] };
    const row = g.gains?.find((r) => r['orderId'] === orderId);
    expect(row, 'the delivered order still stands in the gains read').toBeDefined();
    expect(row!['livree'], 'the delivered truth').toBe(true);
    const obligations = row!['obligations'] as { party: string; amount: number; state: string }[];
    expect(obligations).toHaveLength(2);
    const supplier = obligations.find((o) => o.party.startsWith('supplier:'))!;
    const reseller = obligations.find((o) => o.party.startsWith('reseller:'))!;
    // COPIED from the frozen quote, to the franc (§5.6, B+I-05) — and the
    // supplier identity is the one the SIGNAL carried.
    expect(supplier.party).toBe('supplier:supplier-sp001');
    expect(supplier.amount, 'supplier obligation = sellerNet (B − C − fee)').toBe(8_500);
    expect(supplier.state).toBe('Eligible');
    expect(reseller.amount, 'reseller obligation = resellerNet').toBe(2_000);
    expect(reseller.state).toBe('Eligible');
    // §5.4 reconciliation on the SERVED bytes: obligations + both platform
    // fees meet the stored subtotal exactly.
    const split = row!['split'] as Record<string, number>;
    expect(
      supplier.amount + reseller.amount + split['sellerPlatformFee']! + split['resellerPlatformFee']!,
      'obligations + fees == productSubtotal, to the franc',
    ).toBe(split['productSubtotal']);

    // ── redelivery absorbs: at-least-once, ONE fold ───────────────────────
    const again = await progress(validatedEvent(orderId), PROGRESS_SECRET);
    expect(((safeJson(await again.text())) as { status?: string }).status).toBe('duplicate');
    const gains2 = await mf.dispatchFetch('http://c/checkout/gains', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    const row2 = ((safeJson(await gains2.text())) as { gains?: Record<string, unknown>[] }).gains?.find(
      (r) => r['orderId'] === orderId,
    );
    expect((row2!['obligations'] as unknown[]).length, 'a redelivery must not double the records').toBe(2);

    // ── the PUBLIC order view carries none of it (SP-I03) ─────────────────
    const pub = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
    const pubText = await pub.text();
    for (const secret of ['obligations', 'Eligible', 'supplier:', 'sellerNet']) {
      expect(pubText, `${secret} on the buyer view`).not.toContain(secret);
    }
  }, 60_000);

  it('the spine refuses by NAME: wrong correlation, and an order never confirmed', async () => {
    const { orderId: paid } = await realOrder('0012');
    expect((await runScript(paid, WEBHOOK_SECRET)).code).toBe(0);
    const wrong = await progress(validatedEvent(paid, { correlation_id: 'corr-autre' }), PROGRESS_SECRET);
    expect(wrong.status, 'a foreign correlation is refused loudly').toBe(409);
    expect(((safeJson(await wrong.text())) as { reason?: string }).reason).toBe('wrong_correlation');

    const { orderId: unpaid } = await realOrder('0013');
    const early = await progress(validatedEvent(unpaid), PROGRESS_SECRET);
    expect(early.status, 'no settlement before confirmation').toBe(409);
    expect(((safeJson(await early.text())) as { reason?: string }).reason).toBe('out_of_order');
  }, 60_000);

  it('the door: wrong secret is a 401 and records nothing', async () => {
    const { orderId } = await realOrder('0014');
    expect((await runScript(orderId, WEBHOOK_SECRET)).code).toBe(0);
    expect((await progress(validatedEvent(orderId), 'mauvaise-cle')).status).toBe(401);
    const gains = await mf.dispatchFetch('http://c/checkout/gains', {
      headers: { Authorization: `Bearer ${OPS_SECRET}` },
    });
    const row = ((safeJson(await gains.text())) as { gains?: Record<string, unknown>[] }).gains?.find(
      (r) => r['orderId'] === orderId,
    );
    expect(row!['livree'], 'a refused signal must not deliver an order').toBe(false);
  }, 60_000);
});
