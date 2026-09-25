import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pwaColour, sharedColour } from '@platform/ui-tokens';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpComptePort } from '../src/compte/port';
import { articlesDus, articleValide, garderSession, oublierArticles, oublierSessions, retenirArticle } from '../src/compte/garde';
import { creerSynchroArticles } from '../src/compte/articles';
import { grouperArticles, renderArticles, renderProfil, type LectureBoutique } from '../src/compte/ecrans';
import { COMPTE_STYLES } from '../src/compte/styles';
import { favorisSitues, observerFavoris, resetFavoritesCache, situerFavoris, toggleFavorite } from '../src/vitrine/favorites';
import { observerPanier, paniersDuTelephone, resetPanierCache, retirerDuPanier, togglePanier } from '../src/vitrine/panier';

/**
 * MON-COMPTE-PLUS (founder 2026-09-25, canon 3.24.0 — SP-I05, SP6 third
 * ruling): « Mon panier » and « Mes coups de cœur » in « Mon compte », by
 * boutique, never a price, kept in her account. This pins what a walk cannot
 * see — the exact bytes the account door receives, the owed-changes queue,
 * the write-through's rules, the stores' observers and the lists' markup; the
 * screens themselves are WALKED in e2e/mon-compte-plus.spec.ts.
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
(globalThis as { localStorage?: Storage }).localStorage = memoire();

const SESSION = 'SPC-ABCD-EFGH-IJKL-MNOP';
const SESSION_2 = 'SPC-QRST-UVWX-YZ23-4567';
const attendre = () => new Promise((ok) => setTimeout(ok, 0));
afterEach(() => vi.unstubAllGlobals());

describe('the wire — only a boutique and a product ever travel', () => {
  const port = httpComptePort('https://svc/api');
  const appels: { url: string; init: RequestInit }[] = [];
  const repondre = (corps: unknown) =>
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      appels.push({ url, init });
      return Response.json(corps);
    });
  beforeEach(() => void (appels.length = 0));

  it('a read is an empty body on her Bearer; a change sends exactly its operations, at most fifty', async () => {
    repondre({ ok: true, panier: [], favoris: [] });
    await port.articles(SESSION);
    expect(appels[0]!.url).toBe('https://svc/api/buyer/articles');
    expect(appels[0]!.init.method).toBe('POST');
    expect(JSON.parse(appels[0]!.init.body as string)).toEqual({});
    expect(new Headers(appels[0]!.init.headers).get('Authorization')).toBe(`Bearer ${SESSION}`);
    const ops = Array.from({ length: 55 }, (_, i) => ({ liste: 'panier' as const, action: 'ajouter' as const, slug: 'aicha-4821', pid: `pv-${i}` }));
    await port.articles(SESSION, ops);
    const corps = JSON.parse(appels[1]!.init.body as string) as { operations: unknown[] };
    expect(Object.keys(corps)).toEqual(['operations']);
    expect(corps.operations).toHaveLength(50);
    expect(corps.operations[0]).toEqual({ liste: 'panier', action: 'ajouter', slug: 'aicha-4821', pid: 'pv-0' });
  });

  it('reads back only whole rows — a boutique, a product, when — and nothing else a row might carry', async () => {
    repondre({
      ok: true,
      panier: [{ slug: 'aicha-4821', pid: 'pv-1', at: '2026-09-25T08:00:00.000Z', prix: 12_000 }, { slug: 'aicha-4821' }],
      favoris: [{ slug: 'mariam-1203', pid: 'pv-2', at: '2026-09-25T09:00:00.000Z' }],
    });
    const r = await port.articles(SESSION);
    expect(r).toEqual({
      kind: 'ok',
      value: {
        panier: [{ slug: 'aicha-4821', pid: 'pv-1', at: '2026-09-25T08:00:00.000Z' }],
        favoris: [{ slug: 'mariam-1203', pid: 'pv-2', at: '2026-09-25T09:00:00.000Z' }],
      },
    });
    repondre({ ok: true, panier: [] });
    expect((await port.articles(SESSION)).kind, 'a half answer is no answer').not.toBe('ok');
  });
});

describe('what the phone owes her account', () => {
  const du = (pid: string, action: 'ajouter' | 'retirer' = 'ajouter', session = SESSION) =>
    ({ liste: 'panier' as const, action, slug: 'aicha-4821', pid, session });

  it('one entry per article and list — the last change wins and moves to the end — at most fifty', () => {
    const local = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    retenirArticle(local, undefined, du('pv-1'));
    retenirArticle(local, undefined, du('pv-2'));
    retenirArticle(local, undefined, du('pv-1', 'retirer'));
    retenirArticle(local, undefined, { ...du('pv-1'), liste: 'favoris' });
    expect(articlesDus(local, undefined).map((d) => `${d.liste}:${d.action}:${d.pid}`)).toEqual(['panier:ajouter:pv-2', 'panier:retirer:pv-1', 'favoris:ajouter:pv-1']);
    for (let i = 0; i < 60; i += 1) retenirArticle(local, undefined, du(`pv-n${i}`));
    const dus = articlesDus(local, undefined);
    expect(dus).toHaveLength(50);
    expect(dus[49]!.pid).toBe('pv-n59');
  });

  it('kept where her session lives; forgotten when she signs out; a sent change leaves, a newer one stays', () => {
    const local = memoire();
    const onglet = memoire();
    garderSession(onglet, { session: SESSION, prenom: 'Awa' });
    retenirArticle(local, onglet, du('pv-1'));
    expect(local.getItem('sp-articles-dus:v1')).toBeNull();
    expect(onglet.getItem('sp-articles-dus:v1')).toContain('pv-1');
    const envoye = articlesDus(local, onglet);
    retenirArticle(local, onglet, du('pv-1', 'retirer'));
    oublierArticles(local, onglet, envoye);
    expect(articlesDus(local, onglet).map((d) => d.action)).toEqual(['retirer']);
    oublierSessions(local, onglet);
    expect(articlesDus(local, onglet)).toEqual([]);
  });

  it('only what the book will take: a lowercase boutique slug, a plain product id', () => {
    expect(articleValide('aicha-4821', 'pv-1_a')).toBe(true);
    for (const [slug, pid] of [['Aicha', 'pv-1'], ['aicha 4821', 'pv-1'], ['aicha-4821', 'pv 1'], ['aicha-4821', ''], ['', 'pv-1'], ['aicha-4821', '-pv']]) {
      expect(articleValide(slug!, pid!), `${slug}/${pid}`).toBe(false);
    }
  });
});

describe('the write-through — her taps reach her account, a guest\'s never', () => {
  type Envoi = { session: string; ops: unknown };
  const livre = (reponse: () => unknown = () => ({ kind: 'ok', value: { panier: [], favoris: [] } })) => {
    const envois: Envoi[] = [];
    const port = { articles: async (session: string, ops?: unknown) => { envois.push({ session, ops }); return reponse(); } } as never;
    return { envois, port };
  };

  it('signed out: nothing sent, nothing kept', async () => {
    const local = memoire();
    const { envois, port } = livre();
    const s = creerSynchroArticles(port, local, memoire());
    s.noter('panier', 'aicha-4821', 'pv-1', true);
    s.joindre({ panier: [{ slug: 'aicha-4821', pid: 'pv-2' }], favoris: [] });
    await attendre();
    expect(envois).toEqual([]);
    expect(articlesDus(local, undefined)).toEqual([]);
  });

  it('signed in: each change goes under her session, and is owed no more once told', async () => {
    const local = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    const { envois, port } = livre();
    const s = creerSynchroArticles(port, local, memoire());
    s.noter('favoris', 'aicha-4821', 'pv-1', true);
    await attendre();
    s.noter('favoris', 'aicha-4821', 'pv-1', false);
    await attendre();
    expect(envois).toEqual([
      { session: SESSION, ops: [{ liste: 'favoris', action: 'ajouter', slug: 'aicha-4821', pid: 'pv-1' }] },
      { session: SESSION, ops: [{ liste: 'favoris', action: 'retirer', slug: 'aicha-4821', pid: 'pv-1' }] },
    ]);
    expect(articlesDus(local, undefined)).toEqual([]);
  });

  it('a change made while one is out goes right after it — one call at a time', async () => {
    const local = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    let lacher: () => void = () => undefined;
    const envois: unknown[] = [];
    const port = {
      articles: (_s: string, ops?: unknown) => {
        envois.push(ops);
        return new Promise((ok) => { lacher = () => ok({ kind: 'ok', value: { panier: [], favoris: [] } }); });
      },
    } as never;
    const s = creerSynchroArticles(port, local, memoire());
    s.noter('panier', 'aicha-4821', 'pv-1', true);
    s.noter('panier', 'aicha-4821', 'pv-2', true);
    expect(envois).toHaveLength(1);
    lacher();
    await attendre();
    expect(envois).toHaveLength(2);
    expect(envois[1]).toEqual([{ liste: 'panier', action: 'ajouter', slug: 'aicha-4821', pid: 'pv-2' }]);
  });

  it('no network, or the book unable to answer: still owed, and sent with the next change', async () => {
    const local = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    let r: unknown = { kind: 'hors_ligne' };
    const { envois, port } = livre(() => r);
    const s = creerSynchroArticles(port, local, memoire());
    s.noter('panier', 'aicha-4821', 'pv-1', true);
    await attendre();
    r = { kind: 'refus', reason: 'indisponible' };
    s.noter('panier', 'aicha-4821', 'pv-2', true);
    await attendre();
    expect(articlesDus(local, undefined).map((d) => d.pid)).toEqual(['pv-1', 'pv-2']);
    r = { kind: 'ok', value: { panier: [], favoris: [] } };
    s.envoyer();
    await attendre();
    expect(envois).toHaveLength(3);
    expect((envois[2]!.ops as { pid: string }[]).map((o) => o.pid)).toEqual(['pv-1', 'pv-2']);
    expect(articlesDus(local, undefined)).toEqual([]);
  });

  it('owed under a session that ended is nobody\'s — never re-aimed at whoever signs in next', async () => {
    const local = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    const { envois, port } = livre(() => ({ kind: 'hors_ligne' }));
    creerSynchroArticles(port, local, memoire()).noter('panier', 'aicha-4821', 'pv-awa', true);
    await attendre();
    // Another account on this phone, without Awa signing out first.
    garderSession(local, { session: SESSION_2, prenom: 'Mariam' });
    const apres = livre();
    creerSynchroArticles(apres.port, local, memoire()).envoyer();
    await attendre();
    expect(envois).toHaveLength(1);
    expect(apres.envois).toEqual([]);
    expect(articlesDus(local, undefined)).toEqual([]);
  });

  it('signing in joins what this phone already kept, as additions', async () => {
    const local = memoire();
    garderSession(local, { session: SESSION, prenom: 'Awa' });
    const { envois, port } = livre();
    creerSynchroArticles(port, local, memoire()).joindre({
      panier: [{ slug: 'aicha-4821', pid: 'pv-1' }, { slug: 'mariam-1203', pid: 'pv-2' }],
      favoris: [{ slug: 'aicha-4821', pid: 'pv-3' }, { slug: 'Pas Valide', pid: 'pv-4' }],
    });
    await attendre();
    expect(envois).toEqual([{
      session: SESSION,
      ops: [
        { liste: 'panier', action: 'ajouter', slug: 'aicha-4821', pid: 'pv-1' },
        { liste: 'panier', action: 'ajouter', slug: 'mariam-1203', pid: 'pv-2' },
        { liste: 'favoris', action: 'ajouter', slug: 'aicha-4821', pid: 'pv-3' },
      ],
    }]);
  });
});

describe('the phone\'s own stores tell her account what changed', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPanierCache();
    resetFavoritesCache();
  });
  afterEach(() => {
    observerPanier(null);
    observerFavoris(null);
  });

  it('the panier: every article in or out, with its boutique', () => {
    const vus: string[] = [];
    observerPanier((slug, pid, on) => vus.push(`${slug}/${pid}/${on}`));
    togglePanier('aicha-4821', 'pv-1');
    togglePanier('aicha-4821', 'pv-2');
    togglePanier('mariam-1203', 'pv-1');
    togglePanier('aicha-4821', 'pv-1');
    retirerDuPanier('aicha-4821', ['pv-2', 'pv-absent']);
    expect(vus).toEqual(['aicha-4821/pv-1/true', 'aicha-4821/pv-2/true', 'mariam-1203/pv-1/true', 'aicha-4821/pv-1/false', 'aicha-4821/pv-2/false']);
    expect(paniersDuTelephone()).toEqual([{ slug: 'mariam-1203', pid: 'pv-1' }]);
  });

  it('the heart learns the boutique it was tapped in; off, it names the boutique it was kept under', () => {
    const vus: string[] = [];
    observerFavoris((slug, pid, on) => vus.push(`${slug}/${pid}/${on}`));
    toggleFavorite('pv-1', 'aicha-4821');
    toggleFavorite('pv-1', 'mariam-1203');
    expect(vus).toEqual(['aicha-4821/pv-1/true', 'aicha-4821/pv-1/false']);
    // A heart from before this law has no boutique: nothing to tell, until a
    // boutique she opens lists it.
    toggleFavorite('pv-ancien');
    expect(favorisSitues()).toEqual([]);
    situerFavoris('mariam-1203', ['pv-ancien', 'pv-autre']);
    situerFavoris('aicha-4821', ['pv-ancien']);
    expect(vus.slice(2)).toEqual(['mariam-1203/pv-ancien/true']);
    expect(favorisSitues()).toEqual([{ slug: 'mariam-1203', pid: 'pv-ancien' }]);
    resetFavoritesCache();
    expect(favorisSitues(), 'where she hearted it survives a reload').toEqual([{ slug: 'mariam-1203', pid: 'pv-ancien' }]);
  });
});

describe('« Mon panier » and « Mes coups de cœur » — by boutique, never a price', () => {
  const lien = (slug: string) => `?/v/${slug}`;
  const aicha: LectureBoutique = {
    nom: 'Chez Aïcha <Mode>', lieu: 'Ouagadougou', theme: 'indigo',
    produits: [
      { pid: 'pv-1', nom: 'Bazin <brodé>', photo: 'https://img/p1.jpg?a=1&b=2', disponible: true },
      { pid: 'pv-2', nom: 'Pagne wax', disponible: false },
      { pid: 'pv-9', nom: 'Pas dans sa liste', disponible: true },
    ],
  };

  it('groups by boutique in the order she kept them, each article once', () => {
    expect(grouperArticles([
      { slug: 'aicha-4821', pid: 'pv-2', at: '3' },
      { slug: 'mariam-1203', pid: 'pv-7', at: '2' },
      { slug: 'aicha-4821', pid: 'pv-1', at: '1' },
      { slug: 'aicha-4821', pid: 'pv-2', at: '0' },
    ])).toEqual([{ slug: 'aicha-4821', pids: ['pv-2', 'pv-1'] }, { slug: 'mariam-1203', pids: ['pv-7'] }]);
  });

  it('one card per boutique: its name and mark, her articles there with photo and name, and « Voir chez … » into that boutique alone', () => {
    const html = renderArticles('panier', {
      groupes: [{ slug: 'aicha-4821', pids: ['pv-2', 'pv-1', 'pv-gone'] }],
      boutiques: new Map([['aicha-4821', aicha]]),
    }, lien);
    expect(html).toContain('data-role="compte-panier"');
    expect(html).toContain('Chez Aïcha &lt;Mode&gt;');
    expect(html).toContain('Vendeuse vérifiée · Ouagadougou');
    expect(html).toContain('Bazin &lt;brodé&gt;');
    expect(html).toContain('src="https://img/p1.jpg?a=1&amp;b=2"');
    expect(html).toContain('2 articles');
    expect(html, 'an article the boutique no longer lists is not drawn').not.toContain('pv-gone');
    expect(html, 'only the articles SHE kept').not.toContain('Pas dans sa liste');
    expect(html.indexOf('data-pid="pv-2"')).toBeLessThan(html.indexOf('data-pid="pv-1"'));
    expect(html).toMatch(/data-pid="pv-2" data-epuise=""/);
    expect(html).toContain('href="?/v/aicha-4821"');
    expect(html).toContain('Voir chez Aïcha &lt;Mode&gt;');
    expect(html.match(/data-role="compte-voir-chez"/g)).toHaveLength(1);
    expect(html, 'never a price').not.toMatch(/FCFA|prix|price/i);
  });

  it('two boutiques are two cards, never one list, and never a price anywhere', () => {
    const mariam: LectureBoutique = { nom: 'Mariam Style', lieu: '', theme: 'laterite', produits: [{ pid: 'pv-7', nom: 'Sac', disponible: true }] };
    const html = renderArticles('favoris', {
      groupes: [{ slug: 'aicha-4821', pids: ['pv-1'] }, { slug: 'mariam-1203', pids: ['pv-7'] }],
      boutiques: new Map([['aicha-4821', aicha], ['mariam-1203', mariam]]),
    }, lien);
    expect(html.match(/<article class="compte-boutique"/g)).toHaveLength(2);
    expect(html).toContain('data-theme="indigo"');
    expect(html).toContain('data-theme="laterite"');
    expect(html).toContain('1 article');
    expect(html).not.toMatch(/FCFA/);
  });

  it('honest states: reading, no network (with a retry), empty with the true next step, a paused or silent boutique, a boutique gone', () => {
    expect(renderArticles('panier', 'chargement')).toContain('aria-busy="true"');
    const echec = renderArticles('favoris', 'echec');
    expect(echec).toContain('data-role="compte-favoris-echec"');
    expect(echec).toContain('data-action="compte-articles-relire"');
    const vide = { groupes: [], boutiques: new Map() };
    expect(renderArticles('panier', vide)).toContain('Votre panier est vide.');
    expect(renderArticles('favoris', vide)).toContain('Pas encore de coup de cœur.');
    const etats = (l: LectureBoutique | 'chargement') =>
      renderArticles('panier', { groupes: [{ slug: 'aicha-4821', pids: ['pv-1'] }], boutiques: new Map([['aicha-4821', l]]) }, lien);
    expect(etats('hors_ligne')).toContain('Cette boutique ne répond pas pour le moment.');
    expect(etats('hors_ligne')).toContain('data-action="compte-articles-relire"');
    expect(etats({ pause: 'Chez Aïcha' })).toContain('Boutique en pause pour le moment.');
    expect(etats({ pause: 'Chez Aïcha' }), 'a paused boutique sells nothing: no way in').not.toContain('compte-voir-chez');
    expect(etats('introuvable')).not.toContain('compte-boutique');
    expect(etats({ ...aicha, produits: [] })).toContain('Ces articles ne sont plus en vente dans cette boutique.');
  });

  it('« Mon compte » holds the three lists under their titles, and still ONE primary action', () => {
    const html = renderProfil({ firstName: 'Awa', lastName: 'Ouédraogo', phone: '70 12 34 56' });
    expect(html).toContain('data-role="compte-bloc-commandes"');
    expect(html).toContain('data-role="compte-bloc-panier"');
    expect(html).toContain('data-role="compte-bloc-favoris"');
    expect(html).toContain('Mon panier');
    expect(html).toContain('Mes coups de cœur');
    expect(html).toContain('Bonjour, Awa');
    expect(html.match(/class="primary-action/g)).toHaveLength(1);
  });
});

describe('the account stylesheet rides the tokens', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src', 'compte', 'styles.ts'), 'utf8');
  const main = readFileSync(join(import.meta.dirname, '..', 'src', 'main.ts'), 'utf8');

  it('no colour and no dimension typed by hand — only the 1px hairline', () => {
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(|\bhsla?\(/);
    const dims = [...src.replace(/\$\{[^}]+\}/g, 'TOKEN').matchAll(/\b(\d+(?:\.\d+)?)(px|em|rem|pt)\b/g)].map((m) => m[0]);
    expect(dims.every((d) => d === '1px'), dims.join(' ')).toBe(true);
    expect(src).toContain("from '@platform/ui-tokens'");
  });

  it('the Faso Premium values actually reach the sheet, and the shell injects it — its old copies gone', () => {
    expect(COMPTE_STYLES).toContain(`--cpt-profond: ${pwaColour.deep};`);
    expect(COMPTE_STYLES).toContain(`--cpt-paper: ${sharedColour.paper};`);
    expect(main).toContain('compteStyle.textContent = COMPTE_STYLES;');
    for (const regle of ['.compte {', '.porte-tete {', '.ma-commande {', '.compte-commande {']) {
      expect(main, `${regle} still styled in the shell`).not.toContain(regle);
      expect(COMPTE_STYLES).toContain(regle);
    }
  });
});
