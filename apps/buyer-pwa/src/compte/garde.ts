/**
 * COMPTE-CLIENTE — what this phone remembers of her account: her session
 * (the only thing that opens it), her first name (so the band can greet her
 * without a network read) and, since COMPTE-CLIENTE-2, her number (so the
 * checkout can fill it). Nothing else — her email and her family name live on
 * the service and are read on demand. The session never reaches the
 * DOM; it rides only the Bearer header of her own account doors.
 *
 * And, for the tab only, that she chose « Continuer sans compte »: she is not
 * asked again while she browses (a reload, the back button, « Voir la
 * boutique »), and is asked again the next time she opens a link.
 *
 * THE PAGE REMEMBERS FIRST, THE STORE SECOND (verifier BLOCKER 1). A phone
 * that keeps nothing — a WebView with storage off, a store that throws on every
 * write or on every read — must not turn the doors into a wall: her choice and
 * her session live in this page's memory the moment she makes them, and the
 * store only carries them to her next visit when it can. So a refused store
 * costs her the memory of her NEXT visit, never the step she just took. The
 * memory is kept per store object (the app hands the same one every time), so
 * two stores never share a record.
 */

const CLE_SESSION = 'sp-compte:v1';
const CLE_INVITEE = 'sp-compte-invitee:v1';
const SESSION = /^SPC-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/;

export interface SessionGardee {
  readonly session: string;
  readonly prenom: string;
  /** COMPTE-CLIENTE-2 — her number, so the checkout can fill it for her. Her
   *  own number on her own phone; read back from the service each time her
   *  profile opens. */
  readonly telephone?: string;
}

type Stockage = Storage | null | undefined;

/** `null` = signed out in this page, whatever the store still holds. */
const sessionsEnMemoire = new Map<Stockage, SessionGardee | null>();
const inviteesEnMemoire = new Set<Stockage>();

export function sessionGardee(stockage: Stockage): SessionGardee | undefined {
  if (sessionsEnMemoire.has(stockage)) return sessionsEnMemoire.get(stockage) ?? undefined;
  try {
    const brut = stockage?.getItem(CLE_SESSION);
    if (brut === null || brut === undefined) return undefined;
    const lu = JSON.parse(brut) as { session?: unknown; prenom?: unknown; telephone?: unknown };
    if (typeof lu.session !== 'string' || !SESSION.test(lu.session) || typeof lu.prenom !== 'string') return undefined;
    return { session: lu.session, prenom: lu.prenom, ...(typeof lu.telephone === 'string' ? { telephone: lu.telephone } : {}) };
  } catch {
    return undefined;
  }
}

export function garderSession(stockage: Stockage, g: SessionGardee): void {
  const record = { session: g.session, prenom: g.prenom, ...(g.telephone !== undefined ? { telephone: g.telephone } : {}) };
  sessionsEnMemoire.set(stockage, record);
  try {
    stockage?.setItem(CLE_SESSION, JSON.stringify(record));
  } catch {
    /* the store refused — this page still knows her */
  }
}

export function oublierSession(stockage: Stockage): void {
  sessionsEnMemoire.set(stockage, null);
  try {
    stockage?.removeItem(CLE_SESSION);
  } catch {
    /* nothing more to forget than the page already has */
  }
}

export function estInvitee(onglet: Stockage): boolean {
  if (inviteesEnMemoire.has(onglet)) return true;
  try {
    return onglet?.getItem(CLE_INVITEE) === '1';
  } catch {
    return false;
  }
}

export function marquerInvitee(onglet: Stockage): void {
  inviteesEnMemoire.add(onglet);
  try {
    onglet?.setItem(CLE_INVITEE, '1');
  } catch {
    /* the store refused — this page still carries her choice */
  }
}

/**
 * COMPTE-CLIENTE-2 — « RESTER CONNECTÉE SUR CE TÉLÉPHONE ». Kept, her session
 * lives in the phone's lasting store; not kept, only in this tab's store, and
 * closing the browser signs her out of this phone. Her session is whichever
 * of the two holds one — the lasting store first.
 */
export function sessionActive(local: Stockage, onglet: Stockage): SessionGardee | undefined {
  return sessionGardee(local) ?? sessionGardee(onglet);
}

/** Signing out forgets her in both stores — and every order still owed to her account. */
export function oublierSessions(local: Stockage, onglet: Stockage): void {
  oublierSession(local);
  oublierSession(onglet);
  for (const s of [local, onglet]) {
    try {
      s?.removeItem(CLE_LIENS);
      s?.removeItem(CLE_ARTICLES);
    } catch {
      /* nothing more to forget than the store will let go */
    }
  }
}

