#!/usr/bin/env node
import { readFileSync } from 'node:fs';

/**
 * CI gate: discovery-returns-stores (SP-I05: "Discovery MUST return reseller
 * stores, not a cross-reseller product pool."). Takes a discovery response
 * payload; passes only when the top level is a store collection where every
 * entry names its store and reseller. A flat product pool fails.
 */
const file = process.argv[2];
if (!file) {
  console.error('usage: discovery-returns-stores.mjs <discovery-response.json>');
  process.exit(2);
}
let response;
try {
  response = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`discovery-returns-stores: cannot read response ${file}: ${String(err)}`);
  process.exit(2);
}
const problems = [];
const POOL_KEYS = ['products', 'items', 'productPool', 'results'];
for (const k of POOL_KEYS) {
  if (k in response) problems.push(`top-level "${k}" — a flat cross-reseller pool, not a store collection`);
}
if (!Array.isArray(response.stores)) {
  problems.push('no top-level "stores" array');
} else {
  response.stores.forEach((s, i) => {
    if (!s || typeof s !== 'object' || !s.storefrontId || !s.resellerId || !s.storeName) {
      problems.push(`stores[${i}] is not a store (storefrontId + resellerId + storeName required)`);
    }
  });
}
if (problems.length === 0) {
  console.log(`discovery-returns-stores OK — ${response.stores.length} store(s), no product pool (SP-I05)`);
  process.exit(0);
}
console.error('discovery-returns-stores FAILED (SP-I05 — discovery returns STORES):');
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
