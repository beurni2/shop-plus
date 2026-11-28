#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * CI gate: sandbox-key-beside-real-provider — THE SANDBOX TOOL LEAVES WITH THE SANDBOX.
 *
 * The founder's sandbox « money received » tool holds a key of its own
 * (`SANDBOX_CONFIRM_SECRET`, worker/auth.ts) that opens the money doors only
 * while `PAYMENT_PROVIDER_KIND` (src/payment-port.ts) reads 'sandbox'. A key
 * that can say « paid » must never sit beside a provider that really takes
 * money, so the day a real provider is wired, the tool's key, its workflow and
 * that line go with the sandbox.
 *
 * It FAILS (exit 1) when both hold:
 *   P — the storefront Worker builds, imports or defines a payment provider
 *       other than the certified sandbox;
 *   S — something of the sandbox remains: `.github/workflows/sandbox-payment.yml`
 *       or `scripts/sandbox-payment-confirm.mjs` exists, any workflow names
 *       `SANDBOX_CONFIRM_SECRET`, or the Worker's code (never its comments) names
 *       `SANDBOX_CONFIRM_SECRET` or `SANDBOX_CONFIRM_SECRET_NEXT`, or
 *       `PAYMENT_PROVIDER_KIND` still reads 'sandbox'.
 *
 * IT READS MEANING, NEVER NAMES. The type checker reads the graph the bundle is
 * built from: the entry and the commerce-core alias are taken from the real
 * `bundle:worker:combined` command. A provider is anything whose type carries a
 * callable port verb (`initiateCharge`, `initiateRefund`, `chargeStatus`), so
 * a renamed import or a value passed through a variable is still seen.
 * Every construction and every import is judged by the declaration it resolves
 * to. The SANDBOX is known by where it lives and what it does: a function in
 * services/storefront-service/src/payment-port.ts that returns a provider,
 * builds nothing but the vault's certified mock, calls nothing but that mock and
 * the language's own library, and names no `fetch`, `connect` or `WebSocket`.
 * A provider wearing the sandbox's name in another file, or the sandbox's own
 * body reaching for the network, is P. A function whose every return is an
 * allowed construction (the group door's `fournisseurPorte`) passes it through.
 * After the switch there may be no sandbox at all; that is not blindness.
 *
 * BLIND (exit 2) — it says so rather than pass: the bundle command cannot be
 * read, its entry or alias file is missing, an import in the Worker's own code
 * does not resolve, no provider is built anywhere outside the sandbox's own body
 * (a gate that sees none cannot be telling the truth), or `PAYMENT_PROVIDER_KIND`
 * is not one plain string.
 *
 * BOUND: it proves the source graph, not the bundle's bytes. The vault's mock is
 * trusted by its path (the vault keeps its own guards), and a provider reached
 * only through an untyped value (`any`) is seen only where its definition sits
 * in the Worker's own source. A real provider is seen only as a PaymentProvider
 * (one of the port verbs above): money taken by a plain function outside the
 * port is not seen here, so a real adapter MUST implement the port — say so at
 * the Real-Money Gate.
 *
 * Usage: sandbox-key-beside-real-provider.mjs [root]   (default: this repository)
 */

const ROOT = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const SERVICE = join(ROOT, 'services', 'storefront-service');
const PORT_FILE = join(SERVICE, 'src', 'payment-port.ts');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'sandbox-payment.yml');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const TOOL_SCRIPT = join(ROOT, 'scripts', 'sandbox-payment-confirm.mjs');
const ALIAS_NAME = '@shop-plus/commerce-core';
const VAULT_MOCK = /[\\/]packages[\\/]commerce-core[\\/](src|dist)[\\/]mocks[\\/]payment-provider-mock\.(ts|d\.ts|js)$/;
const VERBS = ['initiateCharge', 'initiateRefund', 'chargeStatus'];
const TOOL_KEYS = new Set(['SANDBOX_CONFIRM_SECRET', 'SANDBOX_CONFIRM_SECRET_NEXT']);
const NETWORK = new Set(['fetch', 'connect', 'WebSocket']);
const FACT = 'PAYMENT_PROVIDER_KIND';

const rel = (file) => relative(ROOT, file).split(sep).join('/');
function blind(reason) {
  console.error(`BLIND (exit 2): ${reason}`);
  process.exit(2);
}