/**
 * ═══ MES-COMMANDES-PAYEES — AN ORDER OWED TO HER ACCOUNT, NOT YET IN IT ═══
 *
 * (Founder, 2026-09-24: « go with your recommendation ».) An order she makes
 * while signed in joins « Mes commandes » only once the service says her money
 * moved. Until then the phone keeps it here, beside her session and in the
 * SAME store (her « rester connectée » choice holds for it too), with the
 * session that made it: the link goes under THAT session, so it can only ever
 * reach her own account — a session signed out since is refused by the book,
 * and the owed link is dropped, never re-aimed at whoever is signed in now.
 * At most ten, newest first: the book's own bound for one call.
 */
const CLE_LIENS = 'sp-liens-dus:v1';
const LIENS_MAX = 10;

export interface LienDu {
  readonly orderId: string;
  readonly buyerRef: string;
  readonly session: string;
}

function lireLiens(s: Stockage): LienDu[] {
  try {
    const brut = s?.getItem(CLE_LIENS);
    if (brut === null || brut === undefined) return [];
    const lu = JSON.parse(brut) as unknown;
    if (!Array.isArray(lu)) return [];
    return lu.flatMap((x: unknown) => {
      const o = x !== null && typeof x === 'object' ? (x as Record<string, unknown>) : {};
      return typeof o['orderId'] === 'string' && o['orderId'] !== '' && typeof o['buyerRef'] === 'string' && o['buyerRef'] !== '' &&
        typeof o['session'] === 'string' && SESSION.test(o['session'])
        ? [{ orderId: o['orderId'], buyerRef: o['buyerRef'], session: o['session'] }]
        : [];
    });
  } catch {
    return [];
  }
}

function ecrireLiens(s: Stockage, liens: readonly LienDu[]): void {
  try {
    if (liens.length === 0) s?.removeItem(CLE_LIENS);
    else s?.setItem(CLE_LIENS, JSON.stringify(liens.map((l) => ({ orderId: l.orderId, buyerRef: l.buyerRef, session: l.session }))));
  } catch {
    /* the store refused — the page that made the order still holds it */
  }
}

/** Kept where her session lives — the lasting store first, as `rafraichirSession`. */
export function retenirLien(local: Stockage, onglet: Stockage, l: LienDu): void {
  const s = sessionGardee(local) !== undefined ? local : onglet;
  ecrireLiens(s, [l, ...lireLiens(s).filter((x) => x.orderId !== l.orderId)].slice(0, LIENS_MAX));
}

export function liensDus(local: Stockage, onglet: Stockage): readonly LienDu[] {
  return [...lireLiens(local), ...lireLiens(onglet)];
}

/**
 * MES-COMMANDES-PAYEES (verifier BLOCKER) — whose an order is, is decided ONCE,
 * at its first create in this tab: the account signed in then, or nobody. A
 * retried payment answers the same order again, and must never re-aim it at
 * whoever is signed in by then — so the tab remembers which orders it has
 * already decided, and that memory outlives a sign-out (it holds ids, no
 * session). The tab, because a retry can only come from the checkout that made
 * the order. At most ten, newest first, as the owed links.
 */
const CLE_DECIDEES = 'sp-commandes-decidees:v1';

function lireDecidees(onglet: Stockage): string[] {
  try {
    const lu = JSON.parse(onglet?.getItem(CLE_DECIDEES) ?? '[]') as unknown;
    return Array.isArray(lu) ? lu.filter((x): x is string => typeof x === 'string' && x !== '') : [];
  } catch {
    return [];
  }
}

export function decidee(onglet: Stockage, orderId: string): boolean {
  return lireDecidees(onglet).includes(orderId);
}

export function marquerDecidee(onglet: Stockage, orderId: string): void {
  try {
    onglet?.setItem(CLE_DECIDEES, JSON.stringify([orderId, ...lireDecidees(onglet).filter((x) => x !== orderId)].slice(0, LIENS_MAX)));
  } catch {
    /* the store refused — the page that made the order still knows */
  }
}

