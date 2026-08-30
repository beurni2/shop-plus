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
  /**
   * SP4.2b — the door legs AFTER a door-charge has been posted, per read, the
   * LAST repeating. Without it, reads consumed by the C7 tracking watch would
   * walk `doorLegs` toward `paid` before any charge was ever asked for —
   * exactly the premature reveal the tests exist to forbid.
   */
  doorLegsApresCharge?: string[];
  /** refuse `POST …/door-charge` by name, the way the service would. */
  doorChargeRefusal?: string;
  /* ── VRAI-SUIVI — the delivery marks + the remise route ─────────────── */
  /** The marks per read, the LAST repeating — each entry is spread into the
   *  order body ({acceptedAt…arrivedAt, livree}). Default: none, forever. */
  marques?: Array<Record<string, unknown>>;
  /** The remise route's code. Answered ONLY once the last-served marks carry
   *  `arrivedAt` AND the Bearer matches the create's buyerRef — the service's
   *  own gate, scripted. Absent ⇒ the route always answers the uniform 404. */
  codeRemise?: string;
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
  /** VRAI-SUIVI — every `GET …/remise`, with the Authorization it carried. */
  remises: Array<{ url: string; auth: string }>;
  /** The route names in the order the browser actually asked for them, so
   *  « the hold is taken BEFORE the order » is provable and not assumed. */
  sequence: string[];
}

/** The bearer ref the scripted create hands out — the remise route's own key. */
const BUYER_REF = 'ref-buyer-e2e-1';

/** Install the scripted checkout service and return the wire log. */
async function scriptService(page: Page, opts: Scripted = {}): Promise<Wire> {
  const wire: Wire = { quotes: [], reserves: [], orders: [], orderReads: [], doorCharges: [], remises: [], sequence: [] };
  const ttl = opts.ttlMs ?? 15 * 60_000;
  let issued = 0;
  /** How many times each order has been read back, so `orderStates` walks. */
  const reads = new Map<string, number>();
  /** VRAI-SUIVI — the marks entry the LAST order read served: the remise
   *  route's « does the arrival fact exist? » gate, scripted. */
  let marquesServies: Record<string, unknown> = {};
  /** SP4.2b — reads after a door-charge walk `doorLegsApresCharge` instead. */
  let chargeReads = -1;
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
        // VRAI-SUIVI — the bearer ref rides the CREATE, and only the create.
        buyerRef: BUYER_REF,
        ...(opts.noteVocale !== undefined ? { noteVocale: opts.noteVocale } : {}),
      });
    }
    /* ── SP4.2b — she asks for the product leg to be collected ──────────── */
    if (/\/door-charge$/.test(req.url()) && req.method() === 'POST') {
      wire.doorCharges.push({ url: req.url(), body });
      wire.sequence.push('door-charge');
      if (opts.doorChargeRefusal !== undefined) return json(422, { error: opts.doorChargeRefusal });
      chargeReads = 0;
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
    /* ── VRAI-SUIVI — the remise route: the code, arrival-gated + bearer ── */
    if (/\/order\/[^/]+\/remise$/.test(req.url()) && req.method() === 'GET') {
      const auth = req.headers()['authorization'] ?? '';
      wire.remises.push({ url: req.url(), auth });
      wire.sequence.push('remise');
      const arrived = marquesServies['arrivedAt'] !== undefined;
      if (opts.codeRemise !== undefined && arrived && auth === `Bearer ${BUYER_REF}`) {
        return json(200, { ok: true, code: opts.codeRemise });
      }
      // The uniform, nameless 404 — wrong token, unknown order and not-yet-
      // arrived are indistinguishable ON PURPOSE.
      return json(404, { ok: false });
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
      // The door leg: before any charge, `doorLegs` walks per read; AFTER a
      // charge, `doorLegsApresCharge` walks per post-charge read — so reads
      // consumed by the tracking watch can never move the leg toward `paid`
      // on their own.
      let doorLeg: string;
      if (chargeReads >= 0 && opts.doorLegsApresCharge !== undefined) {
        doorLeg = opts.doorLegsApresCharge[Math.min(chargeReads, opts.doorLegsApresCharge.length - 1)]!;
        chargeReads += 1;
      } else {
        const doors = opts.doorLegs ?? ['none'];
        doorLeg = doors[Math.min(seen, doors.length - 1)]!;
      }
      const marques = opts.marques === undefined ? {} : opts.marques[Math.min(seen, opts.marques.length - 1)]!;
      marquesServies = marques;
      return json(200, { orderId, state, amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, doorLeg, ...marques });
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

/** VRAI-SUIVI — the rider's whole road, as the server records it. The four
 *  simuler-walks these tests used to do are gone WITH the button: on the real
 *  path C7 advances only on these facts. */
const MARQUES_ARRIVEE = {
  acceptedAt: '2026-08-10T08:00:00.000Z',
  readyAt: '2026-08-10T08:10:00.000Z',
  departedAt: '2026-08-10T08:20:00.000Z',
  arrivedAt: '2026-08-10T08:30:00.000Z',
};

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
   * VRAI-SUIVI: the rider HAS arrived (the marks say so), so the tracking
   * stands at step 5 and the remise route COULD answer — the door leg still
   * withholds the reveal on this client, and no code is scripted anyway.
   */
  await scriptService(page, { orderStates: ['confirmed'], doorLegs: ['due'], marques: [MARQUES_ARRIVEE] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });

  // SHE MAY FOLLOW HER ORDER — tracking is not custody transfer. The first
  // tracking read (~1.5 s) lands the server's arrival fact: step 5, real door.
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  await page.locator('[data-action="porte"]').waitFor({ timeout: 10_000 });
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

test('SP4.2b · …and once the provider confirms the door payment, the code is hers — the REAL one', async ({ page }) => {
  // Only the server's word about the door leg differs from the test above —
  // and the code on C9 is now the REMISE ROUTE'S, never the demo constant.
  await scriptService(page, { orderStates: ['confirmed'], doorLegs: ['paid'], marques: [MARQUES_ARRIVEE], codeRemise: '654321' });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  await page.locator('[data-action="porte"]').waitFor({ timeout: 10_000 });
  await page.locator('[data-action="porte"]').click();
  await page.locator('[data-screen="C8"]').waitFor();
  await page.locator('[data-action="porte-bon"]').click();
  await page.locator('[data-screen="C9"]').waitFor({ timeout: 15_000 });
  const text = (await stage(page)).replace(/\s+/g, ' ');
  expect(text).toContain('code de remise');
  // THE SERVICE'S CODE, paired for reading — and the '734 921' demo constant
  // nowhere on the real path.
  expect(text).toContain('654 321');
  expect(text).not.toContain('734 921');
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
    // The leg stays `due` for EVERY read until a charge is posted — the C7
    // tracking watch consumes reads too, and none of them may move the leg.
    doorLegs: ['due'],
    doorLegsApresCharge: ['due', 'paid'],
    marques: [MARQUES_ARRIVEE],
    codeRemise: '654321',
  });
  await askForPrice(page);
  await toPayer(page, 'B');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  await page.locator('[data-action="porte"]').waitFor({ timeout: 10_000 });
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
  const apres = (await stage(page)).replace(/\s+/g, ' ');
  expect(apres).toContain('code de remise');
  // The figure is the remise route's own — never the demo constant.
  expect(apres).toContain('654 321');
  expect(apres).not.toContain('734 921');
});

