#!/usr/bin/env node
import { readFileSync } from 'node:fs';

/**
 * CI gate: no-supplier-contact (SP-I03: "Customer-facing pages MUST show the
 * reseller as the commercial relationship and MUST NOT expose supplier
 * identity/contact or commission."). Recursively scans a customer-surface
 * payload for banned key families: supplier identity/contact, commission,
 * seller economics, pickup locations.
 */
const file = process.argv[2];
if (!file) {
  console.error('usage: no-supplier-contact.mjs <customer-surface.json>');
  process.exit(2);
}
let payload;
try {
  payload = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`no-supplier-contact: cannot read surface ${file}: ${String(err)}`);
  process.exit(2);
}
const BANNED = [
  { name: 'supplier identity/contact', regex: /supplier/i },
  { name: 'commission', regex: /commission/i },
  { name: 'seller economics', regex: /seller(net|baseprice|platformfee)/i },
  { name: 'base price decomposition', regex: /baseprice/i },
  { name: 'pickup location', regex: /pickup/i },
];
const hits = [];
function walk(value, path) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      for (const { name, regex } of BANNED) {
        if (regex.test(k)) hits.push(`${path}.${k} — ${name}`);
      }
      walk(v, `${path}.${k}`);
    }
  }
}
walk(payload, '$');
if (hits.length === 0) {
  console.log(`no-supplier-contact OK — ${file} carries no supplier identity/contact/commission (SP-I03)`);
  process.exit(0);
}
console.error(`no-supplier-contact FAILED (SP-I03) — ${hits.length} banned key(s) on a customer surface:`);
for (const h of hits) console.error(`  - ${h}`);
process.exit(1);
