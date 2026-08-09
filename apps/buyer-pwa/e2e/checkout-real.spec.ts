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
  /** hold EVERY quote ask this long — lets a refresh be observed mid-flight */
  quoteDelayMs?: number;
  /* ── SP3.3c — the ORDER ─────────────────────────────────────────────── */
  /** what `POST /checkout/order` answers with. Default: the service's own
   *  truth — an order exists and a charge was initiated, nobody has paid. */
  orderCreateState?: string;
  /** the states `GET /checkout/order/{id}` returns, one per read; the LAST one
   *  repeats forever. Default: it never moves, which is production today. */
  orderStates?: string[];
  /** refuse `POST /checkout/order` by name, the way the service would. */
  orderRefusal?: string;
  /** hold `POST /checkout/order` this long — makes the « order in flight »
   *  window observable, which is when she can still press Retour. */
  orderDelayMs?: number;
  /** REPERE-AUDIO-REEL — what the create says became of her voice note. */
  noteVocale?: 'gardee' | 'perdue';
  /** SP4.2b — the door leg per read, the LAST repeating. `none` = mode A. */
  doorLegs?: string[];
  /** refuse `POST …/door-charge` by name, the way the service would. */
  doorChargeRefusal?: string;
}

interface Wire {
  quotes: Array<Record<string, unknown>>;
  reserves: Array<{ url: string; body: Record<string, unknown> }>;
  /** SP3.3c — every `POST /checkout/order`, in order. */
  orders: Array<{ url: string; body: Record<string, unknown> }>;
  /** …and every `GET /checkout/order/{id}`. */
  orderReads: string[];
  /** SP4.2b — every `POST …/door-charge`. */
  doorCharges: Array<{ url: string; body: Record<string, unknown> }>;
  /** The route names in the order the browser actually asked for them, so
   *  « the hold is taken BEFORE the order » is provable and not assumed. */
  sequence: string[];
}

/** Install the scripted checkout service and return the wire log. */
async function scriptService(page: Page, opts: Scripted = {}): Promise<Wire> {
  const wire: Wire = { quotes: [], reserves: [], orders: [], orderReads: [], doorCharges: [], sequence: [] };
  const ttl = opts.ttlMs ?? 15 * 60_000;
  let issued = 0;
  /** How many times each order has been read back, so `orderStates` walks. */
  const reads = new Map<string, number>();
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
      wire.sequence.push('reserve');
      if (opts.reserveDelayMs) await new Promise((r) => setTimeout(r, opts.reserveDelayMs));
      return json(200, { status: 'reserved', reservationId: 'res-1' });
    }
    /* ── SP3.3c — the ORDER routes, before the quote fall-through ───────── */
    if (/\/checkout\/order$/.test(req.url()) && req.method() === 'POST') {
      wire.orders.push({ url: req.url(), body });
      wire.sequence.push('order');
      if (opts.orderDelayMs) await new Promise((r) => setTimeout(r, opts.orderDelayMs));
      if (opts.orderRefusal !== undefined) return json(422, { error: opts.orderRefusal });
      const orderId = `ord-${String(body['quoteId'])}`;
      reads.set(orderId, 0);
      return json(200, {
        orderId,
        // THE SERVICE'S OWN TRUTH: a created order is not a paid one.
        state: opts.orderCreateState ?? 'payment_pending',
        amountPaidAtCheckout: 12_500,
        amountDueAtDelivery: 0,
        doorLeg: opts.doorLegs?.[0] ?? 'none',
        ...(opts.noteVocale !== undefined ? { noteVocale: opts.noteVocale } : {}),
      });
    }
    /* ── SP4.2b — she asks for the product leg to be collected ──────────── */
    if (/\/door-charge$/.test(req.url()) && req.method() === 'POST') {
      wire.doorCharges.push({ url: req.url(), body });
      wire.sequence.push('door-charge');
      if (opts.doorChargeRefusal !== undefined) return json(422, { error: opts.doorChargeRefusal });
      // A CHARGE INITIATED IS NOT A PAYMENT — the service answers with the door
      // leg still `due`, and only the webhook moves it.
      return json(200, {
        orderId: /\/order\/([^/]+)\/door-charge$/.exec(req.url())![1],
        state: 'confirmed',
        amountPaidAtCheckout: 1_000,
        amountDueAtDelivery: 11_500,
        doorLeg: 'due',
      });
    }
    const byId = /\/checkout\/order\/([^/]+)$/.exec(req.url());
    if (byId && req.method() === 'GET') {
      const orderId = decodeURIComponent(byId[1]!);
      wire.orderReads.push(orderId);
      wire.sequence.push('order-read');
      const seen = reads.get(orderId) ?? 0;
      reads.set(orderId, seen + 1);
      const script = opts.orderStates ?? ['payment_pending'];
      const state = script[Math.min(seen, script.length - 1)]!;
      const doors = opts.doorLegs ?? ['none'];
      const doorLeg = doors[Math.min(seen, doors.length - 1)]!;
      return json(200, { orderId, state, amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, doorLeg });
    }
    wire.quotes.push(body);
    wire.sequence.push('quote');
    if (opts.quoteDelayMs) await new Promise((r) => setTimeout(r, opts.quoteDelayMs));
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
  // BC-1b — her number for the dispatch contact; the CTA gates on it now.
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
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

