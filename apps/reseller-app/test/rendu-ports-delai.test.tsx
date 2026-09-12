import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { DELAI_LECTURE_MS } from '../src/vitrine/fetch-borne';

/**
 * ═══ RENDU-RÉEL — PORTS-DELAI-1 (AUDIT-SHOP-2 F-15, F-18) on the mounted App ═══
 *
 * F-15, walked by the audit (walk C): `/listings` held for ever → « Envoi en
 * cours… », no sentence, the CTA `canPress === false`; back, reopen → still
 * disabled, for the session. Now every port call ends at its ceiling and the
 * in-flight flag is released in `finally`, so the primary action comes back.
 *
 * F-18, walked by the audit (walk D1): five tabs on a dead wire → `GET
 * /storefronts` asked FIVE times. A failed read is now answered-with-fault and
 * re-asked only on entering a screen that shows the badge.
 *
 * The fake `fetch` HONOURS the abort signal — a fake that did not would make a
 * ceiling look present while nothing could ever end. Only `fetch` is faked.
 */

const PV = 'pv-bazin';

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

/** Hold ONE path for ever — until the caller's own signal aborts it. */
function pendreSur(cheminTenu: string): void {
  const enregistre = (globalThis as { fetch: (u: string, i?: RequestInit) => Promise<Response> }).fetch;
  (globalThis as { fetch: unknown }).fetch = (u: string, i?: RequestInit): Promise<Response> => {
    const p = enregistre(u, i);
    if (new URL(u, 'http://shop.test').pathname !== cheminTenu) return p;
    return new Promise<Response>((_resolve, reject) => {
      i?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  };
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  vi.useRealTimers();
});

describe('PORTS-DELAI-1 (F-15) — a stalled publish ends, and the primary action comes back', () => {
  it('/listings held → « Envoi en cours… » → at the ceiling the wait ends: the pending sentence is gone and the intent is KEPT with its way out', async () => {
    vi.useFakeTimers();
    const fils = wire(routesDeBase);
    pendreSur('/listings');
    const screen = await mountApp();
    await screen.press('Opportunités');
    await screen.press('Bazin riche');
    expect(screen.canPress('Ajouter à ma vitrine')).toBe(true);

    await screen.press('Ajouter à ma vitrine');
    expect(fils.calls.some((c) => c.path === '/listings' && c.method === 'POST'), 'the publish left the phone').toBe(true);
    // In flight: the honest pending state, the CTA asleep.
    expect(screen.shows('Envoi en cours…')).toBe(true);
    expect(screen.canPress('Ajouter à ma vitrine')).toBe(false);

    // One tick short of the ceiling: still waiting — the ceiling is the ceiling.
    await vi.advanceTimersByTimeAsync(DELAI_LECTURE_MS - 1);
    await screen.settle();
    expect(screen.canPress('Ajouter à ma vitrine'), 'not before the ceiling').toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    // PIN EVOLVED (FILE-ATTENTE-1, F-17b): a publish the ceiling ended is the
    // network's refusal, and the intent is now KEPT rather than dropped — the
    // way out is the waiting card's « Annuler l’ajout » on Ma Vitrine, where
    // the kept add lands her. What this pin still owns: the wait ENDS at the
    // ceiling, « Envoi en cours… » is gone, and nothing is claimed as added.
    for (let i = 0; i < 8 && !screen.canPress('Annuler l’ajout'); i += 1) await screen.settle();
    expect(screen.canPress('Annuler l’ajout'), 'the way out: the kept intent, with its cancel').toBe(true);
    expect(screen.shows('Envoi en cours…')).toBe(false);
    // …and NOTHING was recorded as added: no fabricated membership — the card
    // that landed says it WAITS.
    expect(screen.shows('Ce produit est déjà dans votre vitrine.')).toBe(false);
    expect(screen.shows('C’est ajouté à votre vitrine.')).toBe(false);
    expect(screen.shows('En attente d’envoi')).toBe(true);
    screen.unmount();
  });
});

describe('PORTS-DELAI-1 (F-18) — a failed directory read is not re-asked on every tab', () => {
  it('every route 401 → five tabs cost TWO directory reads (accueil at launch, Ma Vitrine on entering), not five', async () => {
    const fils = wire([
      (path) => (path === '/supply-projections' ? { status: 401, json: { error: 'unauthorized' } } : null),
      (path) => (path === '/storefronts' ? { status: 401, json: { error: 'unauthorized' } } : null),
      (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 401, json: { error: 'unauthorized' } } : null),
    ]);
    const screen = await mountApp();
    const lectures = () => fils.calls.filter((c) => c.path === '/storefronts' && c.method === 'GET').length;
    expect(lectures(), 'the launch read (accueil shows the badge)').toBe(1);

    await screen.press('Opportunités');
    expect(lectures(), 'a tab without the badge does not re-ask').toBe(1);
    await screen.press('Ma Vitrine');
    expect(lectures(), 'entering Ma Vitrine is the deliberate retry').toBe(2);
    await screen.press('Gains');
    expect(lectures()).toBe(2);
    await screen.press('Profil');
    expect(lectures()).toBe(2);
    screen.unmount();
  });

  it('CONTROL — a read that ANSWERS is stable: five tabs, one read', async () => {
    const fils = wire(routesDeBase);
    const screen = await mountApp();
    const lectures = () => fils.calls.filter((c) => c.path === '/storefronts' && c.method === 'GET').length;
    await screen.press('Opportunités');
    await screen.press('Ma Vitrine');
    await screen.press('Gains');
    await screen.press('Profil');
    expect(lectures()).toBe(1);
    screen.unmount();
  });
});
