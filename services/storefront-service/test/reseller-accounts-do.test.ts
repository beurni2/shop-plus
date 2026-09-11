import { describe, expect, it } from 'vitest';
import { ResellerAccountsDO, SONDE_PBKDF2_SEL_HEX, sondePbkdf2 } from '../worker/reseller-accounts-do.js';

/**
 * ═══ SESSION-VIE-1 — THE PRE-SLICE ROW, on the REAL account book with only its
 * storage doubled (verifier finding, MAJOR) ═══
 *
 * A session minted BEFORE this slice is a bare row `session:{hash} → accountId`
 * with no entry under the account's index; it gains one only when the phone
 * holding it is next USED. The phone that was lost is exactly the one that is
 * not, so a password change that walked the index alone left every pre-deploy
 * session standing — the audit's measured probe, reproduced for the whole
 * current session population. No public door can plant a bare row on the
 * built Worker (the seam suites mint only post-slice rows), so this file drives
 * the REAL `ResellerAccountsDO` class through its REAL `fetch` with ONE double:
 * the storage. Nothing else is faked.
 *
 * THE DOUBLE'S BOUND, stated: `get` / `put` (key or record) / `delete` (key or
 * keys) / `list({prefix, limit})` over a sorted map, the four calls this object
 * makes. No transactions, no alarms, no input gate — the concurrency laws the
 * real object relies on are NOT proven here, only the storage arithmetic.
 */
function memoire() {
  const m = new Map<string, unknown>();
  /** The keys each `put` wrote, in order — so « one commit » can be asserted, not read. */
  const puts: string[][] = [];
  const storage = {
    async get<T>(key: string): Promise<T | undefined> {
      return m.get(key) as T | undefined;
    },
    async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
      if (typeof keyOrEntries === 'string') { m.set(keyOrEntries, value); puts.push([keyOrEntries]); }
      else { for (const [k, v] of Object.entries(keyOrEntries)) m.set(k, v); puts.push(Object.keys(keyOrEntries)); }
    },
    async delete(keyOrKeys: string | string[]): Promise<boolean | number> {
      const keys = typeof keyOrKeys === 'string' ? [keyOrKeys] : keyOrKeys;
      let n = 0;
      for (const k of keys) if (m.delete(k)) n += 1;
      return typeof keyOrKeys === 'string' ? n === 1 : n;
    },
    async list<T>(opts: { prefix?: string; limit?: number } = {}): Promise<Map<string, T>> {
      const out = new Map<string, T>();
      for (const k of [...m.keys()].sort()) {
        if (opts.prefix !== undefined && !k.startsWith(opts.prefix)) continue;
        if (opts.limit !== undefined && out.size >= opts.limit) break;
        out.set(k, m.get(k) as T);
      }
      return out;
    },
  };
  return { m, puts, state: { storage } as unknown as ConstructorParameters<typeof ResellerAccountsDO>[0] };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const MOT_DE_PASSE = 'grain-de-nere-77';

