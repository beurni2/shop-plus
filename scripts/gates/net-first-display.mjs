#!/usr/bin/env node
import { readFileSync } from 'node:fs';

/**
 * CI gate: net-first-display (SP-I04/SP-I12; §5.4: "The reseller MUST see
 * resellerNet (not gross) before promoting; gross-first UI is a CI-tested
 * prohibition."). Takes an earnings-surface descriptor — the ordered list of
 * money fields the surface renders — and fails when the surface is not
 * net-first. Real surfaces export their descriptor from the app code and a
 * unit test pins the checked-in copy to the module (no drift).
 */
const file = process.argv[2];
if (!file) {
  console.error('usage: net-first-display.mjs <surface-descriptor.json>');
  process.exit(2);
}
let surface;
try {
  surface = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`net-first-display: cannot read descriptor ${file}: ${String(err)}`);
  process.exit(2);
}
const fields = surface?.moneyFieldsInRenderOrder;
if (!Array.isArray(fields) || fields.length === 0 || typeof surface.surface !== 'string') {
  console.error(`net-first-display: ${file} is not a surface descriptor (surface + moneyFieldsInRenderOrder required)`);
  process.exit(2);
}
const problems = [];
const netIdx = fields.indexOf('resellerNet');
if (netIdx === -1) {
  problems.push('surface renders earnings without resellerNet at all');
}
if (netIdx !== 0) {
  problems.push(`resellerNet must render FIRST; found at position ${netIdx + 1} of [${fields.join(', ')}]`);
}
const GROSS = /gross|resellerGrossEarnings|commissionPlusMarkup/i;
const grossIdx = fields.findIndex((f) => GROSS.test(f));
if (grossIdx !== -1 && (netIdx === -1 || grossIdx < netIdx)) {
  problems.push(`gross earnings ("${fields[grossIdx]}") render before resellerNet — gross-first UI is prohibited`);
}
if (problems.length === 0) {
  console.log(`net-first-display OK — ${surface.surface} renders resellerNet first (${fields.join(' → ')})`);
  process.exit(0);
}
console.error(`net-first-display FAILED on ${surface.surface} (SP-I04/SP-I12):`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
