import type { ComptePort } from './port';
import { articlesDus, articleValide, oublierArticles, retenirArticle, sessionActive, type ArticleDu } from './garde';

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
 *              off, on this phone. Signed out: nothing (a guest's taps are the
 *              phone's alone). Signed in: kept as owed, beside her session,
 *              then sent.
 *   joindre  — she just signed in (or up, or back in): what this phone already
 *              kept joins her account — the standard « your panier stays yours
 *              when you sign in ».
 *   envoyer  — what is owed goes, under the session that saw it; no network,
 *              or the book unable to answer, keeps it owed for the next try
 *              (the next change, or her next visit). A session ended since
 *              drops it: never re-aimed at whoever is signed in now.
 *
 * Only a boutique and a product ever travel — never a price, never a name.
 */
export interface SynchroArticles {
  noter(liste: 'panier' | 'favoris', slug: string, pid: string, present: boolean): void;
  joindre(articles: { readonly panier: readonly { slug: string; pid: string }[]; readonly favoris: readonly { slug: string; pid: string }[] }): void;
  envoyer(): void;
}

export function creerSynchroArticles(port: ComptePort, local: Storage | undefined, onglet: Storage | undefined): SynchroArticles {
  let enVol = false;
  let encore = false;

  const envoyer = (): void => {
    if (enVol) {
      encore = true;
      return;
    }
    const g = sessionActive(local, onglet);
    const dus = articlesDus(local, onglet);
    // Owed under a session no longer here: nobody's any more.
    const perimes = dus.filter((d) => d.session !== g?.session);
    if (perimes.length > 0) oublierArticles(local, onglet, perimes);
    const lot = dus.filter((d) => d.session === g?.session).slice(0, 50);
    if (g === undefined || lot.length === 0) return;
    enVol = true;
    void port.articles(g.session, lot.map((d) => ({ liste: d.liste, action: d.action, slug: d.slug, pid: d.pid }))).then(
      (r) => {
        enVol = false;
        const garder = r.kind === 'hors_ligne' || (r.kind === 'refus' && r.reason === 'indisponible');
        if (!garder) oublierArticles(local, onglet, lot);
        // A change made while this was out goes now — unless the network is
        // the problem, in which case the next change or visit tries again.
        const relancer = encore && !garder;
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
    retenirArticle(local, onglet, d);
    return true;
  };

  return {
    noter(liste, slug, pid, present) {
      if (retenir(liste, slug, pid, present)) envoyer();
    },
    joindre(articles) {
      let un = false;
      for (const a of articles.panier) un = retenir('panier', a.slug, a.pid, true) || un;
      for (const a of articles.favoris) un = retenir('favoris', a.slug, a.pid, true) || un;
      if (un) envoyer();
    },
    envoyer,
  };
}
