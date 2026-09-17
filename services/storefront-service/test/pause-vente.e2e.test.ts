import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleC, seance } from './seance';

/**
 * ═══ PAUSE-VENTE-1 — « paused resellers can not sell anything until they are
 * reactivated » (founder ruling, 2026-09-17), on the REAL Worker ═══
 *
 * miniflare on the shipped bundle; every Durable Object real (the accounts
 * book, the storefront, the listing, the checkout vault, the order, the lock,
 * the ladder, the dispatch index, the feed); only Boutik+'s OFFER service
 * stood in, contract-certified to what `livraison-boutik.e2e` certifies.
 *
 * BEFORE THIS SLICE a paused reseller's shop stayed open to buyers: the page
 * rendered her products, the quote issued, the order was created — only her
 * WhatsApp number left the page. The founder's pause reached her own app and
 * nothing the buyer touched.
 *
 * WHAT IS PROVEN, by asking the BUYER'S DOORS and the LEDGER, never the
 * founder's own response:
 *   · paused ⇒ her page answers the designed pause (her name, no product,
 *     no contact), the quote refuses `reseller_paused` and mints no quote
 *     under the key, and a quote held BEFORE the pause cannot become an order;
 *   · reactivated ⇒ the same page, the same key and the same held quote all
 *     go through — the pause is a cut, never an erasure;
 *   · §6.5 keeps its eyes: a sale made while active with her OWN number,
 *     delivered while she is paused, is decided and HELD (the loophole a
 *     pause for suspicion would have opened before this slice).
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'pause-vente-'));
const T0 = '2026-09-17T08:00:00.000Z';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-pv001';
const PROGRESS_SECRET = 'test-progress-write-secret-pv001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-pv001';

const SUPPLY = [
  {
    productVersionId: 'pv-pause-1',
    offerVersion: 'ov-pause-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 50,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

let mf: Miniflare;

beforeAll(() => {
  mf = new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    durableObjects: {
      STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
      RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
    },
    durableObjectsPersist: persist,
    bindings: {
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      CHECKOUT_OPS_SECRET: cleC.Authorization.slice('Bearer '.length),
      PROGRESS_WRITE_SECRET: PROGRESS_SECRET,
      FULFILLMENT_WRITE_SECRET: FULFILL_SECRET,
    },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path === '/fulfillment/order-confirmed') return Response.json({ ok: true, status: 'registered' });
        if (request.method === 'POST' && path === '/fulfillment/delivered') {
          return Response.json({ ok: true, status: 'delivered', deliveredAt: new Date().toISOString() });
        }
        if (request.method === 'POST' && path === '/fulfillment/delivery-refused') return Response.json({ ok: true, status: 'restocked' });
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
});
afterAll(async () => {
  await mf?.dispose();
  rmSync(persist, { recursive: true, force: true });
});

type Seance = Awaited<ReturnType<typeof seance>>;

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

let keySeq = 0;
const freshKey = (): string => `rk-pv-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

/** Her shop with one published product, through the REAL doors on her session. */
async function boutique(S: Seance, n: string): Promise<{ slug: string }> {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-pv-${n}`, resellerId: S.accountId,
      shortCode: `PV-${n}`, name: 'Boutique de Salimata', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-pv-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${await created.text()}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-pv-${n}`, storefrontId: `sf-pv-${n}`,
      resellerId: S.accountId, productVersionId: 'pv-pause-1', offerVersion: 'ov-pause-1',
      markup: 1_500, correlationId: `corr-pv-${n}`, at: T0,
    }),
  });
  if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  return { slug: `pv-${n}` };
}

/** THE BUYER'S PAGE — credential-free, the only answer that settles « can she sell ». */
async function page(slug: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await mf.dispatchFetch(`http://c/s/${slug}`);
  return { status: res.status, body: safeJson(await res.text()) };
}

async function quote(S: Seance, slug: string, requestKey: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, pid: 'pv-pause-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: S.accountId, requestKey }),
  });
  return { status: res.status, body: safeJson(await res.text()) };
}

async function reserver(quoteId: string, n: string): Promise<number> {
  const held = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quoteId)}/reserve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
  });
  return held.status;
}

async function commander(quoteId: string, n: string, phone = '76 00 99 88'): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`,
      contact: { phone, quartier: 'Gounghin', repere: 'en face de la pharmacie' },
    }),
  });
  return { status: res.status, body: safeJson(await res.text()) };
}

const acces = (accountId: string, acte: 'pause' | 'resume') =>
  mf.dispatchFetch(`http://c/reseller/accounts/${acte}`, { method: 'POST', headers: cleC, body: JSON.stringify({ accountId }) });

