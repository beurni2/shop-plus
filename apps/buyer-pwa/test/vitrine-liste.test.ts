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
  demoListePort,
  garderListe,
  httpListePort,
  listeGardee,
  oublierListe,
  resetListesCache,
  LISTE_TOKEN,
  type ListePublique,
} from '../src/vitrine/liste';
import {
  articlesPourListe,
  articlesPourModif,
  renderListeAmie,
  renderListeBand,
  renderListeCadeaux,
  renderListeFermee,
  renderListeFermerConfirm,
  renderListeHorsLigne,
  renderListeIntrouvable,
  renderListeLien,
  renderListeGeo,
  renderListeGestion,
  renderListeModif,
  renderListeSheet,
  renderListeVoix,
  renderVitrineReady,
} from '../src/vitrine/render';
import { resetFavoritesCache, toggleFavorite } from '../src/vitrine/favorites';
import { noteDepasseLaVoie } from '../src/vitrine/flows';
import { QUARTIERS_OUAGADOUGOU } from '../src/cliente/quartiers-ouagadougou';

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
    expect(band).toContain('data-action="liste-creer"'); // LISTE-REFAIRE — adding AND removing live on this ONE road
    expect(band).not.toContain('liste-modifier'); // the separate edit entry is gone (founder: confusing)
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
    livraison: false,
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

/**
 * LISTE-REFAIRE-2 — no save word (founder: « the word enregistrer and the
 * flow makes it more confusing for someone wanting to remove an item, and
 * also add the option to add an item and make very clear and very simple »),
 * by execution:
 *  · the gestion sheet is two plain sections with ONE VERB PER ROW —
 *    « Retirer » on hers (badge on the given row, épuisé kept), « Ajouter »
 *    on the in-stock rest; NO Enregistrer, NO checkbox, NO name field;
 *  · an empty add section is the honest « Tout est déjà sur votre liste. »;
 *  · every waiting state is designed, with its way out wired;
 *  · the wire sends the exact body — nom rides when given, nothing else;
 *  · the demo port mirrors the door's key + band + nom laws.
 */