test('SP4.2b · a REFUSED door charge gets an honest screen and a retry — never a code', async ({ page }) => {
  const wire = await scriptService(page, {
    doorAvailable: true,
    orderStates: ['confirmed'],
    doorLegs: ['due'],
    doorChargeRefusal: 'door_leg_not_due',
    marques: [MARQUES_ARRIVEE],
  });
  await askForPrice(page);
  await toPayer(page, 'B');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  await page.locator('[data-action="porte"]').waitFor({ timeout: 10_000 });
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

/**
 * VOIX-ÉTAT-2 · C5 — THE CONTROL ON THE MONEY SCREEN.
 *
 * The verifier found this call site had never passed its button to the shared
 * player (2026-08-09): the glyph never swapped, the seconds never counted, and
 * the pause-toggle compared against a host that was always null — so tapping a
 * playing note RESTARTED it with no way to stop. On the screen where she is
 * deciding to part with money. Proven here in a real browser rather than by
 * another source scan, because a source scan is exactly what read the shared
 * player and concluded both screens used it.
 */
test('VOIX-ÉTAT-2 · C5 « Écouter la note » shows pause, counts, and stops when tapped again', async ({ page }) => {
  await scriptService(page, { orderStates: ['payment_pending'] });
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie');
  await page.locator('[data-action="continuer-c3"]').click();
  await toPayer(page, 'A');

  const TRIANGLE = 'M0.5 0.8l9 5.2-9 5.2z';
  const BARRES = 'M0.9 0.8h2.8v10.4H0.9zm4.4 0h2.8v10.4H5.3z';
  const bouton = page.locator('[data-role="ecouter-note"]');
  await bouton.waitFor();
  const horloge = bouton.locator('.cl-voix-dur');
  const glyphe = bouton.locator('svg path');

  // AT REST: the small triangle, and NO clock — this screen never knew a total,
  // and printing one we do not have would be an invention.
  await expect(glyphe).toHaveAttribute('d', TRIANGLE);
  await expect(bouton.locator('svg')).toHaveAttribute('viewBox', '0 0 10 12');
  await expect(horloge).toHaveText('');

  await bouton.click();
  // THE PAUSE SIGN, on the live button. Under the old code this element was
  // never handed to the player, so nothing could swap it.
  await expect(glyphe).toHaveAttribute('d', BARRES, { timeout: 5_000 });
  // …in its OWN family: the 10×12 grid, not the 24-grid pair C1 uses.
  await expect(bouton.locator('svg')).toHaveAttribute('viewBox', '0 0 10 12');
  // THE CLOCK IS DRIVEN — it was empty a moment ago and now carries a position.
  await expect(horloge).toHaveText(/^\d+:\d\d$/, { timeout: 5_000 });

  // AND IT COMES BACK. The demo asset is a 1.1 s tone, so this lands via the
  // `ended` path; the same restore serves pause and error. Before the fix
  // `voixRepos` skipped the clock whenever the total was empty — which on this
  // screen is always — so the position would have been stranded here for ever.
  await expect(glyphe).toHaveAttribute('d', TRIANGLE, { timeout: 8_000 });
  await expect(horloge).toHaveText('');
});

/* ══════════════════════════════════════════════════════════════════════════ *
 *  VRAI-SUIVI — THE TRACKING IS REAL, AND HER CODE IS HERS (founder,
 *  2026-08-10). The seam tests: the REAL bundle, the REAL `httpQuotePort`,
 *  a scripted service answering the marks progressively — and not one tap of
 *  « Simuler » anywhere, because the button no longer exists on this path.
 * ══════════════════════════════════════════════════════════════════════════ */

test('VRAI-SUIVI · the timeline advances on server facts alone, and the code arrives from the remise route', async ({ page }) => {
  test.setTimeout(120_000);
  const wire = await scriptService(page, {
    orderStates: ['confirmed'],
    // One entry per read, the LAST repeating: nothing → accepted → departed →
    // arrived → livree. The C6 payment read consumes entry 0.
    marques: [
      {},
      { acceptedAt: MARQUES_ARRIVEE.acceptedAt },
      { acceptedAt: MARQUES_ARRIVEE.acceptedAt, readyAt: MARQUES_ARRIVEE.readyAt, departedAt: MARQUES_ARRIVEE.departedAt },
      MARQUES_ARRIVEE,
      { ...MARQUES_ARRIVEE, livree: true },
    ],
    codeRemise: '123456',
  });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });

  // THE CREATE STORED THE ORDER ON THE PHONE — the re-entry record, written
  // where the bearer ref is born.
  const gardee = await page.evaluate(() => localStorage.getItem('sp-commande:v1'));
  expect(gardee).toContain('ord-quote-full-1');
  expect(gardee).toContain(BUYER_REF);

  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  // THE REAL ORDER NUMBER in the corner — CMD-2417 is dead.
  await expect(page.locator('.cl-cmd')).toHaveText('ord-quote-full-1');
  expect(await stage(page)).not.toContain('CMD-2417');

  // The facts land one poll at a time, and the timeline follows THEM.
  await expect(page.locator('.cl-tl-t-now')).toHaveText('Préparée par la vendeuse', { timeout: 10_000 });
  await expect(page.locator('[data-action="simuler"]')).toHaveCount(0);
  await expect(page.locator('.cl-tl-t-now')).toHaveText('En route', { timeout: 10_000 });
  // BEFORE the arrival fact: no remise ask has gone out and no code exists
  // anywhere on the page.
  expect(wire.remises.length, 'the code was asked for before the rider arrived').toBe(0);
  expect(await stage(page)).not.toContain('123 456');

  // The rider taps « Je suis arrivé » (the server records arrivedAt) — step 5,
  // and the code affordance surfaces.
  await page.locator('[data-action="voir-code"]').waitFor({ timeout: 15_000 });
  await expect(page.locator('.cl-tl-t-now')).toHaveText('À votre porte');
  await expect(page.locator('[data-action="simuler"]')).toHaveCount(0);
  await page.locator('[data-action="voir-code"]').click();
  // ═══ THE WATCH FOLLOWS HER TO C9 (verifier MAJOR, fixed 2026-08-12) ═══
  //
  // This scenario's service already reports the remise, so the moment C9 opens
  // its watch it proves `livree` and she is carried to the closing screen. That
  // is the fix: before it, opening the code KILLED the watch, so a buyer holding
  // her phone up to the rider at the door — which is exactly where she is here —
  // watched the code for ever while the delivery completed behind her.
  await page.locator('[data-screen="C10"]').waitFor({ timeout: 10_000 });
  const avecCode = (await stage(page)).replace(/\s+/g, ' ');
  expect(avecCode, 'the demo constant leaked onto the real path').not.toContain('734 921');
  // …fetched from the remise route, under HER bearer ref.
  expect(wire.remises.length).toBeGreaterThan(0);
  expect(wire.remises[0]!.auth).toBe(`Bearer ${BUYER_REF}`);

  // Back on the tracking, the last fact lands — and the screen ENDS on it.
  //
  // C10 « merci » (founder 2026-08-12: « make it close nicely … and a thank you
  // screen for buyer's pwa »). This used to assert the C7 timeline sitting at
  // « Remise » with a dismiss button bolted on; a delivered order now leaves the
  // waiting screen entirely, which is the whole change, so the timeline element
  // is GONE rather than merely at its last step.
  // She is ALREADY here — carried from C9 by the watch — so there is no
  // navigation left to do. The timeline element is GONE, not merely at its last
  // step: a delivered order leaves the waiting screen entirely.
  await expect(page.locator('.cl-tl-t-now')).toHaveCount(0);
  const merci = (await stage(page)).replace(/\s+/g, ' ');
  expect(merci, 'it says what happened, not only thank you').toContain('livrée');
  // …and the one action closes it: the phone forgets the finished order and she
  // is returned to the beginning rather than left on a screen she dismissed.
  await page.locator('[data-action="suivi-terminer"]').click();
  expect(await page.evaluate(() => localStorage.getItem('sp-commande:v1'))).toBeNull();
  await page.locator('[data-screen="C1"]').waitFor({ timeout: 10_000 });
});

