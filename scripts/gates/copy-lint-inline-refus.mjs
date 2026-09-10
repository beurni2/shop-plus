#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// VOIX-INLINE-1 (AUDIT-SHOP-2 F-59) — the lint's OWN token matcher and its
// maintained banned-register list, so the raw scan below and the catalog lint
// can never disagree about what a banned word is.
import { findToken } from '@platform/i18n';
import { loadLintData } from '@platform/i18n/data-loader';

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
 * ═══ VOIX-INLINE-1 (AUDIT-SHOP-2 F-59) — TWO MORE TABLES, AND THE WHOLE REGISTER ═══
 *
 * The audit named the two tables this gate still did not read: the C10 gift
 * message a buyer sends to a friend from her own WhatsApp (MERCI — a SELLING
 * moment, linted as `selling`, its three flow-filled placeholders allowlisted
 * per field) and the §6.2 inspection matrix she reads at her door (INSPECTION
 * + INSPECTION_PRUDENTE — money register; two label lists and one status
 * sentence per row, no placeholder anywhere, every §6.2 row required, and
 * every byte of a row and of the matrix's top level accounted for — a list
 * read from a const, a `.concat(…)` tail, a spread row, a computed key are
 * each a hard failure). Both are extracted on the same terms as the seven
 * tables above.
 *
 * ONE RULE THE WIDER SCAN FORCED ON THE FIXTURES: a negative that plants a
 * banned-register WORD now fails through the scan whatever the extractor
 * does, so it can no longer go green when its extractor door regresses. Every
 * extractor-door negative therefore plants what the scan cannot see — marketing
 * urgency in a money sentence, or a blown reading budget — and only the
 * scan-door negatives carry a banned word.
 *
 * And the raw scan grew from §6.1's two words to the lint's WHOLE
 * banned-register list, read from the same data file and matched with the
 * same matcher the catalog lint uses. The inline strings this gate still does
 * not extract (the bill labels, the C5 quote line, the operator screens) can
 * no longer carry « veuillez » or « nonobstant » past a green tick; what they
 * still can carry unread is a blown reading budget or a register clash, and
 * the success lines say so. Every negative fixture is now ONE clean base plus
 * ONE plant, with the base captured as the positive control.
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
  ligneMaintenant: { screenClass: 'checkout', fills: ['{X}'] },
  ligneLivraison: { screenClass: 'checkout', fills: ['{Y}'] },
  titreA: { screenClass: 'label', fills: [] },
  corpsA: { screenClass: 'checkout', fills: [] },
  titreB: { screenClass: 'label', fills: [] },
  titreBFin: { screenClass: 'label', fills: [] },
  corpsB: { screenClass: 'checkout', fills: ['{D}'] },
  corpsBAccent: { screenClass: 'label', fills: [] },
  avertissementB: { screenClass: 'checkout', fills: [] },
  redite: { screenClass: 'checkout', fills: ['{X}', '{Y}'] },
  rediteA: { screenClass: 'checkout', fills: ['{X}', '{Y}'] },
  rediteFin: { screenClass: 'label', fills: [] },
  /** « Écouter la note de la vendeuse » — the founder's 2026-07-30 reversal put
   *  a new user-facing control on the money screen, so its label is linted with
   *  the rest of §6.1's copy and its DELETION fails the structural floor above,
   *  exactly like a deleted §6.1 sentence. */
  ecouterNote: { screenClass: 'label', fills: [] },
};

/**
 * ═══ SP3.3c — C6'S POST-PAYMENT COPY ═══
 *
 * The sentences a buyer reads AFTER she has tapped Payer, while the order sits
 * on the service and the operator has not answered — and the sentence she reads
 * when the payment did not go through. Both states were built by SP3.3c to
 * replace a `setTimeout` that announced a confirmation nobody had given, so
 * they are the newest money copy in the app and the least protected by habit.
 *
 * NO FIELD HERE TAKES A PLACEHOLDER, and that is a rule rather than an
 * accident: there is no payment in either state, so there is no amount to name.
 * A `{X}` appearing in any of these is a figure being introduced into a
 * sentence about money that did not move — the gate refuses it by giving every
 * field an EMPTY `fills`.
 */
