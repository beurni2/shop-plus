import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — OPPORTUNITÉS, DRIVEN (OPPORTUNITÉS-BLANC) ═══
 *
 * FOUNDER ORDER (2026-08-14): « make the background of opportunités screen all
 * white like the screenshot ». The change tints the ROOT `SafeAreaView` — the
 * ground every hub shares — behind a `surOpportunites` condition, so the ONE
 * expression this walk exists for is a conditional on a style array at the top
 * of the tree. Get that wrong and it is not one screen that blanks, it is all
 * five.
 *
 * WHAT THIS WALK MAY NEVER CLAIM — AND DELIBERATELY DOES NOT: the colour.
 * The standing order's bound is absolute (« it may NEVER claim anything about
 * appearance… no layout, no colour »), and the double in
 * `test/doubles/react-native.tsx` states the same. A walk asserting « the
 * background is white » would be asserting a fiction: nothing here paints. The
 * white is proven where appearance belongs — the measured token ratios in the
 * slice's own record (ink 15.55→17.81, the tile hairline 1.10→1.26 against the
 * ground) — and finally by his eyes on a real phone.
 *
 * WHAT IT DOES CLAIM is the only thing a mount can honestly answer, and it is
 * exactly what the four questions ask: the tree survived · the tile is present
 * AND pressable AND wired · she reaches the next step · and — the negative that
 * matters for a change made on a SHARED root — every OTHER hub still mounts and
 * is still usable after it.
 *
 * CONTRACT-CERTIFIED to the real service: `/supply-projections` answers
 * `{ offers, diagnostic }`, `GET /storefronts` a bare array, `/storefronts/:id`
 * the canon Storefront — the shapes `services/storefront-service/src/index.ts`
 * actually returns.
 */

const PV_A = 'pv-bazin';
const PV_B = 'pv-sac';
const NAMES: Record<string, string> = { [PV_A]: 'Bazin riche', [PV_B]: 'Sac en cuir' };

const offer = (pv: string, category = 'mode') => ({
  productVersionId: pv,
  offerVersion: 'ov-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  productName: NAMES[pv] ?? pv,
  assetRefs: [],
  category,
});

function storefront(curated: readonly string[]) {
  return {
    id: 'SF',
    resellerId: 'RS',
    slug: 'boutique-0001',
    discoverable: true,
    curatedItems: [...curated],
    name: 'Boutique test',
    zone: 'Ouagadougou',
    category: 'mode',
    createdAt: '2026-08-14T08:00:00.000Z',
    updatedAt: '2026-08-14T08:00:00.000Z',
    tagline: '',
    bio: '',
    cover: { status: 'none' },
    avatar: { mode: 'monogram' },
    theme: 'laterite',
    sections: [],
    featuredItems: [],
    headerStyle: 'classique',
    productNotes: {},
  };
}

function serviceOffres(offres: readonly { pv: string; cat?: string }[]): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: offres.map((o) => (o.cat === undefined ? { ...offer(o.pv), category: undefined } : offer(o.pv, o.cat))), diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront([]) as never } : null),
  ];
}

function service(offers: readonly string[]): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: offers.map((pv) => offer(pv)), diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront([]) as never } : null),
  ];
}

beforeEach(() => {
  // A FRESH MODULE GRAPH PER WALK — the app carries module-level state, and
  // without this the second walk opens on the first one's leftovers.
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  vi.useRealTimers();
});

