import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, type Seance } from './seance';

/**
 * ═══ EN-LIGNE-1 (founder ruling 2026-10-02, « fix this »; canon 3.27.0 §4.1) —
 * a boutique that is not en ligne is CLOSED to buyers, on the REAL Worker ═══
 *
 * miniflare on the shipped bundle, every Durable Object real; only Boutik+'s
 * OFFER service stood in. Her app creates a shop and puts it online in one act;
 * a shop never put online — or unpublished since — answered buyers its whole
 * page and quoted its products. Driven through the BUYER app's own boutique
 * port and HER app's own service (imported, never re-implemented):
 *   · closed: the read answers her name and « pas en ligne », nothing else —
 *     no article, no price, no contact; the product link the same; no quote;
 *   · her app's « publish » opens it: the page and the quote come back;
 *   · « unpublish » (hers, or the founder's road) closes it again.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'en-ligne-'));
const PV = 'pv-el-1';

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO', ATTRIBUTION_LOCK: 'AttributionLockDO', LADDER: 'BuyerLadderDO', DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO', COMPTES: 'ResellerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: { PAYMENT_WEBHOOK_SECRET: 'test-payment-webhook-secret-el001', CHECKOUT_OPS_SECRET: OPS_SECRET },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (/^\/supply-projection\/[^/]+$/.test(path)) {
        return Response.json({
          version: 1,
          asOf: new Date().toISOString(),
          value: {
            productVersionId: PV, offerVersion: 'ov-el-1', basePrice: 10_000, resellerCommission: 1_000, available: 9,
            productName: 'Pagne wax', assetRefs: [] as string[], category: 'fashion_bags_fabrics', sellerTier: 'verified',
          },
        });
      }
      return Response.json({ status: 'not_found' }, { status: 404 });
    },
  },
});

const SF_ID = 'sf-el-1';
const SLUG = 'el-0001';
let S: Seance;

beforeAll(async () => {
  S = await seance(mf, 'el');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const { signal: _signal, ...reste } = init ?? {};
    return (await mf.dispatchFetch(url, reste as never)) as unknown as Response;
  }) as typeof fetch;
  // Her shop and one article, through the real doors on her session — and NOT
  // put online: the state of a shop never published, or unpublished since.
  const created = await mf.dispatchFetch('http://sf/storefronts', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({ commandId: 'c-el-1', id: SF_ID, resellerId: S.accountId, shortCode: 'EL-0001', name: 'Chez Awa', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-el-1' }),
  });
  expect(created.status).toBe(200);
  const pub = await mf.dispatchFetch('http://sf/listings', {
    method: 'POST', headers: S.bearer,
    body: JSON.stringify({
      commandId: 'cmd-listing-el-1', listingId: 'lst-el-1', storefrontId: SF_ID, resellerId: S.accountId,
      productVersionId: PV, offerVersion: 'ov-el-1', markup: 1_500, correlationId: 'corr-el-1', at: new Date().toISOString(),
    }),
  });
  expect(await pub.text()).toContain('"published"');
});
afterAll(async () => {
  await mf.dispose();
  rmSync(persist, { recursive: true, force: true });
});

let cles = 0;
async function devis(): Promise<{ status: number; body: Record<string, unknown> }> {
  cles += 1;
  const res = await mf.dispatchFetch('http://sf/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: SLUG, pid: PV, paymentMode: 'FULL_PREPAY', zoneTo: 'Ouagadougou', attributionResellerId: S.accountId, requestKey: `rk-el-${String(cles).padStart(4, '0')}-${'x'.repeat(10)}` }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function lire(path: string): Promise<Record<string, unknown>> {
  return (await (await mf.dispatchFetch(`http://sf${path}`)).json()) as Record<string, unknown>;
}

describe('EN-LIGNE-1 — a boutique that is not en ligne is closed to buyers', () => {
  it('closed: her name and « pas en ligne », nothing else; the product link the same; no quote — the buyer app reads it as the closed card', async () => {
    const page = await lire(`/s/${SLUG}`);
    expect(page['horsLigne']).toBe(true);
    expect(page['name']).toBe('Chez Awa');
    // Nothing a buyer could shop from: the keys are named, so a field added to
    // the shop later cannot ride along.
    expect(Object.keys(page).sort()).toEqual(['horsLigne', 'name', 'service', 'slug']);
    const lien = await lire(`/s/${SLUG}?pid=${PV}`);
    expect(Object.keys(lien).sort()).toEqual(['horsLigne', 'name', 'service', 'slug']);
    const q = await devis();
    expect(q.status).toBe(422);
    expect(q.body['error']).toBe('boutique_hors_ligne');
    // The BUYER app's own boutique port turns the answer into the closed card's marker.
    const { httpStorefrontPort, VitrinePause } = await import('../../../apps/buyer-pwa/src/vitrine/profile.js');
    const lu = await httpStorefrontPort('http://sf').resolve(SLUG).then(() => null, (e: unknown) => e);
    expect(lu).toBeInstanceOf(VitrinePause);
    expect((lu as InstanceType<typeof VitrinePause>).nom).toBe('Chez Awa');
    expect((lu as InstanceType<typeof VitrinePause>).raison).toBe('hors_ligne');
  }, 120_000);

  it('her app puts it online: the page and the quote come back; « unpublish » closes it again', async () => {
    const { HttpStorefrontService } = await import('../../../apps/reseller-app/src/vitrine/service.js');
    const sienne = new HttpStorefrontService('http://sf', async () => S.session);
    const ouvert = await sienne.publish(SF_ID, 'corr-el-ouvrir');
    expect(ouvert.ok).toBe(true);
    const page = await lire(`/s/${SLUG}`);
    expect(page['horsLigne']).toBeUndefined();
    expect(((page['products'] as { pid: string }[] | undefined) ?? []).map((p) => p.pid)).toEqual([PV]);
    const q = await devis();
    expect(q.status, JSON.stringify(q.body)).toBe(200);
    expect(q.body['productSubtotal']).toBe(11_500);

    const ferme = await sienne.unpublish(SF_ID, 'corr-el-fermer');
    expect(ferme.ok).toBe(true);
    expect((await lire(`/s/${SLUG}`))['horsLigne']).toBe(true);
    expect((await devis()).body['error']).toBe('boutique_hors_ligne');
  }, 120_000);
});
