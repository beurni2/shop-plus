import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * PAYER-TOUT-1 — THE WALKS (founder ruling 2026-09-22: « buyers able to buy
 * and pay bagged items at the same time », option 1 — one payment, one order
 * per article). The 2026-08-10 screen law on this repo's harness: the REAL
 * page in a real browser, only `fetch` scripted, no app code stubbed.
 *
 * The four questions, on the live DOM, at every step:
 *   · did the tree survive the tap;
 *   · is the primary action present, pressable and wired;
 *   · an act that fires by itself (the operator watch) leaves a way on;
 *   · can she reach the next screen — all the way to ONE article's own
 *     tracking, and back to it after she leaves.
 *
 * Its bound, stated like every walk's: it claims NOTHING about appearance.
 */

/* ═══════════════════════ the demo build (port 4173) ═══════════════════════ */

test('DEMO · boutique → « Payer les 2 articles ensemble » → one payment → each article its own order → its own tracking → still there after she leaves', async ({ page }) => {
  await page.goto('/?demo-vitrine=aicha-4821');
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  // One article kept: no pay-together button (its own page is the road).
  const boutons = page.locator('.vt-tile .vt-tile-pan');
  await boutons.nth(0).click();
  await expect(page.locator('[data-role="vitrine-panier"]')).toBeVisible();
  await expect(page.locator('[data-action="panier-payer"]')).toHaveCount(0);
  // Two kept ⇒ ONE button naming the count, and still no total on the band.
  await boutons.nth(1).click();
  const payer = page.locator('[data-action="panier-payer"]');
  await expect(payer).toHaveText('Payer les 2 articles ensemble');
  await expect(page.locator('[data-role="vitrine-panier"]')).not.toContainText('Total');

  // THE NEXT STEP EXISTS: the panier's own first screen, on the signed road.
  await payer.click();
  await expect(page).toHaveURL(/\/s\/aicha-4821\?panier=/);
  // The preview server has no Pages fallback: open the link the way the
  // deploy's 404 page restores it (the bornes-vitrine walk's convention).
  const pids = new URL(page.url()).searchParams.get('panier') ?? '';
  expect(pids.split(',')).toHaveLength(2);
  await page.goto(`/?/s/aicha-4821&panier=${encodeURIComponent(pids)}`);
  await expect(page.locator('[data-screen="C1"][data-panier]')).toBeVisible();
  await expect(page.locator('[data-role="panier-article"]')).toHaveCount(2);

  // The address screen is the single road's own.
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-action="continuer-c3"]').click();

  // The récap: each article's line, and the parcels counted.
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });
  await expect(page.locator('[data-role="panier-recap"] .cl-panier-recap-ligne')).toHaveCount(2);
  await expect(page.locator('[data-role="livraison-unique"]')).toContainText('2 livraisons par Séra');
  await page.locator('[data-action="continuer-c4"]').click();

  // The payment: one button, one amount.
  await page.locator('[data-screen="C5"]').waitFor();
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  await page.locator('[data-action="payer"]').click();

  // The operator watch fires by itself; the confirmation lists each order.
  await page.locator('[data-screen="C6"]').waitFor();
  await expect(page.locator('[data-role="panier-suivi"]')).toBeVisible({ timeout: 20_000 });
  const suivre = page.locator('[data-action="suivre-article"]');
  await expect(suivre).toHaveCount(2);
  // Her read tokens never reach the page.
  expect(await page.content()).not.toContain('ref-demo-');

  // ONE article's own tracking.
  await suivre.first().click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();

  // SHE LEAVES AND COMES BACK — « Mes articles payés ensemble » reopens them.
  await page.goto('/?demo-vitrine=aicha-4821');
  const bande = page.locator('[data-role="mes-articles"]');
  await expect(bande).toBeVisible();
  await expect(bande).toContainText('2');
  await bande.click();
  await expect(page.locator('[data-screen="MES-ARTICLES"]')).toBeVisible();
  await page.locator('[data-action="suivre-article"]').nth(1).click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
});

/* ═════════════════ the real-path build against a scripted service ═════════════════ */

const BASE = 'http://127.0.0.1:4175';
const ENTRY = `${BASE}/?demo-signed=aicha-4821&panier=p1,p2`;

interface Wire {
  quotes: Record<string, unknown>[];
  reserves: { url: string; body: Record<string, unknown> }[];
  prix: Record<string, unknown>[];
  groupes: Record<string, unknown>[];
  groupReads: string[];
  orderReads: string[];
  doorCharges: { url: string; body: Record<string, unknown> }[];
}

const FIG: Record<string, { produit: number; frais: number }> = {
  p1: { produit: 11_500, frais: 1_000 },
  p2: { produit: 20_500, frais: 1_000 },
};

