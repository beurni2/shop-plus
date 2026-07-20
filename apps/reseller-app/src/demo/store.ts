import type { WaterfallInput, WaterfallResult } from '@platform/contracts';
import { buildOpportunityCard, type OpportunityCardModel } from '../earnings';
import rawSeed from './seed.json';

/**
 * WO-4.1 demo world — in-memory, seeded, honest. Every franc on every demo
 * screen derives from the PINNED waterfall: seed.json is generated THROUGH
 * `computeWaterfall` (never typed by hand), the demo-store test recomputes
 * every seed via the pinned package and requires byte equality + real
 * `assertQuoteReconciles`, and this module refuses at load any snapshot that
 * breaks the §5.4 identities — a tampered seed cannot enter the world, demo
 * or not. The snapshot architecture (not a runtime contracts import) is the
 * repo law: the RN bundle must not import the @platform/contracts barrel
 * (node-only drift-check modules do not bundle under Metro) — same pattern
 * as src/opportunity-example.json. Seeds are deep-frozen and obviously
 * fictional — « (démo) » on every name — so demo data can never pass for
 * real user data.
 */

export interface DemoOpportunity {
  readonly id: string;
  /** Seed data, not UI chrome — obviously fictional French demo content. */
  readonly name: string;
  readonly landmark: string;
  readonly input: WaterfallInput;
  readonly money: WaterfallResult;
}

interface SeedFile {
  readonly baseline: { readonly input: WaterfallInput; readonly money: WaterfallResult };
  readonly opportunities: readonly DemoOpportunity[];
}

export class DemoSeedError extends Error {
  override readonly name = 'DemoSeedError';
}

/**
 * Load-time guard restating the §5.4 identities (reseller law: gross = C+M,
 * fee = 20%·(C+M), net = gross − fee; productSubtotal = B+M; buyerTotal =
 * productSubtotal + D; parts sum to productSubtotal). This does NOT
 * recompute the waterfall — the authoritative derivation pin lives in the
 * demo-store test, which replays every seed through the pinned
 * `computeWaterfall` and `assertQuoteReconciles`.
 */
