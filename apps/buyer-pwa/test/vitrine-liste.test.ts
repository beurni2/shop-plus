// node env has no localStorage; the liste store needs the same fake the
// panier tests pin — installed BEFORE the imports read it.
const __m = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => __m.get(k) ?? null,
  setItem: (k: string, v: string) => void __m.set(k, v),
  removeItem: (k: string) => void __m.delete(k),
  clear: () => __m.clear(),
  key: (i: number) => [...__m.keys()][i] ?? null,
  get length() { return __m.size; },
} as Storage;
import { beforeEach, describe, expect, it } from 'vitest';
import {
  garderListe,
  httpListePort,
  listeGardee,
  resetListesCache,
  LISTE_TOKEN,
  type ListePublique,
} from '../src/vitrine/liste';
import {
  articlesPourListe,
  renderListeAmie,
  renderListeBand,
  renderListeHorsLigne,
  renderListeIntrouvable,
  renderListeLien,
  renderListeSheet,
  renderVitrineReady,
} from '../src/vitrine/render';
import { resetFavoritesCache, toggleFavorite } from '../src/vitrine/favorites';

/**
 * LISTE-ENVIES-1 — the wishlist's client law, by execution:
 *  · the creator's band renders from the device-local record (invitation ↔
 *    her liste's card), the friend's banner from the service projection;
 *  · « offert » is DISPLAYED truth — the badge renders exactly when the
 *    service said true, and an offert card carries NO order action;
 *  · the wire adapter refuses to invent: non-ok is a refusal, a thrown fetch
 *    is hors-ligne, and a malformed 200 is introuvable — never a crash.
 */

const SF = {
  id: 'sf-l', resellerId: 'rs-l', slug: 'chez-awa-1',
  name: 'Chez Awa', zone: 'Dassasgho, Ouagadougou', category: 'Général',
  tagline: '', bio: '', theme: 'foret' as const,
  cover: { status: 'none' as const },
  avatar: { mode: 'monogram' as const },
  curatedItems: ['p1', 'p2', 'p3'], featuredItems: [], sections: [],
  discoverable: true, createdAt: 'T', updatedAt: 'T',
};
const TRUST = { deliveredCount: 3, rating: '', reviewCount: 0, demo: false };
const prods = (over: Partial<{ pid: string; inStock: boolean }>[] = []) =>
  ['p1', 'p2', 'p3'].map((pid, i) => ({
    pid, name: `Article ${i + 1}`, priceFcfa: 1_000 * (i + 1),
    inStock: true, assetRefs: [],
    ...(over.find((o) => o.pid === pid) ?? {}),
  }));

const GARDEE = {
  token: 'T'.repeat(32), editCle: 'E'.repeat(32),
  nom: 'Awa', pids: ['p1', 'p2'], createdAt: 'T',
};

beforeEach(() => {
  resetListesCache();
  resetFavoritesCache();
  localStorage.clear();
});

describe('the creator band — invitation, then her liste', () => {
  it('with no record it invites, with one primary action wired', () => {
    const band = renderListeBand(SF as never);
    expect(band).toContain('data-role="vitrine-liste-inviter"');
    expect(band).toContain('data-action="liste-creer"');
    expect(band).toContain("Liste d'envies");
  });

  it('with a record it shows HER liste — nom, count, share first, refaire second', () => {
    garderListe('chez-awa-1', GARDEE);
    const band = renderListeBand(SF as never);
    expect(band).toContain('data-role="vitrine-liste-carte"');
    expect(band).toContain('La liste de Awa · 2 envies');
    expect(band).toContain('data-action="liste-partager"');
    expect(band).toContain('data-action="liste-creer"'); // « refaire » rides the same sheet
  });

  it('the record survives a fresh load and never bleeds across boutiques', () => {
    garderListe('chez-awa-1', GARDEE);
    resetListesCache(); // a new visit
    expect(listeGardee('chez-awa-1')?.token).toBe(GARDEE.token);
    expect(listeGardee('chez-binta-2')).toBeUndefined();
  });

  it('the slot is reserved on every ready render (flows fills it after mount)', () => {
    const page = renderVitrineReady(SF as never, TRUST as never, {} as never, {}, prods() as never, 'classique');
    expect(page).toContain('data-role="vitrine-liste-slot"');
  });
});

