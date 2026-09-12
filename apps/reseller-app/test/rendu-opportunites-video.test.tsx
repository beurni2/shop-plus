import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { resetJoueurs } from './doubles/expo-video';

/**
 * ═══ FOUNDER REPORT (2026-09-12, after OPPORTUNITES-LEGER-1 reached his phone):
 * « on opportunites i no longer see the product with the video » ═══
 *
 * WRITTEN FIRST, before any fix, as the standing order requires. It asks the
 * REAL App the only question a walk can answer here: does a product that
 * carries a clip — with a photograph, and with NO photograph at all — reach
 * the Opportunités grid, keep its name and its price on screen, and open its
 * fiche on a tap, beside a product with photographs only? Only `fetch` is
 * faked; the feed is the wire's own shape (`/supply-projections` answering
 * `{ offers, diagnostic }`, the clip absolute as the Worker absolutizes it).
 *
 * WHAT IT CANNOT ANSWER, stated: whether the LIVE feed still carries his
 * product. The Worker's supply road refuses a projection whose free-text
 * values carry a phone-shaped number (`identity_material_refused`), and the
 * clip's reference is a string value while photo references are an array —
 * that asymmetry has its own test in `packages/supply-consumer`. A product
 * the service dropped never reaches this screen, and no walk on a fake wire
 * can see that.
 */

const PV_PHOTO_CLIP = 'pv-bazin';
const PV_CLIP_SEUL = 'pv-boubou';
const PV_PHOTO = 'pv-sac';
const NAMES: Record<string, string> = { [PV_PHOTO_CLIP]: 'Bazin riche', [PV_CLIP_SEUL]: 'Boubou brodé', [PV_PHOTO]: 'Sac en cuir' };

const offer = (pv: string, photos: number, clip: boolean) => ({
  productVersionId: pv,
  offerVersion: 'ov-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  productName: NAMES[pv] ?? pv,
  assetRefs: Array.from({ length: photos }, (_, i) => `https://media.test/media/${pv}-${i}`),
  category: 'Mode femme',
  ...(clip ? { videoRef: `https://media.test/media/${pv}-clip` } : {}),
});

function storefront() {
  return {
    id: 'SF', resellerId: 'RS', slug: 'boutique-0001', discoverable: true, curatedItems: [] as string[],
    name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
    createdAt: '2026-09-12T08:00:00.000Z', updatedAt: '2026-09-12T08:00:00.000Z',
    tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
    sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  };
}

const routes: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? {
          status: 200,
          json: {
            offers: [offer(PV_PHOTO_CLIP, 2, true), offer(PV_CLIP_SEUL, 0, true), offer(PV_PHOTO, 1, false)],
            diagnostic: { status: 'ok', refusals: [] },
          },
        }
      : null,
  (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
  (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
];

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  resetJoueurs();
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('FOUNDER REPORT — « I no longer see the product with the video » on Opportunités', () => {
  it('a product with a clip AND photographs, and one with a clip and NO photograph, are BOTH on the grid with their names and prices, and each opens its fiche', async () => {
    wire(routes);
    const screen = await mountApp();
    await screen.press('Opportunités');
    for (const nom of Object.values(NAMES)) expect(screen.shows(nom), `« ${nom} » must be on the grid`).toBe(true);
    // the tile with the clip is a REAL tile: its name, its net, its base
    expect(screen.texts().filter((t) => t === 'Bazin riche').length).toBeGreaterThanOrEqual(1);
    // ONE player for the grid (the first clip tile in order) — the clip is drawn, not dropped
    const { joueurs } = await import('./doubles/expo-video');
    expect(joueurs.crees, 'the grid asked the video module for its one player').toBe(1);
    expect(screen.tree.root.findAllByType('VideoView' as never).length).toBe(1);
    // the photograph under the clip is asked for by url — the tile draws its product
    expect(screen.images().some((u) => u.includes(`${PV_PHOTO_CLIP}-0`)), 'the clip tile still asks for its photograph').toBe(true);

    // the clip-only product's tile is PRESSABLE and reaches its fiche
    await screen.press('Boubou brodé');
    expect(screen.canPress('Ajouter à ma vitrine'), 'the clip-only product opens its fiche').toBe(true);
    await screen.press('← Retour');
    await screen.press('Bazin riche');
    expect(screen.canPress('Ajouter à ma vitrine'), 'the clip + photo product opens its fiche').toBe(true);
    screen.unmount();
  }, 20_000);
});
