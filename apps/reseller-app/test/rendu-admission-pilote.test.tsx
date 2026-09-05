import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — the admission door, driven, when the book answers 403 ═══
 *
 * Born as RESELLER-PILOTE-1's walk (AUDIT-SHOP-1 slice a1): the Worker then
 * refused the second reseller BY NAME (`plafond_pilote`) at the door, and the
 * app had to read that as « the pilot is full », never as the founder's pause.
 * ACCES-ARME-2 (a2b phase 2) DELETED the ceiling with the shared key that
 * justified it — the book seats every admitted account — so the pilot
 * sentence and its reading are gone from the app. What this walk keeps is
 * the road that outlived the ceiling: a 403 at the door IS the founder's
 * pause — the coupe screen, « paused » on her disk, and the way to check
 * again. It mounts the REAL App over the REAL compte port with only
 * `globalThis.fetch` faked, presses the real « Ouvrir », and asks the four
 * questions: did the tree survive · was the port CALLED · what does she read
 * · can she get to the next step.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const CODE = 'SPA-1111-2222-3333-4444';
const COMPTE = { accountId: 'rs-7777', name: 'Awa', state: 'pending_access' } as const;
const PHRASE_PAUSE = 'Votre accès est en pause';
const PORTE = 'Encore un pas';

async function seedPending(): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify(COMPTE));
  await expoAccessCodeStore().write(SESSION);
}

async function etatSurDisque(): Promise<string | undefined> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  const brut = await expoAccessCodeStore('reseller-compte.v1.txt').read();
  return brut === null ? undefined : (JSON.parse(brut) as { state?: string }).state;
}

function routes(porte: { status: number; json: Record<string, unknown> }): Route[] {
  return [
    // the launch refresh re-reads her session: still pending, per the book
    (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, ...COMPTE } } : null),
    (path) => (path === '/reseller/admission' ? porte : null),
  ];
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

describe('the admission door when the book answers 403', () => {
  it('« Ouvrir » reaches the port; the founder\'s pause lands as the pause: the coupe screen, « paused » on disk, and a way to check again', async () => {
    await seedPending();
    const fils = wire(routes({ status: 403, json: { ok: false, reason: 'access_paused' } }));
    const screen = await mountApp();

    // The door rendered from the pending compte on disk.
    expect(screen.shows(PORTE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.type(CODE, "Votre code d'accès");
    await screen.press('Ouvrir');
    await screen.settle();

    // 1. the port was CALLED, with her code — not a dead button.
    const appel = fils.calls.find((c) => c.path === '/reseller/admission');
    expect(appel, `admission never left the phone; calls: ${JSON.stringify(fils.calls.map((c) => c.path))}`).toBeDefined();
    expect(appel!.body?.['code']).toBe(CODE);

    // 2. the tree survived and she reads the pause…
    expect(screen.shows(PHRASE_PAUSE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // 3. …with the way to check again, and
    expect(screen.canPress('Vérifier à nouveau')).toBe(true);
    // 4. her disk says what the book said.
    expect(await etatSurDisque()).toBe('paused');

    screen.unmount();
  });

  it('ACCES-ARME-2 — a 403 that still says `plafond_pilote` (a stale Worker) is read as the pause too: no pilot sentence exists any more', async () => {
    await seedPending();
    wire(routes({ status: 403, json: { ok: false, reason: 'plafond_pilote' } }));
    const screen = await mountApp();
    expect(screen.shows(PORTE)).toBe(true);
    await screen.type(CODE, "Votre code d'accès");
    await screen.press('Ouvrir');
    await screen.settle();

    expect(screen.shows(PHRASE_PAUSE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().some((t) => t.includes("n'accueille pas encore"))).toBe(false);
    expect(await etatSurDisque()).toBe('paused');

    screen.unmount();
  });
});
