import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — RAYONS-REVENDEUR-1 (founder, 2026-08-23: « during reseller
 * registration the option for him to choose up to 5 categories products he
 * wants to resell and show those categories and products only on his
 * opportunités screen ») ═══
 *
 * Two roads, both driven on the mounted App:
 *   · THE ENTRANCE (gate armed): the picker offers the LIVE feed's rayons,
 *     caps at five with a spoken sentence (never a dead tap), and the signup
 *     POST carries exactly what she chose. She reaches the admission step.
 *   · OPPORTUNITÉS (gate disarmed, compte on disk): her selection narrows
 *     the whole screen — products outside her rayons never render, the chips
 *     row is HER rayons only, and a compte with no choice sees everything.
 */

const CAT = { A: 'Mode femme', B: 'Sacs', C: 'Poussette', D: 'Chaussures', E: 'Vase', F: 'Coiffeuse' } as const;
const FEED: readonly { pv: string; nom: string; cat: string }[] = [
  { pv: 'pv-af', nom: 'Bazin riche', cat: CAT.A },
  { pv: 'pv-bf', nom: 'Sac en cuir', cat: CAT.B },
  { pv: 'pv-cf', nom: 'Poussette double', cat: CAT.C },
  { pv: 'pv-df', nom: 'Escarpins', cat: CAT.D },
  { pv: 'pv-ef', nom: 'Vase émaillé', cat: CAT.E },
  { pv: 'pv-ff', nom: 'Coiffeuse dorée', cat: CAT.F },
];

function storefront() {
  return {
    id: 'SF', resellerId: 'RS', slug: 'boutique-0001', discoverable: true, curatedItems: [] as string[],
    name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
    createdAt: '2026-08-23T08:00:00.000Z', updatedAt: '2026-08-23T08:00:00.000Z',
    tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
    sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  };
}

function routes(): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? {
            status: 200,
            json: {
              offers: FEED.map((f) => ({
                productVersionId: f.pv, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000,
                available: 5, productName: f.nom, assetRefs: [], category: f.cat,
              })),
              diagnostic: { status: 'ok', refusals: [] },
            },
          }
        : null,
    (path, body) =>
      path === '/reseller/signup'
        ? {
            status: 200,
            json: {
              ok: true, accountId: 'rs-7777', name: (body?.['name'] as string) ?? '',
              ...(Array.isArray(body?.['categories']) ? { categories: body['categories'] } : {}),
              state: 'pending_access', session: 'SPS-AAAA-BBBB-CCCC-DDDD',
            },
          }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
  ];
}

async function seedCompte(categories?: readonly string[]): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(
    JSON.stringify({ accountId: 'rs-7777', name: 'Awa', state: 'active', ...(categories !== undefined ? { categories } : {}) }),
  );
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
  vi.useRealTimers();
});

describe('the ENTRANCE — she chooses her rayons while signing up', () => {
  it('the picker offers the live rayons, caps at five WITH the sentence, and the signup POST carries exactly her picks', async () => {
    process.env['EXPO_PUBLIC_ACCESS_GATE'] = 'on';
    const fils = wire(routes());
    const screen = await mountApp();

    // The entrance rendered (gate armed, no compte on this device) — with the
    // six live rayons as pressable pills, French labels on.
    expect(screen.shows('Créer mon compte'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    for (const c of Object.values(CAT)) expect(screen.canPress(c), c).toBe(true);

    // She picks five…
    for (const c of [CAT.A, CAT.B, CAT.C, CAT.D, CAT.E]) await screen.press(c);
    // …and the SIXTH tap does not die silently: the maximum sentence speaks.
    await screen.press(CAT.F);
    expect(screen.shows('Vous avez déjà 5 rayons. Retirez-en un pour en choisir un autre.')).toBe(true);
    // She swaps: releases one, takes the sixth — the sentence retires.
    await screen.press(CAT.E);
    await screen.press(CAT.F);
    expect(screen.shows('Vous avez déjà 5 rayons. Retirez-en un pour en choisir un autre.')).toBe(false);

    await screen.type('Awa Traoré', 'Votre nom');
    await screen.type('70 11 22 33', 'Votre numéro WhatsApp');
    await screen.type('awa@example.bf', 'Votre email');
    await screen.type('motdepasse', 'Votre mot de passe (8 lettres ou plus)');
    await screen.press('Créer mon compte');

    // The POST carried EXACTLY her final picks, in pick order.
    const signup = fils.calls.find((c) => c.path === '/reseller/signup');
    expect(signup, 'the signup must have been sent').toBeDefined();
    expect(signup!.body?.['categories']).toEqual([CAT.A, CAT.B, CAT.C, CAT.D, CAT.F]);
    // and she reached the NEXT step — the admission door.
    expect(screen.shows('Encore un pas'), `after signup: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('choosing nothing is a real option: the signup POST carries NO categories field', async () => {
    process.env['EXPO_PUBLIC_ACCESS_GATE'] = 'on';
    const fils = wire(routes());
    const screen = await mountApp();
    await screen.type('Awa Traoré', 'Votre nom');
    await screen.type('70 11 22 33', 'Votre numéro WhatsApp');
    await screen.type('awa@example.bf', 'Votre email');
    await screen.type('motdepasse', 'Votre mot de passe (8 lettres ou plus)');
    await screen.press('Créer mon compte');
    const signup = fils.calls.find((c) => c.path === '/reseller/signup');
    expect(signup).toBeDefined();
    expect(signup!.body !== null && 'categories' in signup!.body).toBe(false);
    screen.unmount();
  });
});

describe('OPPORTUNITÉS — her rayons narrow the whole screen', () => {
  it('only HER categories and their products render; « Tout » means all of HER rayons; the fiche still opens', async () => {
    await seedCompte([CAT.A, CAT.B]);
    wire(routes());
    const screen = await mountApp();
    await screen.press('Opportunités');

    // Her two rayons' products are there…
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows('Sac en cuir')).toBe(true);
    // …and NOTHING outside them, even under « Tout ».
    for (const dehors of ['Poussette double', 'Escarpins', 'Vase émaillé', 'Coiffeuse dorée']) {
      expect(screen.shows(dehors), dehors).toBe(false);
    }
    // The chips row is HER rayons only.
    expect(screen.canPress(CAT.A)).toBe(true);
    expect(screen.canPress(CAT.B)).toBe(true);
    expect(screen.canPress(CAT.C)).toBe(false);
    // Filtering within her selection still works, and the fiche still opens.
    await screen.press(CAT.B);
    expect(screen.shows('Bazin riche')).toBe(false);
    await screen.press('Sac en cuir');
    expect(screen.texts().join(' ')).not.toContain('Les opportunités');
    screen.unmount();
  });

  it('a compte with NO choice sees everything — the pre-slice screen, untouched', async () => {
    await seedCompte();
    wire(routes());
    const screen = await mountApp();
    await screen.press('Opportunités');
    for (const f of FEED) expect(screen.shows(f.nom), f.nom).toBe(true);
    screen.unmount();
  });

  it('every rayon she chose can be EMPTY today — the honest empty state, never a blank', async () => {
    await seedCompte(['Bavoir']);
    wire(routes());
    const screen = await mountApp();
    await screen.press('Opportunités');
    expect(screen.shows('Aucun produit à afficher'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });
});
