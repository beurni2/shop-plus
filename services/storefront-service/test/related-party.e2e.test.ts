import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleC, seance } from './seance';

/**
 * ═══ RELATED-PARTY-1 — SP6.3 (part 4), Build Spec §6.5 « Related-party
 * detection (tiered; OWNER: Risk) », on the REAL Worker (miniflare on the
 * shipped bundle; every Durable Object real; only the Boutik+ OFFER service
 * stood in, contract-certified to what `livraison-boutik.e2e` certifies). ═══
 *
 *   « Auto-void commission: same verified identity/phone/wallet, or reseller
 *     buying through their own account. … During investigation commission is
 *     held, not returned; appeal path; on violation → returned to seller; on
 *     clear → paid. »
 *
 * THE ONE SIGNAL this platform can read today is the PHONE: the buyer's own
 * dispatch contact (BC-1a, on the order) against the reseller's registered
 * number (the accounts book, PROFIL-REVENDEUR-1). No identity system, no
 * MoMo account on either side, no buyer account: the other identity signals
 * and every circumstantial one stay unproduced, and §6.5's own words say the
 * circumstantial family never auto-voids anyway.
 *
 * WHAT IS PROVEN HERE, by asking the LEDGER and the WIRES, never the response:
 *   · her own number on the buyer's contact ⇒ the decision is `auto_void`,
 *     recorded ONCE on the order, and her settlement line is HELD — never
 *     payable — while the supplier's is untouched and every amount is the
 *     quote's, unchanged;
 *   · a different number ⇒ clear: nothing held, nothing on her wire;
 *   · the appeal path: her one sentence rides HER session to the order,
 *     twice is once, another reseller cannot, the founder reads her words;
 *   · the founder's ruling: `clear` puts her line back, `violation` keeps it
 *     held and names the violation — and MOVES NO MONEY (« returned to
 *     seller » waits for the founder's §7 ruling on how it is represented);
 *   · Séra's redelivery of the delivery signal decides nothing twice.
 * The money-movement on violation is the one open ⏳ of this slice.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'related-party-'));
const T0 = '2026-09-17T08:00:00.000Z';
const WEBHOOK_SECRET = 'test-payment-webhook-secret-rp001';
const PROGRESS_SECRET = 'test-progress-write-secret-rp001';
const FULFILL_SECRET = 'test-fulfillment-write-secret-rp001';

const SUPPLY = [
  {
    productVersionId: 'pv-rp-1',
    offerVersion: 'ov-rp-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 50,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
];

const registered = new Set<string>();
let mf: Miniflare;

function makeMf(): Miniflare {
  return new Miniflare({
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
      // Boutik+'s OFFER service, stood in to the bounds `livraison-boutik.e2e`
      // certifies: it registers a confirmed order, accepts one delivery
      // relay, and serves the supply projection.
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path === '/fulfillment/order-confirmed') {
          const body = (await request.json().catch(() => null)) as { payload?: { orderId?: string } } | null;
          if (typeof body?.payload?.orderId === 'string') registered.add(body.payload.orderId);
          return Response.json({ ok: true, status: 'registered' });
        }
        if (request.method === 'POST' && path === '/fulfillment/delivered') {
          return Response.json({ ok: true, status: 'delivered', deliveredAt: new Date().toISOString() });
        }
        if (request.method === 'POST' && path === '/fulfillment/delivery-refused') {
          return Response.json({ ok: true, status: 'restocked' });
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
  mf = makeMf();
});
afterAll(async () => {
  await mf?.dispose();
  rmSync(persist, { recursive: true, force: true });
});

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type Seance = Awaited<ReturnType<typeof seance>>;

let keySeq = 0;
const freshKey = (): string => `rk-rp-${String((keySeq += 1)).padStart(4, '0')}-${'x'.repeat(10)}`;

/** Her registered number, as the accounts book holds it. */
async function sonNumero(S: Seance): Promise<string> {
  const res = await mf.dispatchFetch('http://c/reseller/profile', { method: 'POST', headers: S.bearer, body: JSON.stringify({}) });
  const body = safeJson(await res.text());
  if (res.status !== 200 || typeof body['phone'] !== 'string') throw new Error(`setup: profile ${res.status} ${JSON.stringify(body)}`);
  return body['phone'];
}

