import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route, type Screen } from './rendu';
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
 * invents a client is worse. Both are gone, and — SEMENCE-DEMO-RETIRÉE
 * (founder, 2026-09-11) — so is the demo seed they grew from. These walks read
 * the MOUNTED tree, on the two phones that exist:
 *   1. HER phone — an admitted reseller with her session on disk: « Tout voir »
 *      opens « Mes ventes », the list carries her REAL sale from the feed (the
 *      net line, nothing else), none of the demo bytes, and « Retour » lands home;
 *   2. a phone with NO account yet — the list says so (« Pas encore reliée à
 *      votre compte ») and prints no figure; the way out stands;
 *   3. the map has no edge past the list, and the App renders no block for
 *      the retired screen (so the spine test's « a block for every screen »
 *      and this pin cannot disagree).
 *
 * CONTRACT-CERTIFIED to `storefront-service` (same rows as rendu-accueil and
 * rendu-session-vie): the list answers `{id, slug, name}` rows; the by-id
 * read answers the canon Storefront; `/reseller/session` answers her compte;
 * `/reseller/ventes` answers `{ ok, ventes: FeedVente[], incomplet }` with a
 * row exactly as `/entry/reseller/{id}` builds it.
 *
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const PV = 'pv-bazin';
const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const NOM = 'Boutique test';
const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const COMPTE = { accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' } as const;
/** Her one real sale on the wire: the operator confirmed it, Boutik+ has not acted yet. */
const VENTE = { orderId: 'ord-q-0001', state: 'confirmed', createdAt: '2026-09-10T09:00:00.000Z', resellerNet: 2_500, productVersionId: PV, zoneTo: 'Ouagadougou' };
/** `ventes.net_ligne` = « + {amount} net », `formatFcfa` groups with U+202F and suffixes « FCFA ». */
const NET_LIGNE = '+ 2 500 FCFA net';
const PAS_RELIEE = 'Pas encore reliée à votre compte';

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
];

/** HER phone's world: the session road answers her compte, her feed answers her sale. */
const routesAdmise: Route[] = [
  ...routesCommunes,
  (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, ...COMPTE } } : null),
  (path) => (path === '/reseller/profile' ? { status: 200, json: { ok: true, ...COMPTE, email: 'awa@example.bf', phone: '70 11 22 33' } } : null),
  (path) => (path === '/reseller/ventes' ? { status: 200, json: { ok: true, ventes: [VENTE], incomplet: false } } : null),
];

/** The retired screen's bytes — each named so a regression names itself. */
const DEMO = ['Awa', 'CMD-2417', 'Robe brodée bogolan', 'OÙ EN EST LA COMMANDE', 'Où en est la commande'];

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

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
});

describe('VENTE-DETAIL-RETIRÉ (F-42) · SEMENCE-DEMO-RETIRÉE — « Mes ventes » stands on its own, with no demo sale behind it', () => {
  it('HER phone: « Tout voir » opens the list with her REAL sale — the net line, the state, none of the demo bytes — and « Retour » lands home', async () => {
    process.env['EXPO_PUBLIC_ACCESS_GATE'] = 'on';
    await seedAdmise();
    const fils = wire(routesAdmise);
    const screen = await mountApp();
    for (let i = 0; i < 10 && !screen.canPress('Tout voir'); i += 1) await screen.settle();
    // The Awa here is HER name (the seeded compte), not the demo client's —
    // so the demo-byte sweep below starts once her name is accounted for.
    expect(screen.texts().join(' | '), 'the app shell opened on her session').toContain('Bonjour');
    await screen.press('Tout voir');
    await attendre(screen, NET_LIGNE);
    const lu = screen.texts().join(' | ');
    expect(lu).toContain('Mes ventes');
    expect(lu, 'the operator-confirmed state, by name').toContain('PAYÉE');
    expect(lu, 'a linked phone never sees the no-account sentence').not.toContain(PAS_RELIEE);
    for (const demo of DEMO.filter((d) => d !== 'Awa')) expect(lu, `the demo byte « ${demo} » is back on the screen`).not.toContain(demo);
    expect(fils.calls.some((c) => c.path === '/reseller/ventes' && c.auth === `Bearer ${SESSION}`), 'the feed was read RIDING her session').toBe(true);
    expect(screen.canPress('Retour'), 'the way out').toBe(true);
    await screen.press('Retour');
    await screen.settle();
    expect(screen.texts().join(' | ')).toContain('Bonjour');
    screen.unmount();
  });

  it('a phone with NO account: the list says so, prints no figure, none of the demo bytes, and « Retour » lands home', async () => {
    wire(routesCommunes);
    const screen = await mountApp();
    await screen.settle();
    expect(screen.texts().join(' | ')).toContain('Bonjour');
    await screen.press('Tout voir');
    await screen.settle();
    const lu = screen.texts().join(' | ');
    expect(lu, `the list mounted — on screen: ${lu.slice(0, 400)}`).toContain('Mes ventes');
    for (const demo of DEMO) expect(lu, `the demo byte « ${demo} » is back on the screen`).not.toContain(demo);
    // No account is linked on this phone, so the list must say so — its honest
    // « pas encore reliée » state — and print no figure: a net line here would
    // be a sale nobody made.
    expect(lu, `the honest state renders — on screen: ${lu.slice(0, 400)}`).toContain(PAS_RELIEE);
    expect(lu, 'no net figure on an unlinked phone').not.toMatch(/\+\s?\d/);
    expect(screen.canPress('Retour'), 'the way out').toBe(true);
    await screen.press('Retour');
    await screen.settle();
    expect(screen.texts().join(' | ')).toContain('Bonjour');
    screen.unmount();
  });

  it('the map has no edge past the list, the App renders no block for a sale detail, and the demo seed is gone', () => {
    expect(JOURNEY.ventes).toEqual([]);
    expect(Object.keys(JOURNEY)).not.toContain('vente_detail');
    const app = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    expect(app).not.toMatch(/vente_detail|demoDetail\(|sales\/ventes'/);
    expect(() => readFileSync(join(import.meta.dirname, '..', 'src', 'sales', 'ventes.ts'), 'utf8'), 'the demo seed module must not come back').toThrow();
  });
});
