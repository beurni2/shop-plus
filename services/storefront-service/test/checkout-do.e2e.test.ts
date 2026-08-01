import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * SP3.2a — THE DURABLE CHECKOUT PATH ON REAL WORKERD (Miniflare), through the
 * COMBINED Worker bundle: the composition root, the write-gate exemption, the
 * CORS helper, both authority reads and the CheckoutDO, all the real code.
 *
 * EVERY DURABILITY CLAIM CROSSES A RESTART — the Miniflare instance is disposed
 * and re-created on the SAME persist dir, so « it survived » means a process
 * death, not a second request. CI reaches only this temp dir.
 *
 * WHAT THIS SUITE CANNOT PROVE, stated rather than glossed: the 15-minute quote
 * expiry and the 2-minute reservation TTL cannot be reached against workerd's
 * real clock inside a test, and there is deliberately NO test-only clock
 * binding on a money path. Both are proven BY VALUE in `checkout-core.test.ts`
 * against the very functions this Durable Object calls (`readStoredQuote`,
 * `decideReserveForQuote`).
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'checkout-do-'));
const T0 = '2026-07-29T08:00:00.000Z';

const WRITE_SECRET = 'test-write-secret-0001';
const authed = { 'X-Write-Key': WRITE_SECRET };

/**
 * The producer behind the OFFER binding — publish signs HER price from it, and
 * since SELLER-TIER-WIRE-1 the §6.1 gate reads its `sellerTier` and `category`
 * from it too.
 *
 * TWO PRODUCTS, DIFFERING ONLY IN TIER, and that is the whole point: a door
 * request carries no tier field any more, so the ONLY way to drive the
 * « seller tier ≥ verified » condition either way is to change which product is
 * being bought. `pv-checkout-1` is the founder-attested supplier's
 * (`sellerTier: 'verified'`); `pv-checkout-prov` is not attested, which is
 * exactly what an offer-service with no `VERIFIED_SUPPLIERS` emits for
 * everyone.
 */
