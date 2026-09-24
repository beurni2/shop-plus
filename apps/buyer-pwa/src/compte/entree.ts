import { t } from '../i18n';
import { verdictBande, type OrderOutcome } from '../cliente/quote-port';
import type { ComptePort } from './port';
import { decidee, estInvitee, liensDus, marquerDecidee, oublierLien, retenirLien, sessionActive, type LienDu } from './garde';
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
 * signed in. Best effort and never awaited — her order is already hers on the
 * service; a missed link costs the list one row, never the order. A guest's
 * order is linked to nobody.
 *
 * MES-COMMANDES-PAYEES (founder, 2026-09-24) — told at the create, it only
 * REMEMBERS the order as owed to the session signed in now (`retenirLien`);
 * told again with `payee` — the service said her money moved — it sends the
 * owed link, under that session, once per order per page. An order never paid
 * never joins her list. The page keeps what it was told too, so a store that
 * refuses every write costs the next visit, never the payment seen here.
 */
export type Rattacheur = (c: { readonly orderId: string; readonly buyerRef: string; readonly payee?: true }) => void;

export function creerRattacheur(
  port: ComptePort,
  local: Storage | undefined,
  onglet: Storage | undefined,
): Rattacheur {
  const envoyes = new Set<string>();
  const dus = new Map<string, LienDu>();
  const decidees = new Set<string>();
  return (c) => {
    if (c.payee !== true) {
      // The first create decides whose the order is; a retried payment answers
      // the same order again and never re-aims it (verifier BLOCKER).
      if (decidees.has(c.orderId) || decidee(onglet, c.orderId)) return;
      decidees.add(c.orderId);
      marquerDecidee(onglet, c.orderId);
      const g = sessionActive(local, onglet);
      if (g === undefined) return;
      const l = { orderId: c.orderId, buyerRef: c.buyerRef, session: g.session };
      dus.set(c.orderId, l);
      retenirLien(local, onglet, l);
      return;
    }
    // The page's copy stands in only for a store that refused, and only while
    // that session is still hers here: a sign-out forgets it (verifier minor 2).
    const memoire = dus.get(c.orderId);
    const l =
      liensDus(local, onglet).find((x) => x.orderId === c.orderId) ??
      (memoire !== undefined && memoire.session === sessionActive(local, onglet)?.session ? memoire : undefined);
    if (l === undefined || envoyes.has(c.orderId)) return;
    envoyes.add(c.orderId);
    void port
      .commandes(l.session, [{ orderId: l.orderId, buyerRef: l.buyerRef }])
      .then((r) => {
        // No network, or the book could not answer (a server error reads
        // « indisponible », verifier minor 3): still owed — the next « paid »
        // sight, or the next visit, sends it.
        if (r.kind === 'hors_ligne' || (r.kind === 'refus' && r.reason === 'indisponible')) {
          envoyes.delete(c.orderId);
          return;
        }
        // Linked, or the book answered by name (her session ended since): owed no more.
        dus.delete(c.orderId);
        oublierLien(local, onglet, c.orderId);
      })
      .catch(() => undefined);
  };
}

/**
 * MES-COMMANDES-PAYEES — the tab that paid may have closed before the operator
 * confirmed. On each visit, every order still owed asks the service once:
 * paid ⇒ it joins her list; failed or cancelled ⇒ owed no more; still waiting
 * or no answer ⇒ asked again next visit. The same rule as the band at the
 * head of her pages (`verdictBande`) — save one case: a payment that failed in
 * the tab still open stays owed, since « Réessayer » there answers the same
 * order and a late « failed » must not drop what the retry still needs
 * (verifier minor 4).
 */
export function lierLesCommandesDues(
  port: ComptePort,
  local: Storage | undefined,
  onglet: Storage | undefined,
  lireEtat: (orderId: string) => Promise<OrderOutcome>,
): void {
  const liens = liensDus(local, onglet);
  if (liens.length === 0) return;
  const rattacher = creerRattacheur(port, local, onglet);
  for (const l of liens) {
    void lireEtat(l.orderId).then((r) => {
      const verdict = verdictBande(r);
      const reessayable = r.status === 'order' && r.order.state === 'payment_failed' && decidee(onglet, l.orderId);
      if (verdict === 'oublier' && !reessayable) oublierLien(local, onglet, l.orderId);
      if (verdict === 'payee') rattacher({ orderId: l.orderId, buyerRef: l.buyerRef, payee: true });
    });
  }
}