async function service(page: Page, o: { refuseReserveOf?: string; groupStates?: string[]; door?: boolean } = {}): Promise<Wire> {
  const w: Wire = { quotes: [], reserves: [], prix: [], groupes: [], groupReads: [], orderReads: [], doorCharges: [] };
  const expiry = (): string => new Date(Date.now() + 15 * 60_000).toISOString();
  await page.route('**/checkout/**', async (route: Route) => {
    const req = route.request();
    const url = req.url();
    const json = (status: number, body: unknown): Promise<void> =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    } catch {
      body = {};
    }
    const door = (id: string): boolean => id.endsWith('-B');
    if (/\/reserve$/.test(url)) {
      w.reserves.push({ url, body });
      if (o.refuseReserveOf !== undefined && url.includes(`q-${o.refuseReserveOf}-`)) return json(409, { error: 'already_reserved' });
      return json(200, { status: 'reserved', expiresAt: expiry() });
    }
    if (/\/checkout\/group\/price$/.test(url)) {
      w.prix.push(body);
      const ids = body['quoteIds'] as string[];
      const b = door(ids[0]!);
      const produit = ids.reduce((s, id) => s + FIG[id.split('-')[1]!]!.produit, 0);
      const frais = ids.reduce((s, id) => s + FIG[id.split('-')[1]!]!.frais, 0);
      return json(200, {
        paymentMode: b ? 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' : 'FULL_PREPAY',
        articles: ids.length,
        amountPaidAtCheckout: b ? frais : produit + frais,
        amountDueAtDelivery: b ? produit : 0,
        deliveryTotal: frais,
        productTotal: produit,
      });
    }
    const vue = (state: string, ids: string[]) => {
      const b = door(ids[0]!);
      const articles = ids.map((id) => {
        const f = FIG[id.split('-')[1]!]!;
        return { orderId: `ord-${id}`, state, amountPaidAtCheckout: b ? f.frais : f.produit + f.frais, amountDueAtDelivery: b ? f.produit : 0, doorLeg: b ? 'due' : 'none' };
      });
      return {
        groupId: 'grp-e2e-1',
        state,
        paymentMode: b ? 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' : 'FULL_PREPAY',
        amountPaidAtCheckout: articles.reduce((s, a) => s + a.amountPaidAtCheckout, 0),
        amountDueAtDelivery: articles.reduce((s, a) => s + a.amountDueAtDelivery, 0),
        deliveryTotal: 2_000,
        articles,
      };
    };
    if (/\/checkout\/group$/.test(url) && req.method() === 'POST') {
      w.groupes.push(body);
      const v = vue('payment_pending', body['quoteIds'] as string[]);
      return json(200, { ...v, commandes: v.articles.map((a, i) => ({ orderId: a.orderId, buyerRef: `ref-secret-${i}` })) });
    }
    if (/\/checkout\/group\/[^/]+$/.test(url) && req.method() === 'GET') {
      w.groupReads.push(url);
      const script = o.groupStates ?? ['payment_pending', 'confirmed'];
      const state = script[Math.min(w.groupReads.length - 1, script.length - 1)]!;
      const ids = (w.groupes.at(-1)?.['quoteIds'] as string[] | undefined) ?? [];
      return json(200, vue(state, ids));
    }
    if (/\/door-charge$/.test(url)) {
      w.doorCharges.push({ url, body });
      const id = decodeURIComponent(/\/order\/([^/]+)\/door-charge$/.exec(url)![1]!);
      return json(200, { orderId: id, state: 'confirmed', amountPaidAtCheckout: 1_000, amountDueAtDelivery: 11_500, doorLeg: 'due' });
    }
    if (/\/remise$/.test(url)) return json(404, { ok: false });
    const lecture = /\/checkout\/order\/([^/]+)$/.exec(url);
    if (lecture && req.method() === 'GET') {
      const id = decodeURIComponent(lecture[1]!);
      w.orderReads.push(id);
      const b = door(id);
      // The rider is at her door: every delivery mark stands.
      const t0 = new Date(Date.now() - 60_000).toISOString();
      return json(200, {
        orderId: id, state: 'confirmed', amountPaidAtCheckout: b ? 1_000 : 12_500, amountDueAtDelivery: b ? 11_500 : 0, doorLeg: b ? 'due' : 'none',
        acceptedAt: t0, readyAt: t0, departedAt: t0, arrivedAt: t0,
      });
    }
    // A quote: each article, each mode — its own id names both.
    w.quotes.push(body);
    const pid = String(body['pid']);
    const b = body['paymentMode'] === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
    if (b && o.door !== true) return json(422, { error: 'pay_at_door_not_eligible' });
    const f = FIG[pid]!;
    return json(200, {
      quoteId: `q-${pid}-${b ? 'B' : 'A'}`,
      paymentMode: body['paymentMode'],
      productSubtotal: f.produit,
      deliveryFee: f.frais,
      buyerTotal: f.produit + f.frais,
      amountPaidAtCheckout: b ? f.frais : f.produit + f.frais,
      amountDueAtDelivery: b ? f.produit : 0,
      expiry: expiry(),
    });
  });
  return w;
}

