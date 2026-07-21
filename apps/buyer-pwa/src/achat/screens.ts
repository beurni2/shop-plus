/**
 * PARCOURS D'ACHAT — §2 components + §5 screens, pixel-for-pixel.
 *
 * The θ drive lives in the STYLESHEET (var(--vt-*) set by applyTheme on the
 * container); this module emits structure + copy only. Amounts pass through
 * `fmtFCFA`/`fmtHeure` (the byte-controlled NNBSP); typographic NNBSP in copy is
 * the `&#8239;` HTML entity — so there is never a raw U+202F byte in source, and
 * the rendered DOM carries the real byte. Model-derived strings pass through
 * `esc`. No purchase-side economics field exists here — the buyer sees only the
 * signed `prixClient` and Séra's public delivery fee (§0 loi 1).
 */

import { esc } from '../format';
import { productGlyph } from '../vitrine/icons';
import { fmtFCFA, fmtHeure, groupFr, NNBSP } from './money';
import {
  iconBack, iconBolt, iconCash, iconCheck, iconChevron, iconClock, iconLockClosed,
  iconLockCode, iconLockOpen, iconMic, iconMobile, iconPin, iconPlay, iconScooter,
  iconSearch, iconShieldCheck, iconStore, iconWarning,
} from './icons';

/** The demo product/order (the signed page's `prixClient` is `priceFcfa`). */
export interface AchatProduit {
  readonly shopName: string;
  readonly prenom: string;
  readonly slug: string;
  readonly productName: string;
  readonly variant?: string;
  readonly zone: string;
  readonly priceFcfa: number;
  /** Canon SVG product-glyph key (the vitrine set) — the no-emoji placeholder. */
  readonly glyph: string;
  /** Product photo gradient (Jamais θ — a per-product placeholder for the real photo). */
  readonly photoGrad: string;
  readonly voiceDuree?: string;
  readonly inStock: boolean;
}

/** Séra's seed quote (§9.3 port — 1 000 / 1 800 are demo values). */
export const FRAIS = { standard: 1000, express: 1800 } as const;
/** Server-composed totals (§0 loi 2 — the UI renders, never recomputes). */
export const TOTAUX = { standard: 12500, express: 13300 } as const;
export type Vitesse = keyof typeof FRAIS;

/* ------------------------------------------------------------------ head -- */

function backHead(title: string, sub: string | undefined, pill: string): string {
  return [
    '<div class="ac-stephead">',
    `<button class="ac-back" data-action="retour" aria-label="Retour">${iconBack(17)}</button>`,
    `<div class="ac-steptitle-wrap"><div class="ac-steptitle">${esc(title)}</div>${sub ? `<div class="ac-track-sub">${sub}</div>` : ''}</div>`,
    pill,
    '</div>',
  ].join('');
}

function stepBars(step: 1 | 2 | 3): string {
  const seg = (n: number): string => `<span class="ac-stepseg${n <= step ? ' ac-stepseg-on' : ''}"></span>`;
  return `<div class="ac-stepbars">${seg(1)}${seg(2)}${seg(3)}</div>`;
}

function stepHead(title: string, n: 1 | 2 | 3): string {
  return [
    backHead(title, undefined, `<span class="ac-steppill">Étape ${n}/3</span>`),
    stepBars(n),
  ].join('');
}

/* ------------------------------------------------------------- components -- */

function priceBand(amount: number): string {
  return [
    '<div class="ac-pb" data-role="price-band">',
    '<div class="ac-pb-fil"></div>',
    '<div class="ac-pb-tex"></div>',
    '<div class="ac-pb-inner">',
    '<div class="ac-pb-top">',
    '<span class="ac-pb-overline">PRIX</span>',
    `<span class="ac-pb-signed">PAGE SIGNÉE ${iconCheck(10, 3)}</span>`,
    '</div>',
    `<div class="ac-pb-amount"><span class="ac-pb-hero" data-role="amount">${groupFr(amount)}</span><span class="ac-pb-suffix">${NNBSP}FCFA</span></div>`,
    '<div class="ac-pb-foot">Livraison Séra en plus — affichée à part, jamais cachée.</div>',
    '</div></div>',
  ].join('');
}

