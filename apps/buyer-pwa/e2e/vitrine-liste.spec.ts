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
  await page.locator('[data-role="liste-tel"]').fill('70 12 34 56');

  // LISTE-ADRESSE — the private address block: touching it makes quartier +
  // delivery phone required, refused INLINE while under her thumb…
  await page.locator('[data-role="liste-tel-livraison"]').fill('70 12 34 56');
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toHaveText('Choisissez votre quartier.');
  await page.locator('[data-role="liste-quartier"]').selectOption('Dassasgo');
  await page.locator('[data-role="liste-repere"]').fill('Portail bleu');

  // …and a complete one rides the create. THE LINK STATE IS REACHED.
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-lien"]')).toContainText(`/v/aicha-4821?liste=${TOKEN}`);
  // The wire carried the EXACT body — the zone composed exactly as this
  // boutique's own checkout composes a buyer's destination.
  expect(creates).toHaveLength(1);
  expect(creates[0]).toEqual({
    slug: 'aicha-4821', nom: 'Awa', pids: ['p1'], telephone: '70 12 34 56',
    livraison: { telephone: '70 12 34 56', quartier: 'Dassasgo', repere: 'Portail bleu', zone: 'Dassasgo, Ouagadougou' },
  });

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

/**
 * LISTE-REFAIRE-2 — THE TAP-ACTS WALK (founder: « the word enregistrer and
 * the flow makes it more confusing … add the option to add an item and make
 * very clear and very simple »). « Refaire ma liste » opens the gestion
 * sheet: « Retirer » on hers, « Ajouter » on the rest, NO save word — every
 * tap is one immediate POST whose exact bytes are recorded, the rows move,
 * the card follows, and the SAME link stays. The four questions: the tree
 * survives every tap (hors-ligne retry, the last-item refusal, both acts) ·
 * each verb is wired to a real POST · the refusal leaves her a way out ·
 * the next step is REACHED (rows move, the handle follows, a reload agrees).
 */
