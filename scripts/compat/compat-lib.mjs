// Harness v3 — adds the checkout DOs so /checkout/* routes work, and (ACCES-ARME-2)
// the ACCOUNT BOOK + key C, because the shared write key is retired: a storefront
// write is a reseller SESSION or 401. `seance()` seats one on the real doors and
// `seance.json` in the persist dir carries her across the OLD → NEW runs.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const SVC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'services', 'storefront-service');
const req = createRequire(SVC + '/package.json');
const { Miniflare } = req('miniflare');

/** The founder's key C on this harness — the ONLY non-session credential the
 *  Worker still reads on the storefront surface (the directory read, the orphan
 *  takedown). A test value: the harness never touches the deployed store. */
export const OPS_SECRET = 'compat-checkout-ops-secret-0001';
export const cleC = { Authorization: `Bearer ${OPS_SECRET}`, 'Content-Type': 'application/json' };

const SUPPLY = [
  { productVersionId: 'pv-a2-1', offerVersion: 'ov-a2-live', basePrice: 8000, resellerCommission: 600, available: 7, productName: 'Bogolan', assetRefs: ['media/hero-square/cap-a2'], category: 'fashion_bags_fabrics' },
  { productVersionId: 'pv-bazin-0001', offerVersion: 'ov-1', basePrice: 10000, resellerCommission: 750, available: 10, productName: 'Bazin', assetRefs: [], category: 'fashion_bags_fabrics' },
];

export function makeMf(persist) {
  return new Miniflare({
    modules: true,
    scriptPath: SVC + '/dist/worker/worker.mjs',
    durableObjects: {
      STOREFRONT: 'StorefrontDO',
      LISTING: 'ListingDO',
      CHECKOUT: 'CheckoutDO',
      ORDER: 'OrderDO',
      LADDER: 'BuyerLadderDO',
      COMPTES: 'ResellerAccountsDO',
    },
    r2Buckets: ['BUCKET'],
    durableObjectsPersist: persist,
    bindings: {
      CHECKOUT_OPS_SECRET: OPS_SECRET,
      PRODUCT_MEDIA_BASE: 'https://media-service.example.workers.dev/media/',
      MEDIA_PUBLIC_BASE: 'https://storefront-service.example.workers.dev',
    },
    serviceBindings: {
      OFFER: async (request) => {
        const path = new URL(request.url).pathname;
        const asOf = new Date().toISOString();
        if (path === '/supply-projections') {
          return Response.json({ asOf, items: SUPPLY.map((value) => ({ version: 1, asOf, value })) });
        }
        const single = /^\/supply-projection\/([^/]+)$/.exec(path);
        if (single) {
          const pid = decodeURIComponent(single[1]);
          const value = SUPPLY.find((v) => v.productVersionId === pid);
          if (value === undefined) {
            return Response.json({ service: 'offer-service', status: 'not_found', reason: 'unknown_product_version' }, { status: 404 });
          }
          return Response.json({ version: 1, asOf, value });
        }
        return Response.json({ service: 'offer-service', status: 'not_found' }, { status: 404 });
      },
    },
  });
}

/** Signup → the founder mints on key C → admission: an ACTIVE reseller. Persisted
 *  to `<persist>/seance.json` so the NEW build's read pass can act AS HER — the
 *  book itself lives in the same durable storage, so her session still resolves. */
export async function seance(mf, persist) {
  const post = async (path, headers, body) => {
    const res = await mf.dispatchFetch(`http://c${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = {}; }
    if (res.status !== 200) throw new Error(`${path} -> ${res.status} ${text}`);
    return json;
  };
  const s = await post('/reseller/signup', { 'Content-Type': 'application/json' }, { name: 'Awa Repro', email: `awa-repro-${Date.now()}@example.bf`, phone: '+226 70 00 00 01', password: 'grain-de-nere-77' });
  const m = await post('/reseller/accounts/access-code', cleC, { accountId: s.accountId });
  const bearer = { Authorization: `Bearer ${s.session}`, 'Content-Type': 'application/json' };
  await post('/reseller/admission', bearer, { code: m.code });
  const seat = { accountId: s.accountId, session: s.session };
  writeFileSync(join(persist, 'seance.json'), JSON.stringify(seat));
  return { ...seat, bearer, octets: (t) => ({ Authorization: `Bearer ${s.session}`, 'Content-Type': t }) };
}

/** The seat the OLD build's seed wrote. Absent ⇒ the seed predates ACCES-ARME-2
 *  (it wrote with the retired key) — the caller must say so rather than guess. */
export function lireSeance(persist) {
  let raw;
  try { raw = readFileSync(join(persist, 'seance.json'), 'utf8'); } catch { return null; }
  const seat = JSON.parse(raw);
  return { ...seat, bearer: { Authorization: `Bearer ${seat.session}`, 'Content-Type': 'application/json' } };
}

export async function show(label, res) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
  console.log(`\n== ${label} -> ${res.status}`);
  console.log(typeof body === 'string' ? body : JSON.stringify(body).slice(0, 900));
  return body;
}

export function tinyPng() {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0x00, 0x00, 0x00, 0x0d], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  b.set([0x00, 0x00, 0x01, 0x00], 16);
  b.set([0x00, 0x00, 0x01, 0x00], 20);
  return b;
}
