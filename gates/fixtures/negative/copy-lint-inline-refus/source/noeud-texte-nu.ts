// NEGATIVE FIXTURE (the plant): an ASCII-only sentence as an HTML text node in
// a BARE string literal — the module's dominant HTML style. A T2 that read
// templates only was blind to it (verifier, CATALOGUE-CLIENTE-1 MAJOR 1).
import { t, tf } from '../i18n';
export const rendu = (n: number): string =>
  `<div class="cl-x" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span></div>`;
export const carte = '<div class="cl-epuise-card">Payez maintenant la commande</div>';