function priceBandEpuise(amount: number): string {
  return [
    '<div class="ac-pb ac-pb-epuise" data-role="price-band">',
    '<div class="ac-pb-fil"></div>',
    '<div class="ac-pb-inner">',
    '<div class="ac-pb-top"><span class="ac-pb-overline">PRIX</span><span class="ac-pb-signed">ÉPUISÉ</span></div>',
    `<div class="ac-pb-amount"><span class="ac-pb-hero" data-role="amount">${groupFr(amount)}</span><span class="ac-pb-suffix">${NNBSP}FCFA</span></div>`,
    '<div class="ac-pb-foot">Le prix reste signé — il reviendra tel quel si le stock revient.</div>',
    '</div></div>',
  ].join('');
}

/** Total price band (S4/S6): overline + decomposition/mention row. `center` = S6. */
function priceBandTotal(
  overline: string,
  total: number,
  footHtml: string,
  center: boolean,
): string {
  return [
    `<div class="ac-pb ac-pb-total${center ? ' ac-pb-center' : ''}" data-role="price-band">`,
    '<div class="ac-pb-fil"></div>',
    '<div class="ac-pb-tex"></div>',
    '<div class="ac-pb-inner">',
    `<div class="ac-pb-overline">${overline}</div>`,
    `<div class="ac-pb-amount"><span class="ac-pb-hero" data-role="amount">${groupFr(total)}</span><span class="ac-pb-suffix">${NNBSP}FCFA</span></div>`,
    footHtml,
    '</div></div>',
  ].join('');
}

function voix(m: AchatProduit): string {
  if (!m.voiceDuree) return '';
  // 20-bar wave, exact heights from the pixel source (§2 C-VOIX).
  const heights = [8, 14, 10, 18, 22, 12, 16, 20, 9, 15, 19, 11, 17, 13, 21, 10, 14, 18, 9, 12];
  const bars = heights.map((h) => `<span class="ac-wavebar" style="height:${h}px"></span>`).join('');
  return [
    '<div class="ac-voix" data-role="voix">',
    `<button class="ac-voix-play" data-action="voix-play" aria-label="Écouter la voix">${iconPlay(16)}</button>`,
    '<div class="ac-voix-col">',
    `<div class="ac-voix-top"><span class="ac-voix-title">La voix d${esc(apostrophe(m.prenom))}</span><span class="ac-voix-dur">${esc(m.voiceDuree)}</span></div>`,
    `<div class="ac-wave">${bars}</div>`,
    '</div></div>',
  ].join('');
}

/** « d'Aïcha » élision — the name rides after « d' ». */
function apostrophe(prenom: string): string {
  return `’${prenom}`;
}

function trustCard(): string {
  return [
    '<div class="ac-trust">',
    `<div class="ac-trust-row"><span class="ac-trust-ic">${iconScooter(17)}</span><span class="ac-trust-txt">Livré par Séra, à votre repère</span></div>`,
    '<div class="ac-trust-div"></div>',
    `<div class="ac-trust-row"><span class="ac-trust-ic">${iconShieldCheck(17)}</span><span class="ac-trust-txt">Payez à la porte, après inspection</span></div>`,
    '<div class="ac-trust-div"></div>',
    `<button class="ac-trust-link" data-action="protections"><span class="ac-trust-link-txt">Vos protections</span><span class="ac-trust-link-chev">${iconChevron(14, 2.2)}</span></button>`,
    '</div>',
  ].join('');
}

