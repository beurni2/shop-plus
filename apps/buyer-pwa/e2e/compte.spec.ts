import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * ═══ COMPTE-CLIENTE — HER ACCOUNT, WALKED (founder order 2026-09-24) ═══
 *
 * On the port-4175 build (made WITH `VITE_STOREFRONT_BASE`), so the REAL
 * account port runs in a real browser. Every walk answers the four questions:
 * did the tree survive the tap · is the primary action present, pressable and
 * wired · does anything that fires by itself leave a way out · can she reach
 * the next screen. It claims NOTHING about appearance.
 *
 * THE SERVICE STAND-IN, and its bounds. `Livre` below answers the four buyer
 * account doors with the rules of the real book (services/storefront-service/
 * worker/buyer-accounts-do.ts, proven on workerd by comptes-clientes.e2e):
 * one account per phone keyed on its national digits; `phone_taken` 409 at
 * signup; one `bad_credentials` 401 for every wrong way in; a profile only on
 * the Bearer; `no_session` 401 for anything else; `email: ''` clears; a phone
 * in a profile body is `unknown_field`; a new password needs the current one
 * (`bad_password`) and ends every other session. COMPTE-CLIENTE-2: a
 * recovery code (`codes`, set by the walk as the founder's console would mint
 * it) is spent once and ends every session; `bad_code` for every wrong way;
 * « Mes commandes » adds once each, newest first, for the Bearer's account;
 * delete needs the password and frees the number. What it does NOT mirror,
 * stated: the password hashing, the throttles, the idle life, the code's 24 h
 * life and the address ceilings — the real book's, tested there
 * (comptes-clientes*.e2e). The storefront read is scripted like every boutique
 * walk on this port.
 */

const BASE = 'http://127.0.0.1:4175';
test.use({ baseURL: BASE });

const BOUTIQUE = {
  id: 'sf-e2e-compte-1',
  slug: 'aicha-4821',
  resellerId: 'rs-e2e-compte-1',
  name: 'Chez Aïcha Mode',
  zone: 'Ouagadougou',
  discoverable: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  curatedItems: ['p1'],
  products: [{ pid: 'p1', name: 'Bazin riche brodé', priceFcfa: 12_000, inStock: true, assetRefs: [] }],
};

interface Compte { firstName: string; lastName: string; phone: string; email?: string; password: string }

const cle = (phone: string): string => {
  const d = phone.replace(/\D/g, '');
  const s = d.startsWith('00') ? d.slice(2) : d;
  return s.length === 11 && s.startsWith('226') ? s.slice(3) : s;
};

class Livre {
  comptes = new Map<string, Compte>();
  /** COMPTE-CLIENTE-2 — the founder's live recovery codes, by phone key. */
  codes = new Map<string, string>();
  commandes = new Map<string, { orderId: string; buyerRef: string; at: string }[]>();
  sessions = new Map<string, string>();
  appels: { chemin: string; corps: Record<string, unknown>; bearer: string | null }[] = [];
  horsLigne = false;
  private n = 0;
  profil(c: Compte) {
    return { ok: true, firstName: c.firstName, lastName: c.lastName, phone: c.phone, ...(c.email !== undefined ? { email: c.email } : {}), createdAt: '2026-09-24T08:00:00.000Z' };
  }
  ouvrir(k: string): string {
    this.n += 1;
    const s = `SPC-AAAA-BBBB-CCCC-${'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.slice(this.n % 28, this.n % 28 + 4)}`;
    this.sessions.set(s, k);
    return s;
  }
  async servir(route: Route): Promise<void> {
    if (this.horsLigne) return route.abort('internetdisconnected');
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const chemin = new URL(req.url()).pathname.replace(/^\/api\/buyer\//, '');
    const corps = (req.postDataJSON() ?? {}) as Record<string, unknown>;
    const auth = req.headers()['authorization'] ?? null;
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    this.appels.push({ chemin, corps, bearer });
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (chemin === 'signup') {
      const k = cle(String(corps['phone'] ?? ''));
      if (this.comptes.has(k)) return json(409, { ok: false, reason: 'phone_taken' });
      const c: Compte = {
        firstName: String(corps['firstName']), lastName: String(corps['lastName']), phone: String(corps['phone']), password: String(corps['password']),
        ...(typeof corps['email'] === 'string' && corps['email'] !== '' ? { email: corps['email'] } : {}),
      };
      this.comptes.set(k, c);
      return json(200, { ...this.profil(c), session: this.ouvrir(k) });
    }
    if (chemin === 'login') {
      const k = cle(String(corps['phone'] ?? ''));
      const c = this.comptes.get(k);
      if (c === undefined || c.password !== corps['password']) return json(401, { ok: false, reason: 'bad_credentials' });
      return json(200, { ...this.profil(c), session: this.ouvrir(k) });
    }
    if (chemin === 'logout') {
      if (bearer !== null) this.sessions.delete(bearer);
      return json(200, { ok: true });
    }
    if (chemin === 'recover') {
      // The book's real bounds (buyer-accounts-do `/recover`): names required,
      // the code read however it was heard, and the number starts CLEAN.
      for (const f of ['firstName', 'lastName']) {
        if (String(corps[f] ?? '').trim() === '') return json(400, { ok: false, reason: 'bad_field', field: f });
      }
      if (String(corps['newPassword'] ?? '').length < 8) return json(400, { ok: false, reason: 'bad_field', field: 'newPassword' });
      const k = cle(String(corps['phone'] ?? ''));
      const c = this.comptes.get(k);
      const net = String(corps['code'] ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '');
      const lu = net.length === 19 && net.startsWith('SPR') ? net.slice(3) : net;
      const attendu = this.codes.get(k)?.slice(4).replace(/-/g, '');
      if (c === undefined || attendu === undefined || lu !== attendu) return json(401, { ok: false, reason: 'bad_code' });
      this.codes.delete(k);
      this.commandes.delete(k);
      const neuf: Compte = { firstName: String(corps['firstName']).trim(), lastName: String(corps['lastName']).trim(), phone: String(corps['phone']).trim(), password: String(corps['newPassword']) };
      this.comptes.set(k, neuf);
      for (const [s, kk] of [...this.sessions]) if (kk === k) this.sessions.delete(s);
      return json(200, { ...this.profil(neuf), session: this.ouvrir(k) });
    }
    if (chemin === 'orders' || chemin === 'delete') {
      const k = bearer !== null ? this.sessions.get(bearer) : undefined;
      const c = k !== undefined ? this.comptes.get(k) : undefined;
      if (k === undefined || c === undefined) return json(401, { ok: false, reason: 'no_session' });
      if (chemin === 'delete') {
        if (corps['currentPassword'] !== c.password) return json(401, { ok: false, reason: 'bad_password' });
        this.comptes.delete(k);
        this.commandes.delete(k);
        for (const [s, kk] of [...this.sessions]) if (kk === k) this.sessions.delete(s);
        return json(200, { ok: true });
      }
      const avant = this.commandes.get(k) ?? [];
      const neuves = ((corps['ajouter'] as { orderId: string; buyerRef: string }[] | undefined) ?? [])
        .filter((a) => !avant.some((b) => b.orderId === a.orderId))
        .map((a) => ({ orderId: a.orderId, buyerRef: a.buyerRef, at: '2026-09-24T08:00:00.000Z' }));
      const liste = [...neuves.reverse(), ...avant].slice(0, 50);
      this.commandes.set(k, liste);
      return json(200, { ok: true, commandes: liste });
    }
    if (chemin === 'profile') {
      const k = bearer !== null ? this.sessions.get(bearer) : undefined;
      const c = k !== undefined ? this.comptes.get(k) : undefined;
      if (k === undefined || c === undefined) return json(401, { ok: false, reason: 'no_session' });
      if ('phone' in corps) return json(400, { ok: false, reason: 'unknown_field', field: 'phone' });
      if (corps['newPassword'] !== undefined) {
        if (corps['currentPassword'] !== c.password) return json(401, { ok: false, reason: 'bad_password' });
        c.password = String(corps['newPassword']);
        for (const [s, kk] of [...this.sessions]) if (kk === k && s !== bearer) this.sessions.delete(s);
      }
      if (typeof corps['firstName'] === 'string') c.firstName = corps['firstName'];
      if (typeof corps['lastName'] === 'string') c.lastName = corps['lastName'];
      if (corps['email'] === '') delete c.email;
      else if (typeof corps['email'] === 'string') c.email = corps['email'];
      return json(200, this.profil(c));
    }
    return json(404, { ok: false, reason: 'not_found' });
  }
}

async function ouvrir(page: Page, livre: Livre, chemin = '/?/v/aicha-4821', avant?: () => Promise<void>): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message ?? e)));
  await page.route('**/api/s/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOUTIQUE) }));
  await page.route('**/api/buyer/**', (route) => livre.servir(route));
  await page.route('**/checkout/**', (route) => route.abort('failed'));
  if (avant !== undefined) await avant();
  await page.goto(chemin);
  return erreurs;
}

