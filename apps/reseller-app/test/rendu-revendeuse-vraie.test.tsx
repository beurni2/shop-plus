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
      if (!/^\/listings\/by-pid\/[^/]+\/[^/]+$/.test(path)) return null;
      if (opts.signe === null) return { status: 404, json: { error: 'not_found' } };
      const pid = path.split('/').pop()!;
      return { status: 200, json: { listingId: `lst-${SF_ID}-${pid}`, productVersionId: pid, customerPriceFcfa: opts.signe ?? 12_000, status: 'published' } };
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
    const lus = new Set(fils.calls.filter((c) => /^\/listings\/by-pid\//.test(c.path)).map((c) => c.path.split('/').pop()));
    expect([...lus].sort()).toEqual([...pids].sort());
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