test('BLOCKER 3 · flow.ts retour-c4 clearT() — backing out of the in-flight payment never lands on « confirmé »', async ({ page }) => {
  /**
   * UPDATED BY SP3.3c, AND THE SUBJECT MOVED WITH THE CODE.
   *
   * This used to wait on « ENVOI SÉCURISÉ » and then on 1 200 + 2 400 ms of
   * timers. Those timers are gone: the flow now RESERVES, then ORDERS, then
   * reads the order back. The window in which she can still press Retour is the
   * window in which one of those requests is on the wire — so the order is held
   * open here to make that window real, and the screen showing is `operateur`.
   *
   * WHAT MUST STILL HOLD, unchanged: cancel means cancel. `clearT()` bumps the
   * generation, so the order's LATE answer writes nothing, schedules no read,
   * and cannot teleport her onto a confirmation she walked away from.
   */
  const wire = await scriptService(page, { orderDelayMs: 1_500 });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="operateur"]').waitFor();
  await page.locator('[data-etat="operateur"] [data-action="retour-c4"]').click();
  await expect(page.locator('[data-screen="C4"]')).toBeVisible();

  // long past the order's own 1 500 ms and the first scheduled read at 1 500 ms
  await page.waitForTimeout(5_000);
  expect(await screenOf(page)).toBe('C4');
  const text = await stage(page);
  expect(text, 'she cancelled and was told the operator confirmed').not.toContain('confirmé');
  expect(text).not.toContain('Commande enregistrée');
  expect(wire.orderReads.length, 'a cancelled checkout kept polling the server').toBe(0);
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

  // The RESULT toast, named by a phrase ONLY it carries. It used to be matched
  // by a regex the in-flight toast also satisfied, which left the in-flight
  // message covered by nothing (verifier, round 6). The two are now asserted by
  // two tests against two disjoint sentences, so deleting EITHER goes red.
  // The CONTAINER, not `.cl-toast`: both toasts can be on screen at once and a
  // strict locator would then match two elements and throw — a flake.
  await expect(page.locator('.cl-toasts')).toContainText('Le montant n’a pas changé', { timeout: 10_000 });
  // …and she is back on the payment screen with her mode intact
  await expect(page.locator('[data-screen="C5"]')).toBeVisible();
  const ctaAfter = await page.locator('[data-action="payer"]').innerText();
  expect(ctaAfter, 'her chosen mode was discarded by the refresh').toContain('Payer');
  expect(ctaAfter).not.toContain('Choisissez pour continuer');
});

