#!/usr/bin/env node
/**
 * WO-4.4 / WO-7.2b — THE PWA BUDGET GATE (PERF-BUDGETS.md, quoted):
 *   "Initial PWA payload (buyer surface) | < 300 KB compressed"
 *   "Buyer-page JS payload | ≤ 150 KB compressed (inside the 300 KB
 *    founder-signed total)"
 * Every web SURFACE is measured against the same 300 KB per-surface total, built
 * fresh so the measurement (and the Playwright harness that follows) serves
 * TODAY's bytes, never a stale dist. WO-7.2b adds the reseller media-kit surface
 * (`@shop-plus/reseller-kit`, the composeur) as its own line under the same
 * per-surface total — the JS sub-budget stays a buyer-page row.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '../..');
const HARD_TOTAL_BYTES = 300 * 1024; // founder-signed, per surface

/**
 * Build a web surface fresh, then measure the gzip size of every byte the first
 * load fetches (index.html + JS entry chunks + optional manifest/fonts). Returns
 * the compressed total and JS subtotal.
 */
function measureSurface({ name, pkg, dir }) {
  execSync(`pnpm --filter ${pkg} build`, { cwd: ROOT, stdio: 'inherit' });
  const dist = join(ROOT, dir, 'dist');
  const files = [
    'index.html',
    ...(existsSync(join(dist, 'manifest.webmanifest')) ? ['manifest.webmanifest'] : []),
    ...readdirSync(join(dist, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => `assets/${f}`),
    // A consumed woff2 counts toward the total (never the JS budget); public/
    // copies verbatim into dist/.
    ...(existsSync(join(dist, 'fonts'))
      ? readdirSync(join(dist, 'fonts'))
          .filter((f) => f.endsWith('.woff2'))
          .map((f) => `fonts/${f}`)
      : []),
  ];

  let total = 0;
  let js = 0;
  console.log(`\n[${name}] initial payload (everything the first load fetches), compressed:`);
  for (const file of files) {
    const raw = readFileSync(join(dist, file));
    // Text (html/js/manifest) is gzip-served; a woff2 is already brotli-compressed
    // internally and served verbatim — its transfer cost IS its raw size.
    const isFont = file.endsWith('.woff2');
    const size = isFont ? raw.length : gzipSync(raw, { level: 9 }).length;
    total += size;
    if (file.endsWith('.js')) js += size;
    console.log(`  ${file}: ${raw.length} B raw → ${size} B ${isFont ? 'transfer (woff2, not re-gzipped)' : 'gzip'}`);
  }
  console.log(`[${name}] TOTAL: ${total} B compressed (budget: < ${HARD_TOTAL_BYTES} B)`);
  console.log(`[${name}] JS: ${js} B compressed`);
  return { total, js };
}

let failed = false;

// The buyer surface — the founder-signed total AND the buyer-page JS sub-budget.
const buyer = measureSurface({ name: 'buyer-pwa', pkg: '@shop-plus/buyer-pwa', dir: 'apps/buyer-pwa' });
const JS_BUDGET_BYTES = 150 * 1024; // CTO-derived row, inside the buyer total
if (buyer.total >= HARD_TOTAL_BYTES) {
  console.error(`PWA PAYLOAD BUDGET BROKEN [buyer-pwa]: ${buyer.total} B >= ${HARD_TOTAL_BYTES} B`);
  failed = true;
}
if (buyer.js > JS_BUDGET_BYTES) {
  console.error(`BUYER-PAGE JS BUDGET BROKEN: ${buyer.js} B > ${JS_BUDGET_BYTES} B`);
  failed = true;
}

// WO-7.2b — the reseller media-kit surface (the composeur), same per-surface total.
const kit = measureSurface({ name: 'reseller-kit', pkg: '@shop-plus/reseller-kit', dir: 'apps/reseller-kit' });
if (kit.total >= HARD_TOTAL_BYTES) {
  console.error(`PWA PAYLOAD BUDGET BROKEN [reseller-kit]: ${kit.total} B >= ${HARD_TOTAL_BYTES} B`);
  failed = true;
}

if (failed) process.exit(1);
console.log('\nPWA payload budget OK (every surface under the 300 KB per-surface total)');
