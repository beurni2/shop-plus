#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// The lint's OWN token matcher and its maintained banned-register list, so the
// raw scan below and the catalog lint can never disagree about a banned word.
import { findToken } from '@platform/i18n';
import { loadLintData } from '@platform/i18n/data-loader';

/**
 * CI gate: copy-lint-inline-refus — THE BUYER MODULE'S COPY LIVES IN THE
 * CATALOG, TAGGED, AND NOTHING FRENCH IS LEFT INLINE.
 *
 * ═══ WHAT THIS GATE WAS, AND WHY IT CHANGED (CATALOGUE-CLIENTE-1, F-59 « M ») ═══
 *
 * For eight rounds this gate READ THE SOURCE of `apps/buyer-pwa/src/cliente/
 * screens.ts`: it parsed ten inline copy tables out of the TypeScript, decoded
 * their string literals as the buyer would read them, fed them to the French
 * Voice lint, and word-scanned every other buyer file for the banned register.
 * It existed because the cliente module kept its copy inline while Ten Laws #6
 * asks for « the i18n catalog with register tags — never inline ». Every one of
 * its rounds closed a hole in READING SOURCE (double quotes, template literals,
 * quoted keys, commented-out lines, spread rows, lists read from a const), and
 * its own success line named the strings it could not reach: the bill labels,
 * the C5 quote line, the operator screens, C6–C9 outside their tables.
 *
 * CATALOGUE-CLIENTE-1 moved ALL of it — the ten tables and every text node,
 * attribute and bare label of the module, plus the flow's two spoken
 * sentences — into `apps/buyer-pwa/i18n/catalog.json` under the `cl.` prefix,
 * with a `register` and a `screenClass` on each entry. The real lint
 * (`copy-lint-pwa-positive`) now reads them all, budgets included, which is
 * what the source extractor could never do for the strings outside its
 * tables. So the extractor is gone, and this gate keeps the THREE things the
 * plain catalog lint does not know:
 *
 *   1. THE STRUCTURAL FLOOR, on the catalog. Every table field the old gate
 *      required is a key that must EXIST, with the register and screen class
 *      the old maps gave it, and with ONLY the placeholders its renderer
 *      fills. A deleted sentence is a missing key; a sentence re-tagged
 *      `label` to slip a budget is a wrong class; a `{X}` planted into a field
 *      nothing fills is a literal brace in a money sentence. The catalog lint
 *      checks whatever tag an entry carries — this gate checks the tag itself.
 *      (A deleted key also throws at module load — `t()` refuses a missing
 *      key — but a throw at load is a blank screen, and this is the line that
 *      names the key instead.)
 *
 *   2. THE TRIPWIRES, on the source. The module may not grow inline French
 *      again. Four detectors, each with its blind spot named:
 *        T1 any French-typographic character (accents, ’ « » …) inside ANY
 *           string literal — the strongest, blind to ASCII-only words;
 *        T2 any HTML TEXT NODE with a letter inside a template literal, the
 *           `${…}` expressions removed and entities stripped — blind to text
 *           built entirely in code;
 *        T3 any `aria-label` / `placeholder` / `alt` / `title` attribute with
 *           a letter — the strings a screen reader speaks;
 *        T4 any bare quoted literal that is a multi-word phrase, a capitalised
 *           word or an UPPERCASE word of four letters or more — blind to a
 *           short lowercase word.
 *      What T2–T4 must not see, and why, is the ALLOWLIST below: brand names,
 *      the currency, an attribution and a glyph run are not French Voice copy.
 *
 *   3. THE KEYS. Every `t('…')` / `tf('…')` in the module and the flow names
 *      a key the catalog has; every `cl.` key the catalog has is named by one
 *      of them (no orphan copy that nobody renders and nobody reads).
 *
 * …AND THE RAW SCAN STAYS AS IT WAS: every text file a buyer receives —
 * index.html, the service worker template, src/, public/, i18n/ — is scanned
 * for §6.1's two forbidden words and the lint's whole banned register, comments
 * and class names included. The catalog is in that walk, so the migrated copy
 * is scanned exactly as it was linted.
 *
 * Usage:
 *   copy-lint-inline-refus.mjs                          the real catalog + module
 *   --catalog-patch FILE   a NEGATIVE: {"delete":[keys], "set":{key:{field:value}}}
 *                          applied in memory over the real catalog
 *   --source FILE          a NEGATIVE: the tripwires + key existence on that file
 *                          only (the orphan check is off; the scan reads it alone)
 *   --scan-root DIR        widen the raw scan to a fixture tree
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = join(root, 'apps/buyer-pwa');
const flag = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const CATALOG_PATCH = flag('--catalog-patch');
const SOURCE_FIXTURE = flag('--source');
const SCAN_ROOT = flag('--scan-root');
const SCREENS = join(app, 'src/cliente/screens.ts');
const FLOW = join(app, 'src/cliente/flow.ts');
const SOURCES = SOURCE_FIXTURE !== undefined ? [SOURCE_FIXTURE] : [SCREENS, FLOW];
const rel = (p) => p.replace(root + '/', '');

const problems = [];

/* ═══════════ 1. THE STRUCTURAL FLOOR — the tables, as catalog keys ═══════════ */

