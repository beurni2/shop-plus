import { t, tf } from '../i18n';
import { esc } from '../format';
import { caretApresChiffres, telEnPaires } from '../cliente/telephone';
import { referenceCourte } from '../cliente/screens';
import type { ArticleCompte, ArticlesCompte, CommandeCompte, ComptePort, Echec, ProfilCliente } from './port';
import { garderSession, marquerInvitee, oublierSessions, rafraichirSession, sessionActive } from './garde';
import { icon } from '../icons';
import { iconBack, iconBag, iconChevron, iconHeart, iconShieldCheck } from '../vitrine/icons';
import { grandTeintIcon } from '../grand-teint-icons';
import { applyTheme, type VitrineThemeKey } from '../vitrine/themes';

/**
 * ═══ COMPTE-CLIENTE — HER ACCOUNT SCREENS (founder order 2026-09-24) ═══
 *
 * « When buyer tap a reseller boutique link to open his boutique, show a
 * screen asking the buyer to sign in or sign up if they he doesn't have an
 * account yet or continue as guest. When buyer taps sign up, ask name, family
 * name, email as optional, phone number, and password, and make sure for buyer
 * who got an account has a profile section where his infos are there and
 * safe. »
 *
 *   porte        — the three doors: create, sign in, continue without one.
 *                  Continuing without an account is a full road, never a
 *                  whisper: she buys exactly as before (the canon's « no
 *                  account wall »).
 *   inscription  — prénom, nom, téléphone, email (facultatif), mot de passe.
 *   connexion    — téléphone, mot de passe.
 *   profil       — her infos, read from the service on her session; from
 *                  there she edits her names and email (never her number:
 *                  it is her login) and changes her password (the current
 *                  one first), or signs out.
 *
 * COMPTE-CLIENTE-2 (founder « fix the ones still open », 2026-09-24):
 *   recuperation — the way back for a forgotten password or a number someone
 *                  else took: the founder's one-time code, given by calling
 *                  her number, her names and a new password — the number
 *                  starts clean for her (nothing a previous holder left).
 *   profil       — also « Mes commandes » (her orders made while signed in,
 *                  from any phone) and « Supprimer mon compte ».
 *   supprimer    — her password, then everything the book holds of her goes.
 *   Sign-in, sign-up and recovery ask « Garder mon compte ouvert sur ce
 *   téléphone » — unticked, she is signed in for this tab only (a phone that
 *   restores its tabs may keep that tab open; « Me déconnecter » always ends it).
 *
 * MON-COMPTE-PLUS (founder 2026-09-25, canon 3.24.0 — SP-I05, SP6 third ruling):
 *   profil       — also « Mon panier » and « Mes coups de cœur »: the articles
 *                  she kept or liked, by boutique, each under that boutique's
 *                  own name and look, photo and name, NEVER a price, with
 *                  « Voir chez … » back into that boutique alone. And every
 *                  account screen redesigned (« more beautiful … very
 *                  professional »): the Faso Premium family, one card per
 *                  purpose, an icon with every title.
 *
 * Every act is one request on a tap, never queued: nothing about her account
 * is « done » until the service said so. A refusal keeps what she typed and
 * says, in one sentence, what to do. Server bytes reach the page escaped, and
 * her session never reaches it at all.
 */

export type EcranCompte = 'porte' | 'inscription' | 'connexion' | 'profil' | 'modifier' | 'mot-de-passe' | 'recuperation' | 'supprimer';

export interface OptsCompte {
  readonly port: ComptePort;
  /** localStorage — where her session is kept. */
  readonly local: Storage | undefined;
  /** sessionStorage — where « Continuer sans compte » is remembered for the tab. */
  readonly onglet: Storage | undefined;
  readonly ecran: EcranCompte;
  /** She is done here (signed in or up, continued without, signed out, or back). */
  readonly versBoutique: () => void;
  /** COMPTE-CLIENTE-2 / PORTE-BELLE — her boutique, once its read answers:
   *  the doors greet her by the shop she opened, in its own colours. Absent
   *  or unanswered, « Shop+ ». */
  readonly boutique?: Promise<BoutiquePorte | undefined>;
  /** « Mes commandes » — open one order's tracking (the host mounts it). */
  readonly ouvrirSuivi?: (orderId: string, buyerRef: string) => void;
  /** Opened as a layer over a product or a payment: « Retour » goes back to
   *  that page, not to a boutique. */
  readonly enCalque?: boolean;
  /** MON-COMPTE-PLUS — one boutique, read for « Mon compte »: its name, look
   *  and products (the public boutique read; never a price reaches the page). */
  readonly lireBoutique?: (slug: string) => Promise<LectureBoutique>;
  /** MON-COMPTE-PLUS — the address of a boutique's own vitrine (« Voir chez … »). */
  readonly lienBoutique?: (slug: string) => string;
}

/**
 * MON-COMPTE-PLUS — a boutique as « Mon compte » shows her articles in it: the
 * same public bytes as her doors (name, city, look, portrait) and, per
 * product, its name, its photo and whether it is in stock. No price field
 * exists here, so none can reach the page (SP-I05: never two resellers'
 * prices on one screen).
 */
export interface ProduitCompte {
  readonly pid: string;
  readonly nom: string;
  readonly photo?: string;
  readonly disponible: boolean;
}
export interface BoutiqueCompte extends BoutiquePorte {
  readonly produits: readonly ProduitCompte[];
}
export type LectureBoutique = BoutiqueCompte | { readonly pause: string } | 'hors_ligne' | 'introuvable';

const NOM_MAX = 60;

/**
 * PORTE-BELLE — what the doors show of her boutique, taken from the SAME read
 * that draws the boutique (never a second one): its name, its city, its
 * habillage, and her portrait when she has one. All public boutique bytes.
 */
export interface BoutiquePorte {
  readonly nom: string;
  readonly lieu: string;
  readonly theme: VitrineThemeKey;
  readonly portrait?: string;
  /** Her portrait's own framing (« x% y% »), as her boutique crops it. */
  readonly cadrage?: string;
}

/** The service's own phone rule (`cleAcheteur`), mirrored so she hears about
 *  a short number before a round trip; the service stays the authority. */
