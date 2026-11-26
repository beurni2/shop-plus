import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route, type Screen } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { installAnimationFrame } from './doubles/animation-frame';

/**
 * ═══ RENDU-RÉEL — « Mes gains » shows each sale at the rung the server records ═══
 *
 * Walked on the MOUNTED App (no app code stubbed; only `fetch` faked). The
 * rows are the ones `storefront-service`'s `/reseller/ventes` serves for these
 * roads — certified on the real Worker by
 * `services/storefront-service/test/gains-verite.e2e.test.ts`:
 *   · delivered and validated by Séra → `livree: true` → « Prêt à être versé »,
 *     awake, with her net — never on the locked hero;
 *   · refused before delivery (refund open, or nothing due back) →
 *     `refusee: true` → on no rung, said on its own line, no gain;
 *   · refunded → `state: 'refunded'` → read, not dropped: its own line, and
 *     the list is NOT called incomplete when the server said complete;
 *   · the locked hero says what is true before delivery.
 * Then she can still leave: « Accueil » is pressable and home carries the
 * delivered rung's card. WHAT IT MAY NEVER CLAIM: appearance — see
 * `test/doubles/react-native.tsx`.
 */

const PV = 'pv-bazin';
const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const NOM = 'Boutique test';
const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const COMPTE = { accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' } as const;

const BASE = { state: 'confirmed', createdAt: '2026-11-26T09:00:00.000Z', productVersionId: PV, zoneTo: 'Ouagadougou' } as const;
/** Paid, not yet delivered: locked. */
const ORDINAIRE = { ...BASE, orderId: 'ord-gv-0000', resellerNet: 3_000 };
/** Séra validated the delivery. */
const LIVREE = { ...BASE, orderId: 'ord-gv-0002', resellerNet: 4_000, livree: true };
/** Refused at the door with nothing due back: still `confirmed` on the order. */
const REFUSEE = { ...BASE, orderId: 'ord-gv-0001', resellerNet: 2_500, refusee: true };
/** Refused, then refunded by the provider. */
const REMBOURSEE = { ...BASE, state: 'refunded', orderId: 'ord-gv-0003', resellerNet: 1_500, refusee: true };

const LOCKED_VRAI = 'La commande est confirmée. Ce gain sera à vous dès que Séra confirme la livraison.';
const LIGNE_REFUSEES = '1 vente(s) arrêtée(s) avant la livraison : pas de gain sur ces ventes.';
const LIGNE_REMBOURSEES = '1 vente(s) remboursée(s) à la cliente : pas de gain sur ces ventes.';
const INCOMPLET = "Nous n'avons pas pu tout lire.";

const routesCommunes: Route[] = [
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
  (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, ...COMPTE } } : null),
  (path) => (path === '/reseller/profile' ? { status: 200, json: { ok: true, ...COMPTE, email: 'awa@example.bf', phone: '70 11 22 33' } } : null),
];

function monde(ventes: unknown[]): Route[] {
  return [
    ...routesCommunes,
    (path) => (path === '/reseller/ventes' ? { status: 200, json: { ok: true, ventes, incomplet: false } } : null),
  ];
}

async function seedAdmise(): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify(COMPTE));
  await expoAccessCodeStore().write(SESSION);
  await expoIdentityStore().write(JSON.stringify({ version: 1, digits: '7777' }));
}