function souci(revealed: boolean): string {
  const sub = revealed
    ? 'Refus, colis abîmé, pression — Séra tranche à la porte.'
    : 'Séra intervient tout de suite — sans passer par la vendeuse.';
  // §9.1: ONLY the button — no distress flow behind it.
  return [
    '<button class="ac-souci" data-action="souci">',
    `<span class="ac-souci-ic">${iconWarning(18)}</span>`,
    `<span class="ac-souci-body"><span class="ac-souci-title">Un souci&#8239;?</span><span class="ac-souci-sub">${sub}</span></span>`,
    `<span class="ac-souci-chev">${iconChevron(15, 2.4)}</span>`,
    '</button>',
  ].join('');
}

/* --------------------------------------------------------------- screens -- */

/** S1 Produit — normal / épuisé / sans-voix. */
export function renderS1(m: AchatProduit, opts: { epuise?: boolean; sansVoix?: boolean } = {}): string {
  const epuise = opts.epuise ?? false;
  const header = [
    '<div class="ac-head">',
    `<div class="ac-avatar">${esc(m.shopName.replace(/^Chez\s+/i, '').charAt(0).toUpperCase())}</div>`,
    '<div class="ac-idcol">',
    `<div class="ac-shopname">${esc(m.shopName)}</div>`,
    `<div class="ac-verirow"><span class="ac-veri-check">${iconCheck(13, 2.6)}</span><span>Vendeuse vérifiée</span><span class="ac-dotsep">·</span><button class="ac-voir" data-action="vitrine" data-slug="${esc(m.slug)}">Voir la boutique ›</button></div>`,
    '</div>',
    `<button class="ac-shield" aria-label="Vérifiée">${iconShieldCheck(18)}</button>`,
    '</div>',
  ].join('');

  const photo = [
    `<div class="ac-photo" role="img" aria-label="${esc(m.productName)}" style="background:linear-gradient(140deg,${m.photoGrad})">`,
    '<div class="ac-photo-tex"></div>',
    epuise ? '' : '<span class="ac-tick ac-tick-tl"></span><span class="ac-tick ac-tick-tr"></span><span class="ac-tick ac-tick-bl"></span><span class="ac-tick ac-tick-br"></span>',
    `<span class="ac-photo-glyph">${productGlyph(m.glyph)}</span>`,
    epuise
      ? '<div class="ac-photo-veil"></div><span class="ac-epuise-stamp">ÉPUISÉ</span>'
      : '<span class="ac-photo-caps">PHOTO RÉELLE DU PRODUIT</span>',
    '</div>',
  ].join('');

  const captionRow = epuise
    ? ''
    : `<div class="ac-caption-row"><span class="ac-caption">Photo réelle — ce que vous recevrez.</span><span class="ac-vendu">Vendu par ${esc(m.prenom)}</span></div>`;

  const chipRow = m.variant
    ? `<div class="ac-chiprow"><span class="ac-variant">${esc(m.variant)}</span><span class="ac-prod-zone">${esc(m.zone)}</span></div>`
    : `<div class="ac-chiprow"><span class="ac-prod-zone">${esc(m.zone)}</span></div>`;

  const body = epuise
    ? [
        header, photo,
        `<h3 class="ac-prodtitle">${esc(m.productName)}</h3>`,
        priceBandEpuise(m.priceFcfa),
        '<div class="ac-epuise-card">',
        `<div class="ac-epuise-text">Ce produit est épuisé pour le moment. ${esc(m.prenom)} ajoute souvent de nouveaux articles.</div>`,
        `<button class="ac-soft" data-action="vitrine" data-slug="${esc(m.slug)}">${iconStore(16)}Voir la boutique d${esc(apostrophe(m.prenom))}</button>`,
        '</div>',
        '<button class="ac-cta ac-cta-off" disabled>Commander</button>',
        '<div class="ac-footnote">Votre numéro reste privé.</div>',
      ]
    : [
        header, photo, captionRow,
        `<h3 class="ac-prodtitle">${esc(m.productName)}</h3>`,
        chipRow,
        opts.sansVoix ? '' : voix(m),
        priceBand(m.priceFcfa),
        trustCard(),
        '<button class="ac-cta" data-action="commander">Commander</button>',
        '<div class="ac-footnote">Votre numéro reste privé.</div>',
      ];
  return screen('produit', body.join(''));
}