export function numeroComplet(brut: string): boolean {
  const chiffres = brut.replace(/\D/g, '');
  const sansPrefixe = chiffres.startsWith('00') ? chiffres.slice(2) : chiffres;
  const national = sansPrefixe.length === 11 && sansPrefixe.startsWith('226') ? sansPrefixe.slice(3) : sansPrefixe;
  return national.length >= 8 && national.length <= 15;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One sentence per way a door refuses — the field it names, or the whole form. */
function phraseRefus(e: Echec): { champ?: string; texte: string } {
  if (e.kind === 'hors_ligne') return { texte: t('compte.refus.hors_ligne') };
  if (e.kind === 'session_perdue') return { texte: t('compte.refus.session') };
  switch (e.reason) {
    case 'bad_field':
    case 'unknown_field':
      switch (e.field) {
        case 'firstName': return { champ: 'firstName', texte: t('compte.champ.prenom') };
        case 'lastName': return { champ: 'lastName', texte: t('compte.champ.nom') };
        case 'phone': return { champ: 'phone', texte: t('compte.champ.telephone') };
        case 'email': return { champ: 'email', texte: t('compte.champ.email') };
        case 'password': return { champ: 'password', texte: t('compte.champ.mot_de_passe') };
        case 'newPassword': return { champ: 'newPassword', texte: t('compte.champ.mot_de_passe') };
        case 'currentPassword': return { champ: 'currentPassword', texte: t('compte.champ.mot_actuel') };
        default: return { texte: t('compte.refus.indisponible') };
      }
    case 'phone_taken': return { champ: 'phone', texte: t('compte.refus.numero_pris') };
    case 'bad_credentials': return { texte: t('compte.refus.identifiants') };
    case 'bad_password': return { champ: 'currentPassword', texte: t('compte.refus.mot_actuel') };
    case 'bad_code': return { champ: 'code', texte: t('compte.refus.code') };
    case 'too_many_attempts':
    case 'too_many_requests': return { texte: t('compte.refus.trop') };
    default: return { texte: t('compte.refus.indisponible') };
  }
}

/* ─────────────────────────────── renderers ─────────────────────────────── */

/** The privacy line, with the shield the boutique's trust row wears. */
const prive = (): string =>
  `<div class="compte-prive-bloc">${iconShieldCheck(18, 'currentColor', 1.9)}<p class="compte-prive" data-role="compte-prive">${t('compte.prive')}</p></div>`;
const alerte = (): string => '<p class="compte-alerte" data-role="compte-alerte" role="alert" hidden></p>';
/** Back, as an arrow AND its word (icon + word, never icon alone). */
const retour = (action: string, libelle: string): string =>
  `<button class="link-quiet back-step" type="button" data-action="${action}">${iconBack(18, 'currentColor', 2)}<span>${libelle}</span></button>`;
/** A screen's head: its glyph in a soft round, its title, one line of why. */
const entete = (glyphe: string, titre: string, sous?: string): string =>
  `<header class="compte-entete"><span class="compte-entete-icone" aria-hidden="true">${glyphe}</span>` +
  `<h2 class="compte-titre">${titre}</h2>${sous !== undefined ? `<p class="compte-sous">${sous}</p>` : ''}</header>`;
const glyphe = (nom: string): string => icon(nom, 'compte-entete-glyphe');
const personne = (): string => grandTeintIcon.profil(22);

function champ(o: {
  cle: string; label: string; type: string; autocomplete: string; valeur?: string;
  inputmode?: string; placeholder?: string; aide?: string; mdp?: boolean;
}): string {
  const id = `compte-${o.cle}`;
  return [
    `<div class="field compte-champ" data-champ-bloc="${o.cle}">`,
    `<label class="field-label" for="${id}">${o.label}</label>`,
    '<div class="compte-saisie">',
    `<input class="field-input compte-input" id="${id}" name="${o.cle}" data-champ="${o.cle}" type="${o.type}" autocomplete="${o.autocomplete}"`,
    o.inputmode !== undefined ? ` inputmode="${o.inputmode}"` : '',
    o.placeholder !== undefined ? ` placeholder="${esc(o.placeholder)}"` : '',
    o.valeur !== undefined ? ` value="${esc(o.valeur)}"` : '',
    ` aria-describedby="${id}-refus${o.aide !== undefined ? ` ${id}-aide` : ''}">`,
    o.mdp === true
      ? `<button class="secondary-action compte-voir" type="button" data-action="compte-voir" data-pour="${o.cle}" aria-pressed="false">${t('compte.voir')}</button>`
      : '',
    '</div>',
    o.aide !== undefined ? `<p class="compte-aide" id="${id}-aide">${o.aide}</p>` : '',
    `<p class="compte-champ-refus" id="${id}-refus" data-refus="${o.cle}" hidden></p>`,
    '</div>',
  ].join('');
}

/** « Garder mon compte ouvert sur ce téléphone » — ticked unless she unticks it. */
const rester = (): string =>
  `<label class="compte-rester"><input type="checkbox" data-role="compte-rester" checked> <span>${t('compte.rester')}</span></label>`;

/** « Chez Aïcha Mode » is greeted « Bienvenue chez Aïcha Mode », never « chez Chez ». */
const nomAccueil = (nom: string): string => nom.replace(/^chez\s+/i, '');

/**
 * PORTE-BELLE (founder, 2026-09-24: « make this screen … very beautiful, and
 * more structured ») — the head of the doors, in three honest states:
 *   attente  — her boutique is still being read: a quiet placeholder, and the
 *              doors below already work;
 *   boutique — her shop's portrait or monogram, the vérifiée mark and her city
 *              (the boutique's own words), and the welcome by name, in her
 *              habillage;
 *   (absent) — no boutique behind these doors (a layer over a payment page,
 *              or a read that failed): the plain Shop+ welcome.
 */
export function renderPorteTete(b?: BoutiquePorte | 'attente'): string {
  const sous = `<p class="porte-sous">${t('compte.porte.sous')}</p>`;
  if (b === 'attente') {
    return [
      '<div class="porte-tete" data-role="porte-tete" data-etat="attente" aria-busy="true">',
      '<div class="porte-identite" aria-hidden="true"><span class="porte-avatar porte-avatar-attente"></span><span class="skeleton-line porte-ligne-attente"></span></div>',
      `<h2 class="porte-titre" data-role="compte-porte-titre">${t('compte.porte.titre_court')}</h2>`,
      sous,
      '</div>',
    ].join('');
  }
  if (b === undefined) {
    return [
      '<div class="porte-tete" data-role="porte-tete" data-etat="shop">',
      `<h2 class="porte-titre" data-role="compte-porte-titre">${t('compte.porte.titre')}</h2>`,
      sous,
      '</div>',
    ].join('');
  }
  const nom = nomAccueil(b.nom);
  // ONE vérifiée mark, as her boutique draws it: the tick riding her portrait
  // or monogram, in her own accent — never a second tick beside it.
  const bulle = `<span class="porte-avatar-bulle">${icon('coche', 'porte-bulle-glyphe')}</span>`;
  const cadrage = b.cadrage !== undefined ? ` style="object-position:${esc(b.cadrage)}"` : '';
  const avatar = b.portrait !== undefined
    ? `<span class="porte-avatar porte-avatar-photo" data-role="porte-avatar"><img class="porte-avatar-img" src="${esc(b.portrait)}" alt="${t('vit.avatar_alt')}" decoding="async"${cadrage}>${bulle}</span>`
    : `<span class="porte-avatar" data-role="porte-avatar" aria-hidden="true">${esc(nom.charAt(0).toUpperCase())}${bulle}</span>`;
  return [
    '<div class="porte-tete" data-role="porte-tete" data-etat="boutique">',
    '<div class="porte-identite">',
    avatar,
    b.lieu !== '' ? `<p class="porte-verifiee" data-role="porte-verifiee">${t('vit.verifiee')} ${esc(b.lieu)}</p>` : '',
    '</div>',
    `<h2 class="porte-titre" data-role="compte-porte-titre">${tf('compte.porte.titre_boutique', { boutique: esc(nom) })}</h2>`,
    sous,
    '</div>',
  ].join('');
}

const atout = (glyphe: string, titre: string, texte: string): string =>
  `<li class="porte-atout"><span class="porte-atout-icone">${icon(glyphe, 'porte-atout-glyphe')}</span>` +
  `<span class="porte-atout-mots"><strong class="porte-atout-titre">${t(titre)}</strong><span class="porte-atout-texte">${t(texte)}</span></span></li>`;

/**
 * The three doors come FIRST, all of them on the first screen of a small
 * phone (verifier BLOCKER: a guest road below the fold is an account wall).
 * The reasons follow, for the one who wants them; the privacy line closes the
 * screen for EVERY road — it is as true without an account as with one.
 */
export function renderPorte(b?: BoutiquePorte | 'attente'): string {
  return [
    '<section class="compte porte" data-screen="compte-porte">',
    renderPorteTete(b),
    '<div class="porte-actions">',
    `<button class="primary-action" type="button" data-action="compte-vers-inscription">${t('compte.porte.creer')}</button>`,
    `<button class="secondary-action" type="button" data-action="compte-vers-connexion">${t('compte.porte.connecter')}</button>`,
    `<p class="porte-ou" data-role="porte-ou" aria-hidden="true"><span>${t('compte.porte.ou')}</span></p>`,
    // Continuing without an account is a FULL road, never a whisper (canon):
    // a full-width button, quieter in colour only.
    `<button class="porte-invitee" type="button" data-action="compte-invitee">${t('compte.porte.invitee')}</button>`,
    `<p class="porte-invitee-note">${t('compte.porte.invitee_note')}</p>`,
    '</div>',
    '<div class="porte-atouts" data-role="porte-atouts">',
    `<p class="porte-atouts-titre">${t('compte.porte.atouts_titre')}</p>`,
    '<ul class="porte-atouts-liste">',
    atout('colis', 'compte.porte.atout1_titre', 'compte.porte.atout1_texte'),
    atout('telephone', 'compte.porte.atout2_titre', 'compte.porte.atout2_texte'),
    atout('cadenas', 'compte.porte.atout3_titre', 'compte.porte.atout3_texte'),
    '</ul>',
    '</div>',
    prive(),
    '</section>',
  ].join('');
}

/** Her boutique's habillage on the doors — the same `--vt-*` variables the
 *  boutique itself wears (the theme is already one of the closed set: the
 *  storefront read validates it at the wire). */
function peindrePorte(section: Element | null, b: BoutiquePorte | 'attente' | undefined): void {
  if (!(section instanceof HTMLElement) || b === undefined || b === 'attente') return;
  applyTheme(section, b.theme);
}

export function renderInscription(): string {
  return [
    '<section class="compte compte-ecran" data-screen="compte-inscription">',
    retour('compte-vers-porte', t('retour')),
    entete(personne(), t('compte.inscription.titre'), t('compte.inscription.sous')),
    '<form class="compte-form compte-carte" data-role="compte-form" novalidate>',
    champ({ cle: 'firstName', label: t('compte.label.prenom'), type: 'text', autocomplete: 'given-name' }),
    champ({ cle: 'lastName', label: t('compte.label.nom'), type: 'text', autocomplete: 'family-name' }),
    champ({ cle: 'phone', label: t('compte.label.telephone'), type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: t('compte.telephone_exemple') }),
    champ({ cle: 'email', label: t('compte.label.email'), type: 'email', autocomplete: 'email', inputmode: 'email' }),
    champ({ cle: 'password', label: t('compte.label.mot_de_passe'), type: 'password', autocomplete: 'new-password', aide: t('compte.aide.mot_de_passe'), mdp: true }),
    rester(),
    alerte(),
    `<button class="primary-action" type="submit" data-action="compte-inscrire">${t('compte.inscription.envoyer')}</button>`,
    '</form>',
    prive(),
    `<button class="link-quiet" type="button" data-action="compte-vers-connexion">${t('compte.inscription.deja')}</button>`,
    '</section>',
  ].join('');
}

export function renderConnexion(note?: string, telephone?: string): string {
  return [
    '<section class="compte compte-ecran" data-screen="compte-connexion">',
    retour('compte-vers-porte', t('retour')),
    entete(glyphe('cle'), t('compte.connexion.titre'), t('compte.connexion.sous')),
    note !== undefined ? `<p class="compte-note" data-role="compte-note">${note}</p>` : '',
    '<form class="compte-form compte-carte" data-role="compte-form" novalidate>',
    champ({ cle: 'phone', label: t('compte.label.telephone'), type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: t('compte.telephone_exemple'), ...(telephone !== undefined ? { valeur: telephone } : {}) }),
    champ({ cle: 'password', label: t('compte.label.mot_de_passe'), type: 'password', autocomplete: 'current-password', mdp: true }),
    rester(),
    alerte(),
    `<button class="primary-action" type="submit" data-action="compte-connecter">${t('compte.connexion.envoyer')}</button>`,
    '</form>',
    `<button class="link-quiet" type="button" data-action="compte-vers-recuperation">${t('compte.connexion.oublie')}</button>`,
    `<button class="link-quiet" type="button" data-action="compte-vers-inscription">${t('compte.connexion.creer')}</button>`,
    '</section>',
  ].join('');
}

/** Her initials, for the round at the head of her account — letters, escaped. */
const initiales = (p: ProfilCliente): string => `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();

/** A titled block of « Mon compte »: its glyph beside the words (icon + word). */
const bloc = (role: string, glypheHtml: string, titre: string, contenu: string): string =>
  `<section class="compte-bloc" data-role="${role}"><h3 class="compte-sous-titre"><span class="compte-sous-titre-icone" aria-hidden="true">${glypheHtml}</span>${titre}</h3>${contenu}</section>`;

/** Her profile: while it is read, the read's failure (no network, or the
 *  service refused), or her infos — and, MON-COMPTE-PLUS, her orders, her
 *  panier and her coups de cœur, each in its own block. */
export function renderProfil(etat: ProfilCliente | 'chargement' | 'hors_ligne' | 'indisponible', note?: string, enCalque = false): string {
  const tete = [
    '<section class="compte compte-ecran compte-profil" data-screen="compte-profil">',
    retour('compte-boutique', enCalque ? t('retour') : t('compte.profil.retour')),
    `<h2 class="compte-titre">${t('compte.profil.titre')}</h2>`,
    note !== undefined ? `<p class="compte-note" data-role="compte-note">${note}</p>` : '',
  ];
  if (etat === 'chargement') {
    return [...tete, '<div class="compte-carte compte-infos" data-role="compte-chargement" aria-busy="true">',
      '<span class="skeleton-line skeleton-line-wide"></span><span class="skeleton-line skeleton-line-mid"></span>',
      '<span class="skeleton-line skeleton-line-wide"></span></div>', '</section>'].join('');
  }
  if (etat === 'hors_ligne' || etat === 'indisponible') {
    return [...tete,
      etat === 'hors_ligne'
        ? `<p class="offline-banner" data-role="compte-hors-ligne">${t('compte.profil.hors_ligne')}</p>`
        : `<p class="compte-alerte" data-role="compte-indisponible">${t('compte.refus.indisponible')}</p>`,
      `<button class="primary-action" type="button" data-action="compte-relire">${t('compte.reessayer')}</button>`,
      '</section>'].join('');
  }
  const ligne = (cle: string, label: string, valeur: string, vide = false): string =>
    `<div class="compte-info"><dt>${label}</dt><dd data-info="${cle}"${vide ? ' class="compte-vide"' : ''}>${valeur}</dd></div>`;
  return [
    ...tete,
    '<div class="compte-carte compte-identite">',
    '<div class="compte-identite-tete">',
    `<span class="compte-avatar" aria-hidden="true">${esc(initiales(etat))}</span>`,
    `<p class="compte-bonjour">${tf('compte.profil.bonjour', { prenom: esc(etat.firstName) })}</p>`,
    '</div>',
    `<p class="compte-infos-titre">${t('compte.profil.infos')}</p>`,
    '<dl class="compte-infos">',
    ligne('firstName', t('compte.label.prenom'), esc(etat.firstName)),
    ligne('lastName', t('compte.label.nom'), esc(etat.lastName)),
    ligne('phone', t('compte.label.telephone'), esc(etat.phone)),
    etat.email !== undefined ? ligne('email', t('compte.label.email_court'), esc(etat.email)) : ligne('email', t('compte.label.email_court'), t('compte.profil.sans_email'), true),
    '</dl>',
    `<button class="primary-action" type="button" data-action="compte-vers-modifier">${t('compte.profil.modifier')}</button>`,
    '</div>',
    prive(),
    bloc('compte-bloc-commandes', icon('colis', 'compte-bloc-glyphe'), t('compte.commandes.titre'), renderCommandes('chargement')),
    bloc('compte-bloc-panier', iconBag(20, 'currentColor', 1.9), t('vit.panier_titre'), renderArticles('panier', 'chargement')),
    bloc('compte-bloc-favoris', iconHeart(20, 'currentColor', 1.9), t('compte.favoris.titre'), renderArticles('favoris', 'chargement')),
    '<div class="compte-carte compte-reglages">',
    `<button class="secondary-action compte-ligne" type="button" data-action="compte-vers-mot-de-passe">${icon('cadenas', 'compte-ligne-glyphe')}<span class="compte-ligne-mots">${t('compte.profil.mot_de_passe')}</span>${iconChevron(18, 'currentColor', 2)}</button>`,
    `<button class="secondary-action compte-ligne" type="button" data-action="compte-deconnecter">${icon('reprendre', 'compte-ligne-glyphe')}<span class="compte-ligne-mots">${t('compte.profil.deconnecter')}</span></button>`,
    '</div>',
    `<button class="secondary-action problem-path compte-supprimer-lien" type="button" data-action="compte-vers-supprimer">${t('compte.supprimer.ouvrir')}</button>`,
    '</section>',
  ].join('');
}

/** jj/mm/aaaa, digits only — no month name to translate. */
function dateCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** « Mes commandes »: while read, its failure, none yet, or her orders. The
 *  order's reference is on the page (as « Ma commande » shows it); her read
 *  token for it never is — the controller keeps it. */
export function renderCommandes(etat: readonly CommandeCompte[] | 'chargement' | 'echec'): string {
  if (etat === 'chargement') {
    return '<div class="compte-commandes" data-role="compte-commandes" aria-busy="true"><span class="skeleton-line skeleton-line-wide"></span></div>';
  }
  if (etat === 'echec') {
    return [
      '<div class="compte-commandes" data-role="compte-commandes">',
      `<p class="compte-sous" data-role="compte-commandes-echec">${t('compte.commandes.echec')}</p>`,
      `<button class="secondary-action" type="button" data-action="compte-commandes-relire">${t('compte.reessayer')}</button>`,
      '</div>',
    ].join('');
  }
  if (etat.length === 0) {
    return `<div class="compte-commandes" data-role="compte-commandes"><p class="compte-sous compte-vide-ligne" data-role="compte-commandes-vide">${t('compte.commandes.vide')}</p></div>`;
  }
  return [
    '<div class="compte-commandes" data-role="compte-commandes">',
    ...etat.map((c) =>
      `<button class="compte-commande" type="button" data-action="compte-suivre" data-order="${esc(c.orderId)}">` +
      `<span class="compte-commande-icone" aria-hidden="true">${icon('colis', 'compte-commande-glyphe')}</span>` +
      `<span class="compte-commande-mots"><span class="compte-commande-date">${tf('compte.commandes.ligne', { date: dateCourte(c.at) })}</span>` +
      `<span class="compte-commande-ref">${esc(tf('cl.c7.reference', { ref: referenceCourte(c.orderId) }))}</span></span>` +
      `${iconChevron(18, 'currentColor', 2)}</button>`),
    '</div>',
  ].join('');
}

/* ─────────────── MON-COMPTE-PLUS — her panier and her coups de cœur ─────────────── */

export interface GroupeArticles {
  readonly slug: string;
  readonly pids: readonly string[];
}

/** Her articles by boutique, the boutique she touched last first, each
 *  boutique's articles newest first — the order she kept them, nothing ranked. */
export function grouperArticles(articles: readonly ArticleCompte[]): GroupeArticles[] {
  const groupes = new Map<string, string[]>();
  for (const a of articles) {
    const g = groupes.get(a.slug);
    if (g === undefined) groupes.set(a.slug, [a.pid]);
    else if (!g.includes(a.pid)) g.push(a.pid);
  }
  return [...groupes].map(([slug, pids]) => ({ slug, pids }));
}

export type EtatArticles =
  | 'chargement'
  | 'echec'
  | 'hors_ligne'
  | { readonly groupes: readonly GroupeArticles[]; readonly boutiques: ReadonlyMap<string, LectureBoutique | 'chargement'> };

const avatarBoutique = (b: BoutiquePorte): string => {
  const cadrage = b.cadrage !== undefined ? ` style="object-position:${esc(b.cadrage)}"` : '';
  return b.portrait !== undefined
    ? `<span class="compte-boutique-avatar"><img src="${esc(b.portrait)}" alt="${t('vit.avatar_alt')}" decoding="async" loading="lazy"${cadrage}></span>`
    : `<span class="compte-boutique-avatar" aria-hidden="true">${esc(nomAccueil(b.nom).charAt(0).toUpperCase())}</span>`;
};

/** One boutique's card: her articles there — photo, name, stock — and the
 *  one way back into that boutique alone. NEVER a price (SP-I05). */
function carteBoutique(g: GroupeArticles, lecture: LectureBoutique | 'chargement', lien: (slug: string) => string): string {
  const slug = esc(g.slug);
  if (lecture === 'introuvable') return '';
  if (lecture === 'chargement') {
    return `<article class="compte-boutique" data-boutique="${slug}" aria-busy="true"><span class="skeleton-line skeleton-line-mid"></span><span class="skeleton-line skeleton-line-wide"></span></article>`;
  }
  if (lecture === 'hors_ligne') {
    return `<article class="compte-boutique compte-boutique-muette" data-boutique="${slug}"><p class="compte-sous">${t('compte.articles.boutique_hors_ligne')}</p></article>`;
  }
  if ('pause' in lecture) {
    return [
      `<article class="compte-boutique compte-boutique-muette" data-boutique="${slug}">`,
      `<header class="compte-boutique-tete"><span class="compte-boutique-avatar" aria-hidden="true">${esc(nomAccueil(lecture.pause).charAt(0).toUpperCase())}</span>`,
      `<span class="compte-boutique-mots"><span class="compte-boutique-nom">${esc(lecture.pause)}</span><span class="compte-boutique-lieu">${t('compte.articles.pause')}</span></span></header>`,
      '</article>',
    ].join('');
  }
  const produits = g.pids.flatMap((pid) => {
    const p = lecture.produits.find((x) => x.pid === pid);
    return p !== undefined ? [p] : [];
  });
  const nombre = produits.length === 1 ? t('compte.articles.un') : tf('compte.articles.plusieurs', { n: String(produits.length) });
  return [
    `<article class="compte-boutique" data-boutique="${slug}" data-theme="${esc(lecture.theme)}">`,
    '<header class="compte-boutique-tete">',
    avatarBoutique(lecture),
    `<span class="compte-boutique-mots"><span class="compte-boutique-nom">${esc(lecture.nom)}</span>`,
    lecture.lieu !== '' ? `<span class="compte-boutique-lieu">${t('vit.verifiee')} ${esc(lecture.lieu)}</span>` : '',
    '</span>',
    produits.length > 0 ? `<span class="compte-boutique-nombre">${nombre}</span>` : '',
    '</header>',
    produits.length > 0
      ? `<ul class="compte-produits">${produits.map((p) =>
        `<li class="compte-produit" data-pid="${esc(p.pid)}"${p.disponible ? '' : ' data-epuise=""'}>` +
        `<span class="compte-produit-art">${p.photo !== undefined ? `<img src="${esc(p.photo)}" alt="" decoding="async" loading="lazy">` : iconBag(22, 'currentColor', 1.6)}</span>` +
        `<span class="compte-produit-nom">${esc(p.nom)}</span>` +
        (p.disponible ? '' : `<span class="compte-produit-epuise">${t('vit.epuise')}</span>`) +
        '</li>').join('')}</ul>`
      : `<p class="compte-sous">${t('compte.articles.plus_en_vente')}</p>`,
    `<a class="compte-voir-chez" data-role="compte-voir-chez" href="${esc(lien(g.slug))}"><span>${tf('compte.articles.voir_chez', { boutique: esc(nomAccueil(lecture.nom)) })}</span>${iconChevron(18, 'currentColor', 2)}</a>`,
    '</article>',
  ].join('');
}

/** « Mon panier » or « Mes coups de cœur »: while read, its failure, empty
 *  (with the true next step), or her articles by boutique. */
export function renderArticles(liste: 'panier' | 'favoris', etat: EtatArticles, lien: (slug: string) => string = () => '#'): string {
  const role = `compte-${liste}`;
  if (etat === 'chargement') {
    return `<div class="compte-articles" data-role="${role}" aria-busy="true"><span class="skeleton-line skeleton-line-wide"></span><span class="skeleton-line skeleton-line-mid"></span></div>`;
  }
  if (etat === 'echec' || etat === 'hors_ligne') {
    return [
      `<div class="compte-articles" data-role="${role}">`,
      `<p class="compte-sous" data-role="${role}-echec">${etat === 'hors_ligne' ? t('compte.articles.echec') : t('compte.articles.indisponible')}</p>`,
      `<button class="secondary-action" type="button" data-action="compte-articles-relire">${t('compte.reessayer')}</button>`,
      '</div>',
    ].join('');
  }
  // A boutique that no longer exists takes its articles with it: a list whose
  // every boutique is gone is an empty list, said so (verifier minor 1).
  const groupes = etat.groupes.filter((g) => etat.boutiques.get(g.slug) !== 'introuvable');
  if (groupes.length === 0) {
    return [
      `<div class="compte-articles" data-role="${role}">`,
      `<div class="compte-vide-bloc" data-role="${role}-vide">`,
      `<span class="compte-vide-icone" aria-hidden="true">${liste === 'panier' ? iconBag(22, 'currentColor', 1.9) : iconHeart(22, 'currentColor', 1.9)}</span>`,
      `<p class="compte-vide-titre">${liste === 'panier' ? t('compte.panier.vide') : t('compte.favoris.vide')}</p>`,
      `<p class="compte-sous">${liste === 'panier' ? t('compte.panier.vide_sous') : t('compte.favoris.vide_sous')}</p>`,
      '</div></div>',
    ].join('');
  }
  const horsLigne = groupes.some((g) => etat.boutiques.get(g.slug) === 'hors_ligne');
  return [
    `<div class="compte-articles" data-role="${role}">`,
    ...groupes.map((g) => carteBoutique(g, etat.boutiques.get(g.slug) ?? 'chargement', lien)),
    horsLigne ? `<button class="secondary-action" type="button" data-action="compte-articles-relire">${t('compte.reessayer')}</button>` : '',
    '</div>',
  ].join('');
}

export function renderRecuperation(telephone?: string): string {
  return [
    '<section class="compte compte-ecran" data-screen="compte-recuperation">',
    retour('compte-vers-connexion', t('retour')),
    entete(glyphe('reprendre'), t('compte.recup.titre'), t('compte.recup.comment')),
    `<p class="compte-note compte-note-douce" data-role="compte-recup-neuf">${t('compte.recup.neuf')}</p>`,
    '<form class="compte-form compte-carte" data-role="compte-form" novalidate>',
    champ({ cle: 'phone', label: t('compte.label.telephone'), type: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: t('compte.telephone_exemple'), ...(telephone !== undefined ? { valeur: telephone } : {}) }),
    champ({ cle: 'code', label: t('compte.label.code'), type: 'text', autocomplete: 'one-time-code', placeholder: t('compte.code_exemple') }),
    champ({ cle: 'firstName', label: t('compte.label.prenom'), type: 'text', autocomplete: 'given-name' }),
    champ({ cle: 'lastName', label: t('compte.label.nom'), type: 'text', autocomplete: 'family-name' }),
    champ({ cle: 'newPassword', label: t('compte.label.mot_nouveau'), type: 'password', autocomplete: 'new-password', aide: t('compte.aide.mot_de_passe'), mdp: true }),
    rester(),
    alerte(),
    `<button class="primary-action" type="submit" data-action="compte-recuperer">${t('compte.recup.envoyer')}</button>`,
    '</form>',
    '</section>',
  ].join('');
}

export function renderSupprimer(): string {
  return [
    '<section class="compte compte-ecran compte-danger" data-screen="compte-supprimer">',
    retour('compte-vers-profil', t('compte.annuler')),
    entete(glyphe('alerte'), t('compte.supprimer.titre'), t('compte.supprimer.explique')),
    '<form class="compte-form compte-carte" data-role="compte-form" novalidate>',
    champ({ cle: 'currentPassword', label: t('compte.label.mot_de_passe'), type: 'password', autocomplete: 'current-password', mdp: true }),
    alerte(),
    `<button class="primary-action problem-path" type="submit" data-action="compte-supprimer">${t('compte.supprimer.envoyer')}</button>`,
    '</form>',
    '</section>',
  ].join('');
}

export function renderModifier(p: ProfilCliente): string {
  return [
    '<section class="compte compte-ecran" data-screen="compte-modifier">',
    retour('compte-vers-profil', t('compte.annuler')),
    entete(personne(), t('compte.modifier.titre')),
    '<form class="compte-form compte-carte" data-role="compte-form" novalidate>',
    champ({ cle: 'firstName', label: t('compte.label.prenom'), type: 'text', autocomplete: 'given-name', valeur: p.firstName }),
    champ({ cle: 'lastName', label: t('compte.label.nom'), type: 'text', autocomplete: 'family-name', valeur: p.lastName }),
    champ({ cle: 'email', label: t('compte.label.email'), type: 'email', autocomplete: 'email', inputmode: 'email', valeur: p.email ?? '' }),
    '<div class="field compte-champ">',
    `<p class="field-label">${t('compte.label.telephone')}</p>`,
    `<p class="compte-fixe" data-info="phone">${esc(p.phone)}</p>`,
    `<p class="compte-aide">${t('compte.modifier.numero_fixe')}</p>`,
    '</div>',
    alerte(),
    `<button class="primary-action" type="submit" data-action="compte-enregistrer">${t('compte.modifier.enregistrer')}</button>`,
    '</form>',
    '</section>',
  ].join('');
}

export function renderMotDePasse(): string {
  return [
    '<section class="compte compte-ecran" data-screen="compte-mot-de-passe">',
    retour('compte-vers-profil', t('compte.annuler')),
    entete(glyphe('cadenas'), t('compte.mdp.titre'), t('compte.mdp.autres')),
    '<form class="compte-form compte-carte" data-role="compte-form" novalidate>',
    champ({ cle: 'currentPassword', label: t('compte.label.mot_actuel'), type: 'password', autocomplete: 'current-password', mdp: true }),
    champ({ cle: 'newPassword', label: t('compte.label.mot_nouveau'), type: 'password', autocomplete: 'new-password', aide: t('compte.aide.mot_de_passe'), mdp: true }),
    alerte(),
    `<button class="primary-action" type="submit" data-action="compte-changer-mdp">${t('compte.mdp.envoyer')}</button>`,
    '</form>',
    '</section>',
  ].join('');
}

/* ─────────────────────────────── controller ────────────────────────────── */

export function monterCompte(main: HTMLElement, opts: OptsCompte): void {
  const { port } = opts;
  let profil: ProfilCliente | null = null;
  let enCours = false;
  /** « Mes commandes » as last read: her read tokens live HERE, never in the page. */
  let commandes: readonly CommandeCompte[] = [];
  /** MON-COMPTE-PLUS — her panier and hearts as her account last answered, and
   *  each boutique as it was read (once per visit of this screen). */
  let articles: ArticlesCompte | 'chargement' | 'echec' | 'hors_ligne' = 'chargement';
  const lectures = new Map<string, LectureBoutique | 'chargement'>();
  const lien = (slug: string): string => opts.lienBoutique?.(slug) ?? '#';
  let boutique: BoutiquePorte | 'attente' | undefined = opts.boutique !== undefined ? 'attente' : undefined;
  const session = () => sessionActive(opts.local, opts.onglet);

  const valeur = (cle: string): string => main.querySelector<HTMLInputElement>(`[data-champ="${cle}"]`)?.value ?? '';

  const effacerRefus = (): void => {
    for (const p of main.querySelectorAll<HTMLElement>('[data-refus]')) p.hidden = true;
    for (const i of main.querySelectorAll<HTMLInputElement>('[data-champ]')) i.removeAttribute('aria-invalid');
    const a = main.querySelector<HTMLElement>('[data-role="compte-alerte"]');
    if (a !== null) {
      a.hidden = true;
      a.replaceChildren();
    }
  };

  /** A field's own sentence under it; anything else in the form's alert. A
   *  taken number also offers the road it points to, with her number kept. */
  const montrerRefus = (r: { champ?: string; texte: string }, numeroPris = false): void => {
    const sous = r.champ !== undefined ? main.querySelector<HTMLElement>(`[data-refus="${r.champ}"]`) : null;
    if (sous !== null && !numeroPris) {
      sous.textContent = r.texte;
      sous.hidden = false;
      const input = main.querySelector<HTMLInputElement>(`[data-champ="${r.champ}"]`);
      input?.setAttribute('aria-invalid', 'true');
      input?.focus();
      return;
    }
    const a = main.querySelector<HTMLElement>('[data-role="compte-alerte"]');
    if (a === null) return;
    const texte = document.createElement('span');
    texte.textContent = r.texte;
    a.replaceChildren(texte);
    if (numeroPris) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'secondary-action';
      b.setAttribute('data-action', 'compte-vers-connexion');
      b.textContent = t('compte.porte.connecter');
      a.append(b);
      main.querySelector<HTMLInputElement>('[data-champ="phone"]')?.setAttribute('aria-invalid', 'true');
    }
    a.hidden = false;
  };

  /** While a request is out, the form's one submit is busy and cannot fire twice. */
  const occupe = (oui: boolean): void => {
    enCours = oui;
    const b = main.querySelector<HTMLButtonElement>('[data-role="compte-form"] [type="submit"]');
    if (b === null) return;
    b.disabled = oui;
    b.setAttribute('aria-busy', oui ? 'true' : 'false');
  };

  const cablerTelephone = (): void => {
    const tel = main.querySelector<HTMLInputElement>('[data-champ="phone"]');
    tel?.addEventListener('input', () => {
      const avant = tel.value.slice(0, tel.selectionStart ?? tel.value.length).replace(/\D/g, '').length;
      tel.value = telEnPaires(tel.value);
      const pos = caretApresChiffres(tel.value, avant);
      tel.setSelectionRange(pos, pos);
    });
  };

  const afficher = (ecran: EcranCompte, extra: { note?: string; telephone?: string } = {}): void => {
    enCours = false;
    main.innerHTML =
      ecran === 'porte' ? renderPorte(boutique)
      : ecran === 'inscription' ? renderInscription()
      : ecran === 'connexion' ? renderConnexion(extra.note, extra.telephone)
      : ecran === 'recuperation' ? renderRecuperation(extra.telephone)
      : ecran === 'supprimer' ? renderSupprimer()
      : ecran === 'modifier' && profil !== null ? renderModifier(profil)
      : ecran === 'mot-de-passe' ? renderMotDePasse()
      : renderProfil(profil ?? 'chargement', extra.note, opts.enCalque === true);
    cablerTelephone();
    // Her boutique's look carries from its doors to the forms they open.
    if (ecran === 'porte' || ecran === 'inscription' || ecran === 'connexion' || ecran === 'recuperation') {
      peindrePorte(main.querySelector('[data-screen]'), boutique);
    }
    if (ecran === 'profil' && profil === null) void lireProfil(extra.note);
    else if (ecran === 'profil') {
      void lireCommandes();
      void lireArticles();
    }
  };

  /** Each boutique card in that boutique's own look (the --vt-* its page wears). */
  const peindreBoutiques = (): void => {
    for (const carte of main.querySelectorAll<HTMLElement>('.compte-boutique[data-theme]')) {
      applyTheme(carte, carte.getAttribute('data-theme') as VitrineThemeKey);
    }
  };

  const poserArticles = (): void => {
    for (const liste of ['panier', 'favoris'] as const) {
      const ici = main.querySelector(`[data-role="compte-${liste}"]`);
      if (ici === null) continue;
      ici.outerHTML = renderArticles(
        liste,
        typeof articles === 'string' ? articles : { groupes: grouperArticles(articles[liste]), boutiques: lectures },
        lien,
      );
    }
    peindreBoutiques();
  };

  const lireUneBoutique = async (slug: string): Promise<LectureBoutique> => {
    if (opts.lireBoutique === undefined) return 'introuvable';
    try {
      return await opts.lireBoutique(slug);
    } catch {
      return 'hors_ligne';
    }
  };

  /** MON-COMPTE-PLUS — her lists from her account, then each boutique in them,
   *  three at a time, each card landing as its boutique answers. A boutique
   *  that did not answer keeps its place and says so, with « Réessayer ». */
  const lireArticles = async (): Promise<void> => {
    const g = session();
    if (g === undefined || main.querySelector('[data-role="compte-panier"]') === null) return;
    const r = await port.articles(g.session);
    if (main.querySelector('[data-role="compte-panier"]') === null) return;
    if (r.kind === 'session_perdue') {
      // Her session ended elsewhere: as her profile says it (verifier minor 2).
      oublierSessions(opts.local, opts.onglet);
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    if (r.kind !== 'ok') {
      articles = r.kind === 'hors_ligne' ? 'hors_ligne' : 'echec';
      poserArticles();
      return;
    }
    articles = r.value;
    const aLire = [...new Set([...r.value.panier, ...r.value.favoris].map((a) => a.slug))]
      .filter((slug) => { const l = lectures.get(slug); return l === undefined || l === 'hors_ligne'; });
    for (const slug of aLire) lectures.set(slug, 'chargement');
    poserArticles();
    const file = [...aLire];
    const suivant = async (): Promise<void> => {
      const slug = file.shift();
      if (slug === undefined) return;
      lectures.set(slug, await lireUneBoutique(slug));
      if (main.querySelector('[data-role="compte-panier"]') !== null) poserArticles();
      await suivant();
    };
    await Promise.all([suivant(), suivant(), suivant()]);
  };

  /** « Mes commandes » is read with her profile, into its own slot: a failed
   *  list never hides her infos, and it says so with a way to try again. */
  const lireCommandes = async (): Promise<void> => {
    const g = session();
    const slot = main.querySelector('[data-role="compte-commandes"]');
    if (g === undefined || slot === null) return;
    const r = await port.commandes(g.session);
    const ici = main.querySelector('[data-role="compte-commandes"]');
    if (ici === null) return;
    if (r.kind === 'ok') commandes = r.value;
    ici.outerHTML = renderCommandes(r.kind === 'ok' ? r.value : 'echec');
  };

  /** The profile is read on every arrival — the service, not this phone, is
   *  where her infos live. A lost session sends her to sign in, said plainly. */
  const lireProfil = async (note?: string): Promise<void> => {
    const g = session();
    if (g === undefined) {
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    const r = await port.lireProfil(g.session);
    if (r.kind === 'ok') {
      profil = r.value;
      rafraichirSession(opts.local, opts.onglet, { session: g.session, prenom: r.value.firstName, telephone: r.value.phone });
      main.innerHTML = renderProfil(r.value, note, opts.enCalque === true);
      void lireCommandes();
      void lireArticles();
      return;
    }
    if (r.kind === 'session_perdue') {
      oublierSessions(opts.local, opts.onglet);
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    main.innerHTML = renderProfil(r.kind === 'hors_ligne' ? 'hors_ligne' : 'indisponible', undefined, opts.enCalque === true);
  };

  /** Signed in: kept on this phone when she ticked « Rester connectée », in
   *  this tab only when she did not. */
  const entrer = (sessionNeuve: string, p: ProfilCliente): void => {
    const resterIci = main.querySelector<HTMLInputElement>('[data-role="compte-rester"]')?.checked !== false;
    oublierSessions(opts.local, opts.onglet);
    garderSession(resterIci ? opts.local : opts.onglet, { session: sessionNeuve, prenom: p.firstName, telephone: p.phone });
    opts.versBoutique();
  };

  main.addEventListener('input', (ev) => {
    const cible = ev.target;
    if (!(cible instanceof HTMLInputElement)) return;
    const cle = cible.getAttribute('data-champ');
    const sous = cle !== null ? main.querySelector<HTMLElement>(`[data-refus="${cle}"]`) : null;
    if (sous !== null) sous.hidden = true;
    cible.removeAttribute('aria-invalid');
  });

  main.addEventListener('click', (ev) => {
    const el = (ev.target as Element | null)?.closest?.('[data-action]');
    if (!(el instanceof HTMLElement)) return;
    const action = el.getAttribute('data-action');
    switch (action) {
      case 'compte-vers-porte': afficher('porte'); break;
      case 'compte-vers-inscription': afficher('inscription'); break;
      case 'compte-vers-connexion':
      case 'compte-vers-recuperation': {
        // A number she typed carries over to the next form: she typed it once.
        const tel = valeur('phone');
        afficher(action === 'compte-vers-connexion' ? 'connexion' : 'recuperation', tel !== '' ? { telephone: tel } : {});
        break;
      }
      case 'compte-vers-supprimer': afficher('supprimer'); break;
      case 'compte-commandes-relire': {
        const ici = main.querySelector('[data-role="compte-commandes"]');
        if (ici !== null) ici.outerHTML = renderCommandes('chargement');
        void lireCommandes();
        break;
      }
      case 'compte-articles-relire':
        articles = 'chargement';
        poserArticles();
        void lireArticles();
        break;
      case 'compte-suivre': {
        const c = commandes.find((x) => x.orderId === el.getAttribute('data-order'));
        if (c !== undefined) opts.ouvrirSuivi?.(c.orderId, c.buyerRef);
        break;
      }
      case 'compte-invitee':
        marquerInvitee(opts.onglet);
        opts.versBoutique();
        break;
      case 'compte-boutique': opts.versBoutique(); break;
      case 'compte-vers-profil': afficher('profil'); break;
      case 'compte-vers-modifier': afficher('modifier'); break;
      case 'compte-vers-mot-de-passe': afficher('mot-de-passe'); break;
      case 'compte-relire':
        profil = null;
        afficher('profil');
        break;
      case 'compte-voir': {
        const pour = el.getAttribute('data-pour');
        const input = pour !== null ? main.querySelector<HTMLInputElement>(`[data-champ="${pour}"]`) : null;
        if (input === null) break;
        const montre = input.type === 'password';
        input.type = montre ? 'text' : 'password';
        el.textContent = montre ? t('compte.masquer') : t('compte.voir');
        el.setAttribute('aria-pressed', montre ? 'true' : 'false');
        break;
      }
      case 'compte-deconnecter': {
        // The phone forgets her at once; the service is told on a best effort.
        const g = session();
        oublierSessions(opts.local, opts.onglet);
        marquerInvitee(opts.onglet);
        if (g !== undefined) void port.deconnecter(g.session);
        opts.versBoutique();
        break;
      }
      default: break;
    }
  });

  main.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (enCours) return;
    effacerRefus();
    const ecran = main.querySelector('[data-screen]')?.getAttribute('data-screen');
    if (ecran === 'compte-inscription') void inscrire();
    else if (ecran === 'compte-connexion') void connecter();
    else if (ecran === 'compte-modifier') void enregistrer();
    else if (ecran === 'compte-mot-de-passe') void changerMotDePasse();
    else if (ecran === 'compte-recuperation') void recuperer();
    else if (ecran === 'compte-supprimer') void supprimer();
  });

  const nomValide = (v: string): boolean => v.trim() !== '' && v.trim().length <= NOM_MAX;

  const inscrire = async (): Promise<void> => {
    const firstName = valeur('firstName').trim();
    const lastName = valeur('lastName').trim();
    const phone = valeur('phone').trim();
    const email = valeur('email').trim();
    const password = valeur('password');
    if (!nomValide(firstName)) return montrerRefus({ champ: 'firstName', texte: t('compte.champ.prenom') });
    if (!nomValide(lastName)) return montrerRefus({ champ: 'lastName', texte: t('compte.champ.nom') });
    if (!numeroComplet(phone)) return montrerRefus({ champ: 'phone', texte: t('compte.champ.telephone') });
    if (email !== '' && !EMAIL.test(email)) return montrerRefus({ champ: 'email', texte: t('compte.champ.email') });
    if (password.length < 8) return montrerRefus({ champ: 'password', texte: t('compte.champ.mot_de_passe') });
    occupe(true);
    const r = await port.inscrire({ firstName, lastName, phone, password, ...(email !== '' ? { email } : {}) });
    occupe(false);
    if (r.kind === 'ok') return entrer(r.value.session, r.value.profil);
    montrerRefus(phraseRefus(r), r.kind === 'refus' && r.reason === 'phone_taken');
  };

  const connecter = async (): Promise<void> => {
    const phone = valeur('phone').trim();
    const password = valeur('password');
    if (!numeroComplet(phone)) return montrerRefus({ champ: 'phone', texte: t('compte.champ.telephone') });
    if (password === '') return montrerRefus({ champ: 'password', texte: t('compte.champ.mot_vide') });
    occupe(true);
    const r = await port.connecter(phone, password);
    occupe(false);
    if (r.kind === 'ok') return entrer(r.value.session, r.value.profil);
    montrerRefus(phraseRefus(r));
  };

  /** The two profile writes share one ending: the service's answer becomes
   *  her profile, and a lost session sends her to sign in. */
  const ecrire = async (patch: Parameters<ComptePort['modifierProfil']>[1], note: string): Promise<void> => {
    const g = session();
    if (g === undefined) {
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    occupe(true);
    const r = await port.modifierProfil(g.session, patch);
    occupe(false);
    if (r.kind === 'ok') {
      profil = r.value;
      rafraichirSession(opts.local, opts.onglet, { session: g.session, prenom: r.value.firstName, telephone: r.value.phone });
      main.innerHTML = renderProfil(r.value, note, opts.enCalque === true);
      void lireCommandes();
      void lireArticles();
      return;
    }
    if (r.kind === 'session_perdue') {
      oublierSessions(opts.local, opts.onglet);
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    montrerRefus(phraseRefus(r));
  };

  const enregistrer = async (): Promise<void> => {
    if (profil === null) return;
    const firstName = valeur('firstName').trim();
    const lastName = valeur('lastName').trim();
    const email = valeur('email').trim();
    if (!nomValide(firstName)) return montrerRefus({ champ: 'firstName', texte: t('compte.champ.prenom') });
    if (!nomValide(lastName)) return montrerRefus({ champ: 'lastName', texte: t('compte.champ.nom') });
    if (email !== '' && !EMAIL.test(email)) return montrerRefus({ champ: 'email', texte: t('compte.champ.email') });
    await ecrire({ firstName, lastName, email }, t('compte.modifier.fait'));
  };

  const changerMotDePasse = async (): Promise<void> => {
    const currentPassword = valeur('currentPassword');
    const newPassword = valeur('newPassword');
    if (currentPassword === '') return montrerRefus({ champ: 'currentPassword', texte: t('compte.champ.mot_actuel') });
    if (newPassword.length < 8) return montrerRefus({ champ: 'newPassword', texte: t('compte.champ.mot_de_passe') });
    await ecrire({ currentPassword, newPassword }, t('compte.mdp.fait'));
  };

  const recuperer = async (): Promise<void> => {
    const phone = valeur('phone').trim();
    const code = valeur('code').trim();
    const firstName = valeur('firstName').trim();
    const lastName = valeur('lastName').trim();
    const newPassword = valeur('newPassword');
    if (!numeroComplet(phone)) return montrerRefus({ champ: 'phone', texte: t('compte.champ.telephone') });
    if (code === '') return montrerRefus({ champ: 'code', texte: t('compte.champ.code') });
    if (!nomValide(firstName)) return montrerRefus({ champ: 'firstName', texte: t('compte.champ.prenom') });
    if (!nomValide(lastName)) return montrerRefus({ champ: 'lastName', texte: t('compte.champ.nom') });
    if (newPassword.length < 8) return montrerRefus({ champ: 'newPassword', texte: t('compte.champ.mot_de_passe') });
    occupe(true);
    const r = await port.recuperer(phone, code, newPassword, { firstName, lastName });
    occupe(false);
    if (r.kind === 'ok') return entrer(r.value.session, r.value.profil);
    montrerRefus(phraseRefus(r));
  };

  const supprimer = async (): Promise<void> => {
    const g = session();
    if (g === undefined) {
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    const currentPassword = valeur('currentPassword');
    if (currentPassword === '') return montrerRefus({ champ: 'currentPassword', texte: t('compte.champ.mot_vide') });
    occupe(true);
    const r = await port.supprimer(g.session, currentPassword);
    occupe(false);
    if (r.kind === 'ok') {
      oublierSessions(opts.local, opts.onglet);
      marquerInvitee(opts.onglet);
      opts.versBoutique();
      return;
    }
    if (r.kind === 'session_perdue') {
      oublierSessions(opts.local, opts.onglet);
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    montrerRefus(phraseRefus(r));
  };

  afficher(opts.ecran);
  // Her boutique lands on the doors when its read answers; a read that fails,
  // or finds nothing, turns the placeholder into the plain Shop+ welcome — the
  // doors below never waited for it.
  const poserBoutique = (b: BoutiquePorte | undefined): void => {
    boutique = b !== undefined && b.nom !== '' ? b : undefined;
    const ecran = main.querySelector('[data-screen]');
    if (['compte-inscription', 'compte-connexion', 'compte-recuperation'].includes(ecran?.getAttribute('data-screen') ?? '')) {
      peindrePorte(ecran, boutique);
    }
    const tete = main.querySelector('[data-role="porte-tete"]');
    if (tete === null) return;
    tete.outerHTML = renderPorteTete(boutique);
    peindrePorte(main.querySelector('[data-screen="compte-porte"]'), boutique);
  };
  void opts.boutique?.then(poserBoutique, () => poserBoutique(undefined));
}
