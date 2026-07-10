#!/usr/bin/env node
// GATE (WO-2.3; plan M4): the problem path records and speaks — it NEVER
// moves money. Scans the problem-path source for ledger/settlement/escrow/
// reservation/waterfall machinery by name; any hit fails. Pass a directory
// to scan a planted negative fixture instead of the real source.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const target = process.argv[2] ?? 'packages/commerce-core/src/problem-path.ts';
const BANNED = [
  /recordObligations/i,
  /recordEscrow/i,
  /obligationsFor\s*\(/,
  /escrowFor\s*\(/,
  /SettlementObligation/,
  /EscrowTxn/,
  /computeWaterfall/,
  /decideReservation/,
  /kind:\s*'release'/,
  /refund/i,
  /\bledger\b/i,
];

function files(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { recursive: true })
    .map((f) => join(path, String(f)))
    .filter((f) => statSync(f).isFile() && /\.(ts|mjs|js)$/.test(f));
}

const hits = [];
for (const file of files(target)) {
  // scan CODE, not prose: strip block and line comments first
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  source.split('\n').forEach((line, i) => {
    for (const pattern of BANNED) {
      if (pattern.test(line)) hits.push(`${file}:${i + 1} [${pattern}] ${line.trim().slice(0, 90)}`);
    }
  });
}
if (hits.length > 0) {
  console.error(`problem-path-never-releases FAILED — ${hits.length} money-machinery hit(s):`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`problem-path-never-releases OK — no ledger/escrow/reservation/refund machinery in ${target}`);
process.exit(0);
