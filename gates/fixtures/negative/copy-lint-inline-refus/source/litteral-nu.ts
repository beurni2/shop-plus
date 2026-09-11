// NEGATIVE FIXTURE (the plant): a bare ASCII phrase held in a const and
// rendered through an expression — invisible to T1, T2 and T3. T4 must see it.
import { t, tf } from '../i18n';
const CTA = 'Choisissez pour continuer';
export const rendu = (n: number): string =>
  `<div class="cl-x" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span><button>${CTA}</button></div>`;
export const libelle = 'cl-cta cl-cta-c1';