test('CREATOR — Retirer and Ajouter act on the tap: no save word, exact wires, the link kept', async ({ page }) => {
  await page.addInitScript(
    ({ token, editCle }: { token: string; editCle: string }) => {
      // set-if-absent: this runs on EVERY navigation, and the reload at the
      // end must find the handle the ACTS wrote, not this seed again
      if (window.localStorage.getItem('shopplus.listes.v1') === null) {
        window.localStorage.setItem(
          'shopplus.listes.v1',
          JSON.stringify({
            'aicha-4821': { token, editCle, nom: 'Awa', pids: ['p1'], createdAt: 'T' },
          }),
        );
      }
    },
    { token: TOKEN, editCle: 'E'.repeat(32) },
  );
  let horsLigne = true;
  const updates: Record<string, unknown>[] = [];
  await page.route('**/listes/**', async (route: Route) => {
    if (route.request().method() === 'POST') {
      updates.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
      // the scripted door answers each act with the truth it produced:
      // 1st act (Ajouter p2) → [p1 offert, p2] · 2nd act (Retirer p1) → [p2]
      const articles = updates.length === 1
        ? [{ pid: 'p1', offert: true }, { pid: 'p2', offert: false }]
        : [{ pid: 'p2', offert: false }];
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, liste: { nom: 'Awa', slug: 'aicha-4821', articles } }),
      });
      return;
    }
    if (horsLigne) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, liste: { nom: 'Awa', slug: 'aicha-4821', articles: [{ pid: 'p1', offert: true }] } }),
    });
  });
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821`);
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toContainText('La liste de Awa · 1 envie');

  // HORS-LIGNE FIRST — the honest state; the retry is the SAME action, and
  // it must NOT shunt her to a new-link create.
  await page.locator('[data-role="vitrine-liste-carte"] [data-action="liste-creer"]').click();
  await expect(page.locator('[data-role="liste-modif-horsligne"]')).toBeVisible();
  horsLigne = false;
  await page.locator('[data-role="liste-sheet"] [data-action="liste-creer"]').click();

  // THE GESTION SHEET — hers under « Sur votre liste » with Retirer and the
  // badge; p2 under « Ajouter un article »; the dead p3 nowhere; NO save
  // word, NO checkbox; the link promise stated.
  await expect(page.locator('[data-action="liste-retirer"][data-pid="p1"]')).toBeVisible();
  await expect(page.locator('[data-action="liste-ajouter"][data-pid="p2"]')).toBeVisible();
  await expect(page.locator('[data-pid="p3"]')).toHaveCount(0); // épuisé and not hers — not addable
  await expect(page.locator('[data-role="liste-sheet"]')).toContainText('Déjà offert');
  await expect(page.locator('[data-action="liste-enregistrer"]')).toHaveCount(0);
  await expect(page.locator('[data-role="liste-sheet"] input')).toHaveCount(0);
  await expect(page.locator('[data-role="liste-sheet"]')).toContainText('Votre lien reste le même.');

  // THE LAST-ITEM LAW, REWRITTEN (LISTE-CADEAUX-1): Retirer on her ONLY
  // article no longer refuses — it ASKS. Nothing leaves the phone, and
  // « Garder ma liste » walks straight back to the sheet, nothing lost.
  await page.locator('[data-action="liste-retirer"][data-pid="p1"]').click();
  await expect(page.locator('[data-role="liste-fermer-question"]')).toBeVisible();
  expect(updates).toHaveLength(0);
  await page.locator('[data-action="liste-garder"]').click();
  await expect(page.locator('[data-action="liste-retirer"][data-pid="p1"]')).toBeVisible();
  await expect(page.locator('[data-role="liste-sheet"]')).toContainText('Déjà offert');
  expect(updates).toHaveLength(0);

  // AJOUTER ACTS ON THE TAP — the exact body out, the row moves up.
  await page.locator('[data-action="liste-ajouter"][data-pid="p2"]').click();
  await expect(page.locator('[data-action="liste-retirer"][data-pid="p2"]')).toBeVisible();
  expect(updates[0]).toEqual({ editCle: 'E'.repeat(32), pids: ['p1', 'p2'] });
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toContainText('La liste de Awa · 2 envies');
  await expect(page.locator('[data-action="liste-ajouter"][data-pid="p4"]')).toBeVisible(); // the rest stays addable
  // (the empty add section's honest « Tout est déjà sur votre liste. » is
  // unit-covered — this demo boutique always has more in stock)

  // RETIRER ACTS ON THE TAP — now that she has two, p1 can go.
  await page.locator('[data-action="liste-retirer"][data-pid="p1"]').click();
  await expect(page.locator('[data-action="liste-retirer"][data-pid="p1"]')).toHaveCount(0);
  expect(updates).toHaveLength(2);
  expect(updates[1]).toEqual({ editCle: 'E'.repeat(32), pids: ['p2'] });

  // THE NEXT STEP IS REACHED — the handle followed the SERVICE's answers,
  // and a fresh visit agrees; the sheet's way out still works.
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toContainText('La liste de Awa · 1 envie');
  const handle = await page.evaluate(() => window.localStorage.getItem('shopplus.listes.v1'));
  expect((JSON.parse(handle ?? '{}') as Record<string, { pids: string[] }>)['aicha-4821']?.pids).toEqual(['p2']);
  await page.locator('[data-action="liste-fermer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toContainText('La liste de Awa · 1 envie');
});

/**
 * LISTE-REFAIRE-2 — THE ACT'S EDGES (verifier MAJOR 3): a failed act leaves a
 * pressable way out · while an act is on the road every row button sleeps ·
 * closing mid-act loses NOTHING (the server answered; the handle and the
 * card follow) while the closed sheet is never repainted.
 */
test('CREATOR — a failed act keeps its way out, in-flight taps sleep, closing mid-act loses nothing', async ({ page }) => {
  await page.addInitScript(
    ({ token, editCle }: { token: string; editCle: string }) => {
      if (window.localStorage.getItem('shopplus.listes.v1') === null) {
        window.localStorage.setItem(
          'shopplus.listes.v1',
          JSON.stringify({ 'aicha-4821': { token, editCle, nom: 'Awa', pids: ['p1', 'p2'], createdAt: 'T' } }),
        );
      }
    },
    { token: TOKEN, editCle: 'E'.repeat(32) },
  );
  let posteEnPanne = true;
  const updates: Record<string, unknown>[] = [];
  await page.route('**/listes/**', async (route: Route) => {
    if (route.request().method() === 'POST') {
      updates.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
      if (posteEnPanne) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
        return;
      }
      await new Promise((r) => setTimeout(r, 700)); // the act is ON THE ROAD
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, liste: { nom: 'Awa', slug: 'aicha-4821', articles: [{ pid: 'p2', offert: false }] } }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, liste: { nom: 'Awa', slug: 'aicha-4821', articles: [{ pid: 'p1', offert: false }, { pid: 'p2', offert: false }] } }),
    });
  });
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821`);
  await page.locator('[data-role="vitrine-liste-carte"] [data-action="liste-creer"]').click();
  await expect(page.locator('[data-action="liste-retirer"][data-pid="p1"]')).toBeVisible();

  // A FAILED ACT — the reason shows inline and the buttons WAKE: the way out.
  await page.locator('[data-action="liste-retirer"][data-pid="p1"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toHaveText('Impossible pour le moment. Réessayez.');
  await expect(page.locator('[data-action="liste-retirer"][data-pid="p1"]')).toBeEnabled();
  expect(updates).toHaveLength(1);

  // THE SLOW ROAD — while her act is out, every other row button sleeps (two
  // racing taps could silently undo each other), and she closes the sheet.
  posteEnPanne = false;
  await page.locator('[data-action="liste-retirer"][data-pid="p1"]').click();
  await expect(page.locator('[data-action="liste-ajouter"][data-pid="p4"]')).toBeDisabled();
  // LISTE-FERMER-2 — the direct close entry sleeps with its siblings: a
  // close racing an act in flight could destroy the liste the act's answer
  // is about to repaint.
  await expect(page.locator('[data-action="liste-fermer-demande"]')).toBeDisabled();
  await page.locator('[data-action="liste-fermer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);

  // THE ACT STILL HAPPENED — the server answered after the close: the card
  // and the handle follow, and the closed sheet is never repainted.
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toContainText('La liste de Awa · 1 envie');
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);
  expect(updates).toHaveLength(2);
  expect(updates[1]).toEqual({ editCle: 'E'.repeat(32), pids: ['p2'] });
  const handle = await page.evaluate(() => window.localStorage.getItem('shopplus.listes.v1'));
  expect((JSON.parse(handle ?? '{}') as Record<string, { pids: string[] }>)['aicha-4821']?.pids).toEqual(['p2']);
});

