// node env has no localStorage; the favorites pins need a Storage-shaped fake.
const __m = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => __m.get(k) ?? null,
  setItem: (k: string, v: string) => void __m.set(k, v),
  removeItem: (k: string) => void __m.delete(k),
  clear: () => __m.clear(),
  key: (i: number) => [...__m.keys()][i] ?? null,
  get length() { return __m.size; },
} as Storage;
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VitrineViewModel } from '../src/vitrine-view';
import { harnessProfil } from '../src/vitrine/flows';
import { renderVitrineReady } from '../src/vitrine/render';
import { toggleFavorite, resetFavoritesCache } from '../src/vitrine/favorites';
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

/* ------------------------------------------------- BUYER-LIVE-WIRE-3 -- */

describe('BUYER-LIVE-WIRE-3 — a REAL product renders; the demo seed is not the only source', () => {
  const sfReal = {
    id: 'sf-1869', resellerId: 'rs-1869', slug: 'chezaichamod-1869',
    name: 'Chez Aïcha Mod', zone: 'Ouagadougou', category: 'Général',
    tagline: '', bio: '', theme: 'laterite' as const,
    cover: { status: 'none' as const }, avatar: { mode: 'monogram' as const },
    curatedItems: ['pv-real-0001'], featuredItems: [], sections: [],
    discoverable: false, createdAt: 'T', updatedAt: 'T',
  };
  const trust = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
  const described = [
    { pid: 'pv-real-0001', name: 'Bogolan brodé', priceFcfa: 9_200, inStock: true, assetRefs: [] as string[] },
  ];

  it('THE PRODUCT APPEARS — a productVersionId is not a seed pid, and that was the whole failure', () => {
    // Before this fix the grid mapped curatedItems through the DEMO SEED, so a
    // real pid resolved to nothing and a shop with a genuine published product
    // rendered ZERO TILES. The founder saw exactly that: « it opens the boutique
    // but no product is in there ».
    const html = renderVitrineReady(sfReal as never, trust, { fromProduct: false }, {}, described);
    expect(html).toContain('Bogolan brodé');
    expect(html).toContain('data-pid="pv-real-0001"');
    // …and the price is HER signed price, rendered verbatim
    expect(html).toMatch(/9\D?200/);
  });

  it('WITHOUT DESCRIBED PRODUCTS THE SEED PATH SURVIVES — the offline harness is not collateral damage', () => {
    const sfDemo = { ...sfReal, curatedItems: ['p1'] };
    const html = renderVitrineReady(sfDemo as never, trust, { fromProduct: false }, {});
    expect(html).toContain('Robe brodée bogolan'); // the p1 seed name
  });

  it('A REAL PID WITH NO DESCRIPTION STILL RENDERS NOTHING — omission stays honest', () => {
    // The service omits what it cannot describe; the renderer must not invent.
    const html = renderVitrineReady(sfReal as never, trust, { fromProduct: false }, {}, []);
    expect(html).not.toContain('Bogolan');
    expect(html).not.toContain('Robe brodée'); // and NEVER falls back to demo data
  });

  it('THE GRID FOLLOWS curatedItems ORDER, and épuisé sorts last', () => {
    const sfTwo = { ...sfReal, curatedItems: ['pv-a', 'pv-b', 'pv-c'] };
    const three = [
      { pid: 'pv-a', name: 'Alpha', priceFcfa: 100, inStock: false, assetRefs: [] as string[] },
      { pid: 'pv-b', name: 'Bravo', priceFcfa: 200, inStock: true, assetRefs: [] as string[] },
      { pid: 'pv-c', name: 'Charlie', priceFcfa: 300, inStock: true, assetRefs: [] as string[] },
    ];
    const html = renderVitrineReady(sfTwo as never, trust, { fromProduct: false }, {}, three);
    expect(html.indexOf('Bravo')).toBeLessThan(html.indexOf('Charlie'));
    expect(html.indexOf('Charlie')).toBeLessThan(html.indexOf('Alpha')); // épuisé last
  });
});

