import { t } from '../i18n';
import type { ComptePort } from './port';
import { estInvitee, sessionActive } from './garde';
import { monterCompte, type BoutiquePorte, type EcranCompte } from './ecrans';

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
  /** COMPTE-CLIENTE-2 / PORTE-BELLE — her boutique, from the SAME read that draws it. */
  readonly boutique?: Promise<BoutiquePorte | undefined>;
  /** « Mes commandes » — open one order's tracking. */
  readonly ouvrirSuivi?: (orderId: string, buyerRef: string) => void;
}

/** The band, for her name or for a guest — text only, her name is a server byte. */
function bande(prenom: string | undefined, ouvrir: (ecran: EcranCompte) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ma-commande';
  b.setAttribute('data-role', 'mon-compte');
  const label = document.createElement('span');
  label.textContent = t('compte.bande.titre');
  const droite = document.createElement('span');
  droite.className = 'ma-commande-ref';
  droite.textContent = prenom ?? t('compte.bande.invitee');
  b.append(label, droite);
  b.addEventListener('click', () => ouvrir(prenom !== undefined ? 'profil' : 'porte'));
  return b;
}

/** Under the order bands, above everything else. */
function placerBande(app: HTMLElement, b: HTMLElement): void {
  app.querySelector('[data-role="mon-compte"]')?.remove();
  const dernieres = Array.from(app.children).filter((e) => BANDES_COMMANDE.has(e.getAttribute('data-role') ?? ''));
  const apres = dernieres[dernieres.length - 1];
  if (apres !== undefined) apres.after(b);
  else app.prepend(b);
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
    monterCompte(main, {
      port: opts.port, local: opts.local, onglet: opts.onglet, ecran, versBoutique: suivre,
      ...(opts.boutique !== undefined ? { boutique: opts.boutique } : {}),
      ...(opts.ouvrirSuivi !== undefined ? { ouvrirSuivi: opts.ouvrirSuivi } : {}),
    });
  };

  function suivre(): void {
    const g = sessionActive(opts.local, opts.onglet);
    if (g === undefined && !estInvitee(opts.onglet)) {
      ouvrirCompte('porte');
      return;
    }
    vider();
    opts.monterBoutique();
    placerBande(app, bande(g?.prenom, ouvrirCompte));
  }

  suivre();
}

/**
 * ═══ COMPTE-CLIENTE-2 — « MON COMPTE » ON THE PRODUCT AND PAYMENT PAGES ═══
 *
 * (Founder « fix the ones still open »: the account « as well with the
 * payment pwa ».) No doors here — they belong to the boutique link — only the
 * band, and it opens her account ON TOP of the page, never in its place: the
 * product page and any payment in progress stay mounted underneath, untouched,
 * and « Retour » closes the layer onto them exactly as she left them.
 */
export function monterBandeCompte(
  app: HTMLElement,
  opts: Omit<OptsEntree, 'monterBoutique' | 'boutique'>,
): void {
  // Android's Back closes the layer, as « Retour » does — never the payment
  // under it (verifier minor 3): opening adds ONE history entry, Back takes it
  // and closes; a button close takes it back itself.
  let entree = false;
  const retirer = (): void => {
    document.querySelector('[data-role="compte-voile"]')?.remove();
    document.body.classList.remove('compte-voile-ouvert');
    poser();
  };
  const surRetour = (): void => {
    entree = false;
    window.removeEventListener('popstate', surRetour);
    retirer();
  };
  const fermer = (): void => {
    if (entree) {
      entree = false;
      window.removeEventListener('popstate', surRetour);
      window.history.back();
    }
    retirer();
  };
  const ouvrir = (ecran: EcranCompte): void => {
    retirer();
    if (!entree) {
      window.history.pushState({ compteCalque: true }, '');
      entree = true;
      window.addEventListener('popstate', surRetour);
    }
    const voile = document.createElement('div');
    voile.className = 'compte-voile';
    voile.setAttribute('data-role', 'compte-voile');
    voile.setAttribute('role', 'dialog');
    voile.setAttribute('aria-modal', 'true');
    const main = document.createElement('main');
    voile.append(main);
    document.body.append(voile);
    document.body.classList.add('compte-voile-ouvert');
    monterCompte(main, {
      port: opts.port, local: opts.local, onglet: opts.onglet, ecran, versBoutique: fermer, enCalque: true,
      ...(opts.ouvrirSuivi !== undefined ? { ouvrirSuivi: (orderId: string, buyerRef: string) => { fermer(); opts.ouvrirSuivi?.(orderId, buyerRef); } } : {}),
    });
  };
  function poser(): void {
    placerBande(app, bande(sessionActive(opts.local, opts.onglet)?.prenom, ouvrir));
  }
  poser();
}

/**
 * COMPTE-CLIENTE-2 — « Mes commandes » learns each order she makes while
 * signed in: right after the create (single article) or once the payment
 * keeps them (a panier). Once per order per page, best effort and never
 * awaited — her order is already hers on the service; a missed link costs the
 * list one row, never the order. A guest's order is linked to nobody.
 */
export function creerRattacheur(
  port: ComptePort,
  local: Storage | undefined,
  onglet: Storage | undefined,
): (c: { readonly orderId: string; readonly buyerRef: string }) => void {
  const envoyes = new Set<string>();
  return (c) => {
    const g = sessionActive(local, onglet);
    if (g === undefined || envoyes.has(c.orderId)) return;
    envoyes.add(c.orderId);
    void port.commandes(g.session, [c]).catch(() => undefined);
  };
}
