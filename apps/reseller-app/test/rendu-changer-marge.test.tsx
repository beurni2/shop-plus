import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { formatFcfa } from '../src/earnings';

/**
 * ═══ RENDU-RÉEL — CHANGER-MARGE-1 (founder « go 1 and 2 », 2026-10-01): she
 * can change the price of a product she already sells ═══
 *
 * Canon SP-I19: « markup changes expire old cards (never silent edits) and
 * require regeneration; the signed page remains the live price/stock truth ».
 * The service already signs a new VERSION for a new command (listing-core:
 * « REPUBLISH IS A NEW VERSION, NEVER A MUTATION »); the app pinned every
 * publish to one command, so her price could never change. Walked here:
 *   · her card states the marge the service SIGNED and the commission frozen
 *     with it — not « signed price − today's base » (which lied once the
 *     supplier's base moved);
 *   · « Changer ma marge » → the control, the warning about messages already
 *     sent, the new price → « Signer ce nouveau prix » sends a command of its
 *     own (never the pinned one) and the card then reads the price the
 *     service signed;
 *   · no network → said, nothing kept; a refusal → its own sentence; a second
 *     tap while sending sends nothing twice; « Annuler » sends nothing.
 * Only `fetch` is faked, certified to the Worker's answers: `GET
 * /listings/by-pid/{sf}/{pid}/economics` → the listing as stored (`{ listing:
 * { id, productVersionId, markup, version, status }, customerPriceFcfa,
 * resellerCommission }`) or 404; `POST /listings` → `{ status }` or
 * `{ error, cap? }`. The walk claims nothing about appearance.
 */

const PV = 'pv-bazin';
const SF_ID = 'sf-0258';
const SLUG = 'boutique-0001';
const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';
const LISTING = `lst-${SF_ID}-${PV}`;

type Porte = { mode: 'ok' | 'reseau' | 'plafond' | 'retenue' | 'session'; relacher?: () => void; envois: Record<string, unknown>[] };
type Signe = { markup: number; version: number; prix: number; commission: number } | null;

/**
 * `baseServeur`: the base the SERVICE signs against — the supply can move
 * between her preview and the signing, so the walk can tell « the card took
 * the service's price » from « the card did its own sum ». `lecturesEnPanne`:
 * how many signed-listing reads fail (500) after a signing.
 */
function monde(
  porte: Porte,
  opts: { base?: number; signe?: Signe; baseServeur?: number; lecturesEnPanne?: number } = {},
): { routes: Route[]; etat: { signe: Signe; enPanne: number } } {
  const base = opts.base ?? 10_000;
  const baseServeur = opts.baseServeur ?? base;
  const etat = { signe: opts.signe === undefined ? { markup: 2_000, version: 1, prix: 12_000, commission: 1_000 } : opts.signe, enPanne: 0 };
  const routes: Route[] = [
    (path) =>
      path === '/supply-projections'
        ? {
            status: 200,
            json: {
              offers: [{ productVersionId: PV, offerVersion: 'ov-1', basePrice: base, resellerCommission: 1_000, available: 5, productName: 'Bazin riche', assetRefs: [] as string[], category: 'mode' }],
              diagnostic: { status: 'ok', refusals: [] },
            },
          }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [{ id: SF_ID, slug: SLUG, name: 'Boutique test' }] as never } : null),
    (path) =>
      /^\/storefronts\/[^/]+$/.test(path)
        ? {
            status: 200,
            json: {
              id: SF_ID, resellerId: 'RS', slug: SLUG, discoverable: true, curatedItems: [PV], name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
              createdAt: '2026-08-15T08:00:00.000Z', updatedAt: '2026-08-15T08:00:00.000Z', tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' },
              theme: 'laterite', sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
            } as never,
          }
        : null,
    (path) => {
      if (!/^\/listings\/by-pid\/[^/]+\/[^/]+\/economics$/.test(path)) return null;
      if (etat.enPanne > 0) {
        etat.enPanne -= 1;
        return { status: 500, json: { error: 'internal' } };
      }
      const s = etat.signe;
      if (s === null) return { status: 404, json: { error: 'not_found' } };
      return {
        status: 200,
        json: {
          listing: { id: LISTING, resellerId: 'RS', productVersionId: PV, offerVersion: 'ov-1', markup: s.markup, version: s.version, variants: [], status: 'published' },
          storefrontId: SF_ID, publishCommandId: 'publish-x', customerPriceFcfa: s.prix, resellerCommission: s.commission,
        } as never,
      };
    },
    (path, body) => {
      if (path !== '/listings') return null;
      porte.envois.push(body ?? {});
      if (porte.mode === 'reseau') throw new TypeError('Network request failed');
      if (porte.mode === 'plafond') return { status: 400, json: { error: 'markup_over_cap', cap: 5_000 } };
      if (porte.mode === 'session') return { status: 401, json: { error: 'unauthorized' } };
      const signer = () => {
        const m = Number(body?.['markup']);
        etat.signe = { markup: m, version: (etat.signe?.version ?? 0) + 1, prix: baseServeur + m, commission: 1_000 };
        etat.enPanne = opts.lecturesEnPanne ?? 0;
        return { status: 200, json: { status: 'published' } };
      };
      if (porte.mode === 'retenue') {
        return new Promise((resolve) => {
          porte.relacher = () => resolve(signer());
        });
      }
      return signer();
    },
  ];
  return { routes, etat };
}

