#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
 * ═══ AND THE HOLE *SP3.3b1* CLOSES — THE §6.1 PAYMENT COPY ═══
 *
 * The two-option checkout screen is where the buyer reads « À payer maintenant »
 * and decides. Those sentences are Build-Spec §6.1's own, they live inline in
 * the same module, and until this version NO GATE READ THEM. The `PAIEMENT`
 * table is now extracted and linted exactly as the refusal table is — same
 * binary, same structural floor (every named field must be present, an unknown
 * field is a hard failure), same refusal to skip a value it cannot read.
 *
 * Two rules this table needs that the refusal table does not:
 *   · `\uXXXX` IS DECODED. §6.1's money lines carry the narrow no-break space
 *     before FCFA, and the buyer app forbids a raw U+202F byte in source (the
 *     source scan locks it), so the escape is the only way to write them. A
 *     gate that read « \u202fFCFA » literally would not be reading what the
 *     buyer reads.
 *   · `{X}` `{Y}` `{D}` ARE THE ONLY PLACEHOLDERS. They are §6.1's own notation
 *     and are filled with ONE server amount each. Any other `{…}` fails: a
 *     money sentence assembled at runtime out of unknown parts cannot be
 *     lint-checked as the buyer will read it, and that is the same law the
 *     interpolated-template-literal refusal enforces one level up.
 *
 * ═══ « séquestre » / « escrow » — §6.1's flat prohibition, scanned raw ═══
 *
 * The copy-lint catches both tokens inside strings it extracts. This gate ALSO
 * scans the source TEXT — comments, class names, data attributes, dead code —
 * because §6.1 says the words must not appear in customer copy and a class name
 * that ships in the DOM is not private. On a real run it scans every `.ts`
 * under the buyer app's `src/`, not just this one file. (The canon ledger record
 * `EscrowTxn` lives in `packages/commerce-core` — server-side, never a buyer
 * surface — and is deliberately outside this scan's reach.)
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
/** A fixture path was given ⇒ this is a NEGATIVE run over one planted file, and
 *  the repo-wide scans below stay off it. */
const FIXTURE = process.argv[2];
const SOURCE = FIXTURE ?? join(root, 'apps/buyer-pwa/src/cliente/screens.ts');
const rel = SOURCE.replace(root + '/', '');

/** The copy fields of a refusal view → the screen class each one is. `action`
 *  is a code identifier, not copy, and is checked for presence only. */
const COPY_FIELDS = { overline: 'label', titre: 'status', phrase: 'status', libelle: 'label' };
const REQUIRED_FIELDS = [...Object.keys(COPY_FIELDS), 'action'];

/**
 * The §6.1 two-option checkout copy → the screen class each string is.
 *
 * `checkout` is the reading budget the i18n data documents as « seeded to
 * accept the canonical Shop+ §6.1 checkout copy »; the two option LABELS and
 * the emphasised clause are `label` (exempt from the sentence budget, still
 * banned-token and register checked). Every one of these must be present: a
 * DELETED §6.1 sentence fails exactly as loudly as a violated one.
 */
const PAIEMENT_FIELDS = {
  ligneMaintenant: 'checkout',
  ligneLivraison: 'checkout',
  titreA: 'label',
  corpsA: 'checkout',
  titreB: 'label',
  corpsB: 'checkout',
  corpsBAccent: 'label',
  avertissementB: 'checkout',
  redite: 'checkout',
  rediteA: 'checkout',
};

/** §6.1's own notation, one server amount each. Nothing else may be assembled
 *  into a money sentence at runtime — see the header. */
const PLACEHOLDERS = new Set(['{X}', '{Y}', '{D}']);

/** §6.1: « séquestre »/"escrow" MUST NOT appear in customer copy. */
const BANNED_WORDS = /s[eé]questres?|escrows?/iu;

const src = readFileSync(SOURCE, 'utf8');
const problems = [];

/**
 * ONE PASS over the escapes, so `\uXXXX` decodes and `\\u202f` does not.
 * A chain of `.replace()`s cannot tell those apart; this can, because the
 * backslash that opens an escape is consumed with it.
 */
const unescapeJs = (s) =>
  s.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (_, esc) => {
    if (esc[0] === 'u') return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
    if (esc === 'n') return '\n';
    if (esc === 't') return '\t';
    return esc; // \' \" \\ — and anything else is the character itself
  });

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

/** Every `key: { …object… }` at the top level of `body`, string-aware.
 *
 *  THE KEY MAY BE QUOTED. `/([A-Za-z_][\w]*)\s*:\s*\{/` could not see
 *  `'paiement_bloque': {`, so that view AND EVERY STRING IN IT went unread while
 *  the gate printed the same counts and passed (verifier, round 6). Refusal
 *  names are snake_case and rarely need quotes — which is exactly what makes it
 *  a silent skip, and this file's header forbids skips in terms. */
