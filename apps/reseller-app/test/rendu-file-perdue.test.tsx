import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/** The double as the App will get it: imported AFTER the reset, so it is the same instance. */
const appareil = () => import('./doubles/expo-file-system');

/**
 * ═══ HER WAITING LIST COULD NOT BE READ — MA VITRINE SAYS SO, ONCE, CALMLY ═══
 *
 * A phone that died mid-write (or a file from somewhere else) leaves bytes
 * the outbox cannot read. Before: the list opened empty and nothing was said,
 * so an add she made with no network was simply gone. Now: the bytes are
 * kept aside, a fresh list opens, and Ma Vitrine tells her in one sentence,
 * with a way to close it — and she can go on working.
 *
 * Driven on the REAL App, only `globalThis.fetch` faked and the network cut
 * by a switch around it (a thrown fetch, as RN's client throws). The device
 * state is seeded in the expo-file-system double's map before the mount, as
 * a cold boot finds it. The four questions: the tree survives the boot and
 * the tap; the sentence and its one act are there and pressable; nothing
 * fires by itself here; she reaches the next step (a product that waits).
 *
 * NEVER CLAIMED: anything about appearance.
 */

const PV = 'pv-bazin';
const LISTE = 'file:///rendu/file-attente.v1.json';
const MOITIE = '{"version":1,"entries":[{"name":"listing.publish","pid":"pv-x","payl';
const PERDUE = 'Votre liste d’envois en attente n’a pas pu être relue sur ce téléphone.';

const offer = {
  productVersionId: PV, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000, available: 5,
  productName: 'Bazin riche', assetRefs: [] as string[], category: 'mode',
};
const storefront = {
  id: 'SF', resellerId: 'RS', slug: 'boutique-0001', discoverable: true, curatedItems: [] as string[],
  name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
  createdAt: '2026-09-12T08:00:00.000Z', updatedAt: '2026-09-12T08:00:00.000Z',
  tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
  sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
};
const routes: Route[] = [
  (path) => (path === '/supply-projections' ? { status: 200, json: { offers: [offer], diagnostic: { status: 'ok', refusals: [] } } } : null),
  (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
  (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront as never } : null),
  (path) => (/^\/listings\/by-pid\//.test(path) ? { status: 404, json: { error: 'not_found' } } : null),
];

/** « No network » for every path, as when the signal goes. */
function reseau(): { mort: boolean } {
  const etat = { mort: false };
  const fil = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit): Promise<Response> => {
    if (etat.mort) throw new TypeError('Network request failed');
    return fil(input, init);
  }) as typeof fetch;
  return etat;
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('P6 — her waiting list could not be read', () => {
  it('Ma Vitrine says it once, she closes it, and she can add a product that then waits; the next boot is quiet', async () => {
    const { fichierBrut, fichiersSous, poserFichier } = await appareil();
    poserFichier(LISTE, MOITIE);
    wire(routes);
    const net = reseau();
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    expect(screen.shows(PERDUE), 'the loss is said on Ma Vitrine').toBe(true);
    expect(screen.canPress('Compris'), 'with its one act').toBe(true);
    // the damaged bytes were kept, never deleted
    const kept = fichiersSous(`${LISTE}.perdu-`);
    expect(kept).toHaveLength(1);
    expect(fichierBrut(kept[0]!)).toBe(MOITIE);

    await screen.press('Compris');
    expect(screen.shows(PERDUE), 'closed, it stays closed').toBe(false);

    // she goes on working: an add with no network now WAITS on a fresh list
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    net.mort = true;
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();
    await screen.settle();
    expect(screen.shows('En attente d’envoi'), 'the add waits').toBe(true);
    expect(screen.shows(PERDUE), 'and the sentence does not come back').toBe(false);
    screen.unmount();

    // COLD BOOT over the same device, still no network: the list reads,
    // nothing is said, and her kept add is counted (the feed is not on the
    // phone, so the banner carries it — the bound rendu-file-attente states).
    const second = await mountApp();
    await second.press('Ma Vitrine');
    await second.settle();
    expect(second.shows(PERDUE)).toBe(false);
    expect(second.shows('1 envoi attend sur votre téléphone.'), 'her waiting add survived the reboot').toBe(true);
    expect(fichiersSous(`${LISTE}.perdu-`), 'nothing kept twice').toHaveLength(1);
  }, 20_000);

  it('the bytes cannot even be kept aside: she is told the same sentence, nothing is overwritten, and an add with no network is said as NOT kept', async () => {
    const { fichierBrut, planterApres, poserFichier } = await appareil();
    poserFichier(LISTE, MOITIE);
    planterApres({ acte: 'write', cle: /\.perdu-/ });
    wire(routes);
    const net = reseau();
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    expect(screen.shows(PERDUE)).toBe(true);
    expect(fichierBrut(LISTE), 'the damaged file is left as it was').toBe(MOITIE);

    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    net.mort = true;
    await screen.press('Ajouter à ma vitrine');
    await screen.settle();
    await screen.settle();
    // today's road with no list: nothing is claimed as kept
    expect(screen.shows('L’ajout de Bazin riche est gardé sur votre téléphone.'), 'never claimed as kept').toBe(false);
    expect(screen.shows('En attente d’envoi')).toBe(false);
    expect(screen.canPress('Ajouter à ma vitrine'), 'the tree survived and she can try again').toBe(true);
    expect(fichierBrut(LISTE)).toBe(MOITIE);
  }, 20_000);
});
