import type { WaterfallInput } from '@platform/contracts';

/**
 * WO-7.2a — S7 MES VENTES / CLIENTES (reseller, RN). The money laws that hold
 * the screen: the NET is first on every gains surface (SP-I04/SP-I12; detail:
 * net BEFORE son prix); the commission is unrepresentable (no field carries it);
 * no supplier identity; the client's number never exists — first name only, the
 * relay carries the call. Order is deterministic and stated on-screen: the
 * problems first, then closest-to-door → settled. LIVRÉE is a server fact (an
 * ink chip), never a green lie before the operator.
 *
 * METRO-SAFE (repo law): this module imports ZERO `@platform/contracts` VALUES
 * (the `WaterfallInput` import is type-only, erased at compile). Every franc is
 * a FROZEN SNAPSHOT pinned in `test/ventes.test.ts` to `computeWaterfall(input)`
 * — the net and son-prix below are proven (net = 0.8·(C+M); son prix = B+M),
 * never hand-authored truth. Séra's four secrets and the buyer drop code never
 * appear here — a reseller surface sees her net and her client's first name.
 */

export type SaleStatus =
  | 'probleme'
  | 'a_la_porte'
  | 'en_route'
  | 'en_preparation'
  | 'payee'
  | 'livree';

/** The deterministic order — problems first, then closest-to-door → settled. */
const STATUS_RANK: Record<SaleStatus, number> = {
  probleme: 0,
  a_la_porte: 1,
  en_route: 2,
  en_preparation: 3,
  payee: 4,
  livree: 5,
};

/** Status → its catalog chip key (the label lives in the i18n catalog). */
export const STATUS_KEY: Record<SaleStatus, string> = {
  probleme: 'ventes.etat_probleme',
  a_la_porte: 'ventes.etat_porte',
  en_route: 'ventes.etat_en_route',
  en_preparation: 'ventes.etat_preparation',
  payee: 'ventes.etat_payee',
  livree: 'ventes.etat_livree',
};

/** LIVRÉE is a server FACT — the only status that reads in ink (the « ink »
 * tone), never money-green and never a lie before the operator confirms it. */
export function statusIsServerFact(status: SaleStatus): boolean {
  return status === 'livree';
}

export interface Sale {
  readonly id: string;
  /** Order code (CMD-xxxx) — the Cercle-era order identity (HANDOFF §3.1). */
  readonly code: string;
  /** First name only — the client's number never exists on a reseller surface.
   * §3.1 names only o1's buyer (Awa); the others carry their CMD code here
   * (an honest identifier — buyer names are never invented). */
  readonly clientFirstName: string;
  readonly productName: string;
  readonly status: SaleStatus;
  /** The §5.4 input — carried so the test can pin the money to computeWaterfall. */
  readonly input: WaterfallInput;
  /** PRIMARY money figure — always resellerNet (0.8·(C+M)). Never gross. */
  readonly netFcfa: number;
  /** SON prix — what the client pays (productSubtotal = B+M); detail only. */
  readonly sonPrixFcfa: number;
  /** Cercle campaign contribution (K), FROZEN at attribution (§3.1: « camp
   * FIGÉ à l'attribution ») — 0 on non-campaign orders. Render-only. */
  readonly campFcfa: number;
}

/** The demo sales — the CERCLE-era §3.1 order seed (o1–o5), §0.2 corrections
 * applied (o1 camp 600). Money frozen, PINNED to computeWaterfall in the test.
 * Statuses map the §3.1 vocabulary onto the S7 chips: FUNDED→en_preparation ·
 * TRANSIT→en_route · PAID→payee · READY_FAILED/BUYER_REFUSED→probleme. */