async function jusquauPaiement(page: Page, mode: 'A' | 'B' = 'A'): Promise<void> {
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"][data-panier]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-action="continuer-c3"]').click();
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="continuer-c4"]').click();
  await page.locator('[data-screen="C5"]').waitFor();
  await page.locator(`[data-action="choix-paiement"][data-mode="${mode}"]`).click();
}

test('REAL · one payment: every article held under ONE holder, ONE group asked, no amount on any wire, and each order tracked on its own', async ({ page }) => {
  const w = await service(page);
  await jusquauPaiement(page);
  // The one amount on the button is the SERVICE's total.
  await expect(page.locator('[data-action="payer"]')).toContainText('34');
  await page.locator('[data-action="payer"]').click();
  await page.locator('[data-screen="C6"]').waitFor();
  // Waiting first — never « confirmé » before the operator.
  await expect(page.locator('[data-etat="attente-operateur"]')).toBeVisible();
  await expect(page.locator('[data-role="panier-suivi"]')).toBeVisible({ timeout: 20_000 });

  // THE WIRE: both articles held, one holder; one group with both quotes.
  expect(w.reserves.map((r) => /quote\/([^/]+)\/reserve/.exec(r.url)![1]).sort()).toEqual(['q-p1-A', 'q-p2-A']);
  expect(new Set(w.reserves.map((r) => r.body['holderRef'])).size).toBe(1);
  expect(w.groupes).toHaveLength(1);
  expect((w.groupes[0]!['quoteIds'] as string[]).sort()).toEqual(['q-p1-A', 'q-p2-A']);
  expect(w.groupes[0]!['holderRef']).toBe(w.reserves[0]!.body['holderRef']);
  expect(Object.keys(w.groupes[0]!).sort()).toEqual(['commandId', 'contact', 'holderRef', 'quoteIds']);
  for (const b of [...w.prix, ...w.groupes, ...w.reserves.map((r) => r.body)]) {
    expect(JSON.stringify(b)).not.toMatch(/amount|total|fcfa|prix/i);
  }
  // Her read tokens stay in memory, never in the page.
  expect(await page.content()).not.toContain('ref-secret');

  // ONE article's own tracking reads ITS order.
  await page.locator('[data-action="suivre-article"][data-order="ord-q-p2-A"]').click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  await expect.poll(() => w.orderReads.includes('ord-q-p2-A')).toBe(true);
});

test('REAL · one article gone at the hold: she is told WHICH one, nothing is paid, and the way out is her panier', async ({ page }) => {
  const w = await service(page, { refuseReserveOf: 'p2' });
  await jusquauPaiement(page);
  await page.locator('[data-action="payer"]').click();
  const refus = page.locator('[data-screen="REFUS"]');
  await expect(refus).toBeVisible();
  await expect(refus).toContainText('Pagne wax 6 yards n’est plus disponible.');
  await expect(refus).toContainText('Rien n’a été payé.');
  await expect(refus.locator('[data-action="voir-boutique"]')).toBeVisible();
  expect(w.groupes).toHaveLength(0);
});

test('REAL · pay at the door: the one payment is the delivery fees; each article pays its product at ITS door, under the panier\'s holder', async ({ page }) => {
  const w = await service(page, { door: true });
  await jusquauPaiement(page, 'B');
  await page.locator('[data-action="payer"]').click();
  await expect(page.locator('[data-role="panier-suivi"]')).toBeVisible({ timeout: 20_000 });
  expect((w.groupes[0]!['quoteIds'] as string[]).sort()).toEqual(['q-p1-B', 'q-p2-B']);
  const titulaire = w.groupes[0]!['holderRef'];

  await page.locator('[data-action="suivre-article"][data-order="ord-q-p1-B"]').click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  // « Je suis à la porte » is offered on a panier article's tracking…
  const porte = page.locator('[data-action="porte"]');
  await expect(porte).toBeVisible();
  await porte.click();
  await page.locator('[data-screen="C8"]').waitFor();
  await page.locator('[data-action="porte-bon"]').click();
  // …and the door charge goes out for THIS order, under the panier's holder.
  await expect.poll(() => w.doorCharges.length).toBe(1);
  expect(w.doorCharges[0]!.url).toContain('/checkout/order/ord-q-p1-B/door-charge');
  expect(w.doorCharges[0]!.body['holderRef']).toBe(titulaire);
});