const SUPPLY = [
  {
    productVersionId: 'pv-checkout-1',
    offerVersion: 'ov-checkout-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
  {
    productVersionId: 'pv-checkout-prov',
    offerVersion: 'ov-checkout-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'provisional',
  },
];

function makeMf(): Miniflare {
  return new Miniflare({
    modules: true,
    scriptPath: SCRIPT,
    // SP3.3a — `ORDER` is bound here too, because the deployed Worker binds it
    // and this suite runs the deployed bundle: a successful reserve now mirrors
    // its hold into the order's object (worker/index.ts), and a suite missing
    // the binding would be testing a shape that is not shipped.
    durableObjects: {
      STOREFRONT: 'StorefrontDO',
      LISTING: 'ListingDO',
      CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO',
    },
    durableObjectsPersist: persist,
    bindings: { STOREFRONT_WRITE_SECRET: WRITE_SECRET },
    serviceBindings: {
      OFFER: async (request: Request) => {
        const path = new URL(request.url).pathname;
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

let mf = makeMf();
async function restart(): Promise<void> {
  await mf.dispose();
  mf = makeMf(); // same persist dir = a real process death
}
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

/** A shop + one published listing. Publish sends the MARKUP only — the service
 *  signs `customerPriceFcfa` and freezes C from the live offer (PUBLISH-PRICE-1
 *  / MONEY-SHAPE-1), which is exactly what the quote path then reads.
 *
 *  `pid` selects WHICH supplier's product the shop sells, which since
 *  SELLER-TIER-WIRE-1 is also what selects the §6.1 seller tier. */
async function seedShop(
  n: string,
  markup = 1_500,
  pid = 'pv-checkout-1',
): Promise<{ slug: string; resellerId: string; pid: string }> {
  const shortCode = `CHECK-${n}`;
  const created = await mf.dispatchFetch('http://c/storefronts', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-create-${n}`,
      id: `sf-checkout-${n}`,
      resellerId: `rs-checkout-${n}`,
      shortCode,
      name: 'Boutique du fondateur',
      zone: 'Ouagadougou',
      category: 'Général',
      correlationId: `corr-${n}`,
      at: T0,
    }),
  });
  if (created.status !== 200) throw new Error(`seed: storefront create ${created.status}`);
  const pub = await mf.dispatchFetch('http://c/listings', {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      commandId: `cmd-listing-${n}`,
      listingId: `lst-checkout-${n}`,
      storefrontId: `sf-checkout-${n}`,
      resellerId: `rs-checkout-${n}`,
      productVersionId: pid,
      offerVersion: 'ov-checkout-1',
      markup,
      correlationId: `corr-${n}`,
      at: T0,
    }),
  });
  const decision = (await pub.json()) as { status?: string };
  if (decision.status !== 'published') throw new Error(`seed: listing publish ${JSON.stringify(decision)}`);
  return { slug: shortCode.toLowerCase(), resellerId: `rs-checkout-${n}`, pid };
}

interface QuoteBody {
  slug: string;
  pid: string;
  paymentMode: string;
  zoneTo: string;
  attributionResellerId?: string;
  requestKey: string;
  payAtDoorContext?: unknown;
}

async function postQuote(body: Partial<QuoteBody> & { requestKey: string }, headers: Record<string, string> = {}) {
  const res = await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text), headers: res.headers };
}

async function getQuote(id: string) {
  const res = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(id)}`, { method: 'GET' });
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

let keySeq = 0;
const freshKey = (): string => `rk-${String(keySeq++).padStart(4, '0')}-${'x'.repeat(12)}`;

/** The canonical `PayAtDoorEligibility` record, allowed. Since
 *  SELLER-TIER-WIRE-1 it is the ONLY thing `payAtDoorContext` may carry. */
const ELIGIBLE = {
  buyerRef: 'b1',
  state: 'allowed',
  buyerRefusalCount: 0,
  buyerRiskState: 'normal',
  requiredDeposit: 0,
} as const;

/* ═════════════════════════ issue · read · durability ══════════════════════ */

describe('CheckoutDO — a buyer-shaped request naming NO amount receives a reconciling quote', () => {
  it('POST /checkout/quote issues, and GET returns the SAME buyer view, byte-identical', async () => {
    const { slug, resellerId } = await seedShop('0001');
    const key = freshKey();
    const issued = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: key,
    });
    expect(issued.status).toBe(200);
    // the §5.4 baseline, to the franc: B 10 000 · C 1 000 · M 1 500 · D 1 000
    expect(issued.json['productSubtotal']).toBe(11_500);
    expect(issued.json['deliveryFee']).toBe(1_000);
    expect(issued.json['buyerTotal']).toBe(12_500);
    expect(issued.json['amountPaidAtCheckout']).toBe(12_500);
    expect(issued.json['amountDueAtDelivery']).toBe(0);
    expect(typeof issued.json['quoteId']).toBe('string');

    const read = await getQuote(issued.json['quoteId'] as string);
    expect(read.status).toBe(200);
    expect(read.text).toBe(issued.text); // byte-identical, not merely equal
  });

  it('THE RECONCILIATION IDENTITIES HOLD on the wire the buyer actually receives', async () => {
    const { slug, resellerId } = await seedShop('0002', 2_500);
    const q = (
      await postQuote({
        slug,
        pid: 'pv-checkout-1',
        paymentMode: 'FULL_PREPAY',
        zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId,
        requestKey: freshKey(),
      })
    ).json as Record<string, number>;
    expect(q['productSubtotal']! + q['deliveryFee']!).toBe(q['buyerTotal']!);
    expect(q['amountPaidAtCheckout']! + q['amountDueAtDelivery']!).toBe(q['buyerTotal']!);
    expect(q['productSubtotal']).toBe(12_500); // B 10 000 + M 2 500, her signed price
  });

  it('DURABLE ACROSS RESTART: the stored quote reads back byte-identical after a process death', async () => {
    const { slug, resellerId } = await seedShop('0003');
    const issued = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
    });
    expect(issued.status).toBe(200);
    const id = issued.json['quoteId'] as string;

    await restart();

    const after = await getQuote(id);
    expect(after.status).toBe(200);
    expect(after.text).toBe(issued.text);
  });

  it('an UNKNOWN quote id is the honest 404 — never an empty or invented quote', async () => {
    const missing = await getQuote('quote-jamais-emis-0001');
    expect(missing.status).toBe(404);
    expect(missing.json['error']).toBe('not_found');
  });
});

/* ═══════════════════ idempotency — the no-duplicate foundation ════════════ */

describe('CheckoutDO — one request key, one quote, forever', () => {
  it('the SAME requestKey returns the SAME quote id, byte-identical, ACROSS A RESTART', async () => {
    const { slug, resellerId } = await seedShop('0004');
    const key = freshKey();
    const body = {
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: key,
    };
    const first = await postQuote(body);
    expect(first.status).toBe(200);

    const replay = await postQuote(body);
    expect(replay.status).toBe(200);
    expect(replay.text).toBe(first.text); // not a second quote — the SAME one

    await restart();

    const afterCrash = await postQuote(body);
    expect(afterCrash.status).toBe(200);
    expect(afterCrash.json['quoteId']).toBe(first.json['quoteId']);
    expect(afterCrash.text).toBe(first.text);
  });

  it('a key already used for one product IGNORES a later, different request — the frozen quote wins', async () => {
    const a = await seedShop('0005', 1_500);
    const b = await seedShop('0006', 4_000);
    const key = freshKey();
    const first = await postQuote({
      slug: a.slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: a.resellerId,
      requestKey: key,
    });
    expect(first.status).toBe(200);
    const second = await postQuote({
      slug: b.slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: b.resellerId,
      requestKey: key,
    });
    // EVOLVED (CTO, verifier finding): the key IS the checkout attempt, so it
    // still can only ever name one quote — but a DIFFERENT intent under it is
    // now REFUSED BY NAME instead of being handed the first quote. The old
    // behaviour returned 200 with shop A's price for a request about shop B,
    // and the buyer view carries no shop or product reference with which to
    // notice. Serving one shop's amount for another shop's question is the
    // wrong answer to give quietly on a money route.
    expect(second.status).toBe(409);
    expect(second.json['error']).toBe('request_key_reused');
    expect(second.json['productSubtotal']).toBeUndefined(); // no price crossed over
    // …and shop A's quote is untouched by the attempt
    const still = await getQuote(first.json['quoteId'] as string);
    expect(still.text).toBe(first.text);
  });

  it('CONCURRENT twins on one key produce exactly ONE quote', async () => {
    const { slug, resellerId } = await seedShop('0007');
    const key = freshKey();
    const body = {
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: key,
    };
    const [x, y, z] = await Promise.all([postQuote(body), postQuote(body), postQuote(body)]);
    expect([x!.status, y!.status, z!.status]).toEqual([200, 200, 200]);
    expect(new Set([x!.json['quoteId'], y!.json['quoteId'], z!.json['quoteId']]).size).toBe(1);
    expect(y!.text).toBe(x!.text);
    expect(z!.text).toBe(x!.text);
  });

  it('THE IMMUTABLE STORE REFUSES A SECOND PUT — the DO answers `quote_id_exists`, never an overwrite', async () => {
    const { slug, resellerId } = await seedShop('0008');
    const issued = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
    });
    const id = issued.json['quoteId'] as string;

    // Reach the DO instance DIRECTLY, bypassing the router's key indirection, so
    // the second put is a genuine second put on an occupied id.
    const ns = await mf.getDurableObjectNamespace('CHECKOUT');
    const stub = ns.get(ns.idFromName(id));
    const second = await stub.fetch('https://do/entry/issue', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: id,
        request: {
          slug,
          pid: 'pv-checkout-1',
          paymentMode: 'FULL_PREPAY',
          zoneTo: 'Ouagadougou',
          attributionResellerId: resellerId,
          requestKey: freshKey(),
        },
        entry: null,
        delivery: null,
      }),
    });
    expect(second.status).toBe(422); // refused before it could even reach the store
    // …and a WELL-FORMED second issue on the same id is refused by the store itself
    const listing = await (
      await (await mf.getDurableObjectNamespace('LISTING')).get(
        (await mf.getDurableObjectNamespace('LISTING')).idFromName(`lst-checkout-0008`),
      ).fetch('https://do/entry/economics')
    ).json();
    const wellFormed = await stub.fetch('https://do/entry/issue', {
      method: 'POST',
      body: JSON.stringify({
        quoteId: id,
        request: {
          slug,
          pid: 'pv-checkout-1',
          paymentMode: 'FULL_PREPAY',
          zoneTo: 'Ouagadougou',
          attributionResellerId: resellerId,
          requestKey: freshKey(),
        },
        entry: listing,
        delivery: { zoneFrom: 'Ouagadougou', zoneTo: 'Ouagadougou', fee: 1_000, serviceable: true, version: 't' },
      }),
    });
    expect(wellFormed.status).toBe(409);
    expect(((await wellFormed.json()) as { reason: string }).reason).toBe('quote_id_exists');

    // the stored quote is untouched by either attempt
    const still = await getQuote(id);
    expect(still.text).toBe(issued.text);
  });
});

/* ═══════════════════════════ named refusals ═══════════════════════════════ */

