import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FCFA } from '../src/format';
import { renderVitrine, type VitrineViewModel } from '../src/vitrine-view';
import {
  identityLinkSuffix,
  identityLink,
  vitrineSlugFromPath,
  deployBaseFromPath,
  vitrineHref,
  signedHref,
  recordVitrineArrival,
  readArrivals,
  resolveVitrineSlug,
  type VitrineIdentity,
} from '../src/vitrine-link';

/**
 * WO-7.1 Part B — the vitrine + the ONE LINK-FORMAT LAW. These pin the
 * founder's condition 2 (canon /v/{slug} link form, pathname routing) and the
 * SP-I03 no-leak + Part 6.1 trust-before-products invariants.
 */

const model: VitrineViewModel = {
  resellerName: 'Aïcha',
  zone: 'Rood Woko, Ouagadougou',
  products: [
    { productName: 'Bazin riche brodé', priceFcfa: 11_500, inStock: true },
    { productName: 'Foulard wax', priceFcfa: 3_500, inStock: false },
  ],
};

describe('the ONE LINK-FORMAT LAW — the emitted identity link is canon /v/{slug}', () => {
  it('identityLinkSuffix is the canon shortCodeToSlug form', () => {
    expect(identityLinkSuffix('AICHA-4821')).toBe('/v/aicha-4821');
  });

  it('the full card link is suffix-correct under the deployed project base', () => {
    const link = identityLink('AICHA-4821', 'https://beurni2.github.io', '/shop-plus/');
    expect(link).toBe('https://beurni2.github.io/shop-plus/v/aicha-4821');
    expect(link.endsWith('/v/aicha-4821')).toBe(true);
    // never a query-string link on the card
    expect(link).not.toMatch(/[?&]/);
  });

  it('the app routes /v/{slug} from location.pathname (base-tolerant), never from a query', () => {
    expect(vitrineSlugFromPath('/shop-plus/v/aicha-4821')).toBe('aicha-4821');
    expect(vitrineSlugFromPath('/v/aicha-4821')).toBe('aicha-4821');
    expect(vitrineSlugFromPath('/shop-plus/')).toBeUndefined();
    expect(vitrineSlugFromPath('/shop-plus/v/aicha-4821/')).toBe('aicha-4821');
  });

  it('the demo slug resolves to its identity; an unknown slug resolves to nothing', () => {
    expect(resolveVitrineSlug('aicha-4821')?.resellerId).toBe('res_aicha');
    expect(resolveVitrineSlug('inconnue-0000')).toBeUndefined();
  });
});

describe('BUG 2 — outbound vitrine navigation is base-aware (deploy sub-path safe, never 404)', () => {
  it('recovers the deploy base from the current route (sub-path deploy vs local root)', () => {
    // Pages sub-path deploy — the base must survive whatever route we navigate FROM
    expect(deployBaseFromPath('/shop-plus/s/aicha-4821')).toBe('/shop-plus');
    expect(deployBaseFromPath('/shop-plus/v/aicha-4821')).toBe('/shop-plus');
    expect(deployBaseFromPath('/shop-plus/')).toBe('/shop-plus');
    expect(deployBaseFromPath('/shop-plus/index.html')).toBe('/shop-plus');
    // local root — no base
    expect(deployBaseFromPath('/s/aicha-4821')).toBe('');
    expect(deployBaseFromPath('/')).toBe('');
  });

  it('vitrineHref lands under the SAME base the routing reads — never the origin root', () => {
    // the bug: a hardcoded `/v/{slug}` resolves off the origin root and 404s on Pages
    expect(vitrineHref('/shop-plus/s/aicha-4821', 'aicha-4821')).toBe('/shop-plus/v/aicha-4821');
    expect(vitrineHref('/shop-plus/', 'aicha-4821')).toBe('/shop-plus/v/aicha-4821');
    // local root keeps the canon root form
    expect(vitrineHref('/', 'aicha-4821')).toBe('/v/aicha-4821');
    expect(vitrineHref('/s/aicha-4821', 'aicha-4821')).toBe('/v/aicha-4821');
  });

  it('signedHref opens THAT product as the base-aware /s/{slug}?pid= achat offer (the tile-tap target)', () => {
    // the redesign vitrine tile-tap navigates here (replacing the retired
    // ?demo-journey route): the real pid rides ?pid= and resolves against her
    // catalog on land (BUG 3 fix), base-aware so Pages restores it via 404.html.
    expect(signedHref('/shop-plus/v/aicha-4821', 'aicha-4821', 'p2')).toBe('/shop-plus/s/aicha-4821?pid=p2');
    expect(signedHref('/', 'aicha-4821', 'p5')).toBe('/s/aicha-4821?pid=p5');
    // no pid → the bare signed offer (her first curated product on land)
    expect(signedHref('/shop-plus/', 'aicha-4821', '')).toBe('/shop-plus/s/aicha-4821');
  });
});