describe('the gestion sheet — one verb per row, no save word', () => {
  it('two sections: Retirer on hers (badge on the given, épuisé kept), Ajouter on the in-stock rest', () => {
    const catalogue = articlesPourModif(SF as never, prods([{ pid: 'p3', inStock: false }]) as never);
    const [p1, p2, p3] = [...catalogue.values()];
    const sheet = renderListeGestion(
      [{ p: p1!, offert: true }, { p: p3!, offert: false }], // p3 épuisé mais SUR sa liste
      [p2!],
    );
    expect(sheet).toContain('Sur votre liste');
    expect(sheet).toContain('Ajouter un article');
    expect(sheet).toContain('data-action="liste-retirer" data-pid="p1"');
    expect(sheet).toContain('data-action="liste-retirer" data-pid="p3"'); // épuisé, still removable
    expect(sheet).toContain('data-action="liste-ajouter" data-pid="p2"');
    expect(sheet).not.toContain('data-action="liste-ajouter" data-pid="p3"'); // dead fiche stays un-addable
    expect(sheet).toContain('Déjà offert'); // the given row says so while she decides
    // the badge REPLACES the price on the given row: one badge, two prices
    expect((sheet.match(/vt-liste-offert-badge/g) ?? []).length).toBe(1);
    expect((sheet.match(/vt-liste-row-prix/g) ?? []).length).toBe(2);
    expect(sheet).toContain('Votre lien reste le même.'); // the promise that makes the sheet safe to touch
    // the save-word model is GONE — no commit control, no checkbox, no name field
    expect(sheet).not.toContain('liste-enregistrer');
    expect(sheet).not.toContain('data-liste-pid');
    expect(sheet).not.toContain('data-role="liste-nom"');
    expect(sheet).not.toContain('data-role="liste-tel"');
    expect(sheet).toContain('data-role="liste-alerte"'); // inline refusals, no wall
    expect(sheet).toContain('data-action="liste-fermer"'); // the way out
  });

  it('with nothing left to add, the section says so honestly — never an empty hole', () => {
    const catalogue = articlesPourModif(SF as never, prods() as never);
    const sheet = renderListeGestion([...catalogue.values()].map((p) => ({ p, offert: false })), []);
    expect(sheet).toContain('Tout est déjà sur votre liste.');
    expect(sheet).not.toContain('data-action="liste-ajouter"');
  });

  it('the create sheet is back to creation only: checkboxes, tel field, the create action', () => {
    const sheet = renderListeSheet(articlesPourListe(SF as never, prods() as never), new Set());
    expect(sheet).toContain('data-liste-pid="p1"');
    expect(sheet).toContain('data-role="liste-tel"');
    expect(sheet).toContain('data-action="liste-valider"');
    expect(sheet).not.toContain('liste-enregistrer');
    expect(sheet).not.toContain('liste-retirer');
  });

  it('chargement, hors-ligne and introuvable are designed states with their way out wired', () => {
    expect(renderListeModif({ etape: 'chargement' })).toContain('data-role="liste-modif-attente"');
    const hl = renderListeModif({ etape: 'hors-ligne' });
    expect(hl).toContain('data-role="liste-modif-horsligne"');
    expect(hl).toContain('data-action="liste-creer"'); // retry IS the open action
    expect(hl).not.toContain('data-mode="nouvelle"'); // a blip must not shunt her to a NEW link
    const perdu = renderListeModif({ etape: 'introuvable' });
    expect(perdu).toContain('data-role="liste-modif-introuvable"');
    expect(perdu).toContain('data-action="liste-creer" data-mode="nouvelle"'); // way out: a fresh create
  });

  it('modifier sends the exact body — nom rides when given, stays home when absent — and reads the surviving projection', async () => {
    let sent: { url: string; init: RequestInit | undefined; body: unknown } | undefined;
    const run = async (nom?: string) => {
      const held = globalThis.fetch;
      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        sent = { url, init, body: JSON.parse(String(init?.body)) };
        return Response.json({ ok: true, liste: { nom: 'Rasmata', slug: 's-1', articles: [{ pid: 'p1', offert: true }] } });
      }) as typeof fetch;
      try {
        return await httpListePort('https://svc').modifier('T'.repeat(32), 'E'.repeat(32), ['p1'], nom);
      } finally {
        globalThis.fetch = held;
      }
    };
    const out = await run('Rasmata');
    expect(sent?.url).toBe(`https://svc/listes/${'T'.repeat(32)}`);
    expect(sent?.init?.method).toBe('POST');
    expect(sent?.body).toEqual({ editCle: 'E'.repeat(32), nom: 'Rasmata', pids: ['p1'] });
    expect(out.status).toBe('modifiee');
    if (out.status === 'modifiee') expect(out.liste.articles).toEqual([{ pid: 'p1', offert: true }]);
    await run();
    expect(sent?.body).toEqual({ editCle: 'E'.repeat(32), pids: ['p1'] }); // nom absent = keep the stored name
  });

  it('a refused, thrown or malformed modifier collapses honestly — never an invented success', async () => {
    const run = async (impl: () => Promise<Response>) => {
      const held = globalThis.fetch;
      globalThis.fetch = impl as typeof fetch;
      try {
        return await httpListePort('https://svc').modifier('T'.repeat(32), 'E'.repeat(32), ['p1']);
      } finally {
        globalThis.fetch = held;
      }
    };
    expect((await run(async () => Response.json({ ok: false }, { status: 404 }))).status).toBe('refus');
    expect((await run(async () => { throw new Error('down'); })).status).toBe('hors-ligne');
    expect((await run(async () => Response.json({ ok: true, liste: { nom: 1 } }))).status).toBe('refus');
  });

  it('the demo port mirrors the certified bounds: marks survive on kept pids, nom carries, wrong key refuses', async () => {
    const port = demoListePort();
    const made = await port.creer('s-1', 'Awa', ['p1', 'p2']);
    expect(made.status).toBe('creee');
    if (made.status !== 'creee') return;
    const { token, editCle } = made.liste;
    expect((await port.modifier(token, 'X'.repeat(32), ['p1'])).status).toBe('refus');
    expect((await port.modifier(token, editCle, [])).status).toBe('refus');
    const kept = await port.modifier(token, editCle, ['p2'], 'Rasmata');
    expect(kept.status).toBe('modifiee');
    if (kept.status === 'modifiee') {
      expect(kept.liste.articles).toEqual([{ pid: 'p2', offert: false }]);
      expect(kept.liste.nom).toBe('Rasmata');
    }
    const relu = await port.lire(token);
    expect(relu.status).toBe('liste'); // a regressed lire must FAIL here, never skip the re-read
    if (relu.status === 'liste') expect(relu.liste.articles.map((a) => a.pid)).toEqual(['p2']);
  });
});

