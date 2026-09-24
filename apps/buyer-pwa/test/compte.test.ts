import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpComptePort, LECTURE_PROFIL_TIMEOUT_MS, lireProfilWire, resolveComptePort } from '../src/compte/port';
import { estInvitee, garderSession, marquerInvitee, oublierSession, sessionGardee } from '../src/compte/garde';
import {
  numeroComplet,
  renderConnexion,
  renderInscription,
  renderModifier,
  renderMotDePasse,
  renderPorte,
  renderPorteTete,
  renderProfil,
} from '../src/compte/ecrans';

/**
 * COMPTE-CLIENTE — the buyer app's half of her account: the exact bytes each
 * door receives, what the phone keeps (her session and first name, nothing
 * else), and the screens' laws (one primary action, server bytes escaped,
 * the session never in the page). The screens are WALKED in Playwright
 * (e2e/compte.spec.ts); this pins what a walk cannot see.
 */

const memoire = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
};

const SESSION = 'SPC-ABCD-EFGH-IJKL-MNOP';
const PROFIL = { ok: true, firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', email: 'awa@exemple.bf', createdAt: '2026-09-24T08:00:00.000Z' };

type Appel = { url: string; init: RequestInit };
function faux(reponse: () => Response): { appels: Appel[] } {
  const appels: Appel[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    return reponse();
  });
  return { appels };
}
afterEach(() => vi.unstubAllGlobals());