/** S2 Récap — mode = espèces (défaut) / mobile. */
export function renderS2(m: AchatProduit, opts: { mode?: 'especes' | 'mobile' } = {}): string {
  const mode = opts.mode ?? 'especes';
  const choix = (
    key: 'especes' | 'mobile',
    icon: string,
    title: string,
    sub: string,
  ): string => {
    const on = mode === key;
    return [
      `<button class="ac-choice${on ? ' ac-choice-on' : ''}" data-action="choix-paiement" data-mode="${key}">`,
      `<span class="ac-choice-ic">${icon}</span>`,
      `<span class="ac-choice-body"><span class="ac-choice-title">${title}</span><span class="ac-choice-sub">${sub}</span></span>`,
      on ? `<span class="ac-radio">${iconCheck(13, 3)}</span>` : '<span class="ac-radio"></span>',
      '</button>',
    ].join('');
  };
  const body = [
    stepHead('Votre commande', 1),
    '<div class="ac-overline">VOUS COMMANDEZ</div>',
    '<div class="ac-recap">',
    `<div class="ac-recap-thumb" style="background:linear-gradient(140deg,${m.photoGrad})"><div class="ac-recap-thumb-tex"></div><span class="ac-recap-glyph">${productGlyph(m.glyph)}</span></div>`,
    `<div class="ac-recap-info"><div class="ac-recap-name">${esc(m.productName)}</div><div class="ac-recap-sub">${m.variant ? esc(m.variant) + ' · ' : ''}${esc(m.shopName)}</div></div>`,
    `<span class="ac-recap-price">${fmtFCFA(m.priceFcfa)}</span>`,
    '</div>',
    '<div class="ac-overline">VOUS PAYEZ À LA PORTE</div>',
    '<div class="ac-choicelist">',
    choix('especes', iconCash(19), 'Espèces à la porte', 'Vous inspectez le colis, puis vous payez.'),
    choix('mobile', iconMobile(19), 'Mobile Money à la porte', 'Le livreur confirme le transfert devant vous.'),
    '</div>',
    '<div class="ac-totals">',
    `<div class="ac-totline ac-totline-prod"><span>Produit</span><b>${fmtFCFA(m.priceFcfa)}</b></div>`,
    '<div class="ac-totline ac-totline-liv"><span>Livraison Séra</span><span class="ac-liv-pending">choisie à l’étape 3</span></div>',
    `<div class="ac-totsep"><span class="ac-totlabel">À la porte, dès</span><span class="ac-totamount" data-role="amount">${fmtFCFA(m.priceFcfa)}</span></div>`,
    '<div class="ac-totnote">Rien à payer maintenant. Le montant exact est fixé avant confirmation.</div>',
    '</div>',
    '<button class="ac-cta" data-action="continuer-recap">Continuer — votre repère</button>',
  ].join('');
  return screen('recap', body);
}

