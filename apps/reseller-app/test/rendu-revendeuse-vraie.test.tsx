import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { formatFcfa } from '../src/earnings';

/**
 * ═══ RENDU-RÉEL — REVENDEUSE-VRAIE-1 (AUDIT-3, founder 2026-10-01 « make it be
 * 2 slices fix »): her app says what is true about her boutique ═══
 *
 * Five things the audit walked, each written RED first against the shipped
 * screens:
 *   A-01 a product she already sells: the marge field let her « change » a
 *        price nothing re-signs — her card and the message to the cliente then
 *        said 10 500 while the link charged 12 000;
 *   A-03 « Enregistré — visible immédiatement » appeared before the service
 *        answered, and a refused edit stayed on screen as hers;
 *   A-04 « Votre lien est signé » — the link carries her name, not a signature;
 *   A-05 « Recommencer ma boutique » offered to a reseller with an account, to
 *        refuse her every time;
 *   A-06 an edit made with no network was lost; now it waits on the phone,
 *        said as waiting, and leaves by itself when the network returns.
 * Only `fetch` is faked, contract-certified to the storefront Worker's answers
 * (`/storefronts/{id}/identity`: 200 `{status}` · 422 `{status:'refused',
 * reason}`; `/listings/by-pid/{sf}/{pid}`: `{customerPriceFcfa}` or 404). The
 * walk claims nothing about appearance.
 */

const PV = 'pv-bazin';
const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';

const offer = (pid = PV, nom = 'Bazin riche') => ({
  productVersionId: pid, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000,
  available: 5, productName: nom, assetRefs: [] as string[], category: 'mode',
});

const storefront = (extra: Record<string, unknown> = {}) => ({
  id: SF_ID, resellerId: 'RS', slug: SLUG, discoverable: true, curatedItems: [PV],
  name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
  createdAt: '2026-08-15T08:00:00.000Z', updatedAt: '2026-08-15T08:00:00.000Z',
  tagline: 'Ancienne phrase', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
  sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  ...extra,
});

/** The identity door, scripted per walk: answer now, hold, throw (no network). */
type Porte = { mode: 'ok' | 'refus' | 'reseau' | 'retenue'; relacher?: () => void; envois: Record<string, unknown>[] };

function monde(porte: Porte, opts: { curated?: string[]; signe?: number | null } = {}): { routes: Route[]; stocke: { sf: ReturnType<typeof storefront> } } {
  const curated = opts.curated ?? [PV];
  const stocke = { sf: storefront({ curatedItems: curated }) };
  const routes: Route[] = [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: curated.map((p, i) => offer(p, i === 0 ? 'Bazin riche' : `Article ${i + 1}`)), diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: 'Boutique test' }] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: stocke.sf as never } : null),
    (path) => {
      if (!/^\/listings\/by-pid\/[^/]+\/[^/]+\/economics$/.test(path)) return null;
      if (opts.signe === null) return { status: 404, json: { error: 'not_found' } };
      const pid = path.split('/')[4]!;
      return { status: 200, json: { listing: { id: `lst-${SF_ID}-${pid}`, productVersionId: pid, markup: (opts.signe ?? 12_000) - 10_000, version: 1, status: 'published' }, customerPriceFcfa: opts.signe ?? 12_000, resellerCommission: 1_000 } };
    },
    (path, body) => {
      if (!/^\/storefronts\/[^/]+\/identity$/.test(path)) return null;
      const patch = (body?.['patch'] ?? {}) as Record<string, unknown>;
      porte.envois.push(patch);
      if (porte.mode === 'reseau') throw new TypeError('Network request failed');
      if (porte.mode === 'refus') return { status: 422, json: { status: 'refused', reason: 'name_too_short' } };
      const accepter = () => {
        stocke.sf = { ...stocke.sf, ...patch, updatedAt: `2026-08-15T08:00:0${porte.envois.length}.000Z` } as typeof stocke.sf;
        return { status: 200, json: { status: 'saved' } as never };
      };
      if (porte.mode === 'retenue') {
        return new Promise((resolve) => {
          porte.relacher = () => resolve(accepter());
        }) as never;
      }
      return accepter();
    },
  ];
  return { routes, stocke };
}