test('VRAI-SUIVI · re-entry — « Ma commande » reopens the REAL tracking of the stored order', async ({ page }) => {
  test.setTimeout(90_000);
  const wire = await scriptService(page, { orderStates: ['confirmed'], marques: [MARQUES_ARRIVEE], codeRemise: '654321' });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });

  // The tab dies; she comes back to the shell. The stored order is the way in.
  // REPRISE-PWA made a same-tab goto a REFRESH (the journey snapshot resumes
  // her place — the wanted behaviour); this test's premise is the CLOSED tab,
  // whose sessionStorage dies with it, so the snapshot is ended by hand and
  // only the localStorage band survives.
  await page.evaluate(() => sessionStorage.removeItem('sp-reprise:v1'));
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"]').waitFor();
  const bande = page.locator('[data-role="ma-commande"]');
  await bande.waitFor();
  await expect(bande).toContainText('Ma commande');
  await expect(bande).toContainText('ord-quote-full-1');
  await bande.click();

  await page.locator('[data-screen="C7"]').waitFor();
  await expect(page.locator('.cl-cmd')).toHaveText('ord-quote-full-1');
  // The re-entry polls the REAL service: the arrival fact lands, step 5.
  await page.locator('[data-action="voir-code"]').waitFor({ timeout: 15_000 });
  // No Simuler — and no door road either: a re-entry has no live checkout
  // handle, so a door charge could never complete from here.
  await expect(page.locator('[data-action="simuler"]')).toHaveCount(0);
  await expect(page.locator('[data-action="porte"]')).toHaveCount(0);
  // Her code, from the remise route, under the STORED bearer ref.
  await page.locator('[data-action="voir-code"]').click();
  await page.locator('[data-role="code-revele"]').waitFor({ timeout: 10_000 });
  expect((await stage(page)).replace(/\s+/g, ' ')).toContain('654 321');
  expect(wire.remises[0]!.auth).toBe(`Bearer ${BUYER_REF}`);
});