test('CREATOR — closing the redo sheet while the read is out paints nothing (the torn-down container law)', async ({ page }) => {
  await page.addInitScript(
    ({ token, editCle }: { token: string; editCle: string }) => {
      window.localStorage.setItem(
        'shopplus.listes.v1',
        JSON.stringify({ 'aicha-4821': { token, editCle, nom: 'Awa', pids: ['p1'], createdAt: 'T' } }),
      );
    },
    { token: TOKEN, editCle: 'E'.repeat(32) },
  );
  await page.route('**/listes/**', async (route: Route) => {
    await new Promise((r) => setTimeout(r, 600)); // the read is still on the road when she closes
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, liste: { nom: 'Awa', slug: 'aicha-4821', articles: [{ pid: 'p1', offert: false }] } }),
    });
  });
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821`);
  await page.locator('[data-role="vitrine-liste-carte"] [data-action="liste-creer"]').click();
  await expect(page.locator('[data-role="liste-modif-attente"]')).toBeVisible();
  await page.locator('[data-action="liste-fermer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);
  // the late answer arrives into a closed sheet — and must render NOTHING
  await page.waitForTimeout(900);
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);
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
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
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

/**
 * LISTE-ADRESSE-1 — THE PAY-ONLY WALK (founder: « he only proceeds with the
 * payment only … the friend buying the item never sees the delivery
 * information »). The liste stored an address (its read answers the bare
 * boolean); the fiche's quote then NAMES the liste — no zoneTo on that wire —
 * C3 never mounts, C4 carries the founder's exact sentence, and the order
 * leaves with NO contact: the service attaches hers in the background. The
 * four questions: the tree survives (Commander, back-to-C1, pay) · the
 * primary action reaches a real POST · the back from the price lands on the
 * product · the friend reaches CONFIRMED having typed nothing.
 */
test('GIFT — the friend only pays: C3 never mounts, « Livré chez Awa, à son adresse. », no contact on the wire', async ({ page }) => {
  const quotes: Record<string, unknown>[] = [];
  const orders: Record<string, unknown>[] = [];
  // A STALE NON-LISTE JOURNEY sits in this tab (same product, typed phone,
  // parked on C5). The gift road must NEVER resume it (verifier MAJOR 1):
  // its phone would ride every gift order into liste_contact_conflit.
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'sp-reprise:v1',
      JSON.stringify({
        lien: 'aicha-4821#p2', ecran: 'C5', zone: 'Gounghin', repere: 'Face au marché',
        indic: '', phone: '70 99 88 77', delivery: 'today', pay: 'A', orderId: null, buyerRef: null, essai: 0,
      }),
    );
  });
  await page.route('**/listes/**', (route: Route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, liste: { ...LISTE, livraison: true } }),
    }),
  );
  await page.route('**/checkout/**', async (route: Route) => {
    const req = route.request();
    const json = (status: number, body: unknown): Promise<void> =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const body = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    if (/\/reserve$/.test(req.url())) return json(200, { status: 'reserved', reservationId: 'res-1' });
    if (/\/liste-merci$/.test(req.url()) && req.method() === 'GET') return json(404, { ok: false });
    if (/\/checkout\/order$/.test(req.url()) && req.method() === 'POST') {
      orders.push(body);
      return json(200, {
        orderId: `ord-${String(body['quoteId'])}`, state: 'payment_pending',
        amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, doorLeg: 'none', buyerRef: 'ref-1',
      });
    }
    if (/\/checkout\/order\//.test(req.url())) {
      return json(200, { orderId: 'ord-quote-liste-1', state: 'confirmed', amountPaidAtCheckout: 12_500, amountDueAtDelivery: 0, doorLeg: 'none' });
    }
    quotes.push(body);
    if (body['paymentMode'] === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') return json(422, { error: 'pay_at_door_not_eligible' });
    return json(200, {
      quoteId: 'quote-liste-1', paymentMode: 'FULL_PREPAY', productSubtotal: 11_500,
      deliveryFee: 1_000, buyerTotal: 12_500, amountPaidAtCheckout: 12_500,
      amountDueAtDelivery: 0, expiry: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
  });
  await page.goto(`${BASE}/?demo-signed=aicha-4821&pid=p2&liste=${TOKEN}`);
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();

  // C3 NEVER MOUNTS — the price screen is next, carrying the founder's exact
  // sentence and NO modifier (the address is not the friend's to change).
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });
  const chez = page.locator('[data-role="livre-chez"]');
  await expect(chez).toBeVisible();
  await expect(chez).toContainText('Livré chez Awa, à son adresse.');
  await expect(page.locator('[data-action="retour-c3"].cl-modifier')).toHaveCount(0);
  // the friend's quote NAMED the liste and carried NO destination
  expect(quotes[0]!['listeRef']).toBe(TOKEN);
  expect(quotes[0]!['zoneTo']).toBeUndefined();

  // the step BACK from the price is the product, not a form she never saw
  await page.locator('[data-screen="C4"] [data-action="retour-c3"]').click();
  await page.locator('[data-screen="C1"]').waitFor();
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });

  // PAY — and the order leaves with NO contact: four keys, nothing typed.
  await page.locator('[data-action="continuer-c4"]').click();
  await page.locator('[data-screen="C5"]').waitFor();
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect.poll(() => orders.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const body = orders[0]!;
  expect(body['listeRef']).toBe(TOKEN);
  expect(body['contact']).toBeUndefined();
  expect(Object.keys(body).sort()).toEqual(['commandId', 'holderRef', 'listeRef', 'quoteId']);

  // the friend REACHES the confirmed screen having typed nothing at all
  await page.locator('[data-screen="C6"]').waitFor({ timeout: 15_000 });
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

/**
 * LISTE-FERMER — THE TERMINATION WALK (founder, 2026-08-27: « allow the
 * wishlist creator to remove all his items to terminate the wishlist »).
 * The four questions: the tree survives every tap (the question face, a
 * FAILED close, the farewell) · « Fermer ma liste » is wired to a real POST
 * whose exact bytes are recorded · the self-firing act's failure leaves a
 * pressable way out · the next step is REACHED (the card back to the
 * invitation, the handle gone, a reload agreeing).
 */
test('CREATOR — removing the last article asks, then closes: the link road dies, the card returns to the invitation', async ({ page }) => {
  await page.addInitScript(
    ({ token, editCle }: { token: string; editCle: string }) => {
      if (window.localStorage.getItem('shopplus.listes.v1') === null) {
        window.localStorage.setItem(
          'shopplus.listes.v1',
          JSON.stringify({ 'aicha-4821': { token, editCle, nom: 'Awa', pids: ['p1'], createdAt: 'T' } }),
        );
      }
    },
    { token: TOKEN, editCle: 'E'.repeat(32) },
  );
  let fermerEssais = 0;
  const fermetures: Record<string, unknown>[] = [];
  await page.route('**/listes/**', async (route: Route) => {
    if (/\/fermer$/.test(route.request().url())) {
      fermetures.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
      fermerEssais += 1;
      // the FIRST close fails — the way-out law must be walked, not assumed
      if (fermerEssais === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, liste: { nom: 'Awa', slug: 'aicha-4821', articles: [{ pid: 'p1', offert: false }] } }),
    });
  });
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821`);
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toContainText('La liste de Awa · 1 envie');

  // gestion → the last Retirer ASKS, with cause and effect stated
  await page.locator('[data-role="vitrine-liste-carte"] [data-action="liste-creer"]').click();
  await page.locator('[data-action="liste-retirer"][data-pid="p1"]').click();
  await expect(page.locator('[data-role="liste-fermer-question"]')).toHaveText(
    'Retirer le dernier article ferme votre liste. Votre lien ne marchera plus.',
  );
  expect(fermetures).toHaveLength(0); // nothing on the wire until she answers

  // the confirmed close FAILS first — the reason shows, both buttons wake
  await page.locator('[data-action="liste-fermer-liste"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toContainText('Réessayez');
  await expect(page.locator('[data-action="liste-fermer-liste"]')).toBeEnabled();
  await expect(page.locator('[data-action="liste-garder"]')).toBeEnabled();
  expect(fermetures[0]).toEqual({ editCle: 'E'.repeat(32) });

  // the retry succeeds — the farewell face, and the card is ALREADY back to
  // the invitation underneath (the handle followed the truth)
  await page.locator('[data-action="liste-fermer-liste"]').click();
  await expect(page.locator('[data-role="liste-fermee"]')).toContainText('votre liste est fermée');
  expect(fermetures).toHaveLength(2);
  expect(fermetures[1]).toEqual({ editCle: 'E'.repeat(32) });
  await expect(page.locator('[data-role="vitrine-liste-inviter"]')).toBeVisible();

  // the way forward closes the sheet; the handle is gone; a reload agrees
  await page.locator('[data-role="liste-sheet"] [data-action="liste-fermer"]').first().click();
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);
  const handle = await page.evaluate(() => window.localStorage.getItem('shopplus.listes.v1'));
  expect(JSON.parse(handle ?? '{}')).toEqual({});
  await page.reload();
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  await expect(page.locator('[data-role="vitrine-liste-inviter"]')).toBeVisible();
});

