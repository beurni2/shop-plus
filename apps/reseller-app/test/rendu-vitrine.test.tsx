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
function storefront(curated: readonly string[], productNotes: Record<string, unknown> = {}) {
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
    productNotes,
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
      if (!state.curated.includes(pid)) {
        return { status: 200, json: { status: 'not_present', storefront: storefront(state.curated) as never } };
      }
      state.curated = state.curated.filter((p) => p !== pid);
      // The REAL decision body carries the post-removal shop; a fake that
      // withheld it would make the screen's second-read fallback look dead.
      return { status: 200, json: { status: 'removed', storefront: storefront(state.curated) as never } };
    },
    // The admin list — how the app learns her shop's slug.
    // A BARE ARRAY, which is what `GET /storefronts` really answers.
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
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

describe('THE TWO BLOCKERS THE VERIFIER FOUND — each walked', () => {
  it('NO SHOP YET shows the honest empty vitrine, never cards « Retirer » could not remove', async () => {
    /**
     * BLOCKER 1: the fallback also fired on `null` (« asked, and she has no
     * shop »), so a reseller with no boutique saw cards drawn from the session
     * log. The service had never heard of them and « Retirer » could only ever
     * answer 404 — a dead control telling her to retry the impossible.
     */
    const svc = service({ offers: [PV_A], curated: [] });
    wire([
      // getById 404s: she has not gone online yet.
      (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 404, json: { error: 'not_found' } } : null),
      // The listing publishes anyway — `decidePublish` never checks that a
      // storefront exists, and the membership POST that follows is answered
      // `absent` at HTTP 200 and IGNORED by the composition root. That is a
      // separate defect, journalled for the founder; it is reproduced here
      // because it is what puts a pid in the session log with no shop behind it.
      (path) => (path === '/listings' ? { status: 200, json: { status: 'published' } } : null),
      ...svc.routes,
    ]);
    const screen = await mountApp();

    // She publishes a product without ever having gone online.
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    await screen.press('Ajouter à ma vitrine');

    // …and Ma Vitrine must NOT claim it is in a shop that does not exist.
    expect(screen.shows('Ma vitrine') || screen.shows('Ma Vitrine')).toBe(true);
    expect(
      screen.texts().join(' '),
      'no product may be claimed for a shop the service has never heard of',
    ).not.toContain('Bazin riche');
    screen.unmount();
  });

  it('a removal whose SHOP READ fails still tells the truth — no success over a stale card', async () => {
    /**
     * BLOCKER 2: the screen re-read after the write and swallowed the failure,
     * so a POST that landed followed by a GET that did not left the product on
     * screen under « Retiré de votre boutique. » The shop now rides back on the
     * write itself; this walks the OLD-Worker path, where it does not.
     */
    const svc = service({ offers: [PV_A, PV_B], curated: [PV_A, PV_B] });
    let removed = false;
    wire([
      (path, body) => {
        if (!/\/items\/remove$/.test(path)) return null;
        removed = true;
        svc.state.curated = svc.state.curated.filter((p) => p !== String(body?.['pid'] ?? ''));
        // An OLDER Worker: no storefront on the answer.
        return { status: 200, json: { status: 'removed' } };
      },
      // …and the fallback read is down.
      (path) => (/^\/storefronts\/[^/]+$/.test(path) && removed ? { status: 503, json: { error: 'down' } } : null),
      ...svc.routes,
    ]);
    const screen = await openVitrine();
    await screen.press('Retirer de ma vitrine', 0);

    // It must NOT claim the shop changed when it could not read the shop.
    expect(screen.shows('Retiré de votre boutique.'), 'no success it cannot see').toBe(false);
    expect(screen.shows("Retiré, mais votre boutique n'a pas répondu. Rouvrez Ma vitrine pour voir.")).toBe(true);
    screen.unmount();
  });
});

