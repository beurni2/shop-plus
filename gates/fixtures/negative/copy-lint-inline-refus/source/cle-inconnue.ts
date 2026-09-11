// NEGATIVE FIXTURE (the plant): a call naming a key the catalog does not have
// — the module would throw at load. The key check must see it.
import { t, tf } from '../i18n';
export const rendu = (n: number): string =>
  `<div class="cl-x" data-action="commander">${t('cl.c1.commander')}<span>${tf('cl.galerie.compteur', { n: String(n), total: '3' })}</span><b>${t('cl.c1.cle_qui_nexiste_pas')}</b></div>`;
export const libelle = 'cl-cta cl-cta-c1';
