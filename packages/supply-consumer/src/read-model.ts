import { makeReadModelSchema, SupplyProjectionSchema, type SupplyProjection } from '@platform/contracts';
import { z } from 'zod';

/**
 * SUPPLY-CONSUMER (SW-2) — the Shop+ side of the supply read-model, transport B
 * (HTTP read-model PULL; staleness blocks agreement). The shared meeting point
 * with SW-1 (boutik-plus offer-service): the read-model envelope
 * `{ version, asOf, value }`, where `value` is the canon strict five-field
 * `SupplyProjectionSchema` (consumed VERBATIM — never redefined). Canon carries
 * the value shape; the envelope is the SW-1↔SW-2 agreed contract (canon has no
 * read-model wrapper), mirroring SW-1's `ProjectionRead`.
 *
 * The freshness threshold is a FOUNDER DECISION (canon/specs were silent — SP2
 * `Shop-Plus-Build-Spec:174` and SP1.1 `Building-Plan:43` state "stale → block
 * agreement" with no number). Founder ruling (2026-07-15): **15 minutes**, aligned
 * with the quote TTL. Journaled; do not change without a founder ruling.
 */
export const SUPPLY_PROJECTION_MAX_AGE_MS = 15 * 60 * 1000; // founder ruling 2026-07-15 (= QUOTE_TTL_MS)

/**
 * The identity-leak sweep, mirrored VERBATIM from SW-1's consumer law
 * (`shop-projection-consumer-mock.ts:23`): a projection bearing supplier
 * identity/contact or pickup material is refused closed (SP-I03).
 */
export const IDENTITY_LEAK = /supplier[_-]?(id|name|phone|contact)|phone|whatsapp|pickup|adresse|address/i;

/**
 * The SW-1↔SW-2 read-model envelope — now the CANON read-model kit's
 * `makeReadModelSchema` (contracts v1.2.0), applied to the strict canon value.
 * The kit was extracted VERBATIM from this exact hand-rolled schema (`{version,
 * asOf, value}.strict()`, `version` int ≥ 1, `asOf` via `IsoTimestampSchema`), so
 * the envelope is byte-equivalent — it is no longer redefined here, it is the one
 * canon envelope. The freshness bound and the identity sweep above stay OUR policy
 * (passed to the kit as params); the kit ships neither.
 */
export const SupplyReadModelSchema = makeReadModelSchema(SupplyProjectionSchema);
export type SupplyReadModel = z.infer<typeof SupplyReadModelSchema>;

export type { SupplyProjection };
