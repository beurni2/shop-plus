import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, wire, wiredEnv, type Route, type Screen, type Wire } from './rendu';
import { resetFiles } from './doubles/expo-file-system';
import { RAYONS } from '../src/vitrine/rayons';

/**
 * ═══ RENDU-RÉEL — PROFIL-REVENDEUR-1 (founder, 2026-08-25: « create a profile
 * tab and screen where resellers can view and modify their registration data
 * and their rayons as well ») — REWRITTEN for PROFIL-PRO-1 + RAYONS-CANON-1
 * (founder, 2026-09-12: « Add the product category Maison and the other
 * categories on shop+ … the profile screen on shop+ is so unprofessional …
 * make it be like a real professional and well structured profile screen ») ═══
 *
 * The four questions, walked on the mounted App:
 *   · did the tree survive the tap — the hub is an INDEX (four doors, no
 *     form), each door opens its leaf, and the leaf shows HER data from the
 *     wire;
 *   · is the primary action present AND pressable AND wired — each leaf's ONE
 *     « Enregistrer » POSTs EXACTLY its own fields (absent means untouched);
 *   · does an act that fails leave a way out — a refused save speaks in the
 *     warm box and the button stays pressable; a dead wire and a founder's
 *     pause both offer a retry that actually RE-CALLS; « Retour » is on every
 *     leaf in every state; a session that dies mid-save lands her on the
 *     entrance, and the tree stands when she logs back in;
 *   · can she reach the next step — a saved answer lands back on the HUB, in
 *     the door's own summary line.
 *
 * WRITTEN FIRST, RED, before the build (the founder's report): the hub's
 * « no Enregistrer », and « Maison » pressable on a feed that carries no
 * Maison product.
 *
 * The /reseller/profile double is CONTRACT-CERTIFIED against the deployed
 * bundle's own bounds (accounts.e2e — PROFIL-REVENDEUR-1 describes): 200
 * answers carry accountId/name/email/phone/state(+categories), a wrong current
 * password answers 401 {reason:'bad_password'}, a dead session 401
 * {reason:'no_session'}, a pause 403, a taken email 409, a bad field 400
 * {field}, and a patch's absent fields stay untouched.
 *
 * WHAT IT MAY NEVER CLAIM: appearance. No layout, no colour, no spacing, no
 * touch size (the bound in test/doubles/react-native.tsx).
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
const SESSION_NEUVE = 'SPS-EEEE-FFFF-0000-1111';
const MDP = 'grain-de-nere-77';
const PLEIN = 'Vous avez déjà 5 rayons. Retirez-en un pour en choisir un autre.';
const AUCUN = 'Aucun rayon choisi. On vous montre tout.';
const RESEAU = 'Pas de réseau. Réessayez dès que ça revient.';
const CHAMP = 'Un champ ne va pas. Vérifiez et réessayez.';
const FINIE = 'Votre session est finie. Connectez-vous à nouveau pour continuer.';

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

interface Drapeaux {
  refuserMdp?: boolean;
  /** 503 on every profile call — a dead wire. */
  profilMort?: boolean;
  /** 403 on every profile call — the founder's pause. */
  profilCoupe?: boolean;
  /** The next SAVE is refused with this status (409 email taken, 400 bad field). */
  refuserSauve?: 409 | 400;
  /** The next SAVE answers 401 no_session — the book says the session is over. */
  sessionMorte?: boolean;
}

/**
 * The account book double, stateful like the real one: a patch merges, a read
 * echoes the record. Every refusal wears the service's own status and reason
 * (certified: accounts.e2e).
 */
