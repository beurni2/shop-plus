import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route } from './rendu';
import { resetFiles } from './doubles/expo-file-system';

/**
 * ═══ RENDU-RÉEL — PROFIL-REVENDEUR-1 (founder, 2026-08-25: « create a profile
 * tab and screen where resellers can view and modify their registration data
 * and their rayons as well ») ═══
 *
 * The four questions, walked on the mounted App:
 *   · did the tree survive the tap — the dock tab and the accueil header both
 *     reach the screen, and the screen shows HER data from the wire;
 *   · is the primary action present AND pressable AND wired — each section's
 *     « Enregistrer » POSTs EXACTLY its own fields (absent means untouched);
 *   · does an act that fails leave a way out — a refused current password
 *     speaks and the button stays pressable; a dead wire offers a retry that
 *     actually re-calls;
 *   · can she reach the next step — the saved answer lands back on screen.
 *
 * The /reseller/profile double is CONTRACT-CERTIFIED against the deployed
 * bundle's own bounds (accounts.e2e — PROFIL-REVENDEUR-1 describes): 200
 * answers carry accountId/name/email/phone/state(+categories), a wrong current
 * password answers 401 {reason:'bad_password'}, and a patch's absent fields
 * stay untouched.
 */

const CAT = { A: 'Mode femme', B: 'Sacs', C: 'Poussette', D: 'Chaussures', E: 'Vase', F: 'Coiffeuse' } as const;
const FEED: readonly { pv: string; nom: string; cat: string }[] = [
  { pv: 'pv-ap', nom: 'Bazin riche', cat: CAT.A },
  { pv: 'pv-bp', nom: 'Sac en cuir', cat: CAT.B },
  { pv: 'pv-cp', nom: 'Poussette double', cat: CAT.C },
  { pv: 'pv-dp', nom: 'Escarpins', cat: CAT.D },
  { pv: 'pv-ep', nom: 'Vase émaillé', cat: CAT.E },
  { pv: 'pv-fp', nom: 'Coiffeuse dorée', cat: CAT.F },
];

const SESSION = 'SPS-AAAA-BBBB-CCCC-DDDD';

interface ProfilServeur {
  accountId: string;
  name: string;
  email: string;
  phone: string;
  state: string;
  categories?: readonly string[];
}

function profilInitial(categories?: readonly string[]): ProfilServeur {
  return {
    accountId: 'rs-7777', name: 'Awa Traoré', email: 'awa@example.bf', phone: '70 11 22 33',
    state: 'active', ...(categories !== undefined ? { categories } : {}),
  };
}

/**
 * The account book double, stateful like the real one: a patch merges, a read
 * echoes the record. `refuserMdp` makes the next password change answer the
 * service's own 401 {bad_password} (certified: accounts.e2e).
 */
function routes(serveur: ProfilServeur, drapeaux: { refuserMdp?: boolean; profilMort?: boolean } = {}): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? {
            status: 200,
            json: {
              offers: FEED.map((f) => ({
                productVersionId: f.pv, offerVersion: 'ov-1', basePrice: 10_000, resellerCommission: 1_000,
                available: 5, productName: f.nom, assetRefs: [], category: f.cat,
              })),
              diagnostic: { status: 'ok', refusals: [] },
            },
          }
        : null,
    (path) =>
      path === '/reseller/session'
        ? {
            status: 200,
            json: {
              ok: true, accountId: serveur.accountId, name: serveur.name, state: serveur.state,
              ...(serveur.categories !== undefined ? { categories: serveur.categories } : {}),
            },
          }
        : null,
    (path, body) => {
      if (path !== '/reseller/profile') return null;
      if (drapeaux.profilMort === true) return { status: 503, json: { ok: false, reason: 'accounts_unavailable' } };
      if (body?.['currentPassword'] !== undefined || body?.['newPassword'] !== undefined) {
        if (drapeaux.refuserMdp === true) return { status: 401, json: { ok: false, reason: 'bad_password' } };
      }
      if (typeof body?.['name'] === 'string') serveur.name = body['name'];
      if (typeof body?.['phone'] === 'string') serveur.phone = body['phone'];
      if (typeof body?.['email'] === 'string') serveur.email = body['email'];
      if (Array.isArray(body?.['categories'])) {
        const cats = body['categories'] as string[];
        if (cats.length > 0) serveur.categories = cats;
        else delete serveur.categories;
      }
      return {
        status: 200,
        json: {
          ok: true, accountId: serveur.accountId, name: serveur.name, email: serveur.email,
          phone: serveur.phone, state: serveur.state,
          ...(serveur.categories !== undefined ? { categories: serveur.categories } : {}),
        },
      };
    },
    (path) => (path === '/storefronts' ? { status: 200, json: [] as never } : null),
  ];
}

async function seedCompte(categories?: readonly string[]): Promise<void> {
  const { expoAccessCodeStore } = await import('../src/sales/code-store');
  await expoAccessCodeStore('reseller-compte.v1.txt').write(
    JSON.stringify({ accountId: 'rs-7777', name: 'Awa Traoré', state: 'active', ...(categories !== undefined ? { categories } : {}) }),
  );
  // The session bearer lives in the SAME durable store the feed reads.
  await expoAccessCodeStore().write(SESSION);
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  vi.useRealTimers();
});

