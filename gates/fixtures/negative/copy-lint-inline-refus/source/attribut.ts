// NEGATIVE FIXTURE (the plant): a placeholder a screen reader speaks, ASCII
// only. T3 must see it.
import { t, tf } from '../i18n';
export const rendu = (n: number): string =>
  `<div class="cl-x" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span><input class="cl-field" placeholder="Chercher votre quartier"></div>`;
export const libelle = 'cl-cta cl-cta-c1';
