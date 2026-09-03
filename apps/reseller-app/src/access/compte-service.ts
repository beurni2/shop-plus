/**
 * RESELLER-ACCOUNTS-1d — the app's client to the account book (canon v3.8.0).
 *
 * FOUNDER FLOW, verbatim order 2026-08-04: « a reseller creates his own
 * account with his credentials and gets an account with an account id, and
 * after he passes the sign up screen … he is now block[ed] on the new screen
 * asking for the access code to fully get inside of the app ».
 *
 * Same base as the feed (`EXPO_PUBLIC_STOREFRONT_BASE` — the account routes
 * live on the same storefront Worker). No key: signup and login are public
 * doors like checkout; the SESSION the Worker answers with becomes the app's
 * one bearer, stored in the same durable store the feed reads — so « Mes
 * ventes » and « Mes gains » ride her account with zero changes of their own.
 *
 * THE PASSWORD CROSSES ONCE, at signup and at login, over TLS, and is never
 * stored on the device — only the session token is. There is nothing here to
 * mask or to forget.
 */

import type { CodeStore } from '../sales/use-ventes-reelles';

export type EtatAcces = 'pending_access' | 'active' | 'paused';

/** What the device remembers about HER — never a credential. */
export interface CompteLocal {
  readonly accountId: string;
  readonly name: string;
  readonly state: EtatAcces;
  /** RAYONS-REVENDEUR-1 — the up-to-five categories she chose at signup.
   *  Absent = no choice = Opportunités shows everything (the pre-slice
   *  screen). Wire values verbatim; refreshed with every session read. */
  readonly categories?: readonly string[];
}

export type InscriptionResult =
  | { readonly ok: true; readonly compte: CompteLocal; readonly session: string }
  | {
      readonly ok: false;
      readonly reason: 'email_pris' | 'champ_invalide' | 'unreachable';
      readonly field?: string;
    };

export type ConnexionResult =
  | { readonly ok: true; readonly compte: CompteLocal; readonly session: string }
  | { readonly ok: false; readonly reason: 'refuse' | 'unreachable' };

export type AdmissionResult =
  | { readonly ok: true }
  /** RESELLER-PILOTE-1 — `pilote_complet`: the book seats one reseller while
   *  writes ride the shared key; her account is PENDING, not cut, and her
   *  code is unspent. A screen must never read it as the founder's pause. */
  | { readonly ok: false; readonly reason: 'code_refuse' | 'acces_coupe' | 'pilote_complet' | 'unreachable' };

export type SessionResult =
  | { readonly ok: true; readonly compte: CompteLocal }
  | { readonly ok: false; readonly reason: 'invalide' | 'unreachable' };

/** PROFIL-REVENDEUR-1 — the full registration data, HERS to reread: the one
 *  answer that carries email and phone back (the session read never does). */
export interface ProfilCompte extends CompteLocal {
  readonly email: string;
  readonly phone: string;
}

/** Absent means untouched — each section of the screen sends ONLY its own
 *  fields. `categories: []` clears her rayons (an edit-screen choice, not a
 *  skipped field). */
export interface ProfilPatch {
  readonly name?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly categories?: readonly string[];
  readonly currentPassword?: string;
  readonly newPassword?: string;
}

export type ProfilResult =
  | { readonly ok: true; readonly profil: ProfilCompte }
  | {
      readonly ok: false;
      readonly reason: 'invalide' | 'coupe' | 'email_pris' | 'champ_invalide' | 'mdp_refuse' | 'unreachable';
      readonly field?: string;
    };

export interface CompteServicePort {
  inscrire(d: { name: string; email: string; phone: string; password: string; categories?: readonly string[] }): Promise<InscriptionResult>;
  connecter(email: string, password: string): Promise<ConnexionResult>;
  admission(session: string, code: string): Promise<AdmissionResult>;
  /** The background refresh — how a pause reaches a device that is already in. */
  session(session: string): Promise<SessionResult>;
  /** PROFIL-REVENDEUR-1 — read with an empty patch, save with a sectioned one. */
  profil(session: string, patch?: ProfilPatch): Promise<ProfilResult>;
}

const COMPTE_TIMEOUT_MS = 12_000;
const ETATS: readonly string[] = ['pending_access', 'active', 'paused'];

function lireCompte(body: Record<string, unknown> | null): CompteLocal | null {
  const accountId = body?.['accountId'];
  const name = body?.['name'];
  const state = body?.['state'];
  if (typeof accountId !== 'string' || accountId === '') return null;
  if (typeof name !== 'string') return null;
  if (typeof state !== 'string' || !ETATS.includes(state)) return null;
  // RAYONS-REVENDEUR-1 — defensively: a well-shaped small list of short
  // strings rides; anything else is treated as « no choice », never a crash
  // (this parses server answers AND the on-disk compte file).
  const rawCats = body?.['categories'];
  const categories =
    Array.isArray(rawCats) && rawCats.length <= 5 && rawCats.every((c) => typeof c === 'string' && c.trim() !== '' && c.length <= 64)
      ? (rawCats as readonly string[]).map((c) => c.trim())
      : undefined;
  return { accountId, name, state: state as EtatAcces, ...(categories !== undefined && categories.length > 0 ? { categories } : {}) };
}

