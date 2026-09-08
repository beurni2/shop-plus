import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — ADMISSION-ORDRE-1 (AUDIT-SHOP-2 F-14): a stale launch
 * refresh can no longer close the door AFTER she was admitted ═══
 *
 * The audit WALKED the bug (walk B): `/reseller/session` held on a barrier; she
 * typed her code, « Ouvrir » → admitted, « Opportunités » pressable, disk
 * `active`; the barrier released with the OLD answer (`pending_access`) → the
 * admission screen came back and the disk read `pending_access`. The only way
 * out was killing the app — on the onboarding road of every new reseller on a
 * 2G phone.
 *
 * The four questions: the tree survives the late answer · « Ouvrir » is
 * present, pressable and wired · the act that fires by itself (the launch
 * refresh) can no longer undo hers · she stays on the next screen.
 *
 * The doubles are contract-certified to the deployed bundle (accounts.e2e):
 * `/reseller/session` answers the compte with its state; `/reseller/admission`
 * 200 `{ok, state:'active'}`. Only `fetch` is faked.
 */

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const CODE = 'SPA-1111-2222-3333-4444';
const COMPTE = { accountId: 'rs-7777', name: 'Awa Traoré', state: 'pending_access' } as const;
const PORTE_ADMISSION = 'Encore un pas';

async function seedEnAttente(): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify(COMPTE));
  await expoAccessCodeStore().write(SESSION);
}

async function etatSurDisque(): Promise<string | undefined> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  const brut = await expoAccessCodeStore('reseller-compte.v1.txt').read();
  return brut === null ? undefined : (JSON.parse(brut) as { state?: string }).state;
}

const routes: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
      : null,
  (path) => (path === '/reseller/admission' ? { status: 200, json: { ok: true, state: 'active' } } : null),
  (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
];

/**
 * A BARRIER on the session read: the recorded fake answers every other path at
 * once; `/reseller/session` waits until the test releases it — the slow link.
 */
function barriereSurSession(): { relacher: (body: Record<string, unknown>) => void } {
  const enregistre = (globalThis as { fetch: (u: string, i?: RequestInit) => Promise<Response> }).fetch;
  let relacher: (body: Record<string, unknown>) => void = () => undefined;
  (globalThis as { fetch: unknown }).fetch = (u: string, i?: RequestInit): Promise<Response> => {
    const p = enregistre(u, i);
    if (new URL(u, 'http://shop.test').pathname !== '/reseller/session') return p;
    return new Promise<Response>((resolve) => {
      relacher = (body) => resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
  };
  return { relacher: (body) => relacher(body) };
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

describe('ADMISSION-ORDRE-1 — the admission she just made outranks the refresh that started before it', () => {
  it('session read held → code typed → « Ouvrir » admits her → the held read answers pending_access → she STAYS in, disk stays active', async () => {
    await seedEnAttente();
    const fils = wire(routes);
    const barriere = barriereSurSession();
    const screen = await mountApp();

    // The admission door, the refresh still in flight behind it.
    expect(screen.shows(PORTE_ADMISSION), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(fils.calls.some((c) => c.path === '/reseller/session'), 'the launch refresh left the phone').toBe(true);

    await screen.type(CODE, "Votre code d'accès");
    await screen.press('Ouvrir');
    for (let i = 0; i < 10 && !screen.canPress('Opportunités'); i += 1) await screen.settle();
    expect(fils.calls.some((c) => c.path === '/reseller/admission')).toBe(true);
    expect(screen.canPress('Opportunités'), `after admission: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(await etatSurDisque()).toBe('active');

    // THE SLOW LINK ANSWERS, LATE, WITH THE WORLD AS IT WAS: nothing moves.
    barriere.relacher({ ok: true, ...COMPTE });
    for (let i = 0; i < 6; i += 1) await screen.settle();
    expect(screen.shows(PORTE_ADMISSION), 'the stale answer must not close the door').toBe(false);
    expect(screen.canPress('Opportunités')).toBe(true);
    expect(await etatSurDisque(), 'the stale answer must not reach the disk').toBe('active');
    screen.unmount();
  });

  it('CONTROL — with no act in between, the refresh still lands: a founder pause reaches a phone already inside', async () => {
    const { expoAccessCodeStore } = await import('../src/sales/code-store');
    await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify({ ...COMPTE, state: 'active' }));
    await expoAccessCodeStore().write(SESSION);
    wire(routes);
    const barriere = barriereSurSession();
    const screen = await mountApp();
    expect(screen.canPress('Opportunités')).toBe(true);

    barriere.relacher({ ok: true, ...COMPTE, state: 'paused' });
    for (let i = 0; i < 6 && !screen.shows('Votre accès est en pause'); i += 1) await screen.settle();
    expect(screen.shows('Votre accès est en pause'), 'a refresh with nothing newer than it must still apply').toBe(true);
    expect(await etatSurDisque()).toBe('paused');
    screen.unmount();
  });
});