// ── The graph the bundle is built from ────────────────────────────────────
let command;
try {
  command = JSON.parse(readFileSync(join(SERVICE, 'package.json'), 'utf8')).scripts?.['bundle:worker:combined'];
} catch {
  blind(`${rel(join(SERVICE, 'package.json'))} cannot be read`);
}
if (typeof command !== 'string') blind('services/storefront-service/package.json has no `bundle:worker:combined`');
const words = command.trim().split(/\s+/);
const entryWord = words[0] === 'esbuild' ? words.slice(1).find((w) => !w.startsWith('-')) : undefined;
if (entryWord === undefined) blind(`\`bundle:worker:combined\` names no esbuild entry: ${command}`);
const ENTRY = resolve(SERVICE, entryWord);
const aliasWord = words.find((w) => w.startsWith(`--alias:${ALIAS_NAME}=`));
const ALIAS = aliasWord === undefined ? undefined : resolve(SERVICE, aliasWord.slice(`--alias:${ALIAS_NAME}=`.length));
for (const file of [ENTRY, ALIAS]) if (file !== undefined && !existsSync(file)) blind(`${rel(file)}, named by the bundle command, does not exist`);

const TSCONFIG = join(dirname(ENTRY), 'tsconfig.json');
let options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2023.d.ts'],
  strict: true,
  types: [],
};
if (existsSync(TSCONFIG)) {
  const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => blind(`${rel(TSCONFIG)}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`),
  });
  if (parsed === undefined) blind(`${rel(TSCONFIG)} cannot be read`);
  options = parsed.options;
}
options = { ...options, noEmit: true };

const isOwnPath = (file) => file.startsWith(ROOT + sep) && !file.includes(`${sep}node_modules${sep}`);
const unresolved = [];
const host = ts.createCompilerHost(options, true);
// esbuild's `--alias` replaces the package wherever it is imported; the gate
// follows the same edge, and records every edge of the Worker's own code it
// cannot follow.
host.resolveModuleNameLiterals = (literals, containingFile, redirected, opts) =>
  literals.map((literal) => {
    if (ALIAS !== undefined && literal.text === ALIAS_NAME) {
      return { resolvedModule: { resolvedFileName: ALIAS, extension: ts.extensionFromPath(ALIAS), isExternalLibraryImport: false } };
    }
    const found = ts.resolveModuleName(literal.text, containingFile, opts, host, undefined, redirected);
    if (found.resolvedModule === undefined && isOwnPath(containingFile)) unresolved.push(`${rel(containingFile)} imports '${literal.text}'`);
    return found;
  });

const program = ts.createProgram({ rootNames: [ENTRY], options, host });
const checker = program.getTypeChecker();
if (unresolved.length > 0) blind(`the Worker's code has imports the gate cannot follow:\n  ${unresolved.join('\n  ')}`);
const own = program
  .getSourceFiles()
  .filter((sf) => isOwnPath(sf.fileName) && !sf.isDeclarationFile && !program.isSourceFileDefaultLibrary(sf));

