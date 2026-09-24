/**
 * COMPTE-CLIENTE — what this phone remembers of her account: her session
 * (the only thing that opens it) and her first name (so the band can greet her
 * without a network read). Nothing else — her number, her email and her names
 * live on the service and are read on demand. The session never reaches the
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
    const lu = JSON.parse(brut) as { session?: unknown; prenom?: unknown };
    if (typeof lu.session !== 'string' || !SESSION.test(lu.session) || typeof lu.prenom !== 'string') return undefined;
    return { session: lu.session, prenom: lu.prenom };
  } catch {
    return undefined;
  }
}

export function garderSession(stockage: Stockage, g: SessionGardee): void {
  sessionsEnMemoire.set(stockage, { session: g.session, prenom: g.prenom });
  try {
    stockage?.setItem(CLE_SESSION, JSON.stringify({ session: g.session, prenom: g.prenom }));
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