describe('CheckoutDO — every failure is a NAMED refusal, and nothing is persisted', () => {
  it('AN UNSERVICEABLE ZONE REFUSES, and no quote is persisted under that key', async () => {
    const { slug, resellerId } = await seedShop('0009');
    const key = freshKey();
    const refused = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Bobo-Dioulasso',
      attributionResellerId: resellerId,
      requestKey: key,
    });
    expect(refused.status).toBe(422);
    expect(refused.json['error']).toBe('delivery_not_serviceable');
    expect(refused.json['quoteId']).toBeUndefined();
    expect(refused.json['buyerTotal']).toBeUndefined();

    await restart(); // and it stayed un-persisted across a process death

    // THE SAME KEY still works: nothing was stored, so the retry issues cleanly.
    const retry = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: key,
    });
    expect(retry.status).toBe(200);
    expect(retry.json['buyerTotal']).toBe(12_500);
  });

  it('an UNKNOWN shop and an UNKNOWN product answer the SAME 404 — no existence oracle', async () => {
    const { slug, resellerId } = await seedShop('0010');
    const unknownShop = await postQuote({
      slug: 'aucune-boutique-9999',
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
    });
    const unknownPid = await postQuote({
      slug,
      pid: 'pv-jamais-vu',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
    });
    expect(unknownShop.status).toBe(404);
    expect(unknownPid.status).toBe(404);
    expect(unknownShop.json['error']).toBe('listing_unknown');
    expect(unknownPid.json['error']).toBe('listing_unknown');
  });

  it('NO LOCKED RESELLER ⇒ 422 attribution_missing (SP-I09) — it never defaults to anyone', async () => {
    const { slug } = await seedShop('0011');
    const refused = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      requestKey: freshKey(),
    });
    expect(refused.status).toBe(422);
    expect(refused.json['error']).toBe('attribution_missing');
  });

  it('an unknown payment mode is 422, and an INELIGIBLE door request refuses without leaking why', async () => {
    // SELLER-TIER-WIRE-1 — the shop sells the UNATTESTED supplier's product, so
    // the projection this Worker reads carries `sellerTier: 'provisional'`. The
    // buyer's body cannot say otherwise: the field left the wire.
    const { slug, resellerId, pid } = await seedShop('0012', 1_500, 'pv-checkout-prov');
    const base = { slug, pid, zoneTo: 'Ouagadougou', attributionResellerId: resellerId };
    const bogus = await postQuote({ ...base, paymentMode: 'CASH_ON_TRUST', requestKey: freshKey() });
    expect(bogus.status).toBe(422);
    expect(bogus.json['error']).toBe('payment_mode_unknown');

    // The ZONE no longer refuses anyone (founder ruling 2026-08-01), so this
    // drives one of the OTHER four §6.1 conditions — an unverified seller.
    const door = await postQuote({
      ...base,
      paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
      requestKey: freshKey(),
      payAtDoorContext: { eligibility: ELIGIBLE },
    });
    expect(door.status).toBe(422);
    expect(door.json['error']).toBe('pay_at_door_not_eligible');
    // the §6.1 OPS DETAIL never reaches the buyer
    expect(door.text.includes('policyVersion')).toBe(false);
    expect(door.text.includes('seller_tier_below_minimum')).toBe(false);
  });

  /**
   * ═══ SELLER-TIER-WIRE-1 — THE GATE STOPPED BEING SELF-DECLARED ═══
   *
   * Both facts §6.1 measures a seller by used to arrive in the buyer's own JSON.
   * They are now REFUSED on the allowlist, the same way `policy` always has
   * been — not dropped, because a caller who is silently ignored never learns
   * the server stopped believing them.
   */
  it('a caller can no longer ANSWER its own §6.1 gate — `sellerTier` and `category` are refused on the wire', async () => {
    const { slug, resellerId, pid } = await seedShop('0023');
    for (const field of ['sellerTier', 'category']) {
      const res = await postQuote({
        slug,
        pid,
        paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
        zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId,
        requestKey: freshKey(),
        payAtDoorContext: { eligibility: ELIGIBLE, [field]: 'verified' },
      });
      expect(res.status, field).toBe(400);
      expect(res.json['error']).toBe('unknown_field');
      expect(res.json['field']).toBe(`payAtDoorContext.${field}`);
    }
  });

  it('THE SAME BUYER REQUEST, TWO SUPPLIERS, TWO VERDICTS — the tier now comes from the projection', async () => {
    // The proof that the decision MOVED rather than being spelled differently:
    // byte-identical door context, two shops, and the only difference is which
    // supplier's product each one sells.
    const attested = await seedShop('0024');
    const unattested = await seedShop('0025', 1_500, 'pv-checkout-prov');
    const ask = (s: { slug: string; resellerId: string; pid: string }) =>
      postQuote({
        slug: s.slug,
        pid: s.pid,
        paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
        zoneTo: 'Ouagadougou',
        attributionResellerId: s.resellerId,
        requestKey: freshKey(),
        payAtDoorContext: { eligibility: ELIGIBLE },
      });
    const yes = await ask(attested);
    const no = await ask(unattested);
    expect(yes.status, yes.text).toBe(200);
    expect(no.status, no.text).toBe(422);
    expect(no.json['error']).toBe('pay_at_door_not_eligible');
  });

  /**
   * ═══ THE WALK THAT WAS IMPOSSIBLE UNTIL THE FOUNDER OPENED THE ZONES ═══
   *
   * Every SP4.2 entry until now carried the same caveat: « no Option-B order
   * can be created through the public routes », because the empty zone
   * allowlist refused every pay-at-door quote. That caveat is now dead, and
   * this is the test that kills it — an Option-B QUOTE, issued by the REAL
   * Worker, over HTTP, on the SHIPPED policy.
   */
  it('SP4.2 — an Option-B quote is now ISSUABLE over HTTP, split D-now / product-at-door', async () => {
    const { slug, resellerId, pid } = await seedShop('0112');
    const door = await postQuote({
      slug,
      pid,
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
      requestKey: freshKey(),
      // SELLER-TIER-WIRE-1 — `eligibility` alone. The tier and the category the
      // gate measures are read from the supply projection, server-side.
      payAtDoorContext: { eligibility: ELIGIBLE },
    });
    expect(door.status, door.text).toBe(200);
    // §5.5 Option B, to the franc: she pays the DELIVERY FEE now and the
    // PRODUCT at the door, and the two still make the whole bill.
    const paidNow = door.json['amountPaidAtCheckout'] as number;
    const atDoor = door.json['amountDueAtDelivery'] as number;
    expect(paidNow).toBe(door.json['deliveryFee']);
    expect(atDoor).toBe(door.json['productSubtotal']);
    expect(paidNow + atDoor).toBe(door.json['buyerTotal']);
    // …and no economics rode out with it.
    expect(door.text.includes('sellerBasePrice')).toBe(false);
    expect(door.text.includes('resellerNet')).toBe(false);
  });

  it('A PRICE THE BUYER NAMES IS REFUSED OUTRIGHT — unknown fields are never ignored', async () => {
    const { slug, resellerId } = await seedShop('0013');
    for (const extra of [
      { buyerTotal: 1 },
      { productSubtotal: 1 },
      { deliveryFee: 0 },
      { sellerBasePrice: 1 },
      { amountDueAtDelivery: 0 },
    ]) {
      const res = await postQuote({
        slug,
        pid: 'pv-checkout-1',
        paymentMode: 'FULL_PREPAY',
        zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId,
        requestKey: freshKey(),
        ...extra,
      } as never);
      expect(res.status).toBe(400);
      expect(res.json['error']).toBe('unknown_field');
    }
  });

  it('the §6.1 POLICY is unreachable from the wire — a caller cannot loosen its own gate', async () => {
    const { slug, resellerId } = await seedShop('0014');
    const res = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
      payAtDoorContext: {
        eligibility: ELIGIBLE,
        policy: { version: 'mine', priceCapFcfa: 9_999_999, minSellerTier: 'verified', inspectableCategories: ['shoes'], networkReliableZones: ['Ouagadougou'] },
      },
    });
    expect(res.status).toBe(400);
    expect(res.json['error']).toBe('unknown_field');
    expect(res.json['field']).toBe('payAtDoorContext.policy');
  });

  it('a mis-shaped request key is refused before any object is created', async () => {
    const { slug, resellerId } = await seedShop('0015');
    for (const requestKey of ['short', '', 'has spaces in it here', 'a'.repeat(129)]) {
      const res = await postQuote({
        slug,
        pid: 'pv-checkout-1',
        paymentMode: 'FULL_PREPAY',
        zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId,
        requestKey,
      });
      expect(res.status).toBe(400);
      expect(res.json['field']).toBe('requestKey');
    }
  });
});