/**
 * LISTE-CADEAUX — THE « MES CADEAUX » WALK. The four questions: the tree
 * survives the tap (chargement → hors-ligne → the rows) · the card entry is
 * pressable and wired to a real POST with the exact one-key body · the
 * hors-ligne face keeps its pressable retry (the SAME action) · the next
 * step is REACHED (the revealed code readable, the not-yet row honest).
 */
test('CREATOR — « Mes cadeaux » reads fresh: hors-ligne retries, the code shows big once revealed, the not-yet row says so', async ({ page }) => {
  await page.addInitScript(
    ({ token, editCle }: { token: string; editCle: string }) => {
      if (window.localStorage.getItem('shopplus.listes.v1') === null) {
        window.localStorage.setItem(
          'shopplus.listes.v1',
          JSON.stringify({ 'aicha-4821': { token, editCle, nom: 'Awa', pids: ['p1', 'p2'], createdAt: 'T' } }),
        );
      }
    },
    { token: TOKEN, editCle: 'E'.repeat(32) },
  );
  const lectures: Record<string, unknown>[] = [];
  let horsLigne = true;
  await page.route('**/listes/**', async (route: Route) => {
    if (!/\/cadeaux$/.test(route.request().url())) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
      return;
    }
    lectures.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    if (horsLigne) {
      await route.abort('internetdisconnected');
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, nom: 'Awa',
        cadeaux: [
          { pid: 'p1', suivi: { state: 'confirmed', arrivedAt: '2026-08-27T11:45:00.000Z', livree: false }, code: '123456' },
          { pid: 'p2', suivi: { state: 'confirmed', livree: false } },
        ],
      }),
    });
  });
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821`);
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toBeVisible();

  // the third quiet road — HORS-LIGNE FIRST, with its pressable retry
  await page.locator('[data-action="liste-cadeaux"]').click();
  await expect(page.locator('[data-role="liste-cadeaux-horsligne"]')).toBeVisible();
  horsLigne = false;
  await page.locator('[data-role="liste-sheet"] [data-action="liste-cadeaux"]').click();

  // THE ROWS — p1 arrived: the code big with the livreur aide; p2 on its
  // way: the honest attente line; the état sentences from the ?cadeau law.
  const rowP1 = page.locator('[data-role="liste-cadeau"][data-pid="p1"]');
  await expect(rowP1.locator('[data-role="cadeau-code"] .vt-liste-code-chiffres')).toHaveText('123456');
  await expect(rowP1).toContainText('Donnez ce code au livreur.');
  await expect(rowP1.locator('[data-role="cadeau-etat"]')).toHaveText('Arrivé — remise en cours');
  const rowP2 = page.locator('[data-role="liste-cadeau"][data-pid="p2"]');
  await expect(rowP2.locator('[data-role="cadeau-attente-code"]')).toBeVisible();
  await expect(rowP2.locator('[data-role="cadeau-code"]')).toHaveCount(0);

  // the wire carried the exact one-key body, once per ask
  expect(lectures).toHaveLength(2);
  expect(lectures[0]).toEqual({ editCle: 'E'.repeat(32) });
  expect(lectures[1]).toEqual({ editCle: 'E'.repeat(32) });

  // the way out — and the card (and her handle) untouched by a mere read
  await page.locator('[data-action="liste-fermer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toContainText('La liste de Awa · 2 envies');
});

/**
 * LISTE-FERMER-2 — THE DIRECT ROAD (founder, 2026-08-27: « Add the direct
 * Fermer ma liste button as well »). The same confirm face, the same act,
 * the same wire — reached without removing anything. The four questions:
 * the tree survives the tap (gestion → the question → back → the farewell)
 * · the entry is pressable and leads to the confirm whose primary is wired
 * to the real POST · « Garder » backs out with zero wire · the next step is
 * REACHED (the card back to the invitation, the handle gone, reload agrees).
 */
test('CREATOR — the direct « Fermer ma liste » asks the plain question, keeps on Garder, closes on confirm', async ({ page }) => {
  await page.addInitScript(
    ({ token, editCle }: { token: string; editCle: string }) => {
      if (window.localStorage.getItem('shopplus.listes.v1') === null) {
        window.localStorage.setItem(
          'shopplus.listes.v1',
          JSON.stringify({ 'aicha-4821': { token, editCle, nom: 'Awa', pids: ['p1', 'p2'], createdAt: 'T' } }),
        );
      }
    },
    { token: TOKEN, editCle: 'E'.repeat(32) },
  );
  const fermetures: Record<string, unknown>[] = [];
  await page.route('**/listes/**', async (route: Route) => {
    if (/\/fermer$/.test(route.request().url())) {
      fermetures.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, liste: { nom: 'Awa', slug: 'aicha-4821', articles: [{ pid: 'p1', offert: false }, { pid: 'p2', offert: false }] } }),
    });
  });
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821`);
  await expect(page.locator('[data-role="vitrine-liste-carte"]')).toContainText('La liste de Awa · 2 envies');

  // gestion — BOTH articles still on the liste; the direct entry below them
  await page.locator('[data-role="vitrine-liste-carte"] [data-action="liste-creer"]').click();
  await expect(page.locator('[data-action="liste-retirer"][data-pid="p1"]')).toBeVisible();
  await page.locator('[data-action="liste-fermer-demande"]').click();

  // THE PLAIN QUESTION — the direct road's own sentence, zero wire so far
  await expect(page.locator('[data-role="liste-fermer-question"]')).toHaveText(
    'Fermer votre liste ? Votre lien ne marchera plus.',
  );
  expect(fermetures).toHaveLength(0);

  // « Garder ma liste » walks back to the sheet — still zero wire
  await page.locator('[data-action="liste-garder"]').click();
  await expect(page.locator('[data-action="liste-retirer"][data-pid="p2"]')).toBeVisible();
  expect(fermetures).toHaveLength(0);

  // the confirmed close — the exact one-key wire, the farewell, the invitation
  await page.locator('[data-action="liste-fermer-demande"]').click();
  await page.locator('[data-action="liste-fermer-liste"]').click();
  await expect(page.locator('[data-role="liste-fermee"]')).toContainText('votre liste est fermée');
  expect(fermetures).toEqual([{ editCle: 'E'.repeat(32) }]);
  await expect(page.locator('[data-role="vitrine-liste-inviter"]')).toBeVisible();

  // the handle is gone; a reload agrees
  const handle = await page.evaluate(() => window.localStorage.getItem('shopplus.listes.v1'));
  expect(JSON.parse(handle ?? '{}')).toEqual({});
  await page.reload();
  await expect(page.locator('.vt-root[data-etat="ready"]')).toBeVisible();
  await expect(page.locator('[data-role="vitrine-liste-inviter"]')).toBeVisible();
});

