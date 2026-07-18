import type { WaterfallResult } from '@platform/contracts';
import { money } from '@platform/ui-tokens/legacy';

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
  // WO-FCFA (canon v1.0.1): the suffix is the pinned money token — fr-FR grouping
  // (U+202F) + `money.currencySuffix` (U+202F + « FCFA »). No hardcoded « F »; the
  // whole app's money render flips through this one site.
  return `${amount.toLocaleString('fr-FR')}${money.currencySuffix}`;
}
