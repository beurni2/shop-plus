import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { JOURNEY } from '../src/journey';

/**
 * ═══ RENDU-RÉEL — MES VENTES (VENTE-DETAIL-RETIRÉ, AUDIT-SHOP-2 F-42) ═══
 *
 * The sales list has rendered REAL rows since VENTES-REELLES; what still lived
 * behind it was a sale-detail screen no control could reach (nothing ever set
 * it — the audit's walk G found one pressable on « Mes ventes », the back
 * chip) and which rendered a Cercle-era DEMO sale on every mount: « Awa »,
 * CMD-2417, « Robe brodée bogolan », 2 500 net, a custody timeline nobody had
 * verified. A screen nobody can reach is a map that lies; a screen that
 * invents a client is worse. Both are gone. This walk reads the MOUNTED tree:
 *   · « Tout voir » on the accueil still opens « Mes ventes » — the tree stands;
 *   · the list carries its honest state and none of the demo bytes;
 *   · the way out — « Retour » — is present and pressable, and lands home;
 *   · the map has no edge past the list, and the App renders no block for
 *     the retired screen (so the spine test's « a block for every screen »
 *     and this pin cannot disagree).
 *
 * CONTRACT-CERTIFIED to `storefront-service` (same rows as rendu-accueil):
 * the list answers `{id, slug, name}` rows; the by-id read answers the canon
 * Storefront. The sales feed route is NOT wired: the list must answer with
 * its honest empty/unreachable state, never a figure.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const PV = 'pv-bazin';
const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const NOM = 'Boutique test';

const routes: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? {
          status: 200,
          json: {
            offers: [
              { productVersionId: PV, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000, available: 5, productName: 'Bazin riche', assetRefs: [] as string[], category: 'mode' },
            ],
            diagnostic: { status: 'ok', refusals: [] },
          },
        }
      : null,
  (path) => (path === '/storefronts' ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: true }] as never } : null),
  (path) =>
    /^\/storefronts\/[^/]+$/.test(path)
      ? {
          status: 200,
          json: {
            id: SF_ID, resellerId: 'RS', slug: SLUG, discoverable: true, curatedItems: [PV], name: NOM, zone: 'Ouagadougou', category: 'mode',
            createdAt: '2026-08-15T08:00:00.000Z', updatedAt: '2026-08-15T08:00:00.000Z', tagline: '', bio: '',
            cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite', sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
          } as never,
        }
      : null,
];

/** The retired screen's bytes — each named so a regression names itself. */
const DEMO = ['Awa', 'CMD-2417', 'Robe brodée bogolan', 'OÙ EN EST LA COMMANDE', 'Où en est la commande'];

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

describe('VENTE-DETAIL-RETIRÉ (F-42) — « Mes ventes » stands on its own, with no demo sale behind it', () => {
  it('« Tout voir » opens the list, the tree stands, none of the demo bytes render, and « Retour » lands home', async () => {
    wire(routes);
    const screen = await mountApp();
    await screen.settle();
    expect(screen.texts().join(' | ')).toContain('Bonjour');
    await screen.press('Tout voir');
    await screen.settle();
    const lu = screen.texts().join(' | ');
    expect(lu, `the list mounted — on screen: ${lu.slice(0, 400)}`).toContain('Mes ventes');
    for (const demo of DEMO) expect(lu, `the demo byte « ${demo} » is back on the screen`).not.toContain(demo);
    expect(screen.canPress('Retour'), 'the way out').toBe(true);
    await screen.press('Retour');
    await screen.settle();
    expect(screen.texts().join(' | ')).toContain('Bonjour');
    screen.unmount();
  });

  it('the map has no edge past the list, and the App renders no block for a sale detail', () => {
    expect(JOURNEY.ventes).toEqual([]);
    expect(Object.keys(JOURNEY)).not.toContain('vente_detail');
    const app = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    expect(app).not.toMatch(/vente_detail|demoDetail\(/);
  });
});
