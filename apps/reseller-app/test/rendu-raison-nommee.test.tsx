import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — RAISON-NOMMEE-1 (AUDIT-SHOP-2 F-17a, F-41, F-46) on the
 * mounted App ═══
 *
 * F-17a, walked by the audit (D2/D3): `/listings` throwing → « … — offline —
 * réessayez »; a 401 → « — http_401 — ». A wire token is not French Voice
 * (Law 6). Now every refused publication earns a sentence and never its token.
 * F-41: Profil's two password fields rendered in clear text while the entrance
 * masks by founder order. F-46: the coupe screen's « Vérifier à nouveau » was
 * silent on failure.
 *
 * Only `fetch` is faked; the doubles are the deployed bundle's own answers.
 */

const PV = 'pv-bazin';
const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';

const routesDeBase: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? {
          status: 200,
          json: {
            offers: [{ productVersionId: PV, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000, available: 5, productName: 'Bazin riche', assetRefs: [], category: 'mode' }],
            diagnostic: { status: 'ok', refusals: [] },
          },
        }
      : null,
  (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
  (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 404, json: { error: 'not_found' } } : null),
];

/** Make ONE path throw — the dead network, as `fetch` really fails. */
function couperSur(chemin: string): void {
  const enregistre = (globalThis as { fetch: (u: string, i?: RequestInit) => Promise<Response> }).fetch;
  (globalThis as { fetch: unknown }).fetch = (u: string, i?: RequestInit): Promise<Response> => {
    const p = enregistre(u, i);
    return new URL(u, 'http://shop.test').pathname === chemin ? Promise.reject(new TypeError('Network request failed')) : p;
  };
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
});