/**
 * LISTE-ADRESSE-1 — the private address, client side, by execution:
 *  · the create sheet offers the OPTIONAL block (official quartier list, one
 *    native select) whose aide promises the one thing that matters;
 *  · the wire carries `livraison` as the fifth key ONLY when she filled it —
 *    absent bytes otherwise — and the friend's read reduces it to a STRICT
 *    boolean (a truthy string must never open the pay-only road).
 */
describe('the private address block', () => {
  it('the create sheet carries the block: official quartier select, delivery phone, repère, and the promise', () => {
    const sheet = renderListeSheet(articlesPourListe(SF as never, prods() as never), new Set());
    expect(sheet).toContain('data-role="liste-quartier"');
    expect(sheet).toContain('data-role="liste-tel-livraison"');
    expect(sheet).toContain('data-role="liste-repere"');
    expect(sheet).toContain(`<option value="${QUARTIERS_OUAGADOUGOU[0]}"`); // the OFFICIAL list, not free text
    expect(sheet).toContain('sans jamais voir votre adresse');
  });

  it('creer sends livraison as the fifth key when given, absent bytes when not', async () => {
    let sent: Record<string, unknown> | undefined;
    const run = async (livraison?: { telephone: string; quartier: string; repere: string; zone: string }) => {
      const held = globalThis.fetch;
      globalThis.fetch = (async (_url: string, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          ok: true, token: 'T'.repeat(32), editCle: 'E'.repeat(32),
          liste: { nom: 'Awa', slug: 's-1', articles: [{ pid: 'p1', offert: false }], livraison: livraison !== undefined },
        });
      }) as typeof fetch;
      try {
        return await httpListePort('https://svc').creer('s-1', 'Awa', ['p1'], undefined, livraison);
      } finally {
        globalThis.fetch = held;
      }
    };
    const adresse = { telephone: '70123456', quartier: 'Dassasgo', repere: 'Portail bleu', zone: 'Dassasgo, Ouagadougou' };
    const fait = await run(adresse);
    expect(sent).toEqual({ slug: 's-1', nom: 'Awa', pids: ['p1'], livraison: adresse });
    expect(fait.status).toBe('creee');
    if (fait.status === 'creee') expect(fait.liste.liste.livraison).toBe(true);
    await run();
    expect(Object.keys(sent as Record<string, unknown>).sort()).toEqual(['nom', 'pids', 'slug']);
  });

  it('the read reduces livraison to a STRICT boolean — a truthy string never opens the pay-only road', async () => {
    const run = async (livraison: unknown) => {
      const held = globalThis.fetch;
      globalThis.fetch = (async () =>
        Response.json({ ok: true, liste: { nom: 'A', slug: 's', articles: [], livraison } })) as typeof fetch;
      try {
        return await httpListePort('https://svc').lire('T'.repeat(32));
      } finally {
        globalThis.fetch = held;
      }
    };
    const vrai = await run(true);
    expect(vrai.status).toBe('liste'); // a failed read must FAIL here, never pass vacuously
    if (vrai.status === 'liste') expect(vrai.liste.livraison).toBe(true);
    const menteur = await run('oui');
    expect(menteur.status).toBe('liste');
    if (menteur.status === 'liste') expect(menteur.liste.livraison).toBe(false);
  });
});

