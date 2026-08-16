import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-test-renderer';
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
  // EACH WALK GETS A FRESH MODULE GRAPH. Without this the App's module-level
  // state carried between mounts, and the fourth walk in this file opened on an
  // EMPTY vitrine — the shop it had just been served silently replaced by a
  // neighbour's leftovers. It looked like a bug in the walk; it was the file
  // handing every walk the previous one's app.
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  // The failure-road walks run on fake timers (a 10 s watchdog is not a wait
  // any suite should serve in real time); everyone after them gets real ones.
  vi.useRealTimers();
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

  // (The SECTION-picker vignette walk left with its screen — founder order
  // 2026-08-13, « remove 'Sections' from personnaliser ».)
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

  function avecNote(note: Record<string, unknown> | null): ReturnType<typeof wire> {
    return wire([
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
      // VOIX-SUPPRIMER-1 — the real remove path, answering as the Worker does.
      (path) =>
        /^\/storefronts\/[^/]+\/voice\/remove$/.test(path)
          ? { status: 200, json: { status: 'removed', storefront: storefront([PV_A], {}) } as never }
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

  it('the note’s own URL reaches the CARD — Écouter is there, pressable, and plays with NO sheet', async () => {
    /**
     * THIS TEST USED TO ASSERT THE WRONG TWO THINGS. It checked the product
     * name and « 0:08 » — a duration, which is an INDEPENDENT field from the
     * url — while the play control is gated on `n.url` alone. A verifier
     * deleted the control from this branch entirely and all 56 tests stayed
     * green: a build where a stored note is visible and completely unplayable,
     * which is the founder's second sentence (« when I tap to listen I am not
     * hearing anything ») shipping under a green board.
     *
     * « Present AND pressable » is the standing order's own wording, and it is
     * the half a `shows()` can never answer.
     *
     * VOIX-CARTE RETARGETED IT TO THE CARD (founder 2026-08-13: the player
     * lives « attach to the product » now): no sheet is opened — the card's own
     * Écouter must reach the player, asserted in the journal, never inferred.
     */
    avecNote({ status: 'ready', url: NOTE_URL, durationMs: 8_000 });
    const screen = await openVitrine();
    await screen.settle();
    expect(screen.shows('0:08'), 'the take’s real length came from the shop, onto the card').toBe(true);
    expect(screen.canPress('Écouter'), 'a stored note with a url must be playable from the card').toBe(true);
    await screen.press('Écouter');
    // The SAME module instance the app drives (see the dynamic-import note below).
    const audio = await import('./doubles/expo-audio');
    expect(audio.journalLecteur, 'the press never handed the note to the player').toContain(`replace:${NOTE_URL}`);
    expect(audio.journalLecteur, 'the note was loaded but never started').toContain(`play:${NOTE_URL}`);
    screen.unmount();
  });

  it('the sheet says EN LIGNE over a live note — it used to say « En attente »', async () => {
    /**
     * THE VERIFIER'S BLOCKER. `voiceCardLabel` was taught that queued and live
     * are different facts; the SHEET was not. `kept = pending || ready` rendered
     * the waiting pill and « Rien n'est envoyé tant que le réseau n'est pas
     * revenu » over a note the service had been serving to buyers for a day —
     * one tap below a card reading « Note vocale en ligne ». The screen
     * contradicted itself about the state of her own shop.
     */
    avecNote({ status: 'ready', url: NOTE_URL, durationMs: 8_000 });
    const screen = await openVitrine();
    await screen.press('Note vocale');
    await screen.settle();
    expect(screen.shows('En ligne'), 'a stored note is LIVE and must say so').toBe(true);
    expect(screen.shows('En attente'), 'a live note must not be called a waiting one').toBe(false);
    expect(
      screen.shows('Rien n’est envoyé tant que le réseau n’est pas revenu'),
      'the queued sentence must not sit under a note that is already online',
    ).toBe(false);
    // THE SHEET'S OWN ÉCOUTER STAYS WIRED (verifier MINOR, 2026-08-13): the two
    // card walks no longer open the sheet, so without this press the kept-branch
    // PlayBtn could dead-wire with every test green. Index 1 is the sheet's
    // control — the card renders first, the Modal last.
    await screen.press('Écouter', 1);
    const audio = await import('./doubles/expo-audio');
    expect(
      audio.journalLecteur,
      "the SHEET's Écouter never reached the player",
    ).toContain(`play:${NOTE_URL}`);
    screen.unmount();
  });

  it('« Supprimer » REACHES THE SERVICE — it used to remove the note from her phone alone', async () => {
    /**
     * THE VERIFIER'S MAJOR, and the founder's answer to it (« build the real
     * delete », 2026-08-12). « Supprimer » cleared the local note and toasted
     * « Note supprimée. » with nothing sent anywhere: buyers went on hearing the
     * audio on the fiche, and once this slice wired the shop's own notes into
     * her screen, the note came BACK at the next read. She was told a thing was
     * gone, twice over, while it was not.
     *
     * This asserts the CALL SITE — that the tap actually reaches the service —
     * because « the port exists » was true the whole time it was never called.
     */
    const w = avecNote({ status: 'ready', url: NOTE_URL, durationMs: 8_000 });
    const screen = await openVitrine();
    await screen.press('Note vocale');
    await screen.settle();
    expect(screen.canPress('Supprimer'), 'the remove control must be there and live').toBe(true);

    await screen.press('Supprimer');
    await screen.settle();

    const remove = w.calls.filter((c) => /\/voice\/remove$/.test(c.path) && c.method === 'POST');
    expect(remove.length, 'the tap never reached the service — the note is still on her shop').toBe(1);
    expect(remove[0]!.body?.['pid'], 'it must name the product it is removing').toBe(PV_A);
    screen.unmount();
  });

  it('Écouter on a STORED note REACHES the player from the CARD — pressable was never the same as wired', async () => {
    /**
     * THE DIAGNOSIS'S G1, and the hole in the test above this one: it asserts
     * `canPress('Écouter')` and stops, so dead-wiring the press (`onPress` →
     * nothing) left every test green over the founder's second sentence —
     * « when I tap to listen I am not hearing anything ». The expo-audio
     * double RECORDS what the app asks of the player, so the press can be
     * followed all the way to the native surface. The double's bound holds:
     * this proves the player was ASKED, never that sound played.
     *
     * VOIX-CARTE RETARGETED IT TO THE CARD: no sheet opening — his listen tap
     * is one tap on the product now, and this drives exactly that tap.
     */
    avecNote({ status: 'ready', url: NOTE_URL, durationMs: 8_000 });
    const screen = await openVitrine();
    await screen.settle();

    await screen.press('Écouter');
    // The SAME module instance the app drives: after vi.resetModules() the
    // static top-of-file import would be a stale twin, so import dynamically.
    const audio = await import('./doubles/expo-audio');
    expect(
      audio.journalLecteur,
      'the press never handed the note to the player',
    ).toContain(`replace:${NOTE_URL}`);
    expect(
      audio.journalLecteur,
      'the note was loaded but never started',
    ).toContain(`play:${NOTE_URL}`);
    // …and the screen knows it is playing — the way back (Pause) is live.
    expect(screen.canPress('Pause'), 'the button must flip to Pause').toBe(true);
    screen.unmount();
  });

  it('a shop row that is NOT `ready` is never adopted — no live pill over a note the shop has not stored', async () => {
    /**
     * THE NARROWNESS, stated as the code actually enforces it. I first wrote
     * this test as « a queued note still says En attente », mounted a `pending`
     * row on the shop and watched it fail: the merge adopts `ready` ALONE, on
     * purpose — the service writes `ready` and nothing else, and `pending` is a
     * state of HER PHONE while bytes are in flight. A stored `pending` is
     * therefore unreachable, and a walk asserting it would have been asserting
     * a fiction. What is real, and what this pins, is that such a row changes
     * nothing on screen: the card keeps offering to add a note, and no live
     * pill appears over something the shop is not serving.
     *
     * (The queued pill itself belongs to the local record-and-publish path,
     * where `pending` is genuinely reachable; it is not a shop-side fact.)
     */
    avecNote({ status: 'pending', url: NOTE_URL, durationMs: 8_000 });
    const screen = await openVitrine();
    await screen.settle();
    expect(
      screen.shows('Note vocale en ligne'),
      'a row the shop has not marked ready must not read as live',
    ).toBe(false);
    expect(screen.shows('Ajouter une note vocale'), 'so the invitation stands').toBe(true);
    screen.unmount();
  });
});

/**
 * ═══ VOIX-PRODUIT — SHE RECORDS, LISTENS, PUBLISHES — IN ONE SESSION ═══
 *
 * THE DIAGNOSIS'S G2: nothing drove record → stop → Publier on the real screen,
 * because the expo-audio double yielded no take — so deleting the readyNote
 * adoption at the upload-success site (voice-sheet l.197) left all 601 tests
 * green over a publish that never becomes « en ligne » on her screen. The
 * double now yields a canned take (a uri + marker bytes: what the native side
 * yields, and ALL it yields), so the whole path she walks is walkable.
 *
 * AND G3 RIDES THE SAME WALK: RN Android has refused `file://` through fetch —
 * `fetch(fileUri)` throwing lands as `file_unreadable` → « Note pas envoyée »
 * with no upload attempted, on the founder's device, under a green board. So
 * this walk pins the CALL SITE: the take's bytes come through the
 * expo-file-system port, and no fetch(file://) leaves the app.
 */
describe('VOIX-PRODUIT — record → stop → Publier, on the real screen', () => {
  const NOTE_URL = 'https://media.test/voice/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.m4a';

  /**
   * A STATEFUL fake service, CONTRACT-CERTIFIED to the real Worker
   * (services/storefront-service/src/index.ts, handleMediaUpload): the upload
   * answers 201 `{kind:'voice', status:'live', url, durationMs}` AND points the
   * storefront at the note — `productNotes[pid] = {status:'ready', url,
   * durationMs}` (storefront-core.ts l.656) — so the app's read-back
   * confirmation has a truth to read, exactly as it does live.
   */
  function serviceVoixPublie(): { routes: Route[]; state: { note: Record<string, unknown> | null } } {
    const state = { note: null as Record<string, unknown> | null };
    const routes: Route[] = [
      (path) =>
        path === '/supply-projections'
          ? {
              status: 200,
              json: { offers: [offer(PV_A, 'Bazin riche')], diagnostic: { status: 'ok', refusals: [] } },
            }
          : null,
      (path) => {
        if (path !== '/media/upload') return null;
        state.note = { status: 'ready', url: NOTE_URL, durationMs: 0 };
        return {
          status: 201,
          json: { service: 'storefront-service', kind: 'voice', status: 'live', url: NOTE_URL, durationMs: 0 },
        };
      },
      (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
      (path) =>
        /^\/storefronts\/[^/]+$/.test(path)
          ? {
              status: 200,
              json: storefront([PV_A], state.note === null ? {} : { [PV_A]: state.note }) as never,
            }
          : null,
    ];
    return { routes, state };
  }

  it('the take goes through the FILE port to the service, and the card reads « en ligne » THIS session', async () => {
    const svc = serviceVoixPublie();
    const w = wire(svc.routes);
    const screen = await openVitrine();
    await screen.press('Note vocale');
    await screen.press('Enregistrer une note');
    expect(screen.shows('Enregistrement…'), 'the take is running').toBe(true);
    await screen.press('Arrêter');

    // ÉCOUTEZ-VOUS D'ABORD — the recorded-branch listen block (voice-sheet's
    // vEcouteBloc), unwalked until now: the fresh take's press must reach the
    // player. TWO Écouter are on screen since VOIX-CARTE — the card row renders
    // under the open sheet for the same recorded take — and the harness rightly
    // refuses the ambiguity: index 1 is the SHEET's block (the card renders
    // first, the Modal last).
    await screen.press('Écouter', 1);
    const audio = await import('./doubles/expo-audio');
    expect(
      audio.journalLecteur,
      'pressing Écouter on the fresh take never started the player',
    ).toContain(`play:${audio.PRISE_URI}`);

    await screen.press('Publier');
    await screen.settle();
    await screen.settle();

    // THE UPLOAD LEFT THE SCREEN — path, pid, and real bytes on the wire.
    const ups = w.calls.filter((c) => c.path === '/media/upload' && c.method === 'POST');
    expect(ups, 'Publier never reached the service').toHaveLength(1);
    expect(ups[0]!.search).toContain('kind=voice');
    expect(ups[0]!.search).toContain(`pid=${PV_A}`);
    expect(ups[0]!.bytes, 'the POST carried no bytes').toBeGreaterThan(0);

    // G3 — the bytes came through expo-file-system, never fetch(file://).
    const fs = await import('./doubles/expo-file-system');
    expect(
      fs.journalOctetsLus,
      "the take's bytes were not read through the expo-file-system port",
    ).toContain(audio.PRISE_URI);
    expect(
      w.calls.some((c) => c.path.includes('prise-rendu')),
      'the take went out over fetch(file://) — the read RN Android refuses',
    ).toBe(false);

    // …and the SAME SESSION shows the note live: the sheet says so…
    expect(screen.shows('En ligne'), 'the sheet must say the note is live').toBe(true);
    // …and one « Fermer » later, so does the card — no relaunch required.
    await screen.press('Fermer');
    expect(
      screen.shows('Note vocale en ligne'),
      'the card must show the live note in the session that recorded it',
    ).toBe(true);
    screen.unmount();
  });
});

/**
 * ═══ VOIX-CARTE — THE PLAYER ON THE CARD, AND THE FAILURE ROAD MADE HONEST ═══
 *
 * Founder, 2026-08-13: « the audio on ma vitrine when i tap to listen back, i
 * am not hearing anything and also i want it to display with play and pause
 * button attach to the product and with a button at the end right for redo it ».
 *
 * THE FIRST HALF IS A SCREEN BUG, so its walk is written FIRST, red, per the
 * standing order. The verified mechanism (established against the installed
 * expo-audio 1.1.1 source): the library registers NO error listener on Android,
 * so a source that fails to load delivers NOTHING to JS — `isLoaded` never
 * arrives, the wait-for-isLoaded code never calls `play()`, and the UI still
 * flips to « Pause ». Permanent silence, no feedback: his symptom exactly.
 *
 * The double's dead-load mode (`prochainePriseMuette`) reproduces that bound
 * faithfully; its header states what it may never claim (no audible sound, no
 * appearance).
 */
describe('VOIX-CARTE — the player on the product card', () => {
  const NOTE_URL = 'https://media.test/voice/cccccccc-cccc-4ccc-8ccc-cccccccccccc.m4a';
  const NOTE_URL_B = 'https://media.test/voice/dddddddd-dddd-4ddd-8ddd-dddddddddddd.m4a';

  /** Two curated products; whichever pids appear in `notes` carry a stored,
   *  live note — the state in which the card must offer play/pause + Refaire. */
  function avecNotesCarte(notes: Record<string, Record<string, unknown>>): Wire {
    return wire([
      (path) =>
        path === '/supply-projections'
          ? {
              status: 200,
              json: {
                offers: [offer(PV_A, 'Bazin riche'), offer(PV_B, 'Sac en cuir')],
                diagnostic: { status: 'ok', refusals: [] },
              },
            }
          : null,
      (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
      (path) =>
        /^\/storefronts\/[^/]+$/.test(path)
          ? { status: 200, json: storefront([PV_A, PV_B], notes) as never }
          : null,
    ]);
  }

  it('ÉCHEC DE LECTURE — a note that never loads gives « Écouter » back and says so', async () => {
    /**
     * HIS BUG, REPRODUCED: the player never reports loaded. Before the fix the
     * card had no player at all and the sheet's button sat on « Pause » over
     * silence forever; after it, the watchdog fires, the button returns, and
     * the failure sentence reaches the toast.
     */
    const audio = await import('./doubles/expo-audio');
    audio.prochainePriseMuette();
    avecNotesCarte({ [PV_A]: { status: 'ready', url: NOTE_URL, durationMs: 8_000 } });
    const screen = await openVitrine();
    await screen.settle();

    vi.useFakeTimers();
    await screen.press('Écouter');
    // The tap flips the button — honest so far: the app believes it is loading.
    expect(screen.canPress('Pause'), 'the tap must register').toBe(true);

    // Past the watchdog. The load never answered; the screen must stop claiming.
    await act(async () => {
      vi.advanceTimersByTime(11_000);
      await Promise.resolve();
    });
    await screen.settle();

    expect(
      screen.canPress('Écouter'),
      'the button must RETURN — « Pause » over permanent silence is his report',
    ).toBe(true);
    expect(
      screen.shows('La note ne se lit pas. Vérifiez le réseau et réessayez.'),
      'she must be told, not left listening to nothing',
    ).toBe(true);
    screen.unmount();
  });

  it('CARTE — Pause rend la main : the second press reaches stopPlayback and « Écouter » returns', async () => {
    avecNotesCarte({ [PV_A]: { status: 'ready', url: NOTE_URL, durationMs: 8_000 } });
    const screen = await openVitrine();
    await screen.settle();

    await screen.press('Écouter');
    expect(screen.canPress('Pause'), 'the first press must flip the button').toBe(true);
    await screen.press('Pause');

    // The pause REACHED the player — asserted in the journal, never inferred
    // from the label alone (a flipped label over a still-playing note would be
    // the same lie in the other direction).
    const audio = await import('./doubles/expo-audio');
    expect(audio.journalLecteur, 'the second press never reached stopPlayback').toContain(`pause:${NOTE_URL}`);
    expect(screen.canPress('Écouter'), 'the button must come back to Écouter').toBe(true);
    expect(screen.canPress('Pause'), 'and Pause must leave with the playback').toBe(false);
    screen.unmount();
  });

  it("CARTE — Refaire ouvre la route d'enregistrement, Annuler en main", async () => {
    /**
     * A Refaire that only opened the sheet would be a two-tap lie: the button
     * says REDO, so the take starts. The sheet owns the mic banner, Annuler
     * and the recording UI — which is exactly why it opens WITH the take.
     */
    avecNotesCarte({
      [PV_A]: { status: 'ready', url: NOTE_URL, durationMs: 8_000 },
      [PV_B]: { status: 'ready', url: NOTE_URL_B, durationMs: 5_000 },
    });
    const screen = await openVitrine();
    await screen.settle();

    // Two cards, two Refaire — the index names the card (render order).
    await screen.press('Refaire', 0);

    expect(screen.shows('Enregistrement…'), 'the sheet opened IN the recording state').toBe(true);
    expect(screen.canPress('Annuler'), 'her way out of the take is live').toBe(true);
    // …and while she records, every other card's Refaire is disabled — one
    // microphone, one take at a time (the anyRecording guard).
    expect(screen.canPress('Refaire'), "the other product's Refaire must sit disabled").toBe(false);
    screen.unmount();
  });

  it('CARTE — Refaire pendant un chargement muet : the record sheet is never toasted about the dead load', async () => {
    /**
     * THE OTHER ESCAPE FROM A HUNG LOAD (verifier MINOR, 2026-08-13): she taps
     * Écouter, nothing loads, and within the watchdog's bound she taps Refaire
     * on the same card. Recording is LEAVING the listen road — `start()` kills
     * the watchdog — so the failure sentence about the abandoned load must not
     * land on her record sheet ten seconds into the take. The pid-guard cannot
     * catch this one (she never paused, so the ref still names this pid): the
     * `start()` clear is the only defence, and this walk is its pin.
     */
    const audio = await import('./doubles/expo-audio');
    audio.prochainePriseMuette();
    avecNotesCarte({ [PV_A]: { status: 'ready', url: NOTE_URL, durationMs: 8_000 } });
    const screen = await openVitrine();
    await screen.settle();

    vi.useFakeTimers();
    await screen.press('Écouter');
    await screen.press('Refaire');
    expect(screen.shows('Enregistrement…'), 'the take must be running').toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(11_000);
      await Promise.resolve();
    });
    await screen.settle();
    expect(
      screen.shows('La note ne se lit pas. Vérifiez le réseau et réessayez.'),
      'the dead load toasted over her recording — start() must kill the watchdog',
    ).toBe(false);
    expect(screen.shows('Enregistrement…'), 'the take survived the window').toBe(true);
    screen.unmount();
  });

  it('CARTE — the play is IMMEDIATE: play: follows replace: with NO loaded event delivered', async () => {
    /**
     * THE PIN THAT KEEPS THE ANDROID SUCCESS ROAD INDEPENDENT OF EVENT
     * DELIVERY. Verified 2026-08-13: on Android, play-after-replace is queued
     * via ExoPlayer's playWhenReady and is never lost — so the app calls
     * `play()` unconditionally after `replace()`, and waits for NO event. The
     * dead-load mode delivers no loaded event at all; `play:` must be in the
     * journal anyway, after its `replace:`.
     */
    const audio = await import('./doubles/expo-audio');
    audio.prochainePriseMuette();
    avecNotesCarte({ [PV_A]: { status: 'ready', url: NOTE_URL, durationMs: 8_000 } });
    const screen = await openVitrine();
    await screen.settle();

    vi.useFakeTimers();
    await screen.press('Écouter');
    const iReplace = audio.journalLecteur.indexOf(`replace:${NOTE_URL}`);
    const iPlay = audio.journalLecteur.indexOf(`play:${NOTE_URL}`);
    expect(iReplace, 'the note never reached the player').toBeGreaterThanOrEqual(0);
    expect(iPlay, 'play: must be asked without waiting for any event, AFTER replace:').toBeGreaterThan(iReplace);

    // Her way out of the hung load is Pause.
    await screen.press('Pause');
    expect(screen.canPress('Écouter'), 'Pause during the hung load hands the button back').toBe(true);

    // AND NO FAILURE TOAST CHASES HER (verifier MAJOR, 2026-08-13: this half of
    // the DoD was implemented but pinned by nothing — a mutation that let the
    // watchdog outlive her Pause survived the whole suite). Past the watchdog's
    // whole bound: the abandoned load must stay abandoned, silently.
    await act(async () => {
      vi.advanceTimersByTime(11_000);
      await Promise.resolve();
    });
    await screen.settle();
    expect(
      screen.shows('La note ne se lit pas. Vérifiez le réseau et réessayez.'),
      'she paused and moved on — the dead load must not toast her ten seconds later',
    ).toBe(false);
    screen.unmount();
  });
});

/**
 * ═══ DÉJÀ-DANS-MA-VITRINE — the screen must not offer what she already has ═══
 *
 * FOUNDER REPORT (2026-08-12): « when i add a product on ma vitrine, it still
 * shows on opportunites the option the add the same product on ma vitrine
 * instead of displaying this product is already added ».
 *
 * WRITTEN FIRST, RED, per the standing order — « every screen bug the founder
 * reports gets its walk written FIRST … before the fix. A bug he has hit once
 * must never be able to reach him twice. »
 *
 * WHY NO SCAN COULD SEE IT: the membership (`vitrineLive`) and the CTA are both
 * in App.tsx, three hundred lines apart, and the CTA's only gate is « is the
 * service reachable ». Nothing is missing from the file; what is missing is a
 * JOIN, and a join that was never made looks exactly like a file that is fine.
 */
describe('DÉJÀ-DANS-MA-VITRINE — Opportunités knows what is already hers', () => {
  it('marks the product she already added, and its fiche offers the way IN, not a second add', async () => {
    const svc = service({ offers: [PV_A, PV_B], curated: [PV_A] });
    const w = wire(svc.routes);
    const screen = await mountApp();
    await screen.press('Opportunités');

    // ── ON THE GRID: the tile says so, before she spends a tap ────────────
    expect(
      screen.shows('Déjà dans ma vitrine'),
      'the grid offers a product she already has with no mark on it',
    ).toBe(true);

    // ── ON THE FICHE: no second « Ajouter », and a way forward ────────────
    await screen.press('Bazin riche');
    expect(
      screen.shows('Ce produit est déjà dans votre vitrine.'),
      'the fiche must say what is true before it offers anything',
    ).toBe(true);
    expect(
      screen.canPress('Ajouter à ma vitrine'),
      'a second « Ajouter » is a button whose only outcome is a no-op the service answers idempotent',
    ).toBe(false);

    // THE MONEY ROWS OF A QUOTE-FOR-ADDING ARE GONE. Every one of them is
    // derived from local state the app forgets, so over a LIVE listing they
    // would be a confident wrong number — « Prix cliente » under « c'est déjà
    // dans votre vitrine » is a claim, not an estimate (verifier BLOCKER).
    expect(screen.shows('Prix cliente'), 'a price this app cannot vouch for, over a live listing').toBe(false);
    expect(screen.texts().join(' '), 'the estimate belongs to a product she has not added').not.toContain('Gagnez environ');
    // …and the marge control with them: it could only move numbers on screen.
    expect(screen.shows('Votre marge'), 'a slider that signs nothing').toBe(false);
    // The one figure it CAN vouch for stays — the supplier's base price.
    expect(screen.shows('Prix de base')).toBe(true);

    // …and she can REACH THE NEXT STEP — the four questions, this one.
    expect(screen.canPress('Voir dans ma vitrine')).toBe(true);
    await screen.press('Voir dans ma vitrine');
    /**
     * ASSERT SOMETHING ONLY MA VITRINE RENDERS. This used to check the product
     * name, which is already on the fiche she is standing on — so it survived
     * the button being DEAD (the verifier emptied the handler and all 20 walks
     * stayed green). « Retirer de ma vitrine » exists on no other screen.
     */
    expect(screen.canPress('Retirer de ma vitrine'), 'the way in never left the fiche').toBe(true);
    expect(screen.shows('Bazin riche'), 'and it landed on the product she asked for').toBe(true);

    // NOTHING WAS PUBLISHED by any of that.
    expect(w.calls.some((c) => c.path === '/listings'), 'no write may leave this screen').toBe(false);
    screen.unmount();
  });

  it('a product she has NOT added still adds in one tap — the mark closes no door', async () => {
    // The other half, and the one that keeps the fix honest: the guard must
    // not swallow the main flow it sits in front of.
    const svc = service({ offers: [PV_A, PV_B], curated: [PV_A] });
    const w = wire([
      (path) => (path === '/listings' ? { status: 200, json: { status: 'published' } } : null),
      ...svc.routes,
    ]);
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Sac en cuir');

    expect(screen.canPress('Ajouter à ma vitrine'), 'the product she does not have must still be addable').toBe(true);
    await screen.press('Ajouter à ma vitrine');

    const published = w.calls.filter((c) => c.path === '/listings');
    expect(published, 'the tap never reached the service').toHaveLength(1);
    expect(published[0]?.body?.['productVersionId']).toBe(PV_B);
    screen.unmount();
  });
});

describe("DÉJÀ-DANS-MA-VITRINE — the founder's own sequence, in one session", () => {
  it('she ADDS a product, returns to Opportunités, and it is marked — no second add offered', async () => {
    /**
     * HIS WORDS, EXACTLY: « when i add a product on ma vitrine, it still shows
     * on opportunites the option the add the same product ». The walk above
     * seeds a shop that already holds it; THIS one earns it the way he does —
     * by tapping « Ajouter à ma vitrine » — because the two are different code
     * paths. Membership after a publish comes from a shop the app must RE-READ:
     * if it does not, the mark is right for a shop she reopens and wrong for
     * the one she is standing in, which is the half he would have hit first.
     *
     * THE PUBLISH ROUTE APPENDS TO `curatedItems`, because the real Worker does:
     * verified in miniflare against `dist/worker/worker.mjs` — publish 200
     * `{"status":"published"}` and the shop reads `["pv-…"]` immediately after.
     */
    const svc = service({ offers: [PV_A, PV_B], curated: [] });
    const w = wire([
      (path, body) => {
        if (path !== '/listings') return null;
        const pid = typeof body?.['productVersionId'] === 'string' ? (body['productVersionId'] as string) : '';
        if (!svc.state.curated.includes(pid)) svc.state.curated.push(pid);
        return { status: 200, json: { status: 'published' } };
      },
      ...svc.routes,
    ]);
    const screen = await mountApp();

    await screen.press('Opportunités');
    expect(screen.shows('Déjà dans ma vitrine'), 'nothing is hers yet').toBe(false);
    await screen.press('Bazin riche');
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();

    expect(w.calls.some((c) => c.path === '/listings'), 'the add never reached the service').toBe(true);

    // …and back on Opportunités, the product she just added says so.
    await screen.press('Opportunités');
    await screen.settle();
    expect(
      screen.shows('Déjà dans ma vitrine'),
      'the product she added THIS SESSION still offers to be added again',
    ).toBe(true);

    // Her fiche agrees — this is the tap he actually makes twice.
    await screen.press('Bazin riche');
    expect(screen.canPress('Ajouter à ma vitrine'), 'a second add is still on offer').toBe(false);
    expect(screen.shows('Ce produit est déjà dans votre vitrine.')).toBe(true);
    screen.unmount();
  });
});

describe('DÉJÀ-DANS-MA-VITRINE — the answer the SERVICE gives, when the screen cannot know', () => {
  it('a shop read that FAILS leaves the button, and an idempotent write is not reported as an add', async () => {
    /**
     * THE HOLE THE SCREEN GUARD CANNOT CLOSE (verifier MAJOR). `dejaDansVitrine`
     * reads `vitrineLive`, which falls back to the session log when the shop
     * read has not answered — so if `GET /storefronts/:id` fails, a product she
     * added in an EARLIER session is unmarked and the « Ajouter » button comes
     * back. The guard is a screen-level check over a value that can be stale.
     *
     * The write's own answer cannot be stale. The service says `idempotent` —
     * « I recognised this command, I wrote nothing, the first marge stands » —
     * and that must never be reported as « C'est ajouté à votre vitrine », or
     * a reseller who moved her marge is told a price her cliente will never be
     * charged. CONTRACT-CERTIFIED: `200 {"status":"idempotent"}` is exactly what
     * the real Worker answers a re-tap (`republish-idempotent.e2e.test.ts`).
     */
    const svc = service({ offers: [PV_A], curated: [PV_A] });
    const w = wire([
      // Her shop is unreadable this session…
      (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 500, json: { error: 'down' } } : null),
      // …and the product is already published, so the write is a no-op.
      (path) => (path === '/listings' ? { status: 200, json: { status: 'idempotent' } } : null),
      ...svc.routes,
    ]);
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');

    // The guard is blind here, and the walk says so rather than pretending.
    expect(screen.canPress('Ajouter à ma vitrine'), 'the unreadable shop leaves the button — that is the state under test').toBe(true);
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();

    expect(w.calls.some((c) => c.path === '/listings'), 'the tap never reached the service').toBe(true);
    expect(
      screen.shows("C'est ajouté à votre vitrine.") || screen.shows('C’est ajouté à votre vitrine.'),
      'a write that changed NOTHING was reported as an add',
    ).toBe(false);
    expect(
      screen.shows('Ce produit était déjà dans votre vitrine. Votre marge n’a pas changé.'),
      'she must be told what actually happened, including that her marge did not move',
    ).toBe(true);
    screen.unmount();
  });
});

