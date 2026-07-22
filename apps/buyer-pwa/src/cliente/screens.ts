/**
 * PWA CLIENTE — §4 écrans C1–C9, pixel-for-pixel to `docs/PWA Cliente -
 * Redesign.dc.html`. This module emits structure + copy only; θ lives in the
 * stylesheet (var(--vt-*) set by applyTheme on the container).
 *
 * Copy is the pixel source's, verbatim — typographic apostrophes (U+2019),
 * guillemets, the C4 en dash. Amounts pass through `fmtFCFA`/`groupFr` (the
 * byte-controlled NNBSP, one escaped constant) — never Intl, never a bare
 * « F ». Money is RENDER-ONLY: every fee/total/reconciliation figure is read
 * from the server-frozen ClienteQuote — no renderer ever adds two amounts.
 * Model-derived strings pass through `esc`. No purchase-side economics field
 * exists here — the §0 wall: the four banned buyer-facing terms grep to 0
 * across this module, sources included.
 *
 * The photo placeholder draws the CANON SVG product glyph (vitrine set) — the
 * pixel prototype's emoji is forbidden by the no-emoji-in-chrome gate (the
 * achat precedent). Glyph color on the sable frame is undefined in the
 * handoff → ink, with the pixel drop-shadow (flagged §8-style).
 */

import { esc } from '../format';
import { productGlyph } from '../vitrine/icons';
import { fmtFCFA, groupFr, NNBSP } from './money';
import {
  RECORDED_WAVE_SVG, VOICE_WAVE_HEIGHTS,
  iconBack, iconCheck, iconCheckSquare, iconChevron, iconClock, iconEye, iconFlag,
  iconKey, iconLock, iconLockDot, iconMic, iconMicOff, iconPhone, iconPlay,
  iconPlaySmall, iconScooter, iconShieldCheck, iconWifiOff,
} from './icons';

/** The offered product (the signed page's `prixClient` is `priceFcfa`). */
export interface ClienteProduit {
  readonly shopName: string;
  readonly prenom: string;
  readonly slug: string;
  readonly productName: string;
  /** e.g. « TAILLE M » — absent on real products without a variant. */
  readonly variant?: string;
  readonly zone: string;
  readonly priceFcfa: number;
  /** Canon SVG product-glyph key (the vitrine set) — the no-emoji placeholder. */
  readonly glyph: string;
  readonly voiceDuree?: string;
  readonly inStock: boolean;
}

/**
 * The SERVER-FROZEN quote (§3.2 · §0 « argent = render-only »). Composed once
 * by the seed layer (the contract-certified mock of the quote service — the
 * TOTAUX precedent), rendered as-is: no screen ever recomputes a total.
 */
export interface ClienteQuote {
  readonly produitFcfa: number;
  readonly feeToday: number;
  readonly feeTomorrow: number;
  readonly totalToday: number;
  readonly totalTomorrow: number;
}

export type Livraison = 'today' | 'tomorrow';
export type ModePaiement = 'A' | 'B';
export type VoiceEtat = 'idle' | 'recording' | 'recorded' | 'queued' | 'refused';
export type DoorEtat = 'inspecting' | 'accepted' | 'report';
export type ConfirmEtat = 'confirmed' | 'pending' | 'offline';

/** Les 8 zones (§4 C3 — l'ensemble exact du pixel source). */
export const ZONES: readonly string[] = ['Gounghin', 'Dassasgho', 'Pissy', 'Tampouy', 'Wemtenga', 'Zogona', 'Cissin', 'Somgandé'];

/** Les 6 étapes du suivi (§4 C7 — titres + descriptions verbatim). */
export const SUIVI_STEPS: ReadonlyArray<{ t: string; d: string }> = [
  { t: 'Commande enregistrée', d: 'Nous avons bien reçu votre commande.' },
  { t: 'Préparée par la vendeuse', d: 'Aïcha prépare votre colis.' },
  { t: 'Vérifiée et scellée par Séra', d: 'Le livreur contrôle le colis avant de partir.' },
  { t: 'En route', d: 'Le colis est en chemin vers votre repère.' },
  { t: 'À votre porte', d: 'Inspectez avant de payer le reste.' },
  { t: 'Remise', d: 'Votre code fait foi.' },
];

/** [DEMO] le libellé de l'étape suivante (index = step courant 1–4). */
export const SIM_LABELS: readonly string[] = ['', 'Préparée', 'Vérifiée et scellée', 'En route', 'À votre porte'];

