import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { joueurs, resetJoueurs } from './doubles/expo-video';

/**
 * ═══ RENDU-RÉEL — OPPORTUNITES-LEGER-1 (AUDIT-SHOP-2 F-49): one clip plays,
 * the tile in view ═══
 *
 * THE AUDIT'S MEASUREMENT: the grid mounted one native video player PER TILE
 * — and, because the player hook cannot be conditional, a tile WITHOUT a clip
 * still created one with a null source. Forty products, forty players, on a
 * one-gigabyte Android. Now exactly one tile carries a player — the one in
 * view (before any layout is known, the first clip-bearing tile in order) —
 * and every other tile is the photograph alone.
 *
 * WHAT THIS WALK CLAIMS, and it is all a mount can honestly claim: how many
 * players the app ASKED the video module for (the double counts each
 * `useVideoPlayer` call — one native player on a phone) and how many video
 * surfaces are mounted in the tree. NOTHING about playback, timing, or what
 * is visible: the double plays nothing and lays out nothing (the viewport rule
 * is exercised by its own unit test on the tile's parent logic, where a
 * scroll position can be handed in).
 *
 * Only `fetch` is faked. CONTRACT-CERTIFIED to the real service: the offers
 * carry `videoRef` as the storefront service absolutizes it.
 */

const PV_A = 'pv-bazin';
const PV_B = 'pv-sac';
const PV_C = 'pv-vase';
const NAMES: Record<string, string> = { [PV_A]: 'Bazin riche', [PV_B]: 'Sac en cuir', [PV_C]: 'Vase en terre' };
const CLIP = (pv: string) => `https://media.test/clips/${pv}.mp4`;

const offer = (pv: string, cat: string, clip: boolean) => ({
  productVersionId: pv,
  offerVersion: 'ov-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  productName: NAMES[pv] ?? pv,
  assetRefs: [`https://media.test/photos/${pv}.jpg`],
  category: cat,
  ...(clip ? { videoRef: CLIP(pv) } : {}),
});

function storefront() {
  return {
    id: 'SF', resellerId: 'RS', slug: 'boutique-0001', discoverable: true, curatedItems: [] as string[],
    name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
    createdAt: '2026-08-14T08:00:00.000Z', updatedAt: '2026-08-14T08:00:00.000Z',
    tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
    sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  };
}

function service(offres: ReturnType<typeof offer>[]): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: offres, diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
  ];
}

const surfaces = (screen: Awaited<ReturnType<typeof mountApp>>): number =>
  screen.tree.root.findAllByType('VideoView' as never).length;

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  resetJoueurs();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('OPPORTUNITES-LEGER-1 (F-49) — one player for the grid, never one per tile', () => {
  it('three tiles, two clips: ONE player asked for, ONE video surface mounted — the first clip tile in order', async () => {
    wire(service([offer(PV_A, 'Mode femme', true), offer(PV_B, 'Sacs', true), offer(PV_C, 'Mode femme', false)]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.settle();
    // the tree survived and all three tiles are on screen
    for (const nom of Object.values(NAMES)) expect(screen.shows(nom), nom).toBe(true);
    expect(joueurs.crees, 'players asked of the video module').toBe(1);
    expect(surfaces(screen), 'video surfaces mounted').toBe(1);
    // the tile without a clip never costs a player, and the tiles are still
    // the road to the fiche
    expect(screen.canPress('Vase en terre')).toBe(true);
    screen.unmount();
  });

  it('a rayon filter moves the ONE player to the tile that remains; « Tout » brings it back to the first', async () => {
    wire(service([offer(PV_A, 'Mode femme', true), offer(PV_B, 'Sacs', true), offer(PV_C, 'Mode femme', false)]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.settle();
    await screen.press('Sacs');
    await screen.settle();
    expect(screen.shows('Sac en cuir')).toBe(true);
    expect(screen.shows('Bazin riche')).toBe(false);
    expect(surfaces(screen), 'still exactly one surface, on the remaining clip tile').toBe(1);
    await screen.press('Tout');
    await screen.settle();
    expect(surfaces(screen)).toBe(1);
    // …and the fiche still opens from the grid, carrying its own single clip
    await screen.press('Bazin riche');
    await screen.settle();
    expect(screen.texts().join(' ')).not.toContain('Les opportunités');
    expect(surfaces(screen), 'the fiche shows the product clip, one surface').toBe(1);
    screen.unmount();
  });

  it('CONTROL — a grid with no clip asks for NO player at all', async () => {
    wire(service([offer(PV_A, 'Mode femme', false), offer(PV_C, 'Mode femme', false)]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.settle();
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(joueurs.crees).toBe(0);
    expect(surfaces(screen)).toBe(0);
    screen.unmount();
  });
});
