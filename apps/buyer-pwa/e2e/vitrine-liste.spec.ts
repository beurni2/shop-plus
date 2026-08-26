import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * LISTE-ENVIES-1 — THE WALK (the 2026-08-10 screen law, on this repo's own
 * harness: Playwright drives the REAL page in a real browser). Runs against
 * the port-4175 build made with `VITE_STOREFRONT_BASE`, so `resolveListePort`
 * returns the REAL `httpListePort` — every `/listes*` request is a real
 * `fetch` intercepted here and answered by a scripted service, the
 * checkout-real shape. The `?demo-vitrine=` entry keeps the DEMO storefront
 * port (no network for the boutique itself) — exactly the mixed seam
 * `checkout-real.spec.ts` established.
 *
 * The four questions, per road:
 *   · CREATOR — the sheet opens and the tree survives every tap; refusals are
 *     inline and actionable; the link state is REACHED and the band shows her
 *     liste on the next visit.
 *   · FRIEND — the banner renders from the service read; an offert wish
 *     offers no action while an ungiven one NAVIGATES to its own fiche with
 *     the token riding; the error states carry their way out (Réessayer).
 *   · CHECKOUT — the fiche opened through a liste link sends `listeRef` on
 *     the REAL order create body, and nothing else new.
 */

const BASE = 'http://127.0.0.1:4175';
const TOKEN = 'T'.repeat(32);

const LISTE = {
  nom: 'Awa',
  slug: 'aicha-4821',
  articles: [
    { pid: 'p1', offert: true },
    { pid: 'p2', offert: false },
    { pid: 'p3', offert: false }, // épuisé in the demo catalogue
  ],
};

test('CREATOR — she builds her liste, the link is created, and her band remembers it', async ({ page }) => {
  const creates: Record<string, unknown>[] = [];
  await page.route('**/listes', async (route: Route) => {
    creates.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true, token: TOKEN, editCle: 'E'.repeat(32),
        liste: { nom: 'Awa', slug: 'aicha-4821', articles: [{ pid: 'p1', offert: false }] },
      }),
    });
  });
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821`);
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();

  // The invitation whispers on the boutique; its action opens the sheet.
  await page.locator('[data-action="liste-creer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toBeVisible();
  // épuisé is never offered (p3 is out of stock in the demo catalogue).
  await expect(page.locator('input[data-liste-pid="p3"]')).toHaveCount(0);

  // REFUSALS ARE INLINE AND ACTIONABLE — the tree survives both.
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toHaveText('Choisissez au moins un article.');
  await page.locator('input[data-liste-pid="p1"]').check();
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toHaveText('Dites-nous votre prénom.');

  // The whole road: prénom → créer — WITH the WhatsApp opt-in. A junk number
  // is refused INLINE while the field is still under her thumb…
  await page.locator('[data-role="liste-nom"]').fill('Awa');
  await page.locator('[data-role="liste-tel"]').fill('pas un numero');
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toHaveText('Ce numéro ne semble pas correct.');
  // …a NINE-digit number too (verifier MINOR 1): the inline bands mirror
  // whatsappDigits exactly — 8 or 10–15, never the band between.
  await page.locator('[data-role="liste-tel"]').fill('701234567');
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toHaveText('Ce numéro ne semble pas correct.');
  // …and a real one rides the create as the fourth key. THE LINK STATE IS REACHED.
  await page.locator('[data-role="liste-tel"]').fill('70 12 34 56');
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-lien"]')).toContainText(`/v/aicha-4821?liste=${TOKEN}`);
  // The wire carried the EXACT body — no amount, no extra key.
  expect(creates).toHaveLength(1);
  expect(creates[0]).toEqual({ slug: 'aicha-4821', nom: 'Awa', pids: ['p1'], telephone: '70 12 34 56' });

  // The way out closes the sheet; the band now shows HER liste.
  await page.locator('[data-action="liste-fermer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toBeVisible();
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toContainText('La liste de Awa · 1 envie');

  // SHE LEAVES AND COMES BACK — only her phone's storage carries it.
  await page.reload();
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toBeVisible();
});

test('FRIEND — the banner renders the liste, an offert wish offers nothing, an ungiven one opens its fiche with the token', async ({ page }) => {
  await page.route('**/listes/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, liste: LISTE }) }),
  );
  // The card tap NAVIGATES to `/s/…` — vite preview cannot serve that path,
  // so the document request is fulfilled minimally; the URL is the assertion.
  await page.route('**/s/aicha-4821*', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>fiche</title>' }),
  );
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821&liste=${TOKEN}`);
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  const banner = page.locator('[data-role="vitrine-liste-amie"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('La liste de Awa');
  await expect(banner).toContainText('Déjà offert');
  // the given wish (p1) offers no action; the ungiven (p2) does
  await expect(banner.locator('[data-action="liste-produit"][data-pid="p1"]')).toHaveCount(0);
  const offrir = banner.locator('[data-action="liste-produit"][data-pid="p2"]');
  await expect(offrir).toBeVisible();

  // « Tout mettre au panier » fills the device-local shelf ONLY with the
  // ungiven, in-stock wish — p1 is offert, p3 is épuisé.
  await page.locator('[data-action="liste-tout-panier"]').click();
  await expect(page.locator('[data-role="vitrine-panier"]')).toBeVisible();
  await expect(page.locator('[data-role="panier-article"]')).toHaveCount(1);

  // THE NEXT STEP EXISTS: the card opens THAT product's own fiche, the
  // liste token riding so the order can name it.
  await offrir.click();
  await page.waitForURL(new RegExp(`/s/aicha-4821\\?pid=p2&liste=${TOKEN}`));
});