async function appel(livre: ResellerAccountsDO, chemin: string, body: Record<string, unknown>) {
  const res = await livre.fetch(new Request(`https://do${chemin}`, { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('SESSION-VIE-1 — a password change reaches the sessions minted BEFORE the slice', () => {
  it('a bare pre-slice row (no index entry, never presented) is deleted by the change; the caller stays in; a presented bare row is adopted as before', async () => {
    const { m, state } = memoire();
    const livre = new ResellerAccountsDO(state);
    const inscrite = await appel(livre, '/signup', { name: 'Awa Traoré', email: 'awa@example.bf', phone: '+226 70 00 00 01', password: MOT_DE_PASSE });
    expect(inscrite.status).toBe(200);
    const accountId = inscrite.json['accountId'] as string;
    const phoneA = inscrite.json['session'] as string;

    // Phone B: the lost phone, minted before the deploy — a BARE row, no index.
    const phoneB = 'SPS-PERD-UEAU-MARC-HE00';
    m.set(`session:${await sha256Hex(phoneB)}`, accountId);
    // Phone C: another pre-slice row, on a different account — must NOT be touched.
    const autre = await appel(livre, '/signup', { name: 'Fati', email: 'fati@example.bf', phone: '+226 70 00 00 02', password: MOT_DE_PASSE });
    const phoneC = 'SPS-AUTR-ECOM-PTE0-0000';
    m.set(`session:${await sha256Hex(phoneC)}`, autre.json['accountId']);

    // Both pre-slice rows would open today (the deploy logs nobody out).
    expect((await appel(livre, '/session', { session: phoneB })).status).toBe(200);
    expect((await appel(livre, '/session', { session: phoneC })).status).toBe(200);
    // …and presenting B adopted it (indexed now). Re-plant it BARE to model the
    // phone that was never used after the deploy — the case the index misses.
    for (const k of [...m.keys()]) if (k.startsWith(`sessions-of:${accountId}:`)) m.delete(k);
    m.set(`session:${await sha256Hex(phoneB)}`, accountId);
    expect([...m.keys()].filter((k) => k.startsWith(`sessions-of:${accountId}:`)), 'B has no index entry').toHaveLength(0);

    // The change, from phone A (the one in her hand). A's own session was
    // adopted by the /profile resolution, so the index holds A alone.
    // (The account is pending here — admission needs the founder's code — so
    // the profile road refuses 403; the change is driven where it lives.)
    m.set(`account:${accountId}`, { ...(m.get(`account:${accountId}`) as Record<string, unknown>), state: 'active' });
    const change = await appel(livre, '/profile', { session: phoneA, currentPassword: MOT_DE_PASSE, newPassword: 'toute-neuve-99' });
    expect(change.status, JSON.stringify(change.json)).toBe(200);

    // THE LOST PHONE IS OUT — the bare row is gone from the book itself…
    expect(m.has(`session:${await sha256Hex(phoneB)}`), 'the bare row must be deleted').toBe(false);
    expect((await appel(livre, '/session', { session: phoneB })).status).toBe(401);
    // …the phone in her hand stays in…
    expect((await appel(livre, '/session', { session: phoneA })).status).toBe(200);
    // …and the OTHER account's pre-slice row is untouched.
    expect(m.has(`session:${await sha256Hex(phoneC)}`)).toBe(true);
    expect((await appel(livre, '/session', { session: phoneC })).status).toBe(200);
  });
});

/* ═══ PBKDF2-HAUSSE-1 — the raise, and the lift at login ═══ */

/** An INDEPENDENT derivation (WebCrypto, this test's own call) — never the book's function. */
async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Enregistrement { passwordSaltHex: string; passwordHashHex: string; passwordIterations?: number; state: string }

describe('PBKDF2-HAUSSE-1 — 100 000 iterations, and an older record is lifted at its next login', () => {
  it('a new account is derived at 100 000, and the stored hash is what an independent PBKDF2 gives', async () => {
    const { m, state } = memoire();
    const livre = new ResellerAccountsDO(state);
    const inscrite = await appel(livre, '/signup', { name: 'Awa Traoré', email: 'awa@example.bf', phone: '+226 70 00 00 01', password: MOT_DE_PASSE });
    expect(inscrite.status).toBe(200);
    const rec = m.get(`account:${inscrite.json['accountId'] as string}`) as Enregistrement;
    expect(rec.passwordIterations).toBe(100_000);
    expect(rec.passwordHashHex).toBe(await pbkdf2Hex(MOT_DE_PASSE, rec.passwordSaltHex, 100_000));
  });

  it('a record derived at 60 000 (the count on it, or NO count — the pre-SESSION-VIE-1 shape) logs in, is lifted to 100 000 with a fresh salt in the same commit as the session, and logs in again at the new count', async () => {
    for (const avecCompte of [true, false]) {
      const { m, puts, state } = memoire();
      const livre = new ResellerAccountsDO(state);
      const inscrite = await appel(livre, '/signup', { name: 'Fati', email: 'fati@example.bf', phone: '+226 70 00 00 02', password: MOT_DE_PASSE });
      const id = inscrite.json['accountId'] as string;
      // Plant the OLD hash: an independent derivation at 60 000 over a salt of our own.
      const selAncien = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const ancien = { ...(m.get(`account:${id}`) as Enregistrement), passwordSaltHex: selAncien, passwordHashHex: await pbkdf2Hex(MOT_DE_PASSE, selAncien, 60_000) };
      if (avecCompte) ancien.passwordIterations = 60_000;
      else delete ancien.passwordIterations;
      m.set(`account:${id}`, ancien);

      puts.length = 0;
      const entree = await appel(livre, '/login', { email: 'fati@example.bf', password: MOT_DE_PASSE });
      expect(entree.status, `login on the old hash (count ${avecCompte ? 'present' : 'absent'})`).toBe(200);
      // ONE COMMIT: the lifted record and the new session rows leave in the SAME put.
      const dernier = puts[puts.length - 1]!;
      expect(dernier).toContain(`account:${id}`);
      expect(dernier.some((k) => k.startsWith('session:'))).toBe(true);
      const leve = m.get(`account:${id}`) as Enregistrement;
      expect(leve.passwordIterations).toBe(100_000);
      expect(leve.passwordSaltHex).not.toBe(selAncien);
      expect(leve.passwordHashHex).toBe(await pbkdf2Hex(MOT_DE_PASSE, leve.passwordSaltHex, 100_000));
      // The lifted record opens again — verified at the NEW count now.
      expect((await appel(livre, '/login', { email: 'fati@example.bf', password: MOT_DE_PASSE })).status).toBe(200);
      // …and the session minted by the lifting login is alive.
      expect((await appel(livre, '/session', { session: entree.json['session'] })).status).toBe(200);
    }
  });

  it('a change that lands on the record WHILE the lifting login derives is kept, not overwritten: the lift spreads a re-read record', async () => {
    const { m, state } = memoire();
    const livre = new ResellerAccountsDO(state);
    const inscrite = await appel(livre, '/signup', { name: 'Salimata', email: 'sali@example.bf', phone: '+226 70 00 00 05', password: MOT_DE_PASSE });
    const id = inscrite.json['accountId'] as string;
    const selAncien = '1234567890abcdef1234567890abcdef';
    m.set(`account:${id}`, { ...(m.get(`account:${id}`) as Enregistrement), passwordSaltHex: selAncien, passwordHashHex: await pbkdf2Hex(MOT_DE_PASSE, selAncien, 60_000), passwordIterations: 60_000 });
    // The double's `get`: on the login's SECOND read of the account (the re-read
    // before the lift), a concurrent profile change has renamed her.
    const storage = (state as unknown as { storage: { get: (k: string) => Promise<unknown> } }).storage;
    const get = storage.get.bind(storage);
    let lectures = 0;
    storage.get = async (k: string) => {
      if (k === `account:${id}` && (lectures += 1) === 2) m.set(k, { ...(m.get(k) as Enregistrement), name: 'Salimata Ouédraogo' });
      return get(k);
    };
    expect((await appel(livre, '/login', { email: 'sali@example.bf', password: MOT_DE_PASSE })).status).toBe(200);
    const apres = m.get(`account:${id}`) as Enregistrement & { name: string };
    expect(apres.name, 'the change that landed mid-login survives the lift').toBe('Salimata Ouédraogo');
    expect(apres.passwordIterations).toBe(100_000);
    expect(apres.passwordHashHex).toBe(await pbkdf2Hex(MOT_DE_PASSE, apres.passwordSaltHex, 100_000));
  });

  it('a PASSWORD CHANGE that lands while the lifting login derives wins: the lift writes nothing over a hash it did not verify, and the login still opens', async () => {
    const { m, state } = memoire();
    const livre = new ResellerAccountsDO(state);
    const inscrite = await appel(livre, '/signup', { name: 'Mariam', email: 'mariam@example.bf', phone: '+226 70 00 00 06', password: MOT_DE_PASSE });
    const id = inscrite.json['accountId'] as string;
    const selAncien = 'abcdef1234567890abcdef1234567890';
    m.set(`account:${id}`, { ...(m.get(`account:${id}`) as Enregistrement), passwordSaltHex: selAncien, passwordHashHex: await pbkdf2Hex(MOT_DE_PASSE, selAncien, 60_000), passwordIterations: 60_000 });
    const selNeuf = '0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f';
    const hashNeuf = await pbkdf2Hex('toute-neuve-99', selNeuf, 100_000);
    const storage = (state as unknown as { storage: { get: (k: string) => Promise<unknown> } }).storage;
    const get = storage.get.bind(storage);
    let lectures = 0;
    storage.get = async (k: string) => {
      if (k === `account:${id}` && (lectures += 1) === 2) m.set(k, { ...(m.get(k) as Enregistrement), passwordSaltHex: selNeuf, passwordHashHex: hashNeuf, passwordIterations: 100_000 });
      return get(k);
    };
    expect((await appel(livre, '/login', { email: 'mariam@example.bf', password: MOT_DE_PASSE })).status, 'the verified login still opens').toBe(200);
    const apres = m.get(`account:${id}`) as Enregistrement;
    expect(apres.passwordSaltHex, 'the new password’s salt stands').toBe(selNeuf);
    expect(apres.passwordHashHex, 'the lift did not overwrite a hash it never verified').toBe(hashNeuf);
  });

  it('a WRONG password on an old record is refused and lifts nothing — the record is byte-identical after', async () => {
    const { m, state } = memoire();
    const livre = new ResellerAccountsDO(state);
    const inscrite = await appel(livre, '/signup', { name: 'Mariam', email: 'mariam@example.bf', phone: '+226 70 00 00 03', password: MOT_DE_PASSE });
    const id = inscrite.json['accountId'] as string;
    const selAncien = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
    const ancien = { ...(m.get(`account:${id}`) as Enregistrement), passwordSaltHex: selAncien, passwordHashHex: await pbkdf2Hex(MOT_DE_PASSE, selAncien, 60_000), passwordIterations: 60_000 };
    m.set(`account:${id}`, ancien);
    const avant = JSON.stringify(ancien);
    expect((await appel(livre, '/login', { email: 'mariam@example.bf', password: 'pas-le-bon-mot' })).status).toBe(401);
    expect(JSON.stringify(m.get(`account:${id}`))).toBe(avant);
  });

  it('a password CHANGE on a record with no count verifies the current password at the inherited 60 000 — the raise must not lock her out of her own change', async () => {
    const { m, state } = memoire();
    const livre = new ResellerAccountsDO(state);
    const inscrite = await appel(livre, '/signup', { name: 'Kadi', email: 'kadi@example.bf', phone: '+226 70 00 00 04', password: MOT_DE_PASSE });
    const id = inscrite.json['accountId'] as string;
    const session = inscrite.json['session'] as string;
    const selAncien = 'ffeeddccbbaa99887766554433221100';
    const ancien = { ...(m.get(`account:${id}`) as Enregistrement), state: 'active', passwordSaltHex: selAncien, passwordHashHex: await pbkdf2Hex(MOT_DE_PASSE, selAncien, 60_000) };
    delete ancien.passwordIterations;
    m.set(`account:${id}`, ancien);
    const change = await appel(livre, '/profile', { session, currentPassword: MOT_DE_PASSE, newPassword: 'toute-neuve-99' });
    expect(change.status, JSON.stringify(change.json)).toBe(200);
    const apres = m.get(`account:${id}`) as Enregistrement;
    expect(apres.passwordIterations).toBe(100_000);
    expect(apres.passwordHashHex).toBe(await pbkdf2Hex('toute-neuve-99', apres.passwordSaltHex, 100_000));
  });

  it('the probe derives at 100 000 over fixed bytes (after one pass at the inherited 60 000 — a lifting login’s exact cost), and its digest is what an independent derivation gives', async () => {
    const sonde = await sondePbkdf2();
    expect(sonde.iterations).toBe(100_000);
    expect(sonde.ok).toBe(true);
    expect(sonde.digest).toBe((await pbkdf2Hex('sonde-pbkdf2', SONDE_PBKDF2_SEL_HEX, 100_000)).slice(0, 16));
  });
});
