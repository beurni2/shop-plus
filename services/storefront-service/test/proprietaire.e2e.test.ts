import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';

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
 * The shared key still opens every door it opened — asserted here BY NAME as
 * the residue slice a2b retires, so that removal turns this test red on
 * purpose rather than silently.
 */

const SCRIPT = 'dist/worker/worker.mjs';
const persist = mkdtempSync(join(tmpdir(), 'proprietaire-'));
const T0 = '2026-09-03T08:00:00.000Z';
const WRITE_SECRET = 'test-write-secret-o001';
const OPS_SECRET = 'test-checkout-ops-secret-o001';
const cleC = { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' };
const cle = { 'X-Write-Key': WRITE_SECRET, 'Content-Type': 'application/json' };
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
];

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
    STOREFRONT_WRITE_SECRET: WRITE_SECRET,
    PAYMENT_WEBHOOK_SECRET: 'test-payment-webhook-secret-o001',
    CHECKOUT_OPS_SECRET: OPS_SECRET,
    // Two seated accounts are the whole point of this suite; the a1 ceiling is
    // lifted to exactly that on this test Worker and nowhere else.
    RESELLER_ADMISSION_CEILING: '2',
  },
  serviceBindings: {
    OFFER: async (request: Request) => {
      const path = new URL(request.url).pathname;
      const single = /^\/supply-projection\/([^/]+)$/.exec(path);
      if (single) {
        const value = SUPPLY.find((v) => v.productVersionId === decodeURIComponent(single[1]!));
        if (value === undefined) return Response.json({ status: 'not_found' }, { status: 404 });
        return Response.json({ version: 1, asOf: new Date().toISOString(), value });
      }
      if (path === '/supply-projections') {
        return Response.json({ offers: SUPPLY, diagnostic: { status: 'ok', refusals: [] } });
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

let A!: Awaited<ReturnType<typeof seance>>;
let B!: Awaited<ReturnType<typeof seance>>;
let slugA = '';
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
    expect((await appel('/storefronts/sf-own-x', { headers: cle })).status, 'nothing was created').toBe(404);
    const b = await creer(B.accountId, SF_B, B.bearer);
    expect(b.status, b.text).toBe(200);

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
    // the key-only caller (the founder's operator read, until a2b) keeps the whole directory
    const tout = (await appel('/storefronts', { headers: cle })).json as unknown as { id: string }[];
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
    expect((await appel('/listings/lst-own-intrus', { headers: cle })).status).toBe(404);

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
    expect((await appel('/listings/lst-own-detourne', { headers: cle })).status).toBe(404);

    // with an identity in hand, a publish that names no shop is refused by name
    const sansBoutique = await publier(undefined, 'lst-own-nulle', A.bearer, A.accountId);
    expect(sansBoutique.status).toBe(400);
    expect(sansBoutique.json['error']).toBe('malformed');
  });

  it('only an ACTIVE session is a key: pending and paused sessions open nothing without the shared key', async () => {
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

  it('RESIDUE until a2b, asserted by name: the shared key alone still opens every door with no ownership', async () => {
    const libre = await creer('rs-nobody-0001', 'sf-own-key', cle);
    expect(libre.status, libre.text).toBe(200);
    expect((await appel(`/storefronts/${SF_A}`, { headers: cle })).status).toBe(200);
    // a foreign remove on the key path goes THROUGH (200 — `not_present` for a
    // pid that is not there); a2b retiring the key turns exactly this red
    expect((await appel(`/storefronts/${SF_A}/items/remove`, { method: 'POST', headers: cle, body: JSON.stringify({ pid: 'pv-none', at: T0 }) })).status).toBe(200);
  }, 60_000);
});
