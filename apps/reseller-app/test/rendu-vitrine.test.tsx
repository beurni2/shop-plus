import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountApp, wire, wiredEnv, type Route, type Wire } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — MA VITRINE, DRIVEN ═══
 *
 * The first walk in this repo, and it exists because of two founder reports on
 * 2026-08-11:
 *
 *   « When products are deleted from another supplier's listing, these products
 *     are still present in opportunité on shop+. »
 *   « …when they delete products from their ma vitrine these products still
 *     show on their boutique. »
 *
 * Both are React semantics no source scan can reach: a `useEffect` that fires
 * once per process, and a membership that lived in a `useState` array. So this
 * mounts the REAL App and asks the four questions the standing order names —
 * did the tree survive the tap · is the control present AND pressable AND
 * wired · does the act leave a way out when it fails · can she reach the next
 * step.
 *
 * CONTRACT-CERTIFIED to the real service. `/supply-projections` answers
 * `{ offers, diagnostic }` and `/storefronts/:id` answers the canon Storefront —
 * the shapes `services/storefront-service/src/index.ts` actually returns. A fake
 * richer than the service is the §9.8 failure this project has paid for twice.
 */

const PV_A = 'pv-bazin';
const PV_B = 'pv-sac';

const offer = (pv: string, name: string) => ({
  productVersionId: pv,
  offerVersion: 'ov-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  productName: name,
  assetRefs: [],
  category: 'mode',
});

/** Her shop as the service holds it — `curatedItems` is the MEMBERSHIP. */
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
    createdAt: '2026-08-11T08:00:00.000Z',
    updatedAt: '2026-08-11T08:00:00.000Z',
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

/**
 * THE FAKE SERVICE — it holds STATE, deliberately. A removal that answered 200
 * over a shop that never changed would let a broken wire pass: the walk must be
 * able to re-read and see the product gone, which is exactly the founder's
 * complaint. `offers` is the live supply; `curated` is her membership.
 */
function service(opts: { offers: readonly string[]; curated: readonly string[] }): {
  routes: Route[];
  state: { offers: string[]; curated: string[]; removeCalls: number };
} {
  const state = { offers: [...opts.offers], curated: [...opts.curated], removeCalls: 0 };
  const NAMES: Record<string, string> = { [PV_A]: 'Bazin riche', [PV_B]: 'Sac en cuir' };
  const routes: Route[] = [
    (path) =>
      path === '/supply-projections'
        ? {
            status: 200,
            json: {
              offers: state.offers.map((pv) => offer(pv, NAMES[pv] ?? pv)),
              diagnostic: { status: 'ok', refusals: [] },
            },
          }
        : null,
    (path, body) => {
      if (!/^\/storefronts\/[^/]+\/items\/remove$/.test(path)) return null;
      state.removeCalls += 1;
      const pid = typeof body?.['pid'] === 'string' ? (body['pid'] as string) : '';
      if (!state.curated.includes(pid)) return { status: 200, json: { status: 'not_present' } };
      state.curated = state.curated.filter((p) => p !== pid);
      return { status: 200, json: { status: 'removed' } };
    },
    // The admin list — how the app learns her shop's slug.
    (path) => (path === '/storefronts' ? { status: 200, json: { rows: [] } as never } : null),
    (path) =>
      /^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront(state.curated) as never } : null,
  ];
  return { routes, state };
}

async function openVitrine(): Promise<Awaited<ReturnType<typeof mountApp>>> {
  const screen = await mountApp();
  // THE TAB LABEL, capital V (« Ma Vitrine ») — « Ma vitrine » lowercase is
  // the screen TITLE, an inert <Text>, and pressing it would have proved
  // nothing. The harness told us so by name rather than passing.
  await screen.press('Ma Vitrine');
  return screen;
}