export function resolveCompteService(): CompteServicePort | null {
  const base = process.env.EXPO_PUBLIC_STOREFRONT_BASE;
  if (base === undefined || base === '') return null;
  const trimmed = base.replace(/\/+$/, '');

  async function appel(chemin: string, init: RequestInit, bearer?: string) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), COMPTE_TIMEOUT_MS);
    try {
      const res = await fetch(`${trimmed}${chemin}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` }),
        },
        signal: ctl.signal,
      });
      return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async inscrire(d): Promise<InscriptionResult> {
      // EXACTLY the fields the Worker's allowlist admits — a stray one would
      // be refused by name server-side, and rightly. `categories` rides only
      // when she chose some (RAYONS-REVENDEUR-1).
      const res = await appel('/reseller/signup', {
        method: 'POST',
        body: JSON.stringify({
          name: d.name,
          email: d.email,
          phone: d.phone,
          password: d.password,
          ...(d.categories !== undefined && d.categories.length > 0 ? { categories: d.categories } : {}),
        }),
      });
      if (res === null) return { ok: false, reason: 'unreachable' };
      if (res.status === 409) return { ok: false, reason: 'email_pris' };
      if (res.status === 400) {
        const field = res.body?.['field'];
        return { ok: false, reason: 'champ_invalide', ...(typeof field === 'string' ? { field } : {}) };
      }
      const compte = lireCompte(res.body);
      const session = res.body?.['session'];
      if (res.status !== 200 || compte === null || typeof session !== 'string' || session === '') {
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: true, compte, session };
    },

    async connecter(email, password): Promise<ConnexionResult> {
      const res = await appel('/reseller/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (res === null) return { ok: false, reason: 'unreachable' };
      // ONE refusal, whatever the cause — the server is deliberately not an
      // email oracle and this client does not reconstruct one.
      if (res.status === 401) return { ok: false, reason: 'refuse' };
      const compte = lireCompte(res.body);
      const session = res.body?.['session'];
      if (res.status !== 200 || compte === null || typeof session !== 'string' || session === '') {
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: true, compte, session };
    },

    async admission(session, code): Promise<AdmissionResult> {
      const res = await appel('/reseller/admission', { method: 'POST', body: JSON.stringify({ code }) }, session);
      if (res === null) return { ok: false, reason: 'unreachable' };
      // Two 403s, told apart BY NAME: the pilot ceiling leaves her pending
      // (RESELLER-PILOTE-1); anything else at 403 is the founder's pause.
      if (res.status === 403) {
        return { ok: false, reason: res.body?.['reason'] === 'plafond_pilote' ? 'pilote_complet' : 'acces_coupe' };
      }
      if (res.status === 401) return { ok: false, reason: 'code_refuse' };
      if (res.status !== 200 || res.body?.['ok'] !== true) return { ok: false, reason: 'unreachable' };
      return { ok: true };
    },

    async session(session): Promise<SessionResult> {
      const res = await appel('/reseller/session', { method: 'POST', body: '{}' }, session);
      if (res === null) return { ok: false, reason: 'unreachable' };
      if (res.status === 401) return { ok: false, reason: 'invalide' };
      const compte = lireCompte(res.body);
      if (res.status !== 200 || compte === null) return { ok: false, reason: 'unreachable' };
      return { ok: true, compte };
    },

    async profil(session, patch = {}): Promise<ProfilResult> {
      // JSON.stringify drops undefined properties, so the wire carries EXACTLY
      // the section being saved — the server's absent-means-untouched contract.
      const res = await appel('/reseller/profile', { method: 'POST', body: JSON.stringify(patch) }, session);
      if (res === null) return { ok: false, reason: 'unreachable' };
      // 401 wears two faces: a dead session, and a wrong CURRENT password on a
      // password change — the second must speak as itself or she would be told
      // to log back in when her session is fine.
      if (res.status === 401) {
        return { ok: false, reason: res.body?.['reason'] === 'bad_password' ? 'mdp_refuse' : 'invalide' };
      }
      if (res.status === 403) return { ok: false, reason: 'coupe' };
      if (res.status === 409) return { ok: false, reason: 'email_pris' };
      if (res.status === 400) {
        const field = res.body?.['field'];
        return { ok: false, reason: 'champ_invalide', ...(typeof field === 'string' ? { field } : {}) };
      }
      const compte = lireCompte(res.body);
      const email = res.body?.['email'];
      const phone = res.body?.['phone'];
      if (res.status !== 200 || compte === null || typeof email !== 'string' || typeof phone !== 'string') {
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: true, profil: { ...compte, email, phone } };
    },
  };
}

/* ── what the device remembers, durable like the identity ── */

export interface CompteStore {
  read(): Promise<CompteLocal | null>;
  write(compte: CompteLocal): Promise<void>;
  clear(): Promise<void>;
}

/** Pure serialization over any CodeStore-shaped text file, so tests run
 *  without a filesystem and the native store stays three lines. */
export function compteStoreSur(texte: {
  read(): Promise<string | null>;
  write(v: string): Promise<void>;
}): CompteStore {
  return {
    async read(): Promise<CompteLocal | null> {
      const raw = await texte.read().catch(() => null);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return lireCompte(parsed);
      } catch {
        return null; // unreadable = no account known; the door decides honestly
      }
    },
    async write(compte: CompteLocal): Promise<void> {
      await texte.write(JSON.stringify(compte)).catch(() => undefined);
    },
    async clear(): Promise<void> {
      await texte.write('').catch(() => undefined);
    },
  };
}

export type { CodeStore };