/** A paid FULL_PREPAY order under HER attribution, with the buyer's own contact. */
async function commandePayee(S: Seance, n: string, phoneAcheteuse: string): Promise<string> {
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`, id: `sf-rp-${n}`, resellerId: S.accountId,
      shortCode: `RP-${n}`, name: 'Boutique de Salimata', zone: 'Ouagadougou',
      category: 'Général', correlationId: `corr-rp-${n}`, at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`setup: storefront ${created.status} ${await created.text()}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`, listingId: `lst-rp-${n}`, storefrontId: `sf-rp-${n}`,
      resellerId: S.accountId, productVersionId: 'pv-rp-1', offerVersion: 'ov-rp-1',
      markup: 1_500, correlationId: `corr-rp-${n}`, at: T0,
    }),
  });
  if (((await pub.json()) as { status?: string }).status !== 'published') throw new Error('setup: listing');
  const quoteRes = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: `rp-${n}`, pid: 'pv-rp-1', paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou',
      attributionResellerId: S.accountId, requestKey: freshKey(),
    }),
  });
  const quote = safeJson(await quoteRes.text()) as { quoteId?: string };
  if (typeof quote.quoteId !== 'string') throw new Error(`setup: quote ${quoteRes.status} ${JSON.stringify(quote)}`);
  const held = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(quote.quoteId)}/reserve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: `cmd-reserve-${n}`, holderRef: `holder-${n}` }),
  });
  if (held.status !== 200) throw new Error(`setup: reserve ${held.status}`);
  const ordered = await mf.dispatchFetch('http://c/checkout/order', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteId: quote.quoteId, holderRef: `holder-${n}`, commandId: `cmd-order-${n}`,
      contact: { phone: phoneAcheteuse, quartier: 'Gounghin', repere: 'en face de la pharmacie' },
    }),
  });
  if (ordered.status !== 200) throw new Error(`setup: order ${ordered.status} ${await ordered.text()}`);
  const orderId = `ord-${quote.quoteId}`;
  const vue = safeJson(await (await mf.dispatchFetch(`http://c/checkout/order/${encodeURIComponent(orderId)}`)).text());
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

const validatedEvent = (orderId: string, serverTime: string, suffix = '') => ({
  name: 'delivery.validated.v1',
  envelope: {
    command_id: `eligibility-${orderId}${suffix}`, correlation_id: `corr-${orderId}`,
    aggregateVersion: 9, actor: 'custody-service:e1', serverTime, version: '1',
  },
  payload: {
    order_id: orderId, task_id: `task-${orderId}`, validation_id: `val-${orderId}`,
    result: 'validated', settlement_eligibility: true, supplier_ref: 'supplier-rp-001',
  },
});

const livree = (orderId: string, at = '2026-09-17T14:30:00.000Z') =>
  mf.dispatchFetch('http://c/fulfillment/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PROGRESS_SECRET}` },
    body: JSON.stringify(validatedEvent(orderId, at)),
  });

interface Obligation { party: string; amount: number; state: string; holds: string[] }

/** THE LEDGER, asked through the founder's key-C read (served as stored, never recomputed) — never the buyer's public view, which carries no settlement line. */
async function obligations(orderId: string): Promise<Obligation[]> {
  const lu = await lectureFondateur(orderId);
  if (lu.status !== 200) throw new Error(`founder read ${lu.status} ${JSON.stringify(lu.body)}`);
  return (lu.body['obligations'] as Obligation[] | undefined) ?? [];
}
const ligne = (rows: Obligation[], prefix: string): Obligation | undefined => rows.find((o) => o.party.startsWith(prefix));

/** HER wire: the row `/reseller/ventes` serves for this order, riding her session. */
async function saLigne(S: Seance, orderId: string): Promise<Record<string, unknown> | undefined> {
  const res = await mf.dispatchFetch('http://c/reseller/ventes', { headers: { Authorization: S.bearer.Authorization } });
  const body = safeJson(await res.text());
  const ventes = (body['ventes'] as Record<string, unknown>[] | undefined) ?? [];
  return ventes.find((v) => v['orderId'] === orderId);
}

/** THE FOUNDER'S read, on key C. */
async function lectureFondateur(orderId: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await mf.dispatchFetch(`http://c/orders/${encodeURIComponent(orderId)}/related-party`, { headers: cleC });
  return { status: res.status, body: safeJson(await res.text()) };
}

const contester = (S: Seance, orderId: string, texte: unknown) =>
  mf.dispatchFetch(`http://c/reseller/ventes/${encodeURIComponent(orderId)}/contester`, {
    method: 'POST', headers: S.bearer, body: JSON.stringify({ texte }),
  });

const trancher = (orderId: string, outcome: unknown, headers: Record<string, string> = cleC) =>
  mf.dispatchFetch(`http://c/orders/${encodeURIComponent(orderId)}/related-party/resolve`, {
    method: 'POST', headers, body: JSON.stringify({ outcome }),
  });

