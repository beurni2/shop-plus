import type { SupplyProjectionPort } from './consumer.js';

/**
 * THE CERTIFIED MOCK (Execution Contract §3) — the `readProjection` source that
 * backs SW-2's tests and demo. It returns raw read-model bytes in the SW-1↔SW-2
 * envelope shape `{ version, asOf, value }`, and it MISBEHAVES on demand: a stale
 * `asOf`, and a planted supplier-identity leak key — so the consumer's staleness
 * block and its identity sweep are exercised against real bad input, never hidden.
 * SW-1's real HTTP endpoint plugs into the same `SupplyProjectionPort` at
 * integration (a named final check, not this slice's gate).
 *
 * SUPPLY-DISPLAY-CONSUMER-1: canon v2.0.0 made the value SEVEN fields — the five
 * economics PLUS `productName` + `assetRefs`, both REQUIRED. The mock now emits
 * all seven; a five-field emission would fail the strict `.strict()` parse, which
 * is the point of the required-field bump.
 */
export interface MockSupplyConfig {
  readonly productVersionId: string;
  readonly offerVersion: string;
  /** B — supplier base price. */
  readonly basePrice: number;
  /** C — seller-funded reseller commission. */
  readonly resellerCommission: number;
  readonly available: number;
  /** The product's own display name — carried on the wire (SUPPLY-DISPLAY-FIELDS-1). */
  readonly productName: string;
  /** Bare display image refs. EMPTY is the honest normal case (the producer has no
   * image source yet, so `[]` is a true statement) — never a fabricated placeholder. */
  readonly assetRefs: readonly string[];
  /** The freshness clock — the consumer blocks when `now − asOf` exceeds the threshold. */
  readonly asOf: string;
  readonly version: number;
  /** Plant a supplier-identity leak key on the value (proves the sweep refuses it closed). */
  readonly plantLeakKey?: string;
}

export class MockSupplyProjectionSource implements SupplyProjectionPort {
  private readonly byId = new Map<string, MockSupplyConfig>();

  set(cfg: MockSupplyConfig): void {
    this.byId.set(cfg.productVersionId, cfg);
  }

  readProjection(productVersionId: string): unknown {
    const cfg = this.byId.get(productVersionId);
    if (cfg === undefined) return undefined;
    const value: Record<string, unknown> = {
      productVersionId: cfg.productVersionId,
      offerVersion: cfg.offerVersion,
      basePrice: cfg.basePrice,
      resellerCommission: cfg.resellerCommission,
      available: cfg.available,
      productName: cfg.productName,
      assetRefs: [...cfg.assetRefs],
    };
    if (cfg.plantLeakKey !== undefined) value[cfg.plantLeakKey] = '+226 70 00 00 00'; // a planted supplier phone
    return { version: cfg.version, asOf: cfg.asOf, value };
  }
}
