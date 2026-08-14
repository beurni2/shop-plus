import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * RENDU-RÉEL — BANDEAUX-RETIRÉS (founder order 2026-08-14):
 * « On Shop+ remove the demo banner at bottom ».
 *
 * The strip lived in the SHELL, below every hub — so its removal is a change
 * to what every screen renders, and the standing order requires a walk, not a
 * source scan. This mounts the real App and drives all four hubs: none shows
 * the strip, and each stays usable without it.
 *
 * Appearance is not claimed here (the standing order forbids it) — only that
 * the strings are gone from the tree and the screens still work.
 */

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

/** Every sentence the removed strip used to render. */
const RETIRÉ = [
  "Données d'essai",
  'Version',
  'Relié :',
  'Clé :',
  'Recommencer la démo',
];

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('BANDEAUX-RETIRÉS — the strip is gone from every hub, and every hub still works', () => {
  it('no hub renders any part of the strip, and each stays usable', async () => {
    wire(routes);
    const screen = await mountApp();

    for (const hub of ['Accueil', 'Opportunités', 'Ma Vitrine', 'Gains'] as const) {
      await screen.press(hub);
      const texts = screen.texts().join(' | ');
      for (const gone of RETIRÉ) {
        expect(texts, `${hub} still renders « ${gone} »`).not.toContain(gone);
      }
      // …and the hub is not a blank tree: it renders its own content beyond
      // the five tab labels the bar always provides.
      const own = screen
        .texts()
        .filter((t) => !['Accueil', 'Opportunités', 'Ma Vitrine', 'Cercle', 'Gains'].includes(t));
      expect(own.length, `${hub} rendered no content of its own`).toBeGreaterThan(2);
    }
    screen.unmount();
  });

  it('the primary road still runs without the strip: a tile opens its fiche', async () => {
    wire(routes);
    const screen = await mountApp();
    await screen.press('Opportunités');

    expect(screen.canPress('Bazin riche')).toBe(true);
    await screen.press('Bazin riche');
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.texts().join(' ')).not.toContain('Les opportunités');
    screen.unmount();
  });
});