/** S3 Localisation. */
export function renderS3(m: AchatProduit, opts: { zone?: string; repere?: string } = {}): string {
  const zone = opts.zone ?? 'Gounghin';
  const repere = opts.repere ?? 'Portail bleu après la pharmacie Wend-Kuni';
  const zones = ['Gounghin', 'Dassasgho', 'Tampouy', 'Pissy', 'Cissin', 'Somgandé', 'Zogona', 'Patte d’Oie'];
  const chips = zones
    .map((z) => `<button class="ac-chip${z === zone ? ' ac-chip-on' : ''}" data-action="quartier" data-zone="${esc(z)}">${esc(z)}</button>`)
    .join('');
  const count = `${[...repere].length}/80`;
  const body = [
    stepHead('Où vous trouver', 2),
    '<div class="ac-overline">VOTRE QUARTIER — OUAGADOUGOU</div>',
    `<div class="ac-chips">${chips}</div>`,
    `<div class="ac-overline-row"><span class="ac-overline">VOTRE REPÈRE</span><span class="ac-counter">${count}</span></div>`,
    `<div class="ac-field ac-field-focus"><div class="ac-field-text">${esc(repere)}<span class="ac-caret"></span></div></div>`,
    '<div class="ac-help">Un repère qu’un livreur reconnaît : portail, boutique, mosquée, école…</div>',
    '<div class="ac-voixpath" data-role="voix-chemin">',
    `<span class="ac-voixpath-ic">${iconMic(18)}</span>`,
    '<span class="ac-voixpath-body"><span class="ac-voixpath-title">Expliquer le chemin de vive voix</span><span class="ac-voixpath-sub">Facultatif — 30 secondes, pour le livreur seulement.</span></span>',
    '<button class="ac-voixpath-act" data-action="voix-chemin">Enregistrer</button>',
    '</div>',
    '<div class="ac-overline">VOTRE NUMÉRO</div>',
    `<div class="ac-phone"><span class="ac-phone-num">70 12 34 56</span><span class="ac-phone-lock">${iconLockClosed(16)}</span></div>`,
    '<div class="ac-relais">Votre numéro passe par le <b>relais Séra</b> : le livreur vous joint sans jamais voir votre ligne. La vendeuse ne le reçoit jamais.</div>',
    '<button class="ac-cta" data-action="continuer-lieu">Continuer — la livraison</button>',
  ].join('');
  return screen('localisation', body);
}

/** S4 Livraison — ready / loading / error. */
export function renderS4(
  m: AchatProduit,
  opts: { etat?: 'ready' | 'loading' | 'error'; speed?: Vitesse } = {},
): string {
  const etat = opts.etat ?? 'ready';
  const speed = opts.speed ?? 'standard';
  const repereLine = `<div class="ac-s4repere"><span class="ac-s4repere-pin">${iconPin(15)}</span><span class="ac-s4repere-txt">Gounghin — portail bleu après la pharmacie Wend-Kuni</span></div>`;

  if (etat === 'loading') {
    const skCard = (w1: number, w2: number): string =>
      `<div class="ac-sk-card"><div class="ac-shim ac-sk-bar" style="width:${w1}px;height:15px"></div><div class="ac-sk-bar" style="width:190px;height:11px;margin-top:9px"></div><div class="ac-shim ac-sk-bar" style="width:${w2}px;height:22px;margin-top:12px"></div></div>`;
    const body = [
      stepHead('La livraison', 3),
      '<div class="ac-loading-line">Séra calcule votre devis pour Gounghin…</div>',
      `<div class="ac-choicelist">${skCard(120, 96)}${skCard(96, 96)}</div>`,
      '<div class="ac-sk-total"><div class="ac-sk-total-lbl">À LA PORTE, EN TOUT</div><div class="ac-shim ac-sk-bar" style="width:150px;height:30px;margin-top:8px"></div></div>',
      '<button class="ac-cta ac-cta-off" disabled>Confirmer</button>',
      '<div class="ac-footnote">Le devis arrive — quelques secondes.</div>',
    ].join('');
    return screen('livraison', body);
  }

  if (etat === 'error') {
    const body = [
      stepHead('La livraison', 3),
      repereLine,
      '<div class="ac-danger-banner" data-role="devis-erreur" style="margin-top:18px">Le devis n’arrive pas. Vérifiez le réseau, puis réessayez.</div>',
      `<button class="ac-ghost" data-action="reessayer">Réessayer</button>`,
    ].join('');
    return screen('livraison', body);
  }

  const total = TOTAUX[speed];
  const dcard = (
    key: Vitesse,
    title: string,
    badge: string,
    slot: string,
    fee: number,
  ): string => {
    const on = speed === key;
    return [
      `<button class="ac-dchoice${on ? ' ac-dchoice-on' : ''}" data-action="choix-vitesse" data-speed="${key}">`,
      on ? `<span class="ac-dradio">${iconCheck(13, 3)}</span>` : '<span class="ac-dradio"></span>',
      `<span class="ac-drow"><span class="ac-dtitle">${title}</span>${badge}</span>`,
      `<span class="ac-dslot">${slot}</span>`,
      `<span class="ac-dfee"><span class="ac-dfee-num">${groupFr(fee)}</span><span class="ac-dfee-suffix">${NNBSP}FCFA</span></span>`,
      '</button>',
    ].join('');
  };
  const body = [
    stepHead('La livraison', 3),
    repereLine,
    '<div class="ac-overline">CHOISISSEZ VOTRE VITESSE</div>',
    '<div class="ac-choicelist">',
    dcard('standard', 'Standard', '<span class="ac-dconseil">CONSEILLÉE</span>', `Demain, entre ${fmtHeure(9)} et ${fmtHeure(18)}`, FRAIS.standard),
    dcard('express', 'Express', `<span class="ac-dbolt">${iconBolt(14)}</span>`, `Aujourd’hui, avant ${fmtHeure(18)}`, FRAIS.express),
    '</div>',
    priceBandTotal(
      'À LA PORTE, EN TOUT',
      total,
      `<div class="ac-pb-footrow"><span>${esc(m.productName.split(' ')[0] ?? 'Produit')} ${groupFr(m.priceFcfa)} + livraison ${groupFr(FRAIS[speed])}</span><b>Espèces</b></div>`,
      false,
    ),
    `<button class="ac-cta" data-action="confirmer">Confirmer — ${fmtFCFA(total)} à la porte</button>`,
    '<div class="ac-footnote">Vous pourrez inspecter avant de payer.</div>',
  ].join('');
  return screen('livraison', body);
}

