/**
 * RESELLER-IDENTITY-1 — the reseller's DEVICE-STORED identity, minted ONCE.
 *
 * THE DEFECT THIS REPLACES (found by the founder on a real preview walk): `App.tsx`
 * minted `digits` with `Math.random` inside a `useMemo`, so the identity was stable
 * per SESSION and fresh on every restart and every preview republish. His first shop
 * was `aichomod-8291`; the next walk produced `chezaichamod-4911`. Two consequences,
 * and the second is the one that matters:
 *   1. A new storefront per session, accumulating forever. Untidy.
 *   2. **`resellerId` was regenerated too** (`rs-{digits}`), so HE WAS A DIFFERENT
 *      RESELLER EVERY SESSION. Storefronts were not linked to one person, and a
 *      returning reseller had no way back to the shop she made yesterday. A listing
 *      carries `resellerId`, so no browse-or-list flow can be honest on top of that.
 *
 * WHY `Math.random` IS FORBIDDEN IN A MINT PATH (canon WO-5.9, inherited by every
 * repo): it carries only its SEED's entropy, unproven on a cold-booted Android-Go
 * device, so two mints can collide into one idempotency key. This module draws from
 * the OS CSPRNG and NEVER falls back — no `Math.random` shim, ever.
 *
 * THE MECHANISM DETAIL THAT MAKES PERSISTENCE SUFFICIENT (journal this before
 * anyone "tidies" it): `commandId` is DERIVED from the id (`create-${id}`), not
 * independently random. `decideCreate` (storefront-core.ts:122-126) returns
 * `idempotent` only when the incoming commandId MATCHES the stored one and returns
 * **`collision`** otherwise. So persisting one value makes the id AND the command id
 * deterministic, and a re-tap resolves to `idempotent`. **The obvious hygiene
 * refactor — making `commandId` independently random — would break re-tap on every
 * restart, turning every second launch into a collision.**
 *
 * ENTROPY, STATED HONESTLY: `digits` is FOUR digits because the canon shortCode shape
 * is `[A-Z]{2,12}-[0-9]{4}` (service-side validated) — 9 000 values, which is thin as
 * a global uniqueness key. It is adequate here ONLY because the founder is the sole
 * reseller; real per-reseller identity is a HARD GATE before anyone else onboards,
 * the same gate already standing on the shared write key.
 */

/** The reseller's stable identity — minted once, persisted, never recomputed. */
export interface ResellerIdentity {
  /** The 4-digit suffix the canon shortCode shape requires. */
  readonly digits: string;
  /** `sf-{digits}` — the storefront aggregate id. */
  readonly storefrontId: string;
  /** `rs-{digits}` — WHO SHE IS. Regenerating this made him a new person each session. */
  readonly resellerId: string;
  /** `create-sf-{digits}` — DERIVED, never independently random. See the header. */
  readonly commandId: string;
  /** `corr-sf-{digits}`. */
  readonly correlationId: string;
}

/** The storage schema version — a future shape change must not silently misread. */
export const IDENTITY_VERSION = 1;

export interface StoredIdentity {
  readonly version: number;
  readonly digits: string;
}

/**
 * Derive the whole identity from its one persisted value. Pure and total: the same
 * digits always produce the same ids, which is exactly why a re-tap is idempotent.
 */
export function identityFromDigits(digits: string): ResellerIdentity {
  const storefrontId = `sf-${digits}`;
  return {
    digits,
    storefrontId,
    resellerId: `rs-${digits}`,
    commandId: `create-${storefrontId}`,
    correlationId: `corr-${storefrontId}`,
  };
}

/**
 * Turn CSPRNG bytes into the 4 digits, with NO modulo bias: 10 000 does not divide
 * 2^16, so the naive `value % 10000` would favour low values. Rejection sampling
 * walks the byte pairs and takes the first that lands in the unbiased range; the
 * caller supplies enough bytes that exhaustion is negligible, and exhaustion THROWS
 * rather than silently degrading to a biased value.
 *
 * Deterministic given its bytes — so the test asserts the mapping and the bias
 * rejection directly, without mocking a CSPRNG.
 */
export function digitsFromBytes(bytes: Uint8Array): string {
  const LIMIT = 65536 - (65536 % 10000); // 60000 — the unbiased ceiling
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const value = (bytes[i]! << 8) | bytes[i + 1]!;
    if (value < LIMIT) return String(value % 10000).padStart(4, '0');
  }
  throw new Error('identity_mint_exhausted');
}
