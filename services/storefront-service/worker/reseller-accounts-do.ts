import {
  ResellerAccessChangeSchema,
  type ResellerAccessActor,
  type ResellerAccessState,
} from '@platform/contracts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESELLER-ACCOUNTS-1b — THE ACCOUNT BOOK (canon v3.8.0; founder order
 * 2026-08-04). One singleton DO holds every reseller account, which is what
 * makes email uniqueness and id minting race-free: the object IS the lock.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE FLOW, exactly as the founder described it:
 *   1. She signs up herself — name, email, password, phone (founder override
 *      of the plan's phone-alias, logged). The account exists at once, id
 *      minted HERE, server-side — never on a handset — state `pending_access`.
 *   2. She is blocked on the admission screen until she enters the one-time
 *      access code the founder minted for HER account on his console.
 *   3. Admitted (`active`), nothing inside the app ever asks again.
 *   4. The founder can pause any account; paused means every authenticated
 *      read on this Worker refuses BY NAME — never a client-side hidden button.
 *
 * ═══ CREDENTIALS NEVER LEAVE THIS OBJECT ═══
 *
 * The password is stored as PBKDF2-SHA-256 (CSPRNG salt, 60 000 iterations —
 * WebCrypto is the only primitive a Worker has; deterministic, allowed: the
 * Ten-Laws #5 ban is on learned/generative logic, not on cryptography).
 * Sessions and admission codes are stored ONLY as SHA-256, the same discipline
 * as every other code book on this Worker. The canon payload shape is strict,
 * so no credential can even be EXPRESSED on the audit trail (pinned in canon).
 *
 * ═══ THE ID IS MINTED HERE, AND IT IS rs-{4 digits} ON PURPOSE ═══
 *
 * The whole downstream world — storefront ownership, listing identity, the
 * locked Order.resellerId, the feed index, reputation linkage — speaks
 * `rs-{4 digits}` (`identityFromDigits`). Minting the SAME shape server-side
 * (uniqueness checked in this book) means an account plugs into everything
 * that exists without touching one money path. The 10 000-id ceiling is real
 * and journalled; it is a pilot-scale ceiling, not a forever one.
 */

export const RESELLER_ACCOUNTS_NAME = 'reseller-accounts';

const ACCOUNT_PREFIX = 'account:'; // account:{accountId} → AccountRecord
const EMAIL_PREFIX = 'email:'; // email:{sha256(lowercased email)} → accountId
const SESSION_PREFIX = 'session:'; // session:{sha256(token)} → accountId
const AUDIT_PREFIX = 'audit:'; // audit:{accountId}:{isoAt} → canon change row

export interface AccountRecord {
  readonly accountId: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly state: ResellerAccessState;
  readonly createdAt: string;
  readonly passwordSaltHex: string;
  readonly passwordHashHex: string;
  /** SHA-256 of the one-time admission code, present only while one is live. */
  readonly accessCodeHash?: string;
}

/** The roster row the console reads — NEVER the record itself: no salt, no
 *  hash, no code hash crosses even the founder's wire. */
export interface AccountView {
  readonly accountId: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly state: ResellerAccessState;
  readonly createdAt: string;
  /** TRUE while an unconsumed admission code exists for this account. */
  readonly accessCodePending: boolean;
}

function toView(a: AccountRecord): AccountView {
  return {
    accountId: a.accountId,
    name: a.name,
    email: a.email,
    phone: a.phone,
    state: a.state,
    createdAt: a.createdAt,
    accessCodePending: a.accessCodeHash !== undefined,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PBKDF2_ITERATIONS = 60_000;

async function derivePassword(password: string, saltHex: string): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time hex compare — a mismatch costs the same as a match. */
function egaleConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Same base32-over-CSPRNG mint the feed codes use; its own prefix so one look
 *  says which door a code opens (SP- feed · SPA- admission · SPS- session). */
function mintToken(prefix: string): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.getRandomValues(new Uint8Array(10)); // 80 bits
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `${prefix}-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

const MAX_FIELD = 191;

function champ(v: unknown, max = MAX_FIELD): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' || t.length > max ? null : t;
}

export class ResellerAccountsDO {
  constructor(private readonly state: DurableObjectState) {}

  private async compte(accountId: string): Promise<AccountRecord | undefined> {
    return this.state.storage.get<AccountRecord>(`${ACCOUNT_PREFIX}${accountId}`);
  }

  /** The audit trail IS the canon event payload, parsed before it is written —
   *  the founder-approved four fields and nothing else can land here. */
  private async consigner(accountId: string, state: ResellerAccessState, by: ResellerAccessActor): Promise<string> {
    const at = new Date().toISOString();
    const row = ResellerAccessChangeSchema.parse({ accountId, state, at, by });
    await this.state.storage.put(`${AUDIT_PREFIX}${accountId}:${at}`, row);
    return at;
  }

  /** Mint an UNUSED rs-{4 digits}. The book is the uniqueness lock. The 10 000
   *  ceiling is a pilot ceiling, journalled; refusal beats a silent collision. */
  private async minterId(): Promise<string | null> {
    for (let i = 0; i < 40; i += 1) {
      const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 10_000;
      const id = `rs-${String(n).padStart(4, '0')}`;
      if ((await this.compte(id)) === undefined) return id;
    }
    return null;
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    /* ── PUBLIC (routed through index.ts without a key, like checkout) ────── */

    if (request.method === 'POST' && pathname === '/signup') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      for (const key of Object.keys(body)) {
        if (!['name', 'email', 'phone', 'password'].includes(key)) {
          return Response.json({ ok: false, reason: 'unknown_field', field: key }, { status: 400 });
        }
      }
      const name = champ(body['name'], 120);
      const email = champ(body['email'])?.toLowerCase() ?? null;
      const phone = champ(body['phone'], 32);
      const password = typeof body['password'] === 'string' ? body['password'] : '';
      if (name === null) return Response.json({ ok: false, reason: 'bad_field', field: 'name' }, { status: 400 });
      if (email === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Response.json({ ok: false, reason: 'bad_field', field: 'email' }, { status: 400 });
      }
      if (phone === null || phone.replace(/\D/g, '').length < 8) {
        return Response.json({ ok: false, reason: 'bad_field', field: 'phone' }, { status: 400 });
      }
      if (password.length < 8 || password.length > MAX_FIELD) {
        return Response.json({ ok: false, reason: 'bad_field', field: 'password' }, { status: 400 });
      }

      const emailKey = `${EMAIL_PREFIX}${await sha256Hex(email)}`;
      if ((await this.state.storage.get(emailKey)) !== undefined) {
        // Named, not an oracle problem: signup is where « this email already
        // has an account » is the USEFUL answer (login is where we stay mute).
        return Response.json({ ok: false, reason: 'email_taken' }, { status: 409 });
      }

      const accountId = await this.minterId();
      if (accountId === null) return Response.json({ ok: false, reason: 'ids_exhausted' }, { status: 503 });

      const saltHex = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const passwordHashHex = await derivePassword(password, saltHex);
      const createdAt = new Date().toISOString();
      const record: AccountRecord = {
        accountId, name, email, phone, state: 'pending_access', createdAt, passwordSaltHex: saltHex, passwordHashHex,
      };
      const session = mintToken('SPS');
      await this.state.storage.put({
        [`${ACCOUNT_PREFIX}${accountId}`]: record,
        [emailKey]: accountId,
        [`${SESSION_PREFIX}${await sha256Hex(session)}`]: accountId,
      });
      await this.consigner(accountId, 'pending_access', 'signup');
      // The session exists BEFORE admission so the admission call can prove
      // which account it is for; every other read refuses on the state.
      return Response.json({ ok: true, accountId, name, state: 'pending_access', session });
    }

    if (request.method === 'POST' && pathname === '/login') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const email = champ(body?.['email'])?.toLowerCase() ?? null;
      const password = typeof body?.['password'] === 'string' ? body['password'] : '';
      // ONE refusal for every wrong way in — an unknown email and a wrong
      // password are indistinguishable, so the door is not an email oracle.
      const refuse = () => Response.json({ ok: false, reason: 'bad_credentials' }, { status: 401 });
      if (email === null || password === '') return refuse();
      const accountId = await this.state.storage.get<string>(`${EMAIL_PREFIX}${await sha256Hex(email)}`);
      if (accountId === undefined) return refuse();
      const record = await this.compte(accountId);
      if (record === undefined) return refuse();
      const derived = await derivePassword(password, record.passwordSaltHex);
      if (!egaleConstante(derived, record.passwordHashHex)) return refuse();
      const session = mintToken('SPS');
      await this.state.storage.put(`${SESSION_PREFIX}${await sha256Hex(session)}`, accountId);
      return Response.json({ ok: true, accountId, name: record.name, state: record.state, session });
    }

    /** WHO AM I — the app's gate read. Bearer session in the body (the router
     *  passes it through; a DO fetch has no ambient auth). */
    if (request.method === 'POST' && pathname === '/session') {
      const body = (await request.json().catch(() => null)) as { session?: unknown } | null;
      const record = await this.resoudreSession(body?.session);
      if (record === null) return Response.json({ ok: false, reason: 'no_session' }, { status: 401 });
      return Response.json({ ok: true, accountId: record.accountId, name: record.name, state: record.state });
    }

    /** ADMISSION — her one-time code, against HER account, exactly once. */
    if (request.method === 'POST' && pathname === '/admission') {
      const body = (await request.json().catch(() => null)) as { session?: unknown; code?: unknown } | null;
      const record = await this.resoudreSession(body?.session);
      if (record === null) return Response.json({ ok: false, reason: 'no_session' }, { status: 401 });
      if (record.state === 'active') return Response.json({ ok: true, state: 'active', deja: true });
      if (record.state === 'paused') {
        // A paused account does not re-admit itself with an old code — the
        // founder's cut-off outranks every credential she holds.
        return Response.json({ ok: false, reason: 'access_paused' }, { status: 403 });
      }
      const code = typeof body?.code === 'string' ? body.code.trim() : '';
      if (code === '' || record.accessCodeHash === undefined) {
        return Response.json({ ok: false, reason: 'code_refused' }, { status: 401 });
      }
      if (!egaleConstante(await sha256Hex(code), record.accessCodeHash)) {
        return Response.json({ ok: false, reason: 'code_refused' }, { status: 401 });
      }
      // CONSUMED: the hash is deleted in the same write that flips the state,
      // so the code cannot admit a second device later.
      const { accessCodeHash: _spent, ...rest } = record;
      await this.state.storage.put(`${ACCOUNT_PREFIX}${record.accountId}`, { ...rest, state: 'active' });
      await this.consigner(record.accountId, 'active', 'admission');
      return Response.json({ ok: true, state: 'active' });
    }

    /* ── FOUNDER (index.ts gates these behind key C before forwarding) ────── */

    if (request.method === 'GET' && pathname === '/accounts') {
      const entries = await this.state.storage.list<AccountRecord>({ prefix: ACCOUNT_PREFIX });
      const accounts = [...entries.values()].map(toView).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return Response.json({ ok: true, accounts });
    }

    /** Mint the one-time admission code for ONE pending account. Re-mint
     *  replaces (which is also revocation-before-use). Plaintext appears in
     *  this response once; the book keeps only the hash. */
    if (request.method === 'POST' && pathname === '/access-code') {
      const body = (await request.json().catch(() => null)) as { accountId?: unknown } | null;
      const accountId = champ(body?.['accountId']);
      if (accountId === null || Object.keys(body ?? {}).length !== 1) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const record = await this.compte(accountId);
      if (record === undefined) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
      if (record.state !== 'pending_access') {
        // An active account has no use for an admission code, and minting one
        // for a paused account would let an old handout undo the founder's cut.
        return Response.json({ ok: false, reason: 'not_pending' }, { status: 409 });
      }
      const code = mintToken('SPA');
      await this.state.storage.put(`${ACCOUNT_PREFIX}${accountId}`, { ...record, accessCodeHash: await sha256Hex(code) });
      return Response.json({ ok: true, accountId, code });
    }

    if (request.method === 'POST' && (pathname === '/pause' || pathname === '/resume')) {
      const body = (await request.json().catch(() => null)) as { accountId?: unknown } | null;
      const accountId = champ(body?.['accountId']);
      if (accountId === null || Object.keys(body ?? {}).length !== 1) {
        return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
      }
      const record = await this.compte(accountId);
      if (record === undefined) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
      const cible: ResellerAccessState = pathname === '/pause' ? 'paused' : 'active';
      // pause: active→paused only. resume: paused→active only. pending stays
      // pending — admission is the ONLY road out of it, or the state machine
      // would have a founder-shaped bypass around the access code.
      const legal = pathname === '/pause' ? record.state === 'active' : record.state === 'paused';
      if (!legal) return Response.json({ ok: false, reason: 'wrong_state', state: record.state }, { status: 409 });
      await this.state.storage.put(`${ACCOUNT_PREFIX}${record.accountId}`, { ...record, state: cible });
      await this.consigner(record.accountId, cible, 'founder');
      return Response.json({ ok: true, accountId, state: cible });
    }

    /** The audit trail for one account — the canon rows, newest first. */
    if (request.method === 'GET' && pathname.startsWith('/audit/')) {
      const accountId = decodeURIComponent(pathname.slice('/audit/'.length));
      const entries = await this.state.storage.list({ prefix: `${AUDIT_PREFIX}${accountId}:` });
      return Response.json({ ok: true, changes: [...entries.values()].reverse() });
    }

    return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
  }

  private async resoudreSession(presented: unknown): Promise<AccountRecord | null> {
    if (typeof presented !== 'string' || presented === '') return null;
    const accountId = await this.state.storage.get<string>(`${SESSION_PREFIX}${await sha256Hex(presented)}`);
    if (accountId === undefined) return null;
    return (await this.compte(accountId)) ?? null;
  }
}

/**
 * THE RESOLUTION EVERY AUTHENTICATED READ MAKES (index.ts): a Bearer that is a
 * SESSION resolves here to {accountId, state}. `undefined` = not a session
 * (the caller may then try the legacy feed-code book); a resolved-but-not-
 * ACTIVE account is returned WITH its state so the route can refuse BY NAME
 * (`access_paused` / `access_required`) — the enforcement the founder approved.
 */
export async function resoudreCompte(
  env: { readonly COMPTES?: DurableObjectNamespace },
  bearer: string,
): Promise<{ accountId: string; state: ResellerAccessState } | undefined> {
  if (env.COMPTES === undefined || !bearer.startsWith('SPS-')) return undefined;
  const res = await env.COMPTES.get(env.COMPTES.idFromName(RESELLER_ACCOUNTS_NAME))
    .fetch(new Request('https://do/session', { method: 'POST', body: JSON.stringify({ session: bearer }) }))
    .catch(() => null);
  if (res === null) return undefined;
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; accountId?: string; state?: ResellerAccessState }
    | null;
  if (body?.ok !== true || typeof body.accountId !== 'string' || typeof body.state !== 'string') return undefined;
  return { accountId: body.accountId, state: body.state };
}