/**
 * LISTE-VOIX — THE RECORDED-REPÈRE WALK (founder, 2026-08-27: « on the
 * repère add the audio option repère where the creator can record and it
 * will be added to the delivery informations »). Chromium's fake microphone
 * feeds a REAL MediaRecorder — the checkout walk's own road. The four
 * questions: the tree survives every face (record → recorded → supprimer →
 * re-record → create) · the record road is pressable and its bytes REACH the
 * wire inside livraison · a note alone cannot make an impossible delivery
 * (the inline refusal, zero wire) · the next step is reached — and the ONE
 * loss (noteVocale perdue) is SPOKEN on the celebration.
 */
test('CREATOR — she records the repère: the bytes ride the create inside livraison, and a lost note is said honestly', async ({ page }) => {
  const creates: Record<string, unknown>[] = [];
  await page.route('**/listes', async (route: Route) => {
    creates.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        ok: true, token: TOKEN, editCle: 'E'.repeat(32),
        liste: { nom: 'Awa', slug: 'aicha-4821', articles: [{ pid: 'p1', offert: false }] },
        // the scripted service loses the note — the walk proves the loss is SPOKEN
        noteVocale: 'perdue',
      }),
    });
  });
  await page.goto(`${BASE}/?demo-vitrine=aicha-4821`);
  await page.locator('[data-action="liste-creer"]').click();
  await page.locator('input[data-liste-pid="p1"]').check();
  await page.locator('[data-role="liste-nom"]').fill('Awa');

  // RECORD — the real recorder, the real faces. MID-RECORDING, créer is
  // refused inline (verifier m3): a running take ends by HER hand, never
  // vanishing unnamed under a create.
  await page.locator('[data-action="liste-voix-demarrer"]').click();
  await page.locator('[data-action="liste-voix-arreter"]').waitFor();
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toHaveText('Terminez d\'abord votre note : appuyez sur Arrêter.');
  expect(creates).toHaveLength(0);
  await page.waitForTimeout(1_200); // the fake microphone produces real bytes
  await page.locator('[data-action="liste-voix-arreter"]').click();
  await page.locator('[data-role="liste-voix-faite"]').waitFor();

  // A CLOSED SHEET FORGETS ITS NOTE (verifier m4 — driven, not only read):
  // the reopened sheet is at rest, so no orphan bytes can ride a later create.
  await page.locator('[data-action="liste-fermer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);
  await page.locator('[data-action="liste-creer"]').click();
  await expect(page.locator('[data-role="liste-voix-faite"]')).toHaveCount(0);
  await expect(page.locator('[data-action="liste-voix-demarrer"]')).toBeVisible();
  await page.locator('input[data-liste-pid="p1"]').check();
  await page.locator('[data-role="liste-nom"]').fill('Awa');

  // record anew — THIS take is the one that rides
  await page.locator('[data-action="liste-voix-demarrer"]').click();
  await page.locator('[data-action="liste-voix-arreter"]').waitFor();
  await page.waitForTimeout(1_200);
  await page.locator('[data-action="liste-voix-arreter"]').click();
  await page.locator('[data-role="liste-voix-faite"]').waitFor();

  // A NOTE ALONE IS NOT A DELIVERY — the block counts as touched, the two
  // required facts refuse inline, and NOTHING leaves the phone.
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toHaveText('Choisissez votre quartier.');
  expect(creates).toHaveLength(0);

  // SUPPRIMER walks back to rest; RE-RECORD replaces (one note, one truth).
  await page.locator('[data-action="liste-voix-supprimer"]').click();
  await expect(page.locator('[data-role="liste-voix-faite"]')).toHaveCount(0);
  await page.locator('[data-action="liste-voix-demarrer"]').click();
  await page.locator('[data-action="liste-voix-arreter"]').waitFor();
  await page.waitForTimeout(1_200);
  await page.locator('[data-action="liste-voix-arreter"]').click();
  await page.locator('[data-role="liste-voix-faite"]').waitFor();

  // the address facts, then the create
  await page.locator('[data-role="liste-quartier"]').selectOption('Dassasgo');
  await page.locator('[data-role="liste-tel-livraison"]').fill('70 12 34 56');
  await page.locator('[data-action="liste-valider"]').click();

  // THE CELEBRATION — reached, with the ONE loss spoken plainly.
  await expect(page.locator('[data-role="liste-lien"]')).toContainText(`/v/aicha-4821?liste=${TOKEN}`);
  await expect(page.locator('[data-role="liste-note-perdue"]')).toHaveText(
    'Votre note vocale n\'a pas pu être gardée. Le repère écrit reste.',
  );

  // THE WIRE — the note rides INSIDE livraison, real WebM bytes, never a ref.
  expect(creates).toHaveLength(1);
  const livraison = creates[0]!['livraison'] as Record<string, unknown>;
  expect(Object.keys(livraison).sort()).toEqual(['audioB64', 'quartier', 'repere', 'telephone', 'zone']);
  expect(livraison['quartier']).toBe('Dassasgo');
  expect('audioRef' in livraison).toBe(false);
  const bytes = Buffer.from(String(livraison['audioB64']), 'base64');
  expect(bytes.length).toBeGreaterThan(0);
  // Chromium's recorder emits WebM — the exact EBML head the media door sniffs.
  expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
});

