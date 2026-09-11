import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * RENDU-RÉEL — PROFIL-PUBLIÉ (AUDIT-SHOP-2 F-43): the published channel is
 * not an aperçu. Since ACCES-ARME-2 it is the delivery road to real resellers
 * — real sessions, real shops, real links — and it wore « Aperçu — bac à
 * sable » on every screen because the workflow set no profile. The banner
 * lives in the SHELL, above every hub, so what every screen renders depends on
 * the profile, and the standing order requires a walk, not a source scan.
 *
 * Two walks and one control. Under the profile the workflow now sets, no hub
 * shows the banner and each still renders its own content and its primary
 * road; under the profile UNSET (a local Expo Go run) the banner IS there —
 * which is what makes the first walk's « not there » a measurement rather
 * than a vacuous pass. `src/preview.ts` reads the profile at module scope, so
 * the env is set before the dynamic import and the registry is reset between
 * walks.
 *
 * Appearance is not claimed (the standing order forbids it) — only which
 * strings are in the tree and that the screens still work.
 */

const BANDEAU = 'Aperçu — bac à sable';
const HUBS = ['Accueil', 'Opportunités', 'Ma Vitrine', 'Gains'] as const;
const ONGLETS = ['Accueil', 'Opportunités', 'Ma Vitrine', 'Cercle', 'Gains'];

const OFFER = {
  productVersionId: 'pv-1',
  offerVersion: 'ov-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  productName: 'Bazin riche',
  assetRefs: [] as string[],
  category: 'mode',
};

const routes: Route[] = [
  (p) =>
    p === '/supply-projections'
      ? { status: 200, json: { offers: [OFFER], diagnostic: { status: 'ok', refusals: [] } } }
      : null,
  (p) => (p === '/storefronts' ? { status: 200, json: [] as never } : null),
  (p) => (/^\/storefronts\/[^/]+$/.test(p) ? { status: 404, json: { error: 'not_found' } } : null),
];

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete process.env['EXPO_PUBLIC_PROFILE'];
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('PROFIL-PUBLIÉ — the published profile wears no aperçu banner; the local default still does', () => {
  it('production profile: no hub renders the banner, each hub renders its own content, and a tile still opens its fiche', async () => {
    process.env['EXPO_PUBLIC_PROFILE'] = 'production';
    wire(routes);
    const screen = await mountApp();

    for (const hub of HUBS) {
      await screen.press(hub);
      expect(screen.shows(BANDEAU), `${hub} wears « ${BANDEAU} » on the published profile`).toBe(false);
      // …and the hub is not a blank tree: it renders its own content beyond
      // the tab labels the bar always provides.
      const own = screen.texts().filter((t) => !ONGLETS.includes(t));
      expect(own.length, `${hub} rendered no content of its own`).toBeGreaterThan(2);
    }

    // The primary road still runs without the banner above it.
    await screen.press('Opportunités');
    expect(screen.canPress('Bazin riche')).toBe(true);
    await screen.press('Bazin riche');
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows(BANDEAU)).toBe(false);
    screen.unmount();
  });

  it('CONTROL — profile unset (a local Expo Go run): the banner IS on screen, on the hub and on a fiche', async () => {
    delete process.env['EXPO_PUBLIC_PROFILE'];
    wire(routes);
    const screen = await mountApp();

    expect(screen.shows(BANDEAU), 'the local default lost its banner — the walk above would then measure nothing').toBe(true);
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    expect(screen.shows(BANDEAU)).toBe(true);
    screen.unmount();
  });
});
