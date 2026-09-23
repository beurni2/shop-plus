import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * COLIS-FOURNISSEUR-1 — THE WALKS (founder rulings 2026-09-23, decisions a–d:
 * one package and one delivery fee per supplier; at the door she may give one
 * article back and keep the rest; ONE payment at the door for what she keeps).
 * The 2026-08-10 screen law on this repo's harness: the REAL page in a real
 * browser, only `fetch` scripted, no app code stubbed.
 *
 * THE SCRIPTED SERVICE speaks the storefront Worker's own bytes, certified by
 * `services/storefront-service/test/colis.e2e.test.ts`: a panier's quote asks
 * name the panier and the package's quotes carry its product ids and ONE fee
 * shared; the price names `livraisons`; the payment names its packages; the
 * package door `POST /checkout/group/{id}/porte` takes ids only and answers
 * each kept article as it stands plus the one amount the operator asks for.
 *
 * The four questions, on the live DOM: the tree survives each tap; the
 * primary action is present, pressable and wired; the act that fires by
 * itself (the door watch) leaves a way on; she reaches the next screen.
 * Its bound, stated like every walk's: it claims NOTHING about appearance.
 */

const BASE = 'http://127.0.0.1:4175';
const ENTRY = `${BASE}/?demo-signed=aicha-4821&panier=p1,p2`;

const FIG: Record<string, { produit: number }> = { p1: { produit: 11_500 }, p2: { produit: 20_500 } };
const D = 1_000;
const PART: Record<string, number> = { p1: 500, p2: 500 };

interface Wire {
  quotes: Record<string, unknown>[];
  groupes: Record<string, unknown>[];
  portes: { url: string; body: Record<string, unknown> }[];
  doorCharges: string[];
  remises: { url: string; auth: string | null }[];
}

async function service(page: Page): Promise<Wire> {
  const w: Wire = { quotes: [], groupes: [], portes: [], doorCharges: [], remises: [] };
  const payees = new Set<string>();
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
    const pidDe = (id: string): string => id.split('-')[1]!;
    const door = (id: string): boolean => id.endsWith('-B');
    if (/\/reserve$/.test(url)) return json(200, { status: 'reserved', expiresAt: expiry() });
    if (/\/checkout\/group\/price$/.test(url)) {
      const ids = body['quoteIds'] as string[];
      const b = door(ids[0]!);
      const produit = ids.reduce((s, id) => s + FIG[pidDe(id)]!.produit, 0);
      return json(200, {
        paymentMode: b ? 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' : 'FULL_PREPAY',
        articles: ids.length,
        livraisons: 1,
        amountPaidAtCheckout: b ? D : produit + D,
        amountDueAtDelivery: b ? produit : 0,
        deliveryTotal: D,
        productTotal: produit,
      });
    }
    const commande = (id: string, state: string) => {
      const b = door(id);
      const f = FIG[pidDe(id.replace(/^ord-/, ''))]!;
      const part = PART[pidDe(id.replace(/^ord-/, ''))]!;
      const t0 = new Date(Date.now() - 60_000).toISOString();
      return {
        orderId: id, state,
        amountPaidAtCheckout: b ? part : f.produit + part,
        amountDueAtDelivery: b ? f.produit : 0,
        doorLeg: !b ? 'none' : payees.has(id) ? 'paid' : 'due',
        acceptedAt: t0, readyAt: t0, departedAt: t0, arrivedAt: t0,
      };
    };
    const vue = (state: string, ids: string[]) => {
      const articles = ids.map((id) => commande(`ord-${id}`, state));
      return {
        groupId: 'grp-e2e-colis', state,
        paymentMode: door(ids[0]!) ? 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR' : 'FULL_PREPAY',
        amountPaidAtCheckout: articles.reduce((s, a) => s + a.amountPaidAtCheckout, 0),
        amountDueAtDelivery: articles.reduce((s, a) => s + a.amountDueAtDelivery, 0),
        deliveryTotal: D,
        articles,
        colis: [{ packageId: 'colis-e2e-1', orderIds: ids.map((id) => `ord-${id}`) }],
      };
    };
    if (/\/checkout\/group\/[^/]+\/porte$/.test(url) && req.method() === 'POST') {
      w.portes.push({ url, body });
      const ids = body['orderIds'] as string[];
      for (const id of ids) payees.add(id);
      return json(200, {
        articles: ids.map((id) => ({ ...commande(id, 'confirmed'), doorLeg: 'due' })),
        montant: ids.reduce((s, id) => s + FIG[pidDe(id.replace(/^ord-/, ''))]!.produit, 0),
      });
    }
    if (/\/checkout\/group$/.test(url) && req.method() === 'POST') {
      w.groupes.push(body);
      const v = vue('payment_pending', body['quoteIds'] as string[]);
      return json(200, { ...v, commandes: v.articles.map((a, i) => ({ orderId: a.orderId, buyerRef: `ref-secret-${i}` })) });
    }
    if (/\/checkout\/group\/[^/]+$/.test(url) && req.method() === 'GET') {
      const ids = (w.groupes.at(-1)?.['quoteIds'] as string[] | undefined) ?? [];
      return json(200, vue('confirmed', ids));
    }
    if (/\/door-charge$/.test(url)) {
      w.doorCharges.push(url);
      return json(409, { error: 'porte_du_colis' });
    }
    if (/\/remise$/.test(url)) {
      // The remise door's real bytes: `{ok:true, code}` — the package's ONE code
      // for an article whose door leg is paid; the nameless 404 otherwise.
      w.remises.push({ url, auth: req.headers()['authorization'] ?? null });
      const id = decodeURIComponent(/\/order\/([^/]+)\/remise$/.exec(url)![1]!);
      return payees.has(id) ? json(200, { ok: true, code: '424242' }) : json(404, { ok: false });
    }
    const lecture = /\/checkout\/order\/([^/]+)$/.exec(url);
    if (lecture && req.method() === 'GET') return json(200, commande(decodeURIComponent(lecture[1]!), 'confirmed'));
    // A quote: each article, each mode, priced inside its package.
    w.quotes.push(body);
    const pid = String(body['pid']);
    const b = body['paymentMode'] === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR';
    const f = FIG[pid]!;
    const part = PART[pid]!;
    return json(200, {
      quoteId: `q-${pid}-${b ? 'B' : 'A'}`,
      paymentMode: body['paymentMode'],
      productSubtotal: f.produit,
      deliveryFee: part,
      buyerTotal: f.produit + part,
      amountPaidAtCheckout: b ? part : f.produit + part,
      amountDueAtDelivery: b ? f.produit : 0,
      expiry: expiry(),
      colis: ['p1', 'p2'],
    });
  });
  return w;
}

