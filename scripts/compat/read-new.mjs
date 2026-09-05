// Full read pass with the CURRENT checkout's build over a seeded persist dir.
// Covers: vitrine read, the directory (key C) and her own read, publish of a new
// pid AS HER, stored-quote readback, order create against the OLD stored quote,
// and a fresh quote issuance. ACCES-ARME-2: every reseller act rides the seat the
// seed saved in `seance.json`; without it (a seed written by a pre-a2b build,
// with the retired key) the reseller half of this pass cannot run and says so.
import { makeMf, lireSeance, show, cleC } from './compat-lib.mjs';

const persist = process.argv[2];
const label = process.argv[3] ?? 'NEW';
const oldQuoteId = process.argv[4];
const mf = makeMf(persist);

const S = lireSeance(persist);
if (S === null) {
  console.log('\n!! no seance.json beside the storage: the seed predates ACCES-ARME-2 (it wrote with the retired key).');
  console.log('!! The reseller half of this pass (her read, her publish) needs a seat — re-seed with a build at or after a2b.');
  console.log('!! Running the buyer half and the founder\'s directory read only.');
}

await show(`GET /s/repro-0001 [${label}]`, await mf.dispatchFetch('http://c/s/repro-0001'));
await show(`GET /storefronts (directory, key C) [${label}]`, await mf.dispatchFetch('http://c/storefronts', { headers: cleC }));
if (S !== null) {
  await show(`GET /storefronts/sf-repro-0001 (as her) [${label}]`, await mf.dispatchFetch('http://c/storefronts/sf-repro-0001', { headers: S.bearer }));

  await show(
    `POST /listings NEW pid pv-bazin-0001 (as her) [${label}]`,
    await mf.dispatchFetch('http://c/listings', {
      method: 'POST', headers: S.bearer,
      body: JSON.stringify({
        commandId: `publish-lst-sf-repro-0001-pv-bazin-0001-${label}`,
        listingId: `lst-repro-b-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        storefrontId: 'sf-repro-0001',
        resellerId: S.accountId,
        productVersionId: 'pv-bazin-0001',
        offerVersion: 'ov-1',
        markup: 500,
        correlationId: 'corr-repro-b',
        at: new Date().toISOString(),
      }),
    }),
  );
}

if (oldQuoteId) {
  await show(`GET /checkout/quote/${oldQuoteId} [${label}]`, await mf.dispatchFetch(`http://c/checkout/quote/${oldQuoteId}`));
  await show(
    `POST /checkout/order (old quote) [${label}]`,
    await mf.dispatchFetch('http://c/checkout/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: oldQuoteId, phone: '+22670000001', requestKey: 'rq-order-old-quote' }),
    }),
  );
}

await show(
  `POST /checkout/quote FRESH [${label}]`,
  await mf.dispatchFetch('http://c/checkout/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: 'repro-0001', pid: 'pv-a2-1', paymentMode: 'FULL_PREPAY',
      zoneTo: 'Gounghin, Ouagadougou', attributionResellerId: S?.accountId ?? 'rs-repro-0001',
      requestKey: `rq-fresh-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    }),
  }),
);

await mf.dispose();
console.log(`\nFULL READ PASS DONE [${label}]`);
