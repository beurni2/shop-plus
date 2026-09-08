import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — VITRINE-VISIBLE-1 (AUDIT-SHOP-2 F-13): the Privée ⇄ Publique
 * toggle on Ma Vitrine reads and WRITES the service's flag ═══
 *
 * The audit WALKED the bug (walk A): shop `discoverable: true`, the toggle
 * said « Privée »; press → toast « Votre boutique apparaît dans Découvrir »,
 * label « Publique », ZERO writes. A success message over a silent no-op is
 * the fabricated-success shape this project refuses everywhere else.
 *
 * The four questions: the tree survives the tap · the toggle is present,
 * pressable and wired to the publish/unpublish port · a refused write leaves
 * the label where the service holds it and says so · the label lands on the
 * read-back. The double is contract-certified to `storefront-do.ts`'s toggle
 * decision: `{status:'changed'|'unchanged', storefront}`.
 */

const PV = 'pv-bazin';

/** `version` stamps `updatedAt`: the app's adopter is forward-only (it refuses
 *  an answer older than the one it holds), so every write must move the clock
 *  — exactly as the real object does. */
function storefront(discoverable: boolean, version = 0) {
  return {
    id: 'SF', resellerId: 'RS', slug: 'boutique-0001', discoverable, curatedItems: [PV],
    name: 'Boutique test', zone: 'Ouagadougou', category: 'mode',
    createdAt: '2026-08-11T08:00:00.000Z', updatedAt: `2026-08-11T08:00:0${String(version)}.000Z`,
    tagline: '', bio: '', cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite',
    sections: [], featuredItems: [], headerStyle: 'classique', productNotes: {},
  };
}

/** The service, stateful: the flag lives HERE and only a write moves it. */
function service(initial: boolean, drapeaux: { refuser?: boolean } = {}) {
  const state = { discoverable: initial, writes: 0 };
  const routes: Route[] = [
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
    (path) => {
      const m = /^\/storefronts\/[^/]+\/(publish|unpublish)$/.exec(path);
      if (m === null) return null;
      state.writes += 1;
      if (drapeaux.refuser === true) return { status: 500, json: { error: 'internal' } };
      const vers = m[1] === 'publish';
      // the REAL decision: `changed` moves the flag and carries the shop as it now stands
      state.discoverable = vers;
      return { status: 200, json: { status: 'changed', storefront: storefront(vers, state.writes) as never } };
    },
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
    (path) => (/^\/storefronts\/[^/]+$/.test(path) ? { status: 200, json: storefront(state.discoverable, state.writes) as never } : null),
  ];
  return { routes, state };
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('VITRINE-VISIBLE-1 — the label is the service\'s flag, and a press is a real write', () => {
  it('a shop the service says PUBLIQUE shows « Publique » (the audit saw « Privée »); press → POST unpublish → « Privée », the toast, ONE write', async () => {
    const svc = service(true);
    const fils = wire(svc.routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');

    expect(screen.shows('Bazin riche'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.shows('Publique'), 'the label must read the SERVICE, not a session-local flag').toBe(true);
    expect(screen.shows('Privée')).toBe(false);
    expect(svc.state.writes, 'reading the toggle writes nothing').toBe(0);

    expect(screen.canPress('Publique')).toBe(true);
    await screen.press('Publique');
    for (let i = 0; i < 6 && !screen.shows('Privée'); i += 1) await screen.settle();

    const ecrit = fils.calls.find((c) => /\/unpublish$/.test(c.path));
    expect(ecrit, 'the press must reach the service').toBeDefined();
    expect(ecrit!.method).toBe('POST');
    expect(svc.state.writes).toBe(1);
    expect(svc.state.discoverable, 'the service holds the new flag').toBe(false);
    expect(screen.shows('Privée'), 'the label follows the read-back').toBe(true);
    expect(screen.shows('Vitrine privée — accessible par lien seulement'), 'the toast, on a CONFIRMED write').toBe(true);

    // …and back: the other door of the same act.
    await screen.press('Privée');
    for (let i = 0; i < 6 && !screen.shows('Publique'); i += 1) await screen.settle();
    expect(fils.calls.some((c) => /\/publish$/.test(c.path) && c.method === 'POST')).toBe(true);
    expect(svc.state.writes).toBe(2);
    expect(screen.shows('Publique')).toBe(true);
    expect(screen.shows('Votre boutique apparaît dans Découvrir')).toBe(true);
    screen.unmount();
  });

  it('the service REFUSES the write → the label stays where the service holds it, the toast says it did not change — never a fake success', async () => {
    const svc = service(true, { refuser: true });
    const fils = wire(svc.routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    expect(screen.shows('Publique')).toBe(true);

    await screen.press('Publique');
    for (let i = 0; i < 6 && !screen.shows("Votre boutique n'a pas changé. Réessayez dans un moment."); i += 1) await screen.settle();
    expect(fils.calls.some((c) => /\/unpublish$/.test(c.path)), 'the write was attempted').toBe(true);
    expect(screen.shows("Votre boutique n'a pas changé. Réessayez dans un moment.")).toBe(true);
    expect(screen.shows('Publique'), 'the label does not move on a refusal').toBe(true);
    expect(screen.shows('Vitrine privée — accessible par lien seulement'), 'no success toast over a refused write').toBe(false);
    // the way out: the toggle is pressable again
    expect(screen.canPress('Publique')).toBe(true);
    screen.unmount();
  });

  it('a shop the service says PRIVÉE opens on « Privée » — the label is read, not defaulted', async () => {
    const svc = service(false);
    wire(svc.routes);
    const screen = await mountApp();
    await screen.press('Ma Vitrine');
    expect(screen.shows('Privée')).toBe(true);
    expect(screen.shows('Publique')).toBe(false);
    screen.unmount();
  });
});
