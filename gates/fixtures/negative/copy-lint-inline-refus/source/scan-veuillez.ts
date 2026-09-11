// NEGATIVE FIXTURE (the plant): a banned-register word in a data attribute —
// not a text node, not a spoken attribute, no accent, one lowercase word: every
// tripwire is blind to it by design. Only the raw scan can see it.
import { t, tf } from '../i18n';
export const rendu = (n: number): string =>
  `<div class="cl-x" data-etat="veuillez" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span></div>`;
export const libelle = 'cl-cta cl-cta-c1';
