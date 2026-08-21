import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * STALE-BUNDLE FOOTGUN (audit follow-up) — the miniflare e2e suites load a
 * PRE-BUILT `dist/worker/*.mjs`, but the build lived only in the `pretest`
 * lifecycle hook, which fires on `pnpm test` and NOT on `npx vitest run` /
 * `vitest`. Running vitest directly therefore tested a STALE (or missing) bundle
 * — a source change to `worker/*.ts` was invisible, so an e2e could pass green
 * over code that no longer exists (or fail confusingly on a missing file).
 *
 * A vitest `globalSetup` runs once before the suite on EVERY invocation path, so
 * the bundle is rebuilt regardless of how the tests were launched. It runs the
 * three committed bundle scripts verbatim (single source of the esbuild flags and
 * the shell env defaults), so there is nothing to drift from.
 */
export default function build(): void {
  const serviceDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  execSync('pnpm run bundle:worker && pnpm run bundle:worker:listing && pnpm run bundle:worker:combined', {
    cwd: serviceDir,
    stdio: 'inherit',
  });
}