const boutique = (page: Page) => page.locator('[data-role="vitrine-identity"]');
const bande = (page: Page) => page.locator('[data-role="mon-compte"]');
const action = (page: Page, a: string) => page.locator(`[data-action="${a}"]`);
const champ = (page: Page, c: string) => page.locator(`[data-champ="${c}"]`);

async function sInscrire(page: Page, o: { prenom?: string; nom?: string; tel?: string; email?: string; mdp?: string } = {}) {
  await champ(page, 'firstName').fill(o.prenom ?? 'Awa');
  await champ(page, 'lastName').fill(o.nom ?? 'Ouédraogo');
  await champ(page, 'phone').pressSequentially(o.tel ?? '70123456');
  if (o.email !== undefined) await champ(page, 'email').fill(o.email);
  await champ(page, 'password').fill(o.mdp ?? 'grain-de-nere');
  await action(page, 'compte-inscrire').click();
}

test('the doors open on a real boutique link; « Continuer sans compte » opens her boutique and the tab remembers', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre);
  await expect(page.locator('[data-screen="compte-porte"]')).toBeVisible();
  for (const a of ['compte-vers-inscription', 'compte-vers-connexion', 'compte-invitee']) await expect(action(page, a)).toBeEnabled();
  await expect(page.locator('[data-screen="compte-porte"]')).toContainText('La vendeuse ne les voit pas');
  await action(page, 'compte-invitee').click();
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  await expect(bande(page)).toContainText('Se connecter');
  // The next step is reachable: a product tile carries her to the offer.
  await expect(page.locator('[data-action="produit"][data-pid="p1"]').first()).toBeVisible();
  // Opening the link again in the same tab does not ask again. (A reload on
  // Pages goes through the 404 restore to this same `?/v/` form; this preview
  // server has no restore for a deep path, so the walk opens that form itself.)
  await page.goto('/?/v/aicha-4821');
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  await expect(page.locator('[data-screen="compte-porte"]')).toHaveCount(0);
  // The guest changes her mind: the band opens the doors again.
  await bande(page).click();
  await expect(page.locator('[data-screen="compte-porte"]')).toBeVisible();
  expect(livre.appels, 'a guest sends nothing to the account book').toEqual([]);
  expect(erreurs).toEqual([]);
});

test('sign up: her five fields (email left out), then her boutique greets her by name, and her profile holds her infos', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre);
  await action(page, 'compte-vers-inscription').click();
  // A refusal before any request: an empty first name is said under its field.
  await champ(page, 'lastName').fill('Ouédraogo');
  await action(page, 'compte-inscrire').click();
  await expect(page.locator('[data-refus="firstName"]')).toBeVisible();
  expect(livre.appels).toEqual([]);
  await sInscrire(page);
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  await expect(bande(page)).toContainText('Awa');
  // The exact bytes the door got: her four fields, spaced number, no email key.
  expect(livre.appels).toEqual([{ chemin: 'signup', bearer: null, corps: { firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', password: 'grain-de-nere' } }]);
  // Her session lives in storage, never in the page.
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('sp-compte:v1') ?? '{}').session as string);
  expect(session).toMatch(/^SPC-/);
  expect(await page.content()).not.toContain(session);
  // Her profile: read from the service on her Bearer.
  await bande(page).click();
  const profil = page.locator('[data-screen="compte-profil"]');
  await expect(profil.locator('[data-info="firstName"]')).toHaveText('Awa');
  await expect(profil.locator('[data-info="lastName"]')).toHaveText('Ouédraogo');
  await expect(profil.locator('[data-info="phone"]')).toHaveText('70 12 34 56');
  await expect(profil.locator('[data-info="email"]')).toHaveText('Pas d’email');
  await expect(profil).toContainText('La vendeuse ne les voit pas');
  expect(livre.appels.filter((a) => a.chemin === 'profile').at(-1)).toEqual({ chemin: 'profile', bearer: session, corps: {} });
  await action(page, 'compte-boutique').click();
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  expect(await page.content()).not.toContain(session);
  expect(erreurs).toEqual([]);
});

test('a number that already has an account is sent to sign in, the number kept; a wrong password is one plain sentence', async ({ page }) => {
  const livre = new Livre();
  livre.comptes.set('70123456', { firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', password: 'grain-de-nere' });
  const erreurs = await ouvrir(page, livre);
  await action(page, 'compte-vers-inscription').click();
  await sInscrire(page, { prenom: 'Awa', mdp: 'un-autre-mot' });
  const alerte = page.locator('[data-role="compte-alerte"]');
  await expect(alerte).toContainText('Ce numéro a déjà un compte');
  await alerte.locator('[data-action="compte-vers-connexion"]').click();
  await expect(page.locator('[data-screen="compte-connexion"]')).toBeVisible();
  await expect(champ(page, 'phone')).toHaveValue('70 12 34 56');
  await champ(page, 'password').fill('pas-le-bon');
  await action(page, 'compte-connecter').click();
  await expect(alerte).toContainText('Le numéro ou le mot de passe ne va pas');
  // What she typed is still there; the button is pressable again.
  await expect(champ(page, 'phone')).toHaveValue('70 12 34 56');
  await expect(action(page, 'compte-connecter')).toBeEnabled();
  await champ(page, 'password').fill('grain-de-nere');
  await action(page, 'compte-connecter').click();
  await expect(bande(page)).toContainText('Awa');
  expect(livre.appels.filter((a) => a.chemin === 'login').map((a) => a.corps)).toEqual([
    { phone: '70 12 34 56', password: 'pas-le-bon' },
    { phone: '70 12 34 56', password: 'grain-de-nere' },
  ]);
  expect(erreurs).toEqual([]);
});

test('her profile: she edits her names and clears her email, never her number; the band follows her new name', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre);
  await action(page, 'compte-vers-inscription').click();
  await sInscrire(page, { email: 'awa@exemple.bf' });
  await bande(page).click();
  await expect(page.locator('[data-info="email"]')).toHaveText('awa@exemple.bf');
  await action(page, 'compte-vers-modifier').click();
  await expect(page.locator('[data-screen="compte-modifier"]')).toBeVisible();
  await expect(champ(page, 'phone')).toHaveCount(0);
  await expect(page.locator('[data-info="phone"]')).toHaveText('70 12 34 56');
  await champ(page, 'firstName').fill('Aïcha');
  await champ(page, 'email').fill('');
  await action(page, 'compte-enregistrer').click();
  await expect(page.locator('[data-role="compte-note"]')).toContainText('C’est enregistré');
  await expect(page.locator('[data-info="firstName"]')).toHaveText('Aïcha');
  await expect(page.locator('[data-info="email"]')).toHaveText('Pas d’email');
  expect(livre.appels.filter((a) => a.chemin === 'profile').at(-1)!.corps).toEqual({ firstName: 'Aïcha', lastName: 'Ouédraogo', email: '' });
  await action(page, 'compte-boutique').click();
  await expect(bande(page)).toContainText('Aïcha');
  expect(erreurs).toEqual([]);
});

