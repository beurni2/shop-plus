import type { WaterfallResult } from '@platform/contracts';
import { fmtFCFA } from './money';

/**
 * Earnings surfaces are NET-FIRST (SP-I04/SP-I12; §5.4: "The reseller MUST
 * see resellerNet (not gross) before promoting; gross-first UI is a
 * CI-tested prohibition."). The opportunity card renders the reseller's net
 * as its primary figure; gross (C+M) is not rendered at all at this slice.
 * The descriptor below is exported for the net-first-display CI gate — a
 * test pins the checked-in copy to this module.
 */

export interface EarningsSurfaceDescriptor {
  surface: string;
  moneyFieldsInRenderOrder: string[];
}

export function opportunityCardSurface(): EarningsSurfaceDescriptor {
  return {
    surface: 'opportunity-card',
    moneyFieldsInRenderOrder: ['resellerNet', 'customerPrice'],
  };
}

export interface OpportunityCardModel {
  /** PRIMARY figure — always the net (SP-I04). */
  netFcfa: number;
  /** Secondary: what the customer pays (productSubtotal). */
  customerPriceFcfa: number;
}

export function buildOpportunityCard(money: WaterfallResult): OpportunityCardModel {
  return {
    netFcfa: money.resellerNet,
    customerPriceFcfa: money.productSubtotal,
  };
}

export function formatFcfa(amount: number): string {
  // RESELLER-APP-MONEY: the ecosystem's ONE discipline — thousands grouped with
  // U+202F from a single escaped constant, suffixed « [NNBSP]FCFA », NEVER via
  // ICU (`toLocaleString`/`Intl.NumberFormat`, whose fr-FR separator has drifted
  // across versions) and NEVER a bare « F ». Render-only: `amount` is the
  // signed/composed franc figure, never recomputed here. The whole app's money
  // render flips through this one site (→ src/money.ts).
  return fmtFCFA(amount);
}