/** The founder's act, and its proof read back on the roster — never the act's own answer. */
async function fondateur(accountId: string, acte: 'pause' | 'resume'): Promise<void> {
  const res = await acces(accountId, acte);
  if (res.status !== 200) throw new Error(`${acte}: ${res.status} ${await res.text()}`);
  const roster = safeJson(await (await mf.dispatchFetch('http://c/reseller/accounts', { headers: cleC })).text());
  const row = (roster['accounts'] as { accountId: string; state: string }[]).find((a) => a.accountId === accountId);
  expect(row?.state).toBe(acte === 'pause' ? 'paused' : 'active');
}

/** Her registered number, read while she is still active (the profile refuses a paused session by name). */
async function sonNumero(S: Seance): Promise<string> {
  const res = await mf.dispatchFetch('http://c/reseller/profile', { method: 'POST', headers: S.bearer, body: JSON.stringify({}) });
  const body = safeJson(await res.text());
  if (res.status !== 200 || typeof body['phone'] !== 'string') throw new Error(`setup: profile ${res.status}`);
  return body['phone'];
}

const commeTape = (registered: string): string => {
  const digits = registered.replace(/\D/g, '').replace(/^226(?=\d{8}$)/, '');
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`;
};

async function payer(orderId: string): Promise<void> {
  const vue = safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());
  const nsOrd = await mf.getDurableObjectNamespace('ORDER');
  const audit = (await (await nsOrd.get(nsOrd.idFromName(orderId)).fetch('https://do/entry/audit')).json()) as { legKeys?: Record<string, string> };
  const legKey = audit.legKeys?.['checkout'];
  if (legKey === undefined) throw new Error(`no checkout leg key on ${orderId}`);
  const paid = await mf.dispatchFetch('http://c/checkout/webhook/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment-Webhook-Key': WEBHOOK_SECRET },
    body: JSON.stringify({
      name: 'payment.checkout_leg_confirmed.v1',
      envelope: { command_id: `whk-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 1, actor: 'sandbox:founder', serverTime: new Date().toISOString(), version: '1' },
      payload: { provider: 'sandbox-provider', payment_attempt_id: legKey, collectRef: `collect-${orderId}`, amount: Number(vue['amountPaidAtCheckout']), fee: 0, status: 'held', order_id: orderId, redelivery: false },
    }),
  });
  if (paid.status !== 200) throw new Error(`setup: webhook ${paid.status} ${await paid.text()}`);
}

