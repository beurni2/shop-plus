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
const ECHECS_PREFIX = 'echecs:'; // echecs:{sha256(cleAcheteur(phone))} · echecs:mdp:{accountId} · echecs:rec:{sha256(key)} → LoginFailures
const COMMANDES_PREFIX = 'commandes:'; // commandes:{accountId} → CommandeLiee[] (newest first)
const PANIER_PREFIX = 'panier:'; // panier:{accountId} → ArticleGarde[] (newest first)
const FAVORIS_PREFIX = 'favoris:'; // favoris:{accountId} → ArticleGarde[] (newest first)

/** COMPTE-CLIENTE-2 — a recovery code the founder mints lives this long. */
export const RECUPERATION_VIE_MS = 24 * 60 * 60 * 1000;
/** « Mes commandes » keeps her last fifty; older ones leave the list, never the service. */
export const COMMANDES_MAX = 50;
const REFERENCE = /^[A-Za-z0-9_:.-]{1,191}$/;

/** An order she made while signed in: enough to reopen its tracking from any
 *  phone — the order's id and her own read token for it. No amount, no
 *  product, no address; the order never reads this book. */
export interface CommandeLiee {
  readonly orderId: string;
  readonly buyerRef: string;
  readonly at: string;
}

/**
 * MON-COMPTE-PLUS (canon 3.24.0, SP6 « third ruling », SP-I05) — an article she
 * put in her panier or liked, as a boutique and a product: never a price, never
 * a name, never anything an order reads. « Mon compte » shows them by boutique,
 * from any phone. Each list keeps her last fifty — the bound of « Mes
 * commandes » — newest first, once each.
 */
export interface ArticleGarde {
  readonly slug: string;
  readonly pid: string;
  readonly at: string;
}
export const ARTICLES_MAX = COMMANDES_MAX;
/** The shapes the wish list already holds a boutique and a product to (wishlist-core.ts). */
const SLUG_ARTICLE = /^[a-z0-9-]{1,64}$/;
const PID_ARTICLE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,191}$/;
const LISTES_ARTICLES = { panier: PANIER_PREFIX, favoris: FAVORIS_PREFIX } as const;

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
  /** COMPTE-CLIENTE-2 — the founder's one-time recovery code, as SHA-256 only,
   *  and when it stops working. Absent when none is live. */
  readonly recoveryHash?: string;
  readonly recoveryExpiresAt?: string;
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

/** A recovery code as she heard it over the phone (verifier MAJOR 2): any
 *  case, any spaces or dashes, with or without « SPR » — read back to the
 *  one written form, or `''` when it cannot be one. */
function lireCode(v: unknown): string {
  if (typeof v !== 'string') return '';
  const net = v.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const corps = net.length === 19 && net.startsWith('SPR') ? net.slice(3) : net;
  if (corps.length !== 16) return '';
  return `SPR-${corps.slice(0, 4)}-${corps.slice(4, 8)}-${corps.slice(8, 12)}-${corps.slice(12)}`;
}

/** The salt a refused login derives against when there is no account to
 *  prove, so an unknown number costs the same derivation as a wrong password
 *  (verifier MINOR 1: 3–5 ms against 17–20 ms told them apart). */
