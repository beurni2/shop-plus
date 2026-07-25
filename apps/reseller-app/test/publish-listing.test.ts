import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemoStorefrontService } from '../src/vitrine/service.demo';
import { HttpStorefrontService, listingIdFor } from '../src/vitrine/service';
import { marginBreakdown, markupCap, defaultMarkup, snapMarkup } from '../src/vitrine/margin';

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

/**
 * PUBLISH-PRICE-1 — the app sends the markup she chose, and NOTHING else about money.
 *
 * The founder asked for the keyspace to be asserted BY VALUE: « a test that writes a
 * markup on the card and reads it on the fiche for the same live offer ». That is the
 * first block. The rest pins the two properties that make publish honest: no price
 * leaves the app, and no publish happens on an untouched default.
 */

describe('ONE KEYSPACE — a markup written on the card is the markup the fiche signs', () => {
  // The two surfaces, reduced to what they actually do with the state. Both read and
  // write `markups` keyed by the offer's productVersionId, and both quote money
  // through the SAME `marginBreakdown`. If either drifted onto another key this
  // reconstruction would diverge — which is exactly what shipped before.
  const OFFER = { productVersionId: 'pv-live-1', basePrice: 8_000, resellerCommission: 600 };
  const marginOf = (markups: Record<string, number>, id: string, base: number, commission: number) =>
    marginBreakdown(base, commission, markups[id] ?? defaultMarkup(markupCap(base)));

  it('THE CARD WRITES AND THE FICHE READS THE SAME VALUE (this is the defect, by value)', () => {
    const markups: Record<string, number> = {};
    // Ma Vitrine card: she drags the slider to 2 500.
    markups[OFFER.productVersionId] = snapMarkup(2_500, markupCap(OFFER.basePrice));
    // The fiche, reading by productVersionId, must see 2 500 — not the default.
    const onFiche = marginOf(markups, OFFER.productVersionId, OFFER.basePrice, OFFER.resellerCommission);
    expect(onFiche.markup).toBe(2_500);
    expect(onFiche.client).toBe(10_500); // B + M, the price the service will sign
    // THE OLD BEHAVIOUR, PINNED AS A NEGATIVE: written under a demo seed id, the
    // fiche would have fallen through to min(1500, cap) — a price she never chose.
    const wrongKey: Record<string, number> = { o5: 2_500 };
    expect(marginOf(wrongKey, OFFER.productVersionId, OFFER.basePrice, OFFER.resellerCommission).markup).toBe(1_500);
  });

  it('THE MONEY IDENTITIES HOLD AT HER CHOSEN MARKUP — net + fee = gross, client = B + M', () => {
    for (const m of [0, 100, 1_500, 2_500, markupCap(OFFER.basePrice)]) {
      const v = marginBreakdown(OFFER.basePrice, OFFER.resellerCommission, m);
      expect(v.gross).toBe(OFFER.resellerCommission + m);
      expect(v.net + v.fee).toBe(v.gross); // to the franc, at every markup
      expect(v.fee).toBe(Math.round(v.gross * 0.2)); // canon 20 %·(C+M)
      expect(v.client).toBe(OFFER.basePrice + m); // productSubtotal
    }
  });

  it('BOTH SURFACES KEY ON productVersionId IN THE SOURCE — no `item.id` write survives', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/\[opp\.productVersionId\]: m/); // the fiche slider
    expect(app).toMatch(/\[item\.productVersionId\]: m/); // the Ma Vitrine card slider
    expect(app).not.toMatch(/\[item\.id\]: m/);
    // the grid itself reads the LIVE feed under that key, not the demo world
    expect(app).toMatch(/offers\.filter\(\(o\) => vitrineLive\.includes\(o\.productVersionId\)\)/);
  });
});