describe('the wire — each door gets exactly its allowlist, the session only as a Bearer', () => {
  const port = httpComptePort('https://svc/api');

  it('signup: five keys, the email absent when blank; the answer is her profile and a session', async () => {
    const { appels } = faux(() => Response.json({ ...PROFIL, session: SESSION }));
    const r = await port.inscrire({ firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', password: 'assez-long', email: '' });
    expect(appels[0]!.url).toBe('https://svc/api/buyer/signup');
    expect(appels[0]!.init.method).toBe('POST');
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({ firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', password: 'assez-long' });
    expect(new Headers(appels[0]!.init.headers).has('Authorization')).toBe(false);
    expect(r).toEqual({ kind: 'ok', value: { session: SESSION, profil: { firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', email: 'awa@exemple.bf' } } });
    await port.inscrire({ firstName: 'Awa', lastName: 'O', phone: '70 12 34 56', password: 'assez-long', email: 'a@b.bf' });
    expect(Object.keys(JSON.parse(appels[1]!.init.body as string)).sort()).toEqual(['email', 'firstName', 'lastName', 'password', 'phone']);
  });

  it('login: phone and password, nothing else', async () => {
    const { appels } = faux(() => Response.json({ ...PROFIL, session: SESSION }));
    await port.connecter('70 12 34 56', 'secret-long');
    expect(appels[0]!.url).toBe('https://svc/api/buyer/login');
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({ phone: '70 12 34 56', password: 'secret-long' });
  });

  it('profile: her Bearer, and only the fields she changed', async () => {
    const { appels } = faux(() => Response.json(PROFIL));
    await port.lireProfil(SESSION);
    await port.modifierProfil(SESSION, { firstName: 'Aïcha', email: '' });
    await port.modifierProfil(SESSION, { currentPassword: 'ancien-mot', newPassword: 'nouveau-mot' });
    for (const a of appels) {
      expect(a.url).toBe('https://svc/api/buyer/profile');
      expect(new Headers(a.init.headers).get('Authorization')).toBe(`Bearer ${SESSION}`);
      expect(a.init.body as string).not.toContain(SESSION);
    }
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({});
    expect(JSON.parse(appels[1]!.init.body as string)).toEqual({ firstName: 'Aïcha', email: '' });
    expect(JSON.parse(appels[2]!.init.body as string)).toEqual({ currentPassword: 'ancien-mot', newPassword: 'nouveau-mot' });
  });

  it('names every way a door can fail', async () => {
    faux(() => Response.json({ ok: false, reason: 'bad_field', field: 'phone' }, { status: 400 }));
    expect(await port.connecter('1', 'x')).toEqual({ kind: 'refus', reason: 'bad_field', field: 'phone' });
    faux(() => Response.json({ ok: false, reason: 'no_session' }, { status: 401 }));
    expect(await port.lireProfil(SESSION)).toEqual({ kind: 'session_perdue' });
    faux(() => Response.json({ ok: false, reason: 'bad_credentials' }, { status: 401 }));
    expect(await port.connecter('70 12 34 56', 'x')).toEqual({ kind: 'refus', reason: 'bad_credentials' });
    faux(() => new Response('<html>502</html>', { status: 502 }));
    expect(await port.lireProfil(SESSION)).toEqual({ kind: 'refus', reason: 'indisponible' });
    // A 200 that is not her profile is not a success.
    faux(() => Response.json({ ok: true }));
    expect(await port.lireProfil(SESSION)).toEqual({ kind: 'refus', reason: 'indisponible' });
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    expect(await port.connecter('70 12 34 56', 'x')).toEqual({ kind: 'hors_ligne' });
  });

  it('the profile read, which fires by itself, ends on « hors ligne » when the socket stalls — never a skeleton for ever', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));
      const r = port.lireProfil(SESSION);
      await vi.advanceTimersByTimeAsync(LECTURE_PROFIL_TIMEOUT_MS);
      expect(await r).toEqual({ kind: 'hors_ligne' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('logout is best effort: an unreachable service never throws', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(port.deconnecter(SESSION)).resolves.toBeUndefined();
  });

  it('no service configured ⇒ no account road at all (never a browser-only account)', () => {
    expect(resolveComptePort()).toBeUndefined();
  });

  it('reads only a whole profile off the wire', () => {
    expect(lireProfilWire({ firstName: 'Awa', lastName: 'O', phone: '70' })).toEqual({ firstName: 'Awa', lastName: 'O', phone: '70' });
    expect(lireProfilWire({ firstName: 'Awa', phone: '70' })).toBeUndefined();
    expect(lireProfilWire(null)).toBeUndefined();
  });
});

describe('what the phone keeps', () => {
  it('her session and first name, nothing else; a malformed record is « not signed in »', () => {
    const local = memoire();
    expect(sessionGardee(local)).toBeUndefined();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    expect(sessionGardee(local)).toEqual({ session: SESSION, prenom: 'Awa' });
    expect(JSON.parse(local.getItem('sp-compte:v1')!)).toEqual({ session: SESSION, prenom: 'Awa' });
    oublierSession(local);
    expect(sessionGardee(local)).toBeUndefined();
    expect(local.getItem('sp-compte:v1')).toBeNull();
    // A record this page never wrote is read from the store — and a malformed
    // one (a reseller's session, broken JSON) is « not signed in ».
    const autre = memoire();
    autre.setItem('sp-compte:v1', JSON.stringify({ session: SESSION, prenom: 'Awa' }));
    expect(sessionGardee(autre)).toEqual({ session: SESSION, prenom: 'Awa' });
    const revendeuse = memoire();
    revendeuse.setItem('sp-compte:v1', JSON.stringify({ session: 'SPS-ABCD-EFGH-IJKL-MNOP', prenom: 'X' }));
    expect(sessionGardee(revendeuse)).toBeUndefined();
    const casse = memoire();
    casse.setItem('sp-compte:v1', '{pas du json');
    expect(sessionGardee(casse)).toBeUndefined();
  });

  it('« continuer sans compte » lasts the tab; blocked storage never throws', () => {
    const onglet = memoire();
    expect(estInvitee(onglet)).toBe(false);
    marquerInvitee(onglet);
    expect(estInvitee(onglet)).toBe(true);
    const bloque = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(sessionGardee(bloque)).toBeUndefined();
    expect(estInvitee(bloque)).toBe(false);
    expect(sessionGardee(undefined)).toBeUndefined();
    // VERIFIER BLOCKER 1 — a store that refuses everything never undoes the
    // step she just took: the page remembers her choice and her session.
    expect(() => marquerInvitee(bloque)).not.toThrow();
    expect(estInvitee(bloque)).toBe(true);
    expect(() => garderSession(bloque, { session: SESSION, prenom: 'A' })).not.toThrow();
    expect(sessionGardee(bloque)).toEqual({ session: SESSION, prenom: 'A' });
    expect(() => oublierSession(bloque)).not.toThrow();
    expect(sessionGardee(bloque)).toBeUndefined();
    marquerInvitee(null);
    expect(estInvitee(null)).toBe(true);
  });
});

describe('the screens', () => {
  it('her number the way the service keys it: 8 national digits, any prefix', () => {
    for (const ok of ['70 12 34 56', '+226 70 12 34 56', '0022670123456', '22670123456', '+33 6 12 34 56 78']) expect(numeroComplet(ok), ok).toBe(true);
    for (const non of ['70 12 34', '', '1234567', '1'.repeat(16)]) expect(numeroComplet(non), non).toBe(false);
  });

  it('every screen has exactly ONE primary action', () => {
    const p = { firstName: 'Awa', lastName: 'O', phone: '70 12 34 56' };
    for (const html of [renderPorte(), renderInscription(), renderConnexion(), renderProfil(p), renderProfil('hors_ligne'), renderProfil('indisponible'), renderModifier(p), renderMotDePasse()]) {
      expect(html.match(/class="primary-action"/g)?.length).toBe(1);
    }
  });

  it('the doors: create, sign in, and continuing without an account is a FULL button', () => {
    const html = renderPorte();
    for (const a of ['compte-vers-inscription', 'compte-vers-connexion', 'compte-invitee']) expect(html).toContain(`data-action="${a}"`);
    // A <button>, full width (.porte-invitee), never a link or a small print.
    expect(html).toMatch(/<button class="porte-invitee" type="button" data-action="compte-invitee">Continuer sans compte<\/button>/);
    // Its order: ALL THREE doors before anything else she might scroll past
    // (verifier BLOCKER: a guest road below the fold is an account wall) —
    // the one primary, « Me connecter », « ou », the guest road — then the
    // reasons, then the privacy line that holds for every road.
    const ordre = ['compte-vers-inscription', 'compte-vers-connexion', 'porte-ou', 'compte-invitee', 'porte-atouts', 'compte-prive'].map((m) => html.indexOf(m));
    expect(ordre.every((i) => i >= 0)).toBe(true);
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
  });

  it('PORTE-BELLE — three true reasons, each an icon WITH its words', () => {
    const html = renderPorte();
    const atouts = [...html.matchAll(/<li class="porte-atout">([\s\S]*?)<\/li>/g)].map((m) => m[1]!);
    expect(atouts).toHaveLength(3);
    for (const a of atouts) {
      expect(a).toMatch(/<svg class="porte-atout-glyphe"/);
      expect(a).toMatch(/<strong class="porte-atout-titre">[^<]+<\/strong><span class="porte-atout-texte">[^<]+<\/span>/);
    }
    expect(html).toContain('Vos commandes, toujours avec vous');
    expect(html).toContain('Votre numéro est déjà rempli pour vous.');
    expect(html).toContain('Votre nom et votre numéro, en sécurité.');
    // « La vendeuse ne les voit pas » is true on EVERY road, so it is never
    // sold as an account benefit (verifier MAJOR 2): it stands outside the card.
    const carte = html.slice(html.indexOf('data-role="porte-atouts"'), html.indexOf('data-role="compte-prive"'));
    expect(carte).not.toContain('La vendeuse ne les voit pas');
    expect(html).toContain('data-role="compte-prive">Vos infos restent privées. La vendeuse ne les voit pas.</p>');
  });

  it('PORTE-BELLE — the head in its three states: waiting, her boutique, plain Shop+', () => {
    const attente = renderPorteTete('attente');
    expect(attente).toContain('data-etat="attente"');
    expect(attente).toContain('aria-busy="true"');
    expect(attente).toContain('>Bienvenue</h2>');
    const shop = renderPorteTete();
    expect(shop).toContain('data-etat="shop"');
    expect(shop).toContain('>Bienvenue sur Shop+</h2>');
    expect(shop.match(/Shop\+/g)).toHaveLength(1);
    const elle = renderPorteTete({ nom: 'Chez Aïcha Mode', lieu: 'Gounghin, Ouagadougou', theme: 'foret' });
    expect(elle).toContain('data-etat="boutique"');
    expect(elle).toContain('>Bienvenue chez Aïcha Mode</h2>');
    expect(elle).toContain('>Vendeuse vérifiée · Gounghin, Ouagadougou</p>');
    // ONE vérifiée tick, riding her monogram — never a second one beside it.
    expect(elle.match(/porte-bulle-glyphe/g)).toHaveLength(1);
    expect(elle.match(/<svg/g)).toHaveLength(1);
    // Her monogram is the first letter of the name she is greeted by.
    expect(elle).toMatch(/<span class="porte-avatar" data-role="porte-avatar" aria-hidden="true">A</);
    const portrait = renderPorteTete({ nom: 'Awa', lieu: '', theme: 'indigo', portrait: 'https://media.example/a.jpg', cadrage: '40% 20%' });
    expect(portrait).toContain('<img class="porte-avatar-img" src="https://media.example/a.jpg"');
    // Her portrait keeps the framing her boutique gives it.
    expect(portrait).toContain('style="object-position:40% 20%"');
    // No city, no « Vendeuse vérifiée · » dangling on nothing.
    expect(portrait).not.toContain('porte-verifiee');
  });

  it('sign-up asks exactly her five fields, the email marked optional', () => {
    const champs = [...renderInscription().matchAll(/data-champ="([^"]+)"/g)].map((m) => m[1]);
    expect(champs).toEqual(['firstName', 'lastName', 'phone', 'email', 'password']);
    expect(renderInscription()).toContain('Email (pas obligatoire)');
  });

  it('server bytes are escaped, and her profile says where her infos are', () => {
    const html = renderProfil({ firstName: '<img src=x onerror=alert(1)>', lastName: 'O"', phone: '70', email: 'a&b@c.bf' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('O&quot;');
    expect(html).toContain('a&amp;b@c.bf');
    expect(html).toContain('data-role="compte-prive"');
    expect(renderModifier({ firstName: '"><script>', lastName: 'O', phone: '70' })).not.toContain('"><script>');
  });

  it('no email reads « Pas d’email », and her number cannot be edited', () => {
    expect(renderProfil({ firstName: 'Awa', lastName: 'O', phone: '70' })).toContain('Pas d’email');
    const modif = renderModifier({ firstName: 'Awa', lastName: 'O', phone: '70 12 34 56' });
    expect(modif).not.toContain('data-champ="phone"');
    expect(modif).toContain('data-info="phone"');
  });
});

/* ═══ COMPTE-CLIENTE-2 — the way back, her orders, leaving, and « garder mon compte ouvert » ═══ */

import { liensDus, oublierSessions, rafraichirSession, sessionActive } from '../src/compte/garde';
import { renderCommandes, renderRecuperation, renderSupprimer } from '../src/compte/ecrans';
import { creerRattacheur, lierLesCommandesDues } from '../src/compte/entree';

describe('COMPTE-CLIENTE-2 — the wire', () => {
  const port = httpComptePort('https://svc/api');

  it('recovery sends her number, the code, her names and the new password, nothing else, with no Bearer', async () => {
    const { appels } = faux(() => Response.json({ ...PROFIL, session: SESSION }));
    const r = await port.recuperer('70 12 34 56', 'SPR-AAAA-BBBB-CCCC-DDDD', 'nouveau-mot-long', { firstName: 'Awa', lastName: 'Ouédraogo' });
    expect(appels[0]!.url).toBe('https://svc/api/buyer/recover');
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({ firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56', code: 'SPR-AAAA-BBBB-CCCC-DDDD', newPassword: 'nouveau-mot-long' });
    expect(new Headers(appels[0]!.init.headers).has('Authorization')).toBe(false);
    expect(r.kind).toBe('ok');
    faux(() => Response.json({ ok: false, reason: 'bad_code' }, { status: 401 }));
    expect(await port.recuperer('70 12 34 56', 'x', 'nouveau-mot-long', { firstName: 'Awa', lastName: 'Ouédraogo' })).toEqual({ kind: 'refus', reason: 'bad_code' });
  });

  it('« Mes commandes » reads on her Bearer, adds at most ten, and keeps only whole rows', async () => {
    const liste = [{ orderId: 'ord-1', buyerRef: 'ref-1', at: '2026-09-24T08:00:00.000Z' }, { orderId: 'ord-2' }];
    const { appels } = faux(() => Response.json({ ok: true, commandes: liste }));
    expect(await port.commandes(SESSION)).toEqual({ kind: 'ok', value: [liste[0]] });
    await port.commandes(SESSION, Array.from({ length: 12 }, (_, i) => ({ orderId: `o-${i}`, buyerRef: `r-${i}`, extra: 'x' } as never)));
    expect(appels[0]!.url).toBe('https://svc/api/buyer/orders');
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({});
    const ajout = JSON.parse(appels[1]!.init.body as string) as { ajouter: object[] };
    expect(ajout.ajouter).toHaveLength(10);
    expect(Object.keys(ajout.ajouter[0]!).sort()).toEqual(['buyerRef', 'orderId']);
    for (const a of appels) expect(new Headers(a.init.headers).get('Authorization')).toBe(`Bearer ${SESSION}`);
  });

  it('delete sends only her current password, on her Bearer', async () => {
    const { appels } = faux(() => Response.json({ ok: true }));
    expect(await port.supprimer(SESSION, 'mon-mot-actuel')).toEqual({ kind: 'ok', value: true });
    expect(appels[0]!.url).toBe('https://svc/api/buyer/delete');
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({ currentPassword: 'mon-mot-actuel' });
    expect(new Headers(appels[0]!.init.headers).get('Authorization')).toBe(`Bearer ${SESSION}`);
  });
});

describe('COMPTE-CLIENTE-2 — « Garder mon compte ouvert sur ce téléphone »', () => {
  it('kept on the phone or only in the tab; her session is whichever holds one; signing out empties both', () => {
    const local = memoire();
    const onglet = memoire();
    expect(sessionActive(local, onglet)).toBeUndefined();
    garderSession(onglet, { session: SESSION, prenom: 'Awa', telephone: '70 12 34 56' });
    expect(local.getItem('sp-compte:v1')).toBeNull();
    expect(sessionActive(local, onglet)).toEqual({ session: SESSION, prenom: 'Awa', telephone: '70 12 34 56' });
    // A refreshed record goes back where the session lives — the tab, here.
    rafraichirSession(local, onglet, { session: SESSION, prenom: 'Aïcha', telephone: '70 12 34 56' });
    expect(local.getItem('sp-compte:v1')).toBeNull();
    expect(sessionActive(local, onglet)?.prenom).toBe('Aïcha');
    oublierSessions(local, onglet);
    expect(sessionActive(local, onglet)).toBeUndefined();
    expect(onglet.getItem('sp-compte:v1')).toBeNull();
  });
});

describe('COMPTE-CLIENTE-2 — the screens', () => {
  it('her orders show their date and reference — never her read token', () => {
    const html = renderCommandes([{ orderId: 'ord-<b>1', buyerRef: 'REF-SECRETE-9', at: '2026-09-24T08:00:00.000Z' }]);
    expect(html).toContain('Commande du 24/09/2026');
    // SUIVI-REFERENCE — she reads a reference she can say out loud; the raw id
    // rides only the tap's attribute, escaped.
    expect(html).toContain('<span class="compte-commande-ref">Réf. ORDB1</span>');
    expect(html).toContain('data-order="ord-&lt;b&gt;1"');
    expect(html).not.toContain('REF-SECRETE-9');
    expect(renderCommandes([])).toContain('Pas encore de commande');
    expect(renderCommandes('echec')).toContain('data-action="compte-commandes-relire"');
  });

  it('recovery asks her number, the code, her names and a new password — the number starts clean, and she is told so', () => {
    const html = renderRecuperation('70 12 34 56');
    expect([...html.matchAll(/data-champ="([^"]+)"/g)].map((m) => m[1])).toEqual(['phone', 'code', 'firstName', 'lastName', 'newPassword']);
    expect(html).toContain('Votre compte recommence à neuf');
    expect(html).toContain('placeholder="Ex. : SPR-ABCD-EFGH-JKLM-NPQR"');
    expect(html).toContain('value="70 12 34 56"');
    expect(html).toContain('data-role="compte-rester"');
    expect(html.match(/class="primary-action"/g)?.length).toBe(1);
  });

  it('delete asks her password and says what stays: her orders are still delivered', () => {
    const html = renderSupprimer();
    expect([...html.matchAll(/data-champ="([^"]+)"/g)].map((m) => m[1])).toEqual(['currentPassword']);
    expect(html).toContain('seront livrées');
    expect(html.match(/primary-action/g)?.length).toBe(1);
  });

  it('the doors greet her by her boutique, escaped', () => {
    const html = renderPorte({ nom: 'Chez <Aïcha>', lieu: '"><img src=x>', theme: 'laterite', portrait: '"><script>' });
    expect(html).toContain('Bienvenue chez &lt;Aïcha&gt;');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('"><script>');
    expect(renderPorte()).toContain('Bienvenue sur Shop+');
  });
});

describe('COMPTE-CLIENTE-2 · MES-COMMANDES-PAYEES — her orders join « Mes commandes » once paid', () => {
  const SESSION_2 = 'SPC-QRST-UVWX-YZ23-4567';
  const livre = (reponse: () => unknown = () => ({ kind: 'ok', value: [] })) => {
    const envoyes: { session: string; ajouter: unknown }[] = [];
    const port = { commandes: async (session: string, ajouter?: unknown) => { envoyes.push({ session, ajouter }); return reponse(); } } as never;
    return { envoyes, port };
  };
  const attendre = () => new Promise((ok) => setTimeout(ok, 0));

  it('told at the create it sends NOTHING; told « paid » it sends once — a guest\'s order never', async () => {
    const local = memoire();
    const onglet = memoire();
    const { envoyes, port } = livre();
    const rattacher = creerRattacheur(port, local, onglet);
    rattacher({ orderId: 'ord-invitee', buyerRef: 'r0' });
    rattacher({ orderId: 'ord-invitee', buyerRef: 'r0', payee: true });
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    rattacher({ orderId: 'ord-1', buyerRef: 'r1' });
    rattacher({ orderId: 'ord-2', buyerRef: 'r2' });
    await attendre();
    expect(envoyes, 'an order joined her list before anyone paid').toEqual([]);
    expect(liensDus(local, onglet).map((l) => l.orderId)).toEqual(['ord-2', 'ord-1']);
    rattacher({ orderId: 'ord-1', buyerRef: 'r1', payee: true });
    rattacher({ orderId: 'ord-1', buyerRef: 'r1', payee: true });
    await attendre();
    expect(envoyes).toEqual([{ session: SESSION, ajouter: [{ orderId: 'ord-1', buyerRef: 'r1' }] }]);
    expect(liensDus(local, onglet).map((l) => l.orderId)).toEqual(['ord-2']);
  });

  it('the link goes under the session that MADE the order — never whoever is signed in now; a session ended since drops it', async () => {
    const local = memoire();
    const onglet = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    const { envoyes, port } = livre(() => ({ kind: 'session_perdue' }));
    creerRattacheur(port, local, onglet)({ orderId: 'ord-1', buyerRef: 'r1' });
    // Someone else signs in on this phone before the payment is confirmed.
    garderSession(local, { session: SESSION_2, prenom: 'Mariam' });
    creerRattacheur(port, local, onglet)({ orderId: 'ord-1', buyerRef: 'r1', payee: true });
    await attendre();
    expect(envoyes).toEqual([{ session: SESSION, ajouter: [{ orderId: 'ord-1', buyerRef: 'r1' }] }]);
    expect(liensDus(local, onglet), 'refused by name: owed no more, never re-aimed').toEqual([]);
  });

  it('no network: still owed, and sent on the next « paid »', async () => {
    const local = memoire();
    const onglet = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    let reseau = false;
    const { envoyes, port } = livre(() => (reseau ? { kind: 'ok', value: [] } : { kind: 'hors_ligne' }));
    const rattacher = creerRattacheur(port, local, onglet);
    rattacher({ orderId: 'ord-1', buyerRef: 'r1' });
    rattacher({ orderId: 'ord-1', buyerRef: 'r1', payee: true });
    await attendre();
    expect(liensDus(local, onglet).map((l) => l.orderId)).toEqual(['ord-1']);
    reseau = true;
    rattacher({ orderId: 'ord-1', buyerRef: 'r1', payee: true });
    await attendre();
    expect(envoyes).toHaveLength(2);
    expect(liensDus(local, onglet)).toEqual([]);
  });

  it('kept where her session lives — « garder mon compte ouvert » unticked leaves nothing lasting — and signing out forgets it', () => {
    const local = memoire();
    const onglet = memoire();
    garderSession(onglet, { session: SESSION, prenom: 'Awa' });
    const { port } = livre();
    creerRattacheur(port, local, onglet)({ orderId: 'ord-1', buyerRef: 'r1' });
    expect(local.getItem('sp-liens-dus:v1')).toBeNull();
    expect(onglet.getItem('sp-liens-dus:v1')).toContain('ord-1');
    oublierSessions(local, onglet);
    expect(liensDus(local, onglet)).toEqual([]);
  });

  it('at most ten owed, newest first — the book\'s own bound for one call', () => {
    const local = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    const { port } = livre();
    const rattacher = creerRattacheur(port, local, memoire());
    for (let i = 0; i < 12; i += 1) rattacher({ orderId: `ord-${i}`, buyerRef: `r${i}` });
    expect(liensDus(local, undefined).map((l) => l.orderId)).toEqual(['ord-11', 'ord-10', 'ord-9', 'ord-8', 'ord-7', 'ord-6', 'ord-5', 'ord-4', 'ord-3', 'ord-2']);
  });

  it('the next visit asks the service for each owed order: paid joins, failed or cancelled is dropped, waiting is kept', async () => {
    const local = memoire();
    const onglet = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    const { envoyes, port } = livre();
    const rattacher = creerRattacheur(port, local, onglet);
    for (const id of ['ord-paye', 'ord-echec', 'ord-annule', 'ord-attente', 'ord-muet']) rattacher({ orderId: id, buyerRef: `r-${id}` });
    const etats: Record<string, string> = { 'ord-paye': 'confirmed', 'ord-echec': 'payment_failed', 'ord-annule': 'cancelled', 'ord-attente': 'payment_pending' };
    // The next visit: a new tab — the checkout that made them is gone.
    lierLesCommandesDues(port, local, memoire(), async (id) =>
      etats[id] === undefined
        ? { status: 'unreachable' }
        : { status: 'order', order: { orderId: id, state: etats[id]!, amountPaidAtCheckout: 1, amountDueAtDelivery: 0 } });
    await attendre();
    await attendre();
    expect(envoyes).toEqual([{ session: SESSION, ajouter: [{ orderId: 'ord-paye', buyerRef: 'r-ord-paye' }] }]);
    expect(liensDus(local, onglet).map((l) => l.orderId).sort()).toEqual(['ord-attente', 'ord-muet']);
  });

  it('a payment that failed in the tab still open stays owed: « Réessayer » there answers the same order (verifier minor 4)', async () => {
    const local = memoire();
    const onglet = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    const { envoyes, port } = livre();
    creerRattacheur(port, local, onglet)({ orderId: 'ord-echec', buyerRef: 'r1' });
    lierLesCommandesDues(port, local, onglet, async (id) => ({ status: 'order', order: { orderId: id, state: 'payment_failed', amountPaidAtCheckout: 1, amountDueAtDelivery: 0 } }));
    await attendre();
    expect(envoyes).toEqual([]);
    expect(liensDus(local, onglet).map((l) => l.orderId)).toEqual(['ord-echec']);
  });

  it('a retried payment never re-aims the order: signed out then someone else signed in, or a guest who signs in — the first create decided (verifier BLOCKER)', async () => {
    const local = memoire();
    const onglet = memoire();
    const { envoyes, port } = livre();
    const rattacher = creerRattacheur(port, local, onglet);
    // Awa makes it; the payment fails; she signs out; Mariam signs in and retries.
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    rattacher({ orderId: 'ord-awa', buyerRef: 'r-awa' });
    oublierSessions(local, onglet);
    garderSession(local, { session: SESSION_2, prenom: 'Mariam' });
    rattacher({ orderId: 'ord-awa', buyerRef: 'r-awa' });
    rattacher({ orderId: 'ord-awa', buyerRef: 'r-awa', payee: true });
    // A guest's order, retried after she signed in: still nobody's.
    oublierSessions(local, onglet);
    rattacher({ orderId: 'ord-invitee', buyerRef: 'r-inv' });
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    rattacher({ orderId: 'ord-invitee', buyerRef: 'r-inv' });
    rattacher({ orderId: 'ord-invitee', buyerRef: 'r-inv', payee: true });
    // …and the same holds after a reload: a new page, the same tab.
    const apres = creerRattacheur(port, local, onglet);
    apres({ orderId: 'ord-invitee', buyerRef: 'r-inv' });
    apres({ orderId: 'ord-invitee', buyerRef: 'r-inv', payee: true });
    await attendre();
    expect(envoyes).toEqual([]);
    expect(liensDus(local, onglet)).toEqual([]);
  });

  it('signed out while the payment waits: a confirmation later on the same page sends nothing (verifier minor 2)', async () => {
    const local = memoire();
    const onglet = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    const { envoyes, port } = livre();
    const rattacher = creerRattacheur(port, local, onglet);
    rattacher({ orderId: 'ord-1', buyerRef: 'r1' });
    oublierSessions(local, onglet);
    rattacher({ orderId: 'ord-1', buyerRef: 'r1', payee: true });
    await attendre();
    expect(envoyes).toEqual([]);
  });

  it('the book could not answer (a server error): still owed, sent on the next « paid » (verifier minor 3)', async () => {
    const local = memoire();
    const onglet = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    let panne = true;
    const { envoyes, port } = livre(() => (panne ? { kind: 'refus', reason: 'indisponible' } : { kind: 'ok', value: [] }));
    const rattacher = creerRattacheur(port, local, onglet);
    rattacher({ orderId: 'ord-1', buyerRef: 'r1' });
    rattacher({ orderId: 'ord-1', buyerRef: 'r1', payee: true });
    await attendre();
    expect(liensDus(local, onglet).map((l) => l.orderId)).toEqual(['ord-1']);
    panne = false;
    rattacher({ orderId: 'ord-1', buyerRef: 'r1', payee: true });
    await attendre();
    expect(envoyes).toHaveLength(2);
    expect(liensDus(local, onglet)).toEqual([]);
  });
});
