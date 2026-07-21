import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeWaterfall,
  makeReadModelSchema,
  consumeReadModel,
  SupplyProjectionSchema,
  type WaterfallInput,
  type WaterfallResult,
} from '@platform/contracts';
import { IDENTITY_LEAK } from '../src/read-model.js';
import {
  MockSupplyProjectionSource,
  SUPPLY_PROJECTION_MAX_AGE_MS,
  SupplyProjectionCache,
  SupplyReadModelSchema,
  canBackAgreement,
  consumeSupplyProjection,
  opportunityMoneyFromSupply,
} from '../src/index.js';

/**
 * SW-2 — the four RED-first fixtures: stale-blocks-agreement ·
 * live-equals-seed-reconciliation · leak-key-swept · fresh-pull-unblocks. The
 * freshness threshold is the founder's 15 minutes.
 */

const NOW = '2026-07-14T12:00:00.000Z';
const minutesAgo = (m: number, extraMs = 0): string => new Date(Date.parse(NOW) - m * 60_000 - extraMs).toISOString();

function freshSource(): MockSupplyProjectionSource {
  const src = new MockSupplyProjectionSource();
  src.set({ productVersionId: 'pv_1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4, asOf: minutesAgo(5), version: 2 });
  return src;
}

describe('consumeSupplyProjection — pull, parse, sweep, freshness', () => {
  it('FRESH-PULL-UNBLOCKS: a projection within 15 min is fresh and CAN back an agreement', () => {
    const verdict = consumeSupplyProjection(freshSource(), 'pv_1', NOW);
    expect(verdict.status).toBe('fresh');
    if (verdict.status === 'fresh') {
      expect(verdict.projection.basePrice).toBe(8_000);
      expect(verdict.projection.resellerCommission).toBe(800);
    }
    expect(canBackAgreement(verdict)).toBe(true);
  });

  it('the freshness boundary is exact: age == 15 min is fresh; one ms past is stale', () => {
    const atBoundary = new MockSupplyProjectionSource();
    atBoundary.set({ productVersionId: 'pv_1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4, asOf: minutesAgo(15), version: 1 });
    expect(consumeSupplyProjection(atBoundary, 'pv_1', NOW).status).toBe('fresh'); // == threshold, not over

    const justPast = new MockSupplyProjectionSource();
    justPast.set({ productVersionId: 'pv_1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4, asOf: minutesAgo(15, 1), version: 1 });
    expect(consumeSupplyProjection(justPast, 'pv_1', NOW).status).toBe('stale');
    expect(SUPPLY_PROJECTION_MAX_AGE_MS).toBe(15 * 60 * 1000); // founder ruling, pinned
  });

  it('STALE-BLOCKS-AGREEMENT: a projection older than 15 min is stale and CANNOT back an agreement', () => {
    const stale = new MockSupplyProjectionSource();
    stale.set({ productVersionId: 'pv_1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4, asOf: minutesAgo(16), version: 1 });
    const verdict = consumeSupplyProjection(stale, 'pv_1', NOW);
    expect(verdict.status).toBe('stale');
    expect(canBackAgreement(verdict)).toBe(false); // the block — never a silent pass
  });

  it('LEAK-KEY-SWEPT: a projection carrying a planted supplierPhone is REFUSED closed at the consumer (SP-I03)', () => {
    const leaky = new MockSupplyProjectionSource();
    leaky.set({ productVersionId: 'pv_1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4, asOf: minutesAgo(1), version: 2, plantLeakKey: 'supplierPhone' });
    const verdict = consumeSupplyProjection(leaky, 'pv_1', NOW);
    expect(verdict.status).toBe('rejected');
    if (verdict.status === 'rejected') expect(verdict.reason).toBe('identity_material_refused');
    expect(canBackAgreement(verdict)).toBe(false);
    // the strict envelope ALSO rejects the extra key — the sweep is the named second line
    expect(SupplyReadModelSchema.safeParse({ version: 2, asOf: minutesAgo(1), value: { productVersionId: 'pv_1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4, supplierPhone: 'x' } }).success).toBe(false);
  });

  it('a non-contract payload and an absent product are both refused / absent (never a silent pass)', () => {
    const src = new MockSupplyProjectionSource();
    expect(consumeSupplyProjection(src, 'pv_unknown', NOW).status).toBe('absent');
    const bad: { readProjection: () => unknown } = { readProjection: () => ({ nope: true }) };
    expect(consumeSupplyProjection(bad, 'pv_1', NOW).status).toBe('rejected');
  });
});

describe('DRIFT-GUARD (canon verifier N2 carry-forward) — supply-consumer consumes the CANON read-model kit, enforced by CI', () => {
  it('read-model.ts builds the canon envelope; consumer.ts consumes the canon kit and re-inlines nothing (source-bound)', () => {
    const rmSrc = readFileSync(join(import.meta.dirname, '../src/read-model.ts'), 'utf8');
    const consumerSrc = readFileSync(join(import.meta.dirname, '../src/consumer.ts'), 'utf8');
    // the envelope is the canon kit's, applied to the canon value — not re-defined
    expect(rmSrc).toMatch(/export const SupplyReadModelSchema = makeReadModelSchema\(SupplyProjectionSchema\)/);
    expect(rmSrc).toMatch(/from ['"]@platform\/contracts['"]/);
    // the consumer routes through the canon consume pipeline
    expect(consumerSrc).toMatch(/import \{ consumeReadModel \} from ['"]@platform\/contracts['"]/);
    expect(consumerSrc).toMatch(/\bconsumeReadModel\(raw, \{/);
    // and it must NOT hand-roll the pipeline it delegated (no re-inlined envelope parse)
    expect(consumerSrc).not.toMatch(/SupplyReadModelSchema\.safeParse/);
  });

  it('the local envelope IS the canon envelope — identical accept/reject across the battery', () => {
    const canon = makeReadModelSchema(SupplyProjectionSchema);
    const value = { productVersionId: 'pv_1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4 };
    const battery: unknown[] = [
      { version: 2, asOf: minutesAgo(1), value }, // valid
      { version: 2, asOf: minutesAgo(1), value: { ...value, supplierPhone: 'x' } }, // extra value key → strict reject
      { version: 0, asOf: minutesAgo(1), value }, // version < 1
      { version: 2, asOf: minutesAgo(1), value, extra: 1 }, // extra envelope key → strict reject
      { nope: true },
      null,
    ];
    for (const input of battery) {
      expect(SupplyReadModelSchema.safeParse(input).success).toBe(canon.safeParse(input).success);
    }
  });

  it('consumeSupplyProjection returns exactly the canon kit verdict on the same input (routes through it, no drift)', () => {
    const sweep = (raw: unknown): boolean => {
      const v = (raw as { value?: unknown } | null)?.value;
      return v !== null && typeof v === 'object' && Object.keys(v).some((k) => IDENTITY_LEAK.test(k));
    };
    const value = { productVersionId: 'pv_1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4 };
    const cases: unknown[] = [
      { version: 2, asOf: minutesAgo(5), value }, // fresh
      { version: 1, asOf: minutesAgo(16), value }, // stale
      { version: 2, asOf: minutesAgo(1), value: { ...value, supplierPhone: 'x' } }, // leak → rejected
      { version: 2, asOf: minutesAgo(1), value: { nope: true } }, // envelope ok, value not contract → payload_not_contract_shaped
      { nope: true }, // not_a_read_model
      undefined, // absent
    ];
    for (const raw of cases) {
      const consumerVerdict = consumeSupplyProjection({ readProjection: () => raw }, 'pv_1', NOW);
      const kitVerdict = consumeReadModel(raw, { schema: makeReadModelSchema(SupplyProjectionSchema), maxAgeMs: SUPPLY_PROJECTION_MAX_AGE_MS, now: NOW, leakSweep: sweep });
      // `fresh` maps value→projection; every other verdict is byte-identical to the kit's
      const expected = kitVerdict.status === 'fresh'
        ? { status: 'fresh', projection: kitVerdict.value, asOf: kitVerdict.asOf, version: kitVerdict.version }
        : kitVerdict;
      expect(consumerVerdict).toEqual(expected);
    }
  });
});

describe('SupplyProjectionCache — versioned, keeps the newest', () => {
  it('a re-pull of an older/equal version never overwrites a newer one', () => {
    const cache = new SupplyProjectionCache();
    const v2 = SupplyReadModelSchema.parse({ version: 2, asOf: minutesAgo(1), value: { productVersionId: 'pv_1', offerVersion: '1', basePrice: 8_000, resellerCommission: 800, available: 4 } });
    const v1 = SupplyReadModelSchema.parse({ version: 1, asOf: minutesAgo(30), value: { productVersionId: 'pv_1', offerVersion: '1', basePrice: 9_999, resellerCommission: 999, available: 9 } });
    expect(cache.put(v2)).toBe(true);
    expect(cache.put(v1)).toBe(false); // older version does not advance
    expect(cache.get('pv_1')?.version).toBe(2);
    expect(cache.get('pv_1')?.value.basePrice).toBe(8_000);
  });
});

describe('LIVE-EQUALS-SEED-RECONCILIATION — the seed retires without money drift', () => {
  interface SeedOpp { readonly id: string; readonly input: WaterfallInput; readonly money: WaterfallResult }
  const seed = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../apps/reseller-app/src/demo/seed.json'), 'utf8'),
  ) as { opportunities: readonly SeedOpp[] };

  it('every seed opportunity is reproduced BYTE-FOR-BYTE from a live projection carrying the same B, C', () => {
    expect(seed.opportunities.length).toBeGreaterThan(0);
    for (const opp of seed.opportunities) {
      // a live read-model carrying the seed's B (basePrice) and C (resellerCommission)
      const src = new MockSupplyProjectionSource();
      src.set({
        productVersionId: `pv_${opp.id}`,
        offerVersion: '1',
        basePrice: opp.input.sellerBasePrice,
        resellerCommission: opp.input.sellerFundedCommission,
        available: 4,
        asOf: minutesAgo(1),
        version: 1,
      });
      const verdict = consumeSupplyProjection(src, `pv_${opp.id}`, NOW);
      expect(verdict.status).toBe('fresh');
      if (verdict.status !== 'fresh') continue;
      // the reseller's M and Séra's D are the same as the seed's — same waterfall lines
      const money = opportunityMoneyFromSupply(verdict.projection, {
        resellerMarkup: opp.input.resellerMarkup,
        deliveryFee: opp.input.deliveryFee,
        paymentMode: opp.input.paymentMode,
      });
      // byte-for-byte identical to the seed's money (which the demo-store test proves is waterfall-derived)
      expect(money).toEqual(opp.money);
      // and identical to a direct recompute of the seed input (the reconciliation anchor)
      expect(money).toEqual(computeWaterfall(opp.input));
    }
  });
});
