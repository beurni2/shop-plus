/**
 * ═══ COMPTE-CLIENTE — HER ACCOUNT, OVER THE WIRE (founder order 2026-09-24) ═══
 *
 * The four doors of the service's buyer account book: `/buyer/signup`,
 * `/buyer/login`, `/buyer/profile`, `/buyer/logout`. Every body is ONE literal
 * built from the door's exact allowlist, so no other key can ride from here.
 * Her session travels as a Bearer and nowhere else — never in a URL, never in
 * the DOM.
 *
 * NO DEMO ADAPTER, on purpose: an account that lived only in this browser
 * would tell her « your infos are safe » about a copy nobody keeps. Without a
 * configured service there is no account road at all ({@link resolveComptePort}
 * answers `undefined`) and her boutique opens exactly as before.
 */

export interface ProfilCliente {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly email?: string;
}

/** Every way a door can answer, named for what her screen says about it. */
export type Echec =
  | { readonly kind: 'refus'; readonly reason: string; readonly field?: string }
  | { readonly kind: 'hors_ligne' }
  | { readonly kind: 'session_perdue' };

export type Resultat<T> = { readonly kind: 'ok'; readonly value: T } | Echec;

export interface Inscription {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly password: string;
  readonly email?: string;
}

export interface PatchProfil {
  readonly firstName?: string;
  readonly lastName?: string;
  /** `''` clears it. */
  readonly email?: string;
  readonly currentPassword?: string;
  readonly newPassword?: string;
}

/** COMPTE-CLIENTE-2 — an order she made while signed in, as her account lists it. */
export interface CommandeCompte {
  readonly orderId: string;
  readonly buyerRef: string;
  readonly at: string;
}

export interface ComptePort {
  inscrire(i: Inscription): Promise<Resultat<{ profil: ProfilCliente; session: string }>>;
  connecter(phone: string, password: string): Promise<Resultat<{ profil: ProfilCliente; session: string }>>;
  lireProfil(session: string): Promise<Resultat<ProfilCliente>>;
  modifierProfil(session: string, patch: PatchProfil): Promise<Resultat<ProfilCliente>>;
  deconnecter(session: string): Promise<void>;
  /** COMPTE-CLIENTE-2 — the founder's code, her number and a new password. */
  recuperer(phone: string, code: string, newPassword: string): Promise<Resultat<{ profil: ProfilCliente; session: string }>>;
  /** « Mes commandes » — read, or add then read (at most ten added at once). */
  commandes(session: string, ajouter?: readonly { readonly orderId: string; readonly buyerRef: string }[]): Promise<Resultat<readonly CommandeCompte[]>>;
  supprimer(session: string, currentPassword: string): Promise<Resultat<true>>;
}

function lireCommandes(body: Record<string, unknown>): readonly CommandeCompte[] | undefined {
  const brut = body['commandes'];
  if (!Array.isArray(brut)) return undefined;
  const out: CommandeCompte[] = [];
  for (const c of brut) {
    const o = c as Record<string, unknown> | null;
    const orderId = texte(o?.['orderId']);
    const buyerRef = texte(o?.['buyerRef']);
    const at = texte(o?.['at']);
    if (orderId !== undefined && buyerRef !== undefined && at !== undefined) out.push({ orderId, buyerRef, at });
  }
  return out;
}

const texte = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** The profile off the wire — anything short of her three required fields is
 *  not a profile, and her screen says the door refused rather than draw blanks. */
export function lireProfilWire(body: unknown): ProfilCliente | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const firstName = texte(b['firstName']);
  const lastName = texte(b['lastName']);
  const phone = texte(b['phone']);
  if (firstName === undefined || lastName === undefined || phone === undefined) return undefined;
  const email = texte(b['email']);
  return { firstName, lastName, phone, ...(email !== undefined ? { email } : {}) };
}

