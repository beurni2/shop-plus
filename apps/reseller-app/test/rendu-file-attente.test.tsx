import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-test-renderer';
import { mountApp, wire, wiredEnv, type Route, type Wire } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ FILE-ATTENTE-1 (AUDIT-SHOP-2 F-17b) — MA VITRINE WITH NO NETWORK, DRIVEN ═══
 *
 * The audit measured the old road on the mounted App (walk D2): `/listings`
 * throws → one toast, no second POST, ever. The intent died with the toast,
 * and D17 (« every queued action survives app-kill AND device reboot ») had
 * nothing to measure. These walks drive the new road on the REAL App with
 * ONLY `globalThis.fetch` faked — and the network cut by a switch AROUND the
 * fake, so « no network » is a thrown fetch, exactly what RN's client throws
 * — and the four questions of the standing order:
 *   · did the tree survive the tap with no network;
 *   · is the waiting card there, saying so, with its one act pressable;
 *   · does the act that fires by itself (the replay) leave a way out (Annuler)
 *     and a way in (Envoyer maintenant);
 *   · does she reach the next step — the product LIVE on her vitrine once the
 *     network is back, through the same port a tap uses, with the shop
 *     re-read from the service.
 *
 * REBOOT is walked for real: the outbox lives in the expo-file-system double's
 * map, which survives an unmount; a second `mountApp()` over it is a cold
 * boot of the whole tree reading the file the first one wrote.
 *
 * NEVER CLAIMED: anything about appearance (the chip's colour, the banner's
 * ground) — the double lays out nothing.
 */

const PV_A = 'pv-bazin';
const PV_B = 'pv-sac';
const NAMES: Record<string, string> = { [PV_A]: 'Bazin riche', [PV_B]: 'Sac en cuir' };

const offer = (pv: string) => ({
  productVersionId: pv,
  offerVersion: 'ov-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  productName: NAMES[pv] ?? pv,
  assetRefs: [] as string[],
  category: 'mode',
});

function storefront(curated: readonly string[]) {
  return {
    id: 'SF', resellerId: 'RS', slug: 'boutique-0001', discoverable: true, curatedItems: [...curated],
    name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
    createdAt: '2026-09-12T08:00:00.000Z', updatedAt: '2026-09-12T08:00:00.000Z',
    tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
    sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  };
}

/**
 * THE FAKE SERVICE HOLDS STATE and is CONTRACT-CERTIFIED to the real Worker
 * (`republish-idempotent.e2e`, `vitrine-retrait.e2e`, and this slice's own
 * `file-attente.e2e` against workerd): a first publish of a command id →
 * `200 {status:'published'}` and the membership appended; a replayed id →
 * `200 {status:'idempotent'}`; a refused marge → `422 {error:'markup_over_cap'}`;
 * a removal → `200 {status:'removed', storefront}` carrying the post-removal
 * shop. Never kinder than the service.
 */
function service(opts: { offers: readonly string[]; curated: readonly string[]; refuserMarge?: boolean }): {
  routes: Route[];
  state: { curated: string[]; publishes: { pid: string; markup: number }[]; removeCalls: number };
} {
  const state = { curated: [...opts.curated], publishes: [] as { pid: string; markup: number }[], removeCalls: 0 };
  const seen = new Set<string>();
  const routes: Route[] = [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: opts.offers.map(offer), diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path, body) => {
      if (path !== '/listings') return null;
      const pid = typeof body?.['productVersionId'] === 'string' ? (body['productVersionId'] as string) : '';
      const markup = typeof body?.['markup'] === 'number' ? (body['markup'] as number) : NaN;
      const commandId = typeof body?.['commandId'] === 'string' ? (body['commandId'] as string) : '';
      state.publishes.push({ pid, markup });
      if (opts.refuserMarge === true) return { status: 422, json: { error: 'markup_over_cap' } };
      const replay = seen.has(commandId);
      seen.add(commandId);
      if (!state.curated.includes(pid)) state.curated.push(pid);
      return { status: 200, json: { status: replay ? 'idempotent' : 'published' } };
    },
    (path, body) => {
      if (!/^\/storefronts\/[^/]+\/items\/remove$/.test(path)) return null;
      state.removeCalls += 1;
      const pid = typeof body?.['pid'] === 'string' ? (body['pid'] as string) : '';
      const present = state.curated.includes(pid);
      state.curated = state.curated.filter((p) => p !== pid);
      return { status: 200, json: { status: present ? 'removed' : 'not_present', storefront: storefront(state.curated) as never } };
    },
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront(state.curated) as never } : null),
    // the signed-price read (PRIX-SIGNE-1) — no listing here, an honest 404
    (path) => (/^\/listings\/by-pid\//.test(path) ? { status: 404, json: { error: 'not_found' } } : null),
  ];
  return { routes, state };
}

