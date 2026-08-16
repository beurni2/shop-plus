import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — MARGE-EXACTE: she types the figure she meant, and it stays ═══
 *
 * FOUNDER, 2026-08-15, on the Opportunité screen: « remove the slide where
 * resellers use to add their margin and just let it be typable, make sure i can
 * type any number without rounding it up, cause right now if i type 750, the
 * system rounds it to 800 ».
 *
 * 750 IS THE WHOLE TEST. The field committed through `snapMarkup(raw, cap)`,
 * whose default step is 100 — so every figure she typed was rounded to the
 * nearest hundred, silently, on blur. She types her price; the app quietly
 * charges her cliente a different one. That is a money bug wearing a UI
 * costume, and it is asserted here on the REAL screens by the number he named.
 *
 * AND THE ARITHMETIC IS ASSERTED, NOT THE FIELD. « the field shows 750 » is
 * satisfied by a field that keeps her text and commits something else — the
 * exact shape of the bug. So each walk reads PRIX CLIENTE back: base 10 000 +
 * 750 must be 10 750 FCFA, never 10 800.
 *
 * The bound holds as everywhere: nothing here claims appearance. « The slider is
 * gone » is asked as « no node reports itself adjustable », which is the
 * accessibility ROLE the app assigned, not a pixel.
 */

const PV = 'pv-bazin';
const BASE = 10_000;

const offer = () => ({
  productVersionId: PV,
  offerVersion: 'ov-1',
  basePrice: BASE,
  resellerCommission: 1_000,
  available: 5,
  productName: 'Bazin riche',
  assetRefs: [] as string[],
  category: 'mode',
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
  };
}

/** CONTRACT-CERTIFIED to the shapes `storefront-service/src/index.ts` returns. */
function service(curated: readonly string[]): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: [offer()], diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) =>
      /^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront(curated) as never } : null,
  ];
}

/**
 * THE MONEY SEPARATOR IS U+202F, NOT A SPACE. `formatFcfa` groups with the
 * canon narrow no-break space, so an expectation written with an ASCII space
 * matches NOTHING — and its `not.toContain` twin would pass vacuously, which is
 * the worse half. It groups thousands with it AND suffixes « [NNBSP]FCFA »
 * (`src/money.ts`), so BOTH separators are escaped below.
 */
const F = (n: string): string => n.replace(/ /g, '\u202f') + '\u202fFCFA';

/**
 * Type into the markup field and COMMIT it the way her keyboard does. The
 * harness's `type()` only fires `onChangeText`; the value commits on blur or on
 * « go », which is a real React semantic this walk has to drive itself —
 * otherwise it would assert over a field that never committed anything.
 */
async function saisir(screen: Awaited<ReturnType<typeof mountApp>>, montant: string): Promise<void> {
  await screen.type(montant, 'Vous ajoutez');
  const champs = screen.tree.root
    .findAllByType('TextInput' as never)
    .filter((i) => String(i.props['accessibilityLabel'] ?? '').includes('Vous ajoutez'));
  expect(champs, 'exactly one markup field on screen').toHaveLength(1);
  const submit = champs[0]!.props['onSubmitEditing'] as (() => void) | undefined;
  expect(typeof submit, 'the field commits nothing on « go »').toBe('function');
  const { act } = await import('react-test-renderer');
  await act(async () => {
    submit!();
  });
  await screen.settle();
}

/** No node may report itself adjustable — that role is the slider's signature. */
function curseurs(screen: Awaited<ReturnType<typeof mountApp>>): number {
  return screen.tree.root.findAll(
    (n) => n.props !== undefined && n.props['accessibilityRole'] === 'adjustable',
    { deep: true },
  ).length;
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  vi.useRealTimers();
});

describe('MARGE-EXACTE — the Opportunité fiche', () => {
  it('750 stays 750: the cliente price is 10 750, never 10 800', async () => {
    wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');

    await saisir(screen, '750');

    expect(
      screen.shows(F('10 750')),
      `750 was rounded — on screen: ${JSON.stringify(screen.texts())}`,
    ).toBe(true);
    expect(screen.shows(F('10 800')), 'the old step-100 snap is still rounding her figure').toBe(false);
    screen.unmount();
  });

  it('the slider is gone, and the field alone still works', async () => {
    wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');

    expect(curseurs(screen), 'a slider is still on the fiche').toBe(0);
    // …and removing it did not take the control with it: an odd figure lands.
    await saisir(screen, '1250');
    expect(screen.shows(F('11 250')), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('the CAP still holds on the screen: an over-cap figure lands ON the ceiling', async () => {
    /**
     * Removing the STEP must not have removed the BOUND. `snapMarkup(_, cap, 1)`
     * still clamps to [0, cap], and this is the only place that fact is driven
     * through the real field — the unit tests hold the function, not the screen.
     * Cap here is 100 % of base (10 000), so 99 999 must land at exactly 10 000
     * and the cliente price at 20 000, never at 109 999.
     */
    wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');

    await saisir(screen, '99999');
    expect(screen.shows(F('20 000')), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('what she typed is what the WIRE publishes — 750, not 800', async () => {
    /**
     * The screen reading « 10 750 FCFA » and the app PUBLISHING 750 are two
     * different facts, and his complaint was about the second one: « the system
     * rounds it ». A markup re-derived or re-snapped on the publish path would
     * leave every assertion above green and still quote her cliente a price she
     * never chose. So this reads the request body the app actually sent.
     */
    const w = wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    await saisir(screen, '750');
    await screen.press('Ajouter à ma vitrine');

    const publie = w.calls.filter((c) => c.method !== 'GET' && c.body !== null && 'markup' in (c.body ?? {}));
    expect(publie.length, `no publish carried a markup. Calls: ${JSON.stringify(w.calls.map((c) => c.path))}`)
      .toBeGreaterThan(0);
    expect(publie[publie.length - 1]!.body!['markup'], 'the wire carried a rounded markup').toBe(750);
    screen.unmount();
  });

  it('the label reads « Vous ajoutez » — not « marge »', async () => {
    wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');

    const lu = screen.texts().join(' | ');
    expect(lu).toContain('Vous ajoutez');
    expect(lu.toLowerCase(), 'the word he asked to retire is still on the screen').not.toContain('marge');
    screen.unmount();
  });
});

describe('MARGE-EXACTE — Ma Vitrine', () => {
  /** Her shop already holds the product, so the vitrine card renders its money rows. */
  const dansLaVitrine = () => service([PV]);

  it('the markup is TYPABLE here too, and 750 stays 750', async () => {
    wire(dansLaVitrine());
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    expect(screen.shows('Bazin riche'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    await saisir(screen, '750');

    expect(
      screen.shows(F('10 750')),
      `750 was rounded on Ma Vitrine — on screen: ${JSON.stringify(screen.texts())}`,
    ).toBe(true);
    expect(screen.shows(F('10 800'))).toBe(false);
    screen.unmount();
  });

  it('the slider is gone from Ma Vitrine, and the word « marge » with it', async () => {
    wire(dansLaVitrine());
    const screen = await mountApp();
    await screen.press('Ma Vitrine');

    expect(curseurs(screen), 'a slider is still on Ma Vitrine').toBe(0);
    const lu = screen.texts().join(' | ');
    expect(lu).toContain('Vous ajoutez');
    expect(lu.toLowerCase()).not.toContain('marge');
    screen.unmount();
  });
});
