import { t, tf } from '../i18n';
import { esc } from '../format';
import { caretApresChiffres, telEnPaires } from '../cliente/telephone';
import type { CommandeCompte, ComptePort, Echec, ProfilCliente } from './port';
import { garderSession, marquerInvitee, oublierSessions, rafraichirSession, sessionActive } from './garde';
import { icon } from '../icons';
import { applyTheme, VITRINE_THEMES, type VitrineThemeKey } from '../vitrine/themes';

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
}

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

const prive = (): string => `<p class="compte-prive" data-role="compte-prive">${t('compte.prive')}</p>`;
const alerte = (): string => '<p class="compte-alerte" data-role="compte-alerte" role="alert" hidden></p>';
const retour = (action: string, libelle: string): string =>
  `<button class="link-quiet back-step" type="button" data-action="${action}">${libelle}</button>`;

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
      '<span class="porte-avatar porte-avatar-attente" aria-hidden="true"></span>',
      '<span class="skeleton-line porte-ligne-attente" aria-hidden="true"></span>',
      `<h2 class="porte-titre" data-role="compte-porte-titre">${t('compte.porte.titre_court')}</h2>`,
      sous,
      '</div>',
    ].join('');
  }
  if (b === undefined) {
    return [
      '<div class="porte-tete" data-role="porte-tete" data-etat="shop">',
      `<p class="porte-marque">${t('compte.porte.marque')}</p>`,
      `<h2 class="porte-titre" data-role="compte-porte-titre">${t('compte.porte.titre')}</h2>`,
      sous,
      '</div>',
    ].join('');
  }
  const nom = nomAccueil(b.nom);
  const bulle = `<span class="porte-avatar-bulle">${icon('coche', 'porte-bulle-glyphe')}</span>`;
  const avatar = b.portrait !== undefined
    ? `<span class="porte-avatar porte-avatar-photo" data-role="porte-avatar"><img class="porte-avatar-img" src="${esc(b.portrait)}" alt="${t('vit.avatar_alt')}" decoding="async">${bulle}</span>`
    : `<span class="porte-avatar" data-role="porte-avatar" aria-hidden="true">${esc(nom.charAt(0).toUpperCase())}${bulle}</span>`;
  return [
    '<div class="porte-tete" data-role="porte-tete" data-etat="boutique">',
    avatar,
    b.lieu !== ''
      ? `<p class="porte-verifiee" data-role="porte-verifiee">${icon('coche', 'porte-verifiee-glyphe')}<span>${t('vit.verifiee')} ${esc(b.lieu)}</span></p>`
      : '',
    `<h2 class="porte-titre" data-role="compte-porte-titre">${tf('compte.porte.titre_boutique', { boutique: esc(nom) })}</h2>`,
    sous,
    '</div>',
  ].join('');
}

const atout = (glyphe: string, titre: string, texte: string): string =>
  `<li class="porte-atout"><span class="porte-atout-icone">${icon(glyphe, 'porte-atout-glyphe')}</span>` +
  `<span class="porte-atout-mots"><strong class="porte-atout-titre">${t(titre)}</strong><span class="porte-atout-texte">${t(texte)}</span></span></li>`;

export function renderPorte(b?: BoutiquePorte | 'attente'): string {
  return [
    '<section class="compte porte" data-screen="compte-porte">',
    renderPorteTete(b),
    '<div class="porte-atouts" data-role="porte-atouts">',
    `<p class="porte-atouts-titre">${t('compte.porte.atouts_titre')}</p>`,
    '<ul class="porte-atouts-liste">',
    atout('colis', 'compte.porte.atout1_titre', 'compte.porte.atout1_texte'),
    atout('telephone', 'compte.porte.atout2_titre', 'compte.porte.atout2_texte'),
    atout('cadenas', 'compte.porte.atout3_titre', 'compte.porte.atout3_texte'),
    '</ul>',
    '</div>',
    '<div class="porte-actions">',
    `<button class="primary-action" type="button" data-action="compte-vers-inscription">${t('compte.porte.creer')}</button>`,
    `<button class="secondary-action" type="button" data-action="compte-vers-connexion">${t('compte.porte.connecter')}</button>`,
    `<p class="porte-ou" aria-hidden="true"><span>${t('compte.porte.ou')}</span></p>`,
    // Continuing without an account is a FULL road, never a whisper (canon):
    // a full-width button, quieter in colour only.
    `<button class="porte-invitee" type="button" data-action="compte-invitee">${t('compte.porte.invitee')}</button>`,
    `<p class="porte-invitee-note">${t('compte.porte.invitee_note')}</p>`,
    '</div>',
    '</section>',
  ].join('');
}

/** Her boutique's habillage on the doors — the same `--vt-*` variables the
 *  boutique itself wears; a key outside the closed set paints nothing. */
function peindrePorte(section: Element | null, b: BoutiquePorte | 'attente' | undefined): void {
  if (!(section instanceof HTMLElement) || b === undefined || b === 'attente') return;
  if (VITRINE_THEMES[b.theme] === undefined) return;
  applyTheme(section, b.theme);
}