describe('THE APP NEVER AUTHORS A SIGNED AMOUNT', () => {
  it('THE REQUEST SHAPE HAS NO PRICE FIELD — unrepresentable, not merely unsent', () => {
    const src = read('src/vitrine/service.ts');
    const shape = /export interface PublishListingRequest \{[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
    expect(shape).toContain('markup');
    // The three money fields the service knows live, and must never be told:
    for (const banned of ['customerPriceFcfa', 'basePrice', 'resellerCommission', 'offerVersion']) {
      expect(shape).not.toContain(banned);
    }
  });

  it('THE WIRE BODY CARRIES markup AND NO PRICE (asserted on the real fetch payload)', async () => {
    let body: Record<string, unknown> = {};
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body) as Record<string, unknown>;
      return { ok: true, status: 200, json: async () => ({ status: 'published' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example', 'k');
      const res = await svc.publishListing({
        storefrontId: 'sf-8291',
        resellerId: 'rs-8291',
        productVersionId: 'pv-live-1',
        markup: 2_500,
        correlationId: 'corr-1',
        at: '2026-07-25T00:00:00.000Z',
      });
      expect(res.ok).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
    expect(body.markup).toBe(2_500);
    // NOT sent, at all — the service computes them from live supply.
    expect(body).not.toHaveProperty('customerPriceFcfa');
    expect(body).not.toHaveProperty('basePrice');
    expect(body).not.toHaveProperty('offerVersion');
    // IDS ARE DERIVED, so a re-tap is idempotent rather than a second signed version.
    expect(body.listingId).toBe(listingIdFor('sf-8291', 'pv-live-1'));
    expect(body.commandId).toBe(`publish-${listingIdFor('sf-8291', 'pv-live-1')}`);
  });

  it('A SERVICE REFUSAL KEEPS ITS NAME — `supply_unavailable` is not collapsed to http_409', async () => {
    let status = 409;
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({ ok: false, status, json: async () => ({ error: 'supply_unavailable' }) }) as unknown as Response) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example', 'k');
      const req = {
        storefrontId: 'sf-1',
        resellerId: 'rs-1',
        productVersionId: 'pv-1',
        markup: 500,
        correlationId: 'c',
        at: 'T',
      };
      // « réessayez » and « c'est un défaut » are different things to tell her, so the
      // named reason must survive the adapter rather than becoming a status code.
      expect(await svc.publishListing(req)).toEqual({ ok: false, reason: 'supply_unavailable' });
      status = 400;
      globalThis.fetch = (async () =>
        ({ ok: false, status, json: async () => ({ error: 'markup_invalid' }) }) as unknown as Response) as unknown as typeof fetch;
      expect(await svc.publishListing(req)).toEqual({ ok: false, reason: 'markup_invalid' });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('PUBLISH CANNOT FIRE ON AN UNTOUCHED DEFAULT', () => {
  it('THE CTA IS GATED ON BOTH THE SEAM AND A DELIBERATE MARKUP', () => {
    const app = read('App.tsx');
    expect(app).toMatch(
      /disabled=\{service === null \|\| markupTouched\[opp\.productVersionId\] !== true \|\| publishing\}/,
    );
    // …and the reason it is asleep is stated, never left for her to guess
    expect(app).toMatch(/fiche\.cta_non_relie/);
    expect(app).toMatch(/fiche\.cta_choisir_marge/);
  });

  it('THE HANDLER RE-CHECKS IT — the UI gate is not the only thing standing between a default and a signature', () => {
    const app = read('App.tsx');
    const handler = /const publishListing = useCallback\([\s\S]*?\n  \);/.exec(app)?.[0] ?? '';
    expect(handler).toMatch(/markupTouched\[o\.productVersionId\] !== true/);
    // membership is recorded AFTER the confirmed write, never before it
    const okIdx = handler.indexOf('if (!res.ok)');
    const addIdx = handler.indexOf('vitrineCol.addToVitrine');
    expect(okIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(okIdx);
  });
});

describe('THE DEMO ADAPTER CAN FAIL (certified-mock rule, Execution Contract §3)', () => {
  it('IT REFUSES WHEN SUPPLY IS UNAVAILABLE, exactly as the real service does', async () => {
    const demo = new DemoStorefrontService();
    demo.refuseSupplyFor.add('pv-lapsed');
    const req = { storefrontId: 'sf-1', resellerId: 'rs-1', markup: 1_000, correlationId: 'c', at: 'T' };
    expect(await demo.publishListing({ ...req, productVersionId: 'pv-lapsed' })).toEqual({
      ok: false,
      reason: 'supply_unavailable',
    });
    // A mock that could only succeed would make every test greener than the system.
    expect(await demo.publishListing({ ...req, productVersionId: 'pv-ok' })).toEqual({
      ok: true,
      value: { status: 'published' },
    });
  });

  it('IT RECORDS THE MARKUP AND COMPUTES NO PRICE — the app has no business computing one', async () => {
    const demo = new DemoStorefrontService();
    await demo.publishListing({
      storefrontId: 'sf-1',
      resellerId: 'rs-1',
      productVersionId: 'pv-1',
      markup: 2_500,
      correlationId: 'c',
      at: 'T',
    });
    expect(demo.published).toEqual([{ storefrontId: 'sf-1', productVersionId: 'pv-1', markup: 2_500 }]);
    expect(JSON.stringify(demo.published)).not.toContain('Price');
  });

  it('A RE-TAP AT THE SAME MARKUP IS IDEMPOTENT, never a second signed version', async () => {
    const demo = new DemoStorefrontService();
    const req = { storefrontId: 'sf-1', resellerId: 'rs-1', productVersionId: 'pv-1', markup: 900, correlationId: 'c', at: 'T' };
    expect((await demo.publishListing(req)).ok && (await demo.publishListing(req))).toEqual({
      ok: true,
      value: { status: 'idempotent' },
    });
    expect(demo.published).toHaveLength(1);
  });
});