/**
 * ═══ SUIVI-VIVANT, THE TWO THINGS ITS OWN TESTS COULD NOT SEE ═══
 *
 * The slice that made the delivery watch hold instead of expiring was proven by
 * unit tests over two PURE VALUES — the ladder array and `attenteLivraison`. A
 * verifier mutated the CALL SITE three ways (delete the visibility listener,
 * force the page permanently hidden, replace the scheduled delay with 1 ms) and
 * the whole suite stayed green through all three, because nothing anywhere
 * drove `createCliente`. The seam e2e above did not help either: its scripted
 * delivery finishes inside the OLD schedule, so it passes identically on the
 * broken code.
 *
 * These two drive the real bundle in a real browser and count what the SERVICE
 * actually received. Between them they pin the whole mechanism: the watch keeps
 * asking while the reads land, and it stops — handing her back a control —
 * when they do not.
 */
test('SUIVI-VIVANT · the watch does NOT give up: it is still asking long after the old ladder had surrendered', async ({ page }) => {
  test.setTimeout(240_000);
  /**
   * THIS ONE RUNS ON REAL TIME, ON PURPOSE, AND IT IS SLOW.
   *
   * I first wrote it against Playwright's fake clock and it passed in ten
   * seconds — proving nothing: after `clock.resume()` the fast-forward no
   * longer drives the page's timers, so « two simulated minutes » advanced
   * nothing and the assertion below was satisfied by four ordinary reads, which
   * the OLD ladder also allowed. That is precisely the flaw this test exists to
   * correct in the seam test above it, reproduced. A mutation proved it: the
   * 1 ms spin loop stayed green.
   *
   * So it waits. The old ladder gave up after SIX scheduled reads (~35 s); this
   * asserts the watch is still asking on the NINTH, which no pre-fix build can
   * reach. Ninety seconds of wall clock is the price of an honest answer.
   */

  // The parcel is accepted and moving, and it NEVER arrives — the case the old
  // ladder handled by giving up thirty-five seconds in.
  const wire = await scriptService(page, {
    orderStates: ['confirmed'],
    marques: [{}, { acceptedAt: MARQUES_ARRIVEE.acceptedAt }],
  });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();

  // Let the ladder's first rungs run, then jump past where the OLD one died.
  // SUIVI_PAIEMENT_MS totals ~35 s over six scheduled reads; two minutes of
  // held 20 s rungs is far beyond it.
  // THE ASSERTION NO PRE-FIX BUILD CAN PASS. `SUIVI_PAIEMENT_MS` has six
  // rungs, so the old watch made SEVEN reads in all and then surrendered. Nine
  // reads is past the end of a ladder that used to run out.
  await expect
    .poll(() => wire.orderReads.length, { timeout: 150_000, intervals: [1_000] })
    .toBeGreaterThanOrEqual(9);
  // …and the manual control is NOT offered, because nothing has gone wrong:
  // « Vérifier à nouveau » is for a link that will not answer, not for a parcel
  // that is simply still on the road.
  await expect(page.locator('[data-action="verifier-suivi"]')).toHaveCount(0);

  /**
   * AND IT IS A WATCH, NOT A HAMMER — the other half, and the half that a
   * « does it keep asking? » assertion can never see. A verifier replaced the
   * scheduled delay with the literal 1 at the call site and every test stayed
   * green: an infinite ladder is only affordable at the RATE it holds. Two
   * simulated minutes at the held 20 s rung is a handful of reads; a 1 ms loop
   * over the same window is tens of thousands of requests against the service
   * and her data.
   */
  /**
   * Measured over a SETTLED WINDOW, not at the instant the poll above resolves.
   * Read count alone cannot tell a hold from a storm: the poll returns the
   * moment the ninth read lands, so a spin loop looks identical to a 20 s rung
   * until you let the clock run. Ten seconds at the held rung is at most one
   * more read; a loop scheduled at 0 or 1 ms is thousands. Both mutations that
   * survived an earlier version of this test — `?? 0` in `attenteLivraison`
   * and the literal `1` at the call site — are caught here and nowhere else.
   */
  const apresNeuf = wire.orderReads.length;
  await page.waitForTimeout(10_000);
  expect(
    wire.orderReads.length - apresNeuf,
    'the watch is spinning, not holding — this is a request storm on her paid data',
  ).toBeLessThanOrEqual(2);
  // …and the timeline still tells her the truth it was told, not a guess.
  await expect(page.locator('.cl-tl-t-now')).toHaveText('Préparée par la vendeuse');
});