/** Les 3 motifs de signalement (§4 C8). */
export const MOTIFS: readonly string[] = ['Ce n’est pas le bon article', 'Il est abîmé', 'Il manque quelque chose'];

/** Le code de remise du prototype (§4 C9 — espace simple, ce n'est pas un montant). */
export const CODE_REMISE = '734 921';

/** « TAILLE M » → « M » (la ligne récap C5 et la checklist C8 du pixel source). */
export function varianteCourte(variant: string): string {
  return variant.replace(/^TAILLE\s+/i, '');
}

const fee = (q: ClienteQuote, d: Livraison): number => (d === 'tomorrow' ? q.feeTomorrow : q.feeToday);
const total = (q: ClienteQuote, d: Livraison): number => (d === 'tomorrow' ? q.totalTomorrow : q.totalToday);
/** Payé maintenant — lu du devis figé, jamais recalculé ici. */
export const payezMaintenant = (q: ClienteQuote, d: Livraison, mode: ModePaiement): number =>
  mode === 'A' ? total(q, d) : fee(q, d);

/** « Payé maintenant » formaté (les octets NNBSP·FCFA). */
export const fmtPayezMaintenant = (q: ClienteQuote, d: Livraison, mode: ModePaiement): string =>
  fmtFCFA(payezMaintenant(q, d, mode));

/* ------------------------------------------------------------- chrome ---- */

function backBtn(action: string): string {
  return `<button class="cl-round-btn" data-action="${action}" aria-label="Retour">${iconBack(17)}</button>`;
}

function stepHead(action: string, title: string): string {
  return `<div class="cl-stephead">${backBtn(action)}<div class="cl-steptitle">${title}</div></div>`;
}

export function renderOffline(): string {
  return `<div class="cl-offline" data-role="offline-banner">${iconWifiOff(14)}Hors ligne : vos actions sont en attente, jamais perdues.</div>`;
}

