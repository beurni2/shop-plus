/**
 * WHAT SHE READS WHEN A PHOTO DOES NOT ARRIVE — one pure function, so it can be
 * TESTED rather than described.
 *
 * MEDIA-2 round 3, and this module exists because of a failure I own twice over:
 *
 * 1. The mapping lived inline in `screens.tsx`, where the only tests that could
 *    reach it were `readFileSync` + `toContain` on the source text. A verifier
 *    scrambled EVERY arm of the map — offline → « trop lourde », too_large →
 *    « publiez votre boutique » — and all four of those tests stayed green. They
 *    asserted that two strings existed somewhere in a file, never that they
 *    belonged to each other. That is exactly failure mode #7: a test that passes
 *    without asserting the invariant it claims to protect.
 * 2. The map itself was incomplete. `storefront_absent`, `not_pointed`,
 *    `storefront_unreachable`, `unauthorized`, `empty`, `bad_request` and every
 *    5xx fell through to « Essayez une image plus légère » — the precise sentence
 *    the previous round's commit message claimed to have stopped saying. When her
 *    storefront id is absent on the service, NO photo of ANY weight can succeed,
 *    and she was being told to compress and try again, forever.
 *
 * The rule this encodes: **never prescribe a remedy the reason does not support.**
 * Weight advice belongs to `too_large` alone. A service fault says it is a service
 * fault — she did nothing wrong and there is nothing for her to fix.
 */

/** The catalog keys for one failure: a title she scans and a body she acts on. */
export interface UploadFailureCopy {
  readonly title: string;
  readonly body: string;
}

/** « Photo pas envoyée » — true for every failure EXCEPT the one where it did send. */
const TITLE_NOT_SENT = 'k.cover.err_titre';
/** The upload succeeded and only the confirming read did not come back. */
const TITLE_SENT = 'k.cover.err_titre_envoyee';

/**
 * Every reason the app or the service can produce, mapped to what is TRUE of it.
 *
 * Service-side reasons come from `storefront-service`: `RejectReason` (`empty`,
 * `unsupported_type`, `too_large`, `bad_dimensions`) plus the request and pointer
 * failures (`bad_request`, `storefront_absent`, `storefront_unreachable`,
 * `not_pointed`) and the write gate (`unauthorized`). App-side reasons come from
 * the upload seam (`offline`, `unconfigured`, `not_live`, `not_confirmed`).
 */
const BODY_BY_REASON: Readonly<Record<string, string>> = {
  // ── her side, actionable ────────────────────────────────────────────────────
  too_large: 'k.cover.trop_lourde',
  bad_dimensions: 'k.cover.mauvaise_taille',
  unsupported_type: 'k.cover.mauvaise_taille',
  empty: 'k.cover.illisible',
  // ── her situation, actionable but not about the photo ───────────────────────
  offline: 'k.cover.hors_ligne',
  not_live: 'k.cover.pas_encore',
  unconfigured: 'k.cover.pas_configuree',
  // ── it worked; only the confirmation did not ────────────────────────────────
  not_confirmed: 'k.cover.non_confirmee',
  // ── our side. NOT her fault, and nothing she can do to the photo helps ──────
  bad_request: 'k.cover.service',
  storefront_absent: 'k.cover.service',
  storefront_unreachable: 'k.cover.service',
  not_pointed: 'k.cover.service',
  unauthorized: 'k.cover.service',
};

/**
 * An unrecognised reason — a new service error, an `http_500` — is a SERVICE
 * fault as far as she is concerned. The default must therefore be the blameless
 * sentence, never the weight advice: an unknown cause is not evidence that her
 * photo is too heavy, and guessing wrong sends her to do work that cannot help.
 */
const BODY_UNKNOWN = 'k.cover.service';

export function uploadFailureCopy(reason?: string): UploadFailureCopy {
  const body = (reason !== undefined ? BODY_BY_REASON[reason] : undefined) ?? BODY_UNKNOWN;
  return { title: reason === 'not_confirmed' ? TITLE_SENT : TITLE_NOT_SENT, body };
}

/** The reasons this module knows by name — exported so a test can prove the set
 *  matches what the service can actually emit, rather than trusting this list. */
export const KNOWN_UPLOAD_REASONS: readonly string[] = Object.keys(BODY_BY_REASON);
