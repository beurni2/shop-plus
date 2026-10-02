import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — EN-LIGNE-1: her app says when her shop is closed, and opens it ═══
 *
 * FOUNDER, 2026-10-02: « a boutique marked « Pas en ligne » still opens for
 * buyers … fix this » (canon 3.27.0 §4.1: a vitrine that is not en ligne is
 * closed to buyers; she sees the true state in her app and can put it back).
 * The service now closes such a shop; these walks hold HER side of it on the
 * mounted tree:
 *   1. a shop that is not en ligne carries NO « En ligne » mark — on the
 *      accueil and on Ma Vitrine — and the accueil says so, with the one way
 *      back: « Remettre ma boutique en ligne »;
 *   2. pressing it CALLS the service's publish door for HER shop, under her
 *      session, and the mark comes back once the service said yes;
 *   3. a refused publish keeps the card and its button — never a mark the
 *      service did not give;
 *   4. CONTROL: a shop that is en ligne shows the mark and no card.
 * The walk claims NOTHING about appearance.
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

const storefront = (discoverable: boolean, updatedAt = '2026-08-15T08:00:00.000Z') => ({
  id: SF_ID,
  resellerId: 'RS',
  slug: SLUG,
  discoverable,
  curatedItems: [PV],
  name: NOM,
  zone: 'Ouagadougou',
  category: 'mode',
  createdAt: '2026-08-15T08:00:00.000Z',
  updatedAt,
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

/** CONTRACT-CERTIFIED to `storefront-service`: the list rows carry the LIVE
 *  `discoverable`; publish is the service's toggle (`decideToggle`), answering
 *  `{status:'changed', storefront}` (driven on workerd by
 *  `services/storefront-service/test/en-ligne.e2e.test.ts`). */
function monde(enLigne: boolean, publication: 'oui' | 'refus' = 'oui'): Route[] {
  let ouverte = enLigne;
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: [offer()], diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) =>
      path === '/storefronts'
        ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: ouverte }] as never }
        : null,
    (path) => {
      if (path !== `/storefronts/${SF_ID}/publish`) return null;
      if (publication === 'refus') return { status: 503, json: { error: 'unavailable' } };
      ouverte = true;
      return { status: 200, json: { status: 'changed', storefront: storefront(true, '2026-10-02T08:00:00.000Z') } };
    },
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront(ouverte) as never } : null),
  ];
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

const CARTE = 'Votre boutique n’est pas en ligne';
const BOUTON = 'Remettre ma boutique en ligne';

