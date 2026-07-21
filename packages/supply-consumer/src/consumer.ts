import { consumeReadModel } from '@platform/contracts';
import {
  IDENTITY_LEAK,
  SUPPLY_PROJECTION_MAX_AGE_MS,
  SupplyReadModelSchema,
  type SupplyProjection,
  type SupplyReadModel,
} from './read-model.js';

/**
 * THE CONSUMER (SW-2). Pull a supply read-model through the PORT → parse the
 * envelope + the strict canon value → sweep identity-leak keys (reject closed) →
 * decide freshness against the founder threshold → a verdict the agreement /
 * listing flow reads. Mirrors SW-1's `consumeProjection` law: reject
 * non-contract payloads, sweep leak keys, keep the newest version. Never a silent
 * pass, never a fabricated freshness.
 */

/** The pull port: the mock backs tests/demo; SW-1's real HTTP endpoint plugs in here at integration. */
export interface SupplyProjectionPort {
  /** Returns the raw read-model bytes for a product version (unparsed) or undefined if unknown. */
  readProjection(productVersionId: string): unknown;
}

export type SupplyVerdict =
  | { readonly status: 'fresh'; readonly projection: SupplyProjection; readonly asOf: string; readonly version: number }
  | { readonly status: 'stale'; readonly asOf: string; readonly ageMs: number }
  | { readonly status: 'absent' }
  | { readonly status: 'rejected'; readonly reason: 'not_a_read_model' | 'payload_not_contract_shaped' | 'identity_material_refused' };

/** Sweep the raw value's keys for supplier identity/contact/pickup material (SP-I03). */
function hasIdentityLeak(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object') return false;
  const value = (raw as { value?: unknown }).value;
  if (value === null || typeof value !== 'object') return false;
  return Object.keys(value as object).some((k) => IDENTITY_LEAK.test(k));
}

/**
 * Consume one pulled read-model into a verdict. The pipeline is now the CANON
 * read-model kit (`consumeReadModel`, contracts v1.2.0), which reproduces the
 * former hand-rolled steps VERBATIM: absent → identity sweep (refused closed,
 * BEFORE parse) → strict envelope+value parse (classified `not_a_read_model` vs
 * `payload_not_contract_shaped` by `hasEnvelope`) → freshness (strictly beyond the
 * bound is stale, equality stays fresh). The freshness bound and the identity
 * sweep are OUR policy, passed as params — the kit homogenises neither.
 */
export function consumeSupplyProjection(
  port: SupplyProjectionPort,
  productVersionId: string,
  nowIso: string,
): SupplyVerdict {
  const raw = port.readProjection(productVersionId);
  const verdict = consumeReadModel(raw, {
    schema: SupplyReadModelSchema,
    maxAgeMs: SUPPLY_PROJECTION_MAX_AGE_MS,
    now: nowIso,
    leakSweep: hasIdentityLeak,
  });
  // Map the kit verdict onto SupplyVerdict — structurally identical, except `fresh`
  // names the parsed value `projection` (the SW-2 field name callers already read).
  return verdict.status === 'fresh'
    ? { status: 'fresh', projection: verdict.value, asOf: verdict.asOf, version: verdict.version }
    : verdict;
}

/**
 * STALE → BLOCK AGREEMENT (SP2 `Shop-Plus-Build-Spec:174`; SP1.1). ONLY a fresh
 * projection may back a commission agreement or a listing publish. Stale, absent,
 * and rejected verdicts block — the caller shows the honest « données périmées »
 * state, never a silent pass.
 */
export function canBackAgreement(verdict: SupplyVerdict): boolean {
  return verdict.status === 'fresh';
}

/**
 * A versioned local cache carrying `asOf` — keeps the NEWEST version per product
 * (a re-pull of an older/equal version never overwrites a newer one). Mirrors the
 * SW-1 dedup law; on the event path the same rule dedups on `command_id` (events
 * are not built here — transport B is pull, no bus).
 */
export class SupplyProjectionCache {
  private readonly byProduct = new Map<string, SupplyReadModel>();

  /** Upsert a validated read-model; returns true if it advanced the cached version. */
  put(model: SupplyReadModel): boolean {
    const existing = this.byProduct.get(model.value.productVersionId);
    if (existing !== undefined && existing.version >= model.version) return false;
    this.byProduct.set(model.value.productVersionId, model);
    return true;
  }

  get(productVersionId: string): SupplyReadModel | undefined {
    return this.byProduct.get(productVersionId);
  }
}