/**
 * ═══ C3's VOICE CONTROL — ITS OWN NAME, READ AT LAST ═══
 *
 * The labels on the control that plays back her recorded repère. They shipped
 * as inline `aria-label` attributes: a screen reader speaks them, so they are
 * user-facing, and NOTHING read them — not `copy-lint` (which walks the i18n
 * catalogs) and not this gate (whose tables did not know they existed).
 *
 * Neither takes a placeholder, and that is a rule rather than an accident: the
 * name of a button does not vary with an amount. An empty `fills` refuses one.
 */
const VOIX_FIELDS = {
  ecouter: { screenClass: 'label', fills: [] },
  pause: { screenClass: 'label', fills: [] },
  /** NOTE-VOCALE (founder, 2026-08-14) — the C1 card title and its play
   *  control's at-rest announcement. They replaced « La voix d’{prénom} »,
   *  whose hardcoded elision broke on consonant-initial names. Names never
   *  vary these labels now, so neither takes a placeholder. */
  titre: { screenClass: 'label', fills: [] },
  ecouterProduit: { screenClass: 'label', fills: [] },
};

const CONFIRMATION_FIELDS = {
  attenteTitre: { screenClass: 'label', fills: [] },
  attenteCorps: { screenClass: 'checkout', fills: [] },
  attenteChip: { screenClass: 'label', fills: [] },
  attenteAction: { screenClass: 'label', fills: [] },
  /** « Nous n'arrivons pas à joindre le service » — added in round 2 after a
   *  verifier proved the manual check was a silent no-op on a dead link.
   *  A sentence about the NETWORK on the payment screen: it gets the same
   *  budget and the same banned-register check as the rest. */
  attenteHorsPortee: { screenClass: 'checkout', fills: [] },
  echecTitre: { screenClass: 'label', fills: [] },
  echecCorps: { screenClass: 'checkout', fills: [] },
  echecAction: { screenClass: 'label', fills: [] },
  /** SANDBOX-PAY-1 — « Numéro de commande », the label alone: the id itself is
   *  a server byte the renderer appends, exactly as PORTE.resteAPayer's figure
   *  is, so the field carries no placeholder and no fills. */
  reference: { screenClass: 'label', fills: [] },
  /** VRAI-SUIVI — the honest third « what happens next » row: the push it used
   *  to promise does not exist, and the replacement sentence is linted here. */
  etapeSuivre: { screenClass: 'checkout', fills: [] },
};

/**
 * ═══ VRAI-SUIVI — THE TRACKING'S COPY (C7 + the real C9 + the re-entry) ═══
 *
 * The buyer's tracking became real (founder, 2026-08-10): six fact-derived
 * steps, an honest intro that promises no push, the arrival-gated code
 * captions, and the shell's « Ma commande » way back. Every sentence a buyer
 * reads on that road lives in the SUIVI table and is linted here on the same
 * terms as the rest: structural floor (a deleted step fails as loudly as a
 * violated one), unknown-field hard failure, and NO placeholders anywhere —
 * a tracking sentence carries no amount, and the order id beside the title is
 * a server byte the renderer appends, never interpolated.
 */
const SUIVI_FIELDS = {
  etape1Titre: { screenClass: 'label', fills: [] },
  etape1Corps: { screenClass: 'status', fills: [] },
  etape2Titre: { screenClass: 'label', fills: [] },
  etape2Corps: { screenClass: 'status', fills: [] },
  etape3Titre: { screenClass: 'label', fills: [] },
  etape3Corps: { screenClass: 'status', fills: [] },
  etape4Titre: { screenClass: 'label', fills: [] },
  etape4Corps: { screenClass: 'status', fills: [] },
  etape5Titre: { screenClass: 'label', fills: [] },
  etape5Corps: { screenClass: 'status', fills: [] },
  etape6Titre: { screenClass: 'label', fills: [] },
  etape6Corps: { screenClass: 'status', fills: [] },
  intro: { screenClass: 'status', fills: [] },
  gps: { screenClass: 'status', fills: [] },
  verifier: { screenClass: 'label', fills: [] },
  horsPortee: { screenClass: 'checkout', fills: [] },
  voirCode: { screenClass: 'label', fills: [] },
  terminee: { screenClass: 'label', fills: [] },
  reentree: { screenClass: 'label', fills: [] },
  c9Attente: { screenClass: 'checkout', fills: [] },
  c9Arrivee: { screenClass: 'status', fills: [] },
  codeDemo: { screenClass: 'label', fills: [] },
  // C10 « merci » — the end of a delivery (founder 2026-08-12). The body and
  // the proof line are `status`: they state what happened. Title and CTA are
  // labels. Nothing here carries an amount, so no fills.
  merciTitre: { screenClass: 'label', fills: [] },
  merciCorps: { screenClass: 'status', fills: [] },
  merciPreuve: { screenClass: 'status', fills: [] },
  merciFermer: { screenClass: 'label', fills: [] },
};

