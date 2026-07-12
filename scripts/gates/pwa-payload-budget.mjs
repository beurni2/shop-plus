#!/usr/bin/env node
/**
 * WO-4.4 — THE PWA BUDGET GATE (PERF-BUDGETS.md, quoted):
 *   "Initial PWA payload (buyer surface) | < 300 KB compressed"
 *   "Buyer-page JS payload | ≤ 150 KB compressed (inside the 300 KB
 *    founder-signed total)"
 * Builds the buyer PWA fresh, then measures the gzip size of every byte the
 * first load fetches (index.html + the JS entry chunks + the manifest) and
 * fails the merge if either budget breaks. The build also guarantees the
 * Playwright harness that follows serves TODAY's bytes, never a stale dist.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '../..');
const APP = join(ROOT, 'apps/buyer-pwa');
const HARD_TOTAL_BYTES = 300 * 1024; // founder-signed
const JS_BUDGET_BYTES = 150 * 1024; // CTO-derived row, inside the total

execSync('pnpm --filter @shop-plus/buyer-pwa build', { cwd: ROOT, stdio: 'inherit' });

const dist = join(APP, 'dist');
const files = [
  'index.html',
  'manifest.webmanifest',
  ...readdirSync(join(dist, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `assets/${f}`),
  // WO-5.3: the Archivo woff2 is CONSUMED now (main.ts @font-face,
  // font-display:optional) — the first load fetches it, so it counts toward the
  // 300 KB total (never the JS budget). public/ copies verbatim into dist/.
  ...(existsSync(join(dist, 'fonts'))
    ? readdirSync(join(dist, 'fonts'))
        .filter((f) => f.endsWith('.woff2'))
        .map((f) => `fonts/${f}`)
    : []),
];

let total = 0;
let js = 0;
console.log('initial payload (everything the first load fetches), compressed:');
for (const file of files) {
  const raw = readFileSync(join(dist, file));
  // Text (html/js/manifest) is gzip-served; a woff2 is already brotli-compressed
  // internally and served verbatim — its transfer cost IS its raw size, so it is
  // NOT re-gzipped (that would misreport the real first-load bytes).
  const isFont = file.endsWith('.woff2');
  const size = isFont ? raw.length : gzipSync(raw, { level: 9 }).length;
  total += size;
  if (file.endsWith('.js')) js += size;
  console.log(`  ${file}: ${raw.length} B raw → ${size} B ${isFont ? 'transfer (woff2, not re-gzipped)' : 'gzip'}`);
}
console.log(`TOTAL: ${total} B compressed (budget: < ${HARD_TOTAL_BYTES} B)`);
console.log(`JS: ${js} B compressed (budget: ≤ ${JS_BUDGET_BYTES} B)`);

if (total >= HARD_TOTAL_BYTES) {
  console.error(`PWA PAYLOAD BUDGET BROKEN: ${total} B >= ${HARD_TOTAL_BYTES} B`);
  process.exit(1);
}
if (js > JS_BUDGET_BYTES) {
  console.error(`BUYER-PAGE JS BUDGET BROKEN: ${js} B > ${JS_BUDGET_BYTES} B`);
  process.exit(1);
}
console.log('PWA payload budget OK');