test('a new password needs the old one; then she signs out and is a guest again', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre);
  await action(page, 'compte-vers-inscription').click();
  await sInscrire(page);
  await bande(page).click();
  await action(page, 'compte-vers-mot-de-passe').click();
  await champ(page, 'currentPassword').fill('pas-le-bon');
  await champ(page, 'newPassword').fill('nouveau-mot-long');
  await action(page, 'compte-changer-mdp').click();
  await expect(page.locator('[data-refus="currentPassword"]')).toContainText('Ce n’est pas votre mot de passe actuel');
  await champ(page, 'currentPassword').fill('grain-de-nere');
  await action(page, 'compte-changer-mdp').click();
  await expect(page.locator('[data-role="compte-note"]')).toContainText('Mot de passe changé');
  expect(livre.comptes.get('70123456')!.password).toBe('nouveau-mot-long');
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('sp-compte:v1') ?? '{}').session as string);
  await action(page, 'compte-deconnecter').click();
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  await expect(bande(page)).toContainText('Se connecter');
  expect(await page.evaluate(() => localStorage.getItem('sp-compte:v1'))).toBeNull();
  await expect.poll(() => livre.appels.at(-1)).toEqual({ chemin: 'logout', bearer: session, corps: {} });
  expect(livre.sessions.has(session)).toBe(false);
  expect(erreurs).toEqual([]);
});

test('no network: she is told the connection cut, nothing she typed is lost, and she presses again when it returns', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre);
  await action(page, 'compte-vers-inscription').click();
  livre.horsLigne = true;
  await sInscrire(page);
  await expect(page.locator('[data-role="compte-alerte"]')).toContainText('La connexion a coupé');
  await expect(champ(page, 'firstName')).toHaveValue('Awa');
  await expect(action(page, 'compte-inscrire')).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('sp-compte:v1'))).toBeNull();
  livre.horsLigne = false;
  await action(page, 'compte-inscrire').click();
  await expect(bande(page)).toContainText('Awa');
  expect(erreurs).toEqual([]);
});

test('a session the service no longer knows: her profile asks her to sign in again, and she gets back in', async ({ page }) => {
  const livre = new Livre();
  livre.comptes.set('70123456', { firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', password: 'grain-de-nere' });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded') === null) {
      localStorage.setItem('sp-compte:v1', JSON.stringify({ session: 'SPC-ZZZZ-ZZZZ-ZZZZ-ZZZZ', prenom: 'Awa' }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  const erreurs = await ouvrir(page, livre);
  // Signed in on this phone: no doors, her boutique, her name on the band.
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  await bande(page).click();
  await expect(page.locator('[data-screen="compte-connexion"]')).toBeVisible();
  await expect(page.locator('[data-role="compte-note"]')).toContainText('connectez-vous à nouveau');
  expect(await page.evaluate(() => localStorage.getItem('sp-compte:v1'))).toBeNull();
  await champ(page, 'phone').pressSequentially('70123456');
  await champ(page, 'password').fill('grain-de-nere');
  await action(page, 'compte-connecter').click();
  await expect(bande(page)).toContainText('Awa');
  expect(erreurs).toEqual([]);
});

test('no doors on a signed product link, on the reseller\'s own previews, or on the harness', async ({ page }) => {
  const livre = new Livre();
  await ouvrir(page, livre, '/?/s/aicha-4821&pid=p1');
  await expect(page.locator('[data-screen="C1"]')).toBeVisible();
  await expect(page.locator('[data-screen="compte-porte"]')).toHaveCount(0);
  await page.goto('/?/v/aicha-4821&entete=classique&apercu-nu=1');
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  await expect(page.locator('[data-screen="compte-porte"]')).toHaveCount(0);
  await expect(bande(page)).toHaveCount(0);
  await page.goto('/?demo-vitrine=aicha-4821');
  await expect(page.locator('[data-screen="vitrine"]')).toBeVisible();
  await expect(page.locator('[data-screen="compte-porte"]')).toHaveCount(0);
  expect(livre.appels).toEqual([]);
});

test('her profile when the service refuses: said plainly (not « no network »), and « Réessayer » reads it again', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre);
  await action(page, 'compte-vers-inscription').click();
  await sInscrire(page);
  let refuser = true;
  await page.route('**/api/buyer/profile', (route) =>
    refuser
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'accounts_unavailable' }) })
      : livre.servir(route));
  await bande(page).click();
  await expect(page.locator('[data-role="compte-indisponible"]')).toContainText('Ça n’a pas marché');
  await expect(page.locator('[data-role="compte-hors-ligne"]')).toHaveCount(0);
  refuser = false;
  await action(page, 'compte-relire').click();
  await expect(page.locator('[data-info="firstName"]')).toHaveText('Awa');
  expect(erreurs).toEqual([]);
});

/**
 * VERIFIER BLOCKER 1 — a phone that will not let the page keep anything (a
 * WebView with storage off, a store that throws). The choice she makes must
 * still carry her through: the doors may never become a wall.
 */
for (const [nom, bloquer] of [
  ['every write refused', () => {
    Storage.prototype.setItem = () => { throw new DOMException('refusé', 'QuotaExceededError'); };
  }],
  ['the stores unreachable', () => {
    for (const k of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, k, { configurable: true, get() { throw new DOMException('refusé', 'SecurityError'); } });
    }
  }],
] as const) {
  test(`storage blocked (${nom}): « Continuer sans compte » opens the boutique, and a new account greets her and opens her profile`, async ({ page }) => {
    const livre = new Livre();
    await page.addInitScript(bloquer);
    const erreurs = await ouvrir(page, livre);
    await action(page, 'compte-invitee').click();
    await expect(boutique(page)).toContainText('Chez Aïcha Mode');
    await expect(bande(page)).toContainText('Se connecter');
    await bande(page).click();
    await action(page, 'compte-vers-inscription').click();
    await sInscrire(page);
    await expect(boutique(page)).toContainText('Chez Aïcha Mode');
    await expect(bande(page)).toContainText('Awa');
    await bande(page).click();
    await expect(page.locator('[data-info="firstName"]')).toHaveText('Awa');
    expect(livre.appels.filter((a) => a.chemin === 'signup')).toHaveLength(1);
    await action(page, 'compte-deconnecter').click();
    await expect(bande(page)).toContainText('Se connecter');
    expect(erreurs).toEqual([]);
  });
}