/** S5 Suivi — scellé (en route) / révélé (arrivé). */
export function renderS5(m: AchatProduit, opts: { revealed?: boolean } = {}): string {
  const revealed = opts.revealed ?? false;
  const statusPill = revealed
    ? '<span class="ac-pill ac-pill-warning">Livreur arrivé</span>'
    : '<span class="ac-pill ac-pill-success">En route</span>';
  const head = backHead('Commande AC-208', `${esc(m.productName)} · ${esc(m.shopName)}`, statusPill);

  const timeline = [
    '<div class="ac-tl"><div class="ac-tl-row">',
    '<div class="ac-tl-rail">',
    `<span class="ac-tl-dot ac-tl-dot-done">${iconCheck(12, 3.2)}</span>`,
    '<span class="ac-tl-conn ac-tl-conn-done"></span>',
    `<span class="ac-tl-dot ac-tl-dot-done">${iconCheck(12, 3.2)}</span>`,
    '<span class="ac-tl-conn ac-tl-conn-done"></span>',
    '<span class="ac-tl-dot ac-tl-dot-now"><span class="ac-tl-dot-now-heart ac-pulse"></span></span>',
    '<span class="ac-tl-conn ac-tl-conn-future"></span>',
    '<span class="ac-tl-dot ac-tl-dot-future"></span>',
    '</div>',
    '<div class="ac-tl-col">',
    `<div><div class="ac-tl-steptitle">Commande confirmée</div><div class="ac-tl-stamp">Hier, ${fmtHeure(17, 40)}</div></div>`,
    `<div><div class="ac-tl-steptitle">Colis vérifié et scellé par Séra</div><div class="ac-tl-stamp">Aujourd’hui, ${fmtHeure(10, 5)}</div></div>`,
    `<div><div class="ac-tl-nowrow"><span class="ac-tl-steptitle">En route vers vous</span><span class="ac-now-badge">MAINTENANT</span></div><div class="ac-tl-note">Le livreur vous appellera par le relais Séra.</div></div>`,
    `<div><div class="ac-tl-steptitle ac-tl-steptitle-future">Remise contre code, paiement</div><div class="ac-tl-note ac-tl-note-future">${fmtFCFA(12500)} à la porte, après inspection</div></div>`,
    '</div></div></div>',
  ].join('');

  const garde = revealed
    ? [
        '<div class="ac-garde"><div class="ac-garde-fil"></div><div class="ac-garde-inner">',
        `<div class="ac-garde-top"><span class="ac-garde-label">CODE DE REMISE</span><span class="ac-garde-pill ac-garde-pill-revealed">${iconLockOpen(10)} RÉVÉLÉ</span></div>`,
        '<div class="ac-garde-revealed ac-garde-reveal-anim" data-role="drop-code">',
        `<div class="ac-garde-code">K7${NNBSP}·${NNBSP}42</div>`,
        '<div class="ac-garde-reveal-cap"><b>Montrez ce code au livreur.</b><br>Il ne remet le colis que contre lui.</div>',
        '</div>',
        `<div class="ac-garde-footrow"><span>Inspectez, puis payez ${fmtFCFA(12500)}.</span><span class="ac-garde-proof">PREUVE DE GARDE SÉRA</span></div>`,
        '</div></div>',
      ].join('')
    : [
        '<div class="ac-garde"><div class="ac-garde-fil"></div><div class="ac-garde-inner">',
        `<div class="ac-garde-top"><span class="ac-garde-label">CODE DE REMISE</span><span class="ac-garde-pill ac-garde-pill-sealed">${iconLockClosed(10, 2.4)} SCELLÉ</span></div>`,
        '<div class="ac-garde-sealed" data-role="drop-code-sealed">',
        '<div class="ac-garde-cases"><span class="ac-garde-case">•</span><span class="ac-garde-case">•</span><span class="ac-garde-sep">·</span><span class="ac-garde-case">•</span><span class="ac-garde-case">•</span></div>',
        '<div class="ac-garde-caption">Se révèle quand le livreur sonne.<br>Personne d’autre ne peut le voir.</div>',
        '</div>',
        '<div class="ac-garde-note">Votre preuve de garde : le colis Séra n’est remis que contre ce code — à vous, à personne d’autre.</div>',
        '</div></div>',
      ].join('');

  const tempo = revealed
    ? `<div class="ac-tempo"><span class="ac-tempo-ic">${iconClock(16)}</span><span class="ac-tempo-txt"><b>Prenez votre temps.</b> Ouvrez, inspectez, essayez. Vous payez seulement si tout est bon.</span></div>`
    : '';
  const footer = revealed ? '<div class="ac-footnote">Le code change à chaque commande.</div>' : '';

  return screen('suivi', [head, timeline, garde, tempo, souci(revealed), footer].join(''));
}