/** The buyer typed her number the way people do: no country code, spaces of her own. */
const commeTape = (registered: string): string => {
  const digits = registered.replace(/\D/g, '').replace(/^226(?=\d{8}$)/, '');
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6)}`;
};

describe('RELATED-PARTY-1 — §6.5 on the real Worker: her own number voids the commission, the line is held, the appeal and the ruling ride the order', () => {
  it('HER OWN NUMBER on the buyer\'s contact ⇒ auto-void: her settlement line is HELD (never payable), the supplier\'s untouched, every amount the quote\'s; her row and the founder\'s read both say so', async () => {
    const S = await seance(mf, 'rp1');
    const numero = await sonNumero(S);
    expect(numero.replace(/\D/g, '').length, 'the book holds a real number').toBeGreaterThanOrEqual(8);
    const orderId = await commandePayee(S, '0001', commeTape(numero));

    const res = await livree(orderId);
    expect(`${res.status} ${await res.text()}`).toBe('200 {"ok":true,"status":"recorded","obligations":2}');

    const rows = await obligations(orderId);
    expect(rows.length).toBe(2);
    const sienne = ligne(rows, 'reseller:');
    const fournisseur = ligne(rows, 'supplier:');
    expect(sienne?.state, 'her commission is HELD — §6.5, never paid while it stands').toBe('Held');
    expect(sienne?.holds).toEqual(['related_party:auto_void']);
    expect(fournisseur?.state, 'the supplier\'s line is untouched').toBe('Eligible');
    expect(fournisseur?.holds).toEqual([]);

    const ligneApp = await saLigne(S, orderId);
    expect(ligneApp, 'her feed carries the order').toBeDefined();
    expect(ligneApp?.['lienProche']).toEqual({ outcome: 'auto_void', signals: ['phone'], contestee: false });
    // NO MONEY MOVED: her line carries the quote's resellerNet — the same figure
    // her wire shows — and the supplier's line a positive net of its own.
    expect(sienne?.amount).toBe(ligneApp?.['resellerNet']);
    expect(Number.isInteger(fournisseur?.amount) && (fournisseur?.amount ?? 0) > 0).toBe(true);

    const lu = await lectureFondateur(orderId);
    expect(lu.status).toBe(200);
    const decision = lu.body['decision'] as Record<string, unknown>;
    expect(decision['outcome']).toBe('auto_void');
    expect(decision['signals']).toEqual({ identity: ['phone'], circumstantial: [] });
    expect(decision['policyVersion']).toBe('related-party.v1');
    expect(decision['orderId']).toBe(orderId);
    expect(lu.body['appeal']).toBeNull();
    expect(lu.body['resolution']).toBeNull();
    expect((lu.body['obligations'] as Obligation[]).find((o) => o.party.startsWith('reseller:'))?.state).toBe('Held');
  });

  it('A DIFFERENT number ⇒ clear: nothing held, nothing on her wire, and there is nothing to contest', async () => {
    const S = await seance(mf, 'rp2');
    const orderId = await commandePayee(S, '0002', '76 00 99 88');
    expect((await livree(orderId)).status).toBe(200);

    const rows = await obligations(orderId);
    expect(rows.map((o) => [o.state, o.holds])).toEqual([['Eligible', []], ['Eligible', []]]);
    expect((await saLigne(S, orderId))?.['lienProche']).toBeUndefined();

    const lu = await lectureFondateur(orderId);
    expect((lu.body['decision'] as Record<string, unknown>)['outcome']).toBe('clear');

    const c = await contester(S, orderId, 'Ma cliente est ma voisine.');
    expect(c.status).toBe(409);
    expect(safeJson(await c.text())['reason']).toBe('nothing_to_contest');
  });

  it('THE APPEAL PATH: her one sentence rides HER session to the order; twice is once; another reseller cannot; the founder reads her words', async () => {
    const S = await seance(mf, 'rp3');
    const orderId = await commandePayee(S, '0003', commeTape(await sonNumero(S)));
    expect((await livree(orderId)).status).toBe(200);

    const vide = await contester(S, orderId, '   ');
    expect(vide.status, 'an empty sentence is refused by name').toBe(400);
    const trop = await contester(S, orderId, 'x'.repeat(201));
    expect(trop.status, 'more than 200 characters is refused by name').toBe(400);

    const c = await contester(S, orderId, 'C’est mon propre numéro : ma cliente a commandé avec mon téléphone.');
    expect(`${c.status} ${await c.text()}`).toBe('200 {"ok":true}');
    expect((await saLigne(S, orderId))?.['lienProche']).toEqual({ outcome: 'auto_void', signals: ['phone'], contestee: true });

    const encore = await contester(S, orderId, 'Encore.');
    expect(encore.status).toBe(409);
    expect(safeJson(await encore.text())['reason']).toBe('already_contested');

    const autre = await seance(mf, 'rp3b');
    const pasElle = await contester(autre, orderId, 'Je conteste pour elle.');
    expect(pasElle.status, 'another reseller cannot contest her sale').toBe(404);

    const lu = await lectureFondateur(orderId);
    const appeal = lu.body['appeal'] as Record<string, unknown>;
    expect(appeal['texte']).toBe('C’est mon propre numéro : ma cliente a commandé avec mon téléphone.');
    expect(typeof appeal['at']).toBe('string');
    // The line is STILL held while she contests — « held, not returned ».
    expect(ligne(await obligations(orderId), 'reseller:')?.state).toBe('Held');
  });

  it('THE FOUNDER CLEARS: her line goes back to Eligible with no hold, her row says cleared; a second, different ruling is refused; key C is the only key', async () => {
    const S = await seance(mf, 'rp4');
    const orderId = await commandePayee(S, '0004', commeTape(await sonNumero(S)));
    expect((await livree(orderId)).status).toBe(200);
    expect((await contester(S, orderId, 'Ma cliente a pris mon téléphone pour commander.')).status).toBe(200);

    const sansCle = await trancher(orderId, 'clear', { 'Content-Type': 'application/json' });
    expect(sansCle.status).toBe(401);
    const mauvaise = await trancher(orderId, 'clear', { 'Content-Type': 'application/json', Authorization: 'Bearer nope' });
    expect(mauvaise.status).toBe(401);
    const bidon = await trancher(orderId, 'maybe');
    expect(bidon.status, 'an outcome §6.5 does not name is refused').toBe(400);

    const avant = await obligations(orderId);
    const ok = await trancher(orderId, 'clear');
    expect(ok.status).toBe(200);
    const sienne = ligne(await obligations(orderId), 'reseller:');
    expect(sienne?.state, '« on clear → paid »: the line is payable again on the same road as any other').toBe('Eligible');
    expect(sienne?.holds).toEqual([]);
    expect(sienne?.amount, 'the ruling moves no franc').toBe(ligne(avant, 'reseller:')?.amount);
    expect((await saLigne(S, orderId))?.['lienProche']).toEqual({ outcome: 'auto_void', signals: ['phone'], contestee: true, resolution: 'clear' });

    const encore = await trancher(orderId, 'clear');
    expect(encore.status, 'the same ruling twice is once').toBe(200);
    const contraire = await trancher(orderId, 'violation');
    expect(contraire.status).toBe(409);
    expect(safeJson(await contraire.text())['reason']).toBe('already_resolved');
    expect(ligne(await obligations(orderId), 'reseller:')?.state, 'a refused ruling changes nothing').toBe('Eligible');

    const lu = await lectureFondateur(orderId);
    expect((lu.body['resolution'] as Record<string, unknown>)['outcome']).toBe('clear');
  });

  it('THE FOUNDER CONFIRMS THE VIOLATION: the line stays Held and names it, and NO money moves — « returned to seller » waits for his ruling on its shape', async () => {
    const S = await seance(mf, 'rp5');
    const orderId = await commandePayee(S, '0005', commeTape(await sonNumero(S)));
    expect((await livree(orderId)).status).toBe(200);

    const avant = await obligations(orderId);
    const ok = await trancher(orderId, 'violation');
    expect(ok.status).toBe(200);
    const rows = await obligations(orderId);
    const sienne = ligne(rows, 'reseller:');
    expect(sienne?.state).toBe('Held');
    expect(sienne?.holds).toEqual(['related_party:auto_void', 'related_party:violation']);
    expect(sienne?.amount, 'her line still carries the quote\'s amount: nothing was moved by this slice').toBe(ligne(avant, 'reseller:')?.amount);
    expect(ligne(rows, 'supplier:')?.amount, 'the supplier\'s line did not grow: the move is the founder\'s call (§7)').toBe(ligne(avant, 'supplier:')?.amount);
    expect((await saLigne(S, orderId))?.['lienProche']).toEqual({ outcome: 'auto_void', signals: ['phone'], contestee: false, resolution: 'violation' });

    const tard = await contester(S, orderId, 'Trop tard ?');
    expect(tard.status, 'no appeal after the ruling').toBe(409);
    expect(safeJson(await tard.text())['reason']).toBe('already_resolved');
  });

  it('SÉRA\'S REDELIVERY of the delivery signal is a duplicate and decides nothing twice', async () => {
    const S = await seance(mf, 'rp6');
    const orderId = await commandePayee(S, '0006', commeTape(await sonNumero(S)));
    expect((await livree(orderId)).status).toBe(200);
    const avant = await obligations(orderId);
    const encore = await livree(orderId);
    expect(`${encore.status} ${await encore.text()}`).toBe('200 {"ok":true,"status":"duplicate"}');
    expect(await obligations(orderId)).toEqual(avant);
    expect(ligne(avant, 'reseller:')?.holds, 'one hold, not two').toEqual(['related_party:auto_void']);
    const lu = await lectureFondateur(orderId);
    expect((lu.body['decision'] as Record<string, unknown>)['outcome']).toBe('auto_void');
  });
});
