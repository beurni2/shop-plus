// NEGATIVE FIXTURE (the plant): a bare phrase carrying a digit and an ASCII
// apostrophe, rendered through an expression — no accent, no tag, no spoken
// attribute. A letters-and-spaces T4 passed it (verifier, MAJOR 3).
import { t, tf } from '../i18n';
const ETAPE = "J'en suis a l'etape 1 sur 3";
export const rendu = (n: number): string =>
  `<div class="cl-x" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span><b>${ETAPE}</b></div>`;
export const libelle = 'cl-cta cl-cta-c1';
