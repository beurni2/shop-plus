import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — RESELLER-AUTH-1 (AUDIT-SHOP-1 slice a2a): HER WRITES RIDE
 * HER SESSION, on the mounted App ═══
 *
 * The adapter tests prove the header is built; this walk proves the APP hands
 * the adapter her session at all — the resolver wiring in App.tsx, the store
 * read, the real Opportunités → fiche → « Ajouter à ma vitrine » road. Two
 * mounts: a device with an admitted compte and an `SPS-` session on disk,
 * whose every call to the Worker must carry `Authorization: Bearer`; and the
 * same device with nothing on disk, whose calls must carry NO bearer and the
 * key alone — the pre-slice bytes, because the published build's access gate
 * is off and that device is the founder's phone today.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const DIGITS = '7777';
const COMPTE = { accountId: `rs-${DIGITS}`, name: 'Awa', state: 'active' } as const;
const PV = 'pv-bazin';

function boutique() {
  return {
    id: `sf-${DIGITS}`, resellerId: `rs-${DIGITS}`, slug: 'boutique-7777', discoverable: true, curatedItems: [] as string[],
    name: 'Boutique Awa', zone: 'Ouagadougou', category: 'mode',
    createdAt: '2026-09-03T08:00:00.000Z', updatedAt: '2026-09-03T08:00:00.000Z',
    tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
    sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  };
}

const routes: Route[] = [
  (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, ...COMPTE } } : null),
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
  (path) => (path === '/storefronts' ? { status: 200, json: [{ id: `sf-${DIGITS}`, slug: 'boutique-7777', name: 'Boutique Awa', discoverable: true }] as never } : null),
  (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: boutique() as never } : null),
  (path) => (path === '/listings' ? { status: 200, json: { status: 'published', storefront: { ...boutique(), curatedItems: [PV] } as never } } : null),
];

async function seedAdmise(): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify(COMPTE));
  await expoAccessCodeStore().write(SESSION);
  await expoIdentityStore().write(JSON.stringify({ version: 1, digits: DIGITS }));
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

async function ajouterAuVitrine(fils: ReturnType<typeof wire>) {
  const screen = await mountApp();
  await screen.press('Opportunités');
  expect(screen.shows('Bazin riche'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
  await screen.press('Bazin riche');
  expect(screen.canPress('Ajouter à ma vitrine')).toBe(true);
  await screen.press('Ajouter à ma vitrine');
  await screen.settle();
  const publie = fils.calls.find((c) => c.path === '/listings' && c.method === 'POST');
  expect(publie, `the publish never left the phone; calls: ${JSON.stringify(fils.calls.map((c) => c.path))}`).toBeDefined();
  return { screen, publie: publie! };
}

describe('her session rides every call the App makes to the Worker', () => {
  it('ADMITTED, session on disk: the launch reads and the publish all carry Authorization: Bearer SPS — and the key still rides', async () => {
    await seedAdmise();
    const fils = wire(routes);
    const { screen, publie } = await ajouterAuVitrine(fils);

    expect(publie.auth).toBe(`Bearer ${SESSION}`);
    // the publish names HER as payee and HER shop — what the Worker will now check
    expect(publie.body?.['resellerId']).toBe(COMPTE.accountId);
    expect(publie.body?.['storefrontId']).toBe(`sf-${DIGITS}`);
    // every Worker read the App made on its own carried her too
    for (const chemin of ['/supply-projections', '/storefronts']) {
      const lecture = fils.calls.find((c) => c.path === chemin);
      expect(lecture, `${chemin} was never read`).toBeDefined();
      expect(lecture!.auth, chemin).toBe(`Bearer ${SESSION}`);
    }
    // the reseller-book calls are the only ones that carried the bearer BEFORE
    // this slice; nothing about them changed
    expect(fils.calls.find((c) => c.path === '/reseller/session')?.auth).toBe(`Bearer ${SESSION}`);
    screen.unmount();
  });

  it('CONTROL — nothing on disk (the gate-off phone today): the same road, NO bearer anywhere, the key alone', async () => {
    const fils = wire(routes);
    const { screen, publie } = await ajouterAuVitrine(fils);
    expect(publie.auth).toBeNull();
    for (const c of fils.calls) expect(c.auth, c.path).toBeNull();
    screen.unmount();
  });
});
