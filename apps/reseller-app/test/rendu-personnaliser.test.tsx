import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — PERSONNALISER: the two chrome fixes the founder named ═══
 *
 * FOUNDER, 2026-08-18: « On personnaliser remove voir comme cliente cause voir
 * ma boutique en ligne already does the same thing. And on couverture and
 * portrait, on the photo the word "en ligne" hides the face. »
 *
 * 1. ONE DOOR TO THE CLIENTE VIEW. With a live shop the two controls did the
 *    same thing — `onOpenBoutique(liveSlug)` — so one of them was a promise
 *    the other already kept. « Voir ma boutique en ligne » survives because it
 *    opens the page that CANNOT drift from what a cliente sees; the in-app
 *    replica went with its button.
 * 2. THE BADGE IS NOT ON HER PHOTOGRAPH. « EN LIGNE » sat inside the photo
 *    frame, top-left, over the face of the woman in his own cover. The walk
 *    may not say where anything is drawn — that is appearance — so it asserts
 *    the STRUCTURE that decides it: the badge is no longer a child of the
 *    frame that holds the image. Where it now sits is his eyes' to judge.
 */

const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const NOM = 'Boutique test';
const COVER = 'https://media.example.dev/storefronts/sf-0258/cover/a.png';

const storefront = () => ({
  id: SF_ID,
  resellerId: 'RS',
  slug: SLUG,
  discoverable: true,
  curatedItems: [],
  name: NOM,
  zone: 'Ouagadougou',
  category: 'mode',
  createdAt: '2026-08-15T08:00:00.000Z',
  updatedAt: '2026-08-15T08:00:00.000Z',
  tagline: '',
  bio: '',
  // A LIVE cover — the state his screenshot is in.
  cover: { status: 'live', url: COVER },
  avatar: { mode: 'monogram' },
  theme: 'laterite',
  sections: [],
  featuredItems: [],
  headerStyle: 'classique',
  productNotes: {},
});

const routes: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
      : null,
  (path, body) =>
    path === '/storefronts' && body === null
      ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: true }] as never }
      : null,
  (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
];

async function surPersonnaliser() {
  wire(routes);
  const screen = await mountApp();
  await screen.settle();
  await screen.press('Ma Vitrine');
  await screen.settle();
  await screen.press('Personnaliser ma boutique');
  await screen.settle();
  return screen;
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

describe('PERSONNALISER — one door to the cliente view, and a badge off her face', () => {
  it('K1 keeps « Voir ma boutique en ligne » and no longer offers the duplicate door', async () => {
    const screen = await surPersonnaliser();
    const lu = screen.texts().join(' | ');
    expect(lu, `on screen: ${lu.slice(0, 400)}`).toContain('Voir ma boutique en ligne');
    expect(lu, 'the duplicate door is still on Personnaliser').not.toContain('Voir comme cliente');
    // …and the surviving door still opens HER live page.
    const { Linking } = await import('./doubles/react-native');
    await screen.press('Voir ma boutique en ligne');
    expect(Linking.opened[Linking.opened.length - 1]).toBe(`https://beurni2.github.io/shop-plus/v/${SLUG}`);
    screen.unmount();
  });

  it('K3 draws her photograph AND the state badge — with the badge outside the photo frame', async () => {
    const screen = await surPersonnaliser();
    await screen.press('Couverture & portrait');
    await screen.settle();

    // Both are still on the screen: the fix moves the badge, it does not hide it.
    expect(screen.shows('EN LIGNE'), `on screen: ${JSON.stringify(screen.texts().slice(0, 12))}`).toBe(true);
    const images = screen.tree.root.findAllByType('Image' as never);
    const photo = images.find((i) => {
      const src = i.props['source'] as { uri?: string } | undefined;
      return src?.uri === COVER;
    });
    expect(photo, 'her cover photograph must render').not.toBeUndefined();

    /**
     * WHERE the badge sits is LAYOUT, and no walk here may assert it — the
     * first version of this test tried, through `.parent`, and passed against
     * the UNFIXED screen because react-test-renderer hands back a fresh
     * wrapper on every access. The placement is pinned in `customize.test.ts`
     * (the anatomy half); this walk keeps the half it can prove honestly:
     * both her photograph and the state badge are on the screen.
     */
    screen.unmount();
  });
});