const margeChamps = (screen: Awaited<ReturnType<typeof mountApp>>) =>
  screen.tree.root.findAllByType('TextInput' as never).filter((i) => String(i.props['accessibilityLabel'] ?? '').includes('Vous ajoutez'));

async function laisser(screen: Awaited<ReturnType<typeof mountApp>>, n = 8): Promise<void> {
  for (let i = 0; i < n; i += 1) await screen.settle();
}

async function surVitrine(routes: Route[]) {
  wire(routes);
  const screen = await mountApp();
  await screen.press('Ma Vitrine');
  await laisser(screen, 10);
  return screen;
}

async function ouvrirEtTaper(screen: Awaited<ReturnType<typeof mountApp>>, m: string): Promise<void> {
  await screen.press('Changer ma marge');
  await screen.settle();
  await screen.type(m, 'Vous ajoutez');
  await screen.settle();
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

describe('CHANGER-MARGE-1 — her card states what the service signed', () => {
  it('signed 12 500 at marge 2 500 with commission 1 200; since then the base moved to 10 500 and the live commission is 1 000: the card says marge 2 500 and net 3 700 — never 2 000 / 3 000', async () => {
    const screen = await surVitrine(
      monde({ mode: 'ok', envois: [] }, { base: 10_500, signe: { markup: 2_500, version: 1, prix: 12_500, commission: 1_200 } }).routes,
    );
    // EXACT lines: `shows` matches inside a line, and « 2 500 FCFA » sits inside « 12 500 FCFA ».
    const ligne = (s: string) => screen.texts().includes(s);
    expect(ligne(formatFcfa(12_500)), `the signed price; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(ligne(formatFcfa(2_500)), 'her signed marge').toBe(true);
    // net = C + M (FRAIS-ZERO: the fee rate is 0) — the frozen C, the signed M
    expect(ligne(formatFcfa(3_700)), 'her net on the signed marge and the frozen commission').toBe(true);
    expect(ligne(formatFcfa(2_000)), 'signed price − today’s base is not her marge').toBe(false);
    expect(ligne(formatFcfa(3_000)), 'nor is a net on the live commission').toBe(false);
    screen.unmount();
  });

  it('a product with no signed listing keeps its marge control and offers no « Changer ma marge »', async () => {
    const screen = await surVitrine(monde({ mode: 'ok', envois: [] }, { signe: null }).routes);
    expect(margeChamps(screen)).toHaveLength(1);
    expect(screen.canPress('Changer ma marge')).toBe(false);
    screen.unmount();
  });
});

describe('CHANGER-MARGE-1 — « Changer ma marge » signs a new price', () => {
  it('the control, the warning, the new price; « Signer » sends a command of its own; the card then reads the price the service signed — not her preview; Partager says it', async () => {
    const porte: Porte = { mode: 'ok', envois: [] };
    // the supply moved by 100 between her preview and the signing: only a read-back can know
    const screen = await surVitrine(monde(porte, { baseServeur: 10_100 }).routes);
    expect(margeChamps(screen), 'no field before she asks').toHaveLength(0);
    await ouvrirEtTaper(screen, '2400');
    expect(margeChamps(screen)).toHaveLength(1);
    expect(screen.shows('Les messages déjà envoyés gardent l’ancien prix')).toBe(true);
    expect(screen.shows(`Nouveau prix cliente : ${formatFcfa(12_400)}`)).toBe(true);
    expect(porte.envois, 'nothing is sent while she types').toHaveLength(0);
    await screen.press('Signer ce nouveau prix');
    await laisser(screen);
    expect(porte.envois).toHaveLength(1);
    expect(porte.envois[0]?.['markup']).toBe(2_400);
    expect(porte.envois[0]?.['commandId'], 'never the pinned publish command').toBe(`marge-${LISTING}-v2-m2400`);
    expect('customerPriceFcfa' in (porte.envois[0] ?? {}), 'the app never sends a price').toBe(false);
    expect(screen.shows(`Nouveau prix signé : ${formatFcfa(12_500)}`), 'the price the SERVICE signed').toBe(true);
    expect(margeChamps(screen), 'the editor closes on the signed price').toHaveLength(0);
    expect(screen.texts().includes(formatFcfa(12_500)), 'her card reads the price read back').toBe(true);
    expect(screen.texts().includes(formatFcfa(12_400)), 'never her own sum').toBe(false);
    expect(screen.shows(formatFcfa(12_000)), 'the old price is gone from her card').toBe(false);
    await screen.press('Partager');
    await screen.settle();
    expect(screen.texts().join(' | ')).toContain(`Prix : ${formatFcfa(12_500)}`);
    screen.unmount();
  });

  it('no network: said plainly, nothing kept for later, her card keeps the signed price and the editor keeps what she typed', async () => {
    const porte: Porte = { mode: 'reseau', envois: [] };
    const screen = await surVitrine(monde(porte).routes);
    await ouvrirEtTaper(screen, '2400');
    await screen.press('Signer ce nouveau prix');
    await laisser(screen);
    expect(screen.shows('Il faut du réseau pour changer un prix')).toBe(true);
    expect(screen.shows('envoi attend'), 'a price change is never kept on the phone').toBe(false);
    expect(screen.shows(formatFcfa(12_000))).toBe(true);
    expect(margeChamps(screen)[0]?.props['value']).toBe('2400');
    screen.unmount();
  });

  it('over the cap: the service’s own sentence, nothing changes', async () => {
    const porte: Porte = { mode: 'plafond', envois: [] };
    const screen = await surVitrine(monde(porte).routes);
    await ouvrirEtTaper(screen, '2400');
    await screen.press('Signer ce nouveau prix');
    await laisser(screen);
    expect(screen.shows('Ce montant dépasse le plafond')).toBe(true);
    expect(screen.shows(formatFcfa(12_000))).toBe(true);
    screen.unmount();
  });

  it('while it is sending: « Envoi en cours… », and a second tap sends nothing twice', async () => {
    const porte: Porte = { mode: 'retenue', envois: [] };
    const screen = await surVitrine(monde(porte).routes);
    await ouvrirEtTaper(screen, '2400');
    await screen.press('Signer ce nouveau prix');
    await screen.settle();
    expect(screen.shows('Envoi en cours…')).toBe(true);
    expect(screen.canPress('Signer ce nouveau prix')).toBe(false);
    expect(screen.canPress('Envoi en cours…'), 'the button in flight cannot be pressed again').toBe(false);
    expect(porte.envois).toHaveLength(1);
    porte.relacher!();
    await laisser(screen);
    expect(screen.shows(`Nouveau prix signé : ${formatFcfa(12_400)}`)).toBe(true);
    screen.unmount();
  });

  it('« Annuler » closes the editor and sends nothing; the same marge cannot be « signed » again', async () => {
    const porte: Porte = { mode: 'ok', envois: [] };
    const screen = await surVitrine(monde(porte).routes);
    await screen.press('Changer ma marge');
    await screen.settle();
    expect(screen.canPress('Signer ce nouveau prix'), 'her signed marge is not a change').toBe(false);
    await screen.press('Annuler');
    await screen.settle();
    expect(margeChamps(screen)).toHaveLength(0);
    expect(porte.envois).toHaveLength(0);
    screen.unmount();
  });
});

/** The ONE verifier pass on this slice; each written red first against `075efd8`. */
describe('CHANGER-MARGE-1 — the verifier’s findings, walked', () => {
  it('MAJOR 1 — an add still waiting on her phone: no « Changer ma marge » until it has gone (its replay would sign the old marge over the new)', async () => {
    const { expoFileAttenteStore } = await import('../src/offline/expoStore');
    await expoFileAttenteStore().write(JSON.stringify({
      version: 1,
      entries: [{ name: 'listing.publish', pid: PV, payload: { markup: 2_000, nom: 'Bazin riche' }, status: 'pending', attempts: 0, enqueuedAt: 1 }],
    }));
    const porte: Porte = { mode: 'reseau', envois: [] }; // the replay cannot land: the add keeps waiting
    const screen = await surVitrine(monde(porte).routes);
    expect(screen.shows('En attente d’envoi'), `the waiting chip; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress('Changer ma marge')).toBe(false);
    screen.unmount();
  });

  it('MAJOR 2 — the editor says her new gain first (the new price takes today’s commission): 2 600 on today’s 1 000 → « Votre nouveau gain : 3 600 FCFA », before the new price', async () => {
    const screen = await surVitrine(
      monde({ mode: 'ok', envois: [] }, { base: 10_500, signe: { markup: 2_500, version: 1, prix: 12_500, commission: 1_200 } }).routes,
    );
    await ouvrirEtTaper(screen, '2600');
    const lignes = screen.texts();
    const gain = lignes.findIndex((t) => t.includes(`Votre nouveau gain : ${formatFcfa(3_600)}`));
    const prix = lignes.findIndex((t) => t.includes(`Nouveau prix cliente : ${formatFcfa(13_100)}`));
    expect(gain, `on screen: ${JSON.stringify(lignes)}`).toBeGreaterThan(-1);
    expect(prix).toBeGreaterThan(-1);
    expect(gain, 'net first').toBeLessThan(prix);
    screen.unmount();
  });

  it('MAJOR 3 + MINOR 2 — signed, but the read-back fails: « Nouveau prix envoyé… », her card does not move on its own sum, and Partager reads the price before quoting it', async () => {
    const screen = await surVitrine(monde({ mode: 'ok', envois: [] }, { lecturesEnPanne: 1 }).routes);
    await ouvrirEtTaper(screen, '2400');
    await screen.press('Signer ce nouveau prix');
    await laisser(screen);
    expect(screen.shows('Nouveau prix envoyé. Rouvrez Ma vitrine pour le voir.')).toBe(true);
    expect(screen.texts().includes(formatFcfa(12_400)), 'no price the service has not been read for').toBe(false);
    await screen.press('Partager');
    await laisser(screen);
    expect(screen.texts().join(' | ')).toContain(`Prix : ${formatFcfa(12_400)}`);
    screen.unmount();
  });

  it('MINOR 1 — while the new price is being signed, « Retirer de ma vitrine » waits (a removal landing first would be undone by the signing)', async () => {
    const porte: Porte = { mode: 'retenue', envois: [] };
    const screen = await surVitrine(monde(porte).routes);
    await ouvrirEtTaper(screen, '2400');
    await screen.press('Signer ce nouveau prix');
    await screen.settle();
    expect(screen.canPress('Retirer de ma vitrine')).toBe(false);
    porte.relacher!();
    await laisser(screen);
    expect(screen.canPress('Retirer de ma vitrine')).toBe(true);
    screen.unmount();
  });

  it('MINOR 1, the other way — while a removal is in flight, « Signer ce nouveau prix » waits (a signing landing after it would put the product back)', async () => {
    let relacherRetrait: (() => void) | undefined;
    const retrait: Route = (path) =>
      path.endsWith('/items/remove')
        ? new Promise((resolve) => { relacherRetrait = () => resolve({ status: 500, json: { error: 'boom' } }); })
        : null;
    const screen = await surVitrine([retrait, ...monde({ mode: 'ok', envois: [] }).routes]);
    await ouvrirEtTaper(screen, '2400');
    expect(screen.canPress('Signer ce nouveau prix')).toBe(true);
    await screen.press('Retirer de ma vitrine');
    await screen.settle();
    expect(screen.canPress('Signer ce nouveau prix')).toBe(false);
    relacherRetrait!();
    await laisser(screen);
    expect(screen.canPress('Signer ce nouveau prix'), 'the removal answered: she can sign again').toBe(true);
    screen.unmount();
  });

  it('MINOR 3 — a session the service no longer knows is sent to the session road, as every refused write is', async () => {
    const porte: Porte = { mode: 'session', envois: [] };
    wire(monde(porte).routes);
    const fils = wire(monde(porte).routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    await laisser(screen, 10);
    await ouvrirEtTaper(screen, '2400');
    await screen.press('Signer ce nouveau prix');
    await laisser(screen);
    expect(fils.calls.some((c) => c.path === '/reseller/session'), 'the session road is asked').toBe(true);
    screen.unmount();
  });

  it('MINOR 4 + MINOR 6 — no « new price » before she changes the marge; no « Annuler » that does nothing while sending', async () => {
    const porte: Porte = { mode: 'retenue', envois: [] };
    const screen = await surVitrine(monde(porte).routes);
    await screen.press('Changer ma marge');
    await screen.settle();
    expect(screen.shows('Nouveau prix cliente'), 'her signed marge is not a new price').toBe(false);
    await screen.type('2400', 'Vous ajoutez');
    await screen.settle();
    await screen.press('Signer ce nouveau prix');
    await screen.settle();
    expect(screen.canPress('Annuler')).toBe(false);
    porte.relacher!();
    await laisser(screen);
    screen.unmount();
  });
});