async function attendre(screen: Screen, fragment: string): Promise<void> {
  for (let i = 0; i < 25 && !screen.shows(fragment); i += 1) await screen.settle();
  expect(screen.shows(fragment), `expected « ${fragment} »; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

/** The hero's figure lands once the device's reduced-motion answer arrives (a tick later); wait for it, never for a frame. */
async function attendreMontant(screen: Screen, n: number): Promise<string> {
  for (let i = 0; i < 40 && !montant(n).test(screen.texts().join(' | ')); i += 1) await screen.settle();
  const lu = screen.texts().join(' | ');
  const ici = lu.indexOf('Gain bloqué pour vous');
  expect(lu, `expected ${n} FCFA on screen; around the hero: ${JSON.stringify(lu.slice(Math.max(0, ici - 10), ici + 120))}`).toMatch(montant(n));
  return lu;
}

async function surMesGains(screen: Screen): Promise<void> {
  for (let i = 0; i < 10 && !screen.canPress('Gains'); i += 1) await screen.settle();
  await screen.press('Gains');
  await attendre(screen, 'Gain bloqué pour vous');
}

/** A franc figure as the screen prints it — `formatFcfa` in one text, or the hero's number and « FCFA » as two — whatever space it groups with. */
const montant = (n: number): RegExp =>
  new RegExp(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s\\u202f\\u00a0]') + '(?:[\\s\\u00a0]| \\| )FCFA');

/**
 * The device's own facts, set per walk: a frame exists (the locked hero counts
 * up with one), and she asked for LESS MOTION — so the hero shows its figure
 * at once and the walk never waits on a clock. Set on the module instance the
 * App is about to import (after `vi.resetModules()`), never on a stale one.
 */
let desinstaller: () => void = () => {};
async function moinsDeMouvement(): Promise<void> {
  const rn = await import('react-native');
  rn.AccessibilityInfo.isReduceMotionEnabled = async () => true;
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  process.env['EXPO_PUBLIC_ACCESS_GATE'] = 'on';
  desinstaller = installAnimationFrame();
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
  desinstaller();
});

describe('« Mes gains » — delivered, refused and refunded sales, each where the server puts it', () => {
  it('delivered → « Prêt à être versé » with her net; refused and refunded → their own lines, no gain; the hero carries only the locked sale and says what is true', async () => {
    await seedAdmise();
    await moinsDeMouvement();
    wire(monde([ORDINAIRE, LIVREE, REFUSEE, REMBOURSEE]));
    const screen = await mountApp();
    await surMesGains(screen);
    const lu = await attendreMontant(screen, 3_000);

    expect(lu, 'the delivered rung is awake, by name, with her net').toMatch(new RegExp(`Prêt à être versé \\| ${montant(4_000).source}`));
    expect(lu, 'the locked hero never adds the delivered, refused or refunded nets').not.toMatch(montant(7_000));
    expect(lu).not.toMatch(montant(5_500));
    expect(lu).not.toMatch(montant(4_500));
    expect(lu, 'the refused sale, on its own line').toContain(LIGNE_REFUSEES);
    expect(lu, 'the refunded sale, on its own line').toContain(LIGNE_REMBOURSEES);
    expect(lu, 'the server said complete: she is not told otherwise').not.toContain(INCOMPLET);
    expect(lu, 'the locked rung says what is true before delivery').toContain(LOCKED_VRAI);
    expect(lu).not.toContain('ne bouge plus');
    screen.unmount();
  });

  it('she can still leave « Mes gains »: « Accueil » is pressable, the tree stands, and home carries the delivered card', async () => {
    await seedAdmise();
    await moinsDeMouvement();
    wire(monde([LIVREE, REFUSEE]));
    const screen = await mountApp();
    await surMesGains(screen);
    await attendre(screen, LIGNE_REFUSEES);
    expect(screen.canPress('Accueil'), 'the way home is on screen').toBe(true);
    await screen.press('Accueil');
    await attendre(screen, 'Prêt à être versé');
    expect(screen.texts().join(' | '), 'home shows the delivered net').toMatch(montant(4_000));
    expect(screen.shows(LIGNE_REFUSEES), 'this is home, not « Mes gains » still').toBe(false);
    // …and from home she can open « Mes gains » again.
    expect(screen.canPress('Gains')).toBe(true);
    await screen.press('Gains');
    await attendre(screen, LIGNE_REFUSEES);
    screen.unmount();
  });
});