/* ------------------------------------------------- BUYER-LIVE-WIRE-4 -- */

describe('BUYER-LIVE-WIRE-4 — tapping a REAL tile opens the buyer flow, not the not-found', () => {
  const main = readFileSync(join(__dirname, '..', 'src/main.ts'), 'utf8');

  it('THE PRODUCT PAGE PREFERS THE DESCRIBED PRODUCT — the seed-only lookup is gone', () => {
    // The defect: `const product = seed ? productFromSeed(seed) : undefined` meant a
    // real productVersionId resolved to nothing and a tapped tile landed on the
    // honest not-found instead of C1. Described wins; seed is the offline fallback.
    expect(main).toMatch(/const described = resolved\.products\?\.find\(\(p\) => p\.pid === pid\);/);
    expect(main).toMatch(/const product = described \?\? \(seed \? productFromSeed\(seed\) : undefined\);/);
    // the exact shape that shipped the bug must not come back
    expect(main).not.toMatch(/const product = seed \? productFromSeed\(seed\) : undefined;/);
  });

  it('AN UNRESOLVABLE PID STILL FALLS TO THE HONEST NOT-FOUND — no silent product swap', () => {
    // PWA-CLEANUP-1 §1 stays intact: a wrong link says so rather than selling a
    // neighbouring product. The guard is unchanged, only its input got wider.
    expect(main).toMatch(/if \(!product\) \{/);
    expect(main).toMatch(/mountVitrine\(app as HTMLElement, signedSlug, \{ etat: 'invalid' \}\)/);
  });

  it('BOTH BUYER SURFACES RESOLVE A PID THE SAME WAY — they cannot disagree about what it means', () => {
    const render = readFileSync(join(__dirname, '..', 'src/vitrine/render.ts'), 'utf8');
    // the grid: described wins, seed only when none were supplied
    expect(render).toMatch(/described !== undefined/);
    // the product page: the same precedence, expressed on one line
    expect(main).toMatch(/described \?\? \(seed/);
  });

  it('THE TILE CARRIES THE PID THE PRODUCT PAGE READS — the tap round-trips', () => {
    const render = readFileSync(join(__dirname, '..', 'src/vitrine/render.ts'), 'utf8');
    expect(render).toMatch(/data-action="produit" data-pid="\$\{p\.pid\}"/);
    const flows = readFileSync(join(__dirname, '..', 'src/vitrine/flows.ts'), 'utf8');
    expect(flows).toMatch(/signedHref\(window\.location\.pathname, slug, pid\)/);
    expect(main).toMatch(/const pid = params\.get\('pid'\) \|\| defaultPid;/);
  });
});

/* ------------------------------------------------------------ MEDIA-2 -- */

/**
 * HER PHOTOGRAPH REACHES THE CLIENTE, or the badge language is spent on a lie.
 *
 * PERSONNALISER-MEDIA-1 made `cover.status:'live'` REAL (a genuine upload writes
 * it) but nothing here rendered `cover.url` — `grep -rn "cover\.url" src/` found
 * NOTHING. So the cliente got a brown gradient captioned « PHOTO DE COUVERTURE »:
 * a label asserting a photograph she cannot see. While the status was demo-fed
 * that placeholder was honest; the moment it became real it became a false claim.
 */
describe('MEDIA-2 — the cover photograph is RENDERED, not captioned', () => {
  const base = {
    id: 'sf-cov', resellerId: 'rs-cov', slug: 'chez-cov-1',
    name: 'Chez Aïcha Mod', zone: 'Ouagadougou', category: 'Général',
    tagline: '', bio: '', theme: 'laterite' as const,
    avatar: { mode: 'monogram' as const },
    curatedItems: [], featuredItems: [], sections: [],
    discoverable: true, createdAt: 'T', updatedAt: 'T',
  };
  const trust = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
  const PHOTO = 'https://storefront-service.example.workers.dev/media/storefronts/sf-cov/cover/a.jpg';

  it('A LIVE COVER WITH A URL DRAWS AN <img> CARRYING THAT EXACT ADDRESS', () => {
    const sf = { ...base, cover: { status: 'live' as const, url: PHOTO } };
    const html = renderVitrineReady(sf as never, trust, { fromProduct: false }, {}, []);
    expect(html).toContain(`src="${PHOTO}"`);
    expect(html).toContain('class="vt-cover-img"');
    // …and it does NOT caption a photograph, because it IS one
    expect(html).not.toContain('PHOTO DE COUVERTURE');
  });

  it('A LIVE COVER WITHOUT A URL KEEPS THE WOVEN HABILLAGE — no <img> pointing nowhere', () => {
    const sf = { ...base, cover: { status: 'live' as const } };
    const html = renderVitrineReady(sf as never, trust, { fromProduct: false }, {}, []);
    expect(html).not.toContain('vt-cover-img');
    expect(html).not.toContain('src=""');
    // …and it IS the live habillage, not a fall-through to the none branch — a
    // verifier proved this test stayed green when the branch was deleted.
    expect(html).toContain('vt-cover-live');
    expect(html).toContain('vt-cover-stripes-photo');
  });

  it('NO COVER IS STILL THE DESIGNED EMPTY STATE, never a broken image', () => {
    const sf = { ...base, cover: { status: 'none' as const } };
    const html = renderVitrineReady(sf as never, trust, { fromProduct: false }, {}, []);
    expect(html).not.toContain('vt-cover-img');
    expect(html).toContain('data-etat="none"');
  });

  it('THE URL IS ESCAPED — a storefront record is not a licence to inject markup', () => {
    const nasty = 'https://h/a.jpg" onerror="alert(1)';
    const sf = { ...base, cover: { status: 'live' as const, url: nasty } };
    const html = renderVitrineReady(sf as never, trust, { fromProduct: false }, {}, []);
    expect(html).not.toContain('onerror="alert(1)"');
  });
});

/**
 * MEDIA-2 round 2 — the AVATAR was B1 one layer down. `decideSetMedia` stored
 * `avatar:{mode:'photo',url}`, the projection carried it, the port delivered it,
 * and `identity()` drew the monogram initial unconditionally: « Votre portrait est
 * en ligne » was true of the record and false of every screen a cliente sees.
 */
describe('MEDIA-2 — the portrait is RENDERED, not replaced by an initial', () => {
  const base = {
    id: 'sf-av', resellerId: 'rs-av', slug: 'chez-av-1',
    name: 'Chez Aïcha Mod', zone: 'Ouagadougou', category: 'Général',
    tagline: '', bio: '', theme: 'laterite' as const,
    cover: { status: 'none' as const },
    curatedItems: [], featuredItems: [], sections: [],
    discoverable: true, createdAt: 'T', updatedAt: 'T',
  };
  const trust = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
  const PORTRAIT = 'https://storefront-service.example.workers.dev/media/storefronts/sf-av/avatar/b.jpg';

  it('A PHOTO AVATAR WITH A URL DRAWS AN <img> CARRYING THAT EXACT ADDRESS', () => {
    const sf = { ...base, avatar: { mode: 'photo' as const, url: PORTRAIT } };
    const html = renderVitrineReady(sf as never, trust, { fromProduct: false }, {}, []);
    expect(html).toContain(`src="${PORTRAIT}"`);
    expect(html).toContain('class="vt-avatar-img"');
  });

  it('MONOGRAM MODE KEEPS THE INITIAL — the designed state, not a fallback', () => {
    const sf = { ...base, avatar: { mode: 'monogram' as const } };
    const html = renderVitrineReady(sf as never, trust, { fromProduct: false }, {}, []);
    expect(html).not.toContain('vt-avatar-img');
    expect(html).toMatch(/<span class="vt-avatar">A<span class="vt-avatar-badge"/);
  });

  it('PHOTO MODE WITHOUT A URL FALLS BACK TO THE INITIAL — never an <img> pointing nowhere', () => {
    const sf = { ...base, avatar: { mode: 'photo' as const } };
    const html = renderVitrineReady(sf as never, trust, { fromProduct: false }, {}, []);
    expect(html).not.toContain('vt-avatar-img');
    expect(html).not.toContain('src=""');
    expect(html).toMatch(/<span class="vt-avatar">A<span class="vt-avatar-badge"/);
  });

  it('THE PORTRAIT URL IS ESCAPED', () => {
    const sf = { ...base, avatar: { mode: 'photo' as const, url: 'https://h/a.jpg" onerror="alert(1)' } };
    const html = renderVitrineReady(sf as never, trust, { fromProduct: false }, {}, []);
    expect(html).not.toContain('onerror="alert(1)"');
  });
});

/**
 * VITRINE-NORTH-STAR-1 — the founder's mockup, with its lies removed.
 *
 * The mockup carried « +1,2k clientes satisfaites », « 5 étoiles (128) »,
 * « BEST SELLER », « Les meilleurs prix garantis », « Livraison 24–48h » — none
 * backed by any data. Law 5: never fake counts. These pins EXECUTE the renderer
 * (the vacuous-test lesson: a grep on source text proves nothing).
 */
describe('NORTH-STAR-1 — the mockup layout renders; the invented numbers do not', () => {
  const sfNS = {
    id: 'sf-ns', resellerId: 'rs-ns', slug: 'chez-ns-1',
    name: 'Chez Awa', zone: 'Gounghin, Ouagadougou', category: 'Général',
    tagline: 'Bienvenue', bio: 'Du bon tissu.', theme: 'foret' as const,
    cover: { status: 'live' as const, url: 'https://svc.example/media/c.jpg' },
    avatar: { mode: 'monogram' as const },
    curatedItems: ['pv-1', 'pv-2'], featuredItems: ['pv-1'], sections: [],
    discoverable: true, createdAt: 'T', updatedAt: 'T',
  };
  const zeroTrust = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
  const products = [
    { pid: 'pv-1', name: 'Bazin riche', priceFcfa: 9_400, inStock: true, assetRefs: ['https://svc.example/media/p1.jpg'] },
    { pid: 'pv-2', name: 'Sac duffel', priceFcfa: 5_000, inStock: true, assetRefs: [] as string[] },
  ];
  const page = () => renderVitrineReady(sfNS as never, zeroTrust, { fromProduct: false }, {}, products);

  it('THE HERO EXISTS: identity panel + full-height photo, trust band AFTER it', () => {
    const html = page();
    expect(html).toContain('data-role="vitrine-hero"');
    expect(html).toContain('class="vt-hero-photo vt-cover-photo"');
    // trust stays before products (Part 6.1) and after the hero
    const hero = html.indexOf('vitrine-hero');
    const trustAt = html.indexOf('data-role="vitrine-trust"');
    const firstTile = html.indexOf('data-role="vitrine-a-la-une"');
    expect(hero).toBeGreaterThan(-1);
    expect(trustAt).toBeGreaterThan(hero);
    expect(firstTile).toBeGreaterThan(trustAt);
  });

  it('ZERO HISTORY SHOWS « Nouvelle vendeuse » AND NO INVENTED COUNT ANYWHERE', () => {
    const html = page();
    expect(html).toContain('data-role="chip-nouvelle"');
    expect(html).not.toMatch(/clientes satisfaites/i);
    expect(html).not.toMatch(/1[,.]?2\s?k/i);
    // no star row at zero reviews — stars come only from real reviews at the floor
    expect(html).not.toContain('data-role="chip-avis"');
  });

  it('REAL REVIEWS AT THE FLOOR RENDER THE REAL NUMBERS — and only then', () => {
    const withReviews = renderVitrineReady(
      sfNS as never,
      { deliveredCount: 12, rating: '4,8', reviewCount: 5, demo: false },
      { fromProduct: false }, {}, products,
    );
    expect(withReviews).toContain('data-role="chip-avis"');
    expect(withReviews).toContain('<v>4,8</v>');
    expect(withReviews).toContain('<v>5</v>');
    expect(withReviews).toContain('data-role="reputation"');
    expect(withReviews).toContain('<v>12</v>');
    expect(withReviews).not.toContain('data-role="chip-nouvelle"');
  });

  it('THE FEATURED CARD: « À LA UNE » badge, Commander CTA — never « BEST SELLER »', () => {
    const html = page();
    expect(html).toContain('class="vt-featured-badge"');
    expect(html).toMatch(/vt-featured-badge">À LA UNE</);
    expect(html).toContain('class="vt-featured-cta"');
    expect(html).toMatch(/vt-featured-cta">Commander</);
    expect(html).not.toMatch(/best\s?seller/i);
  });

  it("FOUNDER ORDER (2026-07-28): the mockup's commercial claims render as given", () => {
    // I flagged « 24–48h », « meilleurs prix garantis » and « 100% sécurisé » as
    // promises the platform does not yet measure; the founder reaffirmed them.
    // His claims, his call — logged in JOURNAL. These pins hold his order in
    // place exactly as ordered.
    const html = page();
    expect(html).toContain('Livraison 24–48h · Séra vérifiée');
    expect(html).toContain('Les meilleurs prix garantis');
    expect(html).toContain('100% sécurisé');
    expect(html).toContain('Rapide & sécurisée');
  });

  it('THE HEART IS A REAL CONTROL, wired to the wishlist action — never decoration', () => {
    const html = page();
    expect(html).toContain('data-action="favori"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain(`data-action="favori" data-pid="pv-1"`);
  });

  it('ONE PRODUCT, ONE HEART — a featured article is not duplicated into « AUTRES »', () => {
    // Verifier blocker: pv-1 rendered as the featured card AND a grid tile — two
    // hearts that desynced on tap, and an « AUTRES ARTICLES » list containing the
    // very article it claims to be "other" than.
    const html = page();
    const hearts = html.match(/data-action="favori" data-pid="pv-1"/g) ?? [];
    expect(hearts).toHaveLength(1);
    const tiles = html.match(/data-role="vitrine-produit" data-action="produit" data-pid="pv-1"/g) ?? [];
    expect(tiles).toHaveLength(0); // pv-1 lives in the featured card only
    // …and an ÉPUISÉ pinned article leaves the hero: the AUTO-LEAD promotes the
    // next in-stock product (badge-less — the badge is HER claim only), while the
    // épuisé one still reaches the grid, voilé.
    const soldOut = [
      { pid: 'pv-1', name: 'Bazin riche', priceFcfa: 9_400, inStock: false, assetRefs: [] as string[] },
      { pid: 'pv-2', name: 'Sac duffel', priceFcfa: 5_000, inStock: true, assetRefs: [] as string[] },
    ];
    const html2 = renderVitrineReady(sfNS as never, zeroTrust, { fromProduct: false }, {}, soldOut);
    expect(html2).toContain('data-role="vitrine-a-la-une" data-action="produit" data-pid="pv-2"');
    expect(html2).not.toContain('vt-featured-badge'); // auto-lead never wears her badge
    expect(html2).toMatch(/data-role="vitrine-produit" aria-disabled="true"/);
  });

  it('A SAVED ARTICLE RENDERS ITS HEART ON — re-render reads the store (was unpinned)', () => {
    resetFavoritesCache();
    localStorage.clear();
    toggleFavorite('pv-2');
    const html = page();
    expect(html).toContain('data-action="favori" data-pid="pv-2" aria-pressed="true"');
    expect(html).toMatch(/vt-fav vt-fav-on[^>]*data-pid="pv-2"/);
    toggleFavorite('pv-2'); // leave the store clean for other tests
  });

  it('RESIDUAL TITLE IS CONTEXT-HONEST, and the auto-lead never wears her badge', () => {
    // pinned featured → « Autres articles », badge présent (her true claim)
    expect(page()).toContain('Autres articles');
    expect(page()).toContain('vt-featured-badge');
    // nothing pinned → the auto-lead takes the une position WITHOUT the badge,
    // and the rest are still honestly « autres » than it
    const noFeatured = renderVitrineReady(
      { ...sfNS, featuredItems: [] } as never, zeroTrust, { fromProduct: false }, {}, products,
    );
    expect(noFeatured).toContain('data-role="vitrine-a-la-une"');
    expect(noFeatured).not.toContain('vt-featured-badge');
    expect(noFeatured).toContain('Autres articles');
    // EVERYTHING épuisé → no lead is possible, and the honest title is « Tous »
    const allOut = products.map((p) => ({ ...p, inStock: false }));
    const dead = renderVitrineReady(
      { ...sfNS, featuredItems: [] } as never, zeroTrust, { fromProduct: false }, {}, allOut,
    );
    expect(dead).not.toContain('vitrine-a-la-une');
    expect(dead).toContain('Tous les articles');
  });
});

/**
 * Round 4 (verifier B3) — a ONE-PRODUCT shop: the only article is the auto-lead,
 * and no « Autres articles · 0 » heading may sit over an empty grid. This is the
 * most likely shape of a brand-new Shop+ seller.
 */
describe('round 4 — the one-product shop tells no lies below the lead', () => {
  const sfOne = {
    id: 'sf-one', resellerId: 'rs-one', slug: 'chez-one-1',
    name: 'Chez Awa', zone: 'Ouagadougou', category: 'Général',
    tagline: '', bio: '', theme: 'foret' as const,
    cover: { status: 'none' as const }, avatar: { mode: 'monogram' as const },
    curatedItems: ['pv-only'], featuredItems: [], sections: [],
    discoverable: true, createdAt: 'T', updatedAt: 'T',
  };
  const trust = { deliveredCount: 0, rating: '', reviewCount: 0, demo: false };
  const one = [{ pid: 'pv-only', name: 'Bazin riche', priceFcfa: 9_400, inStock: true, assetRefs: [] as string[] }];

  it('THE LEAD RENDERS; NO EMPTY « AUTRES » HEADING, NO EMPTY GRID, NO DEAD VOIR TOUT', () => {
    const html = renderVitrineReady(sfOne as never, trust, { fromProduct: false }, {}, one);
    expect(html).toContain('data-role="vitrine-a-la-une"');
    expect(html).not.toContain('Autres articles');
    expect(html).not.toContain('<div class="vt-grid"></div>');
    // no target below ⇒ no « Voir tout » link and no orphaned anchor
    expect(html).not.toContain('data-action="ancre"');
    expect(html).not.toContain('id="vt-anchor-grid"');
  });

  it('WITH A SECOND PRODUCT THE LINK AND ITS ANCHOR BOTH EXIST — never one without the other', () => {
    const two = [...one, { pid: 'pv-2', name: 'Sac duffel', priceFcfa: 5_000, inStock: true, assetRefs: [] as string[] }];
    const sfTwo = { ...sfOne, curatedItems: ['pv-only', 'pv-2'] };
    const html = renderVitrineReady(sfTwo as never, trust, { fromProduct: false }, {}, two);
    expect(html).toContain('data-action="ancre" data-cible="vt-anchor-grid"');
    expect(html).toContain('id="vt-anchor-grid"');
    expect(html).toContain('Autres articles');
  });
});
