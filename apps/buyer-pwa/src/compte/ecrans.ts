import { t } from '../i18n';
import { esc } from '../format';
import { caretApresChiffres, telEnPaires } from '../cliente/telephone';
import type { ComptePort, Echec, ProfilCliente } from './port';
import { garderSession, marquerInvitee, oublierSession, sessionGardee } from './garde';

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
 * Every act is one request on a tap, never queued: nothing about her account
 * is « done » until the service said so. A refusal keeps what she typed and
 * says, in one sentence, what to do. Server bytes reach the page escaped, and
 * her session never reaches it at all.
 */

export type EcranCompte = 'porte' | 'inscription' | 'connexion' | 'profil' | 'modifier' | 'mot-de-passe';

export interface OptsCompte {
  readonly port: ComptePort;
  /** localStorage — where her session is kept. */
  readonly local: Storage | undefined;
  /** sessionStorage — where « Continuer sans compte » is remembered for the tab. */
  readonly onglet: Storage | undefined;
  readonly ecran: EcranCompte;
  /** She is done here (signed in or up, continued without, signed out, or back). */
  readonly versBoutique: () => void;
}

const NOM_MAX = 60;

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

export function renderPorte(): string {
  return [
    '<section class="compte" data-screen="compte-porte">',
    `<h2 class="compte-titre">${t('compte.porte.titre')}</h2>`,
    `<p class="compte-sous">${t('compte.porte.sous')}</p>`,
    '<div class="compte-actions">',
    `<button class="primary-action" type="button" data-action="compte-vers-inscription">${t('compte.porte.creer')}</button>`,
    `<button class="secondary-action" type="button" data-action="compte-vers-connexion">${t('compte.porte.connecter')}</button>`,
    `<button class="secondary-action" type="button" data-action="compte-invitee">${t('compte.porte.invitee')}</button>`,
    '</div>',
    `<p class="compte-sous">${t('compte.porte.invitee_note')}</p>`,
    prive(),
    '</section>',
  ].join('');
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
    alerte(),
    `<button class="primary-action" type="submit" data-action="compte-connecter">${t('compte.connexion.envoyer')}</button>`,
    '</form>',
    `<button class="link-quiet" type="button" data-action="compte-vers-inscription">${t('compte.connexion.creer')}</button>`,
    '</section>',
  ].join('');
}

/** Her profile: while it is read, the read's failure (no network, or the
 *  service refused), or her infos. */
export function renderProfil(etat: ProfilCliente | 'chargement' | 'hors_ligne' | 'indisponible', note?: string): string {
  const tete = [
    '<section class="compte" data-screen="compte-profil">',
    retour('compte-boutique', t('compte.profil.retour')),
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
      ecran === 'porte' ? renderPorte()
      : ecran === 'inscription' ? renderInscription()
      : ecran === 'connexion' ? renderConnexion(extra.note, extra.telephone)
      : ecran === 'modifier' && profil !== null ? renderModifier(profil)
      : ecran === 'mot-de-passe' ? renderMotDePasse()
      : renderProfil(profil ?? 'chargement', extra.note);
    cablerTelephone();
    if (ecran === 'profil' && profil === null) void lireProfil(extra.note);
  };

  /** The profile is read on every arrival — the service, not this phone, is
   *  where her infos live. A lost session sends her to sign in, said plainly. */
  const lireProfil = async (note?: string): Promise<void> => {
    const g = sessionGardee(opts.local);
    if (g === undefined) {
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    const r = await port.lireProfil(g.session);
    if (r.kind === 'ok') {
      profil = r.value;
      garderSession(opts.local, { session: g.session, prenom: r.value.firstName });
      main.innerHTML = renderProfil(r.value, note);
      return;
    }
    if (r.kind === 'session_perdue') {
      oublierSession(opts.local);
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    main.innerHTML = renderProfil(r.kind === 'hors_ligne' ? 'hors_ligne' : 'indisponible');
  };

  const entrer = (session: string, p: ProfilCliente): void => {
    garderSession(opts.local, { session, prenom: p.firstName });
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
      case 'compte-vers-connexion': {
        // A taken number carries over to the sign-in form: she typed it once.
        const tel = valeur('phone');
        afficher('connexion', tel !== '' ? { telephone: tel } : {});
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
        const g = sessionGardee(opts.local);
        oublierSession(opts.local);
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
    const g = sessionGardee(opts.local);
    if (g === undefined) {
      afficher('connexion', { note: t('compte.refus.session') });
      return;
    }
    occupe(true);
    const r = await port.modifierProfil(g.session, patch);
    occupe(false);
    if (r.kind === 'ok') {
      profil = r.value;
      garderSession(opts.local, { session: g.session, prenom: r.value.firstName });
      main.innerHTML = renderProfil(r.value, note);
      return;
    }
    if (r.kind === 'session_perdue') {
      oublierSession(opts.local);
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

  afficher(opts.ecran);
}
