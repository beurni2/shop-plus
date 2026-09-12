import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — IDENTITE-COMPTE-1 (AUDIT-SHOP-2 F-47): her ACCOUNT is her
 * identity, on every launch ═══
 *
 * The admission wrote the account's digits into the identity FILE best-effort
 * (`.catch(() => undefined)` — a full disk, a killed app), and the launch read
 * the FILE alone, never the compte. A phone where that write was lost then
 * launched as the device-random reseller (`sf-1234`) while her account, her
 * feed and the founder's suivi were keyed by `rs-7777`: every shop read a mute
 * 404, and a shop she created rode an id the service would refuse as not hers.
 *
 * This walk mounts EXACTLY that phone — compte `rs-7777` active on disk, the
 * identity file still saying `1234` — and asks the wire which storefront the
 * app reads: the first act keyed by identity. Only `fetch` is faked.
 */

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const COMPTE = { accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' } as const;

async function seedComptePuisFichierDivergent(digits: string): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify(COMPTE));
  await expoAccessCodeStore().write(SESSION);
  await expoIdentityStore().write(JSON.stringify({ version: 1, digits }));
}

async function fichierIdentite(): Promise<string | null> {
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  const brut = await expoIdentityStore().read();
  return brut === null ? null : (JSON.parse(brut) as { digits?: string }).digits ?? null;
}

const routes: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
      : null,
  (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, ...COMPTE } } : null),
  (path) => (path === '/reseller/ventes' ? { status: 200, json: { ok: true, ventes: [], incomplet: false } } : null),
  (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
];

/** The store reads and the launch reads chain several awaits past one settle. */
async function laisserLire(screen: Awaited<ReturnType<typeof mountApp>>): Promise<void> {
  for (let i = 0; i < 12; i += 1) await screen.settle();
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

describe('IDENTITE-COMPTE-1 (F-47) — the phone whose identity write was lost', () => {
  it('launches as HER ACCOUNT: every storefront read names sf-7777, never the file\'s sf-1234 — and the file is healed', async () => {
    await seedComptePuisFichierDivergent('1234');
    const fils = wire(routes);
    const screen = await mountApp();
    await laisserLire(screen);
    expect(screen.canPress('Opportunités'), 'an admitted phone opens the app').toBe(true);
    // the accueil header is a pressable road to her profile and carries the
    // same words (PROFIL-REVENDEUR-1); the dock tab renders second
    await screen.press('Ma Vitrine', 1);
    await laisserLire(screen);

    const parId = fils.calls.filter((c) => /^\/storefronts\/sf-\d{4}$/.test(c.path)).map((c) => c.path);
    expect(parId.length, `the app never read a storefront by id — calls: ${fils.calls.map((c) => c.path).join(' ')}`).toBeGreaterThan(0);
    expect(parId.every((p) => p === '/storefronts/sf-7777'), `a read rode the FILE's identity: ${parId.join(' ')}`).toBe(true);
    expect(fils.calls.some((c) => c.path.includes('sf-1234')), 'the device-random id must never reach the wire').toBe(false);
    // the file is brought back in line with the account, best-effort, so the
    // pre-account readers of that file agree with the truth
    expect(await fichierIdentite()).toBe('7777');
    screen.unmount();
  });

  it('CONTROL — a phone with NO account keeps its file identity (the pre-account road is untouched)', async () => {
    delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
    const { expoIdentityStore } = await import('../src/identity/expoStore');
    await expoIdentityStore().write(JSON.stringify({ version: 1, digits: '4242' }));
    const fils = wire(routes);
    const screen = await mountApp();
    await laisserLire(screen);
    // the accueil header is a pressable road to her profile and carries the
    // same words (PROFIL-REVENDEUR-1); the dock tab renders second
    await screen.press('Ma Vitrine', 1);
    await laisserLire(screen);
    const parId = fils.calls.filter((c) => /^\/storefronts\/sf-\d{4}$/.test(c.path)).map((c) => c.path);
    expect(parId.length).toBeGreaterThan(0);
    expect(parId.every((p) => p === '/storefronts/sf-4242'), parId.join(' ')).toBe(true);
    expect(await fichierIdentite()).toBe('4242');
    screen.unmount();
  });
});