/**
 * THE NETWORK SWITCH — wraps the wire so that « no network » is a THROWN
 * fetch (RN's `TypeError: Network request failed`), for EVERY path: the
 * supply feed, the shop read and the writes all die together, as they do
 * when the signal goes. `tentatives` counts the calls the dead network ate,
 * which the wire cannot see.
 */
function reseau(): { mort: boolean; tentatives: string[] } {
  const etat = { mort: false, tentatives: [] as string[] };
  const fil = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit): Promise<Response> => {
    if (etat.mort) {
      etat.tentatives.push(new URL(input, 'http://shop.test').pathname);
      throw new TypeError('Network request failed');
    }
    return fil(input, init);
  }) as typeof fetch;
  return etat;
}

/** A replay is a chain of awaited wire calls and file writes; let it run out. */
async function laisserPasser(screen: Awaited<ReturnType<typeof mountApp>>): Promise<void> {
  for (let i = 0; i < 8; i++) await screen.settle();
}

/** Bring the app back to the front — the OS signal the outbox listens for.
 *  The double is imported AFTER the mount so it is the instance the App got
 *  (each walk resets the module graph). */
async function retourAuPremierPlan(screen: Awaited<ReturnType<typeof mountApp>>): Promise<void> {
  const { AppState } = await import('./doubles/react-native');
  await act(async () => {
    AppState.simuler('active');
  });
  await laisserPasser(screen);
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

describe('FILE-ATTENTE-1 — « Ajouter à ma vitrine » with no network is KEPT, shown as waiting, and lands when the network returns', () => {
  it('kept on the tap, waiting on Ma Vitrine and on the fiche, sent by her own tap once the network is back — through the same port, the shop re-read', async () => {
    const svc = service({ offers: [PV_A, PV_B], curated: [] });
    const w: Wire = wire(svc.routes);
    const net = reseau();
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');

    // ── THE SIGNAL GOES, and she taps ───────────────────────────────────────
    net.mort = true;
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();
    await screen.settle();
    expect(net.tentatives.filter((p) => p === '/listings'), 'the tap DID try the wire once').toHaveLength(1);
    expect(svc.state.publishes, 'nothing reached the service').toEqual([]);
    // the tree survived, she was told the truth, and she is on Ma Vitrine
    expect(screen.shows('L’ajout de Bazin riche est gardé sur votre téléphone.')).toBe(true);
    expect(screen.shows('Bazin riche'), 'the waiting card is on her vitrine').toBe(true);
    expect(screen.shows('En attente d’envoi'), 'and it SAYS it waits').toBe(true);
    expect(screen.shows('1 envoi attend le réseau.'), 'the banner counts it').toBe(true);
    // QUEUED IS PENDING, NEVER DONE: no share, no « Retirer », the way out instead
    expect(screen.canPress('Annuler l’ajout')).toBe(true);
    expect(screen.canPress('Retirer de ma vitrine')).toBe(false);
    expect(screen.texts().join(' ')).not.toContain('Partager');
    expect(screen.shows('C’est ajouté à votre vitrine.'), 'no success was invented').toBe(false);

    // ── THE FICHE SAYS THE SAME TRUE THING, and offers no second add ────────
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    expect(screen.shows('Cet ajout attend le réseau. Vous le verrez dans Ma vitrine.')).toBe(true);
    expect(screen.canPress('Ajouter à ma vitrine')).toBe(false);
    expect(screen.canPress('Voir dans ma vitrine')).toBe(true);
    await screen.press('Voir dans ma vitrine');

    // ── THE NETWORK RETURNS, she sends it herself ───────────────────────────
    net.mort = false;
    const lecturesAvant = w.calls.filter((c) => /^\/storefronts\/[^/]+$/.test(c.path)).length;
    expect(screen.canPress('Envoyer maintenant')).toBe(true);
    await screen.press('Envoyer maintenant');
    await laisserPasser(screen);
    // THE PORT WAS CALLED — the SAME `/listings` write a tap makes, with the
    // marge she read, and the service holds the product now.
    const pubs = w.calls.filter((c) => c.path === '/listings');
    expect(pubs).toHaveLength(1);
    expect(pubs[0]?.body?.['productVersionId']).toBe(PV_A);
    expect(pubs[0]?.body?.['markup']).toBe(0);
    expect(pubs[0]?.body?.['commandId'], 'the wire’s own derived command id — a replay is idempotent on the service').toMatch(/^publish-lst-.+-pv-bazin$/);
    expect(svc.state.curated).toEqual([PV_A]);
    // the shop was READ BACK after the pass, not believed from the answer
    const lectures = w.calls.filter((c) => /^\/storefronts\/[^/]+$/.test(c.path)).length;
    expect(lectures, 'a re-read followed the delivered pass').toBeGreaterThan(lecturesAvant);
    // …and the card is the shop's word now: no chip, the real controls back
    expect(screen.shows('Envoyé. Votre vitrine est à jour.')).toBe(true);
    expect(screen.shows('En attente d’envoi')).toBe(false);
    expect(screen.shows('1 envoi attend le réseau.')).toBe(false);
    expect(screen.canPress('Retirer de ma vitrine')).toBe(true);
    expect(screen.canPress('Partager')).toBe(true);
    screen.unmount();
  }, 20_000);

  it('D17 — REBOOT: the app is killed with the add waiting; on a cold boot the card is STILL waiting, and the return to the front sends it', async () => {
    const svc = service({ offers: [PV_A], curated: [] });
    const w = wire(svc.routes);
    const net = reseau();
    const premier = await mountApp();
    await premier.press('Opportunités');
    await premier.press('Bazin riche');
    net.mort = true;
    await premier.press('Ajouter à ma vitrine');
    await premier.settle();
    expect(premier.shows('En attente d’envoi')).toBe(true);
    // ── THE OS KILLS THE APP. Only the file on the phone survives. ─────────
    premier.unmount();

    // ── COLD BOOT, still no network: the kept intent is THERE and SAID, no
    //    success invented. BOUND, stated: the product FEED is not on the phone
    //    (no offline cache of offers exists in this app — F-18's family, open),
    //    so with no network at boot there is no offer to draw the card from;
    //    what she sees is the banner counting her kept send over the honest
    //    empty state. The intent itself is the thing D17 protects, and it is
    //    the file that survived.
    const second = await mountApp();
    await second.press('Ma Vitrine');
    await second.settle();
    expect(second.shows('1 envoi attend le réseau.'), 'the kept intent survived the kill').toBe(true);
    expect(second.shows('C’est ajouté à votre vitrine.'), 'no success invented over the reboot').toBe(false);
    expect(svc.state.publishes, 'the launch replay tried nothing while the network was dead').toEqual([]);

    // ── SHE UNLOCKS THE PHONE WITH SIGNAL: the foreground signal replays ───
    net.mort = false;
    await retourAuPremierPlan(second);
    expect(w.calls.filter((c) => c.path === '/listings'), 'the kept send went out on the return to the front').toHaveLength(1);
    expect(svc.state.curated).toEqual([PV_A]);
    expect(second.shows('1 envoi attend le réseau.')).toBe(false);
    // the feed re-reads when she opens a product screen (its own law); the
    // product is then hers on Ma Vitrine, with its real control and no chip
    await second.press('Opportunités');
    await second.press('Ma Vitrine');
    await laisserPasser(second);
    expect(second.shows('Bazin riche')).toBe(true);
    expect(second.shows('En attente d’envoi')).toBe(false);
    expect(second.canPress('Retirer de ma vitrine')).toBe(true);
    second.unmount();
  }, 20_000);

  it('the marge she moves on a WAITING card is the marge the replay signs', async () => {
    const svc = service({ offers: [PV_A], curated: [] });
    const w = wire(svc.routes);
    const net = reseau();
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    net.mort = true;
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();
    expect(screen.shows('En attente d’envoi')).toBe(true);
    // ONE waiting card ⇒ ONE markup field on screen; she moves it
    await screen.type('500');
    await screen.settle();
    net.mort = false;
    await screen.press('Envoyer maintenant');
    await laisserPasser(screen);
    const pubs = w.calls.filter((c) => c.path === '/listings');
    expect(pubs).toHaveLength(1);
    expect(pubs[0]?.body?.['markup'], 'the kept intent followed the control').toBe(500);
    screen.unmount();
  }, 20_000);

  it('« Annuler l’ajout » is the way out: the card goes, nothing is ever sent, and she is told', async () => {
    const svc = service({ offers: [PV_A], curated: [] });
    const w = wire(svc.routes);
    const net = reseau();
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    net.mort = true;
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();
    await screen.press('Annuler l’ajout');
    await screen.settle();
    expect(screen.shows('Annulé. Rien n’a été envoyé.')).toBe(true);
    expect(screen.shows('Bazin riche'), 'the card left with the intent').toBe(false);
    net.mort = false;
    await retourAuPremierPlan(screen);
    expect(w.calls.filter((c) => c.path === '/listings'), 'a cancelled intent never sends').toHaveLength(0);
    expect(svc.state.curated).toEqual([]);
    screen.unmount();
  }, 20_000);

  it('a replay the SERVICE refuses is named in the banner with the true sentence, the card is gone, and « Retirer de la liste » closes it', async () => {
    const svc = service({ offers: [PV_A], curated: [], refuserMarge: true });
    wire(svc.routes);
    const net = reseau();
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    net.mort = true;
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();
    net.mort = false;
    await screen.press('Envoyer maintenant');
    await laisserPasser(screen);
    expect(svc.state.publishes).toHaveLength(1);
    // the refusal is a DECISION: not pending any more, named, with the sentence a tap would earn
    expect(screen.shows('N’a pas pu partir')).toBe(true);
    expect(screen.shows('Ce montant dépasse le plafond. Baissez ce que vous ajoutez et réessayez.')).toBe(true);
    expect(screen.shows('En attente d’envoi'), 'a refused intent is not « waiting »').toBe(false);
    expect(screen.canPress('Retirer de ma vitrine'), 'the product never entered her shop').toBe(false);
    expect(screen.shows('markup_over_cap'), 'never the wire token').toBe(false);
    await screen.press('Retirer de la liste');
    await screen.settle();
    expect(screen.shows('N’a pas pu partir')).toBe(false);
    screen.unmount();
  }, 20_000);

  it('the timer: while something waits, the outbox tries again by itself every half minute', async () => {
    const svc = service({ offers: [PV_A], curated: [] });
    const w = wire(svc.routes);
    const net = reseau();
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    net.mort = true;
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();
    expect(screen.shows('En attente d’envoi')).toBe(true);
    net.mort = false;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await laisserPasser(screen);
    expect(w.calls.filter((c) => c.path === '/listings'), 'the half-minute tick replayed').toHaveLength(1);
    expect(svc.state.curated).toEqual([PV_A]);
    screen.unmount();
  }, 20_000);
});

describe('FILE-ATTENTE-1 — « Retirer de ma vitrine » with no network is KEPT and the product stays until the service says it is gone', () => {
  it('the card stays with « Retrait en attente » and its way out; the return to the front removes it for real', async () => {
    const svc = service({ offers: [PV_A, PV_B], curated: [PV_A, PV_B] });
    wire(svc.routes);
    const net = reseau();
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await screen.settle();
    expect(screen.shows('Bazin riche')).toBe(true);
    net.mort = true;
    await screen.press('Retirer de ma vitrine', 0);
    await screen.settle();
    await screen.settle();
    expect(net.tentatives.some((p) => p.endsWith('/items/remove')), 'the tap DID try the wire').toBe(true);
    expect(svc.state.removeCalls).toBe(0);
    // NOT REMOVED YET, and the card says so — a card that vanished on a kept
    // intent would be the fabricated-success shape this project refuses
    expect(screen.shows('Le retrait de Bazin riche est gardé sur votre téléphone.')).toBe(true);
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Retrait en attente')).toBe(true);
    expect(screen.canPress('Annuler le retrait')).toBe(true);
    // the OTHER card keeps its real control; the waiting one has none
    expect(screen.canPress('Retirer de ma vitrine')).toBe(true);
    expect(screen.shows('Retiré de votre boutique.'), 'no success was invented').toBe(false);

    net.mort = false;
    await retourAuPremierPlan(screen);
    expect(svc.state.removeCalls).toBe(1);
    expect(svc.state.curated).toEqual([PV_B]);
    expect(screen.shows('Bazin riche'), 'gone once the service said so').toBe(false);
    expect(screen.shows('Sac en cuir')).toBe(true);
    expect(screen.shows('Retrait en attente')).toBe(false);
    screen.unmount();
  }, 20_000);

  it('« Ajouter » then « Retirer » on the same product, both offline: ONE intent waits — her last word — and « Annuler le retrait » restores the add', async () => {
    const svc = service({ offers: [PV_A], curated: [] });
    const w = wire(svc.routes);
    const net = reseau();
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    net.mort = true;
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();
    expect(screen.shows('En attente d’envoi')).toBe(true);
    // she changes her mind: the waiting add is cancelled (the one act the card offers)
    await screen.press('Annuler l’ajout');
    await screen.settle();
    expect(screen.shows('Bazin riche')).toBe(false);
    net.mort = false;
    await retourAuPremierPlan(screen);
    expect(w.calls.filter((c) => c.path === '/listings')).toHaveLength(0);
    expect(svc.state.curated).toEqual([]);
    screen.unmount();
  }, 20_000);
});
