import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VitrineViewModel } from '../src/vitrine-view';
import { harnessProfil } from '../src/vitrine/flows';
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

describe('SP-I03 — her prices only; no supplier identity, no commission, no split', () => {

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

describe('PWA-CLEANUP-1 §4 — the retired Grand Teint vitrine renderer is GONE and its route is un-generatable', () => {
  it('no source under src/ can emit the retired ?demo-journey route', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') || e.name.endsWith('.css') ? [join(dir, e.name)] : [],
      );
    for (const f of walk(join(import.meta.dirname, '..', 'src'))) {
      const src = readFileSync(f, 'utf8');
      expect(src.includes('demo-journey'), `${f} can still generate the retired ?demo-journey route`).toBe(false);
    }
  });
  it('vitrine-view exports NO renderer any more — only the SP-I03 types + reputationText', async () => {
    const mod = await import('../src/vitrine-view');
    expect(Object.keys(mod).sort()).toEqual(['reputationText']);
    expect('renderVitrine' in mod).toBe(false);
  });
});

/* ------------------------------------------------- BUYER-LIVE-WIRE-2 -- */

describe('BUYER-LIVE-WIRE-2 — a REAL /v/{slug} entry reaches the env-gated port', () => {
  it('A REAL PATH TAKES NO DEMO PROFIL — this is the whole defect, by value', () => {
    // `mountVitrine` picks the demo adapter whenever `harness.profil` is TRUTHY.
    // The route used to pass `'default'` for an absent param, so a real shared
    // link was pinned to the demo adapter and VITE_STOREFRONT_BASE could not be
    // read no matter how correctly it was set. `undefined` is what routes a real
    // entry to `resolveStorefrontPort()`.
    expect(harnessProfil(true, null)).toBeUndefined();
    // …and a real path ignores the lever even when one is present, because a
    // shared link must never be steerable into demo data by a query string.
    expect(harnessProfil(true, 'perso')).toBeUndefined();
    expect(harnessProfil(true, 'vide')).toBeUndefined();
  });

  it('THE HARNESS KEEPS EVERY LEVER — the audit surface is not collateral damage', () => {
    expect(harnessProfil(false, null)).toBe('default');
    expect(harnessProfil(false, 'perso')).toBe('customised');
    expect(harnessProfil(false, 'vide')).toBe('empty');
    expect(harnessProfil(false, 'nonsense')).toBe('default');
  });

  it('THE ROUTE USES IT, and the always-truthy ternary is gone from main.ts', () => {
    const main = readFileSync(join(__dirname, '..', 'src/main.ts'), 'utf8');
    expect(main).toMatch(/profil: harnessProfil\(isRealVitrinePath, profilParam\)/);
    // The exact shape that shipped the bug — a ternary chain whose last branch is
    // the truthy 'default' — must not come back on this route.
    expect(main).not.toMatch(/profil: profilParam === 'perso' \? 'customised' : profilParam === 'vide' \? 'empty' : 'default'/);
    // and the real-path test is derived from the PATH, never from a query param
    expect(main).toMatch(/const isRealVitrinePath = vitrineSlugFromPath\(window\.location\.pathname\) !== undefined;/);
  });

  it('BOTH ROUTES NOW AGREE — /s/ and /v/ each send a real path to the env-gated port', () => {
    const main = readFileSync(join(__dirname, '..', 'src/main.ts'), 'utf8');
    // /s/ already had it right; the two disagreeing is what made this survive.
    expect(main).toMatch(/const port = isRealPath \? resolveStorefrontPort\(\) : demoStorefrontPort\(profil\)/);
    const flows = readFileSync(join(__dirname, '..', 'src/vitrine/flows.ts'), 'utf8');
    expect(flows).toMatch(/harness\.profil \? demoStorefrontPort\(harness\.profil\) : resolveStorefrontPort\(\)/);
  });
});
