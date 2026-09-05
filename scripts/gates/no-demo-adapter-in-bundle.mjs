#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * CI gate: no-demo-adapter-in-bundle (RESELLER-SEAM-HONESTY-1).
 *
 * THE INVARIANT: the reseller app's DEMO storefront adapter — whose `create` and
 * `publish` CANNOT FAIL — must be ABSENT from the published bundle, not merely
 * unselected. A populated fallback is dangerous not because it can be SELECTED but
 * because it can be PRESENT: while it was bundled, an unset or mistyped
 * `EXPO_PUBLIC_STOREFRONT_*` produced « En ligne : {slug} » — a success toast with
 * nothing written anywhere, and no artifact to notice afterwards.
 *
 * WHY THIS MEASURES BYTES INSTEAD OF READING IMPORTS (the founder's ruling, and the
 * reason this gate exists in this shape): `expo export` runs LOCALLY and writes the
 * real Metro/Hermes bundle to disk, so this greps THE ARTIFACT — exactly as the
 * storefront-service e2e asserts against the real bundled Worker. The two weaker
 * alternatives were both rejected:
 *   · A TEXT SCAN for import statements is defeated by a re-export. That is not
 *     hypothetical here: `packages/supply-consumer` re-exported its certified mock
 *     from the package root, and a text scan of the importing file would have said
 *     nothing while the mock rode into the bundle.
 *   · A COMPUTED transitive import graph cannot be defeated by a re-export, but is
 *     still an argument about what Metro SHOULD bundle rather than a measurement of
 *     what it DID.
 * This gate needs neither argument: if the bytes are not in the artifact, the adapter
 * cannot run on anyone's phone.
 *
 * FINGERPRINTS, AND WHY THE STRING LITERALS ARE THE LOAD-BEARING ONES: Hermes keeps a
 * string table, so `demo://cover/` and `demo://avatar/` — DATA, not identifiers —
 * survive whatever minification does to names. The class name is checked too, but as
 * a secondary signal only: a future minifier could legitimately rename it, and this
 * gate must fail on PRESENCE, never on naming fashion.
 *
 * ⚠ THE ENCODING CONSTRAINT — WHY A FINGERPRINT MAY NOT CONTAIN A NON-ASCII CHARACTER
 * (relayed from APPS, then VERIFIED HERE on this repo's own bundle rather than taken
 * on faith). Hermes stores each string in the NARROW 8-bit encoding when every one of
 * its characters fits, and in UTF-16 otherwise. A byte-level `includes` therefore sees
 * the first kind and is BLIND to the second. Measured on `index-db85076a…hbc`:
 *
 *   'Mettre ma boutique en ligne'   utf-8 HIT    utf-16le miss   ← pure ASCII
 *   'Pas encore relié au service'   utf-8 miss   utf-16le HIT    ← « é »
 *   'Envoi en cours…'               utf-8 miss   utf-16le HIT    ← « … », NO accent
 *
 * The third line is the one that matters and it is SHARPER THAN "accents are UTF-16":
 * a SINGLE non-ASCII character anywhere in the string — an accent, a « guillemet », an
 * ellipsis — flips the WHOLE string to UTF-16. French copy in this codebase routinely
 * carries all three, so ALMOST EVERY user-facing French string is invisible to this
 * scan. Choosing a French UI string as a fingerprint — the instinctive choice, since
 * that is what identifies a module here — would make this gate PASS VACUOUSLY FOREVER:
 * green, silent, asserting nothing. Same failure shape as a provenance stamp reading
 * `dev` while looking healthy. FINGERPRINTS MUST BE ASCII, and the positive control
 * below is what stops that rule from decaying into a comment nobody reads.
 *
 * HONEST LIMIT: this proves the ANDROID export. EAS builds the shipped update from
 * the same Metro graph and the same entry, so an absence here is an absence there —
 * but this is one platform's artifact, not the EAS artifact itself.
 */

const APP_DIR = 'apps/reseller-app';

/**
 * THE POSITIVE CONTROL — a string that is DEFINITELY in the bundle and is pure ASCII.
 * The gate proves it can SEE before it reports that it cannot FIND. Without this, an
 * encoding change, a bundler change, or a mangled read would make every absence
 * assertion vacuously true and the gate would go blind without saying so.
 *
 * `/supply-projections` is the supply route the real HTTP offer source calls
 * (apps/reseller-app/src/vitrine/offers.ts, `OFFERS_ROUTE`) — ASCII by construction
 * (a URL path), and present in any bundle that contains the real HTTP adapters, which
 * are the very modules this gate is about. It CANNOT be removed without removing the
 * browse path itself. (Until ACCES-ARME-2 the control was the shared write key's
 * header; the key is retired and the header no longer exists anywhere.)
 */
