import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { formatFcfa } from '../src/earnings';

/**
 * ═══ RENDU-RÉEL — PARTAGER-PRO: the share screen, real bytes only ═══
 *
 * FOUNDER, 2026-08-15: « make it be more professional, very simple and well
 * detailed, and add the option to share my boutique link as well, and the
 * option to print the QR code as well, and make sure to not display many
 * partager buttons. And remove all the mocks as well and use the real data ».
 *
 * Five orders, five kinds of assertion below — and every one of them reads the
 * MOUNTED tree or the RECORDED native call, never the source:
 *   1. the mocks are gone BY THEIR BYTES (the demo slug, the demo link, the
 *      frozen date) and the real ones stand in their place;
 *   2. the boutique link is on screen and SHARES;
 *   3. « Imprimer le code QR » opens the printable poster;
 *   4. the four channel buttons and the three format segments are absent —
 *      ONE share action per thing she can share;
 *   5. every action still reaches its next step.
 *
 * THE FIXTURE'S ONE TRICK, stated: the app mints her identity through the
 * deterministic crypto double, so the storefront id is the same every mount —
 * `sf-0258` — and the admin list can answer with HER row. If the mint ever
 * changes shape this fails loudly on « Partager » being unreachable, not
 * silently on a wrong id.
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

const storefront = () => ({
  id: SF_ID,
  resellerId: 'RS',
  slug: SLUG,
  discoverable: true,
  curatedItems: [PV],
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

/** CONTRACT-CERTIFIED to `storefront-service`: the list answers rows with id,
 *  slug and name; the by-id read answers the canon Storefront. */
const routes: Route[] = [
  (path) =>
    path === '/supply-projections'
      ? { status: 200, json: { offers: [offer()], diagnostic: { status: 'ok', refusals: [] } } }
      : null,
  (path) =>
    path === '/storefronts'
      ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: NOM }] as never }
      : null,
  (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
];

const LIEN_PRODUIT = `https://beurni2.github.io/shop-plus/s/${SLUG}?pid=${PV}`;
const LIEN_BOUTIQUE = `https://beurni2.github.io/shop-plus/v/${SLUG}`;

