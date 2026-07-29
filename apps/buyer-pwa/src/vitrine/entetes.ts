/**
 * ENTETES-A — the five selectable boutique headers (buyer render only).
 *
 * SOURCE OF TRUTH: the design contract « En-tetes Boutique - 5 Styles v2.dc.html »
 * (per-style relevé blocks) + « Entetes - HANDOFF.md » for the transverse rules.
 * Where the prose and the HTML disagreed, the HTML won. Each style is its own
 * self-contained block — the contract has no shared base header, and fidelity
 * beats DRY here, so the duplication between the five is deliberate.
 *
 * THE HONESTY RULES ARE THE SAME FIVE EVERYWHERE (HANDOFF §2, frozen):
 *   1. The visuals' « +1,2k clientes satisfaites » row DOES NOT EXIST. Its
 *      container, in its exact place and style, renders « {N} ventes livrées
 *      par Séra » and ONLY at `deliveredCount >= 1`. Shop+ law 5: never a fake
 *      count. The founder explicitly ordered that row excluded.
 *   2. Star + « {rating} · {N} avis » only at `reviewCount >= 3` (AVIS_FLOOR).
 *      Never a grey « pending » star.
 *   3. « Nouvelle vendeuse » only at ZERO history. Proof and the badge never
 *      coexist — the three conditions above are mutually exclusive by data.
 *   4. An absent optional field is REMOVED FROM THE FLOW: no reserved space,
 *      no placeholder, no skeleton where a tagline or a bio would have been.
 *   5. The visuals' « ⋯ » IS the back button (same style, same corner), and it
 *      renders only when the buyer arrived from a product page; share then
 *      slides one notch over — exactly the contract's `shR3` / `shR5`.
 *
 * The trust-row labels are reproduced WORD FOR WORD from the catalog (§2.6);
 * Héritage is the one style whose third label is the short form.
 *
 * `'classique'` is NOT one of the five: it delegates to the existing hero+chips
 * and must stay byte-identical, so it is dispatched straight back to render.ts.
 */

import { t } from '../i18n';
import { esc } from '../format';
import { focusPosition, type Storefront, type VitrineTrust } from './profile';
import { chips, hero } from './render';
import {
  iconBack,
  iconCheckEnt,
  iconLockEnt,
  iconPinEnt,
  iconPinSolid,
  iconShare,
  iconShieldEnt,
  iconSparkle,
  iconStarEnt,
  iconTagEnt,
} from './icons';

export const ENTETE_KEYS = ['classique', 'royale', 'heritage', 'chaleureux', 'cristal', 'dynamique'] as const;
export type EnteteKey = (typeof ENTETE_KEYS)[number];

/** §9.4 frozen — the review row appears at ≥ 3 verified reviews, never below. */
const AVIS_FLOOR = 3;
/** HANDOFF §4 — the split-column layouts drop to a fixed reduced size here. */
const LONG_NAME = 14;

/**
 * The founder's preview lever: `?entete=royale` on ANY shop shows that header.
 * Unknown or absent ⇒ `'classique'` — the shipped default. No persistence, no
 * storefront field, no picker: this is a preview mechanism, not a setting.
 */
export function resolveEntete(search: string): EnteteKey {
  const raw = new URLSearchParams(search).get('entete');
  return (ENTETE_KEYS as readonly string[]).includes(raw ?? '') ? (raw as EnteteKey) : 'classique';
}

/**
 * ENTETES-B — the `?entete=` OVERRIDE as its own pure decision (verifier
 * finding: this distinction lived un-pinned in main.ts, where a regression to
 * the unconditional ENTETES-A resolve would silently force classique over
 * every shop's chosen field). ABSENT param ⇒ `undefined` — no override, her
 * `headerStyle` drives. PRESENT param ⇒ its exact ENTETES-A coercion (unknown
 * ⇒ classique), and that override WINS over the field, garbage included.
 */
export function enteteOverride(search: string): EnteteKey | undefined {
  return new URLSearchParams(search).has('entete') ? resolveEntete(search) : undefined;
}

export interface EnteteOpts {
  /** V6 (vide) — tagline, bio and the proof line are suppressed, as classique does. */
  readonly compact?: boolean;
  /** §2.5 — the back button exists only when the buyer came from a product. */
  readonly fromProduct?: boolean;
}

/* ------------------------------------------------------------------ data -- */

interface Vals {
  readonly name: string;
  readonly mono: string;
  readonly zone: string;
  readonly tagline: string;
  readonly bio: string;
  readonly hasTag: boolean;
  readonly hasBio: boolean;
  readonly coverUrl: string;
  readonly hasCover: boolean;
  readonly avatarUrl: string;
  readonly hasAvatar: boolean;
  /** ENTETES-C — her saved framing as a CSS object-position value; undefined =
   *  the style's own contract framing (exactly as before the field existed). */
  readonly coverFocus: string | undefined;
  readonly avatarFocus: string | undefined;
  readonly delivN: number;
  readonly showProof: boolean;
  readonly rating: string;
  readonly reviewCount: number;
  readonly showStars: boolean;
  readonly nouvelle: boolean;
  readonly longName: boolean;
  readonly back: boolean;
}

/**
 * The ONLY reading of the model the five headers do. Every honesty rule is
 * decided here, once, from the real fields — the contract's single COMPLET /
 * MINIMAL toggle is a demo affordance, not a data shape: a real storefront can
 * have a cover and no bio, or a bio and no history, and each fragment appears
 * on ITS OWN condition.
 */
function vals(sf: Storefront, trust: VitrineTrust, opts: EnteteOpts): Vals {
  const compact = opts.compact === true;
  const bare = sf.name.replace(/^Chez\s+/i, '');
  const hasCover = sf.cover.status === 'live' && typeof sf.cover.url === 'string' && sf.cover.url !== '';
  const hasAvatar = sf.avatar.mode === 'photo' && typeof sf.avatar.url === 'string' && sf.avatar.url !== '';
  return {
    name: esc(sf.name),
    mono: esc((bare.charAt(0) || sf.name.charAt(0)).toUpperCase()),
    zone: esc(sf.zone),
    tagline: esc(sf.tagline ?? ''),
    bio: esc(sf.bio ?? ''),
    hasTag: !compact && !!sf.tagline,
    hasBio: !compact && !!sf.bio,
    coverUrl: hasCover ? esc(sf.cover.url as string) : '',
    hasCover,
    avatarUrl: hasAvatar ? esc(sf.avatar.url as string) : '',
    hasAvatar,
    // ENTETES-C — read ONCE, validated (integers 0–100 or nothing): garbage on
    // a demo/test shape can never reach a style attribute.
    coverFocus: focusPosition(sf.cover.focus),
    avatarFocus: focusPosition(sf.avatar.focus),
    delivN: trust.deliveredCount,
    showProof: !compact && trust.deliveredCount >= 1,
    rating: esc(trust.rating),
    reviewCount: trust.reviewCount,
    showStars: !compact && trust.reviewCount >= AVIS_FLOOR,
    nouvelle: trust.deliveredCount === 0 && trust.reviewCount === 0,
    longName: sf.name.length > LONG_NAME,
    back: opts.fromProduct === true,
  };
}

/** The cover container's honest state: a real photograph, or the style's own
 *  ornamental pattern. Never a caption claiming a photo that is not there. */
const etat = (v: Vals): string => (v.hasCover ? 'live' : 'none');

/**
 * The style's cover <img>. `object-position` rides inline because it is the ONE
 * per-style value the contract fixes per photograph (HANDOFF §5) — the portrait
 * bias that keeps a head from being cropped by the frame.
 * ENTETES-C — HER saved framing wins when present (`v.coverFocus`); absent, the
 * style's contract position stands byte-for-byte as before.
 */
const coverImg = (v: Vals, pos: string): string =>
  `<img class="vt-cover-img" src="${v.coverUrl}" alt="${t('vit.cover_alt')}" loading="lazy" decoding="async" style="object-position:${v.coverFocus ?? pos}">`;

/** ENTETES-C — the avatar has NO per-style inline position (Héritage's 50% 32%
 *  medallion bias lives in the sheet's CSS); her framing rides as an inline
 *  style ONLY when present — inline wins over the CSS, and an unframed avatar
 *  emits the exact bytes it always did. */