test('ITEM 3b · flow.ts in-flight toast — she is told WHY she is looking at a skeleton', async ({ page }) => {
  // A SLOW service, which is the only condition under which this message earns
  // its keep: on 2G she taps Payer, the price turns out to be stale, and she
  // would otherwise stare at a skeleton for seconds with no explanation. On a
  // fast service both toasts land together and the in-flight one is invisible —
  // which is exactly why it survived mutation until now.
  await scriptService(page, { ttlMs: 700, quoteDelayMs: 1_500 });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.waitForTimeout(1_200); // the price is now stale
  await page.locator('[data-action="payer"]').click();

  // WHILE THE REFRESH IS IN FLIGHT: the skeleton is up, and it is explained.
  await expect(page.locator('[data-screen="squelette"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.cl-toasts')).toContainText('Nous demandons un nouveau prix', { timeout: 5_000 });
  // …and the RESULT sentence has not been said yet — these are two distinct
  // messages at two distinct moments, not one message asserted twice.
  expect(await page.locator('.cl-toasts').innerText()).not.toContain('Le montant n’a pas changé');

  // then the new price lands and the other sentence is said
  await expect(page.locator('[data-screen="C5"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.cl-toasts')).toContainText('Le montant n’a pas changé', { timeout: 10_000 });
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

test('SP3.3c · mode B ORDERS the door quote — the 1 000 vs 12 500 binding, in a real browser', async ({ page }) => {
  // The unit test proves `commander('B')` picks the door hold. This proves the
  // BROWSER does, on the real bundle: the pre-existing BLOCKER-2 test asserted
  // only the RESERVE url, so the highest-stakes binding in the slice had no
  // end-to-end assertion on the ORDER at all (verifier ITEM 8). An order on the
  // full quote after a « Payer à la livraison » CTA charges 12 500, not 1 000.
  const wire = await scriptService(page, { doorAvailable: true, orderStates: ['payment_pending'] });
  await askForPrice(page);
  await toPayer(page, 'B');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });

  expect(wire.reserves[0]!.url).toContain('quote-door-1');
  expect(wire.orders.length).toBe(1);
  expect(wire.orders[0]!.body['quoteId'], 'mode B ordered the FULL quote').toBe('quote-door-1');
  // …and under the DOOR hold's own holder ref, or the service refuses it.
  expect(wire.orders[0]!.body['holderRef']).toBe(wire.reserves[0]!.body['holderRef']);
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

/* ══════════════════════════════════════════════════════════════════════════ *
 *  SP3.3c — THE CONFIRMATION COMES FROM THE ORDER, NEVER FROM A CLOCK
 *
 *  These run against the REAL bundle and the REAL `httpQuotePort`. Each one
 *  names the line it protects: reinstate the 2 400 ms `setTimeout` that used to
 *  live in `flow.ts`'s `payer` handler and the FIRST test below must go red.
 * ══════════════════════════════════════════════════════════════════════════ */

test('SP3.3c · the server says `payment_pending` FOREVER — and the screen never says « confirmé »', async ({ page }) => {
  // PRODUCTION TRUTH, exactly: nothing posts the payment webhook, so a real
  // order stays `payment_pending`. This is the state a real buyer reaches today.
  const wire = await scriptService(page, { orderStates: ['payment_pending'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();

  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });
  // …and it is STILL true well past the old timer's 1 200 + 2 400 ms.
  await page.waitForTimeout(5_000);

  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text, 'the screen confirmed a payment no operator confirmed').not.toContain('confirmé par l’opérateur');
  expect(text).not.toContain('Commande enregistrée.');
  expect(text).toContain('Nous attendons l’opérateur.');
  // NO AMOUNT: there is no payment, so there is no figure.
  expect(text, 'the waiting screen printed an amount').not.toContain('FCFA');
  // …and the order was actually created, on the wire, after the hold.
  expect(wire.orders.length).toBe(1);
  expect(wire.sequence.indexOf('reserve')).toBeLessThan(wire.sequence.indexOf('order'));
  expect(wire.orderReads.length, 'the client never asked the server anything').toBeGreaterThan(0);
});

test('SP3.3c · the ORDER body is the allowlist — no amount crosses this wire (BC-1b: contact is its fourth key)', async ({ page }) => {
  const wire = await scriptService(page, { orderStates: ['payment_pending'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });

  const body = wire.orders[0]!.body;
  // BC-1b evolved this pin exactly as its port-level twin: the fourth key is
  // the founder-approved dispatch contact — three bounded strings assembled
  // from what she typed on C3, still nowhere an amount could ride.
  expect(Object.keys(body).sort()).toEqual(['commandId', 'contact', 'holderRef', 'quoteId']);
  const contact = body['contact'] as Record<string, unknown>;
  expect(Object.keys(contact).sort()).toEqual(['phone', 'quartier', 'repere']);
  expect(contact['phone']).toBe('70 12 34 56'); // the journey's own C3 input, verbatim
  expect(contact['quartier']).toBe('Gounghin');
  for (const v of Object.values(contact)) expect(typeof v).toBe('string');
  for (const [k, v] of Object.entries(body)) {
    if (k !== 'contact') expect(typeof v, k).toBe('string');
  }
  // AS THE AMOUNTS WOULD ACTUALLY BE WRITTEN (verifier NOTE 13). The old form
  // was `/12500|11500|1000/` against a body carrying two raw uuids, where the
  // digits « 1000 » land inside 32 hex characters roughly once in a thousand
  // runs — a flake that would have been read as a real leak.
  for (const [k, v] of Object.entries(body)) {
    expect(String(v), `${k} carries an amount`).not.toMatch(/\b(?:12500|11500|1000)\b/);
  }
});

test('SP3.3c · the operator answers — and ONLY then does the screen confirm', async ({ page }) => {
  await scriptService(page, { orderStates: ['payment_pending', 'payment_pending', 'confirmed'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();

  // it waits first…
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });
  // …and confirms only after the server's own state moves (read 3, ~1.5+2.5+4 s).
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 20_000 });
  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text).toContain('Commande enregistrée.');
  expect(text).toContain('confirmé par l’opérateur.');
});

test('SP3.3c · `paid` WITHOUT `confirmed` is NOT a confirmation — it is a confirmation refused', async ({ page }) => {
  // The vault reaches `paid` and confirms in the same request, so a `paid` an
  // HTTP read can see is an order whose `confirmOrder` answered
  // `no_funded_checkout_leg`. It must never print the confirmation.
  await scriptService(page, { orderStates: ['paid'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(4_000);
  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text, '« paid » was read as « confirmé »').not.toContain('confirmé par l’opérateur');
  expect(text).toContain('Nous attendons l’opérateur.');
});

test('SP3.3c · `payment_failed` gets its own dignified screen, with the retry and no false comfort', async ({ page }) => {
  await scriptService(page, { orderStates: ['payment_failed'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();

  await page.locator('[data-etat="echec"]').waitFor({ timeout: 10_000 });
  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text).toContain('Le paiement n’a pas abouti.');
  expect(text).toContain('Rien n’a été confirmé.');
  // It must NOT promise that nothing was debited — the amount-divergence fault
  // reaches this state with the money possibly already collected.
  expect(text).not.toContain('prélev');
  expect(text).not.toContain('rembours');
  expect(text, 'a failed payment printed an amount').not.toContain('FCFA');
  await expect(page.locator('[data-action="reessayer-paiement"]')).toBeVisible();
  await expect(page.locator('[data-action="suivre"]')).toHaveCount(0);
});

test('SP3.3c · the retry sends a NEW command id — or nothing would actually be retried', async ({ page }) => {
  const wire = await scriptService(page, { orderStates: ['payment_failed'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="echec"]').waitFor({ timeout: 10_000 });

  await page.locator('[data-action="reessayer-paiement"]').click();
  await expect.poll(() => wire.orders.length, { timeout: 10_000 }).toBe(2);
  // …and the retry button is gone the moment she taps it. A control that stays
  // under her thumb while nothing on screen changes is a control she taps again.
  await expect(page.locator('[data-action="reessayer-paiement"]')).toHaveCount(0);

  const [first, second] = wire.orders;
  expect(second!.body['quoteId'], 'the retry ordered a different quote').toBe(first!.body['quoteId']);
  expect(second!.body['commandId'], 'the retry replayed the first command — nothing was retried')
    .not.toBe(first!.body['commandId']);
});

test('SP3.3c · the retry tap is ANSWERED IMMEDIATELY — no dead tap on a money screen', async ({ page }) => {
  // The order is held open, so this measures what she sees WHILE the retry is
  // in flight — which on a Ouaga 2G link is seconds, not milliseconds.
  await scriptService(page, { orderStates: ['payment_failed'], orderDelayMs: 2_500 });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="echec"]').waitFor({ timeout: 15_000 });

  await page.locator('[data-action="reessayer-paiement"]').click();
  // The failed screen is gone AT ONCE and she is on the in-flight screen —
  // before the second order has answered, which is the whole point.
  await expect(page.locator('[data-etat="operateur"]')).toBeVisible({ timeout: 1_000 });
  await expect(page.locator('[data-etat="echec"]')).toHaveCount(0);
});

test('SP3.3c · the automatic checks STOP, and only then is a manual one offered', async ({ page }) => {
  // THE SCHEDULE IS 35 SECONDS OF REAL WAITING and it is not shortened for the
  // test: the thing being proved is that the loop TERMINATES on the numbers
  // that ship, and a test that ran against a shrunken schedule would prove it
  // about a schedule no buyer has. 35 s of CI is the price of that.
  test.setTimeout(120_000);
  const wire = await scriptService(page, { orderStates: ['payment_pending'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });

  // while the schedule runs, no button — asking again would duplicate a request
  // already on its way.
  await expect(page.locator('[data-action="verifier-paiement"]')).toHaveCount(0);

  // …the whole schedule is 1.5+2.5+4+6+9+12 = 35 s. Wait it out.
  await page.locator('[data-action="verifier-paiement"]').waitFor({ timeout: 60_000 });
  const stopped = wire.orderReads.length;

  // AND IT STAYS STOPPED: no further read happens on its own.
  await page.waitForTimeout(6_000);
  expect(wire.orderReads.length, 'the client kept polling after its schedule ended').toBe(stopped);

  // one tap, exactly one more read, and the sentence does not change.
  await page.locator('[data-action="verifier-paiement"]').click();
  await expect.poll(() => wire.orderReads.length, { timeout: 10_000 }).toBe(stopped + 1);
  expect((await stage(page)).replace(/\s+/g, ' ')).toContain('Nous attendons l’opérateur.');
});

test('SP3.3c · a REFUSED order lands on the honest refusal surface, never on a confirmation', async ({ page }) => {
  await scriptService(page, { orderRefusal: 'reservation_expired' });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();

  await page.waitForTimeout(3_000);
  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text).not.toContain('confirmé par l’opérateur');
  expect(text).not.toContain('Commande enregistrée.');
  // the refusal surface — a true sentence and an action, never a blank screen
  expect(await page.locator('[data-action="reessayer-prix"], [data-action="prix-a-jour"], [data-action="retour-c3"]').count())
    .toBeGreaterThan(0);
});

/* ══════════════════════════════════════════════════════════════════════════ *
 *  SP3.3c ROUND 2 — the two BLOCKERS a fresh-context verifier reproduced in a
 *  real browser against the real bundle. Each test below is the guard.
 * ══════════════════════════════════════════════════════════════════════════ */

test('BLOCKER 1 · an UNCONFIRMED payment has no road to the drop code — §6.3, Ten Laws #3', async ({ page }) => {
  /**
   * WHAT THE VERIFIER WALKED, on the committed build: C6 « Nous attendons
   * l'opérateur » → « Suivre ma commande » → C7 → simuler ×4 → « Je suis à la
   * porte » → « Tout est bon » → C9 printed « Le code de remise · 734 921 »,
   * under its own caption « Votre code apparaîtra ici dès que le paiement sera
   * confirmé par l'opérateur. Jamais avant. »
   *
   * The order is pinned at `payment_pending` for the whole test — production
   * truth today — so at no point in it is any payment confirmed.
   */
  await scriptService(page, { orderStates: ['payment_pending'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });

  // 1 · the road is not offered.
  await expect(page.locator('[data-action="suivre"]')).toHaveCount(0);

  // 2 · and it is not walkable even if something emits the action anyway.
  await page.evaluate(() => {
    document.querySelector('main.cl-root')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    const b = document.createElement('button');
    b.setAttribute('data-action', 'suivre');
    document.querySelector('main.cl-root')?.appendChild(b);
    b.click();
  });
  await page.waitForTimeout(500);
  expect(await screenOf(page), 'an unconfirmed payment reached the tracking screen').toBe('C6');

  // 3 · and the drop code is nowhere on this page, in any form.
  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text).not.toContain('code de remise');
  expect(text).not.toMatch(/\d{3}\s?\d{3}/);
});

test('BLOCKER 2 · « Vérifier à nouveau » always ANSWERS — a dead link is said, not swallowed', async ({ page }) => {
  // The full 35 s schedule has to run out against the dead link before the
  // manual check exists at all — see the sibling test for why it is not
  // shortened: the guarantee is about the numbers that ship.
  test.setTimeout(150_000);
  const wire = await scriptService(page, { orderStates: ['payment_pending'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });

  // the order exists; NOW the link dies for every subsequent read.
  await page.route('**/checkout/order/**', (route) => route.abort('failed'));

  // the schedule runs itself out against a dead link…
  await page.locator('[data-action="verifier-paiement"]').waitFor({ timeout: 90_000 });
  // …and the screen SAYS the reads are not landing, instead of repeating
  // « votre commande est bien enregistrée » with nothing else changed.
  await expect(page.locator('[data-role="hors-portee"]')).toBeVisible();
  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text).toContain('Nous n’arrivons pas à joindre le service');
  // IT STILL SAYS NOTHING ABOUT THE PAYMENT. A read that did not arrive is not
  // a payment that failed, and the screen must not have drifted into one.
  expect(text).toContain('Nous attendons l’opérateur.');
  expect(text).not.toContain('n’a pas abouti');
  expect(text).not.toContain('confirmé par l’opérateur');

  // …and when the link comes back, the note goes away on the next answer.
  await page.unroute('**/checkout/order/**');
  const before = wire.orderReads.length;
  await page.locator('[data-action="verifier-paiement"]').click();
  await expect.poll(() => wire.orderReads.length, { timeout: 10_000 }).toBe(before + 1);
  await expect(page.locator('[data-role="hors-portee"]')).toHaveCount(0);
});

test('SP4.2b · §6.3 — she can TRACK while she still owes, but the code is withheld', async ({ page }) => {
  /**
   * THE DEFECT THIS GUARDS, reachable the day the founder opened the zone rule:
   * `state: 'confirmed'` on Option B means the DELIVERY FEE is funded — 1 000 of
   * a 12 500 order — while the product's 11 500 is still owed at the door.
   * SP3.3c's guard read only `state`, so she could inspect, tap « Tout est bon »
   * and be shown « Le code de remise » having paid a twelfth of her order.
   *
   * The service is scripted to report the door leg as `due` throughout: the
   * client knows only what the server says about it, which is the point.
   */
  await scriptService(page, { orderStates: ['confirmed'], doorLegs: ['due'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });

  // SHE MAY FOLLOW HER ORDER — tracking is not custody transfer.
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  // C7 only offers « Je suis à la porte » at step 5 — the four demo steps are
  // how the tracking screen is walked (`renderC7`'s `atDoor`).
  for (let i = 0; i < 4; i += 1) await page.locator('[data-action="simuler"]').click();
  await page.locator('[data-action="porte"]').click();
  await page.locator('[data-screen="C8"]').waitFor();

  // …and « Tout est bon » must NOT hand her the code while the money is owed.
  await page.locator('[data-action="porte-bon"]').click();
  await page.waitForTimeout(3_500); // past mode B's 2 600 ms reveal timer too
  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text, 'a drop code appeared with the door leg still owed').not.toContain('code de remise');
  expect(text).not.toMatch(/\d{3}\s?\d{3}/);
  expect(await screenOf(page), 'she was walked past the door screen unpaid').toBe('C8');
});

test('SP4.2b · …and once the provider confirms the door payment, the code is hers', async ({ page }) => {
  // Only the server's word about the door leg differs from the test above.
  await scriptService(page, { orderStates: ['confirmed'], doorLegs: ['paid'] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  // C7 only offers « Je suis à la porte » at step 5 — the four demo steps are
  // how the tracking screen is walked (`renderC7`'s `atDoor`).
  for (let i = 0; i < 4; i += 1) await page.locator('[data-action="simuler"]').click();
  await page.locator('[data-action="porte"]').click();
  await page.locator('[data-screen="C8"]').waitFor();
  await page.locator('[data-action="porte-bon"]').click();
  await page.locator('[data-screen="C9"]').waitFor({ timeout: 15_000 });
  expect((await stage(page)).replace(/\s+/g, ' ')).toContain('code de remise');
});

test('SP4.2b · the door payment: she pays the product, THEN the code — no timer anywhere', async ({ page }) => {
  /**
   * THE 2 600 ms `setTimeout` THIS REPLACES showed « Payez le reste » and then
   * revealed her drop code two and a half seconds later — no charge sent, no
   * operator asked, no confirmation received.
   *
   * Reads 1–2 still owe; from read 3 the (scripted) webhook has landed. So the
   * code can only appear because the SERVER said the door leg is paid.
   */
  const wire = await scriptService(page, {
    doorAvailable: true, // the founder opened the zones — mode B is real now
    orderStates: ['confirmed'],
    doorLegs: ['due', 'due', 'paid'],
  });
  await askForPrice(page);
  await toPayer(page, 'B');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  for (let i = 0; i < 4; i += 1) await page.locator('[data-action="simuler"]').click();
  await page.locator('[data-action="porte"]').click();
  await page.locator('[data-screen="C8"]').waitFor();

  // « Tout est bon » now ASKS FOR THE MONEY instead of revealing anything.
  await page.locator('[data-action="porte-bon"]').click();
  await page.locator('[data-etat="paiement-porte"]').waitFor({ timeout: 10_000 });
  await expect.poll(() => wire.doorCharges.length, { timeout: 10_000 }).toBe(1);

  // NO AMOUNT ON THAT WIRE — the service's two-key allowlist.
  expect(Object.keys(wire.doorCharges[0]!.body).sort()).toEqual(['commandId', 'holderRef']);

  // …and the code appears ONLY once the server reports the leg paid.
  const waiting = (await stage(page)).replace(/\s+/g, ' ');
  expect(waiting, 'the code appeared while the charge was still in flight').not.toContain('code de remise');
  await page.locator('[data-screen="C9"]').waitFor({ timeout: 30_000 });
  expect((await stage(page)).replace(/\s+/g, ' ')).toContain('code de remise');
});

test('SP4.2b · a REFUSED door charge gets an honest screen and a retry — never a code', async ({ page }) => {
  const wire = await scriptService(page, {
    doorAvailable: true,
    orderStates: ['confirmed'],
    doorLegs: ['due'],
    doorChargeRefusal: 'door_leg_not_due',
  });
  await askForPrice(page);
  await toPayer(page, 'B');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  for (let i = 0; i < 4; i += 1) await page.locator('[data-action="simuler"]').click();
  await page.locator('[data-action="porte"]').click();
  await page.locator('[data-action="porte-bon"]').click();

  await page.locator('[data-etat="porte-echec"]').waitFor({ timeout: 10_000 });
  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text).toContain('Le paiement n’a pas abouti.');
  expect(text).toContain('Rien n’a été confirmé.');
  // it must NOT promise nothing was debited — the divergence fault reaches here
  expect(text).not.toContain('prélev');
  expect(text, 'a refused door charge showed the code').not.toContain('code de remise');

  // …and the retry sends a NEW command id, or nothing would be retried.
  await page.locator('[data-action="reessayer-porte"]').click();
  await expect.poll(() => wire.doorCharges.length, { timeout: 10_000 }).toBe(2);
  expect(wire.doorCharges[1]!.body['commandId']).not.toBe(wire.doorCharges[0]!.body['commandId']);
});

test('REPERE-AUDIO-REEL · the REAL recorder — her note is captured by the phone and rides the order as audioB64', async ({ page }) => {
  // Chromium's fake microphone (playwright.config launch args) feeds a REAL
  // MediaRecorder: no mock, no pantomime — the same road her phone drives.
  const wire = await scriptService(page, { orderStates: ['payment_pending'] });
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie');
  await page.locator('[data-action="voix-demarrer"]').click();
  // The permission resolved and the recording state is REAL before ARRÊTER exists.
  await page.locator('[data-action="voix-arreter"]').waitFor();
  await page.waitForTimeout(1_200); // let the fake microphone produce real bytes
  await page.locator('[data-action="voix-arreter"]').click();
  await page.locator('[data-role="voice-recorded"]').waitFor(); // the note EXISTS on the phone
  await page.locator('[data-action="continuer-c3"]').click();
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });

  const body = wire.orders[0]!.body;
  const contact = body['contact'] as Record<string, unknown>;
  // The fourth key is the NOTE — and only ever the bytes, never a ref.
  expect(Object.keys(contact).sort()).toEqual(['audioB64', 'phone', 'quartier', 'repere']);
  expect('audioRef' in contact).toBe(false);
  const bytes = Buffer.from(String(contact['audioB64']), 'base64');
  expect(bytes.length).toBeGreaterThan(0);
  // Chromium's recorder emits WebM — the exact EBML head the media door sniffs.
  expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
});

/**
 * ═══ VOIX-ÉTAT-2 · THE SEAM TEST (founder report 2026-08-09) ═══
 *
 * « When buyer records the audio and then plays to listen back the button is
 * not displaying the pause sign and the seconds are not counting. »
 *
 * A source scan can prove the handler CONTAINS the swap; only this can prove
 * the swap REACHES her screen — a real MediaRecorder take, a real blob URL, a
 * real <audio> element in a real browser, and the DOM read back after the tap.
 * The 2026-08-04 fix on C1 shipped behind a source scan and this block, which
 * has the identical defect, was never noticed. So: the browser answers.
 */
test('VOIX-ÉTAT-2 · her own note shows PAUSE and counts while it plays, then goes back to rest', async ({ page }) => {
  await scriptService(page, { orderStates: ['payment_pending'] });
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-action="voix-demarrer"]').click();
  await page.locator('[data-action="voix-arreter"]').waitFor();
  await page.waitForTimeout(2_200); // a note long enough for a second to tick
  await page.locator('[data-action="voix-arreter"]').click();
  await page.locator('[data-role="voice-recorded"]').waitFor();

  const bouton = page.locator('[data-role="note-play"]');
  const horloge = page.locator('[data-role="note-time"]');
  // AT REST: the triangle, and the TOTAL she recorded.
  await expect(bouton).toHaveAttribute('aria-label', 'Écouter');
  const total = (await horloge.textContent())?.trim() ?? '';
  expect(total).toMatch(/^0:\d\d$/);

  await bouton.click();
  // THE PAUSE SIGN. Not « the code contains iconPauseSmall » — the button in
  // the page says so, which is what the founder was looking at.
  await expect(bouton).toHaveAttribute('aria-label', 'Pause', { timeout: 5_000 });
  // THE SECONDS COUNT. The clock leaves the total and lands on a real
  // position; a frozen clock is the reported bug.
  await expect(horloge).toHaveText('0:00', { timeout: 5_000 });
  await expect(horloge).toHaveText('0:01', { timeout: 5_000 });

  // …and tapping the PAUSE actually pauses, putting the face back.
  await bouton.click();
  await expect(bouton).toHaveAttribute('aria-label', 'Écouter');
  await expect(horloge).toHaveText(total);
});

test('REPERE-AUDIO-REEL · a LOST note gets its sentence — the diagnostic hole the founder hit is closed', async ({ page }) => {
  // The service says the note could not be kept (`noteVocale: 'perdue'`).
  // Before this test's line existed, NOTHING anywhere said so — the founder
  // stood at Terminées wondering whether the note was never sent or died on
  // the media hop. Now the buyer's own screen says it, once, calmly.
  await scriptService(page, { orderStates: ['payment_pending'], noteVocale: 'perdue' });
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie');
  await page.locator('[data-action="voix-demarrer"]').click();
  await page.locator('[data-action="voix-arreter"]').waitFor();
  await page.waitForTimeout(600);
  await page.locator('[data-action="voix-arreter"]').click();
  await page.locator('[data-role="voice-recorded"]').waitFor();
  await page.locator('[data-action="continuer-c3"]').click();
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });
  await expect(page.locator('main.cl-root')).toContainText('Votre note vocale n’a pas pu être gardée');
  // …and the honest half-sentence beside it: her written repère DID travel.
  await expect(page.locator('main.cl-root')).toContainText('Votre repère écrit est bien transmis');
});