async function surPartager() {
  wire(routes);
  const screen = await mountApp();
  await screen.press('Ma Vitrine');
  expect(screen.shows('Bazin riche'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
  await screen.press('Partager');
  await screen.settle();
  return screen;
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

/**
 * THE DOUBLE'S RECORDS, FETCHED AFTER THE MOUNT — never statically. This file
 * runs `vi.resetModules()` per walk, so a top-level import would hold the
 * PRE-RESET instance while the mounted app records into a fresh one: every
 * « was it called » assertion would read an empty array over a call that
 * happened. The Séra keyboard double paid for this lesson first.
 */
async function natifs() {
  const { Share, Linking } = await import('./doubles/react-native');
  return { Share, Linking };
}

describe('PARTAGER-PRO — real bytes where the mocks stood', () => {
  it('the card carries HER shop, HER product, HER price — and none of the demo bytes', async () => {
    const screen = await surPartager();
    const lu = screen.texts().join(' | ');

    expect(lu, 'her real shop name leads the card').toContain(NOM);
    expect(lu).toContain('Bazin riche');
    expect(lu, 'the price line is on the card').toContain('Prix :');
    /**
     * THE MOCKS, ABSENT BY THEIR BYTES. `aicha-4821` is the demo shop the
     * founder once saw a real share open; `shop-plus.demo` was the dead link
     * box under « lien d'essai »; « 13 juillet » is the frozen demo clock that
     * stood where today's date belongs. (Today is not July — the walk would
     * need a fake clock only on that one day, and says so here.)
     */
    for (const demo of ['aicha-4821', 'shop-plus.demo', '13 juillet', "Lien d'essai"]) {
      expect(lu, `the demo byte « ${demo} » is still on the screen`).not.toContain(demo);
    }
    expect(lu, 'today’s validity line renders').toContain('Prix du ');
    screen.unmount();
  });

  it('the REAL links are on screen: the signed product link and the boutique link', async () => {
    const screen = await surPartager();
    const lu = screen.texts().join(' | ');
    expect(lu, 'the signed product link she sends').toContain(LIEN_PRODUIT);
    expect(lu, 'the boutique link — the durable one').toContain(LIEN_BOUTIQUE);
    screen.unmount();
  });

  it('ONE share action per thing — the four channel buttons and the segments are gone', async () => {
    const screen = await surPartager();
    const lu = screen.texts().join(' | ');
    for (const gone of [
      'Partager sur WhatsApp',
      'Partager sur Facebook',
      'Partager sur TikTok',
      'Copier le lien signé',
      'Carte WhatsApp',
      'Voir mes gains',
    ]) {
      expect(lu, `« ${gone} » is still on the screen`).not.toContain(gone);
    }
    expect(screen.canPress('Partager ce produit')).toBe(true);
    expect(screen.canPress('Partager ma boutique')).toBe(true);
    expect(screen.canPress('Imprimer le code QR')).toBe(true);
    screen.unmount();
  });

  it('« Partager ce produit » hands the OS sheet the product name and the signed link', async () => {
    const screen = await surPartager();
    const { Share } = await natifs();
    await screen.press('Partager ce produit');
    const dernier = Share.shared[Share.shared.length - 1] as { message?: string } | undefined;
    expect(dernier?.message, 'nothing reached the share sheet').toContain(LIEN_PRODUIT);
    expect(dernier?.message).toContain('Bazin riche');
    expect(screen.texts().length, 'the tree died on share').toBeGreaterThan(0);
    screen.unmount();
  });

  it('« Partager ma boutique » shares the boutique link — the founder’s new option', async () => {
    const screen = await surPartager();
    const { Share } = await natifs();
    await screen.press('Partager ma boutique');
    const dernier = Share.shared[Share.shared.length - 1] as { message?: string } | undefined;
    expect(dernier?.message, 'nothing reached the share sheet').toContain(LIEN_BOUTIQUE);
    expect(dernier?.message, 'the boutique share must not carry a product link').not.toContain('?pid=');
    screen.unmount();
  });

  it('« Imprimer le code QR » opens the printable poster — the browser prints', async () => {
    const screen = await surPartager();
    const { Linking } = await natifs();
    await screen.press('Imprimer le code QR');
    expect(
      Linking.opened[Linking.opened.length - 1],
      'the poster page was never opened',
    ).toBe(`${LIEN_BOUTIQUE}?affiche=qr`);
    screen.unmount();
  });

  it('the QR on screen encodes HER boutique — the component is handed the real url', async () => {
    const screen = await surPartager();
    const { QrCode } = await import('../src/qr/QrCode');
    const qrs = screen.tree.root.findAllByType(QrCode);
    expect(qrs, 'exactly one QR on the screen').toHaveLength(1);
    expect(qrs[0]!.props['url'], 'the QR encodes a url that is not hers').toBe(LIEN_BOUTIQUE);
    screen.unmount();
  });

  it('the SP-I03 gate fixture IS this card — pinned to the rendered screen, never a factory', async () => {
    /**
     * `gates/fixtures/customer-surfaces/share-card.json` is what the gate
     * board scans for supplier/commission keys (SP-I03). It was pinned to the
     * retired `composeShareCard` factory; it is pinned HERE now, to the bytes
     * the MOUNTED screen shows the cliente. The validity date is the one card
     * byte deliberately absent from the fixture: it is « today », not a
     * frozen clock, so no fixture byte could stay equal to it.
     */
    const fixture = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../../../gates/fixtures/customer-surfaces/share-card.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(fixture['nomBoutique']).toBe(NOM);
    expect(fixture['lienProduit']).toBe(LIEN_PRODUIT);
    expect(fixture['lienBoutique']).toBe(LIEN_BOUTIQUE);
    expect(fixture['livreParSera']).toBe(true);
    const screen = await surPartager();
    const lu = screen.texts().join(' | ');
    expect(lu, 'the fixture product is not the rendered product').toContain(String(fixture['produit']));
    expect(lu, 'the fixture price is not the rendered client price').toContain(
      formatFcfa(fixture['prixClientFcfa'] as number),
    );
    expect(lu, 'the fixture spoken code is not the rendered code').toContain(String(fixture['codeDit']));
    screen.unmount();
  });
});
