import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — ACCES-ARME-1 (a2b phase 1, founder 2026-09-04: « go a2b »):
 * the WHOLE armed first-run, in ONE mount, from the founder's exact phone ═══
 *
 * `expo-preview.yml` now ships `EXPO_PUBLIC_ACCESS_GATE: on`, so the published
 * app asks at the entrance for the first time. The one journey the founder will
 * live on his own phone the day this lands has never been driven end to end —
 * the entrance leg (rendu-rayons-compte) and the admission REFUSALS
 * (rendu-admission-pilote) each stop one step short of the tap that matters:
 * the RIGHT code, accepted, opening the app.
 *
 * So this walk starts from his device's real state — an OLD device-era identity
 * on disk (digits 4242) whose shop is LIVE on the wire, and no account — and
 * crosses: porte → signup (session + pending) → admission door → right code →
 * the app OPEN. Then it asks the disk what the journey wrote: compte active,
 * session stored, and the identity file re-keyed to the ACCOUNT's digits — the
 * split-brain end RESELLER-ACCOUNTS-1d exists for, now proven on the exact
 * transition his phone will make.
 *
 * The fakes are contract-certified against the real doors
 * (`reseller-accounts-do.ts:307` signup, `:372` admission); the doors
 * themselves are seam-proven on the built Worker in
 * `services/storefront-service/test/accounts.e2e.test.ts`.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const CODE = 'SPA-1111-2222-3333-4444';
const PORTE_COMPTE = 'Créer mon compte';
const PORTE_ADMISSION = 'Encore un pas';

/** His live device-era shop, as the wire serves it today (resellerId rs-4242). */
function ancienneBoutique() {
  return {
    id: 'sf-4242', resellerId: 'rs-4242', slug: 'chezlui-4242', discoverable: true,
    curatedItems: [] as string[], name: 'Chez Lui', zone: 'Ouagadougou', category: 'mode',
    createdAt: '2026-08-01T08:00:00.000Z', updatedAt: '2026-08-01T08:00:00.000Z',
    tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
    sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  };
}

function routes(): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    // signup — the REAL door's 200 (reseller-accounts-do.ts:307): pending, with the session
    (path, body) =>
      path === '/reseller/signup'
        ? {
            status: 200,
            json: { ok: true, accountId: 'rs-7777', name: (body?.['name'] as string) ?? '', state: 'pending_access', session: SESSION },
          }
        : null,
    // admission — the REAL door's 200 (reseller-accounts-do.ts:372)
    (path) => (path === '/reseller/admission' ? { status: 200, json: { ok: true, state: 'active' } } : null),
    (path) => (path === '/storefronts' ? { status: 200, json: [ancienneBoutique()] as never } : null),
    (path) => (path === '/storefronts/sf-4242' ? { status: 200, json: ancienneBoutique() as never } : null),
    // the ACCOUNT identity has no shop yet — the create road, not an error
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 404, json: { error: 'not_found' } } : null),
  ];
}

/** The founder's phone today: a device-era identity, no account anywhere. */
async function seedTelephoneDuFondateur(): Promise<void> {
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  await expoIdentityStore().write(JSON.stringify({ version: 1, digits: '4242' }));
}

async function disque(): Promise<{ compteState: string | undefined; session: string | null; digits: string | undefined }> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  const brutCompte = await expoAccessCodeStore('reseller-compte.v1.txt').read();
  const brutIdentite = await expoIdentityStore().read();
  return {
    compteState: brutCompte === null ? undefined : (JSON.parse(brutCompte) as { state?: string }).state,
    session: await expoAccessCodeStore().read(),
    digits: brutIdentite === null ? undefined : (JSON.parse(brutIdentite) as { digits?: string }).digits,
  };
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
});

describe('ACCES-ARME-1 — the armed first-run, entrance to open app, one mount', () => {
  it('porte → signup → admission → the RIGHT code opens the app, and the disk carries compte + session + the ACCOUNT identity', async () => {
    process.env['EXPO_PUBLIC_ACCESS_GATE'] = 'on';
    await seedTelephoneDuFondateur();
    const fils = wire(routes());
    const screen = await mountApp();

    // THE PORTE — armed, no compte: the entrance, and nothing of the app shell.
    expect(screen.shows(PORTE_COMPTE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Opportunités')).toBe(false);

    // He signs up — real fields, real button.
    await screen.type('Le Fondateur', 'Votre nom');
    await screen.type('70 00 00 00', 'Votre numéro WhatsApp');
    await screen.type('fondateur@example.bf', 'Votre email');
    await screen.type('motdepasse', 'Votre mot de passe (8 lettres ou plus)');
    await screen.press(PORTE_COMPTE);

    // The signup left the phone, and the tree survived into the NEXT step.
    const signup = fils.calls.find((c) => c.path === '/reseller/signup');
    expect(signup, 'the signup must have been sent').toBeDefined();
    expect(signup!.body?.['name']).toBe('Le Fondateur');
    expect(screen.shows(PORTE_ADMISSION), `after signup: ${JSON.stringify(screen.texts())}`).toBe(true);

    // He enters the code he minted on his console.
    await screen.type(CODE, "Votre code d'accès");
    await screen.press('Ouvrir');
    await screen.settle();

    // 1. the admission port was CALLED, with his code, RIDING his session —
    //    the a2a fact, invisible to any source scan.
    const admission = fils.calls.find((c) => c.path === '/reseller/admission');
    expect(admission, `admission never left the phone; calls: ${JSON.stringify(fils.calls.map((c) => c.path))}`).toBeDefined();
    expect(admission!.body?.['code']).toBe(CODE);
    expect(admission!.auth).toBe(`Bearer ${SESSION}`);

    // 2. the door is GONE and the app shell stands — he reached the next step.
    expect(screen.shows(PORTE_ADMISSION)).toBe(false);
    expect(screen.shows(PORTE_COMPTE)).toBe(false);
    expect(screen.canPress('Opportunités'), `after admission: ${JSON.stringify(screen.texts())}`).toBe(true);

    // 3. the disk tells the same story: compte ACTIVE, the session stored where
    //    every read already looks for its bearer…
    const apres = await disque();
    expect(apres.compteState).toBe('active');
    expect(apres.session).toBe(SESSION);
    // …and the identity file re-keyed from the device's 4242 to the ACCOUNT's
    // 7777: everything he creates from here rides rs-7777 (his feed, his
    // suivi), never the device-random person. The old shop is simply never
    // addressed again — its page keeps resolving (a printed QR never dies).
    expect(apres.digits).toBe('7777');

    screen.unmount();
  });

  it('CONTROL — the same phone, gate NOT armed: no door, the app opens as today', async () => {
    await seedTelephoneDuFondateur();
    wire(routes());
    const screen = await mountApp();

    // Today's behavior, byte-identical: the arming is the ONLY thing that
    // changes the entrance, and an unset flag can lock nobody out.
    expect(screen.shows(PORTE_COMPTE)).toBe(false);
    expect(screen.canPress('Opportunités')).toBe(true);

    screen.unmount();
  });
});