describe("RE-AJOUT — a removed product can RETURN to Ma Vitrine (founder, 2026-08-13)", () => {
  it('add → Retirer → re-add: the product is BACK on her vitrine and the toast says so', async () => {
    /**
     * HIS WORDS, WITH THE SCREENSHOT: « When I add a product to ma vitrine,
     * remove it and trying t re-add it, it says the product exist already » —
     * the vitrine showed the EMPTY state while the toast read « Ce produit
     * était déjà dans votre vitrine… ». The pinned command id replayed
     * `idempotent`, the service appended nothing, and the product could never
     * come back.
     *
     * THE WIRE MIRRORS THE REAL WORKER'S NEW ANSWER — contract-certified to
     * combined-worker.e2e.test.ts « RE-AJOUT — a REMOVED product returns… »,
     * and never kinder than it:
     *   · first publish of a command id → 200 {status:'published'}, membership
     *     appended (the existing append pin);
     *   · a REPLAYED command id whose pid is GONE from the shop → 200
     *     {status:'idempotent', remise:true, storefront} — the append runs and
     *     the post-add shop rides on the write (the removeItem precedent);
     *   · a replayed command id whose pid is PRESENT → 200 {status:'idempotent'}
     *     and nothing else — `remise` appears only when something returned.
     * The marge is NOT re-signed on the replay: the re-add returns at her
     * ORIGINAL signed marge, which is what the new toast tells her.
     */
    const svc = service({ offers: [PV_A], curated: [] });
    const seen = new Set<string>(); // the listing DO's command-id memory
    const w = wire([
      (path, body) => {
        if (path !== '/listings') return null;
        const commandId = typeof body?.['commandId'] === 'string' ? (body['commandId'] as string) : '';
        const pid = typeof body?.['productVersionId'] === 'string' ? (body['productVersionId'] as string) : '';
        const replay = seen.has(commandId);
        seen.add(commandId);
        if (!replay) {
          if (!svc.state.curated.includes(pid)) svc.state.curated.push(pid);
          return { status: 200, json: { status: 'published' } };
        }
        if (!svc.state.curated.includes(pid)) {
          svc.state.curated.push(pid);
          return {
            status: 200,
            json: { status: 'idempotent', remise: true, storefront: storefront(svc.state.curated) as never },
          };
        }
        return { status: 200, json: { status: 'idempotent' } };
      },
      ...svc.routes,
    ]);
    const screen = await mountApp();

    // ── ADD — and the add lands her ON the vitrine, product visible ─────────
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();
    expect(screen.canPress('Retirer de ma vitrine'), 'the first add never reached her vitrine').toBe(true);

    // ── RETIRER — the card goes when the shop says so ───────────────────────
    await screen.press('Retirer de ma vitrine');
    await screen.settle();
    expect(screen.shows('Bazin riche'), 'the removed card stayed on screen').toBe(false);

    // ── RE-ADD — the déjà guard is off (the shop no longer holds it) ────────
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    expect(screen.canPress('Ajouter à ma vitrine'), 'a removed product must be addable again').toBe(true);
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();

    // THE ROOT CAUSE RODE THE WIRE: both publishes carried the SAME pinned
    // command id — the second was a replay, exactly what his phone sends.
    const pubs = w.calls.filter((c) => c.path === '/listings');
    expect(pubs).toHaveLength(2);
    expect(pubs[1]?.body?.['commandId']).toBe(pubs[0]?.body?.['commandId']);

    // ── THE VITRINE SHOWS THE PRODUCT AGAIN — his exact complaint ───────────
    expect(screen.canPress('Retirer de ma vitrine'), 'the removed product could never return').toBe(true);
    expect(screen.shows('Bazin riche'), 'the vitrine is the screen the add lands on, and it must hold the product').toBe(true);
    // …and the toast tells the truth: back, at the marge she signed before.
    expect(
      screen.shows('C’est de retour dans votre vitrine, à votre marge d’avant.'),
      'she must be told it CAME BACK, not that it « existed already »',
    ).toBe(true);
    expect(
      screen.shows('Ce produit était déjà dans votre vitrine. Votre marge n’a pas changé.'),
      'the « déjà » sentence over a product that just returned is his bug, verbatim',
    ).toBe(false);
    screen.unmount();
  });
});

