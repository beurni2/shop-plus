import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { formatFcfa } from '../src/earnings';

/**
 * ═══ RENDU-RÉEL — PRIX-SIGNE-1 (AUDIT-SHOP-2 F-16): Ma Vitrine and Partager
 * print the price the Worker SIGNED, not a session default ═══
 *
 * The audit WALKED the bug (walk E): `GET /listings/by-pid/*` answering
 * `customerPriceFcfa: 12 000`; « Ma Vitrine » → « 10 000 » twice, no
 * « 12 000 », the by-pid route NEVER called; « Partager » → « Prix : 10 000
 * FCFA » while the signed link charged 12 000. Law 1 (every figure reconciles
 * to the franc), SP-I19 (the price snapshot), the trust test.
 *
 * The double is contract-certified to `listing-do.ts`'s `/entry/full` as
 * served by `GET /listings/by-pid/{sf}/{pid}`: `{listingId, productVersionId,
 * customerPriceFcfa, status}`, 404 for a pid without a listing. Only `fetch`
 * is faked; the App, its ports and the margin arithmetic are the shipped files.
 */

const PV = 'pv-bazin';
const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';

const offer = () => ({
  productVersionId: PV, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000,
  available: 5, productName: 'Bazin riche', assetRefs: [] as string[], category: 'mode',
});

const storefront = () => ({
  id: SF_ID, resellerId: 'RS', slug: SLUG, discoverable: true, curatedItems: [PV],
  name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
  createdAt: '2026-08-15T08:00:00.000Z', updatedAt: '2026-08-15T08:00:00.000Z',
  tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
  sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
});

function routes(signe: number | null): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: [offer()], diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: 'Boutique test' }] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
    (path) => {
      if (!/^\/listings\/by-pid\/[^/]+\/[^/]+$/.test(path)) return null;
      if (signe === null) return { status: 404, json: { error: 'not_found' } };
      return { status: 200, json: { listingId: `lst-${SF_ID}-${PV}`, productVersionId: PV, customerPriceFcfa: signe, status: 'published' } };
    },
  ];
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('PRIX-SIGNE-1 — the card and the share preview print the SIGNED price', () => {
  it('signed 12 000 over a base of 10 000 → Ma Vitrine asks by-pid riding her session, the card says « 12 000 » once and « 10 000 » only as the base; Partager says « Prix : 12 000 FCFA »', async () => {
    // Her session on disk — the by-pid road is behind it on the Worker.
    const { expoAccessCodeStore } = await import('../src/sales/code-store');
    await expoAccessCodeStore().write('SPS-AAAA-BBBB-CCCC-DDDD');
    const fils = wire(routes(12_000));
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    for (let i = 0; i < 8 && !screen.shows(formatFcfa(12_000)); i += 1) await screen.settle();

    const lecture = fils.calls.find((c) => /^\/listings\/by-pid\//.test(c.path));
    expect(lecture, 'the signed listing must be READ — the audit found the route never called').toBeDefined();
    expect(lecture!.auth, 'riding her session').toBe('Bearer SPS-AAAA-BBBB-CCCC-DDDD');
    // Amounts through the app's OWN formatter (its thin space is not a space).
    const lu = screen.texts();
    expect(lu.some((t) => t.includes(formatFcfa(12_000))), `the signed price must be on the card; on screen: ${JSON.stringify(lu)}`).toBe(true);
    expect(lu.filter((t) => t.includes(formatFcfa(10_000))).length, 'the base price once — never a second 10 000 posing as the cliente price').toBe(1);

    await screen.press('Partager');
    await screen.settle();
    const carte = screen.texts().join(' | ');
    expect(carte).toContain(`Prix : ${formatFcfa(12_000)}`);
    expect(carte, 'the preview must not print the price the link does not charge').not.toContain(`Prix : ${formatFcfa(10_000)}`);
    screen.unmount();
  });

  it('the base ROSE past the signed price (12 500 live, 12 000 signed): the card still says the signed 12 000 — the figure the link charges, never today\'s arithmetic', async () => {
    // Found under mutation: with the base unchanged, « signed » and « base +
    // implied marge » are the same number, so only a moved base tells the two
    // apart. The link charges what was SIGNED; the card must say that.
    const fils = wire([
      (path) =>
        path === '/supply-projections'
          ? { status: 200, json: { offers: [{ ...offer(), basePrice: 12_500 }], diagnostic: { status: 'ok', refusals: [] } } }
          : null,
      ...routes(12_000).slice(1),
    ]);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    for (let i = 0; i < 8 && !screen.shows(formatFcfa(12_000)); i += 1) await screen.settle();
    expect(fils.calls.some((c) => /^\/listings\/by-pid\//.test(c.path))).toBe(true);
    const lu = screen.texts();
    expect(lu.some((t) => t.includes(formatFcfa(12_000))), `the signed price; on screen: ${JSON.stringify(lu)}`).toBe(true);
    // 12 500 is the BASE row only — it must not also stand as the cliente price.
    expect(lu.filter((t) => t.includes(formatFcfa(12_500))).length).toBe(1);
    await screen.press('Partager');
    await screen.settle();
    expect(screen.texts().join(' | ')).toContain(`Prix : ${formatFcfa(12_000)}`);
    screen.unmount();
  });

  it('CONTROL — no signed listing for the pid (404): the default arithmetic stands, nothing invented, no crash', async () => {
    const fils = wire(routes(null));
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await screen.settle();
    await screen.settle();
    expect(fils.calls.some((c) => /^\/listings\/by-pid\//.test(c.path)), 'asked, and honestly answered absent').toBe(true);
    expect(screen.shows('Bazin riche')).toBe(true);
    expect(screen.shows(formatFcfa(12_000))).toBe(false);
    screen.unmount();
  });
});
