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
  | {
      readonly status: 'rejected';
      readonly reason:
        | 'not_a_read_model'
        | 'payload_not_contract_shaped'
        | 'identity_material_refused'
        /** SUPPLY-ID-MATCH-1 — the producer answered with a DIFFERENT product than the
         *  one asked for. See the substitution note on `consumeSupplyProjection`. */
        | 'product_mismatch';
    };

/** Sweep the raw value's keys for supplier identity/contact/pickup material (SP-I03). */
/** A phone number embedded in a free-text VALUE: ≥8 grouped digits, the shape
 *  of a Burkina number (« 70 12 34 56 », « +226 70123456 »). Deliberately NOT
 *  the IDENTITY_LEAK word-list, which matches « phone » — a value scan with it
 *  would refuse « Coque téléphone », a real product. Broader prose moderation
 *  (whatsapp, « appelez-moi », addresses) is Boutik+'s at authoring; this is the
 *  one high-signal content leak the consumer catches (audit D3). */
const CONTACT_NUMBER = /(?:\d[\s.\-]?){8,}/;

function hasIdentityLeak(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object') return false;
  const value = (raw as { value?: unknown }).value;
  if (value === null || typeof value !== 'object') return false;
  const entries = Object.entries(value as Record<string, unknown>);
  // 1) an identity-shaped KEY (supplierPhone, pickup, adresse …): the field leak.
  if (entries.some(([k]) => IDENTITY_LEAK.test(k))) return true;
  // 2) a phone number hidden in a free-text value (audit D3), fail closed.
  return entries.some(([, v]) => typeof v === 'string' && CONTACT_NUMBER.test(v));
}

/**
 * Consume one pulled read-model into a verdict. The pipeline is now the CANON
 * read-model kit (`consumeReadModel`, contracts v1.2.0), which reproduces the
 * former hand-rolled steps VERBATIM: absent → identity sweep (refused closed,
 * BEFORE parse) → strict envelope+value parse (classified `not_a_read_model` vs
 * `payload_not_contract_shaped` by `hasEnvelope`) → freshness (strictly beyond the
 * bound is stale, equality stays fresh). The freshness bound and the identity
 * sweep are OUR policy, passed as params — the kit homogenises neither.
 *
 * SUPPLY-ID-MATCH-1 — THE ANSWER MUST BE ABOUT THE PRODUCT THAT WAS ASKED FOR.
 * Until this check existed, `productVersionId` was passed to the port and then never
 * compared to what came back, so a producer answering `/supply-projection/X` with
 * product Y was accepted as `fresh`. That is a SILENT SUBSTITUTION on a money-adjacent
 * path: the buyer surface takes the PRICE from the listing (X's price) and the NAME +
 * PHOTOGRAPHS from supply (Y's) — so a buyer would see Y's product at X's price, with
 * nothing anywhere reporting a fault. Same family as the pid bug: an identity carried
 * on one side of a join and never checked against the other.
 *
 * The check is deliberately LAST, after freshness: a stale or malformed answer is
 * already refused, and reporting « wrong product » about an unparsed payload would be
 * a worse diagnosis than the one the earlier steps give.
 */
export function consumeSupplyProjection(
  port: SupplyProjectionPort,
  productVersionId: string,
  nowIso: string,
): SupplyVerdict {
  const verdict = consumeSupplyItem(port.readProjection(productVersionId), nowIso);
  if (verdict.status !== 'fresh') return verdict;
  // The producer answered about a different product than the one requested. Refused
  // CLOSED — never returned as `fresh`, so `canBackAgreement` blocks it and the
  // storefront join omits the product rather than describing it with another's name.
  if (verdict.projection.productVersionId !== productVersionId) {
    return { status: 'rejected', reason: 'product_mismatch' };
  }
  return verdict;
}

/**
 * BROWSE-COLLECTION entry point (BROWSE-SUPPLY-1) — consume ONE ALREADY-HELD
 * envelope, with no lookup and NO ID EXPECTATION.
 *
 * WHY IT EXISTS SEPARATELY, and it is not a convenience wrapper: the collection
 * (`GET /supply-projections`) answers `{ asOf, items: [{version, asOf, value}, …] }`,
 * and for a LIST the product id is genuinely NOT KNOWN IN ADVANCE — identity comes
 * from the parsed value. Reusing `consumeSupplyProjection` here would mean reading
 * `item.value.productVersionId` and passing it straight back in as the "expected"
 * id, which is CIRCULAR: the comparison could never fail, so it would look like a
 * check while verifying nothing. An honest function that does not claim the check is
 * better than a dishonest one that does.
 *
 * Everything else is byte-identical to the lookup path — same schema, same
 * 15-minute bound, same identity sweep — because it IS the same call.
 */
export function consumeSupplyItem(raw: unknown, nowIso: string): SupplyVerdict {
  const verdict = consumeReadModel(raw, {
    schema: SupplyReadModelSchema,
    maxAgeMs: SUPPLY_PROJECTION_MAX_AGE_MS,
    now: nowIso,
    leakSweep: hasIdentityLeak,
  });
  // Map the kit verdict onto SupplyVerdict — structurally identical, except `fresh`
  // names the parsed value `projection` (the SW-2 field name callers already read).
  // NO id comparison here, deliberately — see the header.
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
 *
 * SUPPLY-ID-MATCH-1 — WHY THIS CLASS MAKES THE UPSTREAM CHECK LOAD-BEARING: `put`
 * keys by `model.value.productVersionId`, the RETURNED id. So a substituted answer
 * would be cached under the wrong product and handed back on later reads — turning a
 * per-request fault into a PERSISTENT one. The defence is upstream, in
 * `consumeSupplyProjection`: a mismatch never reaches `fresh`, so it never reaches
 * here. NOTE (verified, not assumed): this cache currently has NO PRODUCTION CALLER —
 * it is referenced only by its own test — so today the exposure was per-request. The
 * moment it is wired, the upstream check is the only thing standing between a
 * mis-routed answer and a poisoned cache entry.
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
