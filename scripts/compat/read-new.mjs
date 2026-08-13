// Full read pass with the CURRENT checkout's build over a seeded persist dir.
// Covers: vitrine read, admin list, publish of a new pid, stored-quote readback,
// order create against the OLD stored quote, and a fresh quote issuance.
import { makeMf, authed, show } from './compat-lib.mjs';

const persist = process.argv[2];
const label = process.argv[3] ?? 'NEW';
const oldQuoteId = process.argv[4];
const mf = makeMf(persist);

await show(`GET /s/repro-0001 [${label}]`, await mf.dispatchFetch('http://c/s/repro-0001'));
await show(`GET /storefronts (admin) [${label}]`, await mf.dispatchFetch('http://c/storefronts', { headers: authed }));
await show(`GET /storefronts/sf-repro-0001 (authed) [${label}]`, await mf.dispatchFetch('http://c/storefronts/sf-repro-0001', { headers: authed }));

await show(
  `POST /listings NEW pid pv-bazin-0001 [${label}]`,
  await mf.dispatchFetch('http://c/listings', {
    method: 'POST', headers: authed,
    body: JSON.stringify({
      commandId: `publish-lst-sf-repro-0001-pv-bazin-0001-${label}`,
      listingId: `lst-repro-b-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      storefrontId: 'sf-repro-0001',
      resellerId: 'rs-repro-0001',
      productVersionId: 'pv-bazin-0001',
      offerVersion: 'ov-1',
      markup: 500,
      correlationId: 'corr-repro-b',
      at: new Date().toISOString(),
    }),
  }),
);

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
      zoneTo: 'Gounghin, Ouagadougou', attributionResellerId: 'rs-repro-0001',
      requestKey: `rq-fresh-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    }),
  }),
);

await mf.dispose();
console.log(`\nFULL READ PASS DONE [${label}]`);
