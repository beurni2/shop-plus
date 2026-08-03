import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemoStorefrontService } from '../src/vitrine/service.demo';
import { HttpStorefrontService, listingIdFor } from '../src/vitrine/service';
import { marginBreakdown, markupCap, defaultMarkup, snapMarkup } from '../src/vitrine/margin';

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

/**
 * PUBLISH-PRICE-1 — the app sends the markup she chose, and NOTHING else about money.
 *
 * The founder asked for the keyspace to be asserted BY VALUE: « a test that writes a
 * markup on the card and reads it on the fiche for the same live offer ». That is the
 * first block. The rest pins the two properties that make publish honest: no price
 * leaves the app, and no publish happens on an untouched default.
 */

describe('ONE KEYSPACE — a markup written on the card is the markup the fiche signs', () => {
  // The two surfaces, reduced to what they actually do with the state. Both read and
  // write `markups` keyed by the offer's productVersionId, and both quote money
  // through the SAME `marginBreakdown`. If either drifted onto another key this
  // reconstruction would diverge — which is exactly what shipped before.
  const OFFER = { productVersionId: 'pv-live-1', basePrice: 8_000, resellerCommission: 600 };
  const marginOf = (markups: Record<string, number>, id: string, base: number, commission: number) =>
    marginBreakdown(base, commission, markups[id] ?? defaultMarkup(markupCap(base)));

  it('THE CARD WRITES AND THE FICHE READS THE SAME VALUE (this is the defect, by value)', () => {
    const markups: Record<string, number> = {};
    // Ma Vitrine card: she drags the slider to 2 500.
    markups[OFFER.productVersionId] = snapMarkup(2_500, markupCap(OFFER.basePrice));
    // The fiche, reading by productVersionId, must see 2 500 — not the default.
    const onFiche = marginOf(markups, OFFER.productVersionId, OFFER.basePrice, OFFER.resellerCommission);
    expect(onFiche.markup).toBe(2_500);
    expect(onFiche.client).toBe(10_500); // B + M, the price the service will sign
    // THE OLD BEHAVIOUR, PINNED AS A NEGATIVE: written under a demo seed id, the
    // fiche falls through to the DEFAULT — 0 since the founder's 2026-07-26
    // override (was min(1500, cap)) — and NOT the 2 500 she chose. The invariant
    // is the fallthrough itself: a wrong key loses her decision.
    const wrongKey: Record<string, number> = { o5: 2_500 };
    expect(marginOf(wrongKey, OFFER.productVersionId, OFFER.basePrice, OFFER.resellerCommission).markup).toBe(0);
  });

  it('THE MONEY IDENTITIES HOLD AT HER CHOSEN MARKUP — net + fee = gross, client = B + M', () => {
    for (const m of [0, 100, 1_500, 2_500, markupCap(OFFER.basePrice)]) {
      const v = marginBreakdown(OFFER.basePrice, OFFER.resellerCommission, m);
      expect(v.gross).toBe(OFFER.resellerCommission + m);
      expect(v.net + v.fee).toBe(v.gross); // to the franc, at every markup
      expect(v.fee).toBe(Math.round(v.gross * 0.2)); // canon 20 %·(C+M)
      expect(v.client).toBe(OFFER.basePrice + m); // productSubtotal
    }
  });

  it('BOTH SURFACES KEY ON productVersionId IN THE SOURCE — no `item.id` write survives', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/\[opp\.productVersionId\]: m/); // the fiche slider
    expect(app).toMatch(/\[item\.productVersionId\]: m/); // the Ma Vitrine card slider
    expect(app).not.toMatch(/\[item\.id\]: m/);
    // the grid itself reads the LIVE feed under that key, not the demo world
    expect(app).toMatch(/offers\.filter\(\(o\) => vitrineLive\.includes\(o\.productVersionId\)\)/);
  });
});

