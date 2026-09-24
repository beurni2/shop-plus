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
    expect(html).toMatch(/class="secondary-action" type="button" data-action="compte-invitee"/);
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

import { oublierSessions, rafraichirSession, sessionActive } from '../src/compte/garde';
import { renderCommandes, renderRecuperation, renderSupprimer } from '../src/compte/ecrans';
import { creerRattacheur } from '../src/compte/entree';

describe('COMPTE-CLIENTE-2 — the wire', () => {
  const port = httpComptePort('https://svc/api');

  it('recovery sends her number, the code and the new password, nothing else, with no Bearer', async () => {
    const { appels } = faux(() => Response.json({ ...PROFIL, session: SESSION }));
    const r = await port.recuperer('70 12 34 56', 'SPR-AAAA-BBBB-CCCC-DDDD', 'nouveau-mot-long');
    expect(appels[0]!.url).toBe('https://svc/api/buyer/recover');
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({ phone: '70 12 34 56', code: 'SPR-AAAA-BBBB-CCCC-DDDD', newPassword: 'nouveau-mot-long' });
    expect(new Headers(appels[0]!.init.headers).has('Authorization')).toBe(false);
    expect(r.kind).toBe('ok');
    faux(() => Response.json({ ok: false, reason: 'bad_code' }, { status: 401 }));
    expect(await port.recuperer('70 12 34 56', 'x', 'nouveau-mot-long')).toEqual({ kind: 'refus', reason: 'bad_code' });
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
    expect(html).toContain('ord-&lt;b&gt;1');
    expect(html).not.toContain('REF-SECRETE-9');
    expect(renderCommandes([])).toContain('Pas encore de commande');
    expect(renderCommandes('echec')).toContain('data-action="compte-commandes-relire"');
  });

  it('recovery asks her number, the code and a new password, and keeps her number when she came with it', () => {
    const html = renderRecuperation('70 12 34 56');
    expect([...html.matchAll(/data-champ="([^"]+)"/g)].map((m) => m[1])).toEqual(['phone', 'code', 'newPassword']);
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
    expect(renderPorte('Chez <Aïcha>')).toContain('Bienvenue chez Chez &lt;Aïcha&gt;');
    expect(renderPorte()).toContain('Bienvenue sur Shop+');
  });
});

describe('COMPTE-CLIENTE-2 — her orders join « Mes commandes »', () => {
  it('only when she is signed in, and each order once', async () => {
    const local = memoire();
    const onglet = memoire();
    const envoyes: { session: string; ajouter: unknown }[] = [];
    const port = { commandes: async (session: string, ajouter?: unknown) => { envoyes.push({ session, ajouter }); return { kind: 'ok' as const, value: [] }; } } as never;
    const rattacher = creerRattacheur(port, local, onglet);
    rattacher({ orderId: 'ord-invitee', buyerRef: 'r0' });
    expect(envoyes).toEqual([]);
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    rattacher({ orderId: 'ord-1', buyerRef: 'r1' });
    rattacher({ orderId: 'ord-1', buyerRef: 'r1' });
    rattacher({ orderId: 'ord-2', buyerRef: 'r2' });
    expect(envoyes).toEqual([
      { session: SESSION, ajouter: [{ orderId: 'ord-1', buyerRef: 'r1' }] },
      { session: SESSION, ajouter: [{ orderId: 'ord-2', buyerRef: 'r2' }] },
    ]);
  });
});
