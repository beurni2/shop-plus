import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — PHOTOS-LEGERES-1 (AUDIT-4 B-02): her photo, then its small copy ═══
 *
 * Buyers downloaded her 2048 px cover and portrait into boxes of 44–280 px.
 * Her app now makes a small copy when she picks a photo, and sends it AFTER the
 * service has put the photo on her shop — naming the photo it was made from.
 * This walk presses the real buttons on « Couverture & portrait » and asks the
 * network what left: the photo, then the small copy naming that photo's
 * address, both with bytes. It claims nothing about what the bytes are (the
 * picker and manipulator doubles state that bound), nor about appearance.
 *
 * The fake service is CONTRACT-CERTIFIED to the Worker's real answers
 * (services/storefront-service/src/index.ts — the photo upload points her shop
 * at the photo and answers 201 `{kind, status:'live', url}`; the small copy
 * answers 201 `{kind, petite:true}`), pinned on workerd in
 * `services/storefront-service/test/photos-legeres.e2e.test.ts`.
 */

const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const NOM = 'Boutique test';
const ADRESSE = {
  cover: 'https://media.example.dev/media/storefronts/sf-0258/cover/c1.jpeg',
  avatar: 'https://media.example.dev/media/storefronts/sf-0258/avatar/a1.jpeg',
} as const;

function service(opts: { pointe?: boolean; copie?: 'pendante' | 'refusee' } = {}): Route[] {
  const etat = { cover: null as string | null, avatar: null as string | null };
  const storefront = () => ({
    id: SF_ID, resellerId: 'RS', slug: SLUG, discoverable: true, curatedItems: [], name: NOM, zone: 'Ouagadougou',
    category: 'mode', createdAt: '2026-08-15T08:00:00.000Z', updatedAt: '2026-08-15T08:00:00.000Z', tagline: '', bio: '',
    cover: etat.cover === null ? { status: 'none' } : { status: 'live', url: etat.cover },
    avatar: etat.avatar === null ? { mode: 'monogram' } : { mode: 'photo', url: etat.avatar },
    theme: 'laterite', sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  });
  return [
    (path) => (path === '/supply-projections' ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } } : null),
    (path, body) =>
      path === '/storefronts' && body === null
        ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: true }] as never }
        : null,
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
    (path, _body, search) => {
      if (path !== '/media/upload') return null;
      const q = new URLSearchParams(search);
      const kind = q.get('kind') as 'cover' | 'avatar';
      if (q.get('petite') === '1') {
        if (opts.copie === 'pendante') return new Promise(() => undefined); // the network that never answers
        if (opts.copie === 'refusee') return { status: 409, json: { service: 'storefront-service', error: 'photo_changed' } };
        return { status: 201, json: { kind, petite: true } };
      }
      // `pointe: false` — the service stored the bytes but her shop does not show them.
      if (opts.pointe !== false) etat[kind] = ADRESSE[kind];
      return { status: 201, json: { service: 'storefront-service', kind, status: 'live', url: ADRESSE[kind] } };
    },
  ];
}

async function surCouverturePortrait(routes: Route[] = service()) {
  const w = wire(routes);
  const screen = await mountApp();
  await screen.settle();
  await screen.press('Ma Vitrine');
  await screen.settle();
  await screen.press('Personnaliser ma boutique');
  await screen.settle();
  await screen.press('Couverture & portrait');
  await screen.settle();
  return { w, screen };
}

const envois = (w: ReturnType<typeof wire>) =>
  w.calls.filter((c) => c.path === '/media/upload' && c.method === 'POST').map((c) => ({ q: new URLSearchParams(c.search), bytes: c.bytes }));

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

