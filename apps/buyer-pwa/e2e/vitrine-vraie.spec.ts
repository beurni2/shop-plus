import { expect, test, type Page, type Route } from '@playwright/test';
import { commeInvitee } from './invitee';

/**
 * ═══ VITRINE-VRAIE-1 (AUDIT-3, founder 2026-10-01 « make it be 2 slices fix »)
 * — the boutique a buyer opens tells the truth, walked on the PUBLISHED build ═══
 *
 * Port 4175 is built the deploy's way (`VITE_STOREFRONT_BASE` + `VITE_PROFILE
 * =production`, playwright.config.ts), so every port here is the real HTTP
 * adapter. The service is scripted at the network with the bodies the Worker
 * answers — its paging, its count, its refusals are pinned on workerd in
 * `services/storefront-service/test/vitrine-vraie.e2e.test.ts`. The walks ask
 * the four questions: the tree survives · the primary action is present,
 * pressable and wired · an act that fires by itself leaves a way out · she
 * reaches the next screen. NOTHING here claims appearance.
 */

const BASE = 'http://127.0.0.1:4175';
test.use({ baseURL: BASE });

const PAGE = 14;
const SLUG = 'aicha-4821';
const produit = (i: number) => ({ pid: `p${i}`, name: `Article ${i}`, priceFcfa: 10_000 + i * 100, inStock: true, assetRefs: [] as string[] });

function boutique(n: number, extra: Record<string, unknown> = {}) {
  return {
    id: 'sf-e2e-vv-1', slug: SLUG, resellerId: 'rs-e2e-vv-1', name: 'Chez Aïcha Mode', zone: 'Rood Woko',
    curatedItems: Array.from({ length: n }, (_, k) => `p${k + 1}`), featuredItems: [],
    cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite', sections: [], productNotes: {},
    headerStyle: 'classique', discoverable: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

/** The Worker's paging, exactly: `?pid=` describes those (in her shop) and stops; else a window from `depuis`, with `suite`. */
function repondre(n: number, url: URL, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const sf = boutique(n, extra);
  const tous = sf.curatedItems;
  const demandes = (url.searchParams.get('pid') ?? '').split(',').filter((p) => p !== '' && tous.includes(p));
  if (demandes.length > 0) return { ...sf, products: demandes.map((p) => produit(Number(p.slice(1)))) };
  const depuis = Number(url.searchParams.get('depuis') ?? '0');
  const fin = depuis + PAGE;
  return {
    ...sf,
    products: tous.slice(depuis, fin).map((p) => produit(Number(p.slice(1)))),
    ...(fin < tous.length ? { suite: fin } : {}),
  };
}

async function service(page: Page, reponse: (url: URL) => Record<string, unknown> | 'pendre', lus: string[] = []): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  await commeInvitee(page);
  await page.route('**/api/s/**', async (route: Route) => {
    const url = new URL(route.request().url());
    lus.push(url.pathname + url.search);
    const r = reponse(url);
    if (r === 'pendre') return; // a network that neither answers nor fails
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  });
  await page.route('**/checkout/**', (route) => route.abort('failed'));
  // GitHub Pages reaches a deep `/v/…` or `/s/…` address through its 404.html,
  // which re-addresses it as `/?/v/…` (public/404.html); `vite preview` has no
  // such fallback, so a tap's real navigation is re-addressed here the same way.
  await page.route(/^http:\/\/127\.0\.0\.1:4175\/(v|s)\//, (route) => {
    const u = new URL(route.request().url());
    const q = u.search ? `&${u.search.slice(1).replace(/&/g, '~and~')}` : '';
    return route.fulfill({ status: 302, headers: { location: `${BASE}/?/${u.pathname.slice(1)}${q}` } });
  });
  return errors;
}

const pidsAffiches = async (page: Page): Promise<string[]> =>
  [...new Set(await page.locator('.vt-root [data-action="produit"][data-pid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-pid') ?? '')))];