const SEL_FACTICE = '5a17fac71ce0000000000000a55e7b1e';

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
      if (!(await this.essai(cleEchecs))) return refus('too_many_attempts', 429);

      const accountId = await this.state.storage.get<string>(`${TEL_PREFIX}${hashTel}`);
      const record = accountId === undefined ? undefined : await this.compte(accountId);
      if (accountId === undefined || record === undefined) {
        await derivePassword(password, SEL_FACTICE);
        return refus('bad_credentials', 401);
      }
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
        // A stolen session must not be a free way to guess her password (verifier
        // MINOR 2): the login's own count, per ACCOUNT, before any derivation.
        const cleEchecs = `${ECHECS_PREFIX}mdp:${record.accountId}`;
        if (!(await this.essai(cleEchecs))) return refus('too_many_attempts', 429);
        const derive = await derivePassword(actuel, record.passwordSaltHex, record.passwordIterations);
        if (!egaleConstante(derive, record.passwordHashHex)) return refus('bad_password', 401);
        await this.state.storage.delete(cleEchecs);
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

    /**
     * ═══ COMPTE-CLIENTE-2 — THE WAY BACK (founder order 2026-09-24) ═══
     *
     * A forgotten password, or a number someone else signed up with, used to
     * be for ever. Now the FOUNDER mints a one-time code for a NUMBER on his
     * console (key C, index.ts) and gives it by CALLING that number: whoever
     * answers that phone holds the number, which is the proof no signup could
     * ask for. She enters it with her names and a new password; the account
     * starts clean for her (see `/recover`), every session of it ends, hers
     * begins. The founder's door answers the code and nothing about her — no
     * name, no email.
     */
    if (pathname === '/recovery-code') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const phone = champ(body?.['phone'], 32);
      const cle = phone === null ? null : cleAcheteur(phone);
      if (cle === null || Object.keys(body ?? {}).length !== 1) return refus('bad_field', 400, 'phone');
      const code = mintToken('SPR');
      const recoveryHash = await sha256Hex(code);
      const accountId = await this.state.storage.get<string>(`${TEL_PREFIX}${await sha256Hex(cle)}`);
      const record = accountId === undefined ? undefined : await this.compte(accountId);
      if (record === undefined) return refus('no_account', 404);
      const recoveryExpiresAt = new Date(Date.now() + RECUPERATION_VIE_MS).toISOString();
      await this.state.storage.put(`${COMPTE_PREFIX}${record.accountId}`, { ...record, recoveryHash, recoveryExpiresAt } satisfies BuyerAccountRecord);
      return Response.json({ ok: true, code, expiresAt: recoveryExpiresAt });
    }

    if (pathname === '/recover') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return refus('malformed', 400);
      for (const key of Object.keys(body)) {
        if (!['phone', 'code', 'newPassword', 'firstName', 'lastName'].includes(key)) return refus('unknown_field', 400, key);
      }
      const firstName = champ(body['firstName'], NOM_MAX);
      if (firstName === null) return refus('bad_field', 400, 'firstName');
      const lastName = champ(body['lastName'], NOM_MAX);
      if (lastName === null) return refus('bad_field', 400, 'lastName');
      const nouveau = typeof body['newPassword'] === 'string' ? body['newPassword'] : '';
      if (nouveau.length < 8 || nouveau.length > MAX_FIELD) return refus('bad_field', 400, 'newPassword');
      const phone = champ(body['phone'], 32);
      const cle = phone === null ? null : cleAcheteur(phone);
      const code = lireCode(body['code']);
      // ONE refusal for an unknown number, a wrong code and a spent or expired
      // one — and ten per number per quarter hour, counted before the proof.
      if (phone === null || cle === null || code === '') return refus('bad_code', 401);
      const hashTel = await sha256Hex(cle);
      const presente = await sha256Hex(code);
      const cleEchecs = `${ECHECS_PREFIX}rec:${hashTel}`;
      if (!(await this.essai(cleEchecs))) return refus('too_many_attempts', 429);
      const saltHex = selNeuf();
      const hashNeuf = await derivePassword(nouveau, saltHex);
      const accountId = await this.state.storage.get<string>(`${TEL_PREFIX}${hashTel}`);
      const record = accountId === undefined ? undefined : await this.compte(accountId);
      const vivant =
        record?.recoveryHash !== undefined &&
        record.recoveryExpiresAt !== undefined &&
        Date.parse(record.recoveryExpiresAt) > Date.now() &&
        egaleConstante(presente, record.recoveryHash);
      if (record === undefined || !vivant) return refus('bad_code', 401);
      // Every hash is taken above, so the read, the check and the writes below
      // sit in storage-only turns (the input gate): a code is spent exactly once.
      // THE NUMBER STARTS CLEAN (safest default, verifier MAJOR 1 — the founder
      // may choose otherwise): the founder cannot tell « she forgot » from « a
      // stranger signed up with her number » or « a recycled SIM », so nothing
      // the previous holder left passes to whoever holds the number now — not
      // their names or email, and above all not the order list, whose read
      // tokens open tracking and, at the door, the drop code.
      const { recoveryHash: _code, recoveryExpiresAt: _fin, email: _email, ...reste } = record;
      const maj: BuyerAccountRecord = {
        ...reste, firstName, lastName, phone, createdAt: new Date().toISOString(),
        passwordSaltHex: saltHex, passwordHashHex: hashNeuf, passwordIterations: PBKDF2_ITERATIONS,
      };
      await this.state.storage.put(`${COMPTE_PREFIX}${maj.accountId}`, maj);
      await this.effacerAutresSessions(maj.accountId, '');
      const { session, ecritures } = await this.minterSession(maj.accountId);
      await this.state.storage.put(ecritures);
      await this.state.storage.delete([
        cleEchecs, `${ECHECS_PREFIX}${hashTel}`, `${ECHECS_PREFIX}mdp:${maj.accountId}`, `${COMMANDES_PREFIX}${maj.accountId}`,
        `${PANIER_PREFIX}${maj.accountId}`, `${FAVORIS_PREFIX}${maj.accountId}`,
      ]);
      return Response.json({ ...profil(maj), session });
    }

    /**
     * « MES COMMANDES » — the orders she made while signed in, so her tracking
     * opens from any phone. The app adds each order right after its create
     * (best effort, once); the order itself never reads this book. A body
     * with only `session` reads the list.
     */
    if (pathname === '/orders') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return refus('malformed', 400);
      for (const key of Object.keys(body)) {
        if (!['session', 'ajouter'].includes(key)) return refus('unknown_field', 400, key);
      }
      const ajouter: CommandeLiee[] = [];
      if (body['ajouter'] !== undefined) {
        const brut = body['ajouter'];
        if (!Array.isArray(brut) || brut.length > 10) return refus('bad_field', 400, 'ajouter');
        const at = new Date().toISOString();
        for (const c of brut) {
          const o = c as Record<string, unknown> | null;
          const orderId = o?.['orderId'];
          const buyerRef = o?.['buyerRef'];
          if (typeof orderId !== 'string' || !REFERENCE.test(orderId) || typeof buyerRef !== 'string' || !REFERENCE.test(buyerRef)) {
            return refus('bad_field', 400, 'ajouter');
          }
          ajouter.push({ orderId, buyerRef, at });
        }
      }
      const resolue = await this.resoudreSession(body['session']);
      if (resolue === null) return refus('no_session', 401);
      const cle = `${COMMANDES_PREFIX}${resolue.record.accountId}`;
      const avant = (await this.state.storage.get<CommandeLiee[]>(cle)) ?? [];
      if (ajouter.length === 0) return Response.json({ ok: true, commandes: avant });
      // Once each: against the list AND inside this one call.
      const neuves = ajouter.filter((c, i) => !avant.some((a) => a.orderId === c.orderId) && ajouter.findIndex((x) => x.orderId === c.orderId) === i);
      const liste = [...neuves.reverse(), ...avant].slice(0, COMMANDES_MAX);
      if (neuves.length > 0) await this.state.storage.put(cle, liste);
      return Response.json({ ok: true, commandes: liste });
    }

    /**
     * MON-COMPTE-PLUS — HER PANIER AND HER HEARTS, KEPT WITH HER ACCOUNT. The app
     * sends what changed on a phone while she was signed in — in order, each an
     * `ajouter` or a `retirer` of one boutique's product in one list — and reads
     * both lists back. A body with only `session` reads them. Every operation
     * is checked before anything is written: one bad one refuses the call.
     */
    if (pathname === '/articles') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return refus('malformed', 400);
      for (const key of Object.keys(body)) {
        if (!['session', 'operations'].includes(key)) return refus('unknown_field', 400, key);
      }
      const operations: { liste: keyof typeof LISTES_ARTICLES; ajouter: boolean; slug: string; pid: string }[] = [];
      if (body['operations'] !== undefined) {
        const brut = body['operations'];
        if (!Array.isArray(brut) || brut.length > ARTICLES_MAX) return refus('bad_field', 400, 'operations');
        for (const o of brut) {
          const op = o !== null && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
          const liste = op?.['liste'];
          const action = op?.['action'];
          const slug = op?.['slug'];
          const pid = op?.['pid'];
          if (
            op === null || Object.keys(op).some((k) => !['liste', 'action', 'slug', 'pid'].includes(k)) ||
            (liste !== 'panier' && liste !== 'favoris') || (action !== 'ajouter' && action !== 'retirer') ||
            typeof slug !== 'string' || !SLUG_ARTICLE.test(slug) || typeof pid !== 'string' || !PID_ARTICLE.test(pid)
          ) {
            return refus('bad_field', 400, 'operations');
          }
          operations.push({ liste, ajouter: action === 'ajouter', slug, pid });
        }
      }
      const resolue = await this.resoudreSession(body['session']);
      if (resolue === null) return refus('no_session', 401);
      const id = resolue.record.accountId;
      const listes = {
        panier: (await this.state.storage.get<ArticleGarde[]>(`${PANIER_PREFIX}${id}`)) ?? [],
        favoris: (await this.state.storage.get<ArticleGarde[]>(`${FAVORIS_PREFIX}${id}`)) ?? [],
      };
      const changees = new Set<keyof typeof LISTES_ARTICLES>();
      const at = new Date().toISOString();
      for (const op of operations) {
        const avant = listes[op.liste];
        const present = avant.some((a) => a.slug === op.slug && a.pid === op.pid);
        if (op.ajouter && !present) listes[op.liste] = [{ slug: op.slug, pid: op.pid, at }, ...avant].slice(0, ARTICLES_MAX);
        else if (!op.ajouter && present) listes[op.liste] = avant.filter((a) => !(a.slug === op.slug && a.pid === op.pid));
        else continue;
        changees.add(op.liste);
      }
      if (changees.size > 0) {
        await this.state.storage.put(Object.fromEntries([...changees].map((l) => [`${LISTES_ARTICLES[l]}${id}`, listes[l]])));
      }
      return Response.json({ ok: true, panier: listes.panier, favoris: listes.favoris });
    }

    /**
     * « SUPPRIMER MON COMPTE » — her account, every session, her order list and
     * her counters go, and her number is free again. Her orders themselves
     * are not touched: they live on the service, owed their delivery.
     */
    if (pathname === '/delete') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) return refus('malformed', 400);
      for (const key of Object.keys(body)) {
        if (!['session', 'currentPassword'].includes(key)) return refus('unknown_field', 400, key);
      }
      const resolue = await this.resoudreSession(body['session']);
      if (resolue === null) return refus('no_session', 401);
      const { record } = resolue;
      const actuel = typeof body['currentPassword'] === 'string' ? body['currentPassword'] : '';
      if (actuel === '') return refus('bad_field', 400, 'currentPassword');
      const cleEchecs = `${ECHECS_PREFIX}mdp:${record.accountId}`;
      if (!(await this.essai(cleEchecs))) return refus('too_many_attempts', 429);
      const derive = await derivePassword(actuel, record.passwordSaltHex, record.passwordIterations);
      if (!egaleConstante(derive, record.passwordHashHex)) return refus('bad_password', 401);
      const hashTel = await sha256Hex(cleAcheteur(record.phone) ?? '');
      await this.effacerAutresSessions(record.accountId, '');
      await this.state.storage.delete([
        `${COMPTE_PREFIX}${record.accountId}`,
        `${TEL_PREFIX}${hashTel}`,
        `${COMMANDES_PREFIX}${record.accountId}`,
        `${PANIER_PREFIX}${record.accountId}`,
        `${FAVORIS_PREFIX}${record.accountId}`,
        cleEchecs,
        `${ECHECS_PREFIX}${hashTel}`,
        `${ECHECS_PREFIX}rec:${hashTel}`,
      ]);
      return Response.json({ ok: true });
    }

    return refus('not_found', 404);
  }

  /**
   * COUNT FIRST, PROVE AFTER — the reseller book's throttle, one helper for
   * every door that checks a secret: read and written with only storage
   * between them, before any derivation; the caller deletes the key on
   * success. `false` once ten refusals stand inside the quarter hour. Every
   * call also sweeps up to fifty expired counters, so a flood on invented
   * numbers never stands for ever.
   */
  private async essai(cle: string): Promise<boolean> {
    const nowMs = Date.now();
    const echecs = await this.state.storage.get<LoginFailures>(cle);
    const dansLaFenetre = echecs !== undefined && nowMs - Date.parse(echecs.depuis) < LOGIN_FAIL_WINDOW_MS;
    if (dansLaFenetre && echecs.n >= LOGIN_FAIL_LIMIT) return false;
    await this.state.storage.put(cle, {
      n: dansLaFenetre ? echecs.n + 1 : 1,
      depuis: dansLaFenetre ? echecs.depuis : new Date(nowMs).toISOString(),
    } satisfies LoginFailures);
    const anciens = await this.state.storage.list<LoginFailures>({ prefix: ECHECS_PREFIX, limit: 50 });
    const expires = [...anciens].filter(([, v]) => nowMs - Date.parse(v.depuis) >= LOGIN_FAIL_WINDOW_MS).map(([k]) => k);
    if (expires.length > 0) await this.state.storage.delete(expires);
    return true;
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