const L = (fills = []) => ({ screenClass: 'label', fills });
const S = (fills = []) => ({ screenClass: 'status', fills });
const C = (fills = []) => ({ screenClass: 'checkout', fills });
const G = (fills = []) => ({ screenClass: 'general', fills });

/** prefix → register → field suffix → { screenClass, fills }. The maps the
 *  source-reading gate carried, verbatim, now spelled as keys. */
const TABLES = [
  ['cl.suivi', 'money', {
    etape1_titre: L(), etape1_corps: S(), etape2_titre: L(), etape2_corps: S(), etape3_titre: L(), etape3_corps: S(),
    etape4_titre: L(), etape4_corps: S(), etape5_titre: L(), etape5_corps: S(), etape6_titre: L(), etape6_corps: S(),
    intro: S(), gps: S(), verifier: L(), hors_portee: C(), voir_code: L(), terminee: L(), reentree: L(),
    c9_attente: C(), c9_arrivee: S(), code_demo: L(), merci_titre: L(), merci_corps: S(), merci_preuve: S(), merci_fermer: L(),
  }],
  ['cl.message', 'money', { prix_rafraichi_identique: S(), prix_rafraichi_different: S(), prix_en_cours_de_mise_ajour: S(), note_injouable: S() }],
  ['cl.paiement', 'money', {
    ligne_maintenant: C(['{X}']), ligne_livraison: C(['{Y}']), titre_a: L(), corps_a: C(), titre_b: L(), titre_bfin: L(),
    corps_b: C(['{D}']), corps_baccent: L(), avertissement_b: C(), redite: C(['{X}', '{Y}']), redite_a: C(['{X}', '{Y}']),
    redite_fin: L(), ecouter_note: L(), reco: L(),
  }],
  ['cl.voix', 'neutral', { ecouter: L(), pause: L(), titre: L(), ecouter_produit: L() }],
  ['cl.confirmation', 'money', {
    attente_titre: L(), attente_corps: C(), attente_chip: L(), attente_action: L(), attente_hors_portee: C(),
    echec_titre: L(), echec_corps: C(), echec_action: L(), reference: L(), etape_suivre: C(),
  }],
  ['cl.merci', 'selling', { titre_avant: L(), corps: G(), prenom_label: L(), prenom_manque: S(), action: L(), message: G(['{prenom}', '{article}', '{lien}']) }],
  ['cl.porte', 'money', { reste_apayer: L(), echec_titre: L(), echec_corps: C(), echec_action: L() }],
  ['cl.operateur', 'money', { titre: L(), corps: C(['{X}']), cle: L(), attente: S(), loi: C(), porte_titre: L(), porte_loi: C() }],
];

/** The refusal views. `no_secure_random` offers no action, so no label. */
const REFUS_VIEWS = ['generique', 'listing_unknown', 'not_found', 'listing_not_live', 'out_of_stock', 'delivery_not_serviceable',
  'attribution_missing', 'attribution_mismatch', 'checkout_killed', 'expired', 'already_reserved', 'unreachable',
  'request_key_reused', 'bad_field', 'malformed', 'unknown_field', 'no_secure_random'];
const REFUS_SANS_ACTION = new Set(['no_secure_random']);
for (const view of REFUS_VIEWS) {
  const fields = { overline: L(), titre: S(), phrase: S() };
  if (!REFUS_SANS_ACTION.has(view)) fields.libelle = L();
  TABLES.push([`cl.refus.${view}`, 'money', fields]);
}

