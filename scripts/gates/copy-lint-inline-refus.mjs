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
 * ═══ THE HOLE THIS CLOSES ═══
 *
 * `copy-lint` runs over the i18n CATALOGS. The PWA CLIENTE refusal surface keeps
 * its copy INLINE in `apps/buyer-pwa/src/cliente/screens.ts` (the whole C1–C9
 * module does — the pixel-for-pixel port predates the catalog and moving it is
 * its own slice). So the sentences a buyer reads at the exact moment her money
 * did not move had ZERO gate coverage. Ten Laws #6 enforces the copy-lint on
 * « every user-facing string », not on every string that happens to live in a
 * catalog file.
 *
 * ═══ AND THE HOLE *THIS VERSION* CLOSES (fresh verifier, round 5) ═══
 *
 * The first version matched SINGLE-QUOTED strings only. The verifier planted
 * administrative French in a double-quoted refusal and in a template literal:
 * extraction stayed at 35, the lint reported « 0 violations », and the gate
 * PASSED. The lint was never the problem — the EXTRACTOR was, and an extractor
 * that silently skips what it cannot parse is a vacuous gate wearing a green
 * tick. Two changes:
 *
 *   1. QUOTING-AGNOSTIC. Single quotes, double quotes and template literals are
 *      all read. A template literal carrying an INTERPOLATION is REFUSED
 *      OUTRIGHT rather than linted for its literal parts — that is the choice
 *      this gate makes, and the reason is that a money sentence assembled at
 *      runtime cannot be lint-checked as the buyer will read it. Where one is
 *      genuinely needed, the fixed part belongs in this table and the amount is
 *      appended by the caller (see `MESSAGES.prixRafraichiDifferent`).
 *      ANY value the extractor cannot read is a hard failure, never a skip.
 *
 *   2. THE FLOOR IS STRUCTURAL, not a hand-typed number. The old
 *      `MIN_ENTRIES = 20` against 35 real strings let fifteen vanish in silence.
 *      Now the gate parses the table's own shape: every refusal view must carry
 *      every one of its named fields. DELETING a string fails exactly as loudly
 *      as breaking one, and no constant needs maintaining.
 *
 * ═══ THE DEBT, NAMED ═══
 *
 * This makes the strings LINTED; it does not make them catalog entries with
 * `register` tags, which is what Ten Laws #6 ultimately asks for. Moving the
 * cliente module onto the i18n catalog is journal-worthy debt and its own slice.
 *
 * Usage: copy-lint-inline-refus.mjs [sourceFile]   (default: the real screens.ts)
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = process.argv[2] ?? join(root, 'apps/buyer-pwa/src/cliente/screens.ts');
const rel = SOURCE.replace(root + '/', '');

/** The copy fields of a refusal view → the screen class each one is. `action`
 *  is a code identifier, not copy, and is checked for presence only. */
const COPY_FIELDS = { overline: 'label', titre: 'status', phrase: 'status', libelle: 'label' };
const REQUIRED_FIELDS = [...Object.keys(COPY_FIELDS), 'action'];

const src = readFileSync(SOURCE, 'utf8');
const problems = [];

const unescapeJs = (s) =>
  s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');

/**
 * Read ONE value as the buyer would read it. Returns its text, or a reason the
 * gate must fail. It NEVER silently skips: a value this cannot read is a string
 * nobody is linting.
 */
function readValue(raw) {
  const t = raw.trim().replace(/,$/, '').trim();
  if (t === 'null') return { kind: 'null' };
  let m = /^'((?:[^'\\]|\\.)*)'$/.exec(t);
  if (m) return { kind: 'text', text: unescapeJs(m[1]) };
  m = /^"((?:[^"\\]|\\.)*)"$/.exec(t);
  if (m) return { kind: 'text', text: unescapeJs(m[1]) };
  m = /^`([\s\S]*)`$/.exec(t);
  if (m) {
    if (m[1].includes('${')) {
      return { kind: 'bad', why: 'a template literal with an interpolation cannot be linted as the buyer reads it' };
    }
    return { kind: 'text', text: m[1] };
  }
  return { kind: 'bad', why: `not a readable string literal: ${t.slice(0, 60)}` };
}

/**
 * Find the `}` matching the `{` that opened at `from`, SKIPPING OVER STRINGS.
 *
 * A plain `[^{}]*` regex cannot do this, and that is not a theoretical point:
 * the first version of this rewrite used one, and a `${…}` inside a template
 * literal made an entire refusal view invisible — the gate then reported one
 * view fewer and PASSED. Same species of silent skip as the bug being fixed.
 */
