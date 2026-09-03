import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — RESELLER-PILOTE-1 (AUDIT-SHOP-1 slice a1): the admission
 * door, driven, when the book answers « the pilot is full » ═══
 *
 * The Worker now refuses the second reseller BY NAME (`plafond_pilote`, 403)
 * at the door. Before this slice the app read EVERY 403 at the door as the
 * founder's pause: it wrote `paused` to her disk and showed « Votre accès est
 * en pause » — a verdict on a woman whose only fact is that the pilot has one
 * seat. This walk mounts the REAL App over the REAL compte port with only
 * `globalThis.fetch` faked, presses the real « Ouvrir », and asks the four
 * questions: did the tree survive · was the port CALLED · what does she read ·
 * can she still get to the next step (the door stands, her disk still says
 * pending). The pause path is walked as the CONTROL, so the new reading is
 * proven not to swallow the old one.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const CODE = 'SPA-1111-2222-3333-4444';
const COMPTE = { accountId: 'rs-7777', name: 'Awa', state: 'pending_access' } as const;
const PHRASE_PILOTE = "L'application n'accueille pas encore de nouveau compte. Le vôtre est gardé : contactez-nous pour la suite.";
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

describe('the admission door when the pilot is full', () => {
  it('« Ouvrir » reaches the port; she reads the pilot sentence, NOT the pause; the door still stands and her disk still says pending', async () => {
    await seedPending();
    const fils = wire(routes({ status: 403, json: { ok: false, reason: 'plafond_pilote' } }));
    const screen = await mountApp();

    // The door rendered from the pending compte on disk.
    expect(screen.shows(PORTE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.type(CODE, "Votre code d'accès");
    await screen.press('Ouvrir');
    await screen.settle();

    // 1. the port was CALLED, with her code and her bearer — not a dead button.
    const appel = fils.calls.find((c) => c.path === '/reseller/admission');
    expect(appel, `admission never left the phone; calls: ${JSON.stringify(fils.calls.map((c) => c.path))}`).toBeDefined();
    expect(appel!.body?.['code']).toBe(CODE);

    // 2. the tree survived and she reads the honest sentence…
    expect(screen.shows(PHRASE_PILOTE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    // 3. …and NOT the founder's pause, which is a different fact about her.
    expect(screen.shows(PHRASE_PAUSE)).toBe(false);
    // 4. the door still stands — she can try again the day a seat opens — and
    //    nothing was written to her disk that the book did not say.
    expect(screen.shows(PORTE)).toBe(true);
    expect(screen.canPress('Ouvrir')).toBe(true);
    expect(await etatSurDisque()).toBe('pending_access');

    screen.unmount();
  });

  it('CONTROL — the founder\'s pause still lands as the pause: the coupe screen, and « paused » on disk', async () => {
    await seedPending();
    wire(routes({ status: 403, json: { ok: false, reason: 'access_paused' } }));
    const screen = await mountApp();
    expect(screen.shows(PORTE)).toBe(true);
    await screen.type(CODE, "Votre code d'accès");
    await screen.press('Ouvrir');
    await screen.settle();

    expect(screen.shows(PHRASE_PAUSE), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows(PHRASE_PILOTE)).toBe(false);
    expect(screen.canPress('Vérifier à nouveau')).toBe(true);
    expect(await etatSurDisque()).toBe('paused');

    screen.unmount();
  });
});
