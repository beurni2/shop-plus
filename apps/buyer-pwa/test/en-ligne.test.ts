import { describe, expect, it } from 'vitest';
import { refusVue } from '../src/cliente/screens';
import { httpStorefrontPort, VitrinePause } from '../src/vitrine/profile';
import { renderVitrinePause } from '../src/vitrine/render';

/**
 * ═══ EN-LIGNE-1 — a boutique that is not en ligne is closed to buyers
 * (founder ruling 2026-10-02; canon 3.27.0 §4.1), on the buyer's side ═══
 *
 * The service answers a closed shop's page `{ horsLigne: true, name }` on a
 * 200 and refuses its quote `boutique_hors_ligne` (both pinned on workerd by
 * `services/storefront-service/test/en-ligne.e2e.test.ts`). This app must hear
 * the flag as its OWN closed card — never the pause's wording, never
 * « lien invalide », never a shop — and name the refusal with no button.
 *
 * DOUBLES: `globalThis.fetch` for the storefront port, a scripted 200 body —
 * it claims nothing about appearance.
 */

function avecFetch<T>(body: unknown, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const visible = (html: string): string => html.replace(/<[^>]+>/g, ' ');

describe('the storefront port — « pas en ligne » is raised as the CLOSED card, with her name', () => {
  const port = httpStorefrontPort('https://svc.example');

  it('`{ horsLigne: true, name }` raises VitrinePause with raison hors_ligne; the pause keeps its own raison', async () => {
    const ferme = await avecFetch({ service: 'storefront-service', horsLigne: true, name: 'Chez Awa', slug: 'awa-1234' }, () =>
      port.resolve('awa-1234').then(() => null, (e: unknown) => e),
    );
    expect(ferme).toBeInstanceOf(VitrinePause);
    expect((ferme as VitrinePause).nom).toBe('Chez Awa');
    expect((ferme as VitrinePause).raison).toBe('hors_ligne');
    const pause = await avecFetch({ service: 'storefront-service', enPause: true, name: 'Chez Awa', slug: 'awa-1234' }, () =>
      port.resolve('awa-1234').then(() => null, (e: unknown) => e),
    );
    expect((pause as VitrinePause).raison).toBe('pause');
  });

  it('only the literal flag closes: no name, a truthy non-boolean, or `false` beside a pause never reads as « pas en ligne »', async () => {
    expect(await avecFetch({ horsLigne: true }, () => port.resolve('x'))).toBeUndefined();
    expect(await avecFetch({ horsLigne: 'oui', name: 'Chez Awa' }, () => port.resolve('x'))).toBeUndefined();
    const pause = await avecFetch({ enPause: true, horsLigne: false, name: 'Chez Awa' }, () =>
      port.resolve('x').then(() => null, (e: unknown) => e),
    );
    expect((pause as VitrinePause).raison).toBe('pause');
  });
});

describe('the closed card — her name, « pas en ligne », the one ghost way out; nothing to buy', () => {
  it('renders the closed wording (never the pause\'s), escaped, with data-raison and no product', () => {
    const html = renderVitrinePause('Chez <b>Awa</b> & fils', 'hors_ligne');
    expect(html).toContain('data-raison="hors_ligne"');
    expect(html).toContain('Chez &lt;b&gt;Awa&lt;/b&gt; &amp; fils n’est pas en ligne.');
    expect(html).not.toContain('<b>Awa</b>');
    expect(html).not.toContain('fait une pause');
    expect(visible(html)).toContain('Cette boutique est fermée pour le moment.');
    expect(html).toContain('data-action="decouvrir"');
    expect(html).not.toContain('data-action="commander"');
    expect(html).not.toContain('data-role="vitrine-produit"');
  });

  it('CONTROL — without the raison it is still the pause card', () => {
    const html = renderVitrinePause('Chez Awa');
    expect(html).toContain('Chez Awa fait une pause.');
    expect(html).not.toContain('data-raison="hors_ligne"');
  });
});

describe('the cliente — `boutique_hors_ligne` on the price ask is named, with no button into the same closed shop', () => {
  it('the table names it and gives it no primary action', () => {
    const vue = refusVue('boutique_hors_ligne');
    expect(vue.action).toBeNull();
    expect(vue.titre).toBe('Cette boutique n’est pas en ligne.');
  });
});