test.describe('issue 1 — every product of a big boutique reaches the buyer', () => {
  test('a 16-product boutique shows all 16 — not 15, not 14', async ({ page }) => {
    const errors = await service(page, (url) => repondre(16, url));
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect.poll(async () => (await pidsAffiches(page)).length).toBe(16);
    expect((await pidsAffiches(page)).sort()).toEqual(Array.from({ length: 16 }, (_, k) => `p${k + 1}`).sort());
    expect(errors).toEqual([]);
  });

  test('the link to her 16th article opens THAT article — never « no boutique »', async ({ page }) => {
    const errors = await service(page, (url) => repondre(16, url));
    await page.goto(`/?/s/${SLUG}&pid=p16`);
    await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible();
    await expect(page.locator('.cl-prodtitle')).toHaveText('Article 16');
    await expect(page.locator('.vt-root[data-etat="invalid"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('some articles not described just now: her page shows the others AND says so, with « Réessayer »', async ({ page }) => {
    const lus: string[] = [];
    const errors = await service(page, () => ({ ...boutique(3), products: [produit(1), produit(2)], incomplet: true }), lus);
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect.poll(async () => (await pidsAffiches(page)).length).toBe(2);
    const note = page.locator('[data-role="vitrine-incomplet"]');
    await expect(note).toBeVisible();
    const avant = lus.length;
    await note.locator('[data-action="reessayer"]').click();
    await expect.poll(() => lus.length).toBeGreaterThan(avant);
    expect(errors).toEqual([]);
  });

  test('a supply outage on a stocked boutique says the articles cannot show right now — never « prépare sa boutique » — and « Réessayer » asks again', async ({ page }) => {
    const lus: string[] = [];
    const errors = await service(page, () => ({ ...boutique(3), products: [], incomplet: true }), lus);
    await page.goto(`/?/v/${SLUG}`);
    const carte = page.locator('[data-role="vitrine-indisponible"]');
    await expect(carte).toBeVisible();
    await expect(page.locator('body')).not.toContainText('prépare sa boutique');
    const avant = lus.length;
    await carte.locator('[data-action="reessayer"]').click();
    await expect.poll(() => lus.length).toBeGreaterThan(avant);
    expect(errors).toEqual([]);
  });
});

test.describe('issues 4, 6 and 17 — a link that is not (or no longer) an article of hers', () => {
  test('a removed article: « {nom} ne vend plus cet article. » and the one act leads to HER boutique', async ({ page }) => {
    const errors = await service(page, (url) => repondre(3, url));
    await page.goto(`/?/s/${SLUG}&pid=p9`);
    const carte = page.locator('[data-role="article-retire"]');
    await expect(carte).toBeVisible();
    // AUDIT-4 B-08 — her name stands alone: never « … chez Chez Aïcha Mode ».
    await expect(carte).toContainText('Chez Aïcha Mode ne vend plus cet article.');
    await expect(carte).not.toContainText('chez Chez');
    await expect(page.locator('.vt-root[data-etat="invalid"]')).toHaveCount(0);
    await carte.locator('[data-action="voir-boutique"]').click();
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect.poll(async () => (await pidsAffiches(page)).length).toBe(3);
    expect(errors).toEqual([]);
  });

  test('a demo seed id on a real link is NOT a demo product (no « Sandales cuir homme »): it is not hers, and the page says so', async ({ page }) => {
    const errors = await service(page, (url) => repondre(3, url));
    await page.goto(`/?/s/${SLUG}&pid=p4`);
    await expect(page.locator('[data-role="article-retire"]')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Sandales cuir homme');
    await expect(page.locator('main.cl-root')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('an article her boutique could not describe right now: « ne s’affiche pas pour le moment », with « Réessayer » and a road to her boutique', async ({ page }) => {
    const lus: string[] = [];
    const errors = await service(page, (url) => (url.searchParams.get('pid') !== null ? { ...boutique(3), products: [], incomplet: true } : repondre(3, url)), lus);
    await page.goto(`/?/s/${SLUG}&pid=p2`);
    const carte = page.locator('[data-role="article-indisponible"]');
    await expect(carte).toBeVisible();
    await expect(carte.locator('[data-action="voir-boutique"]')).toBeVisible();
    // « Réessayer » is wired: it asks the service for THIS article again (verifier m3).
    const avant = lus.filter((l) => l.includes('pid=p2')).length;
    await carte.locator('[data-action="reessayer"]').click();
    await expect.poll(() => lus.filter((l) => l.includes('pid=p2')).length).toBeGreaterThan(avant);
    await expect(page.locator('[data-role="article-indisponible"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a product link that lost its ?pid= opens HER BOUTIQUE — never her first article dressed as the one shared', async ({ page }) => {
    const errors = await service(page, (url) => repondre(3, url));
    await page.goto(`/?/s/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect(page.locator('main.cl-root [data-screen="C1"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('issues 5 and 13 — no testing switch answers on the published site', () => {
  test('?demo-vitrine-etat=pause on her real link draws HER boutique, not a forged pause', async ({ page }) => {
    const errors = await service(page, (url) => repondre(3, url));
    await page.goto(`/?/v/${SLUG}&demo-vitrine-etat=pause`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('fait une pause');
    expect(errors).toEqual([]);
  });

  test('?demo-vitrine= and ?demo-signed= open the ordinary home card — no demo shop, no fake counts', async ({ page }) => {
    await service(page, (url) => repondre(3, url));
    for (const adresse of ['/?demo-vitrine=aicha-4821', '/?demo-signed=aicha-4821&pid=p1']) {
      await page.goto(adresse);
      await expect(page.locator('[data-screen="racine"]')).toBeVisible();
      await expect(page.locator('body')).not.toContainText('16 ventes livrées');
      await expect(page.locator('body')).not.toContainText('4,8');
    }
  });
});

test.describe('issue 12 — her code, typed the way people type it', () => {
  test('« aicha 4821 », « Aicha4821 » and «  AICHA - 4821 » each open HER boutique from the home card', async ({ page }) => {
    const errors = await service(page, (url) => repondre(3, url));
    for (const tape of ['aicha 4821', 'Aicha4821', '  AICHA - 4821 ']) {
      await page.goto('/');
      await page.locator('[data-role="racine-lien"]').fill(tape);
      await page.locator('[data-action="racine-ouvrir"]').click();
      await expect(page).toHaveURL(/\/v\/aicha-4821$/);
      await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});

test.describe('issue 7 — « N ventes livrées » from the service', () => {
  test('12 delivered ⇒ « 12 ventes livrées » and no « Nouvelle vendeuse »', async ({ page }) => {
    await service(page, (url) => ({ ...repondre(2, url), ventesLivrees: 12 }));
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('[data-role="reputation"]').first()).toContainText('12');
    await expect(page.locator('[data-role="chip-nouvelle"]')).toHaveCount(0);
  });

  test('0 delivered ⇒ « Nouvelle vendeuse »; a count the service could not read ⇒ neither', async ({ page }) => {
    let compte: number | undefined = 0;
    await service(page, (url) => ({ ...repondre(2, url), ...(compte !== undefined ? { ventesLivrees: compte } : {}) }));
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('[data-role="chip-nouvelle"]')).toBeVisible();
    compte = undefined;
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect(page.locator('[data-role="chip-nouvelle"]')).toHaveCount(0);
    await expect(page.locator('[data-role="reputation"]')).toHaveCount(0);
  });
});

test.describe('issue 8 — a network that hangs never leaves a blank page', () => {
  test('the shared product link shows a frame at once, then « Réessayer » when the boutique never answers', async ({ page }) => {
    test.setTimeout(45_000);
    const errors = await service(page, () => 'pendre');
    await page.goto(`/?/s/${SLUG}&pid=p1`);
    await expect(page.locator('.vt-root')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('.vt-root[data-etat="offline"] [data-action="reessayer"]')).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test('the boutique link leaves « Ouverture… » for the offline card when nothing answers', async ({ page }) => {
    test.setTimeout(45_000);
    await service(page, () => 'pendre');
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="offline"] [data-action="reessayer"]')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('issue 15 — a liste from another boutique is ignored on this one', () => {
  test('her liste (with an address) opened on ANOTHER seller’s product: the buyer fills her own delivery (C3), the liste does not ride', async ({ page }) => {
    await service(page, (url) => repondre(3, url));
    const jeton = 'A'.repeat(32);
    await page.route('**/api/listes/**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, liste: { nom: 'Mariam', slug: 'fatou-1234', articles: [{ pid: 'p1', offert: false }], livraison: true } }),
      }),
    );
    // The Pages restore joins a deep link's extra params with `~and~` (index.html).
    await page.goto(`/?/s/${SLUG}&pid=p1~and~liste=${jeton}`);
    await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible();
    await page.locator('.cl-cta').first().click();
    await expect(page.locator('main.cl-root [data-screen="C3"]')).toBeVisible();
  });
});

test.describe('issue 20 — a gift-list read that meets a server error says so', () => {
  test('a 503 on the liste read: « ne répond pas » with « Réessayer », never « n’existe pas »', async ({ page }) => {
    await service(page, (url) => repondre(3, url));
    await page.route('**/api/listes/**', (route) => route.fulfill({ status: 503, contentType: 'text/html', body: '<html>proxy</html>' }));
    await page.goto(`/?/v/${SLUG}&liste=${'B'.repeat(32)}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('n’existe pas');
    await expect(page.locator('[data-role="vitrine-liste-slot"] [data-action="reessayer"], [data-role="vitrine-liste-slot"] [data-action="liste-reessayer"]').first()).toBeVisible();
  });
});

test.describe('issue 18 — her products come before the liste invitation', () => {
  test('without a friend’s liste the first product precedes the liste slot in the page; with one, the liste banner leads', async ({ page }) => {
    await service(page, (url) => repondre(4, url));
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    const ordre = await page.evaluate(() => {
      const slot = document.querySelector('[data-role="vitrine-liste-slot"]');
      const prod = document.querySelector('.vt-root [data-action="produit"][data-pid]');
      if (slot === null || prod === null) return 'absent';
      return prod.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING ? 'produit-avant' : 'liste-avant';
    });
    expect(ordre).toBe('produit-avant');

    // …and with a friend's liste link, the liste she came for leads (verifier m3).
    await page.route('**/api/listes/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, liste: { nom: 'Mariam', slug: SLUG, articles: [{ pid: 'p2', offert: false }], livraison: false } }) }),
    );
    await page.goto(`/?/v/${SLUG}&liste=${'C'.repeat(32)}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    const ordreAmie = await page.evaluate(() => {
      const slot = document.querySelector('[data-role="vitrine-liste-slot"]');
      const prod = document.querySelector('.vt-root [data-action="produit"][data-pid]');
      if (slot === null || prod === null) return 'absent';
      return prod.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING ? 'produit-avant' : 'liste-avant';
    });
    expect(ordreAmie).toBe('liste-avant');
  });
});

test.describe('issue 19 — a clip never costs data when she asked for less', () => {
  test('« reduce motion »: the clip file is never fetched; without it, the clip plays', async ({ browser }) => {
    for (const reduit of [true, false]) {
      const ctx = await browser.newContext({ baseURL: BASE, reducedMotion: reduit ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const clips: string[] = [];
      await page.route('**/clip-*.mp4', (route) => {
        clips.push(route.request().url());
        return route.abort('failed');
      });
      await service(page, (url) => {
        const r = repondre(2, url);
        return { ...r, products: (r['products'] as ReturnType<typeof produit>[]).map((p) => ({ ...p, videoRef: `https://media.example/clip-${p.pid}.mp4`, assetRefs: ['https://media.example/photo.jpg'] })) };
      });
      await page.route('**/photo.jpg', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }));
      await page.goto(`/?/v/${SLUG}`);
      await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
      await page.locator('[data-role="video-hero"]').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1_500);
      if (reduit) expect(clips, 'no clip byte under « reduce motion »').toEqual([]);
      else expect(clips.length, 'the CONTROL: the clip is fetched when allowed').toBeGreaterThan(0);
      await ctx.close();
    }
  });

  test('the product page she was sent: under « reduce motion » its clip is a still poster, never fetched; without it, it plays (verifier M1)', async ({ browser }) => {
    for (const reduit of [true, false]) {
      const ctx = await browser.newContext({ baseURL: BASE, reducedMotion: reduit ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const clips: string[] = [];
      await page.route('**/clip-*.mp4', (route) => {
        clips.push(route.request().url());
        return route.abort('failed');
      });
      await service(page, (url) => {
        const r = repondre(2, url);
        return { ...r, products: (r['products'] as ReturnType<typeof produit>[]).map((p) => ({ ...p, videoRef: `https://media.example/clip-${p.pid}.mp4`, assetRefs: ['https://media.example/photo.jpg'] })) };
      });
      await page.route('**/photo.jpg', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }));
      await page.goto(`/?/s/${SLUG}&pid=p1`);
      await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible();
      await page.waitForTimeout(1_500);
      if (reduit) expect(clips, 'no clip byte on the product page under « reduce motion »').toEqual([]);
      else expect(clips.length, 'the CONTROL: the product page clip is fetched when allowed').toBeGreaterThan(0);
      await ctx.close();
    }
  });
});

test.describe('issue 16 — header lines say only what is true of HER shop', () => {
  test('a Bobo-Dioulasso shop on the « couverture » header never reads « Ouagadougou »; the karité header never claims « Pur beurre de karité »; no « Boutique Séra vérifiée »', async ({ page }) => {
    let entete = 'couverture';
    await service(page, (url) => ({ ...repondre(2, url, { zone: 'Secteur 22, Bobo-Dioulasso', headerStyle: entete }) }));
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect(page.locator('.vt-root')).not.toContainText('Ouagadougou');
    await expect(page.locator('.vt-root')).not.toContainText('Boutique Séra vérifiée');
    entete = 'karite';
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect(page.locator('.vt-root')).not.toContainText('Pur beurre de karité');
  });
});

/* ═══ ENTETE-BORNEE-1 (AUDIT-4 B-01) — her header style never freezes her boutique ═══
 * 28 of her header styles live in their own small file, fetched after the
 * boutique read. A failed fetch already drew the default header; a fetch that
 * neither answered nor failed (a stalled 2G socket) left the page on
 * « Ouverture de la boutique… » for ever, with nothing to press. Written RED
 * first: the style file is held open and the boutique must still open, on the
 * default header, within the bound. */
test.describe('ENTETE-BORNEE-1 — a header style that never arrives never freezes her boutique', () => {
  test('her style file hangs: the boutique opens anyway, on the default header, with her articles', async ({ page }) => {
    const errors = await service(page, (url) => repondre(3, url, { headerStyle: 'pagne' }));
    const demandes: string[] = [];
    const tenues: Route[] = [];
    await page.route(/\/pagne-[A-Za-z0-9_-]+\.js$/, (route) => {
      demandes.push(route.request().url());
      tenues.push(route); // held open: neither answered nor failed
    });
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible({ timeout: 12_000 });
    expect(demandes.length, 'her style WAS asked for — the walk holds the real request').toBeGreaterThan(0);
    expect(await pidsAffiches(page)).toEqual(['p1', 'p2', 'p3']);
    await expect(page.locator('.vt-root .pg-hero')).toHaveCount(0);
    await expect(page.locator('.vt-root')).toContainText('Chez Aïcha Mode');
    // Her style file lands AFTER the bound (verifier minor 2): it is not
    // swapped in under her eyes — not now, not after she taps a heart.
    const arrivee = page.waitForResponse(/\/pagne-[A-Za-z0-9_-]+\.js$/);
    for (const r of tenues) await r.continue();
    await arrivee;
    await page.locator('.vt-root [data-action="favori"]').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('.vt-root .pg-hero')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('CONTROL — the same style file answering draws HER style', async ({ page }) => {
    const errors = await service(page, (url) => repondre(3, url, { headerStyle: 'pagne' }));
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect(page.locator('.vt-root .pg-hero')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});

/* ═══ PHOTOS-LEGERES-1 (AUDIT-4 B-02) — her photos, downloaded small ═══
 *
 * AUDIT-4 measured her 2048 px cover and portrait drawn into 44–280 px boxes,
 * downloaded in full by every buyer on the first screen. The page now asks the
 * service for the small copy (`?v=petite`; the service answers the photo itself
 * while no copy exists — pinned on workerd in `photos-legeres.e2e.test.ts`).
 * The walk records what the page DOWNLOADS for her two photos, in the default
 * header and two lazily-loaded ones. It claims nothing about how they look. */
test.describe('PHOTOS-LEGERES-1 — her cover and portrait are asked small', () => {
  const MEDIA = 'https://media.invalid/media/storefronts/sf-e2e-vv-1';
  for (const entete of ['classique', 'pagne', 'royale']) {
    test(`${entete}: every download of her photos asks the small copy, none the full photo`, async ({ page }) => {
      const demandes: string[] = [];
      await page.route('https://media.invalid/**', (route) => {
        demandes.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
      });
      const errors = await service(page, (url) => repondre(3, url, {
        headerStyle: entete,
        cover: { status: 'live', url: `${MEDIA}/cover/c.jpeg` },
        avatar: { mode: 'photo', url: `${MEDIA}/avatar/a.jpeg` },
      }));
      await page.goto(`/?/v/${SLUG}`);
      await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
      await expect.poll(() => demandes.length, 'her photos were never asked for').toBeGreaterThan(0);
      await page.waitForTimeout(500);
      expect(demandes.filter((u) => !u.endsWith('?v=petite')), 'a full-size download of her photo').toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

/* ═══ COPIE-ACCES-1 (AUDIT-4 B-05) — her code in capitals, as the poster prints
 * it and as people type it, opens her boutique and her product link ═══ */
test.describe('B-05 — a link in capitals still reaches her', () => {
  test('/v/AICHA-4821 opens her boutique, read under the lowercase address', async ({ page }) => {
    const lus: string[] = [];
    const errors = await service(page, (url) => repondre(3, url), lus);
    await page.goto(`/?/v/${SLUG.toUpperCase()}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await expect.poll(async () => (await pidsAffiches(page)).length).toBe(3);
    expect(lus.every((l) => l.includes(`/s/${SLUG}`)), JSON.stringify(lus)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('/s/AICHA-4821?pid=p1 opens the product page, not the root card, read under the lowercase address', async ({ page }) => {
    const lus: string[] = [];
    const errors = await service(page, (url) => repondre(3, url), lus);
    await page.goto(`/?/s/${SLUG.toUpperCase()}&pid=p1`);
    await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible();
    expect(lus.length, 'the product page never read her boutique').toBeGreaterThan(0);
    expect(lus.every((l) => l.includes(`/s/${SLUG}`)), JSON.stringify(lus)).toBe(true);
    expect(errors).toEqual([]);
  });
});

/* ═══ COPIE-ACCES-1 (AUDIT-4 B-06) — every way out and every card, by keyboard ═══
 * The state cards' one action was a <span> no keyboard or switch could reach,
 * and the tile's heart, bag and voice chip sat inside the tile's <button>. The
 * walk presses only Tab and Enter — no click — and asserts she reaches the
 * next step. It claims nothing about how the focus ring looks. */
async function tabJusqua(page: Page, cible: string, max = 40): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, cible)) return;
  }
  throw new Error(`Tab never reached ${cible}`);
}

test.describe('B-06 — by keyboard alone', () => {
  test('the offline card: Tab reaches « Réessayer », Enter retries, the boutique opens', async ({ page }) => {
    let enLigne = false;
    const errors = await service(page, (url) => (enLigne ? repondre(3, url) : 'pendre'));
    await page.route('**/api/s/**', async (route) => {
      if (!enLigne) return route.abort('failed');
      return route.fallback();
    });
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root [data-action="reessayer"]')).toBeVisible({ timeout: 15_000 });
    enLigne = true;
    await tabJusqua(page, '.vt-root [data-action="reessayer"]');
    await page.keyboard.press('Enter');
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a product card of the grid: Tab reaches it, Enter opens THAT product; the heart answers Enter on its own', async ({ page }) => {
    const errors = await service(page, (url) => repondre(3, url));
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await tabJusqua(page, '.vt-root [data-action="favori"]');
    const coeur = page.locator(':focus');
    const avant = await coeur.getAttribute('aria-pressed');
    await page.keyboard.press('Enter');
    await expect(coeur).not.toHaveAttribute('aria-pressed', avant ?? '');
    await expect(page.locator('main.cl-root')).toHaveCount(0); // the heart did not open the product
    // A GRID card by name: Tab wraps round the page, so « any card » would be
    // satisfied by the « à la une » card even if no grid card were reachable.
    await tabJusqua(page, '.vt-grid [data-action="produit"]');
    const pid = await page.locator(':focus').getAttribute('data-pid');
    await page.keyboard.press('Enter');
    await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible();
    await expect(page.locator('.cl-prodtitle')).toHaveText(`Article ${String(pid).slice(1)}`);
    expect(errors).toEqual([]);
  });

  test('the « à la une » card: Tab reaches it, Enter opens THAT product', async ({ page }) => {
    const errors = await service(page, (url) => repondre(3, url));
    await page.goto(`/?/v/${SLUG}`);
    await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
    await tabJusqua(page, '.vt-featured[data-action="produit"]');
    const pid = await page.locator(':focus').getAttribute('data-pid');
    await page.keyboard.press('Enter');
    await expect(page.locator('main.cl-root [data-screen="C1"]')).toBeVisible();
    await expect(page.locator('.cl-prodtitle')).toHaveText(`Article ${String(pid).slice(1)}`);
    expect(errors).toEqual([]);
  });
});
