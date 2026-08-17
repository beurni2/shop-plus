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

/**
 * ═══ CLAVIER-MARGE — the keypad must not sit on the money card ═══
 *
 * FOUNDER, 2026-08-15, with a screenshot of the Opportunité fiche mid-typing:
 * « When I tap to add the number the keypad is hiding the section ». The numeric
 * keypad covers « Prix de base / Vous ajoutez / Prix cliente » — the three rows
 * the figure he is typing is FOR. He is typing blind into the one card whose
 * whole job is to show him the arithmetic.
 *
 * WHAT THIS WALK MAY AND MAY NOT SAY. Occlusion is layout, and the harness bound
 * is absolute: nothing here can assert that the card is visible above a keypad.
 * What it CAN ask are the tree facts underneath it — is the field inside the
 * container that yields to the keyboard, and does its scroll surface carry the
 * two props that make a focused field reachable and its neighbours tappable
 * while the keypad is up. A source scan proves neither: `KeyboardAvoidingView`
 * in the file says nothing about WHICH subtree it wraps, and this app renders a
 * separate ScrollView per screen, so « the fiche's one » is the only one that
 * matters here. His phone remains the last check.
 */
describe('CLAVIER-MARGE — the field is inside the keyboard-aware shell, on both screens', () => {
  /**
   * CONTAINMENT, NOT THE PARENT CHAIN. `.parent` stops at a component boundary
   * on the vitrine card, so walking upward found the field's own control and
   * nothing above it — a walk that would have reported « no scroll surface »
   * for a field plainly sitting on one. Asking which ancestor CONTAINS the
   * field answers the real question on both screens.
   */
  async function conteneurs(screen: Awaited<ReturnType<typeof mountApp>>) {
    const champs = screen.tree.root
      .findAllByType('TextInput' as never)
      .filter((i) => String(i.props['accessibilityLabel'] ?? '').includes('Vous ajoutez'));
    expect(champs, 'exactly one markup field on screen').toHaveLength(1);
    const champ = champs[0]!;
    const contient = (kind: string) =>
      screen.tree.root
        .findAll((n) => String(n.type) === kind, { deep: true })
        .filter((n) => n.findAll((x) => x === champ).length > 0);
    return { champ, contient };
  }

  it('the fiche: the field sits INSIDE the keyboard-aware view, on a scroll that yields to the keypad', async () => {
    wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');

    const { contient } = await conteneurs(screen);
    expect(contient('KeyboardAvoidingView').length, 'the money card is OUTSIDE any keyboard-aware container')
      .toBeGreaterThan(0);

    const scrolls = contient('ScrollView');
    expect(scrolls.length, 'the field is not on a scroll surface — it cannot be scrolled clear of the keypad')
      .toBeGreaterThan(0);
    const scroll = scrolls[scrolls.length - 1]!; // the innermost surface holding it
    // iOS insets the scroll by the keyboard AND brings the focused field into
    // view; without this the fiche's card stays exactly where the keypad is.
    expect(scroll.props['automaticallyAdjustKeyboardInsets'], 'the scroll does not yield to the keypad').toBe(true);
    // …and her NEXT tap must land on the button, not merely dismiss the keypad.
    expect(scroll.props['keyboardShouldPersistTaps'], 'the first tap after typing is eaten').toBe('handled');

    screen.unmount();
  });

  it('Ma Vitrine: the same, on the card that carries the same control', async () => {
    wire(service([PV]));
    const screen = await mountApp();
    await screen.press('Ma Vitrine');

    const { contient } = await conteneurs(screen);
    expect(contient('KeyboardAvoidingView').length, 'the vitrine card is OUTSIDE any keyboard-aware container')
      .toBeGreaterThan(0);
    // Ma Vitrine's cards are a FlatList, not the sibling ScrollView — the SAME
    // two props, forwarded by FlatList to its own scroll surface. A walk that
    // only looked for a ScrollView would report « no scroll surface » on a
    // screen that plainly scrolls.
    const scrolls = [...contient('ScrollView'), ...contient('FlatList')];
    expect(scrolls.length, 'the field is not on a scroll surface').toBeGreaterThan(0);
    const scroll = scrolls[scrolls.length - 1]!;
    expect(scroll.props['automaticallyAdjustKeyboardInsets'], 'the scroll does not yield to the keypad').toBe(true);
    expect(scroll.props['keyboardShouldPersistTaps'], 'the first tap after typing is eaten').toBe('handled');

    screen.unmount();
  });



  it('focusing the field ASKS its surface to lift the whole card, not just the caret', async () => {
    /**
     * `automaticallyAdjustKeyboardInsets` scrolls the CARET to the keyboard's
     * top edge, so the ceiling note and « Prix cliente » — the figure she is
     * typing this number FOR — stay underneath it; and when the field already
     * sits above the keypad it scrolls nothing at all. The screen therefore
     * asks its own surface to lift the field WITH SLACK BELOW IT on focus.
     *
     * What is asserted is the wiring, which is all a tree can answer: the field
     * reports its focus, and doing so does not throw. How far it actually moves
     * is layout, and layout is his phone's answer, not this harness's.
     */
    wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');

    const { champ } = await conteneurs(screen);
    const onFocus = champ.props['onFocus'] as (() => void) | undefined;
    expect(typeof onFocus, 'the field does not tell the screen it was focused — nothing can lift it').toBe('function');
    onFocus!();
    expect(screen.texts().length, 'the tree died on focus').toBeGreaterThan(0);
    screen.unmount();
  });

  it('ONE TAP, NO BLUR — what she typed still reaches the wire (verifier BLOCKER)', async () => {
    /**
     * THE BUG THE KEYBOARD FIX ITSELF INTRODUCED, and it moved money.
     *
     * `keyboardShouldPersistTaps="handled"` is what lets her FIRST tap reach the
     * button instead of being spent dismissing the keypad. But the field used to
     * commit only in `onBlur` / `onSubmitEditing`, and dismissing the keypad IS
     * what blurred it. With the tap no longer dismissing anything, the button
     * fires while the field is still first responder — so `commit()` never ran
     * and the app published markup 0. On iOS a `number-pad` has NO return key,
     * so `onSubmitEditing` cannot rescue it there: blur was the only path.
     *
     * She types 750, taps once, and her cliente is quoted the base price.
     *
     * This walk types the way a thumb does — `onChangeText` only, no blur, no
     * submit — which is why every earlier walk here missed it: `saisir()` fires
     * `onSubmitEditing` before it presses.
     */
    const w = wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');

    await screen.type('750', 'Vous ajoutez');
    await screen.press('Ajouter à ma vitrine');

    const publie = w.calls.filter((c) => c.method !== 'GET' && c.body !== null && 'markup' in (c.body ?? {}));
    expect(publie.length, 'nothing was published').toBeGreaterThan(0);
    expect(
      publie[publie.length - 1]!.body!['markup'],
      'the typed figure never committed — the wire carried a markup she did not choose',
    ).toBe(750);
    screen.unmount();
  });

  it('typing then confirming still works — the shell did not cost her the primary action', async () => {
    /**
     * The four questions, on the road he actually walks: type the figure, then
     * reach the next step. A keyboard-aware wrapper that broke the tree or
     * swallowed the tap would be a worse bug than the one it fixes.
     */
    const w = wire(service([]));
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    await saisir(screen, '750');

    expect(screen.texts().length, 'the tree died under the keyboard-aware shell').toBeGreaterThan(0);
    expect(screen.canPress('Ajouter à ma vitrine'), 'the primary action is not reachable after typing').toBe(true);
    await screen.press('Ajouter à ma vitrine');

    const publie = w.calls.filter((c) => c.method !== 'GET' && c.body !== null && 'markup' in (c.body ?? {}));
    expect(publie.length, 'nothing was published after typing under the keypad').toBeGreaterThan(0);
    expect(publie[publie.length - 1]!.body!['markup']).toBe(750);
    screen.unmount();
  });
});
