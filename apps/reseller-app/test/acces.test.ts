import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideAcces, gateArme } from '../src/access/gate';
import rawCatalog from '../i18n/catalog.json';

const catalog = rawCatalog as readonly { key: string; fr: string; register: string }[];
const appDir = join(import.meta.dirname, '..');
const app = readFileSync(join(appDir, 'App.tsx'), 'utf8');

/**
 * ACCESS-GATE-1 — ONE DOOR, AT THE ENTRANCE, DISARMED FOR NOW.
 *
 * Founder order, 2026-08-04: « i do not want resellers feed to have any code
 * gated. the only gate i want is the access gate … build it but make the access
 * gate off for now for shop+ ».
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

  it('is DISARMED when unset — the founder’s current instruction, and the state that cannot lock anyone out', () => {
    vi.stubEnv('EXPO_PUBLIC_ACCESS_GATE', undefined as unknown as string);
    expect(gateArme()).toBe(false);
  });

  it('reads the env by DOT ACCESS — a computed read is invisible to the Metro inliner and ships undefined forever', () => {
    const src = readFileSync(join(appDir, 'src/access/gate.ts'), 'utf8');
    expect(src).toContain('process.env.EXPO_PUBLIC_ACCESS_GATE');
    expect(src).not.toMatch(/process\.env\[/);
  });
});

describe('ACCESS-GATE-1 — the decision', () => {
  it('DISARMED opens for everyone, whatever the store says — checked before any other condition', () => {
    for (const code of [undefined, null as unknown as undefined, true, false]) {
      expect(decideAcces(false, code as boolean | undefined), String(code)).toEqual({ kind: 'ouvert' });
    }
  });

  it('ARMED: a held code opens, no code shows the entrance, and « not read yet » is NEITHER', () => {
    expect(decideAcces(true, true)).toEqual({ kind: 'ouvert' });
    expect(decideAcces(true, false)).toEqual({ kind: 'porte' });
    // The one that matters on a slow phone: while the durable store is still
    // answering, a reseller who typed her code weeks ago must not see the door
    // flash. `lecture` is its own state precisely so it can render nothing.
    expect(decideAcces(true, undefined)).toEqual({ kind: 'lecture' });
  });

  it('takes a BOOLEAN, never the code — a decision that cannot see a secret cannot leak one', () => {
    const src = readFileSync(join(appDir, 'src/access/gate.ts'), 'utf8');
    expect(src).toMatch(/decideAcces\(arme: boolean, codePresent: boolean \| undefined\)/);
    // no string comparison against a credential anywhere in the gate
    expect(src).not.toMatch(/code(Present)? === '/);
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
    expect(app).toMatch(/<EcranAcces\b/);
  });

  it('NO SCREEN INSIDE THE APP ASKS FOR A CODE — the two old walls are gone and cannot return', () => {
    // « Mes ventes » and « Mes gains » each rendered a TextInput + PrimaryButton
    // behind `demandeCode`. The founder removed that concept; the field itself
    // is gone from all three screen models, so a re-render is not expressible.
    expect(app).not.toMatch(/demandeCode/);
    // and only one submit site exists in the whole app
    expect([...app.matchAll(/ventesReelles\.ouvrir\(/g)]).toHaveLength(1);
  });

  it('the entrance never renders a field it cannot verify, and never flashes on a slow store', () => {
    // no Shop+ base ⇒ a sentence, not an input that could only fail
    expect(app).toMatch(/nonBranche \?/);
    expect(app).toMatch(/t\('acces\.non_branche'\)/);
    // still reading the durable store ⇒ the surface, nothing on it
    expect(app).toMatch(/if \(etat === 'lecture'\) return <View style=\{styles\.accesEcran\} \/>;/);
  });

  it('every acces.* string the entrance renders exists in the catalog', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const used = [...app.matchAll(/t\('(acces\.[a-z_]+)'\)/g)].map((m) => m[1]!);
    expect(used.length, 'the extraction must actually see the entrance').toBeGreaterThan(4);
    for (const k of used) expect(keys.has(k), `${k} rendered but not in catalog`).toBe(true);
  });

  it('the refusal at the door names the cause and the way out — never a verdict on her', () => {
    const fr = new Map(catalog.map((e) => [e.key, e.fr]));
    const refuse = (fr.get('acces.refuse') ?? '').toLowerCase();
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
