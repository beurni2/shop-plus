import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_PRODUITS_DECRITS } from '../src/index.js';

/**
 * ═══ RESELLER-AUTH-1 (AUDIT-SHOP-1 slice a2a) — HER SESSION IS HER KEY, AND
 * HER KEY OPENS ONLY HER SHOP — on the real combined Worker ═══
 *
 * The audit's MAJOR: every write ran on one shared key baked into the app, and
 * the per-reseller session was never consulted on a write, so any admitted
 * reseller could publish into a rival's shop as herself. This suite drives two
 * ADMITTED accounts (A and B) against the deployed bundle with NO write key at
 * all, and asks the BOOK after every refusal: B's acts on A's shop must leave
 * A's shop byte-for-byte as it was, and must read as one mute not-found.
 *
 * ACCES-ARME-2 (a2b phase 2, founder « Seated » 2026-09-05) retired the shared
 * key this suite once named as its residue: the retired header now opens
 * NOTHING (asserted below), the founder's key C opens exactly the directory
 * read and the orphan takedown, and the a1 ceiling is gone — two seated
 * accounts need no lifted binding any more.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'proprietaire-'));
const T0 = '2026-09-03T08:00:00.000Z';
const OPS_SECRET = 'test-checkout-ops-secret-o001';
const cleC = { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' };
/** The RETIRED header, presented exactly as the old app did — it must open nothing. */
const cleRetiree = { 'X-Write-Key': 'test-write-secret-o001', 'Content-Type': 'application/json' };
const MOT_DE_PASSE = 'grain-de-nere-77';
const PID = 'pv-own-1';

const SUPPLY = [
  {
    productVersionId: PID,
    offerVersion: 'ov-own-1',
    basePrice: 10_000,
    resellerCommission: 1_000,
    available: 9,
    productName: 'Bazin riche',
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  },
  // VITRINE-LECTURE-1 — twenty-one more offers, so a shop can cross the read ceiling
  ...Array.from({ length: 21 }, (_, i) => ({
    productVersionId: `pv-own-${i + 2}`,
    offerVersion: `ov-own-${i + 2}`,
    basePrice: 10_000 + i,
    resellerCommission: 1_000,
    available: 9,
    productName: `Article ${i + 2}`,
    assetRefs: [] as string[],
    category: 'fashion_bags_fabrics',
    sellerTier: 'verified',
  })),
];

/** VITRINE-LECTURE-1 — what the producer stub observed, and how it misbehaves on demand. */
let lecturesCollection = 0;
let lecturesUnitaires = 0;
/** pids the COLLECTION route omits (the single route still serves them) */
const collectionOmet = new Set<string>();
/** pids whose SINGLE read never answers */
const unitaireSuspendu = new Set<string>();
/** The collection road answers 500 — the producer's bad day, every pid left
 *  to the single road (the worst path for the subrequest budget). */
let collectionEnPanne = false;

const mf = new Miniflare({
  modules: true,
  scriptPath: SCRIPT,
  durableObjects: {
    STOREFRONT: 'StorefrontDO',
    LISTING: 'ListingDO',
    CHECKOUT: 'CheckoutDO',
    ORDER: 'OrderDO',
    ATTRIBUTION_LOCK: 'AttributionLockDO',
    LADDER: 'BuyerLadderDO',
    DISPATCH: 'DispatchIndexDO',
    RESELLER: 'ResellerFeedDO',
    COMPTES: 'ResellerAccountsDO',
  },
  durableObjectsPersist: persist,
  bindings: {
    PAYMENT_WEBHOOK_SECRET: 'test-payment-webhook-secret-o001',
    CHECKOUT_OPS_SECRET: OPS_SECRET,
  },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      const single = /^\/supply-projection\/([^/]+)$/.exec(path);
      if (single) {
        const pid = decodeURIComponent(single[1]!);
        lecturesUnitaires += 1;
        if (unitaireSuspendu.has(pid)) return new Promise<Response>(() => undefined); // never answers
        const value = SUPPLY.find((v) => v.productVersionId === pid);
        if (value === undefined) return Response.json({ status: 'not_found' }, { status: 404 });
        return Response.json({ version: 1, asOf: new Date().toISOString(), value });
      }
      if (path === '/supply-projections') {
        lecturesCollection += 1;
        if (collectionEnPanne) return Response.json({ status: 'unavailable' }, { status: 500 });
        // the PRODUCER's collection shape — the canon envelope per item, as the
        // real offer-service serves it (combined-worker.e2e's fixture)
        const asOf = new Date().toISOString();
        const items = SUPPLY.filter((v) => !collectionOmet.has(v.productVersionId)).map((value) => ({ version: 1, asOf, value }));
        return Response.json({ asOf, items });
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

let n = 0;
/** Signup → founder mints → admission: an ACTIVE account, its session and its id. */
async function seance() {
  const i = String((n += 1)).padStart(3, '0');
  const s = await mf.dispatchFetch('http://c/reseller/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Awa Traoré ${i}`, email: `awa${i}@example.bf`, phone: `+226 70 00 00 ${i}`, password: MOT_DE_PASSE }),
  });
  const sj = safeJson(await s.text()) as { accountId: string; session: string };
  const m = await mf.dispatchFetch('http://c/reseller/accounts/access-code', { method: 'POST', headers: cleC, body: JSON.stringify({ accountId: sj.accountId }) });
  const mj = safeJson(await m.text()) as { code?: string };
  expect(mj.code, 'the founder must be able to mint').toBeDefined();
  const a = await mf.dispatchFetch('http://c/reseller/admission', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sj.session}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: mj.code }),
  });
  expect(a.status, await a.clone().text()).toBe(200);
  return { accountId: sj.accountId, session: sj.session, bearer: { Authorization: `Bearer ${sj.session}`, 'Content-Type': 'application/json' } };
}

