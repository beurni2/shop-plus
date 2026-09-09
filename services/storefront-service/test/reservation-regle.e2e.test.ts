import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, cleC, seance } from './seance';

/**
 * ═══ RESERVATION-REGLE-1 (AUDIT-SHOP-2 F-08; F-96 named, not closed — `paid`
 * still has no watch) — the E2 failure rules, on the REAL combined Worker, the
 * LEDGER asked after every act ═══
 *
 * WO-2.3 wrote « the release is the rule; the alert is the net; stuck-saga +
 * DLQ live », and the audit measured that none of the four had a production
 * call site: the deployed Worker released nothing on payment failure (the
 * hold died by its 2-minute TTL), raised no `saga.stuck.v1`, and parked no
 * poison. The old gate replayed a JSON fixture through the pure functions.
 * This file replaces it with the seam: the app's own doors, driven against
 * the real Worker on miniflare, the outcome read from the ledger.
 *
 *  (1) THE RELEASE IS THE RULE. The certified sandbox provider is told to time
 *      out the first charge (`PAYMENT_SANDBOX_BEHAVIOR`, the same knob a
 *      deploy could set): the order lands `payment_failed`; the release wire
 *      delivers on the alarm and the ledger says so; and the buyer's FRESH
 *      hold on the same quote succeeds at once. RED before the wire: 409
 *      `already_reserved` until the TTL ran out.
 *
 *  (2) THE STUCK-SAGA WATCH. An order that retries into `payment_pending` and
 *      hears no webhook raises `saga.stuck.v1` EXACTLY ONCE past the TTL
 *      (`STUCK_SAGA_TTL_MS`, the test's knob; 15 min deployed), into the
 *      durable alert record the founder's audit read serves.
 *
 *  (3) THE DLQ. What the webhook door refuses as POISON is parked byte-exact
 *      with its digest in the one book, read on key C; a genuine webhook
 *      still confirms after, and parks nothing.
 *
 * The net (« a hold still held after the release answer ») is the vault's
 * `reservationReconciliationAlert`, evaluated on every release answer; on a
 * healthy Worker the answer is `released` and the record stays clean —
 * asserted here. The held-after-failure world itself is not reachable through
 * the doors (the vault never answers a release with `reserved`), so that arm
 * stays proven at the vault (`e2-failure-paths.test`).
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'reservation-regle-'));
const T0 = '2026-09-09T05:00:00.000Z';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-rr1';
const STUCK_TTL_MS = 1_500;

const SUPPLY = [
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
    // The certified mock's misbehaviour: the FIRST charge of every order times
    // out (the budget is per order — `attemptsAlreadyInitiated` is subtracted),
    // so a retry is accepted. The same knob a deploy could set; empty deployed.
    PAYMENT_SANDBOX_BEHAVIOR: JSON.stringify({ timeoutFirstNInitiates: 1 }),
    STUCK_SAGA_TTL_MS: String(STUCK_TTL_MS),
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
const sha256Hex = (raw: string): string => createHash('sha256').update(raw, 'utf8').digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Audit {
  state?: string;
  legKeys?: Record<string, string>;
  release?: { status: string; commandId: string; attempts: number; decision?: { ok: boolean; reason: string | null; state: string | null } } | null;
  stuck?: { emittedAt: string; commandId: string } | null;
  reconAlerts?: { name: string; envelope: { command_id: string }; payload: Record<string, unknown> }[];
}

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

async function livreParque() {
  const res = await mf.dispatchFetch('http://c/checkout/dlq', { headers: cleC });
  return {
    status: res.status,
    book: safeJson(await res.text()) as {
      ok?: boolean;
      entries?: { parkId: string; original: string; originalSha256: string; reason: string; bytes: number }[];
      events?: { name: string; payload: Record<string, unknown> }[];
      dropped?: number;
      oversize?: unknown[];
    },
  };
}

describe('RESERVATION-REGLE-1 — (1) the release is the rule, on the real Worker', () => {
  it('a timed-out charge lands payment_failed, the release wire delivers, the net stays clean, and her FRESH hold on the same quote succeeds at once', async () => {
    const elle = await creerCommande('0001');
    expect(elle.state, 'the first charge times out (PAYMENT_SANDBOX_BEHAVIOR)').toBe('payment_failed');

    // THE LEDGER: the release row was written beside the failure and the
    // alarm carried it to CheckoutDO, whose vault answered `released`.
    const livre = await jusqua(elle.orderId, (a) => a.release?.status === 'delivered');
    expect(livre.release?.status, JSON.stringify(livre.release)).toBe('delivered');
    expect(livre.release?.decision?.ok).toBe(true);
    expect(livre.release?.decision?.state).toBe('released');
    // THE NET on a clean world: no held-after-failure alert.
    expect((livre.reconAlerts ?? []).filter((a) => a.payload['alert'] === 'reservation_held_after_payment_failure')).toEqual([]);

    // HER FRESH HOLD, seconds later — RED before the wire: 409 already_reserved
    // for the two minutes the dead hold had left.
    const fresh = await reserver(elle.quoteId, elle.holderRef, 'cmd-reserve-0001-b');
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(200);
    expect(fresh.body.status).toBe('reserved');
    expect(typeof fresh.body.reservationId).toBe('string');
    expect(fresh.body.reservationId).not.toBe(elle.firstReservationId);
  }, 60_000);
});

describe('RESERVATION-REGLE-1 — (2) the stuck-saga watch, on the real Worker', () => {
  it('an order retried into payment_pending that hears no webhook raises saga.stuck.v1 EXACTLY ONCE past the TTL, into the durable alert record', async () => {
    const deux = await creerCommande('0002');
    expect(deux.state).toBe('payment_failed');
    await jusqua(deux.orderId, (a) => a.release?.status === 'delivered');

    // The buyer's ordinary retry: a NEW attempt, the budget spent, so the
    // charge is accepted and the order waits for a webhook that never comes.
    const retry = await retenter(deux.quoteId, deux.holderRef, 'cmd-order-0002-retry');
    expect(retry.status, String(retry.state)).toBe(200);
    expect(retry.state).toBe('payment_pending');

    const before = await audit(deux.orderId);
    expect(before.stuck, 'not yet stuck at the moment of the retry').toBeNull();

    const stuck = await jusqua(deux.orderId, (a) => a.stuck !== null && a.stuck !== undefined, STUCK_TTL_MS + 12_000);
    expect(stuck.stuck, 'the watch fired on the alarm').not.toBeNull();
    const alerts = (stuck.reconAlerts ?? []).filter((a) => a.name === 'saga.stuck.v1');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.payload['stuck_in']).toBe('payment_pending');
    expect(alerts[0]!.payload['ttl_policy_version']).toBe('stuck-ttl.v1');
    expect(alerts[0]!.envelope.command_id).toBe(stuck.stuck!.commandId);

    // EXACTLY ONCE: another TTL later the record still holds one.
    await sleep(STUCK_TTL_MS + 800);
    const encore = await audit(deux.orderId);
    expect((encore.reconAlerts ?? []).filter((a) => a.name === 'saga.stuck.v1')).toHaveLength(1);
    expect(encore.state).toBe('payment_pending');
  }, 60_000);
});

describe('RESERVATION-REGLE-1 — (3) the DLQ, on the real Worker', () => {
  it('poison the webhook door refuses is parked byte-exact with its digest, read on key C; a genuine webhook then confirms and parks nothing', async () => {
    const trois = await creerCommande('0003');
    await jusqua(trois.orderId, (a) => a.release?.status === 'delivered');
    const retry = await retenter(trois.quoteId, trois.holderRef, 'cmd-order-0003-retry');
    expect(retry.state).toBe('payment_pending');
    const a = await audit(trois.orderId);
    const legKey = a.legKeys?.['checkout'];
    expect(typeof legKey, JSON.stringify(a.legKeys)).toBe('string');

    // The book is key-C: no bearer, no read — one identical 401.
    const sansCle = await mf.dispatchFetch('http://c/checkout/dlq');
    expect(sansCle.status).toBe(401);
    const avant = await livreParque();
    expect(avant.status).toBe(200);
    const deja = avant.book.entries?.length ?? 0;
    const dejaTrop = avant.book.oversize?.length ?? 0;

    // (a) not JSON — the door cannot even route it: 400, parked as not_json.
    const torn = '{"name":"payment.checkout_leg_conf'; // truncated mid-flight
    expect((await postWebhook(torn)).status).toBe(400);
    // (b) JSON that is not a canon PlatformEvent: 400, parked as such.
    const pasCanon = '{ "hello" : "Boutik+ × Shop+ × Séra" }';
    expect((await postWebhook(pasCanon)).status).toBe(400);
    // (c) a canon event the ORDER OBJECT refuses as malformed_payload (F-34: a
    //     string fee): 422 by name, parked with that reason.
    const event = (over: Record<string, unknown>) => JSON.stringify({
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: {
        command_id: `whk-${trois.orderId}-${Object.keys(over).join('-') || 'ok'}`, correlation_id: `corr-${trois.orderId}`,
        aggregateVersion: 1, actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1',
      },
      payload: {
        provider: 'sandbox-provider', payment_attempt_id: legKey,
        collectRef: `collect-${trois.orderId}`, amount: trois.amount, fee: 0, status: 'held',
        order_id: trois.orderId, redelivery: false, ...over,
      },
    });
    const empoisonne = event({ fee: '250' });
    const refus = await postWebhook(empoisonne);
    expect(`${refus.status} ${safeJson(await refus.text())['error']}`).toBe('422 malformed_payload');
    // (d) the DOOR leg's road refuses on the same terms and parks in the same
    //     book (verifier finding): not canon → 400, parked.
    const pasCanonPorte = '{ "porte" : "pas un événement" }';
    expect((await postDoorWebhook(pasCanonPorte)).status).toBe(400);
    // (e) past the book's ceiling AS STORED: 70 000 code units with one « ’ »
    //     is 140 000 stored bytes — over 96 KiB while `.length` is under —
    //     recorded under `oversize` by digest and size, never a silent drop.
    const trop = `${'x'.repeat(69_999)}’`;
    expect((await postWebhook(trop)).status).toBe(400);

    const apres = await livreParque();
    const nouveaux = (apres.book.entries ?? []).slice(deja);
    expect(nouveaux.map((e) => e.reason)).toEqual(['not_json', 'not_a_canonical_platform_event', 'malformed_payload', 'not_a_canonical_platform_event']);
    expect(nouveaux[0]!.original, 'byte-exact, never re-serialized').toBe(torn);
    expect(nouveaux[1]!.original).toBe(pasCanon);
    expect(nouveaux[2]!.original).toBe(empoisonne);
    expect(nouveaux[3]!.original).toBe(pasCanonPorte);
    for (const e of nouveaux) expect(e.originalSha256).toBe(sha256Hex(e.original));
    expect((apres.book.events ?? []).slice(-4).map((ev) => ev.name)).toEqual(['dlq.parked.v1', 'dlq.parked.v1', 'dlq.parked.v1', 'dlq.parked.v1']);
    expect(apres.book.dropped).toBe(0);
    const surdimensionnes = (apres.book.oversize ?? []).slice(dejaTrop) as { sha256Hex: string; bytes: number; reason: string }[];
    expect(surdimensionnes.map((o) => [o.reason, o.bytes])).toEqual([['not_json', 140_000]]);
    expect(surdimensionnes[0]!.sha256Hex, 'the digest of the bytes it would not keep').toBe(sha256Hex(trop));

    // A GENUINE webhook after all that poison still confirms — and is not parked.
    const bon = await postWebhook(event({}));
    expect(bon.status, await bon.clone().text()).toBe(200);
    const fin = await jusqua(trois.orderId, (x) => x.state === 'paid' || x.state === 'confirmed');
    expect(['paid', 'confirmed']).toContain(fin.state);
    const inchange = await livreParque();
    expect(inchange.book.entries?.length).toBe(deja + 4);
    // A valid event the vault refuses by STATE (a redelivery of the same
    // command id is absorbed; a second confirm with a new id is out_of_order)
    // is NOT poison and parks nothing.
    const tard = await postWebhook(event({ redelivery: true }));
    expect([200, 409, 422]).toContain(tard.status);
    expect((await livreParque()).book.entries?.length).toBe(deja + 4);
  }, 90_000);
});
