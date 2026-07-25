import { describe, expect, it } from 'vitest';
import { signPrice } from '../src/publish-price.js';
import { DurableListingStore, ListingStoreError, resolveListingStore } from '../src/listing-store.js';
import { absoluteAssetRefs } from '../src/customer-projection.js';

/**
 * PUBLISH-PRICE-1 · PRODUCT-MEDIA-BASE-1 · LISTING-SHIM-HONESTY-1 — the pure halves.
 *
 * The e2e proves these through the real bundled Worker on workerd; these prove the
 * decisions themselves, including the branches an e2e cannot reach cheaply (a DO
 * that answers 500, a body that is JSON but not a decision).
 */

describe('signPrice — the service signs HER price, the app never does', () => {
  const live = { basePrice: 8_000, offerVersion: 'ov-live' };

  it('SIGNS B + M from the LIVE base, and carries the LIVE offer version', () => {
    expect(signPrice(live, 1_200)).toEqual({
      status: 'signed',
      customerPriceFcfa: 9_200, // productSubtotal = B + M, to the franc
      offerVersion: 'ov-live',
    });
  });

  it('THE ARITHMETIC IS EXACTLY B + M — no rounding, no fee, no commission anywhere in it', () => {
    // The reseller FEE (20 % of C+M) and the seller fee (5 % of B) belong to the
    // waterfall, not to HER price. If either ever leaked into this function the
    // buyer would be charged a fee that is not hers to pay, so the identity is
    // asserted across a range rather than at one convenient point.
    for (const [base, markup] of [
      [0, 0],
      [1, 1],
      [10_000, 1_500],
      [7_333, 2_667],
      [999_999, 1],
    ] as const) {
      const out = signPrice({ basePrice: base, offerVersion: 'v' }, markup);
      expect(out.status).toBe('signed');
      expect(out.status === 'signed' && out.customerPriceFcfa).toBe(base + markup);
    }
  });

  it('A MARKUP OF ZERO IS LEGITIMATE — she may choose to add nothing', () => {
    const out = signPrice(live, 0);
    expect(out).toEqual({ status: 'signed', customerPriceFcfa: 8_000, offerVersion: 'ov-live' });
  });

  it('SUPPLY UNAVAILABLE ⇒ REFUSES, and there is no fallback branch to reach', () => {
    expect(signPrice(undefined, 1_200)).toEqual({ status: 'supply_unavailable' });
    // The founder's rule, asserted as behaviour: absence must never resolve to a
    // signed price by any route — not a zero base, not a default, not a cached one.
    expect(signPrice(undefined, 0)).toEqual({ status: 'supply_unavailable' });
  });

  it('REFUSES a markup that is not a usable amount — shape validation at the boundary', () => {
    for (const bad of [-1, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1500', null, undefined, {}]) {
      expect(signPrice(live, bad)).toEqual({ status: 'markup_invalid' });
    }
  });

  it('MARKUP IS CHECKED BEFORE SUPPLY — a bad markup is named as such even with no supply', () => {
    // Both are wrong; the caller is told the one it can fix without a retry.
    expect(signPrice(undefined, -5)).toEqual({ status: 'markup_invalid' });
  });
});

describe('absoluteAssetRefs — a relative ref must never reach a buyer', () => {
  const refs = ['media/hero-square/cap-1', 'media/proof/cap-1'];

  it('JOINS THE BASE, normalising one slash and never two', () => {
    expect(absoluteAssetRefs('https://m.example.dev', refs)).toEqual([
      'https://m.example.dev/media/hero-square/cap-1',
      'https://m.example.dev/media/proof/cap-1',
    ]);
    // trailing slash on the base, leading slash on the ref — both normalised
    expect(absoluteAssetRefs('https://m.example.dev/', ['/media/a'])).toEqual(['https://m.example.dev/media/a']);
    expect(absoluteAssetRefs('https://m.example.dev///', ['//media/a'])).toEqual(['https://m.example.dev/media/a']);
  });

  it('AN EMPTY OR UNSET BASE YIELDS [] — the honest « SANS PHOTO », never a bare ref', () => {
    // THE FAILURE THIS FORBIDS: falling through to the raw relative ref, which the
    // buyer renders into `src` and which then resolves against the PWA's own origin
    // — a broken image inside an otherwise-correct tile. `[]` is what makes the
    // designed no-image state fire, so a misconfiguration lands on the DESIGNED
    // state rather than on a half-rendered one.
    expect(absoluteAssetRefs('', refs)).toEqual([]);
    expect(absoluteAssetRefs(undefined, refs)).toEqual([]);
    // and the refusal is total — not "the first one", not "a placeholder"
    expect(absoluteAssetRefs('', refs).length).toBe(0);
  });

  it('DROPS EMPTY REFS rather than emitting a url that is just the base', () => {
    expect(absoluteAssetRefs('https://m.example.dev', ['', 'media/a', ''])).toEqual(['https://m.example.dev/media/a']);
  });

  it('PRESERVES ORDER — index 0 is the HERO by boutik’s producer mandate', () => {
    const out = absoluteAssetRefs('https://m.example.dev', ['media/hero/h', 'media/detail/d']);
    expect(out[0]).toContain('hero');
    expect(out[1]).toContain('detail');
  });
});

describe('DurableListingStore — a transport fault is never a decision', () => {
  const respond = (status: number, body: unknown, ok = status >= 200 && status < 300) =>
    new DurableListingStore({
      fetch: async () =>
        ({
          ok,
          status,
          json: async () => body,
        }) as unknown as Response,
    });

  const cmd = {
    commandId: 'c1',
    listingId: 'lst-1',
    storefrontId: 'sf-1',
    resellerId: 'rs-1',
    productVersionId: 'pv-1',
    offerVersion: 'ov-1',
    markup: 500,
    customerPriceFcfa: 2_000,
    correlationId: 'corr-1',
    at: '2026-07-25T00:00:00.000Z',
  };

  it('A GOOD DECISION PASSES THROUGH UNCHANGED', async () => {
    const store = respond(200, { status: 'published', listing: { id: 'lst-1' } });
    expect((await store.publish(cmd)).status).toBe('published');
  });

  it('A 500 FROM THE DO THROWS — it does NOT become a decision with an undefined status', async () => {
    // THE DEFECT THIS REPLACES: `(await res.json()) as PublishDecision` returned
    // `{error:'boom'}` cast to a decision. `.status` was `undefined`, matching
    // neither `published` nor `idempotent`, and no caller distinguished it — on the
    // write that decides what a buyer is charged.
    const store = respond(500, { error: 'boom' });
    await expect(store.publish(cmd)).rejects.toBeInstanceOf(ListingStoreError);
    await expect(store.publish(cmd)).rejects.toMatchObject({ op: 'publish', reason: 'http_error', httpStatus: 500 });
  });

  it('A 200 THAT IS NOT A DECISION THROWS — the status check alone would have let this through', async () => {
    // An HTML error page, or a JSON body from something that is not the aggregate.
    const store = respond(200, { error: 'not_found' });
    await expect(store.publish(cmd)).rejects.toMatchObject({ reason: 'unshaped' });
  });

  it('AN UNPARSEABLE BODY THROWS A NAMED ERROR, never a raw JSON syntax error', async () => {
    const store = new DurableListingStore({
      fetch: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON');
          },
        }) as unknown as Response,
    });
    await expect(store.publish(cmd)).rejects.toMatchObject({ reason: 'unparseable' });
  });

  it('autoHide AND getById GET THE IDENTICAL TREATMENT — no method left casting', async () => {
    await expect(respond(500, { error: 'x' }).autoHide({ listingId: 'lst-1', correlationId: 'c', at: 'T' })).rejects.toMatchObject({
      op: 'autoHide',
      reason: 'http_error',
    });
    await expect(respond(200, { nope: true }).autoHide({ listingId: 'lst-1', correlationId: 'c', at: 'T' })).rejects.toMatchObject({
      reason: 'unshaped',
    });
    await expect(respond(500, { error: 'x' }).getById('lst-1')).rejects.toMatchObject({ op: 'getById', reason: 'http_error' });
    await expect(respond(200, { markup: 5 }).getById('lst-1')).rejects.toMatchObject({ reason: 'unshaped' });
  });

  it('A 404 ON getById STAYS AN ANSWER, not a fault — « no such listing » is honest', async () => {
    expect(await respond(404, { error: 'not_found' }).getById('lst-nope')).toBeUndefined();
  });

  it('THE IN-MEMORY SUBSTRATE IS UNAFFECTED — CI still binds nothing and reaches no real storage', async () => {
    const store = resolveListingStore(undefined);
    expect(await store.publish(cmd)).toMatchObject({ status: 'published' });
    expect(store).not.toBeInstanceOf(DurableListingStore);
  });
});
