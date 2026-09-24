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
 * Every read and write is guarded (the `commandeGardee` law): a locked-down
 * webview or blocked storage degrades to « not signed in », never a crash.
 */

const CLE_SESSION = 'sp-compte:v1';
const CLE_INVITEE = 'sp-compte-invitee:v1';
const SESSION = /^SPC-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/;

export interface SessionGardee {
  readonly session: string;
  readonly prenom: string;
}

export function sessionGardee(stockage: Storage | undefined): SessionGardee | undefined {
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

export function garderSession(stockage: Storage | undefined, g: SessionGardee): void {
  try {
    stockage?.setItem(CLE_SESSION, JSON.stringify({ session: g.session, prenom: g.prenom }));
  } catch {
    /* storage refused — she stays signed in for this page only */
  }
}

export function oublierSession(stockage: Storage | undefined): void {
  try {
    stockage?.removeItem(CLE_SESSION);
  } catch {
    /* nothing to forget */
  }
}

export function estInvitee(onglet: Storage | undefined): boolean {
  try {
    return onglet?.getItem(CLE_INVITEE) === '1';
  } catch {
    return false;
  }
}

export function marquerInvitee(onglet: Storage | undefined): void {
  try {
    onglet?.setItem(CLE_INVITEE, '1');
  } catch {
    /* she may be asked again after a reload — never blocked */
  }
}