describe('OPPORTUNITÉS-BLANC — the white ground did not cost her the screen', () => {
  it('the tab still opens: the tree survived, the grid rendered, the titles are there', async () => {
    wire(service([PV_A, PV_B]));
    const screen = await mountApp();

    await screen.press('Opportunités');

    // The tree survived the conditional on the shared root — had it thrown or
    // resolved to nothing, none of this is on screen.
    expect(screen.shows('Les opportunités'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Produits de vendeurs vérifiés')).toBe(true);
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(true);
    screen.unmount();
  });

  it('a product tile is PRESENT, PRESSABLE, and reaches the next screen', async () => {
    wire(service([PV_A, PV_B]));
    const screen = await mountApp();
    await screen.press('Opportunités');

    // The primary act of this screen: open a product. The tile's label is the
    // product name it carries.
    expect(screen.canPress('Bazin riche'), 'the tile must be pressable').toBe(true);
    await screen.press('Bazin riche');

    // She reached the fiche — the next step, not a blank tree.
    expect(screen.shows('Bazin riche'), `after the tap: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().join(' ')).not.toContain('Les opportunités');
    screen.unmount();
  });

  it('the EMPTY grid is still the honest designed state, not a blank screen', async () => {
    // The white ground is where the empty state's card now sits; the walk's
    // business is only that the SENTENCE is still there and the tab is usable.
    wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');

    expect(screen.shows('Les opportunités')).toBe(true);
    expect(screen.shows('Aucun produit à afficher')).toBe(true);
    screen.unmount();
  });

  it('THE NEGATIVE THAT MATTERS: every OTHER hub still mounts and is usable — the ground is shared', async () => {
    /**
     * The change conditions the ROOT's style on `surOpportunites`. A condition
     * written wrong there does not fail on opportunités — it fails on the four
     * hubs that must keep the warm paper, which is precisely the blast radius
     * a source scan cannot see. So the walk actually visits them.
     */
    wire(service([PV_A]));
    const screen = await mountApp();

    // Accueil — the hub she launches on.
    expect(screen.shows('Bonjour'), `accueil: ${JSON.stringify(screen.texts())}`).toBe(true);

    await screen.press('Opportunités');
    expect(screen.shows('Les opportunités')).toBe(true);

    // Asserted on the hub's OWN subtitle (double-check verifier: « Ma
    // vitrine » is ALSO the accueil header's exact string, so a toHub
    // regression resetting to accueil would have passed the old line).
    await screen.press('Ma Vitrine');
    expect(screen.shows('Votre vitrine attend ses premiers produits'), `vitrine: ${JSON.stringify(screen.texts())}`).toBe(true);

    // PROFIL — the fifth hub (CERCLE-PROFIL-1 retired the Cercle tab; the
    // hub now opens from the Profil row and keeps its own walks in
    // rendu-profil). Same law as the others: asserted on content the tab bar
    // cannot provide.
    await screen.press('Profil');
    const profilTexts = screen.texts().filter((t) => !['Accueil','Opportunités','Ma Vitrine','Gains','Profil'].includes(t));
    expect(profilTexts.length, `profil must render its OWN content: ${JSON.stringify(screen.texts())}`).toBeGreaterThan(2);

    // GAINS — asserted on its OWN heading, not on `texts().length > 0`, which
    // the tab-bar labels alone would have satisfied over a hub rendering
    // nothing at all (verifier).
    // …its own content, which in the wired-but-unlinked state of this harness
    // is the honest « pas encore reliée » sentence — asserted as the hub
    // actually renders it, not as I first assumed it would.
    // GAINS — the hint string ALSO renders on accueil (double-check verifier),
    // so the step additionally proves we LEFT accueil: its greeting is gone.
    await screen.press('Gains');
    expect(screen.shows("Vos ventes s'afficheront ici"), `gains: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().join(' ')).not.toContain('Bonjour');

    await screen.press('Accueil');
    expect(screen.shows('Bonjour')).toBe(true);

    // …and back onto the white ground, twice over: the condition must survive
    // being entered, left and re-entered.
    await screen.press('Opportunités');
    expect(screen.shows('Les opportunités')).toBe(true);
    expect(screen.canPress('Bazin riche'), 'the tile is still pressable on the second visit').toBe(true);
    screen.unmount();
  });
});

/**
 * ═══ CATEGORIES-OPPORTUNITES-1 (founder, 2026-08-23: « add products
 * categories where resellers can choose their category ») — THE RAYONS ROW,
 * DRIVEN ═══
 *
 * The four questions, answered on the mounted tree: the row rendered · a chip
 * is present AND pressable AND wired (pressing it re-renders the grid
 * filtered in place — never a navigation) · « Tout » is the way back · and
 * the road to the next screen (the fiche) still works from a filtered grid.
 */
describe('CATEGORIES-OPPORTUNITES — she chooses a rayon, the grid follows, « Tout » brings everything back', () => {
  const PV_C = 'pv-vase';

  it('the chips render from the LIVE feed in feed order; a press filters IN PLACE; « Tout » restores; the fiche still opens', async () => {
    wire(serviceOffres([
      { pv: PV_A, cat: 'Mode femme' },
      { pv: PV_B, cat: 'Sacs' },
      { pv: PV_C, cat: 'Mode femme' },
    ]));
    const screen = await mountApp();
    await screen.press('Opportunités');

    // The row rendered, data-driven: « Tout » + the two categories present.
    for (const chip of ['Tout', 'Mode femme', 'Sacs']) {
      expect(screen.canPress(chip), `chip « ${chip} » must be pressable — on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    }

    // She chooses « Sacs »: only its product remains, the others leave, and
    // the screen did NOT navigate — the title is still hers.
    await screen.press('Sacs');
    expect(screen.shows('Les opportunités')).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(true);
    expect(screen.shows('Bazin riche')).toBe(false);
    expect(screen.shows('pv-vase')).toBe(false);

    // « Tout » is the way back — everything returns.
    await screen.press('Tout');
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(true);

    // And a FILTERED grid still reaches the next screen: filter, then open.
    await screen.press('Mode femme');
    expect(screen.shows('Sac en cuir')).toBe(false);
    await screen.press('Bazin riche');
    expect(screen.texts().join(' ')).not.toContain('Les opportunités');
    screen.unmount();
  });

  it('re-pressing the active chip releases it — a toggle, never a stuck filter', async () => {
    wire(serviceOffres([{ pv: PV_A, cat: 'Mode femme' }, { pv: PV_B, cat: 'Sacs' }]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Sacs');
    expect(screen.shows('Bazin riche')).toBe(false);
    await screen.press('Sacs');
    expect(screen.shows('Bazin riche')).toBe(true);
    screen.unmount();
  });

  it('a canon id wears its French name on the chip, never snake_case', async () => {
    wire(serviceOffres([{ pv: PV_A, cat: 'shoes' }, { pv: PV_B, cat: 'Sacs' }]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    expect(screen.canPress('Chaussures')).toBe(true);
    expect(screen.shows('shoes')).toBe(false);
    await screen.press('Chaussures');
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(false);
    screen.unmount();
  });

  it('a feed with NO categories renders NO row — an empty filter bar would be furniture', async () => {
    wire(serviceOffres([{ pv: PV_A }, { pv: PV_B }]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.canPress('Tout')).toBe(false);
    screen.unmount();
  });

  it('a category whose last product left the feed FALLS BACK to « Tout » on the next re-read — never an empty grid under a stuck chip', async () => {
    wire(serviceOffres([{ pv: PV_A, cat: 'Mode femme' }, { pv: PV_B, cat: 'Sacs' }]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Sacs');
    expect(screen.shows('Sac en cuir')).toBe(true);
    expect(screen.shows('Bazin riche')).toBe(false);

    // Boutik deletes the last « Sacs » product; the re-read on re-entry sees
    // the new feed (the OPPORTUNITÉS RE-READS discipline, 2026-08-11).
    wire(serviceOffres([{ pv: PV_A, cat: 'Mode femme' }]));
    await screen.press('Accueil');
    await screen.press('Opportunités');

    expect(screen.shows('Bazin riche'), `after the vanish: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Sacs')).toBe(false);
    screen.unmount();
  });
});