function splitViews(body) {
  const views = [];
  let i = 0;
  for (;;) {
    const m = /(?:([A-Za-z_][\w]*)|'([^']*)'|"([^"]*)")\s*:\s*\{/.exec(body.slice(i));
    if (m === null) return views;
    const name = m[1] ?? m[2] ?? m[3];
    const open = i + m.index + m[0].length - 1;
    const close = matchBrace(body, open + 1);
    if (close < 0) {
      views.push({ name, body: null });
      return views;
    }
    views.push({ name, body: body.slice(open + 1, close) });
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
  // The field name may be quoted too, for the same reason view keys may be.
  const line = /^\s*(?:([A-Za-z_][\w]*)|'([^']*)'|"([^"]*)")\s*:\s*(.+?),?\s*$/;
  for (const raw of stripComments(body).split('\n')) {
    if (raw.trim() === '') continue;
    const m = line.exec(raw);
    if (m === null) {
      problems.push(`${where}: unparsable line, so its copy is unlinted → ${raw.trim().slice(0, 60)}`);
      continue;
    }
    out[m[1] ?? m[2] ?? m[3]] = m[4];
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
  // …AND NOTHING ELSE. `COPY_FIELDS` is an allowlist, and the lint loop below
  // iterates only it, so an UNRECOGNISED field used to be dropped without a
  // word: the verifier added `soustitre: 'Veuillez patienter, nonobstant ce qui
  // precede.'` to a refusal view and this gate printed the same counts, « 0
  // violations », and PASSED (round 6). Adding a subtitle or a detail line to a
  // refusal is an ordinary next edit, and the gate would have gone on claiming
  // that « every refusal string a buyer reads passed the French Voice lint »
  // while that sentence shipped unlinted — this gate's own failure mode, one
  // level up. An unknown field is now as hard a failure as an unreadable value:
  // either teach `COPY_FIELDS` its screen class, or it does not ship.
  for (const present of Object.keys(fields)) {
    if (present === 'action' || present in COPY_FIELDS) continue;
    problems.push(
      `${view.name}: unknown field « ${present} » — if it is copy, add it to COPY_FIELDS with its ` +
        'screen class so it gets linted; nothing here may go unread',
    );
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

/* ═════════ SP3.3b1 — the §6.1 two-option checkout copy, linted too ════════ */

let paiementCount = 0;
const pay = /export const PAIEMENT\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
if (pay === null) {
  problems.push(
    'the PAIEMENT block is missing — the §6.1 two-option checkout copy is what a buyer reads at the ' +
      'moment she commits her money, and it would ship unlinted. Re-point this gate, never delete it.',
  );
} else {
  const fields = fieldsOf(pay[1], 'PAIEMENT');
  // STRUCTURAL FLOOR — every §6.1 string, present. A deleted sentence fails here.
  for (const required of Object.keys(PAIEMENT_FIELDS)) {
    if (!(required in fields)) problems.push(`PAIEMENT: missing field « ${required} » (§6.1 copy)`);
  }
  // …AND NOTHING ELSE unread: an unrecognised field is a string with no lint.
  for (const present of Object.keys(fields)) {
    if (present in PAIEMENT_FIELDS) continue;
    problems.push(
      `PAIEMENT: unknown field « ${present} » — add it to PAIEMENT_FIELDS with its screen class ` +
        'so it gets linted; nothing here may go unread',
    );
  }
  for (const [field, screenClass] of Object.entries(PAIEMENT_FIELDS)) {
    if (!(field in fields)) continue;
    const v = readValue(fields[field]);
    if (v.kind !== 'text') {
      problems.push(`PAIEMENT.${field}: ${v.why ?? 'null is not copy'}`);
      continue;
    }
    if (v.text === '') {
      problems.push(`PAIEMENT.${field}: empty — §6.1 has no empty string`);
      continue;
    }
    // ONLY §6.1'S OWN AMOUNT PLACEHOLDERS. Anything else means part of the
    // sentence is assembled at runtime out of something this gate never read.
    for (const brace of v.text.match(/\{[^}]*\}/gu) ?? []) {
      if (PLACEHOLDERS.has(brace)) continue;
      problems.push(
        `PAIEMENT.${field}: « ${brace} » is not a §6.1 amount placeholder (${[...PLACEHOLDERS].join(' ')}) — ` +
          'a money sentence assembled from unknown parts cannot be linted as the buyer reads it',
      );
    }
    entries.push({ key: `cliente.paiement.${field}.${n++}`, fr: v.text, register: 'money', screenClass });
    paiementCount += 1;
  }
}

/* ══ §6.1: « séquestre »/« escrow » appear NOWHERE a buyer can read them ═══ */

/**
 * EVERY TEXT FILE A BUYER CAN RECEIVE — not every `.ts` under `src/`.
 *
 * THE HOLE THIS CLOSES (fresh verifier, round 2): the scan walked
 * `apps/buyer-pwa/src/**\/*.ts` and nothing else, so the forbidden word planted
 * in `index.html` shipped while this gate printed « appear nowhere in the buyer
 * source ». The buyer receives the entry HTML, the offline shell in `public/`,
 * the web manifest and the i18n catalog exactly as she receives the bundle.
 *
 * Binary assets (fonts) are skipped by extension, not by guesswork.
 */
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.css', '.json', '.webmanifest', '.txt'];
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.') ? [] : walk(full);
    return SCAN_EXTENSIONS.some((ext) => e.name.endsWith(ext)) ? [full] : [];
  });