// ── Reading helpers ───────────────────────────────────────────────────────
function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}
function where(node) {
  const sf = node.getSourceFile();
  return `${rel(sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
}
const inVault = (node) => VAULT_MOCK.test(node.getSourceFile().fileName);
const inLib = (node) => program.isSourceFileDefaultLibrary(node.getSourceFile());
const within = (inner, outer) =>
  inner.getSourceFile() === outer.getSourceFile() && inner.pos >= outer.pos && inner.end <= outer.end;
const isFunctionLike = (d) =>
  d !== undefined && (ts.isFunctionDeclaration(d) || ts.isFunctionExpression(d) || ts.isArrowFunction(d) || ts.isMethodDeclaration(d));
const isClass = (d) => d !== undefined && (ts.isClassDeclaration(d) || ts.isClassExpression(d));
const unwrap = (e) => (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isAwaitExpression(e) ? unwrap(e.expression) : e);
const memberName = (name) =>
  ts.isComputedPropertyName(name) ? (ts.isStringLiteralLike(name.expression) ? name.expression.text : undefined) : name.text;

/** Does this type carry a callable port verb (through a Promise, a union, an intersection)? */
function carriesVerb(type) {
  if (type === undefined) return false;
  const awaited = checker.getAwaitedType(type) ?? type;
  const parts = awaited.isUnion() ? awaited.types : [awaited];
  return parts.some((part) =>
    VERBS.some((verb) => {
      const symbol = checker.getPropertyOfType(part, verb);
      return symbol !== undefined && checker.getTypeOfSymbol(symbol).getCallSignatures().length > 0;
    }),
  );
}

function normalise(d) {
  if (d === undefined) return undefined;
  if (ts.isConstructorDeclaration(d)) return d.parent;
  if (ts.isVariableDeclaration(d) && d.initializer !== undefined) {
    const init = unwrap(d.initializer);
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init) || ts.isClassExpression(init)) return init;
  }
  return d;
}
function declarationOfSymbol(symbol) {
  if (symbol === undefined) return undefined;
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return normalise(target.valueDeclaration ?? target.declarations?.[0]);
}
/**
 * THE ONE RESOLUTION. Every construction and every import is judged by the
 * declaration it resolves to — through any rename, re-export or variable —
 * never by the name it is called by where it is used.
 */
function declarationOf(node) {
  if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) {
    const d = checker.getResolvedSignature(node)?.declaration;
    if (d !== undefined && !ts.isJSDocSignature(d)) return normalise(d);
    return declarationOfSymbol(checker.getSymbolAtLocation(ts.isTaggedTemplateExpression(node) ? node.tag : node.expression));
  }
  return declarationOfSymbol(checker.getSymbolAtLocation(node));
}

// ── The sandbox: where it lives and what it does ───────────────────────────
const sandboxes = new Set();
const notSandbox = [];
const portFile = program.getSourceFile(PORT_FILE);
const candidates = [];
for (const statement of portFile?.statements ?? []) {
  if (ts.isFunctionDeclaration(statement) && statement.body !== undefined) candidates.push(statement);
  if (ts.isVariableStatement(statement)) {
    for (const d of statement.declarationList.declarations) {
      const init = d.initializer === undefined ? undefined : unwrap(d.initializer);
      if (init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) candidates.push(init);
    }
  }
}
function whyNotTheSandbox(fn) {
  let reason;
  let mocks = 0;
  walk(fn.body, (n) => {
    if (reason === undefined && ts.isIdentifier(n) && NETWORK.has(n.text)) reason = `it names \`${n.text}\` (${where(n)})`;
  });
  walk(fn.body, (n) => {
    if (reason !== undefined) return;
    if (ts.isNewExpression(n)) {
      const d = declarationOf(n);
      if (d === undefined || !inVault(d)) reason = `it builds something other than the vault's mock (${where(n)})`;
      else mocks += 1;
    } else if (ts.isCallExpression(n) || ts.isTaggedTemplateExpression(n)) {
      const d = declarationOf(n);
      if (d === undefined || !(inLib(d) || inVault(d) || within(d, fn))) {
        reason = `it calls something other than the vault's mock or the language's library (${where(n)})`;
      }
    }
  });
  return reason ?? (mocks === 0 ? 'it builds no vault mock' : undefined);
}
for (const fn of candidates) {
  const signature = checker.getSignatureFromDeclaration(fn);
  if (signature === undefined || !carriesVerb(checker.getReturnTypeOfSignature(signature))) continue;
  const reason = whyNotTheSandbox(fn);
  if (reason === undefined) sandboxes.add(fn);
  else notSandbox.push(`${where(fn)} returns a provider but is not the sandbox: ${reason}`);
}
const inSandbox = (node) => [...sandboxes].some((s) => within(node, s));

// ── Which constructions are allowed ────────────────────────────────────────
function returnsOf(fn) {
  if (!ts.isBlock(fn.body)) return [fn.body];
  const found = [];
  const visit = (n) => {
    if (ts.isReturnStatement(n)) {
      if (n.expression !== undefined) found.push(n.expression);
      return;
    }
    if (ts.isFunctionLike(n) || ts.isClassLike(n)) return;
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn.body, visit);
  return found;
}
function passesThrough(d, seen = new Set()) {
  if (!isFunctionLike(d) || d.body === undefined || seen.has(d) || sandboxes.has(d)) return false;
  seen.add(d);
  let constructions = 0;
  for (const expression of returnsOf(d)) {
    const e = unwrap(expression);
    if (ts.isCallExpression(e) || ts.isNewExpression(e)) {
      if (!allowed(e, seen)) return false;
      constructions += 1;
    } else if (carriesVerb(checker.getTypeAtLocation(e))) {
      return false;
    }
  }
  return constructions > 0;
}
function allowed(node, seen = new Set()) {
  const d = declarationOf(node);
  if (d === undefined) return false;
  if (sandboxes.has(d)) return true;
  if (inVault(d)) return inSandbox(node);
  return passesThrough(d, seen);
}
function isProvider(d) {
  if (isFunctionLike(d)) {
    const signature = checker.getSignatureFromDeclaration(d);
    return signature !== undefined && carriesVerb(checker.getReturnTypeOfSignature(signature));
  }
  if (isClass(d)) return d.members.some((m) => m.name !== undefined && VERBS.includes(memberName(m.name)));
  if (ts.isVariableDeclaration(d)) return carriesVerb(checker.getTypeAtLocation(d));
  return false;
}

