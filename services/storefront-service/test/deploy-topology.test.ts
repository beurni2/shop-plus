import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * AUDIT E2 — THE UNGATED SECOND ENTRY POINT MUST NEVER BE THE DEPLOYED ARTIFACT.
 *
 * `src/index.ts` exports a COMPLETE Worker (`export default { fetch: handleRequest }`)
 * whose `handleRequest` serves `POST /media/upload` with NO auth: it is the inner
 * sub-router, written to run ONLY behind `worker/index.ts`, which gates every write
 * at its composition root (an ACTIVE reseller session, or one 401 — ACCES-ARME-2
 * retired the shared key) BEFORE delegating to `handleRequest`.
 * `combined-worker.e2e.test.ts` proves the deployed bundle refuses `/media/upload`
 * with 401 without a session — but that proof holds only while the deployed
 * artifact IS the gated router. Nothing behavioural stops a refactor from re-pointing the deploy
 * at `src/index.ts`, at which point media upload is unauthenticated in production.
 *
 * This test locks the deploy TOPOLOGY: the one deployed entry is the gated combined
 * bundle, built from `worker/index.ts`, and `src/index.ts` is never bundled as a
 * Worker artifact. It reads the REAL `wrangler.toml` and `package.json` — the two
 * files that, together with `wrangler deploy`, decide what ships. Its bound is the
 * deploy config only; the runtime gate itself is proven by the combined-worker e2e.
 */

const wrangler = readFileSync('wrangler.toml', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };
const scripts = pkg.scripts ?? {};

/** The one gated deploy artifact and the router it must be built from. */
const DEPLOYED_MAIN = 'dist/worker/worker.mjs';
const GATED_ENTRY = 'worker/index.ts';
const UNGATED_ENTRY = 'src/index.ts';

describe('deploy topology — the ungated src/index.ts is never the deployed artifact (audit E2)', () => {
  it('wrangler.toml main is the gated combined bundle, not a src/index.ts build', () => {
    const mainMatch = /^\s*main\s*=\s*"([^"]+)"/m.exec(wrangler);
    expect(mainMatch, 'wrangler.toml must declare a main entry').not.toBeNull();
    expect(mainMatch![1]).toBe(DEPLOYED_MAIN);
    // And main is never pointed straight at the ungated source, which wrangler
    // would happily bundle itself.
    expect(mainMatch![1]).not.toContain(UNGATED_ENTRY);
  });

  it('the script that builds the deployed bundle uses the gated router as its esbuild entry', () => {
    // Exactly one script emits the deployed main; find it by its outfile, not by
    // name, so renaming the script cannot slip the check.
    const builders = Object.entries(scripts).filter(
      ([, cmd]) => cmd.includes('esbuild') && cmd.includes(`--outfile=${DEPLOYED_MAIN}`),
    );
    expect(builders.length, `exactly one script must build ${DEPLOYED_MAIN}`).toBe(1);
    const [, cmd] = builders[0]!;
    // esbuild's entry is the first positional token after `esbuild`.
    const entry = cmd.split(/\s+/)[cmd.split(/\s+/).indexOf('esbuild') + 1];
    expect(entry).toBe(GATED_ENTRY);
    expect(cmd).not.toContain(UNGATED_ENTRY);
  });

  it('no package.json script bundles src/index.ts as a Worker (the ungated entry is never emitted)', () => {
    const offenders = Object.entries(scripts).filter(
      ([, cmd]) => /esbuild\s+src\/index\.ts\b/.test(cmd),
    );
    expect(offenders, `these scripts bundle the ungated ${UNGATED_ENTRY}: ${offenders.map(([n]) => n).join(', ')}`).toEqual([]);
  });
});