/**
 * §6.1's own notation, one server amount each — and the allowlist is PER FIELD,
 * not per table.
 *
 * THE HOLE THIS CLOSES (fresh verifier, round 3): the check asked « is this one
 * of the three placeholders? » when the question that matters is « can THIS
 * FIELD fill it? ». The renderer fills the replay with {X, Y} and nothing else,
 * so `{D}` planted into `redite` passed the gate and the buyer would have read
 * « … à la livraison (frais {D}) — d'accord ? » with the token still in it. A
 * placeholder the renderer never substitutes is not a placeholder; it is a
 * literal brace in a money sentence.
 */

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
function splitViews(body, gaps) {
  const views = [];
  let i = 0;
  for (;;) {
    const m = /(?:([A-Za-z_][\w]*)|'([^']*)'|"([^"]*)")\s*:\s*\{/.exec(body.slice(i));
    if (m === null) {
      if (gaps) gaps.push(body.slice(i));
      return views;
    }
    // What lies BETWEEN two views — a caller that hands `gaps` in gets every
    // byte no view accounted for (a spread, a computed key), so it can refuse
    // it instead of letting whole rows ride past unread (verifier, F-59).
    if (gaps) gaps.push(body.slice(i, i + m.index));
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
  for (const [field, { screenClass, fills }] of Object.entries(PAIEMENT_FIELDS)) {
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
    // ONLY THE PLACEHOLDERS **THIS FIELD** IS FILLED WITH. A token the renderer
    // never substitutes here reaches the buyer as a literal brace in a money
    // sentence, and a table-wide allowlist could not see the difference.
    for (const brace of v.text.match(/\{[^}]*\}/gu) ?? []) {
      if (fills.includes(brace)) continue;
      problems.push(
        `PAIEMENT.${field}: « ${brace} » is not filled in this field — it takes ` +
          `${fills.length === 0 ? 'no placeholder at all' : fills.join(' ')}, so the buyer would read the ` +
          'token itself. A money sentence assembled from parts nothing fills cannot be linted as she reads it',
      );
    }
    entries.push({ key: `cliente.paiement.${field}.${n++}`, fr: v.text, register: 'money', screenClass });
    paiementCount += 1;
  }
}

/* ═══════ SP4.2b — the DOOR's copy, on the same terms ═════════════════════ */

const PORTE_FIELDS = {
  resteAPayer: { screenClass: 'label', fills: [] },
  echecTitre: { screenClass: 'label', fills: [] },
  echecCorps: { screenClass: 'checkout', fills: [] },
  echecAction: { screenClass: 'label', fills: [] },
};

let porteCount = 0;
const porte = /export const PORTE\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
if (porte === null) {
  problems.push(
    'the PORTE block is missing — it is what a buyer reads while paying for her product at ' +
      'her own door, and it would ship unlinted. Re-point this gate, never delete it.',
  );
} else {
  const fields = fieldsOf(porte[1], 'PORTE');
  for (const required of Object.keys(PORTE_FIELDS)) {
    if (!(required in fields)) problems.push(`PORTE: missing field « ${required} » (door copy)`);
  }
  for (const present of Object.keys(fields)) {
    if (present in PORTE_FIELDS) continue;
    problems.push(
      `PORTE: unknown field « ${present} » — add it to PORTE_FIELDS with its screen class ` +
        'so it gets linted; nothing here may go unread',
    );
  }
  for (const [field, { screenClass, fills }] of Object.entries(PORTE_FIELDS)) {
    if (!(field in fields)) continue;
    const v = readValue(fields[field]);
    if (v.kind !== 'text') {
      problems.push(`PORTE.${field}: ${v.why ?? 'null is not copy'}`);
      continue;
    }
    if (v.text === '') {
      problems.push(`PORTE.${field}: empty — a door screen with no sentence is a door with no honesty`);
      continue;
    }
    for (const brace of v.text.match(/\{[^}]*\}/gu) ?? []) {
      if (fills.includes(brace)) continue;
      problems.push(
        `PORTE.${field}: « ${brace} » is filled by nothing — the one amount on this screen is ` +
          'rendered by the caller from a server byte, never interpolated into a sentence',
      );
    }
    entries.push({ key: `cliente.porte.${field}.${n++}`, fr: v.text, register: 'money', screenClass });
    porteCount += 1;
  }
}

