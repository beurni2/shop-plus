import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * SP3.2b — THE REAL QUOTE PATH, IN A REAL BROWSER, AGAINST A SCRIPTED SERVICE.
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * Nothing in this repo executed `createCliente` on its real-service path. The
 * unit suite tests the pure modules (`quote-port`, `quote-model`, the renderers)
 * and `cliente.spec.ts` drives the DEMO port, which never refuses, never expires
 * oddly and always reserves. So the flow's own money branches — the stale-answer
 * guard, the timer clear on Retour, the rejection catch, and both halves of the
 * clock escape — had NO coverage at all: a fresh verifier deleted each of those
 * five lines in turn and every gate stayed green.
 *
 * This suite closes that. It runs against the port-4175 build made with
 * `VITE_STOREFRONT_BASE` (see `playwright.config.ts`), so `resolveQuotePort`
 * returns the REAL `httpQuotePort`; every `/checkout/**` request is intercepted
 * here and answered by a scripted service. Real bundle, real `fetch`, real
 * timers, real DOM.
 *
 * EACH TEST NAMES THE LINE IT PROTECTS. If you delete that line, the named test
 * below must go red — that is the whole point, and it is proven by mutation.
 *
 * The `?demo-signed=` entry resolves the STOREFRONT from the demo seed (no
 * network) while the QUOTE port stays real — exactly the seam we want to drive.
 */

const BASE = 'http://127.0.0.1:4175';
const ENTRY = `${BASE}/?demo-signed=aicha-4821`;

const FULL_QUOTE = {
  quoteId: 'quote-full-1',
  paymentMode: 'FULL_PREPAY',
  productSubtotal: 11_500,
  deliveryFee: 1_000,
  buyerTotal: 12_500,
  amountPaidAtCheckout: 12_500,
  amountDueAtDelivery: 0,
};
const DOOR_QUOTE = {
  ...FULL_QUOTE,
  quoteId: 'quote-door-1',
  paymentMode: 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR',
  amountPaidAtCheckout: 1_000,
  amountDueAtDelivery: 11_500,
};

interface Scripted {
  /** ms the FULL quote stays valid, from the moment it is issued. */
  ttlMs?: number;
  /** answer the door ask with a real quote (default: refuse, production truth) */
  doorAvailable?: boolean;
  /** hold the door ask this long (a stall) */
  doorDelayMs?: number;
  /** hold the reserve this long */
  reserveDelayMs?: number;
}

interface Wire {
  quotes: Array<Record<string, unknown>>;
  reserves: Array<{ url: string; body: Record<string, unknown> }>;
}

/** Install the scripted checkout service and return the wire log. */
async function scriptService(page: Page, opts: Scripted = {}): Promise<Wire> {
  const wire: Wire = { quotes: [], reserves: [] };
  const ttl = opts.ttlMs ?? 15 * 60_000;
  let issued = 0;
  await page.route('**/checkout/**', async (route: Route) => {
    const req = route.request();
    const json = (status: number, body: unknown): Promise<void> =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    } catch {
      body = {};
    }
    if (/\/reserve$/.test(req.url())) {
      wire.reserves.push({ url: req.url(), body });
      if (opts.reserveDelayMs) await new Promise((r) => setTimeout(r, opts.reserveDelayMs));
      return json(200, { status: 'reserved', reservationId: 'res-1' });
    }
    wire.quotes.push(body);
    const isDoor = body['paymentMode'] === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
    if (isDoor) {
      if (opts.doorDelayMs) await new Promise((r) => setTimeout(r, opts.doorDelayMs));
      // PRODUCTION TRUTH: the service refuses every pay-at-door ask today.
      if (opts.doorAvailable !== true) return json(422, { error: 'pay_at_door_not_eligible' });
      return json(200, { ...DOOR_QUOTE, expiry: new Date(Date.now() + ttl).toISOString() });
    }
    issued += 1;
    return json(200, {
      ...FULL_QUOTE,
      quoteId: `quote-full-${issued}`,
      expiry: new Date(Date.now() + ttl).toISOString(),
    });
  });
  return wire;
}

/** C1 → C3 → (Continuer, which is where the price is asked for). */
async function askForPrice(page: Page, zone = 'Gounghin'): Promise<void> {
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator(`[data-action="zone"][data-zone="${zone}"]`).click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('[data-action="continuer-c3"]').click();
}