/* ═══ COMPTE-CLIENTE-2 — the open items, walked (founder « fix the ones still open ») ═══ */

const BUYER_REF = 'ref-compte2-e2e';

/** The checkout's service, scripted as checkout-real.spec scripts it: one full
 *  quote, a hold, an order whose create carries her read token. */
async function caisse(page: Page): Promise<{ commandes: string[] }> {
  const vu = { commandes: [] as string[] };
  await page.route('**/checkout/**', async (route) => {
    const req = route.request();
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const corps = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    if (/\/reserve$/.test(req.url())) return json(200, { status: 'reserved', reservationId: 'res-1' });
    if (/\/checkout\/order$/.test(req.url()) && req.method() === 'POST') {
      const orderId = `ord-${String(corps['quoteId'])}`;
      vu.commandes.push(orderId);
      return json(200, { orderId, state: 'payment_pending', amountPaidAtCheckout: 13_000, amountDueAtDelivery: 0, doorLeg: 'none', buyerRef: BUYER_REF });
    }
    if (/\/checkout\/order\/[^/]+$/.test(req.url()) && req.method() === 'GET') {
      return json(200, { orderId: decodeURIComponent(req.url().split('/').pop()!), state: 'payment_pending', amountPaidAtCheckout: 13_000, amountDueAtDelivery: 0, doorLeg: 'none' });
    }
    if (/\/remise$/.test(req.url())) return json(404, { ok: false });
    if (corps['paymentMode'] === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') return json(422, { error: 'pay_at_door_not_eligible' });
    return json(200, {
      quoteId: 'quote-compte2-1', paymentMode: 'FULL_PREPAY', productSubtotal: 12_000, deliveryFee: 1_000, buyerTotal: 13_000,
      amountPaidAtCheckout: 13_000, amountDueAtDelivery: 0, expiry: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
  });
  return vu;
}

/** She is signed in on this phone: the book knows her session, the phone keeps it. */
async function dejaConnectee(page: Page, livre: Livre, telephone = '70 12 34 56'): Promise<void> {
  livre.comptes.set('70123456', { firstName: 'Awa', lastName: 'Ouédraogo', phone: telephone, password: 'grain-de-nere' });
  livre.sessions.set('SPC-AWAA-AWAA-AWAA-AWAA', '70123456');
  await page.addInitScript((tel) => {
    if (sessionStorage.getItem('graine') === null) {
      localStorage.setItem('sp-compte:v1', JSON.stringify({ session: 'SPC-AWAA-AWAA-AWAA-AWAA', prenom: 'Awa', telephone: tel }));
      sessionStorage.setItem('graine', '1');
    }
  }, telephone);
}

test('the doors greet her by the boutique she opened — and that boutique is read ONCE for both', async ({ page }) => {
  const livre = new Livre();
  let lectures = 0;
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
    await page.route('**/api/s/**', (route) => {
      lectures += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOUTIQUE) });
    });
  });
  // « Chez Aïcha Mode » is greeted « Bienvenue chez Aïcha Mode », never « chez Chez ».
  await expect(page.locator('[data-role="compte-porte-titre"]')).toHaveText('Bienvenue chez Aïcha Mode');
  await action(page, 'compte-invitee').click();
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  expect(lectures).toBe(1);
  expect(erreurs).toEqual([]);
});

test('a forgotten password: « Mot de passe oublié ? » → the founder\'s code, typed as she heard it → her names and a new password → in, clean, and the old password dead', async ({ page }) => {
  const livre = new Livre();
  livre.comptes.set('70123456', { firstName: 'Intrus', lastName: 'Inconnu', email: 'intrus@exemple.bf', phone: '70 12 34 56', password: 'grain-de-nere' });
  livre.commandes.set('70123456', [{ orderId: 'ord-intrus', buyerRef: 'REF-INTRUS', at: '2026-09-24T08:00:00.000Z' }]);
  const erreurs = await ouvrir(page, livre);
  await action(page, 'compte-vers-connexion').click();
  await champ(page, 'phone').pressSequentially('70123456');
  await champ(page, 'password').fill('je-ne-sais-plus');
  await action(page, 'compte-connecter').click();
  await expect(page.locator('[data-role="compte-alerte"]')).toContainText('ne va pas');
  await action(page, 'compte-vers-recuperation').click();
  await expect(page.locator('[data-screen="compte-recuperation"]')).toContainText('L’équipe vous appelle sur votre numéro');
  await expect(page.locator('[data-role="compte-recup-neuf"]')).toContainText('Votre compte recommence à neuf');
  await expect(champ(page, 'phone')).toHaveValue('70 12 34 56');
  // The founder minted her code on his console and read it to her on the phone.
  livre.codes.set('70123456', 'SPR-ABCD-EFGH-IJKL-MNOP');
  await champ(page, 'code').fill('SPR-XXXX-XXXX-XXXX-XXXX');
  await champ(page, 'firstName').fill('Aïcha');
  await champ(page, 'lastName').fill('Kaboré');
  await champ(page, 'newPassword').fill('karite-du-soir-8');
  await action(page, 'compte-recuperer').click();
  await expect(page.locator('[data-refus="code"]')).toContainText('Ce code ne marche pas');
  // As she heard it: lower case, spaces, no « SPR ».
  await champ(page, 'code').fill('abcd efgh ijkl mnop');
  await action(page, 'compte-recuperer').click();
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  await expect(bande(page)).toContainText('Aïcha');
  expect(livre.comptes.get('70123456')).toMatchObject({ firstName: 'Aïcha', lastName: 'Kaboré', password: 'karite-du-soir-8' });
  expect(livre.comptes.get('70123456')!.email).toBeUndefined();
  expect(livre.commandes.has('70123456')).toBe(false);
  expect(livre.codes.has('70123456')).toBe(false);
  expect(erreurs).toEqual([]);
});

