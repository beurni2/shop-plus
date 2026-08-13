// Harness v2 — adds the checkout DOs so /checkout/* routes work.
import { createRequire } from 'node:module';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const SVC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'services', 'storefront-service');
const req = createRequire(SVC + '/package.json');
const { Miniflare } = req('miniflare');

export const WRITE_SECRET = 'test-write-secret-0001';
export const authed = { 'X-Write-Key': WRITE_SECRET };

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
    },
    r2Buckets: ['BUCKET'],
    durableObjectsPersist: persist,
    bindings: {
      STOREFRONT_WRITE_SECRET: WRITE_SECRET,
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

