// NEGATIVE-FIXTURE BASE (the control): a module that renders only catalog
// keys. Every source negative beside it is this file plus ONE plant.
import { t, tf } from '../i18n';
export const rendu = (n: number): string =>
  `<div class="cl-x" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span></div>`;
export const libelle = 'cl-cta cl-cta-c1';