test('« Garder mon compte ouvert » unticked: signed in for this tab only — nothing lasting on the phone', async ({ page }) => {
  const livre = new Livre();
  livre.comptes.set('70123456', { firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', password: 'grain-de-nere' });
  const erreurs = await ouvrir(page, livre);
  await action(page, 'compte-vers-connexion').click();
  await champ(page, 'phone').pressSequentially('70123456');
  await champ(page, 'password').fill('grain-de-nere');
  await expect(page.locator('[data-role="compte-rester"]')).toBeChecked();
  await page.locator('[data-role="compte-rester"]').uncheck();
  await action(page, 'compte-connecter').click();
  await expect(bande(page)).toContainText('Awa');
  expect(await page.evaluate(() => localStorage.getItem('sp-compte:v1'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('sp-compte:v1') ?? '{}').prenom)).toBe('Awa');
  await bande(page).click();
  await expect(page.locator('[data-info="firstName"]')).toHaveText('Awa');
  expect(erreurs).toEqual([]);
});

test('« Mes commandes »: her orders from any phone, newest first — a tap opens its tracking; her read token never reaches the page', async ({ page }) => {
  const livre = new Livre();
  await dejaConnectee(page, livre);
  livre.commandes.set('70123456', [
    { orderId: 'ord-quote-2', buyerRef: 'REF-SECRETE-2', at: '2026-09-23T10:00:00.000Z' },
    { orderId: 'ord-quote-1', buyerRef: 'REF-SECRETE-1', at: '2026-09-20T10:00:00.000Z' },
  ]);
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => { await caisse(page); });
  await bande(page).click();
  const lignes = page.locator('[data-action="compte-suivre"]');
  await expect(lignes).toHaveCount(2);
  await expect(lignes.nth(0)).toContainText('Commande du 23/09/2026');
  // SUIVI-REFERENCE — the same short reference the tracking shows.
  await expect(lignes.nth(0)).toContainText('Réf. QUOTE2');
  await expect(lignes.nth(0)).not.toContainText('ord-quote');
  expect(await page.content()).not.toContain('REF-SECRETE');
  await lignes.nth(1).click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  // The row and the tracking it opens say the same reference.
  await expect(page.locator('[data-screen="C7"] .cl-cmd')).toHaveText('Réf. QUOTE1');
  expect(erreurs).toEqual([]);
});

test('« Supprimer mon compte »: her password first; then she is a guest, and the book holds nothing of her', async ({ page }) => {
  const livre = new Livre();
  await dejaConnectee(page, livre);
  const erreurs = await ouvrir(page, livre);
  await bande(page).click();
  await action(page, 'compte-vers-supprimer').click();
  await expect(page.locator('[data-screen="compte-supprimer"]')).toContainText('seront livrées');
  await champ(page, 'currentPassword').fill('pas-le-bon');
  await action(page, 'compte-supprimer').click();
  await expect(page.locator('[data-refus="currentPassword"]')).toContainText('Ce n’est pas votre mot de passe actuel');
  expect(livre.comptes.has('70123456')).toBe(true);
  await champ(page, 'currentPassword').fill('grain-de-nere');
  await action(page, 'compte-supprimer').click();
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  await expect(bande(page)).toContainText('Se connecter');
  expect(livre.comptes.has('70123456')).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('sp-compte:v1'))).toBeNull();
  expect(erreurs).toEqual([]);
});

test('on the payment pages: her number is filled, « Mon compte » opens OVER the payment and leaves it exactly as it was, and the order joins « Mes commandes »', async ({ page }) => {
  const livre = new Livre();
  await dejaConnectee(page, livre);
  let vu: { commandes: string[] } = { commandes: [] };
  const erreurs = await ouvrir(page, livre, '/?/s/aicha-4821&pid=p1', async () => { vu = await caisse(page); });
  await expect(page.locator('[data-screen="C1"]')).toBeVisible();
  await expect(bande(page)).toContainText('Awa');
  await expect(page.locator('[data-screen="compte-porte"]')).toHaveCount(0);
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await expect(page.locator('[data-role="phone"]')).toHaveValue('70 12 34 56');
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  // Her account, OVER the payment in progress.
  await bande(page).click();
  const calque = page.locator('[data-role="compte-voile"]');
  await expect(calque.locator('[data-info="firstName"]')).toHaveText('Awa');
  await expect(page.locator('[data-screen="C3"]')).toHaveCount(1);
  await calque.locator('[data-action="compte-boutique"]').click();
  await expect(calque).toHaveCount(0);
  await expect(page.locator('[data-role="repere"]')).toHaveValue('Face à la pharmacie du marché');
  await expect(page.locator('[data-role="phone"]')).toHaveValue('70 12 34 56');
  await page.locator('[data-action="continuer-c3"]').click();
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="continuer-c4"]').click();
  await page.locator('[data-screen="C5"]').waitFor();
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect.poll(() => vu.commandes.length).toBe(1);
  await expect.poll(() => livre.commandes.get('70123456')?.map((c) => [c.orderId, c.buyerRef])).toEqual([[vu.commandes[0], BUYER_REF]]);
  expect(erreurs).toEqual([]);
});

