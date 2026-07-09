// NEGATIVE FIXTURE: buyerDropCode on a reseller surface — the
// no-drop-code-exposure gate MUST fail on this file. Never import this.
export interface ResellerSaleView {
  orderId: string;
  buyerDropCode: string; // banned: private to the buyer, never on seller/reseller surfaces
}
