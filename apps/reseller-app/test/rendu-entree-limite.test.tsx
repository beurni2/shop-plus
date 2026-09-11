import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route, type Screen } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — LIMITE-REVENDEUSE-1: the entrance meets the door's CEILING,
 * and says « attendez », never « réseau » ═══
 *
 * The storefront Worker now answers `429 { ok:false, reason:'too_many_requests' }`
 * on `/reseller/signup` and `/reseller/login` when one address asks too often
 * (its own budgets, apart from the buyer's). Before this slice the app read a
 * signup 429 as « not reached » and showed the NETWORK sentence — a lie on a
 * working wire. The four questions, on the mounted App with the gate ARMED:
 *   · did the tree survive the tap — the 429 lands and the entrance stands;
 *   · is the act still pressable — « Créer mon compte » / « Me connecter »
 *     fire again after the refusal (the way out is a minute of patience);
 *   · does she hear the truth — the ceiling's own name (`too_many_requests`,
 *     a minute) earns « dans une minute, ça repart » on BOTH doors, and the
 *     book's per-email name (`too_many_attempts`, a quarter hour) keeps its
 *     own « quart d'heure » sentence: two waits, two sentences;
 *   · the control — a plain 401 still says « incorrect », not a wait.
 *
 * The fakes are contract-certified against the real doors' answers, and the
 * ceiling itself is seam-proven on the built Worker in
 * `services/storefront-service/test/limite-compte.e2e.test.ts`.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const TROP_VITE = "Trop de demandes d'un coup. Dans une minute, ça repart.";
const TROP = "Trop d'essais. Attendez un quart d'heure, puis réessayez.";
const INCORRECT = 'Email ou mot de passe incorrect. Vérifiez et réessayez.';
const PORTE_COMPTE = 'Créer mon compte';
const CONNECTER = 'Me connecter';

function routes(signup: number, login: number, nom429 = 'too_many_requests'): Route[] {
  const refus = (status: number) =>
    status === 429 ? { status, json: { ok: false, reason: nom429 } } : { status, json: { ok: false, reason: 'bad_credentials' } };
  return [
    (path) => (path === '/supply-projections' ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } } : null),
    (path) => (path === '/reseller/signup' ? refus(signup) : null),
    (path) => (path === '/reseller/login' ? refus(login) : null),
  ];
}

/** His phone today: a device-era identity, no account anywhere. */
async function seedTelephone(): Promise<void> {
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  await expoIdentityStore().write(JSON.stringify({ version: 1, digits: '4242' }));
}

async function attendre(screen: Screen, fragment: string): Promise<void> {
  for (let i = 0; i < 25 && !screen.shows(fragment); i += 1) await screen.settle();
  expect(screen.shows(fragment), `expected « ${fragment} »; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  process.env['EXPO_PUBLIC_ACCESS_GATE'] = 'on';
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
});

describe('LIMITE-REVENDEUSE-1 — the entrance meets the ceiling', () => {
  it('signup 429 (the ceiling’s name) → « dans une minute », the tree stands, the act fires again; login 429 → the same; the book’s name → « quart d’heure »; a 401 still says « incorrect »', async () => {
    await seedTelephone();
    const fils = wire(routes(429, 429));
    const screen = await mountApp();
    expect(screen.shows(PORTE_COMPTE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    // She signs up — real fields, real button — and the door's ceiling refuses.
    await screen.type('Awa Traoré', 'Votre nom');
    await screen.type('70 00 00 00', 'Votre numéro WhatsApp');
    await screen.type('awa@example.bf', 'Votre email');
    await screen.type('motdepasse', 'Votre mot de passe (8 lettres ou plus)');
    await screen.press(PORTE_COMPTE);
    await attendre(screen, TROP_VITE);
    expect(fils.calls.filter((c) => c.path === '/reseller/signup').length, 'the signup left the phone').toBe(1);
    expect(screen.shows('Pas de réseau'), 'never the network sentence on a working wire').toBe(false);
    // The way out: the act still fires (a second signup leaves, and is refused again by name).
    expect(screen.canPress(PORTE_COMPTE)).toBe(true);
    await screen.press(PORTE_COMPTE);
    await screen.settle();
    expect(fils.calls.filter((c) => c.path === '/reseller/signup').length).toBe(2);

    // She switches to the login door; its ceiling refuses with the same name.
    await screen.press(CONNECTER);
    await screen.settle();
    await screen.type('awa@example.bf', 'Votre email');
    await screen.type('motdepasse', 'Votre mot de passe');
    await screen.press(CONNECTER);
    await attendre(screen, TROP_VITE);
    expect(fils.calls.filter((c) => c.path === '/reseller/login').length).toBe(1);
    expect(screen.canPress(CONNECTER)).toBe(true);

    // The BOOK's own 429 (ten wrong tries on one email) keeps its own wait.
    wire(routes(429, 429, 'too_many_attempts'));
    await screen.press(CONNECTER);
    await attendre(screen, TROP);
    expect(screen.shows(TROP_VITE)).toBe(false);

    // CONTROL — a plain refusal is a different sentence: neither wait is
    // what every refusal says.
    wire(routes(429, 401));
    await screen.press(CONNECTER);
    await attendre(screen, INCORRECT);
    expect(screen.shows(TROP)).toBe(false);
    expect(screen.shows(TROP_VITE)).toBe(false);
    screen.unmount();
  });
});
