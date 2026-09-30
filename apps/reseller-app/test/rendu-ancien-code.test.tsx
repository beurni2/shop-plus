import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — CODES-EFFACES-1 (founder order 2026-09-30: the old codes
 * are erased on the server, and nothing in the app still speaks of them) ═══
 *
 * Before accounts, a reseller typed an `SP-` code the founder minted by hand,
 * and the app kept it in `reseller-feed-code.v1.txt`. The codes were retired
 * (CODES-RETIRES-1) and are now erased from the server — yet the app still
 * READ that old file whenever the current one was empty (a phone that never
 * signed in, or one that signed out), and sent the old code to her sales door
 * at every launch: a dead credential leaving the phone for a refusal.
 *
 * The walk mounts the real app on a phone that holds ONLY the old file and
 * asks the wire: the entrance is there and its door is pressable, and no
 * request carries the old code. The CONTROL mounts a signed-in phone: her
 * sales read does leave, riding her session — so « nothing left the phone »
 * above is a measurement of this wire, not a deaf one.
 *
 * Appearance is not claimed — only which strings are in the tree, what can be
 * pressed, and what the phone sent.
 */

const ANCIEN_CODE = 'SP-ABCD-EFGH-IJKL-MNOP';
const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const COMPTE = { accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' } as const;
const PORTE_COMPTE = 'Créer mon compte';

const routes: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
      : null,
  (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
  (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 404, json: { error: 'not_found' } } : null),
  (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, ...COMPTE } } : null),
  (path) => (path === '/reseller/ventes' ? { status: 200, json: { ok: true, ventes: [], incomplet: false } } : null),
];

async function ecrire(fichier: string | undefined, valeur: string): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  await (fichier === undefined ? expoAccessCodeStore() : expoAccessCodeStore(fichier)).write(valeur);
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

describe('CODES-EFFACES-1 — an old code left on the phone opens nothing and leaves nothing', () => {
  it('a phone holding only the old code file: the entrance stands, « Créer mon compte » is pressable, and no request carries the old code', async () => {
    await ecrire('reseller-feed-code.v1.txt', ANCIEN_CODE);
    const fils = wire(routes);
    const screen = await mountApp();
    for (let i = 0; i < 5; i += 1) await screen.settle();

    expect(screen.shows(PORTE_COMPTE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Opportunités'), 'the app shell must stay behind the entrance').toBe(false);
    // Her next step is reachable: the entrance's own button, once she has filled it.
    await screen.type('Awa Traoré', 'Votre nom');
    await screen.type('70 00 00 00', 'Votre numéro WhatsApp');
    await screen.type('awa@example.bf', 'Votre email');
    await screen.type('motdepasse', 'Votre mot de passe (8 lettres ou plus)');
    expect(screen.canPress(PORTE_COMPTE), 'the entrance door must be pressable').toBe(true);
    const porteuses = fils.calls.filter((c) => c.auth !== null && c.auth.includes(ANCIEN_CODE));
    expect(porteuses.map((c) => c.path), 'the old code left the phone').toEqual([]);
    expect(fils.calls.filter((c) => c.path === '/reseller/ventes').length, 'no sales read without a session').toBe(0);
    screen.unmount();
  });

  it('CONTROL — a signed-in phone: her sales read leaves, riding her session (the wire hears the door)', async () => {
    await ecrire('reseller-compte.v1.txt', JSON.stringify(COMPTE));
    await ecrire(undefined, SESSION);
    const fils = wire(routes);
    const screen = await mountApp();
    for (let i = 0; i < 5; i += 1) await screen.settle();

    const ventes = fils.calls.filter((c) => c.path === '/reseller/ventes');
    expect(ventes.length, `calls: ${JSON.stringify(fils.calls.map((c) => c.path))}`).toBeGreaterThan(0);
    expect(ventes.every((c) => c.auth === `Bearer ${SESSION}`)).toBe(true);
    expect(screen.canPress('Opportunités'), 'a signed-in phone reaches the app').toBe(true);
    screen.unmount();
  });
});