describe('the token pin', () => {
  it('is exactly the minted 32-char shape — a mangled param is NO liste', () => {
    expect(LISTE_TOKEN.test('T'.repeat(32))).toBe(true);
    expect(LISTE_TOKEN.test('T'.repeat(31))).toBe(false);
    expect(LISTE_TOKEN.test(`${'T'.repeat(31)}%`)).toBe(false);
  });
});

/**
 * LISTE-CADEAUX + LISTE-FERMER (founder, 2026-08-27) — by execution:
 *  · the card's third quiet road « Mes cadeaux »; the sheet's faces — honest
 *    empty, code big once revealed, attente line before, indisponible when
 *    an order could not answer, NOTHING after livrée;
 *  · the last Retirer ASKS instead of refusing; the farewell face; NO amount
 *    ever renders on the cadeaux sheet (the ?cadeau dignity law);
 *  · the wire adapters: fermer's exact one-key body and its already-closed
 *    re-read (404 + liste gone = fermée · 404 + liste alive = refus, the
 *    handle never abandoned); cadeaux' defensive parse;
 *  · oublierListe forgets ONLY the named boutique's handle, persistently;
 *  · the demo port mirrors the close and the honestly-empty cadeaux.
 */
describe('« Mes cadeaux » and « Fermer ma liste »', () => {
  const withFetch = async <T>(impl: (url: string, init?: RequestInit) => Promise<Response>, run: () => Promise<T>): Promise<T> => {
    const held = globalThis.fetch;
    globalThis.fetch = impl as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = held;
    }
  };

  it('the card gains the third quiet road, wired', () => {
    garderListe('chez-awa-1', GARDEE);
    const band = renderListeBand(SF as never);
    expect(band).toContain('data-action="liste-cadeaux"');
    expect(band).toContain('Mes cadeaux');
  });

  it('the confirm face asks the question IT WAS GIVEN (two roads, one face) with the close primary and the keep whisper; the farewell states what changed', () => {
    const confirm = renderListeFermerConfirm('Retirer le dernier article ferme votre liste. Votre lien ne marchera plus.');
    expect(confirm).toContain('Retirer le dernier article ferme votre liste. Votre lien ne marchera plus.');
    expect(confirm).toContain('data-action="liste-fermer-liste"');
    expect(confirm).toContain('data-action="liste-garder"');
    expect(confirm).toContain('data-role="liste-alerte"');
    const directe = renderListeFermerConfirm('Fermer votre liste ? Votre lien ne marchera plus.');
    expect(directe).toContain('Fermer votre liste ?');
    expect(directe).toContain('data-action="liste-fermer-liste"');
    const adieu = renderListeFermee();
    expect(adieu).toContain('votre liste est fermée');
    expect(adieu).toContain('data-action="liste-fermer"');
  });

  it('LISTE-FERMER-2 — the gestion sheet carries the direct close entry, a row-btn sibling below both sections', () => {
    const catalogue = articlesPourModif(SF as never, prods() as never);
    const [p1] = [...catalogue.values()];
    const sheet = renderListeGestion([{ p: p1!, offert: false }], []);
    expect(sheet).toContain('data-action="liste-fermer-demande"');
    expect(sheet).toContain('Fermer ma liste');
    // the row-btn class is load-bearing: it is what makes the in-flight act
    // disable-and-wake law cover this button with its siblings
    expect(sheet).toContain('vt-liste-row-btn vt-liste-fermer-directe');
    // the entry renders AFTER the add section — a whisper below, never a header
    expect(sheet.indexOf('liste-fermer-demande')).toBeGreaterThan(sheet.indexOf('liste-ajout-vide'));
  });

  it('the cadeaux sheet: empty is honest with the share way forward; hors-ligne retries by the SAME action; introuvable offers the fresh start', () => {
    const vide = renderListeCadeaux({ etape: 'cadeaux', rows: [] });
    expect(vide).toContain('Pas encore de cadeau.');
    expect(vide).toContain('data-action="liste-partager"');
    const hl = renderListeCadeaux({ etape: 'hors-ligne' });
    expect(hl).toContain('data-action="liste-cadeaux"');
    const morte = renderListeCadeaux({ etape: 'introuvable' });
    expect(morte).toContain('data-mode="nouvelle"');
  });

  it('a row: état line from the ?cadeau law; code BIG once revealed with the livreur aide; attente before; nothing after livrée; indisponible without suivi — and never one FCFA byte', () => {
    const rows = [
      { titre: 'Bazin riche', cadeau: { pid: 'p1', suivi: { state: 'confirmed', arrivedAt: 'T-arr' }, code: '123456' } },
      { titre: 'Écharpe', cadeau: { pid: 'p2', suivi: { state: 'confirmed' } } },
      { titre: 'Sac', cadeau: { pid: 'p3', suivi: { state: 'confirmed', livree: true } } },
      { titre: 'Article offert', cadeau: { pid: 'p4' } },
    ] as const;
    const sheet = renderListeCadeaux({ etape: 'cadeaux', rows: rows as never });
    // p1 — revealed: the code, its label, the aide
    expect(sheet).toContain('data-role="cadeau-code"');
    expect(sheet).toContain('123456');
    expect(sheet).toContain('Donnez ce code au livreur.');
    expect(sheet).toContain('Arrivé — remise en cours');
    // p2 — not yet: the honest attente
    expect(sheet).toContain('data-role="cadeau-attente-code"');
    // p3 — livrée: état says it, and the row carries neither code nor attente
    expect(sheet).toContain('Livré');
    expect((sheet.match(/data-role="cadeau-attente-code"/g) ?? []).length).toBe(1);
    expect((sheet.match(/data-role="cadeau-code"/g) ?? []).length).toBe(1);
    // p4 — the order could not answer: honest, never a dead row
    expect(sheet).toContain('data-role="cadeau-indisponible"');
    // the ?cadeau dignity law, held here too
    expect(sheet).not.toContain('FCFA');
  });

  it('fermer sends the exact one-key body to the fermer door', async () => {
    let sent: { url: string; body: unknown } | undefined;
    const out = await withFetch(
      async (url, init) => {
        sent = { url, body: JSON.parse(String(init?.body)) };
        return Response.json({ ok: true });
      },
      () => httpListePort('https://svc').fermer('T'.repeat(32), 'E'.repeat(32)),
    );
    expect(sent?.url).toBe(`https://svc/listes/${'T'.repeat(32)}/fermer`);
    expect(sent?.body).toEqual({ editCle: 'E'.repeat(32) });
    expect(out.status).toBe('fermee');
  });

  it("fermer's uniform 404 is told apart by ONE public re-read: liste gone = fermée (a retried tap lands), liste alive = refus (the handle is never abandoned)", async () => {
    const deja = await withFetch(
      async (url) =>
        url.endsWith('/fermer')
          ? Response.json({ ok: false, reason: 'not_found' }, { status: 404 })
          : Response.json({ ok: false, reason: 'not_found' }, { status: 404 }),
      () => httpListePort('https://svc').fermer('T'.repeat(32), 'E'.repeat(32)),
    );
    expect(deja.status).toBe('fermee');
    const vivante = await withFetch(
      async (url) =>
        url.endsWith('/fermer')
          ? Response.json({ ok: false, reason: 'not_found' }, { status: 404 })
          : Response.json({ ok: true, liste: { nom: 'Awa', slug: 's', articles: [{ pid: 'p1', offert: false }] } }),
      () => httpListePort('https://svc').fermer('T'.repeat(32), 'X'.repeat(32)),
    );
    expect(vivante.status).toBe('refus');
    const coupee = await withFetch(
      async () => { throw new Error('down'); },
      () => httpListePort('https://svc').fermer('T'.repeat(32), 'E'.repeat(32)),
    );
    expect(coupee.status).toBe('hors-ligne');
  });

  it('cadeaux sends the exact one-key body and parses defensively: junk rows degrade to their pid, junk answers to introuvable', async () => {
    let sent: { url: string; body: unknown } | undefined;
    const out = await withFetch(
      async (url, init) => {
        sent = { url, body: JSON.parse(String(init?.body)) };
        return Response.json({
          ok: true, nom: 'Awa',
          cadeaux: [
            { pid: 'p1', suivi: { state: 'confirmed', arrivedAt: 'T' }, code: '654321' },
            { pid: 'p2', suivi: { state: 7 } },
            { pid: 'p3', code: 42 },
            { suivi: { state: 'confirmed' } },
          ],
        });
      },
      () => httpListePort('https://svc').cadeaux('T'.repeat(32), 'E'.repeat(32)),
    );
    expect(sent?.url).toBe(`https://svc/listes/${'T'.repeat(32)}/cadeaux`);
    expect(sent?.body).toEqual({ editCle: 'E'.repeat(32) });
    expect(out.status).toBe('cadeaux');
    if (out.status === 'cadeaux') {
      expect(out.cadeaux).toEqual([
        { pid: 'p1', suivi: { state: 'confirmed', arrivedAt: 'T' }, code: '654321' },
        { pid: 'p2' },
        { pid: 'p3' },
      ]);
    }
    expect(
      (await withFetch(async () => Response.json({ ok: false }, { status: 404 }), () => httpListePort('https://svc').cadeaux('T'.repeat(32), 'E'.repeat(32)))).status,
    ).toBe('introuvable');
    expect(
      (await withFetch(async () => { throw new Error('down'); }, () => httpListePort('https://svc').cadeaux('T'.repeat(32), 'E'.repeat(32)))).status,
    ).toBe('hors-ligne');
  });

  it('oublierListe forgets ONLY the named boutique, persistently', () => {
    garderListe('chez-awa-1', GARDEE);
    garderListe('chez-binta-2', { ...GARDEE, token: 'U'.repeat(32) });
    oublierListe('chez-awa-1');
    expect(listeGardee('chez-awa-1')).toBeUndefined();
    expect(listeGardee('chez-binta-2')?.token).toBe('U'.repeat(32));
    resetListesCache(); // a fresh load reads storage — the forget PERSISTED
    expect(listeGardee('chez-awa-1')).toBeUndefined();
    expect(listeGardee('chez-binta-2')?.token).toBe('U'.repeat(32));
  });

  it('the demo port mirrors the close (wrong key refused, gone is gone, a replay lands fermée) and the honestly-empty cadeaux', async () => {
    const port = demoListePort();
    const made = await port.creer('s-1', 'Awa', ['p1']);
    expect(made.status).toBe('creee');
    if (made.status !== 'creee') return;
    const { token, editCle } = made.liste;
    expect((await port.cadeaux(token, 'X'.repeat(32))).status).toBe('introuvable');
    const cadeaux = await port.cadeaux(token, editCle);
    expect(cadeaux).toEqual({ status: 'cadeaux', nom: 'Awa', cadeaux: [] });
    expect((await port.fermer(token, 'X'.repeat(32))).status).toBe('refus');
    expect((await port.lire(token)).status).toBe('liste');
    expect((await port.fermer(token, editCle)).status).toBe('fermee');
    expect((await port.lire(token)).status).toBe('introuvable');
    expect((await port.fermer(token, editCle)).status).toBe('fermee'); // the replay
  });
});