describe('PROFIL-REVENDEUR-1 — the tab reaches HER page, and the page shows the BOOK, not the disk', () => {
  it('the dock tab opens the screen; name, account id, email, phone and state land from /reseller/profile', async () => {
    await seedCompte([CAT.A]);
    const serveur = profilInitial([CAT.A]);
    const fils = wire(routes(serveur));
    const screen = await mountApp();

    expect(screen.canPress('Profil')).toBe(true);
    await screen.press('Profil');

    expect(screen.shows('Mon profil')).toBe(true);
    expect(screen.shows('Awa Traoré')).toBe(true);
    expect(screen.shows('Compte rs-7777')).toBe(true);
    expect(screen.shows('Compte actif')).toBe(true);
    // Email and phone are the SERVER's answer — the compte file stores neither.
    const lecture = fils.calls.find((c) => c.path === '/reseller/profile');
    expect(lecture, 'the profile must have been read').toBeDefined();
    expect(lecture!.body).toEqual({}); // a read sends NOTHING — absent means untouched
    const infos = screen.tree.root.findAllByType('TextInput' as never).map((i) => String(i.props['value']));
    expect(infos).toContain('Awa Traoré');
    expect(infos).toContain('70 11 22 33');
    expect(infos).toContain('awa@example.bf');
    screen.unmount();
  });

  it('the accueil header (monogram + name) walks the journey edge to the same screen', async () => {
    await seedCompte();
    const serveur = profilInitial();
    wire(routes(serveur));
    const screen = await mountApp();

    expect(screen.canPress('Voir mon profil')).toBe(true);
    await screen.press('Voir mon profil');
    expect(screen.shows('Mon profil')).toBe(true);
    expect(screen.shows('Mes informations')).toBe(true);
    screen.unmount();
  });

  it('no compte on the device: the honest empty state, and NOT one profile read', async () => {
    const serveur = profilInitial();
    const fils = wire(routes(serveur));
    const screen = await mountApp();

    await screen.press('Profil');
    expect(screen.shows('Pas encore de compte')).toBe(true);
    expect(screen.shows('Quand vous aurez un compte, votre profil vivra ici.')).toBe(true);
    expect(fils.calls.some((c) => c.path === '/reseller/profile')).toBe(false);
    screen.unmount();
  });

  it('a dead wire is a designed state: the sentence, and a retry that actually RE-CALLS', async () => {
    await seedCompte();
    const serveur = profilInitial();
    const drapeaux = { profilMort: true };
    const fils = wire(routes(serveur, drapeaux));
    const screen = await mountApp();

    await screen.press('Profil');
    expect(screen.shows('Pas de réseau. Réessayez dès que ça revient.')).toBe(true);
    expect(screen.canPress('Vérifier à nouveau')).toBe(true);

    // The wire comes back; her retry must actually go ask again.
    drapeaux.profilMort = false;
    await screen.press('Vérifier à nouveau');
    expect(fils.calls.filter((c) => c.path === '/reseller/profile').length).toBe(2);
    expect(screen.shows('Mes informations')).toBe(true);
    expect(screen.shows('Vérifier à nouveau')).toBe(false);
    screen.unmount();
  });
});

describe('PROFIL-REVENDEUR-1 — each section saves ALONE, and a refusal leaves a way out', () => {
  it('« Mes informations » POSTs exactly {name, phone, email} — no rayons, no password riding — and the fresh answer lands', async () => {
    await seedCompte([CAT.A]);
    const serveur = profilInitial([CAT.A]);
    const fils = wire(routes(serveur));
    const screen = await mountApp();
    await screen.press('Profil');

    await screen.type('Awa Ouédraogo', 'Votre nom');
    await screen.type('76 55 44 33', 'Votre numéro WhatsApp');
    await screen.press('Enregistrer', 0);

    const sauve = fils.calls.filter((c) => c.path === '/reseller/profile')[1];
    expect(sauve, 'the save must have been sent').toBeDefined();
    expect(sauve!.body).toEqual({ name: 'Awa Ouédraogo', phone: '76 55 44 33', email: 'awa@example.bf' });
    expect(screen.shows("C'est enregistré.")).toBe(true);
    expect(screen.shows('Awa Ouédraogo')).toBe(true); // the identity card follows the book
    screen.unmount();
  });

  it('« Vos rayons »: five is the cap AND the sixth tap speaks; the save carries exactly her final picks', async () => {
    await seedCompte([CAT.A, CAT.B, CAT.C, CAT.D, CAT.E]);
    const serveur = profilInitial([CAT.A, CAT.B, CAT.C, CAT.D, CAT.E]);
    const fils = wire(routes(serveur));
    const screen = await mountApp();
    await screen.press('Profil');

    // Full at five: the sixth does not die silently.
    await screen.press(CAT.F);
    expect(screen.shows('Vous avez déjà 5 rayons. Retirez-en un pour en choisir un autre.')).toBe(true);
    // She swaps E for F and saves.
    await screen.press(CAT.E);
    await screen.press(CAT.F);
    await screen.press('Enregistrer', 1);

    const sauve = fils.calls.filter((c) => c.path === '/reseller/profile')[1];
    expect(sauve!.body).toEqual({ categories: [CAT.A, CAT.B, CAT.C, CAT.D, CAT.F] });
    expect(screen.shows("C'est enregistré.")).toBe(true);
    screen.unmount();
  });

  it('the password road: a wrong CURRENT speaks and stays retryable; the right one saves {currentPassword, newPassword} alone', async () => {
    await seedCompte();
    const serveur = profilInitial();
    const drapeaux = { refuserMdp: true };
    const fils = wire(routes(serveur, drapeaux));
    const screen = await mountApp();
    await screen.press('Profil');

    await screen.type('pas-le-bon-8', 'Votre mot de passe actuel');
    await screen.type('toute-neuve-99', 'Nouveau mot de passe (8 lettres ou plus)');
    await screen.press('Enregistrer', 2);
    expect(screen.shows("Ce n'est pas votre mot de passe actuel. Vérifiez et réessayez.")).toBe(true);
    // The way out: the fields are still editable and the action still fires.
    expect(screen.canPress('Enregistrer')).toBe(true);

    drapeaux.refuserMdp = false;
    await screen.type('grain-de-nere-77', 'Votre mot de passe actuel');
    await screen.press('Enregistrer', 2);
    const sauve = fils.calls.filter((c) => c.path === '/reseller/profile')[2];
    expect(sauve!.body).toEqual({ currentPassword: 'grain-de-nere-77', newPassword: 'toute-neuve-99' });
    expect(screen.shows("C'est enregistré.")).toBe(true);
    screen.unmount();
  });
});