describe('EN-LIGNE-1 — her app tells the truth about a closed shop, and opens it', () => {
  it('not en ligne: no « En ligne » mark on the accueil nor on Ma Vitrine; the accueil names it and offers the way back', async () => {
    wire(monde(false));
    const screen = await mountApp();
    await screen.settle();
    const lu = screen.texts().join(' | ');
    expect(lu, `her shop name still leads the header — on screen: ${lu.slice(0, 400)}`).toContain(NOM);
    expect(lu, 'a closed shop wears no « En ligne » mark').not.toContain('En ligne');
    expect(lu, 'the accueil says the shop is closed').toContain(CARTE);
    expect(screen.canPress(BOUTON), 'the way back is present AND pressable').toBe(true);
    const { IconCoche } = await import('../src/ui/icons');
    expect(screen.tree.root.findAllByType(IconCoche), 'no mark icon either').toHaveLength(0);

    await screen.press('Ma Vitrine', 0);
    await screen.settle();
    const vitrine = screen.texts().join(' | ');
    expect(vitrine, 'Ma Vitrine names her shop').toContain(NOM);
    expect(vitrine, 'Ma Vitrine wears no mark for a closed shop').not.toContain('En ligne');
    screen.unmount();
  });

  it('pressing « Remettre ma boutique en ligne » calls the publish door for HER shop; the mark comes back, the card goes', async () => {
    const w = wire(monde(false));
    const screen = await mountApp();
    await screen.settle();
    await screen.press(BOUTON);
    await screen.settle();
    await screen.settle();
    const pub = w.calls.filter((c) => c.path === `/storefronts/${SF_ID}/publish`);
    expect(pub, 'the publish door was CALLED, once').toHaveLength(1);
    expect(pub[0]!.method).toBe('POST');
    const lu = screen.texts().join(' | ');
    expect(lu, 'the tree survived and the mark is back').toContain('En ligne');
    expect(lu, 'the card is gone once the service said yes').not.toContain(CARTE);
    expect(screen.canPress(BOUTON)).toBe(false);
    expect(lu, 'she is told it worked').toContain('Votre boutique est en ligne.');
    screen.unmount();
  });

  it('a refused publish keeps the card and its button — never a mark the service did not give', async () => {
    const w = wire(monde(false, 'refus'));
    const screen = await mountApp();
    await screen.settle();
    await screen.press(BOUTON);
    await screen.settle();
    await screen.settle();
    expect(w.calls.filter((c) => c.path === `/storefronts/${SF_ID}/publish`)).toHaveLength(1);
    const lu = screen.texts().join(' | ');
    expect(lu, 'the card stays').toContain(CARTE);
    expect(screen.canPress(BOUTON), 'she can try again').toBe(true);
    expect(lu).not.toContain('Votre boutique est en ligne.');
    const { IconCoche } = await import('../src/ui/icons');
    expect(screen.tree.root.findAllByType(IconCoche)).toHaveLength(0);
    screen.unmount();
  });

  it('Personnaliser, where « Pas en ligne » is shown: the same way back sits under it, and the label turns once the service said yes', async () => {
    const w = wire(monde(false));
    const screen = await mountApp();
    await screen.settle();
    await screen.press('Ma Vitrine');
    await screen.settle();
    await screen.press('Personnaliser ma boutique');
    await screen.settle();
    expect(screen.shows('Pas en ligne'), 'the true state is shown').toBe(true);
    expect(screen.canPress(BOUTON), 'with the way back under it').toBe(true);
    await screen.press(BOUTON);
    await screen.settle();
    await screen.settle();
    expect(w.calls.filter((c) => c.path === `/storefronts/${SF_ID}/publish`)).toHaveLength(1);
    expect(screen.shows('Pas en ligne'), 'the label turned').toBe(false);
    expect(screen.texts().join(' | ')).toContain('En ligne');
    expect(screen.canPress(BOUTON)).toBe(false);
    screen.unmount();
  });

  it('her FIRST « Mettre ma boutique en ligne »: once the service put it online, Personnaliser says so — never « Pas en ligne », never the way back (verifier m1)', async () => {
    let creee = false;
    let ouverte = false;
    const w = wire([
      (path) =>
        path === '/supply-projections'
          ? { status: 200, json: { offers: [offer()], diagnostic: { status: 'ok', refusals: [] } } }
          : null,
      (path, body) => {
        if (path !== '/storefronts') return null;
        if (body !== null) {
          creee = true;
          // The create answers the shop as created: not yet online (decideCreate).
          return { status: 200, json: { status: 'created', storefront: storefront(false, '2026-10-02T08:00:00.000Z') } };
        }
        return { status: 200, json: (creee ? [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: ouverte }] : []) as never };
      },
      (path) => {
        if (!/^\/storefronts\/[^/]+\/publish$/.test(path)) return null;
        ouverte = true;
        return { status: 200, json: { status: 'changed', storefront: storefront(true, '2026-10-02T08:00:01.000Z') } };
      },
      (path) =>
        /^\/storefronts\/[^/]+$/.test(path)
          ? creee ? { status: 200, json: storefront(ouverte, '2026-10-02T08:00:01.000Z') as never } : { status: 404, json: { error: 'not_found' } }
          : null,
    ]);
    const screen = await mountApp();
    await screen.settle();
    await screen.press('Ma Vitrine', 1);
    await screen.settle();
    await screen.press('Personnaliser ma boutique');
    await screen.settle();
    await screen.press('Identité');
    await screen.settle();
    await screen.type(NOM, 'NOM DE LA BOUTIQUE');
    await screen.type('Ouagadougou', 'QUARTIER');
    await screen.press('Enregistrer');
    await screen.settle();
    await screen.press('Mettre ma boutique en ligne');
    await screen.settle();
    await screen.settle();
    expect(w.calls.filter((c) => /\/publish$/.test(c.path)), 'the publish went out').toHaveLength(1);
    expect(screen.shows('Pas en ligne'), `on screen: ${JSON.stringify(screen.texts().slice(0, 20))}`).toBe(false);
    expect(screen.canPress(BOUTON), 'no way back offered for a shop that is online').toBe(false);
    screen.unmount();
  });

  it('taken offline while her app is open (the founder, or her other phone): the next read of her shop takes the mark down everywhere and offers the way back (verifier m2)', async () => {
    let ouverte = true;
    wire([
      (path) =>
        path === '/supply-projections'
          ? { status: 200, json: { offers: [offer()], diagnostic: { status: 'ok', refusals: [] } } }
          : null,
      (path) => (path === '/storefronts' ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: ouverte }] as never } : null),
      (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront(ouverte, ouverte ? '2026-08-15T08:00:00.000Z' : '2026-10-02T09:00:00.000Z') as never } : null),
    ]);
    const screen = await mountApp();
    await screen.settle();
    expect(screen.texts().join(' | ')).toContain('En ligne');
    ouverte = false; // unpublished elsewhere, mid-session
    await screen.press('Ma Vitrine', 0);
    await screen.settle();
    await screen.settle();
    expect(screen.texts().join(' | '), 'Ma Vitrine re-read her shop: no mark').not.toContain('En ligne');
    await screen.press('Accueil');
    await screen.settle();
    const lu = screen.texts().join(' | ');
    expect(lu, 'the accueil agrees').not.toContain('En ligne');
    expect(lu).toContain(CARTE);
    expect(screen.canPress(BOUTON)).toBe(true);
    screen.unmount();
  });

  it('CONTROL — a shop en ligne wears the mark and shows no card', async () => {
    wire(monde(true));
    const screen = await mountApp();
    await screen.settle();
    const lu = screen.texts().join(' | ');
    expect(lu).toContain('En ligne');
    expect(lu).not.toContain(CARTE);
    expect(screen.canPress(BOUTON)).toBe(false);
    screen.unmount();
  });
});
