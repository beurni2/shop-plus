import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route, type Screen } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — SESSION-VIE-1 (AUDIT-SHOP-2 F-07): THE END OF A SESSION IS
 * A DESIGNED STATE, walked on the mounted App with the gate ARMED ═══
 *
 * The audit WALKED the pre-slice app (walk D1): every route 401 → no door,
 * three unrelated sentences, no « Me connecter », disk still `active`; only
 * clearing the app's data recovered. The four questions, on the real App:
 *   · did the tree survive — the book's 401 lands and the ENTRANCE stands, in
 *     connexion mode, with the one sentence that says why;
 *   · is the primary action present AND pressable AND wired — « Me connecter »
 *     POSTs /reseller/login and « Me déconnecter » POSTs /reseller/logout
 *     RIDING her session;
 *   · does an act that fires by itself leave a way out — the launch refresh
 *     and the feed's refusal end the session ONLY on the book's own word: a
 *     feed 401 with a live session leaves her in;
 *   · can she reach the next step — the login opens the app again, the disk
 *     holds the NEW session, and her feed is re-read with it.
 *
 * The doubles are contract-certified against the deployed bundle's own bounds
 * (accounts.e2e — SESSION-VIE-1 describes): /reseller/session answers 401
 * `no_session` for a revoked or expired session, /reseller/logout answers
 * `{ok:true}`, /reseller/login 200 carries the compte + a fresh `SPS-` session,
 * and /reseller/ventes answers `{error:'unauthorized'}` 401 on a dead bearer.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const SESSION_NEUVE = 'SPS-NEUF-NEUF-NEUF-NEUF';
const COMPTE = { accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' } as const;
const FINIE = 'Votre session est finie. Connectez-vous à nouveau pour continuer.';
const DECONNECTEE = 'Vous êtes bien déconnectée. Revenez quand vous voulez.';

interface Livre {
  /** /reseller/session answers 401 once this many reads have been answered 200
   *  (null = alive for ever). */
  sessionMorteApres: number | null;
  ventesMortes: boolean;
  profilMort: boolean;
  sessionsLues: number;
}

function routes(livre: Livre): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) => {
      if (path !== '/reseller/session') return null;
      livre.sessionsLues += 1;
      if (livre.sessionMorteApres !== null && livre.sessionsLues > livre.sessionMorteApres) {
        return { status: 401, json: { ok: false, reason: 'no_session' } };
      }
      return { status: 200, json: { ok: true, ...COMPTE } };
    },
    (path, body) => {
      if (path !== '/reseller/login') return null;
      if (body?.['password'] !== 'grain-de-nere-77') return { status: 401, json: { ok: false, reason: 'bad_credentials' } };
      return { status: 200, json: { ok: true, ...COMPTE, session: SESSION_NEUVE } };
    },
    (path) => (path === '/reseller/logout' ? { status: 200, json: { ok: true } } : null),
    (path) =>
      path === '/reseller/ventes'
        ? livre.ventesMortes
          ? { status: 401, json: { error: 'unauthorized' } }
          : { status: 200, json: { ok: true, ventes: [], incomplet: false } }
        : null,
    (path) =>
      path === '/reseller/profile'
        ? livre.profilMort
          ? { status: 401, json: { ok: false, reason: 'no_session' } }
          : { status: 200, json: { ok: true, ...COMPTE, email: 'awa@example.bf', phone: '70 11 22 33' } }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
  ];
}

function livreVivant(): Livre {
  return { sessionMorteApres: null, ventesMortes: false, profilMort: false, sessionsLues: 0 };
}

async function seedAdmise(): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify(COMPTE));
  await expoAccessCodeStore().write(SESSION);
  await expoIdentityStore().write(JSON.stringify({ version: 1, digits: '7777' }));
}

async function disque(): Promise<{ compte: string | null; session: string | null }> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  return {
    compte: await expoAccessCodeStore('reseller-compte.v1.txt').read(),
    session: await expoAccessCodeStore().read(),
  };
}

/** Settle until the screen says it (bounded) — the roads here chain several
 *  awaits (two store reads, a fetch, two store writes) past one settle. */
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