/* ════════ SP3.3c — C6's post-payment copy, on the same terms ═════════════ */

let confirmationCount = 0;
const conf = /export const CONFIRMATION\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
if (conf === null) {
  problems.push(
    'the CONFIRMATION block is missing — C6 tells a buyer whether her payment went through, and those ' +
      'sentences would ship unlinted. Re-point this gate, never delete it.',
  );
} else {
  const fields = fieldsOf(conf[1], 'CONFIRMATION');
  for (const required of Object.keys(CONFIRMATION_FIELDS)) {
    if (!(required in fields)) problems.push(`CONFIRMATION: missing field « ${required} » (C6 post-payment copy)`);
  }
  for (const present of Object.keys(fields)) {
    if (present in CONFIRMATION_FIELDS) continue;
    problems.push(
      `CONFIRMATION: unknown field « ${present} » — add it to CONFIRMATION_FIELDS with its screen ` +
        'class so it gets linted; nothing here may go unread',
    );
  }
  for (const [field, { screenClass, fills }] of Object.entries(CONFIRMATION_FIELDS)) {
    if (!(field in fields)) continue;
    const v = readValue(fields[field]);
    if (v.kind !== 'text') {
      problems.push(`CONFIRMATION.${field}: ${v.why ?? 'null is not copy'}`);
      continue;
    }
    if (v.text === '') {
      problems.push(`CONFIRMATION.${field}: empty — a state with no sentence is a state with no honesty`);
      continue;
    }
    for (const brace of v.text.match(/\{[^}]*\}/gu) ?? []) {
      if (fills.includes(brace)) continue;
      problems.push(
        `CONFIRMATION.${field}: « ${brace} » is filled by nothing — no field here takes a placeholder, ` +
          'because neither state has a payment and therefore has no amount to name',
      );
    }
    entries.push({ key: `cliente.confirmation.${field}.${n++}`, fr: v.text, register: 'money', screenClass });
    confirmationCount += 1;
  }
}

/* ════════ C3's voice control — its labels, on the same terms ═════════════ */

let voixCount = 0;
const voix = /export const VOIX\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
if (voix === null) {
  problems.push(
    'the VOIX block is missing — those two words are the NAME a screen reader gives the control that ' +
      'plays her own voice back, and they would ship unread. Re-point this gate, never delete it.',
  );
} else {
  const fields = fieldsOf(voix[1], 'VOIX');
  for (const required of Object.keys(VOIX_FIELDS)) {
    if (!(required in fields)) problems.push(`VOIX: missing field « ${required} » (C3 voice control label)`);
  }
  for (const present of Object.keys(fields)) {
    if (present in VOIX_FIELDS) continue;
    problems.push(
      `VOIX: unknown field « ${present} » — add it to VOIX_FIELDS with its screen class so it gets ` +
        'linted; nothing here may go unread',
    );
  }
  for (const [field, { screenClass, fills }] of Object.entries(VOIX_FIELDS)) {
    if (!(field in fields)) continue;
    const v = readValue(fields[field]);
    if (v.kind !== 'text') {
      problems.push(`VOIX.${field}: ${v.why ?? 'null is not copy'}`);
      continue;
    }
    if (v.text === '') {
      problems.push(`VOIX.${field}: empty — a control with no name is a control nobody can hear`);
      continue;
    }
    for (const brace of v.text.match(/\{[^}]*\}/gu) ?? []) {
      if (fills.includes(brace)) continue;
      problems.push(`VOIX.${field}: « ${brace} » is filled by nothing — a button's name takes no amount`);
    }
    entries.push({ key: `cliente.voix.${field}.${n++}`, fr: v.text, register: 'neutral', screenClass });
    voixCount += 1;
  }
}