/** §6.2's door checklists: the LINE COUNT of each list is the floor — a
 *  deleted checklist line is a missing key. No placeholder anywhere. */
const INSPECTION = { prudente: [3, 3], fashion_bags_fabrics: [5, 4], shoes: [5, 4], sealed_beauty_cosmetics: [5, 4] };
for (const [row, [nVerifier, nMotifs]] of Object.entries(INSPECTION)) {
  const fields = { risque: S() };
  for (let i = 1; i <= nVerifier; i += 1) fields[`verifier_${i}`] = L();
  for (let i = 1; i <= nMotifs; i += 1) fields[`motifs_${i}`] = L();
  TABLES.push([`cl.inspection.${row}`, 'money', fields]);
}

const catalogPath = join(app, 'i18n/catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
if (CATALOG_PATCH !== undefined) {
  const patch = JSON.parse(readFileSync(CATALOG_PATCH, 'utf8'));
  for (const key of patch.delete ?? []) {
    const i = catalog.findIndex((e) => e.key === key);
    if (i < 0) problems.push(`catalog patch: cannot delete « ${key} », it is not in the catalog — the fixture proves nothing`);
    else catalog.splice(i, 1);
  }
  for (const [key, fields] of Object.entries(patch.set ?? {})) {
    const e = catalog.find((x) => x.key === key);
    if (e === undefined) problems.push(`catalog patch: cannot set « ${key} », it is not in the catalog — the fixture proves nothing`);
    else Object.assign(e, fields);
  }
}
const byKey = new Map(catalog.map((e) => [e.key, e]));

let floorCount = 0;
for (const [prefix, register, fields] of TABLES) {
  for (const [suffix, { screenClass, fills }] of Object.entries(fields)) {
    const key = `${prefix}.${suffix}`;
    const e = byKey.get(key);
    if (e === undefined) { problems.push(`${key}: MISSING from the catalog — a deleted sentence fails here, by name`); continue; }
    floorCount += 1;
    if (typeof e.fr !== 'string' || e.fr === '') problems.push(`${key}: empty — a table field with no sentence`);
    if (e.register !== register) problems.push(`${key}: register « ${e.register} », the table is « ${register} »`);
    if (e.screenClass !== screenClass) problems.push(`${key}: screenClass « ${e.screenClass} », this field is « ${screenClass} » — a re-tag is how a budget gets slipped`);
    for (const brace of (typeof e.fr === 'string' ? e.fr : '').match(/\{[^}]*\}/gu) ?? []) {
      if (fills.includes(brace)) continue;
      problems.push(`${key}: « ${brace} » is not filled in this field — it takes ${fills.length === 0 ? 'no placeholder at all' : fills.join(' ')}, so the buyer would read the token itself`);
    }
  }
}

/* ═══════════ 2. THE TRIPWIRES — nothing French left inline ═══════════ */

/** Not copy: brand names, the currency, an attribution, a glyph run. Anything
 *  else with a letter in a text node, a spoken attribute or a bare phrase fails. */
const ALLOWLIST = new Set(['FCFA', 'ORANGE MONEY', 'MOOV MONEY', '© OpenStreetMap', '••• •••']);
const TYPO = /[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ’«»…]/u;

/**
 * Read a module: every bare literal ('…' / "…") and every template literal's
 * LITERAL SEGMENTS (the text between its `${…}` expressions), comments skipped
 * — string-aware, so a `//` inside a url or a `'s` inside a doc comment cannot
 * mislead it. Nested templates inside expressions are read too.
 */
