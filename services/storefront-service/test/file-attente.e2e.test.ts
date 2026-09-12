import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPS_SECRET, seance, type Seance } from './seance';

/**
 * ═══ FILE-ATTENTE-1 (AUDIT-SHOP-2 F-17b) — THE RESELLER'S OUTBOX AGAINST THE REAL WORKER ═══
 *
 * The seam test the standing law asks for: the app's OWN port
 * (`HttpStorefrontService`, imported from the app, never re-implemented), the
 * app's OWN outbox (`FileAttente` on a real on-disk file) and the app's OWN
 * reading of the wire's reasons (`verdictReplay`), driven against the built
 * Worker on workerd — with the network cut by a switch around `fetch`, so
 * « no network » is what RN throws. The LEDGER decides every outcome: the
 * buyer's page (`GET /s/{slug}`) for the membership, the signed-listing read
 * for the price the service signed — never the write's own answer.
 *
 * It also CERTIFIES the walks' fake to the Worker's real words: `published`
 * on a first publish, `markup_over_cap` on a refused marge, `removed` and the
 * post-removal shop on a removal, and a 401 when no session rides the call.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'file-attente-'));
const disque = mkdtempSync(join(tmpdir(), 'file-attente-outbox-'));

const SF_ID = 'sf-attente-001';
const SLUG = 'attente-0001';
const PV = 'pv-attente-001';
const BASE_PRICE = 10_000;

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: { STOREFRONT: 'StorefrontDO', LISTING: 'ListingDO', COMPTES: 'ResellerAccountsDO' },
  durableObjectsPersist: persist,
  bindings: { CHECKOUT_OPS_SECRET: OPS_SECRET },
  serviceBindings: {
    // The live supply the Worker signs against (PUBLISH-PRICE-1). `asOf` is
    // NOW: the certified consumer applies a 15-minute freshness bound.
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (/^\/supply-projection\/[^/]+$/.test(path)) {
        return Response.json({
          version: 1,
          asOf: new Date().toISOString(),
          value: {
            productVersionId: PV,
            offerVersion: 'ov-attente-1',
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
  rmSync(disque, { recursive: true, force: true });
});

/** The network switch around the app's `fetch`: dead ⇒ RN's own throw. */
const reseau = { mort: false };
let S: Seance;
beforeAll(async () => {
  S = await seance(mf, 'attente');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (reseau.mort) throw new TypeError('Network request failed');
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // workerd's dispatch takes the same init the app builds; the abort signal
    // of the app's ceiling is not part of workerd's Request, so it is dropped
    // here and the ceiling itself is proved in the app's own unit tests.
    const { signal: _signal, ...reste } = init ?? {};
    return (await mf.dispatchFetch(url, reste as never)) as unknown as Response;
  }) as typeof fetch;
});

type App = typeof import('../../../apps/reseller-app/src/vitrine/service.js');
type Outbox = typeof import('../../../apps/reseller-app/src/offline/queue.js');
async function app(): Promise<{ svc: App; box: Outbox }> {
  return {
    svc: await import('../../../apps/reseller-app/src/vitrine/service.js'),
    box: await import('../../../apps/reseller-app/src/offline/queue.js'),
  };
}

/** The app's outbox over a REAL file — a fresh store instance is a cold boot. */
function store(path: string) {
  return {
    async read(): Promise<string | null> {
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    },
    async write(data: string): Promise<void> {
      writeFileSync(path, data);
    },
  };
}

/** THE LEDGER — the page a cliente opens. Credential-free, as it must be. */
async function boutique(): Promise<{ curatedItems: string[] }> {
  const res = await mf.dispatchFetch(`http://sf/s/${SLUG}`, { method: 'GET' });
  expect(res.status).toBe(200);
  return (await res.json()) as never;
}