const RAW_SALES: readonly Sale[] = [
  { id: 'o1', code: 'CMD-2417', clientFirstName: 'Awa', productName: 'Robe brodée bogolan', status: 'en_preparation', input: { sellerBasePrice: 10000, sellerFundedCommission: 1000, resellerMarkup: 1500, deliveryFee: 1000, paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' }, netFcfa: 2000, sonPrixFcfa: 11500, campFcfa: 600 },
  { id: 'o7', code: 'CMD-2413', clientFirstName: 'CMD-2413', productName: 'Pagne wax 6 yards', status: 'en_route', input: { sellerBasePrice: 18000, sellerFundedCommission: 1800, resellerMarkup: 2500, deliveryFee: 1000, paymentMode: 'FULL_PREPAY' }, netFcfa: 3440, sonPrixFcfa: 20500, campFcfa: 0 },
  { id: 'o2', code: 'CMD-2409', clientFirstName: 'CMD-2409', productName: 'Sac cuir artisanal', status: 'payee', input: { sellerBasePrice: 15000, sellerFundedCommission: 1500, resellerMarkup: 2000, deliveryFee: 1000, paymentMode: 'FULL_PREPAY' }, netFcfa: 2800, sonPrixFcfa: 17000, campFcfa: 0 },
  { id: 'o3', code: 'CMD-2411', clientFirstName: 'CMD-2411', productName: 'Chemise Faso Dan Fani · L', status: 'probleme', input: { sellerBasePrice: 12000, sellerFundedCommission: 1200, resellerMarkup: 1500, deliveryFee: 1000, paymentMode: 'FULL_PREPAY' }, netFcfa: 2160, sonPrixFcfa: 13500, campFcfa: 0 },
  { id: 'o5', code: 'CMD-2398', clientFirstName: 'CMD-2398', productName: 'Foulard Faso Dan Fani', status: 'probleme', input: { sellerBasePrice: 5500, sellerFundedCommission: 550, resellerMarkup: 1500, deliveryFee: 1000, paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' }, netFcfa: 1640, sonPrixFcfa: 7000, campFcfa: 0 },
];

/** Net VERSÉ à la revendeuse = net − camp (§3.2) — the Cercle-layer deduction;
 * the platform waterfall (frais = round(brut × 0.20)) is untouched. */
export const netPaye = (s: Sale): number => s.netFcfa - s.campFcfa;

/** D4a — « En attente (net) » = Σ net − camp of ACTIVE orders (en préparation /
 * en route / à la porte); problems and settled excluded. Seed: 4 840. */
export const enAttenteNet = (sales: readonly Sale[] = DEMO_SALES): number =>
  sales.filter((s) => s.status === 'en_preparation' || s.status === 'en_route' || s.status === 'a_la_porte')
    .reduce((sum, s) => sum + netPaye(s), 0);

/** D4a — « Payé cette semaine » = Σ net − camp of PAYÉE orders. Seed: 2 800. */
export const payeSemaine = (sales: readonly Sale[] = DEMO_SALES): number =>
  sales.filter((s) => s.status === 'payee').reduce((sum, s) => sum + netPaye(s), 0);
const DEMO_SALES: readonly Sale[] = RAW_SALES.map((s) => Object.freeze(s));

export function allSales(): readonly Sale[] {
  return orderedSales(DEMO_SALES);
}

/** Deterministic order — the problems first (STATUS_RANK), never a score. */
export function orderedSales(sales: readonly Sale[] = DEMO_SALES): readonly Sale[] {
  return [...sales].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}

/** A list row — NET-FIRST: the row's money is the net, never a gross. */
export interface SaleRow {
  readonly id: string;
  readonly code: string;
  readonly clientFirstName: string;
  readonly productName: string;
  readonly status: SaleStatus;
  readonly statusKey: string;
  readonly serverFact: boolean;
  /** The row's money — net VERSÉ (net − camp on campaign orders). */
  readonly netFcfa: number;
}

export function ventesListModel(sales: readonly Sale[] = DEMO_SALES): readonly SaleRow[] {
  return orderedSales(sales).map((s) => ({
    id: s.id,
    code: s.code,
    clientFirstName: s.clientFirstName,
    productName: s.productName,
    status: s.status,
    statusKey: STATUS_KEY[s.status],
    serverFact: statusIsServerFact(s.status),
    netFcfa: netPaye(s),
  }));
}

/** The four custody steps of the detail timeline (« OÙ EN EST LA COMMANDE »). */
export type TimelinePhase = 'done' | 'now' | 'later';
export interface TimelineStep {
  readonly labelKey: string;
  readonly noteKey?: string;
  readonly phase: TimelinePhase;
}
const TIMELINE: readonly { labelKey: string; noteKey?: string }[] = [
  { labelKey: 'vente.etape_payee', noteKey: 'vente.etape_payee_note' },
  { labelKey: 'vente.etape_scellee', noteKey: 'vente.etape_scellee_note' },
  { labelKey: 'vente.etape_en_route', noteKey: 'vente.etape_en_route_note' },
  { labelKey: 'vente.etape_livree' },
];
/** Status → the current custody step (deterministic). « à la porte » is the tail of en route. */
const STATUS_STEP: Record<SaleStatus, number> = {
  payee: 0,
  en_preparation: 1,
  en_route: 2,
  a_la_porte: 2,
  livree: 3,
  probleme: 2, // a problem is raised in transit; the encart carries its truth
};

/** The detail — NET FIRST (net before son prix), then the coarse custody timeline. */
export interface SaleDetail {
  readonly code: string;
  readonly clientFirstName: string;
  /** The product sold — real sale data (never a seller identity), for the
   * detail's product card (WO-FP-SHOP view 7, frame L319). */
  readonly productName: string;
  readonly netFcfa: number;
  readonly sonPrixFcfa: number;
  readonly status: SaleStatus;
  readonly isProblem: boolean;
  /** D3 — the Cercle contribution (0 = line not rendered) + the derivation
   * lines. NET-FIRST law holds on the SURFACE: the net hero renders first,
   * the brut/frais/contribution derivation renders UNDER it (SP-I04/SP-I12
   * outranks the planche's top-to-bottom ledger order — flagged divergence). */
  readonly campFcfa: number;
  readonly netPayeFcfa: number;
  readonly brutFcfa: number;
  readonly fraisFcfa: number;
  readonly timeline: readonly TimelineStep[];
}

export function ventesDetailModel(sale: Sale): SaleDetail {
  const current = STATUS_STEP[sale.status];
  const timeline = TIMELINE.map((step, i): TimelineStep => ({
    labelKey: step.labelKey,
    ...(step.noteKey ? { noteKey: step.noteKey } : {}),
    phase: i < current ? 'done' : i === current ? 'now' : 'later',
  }));
  return {
    code: sale.code,
    clientFirstName: sale.clientFirstName,
    productName: sale.productName,
    netFcfa: sale.netFcfa,
    sonPrixFcfa: sale.sonPrixFcfa,
    status: sale.status,
    isProblem: sale.status === 'probleme',
    campFcfa: sale.campFcfa,
    netPayeFcfa: netPaye(sale),
    brutFcfa: sale.netFcfa + Math.round((sale.input.sellerFundedCommission + sale.input.resellerMarkup) * 0.2),
    fraisFcfa: Math.round((sale.input.sellerFundedCommission + sale.input.resellerMarkup) * 0.2),
    timeline,
  };
}

/** The demo detail — D3's porteur: o1 CMD-2417 (the campaign order). */
export function demoDetail(): SaleDetail {
  const o1 = DEMO_SALES.find((s) => s.id === 'o1')!;
  return ventesDetailModel(o1);
}

/**
 * Net-first surface descriptors (SP-I04/SP-I12) — fed to the net-first-display
 * gate. The row shows only the net; the detail shows the net BEFORE son prix.
 * Neither surface can name a gross or a commission.
 */
export interface EarningsSurfaceDescriptor {
  readonly surface: string;
  readonly moneyFieldsInRenderOrder: readonly string[];
}
/** D4b — the per-sale Gains card view (server-layer derivation; net first). */
export interface GainsCardView {
  readonly code: string;
  readonly productName: string;
  readonly netPayeFcfa: number;
  readonly campFcfa: number;
  readonly brutFcfa: number;
  readonly fraisFcfa: number;
}
export function gainsCards(sales: readonly Sale[] = DEMO_SALES): readonly GainsCardView[] {
  return orderedSales(sales).map((s) => {
    const frais = Math.round((s.input.sellerFundedCommission + s.input.resellerMarkup) * 0.2);
    return {
      code: s.code,
      productName: s.productName,
      netPayeFcfa: netPaye(s),
      campFcfa: s.campFcfa,
      brutFcfa: s.netFcfa + frais,
      fraisFcfa: frais,
    };
  });
}

export function ventesRowSurface(): EarningsSurfaceDescriptor {
  return { surface: 'ventes-row', moneyFieldsInRenderOrder: ['resellerNet'] };
}
export function ventesDetailSurface(): EarningsSurfaceDescriptor {
  return { surface: 'ventes-detail', moneyFieldsInRenderOrder: ['resellerNet', 'campContribution', 'customerPrice'] };
}
