import type { WaterfallResult } from '@platform/contracts';

/**
 * Customer-surface projection (SP-I03): "Customer-facing pages MUST show the
 * reseller as the commercial relationship and MUST NOT expose supplier
 * identity/contact or commission." The projection type is built so supplier
 * identity, supplier contact, commission, and seller economics structurally
 * cannot ride along — the no-supplier-contact CI gate scans emitted payloads
 * for the banned key families as the second line of defense.
 */
export interface CustomerProductView {
  listingId: string;
  productVersionId: string;
  productName: string;
  category: string;
  /** The reseller IS the commercial relationship on every customer surface. */
  resellerId: string;
  storeName: string;
  /** Customer price = productSubtotal (B + M). Never decomposed for the buyer. */
  customerPriceFcfa: number;
  deliveryFeeFcfa: number;
  buyerTotalFcfa: number;
  assetRefs: readonly string[];
}

export interface CustomerProjectionInput {
  listingId: string;
  productVersionId: string;
  productName: string;
  category: string;
  resellerId: string;
  storeName: string;
  money: WaterfallResult;
  assetRefs: readonly string[];
}

export function toCustomerProductView(input: CustomerProjectionInput): CustomerProductView {
  return {
    listingId: input.listingId,
    productVersionId: input.productVersionId,
    productName: input.productName,
    category: input.category,
    resellerId: input.resellerId,
    storeName: input.storeName,
    customerPriceFcfa: input.money.productSubtotal,
    deliveryFeeFcfa: input.money.deliveryFee,
    buyerTotalFcfa: input.money.buyerTotal,
    assetRefs: [...input.assetRefs],
  };
}