test('SUIVI-VIVANT · in her pocket the watch SLEEPS, and it is current the instant she looks', async ({ page }) => {
  test.setTimeout(120_000);
  /**
   * THE HALF NOTHING DROVE. The hold is only affordable because the watch
   * stops entirely while the page is hidden and takes one immediate read when
   * she returns. A verifier deleted the `visibilitychange` registration and
   * forced `cacheeMaintenant()` permanently true, and the whole suite stayed
   * green through both — the first leaves a parked watch that can never wake
   * (a permanently frozen screen, strictly worse than the bug this slice
   * fixed), the second stops the watch after one read for ever.
   *
   * THE ONE DOUBLE, and its bound stated: `visibilityState` is a NATIVE
   * boundary Playwright cannot drive, so it is overridden here and the real
   * event is dispatched. Nothing in the app is stubbed — `cacheeMaintenant`,
   * the park, the listener and `reprendreSuivi` are all the shipped code.
   */
  const cacher = async (hidden: boolean): Promise<void> => {
    await page.evaluate((h) => {
      Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  };

  const wire = await scriptService(page, {
    orderStates: ['confirmed'],
    marques: [{}, { acceptedAt: MARQUES_ARRIVEE.acceptedAt }],
  });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  await expect.poll(() => wire.orderReads.length, { timeout: 20_000 }).toBeGreaterThan(1);

  // ── THE PHONE GOES IN THE POCKET ────────────────────────────────────────
  await cacher(true);
  // One read may already have been in flight or armed when she locked it; let
  // that settle, then measure a window in which NOTHING may be spent.
  await page.waitForTimeout(3_000);
  const enPoche = wire.orderReads.length;
  await page.waitForTimeout(30_000);
  expect(
    wire.orderReads.length,
    'the watch kept polling while the page was hidden — this is her paid data in a pocket',
  ).toBe(enPoche);

  // ── SHE LOOKS AGAIN ─────────────────────────────────────────────────────
  // Immediately, because the whole point of sleeping is that the screen is
  // CURRENT the instant she looks; waiting out a rung first would show her a
  // stale step and prove the sleep was a downgrade.
  await cacher(false);
  await expect
    .poll(() => wire.orderReads.length, { timeout: 5_000 })
    .toBeGreaterThan(enPoche);
  // …and it is a WATCH she came back to, not a single read: the ladder resumed.
  const auRetour = wire.orderReads.length;
  await expect.poll(() => wire.orderReads.length, { timeout: 40_000 }).toBeGreaterThan(auRetour);
});

test('SUIVI-VIVANT · a link that will not answer STOPS the watch and gives her the control back', async ({ page }) => {
  test.setTimeout(120_000);
  /**
   * THIS IS THE VERIFIER'S BLOCKER, DRIVEN. Making the ladder infinite also
   * deleted the only `suiviRelance = true`, so « Vérifier à nouveau » could no
   * longer render — and C7's other controls are all gated on facts a failing
   * read never delivers. A dead link therefore left her on a frozen screen with
   * nothing to press, while the phone spent a request every twenty seconds on
   * paid data. The founder's original bug, in a worse dress, caused by its fix.
   */
  const wire = await scriptService(page, { orderStates: ['confirmed'], marques: [{}] });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();

  // The order exists; NOW every subsequent read dies on the wire.
  await page.route('**/checkout/order/**', (route) => route.abort('failed'));

  // A run of refusals stops the automatic ladder and returns the ONE honest
  // control. Before this fix, this locator never appeared at all.
  await page.locator('[data-action="verifier-suivi"]').waitFor({ timeout: 60_000 });
  await expect(page.locator('[data-role="suivi-hors-portee"]')).toBeVisible();

  // AND THE POLLING ACTUALLY STOPPED. This is the half a « the button came
  // back » assertion cannot see: an infinite ladder would keep spending her
  // data behind the very control that says it is her choice now.
  const arrete = wire.orderReads.length;
  await page.waitForTimeout(25_000);
  expect(wire.orderReads.length, 'the watch kept polling a dead link behind her back').toBe(arrete);

  // A FAILED READ IS STILL NOT A FAILED DELIVERY — the timeline keeps every
  // proven step and says only that the network is missing.
  const texte = (await stage(page)).replace(/\s+/g, ' ');
  expect(texte).not.toContain('livrée');

  // Her tap is answered: the link comes back, exactly one read goes out, and
  // the honest « we cannot reach the service » note clears.
  await page.unroute('**/checkout/order/**');
  await page.locator('[data-action="verifier-suivi"]').click();
  await expect.poll(() => wire.orderReads.length, { timeout: 15_000 }).toBe(arrete + 1);
  await expect(page.locator('[data-role="suivi-hors-portee"]')).toHaveCount(0);
});

test('SUIVI-VIVANT · « Ma commande » over a LIVE flow strands no orphan — the superseded watch stops', async ({ page }) => {
  test.setTimeout(240_000);
  /**
   * THE LEAK THE TEARDOWN EXISTS FOR, driven end to end. `createCliente`
   * registers a visibility listener and runs a watch that now holds for ever;
   * `main.ts`'s « Ma commande » band removes the previous instance's DOM
   * without a page reload. Before `monterCliente`, the detached instance kept
   * polling its order every rung into a container no longer in the document —
   * two immortal watches on one phone, on paid data. Nothing drove that road:
   * the existing re-entry test does a full `goto`, which is a fresh document
   * and kills the old watch for free.
   *
   * Here both instances share ONE document. The wire mints one order id per
   * checkout, so the two watches are told apart by what they ask for.
   */
  const wire = await scriptService(page, { orderStates: ['confirmed'], marques: [{}] });

  // Checkout ONE stores the order the band will reopen (ord-quote-full-1).
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });

  // Reboot the shell: the band renders over the signed flow (instance A).
  // REPRISE-PWA: the premise is a fresh visit, not a refresh — the journey
  // snapshot (sessionStorage) is ended by hand, as a closed tab ends it.
  await page.evaluate(() => sessionStorage.removeItem('sp-reprise:v1'));
  await page.goto(ENTRY);
  await page.locator('[data-role="ma-commande"]').waitFor();

  // Instance A buys AGAIN in the same document and tracks ord-quote-full-2.
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  const lit2 = () => wire.orderReads.filter((id) => id === 'ord-quote-full-2').length;
  const lit1 = () => wire.orderReads.filter((id) => id === 'ord-quote-full-1').length;
  await expect.poll(lit2, { timeout: 20_000 }).toBeGreaterThan(0);

  // She taps « Ma commande »: instance A's DOM goes, instance B mounts — SAME
  // document, no reload. This is the exact road that used to leak.
  await page.locator('[data-role="ma-commande"]').click();
  await page.locator('[data-screen="C7"]').waitFor();

  // Instance B is ALIVE: the stored order's reads flow.
  const avantB = lit1();
  await expect.poll(lit1, { timeout: 20_000 }).toBeGreaterThan(avantB);

  // And instance A is DEAD. One in-flight read may still land; after a settle,
  // a 25 s window — early rungs AND the held 20 s one — must add NOTHING.
  await page.waitForTimeout(3_000);
  const orphelin = lit2();
  await page.waitForTimeout(25_000);
  expect(
    lit2() - orphelin,
    'the superseded instance is still polling its order — the orphan watch is back',
  ).toBe(0);
});

