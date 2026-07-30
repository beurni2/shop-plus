#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CI gate: copy-lint-inline-refus — THE FRENCH VOICE GATE READS THE STRINGS THAT
 * ARE ACTUALLY ON THE BUYER'S REFUSAL SCREENS.
 *
 * ═══ THE HOLE THIS CLOSES (fresh verifier, SP3.2b round 3) ═══
 *
 * `copy-lint` runs over the i18n CATALOGS. The PWA CLIENTE refusal surface keeps
 * its copy INLINE in `apps/buyer-pwa/src/cliente/screens.ts` (the whole
 * C1–C9 module does — the pixel-for-pixel port predates the catalog and moving it
 * is its own slice). The result was that a dozen user-facing MONEY-register
 * refusal strings — the sentences a buyer reads at the exact moment her money
 * did not move — shipped with ZERO gate coverage. Ten Laws #6 says the copy-lint
 * is enforced « on every user-facing string », not on every string that happens
 * to live in a catalog file.
 *
 * ═══ WHAT IT DOES ═══
 *
 * Extracts the `REFUS` table's `overline` / `titre` / `phrase` / `libelle`
 * values straight out of the source, synthesises a catalog from them, and runs
 * THE SAME `copy-lint` binary the three real catalogs go through — same token
 * lists, same reading budgets, same exit code. `register: money` on every entry,
 * because that is what these screens are; `screenClass: label` for the overline
 * and the button (they are labels), `status` for the title and the sentence.
 *
 * IT FAILS LOUD ON AN EMPTY EXTRACTION. A renamed table or a refactor that moves
 * the strings must break this gate rather than silently lint nothing — a vacuous
 * pass reads as coverage, which is worse than no gate at all.
 *
 * ═══ THE DEBT, NAMED ═══
 *
 * This gate makes the strings LINTED; it does not make them catalog entries with
 * `register` tags, which is what Ten Laws #6 ultimately asks for. Moving the
 * cliente module onto the i18n catalog is journal-worthy debt and its own slice.
 *
 * Usage: copy-lint-inline-refus.mjs [sourceFile]   (default: the real screens.ts)
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = process.argv[2] ?? join(root, 'apps/buyer-pwa/src/cliente/screens.ts');

/** The table's own field names → the screen class each one is. */
const CLASS_OF = { overline: 'label', libelle: 'label', titre: 'status', phrase: 'status' };

const src = readFileSync(SOURCE, 'utf8');

// The refusal views live between the generic default and the lookup helper.
const start = src.indexOf('const REFUS_GENERIQUE');
const end = src.indexOf('export function refusVue');
if (start < 0 || end < 0 || end <= start) {
  console.error('  ✘ could not find the REFUS table in ' + SOURCE);
  console.error('    The table was renamed or moved. This gate must be re-pointed, not deleted:');
  console.error('    linting nothing silently is how these eight strings shipped unlinted.');
  process.exit(1);
}
const block = src.slice(start, end);

const entries = [];
const seen = new Set();
const re = /(overline|titre|phrase|libelle):\s*'((?:[^'\\]|\\.)*)'/g;
let m;
let i = 0;
while ((m = re.exec(block)) !== null) {
  const field = m[1];
  const text = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const key = `${field}:${text}`;
  if (seen.has(key)) continue;
  seen.add(key);
  entries.push({
    key: `cliente.refus.${field}.${i++}`,
    fr: text,
    register: 'money', // every one of these is a money moment
    screenClass: CLASS_OF[field],
  });
}

// A VACUOUS PASS IS WORSE THAN NO GATE. The table has ~15 views × 4 fields; if
// extraction ever collapses, fail rather than report OK over an empty set.
const MIN_ENTRIES = 20;
if (entries.length < MIN_ENTRIES) {
  console.error(`  ✘ extracted only ${entries.length} strings (expected at least ${MIN_ENTRIES}).`);
  console.error('    Refusing to lint a suspiciously empty set — see the header.');
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'refus-lint-'));
const catalog = join(dir, 'cliente-refus.catalog.json');
writeFileSync(catalog, JSON.stringify(entries, null, 1), 'utf8');

console.log(`  extracted ${entries.length} inline refusal strings from ${SOURCE.replace(root + '/', '')}`);
try {
  const out = execFileSync('pnpm', ['exec', 'copy-lint', catalog], { cwd: root, encoding: 'utf8' });
  console.log('  ' + out.trim());
  console.log('\ncopy-lint-inline-refus: OK — every refusal string a buyer reads passed the French Voice lint.');
} catch (err) {
  console.error(err.stdout ?? '');
  console.error(err.stderr ?? '');
  console.error('\ncopy-lint-inline-refus: FAILED');
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
