import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * ═══ POLITIQUE-CONTENU-1 (AUDIT-SHOP-2 F-61) — THE BROWSER'S OWN WORD ═══
 *
 * The policy is built into both pages at build time (vite.config.ts; the
 * lines are pinned by value in test/csp.test.ts). What only a browser can say
 * is asked here, on the built pages the walks always use:
 *
 *   · the buyer's screens run under the policy WITHOUT A VIOLATION — the
 *     inline restore script (hashed), the chunks, the styles, the photograph
 *     from another origin, the calls to the service;
 *   · the policy is LIVE, not decorative: a script planted in the page does
 *     not run and is reported; a fetch to a foreign origin is refused;
 *   · a cross-origin request carries the ORIGIN alone as Referer — never the
 *     page's `?liste=` token or `?pid=`;
 *   · WhatsApp opens with neither a handle on this page nor a Referer at all;
 *   · the deep link still boots through the 404 restore — both inline scripts
 *     run under their own hashes.
 *
 * Violations are collected by a listener installed before any page script
 * runs (`securitypolicyviolation` fires on the document for every refusal,
 * silent otherwise). The walk claims nothing about appearance.
 */

const DEMO = 'http://127.0.0.1:4173';
const REEL = 'http://127.0.0.1:4175';
const PAGES = 'http://127.0.0.1:4174';
const TOKEN = 'T'.repeat(32);
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

interface Violation {
  directive: string;
  blocked: string;
}

/** Install the collector in EVERY document of the context — the page, a popup,
 *  the 404 page and the restored page alike — before any script of theirs runs. */
async function ecouterViolations(page: Page): Promise<void> {
  await page.context().addInitScript(() => {
    const w = window as unknown as { __csp: Violation[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI });
    });
  });
}

/** What the collector heard — and LOUD if it was never installed in this
 *  document, so « no violation » can never pass by an absent instrument. */
const violations = async (page: Page): Promise<Violation[]> => {
  const v = await page.evaluate(() => (window as unknown as { __csp?: Violation[] }).__csp);
  if (v === undefined) throw new Error('the violation collector is not installed in this document — « no violation » would be vacuous');
  return v;
};

/** The two metas as the served page carries them. */
const metas = (page: Page): Promise<{ csp: string | null; referrer: string | null }> =>
  page.evaluate(() => ({
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null,
    referrer: document.querySelector('meta[name="referrer"]')?.getAttribute('content') ?? null,
  }));

/** The shop the service answers with on the real port — p2 carries a photograph
 *  on ANOTHER origin, which is what the Referer proof needs. */
const BOUTIQUE = {
  id: 'sf-e2e-csp-1',
  slug: 'aicha-4821',
  resellerId: 'rs-e2e-csp-1',
  name: 'Chez Aïcha Mode',
  zone: 'Rood Woko',
  curatedItems: ['p1', 'p2'],
  featuredItems: ['p1'],
  cover: { status: 'none' }, avatar: { mode: 'monogram' }, theme: 'laterite', sections: [], productNotes: {},
  headerStyle: 'classique', discoverable: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  products: [
    { pid: 'p1', name: 'Bazin riche brodé', priceFcfa: 12_000, inStock: true, assetRefs: [] },
    { pid: 'p2', name: 'Pagne wax 6 yards', priceFcfa: 8_500, inStock: true, assetRefs: ['https://media.example/media/p2-hero'] },
  ],
};

