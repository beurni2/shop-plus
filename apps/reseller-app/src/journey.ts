/**
 * WO-4.1 — the reseller journey as DATA. The App renders a stack over this
 * map; the spine test walks it (BFS from START must reach every screen) so
 * the walkable-world promise is asserted, not assumed. No navigation
 * library: a state stack keeps the bundle inside the E4 budgets.
 */

export type Screen =
  | 'accueil'
  | 'opportunites'
  | 'fiche'
  | 'vitrine'
  | 'pubvitrine'
  | 'personnaliser'
  | 'lien'
  | 'gains'
  | 'ventes'
  | 'vente_detail'
  // LE CERCLE (SP9 — founder-override scoped to UI + certified mock, journaled)
  | 'cercle'
  | 'campnew'
  | 'campaign'
  | 'funding'
  | 'reput'
  | 'membres';

export const START: Screen = 'accueil';

/** Forward edges only — « Retour » pops the stack and is always available. */
export const JOURNEY: Record<Screen, readonly Screen[]> = {
  accueil: ['opportunites', 'gains', 'ventes', 'cercle'],
  // WO-VITRINE-FLOW — Opportunités → Fiche (single product, add to vitrine) →
  // Ma vitrine → Partager. « Vitrine publique » is the aperçu-cliente target.
  opportunites: ['fiche'],
  fiche: ['vitrine'],
  vitrine: ['lien', 'pubvitrine', 'personnaliser'],
  personnaliser: ['pubvitrine'],
  pubvitrine: [],
  lien: ['gains'],
  gains: ['opportunites'],
  // WO-7.2a — S7: « Mes ventes » (the sales list) → a sale's detail.
  ventes: ['vente_detail'],
  vente_detail: [],
  // CERCLE (HANDOFF §4): hub → wizard / campaign / funding / reputation /
  // members / share; the wizard and the campaign both exit into Partager
  // (« Pack de partage », campaign badge riding).
  cercle: ['campnew', 'campaign', 'funding', 'reput', 'membres', 'lien'],
  campnew: ['lien'],
  campaign: ['lien'],
  funding: [],
  reput: [],
  membres: [],
};