/* ══════════════════ the buyer wire — SP-I03 on the real bytes ═════════════ */

describe('CheckoutDO — the emitted bytes carry no supplier economics (SP-I03)', () => {
  it('the response keys ARE the allowlist and no banned name appears in the raw body', async () => {
    const { slug, resellerId } = await seedShop('0016');
    const issued = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
    });
    expect(Object.keys(issued.json).sort()).toEqual(
      [
        'amountDueAtDelivery',
        'amountPaidAtCheckout',
        'buyerTotal',
        'deliveryFee',
        'expiry',
        'paymentMode',
        'productSubtotal',
        'quoteId',
      ].sort(),
    );
    for (const banned of [
      'sellerBasePrice',
      'sellerFundedCommission',
      'sellerNet',
      'sellerPlatformFee',
      'resellerNet',
      'resellerGross',
      'platformProductFeeRevenue',
      'resellerCommission',
      'basePrice',
      'markup',
    ]) {
      expect(issued.text.includes(banned)).toBe(false);
    }
    // the LISTING ID never reaches the buyer wire (founder standing law)
    expect(issued.text.includes('lst-checkout-0016')).toBe(false);
    expect(issued.text.includes(resellerId)).toBe(false);
    // and the supplier's base is not recoverable: 10 000 appears nowhere
    expect(issued.text.includes('10000')).toBe(false);
  });

  it('the buyer read carries the EXACT-ORIGIN CORS header, never a wildcard', async () => {
    const { slug, resellerId } = await seedShop('0017');
    const issued = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
    });
    expect(issued.headers.get('access-control-allow-origin')).toBe('https://beurni2.github.io');
    expect(issued.headers.get('access-control-allow-origin')).not.toBe('*');

    const preflight = await mf.dispatchFetch('http://c/checkout/quote', { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://beurni2.github.io');
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });
});

/* ═══════════════════════ the public/gated boundary ════════════════════════ */

describe('CheckoutDO — public by design, and it opens nothing else', () => {
  it('the checkout POST answers WITHOUT a key, while every other write stays 401', async () => {
    const { slug, resellerId } = await seedShop('0018');
    const noKey = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
    });
    expect(noKey.status).toBe(200); // a buyer holds no key, by design

    // …and the exemption did not widen anything else on this Worker
    const sf = await mf.dispatchFetch('http://c/storefronts', { method: 'POST', body: '{}' });
    expect(sf.status).toBe(401);
    const lst = await mf.dispatchFetch('http://c/listings', { method: 'POST', body: '{}' });
    expect(lst.status).toBe(401);
    const listingsRead = await mf.dispatchFetch('http://c/listings/lst-checkout-0018', { method: 'GET' });
    expect(listingsRead.status).toBe(401);
    // the new economics read is behind the SAME gate — it carries M and C
    const econ = await mf.dispatchFetch('http://c/listings/by-pid/sf-checkout-0018/pv-checkout-1/economics', {
      method: 'GET',
    });
    expect(econ.status).toBe(401);
  });

  it('a NEIGHBOURING checkout path is NOT exempt — the exemption matches exactly, never by prefix', async () => {
    for (const path of ['/checkout/quotes', '/checkout/quote/abc/confirm', '/checkout', '/checkout/quote/a/b/c']) {
      const res = await mf.dispatchFetch(`http://c${path}`, { method: 'POST', body: '{}' });
      expect(res.status).toBe(401);
    }
    // …and a non-exempt METHOD on an exempt path is still gated
    const del = await mf.dispatchFetch('http://c/checkout/quote/abc', { method: 'DELETE' });
    expect(del.status).toBe(401);
  });

  // CTO REVIEW (SP3.2a) — `slug` and `pid` are the only buyer-supplied values
  // that reach a URL path (the internal authority reads). A dot-segment must be
  // UNREPRESENTABLE, not merely unreachable: today `encodeURIComponent` escapes
  // slashes and the internal reads are GET-only, so nothing mutating is
  // reachable — but that rests on the router's current shape, and this is a
  // money path.
  it('a dot-segment or a path character in slug/pid is REFUSED at the wire, never steered into an internal read', async () => {
    const { resellerId } = await seedShop('0031');
    const hostile = ['..', '.', '../..', 'a/../b', 'a%2Fb', 'a b', '../../entry/delete', ''];
    for (const bad of hostile) {
      const bySlug = await postQuote({
        slug: bad,
        pid: 'pv-checkout-1',
        paymentMode: 'FULL_PREPAY',
        zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId,
        requestKey: freshKey(),
      });
      expect(bySlug.status, `slug ${JSON.stringify(bad)}`).toBe(400);
      expect(bySlug.json['error'], `slug ${JSON.stringify(bad)}`).toBe('bad_field');

      const byPid = await postQuote({
        slug: `check-0031`,
        pid: bad,
        paymentMode: 'FULL_PREPAY',
        zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId,
        requestKey: freshKey(),
      });
      expect(byPid.status, `pid ${JSON.stringify(bad)}`).toBe(400);
      expect(byPid.json['error'], `pid ${JSON.stringify(bad)}`).toBe('bad_field');
    }
  });

  it('the id alphabet still admits every REAL slug and productVersionId shape', async () => {
    // Regression guard on the tightening itself: a charset pin that refused a
    // real id would take the whole money path down. These are the live shapes.
    const { slug, resellerId } = await seedShop('0032');
    const ok = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
    });
    expect(ok.status).toBe(200);
    // …and the underscore/digit forms the repo also mints are accepted at the
    // wire (they refuse later as unknown listings, never as malformed input).
    for (const pid of ['pv_1', 'p1', 'pv-bazin-0001']) {
      const res = await postQuote({
        slug,
        pid,
        paymentMode: 'FULL_PREPAY',
        zoneTo: 'Ouagadougou',
        attributionResellerId: resellerId,
        requestKey: freshKey(),
      });
      expect(res.status, pid).not.toBe(400);
    }
  });
});

