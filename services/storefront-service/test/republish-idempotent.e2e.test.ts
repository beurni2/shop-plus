import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, type Seance } from './seance';

/**
 * ═══ A SECOND « AJOUTER À MA VITRINE » CANNOT CHANGE HER PRICE ═══
 *
 * This exists because a SCREEN now depends on it. The reseller app stopped
 * offering « Ajouter à ma vitrine » for a product already in her vitrine
 * (DÉJÀ-DANS-MA-VITRINE, founder 2026-08-12), and the whole justification for
 * removing that button is that it CANNOT SUCCEED: the publish command id is
 * derived from the listing id, so a second publish is answered `idempotent` and
 * the first marge stands.
 *
 * That is a fact about the WORKER, asserted here against the real one. If a
 * re-price path is ever added, this test goes red — and it should, because the
 * screen fix would then be hiding a door that had opened. A behaviour a screen
 * relies on and nothing pins is a behaviour that changes silently.
 *
 * IT ASKS THE LEDGER, NOT THE ANSWER: the marge is re-read from
 * `GET /listings/:id` after the second write, and the membership from the shop.
 *
 * ACCES-ARME-2 (2026-09-05): the shared write key is retired. The reseller is
 * seated through `seance()` — signup → the founder mints on key C → admission
 * — and every write AND every read here (the shop, the listing) rides HER
 * session bearer; her `resellerId` is the id the book minted.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'republish-idem-'));

const SF_ID = 'sf-republish-001';
const PV = 'pv-republish-001';
const BASE_PRICE = 10_000;

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', COMPTES: 'ResellerAccountsDO' },
  durableObjectsPersist: persist,
  bindings: { CHECKOUT_OPS_SECRET: OPS_SECRET },
  serviceBindings: {
    // The live supply the Worker signs against — its own binding, never the
    // caller's word (PUBLISH-PRICE-1: the app sends a markup and no price).
    //
    // `asOf` IS NOW, AND IT HAS TO BE: the certified consumer applies a
    // 15-MINUTE FRESHNESS BOUND (SW-2 — « a product described from a stale
    // projection is worse than one not described »), so a fixed timestamp makes
    // every publish here answer `409 supply_unavailable` and this file would
    // prove nothing about re-publishing. Learned the hard way, one run ago.
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (/^\/supply-projection\/[^/]+$/.test(path)) {
        return Response.json({
          version: 1,
          asOf: new Date().toISOString(),
          value: {
            productVersionId: PV,
            offerVersion: 'ov-republish-1',
            basePrice: BASE_PRICE,
            resellerCommission: 1_000,
            available: 9,
            productName: 'Bazin riche',
            assetRefs: [] as string[],
            category: 'fashion_bags_fabrics',
            sellerTier: 'verified',
          },
        });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
    },
  },
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

/** The seated reseller — the one owner every call below acts as. */
let S: Seance;
beforeAll(async () => {
  S = await seance(mf, 'republish');
});

const post = (p: string, b: unknown): Promise<Response> =>
  mf.dispatchFetch(`http://sf${p}`, { method: 'POST', headers: S.bearer, body: JSON.stringify(b) });
const get = (p: string): Promise<Response> =>
  mf.dispatchFetch(`http://sf${p}`, { headers: S.bearer });

/** The app's own derivation (`listingIdFor` + `publish-${listingId}`), mirrored:
 *  a re-tap must be the SAME command, or this proves nothing about the screen. */
const LISTING_ID = `lst-${SF_ID}-${PV}`;
const publish = (markup: number): Promise<Response> =>
  post('/listings', {
    commandId: `publish-${LISTING_ID}`,
    listingId: LISTING_ID,
    storefrontId: SF_ID,
    resellerId: S.accountId,
    productVersionId: PV,
    markup,
    correlationId: 'corr-republish-001',
    at: '2026-08-12T08:00:00.000Z',
  });

describe('RE-PUBLISH — the second « Ajouter » is a no-op, and her signed marge does not move', () => {
  it('publishes once at marge 0, refuses to re-sign at marge 500, and the shop holds ONE pid', async () => {
    const created = await post('/storefronts', {
      commandId: 'c-republish-001',
      id: SF_ID,
      resellerId: S.accountId,
      shortCode: 'REPUB-0001',
      name: 'Boutique republish',
      zone: 'Ouagadougou',
      category: 'Général',
      correlationId: 'corr-republish-001',
      at: '2026-08-12T08:00:00.000Z',
    });
    expect(created.status, await created.clone().text()).toBe(200);

    const first = await publish(0);
    expect(first.status, await first.clone().text()).toBe(200);
    expect((await first.json() as { status: string }).status).toBe('published');

    // The MEMBERSHIP is the pid, appended by the composition root.
    const shop1 = (await (await get(`/storefronts/${SF_ID}`)).json()) as { curatedItems: string[] };
    expect(shop1.curatedItems).toEqual([PV]);

    // ── THE SECOND TAP, at a DIFFERENT marge ──────────────────────────────
    const second = await publish(500);
    expect(second.status, 'a re-tap must not error — it is answered, and answered honestly').toBe(200);
    expect(
      (await second.json() as { status: string }).status,
      'a second publish that RE-SIGNED would move a price the cliente may already be holding',
    ).toBe('idempotent');

    // ── ASK THE LEDGER, not the answer ────────────────────────────────────
    const listing = (await (await get(`/listings/${LISTING_ID}`)).json()) as { markup: number; version: number };
    expect(listing.markup, 'the signed marge moved on a re-tap — the screen may not offer that button').toBe(0);
    expect(listing.version, 'a second version would mean a second signed price').toBe(1);

    // …and her shop still holds the product exactly once, in its place.
    const shop2 = (await (await get(`/storefronts/${SF_ID}`)).json()) as { curatedItems: string[] };
    expect(shop2.curatedItems, 'a re-publish duplicated the membership').toEqual([PV]);
  }, 60_000);
});