test('Android « Retour » on « Mon compte » over the payment closes the layer — never the payment under it', async ({ page }) => {
  const livre = new Livre();
  await dejaConnectee(page, livre);
  const erreurs = await ouvrir(page, livre, '/?/s/aicha-4821&pid=p1', async () => { await caisse(page); });
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  const url = page.url();
  await bande(page).click();
  await expect(page.locator('[data-role="compte-voile"]')).toHaveCount(1);
  await page.goBack();
  await expect(page.locator('[data-role="compte-voile"]')).toHaveCount(0);
  expect(page.url()).toBe(url);
  await expect(page.locator('[data-screen="C3"]')).toHaveCount(1);
  await expect(page.locator('[data-role="repere"]')).toHaveValue('Face à la pharmacie du marché');
  // Closed by its own button, the layer takes its history entry back: one
  // more Back is then the page's own, not a dead press.
  await bande(page).click();
  await page.locator('[data-role="compte-voile"] [data-action="compte-boutique"]').click();
  await expect(page.locator('[data-role="compte-voile"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window.history.state as { compteCalque?: boolean } | null)?.compteCalque ?? false)).toBe(false);
  expect(erreurs).toEqual([]);
});

test('signed in OVER the payment page, her number is there when she reaches the address screen', async ({ page }) => {
  const livre = new Livre();
  livre.comptes.set('70123456', { firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', password: 'grain-de-nere' });
  const erreurs = await ouvrir(page, livre, '/?/s/aicha-4821&pid=p1', async () => { await caisse(page); });
  await expect(page.locator('[data-screen="C1"]')).toBeVisible();
  await bande(page).click();
  const calque = page.locator('[data-role="compte-voile"]');
  await calque.locator('[data-action="compte-vers-connexion"]').click();
  await calque.locator('[data-champ="phone"]').pressSequentially('70123456');
  await calque.locator('[data-champ="password"]').fill('grain-de-nere');
  await calque.locator('[data-action="compte-connecter"]').click();
  await expect(calque).toHaveCount(0);
  await expect(bande(page)).toContainText('Awa');
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await expect(page.locator('[data-role="phone"]')).toHaveValue('70 12 34 56');
  expect(erreurs).toEqual([]);
});

test('a guest on the payment pages: « Se connecter » opens the doors over the page, and « Continuer sans compte » closes them onto it', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre, '/?/s/aicha-4821&pid=p1');
  await expect(page.locator('[data-screen="C1"]')).toBeVisible();
  await expect(bande(page)).toContainText('Se connecter');
  await bande(page).click();
  const calque = page.locator('[data-role="compte-voile"]');
  await expect(calque.locator('[data-screen="compte-porte"]')).toBeVisible();
  await calque.locator('[data-action="compte-invitee"]').click();
  await expect(calque).toHaveCount(0);
  await expect(page.locator('[data-screen="C1"]')).toBeVisible();
  expect(livre.appels).toEqual([]);
  expect(erreurs).toEqual([]);
});


/** Her boutique with two articles, for a panier. */
const BOUTIQUE_DEUX = {
  ...BOUTIQUE,
  curatedItems: ['p1', 'p2'],
  products: [...BOUTIQUE.products, { pid: 'p2', name: 'Sac en cuir tressé', priceFcfa: 20_000, inStock: true, assetRefs: [] }],
};
const FIG_PANIER: Record<string, { produit: number; frais: number }> = { p1: { produit: 12_000, frais: 1_000 }, p2: { produit: 20_000, frais: 1_000 } };

/** The grouped payment's service, scripted as panier-payer.spec scripts it:
 *  a quote per article, a hold each, ONE group whose create carries each
 *  article's order and read token. */
async function caissePanier(page: Page): Promise<{ groupes: number }> {
  const vu = { groupes: 0 };
  await page.route('**/api/s/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOUTIQUE_DEUX) }));
  await page.route('**/checkout/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const corps = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
    const expiry = new Date(Date.now() + 15 * 60_000).toISOString();
    if (/\/reserve$/.test(url)) return json(200, { status: 'reserved', expiresAt: expiry });
    const vue = (state: string, ids: string[]) => {
      const articles = ids.map((id) => {
        const f = FIG_PANIER[id.split('-')[1]!]!;
        return { orderId: `ord-${id}`, state, amountPaidAtCheckout: f.produit + f.frais, amountDueAtDelivery: 0, doorLeg: 'none' };
      });
      return {
        groupId: 'grp-compte2', state, paymentMode: 'FULL_PREPAY',
        amountPaidAtCheckout: articles.reduce((s, a) => s + a.amountPaidAtCheckout, 0), amountDueAtDelivery: 0, deliveryTotal: 2_000, articles,
      };
    };
    if (/\/checkout\/group\/price$/.test(url)) {
      const ids = corps['quoteIds'] as string[];
      const produit = ids.reduce((s, id) => s + FIG_PANIER[id.split('-')[1]!]!.produit, 0);
      return json(200, { paymentMode: 'FULL_PREPAY', articles: ids.length, amountPaidAtCheckout: produit + 2_000, amountDueAtDelivery: 0, deliveryTotal: 2_000, productTotal: produit });
    }
    if (/\/checkout\/group$/.test(url) && req.method() === 'POST') {
      vu.groupes += 1;
      const v = vue('payment_pending', corps['quoteIds'] as string[]);
      return json(200, { ...v, commandes: v.articles.map((a, i) => ({ orderId: a.orderId, buyerRef: `${BUYER_REF}-${i}` })) });
    }
    if (/\/checkout\/group\/[^/]+$/.test(url) && req.method() === 'GET') return json(200, vue('payment_pending', ['q-p1-A', 'q-p2-A']));
    if (/\/remise$/.test(url)) return json(404, { ok: false });
    if (corps['paymentMode'] === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR') return json(422, { error: 'pay_at_door_not_eligible' });
    const pid = String(corps['pid']);
    const f = FIG_PANIER[pid]!;
    return json(200, {
      quoteId: `q-${pid}-A`, paymentMode: 'FULL_PREPAY', productSubtotal: f.produit, deliveryFee: f.frais, buyerTotal: f.produit + f.frais,
      amountPaidAtCheckout: f.produit + f.frais, amountDueAtDelivery: 0, expiry,
    });
  });
  return vu;
}

test('a basket paid while signed in: her number is filled, and every article joins « Mes commandes »', async ({ page }) => {
  const livre = new Livre();
  await dejaConnectee(page, livre);
  let vu = { groupes: 0 };
  const erreurs = await ouvrir(page, livre, '/?/s/aicha-4821&panier=p1,p2', async () => { vu = await caissePanier(page); });
  await expect(page.locator('[data-screen="C1"][data-panier]')).toBeVisible();
  await expect(bande(page)).toContainText('Awa');
  await page.locator('[data-action="commander"]').click();
  await page.locator('[data-screen="C3"]').waitFor();
  await expect(page.locator('[data-role="phone"]')).toHaveValue('70 12 34 56');
  await page.locator('[data-action="zone"][data-zone="Gounghin"]').click();
  await page.locator('[data-role="repere"]').fill('Face à la pharmacie du marché');
  await page.locator('[data-action="continuer-c3"]').click();
  await page.locator('[data-screen="C4"]').waitFor({ timeout: 15_000 });
  await page.locator('[data-action="continuer-c4"]').click();
  await page.locator('[data-screen="C5"]').waitFor();
  await page.locator('[data-action="choix-paiement"][data-mode="A"]').click();
  await page.locator('[data-action="payer"]').click();
  await expect.poll(() => vu.groupes).toBe(1);
  // Both articles, each with its own read token — once each, and in the book only.
  await expect.poll(() => livre.commandes.get('70123456')?.map((c) => [c.orderId, c.buyerRef]).sort()).toEqual([
    ['ord-q-p1-A', `${BUYER_REF}-0`],
    ['ord-q-p2-A', `${BUYER_REF}-1`],
  ]);
  expect(livre.appels.filter((a) => a.chemin === 'orders' && a.corps['ajouter'] !== undefined).flatMap((a) => a.corps['ajouter'] as unknown[])).toHaveLength(2);
  expect(await page.content()).not.toContain(BUYER_REF);
  expect(erreurs).toEqual([]);
});


/* ═══ PORTE-BELLE — the doors wear her boutique (founder: « very beautiful, and more structured ») ═══ */

test('PORTE-BELLE — the doors wear her boutique: her monogram, « Vendeuse vérifiée · » her city, her habillage — then three true reasons and the doors in order', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
    await page.route('**/api/s/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...BOUTIQUE, theme: 'foret' }) }));
  });
  const tete = page.locator('[data-role="porte-tete"]');
  await expect(tete).toHaveAttribute('data-etat', 'boutique');
  await expect(page.locator('[data-role="porte-avatar"]')).toHaveText('A');
  await expect(page.locator('[data-role="porte-verifiee"]')).toHaveText('Vendeuse vérifiée · Ouagadougou');
  await expect(page.locator('[data-role="compte-porte-titre"]')).toHaveText('Bienvenue chez Aïcha Mode');
  // Her habillage reached the doors (the boutique's own theme key) — a state, not a colour.
  await expect(page.locator('[data-screen="compte-porte"]')).toHaveClass(/vt-theme-foret/);
  await expect(page.locator('.porte-atout')).toHaveCount(3);
  // One primary, and every door pressable, in the order she reads them.
  await expect(page.locator('[data-screen="compte-porte"] .primary-action')).toHaveCount(1);
  for (const a of ['compte-vers-inscription', 'compte-vers-connexion', 'compte-invitee']) await expect(action(page, a)).toBeEnabled();
  await action(page, 'compte-invitee').click();
  await expect(boutique(page)).toContainText('Chez Aïcha Mode');
  expect(erreurs).toEqual([]);
});

test('PORTE-BELLE — while her boutique is still being read, the doors already work; when it lands, the head fills in', async ({ page }) => {
  const livre = new Livre();
  let lacher: (() => void) | undefined;
  const lachee = new Promise<void>((r) => { lacher = r; });
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
    await page.route('**/api/s/**', async (route) => {
      await lachee;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOUTIQUE) });
    });
  });
  const tete = page.locator('[data-role="porte-tete"]');
  await expect(tete).toHaveAttribute('data-etat', 'attente');
  await expect(page.locator('[data-role="compte-porte-titre"]')).toHaveText('Bienvenue');
  // The doors did not wait for the read: « Créer mon compte » opens the form now.
  await action(page, 'compte-vers-inscription').click();
  await expect(page.locator('[data-screen="compte-inscription"]')).toBeVisible();
  await action(page, 'compte-vers-porte').click();
  await expect(tete).toHaveAttribute('data-etat', 'attente');
  lacher!();
  await expect(tete).toHaveAttribute('data-etat', 'boutique');
  await expect(page.locator('[data-role="compte-porte-titre"]')).toHaveText('Bienvenue chez Aïcha Mode');
  expect(erreurs).toEqual([]);
});