/**
 * MON-COMPTE-PLUS (canon 3.24.0) — WHAT CHANGED IN HER PANIER OR HER HEARTS ON
 * THIS PHONE, NOT YET TOLD TO HER ACCOUNT. Kept like the owed links: beside her
 * session, in the same store, with the session that saw it — and forgotten when
 * she signs out. One entry per article and list: the last change wins, so the
 * queue is what her account must end up holding, in the order she did it. At
 * most a hundred — fifty per list, the book's own bound — sent fifty to a call.
 */
const CLE_ARTICLES = 'sp-articles-dus:v1';
export const ARTICLES_DUS_MAX = 100;
const SLUG_OK = /^[a-z0-9-]{1,64}$/;
const PID_OK = /^[A-Za-z0-9][A-Za-z0-9_-]{0,191}$/;

export interface ArticleDu {
  readonly liste: 'panier' | 'favoris';
  readonly action: 'ajouter' | 'retirer';
  readonly slug: string;
  readonly pid: string;
  readonly session: string;
}

function lireArticlesDus(s: Stockage): ArticleDu[] {
  try {
    const lu = JSON.parse(s?.getItem(CLE_ARTICLES) ?? '[]') as unknown;
    if (!Array.isArray(lu)) return [];
    return lu.flatMap((x: unknown) => {
      const o = x !== null && typeof x === 'object' ? (x as Record<string, unknown>) : {};
      const liste = o['liste'];
      const action = o['action'];
      return (liste === 'panier' || liste === 'favoris') && (action === 'ajouter' || action === 'retirer') &&
        typeof o['slug'] === 'string' && SLUG_OK.test(o['slug']) && typeof o['pid'] === 'string' && PID_OK.test(o['pid']) &&
        typeof o['session'] === 'string' && SESSION.test(o['session'])
        ? [{ liste, action, slug: o['slug'], pid: o['pid'], session: o['session'] }]
        : [];
    });
  } catch {
    return [];
  }
}

function ecrireArticlesDus(s: Stockage, dus: readonly ArticleDu[]): void {
  try {
    if (dus.length === 0) s?.removeItem(CLE_ARTICLES);
    else s?.setItem(CLE_ARTICLES, JSON.stringify(dus.map((d) => ({ liste: d.liste, action: d.action, slug: d.slug, pid: d.pid, session: d.session }))));
  } catch {
    /* the store refused — the caller keeps the change in the page (retenirArticle says so) */
  }
}

const memeArticle = (a: ArticleDu, b: { liste: string; slug: string; pid: string }): boolean =>
  a.liste === b.liste && a.slug === b.slug && a.pid === b.pid;

/** Only a boutique and a product that the book will take are ever kept. */
export function articleValide(slug: string, pid: string): boolean {
  return SLUG_OK.test(slug) && PID_OK.test(pid);
}

/** Kept beside her session; false when the store refused it (the caller then keeps it in the page). */
export function retenirArticle(local: Stockage, onglet: Stockage, d: ArticleDu): boolean {
  const s = sessionGardee(local) !== undefined ? local : onglet;
  ecrireArticlesDus(s, [...lireArticlesDus(s).filter((x) => !memeArticle(x, d)), d].slice(-ARTICLES_DUS_MAX));
  return lireArticlesDus(s).some((x) => memeChangement(x, d));
}

/** The same change to the same article, owed the same session. */
export const memeChangement = (a: ArticleDu, b: ArticleDu): boolean =>
  memeArticle(a, b) && a.action === b.action && a.session === b.session;

export function articlesDus(local: Stockage, onglet: Stockage): readonly ArticleDu[] {
  return [...lireArticlesDus(local), ...lireArticlesDus(onglet)];
}

/** Told: those exact changes leave the queue (a newer change to the same article stays). */
export function oublierArticles(local: Stockage, onglet: Stockage, envoyes: readonly ArticleDu[]): void {
  for (const s of [local, onglet]) {
    const dus = lireArticlesDus(s);
    const reste = dus.filter((x) => !envoyes.some((e) => memeChangement(x, e)));
    if (reste.length !== dus.length) ecrireArticlesDus(s, reste);
  }
}

export function oublierLien(local: Stockage, onglet: Stockage, orderId: string): void {
  for (const s of [local, onglet]) {
    const liens = lireLiens(s);
    if (liens.some((l) => l.orderId === orderId)) ecrireLiens(s, liens.filter((l) => l.orderId !== orderId));
  }
}

/** A refreshed record (her profile read) goes back where the session lives. */
export function rafraichirSession(local: Stockage, onglet: Stockage, g: SessionGardee): void {
  garderSession(sessionGardee(local) !== undefined ? local : onglet, g);
}