describe('Part 6.1 — trust chrome renders BEFORE anything is asked', () => {
  it('the trust block precedes the first product in source order', () => {
    const html = renderVitrine(model);
    const trustAt = html.indexOf('data-role="vitrine-trust"');
    const firstProductAt = html.indexOf('data-role="vitrine-product"');
    expect(trustAt).toBeGreaterThanOrEqual(0);
    expect(firstProductAt).toBeGreaterThan(trustAt);
    // « Livré par Séra » · « Paiement protégé » · the privacy line all present
    expect(html).toContain('Livré par Séra');
    expect(html).toContain('Paiement protégé');
    expect(html).toContain('Votre numéro reste privé');
  });
});

describe('SP-I03 — her prices only; no supplier identity, no commission, no split', () => {
  it('the rendered vitrine carries HER prices and no banned economics', () => {
    const html = renderVitrine(model);
    // her price, formatted with the real fr-FR narrow-space separator (U+202 FCFA)
    expect(html).toContain(`Votre prix : ${FCFA.format(11_500)} FCFA`);
    expect(html).not.toMatch(/supplier|fournisseur|commission|marge|markup|gross|sellerBase|resellerNet|res_/i);
  });

  it('the model type cannot even carry supplier/commission (structural)', () => {
    // @ts-expect-error — no supplier field exists on the product model
    const leak: VitrineViewModel['products'][number] = { productName: 'x', priceFcfa: 1, inStock: true, supplierId: 'sup' };
    expect(leak.priceFcfa).toBe(1);
  });

  it('the checked-in no-supplier-contact gate fixture matches the vitrine view (pinning)', () => {
    // The standing SP-I03 gate (no-supplier-contact.mjs) scans THIS surface; the
    // fixture is pinned to the real view model so the gate never drifts from render.
    const view = resolveVitrineSlug('aicha-4821')!.view;
    const fixture = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '../../../gates/fixtures/customer-surfaces/vitrine-view.json'),
        'utf8',
      ),
    );
    expect(view).toEqual(fixture);
  });
});

describe('flows.md S2 — an out-of-stock product is honest (muted, non-tappable), never hidden', () => {
  it('the épuisé product shows « Épuisé » and is NOT a link', () => {
    const html = renderVitrine(model);
    expect(html).toContain('Épuisé');
    // the in-stock product is a tappable link into the existing journey…
    expect(html).toMatch(/<a class="vitrine-product"[^>]*href="\?demo-journey=produit"/);
    // …the épuisé one is a non-link muted card
    expect(html).toMatch(/vitrine-product-epuise[^>]*aria-disabled="true"/);
  });
});

describe('A8 — landing on the vitrine records an IDENTITY-scope arrival (last-touch)', () => {
  it('records scope=identity with no offerId, and readArrivals returns it', () => {
    const map = new Map<string, string>();
    const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    const identity = resolveVitrineSlug('aicha-4821') as VitrineIdentity;
    const arrival = recordVitrineArrival(identity, '2026-07-13T00:00:00.000Z', 'corr-1', store);
    expect(arrival).toEqual({ resellerId: 'res_aicha', scope: 'identity', arrivedAt: '2026-07-13T00:00:00.000Z', correlationId: 'corr-1' });
    expect(arrival).not.toHaveProperty('offerId'); // identity scope forbids offerId
    expect(readArrivals(store)).toHaveLength(1);
  });
});