function lireLitteraux(code) {
  const nus = [];
  const gabarits = [];
  const ligneDe = (pos) => code.slice(0, pos).split('\n').length;
  let i = 0;
  function lireCode(dansExpr) {
    let depth = 0;
    while (i < code.length) {
      const c = code[i];
      if (code.startsWith('//', i)) { const fin = code.indexOf('\n', i); i = fin < 0 ? code.length : fin; continue; }
      if (code.startsWith('/*', i)) { const fin = code.indexOf('*/', i + 2); i = fin < 0 ? code.length : fin + 2; continue; }
      if (c === "'" || c === '"') {
        const debut = i; let j = i + 1; let texte = '';
        while (j < code.length && code[j] !== c) { if (code[j] === '\\') { texte += code[j] + code[j + 1]; j += 2; } else { texte += code[j]; j += 1; } }
        nus.push({ texte, ligne: ligneDe(debut) }); i = j + 1; continue;
      }
      if (c === '`') { i += 1; lireGabarit(); continue; }
      if (dansExpr && c === '{') depth += 1;
      if (dansExpr && c === '}') { if (depth === 0) { i += 1; return; } depth -= 1; }
      i += 1;
    }
  }
  function lireGabarit() {
    const debut = i; const segments = []; let cur = '';
    while (i < code.length) {
      const c = code[i];
      if (c === '\\') { cur += c + code[i + 1]; i += 2; continue; }
      if (c === '`') { segments.push(cur); i += 1; gabarits.push({ segments, ligne: ligneDe(debut) }); return; }
      if (code.startsWith('${', i)) { segments.push(cur); cur = ''; i += 2; lireCode(true); continue; }
      cur += c; i += 1;
    }
    segments.push(cur); gabarits.push({ segments, ligne: ligneDe(debut) });
  }
  lireCode(false);
  return { nus, gabarits };
}

const EXPR = ' ';
let tripCount = 0;
for (const file of SOURCES) {
  const code = readFileSync(file, 'utf8');
  const { nus, gabarits } = lireLitteraux(code);
  const where = (ligne) => `${rel(file)}:${ligne}`;
  // T1 — a French-typographic character in any literal, bare or template.
  for (const { texte, ligne } of nus) {
    if (TYPO.test(texte)) { problems.push(`${where(ligne)}: T1 inline French in a string literal → « ${texte.slice(0, 60)} »`); tripCount += 1; }
  }
  for (const { segments, ligne } of gabarits) {
    const joint = segments.join(EXPR);
    if (TYPO.test(joint)) { problems.push(`${where(ligne)}: T1 inline French in a template literal → « ${joint.replace(/ /g, '${…}').slice(0, 60)} »`); tripCount += 1; }
    // T2 — a text node with a letter, expressions and entities removed.
    const sansEntites = joint.replace(/&[a-z]+;/g, '');
    for (const m of sansEntites.matchAll(/>([^<>]*)</g)) {
      const texte = m[1].replace(/ /g, '').trim();
      if (!/[A-Za-z]/.test(texte) || ALLOWLIST.has(texte)) continue;
      problems.push(`${where(ligne)}: T2 inline text node → « ${texte.slice(0, 60)} »`); tripCount += 1;
    }
    // T3 — the attributes a screen reader speaks or a field shows empty.
    for (const m of joint.matchAll(/\b(aria-label|placeholder|alt|title)="([^"]*)"/g)) {
      const texte = m[2].replace(/ /g, '').trim();
      if (!/[A-Za-z]/.test(texte) || ALLOWLIST.has(texte)) continue;
      problems.push(`${where(ligne)}: T3 inline ${m[1]} → « ${texte.slice(0, 60)} »`); tripCount += 1;
    }
  }
  // T4 — a bare literal that reads as copy: a phrase of words, a Capitalised
  // word, an UPPERCASE word (four letters or more).
  for (const { texte, ligne } of nus) {
    const t = texte.trim();
    if (ALLOWLIST.has(t)) continue;
    if (/^[A-Za-z]+(?: [A-Za-z]+)+[.?!:]*$/.test(t) || /^[A-Z][a-z]{3,}$/.test(t) || /^[A-Z]{4,}$/.test(t)) {
      problems.push(`${where(ligne)}: T4 a bare literal that reads as copy → « ${t.slice(0, 60)} »`); tripCount += 1;
    }
  }
}

/* ═══════════ 3. THE KEYS — every call names a key, every cl. key is called ═══════════ */

const referenced = new Set();
for (const file of SOURCES) {
  const code = readFileSync(file, 'utf8');
  for (const m of code.matchAll(/(?<![\w.])tf?\('([^']+)'/g)) {
    referenced.add(m[1]);
    if (!byKey.has(m[1])) problems.push(`${rel(file)}: t('${m[1]}') names a key the catalog does not have — the module would throw at load`);
  }
}
if (SOURCE_FIXTURE === undefined) {
  for (const e of catalog) {
    if (e.key.startsWith('cl.') && !referenced.has(e.key)) problems.push(`${e.key}: an orphan — in the catalog under the module's prefix, rendered by nothing`);
  }
}

