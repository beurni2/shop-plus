import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — ACCUEIL-PRO: the first screen, real bytes only ═══
 *
 * FOUNDER, 2026-08-17: « Fix the accueil as well remove all mocks, and make
 * very professional and well detailed and very simple ». The money block and
 * the sales rows were already honest (ACCUEIL-HONESTY-1); what was still fake
 * was the IDENTITY — « Aïcha », the « Gounghin » quartier, an unconditional
 * vérifié badge — plus a « Comment ça marche » pill wired to nothing and the
 * Cercle card's « 214 membres » demo count. These walks read the MOUNTED tree:
 *   1. the header is HER shop — name, zone, the badge only when live;
 *   2. no shop resolved → an honest sentence, NO badge, NO borrowed name;
 *   3. the one primary action still reaches the product grid;
 *   4. the Cercle card invites without inventing a number, and still opens;
 *   5. none of the retired demo bytes can come back.
 */

const PV = 'pv-bazin';
const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const NOM = 'Boutique test';

const offer = () => ({
  productVersionId: PV,
  offerVersion: 'ov-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  productName: 'Bazin riche',
  assetRefs: [] as string[],
  category: 'mode',
});

const storefront = () => ({
  id: SF_ID,
  resellerId: 'RS',
  slug: SLUG,
  discoverable: true,
  curatedItems: [PV],
  name: NOM,
  zone: 'Ouagadougou',
  category: 'mode',
  createdAt: '2026-08-15T08:00:00.000Z',
  updatedAt: '2026-08-15T08:00:00.000Z',
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

/** CONTRACT-CERTIFIED to `storefront-service` (same rows as rendu-partager):
 *  the list answers `{id, slug, name}` rows; the by-id read answers the canon
 *  Storefront. The sales feed route is deliberately NOT wired: the accueil's
 *  money block must answer with its honest silence, never a figure. */
const routes: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? { status: 200, json: { offers: [offer()], diagnostic: { status: 'ok', refusals: [] } } }
      : null,
  (path) =>
    path === '/storefronts'
      ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: true }] as never }
      : null,
  (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
];