/** S6 Confirmation. */
export function renderS6(m: AchatProduit): string {
  const body = [
    `<div class="ac-conf-disc">${iconCheck(36, 2.8)}</div>`,
    '<h3 class="ac-conf-title">Commande enregistrée.</h3>',
    `<div class="ac-conf-body">${esc(m.prenom)} vient d’être prévenue. Vous n’avez <b>rien payé</b> — tout se passe à la porte.</div>`,
    '<span class="ac-pill ac-pill-warning" style="margin-top:12px"><span class="ac-pill-dot"></span>En attente de préparation</span>',
    `<div class="ac-conf-pb">${priceBandTotal('À PRÉPARER, À LA PORTE', 12500, '<div class="ac-pb-foot">Espèces · après votre inspection · code de remise exigé</div>', true)}</div>`,
    '<div class="ac-steps">',
    `<div class="ac-stepitem"><span class="ac-stepnum">1</span><span class="ac-steptext">${esc(m.prenom)} prépare votre commande</span></div>`,
    '<div class="ac-stepitem"><span class="ac-stepnum">2</span><span class="ac-steptext">Séra vérifie et scelle le colis</span></div>',
    '<div class="ac-stepitem"><span class="ac-stepnum">3</span><span class="ac-steptext">Votre code de remise s’active à la porte</span></div>',
    '</div>',
    '<button class="ac-cta ac-conf-cta" data-action="suivre">Suivre ma commande</button>',
    `<button class="ac-ghost-boutique" data-action="vitrine" data-slug="${esc(m.slug)}">${iconStore(16)}Découvrir le reste de la boutique</button>`,
    `<div class="ac-conf-subline">Pendant qu${esc(apostrophe(m.prenom))} prépare, sa boutique reste ouverte.</div>`,
  ].join('');
  return `<div class="ac-screen" data-screen="confirmation"><div class="ac-status"></div><div class="ac-lisere"></div><div class="ac-body-conf">${body}</div></div>`;
}

