import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route, type Screen } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { installAnimationFrame } from './doubles/animation-frame';

/**
 * ═══ RENDU-RÉEL — RELATED-PARTY-1 on « Mes gains » (Build Spec §6.5) ═══
 *
 * The order held her commission because the buyer's number is her own. What
 * her screen must do, walked on the MOUNTED App (no app code stubbed; only
 * `fetch` faked, contract-certified to `storefront-service`'s `/reseller/ventes`
 * row and its `/reseller/ventes/{id}/contester` road):
 *   · the held sale sits on the « En attente d'un contrôle » rung — awake, with
 *     her net and the count — and is NOT counted as locked money;
 *   · the BASIS is on screen in plain words (a verdict she cannot see the basis
 *     of is not one she can contest), calm, no accusation;
 *   · « Contester » is present, pressable, wired: her sentence rides HER session
 *     to the order; the answer is shown; a failure leaves a way back;
 *   · already contested → her words stand, no second control;
 *   · cleared by the founder → the sale is ordinary locked money again;
 *   · violation confirmed → the final sentence, no control.
 * WHAT IT MAY NEVER CLAIM: appearance — see `test/doubles/react-native.tsx`.
 */

const PV = 'pv-bazin';
const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const NOM = 'Boutique test';
const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const COMPTE = { accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' } as const;

const BASE = { state: 'confirmed', createdAt: '2026-09-17T09:00:00.000Z', productVersionId: PV, zoneTo: 'Ouagadougou' } as const;
/** Her ordinary sale: locked money. */
const ORDINAIRE = { ...BASE, orderId: 'ord-q-0001', resellerNet: 3_000 };
/** The sale the order HELD: the buyer's number is hers. */
const RETENUE = { ...BASE, orderId: 'ord-q-0007', resellerNet: 2_500, lienProche: { outcome: 'auto_void', signals: ['phone'], contestee: false } };

const BASE_PHRASE = 'Le numéro de la cliente est le même que le vôtre.';
const NOTEE = 'Contestation notée.';
const REFUSEE = 'ce gain ne sera pas versé';
const PAS_PARTIE = 'La contestation n’est pas partie.';
const CHAMP = 'Dites-nous en une phrase pourquoi cette vente est normale.';

const routesCommunes: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? {
          status: 200,
          json: {
            offers: [
              { productVersionId: PV, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000, available: 5, productName: 'Bazin riche', assetRefs: [] as string[], category: 'mode' },
            ],
            diagnostic: { status: 'ok', refusals: [] },
          },
        }
      : null,
  (path) => (path === '/storefronts' ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM, discoverable: true }] as never } : null),
  (path) =>
    /^\/storefronts\/[^/]+$/.test(path)
      ? {
          status: 200,
          json: {
            id: SF_ID, resellerId: 'RS', slug: SLUG, discoverable: true, curatedItems: [PV], name: NOM, zone: 'Ouagadougou', category: 'mode',
            createdAt: '2026-08-15T08:00:00.000Z', updatedAt: '2026-08-15T08:00:00.000Z', tagline: '', bio: '',
            cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite', sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
          } as never,
        }
      : null,
  (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, ...COMPTE } } : null),
  (path) => (path === '/reseller/profile' ? { status: 200, json: { ok: true, ...COMPTE, email: 'awa@example.bf', phone: '70 11 22 33' } } : null),
];

/** Her world, with the feed's rows as a mutable fact and the contest road answering as told. */
type Reponse = { status: number; json: Record<string, unknown> };
function monde(ventes: () => unknown[], contester: (body: Record<string, unknown> | null) => Reponse): Route[] {
  return [
    ...routesCommunes,
    (path) => (path === '/reseller/ventes' ? { status: 200, json: { ok: true, ventes: ventes(), incomplet: false } } : null),
    (path, body) => (/^\/reseller\/ventes\/[^/]+\/contester$/.test(path) ? contester(body) : null),
  ];
}

async function seedAdmise(): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  const { expoIdentityStore } = await import('../src/identity/expoStore');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify(COMPTE));
  await expoAccessCodeStore().write(SESSION);
  await expoIdentityStore().write(JSON.stringify({ version: 1, digits: '7777' }));
}

