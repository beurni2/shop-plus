/**
 * SERVICE-PROVENANCE-1 — the DEPLOY-FRESHNESS STAMP (mirrored from boutik-plus,
 * whose reasoning is kept verbatim below because it is the part that matters).
 *
 * WHY THIS EXISTS (a real defect, four times in one session): the workspace
 * override/bump laws enforce lockstep ACROSS REPOS AT MERGE TIME. Nothing covered
 * drift between a MERGED repo and its DEPLOYED ARTIFACT, and the two are
 * independently versioned. In boutik the live offer-service was found still
 * emitting the five-field SupplyProjection while canon, its repo and shop-plus's
 * consumer were all at 2.0.0. In shop-plus the live storefront-service was found
 * still predating LISTING-READ-GATE-1 — an economics leak closed in the repo and
 * open in production. BOTH were caught only by reading the deployed bundle out of
 * the Cloudflare API by hand, and shop-plus was the last repo that still required
 * that.
 *
 * WHY BOTH FIELDS, AND WHY `canon` IS THE ONE THAT MATTERS: `release` (the git
 * sha) says WHICH BUILD is running. `canon` (the pinned @platform/contracts
 * version) says WHICH WIRE SHAPE it speaks. **A sha alone would NOT have caught
 * the boutik defect** — it would have shown an unfamiliar hash and told nobody the
 * wire shape was stale. `canon` makes the skew legible without a lookup.
 *
 * HOW THE VALUES ARRIVE: injected at BUNDLE time by esbuild `--define`, from the
 * deploy workflow (`SHOP_RELEASE` = the commit sha, `SHOP_CANON` = the version
 * read out of the INSTALLED package, never a hand-typed constant, so it cannot
 * drift from what was actually bundled). Bare identifiers with a `typeof` guard,
 * because that is exactly what `--define` substitutes; anywhere the define did not
 * run (local dev, CI tests, an unbundled import) `typeof` on an undeclared
 * identifier is safe and both fall back to `UNSTAMPED`.
 *
 * HONEST LIMITS — this is a STAMP, NOT A GUARANTEE:
 *   · It reports what the bundle was BUILT FROM. It detects staleness and version
 *     skew; it cannot detect a bundle altered after build.
 *   · It cannot fire on its own. Something — a person or a scheduled check — must
 *     READ it. It closes the "nobody could tell" half of the problem, not the
 *     "nobody looked" half.
 *   · `dev` is not a failure: it is the honest answer for any build the deploy
 *     workflow did not stamp.
 */

// Ambient: substituted by esbuild `--define` at bundle time; absent otherwise.
declare const __SHOP_RELEASE__: string | undefined;
declare const __SHOP_CANON__: string | undefined;

/** The value both fields carry when the deploy workflow did not stamp the build. */
export const UNSTAMPED = 'dev';

export interface Provenance {
  /** The git commit sha this bundle was built from — WHICH BUILD is running. */
  readonly release: string;
  /** The pinned @platform/contracts version — WHICH WIRE SHAPE it speaks. */
  readonly canon: string;
}

/** Read the build-time stamp, falling back to `dev` when unstamped. */
export function provenance(): Provenance {
  return {
    release: typeof __SHOP_RELEASE__ !== 'undefined' ? __SHOP_RELEASE__ : UNSTAMPED,
    canon: typeof __SHOP_CANON__ !== 'undefined' ? __SHOP_CANON__ : UNSTAMPED,
  };
}