/** …then on to C5 with a mode chosen. */
async function toPayer(page: Page, mode: 'A' | 'B' = 'A'): Promise<void> {
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="continuer-c4"]').click();
  await page.locator('[data-screen="C5"]').waitFor();
  await page.locator(`[data-action="choix-paiement"][data-mode="${mode}"]`).click();
}

const stage = (page: Page): Promise<string> => page.locator('main.cl-root').innerText();
const screenOf = (page: Page): Promise<string | null> =>
  page.locator('.cl-stage [data-screen]').getAttribute('data-screen');

/* ══════════════════════════════════════════════════════════════════════════ */

test('BLOCKER 3 · flow.ts retour-c4 clearT() — backing out of « ENVOI SÉCURISÉ » never lands on « confirmé »', async ({ page }) => {
  await scriptService(page);
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  // the reserve answers at once, so the provider simulation's timers are armed
  await page.locator('[data-etat="envoi"]').waitFor();
  await page.locator('[data-etat="envoi"] [data-action="retour-c4"]').click();
  await expect(page.locator('[data-screen="C4"]')).toBeVisible();

  // long past 1 200 ms + 2 400 ms: the timers must have been cleared
  await page.waitForTimeout(4_500);
  expect(await screenOf(page)).toBe('C4');
  const text = await stage(page);
  expect(text, 'she cancelled and was told the operator confirmed').not.toContain('confirmé');
  expect(text).not.toContain('Commande enregistrée');
});

test('BLOCKER 3b · flow.ts generation guard — a reservation answering AFTER she leaves schedules nothing', async ({ page }) => {
  // the reserve is still in flight when she taps Retour, so `clearT()` has no
  // timer to kill: only the generation check can stop the late resolution.
  await scriptService(page, { reserveDelayMs: 900 });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="envoi"]').waitFor();
  await page.locator('[data-etat="envoi"] [data-action="retour-c4"]').click();
  await expect(page.locator('[data-screen="C4"]')).toBeVisible();

  // 900 (reserve) + 1 200 + 2 400 = 4 500 ms of scheduling that must not happen
  await page.waitForTimeout(6_000);
  expect(await screenOf(page)).toBe('C4');
  expect(await stage(page), 'a late reservation dragged her onto « confirmé »').not.toContain('confirmé');
});

test('BLOCKER 4 · flow.ts demanderLePrix catch — a rejecting quote source gives an honest card, never a frozen skeleton', async ({ page }) => {
  await scriptService(page);
  // A hostile-but-real environment: some privacy webviews expose `crypto` as a
  // throwing getter. `requestKeyFor` then throws OUT of the quote source.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'crypto', {
      configurable: true,
      get() {
        throw new Error('crypto is blocked on this origin');
      },
    });
  });
  await askForPrice(page);
  await page.locator('[data-screen="REFUS"]').waitFor({ timeout: 15_000 });
  expect(await screenOf(page)).toBe('REFUS');
  // the skeleton must be GONE — the frozen-forever screen is the defect
  await expect(page.locator('[data-screen="squelette"]')).toHaveCount(0);
  const text = await stage(page);
  expect(text).toContain('Nous ne pouvons pas afficher le prix.');
  expect(text).toContain('Rien n’a été payé.');
  // and she has a way forward
  expect(await page.locator('[data-screen="REFUS"] .cl-cta, [data-action="retour-c3"]').count()).toBeGreaterThan(0);
});