const avatarImg = (v: Vals): string =>
  `<img class="vt-avatar-img" src="${v.avatarUrl}" alt="${t('vit.avatar_alt')}" loading="lazy" decoding="async"${v.avatarFocus !== undefined ? ` style="object-position:${v.avatarFocus}"` : ''}>`;

/** « Vendeuse vérifiée · {zone} » — the catalog string plus her real zone. */
const zoneLine = (v: Vals, pin: string): string => `${pin}${t('vit.verifiee')} <v>${v.zone}</v>`;

/** The catalog's zone label without its trailing separator — Héritage's photo
 *  chip carries the bare « Vendeuse vérifiée ». Derived, never re-authored. */
const verifieeBare = (): string => t('vit.verifiee').replace(/\s*·\s*$/, '');

/**
 * The two floating controls. §2.5: back only when the buyer arrived from a
 * product, and share then slides one notch. Both are ≥ 44×44 (HANDOFF §6 —
 * the visuals' 40 rounds are carried to 44, the one dimensional deviation).
 */
function controls(v: Vals, style: string, prop: string, near: string, far: string, ink: string): string {
  const back = v.back
    ? `<button class="vt-ent-btn vt-ent-back ${style}-btn" data-action="retour" aria-label="${t('vit.retour_aria')}">${iconBack(19, ink, 2.2)}</button>`
    : '';
  const shareAt = v.back ? far : near;
  return [
    back,
    `<button class="vt-ent-btn vt-ent-share ${style}-btn" data-action="partager" aria-label="${t('vit.partager_aria')}" style="${prop}:${shareAt}">${iconShare(18, ink, 2.1)}</button>`,
  ].join('');
}

/* ------------------------------------------------------- 1 · ROYALE ------- */

function royale(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ry-cell"><span class="ry-cell-i">${icon}</span><span class="ry-cell-l">${label}</span><span class="ry-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-ry" data-role="vitrine-hero">',
    '<div class="ry-panel">',
    '<span class="ry-vol1"></span><span class="ry-vol2"></span><span class="ry-dots"></span>',
    // Le médaillon — 188 à top −22 right −30, il sort du cadre (clipped by the card).
    `<div class="ry-med" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '42% 28%')
      : `<div class="ry-med-motif"><span class="ry-med-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="ry-col" data-role="vitrine-identity">',
    '<div class="ry-av">',
    v.hasAvatar
      ? `<span class="ry-av-photo">${avatarImg(v)}</span>`
      : `<span class="ry-av-mono">${v.mono}</span>`,
    `<span class="ry-av-badge">${iconCheckEnt(11, '#E9CF8F', 3.2)}</span>`,
    '</div>',
    `<div class="ry-name${v.longName ? ' vt-ent-long' : ''}"><v>${v.name}</v><span class="ry-seal"><span class="ry-seal-d">${iconCheckEnt(14, '#FFFFFF', 3.6)}</span><span class="ry-seal-r"></span></span></div>`,
    v.hasTag ? `<div class="ry-tag"><v>${v.tagline}</v></div>` : '',
    `<div class="ry-zone">${zoneLine(v, iconPinEnt(13, '#D4739C', 2.2))}</div>`,
    '</div>',
    '<div class="ry-filet"><span class="ry-filet-a"></span><span class="ry-filet-d"></span><span class="ry-filet-b"></span></div>',
    v.hasBio ? `<div class="ry-bio"><v>${v.bio}</v></div>` : '',
    v.showProof || v.showStars
      ? [
          '<div class="ry-proof">',
          v.showProof
            ? `<span class="ry-proof-line" data-role="reputation"><b><v>${v.delivN}</v></b> ${t('vit.ventes_livrees')}</span>`
            : '',
          v.showStars
            ? `<span class="ry-stars" data-role="chip-avis">${iconStarEnt(12, '#D4A857')}<span><v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span></span>`
            : '',
          '</div>',
        ].join('')
      : '',
    v.nouvelle
      ? `<div class="ry-nouv-wrap"><span class="ry-nouv" data-role="chip-nouvelle"><span class="ry-nouv-r">${iconStarEnt(16, '#E9CF8F')}</span><span class="ry-nouv-t">${t('vit.nouvelle_vendeuse')}</span></span></div>`
      : '',
    '<div class="ry-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(20, '#E9CF8F', 1.9), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(19, '#E9CF8F', 1.9), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(19, '#E9CF8F', 1.9), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    // B1 (verifier, browser-measured): at left the pair covered 58% of her
    // avatar AND the vérifié badge — the one thing this page exists to show.
    // Right side, same offsets, over the medallion's empty margin.
    controls(v, 'ry', 'right', '14px', '66px', '#E9CF8F'),
    '</div>',
    '</div>',
  ].join('');
}

/* ------------------------------------------------------ 2 · HÉRITAGE ------ */

