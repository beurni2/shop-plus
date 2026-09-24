import { t } from '../i18n';
import type { ComptePort } from './port';
import { estInvitee, sessionGardee } from './garde';
import { monterCompte, type EcranCompte } from './ecrans';

/**
 * ═══ COMPTE-CLIENTE — THE BOUTIQUE'S FRONT STEP ═══
 *
 * A boutique link opens on the three doors (create an account · sign in ·
 * continue without one) unless she is already signed in on this phone or
 * already chose « Continuer sans compte » in this tab. Past the doors the
 * boutique mounts exactly as before, with ONE quiet band at the head of the
 * shell — « Mon compte » — which opens her profile, or the doors again for a
 * guest who changes her mind.
 *
 * The order bands (« Ma commande », « Mes articles ») are hers too and are
 * never removed by this step: they stay at the head, the account band under
 * them.
 */

const BANDES_COMMANDE = new Set(['ma-commande', 'mes-articles']);

export interface OptsEntree {
  readonly port: ComptePort;
  readonly local: Storage | undefined;
  readonly onglet: Storage | undefined;
  /** Mounts the boutique into the shell, exactly as the road did before accounts. */
  readonly monterBoutique: () => void;
}

export function monterEntreeCompte(app: HTMLElement, opts: OptsEntree): void {
  const vider = (): void => {
    for (const enfant of Array.from(app.children)) {
      if (!BANDES_COMMANDE.has(enfant.getAttribute('data-role') ?? '')) enfant.remove();
    }
    window.scrollTo?.(0, 0);
  };

  const ouvrirCompte = (ecran: EcranCompte): void => {
    vider();
    const main = document.createElement('main');
    app.append(main);
    monterCompte(main, { port: opts.port, local: opts.local, onglet: opts.onglet, ecran, versBoutique: suivre });
  };

  const bande = (prenom: string | undefined): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ma-commande';
    b.setAttribute('data-role', 'mon-compte');
    const label = document.createElement('span');
    label.textContent = t('compte.bande.titre');
    const droite = document.createElement('span');
    droite.className = 'ma-commande-ref';
    // Her first name is a server byte: text, never markup.
    droite.textContent = prenom ?? t('compte.bande.invitee');
    b.append(label, droite);
    b.addEventListener('click', () => ouvrirCompte(prenom !== undefined ? 'profil' : 'porte'));
    return b;
  };

  function suivre(): void {
    const g = sessionGardee(opts.local);
    if (g === undefined && !estInvitee(opts.onglet)) {
      ouvrirCompte('porte');
      return;
    }
    vider();
    opts.monterBoutique();
    const b = bande(g?.prenom);
    const dernieres = Array.from(app.children).filter((e) => BANDES_COMMANDE.has(e.getAttribute('data-role') ?? ''));
    const apres = dernieres[dernieres.length - 1];
    if (apres !== undefined) apres.after(b);
    else app.prepend(b);
  }

  suivre();
}