/**
 * LISTE-VOIX (founder, 2026-08-27: « on the repère add the audio option ») —
 * by execution: the four faces of the recorded repère; the sheet embeds the
 * rest face; the wire carries the bytes INSIDE livraison and parses the
 * service's create-only `noteVocale`; the celebration speaks the one loss.
 */
describe('the recorded repère', () => {
  const withFetch = async <T>(impl: (url: string, init?: RequestInit) => Promise<Response>, run: () => Promise<T>): Promise<T> => {
    const held = globalThis.fetch;
    globalThis.fetch = impl as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = held;
    }
  };

  it('the four faces: rest offers the record road; recording ticks with its way out; recorded offers replay/refaire/supprimer; refus is honest', () => {
    const repos = renderListeVoix({ etape: 'repos' });
    expect(repos).toContain('data-action="liste-voix-demarrer"');
    expect(repos).toContain('Enregistrer un repère vocal');
    const rec = renderListeVoix({ etape: 'enregistre', duree: '0:07' });
    expect(rec).toContain('data-action="liste-voix-arreter"');
    expect(rec).toContain('data-role="liste-voix-duree"');
    expect(rec).toContain('0:07');
    const faite = renderListeVoix({ etape: 'faite', duree: '0:12' });
    expect(faite).toContain('data-action="liste-voix-lire"');
    expect(faite).toContain('aria-label="Écouter"');
    expect(faite).toContain('Note vocale enregistrée');
    expect(faite).toContain('0:12');
    expect(faite).toContain('data-action="liste-voix-demarrer"'); // refaire = re-record
    expect(faite).toContain('data-action="liste-voix-supprimer"');
    const refus = renderListeVoix({ etape: 'refus' });
    expect(refus).toContain('Le micro n\'est pas disponible.');
    expect(refus).not.toContain('data-action'); // the typed repère is the road
  });

  it('the create sheet embeds the rest face inside the address block', () => {
    const sheet = renderListeSheet(articlesPourListe(SF as never, prods() as never), new Set());
    expect(sheet).toContain('data-role="liste-voix-slot"');
    expect(sheet).toContain('data-action="liste-voix-demarrer"');
    // the slot sits with the address block, after the repère input
    expect(sheet.indexOf('liste-voix-slot')).toBeGreaterThan(sheet.indexOf('data-role="liste-repere"'));
  });

  it('the wire carries the bytes INSIDE livraison, and the service\'s noteVocale reaches the creee outcome — junk shapes dropped', async () => {
    let sent: Record<string, unknown> | undefined;
    const out = await withFetch(
      async (_url, init) => {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          ok: true, token: 'T'.repeat(32), editCle: 'E'.repeat(32),
          liste: { nom: 'Awa', slug: 's-1', articles: [{ pid: 'p1', offert: false }] },
          noteVocale: 'perdue',
        });
      },
      () => httpListePort('https://svc').creer('s-1', 'Awa', ['p1'], undefined, {
        telephone: '70 12 34 56', quartier: 'Dassasgo', repere: '', zone: 'Dassasgo, Ouagadougou', audioB64: 'AAAA',
      }),
    );
    expect((sent?.['livraison'] as Record<string, unknown>)['audioB64']).toBe('AAAA');
    expect(out.status).toBe('creee');
    if (out.status === 'creee') expect(out.noteVocale).toBe('perdue');
    const sans = await withFetch(
      async () => Response.json({
        ok: true, token: 'T'.repeat(32), editCle: 'E'.repeat(32),
        liste: { nom: 'Awa', slug: 's-1', articles: [] }, noteVocale: 'peut-etre',
      }),
      () => httpListePort('https://svc').creer('s-1', 'Awa', ['p1']),
    );
    if (sans.status === 'creee') expect(sans.noteVocale).toBeUndefined();
  });

  it('the celebration speaks the ONE loss — and only when it happened', () => {
    const perdue = renderListeLien('https://x/v/s?liste=T', true);
    expect(perdue).toContain('data-role="liste-note-perdue"');
    expect(perdue).toContain('n\'a pas pu être gardée');
    const gardee = renderListeLien('https://x/v/s?liste=T');
    expect(gardee).not.toContain('data-role="liste-note-perdue"');
  });
});