describe('FILE-ATTENTE-1 — the outbox replays through the app’s port onto the real Worker, and the ledger agrees', () => {
  it('kept while the network is dead (nothing lands, nothing counted) · lands on the first live pass · the service SIGNED base + marge · the delivered intent leaves the file', async () => {
    const { svc, box } = await app();
    const port = new svc.HttpStorefrontService('https://sf', async () => S.session);
    expect(S.session.startsWith('SPS-'), 'the seated session is the bearer the app presents').toBe(true);

    // her shop, through the app's own create
    const created = await port.create({
      commandId: 'c-attente-001', id: SF_ID, resellerId: S.accountId, shortCode: 'ATTENTE-0001',
      name: 'Boutique attente', zone: 'Ouagadougou', category: 'Général', correlationId: 'corr-attente-001',
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    const publie = await port.publish(SF_ID, 'corr-attente-001');
    expect(publie.ok).toBe(true);
    expect((await boutique()).curatedItems).toEqual([]);

    // THE REPLAY the App runs, on the app's port and the app's verdict rule
    const envoyer = async (entry: { name: string; pid: string; payload: Readonly<Record<string, unknown>> }) => {
      if (entry.name === 'listing.publish') {
        const res = await port.publishListing({
          storefrontId: SF_ID, resellerId: S.accountId, productVersionId: entry.pid,
          markup: typeof entry.payload['markup'] === 'number' ? entry.payload['markup'] : 0,
          correlationId: 'corr-attente-001',
        });
        return res.ok ? ({ kind: 'delivered' } as const) : svc.verdictReplay(res.reason);
      }
      const res = await port.removeItem(SF_ID, entry.pid);
      return res.ok ? ({ kind: 'delivered' } as const) : svc.verdictReplay(res.reason);
    };

    // ── run 1: no network. The add is kept; a pass changes nothing. ────────
    const fichier = join(disque, 'file-attente.v1.json');
    const q1 = await box.FileAttente.ouvrir(store(fichier));
    reseau.mort = true;
    const direct = await port.publishListing({ storefrontId: SF_ID, resellerId: S.accountId, productVersionId: PV, markup: 1_500, correlationId: 'corr-attente-001' });
    expect(direct.ok).toBe(false);
    expect(!direct.ok && svc.raisonReseau(direct.reason), 'the dead network is the reason the App queues on').toBe(true);
    await q1.deposer('listing.publish', PV, { storefrontId: SF_ID, resellerId: S.accountId, productVersionId: PV, markup: 1_500, correlationId: 'corr-attente-001' });
    const mort = await q1.rejouer(envoyer);
    expect(mort).toEqual({ livres: 0, refuses: 0, restants: 1, arret: 'reseau' });
    expect(q1.enAttente()[0]?.attempts, 'the network counts nothing').toBe(0);
    expect((await boutique()).curatedItems, 'THE LEDGER: nothing landed').toEqual([]);

    // ── (app killed) run 2: cold boot over the same file, the network is back
    reseau.mort = false;
    const q2 = await box.FileAttente.ouvrir(store(fichier));
    expect(q2.enAttente().map((e) => e.pid)).toEqual([PV]);
    const vivant = await q2.rejouer(envoyer);
    expect(vivant).toEqual({ livres: 1, refuses: 0, restants: 0, arret: 'aucun' });
    // THE LEDGER: the product is on the buyer's page, at the price the SERVICE signed
    expect((await boutique()).curatedItems).toEqual([PV]);
    const signe = await port.readListing(SF_ID, PV);
    expect(signe.ok && signe.value?.customerPriceFcfa, 'B + M, signed by the service, never by the phone').toBe(BASE_PRICE + 1_500);
    // the delivered intent LEFT the file — a third boot has nothing to send
    expect((await box.FileAttente.ouvrir(store(fichier))).tout()).toEqual([]);

    // ── a kept REMOVAL, the same road ───────────────────────────────────────
    reseau.mort = true;
    await q2.deposer('listing.remove', PV, { storefrontId: SF_ID, pid: PV });
    expect((await q2.rejouer(envoyer)).arret).toBe('reseau');
    expect((await boutique()).curatedItems, 'still there while the network is dead').toEqual([PV]);
    reseau.mort = false;
    expect((await q2.rejouer(envoyer)).livres).toBe(1);
    expect((await boutique()).curatedItems, 'THE LEDGER: gone').toEqual([]);
  });

  it('CERTIFIES the walks’ fake: the Worker refuses an over-cap marge with the word `markup_over_cap` — a NAMED refusal, failed at once, never « waiting »', async () => {
    const { svc, box } = await app();
    const port = new svc.HttpStorefrontService('https://sf', async () => S.session);
    const q = await box.FileAttente.ouvrir(store(join(disque, 'refus.json')));
    await q.deposer('listing.publish', PV, { markup: 9_999_999 });
    reseau.mort = false;
    const bilan = await q.rejouer(async (entry) => {
      const res = await port.publishListing({
        storefrontId: SF_ID, resellerId: S.accountId, productVersionId: entry.pid,
        markup: typeof entry.payload['markup'] === 'number' ? entry.payload['markup'] : 0,
        correlationId: 'corr-attente-001',
      });
      return res.ok ? { kind: 'delivered' } : svc.verdictReplay(res.reason);
    });
    expect(bilan).toEqual({ livres: 0, refuses: 1, restants: 0, arret: 'aucun' });
    expect(q.echecs().map((e) => e.failureReason)).toEqual(['markup_over_cap']);
    expect((await boutique()).curatedItems, 'THE LEDGER: nothing landed').toEqual([]);
  });

  it('CERTIFIES the session road: a call with NO session is a 401 the app reads as « session » — the pass halts, the intent waits, nothing is counted', async () => {
    const { svc, box } = await app();
    const sansSession = new svc.HttpStorefrontService('https://sf', async () => null);
    const q = await box.FileAttente.ouvrir(store(join(disque, 'session.json')));
    await q.deposer('listing.publish', PV, { markup: 0 });
    const bilan = await q.rejouer(async (entry) => {
      const res = await sansSession.publishListing({
        storefrontId: SF_ID, resellerId: S.accountId, productVersionId: entry.pid, markup: 0, correlationId: 'corr-attente-001',
      });
      return res.ok ? { kind: 'delivered' } : svc.verdictReplay(res.reason);
    });
    expect(bilan).toEqual({ livres: 0, refuses: 0, restants: 1, arret: 'session' });
    expect(q.enAttente()[0]?.attempts).toBe(0);
  });
});