/**
 * The profile read fires by itself when her profile opens, so it alone is
 * bounded in time (the delivery watch's law, quote-port.ts): a stalled socket
 * must end on the offline face with its « Réessayer », never on a skeleton
 * with nothing to press. Every other door here is a tap she can see busy.
 */
export const LECTURE_PROFIL_TIMEOUT_MS = 15_000;

export function httpComptePort(base: string): ComptePort {
  const appeler = async (chemin: string, corps: unknown, session?: string, delaiMs?: number): Promise<Response | null> => {
    const ctrl = delaiMs !== undefined && typeof AbortController === 'function' ? new AbortController() : null;
    const stall = ctrl === null ? null : setTimeout(() => ctrl.abort(), delaiMs);
    try {
      return await fetch(`${base}/buyer/${chemin}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session !== undefined ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(corps),
        ...(ctrl !== null ? { signal: ctrl.signal } : {}),
      });
    } catch {
      return null;
    } finally {
      if (stall !== null) clearTimeout(stall);
    }
  };
  const lire = async <T>(res: Response | null, extraire: (body: Record<string, unknown>) => T | undefined): Promise<Resultat<T>> => {
    if (res === null) return { kind: 'hors_ligne' };
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status === 401 && body?.['reason'] === 'no_session') return { kind: 'session_perdue' };
    if (!res.ok || body?.['ok'] !== true) {
      const reason = typeof body?.['reason'] === 'string' ? body['reason'] : 'indisponible';
      const field = typeof body?.['field'] === 'string' ? body['field'] : undefined;
      return { kind: 'refus', reason, ...(field !== undefined ? { field } : {}) };
    }
    const value = extraire(body);
    return value === undefined ? { kind: 'refus', reason: 'indisponible' } : { kind: 'ok', value };
  };
  const avecSession = (body: Record<string, unknown>) => {
    const profil = lireProfilWire(body);
    const session = texte(body['session']);
    return profil === undefined || session === undefined ? undefined : { profil, session };
  };
  return {
    async inscrire(i) {
      const corps = {
        firstName: i.firstName, lastName: i.lastName, phone: i.phone, password: i.password,
        ...(i.email !== undefined && i.email !== '' ? { email: i.email } : {}),
      };
      return lire(await appeler('signup', corps), avecSession);
    },
    async connecter(phone, password) {
      return lire(await appeler('login', { phone, password }), avecSession);
    },
    async lireProfil(session) {
      return lire(await appeler('profile', {}, session, LECTURE_PROFIL_TIMEOUT_MS), lireProfilWire);
    },
    async modifierProfil(session, patch) {
      const corps = {
        ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.currentPassword !== undefined ? { currentPassword: patch.currentPassword } : {}),
        ...(patch.newPassword !== undefined ? { newPassword: patch.newPassword } : {}),
      };
      return lire(await appeler('profile', corps, session), lireProfilWire);
    },
    async recuperer(phone, code, newPassword) {
      return lire(await appeler('recover', { phone, code, newPassword }), avecSession);
    },
    async commandes(session, ajouter) {
      const corps = ajouter !== undefined && ajouter.length > 0
        ? { ajouter: ajouter.slice(0, 10).map((c) => ({ orderId: c.orderId, buyerRef: c.buyerRef })) }
        : {};
      return lire(await appeler('orders', corps, session, LECTURE_PROFIL_TIMEOUT_MS), lireCommandes);
    },
    async supprimer(session, currentPassword) {
      return lire(await appeler('delete', { currentPassword }, session), () => true as const);
    },
    async deconnecter(session) {
      // Best effort: the phone forgets the session whatever the network says;
      // an unsent logout leaves a session that dies on its own idle clock.
      await appeler('logout', {}, session);
    },
  };
}

/** The real adapter iff a service base is configured at build time — else no
 *  account road at all (see the header). */
export function resolveComptePort(): ComptePort | undefined {
  const env = (import.meta as { env?: { VITE_STOREFRONT_BASE?: string } }).env;
  const base = env?.VITE_STOREFRONT_BASE;
  return base ? httpComptePort(base) : undefined;
}