describe('PAS-DE-BOUTIQUE — « Ajouter » refused storefront_absent must not dead-end her', () => {
  it("names the real next step instead of « réessayez » — and the empty vitrine HAS that door", async () => {
    /**
     * FOUNDER REPORT (2026-08-13, screenshot): « when adding a product on ma
     * vitrine from opportunites it is not working and it says l'envoi n'a pas
     * marcher ». The toast on his phone read, verbatim:
     * « L'envoi n'a pas marché — storefront_absent — réessayez »
     *
     * THREE THINGS WRONG IN ONE SENTENCE: a raw English token on a screen a
     * reseller reads (Law 6) · « réessayez » for a state where retrying can
     * NEVER work — the service refuses BY DESIGN until her boutique exists
     * (founder ruling 2026-08-11, « no boutique, no publication ») · and no
     * word about the actual next step, which is hers to take.
     *
     * AND THE NEXT STEP HAD NO DOOR: « Personnaliser ma boutique » lived only
     * on the NON-EMPTY vitrine branch — a reseller with no shop and no
     * products (exactly the person who gets this refusal) had no path to the
     * mise-en-ligne screen at all.
     *
     * CONTRACT-CERTIFIED: 409 {"error":"storefront_absent"} is the real
     * Worker's answer, pinned in checkout-do.e2e.test.ts:1705 and
     * combined-worker.e2e.test.ts:580.
     */
    const svc = service({ offers: [PV_A], curated: [] });
    const w = wire([
      // She has NO shop: the id read is a clean 404 and the admin list is empty.
      (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 404, json: { error: 'not_found' } } : null),
      (path) => (path === '/listings' ? { status: 409, json: { error: 'storefront_absent' } } : null),
      ...svc.routes,
    ]);
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();

    expect(w.calls.some((c) => c.path === '/listings'), 'the tap never reached the service').toBe(true);
    // The tree survived, and the raw token is NOWHERE a reseller can read.
    expect(screen.texts().join(' '), 'a wire token is not a sentence (Law 6)').not.toContain('storefront_absent');
    expect(
      screen.shows("L'envoi n'a pas marché — storefront_absent — réessayez") ||
        screen.shows('L’envoi n’a pas marché — storefront_absent — réessayez'),
      'she is told to retry the one thing that cannot work until her boutique exists',
    ).toBe(false);
    expect(
      screen.shows('Créez d’abord votre boutique : ouvrez Ma Vitrine, puis « Personnaliser ma boutique ».'),
      'the refusal must name HER next step',
    ).toBe(true);
    /**
     * AND IT OUTLIVES A TOAST (verifier MAJOR — the first cut put this
     * sentence in a toast that auto-clears in 2.6 s, so the sole carrier of
     * the recovery path died mid-read). Toasts live in the `toast` state and
     * every one of them expires; this sentence is the persistent note under
     * the CTA. Proven structurally: fire the toast timer to exhaustion and
     * the sentence is still on screen.
     */
    await new Promise((r) => setTimeout(r, 2_700));
    await screen.settle();
    expect(
      screen.shows('Créez d’abord votre boutique : ouvrez Ma Vitrine, puis « Personnaliser ma boutique ».'),
      'the recovery sentence died with a toast — she was mid-read',
    ).toBe(true);

    // …and the step must EXIST: her vitrine is empty, and the door is there.
    // (« Retour » first: the fiche has no tab bar, and the only « Ma Vitrine »
    // on it is the toast's own sentence — an inert Text the harness rightly
    // refuses to press.)
    await screen.press('Retour');
    await screen.press('Ma Vitrine');
    expect(
      screen.canPress('Personnaliser ma boutique'),
      'the empty vitrine offered no way to the mise-en-ligne screen — the instruction pointed at a door that was not there',
    ).toBe(true);
    await screen.press('Personnaliser ma boutique');
    /**
     * ASSERT SOMETHING ONLY PERSONNALISER RENDERS — the mise-en-ligne CTA
     * itself, which is the whole reason she was sent here. The first cut
     * asserted a product's ABSENCE, which the empty vitrine satisfies too:
     * the verifier's dead-button mutation (onPress → void 0) stayed green.
     * This is the same vacuity caught twice on the déjà slice; same cure.
     */
    expect(
      screen.shows('Mettre ma boutique en ligne'),
      'the door never left the empty vitrine — pressable and DEAD',
    ).toBe(true);
    screen.unmount();
  });
});