test('DEMO — the buyer’s screens run under the policy with no violation; a planted script and a foreign fetch are refused (the control)', async ({ page }) => {
  await ecouterViolations(page);
  await page.goto(`${DEMO}/?demo-cliente=C5&theme=indigo`);
  await expect(page.locator('[data-screen="C5"]')).toBeVisible();
  const m = await metas(page);
  expect(m.csp, 'the policy meta is on the served page').toContain("script-src 'self' 'sha256-");
  expect(m.referrer).toBe('strict-origin-when-cross-origin');
  expect(await violations(page)).toEqual([]);

  // THE CONTROL — the policy refuses, and the collector hears it: a script
  // planted in the page does not run; a fetch to a foreign origin never leaves.
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = '(window).__plante = 1;';
    document.head.appendChild(s);
  });
  expect(await page.evaluate(() => (window as unknown as { __plante?: number }).__plante)).toBeUndefined();
  await page.evaluate(() => fetch('https://exemple.invalid/fuite').catch(() => undefined));
  const apres = await violations(page);
  expect(apres.map((v) => v.directive.split(' ')[0])).toEqual(expect.arrayContaining(['script-src-elem', 'connect-src']));
  // Chromium reports the whole blocked url for a refused connection.
  expect(apres.find((v) => v.directive.startsWith('connect-src'))?.blocked).toBe('https://exemple.invalid/fuite');
});

test('RÉEL — the shop with a photograph on another origin: no violation, and the photograph’s Referer is the ORIGIN alone, never the liste token or the pid', async ({ page }) => {
  await ecouterViolations(page);
  await page.route('**/api/s/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOUTIQUE) }),
  );
  await page.route('**/checkout/**', (route: Route) => route.abort('failed'));
  const referers: (string | undefined)[] = [];
  await page.route('https://media.example/**', (route: Route) => {
    referers.push(route.request().headers()['referer']);
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG_1PX, 'base64') });
  });

  // The Pages-restore form of the deep link, its query carrying a liste token.
  await page.goto(`${REEL}/?/s/aicha-4821&pid=p2~and~liste=${TOKEN}`);
  await expect(page.locator('.cl-photo-img')).toHaveAttribute('src', 'https://media.example/media/p2-hero');
  expect(new URL(page.url()).search, 'the restored URL carries the token — the very thing that must not leak').toContain(`liste=${TOKEN}`);
  await expect.poll(() => referers.length, { message: 'the photograph was never asked for' }).toBeGreaterThan(0);
  for (const r of referers) {
    expect(r, 'the Referer must be the origin alone').toBe(`${REEL}/`);
  }
  expect(await violations(page)).toEqual([]);
});

test('RÉEL — WhatsApp opens with neither a handle on this page nor a Referer', async ({ page, context }) => {
  await ecouterViolations(page);
  const referers: (string | undefined)[] = [];
  await context.route('https://wa.me/**', (route: Route) => {
    referers.push(route.request().headers()['referer']);
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>wa</title>' });
  });
  // The disc exists only when the resolve vouches for digits (CONTACT-WHATSAPP-1).
  await page.route('**/api/s/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...BOUTIQUE, whatsapp: '22670112233' }) }),
  );
  await page.route('**/checkout/**', (route: Route) => route.abort('failed'));
  await page.route('https://media.example/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG_1PX, 'base64') }),
  );
  await page.goto(`${REEL}/?/v/aicha-4821`);
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('[data-action="whatsapp"]').first().click(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toMatch(/^https:\/\/wa\.me\//);
  // noopener, as the opened document itself sees it (Playwright's own
  // `opener()` reports the browser's parent relation even under noopener).
  expect(await popup.evaluate(() => window.opener === null), 'noopener: the opened site holds no handle on this page').toBe(true);
  expect(referers.length).toBeGreaterThan(0);
  for (const r of referers) {
    expect(r, 'noreferrer: wa.me learns nothing of the page, not even its origin').toBeUndefined();
  }
  expect(await violations(page)).toEqual([]);
});

test('PAGES — the deep link boots through the 404 restore under the policy: both inline scripts run under their own hashes, no violation', async ({ page }) => {
  await ecouterViolations(page);
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  await page.goto(`${PAGES}/shop-plus/v/aicha-4821`, { waitUntil: 'load' });
  await expect(page.locator('.vt-root[data-screen="vitrine"]')).toBeVisible({ timeout: 10_000 });
  // The 404 page's script redirected, index.html's script restored: both ran.
  expect(new URL(page.url()).pathname).toBe('/shop-plus/v/aicha-4821');
  expect(failed).toEqual([]);
  expect((await metas(page)).csp).toContain("base-uri 'self'");
  expect(await violations(page)).toEqual([]);
});
