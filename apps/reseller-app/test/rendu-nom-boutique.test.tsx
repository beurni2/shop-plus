import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — NOM-BOUTIQUE-1 (SP5.2): the store-name moderation reaches HER ═══
 *
 * The service judges a shop's name on both doors (create and rename) and
 * answers a NAMED 422 `{status:'refused', reason}` — the e2e in
 * services/storefront-service pins that side. These walks prove the app's half
 * on the MOUNTED screen: the refusal becomes a sentence she can read, on the
 * rename road (K2 « Enregistrer » over a live shop) and on the create road
 * (« Mettre ma boutique en ligne » on a first-run shop), and each time she is
 * left a way out. Only `fetch` is faked; the routes are CONTRACT-CERTIFIED to
 * `worker/storefront-do.ts` (the by-id read answers the canon Storefront, the
 * identity and create doors answer the 422 shape above).
 */

const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const NOM = 'Boutique test';

const storefront = () => ({
  id: SF_ID,
  resellerId: 'RS',
  slug: SLUG,
  discoverable: true,
  curatedItems: [],
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

const supply: Route = (path) =>
  path === '/supply-projections'
    ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
    : null;

const PHRASE_PLATEFORME = 'Ce nom fait penser à Shop+ ou à Séra. Choisissez un nom à vous.';
const PHRASE_CONTACT = 'Pas de numéro ni de lien dans le nom. Vos clientes ont déjà votre lien.';

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

describe('NOM-BOUTIQUE-1 — a refused name is a sentence on her screen, never a mute save', () => {
  it('RENAME: the service refuses « Shop+ Officiel » by name → the sentence shows, the rename really left the phone, and she keeps a way out', async () => {
    const fils = wire([
      supply,
      (path, body) =>
        path === '/storefronts' && body === null
          ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: true }] as never }
          : null,
      (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
      (path, body) =>
        /^\/storefronts\/[^/]+\/identity$/.test(path) && body !== null
          ? { status: 422, json: { status: 'refused', reason: 'name_impersonates_platform' } }
          : null,
    ]);
    const screen = await mountApp();
    await screen.settle();
    await screen.press('Ma Vitrine');
    await screen.settle();
    await screen.press('Personnaliser ma boutique');
    await screen.settle();
    await screen.press('Identité');
    await screen.settle();
    await screen.type('Shop+ Officiel', 'NOM DE LA BOUTIQUE');
    await screen.press('Enregistrer');
    await screen.settle();

    // The app never judges the name alone: the rename REACHED the authority…
    const envoye = fils.calls.find((c) => /\/identity$/.test(c.path) && c.method === 'POST');
    expect(envoye, 'the rename never left the phone').toBeDefined();
    expect(String((envoye!.body as { patch?: { name?: string } }).patch?.name)).toBe('Shop+ Officiel');
    // …and its NAMED refusal is the sentence she reads, not « une erreur ».
    expect(screen.shows(PHRASE_PLATEFORME), `on screen: ${JSON.stringify(screen.texts().slice(0, 30))}`).toBe(true);
    expect(screen.texts().length, 'the tree died on the refusal').toBeGreaterThan(0);
    // A way out exists: she can save again from the form, or is back on the stack.
    expect(screen.canPress('Enregistrer') || screen.canPress('Identité'), 'no way out after the refusal').toBe(true);
    screen.unmount();
  });

  it('CREATE: the service refuses « Fati 70 12 34 56 » by name → the sentence shows, no publish follows, and « Mettre ma boutique en ligne » stays pressable', async () => {
    const fils = wire([
      supply,
      (path, body) =>
        path === '/storefronts' && body !== null
          ? { status: 422, json: { status: 'refused', reason: 'name_carries_contact' } }
          : null,
      (path, body) => (path === '/storefronts' && body === null ? { status: 200, json: [] as never } : null),
      (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 404, json: { error: 'not_found' } } : null),
    ]);
    const screen = await mountApp();
    await screen.settle();
    expect(screen.shows('Créez votre boutique dans « Ma Vitrine ».'), 'the walk must START from the honest absence').toBe(true);
    // PROFIL-REVENDEUR-1: two controls answer to this label in this state; the dock tab renders second.
    await screen.press('Ma Vitrine', 1);
    await screen.settle();
    await screen.press('Personnaliser ma boutique');
    await screen.settle();
    await screen.press('Identité');
    await screen.settle();
    await screen.type('Fati 70 12 34 56', 'NOM DE LA BOUTIQUE');
    await screen.type('Ouagadougou', 'QUARTIER');
    await screen.press('Enregistrer');
    await screen.settle();
    await screen.press('Mettre ma boutique en ligne');
    await screen.settle();

    const creates = fils.calls.filter((c) => c.path === '/storefronts' && c.method === 'POST');
    expect(creates, 'the create never left the phone').toHaveLength(1);
    expect(String((creates[0]!.body as Record<string, unknown>)['name'])).toBe('Fati 70 12 34 56');
    expect(
      fils.calls.some((c) => /\/publish$/.test(c.path)),
      'a refused create must never be followed by a publish',
    ).toBe(false);
    expect(screen.shows(PHRASE_CONTACT), `on screen: ${JSON.stringify(screen.texts().slice(0, 30))}`).toBe(true);
    expect(screen.shows('En ligne :'), 'a refused create must never toast « En ligne »').toBe(false);
    expect(screen.canPress('Mettre ma boutique en ligne'), 'the way out: she fixes the name and tries again').toBe(true);
    screen.unmount();
  });
});