/* ═══════ VRAI-SUIVI — the tracking's copy, on the same terms ═════════════ */

let suiviCount = 0;
const suivi = /export const SUIVI\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
if (suivi === null) {
  problems.push(
    'the SUIVI block is missing — the tracking steps, the code captions and the re-entry label are what ' +
      'a buyer reads while her parcel is on the road, and they would ship unlinted. Re-point this gate, ' +
      'never delete it.',
  );
} else {
  const fields = fieldsOf(suivi[1], 'SUIVI');
  for (const required of Object.keys(SUIVI_FIELDS)) {
    if (!(required in fields)) problems.push(`SUIVI: missing field « ${required} » (tracking copy)`);
  }
  for (const present of Object.keys(fields)) {
    if (present in SUIVI_FIELDS) continue;
    problems.push(
      `SUIVI: unknown field « ${present} » — add it to SUIVI_FIELDS with its screen class ` +
        'so it gets linted; nothing here may go unread',
    );
  }
  for (const [field, { screenClass, fills }] of Object.entries(SUIVI_FIELDS)) {
    if (!(field in fields)) continue;
    const v = readValue(fields[field]);
    if (v.kind !== 'text') {
      problems.push(`SUIVI.${field}: ${v.why ?? 'null is not copy'}`);
      continue;
    }
    if (v.text === '') {
      problems.push(`SUIVI.${field}: empty — a tracking step with no sentence is a step with no honesty`);
      continue;
    }
    for (const brace of v.text.match(/\{[^}]*\}/gu) ?? []) {
      if (fills.includes(brace)) continue;
      problems.push(
        `SUIVI.${field}: « ${brace} » is filled by nothing — a tracking sentence carries no amount, and ` +
          'the order id beside the title is a server byte the renderer appends, never interpolated',
      );
    }
    entries.push({ key: `cliente.suivi.${field}.${n++}`, fr: v.text, register: 'money', screenClass });
    suiviCount += 1;
  }
}

/* ═══ VOIX-INLINE-1 (F-59) — C10's WhatsApp gift message, on the same terms ═══ */

/**
 * The words a buyer reads when she has just paid for a friend's wish and is
 * about to tell her — and the MESSAGE she sends from her own WhatsApp. That
 * message was the audit's named gap: it carries three placeholders the flow
 * fills (`{prenom}`, `{article}`, `{lien}` — flow.ts, one `.replace` each) and
 * nothing else, so the allowlist is exactly those three. This is a SELLING
 * moment (Contract §10.5: sharing, community — warm), so the register is
 * `selling`: the lint refuses finance jargon here as it refuses marketing
 * urgency on the money screens.
 */
const MERCI_FIELDS = {
  titreAvant: { screenClass: 'label', fills: [] },
  corps: { screenClass: 'general', fills: [] },
  prenomLabel: { screenClass: 'label', fills: [] },
  prenomManque: { screenClass: 'status', fills: [] },
  action: { screenClass: 'label', fills: [] },
  message: { screenClass: 'general', fills: ['{prenom}', '{article}', '{lien}'] },
};

let merciCount = 0;
const merci = /export const MERCI\s*=\s*\{([\s\S]*?)\n\}/.exec(src);
if (merci === null) {
  problems.push(
    'the MERCI block is missing — the sentence a buyer sends to a friend from her own WhatsApp would ' +
      'ship unlinted. Re-point this gate, never delete it.',
  );
} else {
  const fields = fieldsOf(merci[1], 'MERCI');
  for (const required of Object.keys(MERCI_FIELDS)) {
    if (!(required in fields)) problems.push(`MERCI: missing field « ${required} » (C10 gift copy)`);
  }
  for (const present of Object.keys(fields)) {
    if (present in MERCI_FIELDS) continue;
    problems.push(
      `MERCI: unknown field « ${present} » — add it to MERCI_FIELDS with its screen class so it gets ` +
        'linted; nothing here may go unread',
    );
  }
  for (const [field, { screenClass, fills }] of Object.entries(MERCI_FIELDS)) {
    if (!(field in fields)) continue;
    const v = readValue(fields[field]);
    if (v.kind !== 'text') {
      problems.push(`MERCI.${field}: ${v.why ?? 'null is not copy'}`);
      continue;
    }
    if (v.text === '') {
      problems.push(`MERCI.${field}: empty — a gift with no words is a gift nobody hears about`);
      continue;
    }
    for (const brace of v.text.match(/\{[^}]*\}/gu) ?? []) {
      if (fills.includes(brace)) continue;
      problems.push(
        `MERCI.${field}: « ${brace} » is filled by nothing — the flow fills ` +
          `${fills.length === 0 ? 'no placeholder in this field' : fills.join(' ')} and the friend would read the token itself`,
      );
    }
    entries.push({ key: `cliente.merci.${field}.${n++}`, fr: v.text, register: 'selling', screenClass });
    merciCount += 1;
  }
}