describe('the builder sheet', () => {
  it('offers IN-STOCK articles only, prechecks her hearts, and carries nom + one primary action', () => {
    toggleFavorite('p2');
    const sheet = renderListeSheet(
      articlesPourListe(SF as never, prods([{ pid: 'p3', inStock: false }]) as never),
      new Set(['p2']),
    );
    expect(sheet).toContain('data-liste-pid="p1"');
    expect(sheet).toContain('data-liste-pid="p2" checked');
    expect(sheet).not.toContain('data-liste-pid="p3"'); // épuisé — never offered
    expect(sheet).toContain('data-role="liste-nom"');
    expect(sheet).toContain('data-action="liste-valider"');
    expect(sheet).toContain('data-action="liste-fermer"'); // the way out
    expect(sheet).toContain('data-role="liste-alerte"'); // inline refusals, no wall
    // LISTE-MERCI — the WhatsApp opt-in is ONE optional field (filling it IS
    // the choice), labelled facultatif, tel-shaped for the phone keyboard.
    expect(sheet).toContain('data-role="liste-tel"');
    expect(sheet).toContain('type="tel"');
    expect(sheet).toContain('facultatif');
  });

  it('the link-ready face SHOWS the link and wires share + copier with the exact bytes', () => {
    const lien = 'https://beurni2.github.io/shop-plus/v/chez-awa-1?liste=' + 'T'.repeat(32);
    const face = renderListeLien(lien);
    expect(face).toContain(`<v>${lien}</v>`);
    expect(face).toContain(`data-action="liste-partager" data-lien="${lien}"`);
    expect(face).toContain(`data-action="liste-copier" data-lien="${lien}"`);
  });
});

describe("the friend's banner — displayed truth, never computed here", () => {
  const liste: ListePublique = {
    nom: 'Awa', slug: 'chez-awa-1',
    articles: [
      { pid: 'p1', offert: true },
      { pid: 'p2', offert: false },
      { pid: 'p3', offert: false },
    ],
  };

  it('an offert article wears the badge and offers NO action; an ungiven one opens its fiche', () => {
    const band = renderListeAmie(liste, SF as never, prods([{ pid: 'p3', inStock: false }]) as never);
    expect(band).toContain('La liste de Awa');
    const cartes = band.split('data-role="liste-article"');
    const p1 = cartes[1]!;
    expect(p1).toContain('Déjà offert');
    expect(p1).not.toContain('data-action="liste-produit"');
    const p2 = cartes[2]!;
    expect(p2).toContain('data-action="liste-produit" data-pid="p2"');
    expect(p2).toContain('Offrir');
    // épuisé — veiled, no action, and it does not count toward « tout »
    // (the epuise class rides the card's OPEN tag, before the split marker)
    const p3 = cartes[3]!;
    expect(band).toContain('vt-pan-card-epuise');
    expect(p3).toContain('ÉPUISÉ');
    expect(p3).not.toContain('data-action="liste-produit"');
    expect(band).toContain('data-action="liste-tout-panier"');
  });

  it('with every wish given, « tout mettre au panier » disappears (a dead button would lie)', () => {
    const toutOffert: ListePublique = { ...liste, articles: [{ pid: 'p1', offert: true }] };
    const band = renderListeAmie(toutOffert, SF as never, prods() as never);
    expect(band).not.toContain('data-action="liste-tout-panier"');
  });

  it('a liste whose every pid was delisted collapses to the honest introuvable', () => {
    const fantome: ListePublique = { ...liste, articles: [{ pid: 'zz', offert: false }] };
    expect(renderListeAmie(fantome, SF as never, prods() as never)).toContain('data-role="vitrine-liste-introuvable"');
  });

  it('the three waiting states are designed, and hors-ligne carries its retry', () => {
    expect(renderListeIntrouvable()).toContain("n'existe pas");
    const hl = renderListeHorsLigne();
    expect(hl).toContain('Pas de connexion');
    expect(hl).toContain('data-action="liste-reessayer"');
  });
});

