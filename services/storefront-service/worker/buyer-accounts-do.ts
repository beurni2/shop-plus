import { cleAcheteur } from '@shop-plus/commerce-core';
import {
  champ,
  derivePassword,
  egaleConstante,
  idleMsDe,
  LOGIN_FAIL_LIMIT,
  LOGIN_FAIL_WINDOW_MS,
  MAX_FIELD,
  mintToken,
  PBKDF2_ITERATIONS,
  SESSION_TOUCH_MS,
  sha256Hex,
} from './reseller-accounts-do.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPTE-CLIENTE — THE BUYER'S OWN ACCOUNT BOOK (founder order 2026-09-24).
 * « I want buyers to be able as well to have their own account … make sure for
 * buyer who got an account has a profile section where his infos are there
 * and safe ». One singleton DO holds every buyer account, which is what makes
 * « one phone, one account » race-free: the object IS the lock.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * OFFERED, NEVER REQUIRED. A buyer still buys without creating anything (the
 * canon's « no account wall »): nothing on the order, the quote, the liste or
 * the tracking reads this book, and nothing here reads them.
 *
 * HER PHONE IS HER LOGIN, keyed exactly as the ladder keys her
 * (`cleAcheteur`): « 70 12 34 56 », « +226 70123456 » and « 0022670123456 »
 * are one woman and one account (the standing « same phone = same identity »).
 * The number shown back to her is the one she typed.
 *
 * ═══ HER INFORMATION STAYS IN THIS OBJECT ═══
 *
 * No seller, supplier, rider or founder road reads this book — the binding is
 * named in exactly one place in index.ts, the buyer's own doors, and a test
 * pins that. The password is stored only as PBKDF2 (the reseller book's own
 * derivation, count and salt discipline); sessions only as SHA-256; every
 * answer is `private, no-store`. Her profile crosses back to her alone, on her
 * own session.
 *
 * Built on the reseller book's proven pieces (its derivation, its token mint,
 * its constant-time compare, its session life and its login throttle) so the
 * two books cannot drift apart on the parts that keep an account safe.
 */

export const BUYER_ACCOUNTS_NAME = 'buyer-accounts';

const COMPTE_PREFIX = 'compte:'; // compte:{accountId} → BuyerAccountRecord
const TEL_PREFIX = 'tel:'; // tel:{sha256(cleAcheteur(phone))} → accountId
const SESSION_PREFIX = 'session:'; // session:{sha256(token)} → SessionRow
const SESSION_INDEX_PREFIX = 'sessions-of:'; // sessions-of:{accountId}:{sha256(token)} → issuedAt
const ECHECS_PREFIX = 'echecs:'; // echecs:{sha256(cleAcheteur(phone))} → LoginFailures

/** Her names are hers to write — long enough for « Ouédraogo-Kaboré », short
 *  enough that a name is not a document. */
const NOM_MAX = 60;

interface SessionRow {
  readonly accountId: string;
  readonly issuedAt: string;
  readonly lastSeenAt: string;
}

interface LoginFailures {
  readonly n: number;
  readonly depuis: string;
}

export interface BuyerAccountRecord {
  readonly accountId: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Optional at signup, and she may clear it later. */
  readonly email?: string;
  /** As she typed it (trimmed); the key is `cleAcheteur` of it. */
  readonly phone: string;
  readonly createdAt: string;
  readonly passwordSaltHex: string;
  readonly passwordHashHex: string;
  readonly passwordIterations: number;
}

/** What crosses back to her — never the salt, the hash or the id. */
function profil(r: BuyerAccountRecord): Record<string, unknown> {
  return {
    ok: true,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    ...(r.email !== undefined ? { email: r.email } : {}),
    createdAt: r.createdAt,
  };
}

const refus = (reason: string, status: number, field?: string): Response =>
  Response.json({ ok: false, reason, ...(field !== undefined ? { field } : {}) }, { status });