describe('PROFIL-REVENDEUR-1 — verifier finding, fixed: the rayons card never vanishes under her thumb', () => {
  it('on a QUIET wire, untapping her last saved rayon keeps the chip and the save; the clear is SENT, then the card hides honestly', async () => {
    await seedCompte([CAT.A]);
    const serveur = profilInitial([CAT.A]);
    // The wire is quiet: no live offers, so the ONLY chips are the book's own.
    const muet: Route[] = [
      (path) =>
        path === '/supply-projections'
          ? { status: 200, json: { offers: [], diagnostic: { status: 'ok', refusals: [] } } }
          : null,
      ...routes(serveur).slice(1),
    ];
    const fils = wire(muet);
    const screen = await mountApp();
    await screen.press('Profil');

    // Her one saved rayon is on screen although the wire offers nothing.
    expect(screen.canPress(CAT.A)).toBe(true);
    await screen.press(CAT.A); // deselect the LAST one
    // The dead-end the verifier named: chip and save must BOTH survive this tap
    // — the chip so a mistap can be undone, the save so the clear can be sent.
    expect(screen.canPress(CAT.A), 'the deselected chip must stay pressable').toBe(true);
    expect(screen.canPress('Enregistrer')).toBe(true);
    await screen.press('Enregistrer', 1);

    const sauve = fils.calls.filter((c) => c.path === '/reseller/profile')[1];
    expect(sauve!.body).toEqual({ categories: [] }); // the CLEAR, explicit on the wire
    expect(screen.shows("C'est enregistré.")).toBe(true);
    // Only now — the book emptied by a SAVE, the wire quiet — does the card
    // hide, which is honesty, not a vanished control.
    expect(screen.shows('Vos rayons (5 maximum)')).toBe(false);
    screen.unmount();
  });
});

describe('CERCLE-PROFIL-1 — the Cercle lives on her page now, and the dock is five', () => {
  it('the row opens the hub, and « Retour » brings her back to her profile — the whole round trip', async () => {
    await seedCompte();
    const serveur = profilInitial();
    wire(routes(serveur));
    const screen = await mountApp();
    await screen.press('Profil');

    expect(screen.canPress('Mon Cercle'), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.press('Mon Cercle');
    // The hub's OWN content — not the row that opened it.
    const horsDock = screen.texts().filter((t) => !['Accueil', 'Opportunités', 'Ma Vitrine', 'Gains', 'Profil'].includes(t));
    expect(horsDock.length, `the hub must render: ${JSON.stringify(screen.texts())}`).toBeGreaterThan(2);
    // The way back: the Cercle is a stacked screen now, never a trap.
    await screen.press('Retour');
    expect(screen.shows('Mes informations')).toBe(true);
    screen.unmount();
  });

  it('no compte on the device: the Cercle row is STILL there — the retired tab never asked for one', async () => {
    const serveur = profilInitial();
    wire(routes(serveur));
    const screen = await mountApp();
    await screen.press('Profil');

    expect(screen.shows('Pas encore de compte')).toBe(true);
    expect(screen.canPress('Mon Cercle')).toBe(true);
    await screen.press('Mon Cercle');
    const horsDock = screen.texts().filter((t) => !['Accueil', 'Opportunités', 'Ma Vitrine', 'Gains', 'Profil'].includes(t));
    expect(horsDock.length).toBeGreaterThan(2);
    screen.unmount();
  });
});