/* ══════════════════════════════════════════════════════════════════════════ *
 *  REPRISE-PWA + CODE-VISIBLE (founder, 2026-08-13):
 *  « when i refresh at any step it always takes me back to the initial payment
 *  screen commander like a new produt order to buy again. and when i am on the
 *  suivi screen i can not go back to the previous screen to see the code to
 *  give the rider. »
 *
 *  Written RED FIRST, against the shipped bundle, before the fix — each one
 *  reproduces one of his two sentences in a real browser.
 * ══════════════════════════════════════════════════════════════════════════ */

test('REPRISE · un rechargement au milieu du parcours garde sa place', async ({ page }) => {
  await scriptService(page);
  await askForPrice(page);
  await toPayer(page, 'A'); // C5, mode A chosen — a mid-journey step with a choice made

  await page.reload();

  // RED today: the flow remounts at C1 — « like a new product order to buy again ».
  await page.locator('[data-screen="C5"]').waitFor({ timeout: 15_000 });
  // …and her CHOICE is intact: the CTA is the live « Payer », not the unchosen state.
  const cta = await page.locator('[data-action="payer"]').innerText();
  expect(cta).toContain('Payer');
  expect(cta).not.toContain('Choisissez pour continuer');
});

test('REPRISE · un rechargement après paiement retombe sur sa commande', async ({ page }) => {
  test.setTimeout(120_000);
  const wire = await scriptService(page, { orderStates: ['confirmed'], marques: [MARQUES_ARRIVEE], codeRemise: '654321' });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();

  // ── the refresh, on the tracking ──────────────────────────────────────────
  await page.reload();
  // RED today: C1 renders and the order is nowhere on screen.
  await page.locator('[data-screen="C7"]').waitFor({ timeout: 15_000 });
  await expect(page.locator('.cl-cmd')).toHaveText('ord-quote-full-1');
  // …and the delivery watch is LIVE again: reads keep flowing to the service.
  // (This is the assertion the « resume skips the watch restart » mutation —
  // the e6bcc54 class — must turn red: a resumed C7 with a dead watch renders
  // and never reads.)
  const apresRecharge = wire.orderReads.length;
  await expect.poll(() => wire.orderReads.length, { timeout: 20_000 }).toBeGreaterThan(apresRecharge);

  // ── the refresh, on the code screen ───────────────────────────────────────
  await page.locator('[data-action="voir-code"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="voir-code"]').click();
  await page.locator('[data-role="code-revele"]').waitFor({ timeout: 10_000 });
  await page.reload();
  await page.locator('[data-screen="C9"]').waitFor({ timeout: 15_000 });
  // The code is BACK — and it is the REMISE ROUTE'S answer, never a stored
  // byte: nothing in the tab's storage may carry it.
  await page.locator('[data-role="code-revele"]').waitFor({ timeout: 15_000 });
  expect((await stage(page)).replace(/\s+/g, ' ')).toContain('654 321');
  const stocke = await page.evaluate(() =>
    JSON.stringify(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)])),
  );
  expect(stocke, 'the drop code was persisted on the phone').not.toContain('654321');
  // ═══ AND THE C9-RESUME RESTARTS THE WATCH TOO (verifier MAJOR, 2026-08-13:
  // deleting demarrerSuivi() from THIS resume branch left the whole suite
  // green — the code re-showed via demanderLeCode alone while the delivery
  // watch stayed dead, the e6bcc54 class on the reload road: `livree` would
  // never arrive and the code screen would sit there past the delivery). ═══
  const apresRechargeC9 = wire.orderReads.length;
  await expect
    .poll(() => wire.orderReads.length, { timeout: 20_000 })
    .toBeGreaterThan(apresRechargeC9);
});

