/**
 * WO-4.1 — the reseller journey as DATA. The App renders a stack over this
 * map; the spine test walks it (BFS from START must reach every screen) so
 * the walkable-world promise is asserted, not assumed. No navigation
 * library: a state stack keeps the bundle inside the E4 budgets.
 */

export type Screen =
  | 'accueil'
  | 'opportunites'
  | 'selection'
  | 'vitrine'
  | 'lien'
  | 'gains';

export const START: Screen = 'accueil';

/** Forward edges only — « Retour » pops the stack and is always available. */
export const JOURNEY: Record<Screen, readonly Screen[]> = {
  accueil: ['opportunites', 'gains'],
  opportunites: ['selection'],
  selection: ['vitrine'],
  vitrine: ['lien'],
  lien: ['gains'],
  gains: ['opportunites'],
};
