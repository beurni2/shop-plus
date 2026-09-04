import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideAcces, gateArme } from '../src/access/gate';
import rawCatalog from '../i18n/catalog.json';

const catalog = rawCatalog as readonly { key: string; fr: string; register: string }[];
const appDir = join(import.meta.dirname, '..');
const app = readFileSync(join(appDir, 'App.tsx'), 'utf8');

/**
 * ACCESS-GATE-1 — ONE DOOR, AT THE ENTRANCE.
 *
 * Founder order, 2026-08-04: « i do not want resellers feed to have any code
 * gated. the only gate i want is the access gate … build it but make the access
 * gate off for now for shop+ ». ARMED on the published build since
 * ACCES-ARME-1 (founder 2026-09-04: « go a2b ») — expo-preview.yml ships the
 * flag; unset stays the fail-open default everywhere else.
 *
 * Two properties this file exists to hold, and they pull in opposite
 * directions, which is why both are pinned:
 *
 *   1. DISARMED MEANS NOBODY IS ASKED. No storage state, no feed state, no
 *      ordering of effects may produce a door while the flag is off.
 *   2. DISARMED DOES NOT MEAN OPEN. The flag is a CLIENT decision; the money
 *      read stays authenticated by the server no matter what it says.
 */

afterEach(() => vi.unstubAllEnvs());

