#!/usr/bin/env node
/**
 * WO-4.4 / WO-7.2b — THE PWA BUDGET GATE (PERF-BUDGETS.md, quoted):
 *   "Initial PWA payload (buyer surface) | < 320 KB compressed" (Amendment
 *    1.1, founder-signed « 320 » 2026-08-31; 300 KB from D17 2026-07-10)
 *   "Buyer-page JS payload | ≤ 150 KB compressed (inside the 320 KB
 *    founder-signed total)"
 * Every web SURFACE is measured against the same 320 KB per-surface total, built
 * fresh so the measurement (and the Playwright harness that follows) serves
 * TODAY's bytes, never a stale dist. WO-7.2b adds the reseller media-kit surface
 * (`@shop-plus/reseller-kit`, the composeur) as its own line under the same
 * per-surface total — the JS sub-budget stays a buyer-page row.
 *
 * ENTETES-H — WHAT « FIRST LOAD » MEANS ONCE CHUNKS ARE LAZY.
 * This gate has always claimed to measure « every byte the FIRST LOAD fetches ».
 * It implemented that by globbing every `assets/*.js`, which WAS the same thing
 * while the app shipped one bundle. It stopped being the same thing when the
 * header styles moved behind dynamic `import()`: a shop draws exactly ONE
 * header, so the other style chunks are bytes NO BUYER EVER FETCHES, and
 * counting them made the gate refuse work it was never meant to refuse.
 *
 * The founder-signed 300 KB is UNCHANGED and is NOT raised here. What changed is
 * that the measurement now matches the sentence it was always written against:
 *   · FIRST LOAD  = index.html + the entry graph index.html actually references
 *                   + fonts — what her phone downloads before she sees anything.
 *   · WORST CASE  = first load + the LARGEST single lazy chunk, because she does
 *                   fetch exactly one style and the budget must hold for
 *                   whichever one her seller chose.
 *   · PER CHUNK   = every lazy chunk carries its own ceiling, so « it's lazy »
 *                   never becomes a licence for one bloated style.
 * The gate asserts WORST CASE, never the sum of all chunks. Twenty styles cost
 * a buyer one style.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '../..');
const HARD_TOTAL_BYTES = 320 * 1024; // founder-signed, per surface (Amendment 1.1, « 320 », 2026-08-31)

/**
 * Build a web surface fresh, then measure the gzip size of every byte the first
 * load fetches (index.html + JS entry chunks + optional manifest/fonts). Returns
 * the compressed total and JS subtotal.
 */