const POSITIVE_CONTROL = { name: 'supply route (proves the scan can see)', needle: '/supply-projections' };

const FINGERPRINTS = [
  // Load-bearing: string literals live in the Hermes string table, so minification
  // cannot remove them while the module is present. ASCII by construction — see the
  // encoding constraint above.
  { name: 'demo upload URL (cover)', needle: 'demo://cover/', loadBearing: true },
  { name: 'demo upload URL (avatar)', needle: 'demo://avatar/', loadBearing: true },
  // Secondary: the class identifier. Informational — see the header.
  { name: 'DemoStorefrontService identifier', needle: 'DemoStorefrontService', loadBearing: false },
];

const out = mkdtempSync(join(tmpdir(), 'reseller-export-'));
let failed = false;
try {
  console.log('no-demo-adapter-in-bundle: exporting the reseller app (expo export, android)…');
  // ABSOLUTE, deliberately: `execFileSync` resolves a RELATIVE command against the
  // process cwd, not `options.cwd`, so a relative path here would depend on where the
  // gate happens to be invoked from. Only `apps/reseller-app/node_modules/.bin` holds
  // this binary (pnpm does not hoist it to the workspace root), so the path is built
  // from the repo root and the ambiguity is removed rather than relied upon.
  const expoBin = resolve(APP_DIR, 'node_modules', '.bin', 'expo');
  execFileSync(expoBin, ['export', '--platform', 'android', '--output-dir', out], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    // The export must run with the env UNSET — the exact condition under which the
    // demo adapter used to be selected. If it is absent even here, it is absent.
    env: { ...process.env, EXPO_PUBLIC_STOREFRONT_BASE: '' },
  });

  // `out` is absolute (mkdtempSync), and expo honours an absolute --output-dir even
  // though it runs with cwd = APP_DIR — so it is read back as-is, never joined to APP_DIR.
  const jsDir = join(out, '_expo', 'static', 'js', 'android');
  const bundles = readdirSync(jsDir).filter((f) => f.endsWith('.hbc') || f.endsWith('.js'));
  if (bundles.length === 0) throw new Error(`no bundle produced in ${jsDir} — the gate cannot measure nothing`);

  for (const file of bundles) {
    const bytes = readFileSync(join(jsDir, file), 'latin1');
    console.log(`  scanning ${file} (${bytes.length} bytes)`);

    // POSITIVE CONTROL FIRST — a gate that cannot demonstrate its own vision is not
    // evidence. Exits 2, a THIRD status distinct from both pass (0) and violation (1),
    // because "the scan is blind" is a different fact from "the adapter is present"
    // and must never be reported as either.
    if (!bytes.includes(POSITIVE_CONTROL.needle)) {
      console.error(`  ‼ POSITIVE CONTROL FAILED — « ${POSITIVE_CONTROL.needle} » not found in ${file}.`);
      console.error('    The scan cannot see a string that must be there, so every "absent" below would be');
      console.error('    vacuously true. This is NOT a demo-adapter violation — it means the gate went BLIND.');
      console.error('    Likely causes: the string encoding changed (see the UTF-16 note in this file), the');
      console.error('    bundler changed its output, or the write path was removed.');
      rmSync(out, { recursive: true, force: true });
      process.exit(2);
    }
    console.log(`  ✔ [CONTROL] ${POSITIVE_CONTROL.name} — « ${POSITIVE_CONTROL.needle} » found, the scan can see`);

    for (const { name, needle, loadBearing } of FINGERPRINTS) {
      const hit = bytes.includes(needle);
      const tag = loadBearing ? 'LOAD-BEARING' : 'secondary';
      if (hit && loadBearing) {
        failed = true;
        console.error(`  ✘ [${tag}] ${name} — « ${needle} » IS PRESENT in the shipped bundle`);
      } else if (hit) {
        console.error(`  ✘ [${tag}] ${name} — « ${needle} » is present`);
        failed = true;
      } else {
        console.log(`  ✔ [${tag}] ${name} — « ${needle} » absent`);
      }
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (failed) {
  console.error('\nno-demo-adapter-in-bundle: FAILED — a fallback that cannot fail is reachable in the published bundle.');
  process.exit(1);
}
console.log('\nno-demo-adapter-in-bundle: OK — the demo adapter is absent from the artifact, not merely unselected.');
