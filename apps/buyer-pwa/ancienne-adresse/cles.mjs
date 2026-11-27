/**
 * ADRESSE-PROPRE — the names Shop+ writes in a buyer's browser, and only
 * those. The old address is shared with every other page of the account, so
 * its forwarder removes exactly these: each name by name, each prefix as
 * written, never a broader sweep. test/ancienne-adresse-cles.test.ts fails the
 * day the buyer site writes a name this list does not carry.
 */
export const CLES = [
  'sp-compte:v1',
  'sp-compte-invitee:v1',
  'sp-liens-dus:v1',
  'sp-commandes-decidees:v1',
  'sp-articles-dus:v1',
  'sp-articles-au-compte:v1',
  'sp-commandes:v1',
  'sp-commande:v1',
  'sp-portes:v1',
  'sp-paniers-payes:v1',
  'sp-panier-paye:v1',
  'sp-reprise:v1',
  'shopplus.listes.v1',
  'shopplus.panier.v1',
  'shopplus.favoris.v1',
  'shopplus.favoris-boutiques.v1',
  'shop-plus.arrivals.v1',
];

export const PREFIXES = ['sp-quote-key:', 'sp-quote-cmd:', 'sp-panier-titulaire:', 'sp-panier-lie:', 'sp-panier-prix:'];
