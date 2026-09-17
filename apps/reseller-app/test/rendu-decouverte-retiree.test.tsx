import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — DECOUVERTE-RETIREE-1 (founder ruling 2026-09-17; SP-I05
 * amended): Ma Vitrine carries NO privée ⇄ publique toggle any more ═══
 *
 * VITRINE-VISIBLE-1 had made that toggle real (a press was a publish /
 * unpublish on the service, the label the service's flag). With the buyer
 * directory gone — there is no cross-reseller discovery, a buyer reaches her
 * shop only through her link or QR — « privée » and « publique » no longer
 * differ for anyone, and a control that changes nothing anyone can see is a
 * fabricated choice. So the walk that used to prove the toggle now proves its
 * ABSENCE, and that the screen still has its one road: the shop is there, and
 * she can still get to the next step.
 *
 * The four questions: the tree survives the visit · no toggle is present, so
 * no write can leave the screen by reading it · nothing fires by itself (zero
 * publish/unpublish on the wire) · the next step (Partager) is reachable.
 * The double is contract-certified to `storefront-do.ts`: the shop read by id
 * carries its `discoverable` flag; `/storefronts` is the admin list.
 */

const PV = 'pv-bazin';

function storefront(discoverable: boolean) {
  return {
    id: 'SF', resellerId: 'RS', slug: 'boutique-0001', discoverable, curatedItems: [PV],
    name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
    createdAt: '2026-08-11T08:00:00.000Z', updatedAt: '2026-08-11T08:00:00.000Z',
    tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
    sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  };
}

function service(discoverable: boolean) {
  const state = { writes: 0 };
  const routes: Route[] = [
    (path) =>
      path === '/supply-projections'
        ? {
            status: 200,
            json: {
              offers: [{ productVersionId: PV, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000, available: 5, productName: 'Bazin riche', assetRefs: [], category: 'mode' }],
              diagnostic: { status: 'ok', refusals: [] },
            },
          }
        : null,
    (path) => {
      if (!/^\/storefronts\/[^/]+\/(publish|unpublish)$/.test(path)) return null;
      state.writes += 1;
      return { status: 200, json: { status: 'changed', storefront: storefront(!discoverable) as never } };
    },
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront(discoverable) as never } : null),
  ];
  return { routes, state };
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('DECOUVERTE-RETIREE-1 — Ma Vitrine has no privée/publique toggle; the shop is there and the road goes on', () => {
  for (const [etat, discoverable] of [['en ligne', true], ['pas encore en ligne', false]] as const) {
    it(`over a shop the service says ${etat}: no « Publique », no « Privée », nothing pressable that publishes — zero writes — the shop and its products show, and Partager is reachable`, async () => {
      const svc = service(discoverable);
      const fils = wire(svc.routes);
      const screen = await mountApp();
      await screen.press('Ma Vitrine');

      expect(screen.shows('Bazin riche'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
      expect(screen.shows('Publique'), 'the toggle label must be gone').toBe(false);
      expect(screen.shows('Privée'), 'the toggle label must be gone').toBe(false);
      expect(screen.canPress('Publique')).toBe(false);
      expect(screen.canPress('Privée')).toBe(false);
      // Nothing on this screen writes the flag, by reading or by itself.
      expect(fils.calls.some((c) => /\/(publish|unpublish)$/.test(c.path)), 'no publish/unpublish may leave Ma Vitrine').toBe(false);
      expect(svc.state.writes).toBe(0);
      // The next step is still there.
      expect(screen.canPress('Partager'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
      screen.unmount();
    });
  }
});