function routes(serveur: ProfilServeur, drapeaux: Drapeaux = {}, feed: readonly { pv: string; nom: string; cat: string }[] = FEED): Route[] {
  return [
    (path) =>
      path === '/supply-projections'
        ? {
            status: 200,
            json: {
              offers: feed.map((f) => ({
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
      if (path !== '/reseller/login') return null;
      if (body?.['password'] !== MDP) return { status: 401, json: { ok: false, reason: 'bad_credentials' } };
      return {
        status: 200,
        json: {
          ok: true, accountId: serveur.accountId, name: serveur.name, state: serveur.state,
          ...(serveur.categories !== undefined ? { categories: serveur.categories } : {}),
          session: SESSION_NEUVE,
        },
      };
    },
    (path) => (path === '/reseller/logout' ? { status: 200, json: { ok: true } } : null),
    (path, body) => {
      if (path !== '/reseller/profile') return null;
      if (drapeaux.profilMort === true) return { status: 503, json: { ok: false, reason: 'accounts_unavailable' } };
      if (drapeaux.profilCoupe === true) return { status: 403, json: { ok: false, reason: 'paused' } };
      const estSauve = body !== null && Object.keys(body).length > 0;
      if (estSauve && drapeaux.sessionMorte === true) return { status: 401, json: { ok: false, reason: 'no_session' } };
      if (estSauve && drapeaux.refuserSauve === 409) return { status: 409, json: { ok: false, reason: 'email_taken' } };
      if (estSauve && drapeaux.refuserSauve === 400) return { status: 400, json: { ok: false, reason: 'bad_field', field: 'phone' } };
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

const lectures = (fils: Wire) => fils.calls.filter((c) => c.path === '/reseller/profile');
const champs = (screen: Screen) => screen.tree.root.findAllByType('TextInput' as never);
const valeurs = (screen: Screen) => champs(screen).map((i) => String(i.props['value']));

/** Settle until the screen says it (bounded): the entrance road chains
 *  several awaits (store writes, a fetch, a re-read) past one settle. */
async function attendre(screen: Screen, fragment: string): Promise<void> {
  for (let i = 0; i < 25 && !screen.shows(fragment); i += 1) await screen.settle();
  expect(screen.shows(fragment), `expected « ${fragment} »; on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

beforeEach(() => {
  vi.resetModules();
  wiredEnv();
  resetFiles();
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  delete process.env['EXPO_PUBLIC_ACCESS_GATE'];
  vi.useRealTimers();
});

describe('PROFIL-PRO-1 — the hub is an INDEX: who she is, four doors with what stands behind each, nothing to type', () => {
  it('the dock tab opens the hub; identity from the wire, one read with an EMPTY body; four doors pressable; NO « Enregistrer », NO field', async () => {
    await seedCompte([CAT.A, CAT.B]);
    const serveur = profilInitial([CAT.A, CAT.B]);
    const fils = wire(routes(serveur));
    const screen = await mountApp();

    expect(screen.canPress('Profil')).toBe(true);
    await screen.press('Profil');

    expect(screen.shows('Mon profil')).toBe(true);
    expect(screen.shows('Awa Traoré')).toBe(true);
    expect(screen.shows('Compte rs-7777')).toBe(true);
    expect(screen.shows('Compte actif')).toBe(true);
    // The read: exactly one, riding her session, sending NOTHING.
    const lues = lectures(fils);
    expect(lues, 'the profile must have been read once').toHaveLength(1);
    expect(lues[0]!.body).toEqual({});
    expect(lues[0]!.auth).toBe(`Bearer ${SESSION}`);
    // The four doors, each with its summary from the wire.
    for (const porte of ['Mes informations', 'Mes rayons', 'Mot de passe', 'Mon Cercle', 'Me déconnecter']) {
      expect(screen.canPress(porte), `${porte} — on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    }
    expect(screen.shows('70 11 22 33'), 'her WhatsApp number is the informations door’s line').toBe(true);
    expect(screen.shows('2 rayons sur 5')).toBe(true);
    expect(screen.shows('Changez-le quand vous voulez.')).toBe(true);
    // AN INDEX, NOT A FORM (written red first): no save, no field on the hub.
    expect(screen.canPress('Enregistrer')).toBe(false);
    expect(champs(screen)).toHaveLength(0);
    screen.unmount();
  });

  it('the accueil header (monogram + name) walks the journey edge to the same hub', async () => {
    await seedCompte();
    const serveur = profilInitial();
    wire(routes(serveur));
    const screen = await mountApp();

    expect(screen.canPress('Voir mon profil')).toBe(true);
    await screen.press('Voir mon profil');
    expect(screen.shows('Mon profil')).toBe(true);
    expect(screen.canPress('Mes informations')).toBe(true);
    screen.unmount();
  });

  it('back without saving posts NOTHING: each of the three leaves opens, « Retour » returns, one request in all (the read)', async () => {
    await seedCompte([CAT.A]);
    const serveur = profilInitial([CAT.A]);
    const fils = wire(routes(serveur));
    const screen = await mountApp();
    await screen.press('Profil');

    for (const porte of ['Mes informations', 'Mes rayons', 'Mot de passe']) {
      await screen.press(porte);
      expect(screen.canPress('Retour'), `${porte}: the way back`).toBe(true);
      // ONE primary per leaf — present (the password leaf's stays disabled
      // until both fields are filled, which is the honest state, not a dead
      // control: the mdp walk below presses it).
      expect(screen.texts().filter((x) => x === 'Enregistrer'), `${porte}: exactly one primary`).toHaveLength(1);
      expect(screen.canPress('Profil'), `${porte}: a leaf has no dock — one task, two exits`).toBe(false);
      await screen.press('Retour');
      expect(screen.shows('Mon profil'), `back from ${porte}`).toBe(true);
    }
    expect(lectures(fils), 'hub ↔ leaf never re-reads, and nothing was saved').toHaveLength(1);
    screen.unmount();
  });
});

describe('PROFIL-PRO-1 — « Mes informations »: reach, edit, save, return; a refusal keeps her on the form', () => {
  it('the door opens the leaf prefilled; « Enregistrer » POSTs exactly {name, phone, email}; the toast, the hub, the new number on the door — and no second read', async () => {
    await seedCompte([CAT.A]);
    const serveur = profilInitial([CAT.A]);
    const fils = wire(routes(serveur));
    const screen = await mountApp();
    await screen.press('Profil');

    await screen.press('Mes informations');
    expect(screen.shows('Mes informations'), 'the leaf carries its name').toBe(true);
    expect(screen.canPress('Retour')).toBe(true);
    expect(valeurs(screen)).toEqual(['Awa Traoré', '70 11 22 33', 'awa@example.bf']);
    expect(screen.shows("C'est avec cet email que vous vous connectez.")).toBe(true);

    await screen.type('Awa Ouédraogo', 'Votre nom');
    await screen.type('76 55 44 33', 'Votre numéro WhatsApp');
    await screen.press('Enregistrer');

    const lues = lectures(fils);
    expect(lues, 'the read, then the save').toHaveLength(2);
    expect(lues[1]!.body).toEqual({ name: 'Awa Ouédraogo', phone: '76 55 44 33', email: 'awa@example.bf' });
    expect(screen.shows("C'est enregistré.")).toBe(true);
    // Back on the hub, and the door already says the new number: the hub
    // reads the same answer the save just replaced, no re-read.
    expect(screen.shows('Mon profil')).toBe(true);
    expect(screen.shows('Awa Ouédraogo')).toBe(true);
    expect(screen.shows('76 55 44 33')).toBe(true);
    expect(lectures(fils)).toHaveLength(2);
    screen.unmount();
  });

  it('409 speaks the profile’s OWN sentence (never « connectez-vous plutôt »), 400 names a field; the button stays live, the typing is kept, « Retour » works', async () => {
    await seedCompte();
    const serveur = profilInitial();
    const drapeaux: Drapeaux = { refuserSauve: 409 };
    wire(routes(serveur, drapeaux));
    const screen = await mountApp();
    await screen.press('Profil');
    await screen.press('Mes informations');

    await screen.type('awa.neuve@example.bf', 'Votre email');
    await screen.press('Enregistrer');
    expect(screen.shows('Cet email appartient déjà à un autre compte. Essayez-en un autre.'), JSON.stringify(screen.texts())).toBe(true);
    expect(screen.shows('Connectez-vous plutôt')).toBe(false);
    expect(screen.shows('Mes informations'), 'still on the leaf').toBe(true);

    drapeaux.refuserSauve = 400;
    await screen.press('Enregistrer');
    expect(screen.shows(CHAMP)).toBe(true);
    expect(screen.shows('Cet email appartient déjà')).toBe(false);
    expect(screen.canPress('Enregistrer'), 'a refusal leaves the act').toBe(true);
    expect(valeurs(screen)).toContain('awa.neuve@example.bf');

    await screen.press('Retour');
    expect(screen.shows('Mon profil')).toBe(true);
    screen.unmount();
  });
});

describe('RAYONS-CANON-1 — « Mes rayons » offers Boutik+’s WHOLE taxonomy, on a wire that carries none of it', () => {
  it('every shelf and every category is pressable with ZERO offers on the feed; « Maison » among them; the count, the sixth tap, the removal, the save in tap order, the hub’s summary', async () => {
    await seedCompte([CAT.A, CAT.B]);
    const serveur = profilInitial([CAT.A, CAT.B]);
    const fils = wire(routes(serveur, {}, []));
    const screen = await mountApp();
    await screen.press('Profil');
    await screen.press('Mes rayons');

    expect(screen.shows('Mes rayons')).toBe(true);
    expect(screen.shows('Choisissez ce que vous voulez revendre. On ne vous montrera que ces rayons.')).toBe(true);
    // THE WALK FOLLOWS THE MIRROR, never a hand-picked three: all 8 shelves,
    // all 30 categories, choosable although the feed is empty (written red
    // first — the founder's Maison product had no chip to reach it).
    for (const rayon of RAYONS) {
      expect(screen.shows(rayon.titre), rayon.titre).toBe(true);
      for (const c of rayon.categories) {
        expect(screen.canPress(c), `${c} — on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
      }
    }
    expect(screen.shows('Autres rayons'), 'her saved rayons are taxonomy values — nothing to put under « Autres »').toBe(false);
    expect(screen.shows('Vos choix : Mode femme · Sacs')).toBe(true);
    expect(screen.shows('2 sur 5')).toBe(true);

    await screen.press('Maison');
    await screen.press('Vase');
    await screen.press('Coiffeuse');
    expect(screen.shows('5 sur 5')).toBe(true);
    // The sixth tap SPEAKS, where her eye is (the footer), and refuses.
    await screen.press('Poussette');
    expect(screen.shows(PLEIN)).toBe(true);
    expect(screen.shows('Vos choix : Mode femme · Sacs · Maison · Vase · Coiffeuse')).toBe(true);
    // A removal frees a slot; the sentence goes, the count comes back.
    await screen.press('Vase');
    expect(screen.shows('4 sur 5')).toBe(true);
    expect(screen.shows(PLEIN)).toBe(false);

    await screen.press('Enregistrer');
    const lues = lectures(fils);
    expect(lues).toHaveLength(2);
    expect(lues[1]!.body).toEqual({ categories: [CAT.A, CAT.B, 'Maison', 'Coiffeuse'] });
    expect(screen.shows('Rayons enregistrés. Vos opportunités suivent vos choix.')).toBe(true);
    expect(screen.shows('Mon profil')).toBe(true);
    expect(screen.shows('4 rayons sur 5')).toBe(true);
    // The local mirror follows the BOOK at once (the compte file the accueil
    // and Opportunités read), so her feed narrows on what she just saved,
    // never on a stale disk — the call site, not a guard.
    const { expoAccessCodeStore } = await import('../src/sales/code-store');
    const disque = JSON.parse((await expoAccessCodeStore('reseller-compte.v1.txt').read()) ?? '{}') as { categories?: string[] };
    expect(disque.categories).toEqual([CAT.A, CAT.B, 'Maison', 'Coiffeuse']);
    screen.unmount();
  });

  it('a legacy canon id on her account sits under « Autres rayons », named, selected, pressable; untapping her LAST rayon keeps the chip and the save; the clear is SENT; the hub says so honestly', async () => {
    await seedCompte(['fashion_bags_fabrics']);
    const serveur = profilInitial(['fashion_bags_fabrics']);
    const fils = wire(routes(serveur, {}, []));
    const screen = await mountApp();
    await screen.press('Profil');
    expect(screen.shows('1 rayon sur 5')).toBe(true);
    await screen.press('Mes rayons');

    expect(screen.shows('Autres rayons')).toBe(true);
    expect(screen.canPress('Mode, sacs & tissus')).toBe(true);
    expect(screen.shows('Vos choix : Mode, sacs & tissus')).toBe(true);
    expect(screen.shows('1 sur 5')).toBe(true);

    await screen.press('Mode, sacs & tissus'); // deselect the LAST one
    // The dead-end the PROFIL-REVENDEUR-1 verifier named: chip and save must
    // BOTH survive this tap — the chip so a mistap can be undone, the save so
    // the clear can be sent.
    expect(screen.shows(AUCUN)).toBe(true);
    expect(screen.canPress('Mode, sacs & tissus'), 'the deselected chip must stay pressable').toBe(true);
    expect(screen.canPress('Enregistrer')).toBe(true);
    await screen.press('Enregistrer');

    expect(lectures(fils)[1]!.body).toEqual({ categories: [] }); // the CLEAR, explicit on the wire
    expect(screen.shows('Mon profil')).toBe(true);
    expect(screen.shows(AUCUN), 'the hub’s door says the honest zero').toBe(true);
    screen.unmount();
  });

  it('a feed value the mirror does not know lands under « Autres rayons » and saves verbatim — the data-driven law as the safety net', async () => {
    await seedCompte();
    const serveur = profilInitial();
    const fils = wire(routes(serveur, {}, [{ pv: 'pv-tb', nom: 'Tapis de Marrakech', cat: 'Tapis berbère' }]));
    const screen = await mountApp();
    await screen.press('Profil');
    await screen.press('Mes rayons');

    expect(screen.shows('Autres rayons')).toBe(true);
    expect(screen.canPress('Tapis berbère')).toBe(true);
    await screen.press('Tapis berbère');
    expect(screen.shows('Vos choix : Tapis berbère')).toBe(true);
    await screen.press('Enregistrer');
    expect(lectures(fils)[1]!.body).toEqual({ categories: ['Tapis berbère'] });
    screen.unmount();
  });

  it('a refused save speaks in the footer, the button stays live, and the next tap on any chip clears the sentence', async () => {
    await seedCompte();
    const serveur = profilInitial();
    wire(routes(serveur, { refuserSauve: 400 }, []));
    const screen = await mountApp();
    await screen.press('Profil');
    await screen.press('Mes rayons');

    await screen.press('Maison');
    await screen.press('Enregistrer');
    expect(screen.shows(CHAMP), JSON.stringify(screen.texts())).toBe(true);
    expect(screen.shows('Mes rayons'), 'still on the leaf').toBe(true);
    expect(screen.canPress('Enregistrer')).toBe(true);

    await screen.press('Vase');
    expect(screen.shows(CHAMP)).toBe(false);
    expect(screen.shows('2 sur 5')).toBe(true);
    screen.unmount();
  });
});

describe('PROFIL-PRO-1 — « Mot de passe »: masked, one eye for both, a wrong CURRENT speaks and stays retryable, the right one saves alone', () => {
  it('two secure fields; « Voir » reveals both, « Cacher » masks both; a short new word never arms the button; 401 bad_password → the sentence; 200 → {currentPassword, newPassword}, its own toast, the hub', async () => {
    await seedCompte();
    const serveur = profilInitial();
    const drapeaux: Drapeaux = { refuserMdp: true };
    const fils = wire(routes(serveur, drapeaux));
    const screen = await mountApp();
    await screen.press('Profil');
    await screen.press('Mot de passe');

    const mdp = () =>
      champs(screen).filter((i) => ['Votre mot de passe actuel', 'Nouveau mot de passe (8 lettres ou plus)'].includes(String(i.props['accessibilityLabel'])));
    expect(mdp(), 'the two password fields').toHaveLength(2);
    expect(champs(screen), 'nothing else to type on this leaf').toHaveLength(2);
    for (const c of mdp()) expect(c.props['secureTextEntry'], 'masked by default').toBe(true);
    await screen.press('Voir');
    for (const c of mdp()) expect(c.props['secureTextEntry'], 'revealed on her tap').toBe(false);
    await screen.press('Cacher');
    for (const c of mdp()) expect(c.props['secureTextEntry']).toBe(true);

    await screen.type('pas-le-bon-8', 'Votre mot de passe actuel');
    await screen.type('abc', 'Nouveau mot de passe (8 lettres ou plus)');
    expect(screen.canPress('Enregistrer'), 'three letters never arm the save').toBe(false);
    expect(lectures(fils), 'nothing posted beyond the read').toHaveLength(1);

    await screen.type('toute-neuve-99', 'Nouveau mot de passe (8 lettres ou plus)');
    await screen.press('Enregistrer');
    expect(screen.shows("Ce n'est pas votre mot de passe actuel. Vérifiez et réessayez.")).toBe(true);
    // The way out: the fields are still editable and the action still fires.
    expect(screen.canPress('Enregistrer')).toBe(true);
    expect(valeurs(screen)).toEqual(['pas-le-bon-8', 'toute-neuve-99']);

    drapeaux.refuserMdp = false;
    await screen.type(MDP, 'Votre mot de passe actuel');
    await screen.press('Enregistrer');
    const lues = lectures(fils);
    expect(lues).toHaveLength(3);
    expect(lues[2]!.body).toEqual({ currentPassword: MDP, newPassword: 'toute-neuve-99' });
    expect(screen.shows('Mot de passe changé.')).toBe(true);
    expect(screen.shows('Mon profil')).toBe(true);
    screen.unmount();
  });
});

describe('PROFIL-PRO-1 — the honest states, each with a way out', () => {
  it('no compte on the device: the honest empty state, the Cercle door, and NOT one profile read', async () => {
    const serveur = profilInitial();
    const fils = wire(routes(serveur));
    const screen = await mountApp();

    await screen.press('Profil');
    expect(screen.shows('Pas encore de compte')).toBe(true);
    expect(screen.shows('Quand vous aurez un compte, votre profil vivra ici.')).toBe(true);
    expect(screen.canPress('Mon Cercle')).toBe(true);
    expect(lectures(fils)).toHaveLength(0);
    screen.unmount();
  });

  it('a dead wire: the sentence, NO settings door (a door to a form she cannot save is a lie), the Cercle and the logout still live, and a retry that actually RE-CALLS', async () => {
    await seedCompte();
    const serveur = profilInitial();
    const drapeaux: Drapeaux = { profilMort: true };
    const fils = wire(routes(serveur, drapeaux));
    const screen = await mountApp();

    await screen.press('Profil');
    expect(screen.shows(RESEAU)).toBe(true);
    expect(screen.canPress('Vérifier à nouveau')).toBe(true);
    expect(screen.canPress('Mes informations')).toBe(false);
    expect(screen.canPress('Mes rayons')).toBe(false);
    expect(screen.canPress('Mot de passe')).toBe(false);
    expect(screen.canPress('Mon Cercle')).toBe(true);
    expect(screen.canPress('Me déconnecter')).toBe(true);

    // The wire comes back; her retry must actually go ask again.
    drapeaux.profilMort = false;
    await screen.press('Vérifier à nouveau');
    expect(lectures(fils)).toHaveLength(2);
    expect(screen.canPress('Mes informations')).toBe(true);
    expect(screen.shows('Vérifier à nouveau')).toBe(false);
    screen.unmount();
  });

  it('a founder’s pause: its own words, the chip says so, « Vérifier à nouveau » is THERE (an automatic act leaves a way out) and re-calls; lifted → the doors appear', async () => {
    await seedCompte();
    const serveur = profilInitial();
    const drapeaux: Drapeaux = { profilCoupe: true };
    const fils = wire(routes(serveur, drapeaux));
    const screen = await mountApp();

    await screen.press('Profil');
    expect(screen.shows('Votre accès est en pause')).toBe(true);
    expect(screen.shows('Accès en pause')).toBe(true);
    expect(screen.shows('Compte actif')).toBe(false);
    expect(screen.canPress('Vérifier à nouveau')).toBe(true);
    expect(screen.canPress('Mes informations')).toBe(false);
    expect(screen.canPress('Me déconnecter')).toBe(true);

    drapeaux.profilCoupe = false;
    await screen.press('Vérifier à nouveau');
    expect(lectures(fils)).toHaveLength(2);
    expect(screen.canPress('Mes informations')).toBe(true);
    expect(screen.shows('Votre accès est en pause')).toBe(false);
    screen.unmount();
  });

  it('the session dies mid-save on a leaf: the entrance with the sentence, no throw; she logs back in and the TREE STANDS — the leaf is still there, prefilled after one new read, « Retour » live', async () => {
    process.env['EXPO_PUBLIC_ACCESS_GATE'] = 'on';
    await seedCompte();
    const { expoIdentityStore } = await import('../src/identity/expoStore');
    await expoIdentityStore().write(JSON.stringify({ version: 1, digits: '7777' }));
    const serveur = profilInitial();
    const drapeaux: Drapeaux = { sessionMorte: true };
    const fils = wire(routes(serveur, drapeaux));
    const screen = await mountApp();
    await screen.press('Profil');
    await screen.press('Mes informations');

    await screen.type('Awa Ouédraogo', 'Votre nom');
    await screen.press('Enregistrer');
    await attendre(screen, FINIE);
    expect(screen.shows(RESEAU), 'a dead session is never dressed as a dead network').toBe(false);
    expect(() => screen.texts()).not.toThrow();

    // She logs back in on the entrance the App opened.
    drapeaux.sessionMorte = false;
    await screen.type('awa@example.bf', 'Votre email');
    await screen.type(MDP, 'Votre mot de passe (8 lettres ou plus)');
    await screen.press('Me connecter');
    await attendre(screen, 'Mes informations');
    expect(fils.calls.some((c) => c.path === '/reseller/login'), 'the login must have left the phone').toBe(true);
    // The stack was left on the leaf; the leaf renders its state card, then
    // the form from ONE new read riding the NEW session — never a blank tree.
    for (let i = 0; i < 25 && valeurs(screen).length === 0; i += 1) await screen.settle();
    expect(valeurs(screen), JSON.stringify(screen.texts())).toEqual(['Awa Traoré', '70 11 22 33', 'awa@example.bf']);
    expect(screen.canPress('Retour')).toBe(true);
    expect(screen.canPress('Enregistrer')).toBe(true);
    const lues = lectures(fils);
    expect(lues.map((c) => c.body)).toEqual([{}, { name: 'Awa Ouédraogo', phone: '70 11 22 33', email: 'awa@example.bf' }, {}]);
    expect(lues[2]!.auth).toBe(`Bearer ${SESSION_NEUVE}`);
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

describe('RAYONS-HERITES-1 — an id-era rayon on her account is ONE chip, ticked; her next save writes the label', () => {
  it('« shoes » on the book: the hub counts one rayon; « Mes rayons » ticks ONE « Chaussures » (no « Autres rayons »); saving without a change sends « Chaussures » — the migration is hers, never silent', async () => {
    await seedCompte(['shoes']);
    const serveur = profilInitial(['shoes']);
    const fils = wire(routes(serveur, {}, []));
    const screen = await mountApp();
    await screen.press('Profil');
    expect(screen.shows('1 rayon sur 5')).toBe(true);
    await screen.press('Mes rayons');

    expect(screen.shows('Autres rayons'), 'the id has a twin on a shelf — nothing to put under « Autres »').toBe(false);
    expect(screen.shows('Vos choix : Chaussures')).toBe(true);
    expect(screen.shows('1 sur 5')).toBe(true);
    // ONE control answers to the label — `press` would refuse two.
    await screen.press('Chaussures');
    expect(screen.shows(AUCUN), 'the tick came off — it was the same rayon').toBe(true);
    await screen.press('Chaussures');
    expect(screen.shows('Vos choix : Chaussures')).toBe(true);

    await screen.press('Enregistrer');
    expect(lectures(fils)[1]!.body).toEqual({ categories: ['Chaussures'] });
    expect(screen.shows('Mon profil')).toBe(true);
    expect(screen.shows('1 rayon sur 5')).toBe(true);
    screen.unmount();
  });
});