/* ═════════════════════════════ the reservation ════════════════════════════ */

describe('CheckoutDO — the reservation is atomic, short, and durable', () => {
  async function reserve(id: string, commandId: string, holderRef = 'buyer-1') {
    const res = await mf.dispatchFetch(`http://c/checkout/quote/${encodeURIComponent(id)}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId, holderRef }),
    });
    const text = await res.text();
    return { status: res.status, text, json: safeJson(text) };
  }

  async function quoteFor(n: string): Promise<string> {
    const { slug, resellerId } = await seedShop(n);
    const issued = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: resellerId,
      requestKey: freshKey(),
    });
    if (issued.status !== 200) throw new Error(`setup: quote ${issued.status} ${issued.text}`);
    return issued.json['quoteId'] as string;
  }

  it('TWO CONCURRENT RESERVES ⇒ EXACTLY ONE reserved, the other refused by name', async () => {
    const id = await quoteFor('0019');
    const [a, b] = await Promise.all([reserve(id, 'cmd-a'), reserve(id, 'cmd-b')]);
    const codes = [a!.status, b!.status].sort();
    expect(codes).toEqual([200, 409]);
    const won = a!.status === 200 ? a! : b!;
    const lost = a!.status === 200 ? b! : a!;
    expect(won.json['status']).toBe('reserved');
    expect(typeof won.json['reservationId']).toBe('string');
    expect(lost.json['error']).toBe('already_reserved');
  });

  it('the reservation SURVIVES A RESTART and the same command replays to the same hold', async () => {
    const id = await quoteFor('0020');
    const first = await reserve(id, 'cmd-durable');
    expect(first.status).toBe(200);
    const reservationId = first.json['reservationId'];

    await restart();

    const replay = await reserve(id, 'cmd-durable');
    expect(replay.status).toBe(200);
    expect(replay.json['reservationId']).toBe(reservationId); // the SAME hold, not a new one
    // …and a DIFFERENT command still cannot take a second hold after the crash
    const other = await reserve(id, 'cmd-other');
    expect(other.status).toBe(409);
  });

  it('the reserve response carries THE STATE ONLY — not one franc rides on it', async () => {
    const id = await quoteFor('0021');
    const res = await reserve(id, 'cmd-state');
    expect(Object.keys(res.json).sort()).toEqual(['expiresAt', 'holdMs', 'reservationId', 'status'].sort());
    expect(res.json['holdMs']).toBe(2 * 60 * 1000); // the vault's short TTL
    for (const money of ['buyerTotal', 'productSubtotal', 'sellerNet', 'deliveryFee', 'amountPaid']) {
      expect(res.text.includes(money)).toBe(false);
    }
  });

  it('reserving a quote that does not exist is the honest 404 — never a hold on nothing', async () => {
    const res = await reserve('quote-jamais-emis-0002', 'cmd-x');
    expect(res.status).toBe(404);
    expect(res.json['error']).toBe('not_found');
  });

  it('a mis-shaped reserve body is refused before the object is touched', async () => {
    const id = await quoteFor('0022');
    const extra = await mf.dispatchFetch(`http://c/checkout/quote/${id}/reserve`, {
      method: 'POST',
      body: JSON.stringify({ commandId: 'c', holderRef: 'h', amount: 500 }),
    });
    expect(extra.status).toBe(400);
    expect(((await extra.json()) as { error: string }).error).toBe('unknown_field');
    // …and the quote is still unreserved, so a real reserve still wins
    const ok = await reserve(id, 'cmd-after-bad-shape');
    expect(ok.status).toBe(200);
  });
});

/* ═══════════ the verifier round: the payee, the 500s, the key binding ═══════ */

describe('CheckoutDO — the payee is bound to the listing, never named by the caller', () => {
  it('a request naming ANOTHER reseller, an INVENTED one, or platform/supplier is REFUSED', async () => {
    const { slug } = await seedShop('0041');
    const other = await seedShop('0042'); // a real, different reseller
    for (const claimed of [other.resellerId, 'rs-attacker-does-not-exist', 'platform', 'supplier']) {
      const res = await postQuote({
        slug,
        pid: 'pv-checkout-1',
        paymentMode: 'FULL_PREPAY',
        zoneTo: 'Ouagadougou',
        attributionResellerId: claimed,
        requestKey: freshKey(),
      });
      expect(res.status, claimed).toBe(422);
      expect(res.json['error'], claimed).toBe('attribution_mismatch');
      // …and NOTHING was persisted under that attempt
      expect(res.json['quoteId'], claimed).toBeUndefined();
    }
    // the truthful payee still prices normally
    const ok = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: 'rs-checkout-0041',
      requestKey: freshKey(),
    });
    expect(ok.status).toBe(200);
  });

  it('a whitespace-padded payee refuses BY NAME — never a 500 from the canon parse', async () => {
    const { slug } = await seedShop('0043');
    for (const padded of ['   ', ' rs-checkout-0043', 'rs-checkout-0043 ', '\trs-checkout-0043']) {
      const res = await postQuote({
        slug,
        pid: 'pv-checkout-1',
        paymentMode: 'FULL_PREPAY',
        zoneTo: 'Ouagadougou',
        attributionResellerId: padded,
        requestKey: freshKey(),
      });
      expect(res.status, JSON.stringify(padded)).toBe(422);
      expect(res.json['error'], JSON.stringify(padded)).toBe('attribution_mismatch');
    }
  });
});

describe('CheckoutDO — a malformed id in the path is a named refusal, not a 500', () => {
  it('a lone percent escape on the quote routes answers 400, never 500', async () => {
    const get = await mf.dispatchFetch('http://c/checkout/quote/%FF', { method: 'GET' });
    expect(get.status).toBe(400);
    const reserve = await mf.dispatchFetch('http://c/checkout/quote/%FF/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commandId: 'cmd-x', holderRef: 'hold-x' }),
    });
    expect(reserve.status).toBe(400);
  });
});