test('REPRISE · un rechargement pendant le paiement re-demande la vérité au serveur', async ({ page }) => {
  test.setTimeout(120_000);
  /**
   * THE LIKELIEST REAL REFRESH (verifier MAJOR, 2026-08-13 — correct in code,
   * held by nothing): she pays, the screen waits on the provider, and she
   * refreshes. The resume must land on the WAITING screen — never a resumed
   * « paid » — and the confirmation may arrive ONLY through reads made after
   * the reload. The service answers pending twice, then confirmed, so a
   * snapshot that trusted its own memory would claim a state the server had
   * not yet said.
   */
  const wire = await scriptService(page, {
    orderStates: ['pending', 'pending', 'confirmed'],
    marques: [MARQUES_ARRIVEE],
    codeRemise: '654321',
  });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-screen="C6"]').waitFor({ timeout: 15_000 });

  await page.reload();
  // The resume lands on C6 WAITING — in-flight is never resumed as paid.
  await page.locator('[data-screen="C6"]').waitFor({ timeout: 15_000 });
  expect((await stage(page)).replace(/\s+/g, ' ')).not.toContain('confirmée');
  // …and the truth arrives through POST-reload reads: the watch re-asks until
  // the service itself says confirmed, and only then does the screen move.
  const lecturesAvant = wire.orderReads.length;
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 20_000 });
  expect(
    wire.orderReads.length,
    'the confirmation must come from a read made AFTER the reload — never from the snapshot',
  ).toBeGreaterThan(lecturesAvant);
});