test('FRIEND — introuvable and hors-ligne are designed states, and Réessayer actually retries', async ({ page }) => {
  let calls = 0;
  await page.route('**/listes/**', (route: Route) => {
    calls += 1;
    if (calls === 1) return route.abort(); // no connection
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, liste: LISTE }) });
  });
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821&liste=${TOKEN}`);
  await expect(page.locator('[data-role="vitrine-liste-horsligne"]')).toBeVisible();
  await page.locator('[data-action="liste-reessayer"]').click();
  await expect(page.locator('[data-role="vitrine-liste-amie"]')).toBeVisible();
  expect(calls).toBe(2);

  // …and an unknown token is the honest introuvable, never an error wall.
  await page.unroute('**/listes/**');
  await page.route('**/listes/**', (route: Route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'not_found' }) }),
  );
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821&liste=${'U'.repeat(32)}`);
  await expect(page.locator('[data-role="vitrine-liste-introuvable"]')).toBeVisible();
});

test('CHECKOUT — listeRef rides the REAL order create; the confirmed screen offers « Prévenir » and opens the purchaser’s OWN WhatsApp', async ({ page }) => {
  const orders: Record<string, unknown>[] = [];
  const mercis: string[] = [];
  const quoteAsks: string[] = [];
  // window.open recorded, never followed — the wa.me URL is the assertion.
  await page.addInitScript(() => {
    (window as unknown as { __waOuvert: string[] }).__waOuvert = [];
    window.open = ((url: string) => {
      (window as unknown as { __waOuvert: string[] }).__waOuvert.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.route('**/checkout/**', async (route: Route) => {
    const req = route.request();
    const json = (status: number, body: unknown): Promise<void> =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const body = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    if (/\/reserve$/.test(req.url())) return json(200, { status: 'reserved', reservationId: 'res-1' });
    // LISTE-MERCI — the buyer-token-gated notify read, scripted to the
    // service's real shape (nom + wa digits + pid), Bearer required.
    if (/\/liste-merci$/.test(req.url()) && req.method() === 'GET') {
      mercis.push(req.headers()['authorization'] ?? '');
      return json(200, { ok: true, nom: 'Awa', telephone: '22670123456', pid: 'p1' });
    }
    if (/\/checkout\/order$/.test(req.url()) && req.method() === 'POST') {
      orders.push(body);
      return json(200, {
        orderId: `ord-${String(body['quoteId'])}`, state: 'payment_pending',
        amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, doorLeg: 'none', buyerRef: 'ref-1',
      });
    }
    if (/\/checkout\/order\//.test(req.url())) {
      // the FIRST poll confirms — the provider-truth moment the merci block
      // is allowed to appear at, and never before
      return json(200, { orderId: 'ord-quote-full-1', state: 'confirmed', amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, doorLeg: 'none' });
    }
    if (body['paymentMode'] === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') {
      quoteAsks.push('door');
      return json(422, { error: 'pay_at_door_not_eligible' });
    }
    quoteAsks.push('full');
    return json(200, {
      quoteId: 'quote-full-1', paymentMode: 'FULL_PREPAY', productSubtotal: 11_500,
      deliveryFee: 1_000, buyerTotal: 12_500, amountPaidAtCheckout: 12_500,
      amountDueAtDelivery: 0, expiry: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
  });
  await page.goto(`${BASE}/?demo-signed=aicha-4821&pid=p1&liste=${TOKEN}`);
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-action="zone"][data-zone="Gounghin Sud"]').click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('[data-role="phone"]').fill('70 12 34 56');
  await page.locator('[data-action="continuer-c3"]').click();
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="continuer-c4"]').click();
  await page.locator('[data-screen="C5"]').waitFor();
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect.poll(() => orders.length, { timeout: 10_000 }).toBeGreaterThan(0);

  // THE SEAM: the create body carries the token, beside the four known keys
  // and nothing else — the service's allowlist would refuse anything more.
  const body = orders[0]!;
  expect(body['listeRef']).toBe(TOKEN);
  expect(Object.keys(body).sort()).toEqual(['commandId', 'contact', 'holderRef', 'listeRef', 'quoteId']);

  // FULL-PREPAY LOCK, client half, on the WIRE: with a liste on the fiche
  // the door ask never left the phone.
  expect(quoteAsks).toEqual(['full']);

  // THE MERCI BLOCK appears once the poll confirms — and the read carried
  // the order's own bearer.
  await page.locator('[data-role="liste-merci"]').waitFor({ timeout: 10_000 });
  expect(mercis[0]).toBe('Bearer ref-1');
  // Refusal inline: no prénom, no send, the tree survives.
  await page.locator('[data-action="merci-whatsapp"]').click();
  await expect(page.locator('[data-role="merci-alerte"]')).toHaveText('Dites-nous votre prénom.');
  // The whole road: prénom → the purchaser's OWN WhatsApp opens on the
  // creator's digits, with the prénom, the article and the ?cadeau= link.
  await page.locator('[data-role="merci-prenom"]').fill('Karim');
  await page.locator('[data-action="merci-whatsapp"]').click();
  const ouverts = await page.evaluate(() => (window as unknown as { __waOuvert: string[] }).__waOuvert);
  expect(ouverts).toHaveLength(1);
  expect(ouverts[0]).toMatch(/^https:\/\/wa\.me\/22670123456\?text=/);
  const texte = decodeURIComponent(ouverts[0]!.split('?text=')[1]!);
  expect(texte).toContain('Karim');
  expect(texte).toContain('Robe brodée bogolan');
  expect(texte).toContain(`${BASE}/?cadeau=ord-quote-full-1`);
});

test('CADEAU — the creator’s tracking link renders the delivery’s facts, and Actualiser re-asks', async ({ page }) => {
  let marques: Record<string, unknown> = { acceptedAt: '2026-08-26T10:00:00Z' };
  await page.route('**/checkout/order/ord-w1', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        orderId: 'ord-w1', state: 'confirmed', amountPaidAtCheckout: 12_500,
        amountDueAtDelivery: 0, doorLeg: 'none', ...marques,
      }),
    }),
  );
  await page.goto(`${BASE}/?cadeau=ord-w1`);
  const carte = page.locator('[data-role="cadeau-suivi"]');
  await expect(carte).toBeVisible();
  await expect(page.locator('[data-role="cadeau-etat"]')).toHaveText('En préparation');
  // no amount ever renders on the recipient's screen
  await expect(carte).not.toContainText('FCFA');

  // the road moves; « Actualiser » is a real re-ask, not a dead button
  marques = { acceptedAt: '2026-08-26T10:00:00Z', readyAt: '2026-08-26T11:00:00Z', departedAt: '2026-08-26T12:00:00Z' };
  await page.locator('[data-action="cadeau-actualiser"]').click();
  await expect(page.locator('[data-role="cadeau-etat"]')).toHaveText('En route');

  // a link that names nothing lands on the honest introuvable
  await page.route('**/checkout/order/ord-perdu', (route: Route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'unknown_order' }) }),
  );
  await page.goto(`${BASE}/?cadeau=ord-perdu`);
  await expect(page.locator('main')).toContainText('Nous ne trouvons pas cette commande.');
});