/* ══ 4. THE RAW SCAN, unchanged: §6.1's two words and the banned register, everywhere a buyer can read ══ */

const BANNED_WORDS = /s[eé]questres?|escrows?/iu;
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.css', '.json', '.webmanifest', '.txt', '.svg', '.md'];
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.') ? [] : walk(full);
    return SCAN_EXTENSIONS.some((ext) => e.name.endsWith(ext)) ? [full] : [];
  });
let scanned;
let scanDescription;
if (SCAN_ROOT !== undefined) {
  scanned = [...new Set([...SOURCES, ...walk(SCAN_ROOT)])];
  scanDescription = rel(SCAN_ROOT);
} else if (SOURCE_FIXTURE !== undefined) {
  scanned = [SOURCE_FIXTURE];
  scanDescription = rel(SOURCE_FIXTURE);
} else {
  scanned = [join(app, 'index.html'), join(app, 'sw.template.js'), ...walk(join(app, 'src')), ...walk(join(app, 'public')), ...walk(join(app, 'i18n'))];
  scanDescription = 'apps/buyer-pwa — index.html, sw.template.js, src/, public/, i18n/ (' + SCAN_EXTENSIONS.join(' ') + ')';
}
const lint = await loadLintData();
const REGISTER_TOKENS = lint.bannedRegisterTokens.filter((t) => !BANNED_WORDS.test(t));
if (REGISTER_TOKENS.length === 0) problems.push("the i18n banned-register list holds nothing beyond §6.1's two words — the raw scan would scan for nothing");
/** Kept apart from `problems`: a banned word is a finding in its own right and
 *  must never be hidden behind a structural problem, nor hide one. */
const scanHits = [];
for (const file of scanned) {
  const text = readFileSync(file, 'utf8');
  for (const [i, line] of text.split('\n').entries()) {
    const hit = BANNED_WORDS.exec(line);
    if (hit !== null) scanHits.push(`${rel(file)}:${i + 1}: « ${hit[0]} » — §6.1 forbids it in customer copy, and this gate reads comments, class names and data attributes too`);
    const token = findToken(line, REGISTER_TOKENS);
    if (token !== undefined) scanHits.push(`${rel(file)}:${i + 1}: « ${token} » — the administrative register the French Voice lint bans (Contract §10.5), found by the raw scan`);
  }
}

/* ═══════════ the report ═══════════ */

console.log(
  `  ${floorCount} table key(s) pinned in the catalog (register, screen class, placeholders) · ` +
    `${referenced.size} key(s) named by ${SOURCES.map(rel).join(' + ')} · ${tripCount} tripwire hit(s) · ${scanned.length} file(s) scanned`,
);
const reportScan = () => {
  if (scanHits.length === 0) return;
  console.error("  ✘ words the French Voice forbids appear where a buyer can read them (§6.1's two, and the banned register):");
  for (const h of scanHits) console.error(`    · ${h}`);
};
if (problems.length > 0) {
  console.error('  ✘ the buyer module’s copy is not all in the catalog, tagged and called:');
  for (const p of problems) console.error(`    · ${p}`);
}
reportScan();
if (problems.length > 0 || scanHits.length > 0) {
  console.error('\ncopy-lint-inline-refus: FAILED');
  process.exit(1);
}
console.log('\ncopy-lint-inline-refus: OK');
console.log(
  `  PINNED: ${TABLES.length} tables (${floorCount} keys) exist in the catalog with the register, screen class and placeholder set ` +
    'their renderers assume; the French Voice lint itself runs on the whole catalog in copy-lint-pwa-positive.',
);
console.log(
  `  NO INLINE FRENCH in ${SOURCES.map(rel).join(' + ')}: no typographic character in any literal, no text node, no spoken attribute, ` +
    'no bare phrase — save the allowlisted brand names, currency, attribution and glyph run. BLIND TO: a short lowercase ASCII word ' +
    'in a bare literal, and text built entirely in code.',
);
console.log(`  SCANNED for the two words §6.1 forbids AND the ${REGISTER_TOKENS.length} other banned-register words: ${scanned.length} file(s) — ${scanDescription}.`);