export function renderSkeleton(): string {
  return [
    '<div class="cl-skel" data-screen="squelette">',
    '<div class="cl-skel-title"></div><div class="cl-skel-photo"></div><div class="cl-skel-name"></div><div class="cl-skel-band"></div><div class="cl-skel-cta"></div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C1 ---- */

export function renderC1(m: ClienteProduit, o: { epuise: boolean; sansVoix: boolean }): string {
  const out = o.epuise;
  const pbPill = out
    ? '<span class="cl-pb-pill">ÉPUISÉ</span>'
    : `<span class="cl-pb-pill">PAGE SIGNÉE ${iconCheck(10, 3)}</span>`;
  const pbFoot = out
    ? 'Le prix reste signé — il reviendra tel quel si le stock revient.'
    : 'Livraison Séra en plus — affichée à part, jamais cachée.';
  const voix = !o.sansVoix && m.voiceDuree
    ? [
        '<div class="cl-voix" data-role="voix">',
        `<button class="cl-voix-play" data-action="voix-lire" aria-label="Écouter la voix d’${esc(m.prenom)}">${iconPlay(16)}</button>`,
        '<div class="cl-voix-col"><div class="cl-voix-top">',
        `<span class="cl-voix-title">La voix d’${esc(m.prenom)}</span><span class="cl-voix-dur">${esc(m.voiceDuree)}</span>`,
        '</div><div class="cl-wave">',
        VOICE_WAVE_HEIGHTS.map((h) => `<span class="cl-wavebar" style="height:${h}px;"></span>`).join(''),
        '</div></div></div>',
      ].join('')
    : '';
  return [
    '<div class="cl-screen" data-screen="C1">',
    '<div class="cl-head">',
    `<div class="cl-avatar">${esc(m.prenom.charAt(0).toUpperCase())}</div>`,
    `<div class="cl-idcol"><div class="cl-shopname">${esc(m.shopName)}</div>`,
    `<div class="cl-verirow"><span class="cl-veri-txt">Vendeuse vérifiée</span> <span class="cl-veri-check">${iconCheck(13, 2.6)}</span><span class="cl-dotsep">·</span><button class="cl-voir" data-action="voir-boutique" data-slug="${esc(m.slug)}">Voir la boutique ›</button></div></div>`,
    `<button class="cl-shield" data-action="ouvrir-protections" aria-label="Vos protections">${iconShieldCheck(18, 1.9)}</button>`,
    '</div>',
    '<div class="cl-photo">',
    '<div class="cl-tick cl-tick-tl"></div><div class="cl-tick cl-tick-tr"></div><div class="cl-tick cl-tick-bl"></div><div class="cl-tick cl-tick-br"></div>',
    `<span class="cl-photo-glyph">${productGlyph(m.glyph)}</span>`,
    '<div class="cl-photo-caps">PHOTO RÉELLE DU PRODUIT</div>',
    out ? '<div class="cl-photo-veil"><span class="cl-epuise-stamp">ÉPUISÉ</span></div>' : '',
    '</div>',
    `<div class="cl-caption-row"><span>Photo réelle — ce que vous recevrez.</span><span class="cl-vendu">Vendu par ${esc(m.prenom)}</span></div>`,
    `<div class="cl-prodtitle">${esc(m.productName)}</div>`,
    `<div class="cl-chiprow">${m.variant ? `<span class="cl-variant">${esc(m.variant)}</span>` : ''}<span class="cl-prod-zone">${esc(m.zone)}</span></div>`,
    voix,
    `<div class="cl-pb${out ? ' cl-pb-epuise' : ''}" data-role="price-band">`,
    '<div class="cl-pb-fil"></div><div class="cl-pb-tex"></div><div class="cl-pb-inner">',
    `<div class="cl-pb-top"><span class="cl-pb-overline">PRIX</span>${pbPill}</div>`,
    `<div class="cl-pb-amount"><span class="cl-pb-hero">${groupFr(m.priceFcfa)}</span><span class="cl-pb-suffix">${NNBSP}FCFA</span></div>`,
    `<div class="cl-pb-foot">${pbFoot}</div>`,
    '</div></div>',
    '<div class="cl-trust">',
    `<div class="cl-trust-row"><span class="cl-trust-ic">${iconScooter(17, 1.8)}</span><span class="cl-trust-txt">Livré par Séra, à votre repère</span></div>`,
    `<div class="cl-trust-row"><span class="cl-trust-ic">${iconShieldCheck(17, 1.8)}</span><span class="cl-trust-txt">Paiement protégé — inspectez avant de payer</span></div>`,
    `<button class="cl-trust-link" data-action="ouvrir-protections"><span class="cl-trust-ic">${iconLock(16, 1.9)}</span><span class="cl-trust-link-txt">Vos protections</span><span class="cl-trust-chev">${iconChevron(14)}</span></button>`,
    '</div>',
    out ? `<div class="cl-epuise-card">Ce produit est épuisé pour le moment. Revenez voir la boutique d’${esc(m.prenom)} — elle ajoute souvent de nouveaux articles.</div>` : '',
    `<button class="cl-cta cl-cta-c1${out ? ' cl-cta-off' : ''}" data-action="commander"${out ? ' disabled' : ''}>Commander</button>`,
    '<div class="cl-footnote">Votre numéro reste privé.</div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C3 ---- */

export interface C3State {
  readonly zone: string | null;
  readonly repere: string;
  readonly indic: string;
  readonly voice: VoiceEtat;
  readonly recTime: string;
  readonly canContinue: boolean;
}

function renderVoiceBlock(s: C3State): string {
  switch (s.voice) {
    case 'idle':
      return `<button class="cl-voice-idle" data-action="voix-demarrer">${iconMic(17)}Enregistrer le repère</button>`;
    case 'recording':
      return [
        '<div class="cl-voice-rec" data-role="voice-recording">',
        '<span class="cl-rec-dot"></span>',
        `<span class="cl-rec-time" data-role="rec-time">${esc(s.recTime)}</span>`,
        '<button class="cl-rec-stop" data-action="voix-arreter">ARRÊTER</button>',
        '</div>',
        '<div class="cl-rec-hint">Parlez comme au marché : « Face à la pharmacie, portail bleu. »</div>',
      ].join('');
    case 'recorded':
      return [
        '<div class="cl-voice-done" data-role="voice-recorded">',
        `<button class="cl-voice-done-play" data-action="voix-lire-note" aria-label="Écouter">${iconPlaySmall(13, 14)}</button>`,
        `<span class="cl-voice-done-wave">${RECORDED_WAVE_SVG}</span>`,
        `<span class="cl-voice-done-time">${esc(s.recTime)}</span>`,
        '<button class="cl-refaire" data-action="voix-refaire">REFAIRE</button>',
        '</div>',
      ].join('');
    case 'queued':
      return `<div class="cl-voice-note cl-voice-queued" data-role="voice-queued">${iconClock(16)}Note vocale gardée. C’est noté — en attente du réseau.</div>`;
    case 'refused':
      return `<div class="cl-voice-note cl-voice-refused" data-role="voice-refused">${iconMicOff(16)}Le micro n’est pas disponible. Écrivez le repère au-dessus — ça marche aussi bien.</div>`;
  }
}

export function renderC3(s: C3State): string {
  return [
    '<div class="cl-screen" data-screen="C3">',
    stepHead('retour-c1', 'Où livrer ?'),
    '<div class="cl-intro">Pas besoin d’adresse — ici, un bon repère vaut mieux. Le livreur connaît la ville.</div>',
    '<div class="cl-overline">Votre zone</div>',
    '<div class="cl-chips">',
    ZONES.map((z) => `<button class="cl-chip${s.zone === z ? ' cl-chip-on' : ''}" data-action="zone" data-zone="${esc(z)}">${esc(z)}</button>`).join(''),
    '</div>',
    '<div class="cl-overline">Le repère</div>',
    `<input class="cl-field" data-role="repere" value="${esc(s.repere)}" placeholder="Ex. : Face à la pharmacie du marché">`,
    `<input class="cl-field cl-field-indic" data-role="indic" value="${esc(s.indic)}" placeholder="Indication en plus (facultatif)">`,
    '<div class="cl-overline">Ou dites-le de vive voix</div>',
    renderVoiceBlock(s),
    `<div class="cl-privline">${iconLock(14)}Le livreur passe par un relais. Votre numéro reste privé.</div>`,
    `<button class="cl-cta cl-cta-c3${s.canContinue ? '' : ' cl-cta-off'}" data-action="continuer-c3"${s.canContinue ? '' : ' disabled'}>Continuer</button>`,
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C4 ---- */

export interface C4State {
  readonly zone: string;
  readonly repereRecap: string;
  readonly delivery: Livraison | null;
}

export function renderC4(q: ClienteQuote, s: C4State): string {
  const options: ReadonlyArray<{ k: Livraison; title: string; feeF: string; sub: string }> = [
    { k: 'today', title: 'Aujourd’hui, avant 19 h', feeF: fmtFCFA(q.feeToday), sub: 'Un livreur Séra vérifie et scelle le colis avant de partir.' },
    { k: 'tomorrow', title: 'Demain, 9 h – 12 h', feeF: fmtFCFA(q.feeTomorrow), sub: 'Course groupée dans votre zone — un peu moins chère.' },
  ];
  const can = s.delivery !== null;
  return [
    '<div class="cl-screen" data-screen="C4">',
    stepHead('retour-c3', 'La livraison'),
    '<div class="cl-recap">',
    `<span class="cl-recap-flag">${iconFlag(18)}</span>`,
    `<div class="cl-recap-col"><div class="cl-recap-zone">${esc(s.zone.toUpperCase())}</div><div class="cl-recap-rep">${esc(s.repereRecap)}</div></div>`,
    '<button class="cl-modifier" data-action="retour-c3">MODIFIER</button>',
    '</div>',
    '<div class="cl-law">Le prix de la course est fixé par Séra. Il est affiché à part — jamais caché dans le prix du produit.</div>',
    options.map((o) => {
      const on = s.delivery === o.k;
      return [
        `<button class="cl-opt${on ? ' cl-opt-on' : ''}" data-action="choix-livraison" data-choix="${o.k}">`,
        on ? `<span class="cl-opt-mark">${iconCheck(14, 3)}</span>` : '',
        `<div class="cl-opt-row"><span class="cl-opt-title">${o.title}</span><span class="cl-opt-fee">${o.feeF}</span></div>`,
        `<div class="cl-opt-sub">${o.sub}</div>`,
        '</button>',
      ].join('');
    }).join(''),
    '<div class="cl-quote">La course est payée à Séra. Chaque franc a sa place.</div>',
    `<button class="cl-cta cl-cta-step${can ? '' : ' cl-cta-off'}" data-action="continuer-c4"${can ? '' : ' disabled'}>Continuer</button>`,
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C5 ---- */

export interface C5State {
  readonly delivery: Livraison;
  readonly pay: ModePaiement | null;
  readonly paying: 'idle' | 'submitting' | 'provider';
  readonly bInel: boolean;
}

const ECOUTER = `<span class="cl-ecouter" data-action="note-ecouter">${iconPlaySmall(10, 11)}ÉCOUTER LA NOTE</span>`;

export function renderC5(m: ClienteProduit, q: ClienteQuote, s: C5State): string {
  const feeStr = fmtFCFA(fee(q, s.delivery));
  const totalStr = fmtFCFA(total(q, s.delivery));
  const produitStr = fmtFCFA(q.produitFcfa);
  const reconcile = `${groupFr(total(q, s.delivery))} = ${groupFr(q.produitFcfa)} + ${groupFr(fee(q, s.delivery))} — chaque franc a sa place.`;
  const payNowStr = s.pay ? fmtFCFA(payezMaintenant(q, s.delivery, s.pay)) : '';
  const ctaLabel = !s.pay ? 'Choisissez pour continuer' : s.pay === 'A' ? `Payer ${totalStr}` : `Payer ${feeStr} maintenant`;
  const can = s.pay !== null;
  const ligneProduit = `${esc(m.productName)}${m.variant ? ` · ${esc(varianteCourte(m.variant))}` : ''}`;

  if (s.paying === 'submitting') {
    return [
      '<div class="cl-screen" data-screen="C5" data-etat="envoi">',
      stepHead('retour-c4', 'Le paiement'),
      '<div class="cl-sub">',
      '<div class="cl-sub-overline">ENVOI SÉCURISÉ</div>',
      '<div class="cl-sub-title">Un instant.</div>',
      `<div class="cl-sub-body">Nous envoyons votre demande de paiement de <b>${payNowStr}</b> à l’opérateur.</div>`,
      '<div class="cl-bar-track"><div class="cl-bar-fill"></div></div>',
      '</div></div>',
    ].join('');
  }
  if (s.paying === 'provider') {
    return [
      '<div class="cl-screen" data-screen="C5" data-etat="operateur">',
      stepHead('retour-c4', 'Le paiement'),
      '<div class="cl-prov">',
      `<div class="cl-prov-phone">${iconPhone(30)}</div>`,
      '<div class="cl-prov-title">Confirmez sur votre téléphone</div>',
      `<div class="cl-prov-body">Composez votre code secret <b>Orange Money</b> pour valider <b>${payNowStr}</b>.</div>`,
      '<div class="cl-prov-wait"><span class="cl-prov-dots"><span class="cl-prov-dot"></span><span class="cl-prov-dot"></span><span class="cl-prov-dot"></span></span><span>En attente de la confirmation de l’opérateur…</span></div>',
      '<div class="cl-prov-law">Rien n’est confirmé tant que l’opérateur n’a pas répondu. Nous ne dirons jamais le contraire.</div>',
      '</div></div>',
    ].join('');
  }
  return [
    '<div class="cl-screen" data-screen="C5" data-etat="choix">',
    stepHead('retour-c4', 'Le paiement'),
    '<div class="cl-bill">',
    `<div class="cl-bill-row"><span>${ligneProduit}</span><b>${produitStr}</b></div>`,
    `<div class="cl-bill-row cl-bill-liv"><span>Livraison Séra — jamais cachée</span><b>${feeStr}</b></div>`,
    `<div class="cl-bill-total"><span>Total</span><b>${totalStr}</b></div>`,
    '</div>',
    `<div class="cl-reconcile" data-role="reconcile">${reconcile}</div>`,
    '<div class="cl-overline cl-overline-pay">Comment payer ?</div>',
    `<button class="cl-opt cl-payopt${s.pay === 'A' ? ' cl-opt-on' : ''}" data-action="choix-paiement" data-mode="A">`,
    s.pay === 'A' ? `<span class="cl-opt-mark">${iconCheck(14, 3)}</span>` : '',
    `<div class="cl-opt-row"><span class="cl-payopt-ic">${iconLockDot(17)}</span><span class="cl-opt-title">Tout payer maintenant</span></div>`,
    `<div class="cl-payopt-body"><b>${totalStr}</b> maintenant, en sécurité. Rien à payer à la porte.</div>`,
    ECOUTER,
    '</button>',
    s.bInel
      ? [
          '<div class="cl-payinel" data-role="pay-inel">',
          `<div class="cl-payinel-head">${iconScooter(18)}<span>Payer à la livraison</span></div>`,
          '<div class="cl-payinel-body">Pas disponible pour cette commande. Vous pouvez tout payer maintenant, en sécurité — et toujours inspecter avant d’accepter.</div>',
          '</div>',
        ].join('')
      : [
          `<button class="cl-opt cl-payopt${s.pay === 'B' ? ' cl-opt-on' : ''}" data-action="choix-paiement" data-mode="B">`,
          s.pay === 'B' ? `<span class="cl-opt-mark">${iconCheck(14, 3)}</span>` : '',
          `<div class="cl-opt-row"><span class="cl-payopt-ic">${iconScooter(18)}</span><span class="cl-opt-title">Payer à la livraison</span></div>`,
          `<div class="cl-payopt-body"><b>${feeStr}</b> maintenant — et <b>${produitStr}</b> à la porte, après votre inspection.</div>`,
          ECOUTER,
          '</button>',
        ].join(''),
    '<div class="cl-quote">Vous inspectez le colis avant de payer le reste.</div>',
    `<button class="cl-cta cl-cta-c5${can ? '' : ' cl-cta-off'}" data-action="payer"${can ? '' : ' disabled'}>${ctaLabel}</button>`,
    '<div class="cl-providers">ORANGE MONEY · MOOV MONEY</div>',
    '<div class="cl-footnote cl-footnote-c5">Votre numéro reste privé.</div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C6 ---- */

export function renderC6(m: ClienteProduit, o: { confirmState: ConfirmEtat; payNowStr: string }): string {
  let body: string;
  if (o.confirmState === 'confirmed') {
    body = [
      '<div class="cl-conf" data-etat="confirmee">',
      `<div class="cl-conf-disc">${iconCheck(36, 2.6)}</div>`,
      '<div class="cl-conf-title">Commande enregistrée.</div>',
      `<div class="cl-conf-body">Paiement de <b>${o.payNowStr}</b> confirmé par l’opérateur.</div>`,
      '</div>',
      '<div class="cl-steps">',
      `<div class="cl-step-row"><span class="cl-step-num">1</span><span class="cl-step-txt">${esc(m.prenom)} prépare votre commande</span></div>`,
      '<div class="cl-step-row"><span class="cl-step-num">2</span><span class="cl-step-txt">Séra vérifie et scelle le colis</span></div>',
      '<div class="cl-step-row"><span class="cl-step-num">3</span><span class="cl-step-txt">Nous vous prévenons à chaque étape</span></div>',
      '</div>',
    ].join('');
  } else if (o.confirmState === 'pending') {
    body = [
      '<div class="cl-conf" data-etat="attente">',
      `<div class="cl-conf-ring">${iconClock(34)}</div>`,
      '<div class="cl-conf-title cl-conf-title-pending">C’est noté.</div>',
      '<div class="cl-conf-body cl-conf-body-max">En attente du réseau. Votre commande est gardée sur ce téléphone — elle part dès que le réseau revient.</div>',
      '<div class="cl-conf-chip">EN ATTENTE — JAMAIS PERDUE</div>',
      '</div>',
    ].join('');
  } else {
    body = [
      '<div class="cl-conf" data-etat="hors-ligne">',
      `<div class="cl-conf-ring">${iconWifiOff(32)}</div>`,
      '<div class="cl-conf-title cl-conf-title-offline">Hors ligne — rien n’est perdu.</div>',
      '<div class="cl-conf-body cl-conf-body-max">Votre commande attend sur ce téléphone. Le paiement partira quand le réseau reviendra. Nous ne dirons jamais « payé » avant l’opérateur.</div>',
      '</div>',
    ].join('');
  }
  return [
    '<div class="cl-screen" data-screen="C6">',
    body,
    '<button class="cl-cta cl-cta-c6" data-action="suivre">Suivre ma commande</button>',
    '<div class="cl-footnote">Votre numéro reste privé.</div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C7 ---- */

export interface C7State {
  readonly step: number;
  readonly problem: boolean;
  readonly demo: boolean;
}

export function renderC7(s: C7State): string {
  const atDoor = s.step >= 5 && !s.problem && s.step < 6;
  const canSim = s.demo && s.step < 5 && !s.problem;
  return [
    '<div class="cl-screen" data-screen="C7">',
    '<div class="cl-stephead"><div class="cl-steptitle">Le suivi</div><span class="cl-cmd">CMD-2417</span></div>',
    '<div class="cl-c7-intro">Nous vous prévenons à chaque étape. Pas besoin de rester sur cette page.</div>',
    s.problem ? '<div class="cl-problem" data-role="problem-banner">Problème signalé. Une personne s’en occupe. La commande reste protégée.</div>' : '',
    '<div class="cl-tl">',
    SUIVI_STEPS.map((st, i) => {
      const n = i + 1;
      const done = n < s.step;
      const current = n === s.step;
      const dot = done
        ? `<div class="cl-tl-dot cl-tl-dot-done">${iconCheck(11, 3.4)}</div>`
        : current
          ? '<div class="cl-tl-dot cl-tl-dot-now"><span class="cl-tl-heart"></span></div>'
          : '<div class="cl-tl-dot"></div>';
      const bar = n < 6 ? `<div class="cl-tl-bar${done ? ' cl-tl-bar-done' : ''}"></div>` : '';
      const tClass = current ? 'cl-tl-t-now' : done ? 'cl-tl-t-done' : 'cl-tl-t-future';
      return [
        '<div class="cl-tl-row">',
        `<div class="cl-tl-rail">${dot}${bar}</div>`,
        '<div class="cl-tl-body"><div class="cl-tl-toprow">',
        `<span class="cl-tl-t ${tClass}">${st.t}</span>`,
        current ? '<span class="cl-now-badge">MAINTENANT</span>' : '',
        `</div><div class="cl-tl-d">${st.d}</div></div>`,
        '</div>',
      ].join('');
    }).join(''),
    '</div>',
    atDoor ? '<button class="cl-cta cl-cta-door" data-action="porte">Je suis à la porte</button>' : '',
    canSim ? `<button class="cl-sim" data-action="simuler">▶ Simuler l’étape suivante — ${SIM_LABELS[s.step] ?? ''} (démo)</button>` : '',
    '<div class="cl-c7-actions">',
    '<button class="cl-c7-btn" data-action="ouvrir-protections">Vos protections</button>',
    '<button class="cl-c7-btn cl-c7-report" data-action="signaler-c7">Signaler un problème</button>',
    '</div>',
    '<div class="cl-footnote">Pas de point GPS — des étapes claires, et nous vous prévenons.</div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C8 ---- */

export interface C8State {
  readonly door: DoorEtat;
  readonly pay: ModePaiement;
  readonly reason: string | null;
}

export function renderC8(m: ClienteProduit, q: ClienteQuote, s: C8State): string {
  const produitStr = fmtFCFA(q.produitFcfa);
  let body: string;
  if (s.door === 'accepted') {
    body = [
      '<div class="cl-door-pay" data-etat="paiement-porte">',
      `<div class="cl-prov-phone">${iconPhone(30)}</div>`,
      '<div class="cl-prov-title">Payez le reste, en sécurité</div>',
      `<div class="cl-prov-body">Composez votre code secret <b>Orange Money</b> pour valider <b>${produitStr}</b>.</div>`,
      '<div class="cl-prov-wait"><span class="cl-prov-dots"><span class="cl-prov-dot"></span><span class="cl-prov-dot"></span><span class="cl-prov-dot"></span></span><span>En attente de la confirmation de l’opérateur…</span></div>',
      '<div class="cl-prov-law">Le livreur ne peut pas dire « payé » à votre place. Seul l’opérateur confirme.</div>',
      '</div>',
    ].join('');
  } else if (s.door === 'report') {
    body = [
      '<div data-etat="signalement">',
      '<div class="cl-report-title">Qu’est-ce qui ne va pas ?</div>',
      '<div class="cl-report-sub">Dites-le simplement. Vous ne payez rien de plus.</div>',
      '<div class="cl-reasons">',
      MOTIFS.map((r) => `<button class="cl-reason${s.reason === r ? ' cl-reason-on' : ''}" data-action="motif" data-motif="${esc(r)}">${r}</button>`).join(''),
      '</div>',
      s.reason
        ? [
            '<div class="cl-report-note" data-role="report-note">Le colis repart avec le livreur. Vous ne payez rien de plus. La commande reste protégée.</div>',
            '<button class="cl-report-cta" data-action="confirmer-signalement">C’est noté</button>',
          ].join('')
        : '',
      '</div>',
    ].join('');
  } else {
    const checklist = [
      'C’est le bon article — celui de la photo',
      ...(m.variant ? [`La bonne taille — ${esc(varianteCourte(m.variant))}`] : []),
      'En bon état',
    ];
    body = [
      '<div data-etat="inspection">',
      '<div class="cl-door-title">Ouvrez. Vérifiez.<br>Ensuite seulement, payez.</div>',
      '<div class="cl-door-sub">Prenez votre temps — 2 à 4 minutes, c’est votre droit. Le livreur attend.</div>',
      '<div class="cl-checklist">',
      checklist.map((c) => `<div class="cl-check-row">${iconCheckSquare(17)}<span>${c}</span></div>`).join(''),
      '</div>',
      s.pay !== 'A' ? `<div class="cl-owing" data-role="owing"><span>Reste à payer, après inspection</span><b>${produitStr}</b></div>` : '',
      '<div class="cl-door-paths">',
      '<button class="cl-door-good" data-action="porte-bon">Tout est bon</button>',
      '<button class="cl-door-bad" data-action="porte-probleme">Un problème</button>',
      '</div>',
      '<div class="cl-door-equal">Les deux chemins se valent. Un refus justifié ne compte jamais contre vous.</div>',
      '</div>',
    ].join('');
  }
  return [
    '<div class="cl-screen" data-screen="C8">',
    stepHead('retour-c7', 'À la porte'),
    body,
    '</div>',
  ].join('');
}

/* ----------------------------------------------------------------- C9 ---- */

export function renderC9(o: { revealed: boolean }): string {
  const body = o.revealed
    ? [
        '<div class="cl-code-revealed" data-role="code-revele">',
        '<div class="cl-code-overline">VOTRE PREUVE</div>',
        '<div class="cl-code-card">',
        '<div class="cl-code-tick cl-code-tick-tl"></div><div class="cl-code-tick cl-code-tick-tr"></div><div class="cl-code-tick cl-code-tick-bl"></div><div class="cl-code-tick cl-code-tick-br"></div>',
        `<div class="cl-code-figure">${CODE_REMISE}</div>`,
        '</div>',
        '<div class="cl-code-proof">Ce code est votre preuve.</div>',
        '<div class="cl-code-how">Donnez-le au livreur seulement au moment de la remise. Montrez-le, ou dites-le à voix haute.</div>',
        `<div class="cl-code-kept">${iconShieldCheck(15, 1.9)}Gardé sur ce téléphone — même sans réseau.</div>`,
        '</div>',
      ].join('')
    : [
        '<div class="cl-code-hidden" data-role="code-cache">',
        iconLock(34, 1.7),
        '<div class="cl-code-dots">••• •••</div>',
        '<div class="cl-code-hidden-body">Votre code apparaîtra ici dès que le paiement sera confirmé par l’opérateur. Jamais avant.</div>',
        '</div>',
      ].join('');
  return [
    '<div class="cl-screen" data-screen="C9">',
    stepHead('retour-c7', 'Le code de remise'),
    body,
    '</div>',
  ].join('');
}

/* ------------------------------------------------------------ C2 sheet --- */

export function renderSheet(): string {
  const row = (icon: string, t: string, d: string): string =>
    `<div class="cl-prot-row"><span class="cl-prot-ic">${icon}</span><div><div class="cl-prot-t">${t}</div><div class="cl-prot-d">${d}</div></div></div>`;
  return [
    '<div class="cl-scrim" data-action="fermer-protections">',
    '<div class="cl-sheet" data-screen="C2" data-role="sheet" data-action="sheet-noop">',
    '<div class="cl-grabber"></div>',
    '<div class="cl-sheet-title">Vos protections</div>',
    row(iconEye(19), 'Vous inspectez avant de payer', 'Ouvrez le colis à la porte. Prenez 2 à 4 minutes. Payez seulement si c’est bon.'),
    row(iconShieldCheck(19, 1.8), 'Le remboursement n’est jamais bloqué', 'Un problème avéré, c’est un remboursement. Sans condition cachée, sans attente d’un fonds.'),
    row(iconLock(18, 1.8), 'Votre numéro reste privé', 'Le livreur passe par un relais. Personne ne voit votre numéro.'),
    row(iconKey(18), 'Le code de remise fait foi', 'La remise n’existe que quand vous donnez votre code. C’est votre preuve.'),
    '<button class="cl-sheet-cta" data-action="fermer-protections-cta">Compris</button>',
    '</div></div>',
  ].join('');
}

/* -------------------------------------------------------------- toasts --- */

export function renderToasts(toasts: ReadonlyArray<{ id: number; m: string }>): string {
  if (toasts.length === 0) return '';
  return `<div class="cl-toasts">${toasts.map((t) => `<div class="cl-toast">${esc(t.m)}</div>`).join('')}</div>`;
}