describe('RAISON-NOMMEE-1 (F-17a) — a refused publication is told in her words, never in the wire\'s', () => {
  // PIN EVOLVED (FILE-ATTENTE-1, F-17b): a thrown `/listings` is the NETWORK's
  // refusal, and the intent is now KEPT on the phone instead of told and lost
  // — the sentence is « gardé sur votre téléphone » and the way out is
  // « Annuler l’ajout » on the waiting card. What this pin still owns is
  // F-17a's law: never the wire token on her screen.
  it('/listings throws → the intent is kept and SAID in her words, no « offline » token, and the way out is « Annuler l’ajout »', async () => {
    const fils = wire(routesDeBase);
    couperSur('/listings');
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    await screen.press('Ajouter à ma vitrine');
    for (let i = 0; i < 8 && !screen.shows('est gardé sur votre téléphone.'); i += 1) await screen.settle();

    expect(fils.calls.some((c) => c.path === '/listings' && c.method === 'POST')).toBe(true);
    expect(screen.shows('L’ajout de Bazin riche est gardé sur votre téléphone.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().join(' '), 'a wire token is not a sentence (Law 6)').not.toMatch(/offline|http_\d{3}/);
    expect(screen.canPress('Annuler l’ajout'), 'the way out').toBe(true);
    screen.unmount();
  });

  // PIN EVOLVED (FILE-ATTENTE-1, F-17b): a NAMED refusal (400 with a reason) is
  // still TOLD and never kept — « not saved », no promise, the CTA back; a
  // bodiless 500 is the service answering without deciding, which is now KEPT
  // like the network (one fault counted on the replay) rather than told and
  // lost. The named case comes FIRST here because a kept intent moves her to
  // Ma Vitrine and closes the fiche's CTA.
  it('400 with an unknown named reason → « not saved », no promise, never the token; a bodiless 500 → KEPT on the phone, never « http_500 »', async () => {
    // A real Worker 500 carries NO named error (the runtime's own page); a
    // body with `error` is the Worker refusing BY NAME and is read as such.
    const reponses: { status: number; json: Record<string, unknown> } = { status: 400, json: { error: 'markup_invalid' } };
    const fils = wire([
      (path) => (path === '/listings' ? { status: reponses.status, json: reponses.json } : null),
      ...routesDeBase,
    ]);
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    await screen.press('Ajouter à ma vitrine');
    for (let i = 0; i < 6 && !screen.shows('Ce n’est pas enregistré. Rien n’a changé.'); i += 1) await screen.settle();
    expect(screen.shows('Ce n’est pas enregistré. Rien n’a changé.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().join(' ')).not.toContain('markup_invalid');
    expect(screen.canPress('Ajouter à ma vitrine'), 'a told refusal leaves the CTA — nothing was kept').toBe(true);
    expect(screen.shows('En attente d’envoi'), 'a named refusal is never « waiting »').toBe(false);

    reponses.status = 500;
    reponses.json = {};
    await screen.press('Ajouter à ma vitrine');
    for (let i = 0; i < 8 && !screen.shows('est gardé sur votre téléphone.'); i += 1) await screen.settle();
    expect(screen.shows('L’ajout de Bazin riche est gardé sur votre téléphone.'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.texts().join(' ')).not.toMatch(/http_\d{3}/);
    expect(screen.shows('En attente d’envoi')).toBe(true);
    expect(fils.calls.filter((c) => c.path === '/listings').length).toBe(2);
    screen.unmount();
  });
});

describe('RAISON-NOMMEE-1 (F-41) — Profil\'s password fields are masked, with the one-tap « Voir / Cacher »', () => {
  it('both fields start masked; « Voir » reveals both; « Cacher » masks both', async () => {
    const { expoAccessCodeStore } = await import('../src/sales/code-store');
    await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify({ accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' }));
    await expoAccessCodeStore().write(SESSION);
    wire([
      ...routesDeBase,
      (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' } } : null),
      (path) => (path === '/reseller/profile' ? { status: 200, json: { ok: true, accountId: 'rs-7777', name: 'Awa Traoré', email: 'awa@example.bf', phone: '70 11 22 33', state: 'active' } } : null),
    ]);
    const screen = await mountApp();
    await screen.press('Profil');
    for (let i = 0; i < 8 && !screen.shows('Mot de passe'); i += 1) await screen.settle();

    const champs = () =>
      screen.tree.root
        .findAllByType('TextInput' as never)
        .filter((i) => ['Votre mot de passe actuel', 'Nouveau mot de passe (8 lettres ou plus)'].includes(String(i.props['accessibilityLabel'])));
    expect(champs(), 'the two password fields').toHaveLength(2);
    for (const c of champs()) expect(c.props['secureTextEntry'], 'masked by default').toBe(true);

    expect(screen.canPress('Voir')).toBe(true);
    await screen.press('Voir');
    for (const c of champs()) expect(c.props['secureTextEntry'], 'revealed on her tap').toBe(false);
    await screen.press('Cacher');
    for (const c of champs()) expect(c.props['secureTextEntry']).toBe(true);
    screen.unmount();
  });
});

describe('RAISON-NOMMEE-1 (F-46) — the coupe screen\'s « Vérifier à nouveau » is never silent', () => {
  it('a dead wire → « Pas de réseau. Réessayez dès que ça revient. » under the button; the wire back with active → the app opens', async () => {
    process.env['EXPO_PUBLIC_ACCESS_GATE'] = 'on';
    const { expoAccessCodeStore } = await import('../src/sales/code-store');
    await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify({ accountId: 'rs-7777', name: 'Awa Traoré', state: 'paused' }));
    await expoAccessCodeStore().write(SESSION);
    const livre = { mort: true };
    wire([
      ...routesDeBase,
      (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, accountId: 'rs-7777', name: 'Awa Traoré', state: livre.mort ? 'paused' : 'active' } } : null),
    ]);
    const enregistre = (globalThis as { fetch: (u: string, i?: RequestInit) => Promise<Response> }).fetch;
    (globalThis as { fetch: unknown }).fetch = (u: string, i?: RequestInit): Promise<Response> =>
      livre.mort && new URL(u, 'http://shop.test').pathname === '/reseller/session'
        ? Promise.reject(new TypeError('Network request failed'))
        : enregistre(u, i);
    const screen = await mountApp();
    await screen.settle();
    expect(screen.shows('Votre accès est en pause'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);

    await screen.press('Vérifier à nouveau');
    for (let i = 0; i < 6 && !screen.shows('Pas de réseau. Réessayez dès que ça revient.'); i += 1) await screen.settle();
    expect(screen.shows('Pas de réseau. Réessayez dès que ça revient.'), 'the failed check must SAY so').toBe(true);
    expect(screen.canPress('Vérifier à nouveau'), 'and stay retryable').toBe(true);

    // The wire is back and the founder has lifted the pause: the check opens the app.
    livre.mort = false;
    await screen.press('Vérifier à nouveau');
    for (let i = 0; i < 8 && !screen.canPress('Opportunités'); i += 1) await screen.settle();
    expect(screen.canPress('Opportunités'), `after the lift: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });
});
