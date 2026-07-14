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
 * Consume one pulled read-model into a verdict. The strict envelope+value schema
 * rejects any non-contract payload (a planted `supplierPhone` fails `.strict()`);
 * the explicit identity sweep is the second, named line of defence.
 */
export function consumeSupplyProjection(
  port: SupplyProjectionPort,
  productVersionId: string,
  nowIso: string,
): SupplyVerdict {
  const raw = port.readProjection(productVersionId);
  if (raw === undefined || raw === null) return { status: 'absent' };

  // Identity sweep FIRST — an identity leak is refused closed, never merely dropped.
  if (hasIdentityLeak(raw)) return { status: 'rejected', reason: 'identity_material_refused' };

  const parsed = SupplyReadModelSchema.safeParse(raw);
  if (!parsed.success) {
    // distinguish "not a read-model envelope" from "value not the contract shape"
    const hasEnvelope =
      typeof raw === 'object' && raw !== null && 'version' in raw && 'asOf' in raw && 'value' in raw;
    return { status: 'rejected', reason: hasEnvelope ? 'payload_not_contract_shaped' : 'not_a_read_model' };
  }
  const model: SupplyReadModel = parsed.data;

  const ageMs = Date.parse(nowIso) - Date.parse(model.asOf);
  if (ageMs > SUPPLY_PROJECTION_MAX_AGE_MS) {
    return { status: 'stale', asOf: model.asOf, ageMs };
  }
  return { status: 'fresh', projection: model.value, asOf: model.asOf, version: model.version };
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
