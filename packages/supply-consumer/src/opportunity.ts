import {
  computeWaterfall,
  type PaymentMode,
  type SupplyProjection,
  type WaterfallInput,
  type WaterfallResult,
} from '@platform/contracts';

/**
 * THE SEED-DEATH RECONCILIATION (SW-2 item 3). A live supply projection carries
 * B (`basePrice`) and C (`resellerCommission`); the reseller supplies M (markup)
 * and Séra supplies D (delivery fee). Fed through the PINNED `computeWaterfall`,
 * the same B, C produce the same opportunity-card lines the retired seed did — so
 * `seed.json` retires WITHOUT money drift. The waterfall is CONSUMED here, never
 * touched (Quote/checkout stay byte-frozen).
 */
export interface OpportunityMarkupInputs {
  /** M — the reseller's markup. */
  readonly resellerMarkup: number;
  /** D — Séra's delivery fee quote. */
  readonly deliveryFee: number;
  readonly paymentMode: PaymentMode;
}

/** Project a fresh supply projection + the reseller/Séra inputs into the waterfall input. */
export function supplyToWaterfallInput(
  projection: SupplyProjection,
  markup: OpportunityMarkupInputs,
): WaterfallInput {
  return {
    sellerBasePrice: projection.basePrice,
    sellerFundedCommission: projection.resellerCommission,
    resellerMarkup: markup.resellerMarkup,
    deliveryFee: markup.deliveryFee,
    paymentMode: markup.paymentMode,
  };
}

/** The reconciling opportunity money from a live projection — through the pinned waterfall. */
export function opportunityMoneyFromSupply(
  projection: SupplyProjection,
  markup: OpportunityMarkupInputs,
): WaterfallResult {
  return computeWaterfall(supplyToWaterfallInput(projection, markup));
}

/**
 * The CUSTOMER-facing view derived from the live path (SW-2 item 4, SP-I03). The
 * buyer sees ONLY the product name and the customer price (productSubtotal =
 * B + M) — never supplier identity, never commission, never seller economics,
 * never base-price decomposition. Built so the banned key families structurally
 * cannot ride along; the no-supplier-contact gate scans a fixture produced by
 * THIS function as the second line of defence.
 */
export interface CustomerSurfaceView {
  readonly productName: string;
  readonly customerPriceFcfa: number;
}
export function customerSurfaceFromSupply(
  projection: SupplyProjection,
  markup: OpportunityMarkupInputs,
  productName: string,
): CustomerSurfaceView {
  return {
    productName,
    customerPriceFcfa: opportunityMoneyFromSupply(projection, markup).productSubtotal,
  };
}
