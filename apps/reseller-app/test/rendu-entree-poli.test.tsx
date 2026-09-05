import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — ENTREE-POLI-1 (founder 2026-09-05: « go with A ») — the
 * redrawn entrance still WORKS, and its one road nobody had driven: login ═══
 *
 * The screen changed shape (a white card, labels above the fields, a two-step
 * rail, a link row with two texts). The walks that already cross it —
 * `rendu-rayons-compte` (signup), `rendu-entree-armee` (the whole armed
 * first-run), `rendu-admission-pilote` (the door's refusals) — keep proving
 * those roads on the new markup. What none of them ever pressed is the
 * entrance's SECOND road: « J'ai déjà un compte » → the login mode → the
 * login POST → the app open. That road is driven here, end to end, plus the
 * way back (« Je suis nouvelle ici ») and the rail's presence on both the
 * signup screen and the code door — the continuity the design exists for.
 *
 * The login fake is contract-certified against the real door
 * (`reseller-accounts-do.ts:326`: `{ ok, accountId, name, categories?, state,
 * session }`). WHAT IT MAY NEVER CLAIM: appearance — the card, the colours,
 * the rail's look live in `entree-poli.test.ts` (pins) and on his phone.
 */

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const PORTE_COMPTE = 'Créer mon compte';
const PORTE_ADMISSION = 'Encore un pas';

function routes(): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    // login — the REAL door's 200 (reseller-accounts-do.ts:326): her account, ACTIVE, with the session
    (path) =>
      path === '/reseller/login'
        ? { status: 200, json: { ok: true, accountId: 'rs-7777', name: 'Awa', state: 'active', session: SESSION } }
        : null,
    (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, accountId: 'rs-7777', name: 'Awa', state: 'pending_access' } } : null),
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 404, json: { error: 'not_found' } } : null),
  ];
}

async function seedPending(): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify({ accountId: 'rs-7777', name: 'Awa', state: 'pending_access' }));
  await expoAccessCodeStore().write(SESSION);
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

describe('ENTREE-POLI-1 — the redrawn entrance, driven', () => {
  it('the signup screen carries the rail and the primary act; « Me connecter » is the way to the second road', async () => {
    wire(routes());
    const screen = await mountApp();

    // The entrance, with the rail that says what comes after.
    expect(screen.shows(PORTE_COMPTE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts()).toContain('Votre compte');
    expect(screen.texts()).toContain("Votre code d'accès");
    expect(screen.shows('Gratuit. Votre compte est prêt en deux minutes.')).toBe(true);
    // The primary act is present and wired; only disabled because the form is empty.
    expect(screen.canPress('Me connecter'), 'the link to the login road must be pressable').toBe(true);

    screen.unmount();
  });

  it('LOGIN, end to end: « Me connecter » → email + mot de passe → the login POST → the app opens; and « Je suis nouvelle ici » leads back', async () => {
    const fils = wire(routes());
    const screen = await mountApp();

    await screen.press('Me connecter');
    // The login mode: its own sentence, the signup-only fields gone.
    expect(screen.shows('Content de vous revoir. Connectez-vous.'), `after the switch: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows(PORTE_COMPTE)).toBe(false);
    expect(() => screen.texts()).not.toThrow();

    // The way back exists and works — then forward again.
    await screen.press('Je suis nouvelle ici');
    expect(screen.shows(PORTE_COMPTE)).toBe(true);
    await screen.press('Me connecter');

    // She logs in.
    await screen.type('awa@example.bf', 'Votre email');
    await screen.type('motdepasse', 'Votre mot de passe (8 lettres ou plus)');
    expect(screen.canPress('Me connecter'), 'the primary act must arm once both fields are filled').toBe(true);
    await screen.press('Me connecter');
    await screen.settle();

    // 1. the port was CALLED, with what she typed.
    const login = fils.calls.find((c) => c.path === '/reseller/login');
    expect(login, `login never left the phone; calls: ${JSON.stringify(fils.calls.map((c) => c.path))}`).toBeDefined();
    expect(login!.body?.['email']).toBe('awa@example.bf');
    expect(login!.body?.['password']).toBe('motdepasse');

    // 2. the door is GONE and the app stands — she reached the next step.
    expect(screen.shows(PORTE_COMPTE)).toBe(false);
    expect(screen.shows(PORTE_ADMISSION)).toBe(false);
    expect(screen.canPress('Opportunités'), `after login: ${JSON.stringify(screen.texts())}`).toBe(true);

    screen.unmount();
  });

  it('the password is MASKED by default; « Afficher » reveals it, « Masquer » hides it again — in both modes', async () => {
    wire(routes());
    const screen = await mountApp();
    const mdp = (): { secureTextEntry?: boolean } => {
      const inputs = screen.tree.root.findAllByType('TextInput' as never);
      const field = inputs.find((i) => i.props['accessibilityLabel'] === 'Votre mot de passe (8 lettres ou plus)');
      if (field === undefined) throw new Error(`no password field. Fields: ${JSON.stringify(inputs.map((i) => i.props['accessibilityLabel']))}`);
      return field.props as { secureTextEntry?: boolean };
    };

    // Signup mode: masked, and the way to check what she typed is one tap away.
    expect(mdp().secureTextEntry).toBe(true);
    expect(screen.canPress('Afficher')).toBe(true);
    await screen.press('Afficher');
    expect(mdp().secureTextEntry).toBe(false);
    expect(screen.canPress('Masquer')).toBe(true);
    await screen.press('Masquer');
    expect(mdp().secureTextEntry).toBe(true);

    // Login mode: the same control, the same default.
    await screen.press('Me connecter');
    expect(mdp().secureTextEntry).toBe(true);
    await screen.press('Afficher');
    expect(mdp().secureTextEntry).toBe(false);
    // …and what she typed still travels: the field stays the one the login reads.
    await screen.type('motdepasse', 'Votre mot de passe (8 lettres ou plus)');
    await screen.type('awa@example.bf', 'Votre email');
    expect(screen.canPress('Me connecter')).toBe(true);

    screen.unmount();
  });

  it('the code door carries the SAME rail, its first step behind her', async () => {
    await seedPending();
    wire(routes());
    const screen = await mountApp();

    expect(screen.shows(PORTE_ADMISSION), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // EXACT text nodes, not substrings: the door's own subtitle begins with
    // « Votre compte est prêt… », so `shows('Votre compte')` would pass with
    // no rail at all (a mutation proved it). The rail's labels are whole nodes.
    expect(screen.texts()).toContain('Votre compte');
    expect(screen.texts()).toContain("Votre code d'accès");
    // The act stands, armed only once a code is typed.
    expect(screen.canPress('Ouvrir')).toBe(false);
    await screen.type('SPA-1111-2222-3333-4444', "Votre code d'accès");
    expect(screen.canPress('Ouvrir')).toBe(true);

    screen.unmount();
  });
});