async function jusquauPaiement(page: Page, mode: 'A' | 'B'): Promise<void> {
  await page.goto(ENTRY);
  await page.locator('[data-screen="C1"][data-panier]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-action="continuer-c3"]').click();
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });
}

test('REAL · one supplier, one package: « 1 livraison », every quote asks with her panier, and the order list shows them together', async ({ page }) => {
  const w = await service(page);
  await jusquauPaiement(page, 'A');
  // THE ONE DELIVERY, counted by the service — not one per article.
  await expect(page.locator('[data-role="livraison-unique"]')).toContainText('1 livraison par Séra');
  await expect(page.locator('[data-role="livraison-unique"]')).toContainText('1');
  for (const q of w.quotes) expect([...(q['panier'] as string[])].sort()).toEqual(['p1', 'p2']);
  await page.locator('[data-action="continuer-c4"]').click();
  await page.locator('[data-screen="C5"]').waitFor();
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect(page.locator('[data-role="panier-suivi"]')).toBeVisible({ timeout: 20_000 });
  // The two travel together, and each still has its own « Suivre ».
  const colis = page.locator('[data-role="panier-colis"]');
  await expect(colis).toContainText('Ces 2 articles arrivent ensemble, dans un seul colis.');
  await expect(colis.locator('[data-action="suivre-article"]')).toHaveCount(2);
  // No amount crossed the wire.
  for (const b of [...w.quotes, ...w.groupes]) expect(JSON.stringify(b)).not.toMatch(/amount|total|fcfa|prix/i);
});

test('REAL · at the door she gives one article back and pays ONCE for the one she keeps; her code follows', async ({ page }) => {
  const w = await service(page);
  await jusquauPaiement(page, 'B');
  await page.locator('[data-action="continuer-c4"]').click();
  await page.locator('[data-screen="C5"]').waitFor();
  await page.locator('[data-action="choix-paiement"][data-mode="B"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect(page.locator('[data-role="panier-suivi"]')).toBeVisible({ timeout: 20_000 });
  const titulaire = w.groupes[0]!['holderRef'];

  // She follows the SECOND article, then says she is at the door.
  await page.locator('[data-action="suivre-article"][data-order="ord-q-p2-B"]').click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  await page.locator('[data-action="porte"]').click();
  await page.locator('[data-screen="C8"]').waitFor();

  // « Dans ce colis »: both articles, both kept until she says otherwise.
  const choix = page.locator('[data-role="colis-porte"] [data-action="garder-article"]');
  await expect(choix).toHaveCount(2);
  await expect(choix.nth(0)).toHaveText('Je le garde');
  await expect(choix.nth(1)).toHaveText('Je le garde');
  // Giving both back leaves nothing to pay here: the primary is not pressable, and she is told her way.
  await choix.nth(0).click();
  await choix.nth(1).click();
  await expect(page.locator('[data-role="colis-aucun"]')).toBeVisible();
  await expect(page.locator('[data-action="porte-bon"]')).toBeDisabled();
  await expect(page.locator('[data-action="porte-probleme"]')).toBeEnabled();
  // She keeps the first, gives back the second — the one she opened.
  await choix.nth(0).click();
  await expect(choix.nth(0)).toHaveText('Je le garde');
  await expect(choix.nth(1)).toHaveText('Je le rends');
  await page.locator('[data-action="porte-bon"]').click();

  // ONE door payment, for exactly the one she keeps, under the panier's holder — no amount on the wire.
  await expect.poll(() => w.portes.length).toBe(1);
  expect(w.portes[0]!.url).toContain('/checkout/group/grp-e2e-colis/porte');
  expect(w.portes[0]!.body['orderIds']).toEqual(['ord-q-p1-B']);
  expect(w.portes[0]!.body['packageId']).toBe('colis-e2e-1');
  expect(w.portes[0]!.body['holderRef']).toBe(titulaire);
  expect(Object.keys(w.portes[0]!.body).sort()).toEqual(['commandId', 'holderRef', 'orderIds', 'packageId']);
  // The single door is never asked for a package's article.
  expect(w.doorCharges).toHaveLength(0);
  // The operator screen names the SERVICE's one amount.
  await expect(page.locator('[data-etat="paiement-porte"]')).toContainText('11');

  // The watch follows the article she KEEPS; once its door leg reads paid, her code shows.
  await expect(page.locator('[data-screen="C9"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-screen="C9"]')).toContainText('424');
  // …asked with the KEPT article's own read token (the second, given back, never).
  const lue = w.remises.find((r) => r.url.includes('/order/ord-q-p1-B/remise'));
  expect(lue?.auth).toBe('Bearer ref-secret-0');
  expect(await page.content()).not.toContain('ref-secret');
});