const margeChamps = (screen: Awaited<ReturnType<typeof mountApp>>) =>
  screen.tree.root
    .findAllByType('TextInput' as never)
    .filter((i) => String(i.props['accessibilityLabel'] ?? '').includes('Vous ajoutez'));

async function laisser(screen: Awaited<ReturnType<typeof mountApp>>, n = 8): Promise<void> {
  for (let i = 0; i < n; i += 1) await screen.settle();
}

/** Back out of Personnaliser's screens: the last « Retour » drawn is the top one. */
async function fermerK(screen: Awaited<ReturnType<typeof mountApp>>, fois: number): Promise<void> {
  for (let k = 0; k < fois; k += 1) {
    const n = screen.tree.root.findAll((x) => x.props?.['accessibilityLabel'] === 'Retour' && typeof x.props['onPress'] === 'function').length;
    await screen.press('Retour', n - 1);
    await laisser(screen);
  }
}

/** The identity door with a switch the walk flips: network up, down, or a header refused. */
function porteIdentite(m: ReturnType<typeof monde>, porte: Porte, etat: { v: 'ok' | 'reseau' | 'refus_entete' }): Route {
  return (path, body) => {
    if (!/^\/storefronts\/[^/]+\/identity$/.test(path)) return null;
    const patch = (body?.['patch'] ?? {}) as Record<string, unknown>;
    porte.envois.push(patch);
    if (etat.v === 'reseau') throw new TypeError('Network request failed');
    if (etat.v === 'refus_entete' && patch['headerStyle'] !== undefined) return { status: 422, json: { status: 'refused', reason: 'unknown_header_style' } };
    m.stocke.sf = { ...m.stocke.sf, ...patch, updatedAt: `2026-08-15T08:00:${String(10 + porte.envois.length)}.000Z` } as typeof m.stocke.sf;
    return { status: 200, json: { status: 'saved' } };
  };
}

async function surPersonnaliser(screen: Awaited<ReturnType<typeof mountApp>>): Promise<void> {
  await screen.press('Personnaliser ma boutique');
  await laisser(screen);
}

async function phrase(screen: Awaited<ReturnType<typeof mountApp>>, texte: string): Promise<void> {
  await screen.press('Identité');
  await screen.settle();
  await screen.type(texte, 'PHRASE D’ACCUEIL');
  await screen.press('Enregistrer');
  await laisser(screen);
}

