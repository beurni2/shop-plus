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
  // Ma vitrine → Partager.
  //
  // APERÇU-CLIENTE RETIRÉ (founder order 2026-08-03): `pubvitrine` was a replica
  // of the cliente view reachable from Ma vitrine AND from Personnaliser. Both
  // edges go with the screen — a journey map that still names a screen nobody
  // can reach is a map that lies about the app.
  opportunites: ['fiche'],
  fiche: ['vitrine'],
  vitrine: ['lien', 'personnaliser'],
  personnaliser: [],
  lien: ['gains'],
  // GAINS-OPP-1 — the `gains → opportunites` edge existed for ONE render site,
  // the « Les opportunités » button the founder found on this screen; with the
  // button gone nothing declares it, and the rule three lines above cuts both
  // ways — an edge no UI walks is the same lie as a screen nobody reaches. The
  // dock's own `toHub` does not travel this map.
  gains: [],
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