describe('CheckoutDO — one request key means ONE INTENT, not merely one quote', () => {
  it('the SAME key with a different shop, product or mode is REFUSED — never served the first price', async () => {
    const a = await seedShop('0044', 1_500);
    const b = await seedShop('0045', 4_000);
    const key = freshKey();
    const first = await postQuote({
      slug: a.slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: a.resellerId,
      requestKey: key,
    });
    expect(first.status).toBe(200);
    const firstTotal = first.json['buyerTotal'];

    // a DIFFERENT shop under the same key — the defect was: 200 with shop A's price
    const otherShop = await postQuote({
      slug: b.slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: b.resellerId,
      requestKey: key,
    });
    expect(otherShop.status).toBe(409);
    expect(otherShop.json['error']).toBe('request_key_reused');
    expect(otherShop.json['buyerTotal']).toBeUndefined();

    // a different MODE under the same key
    const otherMode = await postQuote({
      slug: a.slug,
      pid: 'pv-checkout-1',
      paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
      zoneTo: 'Ouagadougou',
      attributionResellerId: a.resellerId,
      requestKey: key,
    });
    expect(otherMode.status).toBe(409);

    // …while the IDENTICAL intent is still idempotent, across a restart
    await restart();
    const replay = await postQuote({
      slug: a.slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: a.resellerId,
      requestKey: key,
    });
    expect(replay.status).toBe(200);
    expect(replay.json['buyerTotal']).toBe(firstTotal);
    expect(replay.text).toBe(first.text); // byte-identical
  });
});

describe('CheckoutDO — the intent lives with the quote, so a RACE cannot cross two buyers', () => {
  /**
   * REGRESSION (verifier BLOCKER, round 3). The intent used to live on the key
   * POINTER while the quote lived in another object, so the router had to read
   * one and write the other: two concurrent requests could interleave between
   * those steps and a buyer was served ANOTHER SHOP'S price — at 200, durably,
   * surviving a restart. The intent now rides beside the quote's bytes, so the
   * comparison is a single-object read.
   */
  it('two DIFFERENT intents racing on one key: one issues, the other is refused — never given the winner\'s price', async () => {
    const a = await seedShop('0051', 1_500); // true total 12 500
    const b = await seedShop('0052', 4_000); // true total 15 000
    const key = freshKey();
    const mk = (shop: { slug: string; resellerId: string }) => ({
      slug: shop.slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: shop.resellerId,
      requestKey: key,
    });

    // six overlapping requests, both intents interleaved
    const results = await Promise.all([
      postQuote(mk(a)), postQuote(mk(b)), postQuote(mk(a)),
      postQuote(mk(b)), postQuote(mk(a)), postQuote(mk(b)),
    ]);

    // NOBODY is served a total that is not their own shop's.
    const aTotals = [results[0], results[2], results[4]].filter((r) => r.status === 200);
    const bTotals = [results[1], results[3], results[5]].filter((r) => r.status === 200);
    for (const r of aTotals) expect(r.json['buyerTotal'], 'shop A got a foreign price').toBe(12_500);
    for (const r of bTotals) expect(r.json['buyerTotal'], 'shop B got a foreign price').toBe(15_000);
    // exactly one intent may hold the key; the other is refused BY NAME
    expect(aTotals.length === 0 || bTotals.length === 0).toBe(true);
    for (const r of results) {
      if (r.status !== 200) expect([409, 422]).toContain(r.status);
    }

    // …and the loser stays refused SEQUENTIALLY, and after a real restart —
    // never quietly served the winner's quote.
    const loser = aTotals.length === 0 ? a : b;
    const winnerTotal = aTotals.length === 0 ? 15_000 : 12_500;
    const after = await postQuote(mk(loser));
    expect(after.status).toBe(409);
    expect(after.json['buyerTotal']).toBeUndefined();
    await restart();
    const afterRestart = await postQuote(mk(loser));
    expect(afterRestart.status).toBe(409);
    expect(afterRestart.json['buyerTotal']).toBeUndefined();
    expect(afterRestart.json['buyerTotal']).not.toBe(winnerTotal);
  });

  it('a key whose ONLY attempt refused stays usable for every refusal kind', async () => {
    const shop = await seedShop('0053');
    const base = {
      slug: shop.slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: shop.resellerId,
    };
    // each refusal kind, then the SAME key used for a corrected request
    const kinds = [
      { ...base, zoneTo: 'Bobo-Dioulasso' }, // delivery_not_serviceable
      { ...base, attributionResellerId: 'rs-not-hers' }, // attribution_mismatch
      { ...base, pid: 'pv-does-not-exist' }, // listing_unknown
    ];
    for (const bad of kinds) {
      const key = freshKey();
      const refused = await postQuote({ ...bad, requestKey: key });
      expect(refused.status, JSON.stringify(bad)).not.toBe(200);
      const corrected = await postQuote({ ...base, requestKey: key });
      expect(corrected.status, `retry after ${JSON.stringify(bad)}`).toBe(200);
      expect(corrected.json['buyerTotal']).toBe(12_500);
    }
  });
});

describe('CheckoutDO — an EMPTY payee is « nobody is locked », not a malformed body', () => {
  it('attributionResellerId "" refuses with the NAMED attribution_missing (verifier finding)', async () => {
    const { slug } = await seedShop('0054');
    const res = await postQuote({
      slug,
      pid: 'pv-checkout-1',
      paymentMode: 'FULL_PREPAY',
      zoneTo: 'Ouagadougou',
      attributionResellerId: '',
      requestKey: freshKey(),
    });
    expect(res.status).toBe(422);
    expect(res.json['error']).toBe('attribution_missing');
    // …and a non-string is still a shape error, not a commerce refusal
    const bad = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        pid: 'pv-checkout-1',
        paymentMode: 'FULL_PREPAY',
        zoneTo: 'Ouagadougou',
        attributionResellerId: 42,
        requestKey: freshKey(),
      }),
    });
    expect(bad.status).toBe(400);
  });
});

/**
 * SP3.2b — THE SHARED WIRE FIXTURE, PINNED IN BOTH HALVES.
 *
 * `gates/fixtures/buyer-quote-request.json` is the EXACT body the buyer PWA
 * POSTs. The buyer half asserts `httpQuotePort` sends those keys and values and
 * nothing else; THIS half POSTs the same bytes at the real Worker on real
 * workerd. If the two ever drift — a renamed field, a dropped key, a zone the
 * client composes differently — one of the two must go red.
 *
 * It is also the end-to-end proof of the delivery fix: the shop's zone is a
 * REAL one (« Rood Woko · Ouagadougou ») and the destination is a REAL quartier
 * (« Gounghin, Ouagadougou »). Before the city normalisation this exact request
 * answered `delivery_not_serviceable` 422.
 */