function measureSurface({ name, pkg, dir }) {
  execSync(`pnpm --filter ${pkg} build`, { cwd: ROOT, stdio: 'inherit' });
  const dist = join(ROOT, dir, 'dist');
  const html = readFileSync(join(dist, 'index.html'), 'utf8');

  // THE ENTRY GRAPH IS WHAT index.html REFERENCES — not whatever sits on disk.
  // A dynamic import() emits a chunk index.html never names, which is exactly
  // how « fetched on first load » is told from « fetched only if she was given
  // that style ».
  const referenced = new Set(
    [...html.matchAll(/(?:src|href)="(?:\.?\/)?((?:assets|fonts)\/[^"]+)"/g)].map((m) => m[1]),
  );
  const allAssets = readdirSync(join(dist, 'assets')).map((f) => `assets/${f}`);
  const fonts = existsSync(join(dist, 'fonts'))
    ? readdirSync(join(dist, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => `fonts/${f}`)
    : [];

  const sizeOf = (file) => {
    const raw = readFileSync(join(dist, file));
    // a woff2 is already compressed internally and served verbatim — its
    // transfer cost IS its raw size; text is gzip-served.
    return file.endsWith('.woff2') ? raw.length : gzipSync(raw, { level: 9 }).length;
  };

  const firstLoadFiles = [
    'index.html',
    ...(existsSync(join(dist, 'manifest.webmanifest')) ? ['manifest.webmanifest'] : []),
    ...allAssets.filter((f) => referenced.has(f)),
    ...fonts,
  ];
  const lazyFiles = allAssets.filter((f) => f.endsWith('.js') && !referenced.has(f));

  let total = 0;
  let js = 0;
  console.log(`\n[${name}] FIRST LOAD (index.html's own graph + fonts), compressed:`);
  for (const file of firstLoadFiles) {
    const size = sizeOf(file);
    total += size;
    if (file.endsWith('.js')) js += size;
    console.log(`  ${file}: ${size} B`);
  }

  let worstLazy = 0;
  let worstLazyName = '(none)';
  if (lazyFiles.length > 0) {
    console.log(`[${name}] LAZY chunks — a buyer fetches AT MOST ONE:`);
    for (const file of lazyFiles) {
      const size = sizeOf(file);
      console.log(`  ${file}: ${size} B`);
      if (size > worstLazy) {
        worstLazy = size;
        worstLazyName = file;
      }
    }
  }

  // GUARD — a gate that mistakes the ENTRY bundle for a lazy chunk would let the
  // main bundle grow without limit while reporting green. If nothing in the
  // first load is JS, the reference scan failed (a path shape changed) and this
  // measurement is meaningless. Fail loudly rather than pass silently.
  if (js === 0) {
    console.error(
      `[${name}] REFERENCE SCAN FAILED — index.html named no JS this gate could resolve.\n` +
        `  The entry bundle would be counted as lazy and the budget would be a lie.\n` +
        `  index.html references: ${[...referenced].join(', ') || '(none matched)'}`,
    );
    process.exit(1);
  }

  const worst = total + worstLazy;
  console.log(`[${name}] FIRST LOAD: ${total} B compressed`);
  console.log(`[${name}] WORST CASE: ${worst} B (first load + largest lazy chunk ${worstLazyName} @ ${worstLazy} B)`);
  console.log(`[${name}] budget: < ${HARD_TOTAL_BYTES} B`);
  console.log(`[${name}] JS (first load): ${js} B compressed`);
  return { total, js, worst, worstLazy, worstLazyName, lazyCount: lazyFiles.length };
}

let failed = false;

// The buyer surface — the founder-signed total AND the buyer-page JS sub-budget.
const buyer = measureSurface({ name: 'buyer-pwa', pkg: '@shop-plus/buyer-pwa', dir: 'apps/buyer-pwa' });
const JS_BUDGET_BYTES = 150 * 1024; // CTO-derived row, inside the buyer total
// Asserted on the WORST CASE a real buyer can be served: her first load plus
// the ONE style chunk her seller chose. Never the sum of every style — she is
// not sent nineteen headers she did not pick.
if (buyer.worst >= HARD_TOTAL_BYTES) {
  console.error(`PWA PAYLOAD BUDGET BROKEN [buyer-pwa]: worst case ${buyer.worst} B >= ${HARD_TOTAL_BYTES} B`);
  failed = true;
}
// …and no single lazy chunk may bloat behind the word « lazy ». Measured: a
// header style is ~3 KB gz, so this is generous for a rich style and tight
// enough that a mistake shows up here rather than on a 1 GB phone.
const LAZY_CHUNK_CEILING = 16 * 1024;
if (buyer.worstLazy > LAZY_CHUNK_CEILING) {
  console.error(
    `LAZY CHUNK TOO BIG [buyer-pwa]: ${buyer.worstLazyName} is ${buyer.worstLazy} B > ${LAZY_CHUNK_CEILING} B`,
  );
  failed = true;
}
if (buyer.js > JS_BUDGET_BYTES) {
  console.error(`BUYER-PAGE JS BUDGET BROKEN: ${buyer.js} B > ${JS_BUDGET_BYTES} B`);
  failed = true;
}

// WO-7.2b — the reseller media-kit surface (the composeur), same per-surface total.
const kit = measureSurface({ name: 'reseller-kit', pkg: '@shop-plus/reseller-kit', dir: 'apps/reseller-kit' });
if (kit.worst >= HARD_TOTAL_BYTES) {
  console.error(`PWA PAYLOAD BUDGET BROKEN [reseller-kit]: worst case ${kit.worst} B >= ${HARD_TOTAL_BYTES} B`);
  failed = true;
}

if (failed) process.exit(1);
console.log('\nPWA payload budget OK (every surface under the 320 KB per-surface total)');