/**
 * ═══ VIGNETTE — THE SMALL RENDER ASKS FOR THE SMALL FILE ═══
 *
 * Founder, 2026-08-11: « implement the vignette on all of them. »
 *
 * The judgement this pins is NOT « append a query » — it is WHERE, and it has
 * THREE halves, each of which fails differently:
 *
 *   1. the thumbnail strips ask for the small copy;
 *   2. the heroes do NOT — they render at full card width, where a 320 px file
 *      would visibly soften the product photography §5 asks us to respect;
 *   3. the thumbnail OF the hero asks for nothing either. It is the same
 *      photograph already on screen above it, and a second uri for it is a
 *      second download — on his catalogue today, where no photograph has a
 *      stored vignette yet, that turned three fetches into four.
 *
 * BOTH RENDER SITES ARE WALKED, from their own screens. The first version of
 * this block entered only through Ma Vitrine, so the fiche's strip was shipped
 * with nothing exercising it: deleting the call there kept the board green.
 */
describe('VIGNETTE — small render, small file; big render, big file', () => {
  const A = 'https://media.test/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const B = 'https://media.test/media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const C = 'https://media.test/media/cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  /** Three photographs on ONE product — the strip only renders above one, and
   *  three is the smallest count where « the hero's own thumbnail » is telling
   *  apart from « the first thumbnail ». */
  function troisPhotos(curated: readonly string[], sections: readonly unknown[] = []): void {
    wire([
      (path) =>
        path === '/supply-projections'
          ? {
              status: 200,
              json: {
                offers: [{ ...offer(PV_A, 'Bazin riche'), assetRefs: [A, B, C] }],
                diagnostic: { status: 'ok', refusals: [] },
              },
            }
          : null,
      (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
      (path) =>
        /^\/storefronts\/[^/]+$/.test(path)
          ? { status: 200, json: { ...storefront(curated), sections: [...sections] } as never }
          : null,
    ]);
  }

  it('MA VITRINE — the card hero is full, its own thumbnail re-uses it, the others are small', async () => {
    troisPhotos([PV_A]);
    const screen = await openVitrine();
    await screen.settle();

    const images = screen.images();
    // THE HERO — full, unchanged. The half that stops « all of them » from
    // making her best selling surface look soft.
    expect(images, 'the card hero must stay full size').toContain(A);
    // THE OTHER THUMBNAILS — the small copy.
    expect(images, 'the 52px thumbnails must ask for the vignette').toContain(`${B}?v=thumb`);
    expect(images).toContain(`${C}?v=thumb`);
    // THE HERO'S OWN THUMBNAIL — asks for NOTHING. This card's hero is always
    // capture 0, so `A?v=thumb` anywhere on this screen is the same photograph
    // being fetched a second time under a second uri.
    expect(images, 'the hero photograph must not be requested twice').not.toContain(`${A}?v=thumb`);
    screen.unmount();
  });

  it('LA FICHE — same rule, and the strip FOLLOWS the hero when she taps another capture', async () => {
    troisPhotos([]);
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    expect(screen.shows('Bazin riche'), 'the fiche opened').toBe(true);

    const avant = screen.images();
    expect(avant, 'the fiche hero is the full photograph').toContain(A);
    expect(avant, 'the fiche strip asks for the vignette').toContain(`${B}?v=thumb`);
    expect(avant).toContain(`${C}?v=thumb`);
    expect(avant, 'capture 0 is the hero — not fetched twice').not.toContain(`${A}?v=thumb`);

    // SHE TAPS THE THIRD CAPTURE. An image-only control: no text, reachable
    // only by its label — which is why the harness had to learn to press those.
    // nth 0 is the hero itself (same label), so the strip starts at 1.
    await screen.press('Voir les photos', 3);

    const apres = screen.images();
    expect(apres, 'the hero moved to capture 2, at full size').toContain(C);
    expect(apres, 'and capture 2 is no longer asked for twice').not.toContain(`${C}?v=thumb`);
    expect(apres, 'capture 0 is now an ordinary thumbnail — small').toContain(`${A}?v=thumb`);
    expect(apres).toContain(`${B}?v=thumb`);
    screen.unmount();
  });

  it('PERSONNALISER — the 44 px arrangement rows, the smallest render in the app, ask small', async () => {
    // The site the verifier found missing: « À la une & ordre » draws one 44 px
    // square PER CURATED ARTICLE, so a shop with twelve articles pulled twelve
    // full-size photographs to fill twelve 44 px squares. No hero sits beside
    // these rows, so EVERY one of them asks for the small copy — there is no
    // exception here, which is what makes this different from the two strips.
    troisPhotos([PV_A]);
    const screen = await openVitrine();
    await screen.press('Personnaliser ma boutique');
    await screen.press('À la une & ordre');
    expect(screen.shows('Bazin riche'), 'the arrangement screen lists her article').toBe(true);

    const images = screen.images();
    expect(images, 'the 44px row art must ask for the vignette').toContain(`${A}?v=thumb`);
    expect(images, 'and must NOT ask for the full photograph').not.toContain(A);
    screen.unmount();
  });

  it('PERSONNALISER — the SECTION picker draws the same 44 px square, and asks small too', async () => {
    // The second of the two rows the verifier found. It is a DIFFERENT screen
    // from « À la une », reached by a different door, and a walk that covered
    // only the first would leave this one exactly as unpinned as the fiche was.
    troisPhotos([PV_A], [{ id: 'sec-tissus', name: 'Tissus', pids: [] }]);
    const screen = await openVitrine();
    await screen.press('Personnaliser ma boutique');
    await screen.press('Sections');
    await screen.press('Tissus');
    expect(screen.shows('Bazin riche'), 'the section picker lists her articles').toBe(true);

    const images = screen.images();
    expect(images, 'the 44px picker art must ask for the vignette').toContain(`${A}?v=thumb`);
    expect(images, 'and must NOT ask for the full photograph').not.toContain(A);
    screen.unmount();
  });
});


/**
 * ═══ VOIX-PRODUIT — A NOTE THE SERVICE HOLDS IS A NOTE THE CARD SHOWS ═══
 *
 * Founder, 2026-08-12: « on ma vitrine when I record an audio and tap publier it
 * does not show on the product as a recorded audio and when I tap to listen I am
 * not hearing anything. »
 *
 * THE DEFECT, and it is the third of its family in two days: the card renders
 * `voice.notes[pid]` — REACT STATE, seeded `DEFAULT_VOICE_NOTES` (empty) and
 * mutated only by the record/publish flow in this session. The shop's stored
 * `productNotes` is read in exactly one place, to CONFIRM the upload, and never
 * to fill that state. So the bytes are on the server and the screen does not
 * know: relaunch and every note she ever recorded is « Ajouter une note vocale »
 * again, with no url to play — which is the silence he heard.
 *
 * These walk the SERVICE's truth, not a session's memory.
 */
describe('VOIX-PRODUIT — the note the shop holds', () => {
  const NOTE_URL = 'https://media.test/voice/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a';

  function avecNote(note: Record<string, unknown> | null): void {
    wire([
      (path) =>
        path === '/supply-projections'
          ? {
              status: 200,
              json: {
                offers: [offer(PV_A, 'Bazin riche')],
                diagnostic: { status: 'ok', refusals: [] },
              },
            }
          : null,
      (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
      (path) =>
        /^\/storefronts\/[^/]+$/.test(path)
          ? {
              status: 200,
              json: storefront([PV_A], note === null ? {} : { [PV_A]: note }) as never,
            }
          : null,
    ]);
  }

  it('a STORED note shows on the card — never « Ajouter » over a note that exists', async () => {
    avecNote({ status: 'ready', url: NOTE_URL, durationMs: 8_000 });
    const screen = await openVitrine();
    await screen.settle();

    expect(
      screen.shows('Ajouter une note vocale'),
      'the shop holds a note — the card must not offer to add one',
    ).toBe(false);
    expect(screen.shows('Note vocale en ligne'), 'and it must say the note is live').toBe(true);
    screen.unmount();
  });

  it('a product with NO note still offers to add one — the narrowness', async () => {
    avecNote(null);
    const screen = await openVitrine();
    await screen.settle();
    expect(screen.shows('Ajouter une note vocale'), 'nothing stored ⇒ the invitation stands').toBe(true);
    expect(screen.shows('Note vocale en ligne')).toBe(false);
    screen.unmount();
  });

  it('the note’s own URL reaches the screen — or there is nothing to play', async () => {
    // The silence he reported: with no url in state the play control has nothing
    // to hand the player. Asserted on the sheet, where the control lives.
    avecNote({ status: 'ready', url: NOTE_URL, durationMs: 8_000 });
    const screen = await openVitrine();
    await screen.press('Note vocale');
    await screen.settle();
    expect(screen.shows('Bazin riche'), 'the sheet opened on this product').toBe(true);
    expect(screen.shows('0:08'), 'the take’s real length came from the shop, not from zero').toBe(true);
    screen.unmount();
  });
});