test('BLOCKER 5 · flow.ts horlogeDouteuse — a phone one hour fast still reaches the reserve', async ({ page }) => {
  const wire = await scriptService(page);
  await page.addInitScript(() => {
    const real = Date.now;
    Date.now = () => real() + 3_600_000; // one hour fast: very ordinary
  });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  // the service is the authority on expiry, so the request must actually go out
  await expect.poll(() => wire.reserves.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(await stage(page)).not.toContain('Ce prix a expiré');
});

test('BLOCKER 5b · flow.ts prixRafraichi — ONE automatic refresh, then she is told the price expired', async ({ page }) => {
  // quotes that are fresh when issued and dead a second later
  const wire = await scriptService(page, { ttlMs: 700 });
  await askForPrice(page);
  await toPayer(page, 'A');

  await page.waitForTimeout(1_200); // the price is now stale on a CORRECT clock
  await page.locator('[data-action="payer"]').click();
  // first tap: refreshed automatically, and she is told
  await expect(page.locator('[data-screen="C5"]')).toBeVisible({ timeout: 10_000 });
  const quotesAfterFirst = wire.quotes.length;
  expect(quotesAfterFirst).toBeGreaterThan(2); // a second pair of asks went out

  await page.waitForTimeout(1_200); // …and the refreshed price is stale too
  await page.locator('[data-action="payer"]').click();
  // second tap: NO further silent refresh — she gets the honest card
  await page.locator('[data-screen="REFUS"]').waitFor({ timeout: 10_000 });
  expect(await page.locator('[data-screen="REFUS"]').getAttribute('data-motif')).toBe('expired');
  expect(await stage(page)).toContain('Ce prix a expiré.');
  expect(wire.quotes.length, 'it refreshed again instead of telling her').toBe(quotesAfterFirst);
});

test('ITEM 3 · the automatic refresh SAYS SO and keeps her payment mode', async ({ page }) => {
  await scriptService(page, { ttlMs: 700 });
  await askForPrice(page);
  await toPayer(page, 'A');
  const ctaBefore = await page.locator('[data-action="payer"]').innerText();
  expect(ctaBefore).toContain('Payer');

  await page.waitForTimeout(1_200);
  await page.locator('[data-action="payer"]').click();

  // she is told a new price was asked for — not moved in silence
  await expect(page.locator('.cl-toast')).toContainText(/nouveau prix|prix a été mis à jour/i, { timeout: 10_000 });
  // …and she is back on the payment screen with her mode intact
  await expect(page.locator('[data-screen="C5"]')).toBeVisible();
  const ctaAfter = await page.locator('[data-action="payer"]').innerText();
  expect(ctaAfter, 'her chosen mode was discarded by the refresh').toContain('Payer');
  expect(ctaAfter).not.toContain('Choisissez pour continuer');
});

test('NOTE 7 · a stalled door ask does not hold the bill', async ({ page }) => {
  await scriptService(page, { doorDelayMs: 20_000 });
  const t0 = Date.now();
  await askForPrice(page);
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });
  const elapsed = Date.now() - t0;
  expect(elapsed, `waited ${elapsed} ms for a stalled door ask`).toBeLessThan(12_000);
  const text = await stage(page);
  expect(text).toContain('Livraison par Séra');
  // the NNBSP comes from the escape, never a raw byte in source (money.ts law)
  expect(text).toContain(`1${'\u202f'}000${'\u202f'}FCFA`);
});

test('BLOCKER 2 · the hold follows the chosen mode — B reserves the DOOR quote', async ({ page }) => {
  const wire = await scriptService(page, { doorAvailable: true });
  await askForPrice(page);
  await toPayer(page, 'B');
  await page.locator('[data-action="payer"]').click();
  await expect.poll(() => wire.reserves.length, { timeout: 10_000 }).toBe(1);
  expect(wire.reserves[0]!.url).toContain('/checkout/quote/quote-door-1/reserve');
  expect(wire.reserves[0]!.url).not.toContain('quote-full');
});

test('BLOCKER 1 · a bill that does not reconcile is refused, and no figure reaches the screen', async ({ page }) => {
  await page.route('**/checkout/**', async (route: Route) => {
    const req = route.request();
    if (/\/reserve$/.test(req.url())) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'reserved' }) });
    }
    const body = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    if (body['paymentMode'] === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'pay_at_door_not_eligible' }) });
    }
    // 11 500 + 1 000 is 12 500, and this server says 13 900
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...FULL_QUOTE,
        buyerTotal: 13_900,
        amountPaidAtCheckout: 13_900,
        expiry: new Date(Date.now() + 900_000).toISOString(),
      }),
    });
  });
  await askForPrice(page);
  await page.locator('[data-screen="REFUS"]').waitFor({ timeout: 15_000 });
  expect(await page.locator('[data-screen="REFUS"]').getAttribute('data-motif')).toBe('amounts_disagree');
  const text = await stage(page);
  expect(text).not.toContain('FCFA');
  expect(text).not.toContain('chaque franc a sa place');
});

test('a NAMED server refusal reaches the buyer as its own true sentence', async ({ page }) => {
  await page.route('**/checkout/**', async (route: Route) =>
    route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'delivery_not_serviceable' }) }),
  );
  await askForPrice(page);
  await page.locator('[data-screen="REFUS"]').waitFor({ timeout: 15_000 });
  expect(await page.locator('[data-screen="REFUS"]').getAttribute('data-motif')).toBe('delivery_not_serviceable');
  expect(await stage(page)).toContain('Séra ne livre pas encore ici.');
});