describe('THE APP NEVER AUTHORS A SIGNED AMOUNT', () => {
  it('THE REQUEST SHAPE HAS NO PRICE FIELD — unrepresentable, not merely unsent', () => {
    const src = read('src/vitrine/service.ts');
    const shape = /export interface PublishListingRequest \{[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
    expect(shape).toContain('markup');
    // The three money fields the service knows live, and must never be told:
    for (const banned of ['customerPriceFcfa', 'basePrice', 'resellerCommission', 'offerVersion']) {
      expect(shape).not.toContain(banned);
    }
  });

  it('THE WIRE BODY CARRIES markup AND NO PRICE (asserted on the real fetch payload)', async () => {
    let body: Record<string, unknown> = {};
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body) as Record<string, unknown>;
      return { ok: true, status: 200, json: async () => ({ status: 'published' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example', 'k');
      const res = await svc.publishListing({
        storefrontId: 'sf-8291',
        resellerId: 'rs-8291',
        productVersionId: 'pv-live-1',
        markup: 2_500,
        correlationId: 'corr-1',
        at: '2026-07-25T00:00:00.000Z',
      });
      expect(res.ok).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
    expect(body.markup).toBe(2_500);
    // NOT sent, at all — the service computes them from live supply.
    expect(body).not.toHaveProperty('customerPriceFcfa');
    expect(body).not.toHaveProperty('basePrice');
    expect(body).not.toHaveProperty('offerVersion');
    // IDS ARE DERIVED, so a re-tap is idempotent rather than a second signed version.
    expect(body.listingId).toBe(listingIdFor('sf-8291', 'pv-live-1'));
    expect(body.commandId).toBe(`publish-${listingIdFor('sf-8291', 'pv-live-1')}`);
  });

  it('A SERVICE REFUSAL KEEPS ITS NAME — `supply_unavailable` is not collapsed to http_409', async () => {
    let status = 409;
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({ ok: false, status, json: async () => ({ error: 'supply_unavailable' }) }) as unknown as Response) as unknown as typeof fetch;
    try {
      const svc = new HttpStorefrontService('https://svc.example', 'k');
      const req = {
        storefrontId: 'sf-1',
        resellerId: 'rs-1',
        productVersionId: 'pv-1',
        markup: 500,
        correlationId: 'c',
        at: 'T',
      };
      // « réessayez » and « c'est un défaut » are different things to tell her, so the
      // named reason must survive the adapter rather than becoming a status code.
      expect(await svc.publishListing(req)).toEqual({ ok: false, reason: 'supply_unavailable' });
      status = 400;
      globalThis.fetch = (async () =>
        ({ ok: false, status, json: async () => ({ error: 'markup_invalid' }) }) as unknown as Response) as unknown as typeof fetch;
      expect(await svc.publishListing(req)).toEqual({ ok: false, reason: 'markup_invalid' });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('RESELLER-UX-2 — THE CTA LIVES ON ARRIVAL (founder walk item 2, supersedes the untouched-default gate)', () => {
  // The old gate (« PUBLISH CANNOT FIRE ON AN UNTOUCHED DEFAULT ») guarded the
  // defaulted 1 500 from being signed unchosen. The founder set the default to 0:
  // an un-acted publish now signs the LOWEST cliente price and pays the
  // commission net — safe by construction, so the gate and its `markupTouched`
  // state are retired, not merely bypassed.
  it('THE ONLY GATES ARE THE SEAM AND AN IN-FLIGHT PUBLISH — no untouched-slider gate survives', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/disabled=\{service === null \|\| publishing\}/);
    // …and the one honest sleep reason is stated, never left for her to guess
    expect(app).toMatch(/fiche\.cta_non_relie/);
    // the retired gate is GONE as state, not lingering half-wired
    expect(app).not.toMatch(/setMarkupTouched/);
    expect(app).not.toMatch(/markupTouched\[/);
  });

  it('THE HANDLER SENDS THE DISPLAYED MARKUP — what she reads is what signs (default 0 included)', () => {
    const app = read('App.tsx');
    const handler = /const publishListing = useCallback\([\s\S]*?\n  \);/.exec(app)?.[0] ?? '';
    expect(handler).toMatch(/const markup = viewOfOffer\(o\)\.markup;/);
    // membership is recorded AFTER the confirmed write, never before it
    const okIdx = handler.indexOf('if (!res.ok)');
    const addIdx = handler.indexOf('vitrineCol.addToVitrine');
    expect(okIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(okIdx);
  });
});

describe('THE DEMO ADAPTER CAN FAIL (certified-mock rule, Execution Contract §3)', () => {
  it('IT REFUSES WHEN SUPPLY IS UNAVAILABLE, exactly as the real service does', async () => {
    const demo = new DemoStorefrontService();
    demo.refuseSupplyFor.add('pv-lapsed');
    const req = { storefrontId: 'sf-1', resellerId: 'rs-1', markup: 1_000, correlationId: 'c', at: 'T' };
    expect(await demo.publishListing({ ...req, productVersionId: 'pv-lapsed' })).toEqual({
      ok: false,
      reason: 'supply_unavailable',
    });
    // A mock that could only succeed would make every test greener than the system.
    expect(await demo.publishListing({ ...req, productVersionId: 'pv-ok' })).toEqual({
      ok: true,
      value: { status: 'published' },
    });
  });

  it('IT RECORDS THE MARKUP AND COMPUTES NO PRICE — the app has no business computing one', async () => {
    const demo = new DemoStorefrontService();
    await demo.publishListing({
      storefrontId: 'sf-1',
      resellerId: 'rs-1',
      productVersionId: 'pv-1',
      markup: 2_500,
      correlationId: 'c',
      at: 'T',
    });
    expect(demo.published).toEqual([{ storefrontId: 'sf-1', productVersionId: 'pv-1', markup: 2_500 }]);
    expect(JSON.stringify(demo.published)).not.toContain('Price');
  });

  it('A RE-TAP AT THE SAME MARKUP IS IDEMPOTENT, never a second signed version', async () => {
    const demo = new DemoStorefrontService();
    const req = { storefrontId: 'sf-1', resellerId: 'rs-1', productVersionId: 'pv-1', markup: 900, correlationId: 'c', at: 'T' };
    expect((await demo.publishListing(req)).ok && (await demo.publishListing(req))).toEqual({
      ok: true,
      value: { status: 'idempotent' },
    });
    expect(demo.published).toHaveLength(1);
  });
});

describe('MONEY-SHAPE-1 item 4 — the toast that could not fail', () => {
  const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

  it('NO SLUG FROM THE SERVICE IS SAID, NOT COMPUTED', () => {
    // The defect: `created.value.slug ?? shortCode.toLowerCase()` printed a locally
    // computed slug the service never stored, on the screen telling her the shop is
    // live, looking identical either way. It cost the founder an hour.
    // Asserted on the CALL SITE, not on prose: the docblock above the fix quotes the
    // old expression deliberately, and a test that cannot tell code from a comment
    // would force the defect to go undocumented to stay green.
    expect(app).not.toMatch(/slug: created\.value\.slug \?\?/);
    expect(app).toMatch(/if \(created\.value\.slug === null \|\| created\.value\.slug === ''\)/);
    expect(app).toMatch(/k\.publier\.en_ligne_sans_slug/);
    // and the success line now prints ONLY what the service returned
    expect(app).toMatch(/tf\('k\.publier\.en_ligne', \{ slug: created\.value\.slug \}\)/);
  });

  it('THE HONEST STRING EXISTS IN THE CATALOG and never claims an address it lacks', () => {
    const catalog = JSON.parse(readFileSync(join(__dirname, '..', 'i18n/catalog.json'), 'utf8')) as {
      key: string; fr: string;
    }[];
    const entry = catalog.find((e) => e.key === 'k.publier.en_ligne_sans_slug');
    expect(entry).toBeDefined();
    // it states the shop IS live (true) and that the address has not come back (true)
    expect(entry!.fr).toMatch(/en ligne/i);
    expect(entry!.fr).not.toMatch(/\{slug\}/);
  });
});

describe('RESELLER-UX-1 — the seven-item founder walk, pinned', () => {
  const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

  it('ITEM 4 — a CONFIRMED add lands her on Ma Vitrine, after membership, never before', () => {
    const handler = /const publishListing = useCallback\([\s\S]*?\n  \);/.exec(app)?.[0] ?? '';
    const addIdx = handler.indexOf('vitrineCol.addToVitrine');
    const navIdx = handler.indexOf("toHub('vitrine')");
    expect(addIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(addIdx); // navigate AFTER the confirmed write
    // and never on the refusal path — the nav sits after the !res.ok return
    expect(handler.indexOf('if (!res.ok)')).toBeLessThan(navIdx);
  });

  it('ITEM 5 — the share preview reads the LIVE offer: name, client price, net, photo', () => {
    expect(app).toMatch(/shareOffer\?\.productName \?\? shareOpp\?\.name/);
    expect(app).toMatch(/shareOffer !== undefined \? viewOfOffer\(shareOffer\)\.client/);
    expect(app).toMatch(/shareOffer !== undefined \? viewOfOffer\(shareOffer\)\.net/);
    expect(app).toMatch(/shareOffer\?\.assetRefs\[0\]/);
  });

  it('ITEM 6 — the live slug is READ BACK, never computed, and threads to the customize stack', () => {
    // the state is fed by service.list() matched on HER storefrontId…
    expect(app).toMatch(/res\.value\.find\(\(r\) => r\.id === identity\.storefrontId\)/);
    // …or by the create response (a read-back too), never by deriveShortCode
    expect(app).toMatch(/setLiveShop\(\{ slug: created\.value\.slug \}\)/);
    expect(app).not.toMatch(/setLiveShop\(\{ slug: deriveShortCode/);
    expect(app).toMatch(/liveSlug=\{liveShop\?\.slug\}/);
    // « voir » opens HER public page from the read-back slug
    expect(app).toMatch(/Linking\.openURL\(`\$\{QR_ORIGIN\}\$\{QR_BASE\}\/v\/\$\{slug\}`\)/);
  });

  it('ITEM 6 — the publish CTA retires once the shop is live (customize screens)', () => {
    const k = readFileSync(join(__dirname, '..', 'src/vitrine/customize/screens.tsx'), 'utf8');
    expect(k).toMatch(/onPublishOnline && liveSlug === undefined && \(/);
    // and voir prefers the real page over the listing toast
    expect(k).toMatch(/liveSlug !== undefined && onOpenBoutique !== undefined \?/);
  });

  it('PHOTOS — every reseller surface renders the real photograph with the glyph as fallback', () => {
    // opp card, fiche héro, vitrine card, share héro: each shows assetRefs[0].
    // PIN EVOLVED (VIDEO-PARTOUT 2026-08-03): the opp card and the vitrine card
    // now render `ProductClip`, which draws that SAME photograph as its resting
    // state and only layers a clip over it when one exists. The property is
    // unchanged — every surface shows the real photograph — so the pin counts
    // BOTH spellings rather than the obsolete one. A surface that dropped the
    // photo entirely still fails, which is what this test is for.
    const photoSites = [
      ...(app.match(/<Image source=\{\{ uri: (item|opp|shareOffer)\.assetRefs\[0\] \}\}/g) ?? []),
      ...(app.match(/<ProductClip videoRef=\{item\.videoRef\} photoUri=\{item\.assetRefs\[0\]\}/g) ?? []),
    ];
    expect(photoSites.length).toBeGreaterThanOrEqual(3);
    // …and the clip surfaces pass the photograph, never a bare video with no
    // fallback: a product whose clip fails to load must still look like itself.
    expect(app).toMatch(/<ProductClip videoRef=\{item\.videoRef\} photoUri=\{item\.assetRefs\[0\]\}/);
    // aperçu cliente goes through the kit tile's photo variant
    expect(app).toMatch(/photoUri=\{item\.assetRefs\[0\]\}/);
  });

  it('ITEMS 2+3 — the fiche money card is three NAMED rows with net FIRST and a typable markup', () => {
    // net stays the first money figure ON THE FICHE (SP-I04). Scoped to the
    // fiche block: RESELLER-UX-2 put « Prix de base » on the Opportunités card
    // too (earlier in the file), so a whole-file indexOf no longer measures the
    // fiche's own order.
    const fiche = app.slice(app.indexOf("screen === 'fiche'"), app.indexOf("screen === 'vitrine'"));
    const gagnez = fiche.indexOf("tf('opportunity.gagnez'");
    const base = fiche.indexOf("t('fiche.prix_base')");
    const cliente = fiche.indexOf("t('fiche.prix_cliente')");
    expect(gagnez).toBeGreaterThan(-1);
    expect(gagnez).toBeLessThan(base);
    expect(base).toBeLessThan(cliente);
    // the typed field commits through the SAME snap as the slider — one value
    expect(app).toMatch(/onChange\(snapMarkup\(parsed, cap\)\)/);
    expect(app).toMatch(/<MarkupControl/);
  });
});

/**
 * RESELLER-UX-2 — the FOUR-ITEM founder walk (2026-07-26), pinned.
 *
 *   1 · Opportunités: the 60px row became a photo-first CARD — hero-height
 *       photo, 2-line name, Prix de base named, net loudest, honest épuisé.
 *   2 · Fiche: the CTA lives on arrival (default 0 signs the lowest price);
 *       the héro with photos opens the FULL gallery.
 *   3 · Ma Vitrine: the same three named money rows as the fiche; hero-height
 *       tappable photo onto the same gallery. Partager says « Prix », not
 *       « Votre prix » (whose?).
 *   4 · (buyer half pinned in buyer-pwa/test/real-product-render.test.ts)
 */
describe('RESELLER-UX-2 — the four-item founder walk, pinned', () => {
  const app = read('App.tsx');

  it('item 1 (UX-3 form) — Opportunités is the MARKETPLACE GRID: two columns, square cover photos', () => {
    // the founder's reference: two-column browse, photo edge-to-edge, compact
    // named detail. The SQUARE frame is the fit law now — cover on a square
    // barely trims, which is what makes the reference look professional.
    expect(app).toContain('numColumns={2}');
    expect(app).toContain('columnWrapperStyle={styles.oppGridRow}');
    expect(app).toMatch(/oppTileArt: \{\n\s*width: '100%',\n\s*aspectRatio: 1,/);
    const oppTileIdx = app.indexOf('styles.oppTile,');
    const body = app.slice(oppTileIdx, app.indexOf('</Pressable>', oppTileIdx));
    expect(body).toContain('numberOfLines={2}');
    // PIN EVOLVED (VIDEO-PARTOUT): the tile art is `ProductClip` now. The FIT
    // LAW is unchanged and still asserted — the component fills the square with
    // `cover` for both the photograph and the clip (product-clip.tsx), so the
    // square-crop discipline this test protects is proven at its new home.
    expect(body).toContain('<ProductClip');
    const clip = readFileSync(join(__dirname, '..', 'src', 'ui', 'product-clip.tsx'), 'utf8');
    expect(clip).toContain('resizeMode="cover"'); // the photograph
    expect(clip).toContain('contentFit="cover"'); // the clip
    expect(body).toContain("t('fiche.prix_base')"); // Prix de base, NAMED on the tile
    expect(body).toContain("tf('opportunity.gagnez'"); // net holds the price position
    // NET FIRST IN RENDER ORDER (SP-I04/I12): gagnez renders BEFORE the base row.
    expect(body.indexOf("tf('opportunity.gagnez'")).toBeLessThan(body.indexOf("t('fiche.prix_base')"));
    expect(body).toContain("t('opportunites.epuise')"); // zero stock says so pre-tap
    expect(body).toMatch(/item\.available === 0 &&/); // …and only when actually zero
  });

  it('item 2 (UX-3 form) — the fiche is a PRODUCT PAGE: square héro, thumbnails switch it, tap opens the gallery ON it', () => {
    expect(app).toMatch(/opp\.assetRefs\.length > 0 \? \(/);
    expect(app).toMatch(/setGallery\(\{ name: opp\.productName, refs: opp\.assetRefs, startAt: ficheHeroIdx \}\)/);
    expect(app).toMatch(/ficheHero: \{\n[^}]*aspectRatio: 1,/);
    // the thumbnail strip exists only when there is more than one capture, and
    // tapping a thumb switches the héro (the reference behaviour)
    expect(app).toMatch(/opp\.assetRefs\.length > 1 && \(\s*\n\s*<View style=\{styles\.thumbRow\}>/);
    expect(app).toMatch(/onPress=\{\(\) => setFicheHeroIdx\(i\)\}/);
    // …and the héro index resets on every fiche open, so product B never opens
    // on product A's remembered photo
    expect(app).toMatch(/setFicheId\(item\.productVersionId\); setFicheHeroIdx\(0\);/);
    expect(app).toContain("accessibilityLabel={t('galerie.ouvrir')}");
    expect(app).toContain('<PhotoGallery product={gallery} onClose=');
  });

  it('item 3 (UX-3 form) — Ma Vitrine card is a PRODUCT PAGE: square photo, thumbnail strip, named money rows', () => {
    expect(app).toMatch(/setGallery\(\{ name: item\.productName, refs: item\.assetRefs \}\)/);
    // each thumbnail opens the gallery ON that capture
    expect(app).toMatch(/setGallery\(\{ name: item\.productName, refs: item\.assetRefs, startAt: i \}\)/);
    expect(app).toMatch(/item\.assetRefs\.length > 1 && \(\s*\n\s*<View style=\{styles\.thumbRow\}>/);
    // the card reasons in the fiche's vocabulary: base · marge · prix cliente
    const cardIdx = app.indexOf('styles.vitrineCard}');
    const card = app.slice(cardIdx, app.indexOf('MarginSlider', cardIdx));
    expect(card).toContain("t('fiche.prix_base')");
    expect(card).toContain("t('fiche.marge_titre')");
    expect(card).toContain("t('fiche.prix_cliente')");
    // net-first survives the restructure: her net is still the hero figure
    expect(card).toContain('styles.vitrineNetHero');
    // the art is SQUARE (the founder's reference), not a fixed-height strip
    expect(app).toMatch(/vitrineCardArt: \{\n[^}]*aspectRatio: 1,/);
  });

  it('item 3 — Partager names the amount plainly: « Prix », never « Votre prix » (whose?)', () => {
    const catalog = read('i18n/catalog.json');
    const entry = /\{\s*"key": "share\.prix",\s*"fr": "([^"]+)"/.exec(catalog);
    expect(entry?.[1]).toBe('Prix : {amount}');
  });

  it('the gallery strings live in the catalog with registers — never inline', () => {
    const catalog = read('i18n/catalog.json');
    for (const key of ['galerie.ouvrir', 'galerie.fermer', 'galerie.compteur', 'opportunites.epuise']) {
      expect(catalog).toContain(`"key": "${key}"`);
    }
    // and the component reads them through t/tf, not literals
    const gal = read('src/ui/photo-gallery.tsx');
    expect(gal).toContain("t('galerie.fermer')");
    expect(gal).toContain("tf('galerie.compteur'");
  });

  it('THE FIT LAW (UX-3): SQUARE frames + cover — the frame shape, not the fit, is what protects the product', () => {
    // Founder reference (2026-07-27): the marketplace look is cover on SQUARE
    // frames — a square barely trims where a wide banner butchered, and the
    // letterboxed contain of the previous round is retired with it. All three
    // judging surfaces are square; no contain survives IN App.tsx (the
    // full-screen gallery viewer keeps contain deliberately — full-screen
    // viewing wants the whole photo, and it lives in photo-gallery.tsx).
    for (const frame of ['oppTileArt', 'ficheHero', 'vitrineCardArt']) {
      expect(app).toMatch(new RegExp(`${frame}: \\{\\n[^}]*aspectRatio: 1,`));
    }
    expect(app).not.toContain('resizeMode="contain"');
    // …and the ODD-count ghost: a lone last tile must keep its half-width, not
    // stretch into a screen-wide square (verifier finding).
    expect(app).toMatch(/offers\.length % 2 === 1 \? \(\[\.\.\.offers, null\]/);
    expect(app).toContain('styles.oppTileGhost');
  });

  it('the gallery page RE-SYNCS per product (to startAt) and the width is LIVE (verifier findings, pinned)', () => {
    const gal = read('src/ui/photo-gallery.tsx');
    // the component never unmounts, so a reopened gallery must not inherit the
    // previous session's page — counter and photo would disagree.
    expect(gal).toMatch(/useEffect\(\(\) => \{\s*\n\s*setPage\(product\?\.startAt \?\? 0\);\s*\n\s*\}, \[product\]\);/);
    // …and the list itself LANDS on that photo (exact page maths, no measure)
    expect(gal).toMatch(/initialScrollIndex=\{Math\.min\(product\?\.startAt \?\? 0/);
    expect(gal).toMatch(/getItemLayout=\{\(_, index\) => \(\{ length: width, offset: width \* index, index \}\)\}/);
    // the page width tracks rotation for real, not by comment
    expect(gal).toContain('useWindowDimensions()');
    expect(gal).not.toContain("Dimensions.get('window')");
  });
});
