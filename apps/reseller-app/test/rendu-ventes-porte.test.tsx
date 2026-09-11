import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route, type Screen } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — PORTE-VENTES-1: « Pas encore reliée » only on a phone that is not ═══
 *
 * The founder asked why « Mes ventes » said « Pas encore reliée à votre compte ».
 * The list keys on the SESSION the phone stores (a login or an admission writes
 * it); with none on disk the hook is `locked` and the screen says that sentence —
 * honest for a phone with no account. The verifier (SEMENCE-DEMO-RETIRÉE) then
 * drove two PRODUCTION phones onto the same sentence, both ACTIVE, both with the
 * session on disk:
 *   A. launched with the feed unreachable → « hors ligne » → she taps the reload
 *      → `recharger()` only knew a code from a SUCCESSFUL read, so it locked: the
 *      reload never left the phone, and a retry with no way out;
 *   B. signup → admission in ONE app session: the hook read an empty store at
 *      mount; signup passed a session with `pending_access`, admission passed
 *      `active` with no session — nobody re-read her feed until a relaunch.
 * Written RED first on the code as found (both roads showed the sentence). Now:
 *   A. the reload re-reads the store and rides her session — the feed is asked
 *      again, the honest state replaces « hors ligne », never « pas encore reliée »;
 *   B. admission re-reads the feed with the session on disk — « Mes ventes » on
 *      an admitted phone is her (empty) list, never « pas encore reliée ».
 * The control stays: the same admitted phone relaunched reads the feed at mount.
 *
 * CONTRACT-CERTIFIED to `storefront-service` (accounts.e2e): `/reseller/signup`
 * answers her compte `pending_access` + a `SPS-` session; `/reseller/admission`
 * answers `{ ok, state: 'active' }`; `/reseller/session` her compte;
 * `/reseller/ventes` `{ ok, ventes, incomplet }` or a 5xx when the book is down.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const CODE = 'SPA-1111-2222-3333-4444';
const COMPTE = { accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' } as const;
const PAS_RELIEE = 'Pas encore reliée à votre compte';
const HORS_LIGNE = "Vos ventes n'ont pas pu être lues.";
const VIDE = 'Aucune vente en cours.';
const RELOAD = 'Lecture de vos ventes';

const routesCommunes: Route[] = [
  (path) => (path === '/supply-projections' ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } } : null),
  (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
  (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, ...COMPTE } } : null),
];

async function seedAdmise(): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify(COMPTE));
  await expoAccessCodeStore().write(SESSION);
  await expoIdentityStore().write(JSON.stringify({ version: 1, digits: '7777' }));
}

async function attendre(screen: Screen, fragment: string): Promise<void> {
  for (let i = 0; i < 25 && !screen.shows(fragment); i += 1) await screen.settle();
  expect(screen.shows(fragment), `expected « ${fragment} »; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

const lecturesVentes = (fils: { calls: { path: string; auth?: string | null }[] }): number =>
  fils.calls.filter((c) => c.path === '/reseller/ventes').length;

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

describe('PORTE-VENTES-1 — an ACTIVE phone with its session on disk never reads « pas encore reliée »', () => {
  it('ROAD A: launched with the feed down → « hors ligne » → the reload LEAVES the phone riding her session, and the honest state replaces the sentence', async () => {
    await seedAdmise();
    let livreDebout = false;
    const fils = wire([
      ...routesCommunes,
      (path) => (path === '/reseller/ventes' ? (livreDebout ? { status: 200, json: { ok: true, ventes: [], incomplet: false } } : { status: 503, json: { ok: false, reason: 'down' } }) : null),
    ]);
    const screen = await mountApp();
    for (let i = 0; i < 10 && !screen.canPress('Tout voir'); i += 1) await screen.settle();
    await screen.press('Tout voir');
    await attendre(screen, HORS_LIGNE);
    expect(lecturesVentes(fils), 'the launch read rode her session').toBe(1);
    expect(screen.canPress(RELOAD), `the reload button; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // The book comes back; she taps the reload.
    livreDebout = true;
    await screen.press(RELOAD);
    await attendre(screen, VIDE);
    expect(lecturesVentes(fils), 'the reload LEFT the phone').toBe(2);
    expect(fils.calls.filter((c) => c.path === '/reseller/ventes').every((c) => c.auth === `Bearer ${SESSION}`), 'every read rode her session').toBe(true);
    const lu = screen.texts().join(' | ');
    expect(lu, 'an active phone never reads the no-account sentence').not.toContain(PAS_RELIEE);
    expect(lu).not.toContain(HORS_LIGNE);
    screen.unmount();
  });

  it('ROAD B: signup → admission in ONE app session → « Tout voir » shows her (empty) list — the feed was read with the session on disk, never « pas encore reliée »', async () => {
    const fils = wire([
      ...routesCommunes,
      (path, body) =>
        path === '/reseller/signup'
          ? { status: 200, json: { ok: true, accountId: 'rs-7777', name: (body?.['name'] as string) ?? '', state: 'pending_access', session: SESSION } }
          : null,
      (path) => (path === '/reseller/admission' ? { status: 200, json: { ok: true, state: 'active' } } : null),
      (path) => (path === '/reseller/ventes' ? { status: 200, json: { ok: true, ventes: [], incomplet: false } } : null),
    ]);
    const screen = await mountApp();
    expect(screen.shows('Créer mon compte'), `entrance first: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.type('Awa Traoré', 'Votre nom');
    await screen.type('70 11 22 33', 'Votre numéro WhatsApp');
    await screen.type('awa@example.bf', 'Votre email');
    await screen.type('grain-de-nere-77', 'Votre mot de passe (8 lettres ou plus)');
    await screen.press('Créer mon compte');
    await attendre(screen, 'Encore un pas');
    await screen.type(CODE, "Votre code d'accès");
    await screen.press('Ouvrir');
    for (let i = 0; i < 10 && !screen.canPress('Tout voir'); i += 1) await screen.settle();
    expect(screen.canPress('Opportunités'), 'the app shell opened').toBe(true);
    await screen.press('Tout voir');
    await attendre(screen, VIDE);
    const lu = screen.texts().join(' | ');
    expect(lu, `Mes ventes after admission: ${lu.slice(0, 600)}`).not.toContain(PAS_RELIEE);
    expect(fils.calls.some((c) => c.path === '/reseller/ventes' && c.auth === `Bearer ${SESSION}`), 'her feed was read with the session on disk').toBe(true);
    screen.unmount();
  });

  it('CONTROL — the same admitted phone RELAUNCHED reads the feed at mount and shows the honest empty state', async () => {
    await seedAdmise();
    const fils = wire([
      ...routesCommunes,
      (path) => (path === '/reseller/ventes' ? { status: 200, json: { ok: true, ventes: [], incomplet: false } } : null),
    ]);
    const screen = await mountApp();
    for (let i = 0; i < 10 && !screen.canPress('Tout voir'); i += 1) await screen.settle();
    await screen.press('Tout voir');
    await attendre(screen, VIDE);
    expect(fils.calls.some((c) => c.path === '/reseller/ventes' && c.auth === `Bearer ${SESSION}`)).toBe(true);
    expect(screen.texts().join(' | ')).not.toContain(PAS_RELIEE);
    screen.unmount();
  });
});