beforeEach(() => {
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('MA VITRINE — what is in her shop is what the SERVICE says', () => {
  it('renders a product she never added THIS SESSION — the membership is not the session log', async () => {
    /**
     * THE DEFECT THIS PINS: the grid used to read a `useState([])` event log,
     * initialized empty on EVERY launch. So after a restart Ma Vitrine was
     * blank while her boutique still carried everything. Here the session log
     * is empty by construction (a fresh mount, nothing published) and the shop
     * holds two products — the old grid rendered ZERO cards in exactly this
     * state.
     */
    wire(service({ offers: [PV_A, PV_B], curated: [PV_A, PV_B] }).routes);
    const screen = await openVitrine();

    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(true);
    screen.unmount();
  });

  it('a product in supply but NOT in her shop is not on her vitrine', async () => {
    // The join is a real filter, not « show me everything »: pv-b is on offer
    // and she has not put it in her shop.
    wire(service({ offers: [PV_A, PV_B], curated: [PV_A] }).routes);
    const screen = await openVitrine();

    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.texts().join(' ')).not.toContain('Sac en cuir');
    screen.unmount();
  });
});

describe('VITRINE-RETRAIT — « Retirer de ma vitrine » reaches the service', () => {
  it('is PRESENT, PRESSABLE, and the card is gone after the shop says so', async () => {
    const svc = service({ offers: [PV_A, PV_B], curated: [PV_A, PV_B] });
    const w: Wire = wire(svc.routes);
    const screen = await openVitrine();

    // Two cards ⇒ two controls with the same label. The harness REFUSES an
    // ambiguous press, so the index is the card she means (render order).
    expect(screen.canPress('Retirer de ma vitrine')).toBe(true);
    await screen.press('Retirer de ma vitrine', 0);

    // THE PORT WAS CALLED — not merely present in the file.
    const calls = w.calls.filter((c) => c.path.endsWith('/items/remove'));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body?.['pid']).toBe(PV_A);

    // …the SHOP changed, and the screen followed it.
    expect(svc.state.curated).toEqual([PV_B]);
    expect(screen.texts().join(' '), 'the removed product must leave the grid').not.toContain('Bazin riche');
    // The tree SURVIVED the tap, and her other product is untouched.
    expect(screen.shows('Sac en cuir')).toBe(true);
    screen.unmount();
  });

  it('a REFUSED removal keeps the card and says so — never a silent failure', async () => {
    const svc = service({ offers: [PV_A], curated: [PV_A] });
    // The removal route answers 500 BEFORE the state one, so nothing changes.
    const w = wire([
      (path) => (/\/items\/remove$/.test(path) ? { status: 500, json: { error: 'boom' } } : null),
      ...svc.routes,
    ]);
    const screen = await openVitrine();

    await screen.press('Retirer de ma vitrine');
    expect(w.calls.some((c) => c.path.endsWith('/items/remove'))).toBe(true);
    // The product is STILL THERE — a card that vanished on a failed write would
    // be the fabricated-success shape this project refuses.
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows("Ce produit n'a pas été retiré. Réessayez."), 'she must be told').toBe(true);
    // …and she can try again: the control is not left disabled.
    expect(screen.canPress('Retirer de ma vitrine')).toBe(true);
    screen.unmount();
  });
});

describe('OPPORTUNITÉS — the browse list RE-READS', () => {
  it('a product deleted upstream leaves her screen when she opens Opportunités again', async () => {
    /**
     * THE DEFECT THIS PINS: the feed lived on a `useEffect` whose only dep was
     * a `useMemo`-with-no-deps, so it fired ONCE per app process. A product
     * deleted in Boutik+ stayed on her browse screen until she killed the app.
     * (Boutik+'s delete is sound — proved against its real Worker.)
     */
    const svc = service({ offers: [PV_A, PV_B], curated: [] });
    const w = wire(svc.routes);
    const screen = await mountApp();

    await screen.press('Opportunités');
    expect(screen.shows('Sac en cuir')).toBe(true);
    const readsBefore = w.calls.filter((c) => c.path === '/supply-projections').length;

    // The supplier deletes it while her app is open.
    svc.state.offers = [PV_A];

    // She leaves and comes back — the natural, deliberate refresh.
    // THE TAB LABEL, capital V (« Ma Vitrine ») — « Ma vitrine » lowercase is
  // the screen TITLE, an inert <Text>, and pressing it would have proved
  // nothing. The harness told us so by name rather than passing.
  await screen.press('Ma Vitrine');
    await screen.press('Opportunités');

    expect(
      w.calls.filter((c) => c.path === '/supply-projections').length,
      'returning to Opportunités must ASK again',
    ).toBeGreaterThan(readsBefore);
    expect(screen.texts().join(' '), 'the deleted product must be gone').not.toContain('Sac en cuir');
    expect(screen.shows('Bazin riche'), 'and the ones still on offer stay').toBe(true);
    screen.unmount();
  });
});