/** `undefined`/`''` → no email; anything else must look like one. */
function lireEmail(v: unknown): { email?: string } | null {
  if (v === undefined || (typeof v === 'string' && v.trim() === '')) return {};
  const email = champ(v)?.toLowerCase() ?? null;
  if (email === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { email };
}

const selNeuf = (): string =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

export class BuyerAccountsDO {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: { readonly SESSION_IDLE_MS?: string } = {},
  ) {}

  private async compte(accountId: string): Promise<BuyerAccountRecord | undefined> {
    return this.state.storage.get<BuyerAccountRecord>(`${COMPTE_PREFIX}${accountId}`);
  }

  /** A session and the index row that makes it revocable, as keys to write —
   *  the hash is taken HERE so the caller's read-then-write stays storage-only. */
  private async minterSession(accountId: string): Promise<{ session: string; ecritures: Record<string, unknown> }> {
    const session = mintToken('SPC');
    const hash = await sha256Hex(session);
    const now = new Date().toISOString();
    return {
      session,
      ecritures: {
        [`${SESSION_PREFIX}${hash}`]: { accountId, issuedAt: now, lastSeenAt: now } satisfies SessionRow,
        [`${SESSION_INDEX_PREFIX}${accountId}:${hash}`]: now,
      },
    };
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method !== 'POST') return refus('not_found', 404);

    if (pathname === '/signup') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return refus('malformed', 400);
      for (const key of Object.keys(body)) {
        if (!['firstName', 'lastName', 'email', 'phone', 'password'].includes(key)) return refus('unknown_field', 400, key);
      }
      const firstName = champ(body['firstName'], NOM_MAX);
      if (firstName === null) return refus('bad_field', 400, 'firstName');
      const lastName = champ(body['lastName'], NOM_MAX);
      if (lastName === null) return refus('bad_field', 400, 'lastName');
      const email = lireEmail(body['email']);
      if (email === null) return refus('bad_field', 400, 'email');
      const phone = champ(body['phone'], 32);
      const cle = phone === null ? null : cleAcheteur(phone);
      if (phone === null || cle === null) return refus('bad_field', 400, 'phone');
      const password = typeof body['password'] === 'string' ? body['password'] : '';
      if (password.length < 8 || password.length > MAX_FIELD) return refus('bad_field', 400, 'password');

      // EVERY derivation first, THEN the uniqueness read and the write with
      // only storage between them: the object's input gate holds across
      // storage awaits and opens on any other, so two signups for one phone
      // can no longer both pass the check before either writes.
      const cleTel = `${TEL_PREFIX}${await sha256Hex(cle)}`;
      const saltHex = selNeuf();
      const passwordHashHex = await derivePassword(password, saltHex);
      const accountId = mintToken('AC');
      const { session, ecritures } = await this.minterSession(accountId);
      if ((await this.state.storage.get(cleTel)) !== undefined) {
        // Named at signup, where « this number already has an account » is
        // the useful answer (she is sent to sign in); login stays mute.
        return refus('phone_taken', 409);
      }
      const record: BuyerAccountRecord = {
        accountId,
        firstName,
        lastName,
        ...email,
        phone,
        createdAt: new Date().toISOString(),
        passwordSaltHex: saltHex,
        passwordHashHex,
        passwordIterations: PBKDF2_ITERATIONS,
      };
      await this.state.storage.put({ [`${COMPTE_PREFIX}${accountId}`]: record, [cleTel]: accountId, ...ecritures });
      return Response.json({ ...profil(record), session });
    }

    if (pathname === '/login') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const phone = champ(body?.['phone'], 32);
      const cle = phone === null ? null : cleAcheteur(phone);
      const password = typeof body?.['password'] === 'string' ? body['password'] : '';
      // ONE refusal for every wrong way in: an unknown number and a wrong
      // password are indistinguishable, so this door is not a phone oracle.
      if (cle === null || password === '') return refus('bad_credentials', 401);
      // COUNT FIRST, PROVE AFTER — the reseller book's throttle, per phone key
      // whether or not it has an account, read and written before any
      // derivation (only storage awaits between them), deleted on success.
      const hashTel = await sha256Hex(cle);
      const cleEchecs = `${ECHECS_PREFIX}${hashTel}`;
      const nowMs = Date.now();
      const echecs = await this.state.storage.get<LoginFailures>(cleEchecs);
      const dansLaFenetre = echecs !== undefined && nowMs - Date.parse(echecs.depuis) < LOGIN_FAIL_WINDOW_MS;
      if (dansLaFenetre && echecs.n >= LOGIN_FAIL_LIMIT) return refus('too_many_attempts', 429);
      await this.state.storage.put(cleEchecs, {
        n: dansLaFenetre ? echecs.n + 1 : 1,
        depuis: dansLaFenetre ? echecs.depuis : new Date(nowMs).toISOString(),
      } satisfies LoginFailures);
      // Counters of a flood on invented numbers must not stand for ever.
      const anciens = await this.state.storage.list<LoginFailures>({ prefix: ECHECS_PREFIX, limit: 50 });
      const expires = [...anciens].filter(([, v]) => nowMs - Date.parse(v.depuis) >= LOGIN_FAIL_WINDOW_MS).map(([k]) => k);
      if (expires.length > 0) await this.state.storage.delete(expires);

      const accountId = await this.state.storage.get<string>(`${TEL_PREFIX}${hashTel}`);
      if (accountId === undefined) return refus('bad_credentials', 401);
      const record = await this.compte(accountId);
      if (record === undefined) return refus('bad_credentials', 401);
      const derive = await derivePassword(password, record.passwordSaltHex, record.passwordIterations);
      if (!egaleConstante(derive, record.passwordHashHex)) return refus('bad_credentials', 401);
      const { session, ecritures } = await this.minterSession(accountId);
      await this.state.storage.put(ecritures);
      await this.state.storage.delete(cleEchecs);
      return Response.json({ ...profil(record), session });
    }

    /** Her own way out. Unknown or already gone answers the same `ok`. */
    if (pathname === '/logout') {
      const body = (await request.json().catch(() => null)) as { session?: unknown } | null;
      if (typeof body?.session === 'string' && body.session !== '') {
        const hash = await sha256Hex(body.session);
        const row = await this.state.storage.get<SessionRow>(`${SESSION_PREFIX}${hash}`);
        if (row !== undefined) {
          await this.state.storage.delete([`${SESSION_PREFIX}${hash}`, `${SESSION_INDEX_PREFIX}${row.accountId}:${hash}`]);
        }
      }
      return Response.json({ ok: true });
    }

    /**
     * HER PROFILE — a body with only `session` READS it; any present field
     * PATCHES it with exactly the signup validators, and ABSENT MEANS
     * UNTOUCHED. `email: ''` clears her email (it was optional at signup, so
     * removing it is a choice she may make). Her phone is her login and is
     * not changed here: a stolen phone with a live session must not be able
     * to move her account to another number.
     *
     * A new password needs the CURRENT one, and cuts every other session of
     * the account in the same act — the phone in her hand stays in.
     */
    if (pathname === '/profile') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return refus('malformed', 400);
      for (const key of Object.keys(body)) {
        if (!['session', 'firstName', 'lastName', 'email', 'currentPassword', 'newPassword'].includes(key)) {
          return refus('unknown_field', 400, key);
        }
      }
      const resolue = await this.resoudreSession(body['session']);
      if (resolue === null) return refus('no_session', 401);
      const { record, hash: sessionHash } = resolue;

      const patch: { firstName?: string; lastName?: string; email?: string; retirerEmail?: true } = {};
      if (body['firstName'] !== undefined) {
        const v = champ(body['firstName'], NOM_MAX);
        if (v === null) return refus('bad_field', 400, 'firstName');
        patch.firstName = v;
      }
      if (body['lastName'] !== undefined) {
        const v = champ(body['lastName'], NOM_MAX);
        if (v === null) return refus('bad_field', 400, 'lastName');
        patch.lastName = v;
      }
      if (body['email'] !== undefined) {
        const e = lireEmail(body['email']);
        if (e === null) return refus('bad_field', 400, 'email');
        if (e.email === undefined) patch.retirerEmail = true;
        else patch.email = e.email;
      }
      let nouveauMotDePasse: { passwordSaltHex: string; passwordHashHex: string; passwordIterations: number } | null = null;
      if (body['currentPassword'] !== undefined || body['newPassword'] !== undefined) {
        const actuel = typeof body['currentPassword'] === 'string' ? body['currentPassword'] : '';
        const nouveau = typeof body['newPassword'] === 'string' ? body['newPassword'] : '';
        if (actuel === '') return refus('bad_field', 400, 'currentPassword');
        if (nouveau.length < 8 || nouveau.length > MAX_FIELD) return refus('bad_field', 400, 'newPassword');
        const derive = await derivePassword(actuel, record.passwordSaltHex, record.passwordIterations);
        if (!egaleConstante(derive, record.passwordHashHex)) return refus('bad_password', 401);
        const saltHex = selNeuf();
        nouveauMotDePasse = { passwordSaltHex: saltHex, passwordHashHex: await derivePassword(nouveau, saltHex), passwordIterations: PBKDF2_ITERATIONS };
      }

      // The derivations above are non-storage awaits, so another save on this
      // account may have landed since the session read: the patch is applied
      // to a RE-READ record, and a password change only if the hash it just
      // proved is still the hash on it.
      const frais = await this.compte(record.accountId);
      if (frais === undefined) return refus('no_session', 401);
      if (nouveauMotDePasse !== null && frais.passwordHashHex !== record.passwordHashHex) return refus('bad_password', 401);
      const { email: _ancien, ...sansEmail } = frais;
      const base: BuyerAccountRecord = patch.retirerEmail === true ? sansEmail : frais;
      const maj: BuyerAccountRecord = {
        ...base,
        ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(nouveauMotDePasse ?? {}),
      };
      const change = Object.keys(patch).length > 0 || nouveauMotDePasse !== null;
      if (change) {
        await this.state.storage.put(`${COMPTE_PREFIX}${maj.accountId}`, maj);
        if (nouveauMotDePasse !== null) await this.effacerAutresSessions(maj.accountId, sessionHash);
      }
      return Response.json(profil(maj));
    }

    return refus('not_found', 404);
  }

  private async effacerAutresSessions(accountId: string, sauf: string): Promise<void> {
    const index = await this.state.storage.list<string>({ prefix: `${SESSION_INDEX_PREFIX}${accountId}:` });
    const cles: string[] = [];
    for (const cle of index.keys()) {
      const hash = cle.slice(`${SESSION_INDEX_PREFIX}${accountId}:`.length);
      if (hash === sauf) continue;
      cles.push(`${SESSION_PREFIX}${hash}`, cle);
    }
    if (cles.length > 0) await this.state.storage.delete(cles);
  }

  /** The reseller book's session life: refused and swept once idle past the
   *  life, touched at most once an hour while in use. */
  private async resoudreSession(presented: unknown): Promise<{ record: BuyerAccountRecord; hash: string } | null> {
    if (typeof presented !== 'string' || presented === '') return null;
    const hash = await sha256Hex(presented);
    const cle = `${SESSION_PREFIX}${hash}`;
    const row = await this.state.storage.get<SessionRow>(cle);
    if (row === undefined) return null;
    const nowMs = Date.now();
    const idle = idleMsDe(this.env);
    if (nowMs - Date.parse(row.lastSeenAt) > idle) {
      await this.state.storage.delete([cle, `${SESSION_INDEX_PREFIX}${row.accountId}:${hash}`]);
      return null;
    }
    if (nowMs - Date.parse(row.lastSeenAt) > Math.min(SESSION_TOUCH_MS, Math.floor(idle / 4))) {
      await this.state.storage.put(cle, { ...row, lastSeenAt: new Date(nowMs).toISOString() } satisfies SessionRow);
    }
    const record = await this.compte(row.accountId);
    return record === undefined ? null : { record, hash };
  }
}