test('CODE-VISIBLE · depuis le suivi, le code reste à portée', async ({ page }) => {
  test.setTimeout(120_000);
  // THE ARRIVAL FACT LAGS — the rider is at her door, « Je suis arrivé » has
  // not landed yet. Reads 1–4 carry no arrivedAt; from read 5 it exists. The
  // remise route stays arrival-gated throughout (the service's own bound).
  const wire = await scriptService(page, {
    orderStates: ['confirmed'],
    marques: [
      {},
      { acceptedAt: MARQUES_ARRIVEE.acceptedAt },
      { acceptedAt: MARQUES_ARRIVEE.acceptedAt, readyAt: MARQUES_ARRIVEE.readyAt, departedAt: MARQUES_ARRIVEE.departedAt },
      { acceptedAt: MARQUES_ARRIVEE.acceptedAt, readyAt: MARQUES_ARRIVEE.readyAt, departedAt: MARQUES_ARRIVEE.departedAt },
      MARQUES_ARRIVEE,
    ],
    codeRemise: '654321',
  });
  await askForPrice(page);
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="confirmee"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="suivre"]').click();
  await page.locator('[data-screen="C7"]').waitFor();

  // WITHOUT the arrival fact, « Voir mon code » is offered. RED today: the
  // arrivedAt gate withholds it, and she is locked out of her own code at the
  // exact moment the rider is standing in front of her.
  const voir = page.locator('[data-action="voir-code"]');
  await voir.waitFor({ timeout: 4_000 });
  // …and the arrival fact has genuinely NOT landed at this moment.
  expect(await page.locator('.cl-tl-t-now').innerText()).not.toBe('À votre porte');

  // Present AND pressable AND wired: the tap lands on the code screen, alive.
  await voir.click();
  await page.locator('[data-screen="C9"]').waitFor();
  // Before the service hands the code over, the screen says so honestly —
  // the client cannot reveal what the remise route has not answered.
  await expect(page.locator('[data-role="code-cache"]')).toBeVisible();
  // The watch is STILL RUNNING on the code screen: the arrival fact lands,
  // the code is fetched from the remise route, and it appears under her eyes.
  await page.locator('[data-role="code-revele"]').waitFor({ timeout: 45_000 });
  expect((await stage(page)).replace(/\s+/g, ' ')).toContain('654 321');

  // …and back on the suivi, the watch survives the return (the four questions:
  // the tree lived, the action moved her, and the next step stays reachable).
  await page.locator('[data-action="retour-c7"]').click();
  await page.locator('[data-screen="C7"]').waitFor();
  const avantRetour = wire.orderReads.length;
  await expect.poll(() => wire.orderReads.length, { timeout: 30_000 }).toBeGreaterThan(avantRetour);
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

/* ═══ GEO-ACHAT-1 — HER PIN, DRIVEN (founder: « GO », 2026-08-28) ═════════
 * The REAL Geolocation API under Playwright's grant: one tap keeps the pin
 * with its consent sentence, RETIRER is total, and the create carries the
 * EXACT bytes the device produced — never without her word. The denied road
 * is walked beside it: the honest face, the road still open, no pin key on
 * the wire. (SE-I07 upstream: the pin is supporting evidence, never proof.) */

test('GEO-ACHAT-1 · one tap keeps her pin — consent spoken, RETIRER total, the exact bytes on the create', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.371532, longitude: -1.519931, accuracy: 12 });
  const wire = await scriptService(page, { orderStates: ['payment_pending'] });
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();

  // One tap → the kept face, its consent sentence verbatim.
  await page.locator('[data-action="geo-demander"]').click();
  await page.locator('[data-role="geo-done"]').waitFor();
  await expect(page.locator('[data-role="geo-done"]')).toContainText('Position ajoutée — partagée seulement avec votre livreur.');

  // RETIRER is total — the quiet offer returns, and she can change her mind back.
  await page.locator('[data-action="geo-retirer"]').click();
  await page.locator('[data-action="geo-demander"]').waitFor();
  await page.locator('[data-action="geo-demander"]').click();
  await page.locator('[data-role="geo-done"]').waitFor();

  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-action="continuer-c3"]').click();
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });

  // THE WIRE: the pin rides INSIDE the contact — exact keys, exact bytes, no
  // amount anywhere near it.
  const body = wire.orders[0]!.body;
  expect(Object.keys(body).sort()).toEqual(['commandId', 'contact', 'holderRef', 'quoteId']);
  const contact = body['contact'] as Record<string, unknown>;
  expect(Object.keys(contact).sort()).toEqual(['phone', 'pin', 'quartier', 'repere']);
  expect(contact['pin']).toEqual({ lat: 12.371532, lng: -1.519931, accuracy: 12 });
});

test('GEO-ACHAT-1 · a REFUSED position gates nothing — the honest face, the road open, no pin on the wire', async ({ page }) => {
  // THE ONE NATIVE DOUBLE OF THIS WALK, its bound stated: headless Chromium
  // has no reliable « she tapped non » knob (an ungranted permission may deny
  // at once or hang to the 10 s timeout — it did both on this very board), so
  // the REFUSAL case replaces getCurrentPosition with an immediate
  // PERMISSION_DENIED errback. It doubles the BROWSER's answer and nothing
  // else — no app code is stubbed, and the granted road above drives the
  // fully real API. This walk may never claim anything about the browser's
  // real permission UI.
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) => {
      err?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    };
  });
  const wire = await scriptService(page, { orderStates: ['payment_pending'] });
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();

  await page.locator('[data-action="geo-demander"]').click();
  await page.locator('[data-role="geo-refus"]').waitFor({ timeout: 15_000 });
  await expect(page.locator('[data-role="geo-refus"]')).toContainText('Votre repère écrit suffit.');

  // The four questions end here: the tree stands, and she REACHES THE NEXT
  // STEP with her written address alone.
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-action="continuer-c3"]').click();
  await toPayer(page, 'A');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-etat="attente-operateur"]').waitFor({ timeout: 10_000 });

  const contact = wire.orders[0]!.body['contact'] as Record<string, unknown>;
  expect(Object.keys(contact).sort()).toEqual(['phone', 'quartier', 'repere']);
});
