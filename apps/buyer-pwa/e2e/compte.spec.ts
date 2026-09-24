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
 * (`bad_password`) and ends every other session. What it does NOT mirror,
 * stated: the password hashing, the per-phone throttle, the idle life and the
 * address ceilings — all four are the real book's, tested there. The storefront
 * read is scripted like every boutique walk on this port.
 */

const BASE = 'http://127.0.0.1:4175';
test.use({ baseURL: BASE });

const BOUTIQUE = {
  id: 'sf-e2e-compte-1',
  slug: 'aicha-4821',
  resellerId: 'rs-e2e-compte-1',
  name: 'Chez Aïcha Mode',
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

async function ouvrir(page: Page, livre: Livre, chemin = '/?/v/aicha-4821'): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message ?? e)));
  await page.route('**/api/s/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOUTIQUE) }));
  await page.route('**/api/buyer/**', (route) => livre.servir(route));
  await page.route('**/checkout/**', (route) => route.abort('failed'));
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
  expect(livre.appels.at(-1)).toEqual({ chemin: 'profile', bearer: session, corps: {} });
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
  expect(livre.appels.at(-1)!.corps).toEqual({ firstName: 'Aïcha', lastName: 'Ouédraogo', email: '' });
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