test('PORTE-BELLE — no boutique behind the doors: the plain Shop+ welcome, and the doors still work', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
    await page.route('**/api/s/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) }));
  });
  const tete = page.locator('[data-role="porte-tete"]');
  await expect(tete).toHaveAttribute('data-etat', 'shop');
  await expect(page.locator('[data-role="compte-porte-titre"]')).toHaveText('Bienvenue sur Shop+');
  await action(page, 'compte-vers-connexion').click();
  await expect(page.locator('[data-screen="compte-connexion"]')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('PORTE-BELLE — a boutique read that FAILS (no network): the plain Shop+ welcome, and « Continuer sans compte » still answers', async ({ page }) => {
  const livre = new Livre();
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
    await page.route('**/api/s/**', (route) => route.abort('internetdisconnected'));
  });
  const tete = page.locator('[data-role="porte-tete"]');
  await expect(tete).toHaveAttribute('data-etat', 'shop');
  await expect(page.locator('[data-role="compte-porte-titre"]')).toHaveText('Bienvenue sur Shop+');
  await action(page, 'compte-invitee').click();
  await expect(page.locator('[data-screen="compte-porte"]')).toHaveCount(0);
  expect(erreurs).toEqual([]);
});

test('PORTE-BELLE — « Ma commande » says « Suivre », never the order\'s code, and still opens its tracking', async ({ page }) => {
  const livre = new Livre();
  await page.addInitScript(() => {
    localStorage.setItem('sp-commande:v1', JSON.stringify({ orderId: 'ord-quote-8ef5bb44-41fd-4f73', buyerRef: 'REF-BANDE', at: '2026-09-24T08:00:00.000Z' }));
  });
  // BANDE-PAYEE — the band stands for an order the service says she paid.
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
    await lectures(page, { 'ord-quote-8ef5bb44-41fd-4f73': 'confirmed' });
  });
  const bandeCommande = page.locator('[data-role="ma-commande"]');
  await expect(bandeCommande).toContainText('Ma commande');
  await expect(page.locator('[data-role="ma-commande-suivre"]')).toHaveText('Suivre');
  await expect(bandeCommande).not.toContainText('ord-quote');
  await bandeCommande.click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  expect(erreurs).toEqual([]);
});


/* ═══ SUIVI-REFERENCE — the founder's report (2026-09-24): « When I tap suivre ma commande I see this » ═══
 * His screenshot: the tracking opened from « Suivre », « Le suivi » crushed onto
 * two lines, and the raw order code « ord-quote-8ef5bb44-41fd-4f73-b751-
 * 92db27a7f877 » in a pill running off the right edge of the phone. Written
 * RED first, on his exact code. The width check is the SCREEN-FIT law's own
 * (founder, 2026-07-22: zero horizontal overflow on a 360px phone) — the
 * existing SCREEN-FIT walk only ever fed this screen a short demo code. */
for (const largeurTel of [360, 390]) {
  test(`SUIVI-REFERENCE — « Suivre » opens a tracking that fits a ${largeurTel}px phone, with a reference she can read out, not the raw code`, async ({ page }) => {
    await page.setViewportSize({ width: largeurTel, height: 800 });
    const livre = new Livre();
    await page.addInitScript(() => {
      localStorage.setItem('sp-commande:v1', JSON.stringify({ orderId: 'ord-quote-8ef5bb44-41fd-4f73-b751-92db27a7f877', buyerRef: 'REF-SUIVI', at: '2026-09-24T08:00:00.000Z' }));
    });
    const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
      await lectures(page, { 'ord-quote-8ef5bb44-41fd-4f73-b751-92db27a7f877': 'confirmed' });
    });
    await page.locator('[data-role="ma-commande"]').click();
    await expect(page.locator('[data-screen="C7"]')).toBeVisible();
    const reference = page.locator('[data-screen="C7"] .cl-cmd');
    await expect(reference).toHaveText('Réf. A7F877');
    await expect(page.locator('[data-screen="C7"]')).not.toContainText('ord-quote');
    expect(await page.content()).not.toContain('REF-SUIVI');
    const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largeur, `the tracking overflows a ${largeurTel}px phone (scrollWidth ${largeur})`).toBeLessThanOrEqual(largeurTel);
    expect(erreurs).toEqual([]);
  });
}

/* ═══ BANDE-PAYEE — the founder's report (2026-09-24): « I did not submit any commande why is there a suivre ma commande » ═══
 * The order is created — and kept on the phone — the moment she taps
 * « Payer », before any operator has said a word. His phone kept one that was
 * never paid, and every page then wore « Ma commande · Suivre » for it, opening
 * a tracking that said « Nous avons bien reçu votre commande ». A band is a
 * promise that she HAS an order, so it now waits for the service's word. Written
 * RED first. The same holds for the panier's band, the twin of this one. */

const COMMANDE_KEPT = { orderId: 'ord-quote-8ef5bb44-41fd-4f73-b751-92db27a7f877', buyerRef: 'REF-BANDE-PAYEE', at: '2026-09-24T08:00:00.000Z' };
const PANIER_KEPT = {
  groupId: 'grp-bande-1', holderRef: 'HOLD-BANDE', at: '2026-09-24T08:00:00.000Z', slug: 'aicha-4821',
  articles: [
    { orderId: 'ord-q-p1-A', buyerRef: 'REF-P1', nom: 'Bazin riche brodé', pid: 'p1' },
    { orderId: 'ord-q-p2-A', buyerRef: 'REF-P2', nom: 'Pagne tissé', pid: 'p2' },
  ],
};

/** The order reads, as the service answers them: one state per order id, or no answer at all. */
async function lectures(page: Page, etats: Record<string, string | null>): Promise<string[]> {
  const lus: string[] = [];
  await page.route('**/checkout/order/**', (route) => {
    const url = route.request().url();
    if (/\/remise$/.test(url)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
    const id = decodeURIComponent(url.split('/').pop()!);
    lus.push(id);
    const etat = etats[id];
    if (etat === null || etat === undefined) return route.abort('internetdisconnected');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orderId: id, state: etat, amountPaidAtCheckout: 13_000, amountDueAtDelivery: 0, doorLeg: 'none' }) });
  });
  return lus;
}

const garde = (page: Page, cle: string) => page.evaluate((k) => localStorage.getItem(k), cle);

for (const [etat, oublie] of [['payment_pending', false], ['payment_failed', true], ['cancelled', true], [null, false]] as const) {
  test(`BANDE-PAYEE — an order the service says is ${etat ?? 'unreachable'}: no « Ma commande » band${oublie ? ', and the phone forgets it' : ', and the phone keeps it for the next visit'}`, async ({ page }) => {
    const livre = new Livre();
    await page.addInitScript((c) => localStorage.setItem('sp-commande:v1', JSON.stringify(c)), COMMANDE_KEPT);
    let lus: string[] = [];
    const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
      lus = await lectures(page, { [COMMANDE_KEPT.orderId]: etat });
    });
    await expect(page.locator('[data-screen="compte-porte"]')).toBeVisible();
    await expect(page.locator('[data-role="ma-commande"]'), 'a band for an order nobody paid').toHaveCount(0, { timeout: 2_000 });
    // It asked the service — and after the answer landed, still no band.
    await expect.poll(() => lus.length).toBeGreaterThan(0);
    if (oublie) await expect.poll(() => garde(page, 'sp-commande:v1')).toBeNull();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-role="ma-commande"]')).toHaveCount(0);
    if (!oublie) expect(await garde(page, 'sp-commande:v1')).toContain(COMMANDE_KEPT.orderId);
    expect(erreurs).toEqual([]);
  });
}