async function attendre(screen: Screen, fragment: string): Promise<void> {
  for (let i = 0; i < 25 && !screen.shows(fragment); i += 1) await screen.settle();
  expect(screen.shows(fragment), `expected « ${fragment} »; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

/** The hero's figure lands once the device's reduced-motion answer arrives (a tick later); wait for it, never for a frame. */
async function attendreMontant(screen: Screen, n: number): Promise<string> {
  for (let i = 0; i < 40 && !montant(n).test(screen.texts().join(' | ')); i += 1) await screen.settle();
  const lu = screen.texts().join(' | ');
  const ici = lu.indexOf('Gain bloqué pour vous');
  expect(lu, `expected ${n} FCFA on screen; around the hero: ${JSON.stringify(lu.slice(Math.max(0, ici - 10), ici + 120))}`).toMatch(montant(n));
  return lu;
}

async function surMesGains(screen: Screen): Promise<void> {
  for (let i = 0; i < 10 && !screen.canPress('Gains'); i += 1) await screen.settle();
  await screen.press('Gains');
  await attendre(screen, 'Gain bloqué pour vous');
}

/** A franc figure as the screen prints it — `formatFcfa` in one text, or the hero's number and « FCFA » as two — whatever space it groups with. */
const montant = (n: number): RegExp =>
  new RegExp(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s\\u202f\\u00a0]') + '(?:[\\s\\u00a0]| \\| )FCFA');

/**
 * The device's own facts, set per walk: a frame exists (the locked hero counts
 * up with one), and she asked for LESS MOTION — so the hero shows its figure
 * at once and the walk never waits on a clock. Set on the module instance the
 * App is about to import (after `vi.resetModules()`), never on a stale one.
 */
let desinstaller: () => void = () => {};
async function moinsDeMouvement(): Promise<void> {
  const rn = await import('react-native');
  rn.AccessibilityInfo.isReduceMotionEnabled = async () => true;
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  process.env['EXPO_PUBLIC_ACCESS_GATE'] = 'on';
  desinstaller = installAnimationFrame();
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
  desinstaller();
});

describe('RELATED-PARTY-1 — « Mes gains » when the order held her commission', () => {
  it('the held sale sits on the control rung — awake, with her net — NOT on the locked hero; the basis reads in plain words; « Contester » is present and pressable', async () => {
    await seedAdmise();
    await moinsDeMouvement();
    wire(monde(() => [ORDINAIRE, RETENUE], () => ({ status: 200, json: { ok: true } })));
    const screen = await mountApp();
    await surMesGains(screen);
    const lu = await attendreMontant(screen, 3_000);
    expect(lu, 'the control rung is awake, by name').toContain("En attente d'un contrôle");
    expect(lu, 'her net on the held sale').toMatch(montant(2_500));
    expect(lu, 'one sale on that rung').toContain('1 vente');
    expect(lu, 'the locked hero carries the ORDINARY sale only').toMatch(montant(3_000));
    expect(lu, 'the held net is never added to the locked figure').not.toMatch(montant(5_500));
    expect(lu, 'the basis, in plain words').toContain(BASE_PHRASE);
    expect(lu).toContain('Ce gain est mis de côté le temps d’une vérification.');
    expect(lu, 'no accusation on her screen').not.toMatch(/fraude|triche|interdit/i);
    expect(screen.canPress('Contester'), 'the appeal path is on screen').toBe(true);
    screen.unmount();
  });

  it('« Contester » → her sentence rides HER session to the order, the answer is shown, and the control goes away', async () => {
    await seedAdmise();
    await moinsDeMouvement();
    let contestee = false;
    const fils = wire(
      monde(
        () => [ORDINAIRE, { ...RETENUE, lienProche: { ...RETENUE.lienProche, contestee } }],
        () => {
          contestee = true;
          return { status: 200, json: { ok: true } };
        },
      ),
    );
    const screen = await mountApp();
    await surMesGains(screen);
    await screen.press('Contester');
    await screen.settle();
    expect(screen.canPress('Envoyer'), 'the field opened with its one action (the placeholder is not a text node; the action is the proof)').toBe(true);
    await screen.type('Ma cliente a commandé avec mon téléphone.', CHAMP);
    await screen.press('Envoyer');
    await attendre(screen, NOTEE);

    const envoi = fils.calls.find((c) => c.method === 'POST' && c.path === '/reseller/ventes/ord-q-0007/contester');
    expect(envoi, 'the appeal went to the order she named').toBeDefined();
    expect(envoi?.auth, 'riding her session').toBe(`Bearer ${SESSION}`);
    expect(envoi?.body).toEqual({ texte: 'Ma cliente a commandé avec mon téléphone.' });
    expect(screen.canPress('Contester'), 'her words stand: no second control').toBe(false);
    expect(screen.shows(BASE_PHRASE), 'the basis stays readable').toBe(true);
    screen.unmount();
  });

  it('an empty sentence is not sent — « Envoyer » stays quiet until she has written something', async () => {
    await seedAdmise();
    await moinsDeMouvement();
    const fils = wire(monde(() => [RETENUE], () => ({ status: 200, json: { ok: true } })));
    const screen = await mountApp();
    await surMesGains(screen);
    await screen.press('Contester');
    await screen.settle();
    expect(screen.canPress('Envoyer'), 'the field opened with its one action (the placeholder is not a text node; the action is the proof)').toBe(true);
    await screen.press('Envoyer');
    await screen.settle();
    expect(fils.calls.some((c) => c.method === 'POST' && c.path.endsWith('/contester')), 'nothing left the phone').toBe(false);
    expect(screen.canPress('Envoyer'), 'the field is still hers to fill').toBe(true);
    screen.unmount();
  });

  it('the road fails → she is told, and « Contester » is still there to try again (a way out)', async () => {
    await seedAdmise();
    await moinsDeMouvement();
    let tentatives = 0;
    let contestee = false;
    wire(
      monde(
        () => [{ ...RETENUE, lienProche: { ...RETENUE.lienProche, contestee } }],
        () => {
          tentatives += 1;
          if (tentatives === 1) return { status: 503, json: { ok: false } };
          contestee = true;
          return { status: 200, json: { ok: true } };
        },
      ),
    );
    const screen = await mountApp();
    await surMesGains(screen);
    await screen.press('Contester');
    await screen.settle();
    expect(screen.canPress('Envoyer'), 'the field opened with its one action (the placeholder is not a text node; the action is the proof)').toBe(true);
    await screen.type('Ma voisine.', CHAMP);
    await screen.press('Envoyer');
    await attendre(screen, PAS_PARTIE);
    expect(screen.canPress('Envoyer'), 'she can send again').toBe(true);
    await screen.press('Envoyer');
    await attendre(screen, NOTEE);
    expect(tentatives).toBe(2);
    screen.unmount();
  });

  it('already contested → her words stand and there is no control; cleared → ordinary locked money; violation → the final sentence and no control', async () => {
    await seedAdmise();
    await moinsDeMouvement();
    const contestee = { ...RETENUE, orderId: 'ord-q-0008', resellerNet: 1_000, lienProche: { ...RETENUE.lienProche, contestee: true } };
    const levee = { ...RETENUE, orderId: 'ord-q-0009', resellerNet: 4_000, lienProche: { ...RETENUE.lienProche, contestee: true, resolution: 'clear' } };
    const confirmee = { ...RETENUE, orderId: 'ord-q-0010', resellerNet: 6_000, lienProche: { ...RETENUE.lienProche, contestee: false, resolution: 'violation' } };
    wire(monde(() => [contestee, levee, confirmee], () => ({ status: 200, json: { ok: true } })));
    const screen = await mountApp();
    await surMesGains(screen);
    const lu = await attendreMontant(screen, 4_000);
    expect(lu, 'the cleared sale is locked money again').toMatch(montant(4_000));
    expect(lu, 'the two still-held sales on the control rung, summed').toMatch(montant(7_000));
    expect(lu, 'two sales on that rung').toContain('2 ventes');
    expect(lu, 'her earlier contestation stands').toContain(NOTEE);
    expect(lu, 'the confirmed violation is said plainly').toContain(REFUSEE);
    // The « set aside for a check » sentence belongs to the contested sale ONLY:
    // on the ruled one it would contradict the ruling on the same card (verifier).
    expect(lu.split('mis de côté').length - 1, 'the hold sentence once, on the sale still under review').toBe(1);
    expect(lu, 'the basis stays readable on the ruled sale too').toContain(BASE_PHRASE);
    expect(screen.canPress('Contester'), 'no control on a contested or ruled sale').toBe(false);
    screen.unmount();
  });

  it('no held sale → the control rung stays quiet, as before this slice', async () => {
    await seedAdmise();
    await moinsDeMouvement();
    wire(monde(() => [ORDINAIRE], () => ({ status: 200, json: { ok: true } })));
    const screen = await mountApp();
    await surMesGains(screen);
    const lu = screen.texts().join(' | ');
    expect(lu).not.toContain(BASE_PHRASE);
    expect(screen.canPress('Contester')).toBe(false);
    // Dormant: the rung's own next line is « Pas encore », not a franc figure.
    expect(lu, 'the rung is dormant: it says so, prints no figure').toMatch(/En attente d'un contrôle \| Pas encore \| /);
    screen.unmount();
  });
});
