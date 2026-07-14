import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allBoutiques,
  orderedBoutiques,
  filterBoutiques,
  toDiscoveryResponse,
  BOUTIQUE_ZONES,
} from '../src/boutiques-data';
import { renderBoutiques } from '../src/boutiques-view';

/**
 * WO-7.2a — S3 DÉCOUVERTE. SP-I05 (stores, never a product pool), SP-I11 (the
 * order is deterministic AND its sentence is on-screen), and the S3 laws: no
 * price/photo in the list, no supplier, no commission, every state designed.
 */

describe('SP-I11 — the order is deterministic (last update, most recent first) and stated on-screen', () => {
  it('orders by real last-update time desc, stable — never a score', () => {
    const ids = orderedBoutiques().map((s) => s.storefrontId);
    expect(ids).toEqual(['sf_aicha', 'sf_mariam', 'sf_kadi', 'sf_fanta', 'sf_awa']);
    // pure: same input, same output, no clock, no randomness
    expect(orderedBoutiques().map((s) => s.storefrontId)).toEqual(ids);
  });

  it('renders the ordering sentence in the UI (not a hidden score)', () => {
    const html = renderBoutiques({ state: 'default' });
    expect(html).toMatch(/data-role="ordering-sentence"/);
    expect(html).toContain('Classées par dernière mise à jour');
  });
});

describe('SP-I05 — stores, never a product feed; no price/photo in the list', () => {
  it('the directory shape is a store collection (storefrontId + resellerId + storeName), no product pool', () => {
    const res = toDiscoveryResponse();
    expect(Array.isArray(res.stores)).toBe(true);
    for (const s of res.stores) {
      expect(s.storefrontId).toBeTruthy();
      expect(s.resellerId).toBeTruthy();
      expect(s.storeName).toBeTruthy();
    }
    // no top-level product-pool keys exist on the response
    for (const k of ['products', 'items', 'productPool', 'results']) {
      expect(k in res).toBe(false);
    }
  });

  it('the rendered list carries NO price and NO product photo, and every card links to a vitrine', () => {
    const html = renderBoutiques({ state: 'default' });
    // no franc figure in the directory — the price lives in the vitrine
    expect(html).not.toMatch(/\d[\d   ]*F(?:CFA)?\b/);
    expect(html).not.toMatch(/<img|product-photo/i);
    // each store card is a link to the canon /v/{slug}
    expect(html).toMatch(/data-role="boutique"[^>]*href="\/v\/aicha-4821"/);
    expect(html).toMatch(/href="\/v\/mariam-2170"/);
  });

  it('no supplier identity and no commission anywhere on the directory (SP-I03 family)', () => {
    const html = renderBoutiques({ state: 'default' });
    expect(html).not.toMatch(/supplier|fournisseur|commission|marge|markup|sellerBase|resellerNet|sup_/i);
  });
});

describe('the search is a deterministic filter (name + zone), never a relevance score', () => {
  it('filters by name and by zone, order preserved; empty query returns all', () => {
    expect(filterBoutiques('rood').map((s) => s.storefrontId)).toEqual(['sf_aicha', 'sf_awa']);
    expect(filterBoutiques('kadi').map((s) => s.storefrontId)).toEqual(['sf_kadi']);
    expect(filterBoutiques('').length).toBe(allBoutiques().length);
    expect(filterBoutiques('bazin')).toEqual([]); // an honest no-match
  });

  it('the results state bolds the matched term and dates the count with the query', () => {
    const html = renderBoutiques({ state: 'results', query: 'rood' });
    expect(html).toMatch(/<strong>[^<]*[Rr]ood/); // « engraissé »
    expect(html).toContain('pour'); // « {n} boutiques — pour « {q} » »
    expect(html).toContain('La plus récente');
  });
});

describe('every state is a designed state', () => {
  it('no-results is dignified: the honest phrase + a one-tap way out, never a wall', () => {
    const html = renderBoutiques({ state: 'empty', query: 'bazin' });
    expect(html).toMatch(/data-role="boutiques-empty"/);
    expect(html).toContain('Rien pour');
    expect(html).toContain('VOIR TOUTES LES BOUTIQUES');
    expect(html).not.toMatch(/suggestion/i); // « un classement en douce est interdit »
  });

  it('offline dates the count and disables the search honestly (never a field that pretends)', () => {
    const html = renderBoutiques({ state: 'offline' });
    expect(html).toMatch(/class="offline-banner"/);
    expect(html).toContain('hier soir');
    expect(html).toMatch(/data-disabled="true"/);
  });

  it('network error is distinct from offline — a calm box with one gesture, never a red wall', () => {
    const html = renderBoutiques({ state: 'error' });
    expect(html).toMatch(/data-role="boutiques-error"/);
    expect(html).toContain("n'a pas pu se charger");
    expect(html).toContain('RÉESSAYER');
  });

  it('skeleton clones fixed rows (no layout jump), header + search render for real', () => {
    const html = renderBoutiques({ state: 'skeleton' });
    expect(html).toMatch(/data-role="boutiques-skeleton"/);
    expect(html).toMatch(/skeleton-fill|skeleton-line/);
    expect(html).toContain('LES BOUTIQUES'); // header is real
  });

  it('the zone chips are a filter set (« TOUTES » + the four zones), not a ranking', () => {
    const html = renderBoutiques({ state: 'default' });
    expect(html).toContain('TOUTES');
    for (const z of BOUTIQUE_ZONES) expect(html).toContain(z);
  });
});

describe('the checked-in discovery-returns-stores fixture is pinned to the real directory', () => {
  it('gates/fixtures/customer-surfaces/boutiques-discovery.json === toDiscoveryResponse()', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../../../gates/fixtures/customer-surfaces/boutiques-discovery.json'),
        'utf8',
      ),
    );
    expect(toDiscoveryResponse()).toEqual(fixture);
  });
});
