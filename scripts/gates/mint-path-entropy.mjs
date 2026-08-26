#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CI gate: mint-path-entropy (RESELLER-IDENTITY-1) — INHERITED from canon (WO-5.9,
 * founder ruling 2026-07-13, "every repo inherits") and adapted, because a byte-for-byte
 * port of boutik's would have caught NOTHING here.
 *
 * THE INVARIANT: no identity or command_id mint path may draw from `Math.random`. It
 * carries only its SEED's entropy — unproven on a cold-booted Android-Go device — so two
 * mints can collide into one idempotency key. Only the OS CSPRNG is acceptable.
 *
 * WHY THIS EXISTS AT ALL: shop-plus had no such gate, which is why `App.tsx` minted the
 * reseller's identity with `Math.random` and shipped. The founder found it on a real
 * preview walk — his slug moved between sessions (`aichomod-8291` → `chezaichamod-4911`)
 * and, far worse, `resellerId` moved with it, making him a different reseller each launch.
 *
 * ── WHY NOT A COPY OF BOUTIK'S GATE ──────────────────────────────────────────────────
 * Boutik's collects files matching `(command-id|commandId)*.{ts,mjs,js}` and exits 0 with
 * "no mint path present in this repo" when nothing matches. Shop's mint lived in a
 * 1 500-line `App.tsx`, which matches no such pattern — so the ported gate would have
 * printed OK and caught the very defect that shipped. **A VACUOUS PASS IS WORSE THAN NO
 * GATE, because it reads as coverage.** Hence: an EXPLICIT, NAMED file list, and a hard
 * failure if any named file is missing (a rename cannot silently empty this gate).
 *
 * ── WHY NOT A BUNDLE SCAN, THOUGH THAT SHAPE IS STRONGER ELSEWHERE ───────────────────
 * `no-demo-adapter-in-bundle.mjs` measures the real Hermes artifact, and the instinct was
 * to add `Math.random` as a second fingerprint on that same export. **MEASURED, AND IT
 * CANNOT WORK.** With `Math.random()` deliberately planted in `App.tsx` and the bundle
 * re-exported, the artifact was byte-indistinguishable from the clean one:
 *
 *              CLEAN BUNDLE      WITH THE DEFECT PLANTED
 *   Math.random      0                    0
 *   random           1                    1
 *   Math             1                    1
 *
 * Hermes compiles `Math.random()` into a global lookup plus a property access, so the
 * literal `Math.random` never exists as a contiguous string, and `Math` / `random` each
 * appear ONCE in the string table no matter how many call sites there are. Presence and
 * count are both uninformative. A bundle scan here would not be noisy — it would be
 * BLIND, always green, asserting nothing. So the source scan is the load-bearing one for
 * THIS property, while the artifact scan stays load-bearing for module ABSENCE.
 *
 * ── WHY A NAMED LIST RATHER THAN A REPO-WIDE SWEEP ───────────────────────────────────
 * A blanket `Math.random` ban across all source would flag `apps/buyer-pwa/src/cliente/
 * flow.ts` (`Date.now() + Math.random()` for a TOAST id — a UI list key, not an
 * idempotency key, and not a mint path). That is exactly the noisy gate the founder
 * ruled against: one people learn to ignore. Scope is the mint paths, named.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The mint paths, NAMED. Add a file here the moment it mints an id that must be unique
 * or idempotent. Every entry must exist — see the vacuous-pass reasoning above.
 */
const MINT_PATHS = [
  'apps/reseller-app/src/identity/mint.ts',
  'apps/reseller-app/src/identity/store.ts',
  'apps/reseller-app/src/identity/expoStore.ts',
  // The app entry is named explicitly because this is where the defect actually lived,
  // and no filename convention would ever have matched it.
  'apps/reseller-app/App.tsx',
  // SP3.2b — the BUYER'S two idempotency tokens are minted here: the checkout
  // `requestKey` (one key ⇒ one quote, forever) and the reservation `commandId`.
  // Named the moment they existed, per this list's own rule above.
  'apps/buyer-pwa/src/cliente/quote-port.ts',
  // LISTE-ENVIES-1 — the wishlist's share token and edit key (192-bit, the
  // mintBuyerRef pattern) are minted here; the PWA's offline harness mints
  // the same shapes in liste.ts. Named the moment they existed.
  'services/storefront-service/worker/wishlist-do.ts',
  'apps/buyer-pwa/src/vitrine/liste.ts',
];

/** A CSPRNG token — at least one must appear across the mint paths, so an empty or
 *  gutted set cannot pass vacuously the way boutik's no-files branch would. */
const CSPRNG = /getRandomBytes|getRandomValues|randomUUID/;

/** Scan CODE, not prose: these files legitimately NAME `Math.random` as the forbidden
 *  thing, and a comment documenting the rule is not a violation of it. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

let failed = false;
let csprngSeen = false;

for (const rel of MINT_PATHS) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    console.error(`  ✘ NAMED MINT PATH MISSING: ${rel}`);
    console.error('    A renamed or deleted mint path must fail loudly — silently scanning');
    console.error('    nothing is how the ported gate would have missed the original defect.');
    failed = true;
    continue;
  }
  const code = stripComments(readFileSync(abs, 'utf8'));
  if (/Math\.random/.test(code)) {
    console.error(`  ✘ ${rel} — Math.random in a MINT PATH (only the OS CSPRNG is acceptable)`);
    failed = true;
  } else {
    console.log(`  ✔ ${rel} — no Math.random`);
  }
  if (CSPRNG.test(code)) csprngSeen = true;
}

if (!csprngSeen) {
  console.error('  ✘ NO CSPRNG DRAW found across the mint paths — the gate would be vacuous.');
  console.error('    At least one named file must actually draw from the OS CSPRNG');
  console.error('    (getRandomBytes / getRandomValues / randomUUID).');
  failed = true;
} else {
  console.log('  ✔ a real CSPRNG draw is present — the gate is not asserting over an empty set');
}

if (failed) {
  console.error('\nmint-path-entropy: FAILED');
  process.exit(1);
}
console.log('\nmint-path-entropy: OK — every named mint path draws from the OS CSPRNG, none from Math.random.');