function matchBrace(s, from) {
  let depth = 1;
  let i = from;
  let quote = null;
  while (i < s.length) {
    const c = s[i];
    if (quote !== null) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
    } else if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** The body of the object literal that `decl` (a regex) introduces. */
function objectBody(text, decl) {
  const m = decl.exec(text);
  if (m === null) return null;
  const open = text.indexOf('{', m.index + m[0].length - 1);
  if (open < 0) return null;
  const close = matchBrace(text, open + 1);
  return close < 0 ? null : text.slice(open + 1, close);
}

/** Every `key: { …object… }` at the top level of `body`, string-aware. */
function splitViews(body) {
  const views = [];
  let i = 0;
  for (;;) {
    const m = /([A-Za-z_][\w]*)\s*:\s*\{/.exec(body.slice(i));
    if (m === null) return views;
    const open = i + m.index + m[0].length - 1;
    const close = matchBrace(body, open + 1);
    if (close < 0) {
      views.push({ name: m[1], body: null });
      return views;
    }
    views.push({ name: m[1], body: body.slice(open + 1, close) });
    i = close + 1;
  }
}

/** Every `key: { … }`, plus the top-level generic view. */
function collectViews(text) {
  const views = [];
  const generic = objectBody(text, /const\s+REFUS_GENERIQUE[^=]*=\s*\{/);
  if (generic !== null) views.push({ name: 'REFUS_GENERIQUE', body: generic });
  const table = objectBody(text, /const\s+REFUS\s*[:=][^={]*=?\s*\{/);
  if (table !== null) views.push(...splitViews(table));
  return views;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

/**
 * `field: value` pairs of one flat object body — and EVERY non-empty line must
 * be one. A line this cannot parse is copy nobody is linting, so it is reported
 * rather than dropped.
 */
function fieldsOf(body, where) {
  const out = {};
  const line = /^\s*([A-Za-z_][\w]*)\s*:\s*(.+?),?\s*$/;
  for (const raw of stripComments(body).split('\n')) {
    if (raw.trim() === '') continue;
    const m = line.exec(raw);
    if (m === null) {
      problems.push(`${where}: unparsable line, so its copy is unlinted → ${raw.trim().slice(0, 60)}`);
      continue;
    }
    out[m[1]] = m[2];
  }
  return out;
}

const entries = [];
let n = 0;

const views = collectViews(src);
if (views.length < 2) {
  problems.push(
    `found ${views.length} refusal view(s) — the table was renamed, moved or collapsed. ` +
      'This gate must be re-pointed, not deleted: linting nothing silently is how these strings shipped unlinted.',
  );
}

for (const view of views) {
  if (view.body === null) { problems.push(`${view.name}: unterminated object literal`); continue; }
  const fields = fieldsOf(view.body, view.name);
  // STRUCTURAL FLOOR: every view carries every named field. A DELETED string is
  // a missing field, and a missing field fails right here.
  for (const required of REQUIRED_FIELDS) {
    if (!(required in fields)) problems.push(`${view.name}: missing field « ${required} »`);
  }
  for (const [field, screenClass] of Object.entries(COPY_FIELDS)) {
    if (!(field in fields)) continue;
    const v = readValue(fields[field]);
    if (v.kind === 'bad') {
      problems.push(`${view.name}.${field}: ${v.why}`);
      continue;
    }
    if (v.kind === 'null') {
      problems.push(`${view.name}.${field}: null is not copy`);
      continue;
    }
    if (v.text === '') continue; // an intentionally empty label (a card with no primary action)
    entries.push({ key: `cliente.refus.${view.name}.${field}.${n++}`, fr: v.text, register: 'money', screenClass });
  }
}

/** The flow's spoken messages, beside the table so they are linted too. */
const msg = /export const MESSAGES\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
if (msg === null) {
  problems.push("the MESSAGES block is missing — the flow's spoken money sentences would ship unlinted");
} else {
  const fields = fieldsOf(msg[1], 'MESSAGES');
  const names = Object.keys(fields);
  if (names.length === 0) problems.push('the MESSAGES block is empty');
  for (const name of names) {
    const v = readValue(fields[name]);
    if (v.kind !== 'text') {
      problems.push(`MESSAGES.${name}: ${v.why ?? 'not copy'}`);
      continue;
    }
    if (v.text === '') continue;
    entries.push({ key: `cliente.message.${name}.${n++}`, fr: v.text, register: 'money', screenClass: 'status' });
  }
}

console.log(`  ${views.length} refusal view(s) · ${entries.length} user-facing strings extracted from ${rel}`);

if (problems.length > 0) {
  console.error('  ✘ the extractor could not account for every string:');
  for (const p of problems) console.error(`    · ${p}`);
  console.error('\ncopy-lint-inline-refus: FAILED');
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'refus-lint-'));
const catalog = join(dir, 'cliente-refus.catalog.json');
writeFileSync(catalog, JSON.stringify(entries, null, 1), 'utf8');
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