/** The same world with NO storefront — the day before she creates her shop. */
const routesSansBoutique: Route[] = [
  routes[0]!,
  (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
];

/** A shop RECORD without the live listing: the by-id read answers her
 *  storefront while the admin list answers no row — the state between a save
 *  landing and the listing catching up. Her name is true; « live » is not yet. */
const routesNonListee: Route[] = [
  routes[0]!,
  (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
  routes[2]!,
];

async function surAccueil(r: Route[] = routes) {
  wire(r);
  const screen = await mountApp();
  await screen.settle();
  return screen;
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

describe('ACCUEIL-PRO — the first screen carries real bytes or honest silence', () => {
  it('the header is HER shop: real name, real zone, the vérifié mark — none of the demo identity', async () => {
    const screen = await surAccueil();
    const lu = screen.texts().join(' | ');
    expect(lu, `her real shop name leads the header — on screen: ${lu.slice(0, 400)}`).toContain(NOM);
    expect(lu, 'her real zone rides the name').toContain('· Ouagadougou');
    expect(lu, 'the plain greeting renders').toContain('Bonjour');
    /**
     * THE MOCKS, ABSENT BY THEIR BYTES: the demo reseller's first name, her
     * invented quartier, the Cercle demo count, and the pill that pressed to
     * nothing. Each byte named so a regression names itself.
     */
    for (const demo of ['Aïcha', 'Gounghin', '214', 'Comment ça marche']) {
      expect(lu, `the demo byte « ${demo} » is back on the screen`).not.toContain(demo);
    }
    // The vérifié mark is PRESENT — her shop is live in this fixture.
    const { IconCoche } = await import('../src/ui/icons');
    expect(screen.tree.root.findAllByType(IconCoche).length).toBeGreaterThanOrEqual(1);
    screen.unmount();
  });

  it('no shop resolved → an honest sentence, NO badge, NO borrowed name — on the accueil AND on Ma Vitrine', async () => {
    const screen = await surAccueil(routesSansBoutique);
    const lu = screen.texts().join(' | ');
    expect(lu, 'the honest no-shop sentence renders').toContain('Créez votre boutique dans « Ma Vitrine ».');
    expect(lu).not.toContain(NOM);
    expect(lu).not.toContain('Aïcha');
    // An unconditional badge is a fake badge: no shop, no vérifié mark.
    const { IconCoche } = await import('../src/ui/icons');
    expect(screen.tree.root.findAllByType(IconCoche), 'a vérifié mark with no live shop').toHaveLength(0);
    // Ma Vitrine's header holds the same law — its badge sites are SEPARATE
    // JSX from the accueil's, so this walk must stand on that screen too.
    await screen.press('Ma Vitrine');
    await screen.settle();
    expect(screen.texts().join(' | ')).not.toContain('Aïcha');
    expect(
      screen.tree.root.findAllByType(IconCoche),
      'a vérifié mark on Ma Vitrine with no live shop',
    ).toHaveLength(0);
    screen.unmount();
  });

  it('a shop record without the live listing: her name renders, the badge WAITS', async () => {
    /**
     * The vérifié mark answers to `liveShop` (the listing read-back), not to
     * the record read — a badge that rode the name alone would mark a shop
     * « live » the instant its row was saved. This world reaches the state the
     * inner guard exists for; without it, this test cannot redden.
     */
    const screen = await surAccueil(routesNonListee);
    const lu = screen.texts().join(' | ');
    expect(lu, 'her name renders from the record read').toContain(NOM);
    const { IconCoche } = await import('../src/ui/icons');
    expect(
      screen.tree.root.findAllByType(IconCoche),
      'the badge must wait for the live listing',
    ).toHaveLength(0);
    screen.unmount();
  });

  it('the money block answers with its honest silence — never a figure without a sale', async () => {
    const screen = await surAccueil();
    const lu = screen.texts().join(' | ');
    // The feed route is unwired: no honest number exists, so a SENTENCE renders
    // (ACCUEIL-HONESTY-1) — and the retired demo figures cannot come back.
    expect(lu, 'no demo monthly figure').not.toContain('34 500');
    expect(lu, 'no demo month').not.toContain('juin');
    expect(
      screen.shows("Vos gains sont prêts à s'afficher.") ||
        screen.shows('Lecture de vos gains…') ||
        screen.shows("Rien n'est perdu. Vos ventes vous attendent ici."),
      `one of the honest silence sentences renders — on screen: ${lu.slice(0, 600)}`,
    ).toBe(true);
    screen.unmount();
  });

  it('the one primary action reaches the product grid', async () => {
    const screen = await surAccueil();
    await screen.press('Trouver des produits à vendre');
    await screen.settle();
    expect(screen.shows('Bazin riche'), `the grid did not open: ${JSON.stringify(screen.texts().slice(0, 20))}`).toBe(true);
    screen.unmount();
  });

  it('the Cercle card invites without inventing a number — and still opens the hub', async () => {
    const screen = await surAccueil();
    expect(screen.shows('Vendez ensemble, dans votre quartier.')).toBe(true);
    expect(screen.texts().join(' | '), 'no member count on the home card').not.toContain('membres');
    await screen.press('Mon Cercle');
    await screen.settle();
    /**
     * The HUB's own subtitle, not `texts().length > 0` — that count is
     * permanently satisfied by the accueil's own texts (the exact defect
     * rendu-opportunites already convicted for the dock tabs), and `go()`
     * returns silently on a missing journey edge, so only a hub-exclusive
     * byte proves the card actually navigated.
     */
    expect(
      screen.shows('vos membres, vos campagnes.'),
      `the Cercle hub did not mount: ${JSON.stringify(screen.texts().slice(0, 12))}`,
    ).toBe(true);
    screen.unmount();
  });

  it('BADGE-FIABLE — one failed launch read must not hide the vérifié mark all session', async () => {
    /**
     * FOUNDER, 2026-08-17 (« fix these 2 things »): the badge answered to a
     * single launch-time list read; one patchy-2G failure hid the mark for the
     * whole session, for a genuinely live shop. This world fails that FIRST
     * read and heals the connection after — the mark must appear on a later
     * hub entry, not wait for a restart.
     */
    let appels = 0;
    const monde: Route[] = [
      routes[0]!,
      (path, body) => {
        if (path !== '/storefronts' || body !== null) return null;
        appels += 1;
        return appels === 1
          ? { status: 500, json: { error: 'indisponible' } }
          : { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: true }] as never };
      },
      routes[2]!,
    ];
    wire(monde);
    const screen = await mountApp();
    await screen.settle();
    const { IconCoche } = await import('../src/ui/icons');
    // The failed read leaves the mark honestly absent…
    expect(screen.tree.root.findAllByType(IconCoche)).toHaveLength(0);
    // …and a later hub entry re-asks instead of staying blind until restart.
    await screen.press('Ma Vitrine');
    await screen.settle();
    await screen.press('Accueil');
    await screen.settle();
    expect(
      screen.tree.root.findAllByType(IconCoche).length,
      'the vérifié mark never recovered from one failed launch read',
    ).toBeGreaterThanOrEqual(1);
    screen.unmount();
  });

  it('publishing her shop reaches the accueil in the same breath — never « Créez votre boutique » after « En ligne »', async () => {
    /**
     * The false state this closes (verifier): `publishOnline` set only
     * `liveShop`; the accueil's honest-absent sentence answers to
     * `liveStorefront`, whose only re-readers are the vitrine/personnaliser
     * entry effects — and those DROP their in-flight answer when she leaves
     * early. Publish, hop to the accueil before the re-read lands, and the
     * screen told her to create the shop the toast just confirmed. The create
     * response carries the canon storefront; the app now adopts it directly.
     * This walk drives that exact journey.
     */
    /** THE PATCHY-2G WORLD, stated: before the create her id reads an honest
     *  404; the create POST succeeds (the worker's decision carries the canon
     *  storefront); and every read AFTER it FAULTS — the connection that had
     *  one POST left in it, which is this market's ordinary weather. Only the
     *  create response itself can tell the accueil the truth. (A dropped
     *  in-flight read has the same shape; the fault is the drivable form —
     *  the harness answers instantly, so a true mid-hop race cannot be held
     *  open here, and this world is the honest equivalent.) */
    let creee = false;
    const monde: Route[] = [
      routes[0]!,
      (path, body) => {
        if (path !== '/storefronts' || body === null) return null;
        creee = true; // the worker's create decision, canon storefront inside
        return { status: 200, json: { status: 'created', storefront: storefront() } as never };
      },
      (path, body) =>
        path === '/storefronts' && body === null
          ? creee
            ? { status: 500, json: { error: 'indisponible' } }
            : { status: 200, json: [] as never }
          : null,
      (path, body) =>
        /^\/storefronts\/[^/]+\/publish$/.test(path) && body !== null
          ? { status: 200, json: { status: 'published' } }
          : null,
      (path) =>
        /^\/storefronts\/[^/]+$/.test(path)
          ? creee
            ? { status: 500, json: { error: 'indisponible' } }
            : { status: 404, json: { error: 'not_found' } }
          : null,
    ];
    wire(monde);
    const screen = await mountApp();
    await screen.settle();
    expect(screen.shows('Créez votre boutique dans « Ma Vitrine ».'), 'the walk must START from the honest absence').toBe(true);

    await screen.press('Ma Vitrine');
    await screen.settle();
    await screen.press('Personnaliser ma boutique');
    await screen.settle();

    /** SEED-NEUTRE — the first-run stack carries NONE of the demo identity:
     *  no « Chez Aïcha Mode », no « Gounghin », no demo « /v/aicha-4821 »
     *  where her link will be. And pressing publish on the UNFILLED form is
     *  refused with a sentence, never sent. */
    const k1 = screen.texts().join(' | ');
    for (const demo of ['Chez Aïcha Mode', 'Gounghin', 'aicha-4821', '8 articles']) {
      expect(k1, `the demo seed byte « ${demo} » is on the first-run stack`).not.toContain(demo);
    }
    // No shop, no articles — the K5 row states the honest zero, never the
    // demo catalog's count (verifier: « 8 articles » survived the first scan).
    expect(k1, 'the first-run article count must be the honest zero').toContain('0 épinglé(s) · 0 articles');
    await screen.press('Mettre ma boutique en ligne');
    await screen.settle();
    expect(screen.shows('Donnez d’abord un nom et un quartier'), 'the empty form must be refused with a sentence').toBe(true);

    // She names her shop the way the flow intends: Identité, then publish.
    await screen.press('Identité');
    await screen.settle();
    await screen.type(NOM, 'NOM DE LA BOUTIQUE');
    await screen.type('Ouagadougou', 'QUARTIER');
    await screen.press('Enregistrer');
    await screen.settle();
    await screen.press('Mettre ma boutique en ligne');
    await screen.settle();
    expect(screen.shows('En ligne : boutique-0001'), 'the publish toast must land first').toBe(true);

    // Leave the customize stack (no dock there), then hop home by the tab.
    await screen.press('← Retour');
    await screen.settle();
    await screen.press('Accueil');
    await screen.settle();
    const lu = screen.texts().join(' | ');
    expect(lu, 'the accueil must show the shop the service just confirmed').toContain(NOM);
    expect(lu, 'the create-your-shop sentence outlived the publish').not.toContain('Créez votre boutique');
    screen.unmount();
  });
});