/* ═══ GEO-ACHAT-1 (liste half) — HER PIN ON THE CREATE SHEET, DRIVEN ══════
 * The real Geolocation API under Playwright's grant, the C3 walk's laws on
 * this surface: consent spoken on the kept face, RETIRER total, the closed
 * sheet forgets its pin, a pin alone touches the address block, and the
 * create carries the EXACT bytes the device produced. */

test('GEO-ACHAT-1 · her pin on the liste: consent spoken, RETIRER total, the closed sheet forgets, the exact bytes on the create', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.371532, longitude: -1.519931, accuracy: 12 });
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
  await page.locator('[data-action="liste-creer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toBeVisible();

  // One tap → the kept face, its consent sentence verbatim.
  await page.locator('[data-action="liste-geo-demander"]').click();
  await page.locator('[data-role="liste-geo-faite"]').waitFor();
  await expect(page.locator('[data-role="liste-geo-faite"]')).toContainText('Seul votre livreur la voit');

  // RETIRER is total — the quiet offer returns.
  await page.locator('[data-action="liste-geo-retirer"]').click();
  await page.locator('[data-action="liste-geo-demander"]').waitFor();

  // A closed sheet forgets its pin — DRIVEN, not read: capture, close,
  // reopen, and the face is the quiet offer again.
  await page.locator('[data-action="liste-geo-demander"]').click();
  await page.locator('[data-role="liste-geo-faite"]').waitFor();
  await page.locator('[data-action="liste-fermer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);
  await page.locator('[data-action="liste-creer"]').click();
  await page.locator('[data-role="liste-sheet"]').waitFor();
  await page.locator('[data-action="liste-geo-demander"]').waitFor();

  // A pin ALONE touches the address block: quartier + phone refuse inline
  // (a pin with nobody to call ahead to is a delivery that cannot happen).
  await page.locator('[data-action="liste-geo-demander"]').click();
  await page.locator('[data-role="liste-geo-faite"]').waitFor();
  await page.locator('input[data-liste-pid="p1"]').check();
  await page.locator('[data-role="liste-nom"]').fill('Awa');
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-alerte"]')).toHaveText('Choisissez votre quartier.');
  expect(creates).toHaveLength(0); // the refusal spent no wire

  // The whole road — and the wire carries the EXACT device bytes.
  await page.locator('[data-role="liste-quartier"]').selectOption('Dassasgo');
  await page.locator('[data-role="liste-tel-livraison"]').fill('70 12 34 56');
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-lien"]')).toBeVisible();
  expect(creates).toHaveLength(1);
  const livraison = creates[0]!['livraison'] as Record<string, unknown>;
  expect(Object.keys(livraison).sort()).toEqual(['pin', 'quartier', 'repere', 'telephone', 'zone']);
  expect(livraison['pin']).toEqual({ lat: 12.371532, lng: -1.519931, accuracy: 12 });
});

