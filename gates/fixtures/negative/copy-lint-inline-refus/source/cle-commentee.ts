// POSITIVE CONTROL: a call inside a comment is not a call. The key below does
// not exist, and the gate must NOT count it — a commented-out `t('cl.x')` used
// to keep `cl.x` alive for the orphan check while a literal rendered in its
// place (verifier, MINOR 2). Nothing else here is a plant.
import { t, tf } from '../i18n';
// const ancien = t('cl.c1.cle_qui_nexiste_pas');
export const rendu = (n: number): string =>
  `<div class="cl-x" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span></div>`;
export const libelle = 'cl-cta cl-cta-c1';