async function appel(path: string, init: RequestInit) {
  const res = await mf.dispatchFetch(`http://c${path}`, init);
  const text = await res.text();
  return { status: res.status, text, json: safeJson(text) };
}

let codes = 0;
const creer = (resellerId: string, id: string, headers: Record<string, string>) =>
  appel('/storefronts', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      // the canon short code is LETTERS-4DIGITS (`SELLER-0001`); the id is not one
      commandId: `cmd-create-${id}`, id, resellerId, shortCode: `OWN-${String((codes += 1)).padStart(4, '0')}`, name: `Boutique ${id}`,
      zone: 'Ouagadougou', category: 'Général', correlationId: `corr-${id}`, at: T0,
    }),
  });

const publier = (storefrontId: string | undefined, listingId: string, headers: Record<string, string>, resellerId: string) =>
  appel('/listings', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      commandId: `cmd-${listingId}`, listingId, ...(storefrontId === undefined ? {} : { storefrontId }), resellerId,
      productVersionId: PID, offerVersion: 'ov-own-1', markup: 1_000,
      stockAssurance: { source: 'hub' }, correlationId: `corr-${listingId}`, at: T0,
    }),
  });

/** A create under an EXACT short code (the slug is derived from it), for the slug-uniqueness cases. */
const creerAvec = (resellerId: string, id: string, headers: Record<string, string>, shortCode: string, commandId: string) =>
  appel('/storefronts', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      commandId, id, resellerId, shortCode, name: `Boutique ${id}`,
      zone: 'Ouagadougou', category: 'Général', correlationId: `corr-${id}`, at: T0,
    }),
  });

/** A publish of ANY pid into a shop (the `publier` above is pinned to PID). */
const publierPid = (storefrontId: string, listingId: string, headers: Record<string, string>, resellerId: string, pid: string, offerVersion: string) =>
  appel('/listings', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      commandId: `cmd-${listingId}`, listingId, storefrontId, resellerId,
      productVersionId: pid, offerVersion, markup: 1_000,
      stockAssurance: { source: 'hub' }, correlationId: `corr-${listingId}`, at: T0,
    }),
  });

let A!: Awaited<ReturnType<typeof seance>>;
let B!: Awaited<ReturnType<typeof seance>>;
let slugA = '';
let slugB = '';
const SF_A = 'sf-own-a';
const SF_B = 'sf-own-b';
const LST_A = 'lst-own-a';