/* ═══ VOIX-INLINE-1 (F-59) — the §6.2 inspection matrix, on the same terms ═══ */

/**
 * The checklist she reads AT THE DOOR before she decides — what she may check,
 * what a refusal will be honoured for, and what stays at her own risk. Three
 * §6.2 rows plus the conservative row for a category the spec does not cover.
 * Every row carries EXACTLY these three fields; the two lists are labels (short
 * lines, exempt from the sentence budget, still banned-token and register
 * checked) and `risque` is a money-register status sentence — the one that
 * protects her, and the hardest to keep plain. Nothing here takes a
 * placeholder: a door rule does not vary with an amount. A DELETED row or item
 * fails as loudly as a violated one (the structural floor), and an item that is
 * not a readable string literal is copy nobody is linting.
 */
const INSPECTION_ROWS = ['fashion_bags_fabrics', 'shoes', 'sealed_beauty_cosmetics'];
const INSPECTION_LISTS = { verifier: 'label', motifs: 'label' };
const INSPECTION_TEXT = { risque: 'status' };

/** Every string literal of a `[ … ]` list, and a problem for anything else in it. */
function readList(raw, where) {
  const items = [];
  const literal = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`]*)`/g;
  // One text for both passes, comments gone: a literal quoted in a comment is
  // not a checklist line, and must neither be linted nor hide behind `rest`.
  const clean = stripComments(raw);
  for (const m of clean.matchAll(literal)) {
    if (m[3] !== undefined && m[3].includes('${')) {
      problems.push(`${where}: a template literal with an interpolation cannot be linted as the buyer reads it`);
      continue;
    }
    items.push(unescapeJs(m[1] ?? m[2] ?? m[3]));
  }
  const rest = clean.replace(literal, '').replace(/[\s,]/g, '');
  if (rest !== '') problems.push(`${where}: not only string literals in the list — « ${rest.slice(0, 40)} » is copy nobody is linting`);
  return items;
}

