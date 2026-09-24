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

export interface ComptePort {
  inscrire(i: Inscription): Promise<Resultat<{ profil: ProfilCliente; session: string }>>;
  connecter(phone: string, password: string): Promise<Resultat<{ profil: ProfilCliente; session: string }>>;
  lireProfil(session: string): Promise<Resultat<ProfilCliente>>;
  modifierProfil(session: string, patch: PatchProfil): Promise<Resultat<ProfilCliente>>;
  deconnecter(session: string): Promise<void>;
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

export function httpComptePort(base: string): ComptePort {
  const appeler = async (chemin: string, corps: unknown, session?: string): Promise<Response | null> => {
    try {
      return await fetch(`${base}/buyer/${chemin}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session !== undefined ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(corps),
      });
    } catch {
      return null;
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
      return lire(await appeler('profile', {}, session), lireProfilWire);
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
