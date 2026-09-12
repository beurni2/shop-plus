import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — VOIX-LIMITE-1 (AUDIT-SHOP-2 F-48): the note has a length
 * on the phone, and a refusal says its own name ═══
 *
 * The service refuses a take longer than a minute (`bad_duration`) or larger
 * than its byte cap (`too_large`). The phone had NO cap of its own: she could
 * talk for three minutes, tap Publier, and read « Note pas envoyée. Réessayez
 * dans un moment. » — a retry sentence for a note that can never be accepted,
 * on a road with no way to learn why. Two fixes, both walked on the real
 * screen with only `fetch` faked and the expo-audio double yielding its
 * canned take:
 *   · the take STOPS BY ITSELF at the minute and says so — she gets her take,
 *     not a refusal;
 *   · a too-long / too-large refusal from the service is named — « Note trop
 *     longue. Refaites-la… » — instead of « réessayez ».
 */

const PV_A = 'pv-bazin';
const NOTE_URL = 'https://media.test/voice/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.m4a';
const TROP_LONGUE = 'Note trop longue';
const LIMITE = 'Une minute, c’est la limite';

const offer = () => ({
  productVersionId: PV_A,
  offerVersion: 'ov-1',
  basePrice: 10_000,
  resellerCommission: 1_000,
  available: 5,
  productName: 'Bazin riche',
  assetRefs: [],
  category: 'mode',
});

function storefront(productNotes: Record<string, unknown> = {}) {
  return {
    id: 'SF', resellerId: 'RS', slug: 'boutique-0001', discoverable: true, curatedItems: [PV_A],
    name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
    createdAt: '2026-08-11T08:00:00.000Z', updatedAt: '2026-08-11T08:00:00.000Z',
    tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
    sections: [], featuredItems: [], headerStyle: 'classique', productNotes,
  };
}

/** The service, CONTRACT-CERTIFIED to `handleMediaUpload`: a refused upload is
 *  a 400 carrying the validator's NAMED reason — `bad_duration` past the minute
 *  (media/service.ts), `too_large` past the byte cap. */
function serviceQuiRefuse(reason: 'bad_duration' | 'too_large'): { routes: Route[]; uploads: number } {
  const compteur = { routes: [] as Route[], uploads: 0 };
  compteur.routes = [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: [offer()], diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) => {
      if (path !== '/media/upload') return null;
      compteur.uploads += 1;
      return { status: 400, json: { service: 'storefront-service', error: reason } };
    },
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
  ];
  return compteur;
}

function serviceQuiAccepte(): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? { status: 200, json: { offers: [offer()], diagnostic: { status: 'ok', refusals: [] } } }
        : null,
    (path) =>
      path === '/media/upload'
        ? { status: 201, json: { service: 'storefront-service', kind: 'voice', status: 'live', url: NOTE_URL, durationMs: 60_000 } }
        : null,
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront() as never } : null),
  ];
}

async function ouvrirLaNote(): Promise<Awaited<ReturnType<typeof mountApp>>> {
  const screen = await mountApp();
  await screen.press('Ma Vitrine');
  await screen.press('Note vocale');
  return screen;
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('VOIX-LIMITE-1 (F-48) — the refusal says its name', () => {
  for (const reason of ['bad_duration', 'too_large'] as const) {
    it(`the service answers ${reason}: she reads « ${TROP_LONGUE} », not « réessayez », and can redo the take`, async () => {
      const svc = serviceQuiRefuse(reason);
      wire(svc.routes);
      const screen = await ouvrirLaNote();
      await screen.press('Enregistrer une note');
      await screen.press('Arrêter');
      await screen.press('Publier');
      await screen.settle();
      await screen.settle();
      expect(svc.uploads, 'the upload reached the service').toBe(1);
      expect(screen.shows(TROP_LONGUE), `on screen: ${JSON.stringify(screen.texts().slice(-12))}`).toBe(true);
      expect(screen.shows('Réessayez dans un moment'), 'a retry sentence for a note that can never be accepted').toBe(false);
      // the way out: the take is back in her hands, « Refaire » is pressable
      expect(screen.canPress('Refaire')).toBe(true);
      screen.unmount();
    });
  }
});

describe('VOIX-LIMITE-1 (F-48) — the take stops by itself at the minute', () => {
  it('60 s into a take: the recording ends, she is told, and « Publier » is in her hands', async () => {
    const fils = wire(serviceQuiAccepte());
    const screen = await ouvrirLaNote();
    vi.useFakeTimers();
    await screen.press('Enregistrer une note');
    expect(screen.shows('Enregistrement…'), 'the take is running').toBe(true);
    // the limit fires at the minute; the native recorder takes a moment to
    // stop, so the clock the take reads is a little PAST it — the real phone.
    await act(async () => {
      vi.advanceTimersByTime(60_050);
      await Promise.resolve();
    });
    await screen.settle();
    await screen.settle();
    expect(screen.shows('Enregistrement…'), 'the take must have stopped by itself').toBe(false);
    expect(screen.shows(LIMITE), `she must be told — on screen: ${JSON.stringify(screen.texts().slice(-12))}`).toBe(true);
    expect(screen.canPress('Publier'), 'the take is hers to publish').toBe(true);
    // …and what leaves the phone is a take the service accepts: the duration
    // it carries never exceeds the minute the service refuses beyond.
    await screen.press('Publier');
    await act(async () => {
      await Promise.resolve();
    });
    await screen.settle();
    await screen.settle();
    const ups = fils.calls.filter((c) => c.path === '/media/upload');
    expect(ups, 'Publier reached the service').toHaveLength(1);
    const duree = Number(/durationMs=(\d+)/.exec(ups[0]!.search)?.[1]);
    expect(duree, `durationMs on the wire: ${ups[0]!.search}`).toBeGreaterThan(0);
    expect(duree).toBeLessThanOrEqual(60_000);
    screen.unmount();
  });
});
