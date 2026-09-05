// PHASE 1 — write with the OLD build (run while the worktree is at the commit
// production currently runs). Persist dir is FIXED so the NEW build can read the
// same durable storage. ACCES-ARME-2: the shop is written AS A SEATED RESELLER
// (her session, minted on the real doors) and her seat is saved beside the
// storage so phase 2 can act as her.
import { makeMf, seance, tinyPng, show, cleC } from './compat-lib.mjs';

const persist = process.argv[2];
if (!persist) throw new Error('usage: node seed-old.mjs <persist-dir>');
const mf = makeMf(persist);

const S = await seance(mf, persist);
console.log('seated:', S.accountId);

const T0 = new Date().toISOString();
const SF = {
  commandId: 'cmd-repro-create',
  id: 'sf-repro-0001',
  resellerId: S.accountId,
  shortCode: 'REPRO-0001',
  name: 'Boutique du repro',
  zone: 'Ouagadougou',
  category: 'Général',
  correlationId: 'corr-repro',
  at: T0,
};

const created = await mf.dispatchFetch('http://c/storefronts', { method: 'POST', headers: S.bearer, body: JSON.stringify(SF) });
await show('POST /storefronts (create)', created);

const pub = await mf.dispatchFetch('http://c/storefronts/sf-repro-0001/publish', {
  method: 'POST', headers: S.bearer,
  body: JSON.stringify({ id: 'sf-repro-0001', correlationId: 'corr-repro-pub', at: T0 }),
});
await show('POST /storefronts/:id/publish', pub);

const ident = await mf.dispatchFetch('http://c/storefronts/sf-repro-0001/identity', {
  method: 'POST', headers: S.bearer,
  body: JSON.stringify({ patch: { headerStyle: 'heritage', tagline: 'La belle boutique' }, at: new Date().toISOString() }),
});
await show('POST /storefronts/:id/identity (headerStyle=heritage)', ident);

const up = await mf.dispatchFetch('http://c/media/upload?kind=cover&storefrontId=sf-repro-0001', {
  method: 'POST', headers: S.octets('image/png'), body: tinyPng(),
});
await show('POST /media/upload (cover)', up);

const lst = await mf.dispatchFetch('http://c/listings', {
  method: 'POST', headers: S.bearer,
  body: JSON.stringify({
    commandId: 'publish-lst-sf-repro-0001-pv-a2-1',
    listingId: 'lst-repro-0001',
    storefrontId: 'sf-repro-0001',
    resellerId: S.accountId,
    productVersionId: 'pv-a2-1',
    offerVersion: 'ov-a2-1',
    markup: 1200,
    correlationId: 'corr-repro-lst',
    at: new Date().toISOString(),
  }),
});
await show('POST /listings (publish pv-a2-1)', lst);

// ---- READS with the OLD build (baseline truth) ----
await show('GET /s/repro-0001 [OLD build]', await mf.dispatchFetch('http://c/s/repro-0001'));
await show('GET /storefronts/sf-repro-0001 (as her) [OLD build]', await mf.dispatchFetch('http://c/storefronts/sf-repro-0001', { headers: S.bearer }));
await show('GET /storefronts (directory, key C) [OLD build]', await mf.dispatchFetch('http://c/storefronts', { headers: cleC }));

await mf.dispose();
console.log('\nSEED DONE, persist dir:', persist, '— her seat is in seance.json beside the storage');
