// NEGATIVE FIXTURE (the plant): an ASCII-only sentence as an HTML text node.
// T1 cannot see it (no accent); T2 must.
import { t, tf } from '../i18n';
export const rendu = (n: number): string =>
  `<div class="cl-x" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span><p class="cl-quote">Tout est bon, payez le reste.</p></div>`;
export const libelle = 'cl-cta cl-cta-c1';
