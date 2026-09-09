// NEGATIVE FIXTURE (PORTES-FRANCAISES-1): the FRENCH spelling of the buyer's
// secret on a reseller surface — the exposure gate for that secret MUST fail
// on this file through its French family alone: no English spelling appears
// anywhere in it, this comment included (not even the gate's own name).
// Never import this.
export interface ResellerVenteView {
  orderId: string;
  codeDeRemise: string; // banned: the same secret under its French name
  buyerHandoffPin: string; // banned: the euphemism
}
