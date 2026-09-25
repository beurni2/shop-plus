import type { ComptePort } from './port';
import {
  articlesDus, articleValide, auCompte, marquerAuCompte, memeChangement, oublierArticles, retenirArticle, sessionActive,
  ARTICLES_DUS_MAX, type ArticleDu,
} from './garde';

/**
 * ═══ MON-COMPTE-PLUS — HER PANIER AND HER HEARTS FOLLOW HER ACCOUNT (canon 3.24.0) ═══
 *
 * Founder, 2026-09-25: « in their mon compte … see the products they added to
 * their cart from different resellers, and … products they liked » — « in her
 * account ». The panier and the hearts stay the phone's own stores (every
 * boutique page reads them exactly as before); while she is signed in, each
 * change is also told to her account, so « Mon compte » shows them from any
 * phone:
 *
 *   noter    — an article entered or left a panier, or a heart turned on or
 *              off, on this phone. Signed out: nothing is sent (a guest's taps
 *              are the phone's alone). Signed in: kept as owed, beside her
 *              session, then sent.
 *   joindre  — she just signed in (or up, or back in): what this phone kept
 *              while NO account was signed in joins her account — the standard
 *              « your panier stays yours when you sign in ». What was kept
 *              under an account already went to that account, and never joins
 *              another one (a shared phone: verifier BLOCKER).
 *   envoyer  — what is owed goes, under the session that saw it, fifty to a
 *              call until none is left; no network, or the book unable to
 *              answer, keeps it owed for the next try (the next change, or her
 *              next visit). A session ended since drops it: never re-aimed at
 *              whoever is signed in now.
 *
 * Only a boutique and a product ever travel — never a price, never a name.
 */
export interface SynchroArticles {
  noter(liste: 'panier' | 'favoris', slug: string, pid: string, present: boolean): void;
  joindre(articles: { readonly panier: readonly { slug: string; pid: string }[]; readonly favoris: readonly { slug: string; pid: string }[] }): void;
  envoyer(): void;
}

/** The book's own bounds: fifty operations to a call, fifty articles per list. */
const PAR_APPEL = 50;
const PAR_LISTE = 50;

export function creerSynchroArticles(port: ComptePort, local: Storage | undefined, onglet: Storage | undefined): SynchroArticles {
  let enVol = false;
  let encore = false;
  /** What the store refused to keep (storage blocked): owed while this page lives. */
  let page: ArticleDu[] = [];

  const dus = (): ArticleDu[] => [...articlesDus(local, onglet), ...page];
  const oublier = (envoyes: readonly ArticleDu[]): void => {
    oublierArticles(local, onglet, envoyes);
    page = page.filter((x) => !envoyes.some((e) => memeChangement(x, e)));
  };

  const envoyer = (): void => {
    if (enVol) {
      encore = true;
      return;
    }
    const g = sessionActive(local, onglet);
    const tous = dus();
    // Owed under a session no longer here: nobody's any more.
    const perimes = tous.filter((d) => d.session !== g?.session);
    if (perimes.length > 0) oublier(perimes);
    const siens = tous.filter((d) => d.session === g?.session);
    const lot = siens.slice(0, PAR_APPEL);
    if (g === undefined || lot.length === 0) return;
    enVol = true;
    void port.articles(g.session, lot.map((d) => ({ liste: d.liste, action: d.action, slug: d.slug, pid: d.pid }))).then(
      (r) => {
        enVol = false;
        const garder = r.kind === 'hors_ligne' ||
          (r.kind === 'refus' && (r.reason === 'indisponible' || r.reason === 'accounts_unavailable'));
        if (!garder) oublier(lot);
        // More owed than one call carries, or a change made while this was
        // out: it goes now — unless the network is the problem, in which case
        // the next change or visit tries again.
        const relancer = !garder && (encore || siens.length > lot.length);
        encore = false;
        if (relancer) envoyer();
      },
      () => {
        enVol = false;
        encore = false;
      },
    );
  };

  const retenir = (liste: 'panier' | 'favoris', slug: string, pid: string, present: boolean): boolean => {
    const g = sessionActive(local, onglet);
    if (g === undefined || !articleValide(slug, pid)) return false;
    const d: ArticleDu = { liste, action: present ? 'ajouter' : 'retirer', slug, pid, session: g.session };
    if (!retenirArticle(local, onglet, d)) {
      page = [...page.filter((x) => !(x.liste === d.liste && x.slug === d.slug && x.pid === d.pid)), d].slice(-ARTICLES_DUS_MAX);
    }
    return true;
  };

  return {
    noter(liste, slug, pid, present) {
      const signee = sessionActive(local, onglet) !== undefined;
      // Kept while an account is signed in ⇒ that account's; a guest's tap, or
      // a removal, belongs to no account.
      marquerAuCompte(local, liste, slug, pid, signee && present);
      if (retenir(liste, slug, pid, present)) envoyer();
    },
    joindre(articles) {
      let un = false;
      for (const liste of ['panier', 'favoris'] as const) {
        const libres = articles[liste].filter((a) => !auCompte(local, liste, a.slug, a.pid)).slice(-PAR_LISTE);
        for (const a of libres) {
          if (retenir(liste, a.slug, a.pid, true)) {
            marquerAuCompte(local, liste, a.slug, a.pid, true);
            un = true;
          }
        }
      }
      if (un) envoyer();
    },
    envoyer,
  };
}