describe('httpListePort — the wire refuses to invent', () => {
  const withFetch = async <T>(impl: (url: string, init?: RequestInit) => Promise<Response>, run: () => Promise<T>): Promise<T> => {
    const held = globalThis.fetch;
    globalThis.fetch = impl as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = held;
    }
  };

  it('creer sends the exact three-key body and reads the created handle', async () => {
    let sent: { url: string; body: unknown } | undefined;
    const out = await withFetch(
      async (url, init) => {
        sent = { url, body: JSON.parse(String(init?.body)) };
        return Response.json({
          ok: true, token: 'T'.repeat(32), editCle: 'E'.repeat(32),
          liste: { nom: 'Awa', slug: 's-1', articles: [{ pid: 'p1', offert: false }] },
        });
      },
      () => httpListePort('https://svc').creer('s-1', 'Awa', ['p1']),
    );
    expect(sent?.url).toBe('https://svc/listes');
    expect(sent?.body).toEqual({ slug: 's-1', nom: 'Awa', pids: ['p1'] });
    expect(out.status).toBe('creee');
    if (out.status === 'creee') expect(out.liste.token).toBe('T'.repeat(32));
  });

  it('LISTE-MERCI — a given telephone rides as the fourth key; an absent one is absent bytes', async () => {
    let sent: unknown;
    await withFetch(
      async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return Response.json({ ok: true, token: 'T'.repeat(32), editCle: 'E'.repeat(32), liste: { nom: 'Awa', slug: 's-1', articles: [] } });
      },
      () => httpListePort('https://svc').creer('s-1', 'Awa', ['p1'], '70 12 34 56'),
    );
    expect(sent).toEqual({ slug: 's-1', nom: 'Awa', pids: ['p1'], telephone: '70 12 34 56' });
    await withFetch(
      async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return Response.json({ ok: true, token: 'T'.repeat(32), editCle: 'E'.repeat(32), liste: { nom: 'Awa', slug: 's-1', articles: [] } });
      },
      () => httpListePort('https://svc').creer('s-1', 'Awa', ['p1'], ''),
    );
    expect(Object.keys(sent as Record<string, unknown>).sort()).toEqual(['nom', 'pids', 'slug']);
  });

  it('a refusal is a refusal, a thrown fetch is hors-ligne, a malformed 200 is introuvable-class', async () => {
    expect(
      (await withFetch(async () => Response.json({ ok: false }, { status: 422 }), () => httpListePort('https://svc').creer('s', 'A', ['p']))).status,
    ).toBe('refus');
    expect(
      (await withFetch(async () => { throw new Error('down'); }, () => httpListePort('https://svc').creer('s', 'A', ['p']))).status,
    ).toBe('hors-ligne');
    expect(
      (await withFetch(async () => Response.json({ ok: true, liste: { nom: 1 } }), () => httpListePort('https://svc').lire('T'.repeat(32)))).status,
    ).toBe('introuvable');
  });

  it('lire coerces offert to a STRICT boolean — a truthy string from a bug is false, never a shown gift', async () => {
    const out = await withFetch(
      async () => Response.json({ ok: true, liste: { nom: 'A', slug: 's', articles: [{ pid: 'p1', offert: 'oui' }] } }),
      () => httpListePort('https://svc').lire('T'.repeat(32)),
    );
    expect(out.status).toBe('liste');
    if (out.status === 'liste') expect(out.liste.articles[0]!.offert).toBe(false);
  });
});

describe('the token pin', () => {
  it('is exactly the minted 32-char shape — a mangled param is NO liste', () => {
    expect(LISTE_TOKEN.test('T'.repeat(32))).toBe(true);
    expect(LISTE_TOKEN.test('T'.repeat(31))).toBe(false);
    expect(LISTE_TOKEN.test(`${'T'.repeat(31)}%`)).toBe(false);
  });
});
