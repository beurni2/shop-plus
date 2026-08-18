import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route, type Wire } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — RECOMMENCER: a new address from the boutique's own name ═══
 *
 * FOUNDER, 2026-08-18: « each time a reseller creates a boutique, the QR
 * address reads the newly created boutique's name ». Creation has derived the
 * address from the name since SEED-NEUTRE; what was missing is the way to
 * create AGAIN — his own shop is stuck on the demo-era address. These walks
 * drive the whole journey on the mounted screen and ask the WIRE, not the
 * response, what actually happened:
 *   1. Recommencer → confirm → unpublish OLD · create NEW id with a shortCode
 *      derived from the shop's NAME · publish NEW — and the app now navigates,
 *      shares and shows the NEW address;
 *   2. « Garder mon adresse » costs nothing — no write reaches the wire;
 *   3. the first-run property he named, pinned at the wire: the create body's
 *      shortCode IS derived from the typed name.
 *
 * THE FIXTURE'S DETERMINISM, stated: the crypto double advances a counter, so
 * the FIRST mint of a mount is always `sf-0258` and a REMINT in the same mount
 * draws different digits. The create route derives its slug from the body's
 * own shortCode — `slugFromShortCode` lowercased — which is contract-certified
 * to `decideCreate` (storefront-core.ts:130): that IS what the worker does.
 */

const OLD_ID = 'sf-0258';
const OLD_SLUG = 'chezaichamod-6839';
const NOM = 'MAMAN & MOI';

const ancienne = () => ({
  id: OLD_ID,
  resellerId: 'rs-0258',
  slug: OLD_SLUG,
  discoverable: true,
  curatedItems: [],
  name: NOM,
  zone: 'Zone I, Ouagadougou',
  category: 'mode',
  createdAt: '2026-08-17T08:00:00.000Z',
  updatedAt: '2026-08-17T08:00:00.000Z',
  tagline: '',
  bio: '',
  cover: { status: 'none' },
  avatar: { mode: 'monogram' },
  theme: 'laterite',
  sections: [],
  featuredItems: [],
  headerStyle: 'classique',
  productNotes: {},
});

/** The worlds this walk needs, STATEFUL like the worker: before the recommence
 *  the old shop answers everywhere; after the create, the NEW shop does. */
function monde(): { routes: Route[] } {
  let nouvelle: ReturnType<typeof ancienne> | null = null;
  const routes: Route[] = [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path, body) => {
      if (path !== '/storefronts' || body === null) return null;
      // decideCreate derives the slug from the command's shortCode — mirrored.
      const shortCode = String(body['shortCode']);
      nouvelle = {
        ...ancienne(),
        id: String(body['id']),
        resellerId: String(body['resellerId']),
        slug: shortCode.toLowerCase(),
        discoverable: false,
        name: String(body['name']),
        zone: String(body['zone']),
      };
      return { status: 200, json: { status: 'created', storefront: nouvelle } as never };
    },
    (path, body) =>
      path === '/storefronts' && body === null
        ? {
            status: 200,
            json: [
              { id: OLD_ID, slug: OLD_SLUG, name: NOM, discoverable: true },
              ...(nouvelle === null ? [] : [{ id: nouvelle.id, slug: nouvelle.slug, name: nouvelle.name, discoverable: nouvelle.discoverable }]),
            ] as never,
          }
        : null,
    (path, body) =>
      /^\/storefronts\/[^/]+\/(publish|unpublish)$/.test(path) && body !== null
        ? { status: 200, json: { status: path.endsWith('/publish') ? 'published' : 'unpublished' } }
        : null,
    (path) => {
      const m = /^\/storefronts\/([^/]+)$/.exec(path);
      if (m === null) return null;
      if (nouvelle !== null && m[1] === nouvelle.id) return { status: 200, json: nouvelle as never };
      if (m[1] === OLD_ID) return { status: 200, json: ancienne() as never };
      return { status: 404, json: { error: 'not_found' } };
    },
  ];
  return { routes };
}

async function surK1(w?: { routes: Route[] }) {
  const fils: Wire = wire((w ?? monde()).routes);
  const screen = await mountApp();
  await screen.settle();
  await screen.press('Ma Vitrine');
  await screen.settle();
  await screen.press('Personnaliser ma boutique');
  await screen.settle();
  return { screen, fils };
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

describe('RECOMMENCER — the address follows the name, in one confirmed tap', () => {
  it('confirm → unpublish OLD, create NEW from the shop’s NAME, publish NEW — and the app lives on the new address', async () => {
    const { screen, fils } = await surK1();
    await screen.press('Recommencer ma boutique');
    // The consequences are read BEFORE anything is sent.
    expect(screen.shows('Repartir avec une nouvelle adresse ?')).toBe(true);
    expect(fils.calls.filter((c) => c.method === 'POST'), 'opening the card must send nothing').toHaveLength(0);

    await screen.press('Oui, changer d’adresse');
    await screen.settle();

    // THE WIRE IS THE WITNESS. The old shop leaves discovery…
    const unpub = fils.calls.filter((c) => c.path === `/storefronts/${OLD_ID}/unpublish`);
    expect(unpub, 'the old shop must be unpublished (best-effort)').toHaveLength(1);
    // …the create rides a NEW identity and a shortCode from the shop's NAME…
    const creates = fils.calls.filter((c) => c.path === '/storefronts' && c.method === 'POST');
    expect(creates).toHaveLength(1);
    const corps = creates[0]!.body as Record<string, unknown>;
    expect(corps['id'], 'the create must ride a NEW identity').not.toBe(OLD_ID);
    expect(String(corps['shortCode']), 'the address must be derived from the boutique’s name').toMatch(/^MAMANMOI-\d{4}$/);
    expect(corps['name']).toBe(NOM);
    expect(corps['zone']).toBe('Zone I, Ouagadougou');
    // …and the new shop is published.
    expect(fils.calls.filter((c) => c.path === `/storefronts/${String(corps['id'])}/publish`)).toHaveLength(1);

    // The toast says the NEW address, and « voir » OPENS it.
    const slugNeuf = String(corps['shortCode']).toLowerCase();
    expect(screen.shows(`En ligne : ${slugNeuf}`), `on screen: ${JSON.stringify(screen.texts().slice(0, 16))}`).toBe(true);
    const { Linking } = await import('./doubles/react-native');
    await screen.press('Voir ma boutique en ligne');
    expect(Linking.opened[Linking.opened.length - 1]).toBe(`https://beurni2.github.io/shop-plus/v/${slugNeuf}`);

    // And the identity SURVIVES a restart: the store now holds the new digits.
    const { expoIdentityStore } = await import('../src/identity/expoStore');
    const brut = await expoIdentityStore().read();
    expect(brut, 'the new identity must be persisted').not.toBeNull();
    const digits = (JSON.parse(brut as string) as { digits: string }).digits;
    expect(`sf-${digits}`).toBe(String(corps['id']));
    screen.unmount();
  });

  it('« Garder mon adresse » costs nothing — no write reaches the wire, the tree lives', async () => {
    const { screen, fils } = await surK1();
    await screen.press('Recommencer ma boutique');
    await screen.press('Garder mon adresse');
    await screen.settle();
    expect(fils.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    // The quiet action is back — she can change her mind later.
    expect(screen.canPress('Recommencer ma boutique')).toBe(true);
    screen.unmount();
  });
});