describe('PHOTOS-LEGERES-1 — the photo she picks leaves with its small copy', () => {
  it('cover: « Ajouter une couverture » sends the photo, then the small copy naming it', async () => {
    const { w, screen } = await surCouverturePortrait();
    (await import('./doubles/expo-simple')).prochainePhoto();
    await screen.press('Ajouter une couverture');
    await screen.settle();
    await screen.settle();
    const e = envois(w);
    expect(e, `uploads: ${JSON.stringify(e.map((x) => x.q.toString()))}`).toHaveLength(2);
    expect(e[0]!.q.get('kind')).toBe('cover');
    expect(e[0]!.q.get('petite'), 'the photo itself went out as a small copy').toBeNull();
    expect(e[0]!.bytes).toBeGreaterThan(0);
    expect(e[1]!.q.get('kind')).toBe('cover');
    expect(e[1]!.q.get('petite')).toBe('1');
    expect(e[1]!.q.get('photo'), 'the small copy must name the photo the service just put on her shop').toBe(ADRESSE.cover);
    expect(e[1]!.bytes).toBeGreaterThan(0);
    screen.unmount();
  });

  it('portrait: « Photo », then the photo slot, sends the photo, then the small copy naming it', async () => {
    const { w, screen } = await surCouverturePortrait();
    // The first « Photo » is the segment switch; the slot it reveals carries the same label.
    await screen.press('Photo');
    await screen.settle();
    (await import('./doubles/expo-simple')).prochainePhoto();
    await screen.press('Photo', 1);
    await screen.settle();
    await screen.settle();
    const e = envois(w);
    expect(e.map((x) => [x.q.get('kind'), x.q.get('petite'), x.q.get('photo')])).toEqual([
      ['avatar', null, null],
      ['avatar', '1', ADRESSE.avatar],
    ]);
    expect(e.every((x) => x.bytes > 0)).toBe(true);
    screen.unmount();
  });

  it('a photo her shop does not show yet sends NO small copy — the copy rides only a confirmed photo', async () => {
    const { w, screen } = await surCouverturePortrait(service({ pointe: false }));
    (await import('./doubles/expo-simple')).prochainePhoto();
    await screen.press('Ajouter une couverture');
    await screen.settle();
    await screen.settle();
    const e = envois(w);
    expect(e.map((x) => [x.q.get('kind'), x.q.get('petite')])).toEqual([['cover', null]]);
    screen.unmount();
  });

  /* Verifier MINOR 2 — her answer never waits on the copy, and a copy that
   * fails or cannot be made costs her nothing. */
  it('a copy upload that never answers does not hold her answer: « Votre couverture est en ligne »', async () => {
    const { w, screen } = await surCouverturePortrait(service({ copie: 'pendante' }));
    (await import('./doubles/expo-simple')).prochainePhoto();
    await screen.press('Ajouter une couverture');
    await screen.settle();
    await screen.settle();
    expect(screen.shows('Votre couverture est en ligne'), `on screen: ${JSON.stringify(screen.texts().slice(0, 20))}`).toBe(true);
    expect(envois(w).map((x) => x.q.get('petite'))).toEqual([null, '1']);
    screen.unmount();
  });

  it('a copy the service refuses leaves her photo and her answer as they are', async () => {
    const { w, screen } = await surCouverturePortrait(service({ copie: 'refusee' }));
    (await import('./doubles/expo-simple')).prochainePhoto();
    await screen.press('Ajouter une couverture');
    await screen.settle();
    await screen.settle();
    expect(screen.shows('Votre couverture est en ligne')).toBe(true);
    expect(envois(w).map((x) => x.q.get('petite'))).toEqual([null, '1']);
    screen.unmount();
  });

  it('a copy the phone cannot make: the photo alone leaves, and her answer is the same', async () => {
    const { w, screen } = await surCouverturePortrait();
    const doubles = await import('./doubles/expo-simple');
    doubles.prochainePhoto();
    doubles.prochaineCopieImpossible();
    await screen.press('Ajouter une couverture');
    await screen.settle();
    await screen.settle();
    expect(screen.shows('Votre couverture est en ligne')).toBe(true);
    const e = envois(w);
    expect(e.map((x) => [x.q.get('kind'), x.q.get('petite')])).toEqual([['cover', null]]);
    expect(e[0]!.bytes).toBeGreaterThan(0);
    screen.unmount();
  });
});