function lintInspectionRow(name, rawBody) {
  // Comments go first, as `fieldsOf` does: a commented-out old `risque` must
  // not be the line the lint reads while the live one beneath it ships unread
  // (verifier, F-59 — it was, and the marketing line under it passed).
  const body = stripComments(rawBody);
  const seen = new Set();
  for (const m of body.matchAll(/^\s*([A-Za-z_][\w]*)\s*:/gmu)) seen.add(m[1]);
  for (const required of [...Object.keys(INSPECTION_LISTS), ...Object.keys(INSPECTION_TEXT)]) {
    if (!seen.has(required)) problems.push(`INSPECTION.${name}: missing field « ${required} » (§6.2 door copy)`);
  }
  // EVERY BYTE OF THE ROW is either a recognised field's span, an unknown
  // field (reported above), or a problem — the same « every line accounted
  // for » rule `fieldsOf` keeps for the flat tables. A `.concat(…)` after a
  // list, a spread after `risque`, a value read from a const: none may ride.
  let residue = body;
  for (const present of seen) {
    if (present in INSPECTION_LISTS || present in INSPECTION_TEXT) continue;
    problems.push(`INSPECTION.${name}: unknown field « ${present} » — if it is copy, teach this gate its screen class; nothing here may go unread`);
    residue = residue.replace(new RegExp(`^\\s*${present}\\s*:.*$`, 'mu'), '');
  }
  for (const [field, screenClass] of Object.entries(INSPECTION_LISTS)) {
    if (!seen.has(field)) continue;
    const m = new RegExp(`^\\s*${field}\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'mu').exec(body);
    if (m === null) {
      // The key is there, the list is not: a checklist read from a const is copy nobody is linting (verifier BLOCKER, F-59).
      problems.push(`INSPECTION.${name}.${field}: not a [ … ] list literal — a checklist read from elsewhere is copy nobody is linting`);
      residue = residue.replace(new RegExp(`^\\s*${field}\\s*:.*$`, 'mu'), ''); // reported once, above
      continue;
    }
    residue = residue.replace(m[0], '');
    const items = readList(m[1], `INSPECTION.${name}.${field}`);
    if (items.length === 0) problems.push(`INSPECTION.${name}.${field}: empty — a checklist with no line is no checklist`);
    for (const [i, text] of items.entries()) {
      if (text === '') { problems.push(`INSPECTION.${name}.${field}[${i}]: empty`); continue; }
      if (/\{[^}]*\}/u.test(text)) problems.push(`INSPECTION.${name}.${field}[${i}]: a placeholder in a door rule — nothing fills it`);
      entries.push({ key: `cliente.inspection.${name}.${field}.${i}.${n++}`, fr: text, register: 'money', screenClass });
      inspectionCount += 1;
    }
  }
  for (const [field, screenClass] of Object.entries(INSPECTION_TEXT)) {
    if (!seen.has(field)) continue;
    const m = new RegExp(`^\\s*${field}\\s*:\\s*(.+?),?\\s*$`, 'mu').exec(body);
    if (m === null) {
      problems.push(`INSPECTION.${name}.${field}: no readable value after the key — copy nobody is linting`);
      residue = residue.replace(new RegExp(`^\\s*${field}\\s*:.*$`, 'mu'), ''); // reported once, above
      continue;
    }
    residue = residue.replace(m[0], '');
    const v = readValue(m[1]);
    if (v.kind !== 'text') { problems.push(`INSPECTION.${name}.${field}: ${v.why ?? 'null is not copy'}`); continue; }
    if (v.text === '') { problems.push(`INSPECTION.${name}.${field}: empty — the risk line is the one that protects her`); continue; }
    if (/\{[^}]*\}/u.test(v.text)) problems.push(`INSPECTION.${name}.${field}: a placeholder in a door rule — nothing fills it`);
    entries.push({ key: `cliente.inspection.${name}.${field}.${n++}`, fr: v.text, register: 'money', screenClass });
    inspectionCount += 1;
  }
  const left = residue.replace(/[\s,]/g, '');
  if (left !== '') problems.push(`INSPECTION.${name}: unparsable, so its copy is unlinted → ${left.slice(0, 60)}`);
}

let inspectionCount = 0;
let inspectionRows = 0;
{
  const prudente = objectBody(src, /export const INSPECTION_PRUDENTE[^=]*=\s*\{/);
  if (prudente === null) {
    problems.push('the INSPECTION_PRUDENTE row is missing — the conservative door checklist would ship unlinted. Re-point this gate, never delete it.');
  } else {
    lintInspectionRow('PRUDENTE', prudente);
    inspectionRows += 1;
  }
  const matrix = objectBody(src, /export const INSPECTION\s*:[^=]*=\s*\{/);
  if (matrix === null) {
    problems.push('the INSPECTION matrix is missing — the §6.2 door checklists would ship unlinted. Re-point this gate, never delete it.');
  } else {
    const gaps = [];
    const rows = splitViews(matrix, gaps);
    // Between the rows, only comments and commas may live. A spread row or a
    // computed key is a whole checklist the row regex cannot see (verifier, F-59).
    const between = stripComments(gaps.join('\n')).replace(/[\s,]/g, '');
    if (between !== '') problems.push(`INSPECTION: unparsable at the top of the matrix, so its copy is unlinted → ${between.slice(0, 60)}`);
    const names = rows.map((r) => r.name);
    for (const required of INSPECTION_ROWS) {
      if (!names.includes(required)) problems.push(`INSPECTION: the §6.2 row « ${required} » is missing — a deleted door checklist fails here`);
    }
    for (const row of rows) {
      if (row.body === null) { problems.push(`INSPECTION.${row.name}: unterminated object literal`); continue; }
      lintInspectionRow(row.name, row.body);
      inspectionRows += 1;
    }
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
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.css', '.json', '.webmanifest', '.txt', '.svg', '.md'];
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
    // The service worker template becomes dist/sw.js — every buyer receives it (verifier, F-59).
    join(app, 'sw.template.js'),
    ...walk(join(app, 'src')),
    ...walk(join(app, 'public')),
    ...walk(join(app, 'i18n')),
  ];
  scanDescription = 'apps/buyer-pwa — index.html, sw.template.js, src/, public/, i18n/ (' + SCAN_EXTENSIONS.join(' ') + ')';
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

/* ═══ VOIX-INLINE-1 (F-59) — the lint's WHOLE banned register, scanned raw ═══ */

/**
 * The extractor reads eight tables. The buyer's module holds more copy than
 * that — the bill labels, the C5 quote line, the operator screens, C6–C9
 * outside their tables — and the catalog migration that will lint all of it is
 * its own slice. Until then, every text file a buyer receives is scanned for
 * the French Voice lint's OWN banned-register list (« veuillez »,
 * « nonobstant », « conformément à », « ci-joint » and the rest), read from the
 * same data file the catalog lint reads and matched with the lint's own
 * matcher, so the two can never disagree about what a banned word is. Same
 * terms as the §6.1 scan above: comments, class names, attributes and dead
 * code are all read — a buyer's module is not a place to quote them.
 *
 * This is a WORD scan, not the lint. It cannot see a reading budget or a
 * register clash, and the NOT LINTED line below says so in those words.
 */
const lint = await loadLintData();
const REGISTER_TOKENS = lint.bannedRegisterTokens.filter((t) => !BANNED_WORDS.test(t));
if (REGISTER_TOKENS.length === 0) {
  problems.push("the i18n banned-register list holds nothing beyond §6.1's two words — the raw scan would scan for nothing");
}
for (const file of scanned) {
  const text = file === SOURCE ? src : readFileSync(file, 'utf8');
  for (const [i, line] of text.split('\n').entries()) {
    const token = findToken(line, REGISTER_TOKENS);
    if (token === undefined) continue;
    scanHits.push(
      `${file.replace(root + '/', '')}:${i + 1}: « ${token} » — the administrative register the French Voice ` +
        'lint bans (Contract §10.5), found by the raw scan outside any linted table',
    );
  }
}

console.log(
  `  ${views.length} refusal view(s) · ${paiementCount} §6.1 payment string(s) · ` +
    `${confirmationCount} C6 post-payment string(s) · ${porteCount} door string(s) · ` +
    `${voixCount} voice-control label(s) · ${suiviCount} tracking string(s) · ` +
    `${merciCount} gift-message string(s) · ${inspectionCount} door-checklist line(s) in ${inspectionRows} row(s) · ` +
    `${entries.length} user-facing strings extracted from ${rel} · ${scanned.length} file(s) scanned`,
);

const reportScan = () => {
  if (scanHits.length === 0) return;
  console.error('  ✘ words the French Voice forbids appear where a buyer can read them (§6.1\'s two, and the banned register):');
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
  // stderr is piped, not inherited: on a failure the report is printed ONCE, below.
  const out = execFileSync('pnpm', ['exec', 'copy-lint', catalog], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
  `  LINTED (French Voice): the REFUS table (${views.length} views), MESSAGES, the §6.1 PAIEMENT ` +
    `table (${paiementCount} strings), the C6 CONFIRMATION table (${confirmationCount} strings) ` +
    `, the PORTE table (${porteCount} strings), the C3 VOIX labels (${voixCount} strings), ` +
    `the SUIVI tracking table (${suiviCount} strings), the C10 MERCI gift message (${merciCount} strings) ` +
    `and the §6.2 INSPECTION door checklists (${inspectionCount} lines in ${inspectionRows} rows) ` +
    `— ${entries.length} strings from ${rel}.`,
);
console.log(
  '  NOT LINTED, and named so the gap is visible: every OTHER inline string in that module — the bill ' +
    'labels, the C5 quote line, the operator screens, and C6–C9 outside CONFIRMATION, SUIVI and MERCI. This ' +
    'gate reads nine tables, not the file. Those strings ARE word-scanned for the banned register ' +
    '(below), which catches administrative French but sees no reading budget and no register clash. ' +
    'The cure is the i18n catalog migration, which is its own slice.',
);
console.log(
  `  SCANNED for the two words §6.1 forbids AND the ${REGISTER_TOKENS.length} other banned-register words of the ` +
    `French Voice lint: ${scanned.length} file(s) — ${scanDescription}.`,
);