/** `--scan-root DIR` points the raw scan at a fixture tree, so a plant OUTSIDE
 *  `src/` — an `index.html`, a manifest — can be proven to fail the gate. */
const scanRootFlag = process.argv.indexOf('--scan-root');
const SCAN_ROOT = scanRootFlag > 0 ? process.argv[scanRootFlag + 1] : undefined;

/** What the raw scan covered, in the words the success line will use. */
let scanDescription;
let scanned;
if (SCAN_ROOT !== undefined) {
  scanned = [...new Set([SOURCE, ...walk(SCAN_ROOT)])];
  scanDescription = SCAN_ROOT.replace(root + '/', '');
} else if (FIXTURE !== undefined) {
  scanned = [SOURCE];
  scanDescription = rel;
} else {
  const app = join(root, 'apps/buyer-pwa');
  scanned = [
    join(app, 'index.html'),
    ...walk(join(app, 'src')),
    ...walk(join(app, 'public')),
    ...walk(join(app, 'i18n')),
  ];
  scanDescription = 'apps/buyer-pwa — index.html, src/, public/, i18n/ (' + SCAN_EXTENSIONS.join(' ') + ')';
}
/**
 * KEPT APART FROM `problems` ON PURPOSE. An extractor problem means « a string
 * is going unread » and stops the lint from being meaningful, so it exits
 * early. A banned word is a finding IN ITS OWN RIGHT and must not suppress the
 * lint report beneath it — otherwise one forbidden word in a comment would hide
 * every French Voice violation in the same file, and a negative fixture would
 * stop proving what it says it proves.
 */
const scanHits = [];
for (const file of scanned) {
  const text = file === SOURCE ? src : readFileSync(file, 'utf8');
  for (const [i, line] of text.split('\n').entries()) {
    const hit = BANNED_WORDS.exec(line);
    if (hit === null) continue;
    scanHits.push(
      `${file.replace(root + '/', '')}:${i + 1}: « ${hit[0]} » — §6.1 forbids it in customer copy, and this ` +
        'gate reads comments, class names and data attributes too',
    );
  }
}

console.log(
  `  ${views.length} refusal view(s) · ${paiementCount} §6.1 payment string(s) · ` +
    `${entries.length} user-facing strings extracted from ${rel} · ${scanned.length} file(s) scanned`,
);

const reportScan = () => {
  if (scanHits.length === 0) return;
  console.error('  ✘ §6.1: the custody-of-funds words must not appear where a buyer can read them:');
  for (const h of scanHits) console.error(`    · ${h}`);
};

if (problems.length > 0) {
  console.error('  ✘ the extractor could not account for every string:');
  for (const p of problems) console.error(`    · ${p}`);
  reportScan();
  console.error('\ncopy-lint-inline-refus: FAILED');
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'refus-lint-'));
const catalog = join(dir, 'cliente-refus.catalog.json');
writeFileSync(catalog, JSON.stringify(entries, null, 1), 'utf8');
let lintFailed = false;
try {
  const out = execFileSync('pnpm', ['exec', 'copy-lint', catalog], { cwd: root, encoding: 'utf8' });
  console.log('  ' + out.trim());
} catch (err) {
  console.error(err.stdout ?? '');
  console.error(err.stderr ?? '');
  lintFailed = true;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
reportScan();
if (lintFailed || scanHits.length > 0) {
  console.error('\ncopy-lint-inline-refus: FAILED');
  process.exit(1);
}
/**
 * SAY EXACTLY WHAT WAS COVERED, AND EXACTLY WHAT WAS NOT.
 *
 * THE CLAIM THIS REPLACES (fresh verifier, round 2): « every refusal string AND
 * every §6.1 payment string a buyer reads passed the French Voice lint » read as
 * « the payment screen is linted ». It is not. This gate extracts THREE TABLES;
 * every other inline string in `screens.ts` — the bill row labels, the C5 quote
 * line, the operator screens, C6–C9 — is unread, and the verifier proved it by
 * adding administrative French to C5 and watching this gate exit 0.
 *
 * Widening the extractor to all inline copy is a different slice (the real cure
 * is moving the cliente module onto the i18n catalog). What must not happen in
 * the meantime is a green tick that overstates its own reach: an unlinted string
 * is a known gap, an unlinted string under a claim of full coverage is a lie.
 */
console.log('\ncopy-lint-inline-refus: OK');
console.log(
  `  LINTED (French Voice): the REFUS table (${views.length} views), MESSAGES, and the §6.1 PAIEMENT ` +
    `table (${paiementCount} strings) — ${entries.length} strings from ${rel}.`,
);
console.log(
  '  NOT LINTED, and named so the gap is visible: every OTHER inline string in that module — the bill ' +
    'labels, the C5 quote line, the operator screens, C6–C9. This gate reads three tables, not the file. ' +
    'The cure is the i18n catalog migration, which is its own slice.',
);
console.log(`  SCANNED for the two words §6.1 forbids: ${scanned.length} file(s) — ${scanDescription}.`);