describe('CheckoutDO — the SHARED buyer wire fixture answers a reconciling quote (SP3.2b)', () => {
  const FIXTURE = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', '..', 'gates', 'fixtures', 'buyer-quote-request.json'), 'utf8'),
  ) as Record<string, string>;

  /** The shop the fixture names — HER short code derives the fixture's slug,
   *  HER resellerId is the fixture's locked payee, HER zone is a real one. */
  async function seedFixtureShop(): Promise<void> {
    const created = await mf.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({
        commandId: 'cmd-create-fixture',
        id: 'sf-checkout-fixture',
        resellerId: FIXTURE['attributionResellerId'],
        shortCode: FIXTURE['slug']!.toUpperCase(),
        name: 'Chez Aïcha Mode',
        zone: 'Rood Woko · Ouagadougou',
        category: 'Général',
        correlationId: 'corr-fixture',
        at: T0,
      }),
    });
    if (created.status !== 200) throw new Error(`fixture seed: storefront create ${created.status} ${await created.text()}`);
    const pub = await mf.dispatchFetch('http://c/listings', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({
        commandId: 'cmd-listing-fixture',
        listingId: 'lst-checkout-fixture',
        storefrontId: 'sf-checkout-fixture',
        resellerId: FIXTURE['attributionResellerId'],
        productVersionId: FIXTURE['pid'],
        offerVersion: 'ov-checkout-1',
        markup: 1_500,
        correlationId: 'corr-fixture',
        at: T0,
      }),
    });
    const decision = (await pub.json()) as { status?: string };
    if (decision.status !== 'published') throw new Error(`fixture seed: publish ${JSON.stringify(decision)}`);
  }

  it('the fixture body is EXACTLY the six allowlisted keys — an extra one would be a 400 by design', () => {
    expect(Object.keys(FIXTURE)).toEqual([
      'slug',
      'pid',
      'paymentMode',
      'zoneTo',
      'attributionResellerId',
      'requestKey',
    ]);
    // NO AMOUNT MAY APPEAR ON THIS WIRE — not even « for display ».
    for (const banned of ['buyerTotal', 'productSubtotal', 'deliveryFee', 'amountPaidAtCheckout', 'price', 'customerPriceFcfa']) {
      expect(Object.keys(FIXTURE)).not.toContain(banned);
    }
    // …and the destination is a real quartier, not a bare city name.
    expect(FIXTURE['zoneTo']).toBe('Gounghin, Ouagadougou');
  });

  it('POSTing the fixture VERBATIM answers 200 with a view that reconciles to the franc', async () => {
    await seedFixtureShop();
    const res = await mf.dispatchFetch('http://c/checkout/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // THE FIXTURE'S OWN BYTES — not a re-built object.
      body: readFileSync(join(import.meta.dirname, '..', '..', '..', 'gates', 'fixtures', 'buyer-quote-request.json'), 'utf8'),
    });
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const q = JSON.parse(text) as Record<string, number | string>;
    // §5.4 baseline: B 10 000 · C 1 000 · M 1 500 · D 1 000
    expect(q['productSubtotal']).toBe(11_500);
    expect(q['deliveryFee']).toBe(1_000);
    expect(q['buyerTotal']).toBe(12_500);
    // THE IDENTITY, ON THE WIRE THE BUYER ACTUALLY RECEIVES, TO THE FRANC.
    expect((q['productSubtotal'] as number) + (q['deliveryFee'] as number)).toBe(q['buyerTotal']);
    expect((q['amountPaidAtCheckout'] as number) + (q['amountDueAtDelivery'] as number)).toBe(q['buyerTotal']);
    expect(q['amountPaidAtCheckout']).toBe(12_500);
    expect(q['amountDueAtDelivery']).toBe(0);
  });

  it('THE DEFECT THIS SLICE CLOSED: the same request with a NON-Ouaga quartier is still refused by name', async () => {
    const res = await postQuote({
      ...(FIXTURE as unknown as QuoteBody),
      zoneTo: 'Sector 15, Bobo-Dioulasso',
      requestKey: freshKey(),
    });
    expect(res.status).toBe(422);
    expect(res.json['error']).toBe('delivery_not_serviceable');
    expect(res.json['buyerTotal']).toBeUndefined(); // no price crossed over
  });
});

/* ═══════ SELLER-TIER-WIRE-1 — THE FAIL-CLOSED READ, THROUGH THE REAL WORKER ═══════
 *
 * A VERIFIER PROVED THIS SUITE COULD NOT SEE THE PROPERTY IT CLAIMED. Replacing
 * the router's `.catch(() => undefined)` with a fail-OPEN catch that fabricated
 * `{category:'fashion_bags_fabrics', sellerTier:'verified'}` left **388/388
 * green**: a supply-read failure inventing a verified supplier passed CI.
 *
 * The root cause was structural, not an oversight of one assertion. The suite's
 * `OFFER` binding always answers, and `seedShop` cannot publish a pid the
 * producer does not know (publish signs HER price from that same wire), so an
 * UNDESCRIBABLE product could not be constructed at all. DoD #3 — « absence
 * refuses, never defaults » — was asserted only where `supply: undefined` is
 * handed straight into the pure core.
 *
 * These cases give the Worker a producer that FAILS, and a Worker with no
 * producer at all, and drive a real door request at each.
 */