function heritage(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="he-cell"><span class="he-cell-i">${icon}</span><span class="he-cell-l">${label}</span><span class="he-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-he" data-role="vitrine-hero">',
    `<div class="he-photo" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '50% 18%')
      : `<div class="he-photo-motif"><span class="he-photo-mono">${v.mono}</span></div>`,
    // L'étincelle haut-droit : point radial + deux rais.
    '<span class="he-etin-p"></span><span class="he-etin-v"></span><span class="he-etin-h"></span>',
    `<span class="he-chip-v">${iconShieldEnt(14, '#E6C983', 2.1)}<span>${verifieeBare()}</span></span>`,
    v.nouvelle
      ? `<span class="he-chip-n" data-role="chip-nouvelle">${iconStarEnt(14, '#C79A45')}<span>${t('vit.nouvelle_vendeuse')}</span></span>`
      : '',
    controls(v, 'he', 'left', '10px', '62px', '#0B4638'),
    '</div>',
    '<div class="he-arch" data-role="vitrine-identity">',
    '<div class="he-med">',
    v.hasAvatar ? `<span class="he-med-photo">${avatarImg(v)}</span>` : `<span class="he-med-mono">${v.mono}</span>`,
    `<span class="he-med-b">${iconCheckEnt(13, '#E6C983', 3.2)}</span>`,
    '</div>',
    `<div class="he-namerow">${iconSparkle(17, '#C79A45')}<span class="he-name"><v>${v.name}</v></span><span class="he-etoile-m">${iconSparkle(17, '#C79A45')}</span></div>`,
    v.hasTag
      ? `<div class="he-tagrow"><span class="he-orn-l"><span class="he-orn-line"></span><span class="he-orn-dot"></span></span><span class="he-tag"><v>${v.tagline}</v></span><span class="he-orn-r"><span class="he-orn-dot"></span><span class="he-orn-line"></span></span></div>`
      : '',
    `<div class="he-zone">${zoneLine(v, iconPinSolid(14, '#C79A45', '#0B4638'))}</div>`,
    v.showProof || v.showStars
      ? [
          '<div class="he-proof">',
          v.showProof
            ? `<span class="he-proof-l" data-role="reputation"><span class="he-pill"><v>${v.delivN}</v></span><span class="he-proof-t">${t('vit.ventes_livrees')}</span></span>`
            : '',
          v.showStars
            ? `<span class="he-stars" data-role="chip-avis">${iconStarEnt(12, '#C79A45')}<span><v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span></span>`
            : '',
          '</div>',
        ].join('')
      : '',
    '</div>',
    '<div class="he-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(19, '#E6C983', 1.9), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(18, '#E6C983', 1.9), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    // §2.6 — Héritage is the one style whose third label is the short form.
    cell(iconTagEnt(18, '#E6C983', 1.9), t('vit.cell_prix_court'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
  ].join('');
}

/* ---------------------------------------------------- 3 · CHALEUREUX ------ */

function chaleureux(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ch-cell"><span class="ch-cell-i">${icon}</span><span class="ch-cell-l">${label}</span><span class="ch-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-ch" data-role="vitrine-hero">',
    '<div class="ch-panel">',
    '<span class="ch-pet1"></span><span class="ch-pet2"></span><span class="ch-feuille"></span>',
    // Le galet — 150×198 à top 14 right 12, rayons organiques.
    `<div class="ch-galet" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '50% 24%')
      : `<div class="ch-galet-motif"><span class="ch-galet-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="ch-col" data-role="vitrine-identity">',
    '<div class="ch-av">',
    v.hasAvatar ? `<span class="ch-av-photo">${avatarImg(v)}</span>` : `<span class="ch-av-mono">${v.mono}</span>`,
    `<span class="ch-av-badge">${iconCheckEnt(9, '#FFFFFF', 3.6)}</span>`,
    '</div>',
    `<div class="ch-name${v.longName ? ' vt-ent-long' : ''}"><v>${v.name}</v><span class="ch-seal"><span class="ch-seal-d">${iconCheckEnt(10, '#FFFFFF', 3.4)}</span><span class="ch-seal-r"></span></span></div>`,
    v.hasTag ? `<div class="ch-tag"><v>${v.tagline}</v></div>` : '',
    `<div class="ch-zone">${zoneLine(v, iconPinEnt(11, '#D95238', 2.3))}</div>`,
    v.hasBio ? `<div class="ch-bio"><v>${v.bio}</v></div>` : '',
    v.showProof || v.showStars
      ? [
          '<div class="ch-proof">',
          v.showProof
            ? `<span data-role="reputation"><b><v>${v.delivN}</v></b> ${t('vit.ventes_livrees')}</span>`
            : '',
          v.showStars
            ? `<span class="ch-stars" data-role="chip-avis">&nbsp;·&nbsp;${iconStarEnt(11, '#E9A83C')} <v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span>`
            : '',
          '</div>',
        ].join('')
      : '',
    '</div>',
    v.nouvelle
      ? `<div class="ch-nouv-wrap"><span class="ch-nouv" data-role="chip-nouvelle">${iconStarEnt(15, '#E9A83C')}<span>${t('vit.nouvelle_vendeuse')}</span></span></div>`
      : '',
    v.showProof ? '<div class="ch-gap"></div>' : '',
    '<div class="ch-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#D95238', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(16, '#D95238', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(16, '#D95238', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    // §2.5 — le « ⋯ » du visuel EST le retour ; partager glisse d'un cran.
    controls(v, 'ch', 'right', '20px', '72px', '#33221C'),
    '</div>',
    '</div>',
  ].join('');
}

/* ------------------------------------------------------- 4 · CRISTAL ------ */

function cristal(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="cr-cell"><span class="cr-cell-i">${icon}</span><span class="cr-cell-l">${label}</span><span class="cr-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-cr" data-role="vitrine-hero">',
    '<div class="cr-panel">',
    '<div class="glz cr-card">',
    '<div class="cr-top" data-role="vitrine-identity">',
    '<div class="cr-av">',
    v.hasAvatar ? `<span class="cr-av-photo">${avatarImg(v)}</span>` : `<span class="cr-av-mono">${v.mono}</span>`,
    `<span class="cr-av-badge">${iconCheckEnt(10, '#FFFFFF', 3.6)}</span>`,
    '</div>',
    '<div class="cr-id">',
    `<div class="cr-namerow"><span class="cr-name"><v>${v.name}</v></span><span class="cr-seal"><span class="cr-seal-d">${iconCheckEnt(11, '#FFFFFF', 3.4)}</span><span class="cr-seal-r"></span></span></div>`,
    v.hasTag ? `<div class="cr-tag"><v>${v.tagline}</v></div>` : '',
    `<div class="cr-zone">${zoneLine(v, iconPinSolid(12, '#1E9E62', '#F4F8F3'))}</div>`,
    '</div>',
    '</div>',
    v.hasBio ? `<div class="cr-bio"><v>${v.bio}</v></div>` : '',
    v.showProof || v.showStars
      ? [
          '<div class="cr-proof">',
          v.showProof
            ? (() => {
                // Contract split: <b>{N} ventes</b> / « livrées par Séra », both
                // nowrap — derived from the one catalog string (first word joins
                // the bold), so no second string is authored.
                const [premier = '', ...reste] = t('vit.ventes_livrees').split(' ');
                return `<span class="glz cr-pave" data-role="reputation"><b class="cr-pave-l1"><v>${v.delivN}</v> ${premier}</b> <span class="cr-pave-l2">${reste.join(' ')}</span></span>`;
              })()
            : '',
          v.showStars
            ? `<span class="cr-stars" data-role="chip-avis">${iconStarEnt(12, '#1E9E62')}<span><v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span></span>`
            : '',
          '</div>',
        ].join('')
      : '',
    `<div class="cr-frame" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '50% 22%')
      : `<div class="cr-frame-motif"><span class="cr-frame-mono">${v.mono}</span></div>`,
    v.nouvelle
      ? `<span class="cr-nouv-wrap"><span class="glz cr-nouv" data-role="chip-nouvelle">${iconStarEnt(15, '#1D7A4F')}<span>${t('vit.nouvelle_vendeuse')}</span></span></span>`
      : '',
    controls(v, 'cr', 'right', '10px', '62px', '#14402F'),
    '</div>',
    '</div>',
    '<div class="glz cr-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(18, '#177A4C', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(17, '#177A4C', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(17, '#177A4C', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '</div>',
    '</div>',
  ].join('');
}

/* ----------------------------------------------------- 5 · DYNAMIQUE ------ */