const livree = (orderId: string) =>
  mf.dispatchFetch('http://c/fulfillment/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    body: JSON.stringify({
      name: 'delivery.validated.v1',
      envelope: { command_id: `eligibility-${orderId}`, correlation_id: `corr-${orderId}`, aggregateVersion: 9, actor: 'custody-service:e1', serverTime: '2026-09-17T14:30:00.000Z', version: '1' },
      payload: { order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`, result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-pv-001' },
    }),
  });

interface Obligation { party: string; amount: number; state: string; holds: string[] }
async function obligations(orderId: string): Promise<Obligation[]> {
  const res = await mf.dispatchFetch(`http://c/orders/${encodeURIComponent(orderId)}/related-party`, { headers: cleC });
  const body = safeJson(await res.text());
  if (res.status !== 200) throw new Error(`founder read ${res.status} ${JSON.stringify(body)}`);
  return (body['obligations'] as Obligation[] | undefined) ?? [];
}

describe('PAUSE-VENTE-1 — on the real Worker, a paused reseller sells nothing, and everything comes back when she is reactivated', () => {
  it('HER PAGE: active ⇒ her products; paused ⇒ the designed pause with her name and NOTHING else; reactivated ⇒ her products again', async () => {
    const S = await seance(mf, 'pv1');
    const { slug } = await boutique(S, '0001');

    const avant = await page(slug);
    expect(avant.status).toBe(200);
    expect(avant.body['curatedItems']).toEqual(['pv-pause-1']);
    expect(avant.body['enPause']).toBeUndefined();

    await fondateur(S.accountId, 'pause');
    const pendant = await page(slug);
    expect(pendant.status, 'a pause is an honest 200, never « lien invalide »').toBe(200);
    expect(pendant.body).toEqual({ service: 'storefront-service', enPause: true, name: 'Boutique de Salimata', slug });
    // nothing of the shop leaves: no curation, no product, no contact
    expect(Object.keys(pendant.body).sort()).toEqual(['enPause', 'name', 'service', 'slug']);

    await fondateur(S.accountId, 'resume');
    const apres = await page(slug);
    expect(apres.status).toBe(200);
    expect(apres.body['curatedItems']).toEqual(['pv-pause-1']);
    expect(apres.body['enPause']).toBeUndefined();
  });

  it('THE QUOTE: paused ⇒ refused BY NAME and no quote minted under the key; reactivated ⇒ the SAME key issues (the key was never spent)', async () => {
    const S = await seance(mf, 'pv2');
    const { slug } = await boutique(S, '0002');
    await fondateur(S.accountId, 'pause');

    const key = freshKey();
    const refus = await quote(S, slug, key);
    expect(refus.status).toBe(422);
    expect(refus.body).toEqual({ error: 'reseller_paused' });

    // the same ask, still paused: the same refusal — never a quote served from a
    // stored object (there is none)
    const encore = await quote(S, slug, key);
    expect(encore.status).toBe(422);
    expect(encore.body['error']).toBe('reseller_paused');

    await fondateur(S.accountId, 'resume');
    const ok = await quote(S, slug, key);
    expect(ok.status, `reactivated: ${JSON.stringify(ok.body)}`).toBe(200);
    expect(typeof ok.body['quoteId']).toBe('string');
    expect(ok.body['totalToday'] ?? ok.body['amountPaidAtCheckout'], 'a real quote, priced').toBeDefined();
  });

  it('THE ORDER: a quote held BEFORE the pause cannot become a sale while she is paused — refused by name, no order born; reactivated, the same create goes through', async () => {
    const S = await seance(mf, 'pv3');
    const { slug } = await boutique(S, '0003');
    const q = await quote(S, slug, freshKey());
    expect(q.status).toBe(200);
    const quoteId = q.body['quoteId'] as string;
    expect(await reserver(quoteId, '0003')).toBe(200);

    await fondateur(S.accountId, 'pause');
    const refus = await commander(quoteId, '0003');
    expect(refus.status).toBe(422);
    // the router speaks the door's name as `error`, the shape the buyer's port reads
    expect(refus.body).toEqual({ error: 'reseller_paused' });
    const orderId = `ord-${quoteId}`;
    const lecture = await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`);
    expect(lecture.status, 'no order was born').toBe(404);

    await fondateur(S.accountId, 'resume');
    const ok = await commander(quoteId, '0003');
    expect(ok.status, `reactivated: ${JSON.stringify(ok.body)}`).toBe(200);
    expect(ok.body['orderId']).toBe(orderId);
    expect((await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).status).toBe(200);
  });

  it('§6.5 KEEPS ITS EYES: her own-number sale, made while active and delivered while she is PAUSED, is decided and HELD — never left undecided', async () => {
    const S = await seance(mf, 'pv4');
    const numero = await sonNumero(S);
    const { slug } = await boutique(S, '0004');
    const q = await quote(S, slug, freshKey());
    const quoteId = q.body['quoteId'] as string;
    expect(await reserver(quoteId, '0004')).toBe(200);
    const ordered = await commander(quoteId, '0004', commeTape(numero));
    expect(ordered.status).toBe(200);
    const orderId = `ord-${quoteId}`;
    await payer(orderId);

    await fondateur(S.accountId, 'pause');
    const res = await livree(orderId);
    expect(`${res.status} ${await res.text()}`).toBe('200 {"ok":true,"status":"recorded","obligations":2}');

    const rows = await obligations(orderId);
    const sienne = rows.find((o) => o.party.startsWith('reseller:'));
    expect(sienne?.state, 'decided while paused: HELD').toBe('Held');
    expect(sienne?.holds).toEqual(['related_party:auto_void']);
    expect(rows.find((o) => o.party.startsWith('supplier:'))?.state).toBe('Eligible');
  });

  it('the founder\'s doors are unchanged: pause and resume still refuse without key C', async () => {
    const S = await seance(mf, 'pv5');
    for (const acte of ['pause', 'resume'] as const) {
      const res = await mf.dispatchFetch(`http://c/reseller/accounts/${acte}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: S.accountId }),
      });
      expect(res.status).toBe(401);
    }
  });
});