describe('LISTE-VOIX — the wire bound, mirrored pure', () => {
  it('noteDepasseLaVoie refuses at exactly the door\'s own boundary — same operator, same constant', () => {
    expect(noteDepasseLaVoie(1_400_000)).toBe(false); // the door accepts AT the bound
    expect(noteDepasseLaVoie(1_400_001)).toBe(true);  // one char over refuses
    expect(noteDepasseLaVoie(1_200_000)).toBe(false); // a full 5-minute voice-bitrate note fits
  });
});

describe('GEO-ACHAT-1 (liste half) — the position block faces, and its slot in the create sheet', () => {
  it('the create sheet carries the geo slot on the quiet offer, below the voice road', () => {
    const sheet = renderListeSheet(articlesPourListe(SF as never, prods() as never), new Set());
    expect(sheet).toContain('data-role="liste-geo-slot"');
    expect(sheet).toContain('data-action="liste-geo-demander"');
    expect(sheet.indexOf('liste-geo-slot')).toBeGreaterThan(sheet.indexOf('liste-voix-slot'));
  });

  it('the four faces speak their catalog words — consent on the kept pin, a total Retirer, a refusal that apologises for nothing', () => {
    expect(renderListeGeo('repos')).toContain('Ajouter ma position');
    const cours = renderListeGeo('encours');
    expect(cours).toContain('data-role="liste-geo-cours"');
    expect(cours).toContain('Recherche de votre position…');
    const faite = renderListeGeo('faite');
    expect(faite).toContain('data-role="liste-geo-faite"');
    expect(faite).toContain('Position ajoutée. Seul votre livreur la voit.');
    expect(faite).toContain('data-action="liste-geo-retirer"');
    const refus = renderListeGeo('refus');
    expect(refus).toContain('data-role="liste-geo-refus"');
    expect(refus).toContain('Votre repère écrit suffit.');
    expect(refus).not.toContain('data-action="liste-geo-demander"');
  });

  it('GEO-CARTE-PRO — the carte face wears the reference anatomy: full-bleed view, fixed pin, the pill, floating × + recentre, live coordinates, one confirm', () => {
    const carte = renderListeGeo('carte', { lat: 12.371532, lng: -1.519931 });
    expect(carte).toContain('data-role="liste-geo-carte"');
    // The view she drags: the tile layer, the centre pin, the instruction.
    expect(carte).toContain('data-role="geo-vue"');
    expect(carte).toContain('data-role="geo-tuiles"');
    expect(carte).toContain('vt-geo-epingle');
    expect(carte).toContain('Déplacez la carte pour placer le point');
    // Floating chrome: the × way out and the viseur back to her fix.
    expect(carte).toContain('data-action="liste-geo-carte-annuler"');
    expect(carte).toContain('data-action="liste-geo-recentrer"');
    expect(carte).toContain('aria-label="Revenir à ma position"');
    // The sheet: coordinates spoken (five decimals), one primary confirm in
    // the reference's own words; the credit rides the tiles, never the
    // retired embed.
    expect(carte).toContain('data-role="geo-coords"');
    expect(carte).toContain('12.37153, -1.51993');
    expect(carte).toContain('data-action="liste-geo-confirmer"');
    expect(carte).toContain('Confirmer ce lieu');
    expect(carte).toContain('© OpenStreetMap');
    expect(carte).not.toContain('openstreetmap.org/export/embed.html');
    expect(carte).not.toContain('<iframe');
    // Behind the question the slot keeps the searching face — never a kept
    // pin she has not confirmed.
    expect(carte).toContain('data-role="liste-geo-cours"');
    expect(carte).not.toContain('data-role="liste-geo-faite"');
    // No candidate, no overlay: a carte face cannot paint on coordinates it
    // does not have.
    const sansFix = renderListeGeo('carte', null);
    expect(sansFix).not.toContain('data-role="liste-geo-carte"');
  });

  it('GEO-CARTE-PRO — the sheet\'s quartier and repère are MIRRORS, seeded from what the real fields hold', () => {
    const carte = renderListeGeo(
      'carte',
      { lat: 12.371532, lng: -1.519931 },
      { quartier: 'Gounghin', repere: 'Face à la pharmacie' },
    );
    // Dedicated roles — the real nodes behind the face keep their own, so
    // `liste-valider` still reads the one source of truth.
    expect(carte).toContain('data-role="liste-carte-quartier"');
    expect(carte).toContain('data-role="liste-carte-repere"');
    expect(carte).not.toContain('data-role="liste-quartier"');
    expect(carte).not.toContain('data-role="liste-repere"');
    // Seeded with her current answers.
    expect(carte).toContain('value="Gounghin" selected');
    expect(carte).toContain('value="Face à la pharmacie"');
  });
});