// ── P: a provider other than the sandbox ───────────────────────────────────
const P = [...notSandbox];
// Counted outside the sandbox's own body: the vault's mock built inside it is
// not the Worker building a provider.
let constructionsSeen = 0;
for (const sf of own) {
  walk(sf, (n) => {
    if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && carriesVerb(checker.getTypeAtLocation(n))) {
      if (!inSandbox(n)) constructionsSeen += 1;
      if (!allowed(n)) {
        const d = declarationOf(n);
        P.push(`${where(n)} builds a provider that is not the sandbox (${d === undefined ? 'unresolved' : where(d)})`);
      }
    }
    if (ts.isObjectLiteralExpression(n) || isClass(n)) {
      const members = ts.isObjectLiteralExpression(n) ? n.properties : n.members;
      const verb = members.find(
        (m) =>
          m.name !== undefined &&
          VERBS.includes(memberName(m.name)) &&
          checker.getTypeAtLocation(m.name).getCallSignatures().length > 0,
      );
      if (verb !== undefined && !inVault(n) && !inSandbox(n)) P.push(`${where(n)} defines \`${memberName(verb.name)}\` outside the sandbox`);
    }
  });
  for (const statement of sf.statements) {
    const names = [];
    if (ts.isImportDeclaration(statement) && statement.importClause !== undefined && !statement.importClause.isTypeOnly) {
      const clause = statement.importClause;
      if (clause.name !== undefined) names.push(clause.name);
      if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
        for (const s of clause.namedBindings.elements) if (!s.isTypeOnly) names.push(s.name);
      }
    }
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      for (const s of statement.exportClause.elements) if (!s.isTypeOnly) names.push(s.name);
    }
    for (const name of names) {
      const d = declarationOf(name);
      if (d === undefined || !isProvider(d) || sandboxes.has(d) || inVault(d) || passesThrough(d)) continue;
      if (ts.isVariableDeclaration(d) && d.initializer !== undefined) {
        const init = unwrap(d.initializer);
        if ((ts.isCallExpression(init) || ts.isNewExpression(init)) && allowed(init)) continue;
      }
      P.push(`${where(name)} imports \`${name.text}\`, a provider that is not the sandbox (${where(d)})`);
    }
  }
}
if (constructionsSeen === 0) blind(`no payment provider is built anywhere in the code ${rel(ENTRY)} reaches, outside the sandbox's own body — the gate cannot be seeing it`);

// ── S: what of the sandbox remains ─────────────────────────────────────────
const S = [];
if (existsSync(WORKFLOW)) S.push(`${rel(WORKFLOW)} exists`);
if (existsSync(TOOL_SCRIPT)) S.push(`${rel(TOOL_SCRIPT)} exists`);
// A renamed copy of the tool's workflow still carries its key.
if (existsSync(WORKFLOWS)) {
  for (const name of readdirSync(WORKFLOWS).sort()) {
    if (!/\.ya?ml$/.test(name)) continue;
    const file = join(WORKFLOWS, name);
    if (file !== WORKFLOW && /\bSANDBOX_CONFIRM_SECRET\b/.test(readFileSync(file, 'utf8'))) S.push(`${rel(file)} names \`SANDBOX_CONFIRM_SECRET\``);
  }
}
for (const sf of own) {
  walk(sf, (n) => {
    if ((ts.isIdentifier(n) || ts.isStringLiteralLike(n)) && TOOL_KEYS.has(n.text)) S.push(`${where(n)} names \`${n.text}\``);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === FACT) {
      const type = checker.getTypeAtLocation(n.name);
      if (!type.isStringLiteral()) blind(`${where(n)}: ${FACT} is not one plain string, so the gate cannot read it`);
      if (type.value === 'sandbox') S.push(`${where(n)} ${FACT} reads 'sandbox'`);
    }
  });
}

if (P.length > 0 && S.length > 0) {
  console.error('VIOLATION: a payment provider other than the sandbox is built while the sandbox tool remains.');
  for (const line of P) console.error(`  provider: ${line}`);
  for (const line of S) console.error(`  sandbox:  ${line}`);
  process.exit(1);
}
if (P.length > 0) {
  console.log(`OK: a provider other than the sandbox is built (${P.length} finding(s)), and nothing of the sandbox tool remains.`);
} else {
  const at = [...sandboxes].map(where).join(', ');
  console.log(
    `OK: ${constructionsSeen} provider construction(s) in ${own.length} files, every one the sandbox (${at}) or a pass-through to it; ` +
      `the sandbox tool remains (${S.length} trace(s)), which is allowed while no other provider is built.`,
  );
}
process.exit(0);