function assertSeedMoneyHonest(label: string, input: WaterfallInput, money: WaterfallResult): void {
  const failures: string[] = [];
  if (money.productSubtotal !== input.sellerBasePrice + input.resellerMarkup) {
    failures.push('productSubtotal != B + M');
  }
  if (money.buyerTotal !== money.productSubtotal + input.deliveryFee) {
    failures.push('buyerTotal != productSubtotal + D');
  }
  if (money.resellerGrossEarnings !== input.sellerFundedCommission + input.resellerMarkup) {
    failures.push('resellerGrossEarnings != C + M');
  }
  if (money.resellerNet + money.resellerPlatformFee !== money.resellerGrossEarnings) {
    failures.push('resellerNet + resellerPlatformFee != resellerGrossEarnings');
  }
  if (money.sellerNet + money.resellerNet + money.platformProductFeeRevenue !== money.productSubtotal) {
    failures.push('sellerNet + resellerNet + platformProductFeeRevenue != productSubtotal');
  }
  if (failures.length > 0) {
    throw new DemoSeedError(`demo seed ${label} does not reconcile: ${failures.join('; ')}`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const SEED = deepFreeze(rawSeed as unknown as SeedFile);
assertSeedMoneyHonest('baseline', SEED.baseline.input, SEED.baseline.money);
for (const o of SEED.opportunities) assertSeedMoneyHonest(o.id, o.input, o.money);

/**
 * The signed PRODUCT link on her share card — « the one she sends ». Two truths
 * held together (founder ruling 2026-07-20): the SLUG is HER RESOLVING storefront
 * slug (`aicha-4821`, the same slug as her `/v/` identity), so the buyer PWA's
 * `/s/{slug}` route LANDS on the offer — the demo's core loop is walkable end to
 * end instead of dead-ending at not-found. The DOMAIN stays the visibly-fictional
 * « .demo » sandbox — never a real TLD, never a URL scheme (the card marks it
 * « lien d'essai ») — so the printed text is impossible to mistake for a live
 * store. Behaviour is unchanged either way: the buyer route already resolved
 * `aicha-4821` and honest-not-found'd `awa-essai`; this points the seed at the
 * resolving slug so a review walk closes the loop.
 */
export const DEMO_SHARE_LINK = 'shop-plus.demo/s/aicha-4821';

/**
 * DEMO BRIDGE (VITRINE-REAL-BACKING follow-on): the reseller's demo opportunities
 * (o1..) and the buyer storefront's vitrine seed (p1..k1) are two demo worlds
 * seeded independently; production unifies them into ONE catalog. Until then, this
 * maps each shareable opportunity to the buyer storefront pid it represents, so the
 * signed product link `/s/{slug}?pid=` opens the SAME product she shared (not the
 * default offer). Semantic matches: o5 « Chemise Faso Dan Fani » → p8 (exact), o1
 * « Pagne wax » → p2, o7 « Sandales » → p4, o2 « karité » → p5, o3 « Sac » → p3;
 * o4/o6 (no storefront twin) map to the nearest article. The mapping is DATA, not a
 * second link scheme — the `/s/{slug}?pid=` form is the one canon buyer route.
 */
export const SHARE_PID_BY_OPP: Readonly<Record<string, string>> = {
  o1: 'p2', o2: 'p5', o3: 'p3', o4: 'p7', o5: 'p8', o6: 'k1', o7: 'p4',
};

/** The buyer storefront pid for a shared opportunity (demo bridge, above). */
export function sharePidFor(oppId: string): string {
  return SHARE_PID_BY_OPP[oppId] ?? 'p1';
}

/**
 * WO-7.2b — the media-kit link-out (Q5: a LINK, never a webview embed). Same
 * visibly-fictional sandbox form as the share link — the kit is a sibling web
 * surface (the composeur); here it is only pointed to, honestly « d'essai ».
 */
/** ACCUEIL frame — « Gains nets — juin », a demo monthly constant (HANDOFF §2: 34 500).
 * Marked demo; the real figure is a settled-payout sum in production. */
export const MONTHLY_NET_DEMO = 34500;

export const DEMO_KIT_LINK = 'shop-plus.demo/kit';

export interface DemoWorld {
  readonly opportunities: readonly DemoOpportunity[];
  /** The reseller's picked opportunities (« ma sélection »), by id. */
  readonly selectedIds: readonly string[];
}

export function createDemoWorld(): DemoWorld {
  return { opportunities: SEED.opportunities, selectedIds: [] };
}

/** Pure toggle — seeds are frozen, so walks never mutate; they re-world. */
export function toggleSelection(world: DemoWorld, id: string): DemoWorld {
  if (!world.opportunities.some((o) => o.id === id)) return world;
  const selectedIds = world.selectedIds.includes(id)
    ? world.selectedIds.filter((s) => s !== id)
    : [...world.selectedIds, id];
  return { opportunities: world.opportunities, selectedIds };
}

export function isSelected(world: DemoWorld, id: string): boolean {
  return world.selectedIds.includes(id);
}

export function selectedOpportunities(world: DemoWorld): readonly DemoOpportunity[] {
  return world.opportunities.filter((o) => world.selectedIds.includes(o.id));
}

/** The opportunity row model — the REAL net-first logic, reused, never re-encoded. */
export function opportunityCard(o: DemoOpportunity): OpportunityCardModel {
  return buildOpportunityCard(o.money);
}

/**
 * A gains view is NEVER gross-without-net (SP-I04/SP-I12): the net is the
 * first field and the primary figure; gross (C+M) and the honest 20 % fee
 * only ever appear beside it.
 */
export interface GainsLine {
  /** PRIMARY figure — always the net. */
  readonly netFcfa: number;
  /** The honest 20 % service part (§5.4 reseller fee). */
  readonly feeFcfa: number;
  /** Gross (C + M) — shown for honesty, never without the net beside it. */
  readonly grossFcfa: number;
}

export function gainsLineFor(money: WaterfallResult): GainsLine {
  return {
    netFcfa: money.resellerNet,
    feeFcfa: money.resellerPlatformFee,
    grossFcfa: money.resellerGrossEarnings,
  };
}

/** Seeded projection over the whole demo world — sums of reconciled parts. */
export function gainsTotal(opportunities: readonly DemoOpportunity[]): GainsLine {
  return opportunities.reduce<GainsLine>(
    (acc, o) => ({
      netFcfa: acc.netFcfa + o.money.resellerNet,
      feeFcfa: acc.feeFcfa + o.money.resellerPlatformFee,
      grossFcfa: acc.grossFcfa + o.money.resellerGrossEarnings,
    }),
    { netFcfa: 0, feeFcfa: 0, grossFcfa: 0 },
  );
}

/** The §5.4 worked baseline (B 10 000 · C 1 000 · M 1 500 · D 1 000) — the in-app proof card. */
export function baselineGains(): GainsLine {
  return gainsLineFor(SEED.baseline.money);
}

export function baselineProductPriceFcfa(): number {
  return SEED.baseline.money.sellerBasePrice;
}
