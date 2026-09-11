// NEGATIVE FIXTURE (the plant): a refusal label typed back inline. T1 — the
// accent in a bare literal.
import { t, tf } from '../i18n';
export const rendu = (n: number): string =>
  `<div class="cl-x" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span></div>`;
export const libelle = 'Réessayer';