beforeEach(async () => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  await expoAccessCodeStore().write(SESSION);
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('A-01 — a product she already sells always says the price the link charges', () => {
  it('signed 12 000: the card states her marge and offers no field that would « change » it; Partager says « Prix : 12 000 »', async () => {
    const porte: Porte = { mode: 'ok', envois: [] };
    wire(monde(porte).routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    for (let i = 0; i < 8 && !screen.shows(formatFcfa(12_000)); i += 1) await screen.settle();
    expect(screen.shows(formatFcfa(12_000)), `the signed price; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(margeChamps(screen), 'a signed product offers no marge field — nothing re-signs it').toHaveLength(0);
    expect(screen.shows(formatFcfa(2_000)), 'her marge on the signed price is stated').toBe(true);
    await screen.press('Partager');
    await screen.settle();
    const carte = screen.texts().join(' | ');
    expect(carte).toContain(`Prix : ${formatFcfa(12_000)}`);
    screen.unmount();
  });

  it('a shop of 22 products: the signed price of EVERY one is read — the 21st and 22nd too', async () => {
    const pids = Array.from({ length: 22 }, (_, i) => (i === 0 ? PV : `pv-${i + 1}`));
    const porte: Porte = { mode: 'ok', envois: [] };
    const fils = wire(monde(porte, { curated: pids }).routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await laisser(screen, 12);
    const lus = new Set(fils.calls.filter((c) => /^\/listings\/by-pid\//.test(c.path)).map((c) => c.path.split('/')[4]));
    expect([...lus].sort()).toEqual([...pids].sort());
    // …and every card took it: no card still offers a marge field over a signed price.
    expect(margeChamps(screen), 'a signed card past the twentieth still offers the marge').toHaveLength(0);
    screen.unmount();
  });
});

describe('A-03 — « Enregistré » only once the service has it', () => {
  async function surIdentite(porte: Porte) {
    const m = monde(porte);
    wire(m.routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await screen.settle();
    await screen.press('Personnaliser ma boutique');
    await laisser(screen);
    await screen.press('Identité');
    await screen.settle();
    await screen.type('Nouvelle phrase', 'PHRASE D’ACCUEIL');
    return { screen, m };
  }

  it('while the service has not answered: « Envoi en cours… », never « Enregistré »; the answer then says « Enregistré »', async () => {
    const porte: Porte = { mode: 'retenue', envois: [] };
    const { screen } = await surIdentite(porte);
    await screen.press('Enregistrer');
    await screen.settle();
    expect(porte.envois, 'the save went out').toHaveLength(1);
    expect(screen.shows('Enregistré — visible immédiatement'), 'success announced before any answer').toBe(false);
    expect(screen.shows('Envoi en cours…')).toBe(true);
    porte.relacher!();
    await laisser(screen);
    expect(screen.shows('Enregistré — visible immédiatement')).toBe(true);
    screen.unmount();
  });

  it('a refused edit is never shown as hers: the refusal is said, her draft stays in the form, and Personnaliser shows the stored phrase', async () => {
    const porte: Porte = { mode: 'refus', envois: [] };
    const { screen } = await surIdentite(porte);
    await screen.press('Enregistrer');
    await laisser(screen);
    expect(screen.shows('Enregistré — visible immédiatement')).toBe(false);
    expect(screen.shows('Votre boutique doit garder un nom.'), 'the service\'s refusal is said').toBe(true);
    const champ = screen.tree.root.findAllByType('TextInput' as never).find((i) => String(i.props['accessibilityLabel'] ?? '').includes('PHRASE D’ACCUEIL'));
    expect(champ?.props['value'], 'what she typed is not lost').toBe('Nouvelle phrase');
    // Two « Retour »: Ma Vitrine's under the sheet, and K2's own — the last drawn.
    await screen.press('Retour', 1);
    await screen.settle();
    expect(screen.tree.root.findAllByType('TextInput' as never).some((i) => String(i.props['accessibilityLabel'] ?? '').includes('PHRASE D’ACCUEIL')), 'back on Personnaliser').toBe(false);
    expect(screen.shows('Identité'), 'Personnaliser lists Identité').toBe(true);
    expect(screen.shows('Nouvelle phrase'), 'the refused phrase must not stand as hers').toBe(false);
    screen.unmount();
  });

  it('a theme is « appliqué » only after the service has it', async () => {
    const porte: Porte = { mode: 'retenue', envois: [] };
    wire(monde(porte).routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await screen.settle();
    await screen.press('Personnaliser ma boutique');
    await laisser(screen);
    await screen.press('Thème');
    await screen.settle();
    // « Indigo » names a habillage and a header style; the habillage card comes first.
    await screen.press('Indigo', 0);
    await screen.settle();
    expect(porte.envois.at(-1)?.['theme'], 'the habillage was asked of the service').toBe('indigo');
    expect(screen.texts().some((t) => /Thème .* appliqué/.test(t)), 'announced before any answer').toBe(false);
    porte.relacher!();
    await laisser(screen);
    expect(screen.texts().some((t) => /Thème .* appliqué/.test(t))).toBe(true);
    screen.unmount();
  });
});

describe('A-06 — an edit made with no network waits on the phone and leaves by itself', () => {
  it('no network: « gardé sur votre téléphone » (never « Enregistré »), kept across a restart, sent when the network returns', async () => {
    const porte: Porte = { mode: 'reseau', envois: [] };
    const m = monde(porte);
    wire(m.routes);
    let screen = await mountApp();
    await screen.press('Ma Vitrine');
    await screen.settle();
    await screen.press('Personnaliser ma boutique');
    await laisser(screen);
    await screen.press('Identité');
    await screen.settle();
    await screen.type('Phrase hors ligne', 'PHRASE D’ACCUEIL');
    await screen.press('Enregistrer');
    await laisser(screen);
    expect(screen.shows('Enregistré — visible immédiatement')).toBe(false);
    expect(screen.texts().some((t) => t.includes('gardé') && t.includes('téléphone')), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('1 envoi attend sur votre téléphone'), 'Personnaliser says it waits').toBe(true);
    await fermerK(screen, 1);
    expect(screen.shows('1 envoi attend sur votre téléphone'), 'Ma Vitrine counts it').toBe(true);
    screen.unmount();

    // the phone restarts with the network back: the kept edit leaves by itself
    porte.mode = 'ok';
    const avant = porte.envois.length;
    screen = await mountApp();
    await laisser(screen, 14);
    expect(porte.envois.length, 'a NEW send after the restart — not the failed one').toBeGreaterThan(avant);
    expect(porte.envois.at(-1)?.['tagline'], 'the kept edit was sent on its own').toBe('Phrase hors ligne');
    expect(m.stocke.sf.tagline).toBe('Phrase hors ligne');
    screen.unmount();
  });
});

describe('A-04 — the share screen says what her link really does', () => {
  it('no « Votre lien est signé »; « Ce lien porte votre nom »', async () => {
    const porte: Porte = { mode: 'ok', envois: [] };
    wire(monde(porte).routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    for (let i = 0; i < 8 && !screen.shows(formatFcfa(12_000)); i += 1) await screen.settle();
    await screen.press('Partager');
    await screen.settle();
    expect(screen.shows('Votre lien est signé')).toBe(false);
    expect(screen.shows('Ce lien porte votre nom')).toBe(true);
    screen.unmount();
  });
});

describe('A-05 — no « Recommencer » that can only refuse', () => {
  /** Her shop answers under whatever id the app addresses — the pre-account
   *  device id (`sf-0258`) or the account's (`sf-7777`) — so « Recommencer »
   *  is governed by the account alone, never by a fixture that lost her shop. */
  function mondeCompte(): Route[] {
    const porte: Porte = { mode: 'ok', envois: [] };
    const base = monde(porte).routes;
    return [
      (path) => (path === '/reseller/session' ? { status: 200, json: { ok: true, accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' } } : null),
      (path) => (path === '/reseller/ventes' ? { status: 200, json: { ok: true, ventes: [], incomplet: false } } : null),
      (path) => (path === '/storefronts' ? { status: 200, json: [{ id: 'sf-7777', slug: SLUG, name: 'Boutique test' }, { id: SF_ID, slug: SLUG, name: 'Boutique test' }] as never } : null),
      (path) => {
        const m = /^\/storefronts\/([^/]+)$/.exec(path);
        return m === null ? null : { status: 200, json: storefront({ id: m[1] }) as never };
      },
      ...base,
    ];
  }

  async function surPersonnaliser() {
    const screen = await mountApp();
    await laisser(screen);
    await screen.press('Ma Vitrine');
    await screen.settle();
    await screen.press('Personnaliser ma boutique');
    await laisser(screen);
    expect(screen.shows('Identité'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    return screen;
  }

  it('CONTROL — before any account, her live shop offers « Recommencer ma boutique »', async () => {
    wire(mondeCompte());
    const screen = await surPersonnaliser();
    expect(screen.canPress('Recommencer ma boutique'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    screen.unmount();
  });

  it('a reseller with an account is not offered « Recommencer ma boutique » (it could only refuse her)', async () => {
    const { expoAccessCodeStore } = await import('../src/sales/code-store');
    await expoAccessCodeStore('reseller-compte.v1.txt').write(JSON.stringify({ accountId: 'rs-7777', name: 'Awa Traoré', state: 'active' }));
    wire(mondeCompte());
    const screen = await surPersonnaliser();
    expect(screen.canPress('Recommencer ma boutique')).toBe(false);
    screen.unmount();
  });
});

/**
 * The ONE verifier pass on this slice found these by walking the real App;
 * each is written here first, RED against the shipped commit, then fixed.
 */
describe('A-06 — a kept boutique change is never silently lost or brought back', () => {
  it('BLOCKER 1 — her kept phrase survives reopening Personnaliser and another offline edit; both land', async () => {
    const porte: Porte = { mode: 'ok', envois: [] };
    const m = monde(porte);
    const etat = { v: 'ok' as 'ok' | 'reseau' | 'refus_entete' };
    wire([porteIdentite(m, porte, etat), ...m.routes]);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await laisser(screen);
    etat.v = 'reseau';
    await surPersonnaliser(screen);
    await phrase(screen, 'Phrase hors ligne');
    await fermerK(screen, 1);
    await surPersonnaliser(screen);
    expect(screen.shows('Phrase hors ligne'), 'reopened, Personnaliser shows her kept phrase, not the stored one').toBe(true);
    await screen.press('Thème');
    await screen.settle();
    await screen.press('Indigo', 0);
    await laisser(screen);
    etat.v = 'ok';
    await fermerK(screen, 2);
    await screen.press('Envoyer maintenant');
    await laisser(screen, 14);
    expect(m.stocke.sf.theme).toBe('indigo');
    expect(m.stocke.sf.tagline, 'her kept phrase was overwritten by the stored one').toBe('Phrase hors ligne');
    screen.unmount();
  });

  it('BLOCKER 2 — a phrase saved online (« Enregistré ») is never reverted by an older kept one', async () => {
    const porte: Porte = { mode: 'ok', envois: [] };
    const m = monde(porte);
    const etat = { v: 'ok' as 'ok' | 'reseau' | 'refus_entete' };
    wire([porteIdentite(m, porte, etat), ...m.routes]);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await laisser(screen);
    etat.v = 'reseau';
    await surPersonnaliser(screen);
    await phrase(screen, 'Phrase P1');
    etat.v = 'ok';
    await phrase(screen, 'Phrase P2');
    expect(screen.shows('Enregistré — visible immédiatement')).toBe(true);
    await fermerK(screen, 1);
    if (screen.canPress('Envoyer maintenant')) await screen.press('Envoyer maintenant');
    await laisser(screen, 12);
    expect(m.stocke.sf.tagline, 'her « Enregistré » P2 must stand').toBe('Phrase P2');
    expect(screen.shows('1 envoi attend sur votre téléphone'), 'nothing is left waiting').toBe(false);
    screen.unmount();
  });

  it('MAJOR 3 — a change the service refused never rides her next kept edit; the refusal is said in the boutique’s own words', async () => {
    const porte: Porte = { mode: 'ok', envois: [] };
    const m = monde(porte);
    const etat = { v: 'ok' as 'ok' | 'reseau' | 'refus_entete' };
    wire([porteIdentite(m, porte, etat), ...m.routes]);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await laisser(screen);
    etat.v = 'reseau';
    await surPersonnaliser(screen);
    await screen.press('Thème');
    await screen.settle();
    await screen.press('Royale', 0);
    await laisser(screen);
    await screen.press('Appliquer cet en-tête');
    await laisser(screen);
    await fermerK(screen, 2);
    etat.v = 'refus_entete';
    await screen.press('Envoyer maintenant');
    await laisser(screen, 12);
    expect(screen.shows('N’a pas pu partir')).toBe(true);
    expect(screen.shows('Cet en-tête n’est pas encore disponible sur votre boutique'), 'the boutique refusal, not the listing sentence').toBe(true);
    etat.v = 'reseau';
    await surPersonnaliser(screen);
    await phrase(screen, 'Phrase hors ligne');
    await fermerK(screen, 1);
    etat.v = 'refus_entete';
    if (screen.canPress('Envoyer maintenant')) await screen.press('Envoyer maintenant');
    await laisser(screen, 12);
    expect(porte.envois.at(-1)?.['headerStyle'], 'the refused header rode again').toBeUndefined();
    expect(m.stocke.sf.tagline, 'her phrase (never refused) must land').toBe('Phrase hors ligne');
    screen.unmount();
  });

  it('MAJOR 5 — a reorder made with no network is not kept (it is said to need the network), so it can never take her other changes down', async () => {
    const porte: Porte = { mode: 'ok', envois: [] };
    const m = monde(porte, { curated: [PV, 'pv-2'] });
    const etat = { v: 'ok' as 'ok' | 'reseau' | 'refus_entete' };
    wire([porteIdentite(m, porte, etat), ...m.routes]);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await laisser(screen);
    etat.v = 'reseau';
    await surPersonnaliser(screen);
    await screen.press('À la une & ordre');
    await screen.settle();
    await screen.press('Descendre', 0);
    await laisser(screen);
    expect(screen.shows('Pas enregistré. Réessayez dans un moment.')).toBe(true);
    expect(screen.texts().some((t) => t.includes('gardé') && t.includes('téléphone')), 'a reorder is not kept').toBe(false);
    await fermerK(screen, 2);
    expect(screen.shows('1 envoi attend sur votre téléphone')).toBe(false);
    screen.unmount();
  });

  it('MINOR 8 — a waiting boutique change has a way out: « Annuler les changements », and Personnaliser then shows what is stored', async () => {
    const porte: Porte = { mode: 'ok', envois: [] };
    const m = monde(porte);
    const etat = { v: 'ok' as 'ok' | 'reseau' | 'refus_entete' };
    wire([porteIdentite(m, porte, etat), ...m.routes]);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await laisser(screen);
    etat.v = 'reseau';
    await surPersonnaliser(screen);
    await phrase(screen, 'Phrase hors ligne');
    await fermerK(screen, 1);
    await screen.press('Annuler les changements');
    await laisser(screen);
    expect(screen.shows('Annulé. Rien n’a été envoyé.')).toBe(true);
    expect(screen.shows('1 envoi attend sur votre téléphone')).toBe(false);
    await surPersonnaliser(screen);
    expect(screen.shows('Phrase hors ligne')).toBe(false);
    expect(screen.shows('Ancienne phrase')).toBe(true);
    etat.v = 'ok';
    await laisser(screen, 6);
    expect(porte.envois.filter((e) => e['tagline'] === 'Phrase hors ligne'), 'only the failed attempt, never a replay').toHaveLength(1);
    screen.unmount();
  });

  it('MINOR 7 — a second tap while the theme is still sending sends nothing twice', async () => {
    const porte: Porte = { mode: 'retenue', envois: [] };
    wire(monde(porte).routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await screen.settle();
    await surPersonnaliser(screen);
    await screen.press('Thème');
    await screen.settle();
    await screen.press('Indigo', 0);
    await screen.settle();
    await screen.press('Indigo', 0);
    await screen.settle();
    expect(porte.envois, 'one save in flight, never two').toHaveLength(1);
    porte.relacher!();
    await laisser(screen);
    screen.unmount();
  });
});

describe('A-01 — the signed price reaches every card and the share screen without waiting for the whole shop', () => {
  it('MAJOR 4 — each round of reads lands as it answers; Partager on a card still unread reads its price before quoting it', async () => {
    const pids = Array.from({ length: 14 }, (_, i) => (i === 0 ? PV : `pv-${i + 1}`));
    const porte: Porte = { mode: 'ok', envois: [] };
    const m = monde(porte, { curated: pids });
    const tenus: (() => void)[] = [];
    let lus = 0;
    const lent: Route = (path) => {
      if (!/^\/listings\/by-pid\//.test(path)) return null;
      lus += 1;
      const pid = path.split('/')[4]!;
      const rep = { status: 200, json: { listing: { id: `lst-${SF_ID}-${pid}`, productVersionId: pid, markup: (12_000) - 10_000, version: 1, status: 'published' }, customerPriceFcfa: 12_000, resellerCommission: 1_000 } };
      if (lus <= 6) return rep; // the first round answers; the next is slow (2G)
      return new Promise((resolve) => {
        tenus.push(() => resolve(rep));
      });
    };
    wire([lent, ...m.routes]);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await laisser(screen, 10);
    expect(margeChamps(screen), 'the six read cards took their signed price at once').toHaveLength(14 - 6);
    // the eighth card: its round is still on the road when she taps Partager
    await screen.press('Partager', 7);
    await laisser(screen);
    expect(screen.shows('Article 8'), 'the share screen is the eighth card’s').toBe(true);
    tenus.forEach((r) => r());
    await laisser(screen, 10);
    expect(screen.texts().join(' | ')).toContain(`Prix : ${formatFcfa(12_000)}`);
    screen.unmount();
  });
});