function dynamique(v: Vals): string {
  const cell = (mod: string, icon: string, label: string, sub: string): string =>
    `<div class="dy-cell"><span class="dy-cell-i dy-cell-i-${mod}">${icon}</span><span class="dy-cell-l">${label}</span><span class="dy-cell-s">${sub}</span></div>`;
  return [
    '<div class="vt-ent vt-dy" data-role="vitrine-hero">',
    '<div class="dy-panel">',
    '<span class="dy-trame-b"></span>',
    // La colonne oblique — 152 pleine hauteur, coupe en clip-path.
    `<div class="dy-photo" data-role="vitrine-cover" data-etat="${etat(v)}">`,
    v.hasCover
      ? coverImg(v, '58% 30%')
      : `<div class="dy-photo-motif"><span class="dy-photo-mono">${v.mono}</span></div>`,
    '<span class="dy-voile"></span><span class="dy-trame-r"></span>',
    '</div>',
    '<div class="dy-col" data-role="vitrine-identity">',
    '<div class="dy-top">',
    '<div class="dy-av">',
    v.hasAvatar ? `<span class="dy-av-photo">${avatarImg(v)}</span>` : `<span class="dy-av-mono">${v.mono}</span>`,
    `<span class="dy-av-badge">${iconCheckEnt(9, '#FFF0F8', 3.6)}</span>`,
    '</div>',
    '<div class="dy-idcol">',
    `<div class="dy-name${v.longName ? ' vt-ent-long' : ''}"><v>${v.name}</v><span class="dy-seal"><span class="dy-seal-d">${iconCheckEnt(9, '#FFFFFF', 3.6)}</span><span class="dy-seal-r"></span></span></div>`,
    v.hasTag ? `<div class="dy-tag"><v>${v.tagline}</v></div>` : '',
    '</div>',
    '</div>',
    `<div class="dy-zone">${zoneLine(v, iconPinEnt(11, '#FF8FC2', 2.3))}</div>`,
    v.hasBio ? `<div class="dy-bio"><v>${v.bio}</v></div>` : '',
    v.showProof || v.showStars
      ? [
          '<div class="dy-proof">',
          v.showProof
            ? `<span data-role="reputation"><b><v>${v.delivN}</v></b> ${t('vit.ventes_livrees')}</span>`
            : '',
          v.showStars
            ? `<span class="dy-stars" data-role="chip-avis">&nbsp;·&nbsp;${iconStarEnt(10, '#FFD36E')} <v>${v.rating}</v> · <v>${v.reviewCount}</v> ${t('vit.avis_verifies')}</span>`
            : '',
          '</div>',
        ].join('')
      : '',
    '</div>',
    v.nouvelle
      ? `<div class="dy-nouv-wrap"><span class="dy-nouv" data-role="chip-nouvelle">${iconStarEnt(14, '#FFFFFF')}<span>${t('vit.nouvelle_vendeuse')}</span></span></div>`
      : '',
    '<div class="dy-trust" data-role="vitrine-trust">',
    cell('v', iconShieldEnt(16, '#FFFFFF', 2.1), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell('m', iconLockEnt(15, '#FFFFFF', 2.1), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell('a', iconTagEnt(15, '#FFFFFF', 2.1), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    '<div class="dy-tail"></div>',
    controls(v, 'dy', 'right', '10px', '62px', '#FFF0F8'),
    '</div>',
    '</div>',
  ].join('');
}

/* -------------------------------------------------------------- dispatch -- */

/**
 * ONE header unit. `'classique'` delegates to the existing hero + trust chips
 * so its bytes are unchanged (the empty screen renders the hero alone, exactly
 * as it does today); each of the five renders its own self-contained block.
 */
export function renderEntete(
  key: EnteteKey,
  sf: Storefront,
  trust: VitrineTrust,
  opts: EnteteOpts = {},
  floatBar = '',
): string {
  if (key === 'classique') {
    const compact = opts.compact === true;
    return compact
      ? hero(sf, trust, { compact: true }, floatBar)
      : hero(sf, trust, {}, floatBar) + chips(sf, trust);
  }
  const v = vals(sf, trust, opts);
  switch (key) {
    case 'royale':
      return royale(v);
    case 'heritage':
      return heritage(v);
    case 'chaleureux':
      return chaleureux(v);
    case 'cristal':
      return cristal(v);
    case 'dynamique':
      return dynamique(v);
  }
}

/* ---------------------------------------------------------------- styles -- */

/**
 * The five palettes as the contract's own custom properties, each scoped under
 * its root class so nothing leaks into the page or between styles. CSS only:
 * no continuous animation, transitions limited to button press (§6), and the
 * one `backdrop-filter` in the whole sheet sits behind `@supports` with the
 * contract's finished opaque fallback.
 */
export const ENTETES_STYLES = `
  .vt-ent {
    position: relative; border-radius: 0 0 26px 26px; overflow: hidden;
    container-type: inline-size;
    /* ENTETES-D (founder order) — the five headers FILL THE SCREEN like the
       classique hero: the same bleed over the page's top structure
       (status 54 + liseré 6 + pad 16 = 76) and side padding (20), bottom
       corners keeping the classique 26px. padding-top holds the content
       below the system status zone; backgrounds paint the padding, so every
       style's surface reaches the very top edge. */
    margin: -76px -20px 0; padding-top: 60px;
    font-family: 'Instrument Sans', system-ui, sans-serif;
    box-shadow: 0 26px 60px -26px rgba(28,22,15,.55);
  }
  .vt-ent * { box-sizing: border-box; margin: 0; }
  .vt-ent v { display: inline; }
  .vt-ent b { font-style: normal; }
  .vt-ent .vt-cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .vt-ent .vt-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: inherit; }
  /* §6 — tout tappable ≥ 44×44 (les ronds 40 des visuels portés à 44). */
  .vt-ent-btn {
    position: absolute; z-index: 6; top: 14px;
    width: 44px; height: 44px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    padding: 0; cursor: pointer; font: inherit; border: none;
    transition: transform .18s ease;
  }
  .vt-ent-btn:active { transform: scale(.94); }

  /* ══════════════════════ 1 · ROYALE ══════════════════════ */
  .vt-ry {
    --ry-fond: #26082C; --ry-magenta: #A81E62; --ry-prune: #6E1252;
    --ry-p1: #2C0A31; --ry-p2: #3C0D3C; --ry-p3: #54104A; --ry-p4: #671350;
    --ry-or: #D4A857; --ry-or-clair: #E9CF8F;
    --ry-medaille-a: #F0D796; --ry-medaille-b: #C79A45;
    --ry-rose: #E4779F; --ry-epingle: #D4739C;
    --ry-ivoire: #FFFCF6; --ry-ivoire-doux: #F6EBDC;
    --ry-pastille-a: #3E0E3A; --ry-pastille-b: #5E1149;
    background: var(--ry-fond);
  }
  .vt-ry .ry-panel {
    position: relative; background: var(--ry-fond);
    background-image:
      radial-gradient(56% 60% at 88% 6%, var(--ry-magenta) 0%, rgba(168,30,98,0) 62%),
      radial-gradient(50% 56% at 6% 98%, var(--ry-prune) 0%, rgba(110,18,82,0) 66%),
      linear-gradient(152deg, var(--ry-p1) 0%, var(--ry-p2) 46%, var(--ry-p3) 78%, var(--ry-p4) 100%);
    padding: 18px 16px;
  }
  .vt-ry .ry-vol1 { position: absolute; left: -140px; top: -170px; width: 520px; height: 520px; border-radius: 50%; border: 1.5px solid rgba(212,168,87,.14); }
  .vt-ry .ry-vol2 { position: absolute; left: -90px; top: -110px; width: 520px; height: 520px; border-radius: 50%; border: 1px solid rgba(232,120,180,.12); }
  .vt-ry .ry-dots {
    position: absolute; right: 26px; bottom: 170px; width: 92px; height: 66px;
    background-image: radial-gradient(circle, rgba(232,120,180,.5) 1.3px, transparent 1.5px);
    background-size: 11px 11px;
  }
  .vt-ry .ry-med {
    position: absolute; top: -22px; right: -30px; width: 188px; height: 188px;
    border-radius: 50%; overflow: hidden;
    box-shadow: 0 0 0 2px var(--ry-or), 0 0 0 7px rgba(212,168,87,.14), 0 18px 44px -16px rgba(0,0,0,.7);
  }
  .vt-ry .ry-med-motif {
    position: absolute; inset: 0; background-color: var(--ry-pastille-a);
    background-image:
      repeating-linear-gradient(45deg, rgba(212,168,87,.20) 0 2px, transparent 2px 16px),
      repeating-linear-gradient(-45deg, rgba(168,30,98,.30) 0 2px, transparent 2px 16px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ry .ry-med-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 74px; color: rgba(212,168,87,.4); margin-right: 30px; }
  .vt-ry .ry-col { position: relative; width: calc(100% - 132px); }
  .vt-ry .ry-av { position: relative; width: 54px; height: 54px; }
  .vt-ry .ry-av-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 1.5px var(--ry-or); }
  .vt-ry .ry-av-mono {
    position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid var(--ry-or);
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 27px; color: var(--ry-or-clair);
  }
  .vt-ry .ry-av-badge {
    position: absolute; right: -1px; bottom: -3px; width: 21px; height: 21px; border-radius: 50%;
    background: var(--ry-fond); border: 1.5px solid var(--ry-or);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ry .ry-name {
    margin-top: 13px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(28px, 9.6cqw, 33px); line-height: 1.08; letter-spacing: -.012em;
    color: var(--ry-ivoire); overflow-wrap: break-word;
  }
  .vt-ry .ry-name.vt-ent-long { font-size: 25px; }
  .vt-ry .ry-seal { position: relative; display: inline-flex; width: 27px; height: 27px; vertical-align: -4px; margin-left: 8px; }
  .vt-ry .ry-seal-d { position: absolute; inset: 0; border-radius: 50%; background: linear-gradient(150deg, var(--ry-medaille-a), var(--ry-medaille-b)); display: flex; align-items: center; justify-content: center; }
  .vt-ry .ry-seal-r { position: absolute; inset: -3px; border-radius: 50%; border: 1.5px dashed rgba(212,168,87,.75); }
  .vt-ry .ry-tag { margin-top: 6px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 19px; color: var(--ry-or-clair); }
  .vt-ry .ry-zone { margin-top: 7px; font-size: 12px; font-weight: 500; line-height: 1.4; color: var(--ry-ivoire-doux); }
  .vt-ry .ry-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-ry .ry-filet { position: relative; margin-top: 14px; display: flex; align-items: center; gap: 8px; width: calc(100% - 24px); }
  .vt-ry .ry-filet-a { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(212,168,87,.7), rgba(212,168,87,.3)); }
  .vt-ry .ry-filet-d { width: 8px; height: 8px; flex: none; background: var(--ry-or); transform: rotate(45deg); }
  .vt-ry .ry-filet-b { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(212,168,87,.3), rgba(212,168,87,0)); }
  .vt-ry .ry-bio { text-wrap: pretty;  position: relative; margin-top: 12px; font-size: 13px; line-height: 1.5; color: var(--ry-ivoire-doux); max-width: 236px; }
  .vt-ry .ry-proof { position: relative; margin-top: 13px; display: flex; align-items: center; flex-wrap: wrap; gap: 5px 12px; }
  .vt-ry .ry-proof-line { font-size: 13px; color: var(--ry-ivoire-doux); white-space: nowrap; }
  .vt-ry .ry-proof-line b { font-weight: 700; color: var(--ry-or-clair); font-size: 14.5px; }
  .vt-ry .ry-stars { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .vt-ry .ry-stars span { font-size: 11.5px; font-weight: 600; color: var(--ry-rose); }
  .vt-ry .ry-nouv-wrap { position: relative; margin-top: 14px; display: flex; justify-content: flex-end; }
  .vt-ry .ry-nouv {
    display: inline-flex; align-items: center; gap: 9px; height: 44px; padding: 0 17px 0 6px;
    border-radius: 99px; background: linear-gradient(115deg, var(--ry-pastille-a), var(--ry-pastille-b));
    border: 1.5px solid var(--ry-or); box-shadow: 0 10px 26px -12px rgba(0,0,0,.75); white-space: nowrap;
  }
  .vt-ry .ry-nouv-r {
    width: 32px; height: 32px; flex: none; border-radius: 50%;
    background: rgba(212,168,87,.14); border: 1px solid rgba(212,168,87,.7);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ry .ry-nouv-t { font-size: 14.5px; font-weight: 600; color: var(--ry-ivoire); }
  .vt-ry .ry-trust {
    position: relative; margin-top: 15px; border-radius: 18px;
    border: 1px solid rgba(212,168,87,.55); background: rgba(255,255,255,.045);
    padding: 13px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-ry .ry-cell { padding: 0 8px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 7px; }
  .vt-ry .ry-cell + .ry-cell { border-left: 1px solid rgba(212,168,87,.3); }
  .vt-ry .ry-cell-i {
    width: 40px; height: 40px; border-radius: 50%;
    border: 1px solid rgba(212,168,87,.6); background: rgba(212,168,87,.09);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ry .ry-cell-l { font-size: 10.5px; font-weight: 600; line-height: 1.28; color: var(--ry-ivoire); }
  .vt-ry .ry-cell-s { font-size: 9px; line-height: 1.25; color: var(--ry-rose); }
  .vt-ry .ry-btn { background: linear-gradient(115deg, var(--ry-pastille-a), var(--ry-pastille-b)); border: 1px solid rgba(212,168,87,.7); }
  .vt-ry .vt-ent-back { right: 14px; }

  /* ══════════════════════ 2 · HÉRITAGE ══════════════════════ */
  .vt-he {
    --he-vert: #0B4638; --he-vert-clair: #0E5442; --he-vert-texte: #123B31;
    --he-or: #C79A45; --he-or-clair: #E6C983; --he-or-sourd: #9C7F4B;
    --he-creme: #F7F1E5; --he-ivoire: #FFFCF6; --he-ivoire-doux: #EFE7D6; --he-ivoire-tendre: #F4EDDD;
    background: #4E6653;
    background-image:
      radial-gradient(80% 55% at 30% 30%, #C4B49B 0%, rgba(196,180,155,0) 70%),
      linear-gradient(155deg, #5E7561 0%, #43584A 55%, #2E4237 100%);
    padding-bottom: 14px;
  }
  .vt-he .he-photo {
    position: relative; margin: 10px 10px 0; height: 238px; border-radius: 24px; overflow: hidden;
    box-shadow: 0 0 0 1px rgba(247,241,229,.5), 0 16px 36px -18px rgba(0,0,0,.55);
  }
  .vt-he .he-photo-motif {
    position: absolute; inset: 0; background-color: var(--he-vert);
    background-image:
      repeating-linear-gradient(45deg, rgba(212,168,87,.09) 0 2px, transparent 2px 14px),
      repeating-linear-gradient(-45deg, rgba(212,168,87,.09) 0 2px, transparent 2px 14px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-he .he-photo-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 110px; color: rgba(212,168,87,.20); }
  .vt-he .he-etin-p { position: absolute; top: 14px; right: 30px; width: 20px; height: 20px; background: radial-gradient(circle, rgba(255,248,226,.95) 0 14%, rgba(255,248,226,0) 62%); }
  .vt-he .he-etin-v { position: absolute; top: 7px; right: 38px; width: 2px; height: 34px; background: linear-gradient(180deg, rgba(255,248,226,0), rgba(255,248,226,.9), rgba(255,248,226,0)); }
  .vt-he .he-etin-h { position: absolute; top: 23px; right: 22px; width: 34px; height: 2px; background: linear-gradient(90deg, rgba(255,248,226,0), rgba(255,248,226,.9), rgba(255,248,226,0)); }
  .vt-he .he-chip-v {
    position: absolute; top: 10px; left: 10px; display: inline-flex; align-items: center; gap: 7px;
    height: 32px; padding: 0 13px; border-radius: 99px; background: var(--he-vert);
    box-shadow: 0 6px 16px -8px rgba(0,0,0,.6); white-space: nowrap;
  }
  .vt-he .he-chip-v span { font-size: 11.5px; font-weight: 500; color: var(--he-ivoire); }
  .vt-he .he-chip-n {
    position: absolute; top: 10px; right: 10px; display: inline-flex; align-items: center; gap: 7px;
    height: 34px; padding: 0 14px; border-radius: 99px; background: var(--he-creme);
    box-shadow: 0 6px 16px -8px rgba(0,0,0,.55); white-space: nowrap;
  }
  .vt-he .he-chip-n span { font-size: 12px; font-weight: 600; color: var(--he-vert-texte); }
  .vt-he .he-btn { background: var(--he-creme); box-shadow: 0 6px 16px -8px rgba(0,0,0,.55); }
  .vt-he .vt-ent-btn { top: 52px; }
  .vt-he .vt-ent-back { left: 10px; }
  .vt-he .he-arch {
    position: relative; margin: -64px 16px 0; border-radius: 36px; background: var(--he-vert);
    background-image:
      repeating-linear-gradient(45deg, rgba(212,168,87,.05) 0 2px, transparent 2px 15px),
      repeating-linear-gradient(-45deg, rgba(212,168,87,.05) 0 2px, transparent 2px 15px);
    box-shadow: inset 0 0 0 1.5px rgba(212,168,87,.45), 0 18px 40px -20px rgba(0,0,0,.55);
    padding: 0 16px 20px; text-align: center;
  }
  .vt-he .he-med { position: relative; width: 84px; height: 84px; margin: -42px auto 0; }
  .vt-he .he-med-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 4px var(--he-vert), 0 0 0 6.5px var(--he-or); }
  .vt-he .he-med-photo .vt-avatar-img { object-position: 50% 32%; }
  .vt-he .he-med-mono {
    position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(120% 120% at 30% 22%, #14614C 0%, #0A3D30 74%);
    box-shadow: 0 0 0 4px var(--he-vert), 0 0 0 6.5px var(--he-or);
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 40px; color: var(--he-or-clair);
  }
  .vt-he .he-med-b {
    position: absolute; right: -3px; bottom: 0; width: 26px; height: 26px; border-radius: 50%;
    background: var(--he-vert); border: 2px solid var(--he-or);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-he .he-namerow { margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 13px; }
  .vt-he .he-namerow svg { flex: none; }
  .vt-he .he-etoile-m { display: inline-flex; transform: scaleX(-1); }
  .vt-he .he-name {
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(28px, 9.8cqw, 35px); line-height: 1.02; color: var(--he-ivoire);
    min-width: 0; overflow-wrap: break-word;
  }
  .vt-he .he-tagrow { margin-top: 6px; display: flex; align-items: center; justify-content: center; gap: 9px; }
  .vt-he .he-orn-l, .vt-he .he-orn-r { display: flex; align-items: center; gap: 5px; }
  .vt-he .he-orn-l .he-orn-line { width: 24px; height: 1px; background: linear-gradient(90deg, rgba(199,154,69,0), var(--he-or)); }
  .vt-he .he-orn-r .he-orn-line { width: 24px; height: 1px; background: linear-gradient(90deg, var(--he-or), rgba(199,154,69,0)); }
  .vt-he .he-orn-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--he-or); }
  .vt-he .he-tag { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 17px; color: var(--he-or-clair); }
  .vt-he .he-zone { margin-top: 8px; text-align: center; font-size: 12.5px; font-weight: 500; line-height: 1.45; color: var(--he-ivoire-doux); }
  .vt-he .he-zone svg { vertical-align: -2.5px; margin-right: 5px; }
  .vt-he .he-proof { margin-top: 13px; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 7px 10px; }
  .vt-he .he-proof-l { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .vt-he .he-pill {
    display: inline-flex; align-items: center; height: 30px; padding: 0 13px; border-radius: 99px;
    background: var(--he-vert-clair); border: 1px solid var(--he-or);
    font-size: 13px; font-weight: 600; color: var(--he-or-clair); white-space: nowrap;
  }
  .vt-he .he-proof-t { font-size: 13px; font-weight: 500; color: var(--he-ivoire-tendre); }
  .vt-he .he-stars { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .vt-he .he-stars span { font-size: 11.5px; font-weight: 600; color: var(--he-or-clair); }
  .vt-he .he-trust {
    position: relative; margin: -16px 10px 0; border-radius: 22px; background: var(--he-creme);
    box-shadow: 0 0 0 1.5px rgba(199,154,69,.4), 0 14px 30px -18px rgba(0,0,0,.5);
    padding: 13px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-he .he-cell { padding: 0 8px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-he .he-cell + .he-cell { border-left: 1px solid rgba(199,154,69,.3); }
  .vt-he .he-cell-i { width: 40px; height: 40px; border-radius: 50%; background: var(--he-vert); display: flex; align-items: center; justify-content: center; }
  .vt-he .he-cell-l { font-family: Georgia, 'Times New Roman', serif; font-size: 11.5px; font-weight: 700; line-height: 1.22; color: var(--he-vert-texte); }
  .vt-he .he-cell-s { font-size: 9px; line-height: 1.25; color: var(--he-or-sourd); }

  /* ══════════════════════ 3 · CHALEUREUX ══════════════════════ */
  .vt-ch {
    --ch-page: #FDEEE7; --ch-brique: #B8452F; --ch-corail: #D95238; --ch-corail-pale: #FBE4DC;
    --ch-encre: #33221C; --ch-texte: #6B564D; --ch-sourd: #7A5C53; --ch-sourd-clair: #97837A;
    --ch-verifie: #1E9E62; --ch-etoile: #E9A83C; --ch-sep: #F5E3DC;
    background: var(--ch-page);
  }
  .vt-ch .ch-panel {
    position: relative; background: var(--ch-page);
    background-image:
      radial-gradient(70% 55% at 96% 4%, #F9D8CA 0%, rgba(249,216,202,0) 60%),
      radial-gradient(60% 45% at 2% 100%, #FBE2D6 0%, rgba(251,226,214,0) 58%);
    padding: 16px;
  }
  .vt-ch .ch-pet1 { position: absolute; left: -34px; top: 190px; width: 130px; height: 130px; border-radius: 62% 38% 55% 45% / 48% 62% 38% 52%; background: #F6C9B8; opacity: .55; }
  .vt-ch .ch-pet2 { position: absolute; right: -16px; bottom: 120px; width: 96px; height: 96px; border-radius: 45% 55% 40% 60% / 55% 45% 60% 40%; background: #F3BCA9; opacity: .5; }
  .vt-ch .ch-feuille {
    position: absolute; right: 34px; top: 236px; width: 56px; height: 74px; opacity: .6;
    background:
      radial-gradient(ellipse 50% 44% at 50% 30%, #F3BCA9 0%, rgba(243,188,169,0) 70%),
      radial-gradient(ellipse 44% 38% at 50% 72%, #F3BCA9 0%, rgba(243,188,169,0) 70%);
  }
  .vt-ch .ch-galet {
    position: absolute; top: 14px; right: 12px; width: 150px; height: 198px;
    border-radius: 76px 58px 72px 62px / 64px 76px 58px 72px; overflow: hidden;
    box-shadow: 0 16px 34px -14px rgba(150,70,45,.38);
  }
  .vt-ch .ch-galet-motif {
    position: absolute; inset: 0; background-color: #F8D3C6;
    background-image:
      repeating-linear-gradient(90deg, rgba(220,92,66,.35) 0 3px, transparent 3px 12px),
      repeating-linear-gradient(0deg, rgba(184,69,47,.14) 0 2px, transparent 2px 10px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ch .ch-galet-mono { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 64px; color: rgba(184,69,47,.4); }
  .vt-ch .ch-col { position: relative; width: calc(100% - 160px); }
  .vt-ch .ch-av { position: relative; width: 46px; height: 46px; }
  .vt-ch .ch-av-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 2px #FFFFFF; }
  .vt-ch .ch-av-mono {
    position: absolute; inset: 0; border-radius: 50%; background: var(--ch-brique); box-shadow: 0 0 0 2px #FFFFFF;
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 23px; color: #FFF6F2;
  }
  .vt-ch .ch-av-badge {
    position: absolute; right: -3px; bottom: -1px; width: 17px; height: 17px; border-radius: 50%;
    background: var(--ch-brique); border: 2px solid var(--ch-page);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ch .ch-name {
    margin-top: 10px; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800;
    font-size: clamp(23px, 8cqw, 28px); line-height: 1.12; letter-spacing: -.025em;
    color: var(--ch-encre); overflow-wrap: break-word;
  }
  .vt-ch .ch-name.vt-ent-long { font-size: 21px; }
  .vt-ch .ch-seal { position: relative; display: inline-flex; width: 19px; height: 19px; vertical-align: -2px; margin-left: 6px; }
  .vt-ch .ch-seal-d { position: absolute; inset: 0; border-radius: 50%; background: var(--ch-verifie); display: flex; align-items: center; justify-content: center; }
  .vt-ch .ch-seal-r { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(30,158,98,.55); }
  .vt-ch .ch-tag { margin-top: 3px; font-size: 13.5px; font-weight: 700; color: var(--ch-corail); }
  .vt-ch .ch-zone { margin-top: 5px; font-size: 11px; font-weight: 500; line-height: 1.4; color: var(--ch-sourd); }
  .vt-ch .ch-zone svg { vertical-align: -1.5px; margin-right: 3px; }
  .vt-ch .ch-bio { text-wrap: pretty;  margin-top: 9px; font-size: 12px; line-height: 1.5; color: var(--ch-texte); }
  .vt-ch .ch-proof { margin-top: 10px; font-size: 11.5px; color: var(--ch-texte); line-height: 1.45; }
  .vt-ch .ch-proof b { font-weight: 700; color: var(--ch-encre); }
  .vt-ch .ch-stars { white-space: nowrap; }
  .vt-ch .ch-stars svg { vertical-align: -1.5px; }
  .vt-ch .ch-nouv-wrap { position: relative; margin-top: 12px; display: flex; justify-content: flex-end; }
  .vt-ch .ch-nouv {
    display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 15px; border-radius: 99px;
    background: #FFFFFF; box-shadow: 0 10px 24px -10px rgba(150,70,45,.45); white-space: nowrap;
  }
  .vt-ch .ch-nouv svg { flex: none; }
  .vt-ch .ch-nouv span { font-size: 13px; font-weight: 700; color: var(--ch-encre); }
  .vt-ch .ch-gap { height: 12px; }
  .vt-ch .ch-trust {
    position: relative; margin-top: 8px; border-radius: 16px; background: #FFFFFF;
    box-shadow: 0 8px 22px -14px rgba(150,70,45,.4);
    padding: 12px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-ch .ch-cell { padding: 0 7px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-ch .ch-cell + .ch-cell { border-left: 1px solid var(--ch-sep); }
  .vt-ch .ch-cell-i { width: 34px; height: 34px; border-radius: 11px; background: var(--ch-corail-pale); display: flex; align-items: center; justify-content: center; }
  .vt-ch .ch-cell-l { font-size: 10px; font-weight: 700; line-height: 1.28; color: var(--ch-encre); }
  .vt-ch .ch-cell-s { font-size: 8.5px; line-height: 1.25; color: var(--ch-sourd-clair); }
  .vt-ch .ch-btn { background: #FFFFFF; box-shadow: 0 4px 12px -3px rgba(150,70,45,.35); }
  .vt-ch .vt-ent-btn { top: 22px; }
  .vt-ch .vt-ent-back { right: 20px; }

  /* ══════════════════════ 4 · CRISTAL ══════════════════════ */
  .vt-cr {
    --cr-vert: #14402F; --cr-titre: #17352A; --cr-vif: #22B573; --cr-vif-sourd: #1E9E62;
    --cr-icone: #177A4C; --cr-laiton: #A98B54; --cr-mono: #D8B778;
    --cr-texte: #4C5F55; --cr-texte-doux: #5C6E63; --cr-sourd: #7C8D84;
    background: #EDF2ED;
  }
  /* §6 — la SEULE classe du contrat, exigée par le @supports : fallback opaque
     fini d'abord, le flou seulement là où le navigateur le porte. */
  .vt-cr .glz { background: rgba(255,255,255,.66); }
  @supports ((backdrop-filter: blur(16px)) or (-webkit-backdrop-filter: blur(16px))) {
    .vt-cr .glz { -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); background: rgba(255,255,255,.44); }
  }
  .vt-cr .cr-panel {
    position: relative; background: #EDF2ED;
    background-image:
      radial-gradient(46% 34% at -4% 10%, #BED8BE 0%, rgba(190,216,190,0) 70%),
      radial-gradient(40% 30% at 104% 88%, #CBE0CB 0%, rgba(203,224,203,0) 70%),
      linear-gradient(170deg, #F4F8F3, #E7EEE7);
    padding: 14px 12px;
  }
  .vt-cr .cr-card { position: relative; border-radius: 24px; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.85), 0 18px 40px -22px rgba(20,64,47,.4); padding: 14px; }
  .vt-cr .cr-top { display: flex; align-items: flex-start; gap: 12px; }
  .vt-cr .cr-av { position: relative; width: 56px; height: 56px; flex: none; }
  .vt-cr .cr-av-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 3px rgba(255,255,255,.92), 0 6px 14px -6px rgba(20,64,47,.5); }
  .vt-cr .cr-av-mono {
    position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(120% 120% at 32% 22%, #1C4A37 0%, #0F3527 76%);
    box-shadow: 0 0 0 3px rgba(255,255,255,.92), 0 6px 14px -6px rgba(20,64,47,.5);
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 27px; color: var(--cr-mono);
  }
  .vt-cr .cr-av-badge {
    position: absolute; right: -3px; bottom: -2px; width: 20px; height: 20px; border-radius: 50%;
    background: var(--cr-vif); border: 2.5px solid #F4F8F3;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cr .cr-id { flex: 1; min-width: 0; }
  .vt-cr .cr-namerow { display: flex; align-items: flex-start; gap: 7px; }
  .vt-cr .cr-name {
    font-weight: 700; font-size: clamp(23px, 8cqw, 28px); line-height: 1.06; letter-spacing: -.02em;
    color: var(--cr-titre); flex: 1 1 auto; min-width: 0; overflow-wrap: break-word;
  }
  .vt-cr .cr-seal { position: relative; flex: none; margin-top: 5px; width: 20px; height: 20px; }
  .vt-cr .cr-seal-d { position: absolute; inset: 0; border-radius: 50%; background: var(--cr-vif); display: flex; align-items: center; justify-content: center; }
  .vt-cr .cr-seal-r { position: absolute; inset: -2.5px; border-radius: 50%; border: 1.5px dashed rgba(34,181,115,.55); }
  .vt-cr .cr-tag { margin-top: 3px; font-size: 14px; font-weight: 600; color: var(--cr-laiton); }
  .vt-cr .cr-zone { margin-top: 5px; font-size: 11.5px; font-weight: 500; line-height: 1.4; color: var(--cr-texte); }
  .vt-cr .cr-zone svg { vertical-align: -2px; margin-right: 4px; }
  .vt-cr .cr-bio { text-wrap: pretty;  margin-top: 11px; font-size: 12.5px; line-height: 1.55; color: var(--cr-texte-doux); }
  .vt-cr .cr-proof { margin-top: 11px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .vt-cr .cr-pave-l1, .vt-cr .cr-pave-l2 { white-space: nowrap; display: block; }
  .vt-cr .cr-pave { display: inline-flex; flex-direction: column; padding: 7px 14px; border-radius: 14px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.9); }
  .vt-cr .cr-pave b { font-size: 14px; font-weight: 700; color: var(--cr-vert); line-height: 1.15; }
  .vt-cr .cr-pave span { font-size: 10px; color: var(--cr-sourd); line-height: 1.2; }
  .vt-cr .cr-stars { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .vt-cr .cr-stars span { font-size: 11.5px; font-weight: 600; color: var(--cr-texte); }
  .vt-cr .cr-frame {
    position: relative; margin-top: 12px; height: 196px; border-radius: 18px; overflow: hidden;
    box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.9), 0 0 24px rgba(80,200,120,.38);
  }
  .vt-cr .cr-frame-motif {
    position: absolute; inset: 0; background-color: #DCEBDF;
    background-image:
      repeating-linear-gradient(90deg, rgba(20,64,47,.14) 0 3px, transparent 3px 13px),
      repeating-linear-gradient(0deg, rgba(34,160,90,.12) 0 2px, transparent 2px 11px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cr .cr-frame-mono { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 70px; color: rgba(20,64,47,.22); }
  .vt-cr .cr-nouv-wrap { position: absolute; right: 10px; bottom: 10px; }
  .vt-cr .cr-nouv {
    display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 15px; border-radius: 99px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.9), 0 8px 20px -10px rgba(20,64,47,.5); white-space: nowrap;
  }
  .vt-cr .cr-nouv svg { flex: none; }
  .vt-cr .cr-nouv span { font-size: 13px; font-weight: 700; color: var(--cr-vert); }
  .vt-cr .cr-trust {
    position: relative; margin-top: 10px; border-radius: 20px;
    box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.85), 0 12px 26px -20px rgba(20,64,47,.45);
    padding: 12px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-cr .cr-cell { padding: 0 7px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vt-cr .cr-cell + .cr-cell { border-left: 1px solid rgba(20,64,47,.1); }
  .vt-cr .cr-cell-i {
    width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,.88);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.9), 0 4px 10px -6px rgba(20,64,47,.4);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-cr .cr-cell-l { font-size: 10px; font-weight: 700; line-height: 1.28; color: var(--cr-vert); }
  .vt-cr .cr-cell-s { font-size: 8.5px; line-height: 1.25; color: var(--cr-sourd); }
  .vt-cr .cr-btn { background: rgba(255,255,255,.88); box-shadow: inset 0 0 0 1px rgba(255,255,255,.9), 0 6px 16px -8px rgba(20,64,47,.45); }
  .vt-cr .vt-ent-btn { top: 10px; }
  .vt-cr .vt-ent-back { right: 10px; }

  /* ══════════════════════ 5 · DYNAMIQUE ══════════════════════ */
  .vt-dy {
    --dy-magenta: #E9257F; --dy-magenta-fonce: #C21E73; --dy-rose: #FF8FC2;
    --dy-violet: #6E2BB8; --dy-violet-clair: #8A3BD4;
    --dy-ambre: #E08A2B; --dy-ambre-clair: #F0A94B; --dy-etoile: #FFD36E;
    --dy-ivoire: #FFF0F8; --dy-encre: #231038; --dy-sourd: #8B7C9B; --dy-sep: #F0EAF4;
    background: #F6F2F8;
  }
  .vt-dy .dy-panel { position: relative; background: linear-gradient(118deg, #2B1055 0%, #4B1C7A 42%, #8E1F6B 76%, #C21E73 100%); padding: 14px 14px 0; }
  .vt-dy .dy-trame-b {
    position: absolute; left: 2px; bottom: 64px; width: 110px; height: 76px;
    background-image: radial-gradient(circle, rgba(255,255,255,.28) 1.3px, transparent 1.5px);
    background-size: 11px 11px;
  }
  .vt-dy .dy-photo { position: absolute; top: 0; right: 0; bottom: 0; width: 152px; overflow: hidden; clip-path: polygon(30% 0, 100% 0, 100% 100%, 0 100%); }
  .vt-dy .dy-photo-motif {
    position: absolute; inset: 0; background-color: #5B1E8C;
    background-image:
      repeating-linear-gradient(90deg, rgba(255,255,255,.14) 0 2px, transparent 2px 12px),
      repeating-linear-gradient(0deg, rgba(194,30,115,.38) 0 2px, transparent 2px 11px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-dy .dy-photo-mono { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 58px; color: rgba(255,240,248,.3); margin-left: 22px; }
  .vt-dy .dy-voile { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(43,16,85,.8) 0%, rgba(43,16,85,.1) 38%, rgba(43,16,85,0) 62%); }
  .vt-dy .dy-trame-r {
    position: absolute; top: 6px; right: 6px; width: 64px; height: 46px;
    background-image: radial-gradient(circle, rgba(255,120,190,.7) 1.4px, transparent 1.6px);
    background-size: 10px 10px;
  }
  .vt-dy .dy-col { position: relative; width: calc(100% - 128px); }
  .vt-dy .dy-top { display: flex; align-items: flex-start; gap: 10px; }
  .vt-dy .dy-av { position: relative; width: 44px; height: 44px; flex: none; }
  .vt-dy .dy-av-photo { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; background: linear-gradient(160deg,#9A9084,#574E43); box-shadow: 0 0 0 2px rgba(255,240,248,.85); }
  .vt-dy .dy-av-mono {
    position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(120% 120% at 32% 24%, var(--dy-violet) 0%, #3A1568 78%);
    box-shadow: 0 0 0 2px rgba(255,240,248,.85);
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 21px; color: var(--dy-ivoire);
  }
  .vt-dy .dy-av-badge {
    position: absolute; right: -3px; bottom: -2px; width: 17px; height: 17px; border-radius: 50%;
    background: #2B1055; border: 2px solid var(--dy-ivoire);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-dy .dy-idcol { flex: 1; min-width: 0; }
  .vt-dy .dy-name {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800;
    font-size: clamp(21px, 7.4cqw, 25px); line-height: 1.12; letter-spacing: -.025em;
    color: #FFFFFF; overflow-wrap: break-word;
  }
  .vt-dy .dy-name.vt-ent-long { font-size: 19px; }
  .vt-dy .dy-seal { position: relative; display: inline-flex; width: 17px; height: 17px; vertical-align: -2px; margin-left: 6px; }
  .vt-dy .dy-seal-d { position: absolute; inset: 0; border-radius: 50%; background: var(--dy-magenta); display: flex; align-items: center; justify-content: center; }
  .vt-dy .dy-seal-r { position: absolute; inset: -2px; border-radius: 50%; border: 1.5px dashed rgba(233,37,127,.6); }
  .vt-dy .dy-tag { margin-top: 2px; font-size: 12px; font-weight: 700; color: var(--dy-rose); }
  .vt-dy .dy-zone { margin-top: 6px; font-size: 10.5px; font-weight: 500; line-height: 1.4; color: rgba(255,240,248,.88); }
  .vt-dy .dy-zone svg { vertical-align: -1.5px; margin-right: 3px; }
  .vt-dy .dy-bio { text-wrap: pretty;  margin-top: 7px; font-size: 11.5px; line-height: 1.45; color: rgba(255,240,248,.88); }
  .vt-dy .dy-proof { margin-top: 9px; font-size: 11px; color: rgba(255,240,248,.9); line-height: 1.45; }
  .vt-dy .dy-proof b { font-weight: 700; color: #FFFFFF; }
  .vt-dy .dy-stars { white-space: nowrap; }
  .vt-dy .dy-stars svg { vertical-align: -1px; }
  .vt-dy .dy-nouv-wrap { position: relative; margin-top: 10px; display: flex; justify-content: flex-end; }
  .vt-dy .dy-nouv {
    display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 99px;
    background: linear-gradient(120deg, var(--dy-magenta), var(--dy-magenta-fonce));
    box-shadow: 0 10px 22px -10px rgba(233,37,127,.85); white-space: nowrap;
  }
  .vt-dy .dy-nouv svg { flex: none; }
  .vt-dy .dy-nouv span { font-size: 12.5px; font-weight: 700; color: #FFFFFF; }
  .vt-dy .dy-trust {
    position: relative; margin-top: 12px; border-radius: 18px; background: #FFFFFF;
    box-shadow: 0 16px 34px -18px rgba(43,16,85,.7);
    padding: 11px 2px; display: grid; grid-template-columns: 1fr 1fr 1fr;
  }
  .vt-dy .dy-cell { padding: 0 6px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .vt-dy .dy-cell + .dy-cell { border-left: 1px solid var(--dy-sep); }
  .vt-dy .dy-cell-i { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .vt-dy .dy-cell-i-v { background: linear-gradient(140deg, var(--dy-violet), var(--dy-violet-clair)); box-shadow: 0 6px 14px -8px rgba(110,43,184,.7); }
  .vt-dy .dy-cell-i-m { background: linear-gradient(140deg, var(--dy-magenta), #FF5CA8); box-shadow: 0 6px 14px -8px rgba(233,37,127,.7); }
  .vt-dy .dy-cell-i-a { background: linear-gradient(140deg, var(--dy-ambre), var(--dy-ambre-clair)); box-shadow: 0 6px 14px -8px rgba(224,138,43,.7); }
  .vt-dy .dy-cell-l { font-size: 9.5px; font-weight: 700; line-height: 1.28; color: var(--dy-encre); }
  .vt-dy .dy-cell-s { font-size: 8px; line-height: 1.25; color: var(--dy-sourd); }
  .vt-dy .dy-tail { height: 12px; }
  .vt-dy .dy-btn { background: rgba(43,16,85,.45); border: 1px solid rgba(255,240,248,.32); }
  .vt-dy .vt-ent-btn { top: 10px; }
  .vt-dy .vt-ent-back { right: 10px; }

  /* ═══════════════ ENTETES-D · full-bleed (founder order) ═══════════════
     The five headers FILL THE SCREEN like the classique hero. The unit
     bleeds (margin -76/-20, bottom corners 26 — see .vt-ent); each style's
     TOP surface then rides up under the unit's 60px status padding and pads
     itself back down, so gradients and patterns paint to the very top edge
     with zero seam. Héritage's photo strip goes to the top like classique's
     cover (its own height absorbs the pull so the arch overlap is
     unchanged); its photo-anchored chips and buttons shift below the
     status zone. Later-in-sheet rules override the earlier same-specificity
     declarations by cascade order — the originals above stay contract-
     verbatim. */
  .vt-ry .ry-panel { margin-top: -60px; padding-top: 78px; }   /* 18 + 60 */
  .vt-ch .ch-panel { margin-top: -60px; padding-top: 76px; }   /* 16 + 60 */
  .vt-cr .cr-panel { margin-top: -60px; padding-top: 74px; }   /* 14 + 60 */
  .vt-dy .dy-panel { margin-top: -60px; padding-top: 74px; }   /* 14 + 60 */
  .vt-he .he-photo { margin: -60px 0 0; height: 298px; border-radius: 0; }
  .vt-he .he-chip-v { top: 70px; left: 14px; }
  .vt-he .he-chip-n { top: 70px; right: 14px; }
  .vt-he .vt-ent-btn { top: 112px; }
  /* Unit-anchored floating controls clear the status zone (+60, measured). */
  .vt-ry .vt-ent-btn { top: 74px; }
  .vt-ch .vt-ent-btn { top: 82px; }
  .vt-dy .vt-ent-btn { top: 70px; }
`;