test('GEO-ACHAT-1 · a fix landing AFTER the sheet was torn down is DROPPED — the reopened sheet owes it nothing (verifier MAJOR-1, liste)', async ({ page }) => {
  // The deferred variant of the ONE native double, bound stated as on the
  // checkout walk: getCurrentPosition hands its success callback to the test
  // instead of answering, so the fix can be fired at a chosen LATER moment.
  // Only the browser API is doubled; no app code is stubbed.
  await page.addInitScript(() => {
    (window as unknown as { __geoLate: unknown }).__geoLate = null;
    navigator.geolocation.getCurrentPosition = (ok) => {
      (window as unknown as { __geoLate: unknown }).__geoLate = ok;
    };
  });
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
  await page.locator('[data-action="liste-creer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toBeVisible();

  // She starts a capture, then closes the sheet without waiting for it.
  await page.locator('[data-action="liste-geo-demander"]').click();
  await page.locator('[data-role="liste-geo-cours"]').waitFor();
  await page.locator('[data-action="liste-fermer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toHaveCount(0);

  // She reopens — a fresh sheet, a fresh epoch — and only THEN the old fix
  // lands. It answers a request from a sheet that no longer exists: on a
  // surface where the consent sentence was never shown, it must go nowhere.
  await page.locator('[data-action="liste-creer"]').click();
  await page.locator('[data-role="liste-sheet"]').waitFor();
  await page.evaluate(() => {
    const ok = (window as unknown as { __geoLate: ((pos: unknown) => void) | null }).__geoLate;
    ok?.({ coords: { latitude: 12.3, longitude: -1.5, accuracy: 8 }, timestamp: 0 });
  });

  // The face is the QUIET OFFER — never a phantom kept pin.
  await page.locator('[data-action="liste-geo-demander"]').waitFor();
  await expect(page.locator('[data-role="liste-geo-faite"]')).toHaveCount(0);

  // And the create carries NO pin: consent unspoken is a pin unsent.
  await page.locator('input[data-liste-pid="p1"]').check();
  await page.locator('[data-role="liste-nom"]').fill('Awa');
  await page.locator('[data-role="liste-quartier"]').selectOption('Dassasgo');
  await page.locator('[data-role="liste-tel-livraison"]').fill('70 12 34 56');
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-lien"]')).toBeVisible();
  expect(creates).toHaveLength(1);
  const livraison = creates[0]!['livraison'] as Record<string, unknown>;
  expect(Object.keys(livraison).sort()).toEqual(['quartier', 'repere', 'telephone', 'zone']);
});

test('GEO-ACHAT-1 · a REFUSED position gates nothing on the liste — the honest face, the create goes through, no pin on the wire', async ({ page }) => {
  // The ONE native double of this walk, its bound stated as on the checkout
  // walk: headless Chromium has no reliable « she tapped non » knob, so the
  // REFUSAL case replaces getCurrentPosition with an immediate
  // PERMISSION_DENIED errback. It doubles the BROWSER's answer and nothing
  // else — no app code is stubbed, and the granted walk above drives the
  // fully real API.
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) => {
      err?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    };
  });
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
  await page.locator('[data-action="liste-creer"]').click();
  await expect(page.locator('[data-role="liste-sheet"]')).toBeVisible();

  await page.locator('[data-action="liste-geo-demander"]').click();
  await page.locator('[data-role="liste-geo-refus"]').waitFor({ timeout: 15_000 });
  await expect(page.locator('[data-role="liste-geo-refus"]')).toContainText('Votre repère écrit suffit.');

  // The refusal gates nothing: she reaches the created liste with her
  // written address alone.
  await page.locator('input[data-liste-pid="p1"]').check();
  await page.locator('[data-role="liste-nom"]').fill('Awa');
  await page.locator('[data-role="liste-quartier"]').selectOption('Dassasgo');
  await page.locator('[data-role="liste-tel-livraison"]').fill('70 12 34 56');
  await page.locator('[data-action="liste-valider"]').click();
  await expect(page.locator('[data-role="liste-lien"]')).toBeVisible();
  expect(creates).toHaveLength(1);
  const livraison = creates[0]!['livraison'] as Record<string, unknown>;
  expect(Object.keys(livraison).sort()).toEqual(['quartier', 'repere', 'telephone', 'zone']);
});
