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
  /** First name only — the client's number never exists on a reseller surface. */
  readonly clientFirstName: string;
  readonly productName: string;
  readonly status: SaleStatus;
  /** The §5.4 input — carried so the test can pin the money to computeWaterfall. */
  readonly input: WaterfallInput;
  /** PRIMARY money figure — always resellerNet (0.8·(C+M)). Never gross. */
  readonly netFcfa: number;
  /** SON prix — what the client pays (productSubtotal = B+M); detail only. */
  readonly sonPrixFcfa: number;
}

/** The demo sales — money frozen, PINNED to computeWaterfall in the test. */
const RAW_SALES: readonly Sale[] = [
  { id: 'v1', clientFirstName: 'Fatou S.', productName: 'Sac cuir artisanal', status: 'probleme', input: { sellerBasePrice: 8000, sellerFundedCommission: 750, resellerMarkup: 1000, deliveryFee: 1000, paymentMode: 'FULL_PREPAY' }, netFcfa: 1400, sonPrixFcfa: 9000 },
  { id: 'v2', clientFirstName: 'Awa K.', productName: 'Foulard wax · lot de 2', status: 'a_la_porte', input: { sellerBasePrice: 6000, sellerFundedCommission: 375, resellerMarkup: 750, deliveryFee: 1000, paymentMode: 'FULL_PREPAY' }, netFcfa: 900, sonPrixFcfa: 6750 },
  { id: 'v3', clientFirstName: 'Mariam O.', productName: 'Robe brodée bogolan · M', status: 'en_route', input: { sellerBasePrice: 10000, sellerFundedCommission: 1000, resellerMarkup: 1500, deliveryFee: 1000, paymentMode: 'FULL_PREPAY' }, netFcfa: 2000, sonPrixFcfa: 11500 },
  { id: 'v4', clientFirstName: 'Salimata D.', productName: 'Boubou brodé', status: 'en_preparation', input: { sellerBasePrice: 12000, sellerFundedCommission: 1200, resellerMarkup: 1800, deliveryFee: 1000, paymentMode: 'FULL_PREPAY' }, netFcfa: 2400, sonPrixFcfa: 13800 },
  { id: 'v5', clientFirstName: 'Rasmata Z.', productName: 'Sandales cuir · 38', status: 'payee', input: { sellerBasePrice: 7000, sellerFundedCommission: 375, resellerMarkup: 1000, deliveryFee: 1000, paymentMode: 'FULL_PREPAY' }, netFcfa: 1100, sonPrixFcfa: 8000 },
  { id: 'v6', clientFirstName: 'Fanta B.', productName: 'Pagne tissé main', status: 'livree', input: { sellerBasePrice: 9000, sellerFundedCommission: 500, resellerMarkup: 1500, deliveryFee: 1000, paymentMode: 'FULL_PREPAY' }, netFcfa: 1600, sonPrixFcfa: 10500 },
];
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
  readonly clientFirstName: string;
  readonly productName: string;
  readonly status: SaleStatus;
  readonly statusKey: string;
  readonly serverFact: boolean;
  readonly netFcfa: number;
}

export function ventesListModel(sales: readonly Sale[] = DEMO_SALES): readonly SaleRow[] {
  return orderedSales(sales).map((s) => ({
    id: s.id,
    clientFirstName: s.clientFirstName,
    productName: s.productName,
    status: s.status,
    statusKey: STATUS_KEY[s.status],
    serverFact: statusIsServerFact(s.status),
    netFcfa: s.netFcfa,
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
  readonly clientFirstName: string;
  readonly netFcfa: number;
  readonly sonPrixFcfa: number;
  readonly status: SaleStatus;
  readonly isProblem: boolean;
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
    clientFirstName: sale.clientFirstName,
    netFcfa: sale.netFcfa,
    sonPrixFcfa: sale.sonPrixFcfa,
    status: sale.status,
    isProblem: sale.status === 'probleme',
    timeline,
  };
}

/** The demo detail the mockup specifies — Mariam O. (EN ROUTE). */
export function demoDetail(): SaleDetail {
  const mariam = DEMO_SALES.find((s) => s.id === 'v3')!;
  return ventesDetailModel(mariam);
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
export function ventesRowSurface(): EarningsSurfaceDescriptor {
  return { surface: 'ventes-row', moneyFieldsInRenderOrder: ['resellerNet'] };
}
export function ventesDetailSurface(): EarningsSurfaceDescriptor {
  return { surface: 'ventes-detail', moneyFieldsInRenderOrder: ['resellerNet', 'customerPrice'] };
}