describe('CheckoutDO — a supply read that FAILS refuses Option B, and never invents a seller', () => {
  /** A Worker whose OFFER answers the publish read (so a listing can exist) and
   *  then breaks for the CHECKOUT read. `mode` picks how it breaks. */
  function makeBroken(mode: 'throw' | 'five-hundred' | 'stale', dir: string): Miniflare {
    let publishDone = false;
    return new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      durableObjects: { STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO', ORDER: 'OrderDO' },
      durableObjectsPersist: dir,
      bindings: { STOREFRONT_WRITE_SECRET: WRITE_SECRET },
      serviceBindings: {
        OFFER: async (request: Request) => {
          const single = /^\/supply-projection\/([^/]+)$/.exec(new URL(request.url).pathname);
          if (!single) return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
          const value = SUPPLY.find((v) => v.productVersionId === decodeURIComponent(single[1]!));
          if (value === undefined) {
            return Response.json({ service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' }, { status: 404 });
          }
          // The FIRST read is the publish signing read — it must succeed or no
          // listing exists to quote. Every read after it is the checkout read.
          if (!publishDone) {
            publishDone = true;
            return Response.json({ version: 1, asOf: new Date().toISOString(), value });
          }
          if (mode === 'throw') throw new Error('boutik is unreachable');
          if (mode === 'five-hundred') return new Response('upstream exploded', { status: 500 });
          // STALE: a well-formed, correct projection — just older than the
          // founder's 15-minute freshness bound. The nastiest case, because
          // nothing about it looks wrong.
          const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          return Response.json({ version: 1, asOf: old, value });
        },
      },
    });
  }

  /** No OFFER binding AT ALL — `resolveSupplySource` yields `AbsentSupplySource`,
   *  the honest state of an unconfigured Worker. */
  function makeUnconfigured(dir: string): Miniflare {
    return new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      durableObjects: { STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO', ORDER: 'OrderDO' },
      durableObjectsPersist: dir,
      bindings: { STOREFRONT_WRITE_SECRET: WRITE_SECRET },
    });
  }

  async function seedOn(inst: Miniflare, n: string): Promise<{ slug: string; resellerId: string }> {
    const shortCode = `BROKE-${n}`;
    const created = await inst.dispatchFetch('http://c/storefronts', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({
        commandId: `cmd-create-${n}`, id: `sf-broke-${n}`, resellerId: `rs-broke-${n}`, shortCode,
        name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général',
        correlationId: `corr-${n}`, at: T0,
      }),
    });
    if (created.status !== 200) throw new Error(`seed: storefront create ${created.status}`);
    const pub = await inst.dispatchFetch('http://c/listings', {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({
        commandId: `cmd-listing-${n}`, listingId: `lst-broke-${n}`, storefrontId: `sf-broke-${n}`,
        resellerId: `rs-broke-${n}`, productVersionId: 'pv-checkout-1', offerVersion: 'ov-checkout-1',
        markup: 1_500, correlationId: `corr-${n}`, at: T0,
      }),
    });
    const decision = (await pub.json()) as { status?: string };
    if (decision.status !== 'published') throw new Error(`seed: listing publish ${JSON.stringify(decision)}`);
    return { slug: shortCode.toLowerCase(), resellerId: `rs-broke-${n}` };
  }

  async function doorQuoteOn(inst: Miniflare, s: { slug: string; resellerId: string }, mode = 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') {
    const res = await inst.dispatchFetch('http://c/checkout/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: s.slug, pid: 'pv-checkout-1', paymentMode: mode, zoneTo: 'Ouagadougou',
        attributionResellerId: s.resellerId, requestKey: freshKey(),
        payAtDoorContext: { eligibility: ELIGIBLE },
      }),
    });
    const text = await res.text();
    return { status: res.status, text, json: safeJson(text) };
  }

  const dirs: string[] = [];
  const scratch = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'checkout-broke-'));
    dirs.push(d);
    return d;
  };
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it.each([
    ['UNREACHABLE (the fetch throws)', 'throw'],
    ['A 5xx FROM THE PRODUCER', 'five-hundred'],
    ['A STALE PROJECTION — correct data, past the freshness bound', 'stale'],
  ] as const)('%s ⇒ Option B is REFUSED by name, and no quote exists', async (_label, mode) => {
    const inst = makeBroken(mode, scratch());
    try {
      const shop = await seedOn(inst, '0001');
      const door = await doorQuoteOn(inst, shop);
      expect(door.status, door.text).toBe(422);
      expect(door.json['error']).toBe('pay_at_door_not_eligible');
      // NOTHING was invented on the way to that refusal, and the §6.1 ops detail
      // still does not reach the buyer.
      expect(door.text.includes('verified')).toBe(false);
      expect(door.text.includes('policyVersion')).toBe(false);
      expect(door.text.includes('amountDueAtDelivery')).toBe(false);
    } finally {
      await inst.dispose();
    }
  });

  it('AN UNCONFIGURED WORKER (no OFFER binding at all) refuses Option B — AbsentSupplySource describes nothing', async () => {
    const inst = makeUnconfigured(scratch());
    try {
      // No supply source ⇒ publish cannot sign a price either (PUBLISH-PRICE-1),
      // so the listing itself refuses — which is the same fail-closed answer one
      // step earlier. Assert what the buyer is actually told: never a quote.
      const shortCode = 'ABSENT-0001';
      await inst.dispatchFetch('http://c/storefronts', {
        method: 'POST', headers: authed,
        body: JSON.stringify({
          commandId: 'cmd-create-abs', id: 'sf-abs', resellerId: 'rs-abs', shortCode,
          name: 'Boutique du fondateur', zone: 'Ouagadougou', category: 'Général',
          correlationId: 'corr-abs', at: T0,
        }),
      });
      const door = await doorQuoteOn(inst, { slug: shortCode.toLowerCase(), resellerId: 'rs-abs' });
      expect([404, 422]).toContain(door.status);
      expect(door.text.includes('amountDueAtDelivery')).toBe(false);
      expect(door.text.includes('buyerTotal')).toBe(false);
    } finally {
      await inst.dispose();
    }
  });

  /**
   * THE AMPLIFICATION GUARD (verifier MAJOR 3). `payAtDoorContext` is a field
   * ANY caller may attach to ANY request. Gated on its presence alone, an
   * anonymous FULL_PREPAY request with an invented pid made this Worker fetch
   * boutik — carrying `SUPPLY_READ_SECRET` — for a product nobody sells. The
   * read is now additionally gated on the door payment mode AND on the listing
   * having RESOLVED, so it cannot be aimed at an arbitrary productVersionId.
   */
  it('AN UNAUTHENTICATED REQUEST CANNOT AIM THIS WORKER AT BOUTIK — no supply read for a non-door mode or an unknown listing', async () => {
    let reads = 0;
    const dir = scratch();
    const inst = new Miniflare({
      modules: true,
      scriptPath: SCRIPT,
      durableObjects: { STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO', ORDER: 'OrderDO' },
      durableObjectsPersist: dir,
      bindings: { STOREFRONT_WRITE_SECRET: WRITE_SECRET },
      serviceBindings: {
        OFFER: async (request: Request) => {
          const single = /^\/supply-projection\/([^/]+)$/.exec(new URL(request.url).pathname);
          if (!single) return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
          reads += 1;
          const value = SUPPLY.find((v) => v.productVersionId === decodeURIComponent(single[1]!));
          if (value === undefined) {
            return Response.json({ service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' }, { status: 404 });
          }
          return Response.json({ version: 1, asOf: new Date().toISOString(), value });
        },
      },
    });
    try {
      const shop = await seedOn(inst, '0002');
      const after = reads; // the publish signing read is legitimate; count from here

      // (a) FULL_PREPAY carrying a door context, invented pid — the attack shape.
      const bogus = await inst.dispatchFetch('http://c/checkout/quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: shop.slug, pid: 'pv-attacker-chosen-0001', paymentMode: 'FULL_PREPAY',
          zoneTo: 'Ouagadougou', attributionResellerId: shop.resellerId, requestKey: freshKey(),
          payAtDoorContext: { eligibility: ELIGIBLE },
        }),
      });
      expect(bogus.status).toBe(404);
      expect(reads, 'a FULL_PREPAY request must never reach boutik').toBe(after);

      // (b) The DOOR mode with an invented pid — the listing does not resolve,
      //     so the read is still not made.
      const unknownPid = await inst.dispatchFetch('http://c/checkout/quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: shop.slug, pid: 'pv-attacker-chosen-0002',
          paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR', zoneTo: 'Ouagadougou',
          attributionResellerId: shop.resellerId, requestKey: freshKey(),
          payAtDoorContext: { eligibility: ELIGIBLE },
        }),
      });
      expect(unknownPid.status).toBe(404);
      expect(reads, 'an unresolvable listing must never reach boutik').toBe(after);

      // (c) THE CONTROL — the gate is not simply off. A real door request on a
      //     real listing DOES read supply, exactly once.
      const real = await doorQuoteOn(inst, shop);
      expect(real.status, real.text).toBe(200);
      expect(reads, 'a genuine Option-B request reads supply once').toBe(after + 1);
    } finally {
      await inst.dispose();
    }
  });
});