describe('RESELLER-AUTH-1 — a session creates, and creates only as herself', () => {
  it('A creates her shop with NO write key; B cannot create a shop in A\'s name; B creates her own', async () => {
    A = await seance();
    B = await seance();
    const a = await creer(A.accountId, SF_A, A.bearer);
    expect(a.status, a.text).toBe(200);
    expect(a.json['status']).toBe('created');
    slugA = (a.json['storefront'] as { slug: string }).slug;
    // B, seated and honest about her own session, still cannot mint a shop that
    // names A as its owner — the payee of every sale it would ever attribute.
    const usurpe = await creer(A.accountId, 'sf-own-x', B.bearer);
    expect(usurpe.status, usurpe.text).toBe(403);
    expect(usurpe.json['error']).toBe('not_owner');
    // nothing was created — asked of the WHOLE directory, the founder's key-C read
    const annuaire = (await appel('/storefronts', { headers: cleC })).json as unknown as { id: string }[];
    expect(annuaire.some((r) => r.id === 'sf-own-x'), 'nothing was created').toBe(false);
    const b = await creer(B.accountId, SF_B, B.bearer);
    expect(b.status, b.text).toBe(200);
    slugB = (b.json['storefront'] as { slug: string }).slug;

    // ═══ VERIFIER MAJOR — a create that COLLIDES with a rival's id must not
    // hand her the rival's whole shop. The core answers `collision` WITH the
    // existing storefront at 200; with a session that body is the object the
    // by-id read is muted to hide. Mute here too, byte-checked on the answer.
    const collision = await creer(B.accountId, SF_A, B.bearer);
    expect(collision.status, collision.text).toBe(404);
    expect(collision.text).not.toContain('curatedItems');
    expect(collision.text).not.toContain(`Boutique ${SF_A}`);
    expect(collision.text).not.toContain(A.accountId);
    // A re-creating her OWN shop is still the idempotent road she had
    const rejoueA = await creer(A.accountId, SF_A, A.bearer);
    expect(rejoueA.status, rejoueA.text).toBe(200);
  });

  it('reads are hers alone: B sees A\'s shop as ONE mute not-found; the list narrows to the caller\'s shops', async () => {
    const parB = await appel(`/storefronts/${SF_A}`, { headers: B.bearer });
    expect(parB.status).toBe(404);
    expect(parB.json).toEqual({ error: 'not_found' });
    // a segment that will not decode is nobody's — the same mute 404, never a 500
    const indechiffrable = await appel('/storefronts/%E0', { headers: B.bearer });
    expect(indechiffrable.status, indechiffrable.text).toBe(404);
    expect(indechiffrable.json).toEqual({ error: 'not_found' });
    expect((await appel(`/listings/%E0`, { headers: B.bearer })).status).toBe(404);
    expect((await appel(`/listings/by-pid/%E0/${PID}`, { headers: B.bearer })).status).toBe(404);
    const parA = await appel(`/storefronts/${SF_A}`, { headers: A.bearer });
    expect(parA.status, parA.text).toBe(200);
    expect(parA.json['resellerId']).toBe(A.accountId);
    const listeA = (await appel('/storefronts', { headers: A.bearer })).json as unknown as { id: string }[];
    expect(listeA.map((r) => r.id)).toEqual([SF_A]);
    const listeB = (await appel('/storefronts', { headers: B.bearer })).json as unknown as { id: string }[];
    expect(listeB.map((r) => r.id)).toEqual([SF_B]);
    // the founder's key-C read (ACCES-ARME-2's operator road) keeps the whole directory
    const tout = (await appel('/storefronts', { headers: cleC })).json as unknown as { id: string }[];
    expect(tout.map((r) => r.id).sort()).toEqual([SF_A, SF_B]);
  });

  it('B\'s acts on A\'s shop — rename, remove an item, DELETE — are refused mute, and A\'s shop is untouched, public page included', async () => {
    const avant = (await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).text;
    const renomme = await appel(`/storefronts/${SF_A}/identity`, { method: 'POST', headers: B.bearer, body: JSON.stringify({ patch: { name: 'Boutique volée' }, at: T0 }) });
    expect(renomme.status).toBe(404);
    const retire = await appel(`/storefronts/${SF_A}/items/remove`, { method: 'POST', headers: B.bearer, body: JSON.stringify({ pid: PID, at: T0 }) });
    expect(retire.status).toBe(404);
    const efface = await appel(`/storefronts/${SF_A}`, { method: 'DELETE', headers: B.bearer });
    expect(efface.status).toBe(404);
    // THE BOOK: A's shop is byte-identical, and still resolves for buyers.
    expect((await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).text).toBe(avant);
    expect((await appel(`/s/${slugA}`, {})).status).toBe(200);
  });

  it('listings are owned through the shop: A publishes with her session; B cannot publish into, read from, or hide inside A\'s shop', async () => {
    const pub = await publier(SF_A, LST_A, A.bearer, A.accountId);
    expect(pub.status, pub.text).toBe(200);
    expect(pub.json['status']).toBe('published');
    const shopA = (await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).json as { curatedItems?: string[] };
    expect(shopA.curatedItems).toEqual([PID]);

    const intrusion = await publier(SF_A, 'lst-own-intrus', B.bearer, B.accountId);
    expect(intrusion.status, intrusion.text).toBe(404);
    expect(intrusion.json).toEqual({ error: 'not_found' });
    // nothing landed: no listing, no membership, no pointer
    expect(((await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).json as { curatedItems?: string[] }).curatedItems).toEqual([PID]);
    expect((await appel('/listings/lst-own-intrus', { headers: A.bearer })).status).toBe(404);

    expect((await appel(`/listings/by-pid/${SF_A}/${PID}`, { headers: B.bearer })).status).toBe(404);
    expect((await appel(`/listings/by-pid/${SF_A}/${PID}`, { headers: A.bearer })).status).toBe(200);
    expect((await appel(`/listings/${LST_A}`, { headers: B.bearer })).status).toBe(404);
    expect((await appel(`/listings/${LST_A}`, { headers: A.bearer })).status).toBe(200);
    const cache = await appel(`/listings/${LST_A}/hide`, { method: 'POST', headers: B.bearer, body: JSON.stringify({ at: T0 }) });
    expect(cache.status).toBe(404);
    const encoreLa = await appel(`/listings/by-pid/${SF_A}/${PID}`, { headers: A.bearer });
    expect(encoreLa.status).toBe(200);
    expect(encoreLa.json['status'], 'the hide must not have landed — a hidden listing still answers 200 here').toBe('published');
    // …and B cannot pull the LIVE product out of A's shop either: the book keeps it.
    const arrache = await appel(`/storefronts/${SF_A}/items/remove`, { method: 'POST', headers: B.bearer, body: JSON.stringify({ pid: PID, at: T0 }) });
    expect(arrache.status).toBe(404);
    expect(((await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).json as { curatedItems?: string[] }).curatedItems).toEqual([PID]);

    // ═══ VERIFIER BLOCKER 2 — a rival's LISTING BY ID is not hers to rewrite ═══
    // B names A's listing id with HER OWN shop and payee: the shop check and
    // the payee check both pass, and without a check on the EXISTING listing
    // the publish would rewrite A's artifact as version 2 — A's pid pointer
    // would then resolve to B's price and every quote on A's link would refuse.
    const avantA = (await appel(`/listings/${LST_A}`, { headers: A.bearer })).text;
    const reecrit = await appel('/listings', {
      method: 'POST',
      headers: B.bearer,
      body: JSON.stringify({
        commandId: 'cmd-reecrit', listingId: LST_A, storefrontId: SF_B, resellerId: B.accountId,
        productVersionId: PID, offerVersion: 'ov-own-1', markup: 500, stockAssurance: { source: 'hub' }, correlationId: 'corr-reecrit', at: T0,
      }),
    });
    expect(reecrit.status, reecrit.text).toBe(404);
    expect(reecrit.json).toEqual({ error: 'not_found' });
    expect((await appel(`/listings/${LST_A}`, { headers: A.bearer })).text, 'A\'s listing is byte-identical').toBe(avantA);
    // …and the derived idempotent command id does not hand her A's listing either
    const rejoue = await appel('/listings', {
      method: 'POST',
      headers: B.bearer,
      body: JSON.stringify({
        commandId: `cmd-${LST_A}`, listingId: LST_A, storefrontId: SF_B, resellerId: B.accountId,
        productVersionId: PID, offerVersion: 'ov-own-1', markup: 1_000, stockAssurance: { source: 'hub' }, correlationId: 'corr-rejoue', at: T0,
      }),
    });
    expect(rejoue.status).toBe(404);
    expect(rejoue.text).not.toContain('markup');

    // her own shop, but a FOREIGN payee on the listing: refused by name — SP-I01
    // would lock every sale of it to whoever that id names
    const detourne = await publier(SF_A, 'lst-own-detourne', A.bearer, B.accountId);
    expect(detourne.status, detourne.text).toBe(403);
    expect(detourne.json['error']).toBe('not_owner');
    expect((await appel('/listings/lst-own-detourne', { headers: A.bearer })).status).toBe(404);

    // with an identity in hand, a publish that names no shop is refused by name
    const sansBoutique = await publier(undefined, 'lst-own-nulle', A.bearer, A.accountId);
    expect(sansBoutique.status).toBe(400);
    expect(sansBoutique.json['error']).toBe('malformed');
  });

  it('only an ACTIVE session is a key: pending and paused sessions open nothing (ACCES-ARME-2: no shared key stands behind them any more)', async () => {
    const s = await mf.dispatchFetch('http://c/reseller/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Pending P', email: 'pending@example.bf', phone: '+226 70 00 00 99', password: MOT_DE_PASSE }),
    });
    const pending = safeJson(await s.text()) as { accountId: string; session: string };
    const enAttente = await creer(pending.accountId, 'sf-own-p', { Authorization: `Bearer ${pending.session}`, 'Content-Type': 'application/json' });
    expect(enAttente.status).toBe(401);

    const pause = await mf.dispatchFetch('http://c/reseller/accounts/pause', { method: 'POST', headers: cleC, body: JSON.stringify({ accountId: B.accountId }) });
    expect(pause.status).toBe(200);
    const coupee = await appel(`/storefronts/${SF_B}/identity`, { method: 'POST', headers: B.bearer, body: JSON.stringify({ name: 'Encore moi', at: T0 }) });
    expect(coupee.status, 'a paused account is nobody at the write gate').toBe(401);
    expect((await appel(`/storefronts/${SF_B}`, { headers: B.bearer })).status).toBe(401);
    const resume = await mf.dispatchFetch('http://c/reseller/accounts/resume', { method: 'POST', headers: cleC, body: JSON.stringify({ accountId: B.accountId }) });
    expect(resume.status).toBe(200);
    expect((await appel(`/storefronts/${SF_B}`, { headers: B.bearer })).status).toBe(200);
  });

  it('the supply read and the media upload need only the active session', async () => {
    const offres = await appel('/supply-projections', { headers: B.bearer });
    expect(offres.status, offres.text).toBe(200);
    expect((await appel('/supply-projections', {})).status).toBe(401);
    const upload = await appel(`/media/upload?kind=cover&storefrontId=${SF_B}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${B.session}`, 'Content-Type': 'image/png' },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(upload.status, 'past the gate — refused, if at all, by the validator, never as unauthorised').not.toBe(401);

    // ═══ VERIFIER BLOCKER 1 — the upload ATTACHES: `handleMediaUpload` posts
    // the media onto the shop named in its query through the router directly,
    // so « the attach is owned » was false. With a session the query's shop
    // must be hers, or the answer is the same mute not-found as every other act.
    const png = new Uint8Array(64);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0, 0, 0, 1, 0, 8, 2, 0, 0, 0]);
    const avant = (await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).text;
    for (const q of [`kind=cover&storefrontId=${SF_A}`, `kind=avatar&storefrontId=${SF_A}`, `kind=voice&storefrontId=${SF_A}&pid=${PID}&durationMs=1000`]) {
      const intrus = await appel(`/media/upload?${q}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${B.session}`, 'Content-Type': q.startsWith('kind=voice') ? 'audio/mp4' : 'image/png' },
        body: png,
      });
      expect(intrus.status, `${q}: ${intrus.text}`).toBe(404);
      expect(intrus.json).toEqual({ error: 'not_found' });
    }
    expect((await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).text, 'A\'s shop is byte-identical: no cover, no avatar, no note landed').toBe(avant);
    // no shop named at all: refused by name, not attached to nothing
    const sansBoutique = await appel('/media/upload?kind=cover', {
      method: 'POST',
      headers: { Authorization: `Bearer ${B.session}`, 'Content-Type': 'image/png' },
      body: png,
    });
    expect(sansBoutique.status).toBe(400);
  });

  it('ACCES-ARME-2 — the RETIRED KEY opens nothing: no create, no read, no foreign act, no listing, no supply; and the book holds no ghost', async () => {
    const libre = await creer('rs-nobody-0001', 'sf-own-key', cleRetiree);
    expect(libre.status, libre.text).toBe(401);
    expect(libre.json).toEqual({ error: 'unauthorized' });
    expect((await appel(`/storefronts/${SF_A}`, { headers: cleRetiree })).status).toBe(401);
    // the foreign remove that used to go THROUGH on the key path is refused
    // before any dispatch — and A's shop is byte-identical afterwards
    const avant = (await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).text;
    const retrait = await appel(`/storefronts/${SF_A}/items/remove`, { method: 'POST', headers: cleRetiree, body: JSON.stringify({ pid: PID, at: T0 }) });
    expect(retrait.status).toBe(401);
    expect((await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).text).toBe(avant);
    expect((await appel('/listings', { method: 'POST', headers: cleRetiree, body: '{}' })).status).toBe(401);
    expect((await appel('/supply-projections', { headers: cleRetiree })).status).toBe(401);
    // the directory never learned of the refused create
    const annuaire = (await appel('/storefronts', { headers: cleC })).json as unknown as { id: string }[];
    expect(annuaire.some((r) => r.id === 'sf-own-key')).toBe(false);
  }, 60_000);

  it('ACCES-ARME-2 — key C opens EXACTLY the directory read, a shop\'s takedown and its cleanup, nothing else', async () => {
    // the founder's operator read: every row
    const tout = (await appel('/storefronts', { headers: cleC })).json as unknown as { id: string }[];
    expect(tout.map((r) => r.id)).toEqual(expect.arrayContaining([SF_A, SF_B]));
    // …and the takedown of a shop no session owns any more (a key-era orphan
    // in production): unpublish on key C flips ONLY discoverable; the page lives
    const prise = await appel(`/storefronts/${SF_B}/unpublish`, { method: 'POST', headers: cleC, body: JSON.stringify({ id: SF_B, correlationId: 'corr-orphan', at: T0 }) });
    expect(prise.status, prise.text).toBe(200);
    const ligne = ((await appel('/storefronts', { headers: cleC })).json as unknown as { id: string; discoverable: boolean }[]).find((r) => r.id === SF_B);
    expect(ligne?.discoverable).toBe(false);
    // key C is NOT a write key: create, publish, media, listing, DELETE all refuse
    expect((await creer('rs-nobody-0002', 'sf-own-cle-c', cleC)).status).toBe(401);
    expect((await appel(`/storefronts/${SF_B}/publish`, { method: 'POST', headers: cleC, body: JSON.stringify({ id: SF_B, correlationId: 'c', at: T0 }) })).status).toBe(401);
    expect((await appel(`/storefronts/${SF_B}`, { headers: cleC })).status).toBe(401);
    expect((await appel('/listings', { method: 'POST', headers: cleC, body: '{}' })).status).toBe(401);
    expect((await appel('/supply-projections', { headers: cleC })).status).toBe(401);
    expect((await appel(`/media/upload?kind=cover&storefrontId=${SF_B}`, { method: 'POST', headers: { Authorization: cleC.Authorization, 'Content-Type': 'image/png' }, body: new Uint8Array(64) })).status).toBe(401);
    // and a WRONG key C is nobody at the directory
    expect((await appel('/storefronts', { headers: { Authorization: 'Bearer not-the-founder' } })).status).toBe(401);
    // …and the CLEANUP road (verifier, ACCES-ARME-2): a key-era orphan under a
    // device-era `rs-NNNN` id must not linger for the book to mint that id
    // again and hand a stranger its shop — so key C can DELETE a shop
    // outright: entry, pointer and directory row gone, the public page 404.
    const suppression = await appel(`/storefronts/${SF_B}`, { method: 'DELETE', headers: cleC });
    expect(suppression.status, suppression.text).toBe(200);
    expect(suppression.json['status']).toBe('deleted');
    expect((await appel(`/s/${(suppression.json as { slug?: string }).slug ?? 'own-b'}`, {})).status).toBe(404);
    const apres = (await appel('/storefronts', { headers: cleC })).json as unknown as { id: string }[];
    expect(apres.some((r) => r.id === SF_B)).toBe(false);
    // a wrong key C deletes nothing, and an unknown id is the honest 404
    expect((await appel(`/storefronts/${SF_A}`, { method: 'DELETE', headers: { Authorization: 'Bearer not-the-founder' } })).status).toBe(401);
    expect((await appel(`/storefronts/${SF_A}`, { headers: A.bearer })).status).toBe(200);
    expect((await appel('/storefronts/sf-own-jamais', { method: 'DELETE', headers: cleC })).status).toBe(404);
  }, 60_000);

  it('CORPS-BORNE (AUDIT-SHOP-2 F-06) — a body heavier than its road allows is refused 413 by name BEFORE any route reads it; a body within the bound reaches the road; an undeclared length is bounded by the bytes themselves', async () => {
    const lourd = JSON.stringify({ requestKey: 'x'.repeat(70 * 1024) });
    // the anonymous quote road, in the buyer's own shape with CORS on the refusal
    const devis = await mf.dispatchFetch('http://c/checkout/quote', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://beurni2.github.io' }, body: lourd });
    expect(devis.status).toBe(413);
    expect(await devis.json()).toEqual({ ok: false, reason: 'body_too_large' });
    expect(devis.headers.get('Access-Control-Allow-Origin')).toBe('https://beurni2.github.io');
    // the reseller book, and a session write
    expect((await appel('/reseller/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: lourd })).status).toBe(413);
    const pub = await appel('/listings', { method: 'POST', headers: A.bearer, body: lourd });
    expect(pub.status).toBe(413);
    expect(pub.json).toEqual({ error: 'body_too_large' });
    // the order may carry a ~1 MiB base64 voice note: 1.4 MB passes the ROOT
    // (and is refused downstream BY NAME — no quote of that id), 2.2 MB does not
    const note = JSON.stringify({ quoteId: 'q-jamais', holderRef: 'h', commandId: 'c', contact: { phone: '70 00 00 00', quartier: 'Gounghin', repere: 'x', audioB64: 'A'.repeat(1_400_000) } });
    const cmd = await appel('/checkout/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: note });
    expect(cmd.status, cmd.text).not.toBe(413);
    expect(cmd.status).toBeGreaterThanOrEqual(400);
    const trop = await appel('/checkout/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'A'.repeat(2_200_000) }) });
    expect(trop.status).toBe(413);
    // a body with NO declared length (a chunked stream) is bounded by its bytes
    const flux = new ReadableStream<Uint8Array>({
      start(controller) {
        const morceau = new Uint8Array(16 * 1024).fill(0x41);
        for (let i = 0; i < 5; i += 1) controller.enqueue(morceau);
        controller.close();
      },
    });
    const sansLongueur = await mf.dispatchFetch('http://c/reseller/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: flux,
      // @ts-expect-error — undici's half-duplex streaming body
      duplex: 'half',
    });
    expect(sansLongueur.status).toBe(413);
    // …and a small body with no declared length still reaches its road
    const petit = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ email: 'nobody@example.bf', password: 'grain-de-nere-77' })));
        controller.close();
      },
    });
    const entree = await mf.dispatchFetch('http://c/reseller/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: petit,
      // @ts-expect-error — undici's half-duplex streaming body
      duplex: 'half',
    });
    expect(entree.status, await entree.clone().text()).not.toBe(413);
  });

  it('PUBLIC-DECODE-1 (AUDIT-SHOP-2 F-03, F-26) — a segment that will not decode is nobody\'s on EVERY road: the buyer\'s public reads, key C\'s operator roads, the session\'s pid segment, the webhook\'s leg-key read — never a 500', async () => {
    // the buyer's public reads (these two answered `500 URIError` before)
    const page = await appel('/s/%FF', {});
    expect(page.status, page.text).toBe(404);
    expect(page.json['error']).toBe('not_found');
    expect((await appel('/media/%FF', {})).status).toBe(404);
    expect((await appel('/media/a%C0', {})).status).toBe(404);
    // key C's operator roads (the session roads were guarded at the root by a2a; these reach the router unguarded)
    const prise = await appel('/storefronts/%FF/unpublish', { method: 'POST', headers: cleC, body: JSON.stringify({ id: '%FF', correlationId: 'c', at: T0 }) });
    expect(prise.status, prise.text).toBe(404);
    expect(prise.json).toEqual({ error: 'not_found' });
    const efface = await appel('/storefronts/%FF', { method: 'DELETE', headers: cleC });
    expect(efface.status, efface.text).toBe(404);
    // the session's pid segment — the shop segment already read as her mute 404
    expect((await appel(`/listings/by-pid/${SF_A}/%FF`, { headers: A.bearer })).status).toBe(404);
    expect((await appel(`/listings/by-pid/${SF_A}/%FF/economics`, { headers: A.bearer })).status).toBe(404);
    // the webhook's leg-key read: with the secret, the same NAMED 400 a bad alphabet earns; without it, 401 first
    const leg = await appel('/checkout/webhook/leg-key/%FF', { headers: { 'X-Payment-Webhook-Key': 'test-payment-webhook-secret-o001' } });
    expect(leg.status, leg.text).toBe(400);
    expect(leg.json).toEqual({ error: 'bad_field', field: 'orderId' });
    expect((await appel('/checkout/webhook/leg-key/%FF', {})).status).toBe(401);
  });

  it('SLUG-UNIQUE-1 (AUDIT-SHOP-2 F-01) — a rival cannot take A\'s slug: her create under A\'s short code is refused by name, A\'s public page is byte-identical, nothing was created; the slug of a deleted shop is free again, and then held', async () => {
    // the canon short code is the slug upper-cased (`OWN-0001` → `own-0001`)
    const codeA = slugA.toUpperCase();
    const codeB = slugB.toUpperCase();
    const avant = await appel(`/s/${slugA}`, {});
    expect(avant.status).toBe(200);
    expect(avant.json['id']).toBe(SF_A);
    // B, seated, names a NEW id of her own with A's short code — the hijack the
    // audit measured: this create used to answer `created` and re-point A's page
    const vol = await creerAvec(B.accountId, 'sf-own-vol', B.bearer, codeA, 'cmd-vol');
    expect(vol.status, vol.text).toBe(409);
    expect(vol.json).toEqual({ error: 'slug_taken' });
    expect(vol.text, 'the refusal names nothing of A').not.toContain(A.accountId);
    // THE BOOK: A's page resolves to A, byte for byte; B's id was never created;
    // the directory holds exactly one row for the slug
    expect((await appel(`/s/${slugA}`, {})).text).toBe(avant.text);
    expect((await appel('/storefronts/sf-own-vol', { headers: B.bearer })).status).toBe(404);
    const annuaire = (await appel('/storefronts', { headers: cleC })).json as unknown as { id: string; slug: string }[];
    expect(annuaire.filter((r) => r.slug === slugA).map((r) => r.id)).toEqual([SF_A]);
    expect(annuaire.some((r) => r.id === 'sf-own-vol')).toBe(false);
    // B's shop was DELETED on key C above: its slug is free, and B takes it back
    // under a new id — the only road that ever frees a slug
    const reprise = await creerAvec(B.accountId, 'sf-own-b2', B.bearer, codeB, 'cmd-reprise');
    expect(reprise.status, reprise.text).toBe(200);
    expect(reprise.json['status']).toBe('created');
    expect((await appel(`/s/${slugB}`, {})).json['id']).toBe('sf-own-b2');
    // …and now that B holds it, A cannot take it either — the law has no owner bias
    const retour = await creerAvec(A.accountId, 'sf-own-a2', A.bearer, codeB, 'cmd-retour');
    expect(retour.status, retour.text).toBe(409);
    expect(retour.json).toEqual({ error: 'slug_taken' });
    expect((await appel(`/s/${slugB}`, {})).json['id']).toBe('sf-own-b2');
  });

  it('VITRINE-LECTURE-1 (AUDIT-SHOP-2 F-05, F-29) — one boutique read asks the producer ONCE for the whole shop; a pid the collection omits is asked alone (the denial road kept, nothing hidden); a producer that never answers costs the read its timeout, not the page — and the page SAYS it is incomplete', async () => {
    // A's shop gains two more products (three curated in all)
    for (const n of [2, 3]) {
      const pub = await publierPid(SF_A, `lst-own-${n}`, A.bearer, A.accountId, `pv-own-${n}`, `ov-own-${n}`);
      expect(pub.status, pub.text).toBe(200);
    }
    lecturesCollection = 0;
    lecturesUnitaires = 0;
    const page = await appel(`/s/${slugA}`, {});
    expect(page.status, page.text).toBe(200);
    const pids = (p: typeof page) => ((p.json['products'] as { pid: string }[]) ?? []).map((x) => x.pid).sort();
    expect(pids(page)).toEqual(['pv-own-1', 'pv-own-2', 'pv-own-3']);
    expect(lecturesCollection, 'ONE collection read for the whole shop').toBe(1);
    expect(lecturesUnitaires, 'no single read when the collection carries every pid').toBe(0);
    expect(page.json['incomplet']).toBeUndefined();
    // the collection omits one pid: it is asked ALONE — a list's silence is never
    // the producer's denial — and still renders; its listing stays published
    collectionOmet.add('pv-own-3');
    lecturesCollection = 0;
    lecturesUnitaires = 0;
    const encore = await appel(`/s/${slugA}`, {});
    expect(pids(encore)).toEqual(['pv-own-1', 'pv-own-2', 'pv-own-3']);
    expect(lecturesCollection).toBe(1);
    expect(lecturesUnitaires).toBe(1);
    expect(encore.json['incomplet']).toBeUndefined();
    expect((await appel(`/listings/by-pid/${SF_A}/pv-own-3`, { headers: A.bearer })).json['status']).toBe('published');
    // the single read never answers: the page comes back within the supply
    // timeout, that product omitted, the page MARKED — never a silent loss
    unitaireSuspendu.add('pv-own-3');
    const debut = Date.now();
    const coupe = await appel(`/s/${slugA}`, {});
    const duree = Date.now() - debut;
    expect(coupe.status, coupe.text).toBe(200);
    expect(duree, 'bounded by the supply timeout, not by the producer').toBeLessThan(6_000);
    expect(pids(coupe)).toEqual(['pv-own-1', 'pv-own-2']);
    expect(coupe.json['incomplet']).toBe(true);
    expect((await appel(`/listings/by-pid/${SF_A}/pv-own-3`, { headers: A.bearer })).json['status'], 'a hiccup never hides').toBe('published');
    collectionOmet.clear();
    unitaireSuspendu.clear();
  }, 30_000);

  it('VITRINE-LECTURE-1 — past the ceiling the page describes MAX_PRODUITS_DECRITS products, in her order, and says so — instead of throwing past the platform budget and dropping the rest in silence', async () => {
    // The stub's faults are reset HERE too, not only at the previous case's
    // tail: a case that fails mid-way leaves them set, and this case would
    // then fail for its neighbour's reason (seen under mutation).
    collectionOmet.clear();
    unitaireSuspendu.clear();
    for (let n = 4; n <= 22; n += 1) {
      const pub = await publierPid(SF_A, `lst-own-${n}`, A.bearer, A.accountId, `pv-own-${n}`, `ov-own-${n}`);
      expect(pub.status, pub.text).toBe(200);
    }
    lecturesCollection = 0;
    const page = await appel(`/s/${slugA}`, {});
    expect(page.status, page.text).toBe(200);
    const produits = page.json['products'] as { pid: string }[];
    expect(MAX_PRODUITS_DECRITS, 'the ceiling this case drives past').toBeLessThan(22);
    expect(produits).toHaveLength(MAX_PRODUITS_DECRITS);
    expect(produits.map((p) => p.pid)).toEqual(Array.from({ length: MAX_PRODUITS_DECRITS }, (_, i) => `pv-own-${i + 1}`));
    expect(page.json['incomplet']).toBe(true);
    expect(lecturesCollection, 'still ONE collection read at the ceiling').toBe(1);
    // THE BUDGET, on the worst path: the collection FAILS, every described
    // pid falls to the single road, and the page still answers — 4 + 3·15
    // hops under the platform's 50, never the throw that killed the page.
    collectionEnPanne = true;
    lecturesCollection = 0;
    lecturesUnitaires = 0;
    const pire = await appel(`/s/${slugA}`, {});
    expect(pire.status, pire.text).toBe(200);
    expect(lecturesCollection).toBe(1);
    expect(lecturesUnitaires, 'every described pid asked alone').toBe(MAX_PRODUITS_DECRITS);
    expect((pire.json['products'] as { pid: string }[]).length).toBe(MAX_PRODUITS_DECRITS);
    expect(pire.json['incomplet']).toBe(true);
    collectionEnPanne = false;
  }, 60_000);
});
