import { describe, expect, it } from 'vitest';
import { ResellerAccountsDO } from '../worker/reseller-accounts-do.js';

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
  const storage = {
    async get<T>(key: string): Promise<T | undefined> {
      return m.get(key) as T | undefined;
    },
    async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
      if (typeof keyOrEntries === 'string') m.set(keyOrEntries, value);
      else for (const [k, v] of Object.entries(keyOrEntries)) m.set(k, v);
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
  return { m, state: { storage } as unknown as ConstructorParameters<typeof ResellerAccountsDO>[0] };
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