export function renderInscription(): string {
  return [
    '<section class="compte" data-screen="compte-inscription">',
    retour('compte-vers-porte', t('retour')),
    `<h2 class="compte-titre">${t('compte.inscription.titre')}</h2>`,
    '<form class="compte-form" data-role="compte-form" novalidate>',
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
    '<section class="compte" data-screen="compte-connexion">',
    retour('compte-vers-porte', t('retour')),
    `<h2 class="compte-titre">${t('compte.connexion.titre')}</h2>`,
    note !== undefined ? `<p class="compte-note" data-role="compte-note">${note}</p>` : '',
    '<form class="compte-form" data-role="compte-form" novalidate>',
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

/** Her profile: while it is read, the read's failure (no network, or the
 *  service refused), or her infos. */
export function renderProfil(etat: ProfilCliente | 'chargement' | 'hors_ligne' | 'indisponible', note?: string, enCalque = false): string {
  const tete = [
    '<section class="compte" data-screen="compte-profil">',
    retour('compte-boutique', enCalque ? t('retour') : t('compte.profil.retour')),
    `<h2 class="compte-titre">${t('compte.profil.titre')}</h2>`,
    note !== undefined ? `<p class="compte-note" data-role="compte-note">${note}</p>` : '',
  ];
  if (etat === 'chargement') {
    return [...tete, '<div class="compte-infos" data-role="compte-chargement" aria-busy="true">',
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
    '<dl class="compte-infos">',
    ligne('firstName', t('compte.label.prenom'), esc(etat.firstName)),
    ligne('lastName', t('compte.label.nom'), esc(etat.lastName)),
    ligne('phone', t('compte.label.telephone'), esc(etat.phone)),
    etat.email !== undefined ? ligne('email', t('compte.label.email_court'), esc(etat.email)) : ligne('email', t('compte.label.email_court'), t('compte.profil.sans_email'), true),
    '</dl>',
    prive(),
    '<div class="compte-actions">',
    `<button class="primary-action" type="button" data-action="compte-vers-modifier">${t('compte.profil.modifier')}</button>`,
    `<button class="secondary-action" type="button" data-action="compte-vers-mot-de-passe">${t('compte.profil.mot_de_passe')}</button>`,
    `<button class="secondary-action" type="button" data-action="compte-deconnecter">${t('compte.profil.deconnecter')}</button>`,
    '</div>',
    `<h3 class="compte-sous-titre">${t('compte.commandes.titre')}</h3>`,
    renderCommandes('chargement'),
    `<button class="secondary-action problem-path" type="button" data-action="compte-vers-supprimer">${t('compte.supprimer.ouvrir')}</button>`,
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
    return `<div class="compte-commandes" data-role="compte-commandes"><p class="compte-sous" data-role="compte-commandes-vide">${t('compte.commandes.vide')}</p></div>`;
  }
  return [
    '<div class="compte-commandes" data-role="compte-commandes">',
    ...etat.map((c) =>
      `<button class="compte-commande" type="button" data-action="compte-suivre" data-order="${esc(c.orderId)}">` +
      `<span>${tf('compte.commandes.ligne', { date: dateCourte(c.at) })}</span><span class="compte-commande-ref">${esc(c.orderId)}</span></button>`),
    '</div>',
  ].join('');
}

export function renderRecuperation(telephone?: string): string {
  return [
    '<section class="compte" data-screen="compte-recuperation">',
    retour('compte-vers-connexion', t('retour')),
    `<h2 class="compte-titre">${t('compte.recup.titre')}</h2>`,
    `<p class="compte-sous">${t('compte.recup.comment')}</p>`,
    `<p class="compte-sous" data-role="compte-recup-neuf">${t('compte.recup.neuf')}</p>`,
    '<form class="compte-form" data-role="compte-form" novalidate>',
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
    '<section class="compte" data-screen="compte-supprimer">',
    retour('compte-vers-profil', t('compte.annuler')),
    `<h2 class="compte-titre">${t('compte.supprimer.titre')}</h2>`,
    `<p class="compte-sous">${t('compte.supprimer.explique')}</p>`,
    '<form class="compte-form" data-role="compte-form" novalidate>',
    champ({ cle: 'currentPassword', label: t('compte.label.mot_de_passe'), type: 'password', autocomplete: 'current-password', mdp: true }),
    alerte(),
    `<button class="primary-action problem-path" type="submit" data-action="compte-supprimer">${t('compte.supprimer.envoyer')}</button>`,
    '</form>',
    '</section>',
  ].join('');
}

export function renderModifier(p: ProfilCliente): string {
  return [
    '<section class="compte" data-screen="compte-modifier">',
    retour('compte-vers-profil', t('compte.annuler')),
    `<h2 class="compte-titre">${t('compte.modifier.titre')}</h2>`,
    '<form class="compte-form" data-role="compte-form" novalidate>',
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
    '<section class="compte" data-screen="compte-mot-de-passe">',
    retour('compte-vers-profil', t('compte.annuler')),
    `<h2 class="compte-titre">${t('compte.mdp.titre')}</h2>`,
    '<form class="compte-form" data-role="compte-form" novalidate>',
    champ({ cle: 'currentPassword', label: t('compte.label.mot_actuel'), type: 'password', autocomplete: 'current-password', mdp: true }),
    champ({ cle: 'newPassword', label: t('compte.label.mot_nouveau'), type: 'password', autocomplete: 'new-password', aide: t('compte.aide.mot_de_passe'), mdp: true }),
    `<p class="compte-sous">${t('compte.mdp.autres')}</p>`,
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
    if (ecran === 'porte') peindrePorte(main.querySelector('[data-screen="compte-porte"]'), boutique);
    if (ecran === 'profil' && profil === null) void lireProfil(extra.note);
    else if (ecran === 'profil') void lireCommandes();
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
    const tete = main.querySelector('[data-role="porte-tete"]');
    if (tete === null) return;
    tete.outerHTML = renderPorteTete(boutique);
    peindrePorte(main.querySelector('[data-screen="compte-porte"]'), boutique);
  };
  void opts.boutique?.then(poserBoutique, () => poserBoutique(undefined));
}