/** S7 Protections — the sheet over a blurred backdrop. */
export function renderS7(m: AchatProduit): string {
  const row = (icon: string, title: string, text: string): string =>
    `<div class="ac-protrow"><span class="ac-protic">${icon}</span><span class="ac-protbody"><span class="ac-prottitle">${title}</span><span class="ac-prottext">${text}</span></span></div>`;
  const sheet = [
    '<div class="ac-sheet" data-role="sheet">',
    '<div class="ac-grabber"></div>',
    '<h3 class="ac-sheet-title">Vos protections</h3>',
    '<div class="ac-sheet-intro">Elles ne se négocient pas — elles sont dans chaque commande Séra.</div>',
    '<div class="ac-protlist">',
    row(iconSearch(18), 'Inspectez avant de payer', 'Ouvrez le colis devant le livreur. Pas convaincue&#8239;? Vous refusez, sans frais.'),
    row(iconShieldCheck(18), 'Colis vérifié et scellé', 'Séra contrôle le produit avant départ. Le sceau intact est votre garantie.'),
    row(iconLockClosed(18), 'Votre numéro reste privé', 'Le livreur passe par le relais Séra. La vendeuse ne voit jamais votre ligne.'),
    row(iconLockCode(18), 'Remise contre votre code', 'Le colis n’est remis qu’à vous — contre le code de remise de votre suivi.'),
    `<div class="ac-protrow ac-protrow-danger"><span class="ac-protic">${iconWarning(18, 2.1)}</span><span class="ac-protbody"><span class="ac-prottitle">«&#8239;Un souci&#8239;?&#8239;» — toujours à portée</span><span class="ac-prottext">Sur le suivi, à tout moment. Un agent Séra tranche — pas la vendeuse, pas le livreur.</span></span></div>`,
    '</div>',
    '<button class="ac-sheet-cta" data-action="protections-fermer">Compris</button>',
    '</div>',
  ].join('');
  // Backdrop = a dimmed S1 header sliver; scrim + sheet over it.
  const backdrop = `<div class="ac-body" style="filter:blur(1px);opacity:.55"><div class="ac-head"><div class="ac-avatar">${esc(m.shopName.replace(/^Chez\s+/i, '').charAt(0).toUpperCase())}</div><div class="ac-idcol"><div class="ac-shopname">${esc(m.shopName)}</div><div class="ac-track-sub">Vendeuse vérifiée · Voir la boutique ›</div></div></div><div class="ac-photo" style="height:120px;background:linear-gradient(140deg,${m.photoGrad})"></div></div>`;
  return `<div class="ac-screen" data-screen="protections" style="position:relative"><div class="ac-status"></div><div class="ac-lisere"></div>${backdrop}<div class="ac-scrim" data-action="protections-fermer"></div><div style="position:relative;margin-top:-40px">${sheet}</div></div>`;
}

/* --------------------------------------------------------------- wrapper -- */

/** The standard screen shell: status zone 54 + liseré 6 θ + padded body. */
function screen(name: string, inner: string): string {
  return `<div class="ac-screen" data-screen="${name}"><div class="ac-status"></div><div class="ac-lisere"></div><div class="ac-body">${inner}</div></div>`;
}