describe('ACCESS-GATE-1 — the flag', () => {
  it('is ON only for the exact string « on » — every other value leaves it disarmed', () => {
    for (const v of ['on']) {
      vi.stubEnv('EXPO_PUBLIC_ACCESS_GATE', v);
      expect(gateArme(), v).toBe(true);
    }
    // « true », « 1 », « ON », a typo, an empty value: all DISARMED. A gate
    // that armed on anything truthy would lock a whole market out of the app
    // because someone set it to « yes ».
    for (const v of ['', 'off', 'true', '1', 'ON', 'On', 'oui', 'enabled']) {
      vi.stubEnv('EXPO_PUBLIC_ACCESS_GATE', v);
      expect(gateArme(), v).toBe(false);
    }
  });

  it('is DISARMED when unset — the fail-open default, and the state that cannot lock anyone out', () => {
    vi.stubEnv('EXPO_PUBLIC_ACCESS_GATE', undefined as unknown as string);
    expect(gateArme()).toBe(false);
  });

  it('reads the env by DOT ACCESS — a computed read is invisible to the Metro inliner and ships undefined forever', () => {
    const src = readFileSync(join(appDir, 'src/access/gate.ts'), 'utf8');
    expect(src).toContain('process.env.EXPO_PUBLIC_ACCESS_GATE');
    expect(src).not.toMatch(/process\.env\[/);
  });
});

describe('RESELLER-ACCOUNTS-1d — the decision, on account state', () => {
  it('DISARMED opens for everyone, whatever the store says — checked before any other condition', () => {
    for (const compte of [undefined, null, { state: 'pending_access' }, { state: 'active' }, { state: 'paused' }] as const) {
      expect(decideAcces(false, compte as Parameters<typeof decideAcces>[1]), JSON.stringify(compte)).toEqual({ kind: 'ouvert' });
    }
  });

  it('ARMED: the four honest doors — no account, pending, paused, active — and « not read yet » renders NOTHING', () => {
    expect(decideAcces(true, null)).toEqual({ kind: 'porte' }); // créer / se connecter
    expect(decideAcces(true, { state: 'pending_access' })).toEqual({ kind: 'admission' }); // the founder's code screen
    // THE PAUSE IS ITS OWN STATE, never dressed as a network fault or a bad
    // credential — the founder's cut must read as exactly what it is.
    expect(decideAcces(true, { state: 'paused' })).toEqual({ kind: 'coupe' });
    expect(decideAcces(true, { state: 'active' })).toEqual({ kind: 'ouvert' });
    // slow phone: the durable store still answering must not flash a door at
    // a reseller who signed in weeks ago
    expect(decideAcces(true, undefined)).toEqual({ kind: 'lecture' });
  });

  it('sees only the STATE, never a credential — a decision that cannot see a secret cannot leak one', () => {
    const src = readFileSync(join(appDir, 'src/access/gate.ts'), 'utf8');
    expect(src).toMatch(/decideAcces\(\s*arme: boolean,\s*compte: \{ readonly state:/);
    // identifiers only — the header COMMENT may say « mot de passe » in prose
    for (const banni of ['password', 'passwordhash', 'mdp']) {
      expect(src.toLowerCase(), banni).not.toContain(banni);
    }
  });
});

describe('ACCESS-GATE-1 — the app has exactly one door, and it is the entrance', () => {
  it('the gate renders BEFORE the app shell and short-circuits it', () => {
    const gate = app.indexOf("if (acces.kind !== 'ouvert')");
    const shell = app.indexOf('<TabBar');
    expect(gate, 'the gate branch must exist').toBeGreaterThan(-1);
    expect(shell, 'the dock must exist').toBeGreaterThan(-1);
    // Armed, NOTHING behind the door renders — that is what makes it an ACCESS
    // gate rather than one more wall in the middle of the app.
    expect(gate).toBeLessThan(shell);
    // RESELLER-ACCOUNTS-1d — the entrance is the ACCOUNT now: signup/login,
    // then the admission code, then (if the founder paused her) the coupe
    // sentence. All four doors mount inside the gate branch, before the shell.
    expect(app).toMatch(/<EcranCompte\b/);
    expect(app).toMatch(/<EcranAdmission\b/);
    expect(app).toMatch(/t\('coupe\.titre'\)/);
  });

  it('NO SCREEN INSIDE THE APP ASKS FOR A CODE OR A PASSWORD — the walls are gone and cannot return', () => {
    // « Mes ventes » and « Mes gains » each rendered a code door once. The
    // concept is deleted from all three screen models; and with accounts, the
    // ONLY credential entry points are the gate branch's screens.
    expect(app).not.toMatch(/demandeCode/);
    // `ventesReelles.ouvrir` — the legacy type-a-feed-code path — has NO mount
    // left: the entrance signs in through the account service instead. The
    // hook keeps the function (the founder's legacy code path server-side),
    // but no screen offers it.
    expect([...app.matchAll(/ventesReelles\.ouvrir\(/g)]).toHaveLength(0);
  });

  it('the entrance never renders a field it cannot verify, and never flashes on a slow store', () => {
    // no Shop+ base ⇒ a sentence, not a form that could only fail
    expect(app).toMatch(/t\('acces\.non_branche'\)/);
    // still reading the durable store ⇒ the surface, nothing on it
    expect(app).toMatch(/acces\.kind === 'lecture' \? \(\s*<View style=\{styles\.accesEcran\} \/>/);
  });

  it('every acces.* / compte.* / admission.* / coupe.* string the doors render exists in the catalog', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const used = [...app.matchAll(/t\('((?:acces|compte|admission|coupe)\.[a-z_]+)'\)/g)].map((m) => m[1]!);
    expect(used.length, 'the extraction must actually see the doors').toBeGreaterThan(12);
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });

  it('the refusal at the door names the cause and the way out — never a verdict on her', () => {
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    const refuse = (fr.get('admission.refuse') ?? '').toLowerCase();
    expect(refuse).not.toBe('');
    expect(refuse).toContain('vérifiez'); // what to do
    // this is the first screen of the platform she will ever see
    for (const interdit of ['refusé', 'interdit', 'non autorisé', 'erreur']) {
      expect(refuse, interdit).not.toContain(interdit);
    }
  });
});

describe('ACCESS-GATE-1 — disarmed is not open', () => {
  it('the flag is documented as a CLIENT decision that cannot open the server route', () => {
    const src = readFileSync(join(appDir, 'src/access/gate.ts'), 'utf8');
    expect(src).toContain('EXPO_PUBLIC_ACCESS_GATE');
    // The property itself, asserted where it is enforced: the feed client sends
    // the code as a Bearer on EVERY read, so no client state can produce an
    // unauthenticated money read.
    const feed = readFileSync(join(appDir, 'src/sales/feed-service.ts'), 'utf8');
    expect(feed).toMatch(/Authorization: `Bearer \$\{code\}`/);
    expect(feed).toMatch(/if \(res\.status === 401\) return \{ ok: false, reason: 'unauthorized' \}/);
  });

  it('the stored code survives the rename — a reseller who typed one before this slice is not shown a door again', () => {
    const store = readFileSync(join(appDir, 'src/sales/code-store.ts'), 'utf8');
    expect(store).toContain("'reseller-feed-code.v1.txt'"); // the old name, still read
    expect(store).toContain("'reseller-access-code.v1.txt'"); // the new one, written
    expect(store).toMatch(/lire\(file\) \?\? lire\(ancien\)/); // new first, old as fallback
  });
});