test('BANDE-PAYEE — an order the service says is paid: the band stands, opens its tracking, and a later visit with no network still shows it', async ({ page }) => {
  const livre = new Livre();
  await page.addInitScript((c) => {
    if (sessionStorage.getItem('bande-payee-seme') === null) {
      localStorage.setItem('sp-commande:v1', JSON.stringify(c));
      sessionStorage.setItem('bande-payee-seme', '1');
    }
  }, COMMANDE_KEPT);
  let lus: string[] = [];
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
    lus = await lectures(page, { [COMMANDE_KEPT.orderId]: 'confirmed' });
  });
  const bandeCommande = page.locator('[data-role="ma-commande"]');
  await expect(bandeCommande).toContainText('Ma commande');
  await expect(bandeCommande).toContainText('Suivre');
  expect(lus).toContain(COMMANDE_KEPT.orderId);

  // The next visit, offline: the phone already heard « paid » — the band
  // stands without asking, as it always did for a paid order.
  await expect.poll(() => garde(page, 'sp-commande:v1')).toContain('"payee":true');
  await page.unroute('**/checkout/order/**');
  await page.route('**/checkout/**', (route) => route.abort('internetdisconnected'));
  // The link reopened as the deploy's 404 page restores it (the preview server
  // has no Pages fallback, so a bare reload of the rewritten path is a 404).
  const demandes: string[] = [];
  page.on('request', (req) => { if (req.url().includes('/checkout/order/')) demandes.push(req.url()); });
  await page.goto('/?/v/aicha-4821');
  await expect(bandeCommande).toContainText('Suivre');
  expect(demandes, 'a paid order already known asks the service again').toEqual([]);
  await bandeCommande.click();
  await expect(page.locator('[data-screen="C7"]')).toBeVisible();
  expect(await page.content()).not.toContain('REF-BANDE-PAYEE');
  expect(erreurs).toEqual([]);
});

for (const [etat, visible, oublie] of [['payment_pending', false, false], ['payment_failed', false, true], ['cancelled', false, true], ['confirmed', true, false]] as const) {
  test(`BANDE-PAYEE — the panier's band follows the same rule: its payment ${etat} ⇒ ${visible ? 'the band, still there offline on the next visit' : oublie ? 'no band, and the phone forgets it' : 'no band, the record kept'}`, async ({ page }) => {
    const livre = new Livre();
    await page.addInitScript((p) => {
      if (sessionStorage.getItem('panier-seme') === null) {
        localStorage.setItem('sp-panier-paye:v1', JSON.stringify(p));
        sessionStorage.setItem('panier-seme', '1');
      }
    }, PANIER_KEPT);
    let lus: string[] = [];
    const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
      lus = await lectures(page, { 'ord-q-p1-A': etat, 'ord-q-p2-A': etat });
    });
    await expect(page.locator('[data-screen="compte-porte"]')).toBeVisible();
    const bandePanier = page.locator('[data-role="mes-articles"]');
    if (visible) {
      await expect(bandePanier).toContainText('2');
      // The next visit, offline: the phone already heard « paid » (verifier MAJOR).
      await expect.poll(() => garde(page, 'sp-panier-paye:v1')).toContain('"payee":true');
      await page.unroute('**/checkout/order/**');
      await page.route('**/checkout/**', (route) => route.abort('internetdisconnected'));
      const demandes: string[] = [];
      page.on('request', (req) => { if (req.url().includes('/checkout/order/')) demandes.push(req.url()); });
      await page.goto('/?/v/aicha-4821');
      await expect(bandePanier).toContainText('2');
      expect(demandes, 'a paid panier already known asks the service again').toEqual([]);
      await bandePanier.click();
      await expect(page.locator('[data-screen="MES-ARTICLES"]')).toBeVisible();
    } else {
      await expect(bandePanier, 'a band for articles nobody paid').toHaveCount(0, { timeout: 2_000 });
      await expect.poll(() => lus.length).toBeGreaterThan(0);
      if (oublie) await expect.poll(() => garde(page, 'sp-panier-paye:v1')).toBeNull();
      await page.waitForTimeout(500);
      await expect(bandePanier).toHaveCount(0);
      if (!oublie) expect(await garde(page, 'sp-panier-paye:v1')).toContain('grp-bande-1');
    }
    expect(erreurs).toEqual([]);
  });
}

test('BANDE-PAYEE — an old answer never erases the order a retry kept since (verifier minor 1)', async ({ page }) => {
  const livre = new Livre();
  await page.addInitScript((c) => localStorage.setItem('sp-commande:v1', JSON.stringify(c)), COMMANDE_KEPT);
  let lacher: () => void = () => undefined;
  const lu = new Promise<void>((ok) => { lacher = ok; });
  let arrive = false;
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
    await page.route('**/checkout/order/**', async (route) => {
      arrive = true;
      await lu;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orderId: COMMANDE_KEPT.orderId, state: 'payment_failed', amountPaidAtCheckout: 13_000, amountDueAtDelivery: 0, doorLeg: 'none' }) });
    });
  });
  await expect.poll(() => arrive).toBe(true);
  // While the first read hangs, her retry keeps the SAME order again, at a new time.
  const reessai = { ...COMMANDE_KEPT, at: '2026-09-24T08:05:00.000Z' };
  await page.evaluate((c) => localStorage.setItem('sp-commande:v1', JSON.stringify(c)), reessai);
  lacher();
  await page.waitForTimeout(800);
  expect(await garde(page, 'sp-commande:v1')).toContain('2026-09-24T08:05:00.000Z');
  await expect(page.locator('[data-role="ma-commande"]')).toHaveCount(0);
  expect(erreurs).toEqual([]);
});

test('BANDE-PAYEE — a band whose answer lands late stays off a screen she already opened (verifier minor 2)', async ({ page }) => {
  const livre = new Livre();
  await page.addInitScript(({ c, p }) => {
    localStorage.setItem('sp-commande:v1', JSON.stringify(c));
    localStorage.setItem('sp-panier-paye:v1', JSON.stringify({ ...p, payee: true }));
  }, { c: COMMANDE_KEPT, p: PANIER_KEPT });
  let lacher: () => void = () => undefined;
  const lu = new Promise<void>((ok) => { lacher = ok; });
  const erreurs = await ouvrir(page, livre, '/?/v/aicha-4821', async () => {
    await page.route('**/checkout/order/**', async (route) => {
      const url = route.request().url();
      if (/\/remise$/.test(url)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
      const id = decodeURIComponent(url.split('/').pop()!);
      if (id === COMMANDE_KEPT.orderId) await lu;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orderId: id, state: 'confirmed', amountPaidAtCheckout: 13_000, amountDueAtDelivery: 0, doorLeg: 'none' }) });
    });
  });
  // The panier is known paid: its band stands at once; she opens it.
  await page.locator('[data-role="mes-articles"]').click();
  await expect(page.locator('[data-screen="MES-ARTICLES"]')).toBeVisible();
  // Only now does the other order's « paid » land.
  lacher();
  await expect.poll(() => garde(page, 'sp-commande:v1')).toContain('"payee":true');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-role="ma-commande"]')).toHaveCount(0);
  await expect(page.locator('[data-screen="MES-ARTICLES"]')).toBeVisible();
  expect(erreurs).toEqual([]);
});