/**
 * ═══ PERSONNALISER — SECTIONS RETIRÉES + CADRAGE-PARITÉ (founder, 2026-08-13) ═══
 *
 * Two orders, walked: « remove 'Sections' from personnaliser » and « the photo
 * frame is cropping wrongly the photo ». The first is a UI removal whose
 * promise is that it is UI ONLY — the canon `sections` field stays, and a shop
 * already holding sections keeps rendering them for her clientes. The second
 * is crop MATH (COVER_FRAMES parity with the shipped buyer CSS), pinned
 * numerically in framing-math.test.ts; what a walk can add — within the
 * harness's stated bound, NO appearance claims — is that the sheet those specs
 * feed still mounts and its primary action still reaches the service.
 */
describe('PERSONNALISER — SECTIONS RETIRÉES + CADRAGE-PARITÉ, walked', () => {
  const COVER_URL = 'https://media.test/media/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  /** Her LIVE shop (getById 200) — one curated product, and per test a stored
   *  section grouping and/or a live cover. `/storefronts` stays `[]` (her shop
   *  is not in the admin list), so `liveSlug` is undefined and « Voir comme
   *  cliente » opens the K7 replica — the only cliente view walkable here. */
  function boutique(opts: { sections?: readonly unknown[]; cover?: Record<string, unknown> } = {}): Wire {
    return wire([
      (path) =>
        path === '/supply-projections'
          ? {
              status: 200,
              json: { offers: [offer(PV_A, 'Bazin riche')], diagnostic: { status: 'ok', refusals: [] } },
            }
          : null,
      // The identity save — recorded so a walk can assert WHAT rode the wire.
      (path) => (/^\/storefronts\/[^/]+\/identity$/.test(path) ? { status: 200, json: { status: 'saved' } } : null),
      (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
      (path) =>
        /^\/storefronts\/[^/]+$/.test(path)
          ? {
              status: 200,
              json: {
                ...storefront([PV_A]),
                sections: [...(opts.sections ?? [])],
                ...(opts.cover !== undefined ? { cover: opts.cover } : {}),
              } as never,
            }
          : null,
    ]);
  }

  async function ouvrirPersonnaliser(): Promise<Awaited<ReturnType<typeof mountApp>>> {
    const screen = await openVitrine();
    await screen.press('Personnaliser ma boutique');
    await screen.settle();
    return screen;
  }

  it('ENTETES-N — the four retired en-têtes are off the picker, and the picker still works', async () => {
    /**
     * FOUNDER, 2026-08-15: « cleanly remove the en-têtes Safran, chrome,
     * artisan and fil d'or ». « The key is not in the list » is a source scan,
     * and the standing order does not accept one for a screen: the grid is
     * BUILT from `PICKABLE_HEADER_STYLES`, and each card resolves TWO catalog
     * strings by key. `t()` THROWS on a missing string (`src/i18n.ts`), so a
     * key left in the picker after its strings are gone does not cost one tile
     * — it takes the whole Personnaliser screen down. Both halves of the
     * removal have to land together, and only driving the real grid proves it.
     */
    boutique();
    const screen = await ouvrirPersonnaliser();
    await screen.press('Thème');
    expect(screen.shows('EN-TÊTE DE BOUTIQUE'), 'the en-tête grid is on this screen').toBe(true);

    // 1. GONE — by the name the seller reads, not by the key.
    for (const nom of ['Safran', 'Chrome', 'Artisan', 'Fil d’or']) {
      expect(screen.texts().join(' | '), `« ${nom} » is still offered`).not.toContain(nom);
    }

    // 2. NOT A BLANK TILE IN THEIR PLACE. Every card the grid still draws
    // carries a real name — an empty one is what a missing catalog string
    // looks like, and it is the failure mode this walk exists for.
    const noms = ['Classique', 'Royale', 'Héritage', 'Chaleureux', 'Dynamique', 'Terracotta',
      'Étendard', 'Douceur', 'Tissage', 'Indigo', 'Grenat', 'Kraft', 'Audace', 'Fleurie',
      'Braise', 'Karité', 'Calebasse', 'Pagne', 'Bazin', 'Couverture', 'Billet', 'Enseigne',
      'Hologramme', 'Dentelle', 'Bougainvillier', 'Flamboyant', 'Hibiscus', 'Papillons', 'Guirlande'];
    const on = screen.texts().join(' | ');
    for (const nom of noms) {
      expect(on, `« ${nom} » vanished with the four — the removal took a neighbour`).toContain(nom);
    }

    // 3. THE SCREEN STILL WORKS: a surviving style is pressable and REACHES
    // the next step (its aperçu, with the one primary action).
    expect(screen.canPress('Bazin'), 'a surviving style must stay pressable').toBe(true);
    await screen.press('Bazin');
    expect(screen.shows('Appliquer cet en-tête'), 'the aperçu did not open on a surviving style').toBe(true);
    expect(screen.texts().length, 'the tree did not survive the tap').toBeGreaterThan(0);
    screen.unmount();
  });

  it('SECTIONS — the row is gone, and every remaining row still opens its screen', async () => {
    /**
     * FOUNDER ORDER: « remove 'Sections' from personnaliser ». The row must be
     * gone — and the rows that STAY must each still reach their screen, because
     * a removal that broke a neighbouring route would be a second bug shipped
     * under the first one's flag.
     */
    boutique();
    const screen = await ouvrirPersonnaliser();

    expect(screen.shows('Personnaliser'), 'K1 mounted').toBe(true);
    expect(screen.texts().join(' '), 'the Sections row must be gone').not.toContain('Sections');

    // Each named row REACHES its screen (something only that screen renders),
    // and « Retour » comes back — the tree survives the whole round. TWO
    // controls answer to « Retour » here: the App chrome's « ← Retour » chip
    // (render order 0) and the K screen's own back (1) — the walk presses the
    // K screen's, because that is the one the removal could have broken.
    await screen.press('Identité');
    expect(screen.shows('NOM DE LA BOUTIQUE'), 'K2 identité opened').toBe(true);
    await screen.press('Retour', 1);
    await screen.press('Couverture & portrait');
    expect(screen.shows('Ajouter une couverture'), 'K3 couverture opened').toBe(true);
    await screen.press('Retour', 1);
    await screen.press('Thème');
    expect(screen.shows('HABILLAGES FASO PREMIUM'), 'K4 thème opened').toBe(true);
    await screen.press('Retour', 1);
    await screen.press('À la une & ordre');
    expect(screen.shows('Bazin riche'), 'K5 à-la-une opened on her real article').toBe(true);
    await screen.press('Retour', 1);
    expect(screen.shows('Personnaliser'), 'back on K1 after the full round').toBe(true);
    screen.unmount();
  });

  it('PARITÉ CLIENTE — a shop already holding sections still renders them in the aperçu', async () => {
    /**
     * THE « UI ONLY » PROMISE, executed: the editor is gone, the DATA is not.
     * A shop grouped before 2026-08-13 keeps its grouping wherever the cliente
     * view shows it — here the K7 replica, which still groups by
     * `sf.sections` exactly as the buyer page does.
     */
    boutique({ sections: [{ id: 'sec-tissus', name: 'Tissus', pids: [PV_A] }] });
    const screen = await ouvrirPersonnaliser();
    expect(screen.texts().join(' '), 'no Sections editor row, even over a shop that has sections').not.toContain('Sections');

    await screen.press('Voir comme cliente');
    expect(screen.shows('Aperçu — vue cliente'), 'the cliente replica opened').toBe(true);
    expect(screen.shows('TISSUS'), 'her stored section still heads its group').toBe(true);
    expect(screen.shows('Bazin riche'), 'with her article inside it').toBe(true);
    screen.unmount();
  });

  it('PAS D’EFFACEMENT — an unrelated save leaves `sections` OFF the wire, so the service keeps hers', async () => {
    /**
     * THE HALF A SOURCE PIN CANNOT PROVE: the patch the app actually POSTS.
     * The service's law (storefront-core, proven against the demo adapter in
     * storefront-service.test.ts) is absent-means-untouched — so the ONE way
     * this app could still wipe her grouping is by SENDING the field. She
     * picks a theme; the ride-along patch must carry the theme and no
     * `sections` key at all.
     */
    const w = boutique({ sections: [{ id: 'sec-tissus', name: 'Tissus', pids: [PV_A] }] });
    const screen = await ouvrirPersonnaliser();
    await screen.press('Thème');
    await screen.press('Dan Fani');
    await screen.settle();

    const saves = w.calls.filter((c) => /\/identity$/.test(c.path) && c.method === 'POST');
    expect(saves.length, 'the theme tap never reached the service').toBeGreaterThanOrEqual(1);
    const patch = (saves[0]!.body?.['patch'] ?? {}) as Record<string, unknown>;
    expect(patch['theme'], 'the save she asked for rode').toBe('danfani');
    expect('sections' in patch, 'sections must be ABSENT — absent is untouched; [] would wipe').toBe(false);
    screen.unmount();
  });

  it('CADRAGE — « Ajuster le cadrage » still mounts the sheet, and « Enregistrer » reaches the service', async () => {
    /**
     * CADRAGE-PARITÉ is arithmetic (framing-math.test.ts pins the corrected
     * classique 165.6×280 br-26 and héritage 360×298 square to the digit); the
     * sheet consumes `frameSpecFor` directly, so no rendering change was
     * needed for the corrected specs to take effect. What this walk pins is
     * the ROAD: the sheet mounts on her live cover, and its primary action is
     * pressable AND wired — the save leaves the screen as `coverFocus` ALONE
     * (one save, one thing), never the six-field ride-along.
     */
    const w = boutique({ cover: { status: 'live', url: COVER_URL } });
    const screen = await ouvrirPersonnaliser();
    await screen.press('Couverture & portrait');
    await screen.settle();

    await screen.press('Ajuster le cadrage');
    await screen.settle();
    expect(screen.shows('Placez votre photo'), 'the framing sheet mounted').toBe(true);
    expect(screen.canPress('Enregistrer'), 'the primary action is present and live').toBe(true);

    await screen.press('Enregistrer');
    await screen.settle();
    const saves = w.calls.filter((c) => /\/identity$/.test(c.path) && c.method === 'POST');
    expect(saves.length, 'the save never reached the service').toBeGreaterThanOrEqual(1);
    const patch = (saves[0]!.body?.['patch'] ?? {}) as Record<string, unknown>;
    expect(patch['coverFocus'], 'her framing rode the wire').toBeDefined();
    expect(Object.keys(patch), 'one save, one thing — the focus rides ALONE').toEqual(['coverFocus']);
    screen.unmount();
  });
});