describe('SESSION-VIE-1 — the book says the session is over: the entrance, in connexion mode, with the sentence — and the road back in', () => {
  it('launch with a revoked session → « session finie », disk forgotten, no app shell; login → the app opens, the NEW session is on disk and her feed is re-read with it', async () => {
    await seedAdmise();
    const livre: Livre = { ...livreVivant(), sessionMorteApres: 0 };
    const fils = wire(routes(livre));
    const screen = await mountApp();

    await attendre(screen, FINIE);
    // the entrance in CONNEXION mode: the login act, not the signup one
    expect(screen.shows('Me connecter')).toBe(true);
    expect(screen.shows('Créer mon compte')).toBe(false);
    expect(screen.canPress('Opportunités'), 'no app shell behind a dead session').toBe(false);
    const oubli = await disque();
    expect(oubli.compte, 'the compte file is forgotten').toBeNull();
    expect(oubli.session, 'the session file is forgotten').toBeNull();

    // The road back in — the real fields, the real button, the real port.
    livre.sessionMorteApres = null;
    await screen.type('awa@example.bf', 'Votre email');
    await screen.type('grain-de-nere-77', 'Votre mot de passe');
    expect(screen.canPress('Me connecter')).toBe(true);
    await screen.press('Me connecter');
    for (let i = 0; i < 10 && !screen.canPress('Opportunités'); i += 1) await screen.settle();

    const login = fils.calls.find((c) => c.path === '/reseller/login');
    expect(login, 'the login must have left the phone').toBeDefined();
    expect(login!.body?.['email']).toBe('awa@example.bf');
    expect(screen.canPress('Opportunités'), `after login: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows(FINIE)).toBe(false);
    const retour = await disque();
    expect(retour.session).toBe(SESSION_NEUVE);
    expect(retour.compte).not.toBeNull();
    expect((JSON.parse(retour.compte!) as { state?: string }).state).toBe('active');
    // …and her feed was asked again, RIDING the new session — the hook had
    // read the dead one at mount and would have shown its refusal for ever.
    for (let i = 0; i < 10 && !fils.calls.some((c) => c.path === '/reseller/ventes' && c.auth === `Bearer ${SESSION_NEUVE}`); i += 1) {
      await screen.settle();
    }
    expect(fils.calls.some((c) => c.path === '/reseller/ventes' && c.auth === `Bearer ${SESSION_NEUVE}`), 'the feed must be re-read with the new session').toBe(true);
    screen.unmount();
  });

  it('a WRONG password at the road back in speaks and stays retryable; too many tries speaks « attendez » — never a dead button', async () => {
    await seedAdmise();
    const livre: Livre = { ...livreVivant(), sessionMorteApres: 0 };
    const fils = wire(routes(livre));
    const screen = await mountApp();
    await attendre(screen, FINIE);

    await screen.type('awa@example.bf', 'Votre email');
    await screen.type('pas-le-bon-8', 'Votre mot de passe');
    await screen.press('Me connecter');
    await attendre(screen, 'Email ou mot de passe incorrect. Vérifiez et réessayez.');
    expect(screen.canPress('Me connecter'), 'the way out: the act still fires').toBe(true);
    expect(fils.calls.filter((c) => c.path === '/reseller/login').length).toBe(1);

    // The door counted too many refusals (the deployed book's 429).
    (globalThis as { fetch: unknown }).fetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ ok: false, reason: 'too_many_attempts' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    await screen.press('Me connecter');
    await attendre(screen, "Trop d'essais. Attendez un quart d'heure, puis réessayez.");
    screen.unmount();
  });
});

describe('SESSION-VIE-1 — « Me déconnecter » on her page: the logout rides her session, and the phone forgets', () => {
  it('Profil → « Me déconnecter » → POST /reseller/logout with Bearer SPS → the entrance says she is out; disk forgotten; the session was ALIVE (control)', async () => {
    await seedAdmise();
    const livre = livreVivant();
    const fils = wire(routes(livre));
    const screen = await mountApp();
    await screen.press('Profil');
    await attendre(screen, 'Mes informations');

    expect(screen.canPress('Me déconnecter')).toBe(true);
    await screen.press('Me déconnecter');
    await attendre(screen, DECONNECTEE);

    const sortie = fils.calls.find((c) => c.path === '/reseller/logout');
    expect(sortie, 'the logout must have left the phone').toBeDefined();
    expect(sortie!.method).toBe('POST');
    expect(sortie!.auth).toBe(`Bearer ${SESSION}`);
    expect(screen.shows('Me connecter')).toBe(true);
    expect(screen.canPress('Opportunités')).toBe(false);
    const apres = await disque();
    expect(apres.compte).toBeNull();
    expect(apres.session).toBeNull();
    // Control: the book never refused this session — the act alone ended it.
    expect(livre.sessionMorteApres).toBeNull();
    screen.unmount();
  });

  it('the row stands beside the network card too, and the phone forgets AT ONCE — the entrance lands before the book ever answers the logout', async () => {
    await seedAdmise();
    const livre = livreVivant();
    const fils = wire([
      ...routes(livre).filter((r) => r('/reseller/profile', null) === null),
      (path) => (path === '/reseller/profile' ? { status: 503, json: { ok: false, reason: 'accounts_unavailable' } } : null),
    ]);
    // The logout wire HANGS (a dead network, before the client's own timeout):
    // the recorded fake answers every other path; this one never resolves.
    const enregistre = (globalThis as { fetch: (u: string, i?: RequestInit) => Promise<Response> }).fetch;
    (globalThis as { fetch: unknown }).fetch = (u: string, i?: RequestInit): Promise<Response> => {
      const p = enregistre(u, i);
      return new URL(u, 'http://shop.test').pathname === '/reseller/logout' ? new Promise<Response>(() => undefined) : p;
    };
    const screen = await mountApp();
    await screen.press('Profil');
    await attendre(screen, 'Pas de réseau. Réessayez dès que ça revient.');

    expect(screen.canPress('Me déconnecter')).toBe(true);
    await screen.press('Me déconnecter');
    await attendre(screen, DECONNECTEE); // reached with the wire still hanging
    expect(fils.calls.some((c) => c.path === '/reseller/logout' && c.auth === `Bearer ${SESSION}`), 'the book was told, riding her session').toBe(true);
    expect((await disque()).session).toBeNull(); // forgotten regardless
    expect(screen.shows('Me connecter')).toBe(true);
    screen.unmount();
  });
});

describe('SESSION-VIE-1 — a refusal on her money feed is a QUESTION to the book, never the verdict', () => {
  it('feed 401 + the book says « no session » on the second read → the entrance; the book was asked exactly twice (launch + the question)', async () => {
    await seedAdmise();
    // The launch refresh (read 1) finds the session alive; the feed's 401
    // makes the App ask again (read 2) and THAT answer ends it.
    const livre: Livre = { ...livreVivant(), sessionMorteApres: 1, ventesMortes: true };
    const fils = wire(routes(livre));
    const screen = await mountApp();
    await attendre(screen, FINIE);

    expect(fils.calls.filter((c) => c.path === '/reseller/session').length, 'launch read + the question').toBe(2);
    expect(fils.calls.some((c) => c.path === '/reseller/logout')).toBe(false); // ended by the book, not by her
    expect((await disque()).session).toBeNull();
    screen.unmount();
  });

  it('CONTROL — feed 401 but the book still says the session is alive → she stays IN: the app shell stands, the disk keeps the session', async () => {
    await seedAdmise();
    const livre: Livre = { ...livreVivant(), ventesMortes: true };
    const fils = wire(routes(livre));
    const screen = await mountApp();
    for (let i = 0; i < 10 && fils.calls.filter((c) => c.path === '/reseller/session').length < 2; i += 1) await screen.settle();

    expect(fils.calls.filter((c) => c.path === '/reseller/session').length, 'the question was asked').toBe(2);
    expect(screen.canPress('Opportunités'), `still in: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows(FINIE)).toBe(false);
    expect((await disque()).session).toBe(SESSION);
    screen.unmount();
  });
});

describe('SESSION-VIE-1 — her page hears the book too', () => {
  it('Profil read answers 401 no_session → the entrance with the sentence, not « Pas de réseau »', async () => {
    await seedAdmise();
    const livre: Livre = { ...livreVivant(), profilMort: true };
    wire(routes(livre));
    const screen = await mountApp();
    await screen.press('Profil');
    await attendre(screen, FINIE);

    expect(screen.shows('Pas de réseau. Réessayez dès que ça revient.')).toBe(false);
    expect(screen.shows('Me connecter')).toBe(true);
    expect((await disque()).session).toBeNull();
    screen.unmount();
  });
});
