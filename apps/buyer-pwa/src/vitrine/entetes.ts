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
import { groupFr } from '../cliente/money';
import { focusPosition, type Storefront, type VitrineTrust } from './profile';
import { chips, hero } from './render';
import { loadedEntete } from './entetes/registry';
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

// ENTETES-E0 (canon v2.3.0, founder-authorized 2026-07-30) — the Beurni Boss
// five ride after the six, in canon order. ENTETES-E: their render units are
// BUILT (this file, §6–10 below, per design/shopplus-beurni-boss); the
// explicit classique default in renderEntete now guards only future canon
// keys whose units have not landed.
export const ENTETE_KEYS = [
  'classique',
  'royale',
  'heritage',
  'chaleureux',
  'cristal',
  'dynamique',
  'masque',
  'harmattan',
  'balafon',
  'seance',
  'cauris',
] as const;
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

export interface Vals {
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
  /** ENTETES-E — the anti-orphan name HTML (tail wrapped nowrap, nbsp joint). */
  readonly tail: string;
  readonly back: boolean;
}

/**
 * The ONLY reading of the model the five headers do. Every honesty rule is
 * decided here, once, from the real fields — the contract's single COMPLET /
 * MINIMAL toggle is a demo affordance, not a data shape: a real storefront can
 * have a cover and no bio, or a bio and no history, and each fragment appears
 * on ITS OWN condition.
 */
export function vals(sf: Storefront, trust: VitrineTrust, opts: EnteteOpts): Vals {
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
    tail: nameTail(sf.name),
    back: opts.fromProduct === true,
  };
}

/**
 * ENTETES-F — the bicolore name. The name is trimmed and multi-spaces collapse
 * to one; the last WORD (space-delimited) goes in `.vt-ent-tail`, and the
 * ACCENT SEGMENT inside it (`/[^ \-]+$/` — the part after the last hyphen) is
 * `.vt-ent-acc`, which is the ONLY part the sheet makes unbreakable. That is
 * the Série 4 rule verbatim: « Dernier segment (/[^ \-]+$/, nowrap) en accent ».
 *
 * IT USED TO BE THE WHOLE TAIL, and that was wrong twice over: « Élégance-
 * Burkina » could not fit its column and rendered ON the photograph, and the
 * two-line ceiling it served came from the superseded Beurni matrix — Série 1
 * §4 states the contract's own expectation, « Attendu à 320 : Mariam /
 * Ouédraogo- / Kaboré, aucun mot coupé ». Three lines, no CUT word. So the
 * hyphen breaks, the accent word travels whole, and the `xlong` size tier that
 * once propped this up is gone.
 *
 * The joint before the tail stays `&nbsp;` up to LONG_NAME so a short name's
 * accent word can never stand alone. A single-word name IS its own tail.
 * Escaped part by part; pure and exported so the rule is executed by tests,
 * never re-derived.
 */
export function nameTail(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  const sp = name.lastIndexOf(' ');
  const head = sp === -1 ? '' : name.slice(0, sp);
  const word = sp === -1 ? name : name.slice(sp + 1);
  const m = /[^ \-]+$/.exec(word);
  const seg = m?.[0] ?? word;
  const prefix = word.slice(0, word.length - seg.length);
  const tail =
    `<span class="vt-ent-tail">${prefix === '' ? '' : `<v>${esc(prefix)}</v>`}` +
    `<span class="vt-ent-acc"><v>${esc(seg)}</v></span></span>`;
  if (head === '') return tail;
  // ≤ 14 chars: the handoff's nbsp joint — the accent word can never stand
  // alone. Past LONG_NAME the joint must stay breakable (welding the last two
  // words of a 24-char name is the overflow the two-line law forbids); the
  // tail word itself still wraps only as a whole.
  const joint = name.length > LONG_NAME ? ' ' : '&nbsp;';
  return `<v>${esc(head)}${joint}</v>${tail}`;
}

/**
 * WHICH PHOTOGRAPH THE FIVE FRAME — founder ruling 2026-07-30: « make it all be
 * like the 6 original headers ».
 *
 * The handoff's data contract calls the cover « non requis pour ces variantes »
 * and every reference mockup frames a PORTRAIT, so this file first wired the
 * five to the avatar alone. The founder uploaded a photo de couverture and it
 * appeared on none of them: the six put her cover in their photo area, these
 * five ignored it. Faithful to the spec, wrong for the person whose shop it is.
 *
 * THE RULE NOW, the same one the six follow: her COVER fills the frame when she
 * has one — with her own ENTETES-C framing — and the portrait is the fallback,
 * so a shop that has only an avatar still shows a face rather than a monogram.
 * Neither ⇒ the style's own motif, never an empty frame.
 */
export const hasPhoto = (v: Vals): boolean => v.hasCover || v.hasAvatar;
export const etatPhoto = (v: Vals): string => (hasPhoto(v) ? 'live' : 'none');
/** The frame's <img>: the cover at this style's §5 crop bias, else the portrait. */
export const framePhoto = (v: Vals, pos: string): string => (v.hasCover ? coverImg(v, pos) : avatarImg(v));

/** « {rating} · {N} avis » — the handoff's exact review chip (its « Chaînes
 *  exactes » list), NNBSP-grouped count, star drawn by the caller's style. */
export const avisChip = (v: Vals): string =>
  `<span><v>${v.rating}</v> · <v>${groupFr(v.reviewCount)}</v> ${t('vit.avis')}</span>`;

/** « {N} ventes livrées par Séra » with the count grouped the repo's byte-stable
 *  way (manual NNBSP grouping — ICU is banned; the handoff's fr-FR intent). */
export const ventesLine = (v: Vals): string =>
  `<b><v>${groupFr(v.delivN)}</v></b> ${t('vit.ventes_livrees').replace(/\s+(\S+)$/, '&nbsp;$1')}`;

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
export const verifieeBare = (): string => t('vit.verifiee').replace(/\s*·\s*$/, '');

/**
 * The two floating controls. §2.5: back only when the buyer arrived from a
 * product, and share then slides one notch. Both are ≥ 44×44 (HANDOFF §6 —
 * the visuals' 40 rounds are carried to 44, the one dimensional deviation).
 */
export function controls(v: Vals, style: string, prop: string, near: string, far: string, ink: string): string {
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

/* ════════════════════════════════════════════════════════════════════════
   ENTETES-E — the Beurni Boss five (founder handoff 2026-07-30, normative
   spec: design/shopplus-beurni-boss/reference/00-handoff-normatif.md).
   CTO adaptations, settled and journalled:
   · NO APP BAR — the mockups' hamburger/search/cart do not exist in the
     vitrine (no cart exists in Shop+ at all). The unit = HERO + TRUST STRIP,
     full-bleed like the six (ENTETES-D), hero and strip keep their handoff
     heights (hero 246/248 → 236 at 320; strip 74/72 → 72).
   · The handoff's 52px « bande de raccord » belongs to the page body — the
     vitrine page below keeps its own themed surface, as under the six.
   · The frame holds HER PORTRAIT (handoff §5/StorefrontHeaderData: avatar =
     portrait vendeur; cover « non requis pour ces variantes »), with her
     ENTETES-C framing riding inline exactly as the six do it.
   · Tagline/bio have NO slot in these fixed-height cinematic heroes (the
     handoff's Part A places none); they keep rendering in the six.
   · FONTS (payload budget, entetes.coverage.json): Barlow Condensed 800 and
     Sora 800 ship subset; Séance's « Archivo Black » rides the shipped
     Archivo variable at 900 (its black cut); Cormorant Garamond → Georgia,
     Caveat → cursive stack, Fraunces → Georgia italic, Inter → Instrument
     Sans. Each stack keeps the handoff's own fallback order.
   · The trust strip's third label is « Les meilleurs prix garantis »
     VERBATIM (founder override 2026-07-30) — vit.cell_prix, unchanged.
   ═══════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════
   SÉRIE 4 — styles 21–25 (ENTETES-F)

   SOURCE OF TRUTH: « En-tetes Boutique - Serie 4 (standalone).html » — the
   pixel contract, one relevé per style — with « Entetes Serie 4 - HANDOFF.md »
   for the transverse rules. These five translate the SAME five Beurni Boss
   planches that ENTETES-E built from a normative markdown; the contract is the
   authority now and supersedes that reading everywhere they differ.

   THE FIVE KEYS ARE UNCHANGED ON PURPOSE. `masque · harmattan · balafon ·
   seance · cauris` stay the canon identifiers so no live storefront can land
   on a value the service would refuse (the `unknown_header_style` refusal the
   founder hit on his own phone). Only what is DRAWN and what the picker CALLS
   them changes here. Renaming the keys to `prestige · terracotta · etendard ·
   douceur · tissage` needs a contracts bump plus a service deploy and is owed
   follow-up, journalled.

   TWO CONTRACT ELEMENTS ARE DELIBERATELY NOT BUILT — both founder-standing law:

   1. NO Shop+ APP BAR. Séries 3/4/5 each open with a 46px bar (hamburger ·
      wordmark · search · bag badge). The founder ruled « no app bar » during
      ENTETES-E and a designer document does not overturn a founder ruling; a
      hamburger that opens nothing is a dead control and fails the 5-second
      test. The unit still starts at the hero, as the other ten do.
   2. NO PRODUCT SECTION. The contract's « amorce de la sélection produits »
      carries invented articles at invented prices (« 28 000 / 15 000 / 12 000
      FCFA », « données catalogue du visuel »). Fabricated merchandise in a real
      seller's shop is a fake count — the same law that deleted « +1,2k clientes
      satisfaites ». The contract contradicts itself here: its own rule says
      « aucun autre contenu inventé ». Her REAL listings already render directly
      below this header, so cutting it costs nothing and the block is a clean
      separable sibling in the contract markup.

   WHAT THE FRAME HOLDS — founder ruling « make it all be like the 6 original
   headers »: her cover at the style's crop bias, portrait as the fallback,
   the style's own motif only when she has neither. `framePhoto` is that rule.

   SÉRIE 4's ONE STRUCTURAL DEPARTURE from Série 1: the verification seal is a
   DEDICATED « Vendeuse vérifiée » LINE, never a glyph welded to the name
   (HANDOFF §Casse & bicolore). The name's last segment carries the accent
   colour instead — which is exactly what `nameTail` already emits.
   ═══════════════════════════════════════════════════════════════════════ */

/* ------------------------------------------------ 21 · PRESTIGE (masque) -- */

function prestige(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="pr-cell"><span class="pr-cell-i">${icon}</span><span class="pr-cell-t"><span class="pr-cell-l">${label}</span><span class="pr-cell-s">${sub}</span></span></div>`;
  const [nA = '', ...nB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-pr" data-role="vitrine-hero">',
    '<div class="pr-hero">',
    '<div class="pr-scene">',
    // Relevé « Photo » — panneau 186 à droite, clip-path diagonal, la couche or
    // dessous fait le liseré 3px : deux calques, jamais une bordure.
    '<div class="pr-panneau">',
    '<span class="pr-or" aria-hidden="true"></span>',
    `<div class="pr-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '62% 24%')
      : `<div class="pr-motif"><span class="pr-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    '<div class="pr-col" data-role="vitrine-identity">',
    // Relevé « Type » — crest « B » or filaire 46×30 en tête.
    '<svg class="pr-crest" aria-hidden="true" viewBox="0 0 46 30" width="46" height="30"><path d="M23 4c-3 0-5 2-5 5 0 4 5 8 5 8s5-4 5-8c0-3-2-5-5-5z" fill="none" stroke="#D9A441" stroke-width="1.6"/><path d="M6 15c4-1 6-4 6-8M40 15c-4-1-6-4-6-8M6 15c4 1 6 4 6 8M40 15c-4 1-6 4-6 8" fill="none" stroke="#D9A441" stroke-width="1.2"/></svg>',
    `<div class="pr-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    '<span class="pr-dots" aria-hidden="true"><i></i><i></i></span>',
    `<div class="pr-bienv">${t('vit.bienvenue')}<svg class="pr-eclats" aria-hidden="true" viewBox="0 0 16 14" width="16" height="14"><path d="M2 12L8 2M7 13l6-9M12 12l3-4" stroke="#D9A441" stroke-width="2" stroke-linecap="round" fill="none"/></svg></div>`,
    // §Casse — le sceau est une LIGNE dédiée sur ces visuels, jamais soudé au nom.
    `<div class="pr-verif">${iconCheckEnt(15, '#D9A441', 2)}<span>${verifieeBare()}</span></div>`,
    `<div class="pr-zone">${iconPinSolid(14, '#D9A441', '#141210')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<div class="pr-proof">',
          `<span class="pr-pastille" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="pr-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="pr-stars" data-role="chip-avis">${iconStarEnt(10, '#D9A441')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    v.nouvelle
      ? `<div class="pr-nouv-wrap"><span class="pr-nouv" data-role="chip-nouvelle"><svg class="pr-nouv-s" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="#17130E"><path d="M12 2l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9L8.4 13l.7-4L6.2 6.2l4-.6z"/><circle cx="12" cy="18.5" r="1.4"/></svg><span class="pr-nouv-t"><v>${nA}</v><br><v>${nB.join(' ')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // Relevé « Bandes » — bande tissée h14 (noir + croisillons or) sous le héros.
    '<div class="pr-bande" aria-hidden="true"></div>',
    '<div class="pr-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#D9A441', 1.9), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#D9A441', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#D9A441', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'pr', 'right', '20px', '72px', '#17130E'),
    '</div>',
  ].join('');
}

/* -------------------------------------------- 22 · TERRACOTTA (harmattan) -- */

function terracotta(v: Vals): string {
  const cell = (icon: string, label: string, sub: string, mod: string): string =>
    `<div class="te-cell"><span class="te-cell-i te-cell-i--${mod}">${icon}</span><span class="te-cell-t"><span class="te-cell-l">${label}</span><span class="te-cell-s te-cell-s--${mod}">${sub}</span></span></div>`;
  const [nA = '', ...nB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-te" data-role="vitrine-hero">',
    '<div class="te-hero">',
    '<div class="te-scene">',
    // Relevé « Décor » — patch vert 216×222 rotate(−1°) DERRIÈRE le titre, deux
    // blocs de glyphes crème, couronne doodle or : décor pur, jamais tappable.
    '<span class="te-patch" aria-hidden="true"></span>',
    '<span class="te-glyphes te-glyphes1" aria-hidden="true"></span>',
    '<span class="te-glyphes te-glyphes2" aria-hidden="true"></span>',
    '<svg class="te-couronne" aria-hidden="true" viewBox="0 0 34 22" width="34" height="22"><path d="M4 18l2-9 5 5 6-11 6 11 5-5 2 9z" fill="none" stroke="#D9A441" stroke-width="2" stroke-linejoin="round"/></svg>',
    `<div class="te-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '55% 30%')
      : `<div class="te-motif"><span class="te-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="te-col" data-role="vitrine-identity">',
    `<div class="te-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    '<span class="te-brosse" aria-hidden="true"></span>',
    `<div class="te-bienv-wrap"><span class="te-bienv"><span class="te-couture" aria-hidden="true"></span><span class="te-accroc" aria-hidden="true"></span><span class="te-bienv-t">${t('vit.bienvenue')}</span></span></div>`,
    `<div class="te-verif">${iconShieldEnt(15, '#D9A441', 2)}<span>${verifieeBare()}</span>${iconSparkle(12, '#D9A441')}</div>`,
    `<div class="te-zone">${iconPinSolid(14, '#F5EFE4', '#A65A33')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<div class="te-proof">',
          `<span class="te-chip" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="te-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="te-stars" data-role="chip-avis">${iconStarEnt(10, '#FBD98A')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    v.nouvelle
      ? `<div class="te-nouv-wrap"><span class="te-nouv" data-role="chip-nouvelle"><span class="te-nouv-r" aria-hidden="true"></span><svg class="te-nouv-c" aria-hidden="true" viewBox="0 0 34 22" width="16" height="11"><path d="M4 18l2-9 5 5 6-11 6 11 5-5 2 9z" fill="none" stroke="#F2E9D8" stroke-width="2.4" stroke-linejoin="round"/></svg><span class="te-nouv-t"><v>${nA}</v><br><v>${nB.join(' ')}</v></span><span class="te-nouv-b" aria-hidden="true"></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // Relevé « Déchirure » — bande déchirée h14, clip-path dentelé crème.
    '<div class="te-dechirure" aria-hidden="true"></div>',
    '<div class="te-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#F2E9D8', 1.8), t('vit.chip_sera'), t('vit.cell_sera_sub'), 'vert'),
    cell(iconLockEnt(15, '#F5EFE4', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub'), 'rouille'),
    cell(iconTagEnt(15, '#F2E9D8', 2), t('vit.cell_prix'), t('vit.cell_prix_sub'), 'vert'),
    '</div>',
    controls(v, 'te', 'right', '20px', '72px', '#7E3F20'),
    '</div>',
  ].join('');
}

/* ---------------------------------------------- 23 · ÉTENDARD (balafon) -- */

function etendard(v: Vals): string {
  const cell = (icon: string, label: string, sub: string, mod: string): string =>
    `<div class="et-cell"><span class="et-cell-i et-cell-i--${mod}">${icon}</span><span class="et-cell-t"><span class="et-cell-l">${label}</span><span class="et-cell-s et-cell-s--${mod}">${sub}</span></span></div>`;
  return [
    '<div class="vt-ent vt-et" data-role="vitrine-hero">',
    '<div class="et-hero">',
    '<div class="et-scene">',
    // Relevé « Décor » — blobs verts, barre rouge, damier, tours abstraites,
    // serpentin. Écart du contrat lui-même : le livreur Séra et le paysage
    // photographique sont OMIS (ce sont des éléments photo, pas du CSS).
    '<span class="et-blob et-blob1" aria-hidden="true"></span>',
    '<span class="et-blob et-blob2" aria-hidden="true"></span>',
    '<span class="et-barre" aria-hidden="true"></span>',
    '<span class="et-damier" aria-hidden="true"></span>',
    '<svg class="et-tours" aria-hidden="true" viewBox="0 0 96 54" width="96" height="54"><path d="M4 54V26h11v28M19 54V14h9v40M32 54V32h12v22M48 54V20h8v34M60 54V38h10v16M74 54V28h9v26" fill="#121212" opacity=".36"/></svg>',
    '<svg class="et-serpentin" aria-hidden="true" viewBox="0 0 70 20" width="70" height="20"><path d="M2 12c8-12 16 8 24-2s16 10 24 0" fill="none" stroke="#C1272D" stroke-width="2.6" stroke-linecap="round"/></svg>',
    `<div class="et-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '55% 22%')
      : `<div class="et-motif"><span class="et-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="et-col" data-role="vitrine-identity">',
    '<svg class="et-couronne" aria-hidden="true" viewBox="0 0 38 26" width="38" height="26"><path d="M5 21l2-11 6 6 5-13 5 13 6-6 2 11z" fill="none" stroke="#121212" stroke-width="2.4" stroke-linejoin="round"/></svg>',
    // Relevé « Type » — le nom repose sur une éclaboussure noire (clip-path).
    '<div class="et-nameblock">',
    '<span class="et-splash" aria-hidden="true"></span>',
    `<div class="et-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    '</div>',
    `<div class="et-bienv-wrap"><span class="et-bienv"><span class="et-bienv-t">${t('vit.bienvenue')}</span></span></div>`,
    // Relevé « Carte info » — carte noire déchirée : coche, épingle, filet, preuve.
    '<div class="et-carte">',
    `<div class="et-verif">${iconCheckEnt(17, '#2E9C52', 2.2)}<span>${verifieeBare()}</span></div>`,
    `<div class="et-zone">${iconPinSolid(14, '#D9A31C', '#121212')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<span class="et-filet" aria-hidden="true"></span>',
          '<div class="et-proof">',
          `<span class="et-pilule" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="et-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="et-stars" data-role="chip-avis">${iconStarEnt(10, '#D9A31C')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    '</div>',
    v.nouvelle
      ? `<div class="et-nouv-wrap"><span class="et-nouv" data-role="chip-nouvelle"><span class="et-nouv-r" aria-hidden="true"></span><span class="et-nouv-t"><v>${t('vit.nouvelle_vendeuse')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    '<div class="et-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#FFFFFF', 1.9), t('vit.chip_sera'), t('vit.cell_sera_sub'), 'vert'),
    cell(iconLockEnt(15, '#121212', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub'), 'jaune'),
    cell(iconTagEnt(15, '#FFFFFF', 2), t('vit.cell_prix'), t('vit.cell_prix_sub'), 'rouge'),
    '</div>',
    controls(v, 'et', 'right', '20px', '72px', '#121212'),
    '</div>',
  ].join('');
}

/* ------------------------------------------------ 24 · DOUCEUR (seance) -- */

function douceur(v: Vals): string {
  const cell = (icon: string, label: string, sub: string, mod: string): string =>
    `<div class="do-cell"><span class="do-cell-i do-cell-i--${mod}">${icon}</span><span class="do-cell-t"><span class="do-cell-l">${label}</span><span class="do-cell-s">${sub}</span></span></div>`;
  const [nA = '', ...nB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-do" data-role="vitrine-hero">',
    '<div class="do-hero">',
    '<div class="do-scene">',
    // Relevé « Décor » — bande textile gauche 44 à bord déchiré, blob sauge
    // derrière la photo, anneau filaire, fleurs en trait or.
    '<span class="do-textile" aria-hidden="true"></span>',
    '<span class="do-blob" aria-hidden="true"></span>',
    '<span class="do-anneau" aria-hidden="true"></span>',
    '<svg class="do-fleurs" aria-hidden="true" viewBox="0 0 40 46" width="40" height="46"><path d="M20 44V18M20 18c-6 0-9-5-6-9 4-2 8 2 6 9zM20 18c6 0 9-5 6-9-4-2-8 2-6 9zM20 30c-5-1-8-5-6-8 3-2 7 2 6 8z" fill="none" stroke="#C9A45C" stroke-width="1.4" stroke-linecap="round"/></svg>',
    `<div class="do-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '60% 30%')
      : `<div class="do-motif"><span class="do-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="do-col" data-role="vitrine-identity">',
    // Relevé « Type » — monogramme double cercle or 56 à « {initiale}{initiale} ».
    `<span class="do-sceau-mono" aria-hidden="true"><span class="do-sceau-i">${v.mono}${v.mono}</span></span>`,
    `<div class="do-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="do-bienv"><span class="do-bienv-t">${t('vit.bienvenue')}</span><span class="do-souligne" aria-hidden="true"></span></div>`,
    `<div class="do-verif"><span class="do-verif-r">${iconCheckEnt(11, '#FFFFFF', 3)}</span><span>${verifieeBare()}</span></div>`,
    `<div class="do-zone">${iconPinSolid(14, '#C9A45C', '#F7F0E6')}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<div class="do-proof">',
          `<span class="do-chip" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="do-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="do-stars" data-role="chip-avis">${iconStarEnt(10, '#C9A45C')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    v.nouvelle
      ? `<div class="do-nouv-wrap"><span class="do-nouv" data-role="chip-nouvelle"><span class="do-feston" aria-hidden="true"></span><span class="do-nouv-t"><span class="do-nouv-a"><v>${nA}</v></span><span class="do-nouv-b"><v>${nB.join(' ')}</v></span></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    '<div class="do-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#FFFFFF', 1.8), t('vit.chip_sera'), t('vit.cell_sera_sub'), 'sauge'),
    cell(iconLockEnt(15, '#FFFFFF', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub'), 'blush'),
    cell(iconTagEnt(15, '#FFFFFF', 2), t('vit.cell_prix'), t('vit.cell_prix_sub'), 'or'),
    '</div>',
    controls(v, 'do', 'right', '20px', '72px', '#6B7455'),
    '</div>',
  ].join('');
}

/* ------------------------------------------------ 25 · TISSAGE (cauris) -- */

function tissage(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ti-cell"><span class="ti-cell-i">${icon}<span class="ti-cell-c" aria-hidden="true">${iconCheckEnt(9, '#17351F', 3.4)}</span></span><span class="ti-cell-t"><span class="ti-cell-l">${label}</span><span class="ti-cell-s">${sub}</span></span></div>`;
  const [nA = '', ...nB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-ti" data-role="vitrine-hero">',
    '<div class="ti-hero">',
    '<div class="ti-scene">',
    // Relevé « Héros fendu » — liseré kente vertical 32 à gauche (casiers 14).
    '<span class="ti-lisere" aria-hidden="true"></span>',
    `<div class="ti-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '52% 28%')
      : `<div class="ti-motif"><span class="ti-mono">${v.mono}</span></div>`,
    '</div>',
    '<div class="ti-col" data-role="vitrine-identity">',
    '<svg class="ti-couronne" aria-hidden="true" viewBox="0 0 40 24" width="40" height="24"><path d="M5 20l2-10 6 5 7-12 7 12 6-5 2 10z" fill="none" stroke="#D9A441" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="4" r="1.8" fill="#D9A441"/></svg>',
    `<div class="ti-name${v.longName ? ' vt-ent-long' : ''}">${v.tail}</div>`,
    `<div class="ti-bienv"><span class="ti-bienv-t">${t('vit.bienvenue')}</span><span class="ti-brosse" aria-hidden="true"></span></div>`,
    // Relevé « Carte info » — carte #0F2717 r16 à filet or : vérifié, zone, preuve.
    '<div class="ti-carte">',
    `<div class="ti-verif">${iconShieldEnt(15, '#D9A441', 2)}<span>${verifieeBare()}</span><span class="ti-coche" aria-hidden="true">${iconCheckEnt(11, '#F1E9D6', 3.2)}</span></div>`,
    `<div class="ti-zone">${iconPinEnt(13, '#D9A441', 2.2)}<span><v>${v.zone}</v></span></div>`,
    v.showProof
      ? [
          '<div class="ti-proof">',
          `<span class="ti-rond" data-role="reputation-count"><v>${groupFr(v.delivN)}</v></span>`,
          '<span class="ti-proof-t">',
          `<span data-role="reputation">${ventesLine(v)}</span>`,
          v.showStars
            ? `<span class="ti-stars" data-role="chip-avis">${iconStarEnt(10, '#D9A441')}${avisChip(v)}</span>`
            : '',
          '</span>',
          '</div>',
        ].join('')
      : '',
    '</div>',
    v.nouvelle
      ? `<div class="ti-nouv-wrap"><span class="ti-nouv" data-role="chip-nouvelle"><span class="ti-nouv-r" aria-hidden="true"></span><span class="ti-nouv-t"><span class="ti-nouv-a"><v>${nA}</v></span><span class="ti-nouv-b"><v>${nB.join(' ')}</v></span></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // Relevé — reprise horizontale du tissage h12 sous le héros.
    '<div class="ti-bande" aria-hidden="true"></div>',
    '<div class="ti-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(17, '#D9A441', 1.8), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#D9A441', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#D9A441', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'ti', 'right', '20px', '72px', '#17351F'),
    '</div>',
  ].join('');
}

/* -------------------------------------------------------------- dispatch -- */

/**
 * ONE header unit. `'classique'` delegates to the existing hero + trust chips
 * so its bytes are unchanged (the empty screen renders the hero alone, exactly
 * as it does today); each of the ten renders its own self-contained block.
 * ENTETES-E — the Beurni Boss five have their real units now (the E0 fallback
 * for them is retired); the explicit default REMAINS for any future canon key
 * whose unit has not landed: the switch must never fall through and hand
 * `undefined` to the page.
 */
export function renderEntete(
  key: EnteteKey,
  sf: Storefront,
  trust: VitrineTrust,
  opts: EnteteOpts = {},
  floatBar = '',
): string {
  // ENTETES-G — a lazily-loaded style wins if its chunk has arrived. It cannot
  // be fetched from here: this function is synchronous by contract, and starting
  // async work it cannot await would render the wrong header and then swap it
  // under the buyer. `flows.ts` awaits `loadEntete` before any header-drawing
  // screen, so by the time we are here the unit is present — or the fetch
  // failed, and the ENTETES-E0 default below is the honest answer.
  const lazy = loadedEntete(key);
  if (lazy !== undefined) return lazy.render(vals(sf, trust, opts));
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
    // ENTETES-F — the Série 4 contract units. The KEYS are the canon ones the
    // service already accepts and a live storefront may already carry; the
    // DRAWING is the pixel contract's. Renaming the keys to `prestige` … needs
    // a contracts bump + a service deploy, and is owed follow-up.
    case 'masque':
      return prestige(v);
    case 'harmattan':
      return terracotta(v);
    case 'balafon':
      return etendard(v);
    case 'seance':
      return douceur(v);
    case 'cauris':
      return tissage(v);
    default:
      // A canon key whose unit is not built yet renders the shipped default
      // header rather than crashing or emitting nothing (the ENTETES-E0 law).
      return renderEntete('classique', sf, trust, opts, floatBar);
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
  /* Héritage's real pull is 70 (the 60px padding + the strip's own retired
     10px top margin). height 298 compensates 60 ON PURPOSE: the VISIBLE photo
     band below the status zone stays the contract's 238px — the flow below
     rides 10px higher, verified collision-free (arch overlap unchanged, 64px). */
  .vt-he .he-photo { margin: -60px 0 0; height: 298px; border-radius: 0; }
  .vt-he .he-chip-v { top: 70px; left: 14px; }
  .vt-he .he-chip-n { top: 70px; right: 14px; }
  .vt-he .vt-ent-btn { top: 112px; }
  /* Unit-anchored floating controls clear the status zone (+60, measured). */
  .vt-ry .vt-ent-btn { top: 74px; }
  .vt-ch .vt-ent-btn { top: 82px; }
  .vt-dy .vt-ent-btn { top: 70px; }

  /* ═══════════════ ENTETES-F · the Série 4 five ═══════════════
     Contract « En-tetes Boutique - Serie 4 » shared rules. The anti-orphan
     tail (nowrap, nbsp joint — the deterministic discipline this repo uses
     instead of soft wrapping heuristics) now also carries the contract's
     BICOLORE: the last segment takes each style's accent. Decorative layers
     never intercept taps; hero + trust strip full-bleed with NO app bar and
     NO product amorce (both founder-standing law — see the unit comments).
     Each style is its own scoped block below; z-order everywhere: decor 0 ·
     photo · text (DOM order carries it), controls 6. */
  /* ENTETES-F — the contract's bicolore rule is « dernier segment
     (/[^ \-]+$/, nowrap) » : the ACCENT SEGMENT is what may never break, not
     the whole hyphenated word. The ENTETES-E sheet made the entire tail
     unbreakable, so « Élégance-Burkina » could not fit its column and
     overflowed ONTO the photograph (caught by the collision guard, not by the
     DOM). The hyphen breaks now; « Burkina » still travels whole and keeps its
     accent colour. */
  .vt-ent .vt-ent-tail { display: inline; }
  .vt-ent .vt-ent-acc { display: inline-block; white-space: nowrap; }
  .vt-ent [aria-hidden="true"] { pointer-events: none; }

  /* ══════════════════════ 21 · PRESTIGE ══════════════════════
     Relevé — noir #141210 (cercles #17130E) · ivoire #F2E9D8 / crème #F4EDE0
     · or #D9A441 (.txg #EFCB78/#D9A441/#B37F24/#E7C069) · textes #E9E0CE /
     #8C7B68 · séparateurs #DBD0BC. Photo : panneau 186 à droite, clip-path
     polygon(15% 0,100% 0,100% 100%,0 92%), liseré or 3px = couche or dessous. */
  .vt-pr {
    --pr-noir: #141210; --pr-encre: #17130E;
    --pr-ivoire: #F2E9D8; --pr-creme: #F4EDE0;
    --pr-or: #D9A441; --pr-or-fonce: #B37F24; --pr-or-clair: #EFCB78; --pr-or-2: #E7C069;
    --pr-txt: #E9E0CE; --pr-txt2: #8C7B68; --pr-sep: #DBD0BC;
    background: var(--pr-noir);
  }
  .vt-pr .pr-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background-color: var(--pr-noir);
    background-image:
      radial-gradient(40% 30% at 20% 20%, rgba(255,255,255,.045) 0%, transparent 70%),
      radial-gradient(36% 26% at 30% 80%, rgba(217,169,65,.07) 0%, transparent 70%);
  }
  .vt-pr .pr-scene { position: relative; min-height: 266px; }
  .vt-pr .pr-panneau { position: absolute; top: -74px; right: -14px; bottom: -18px; width: 186px; }
  .vt-pr .pr-or { position: absolute; inset: 0; background: var(--pr-or); clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 92%); }
  .vt-pr .pr-frame { position: absolute; inset: 3px 3px 7px 3px; clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 92%); overflow: hidden; }
  .vt-pr .pr-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--pr-encre);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,169,65,.3) 0 2px, transparent 2px 11px),
      repeating-linear-gradient(-45deg, rgba(242,233,216,.14) 0 2px, transparent 2px 11px);
  }
  .vt-pr .pr-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 54px; color: rgba(217,169,65,.55); margin-left: 20px; }
  /* Chaque colonne DÉGAGE son cadre de 12px (elle le touchait au pixel près :
     les bords arrondis et déchirés des cartes info disparaissaient, et la
     tolérance de 2px du garde-fou était tout ce qui restait). */
  /* Le portrait de secours garde le biais haut du contrat (§5 : 18–30 %),
     donc aucune tête n'est coupée quand elle n'a pas de couverture. */
  .vt-pr .pr-frame .vt-avatar-img, .vt-te .te-frame .vt-avatar-img,
  .vt-et .et-frame .vt-avatar-img, .vt-do .do-frame .vt-avatar-img,
  .vt-ti .ti-frame .vt-avatar-img { object-position: 50% 24%; }
  .vt-pr .pr-col { position: relative; width: calc(100% - 184px); }
  .vt-pr .pr-crest { display: block; }
  .vt-pr .pr-name {
    margin-top: 8px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.06; letter-spacing: .005em;
    color: var(--pr-ivoire); overflow-wrap: break-word;
  }
  /* Relevé §Casse — > 14 caractères : 24 px FIXE (une seule marche sur ces cinq). */
  .vt-pr .pr-name.vt-ent-long { font-size: 24px; }
  /* Le dernier segment en or brossé : dégradé de texte, fallback plein or. */
  .vt-pr .pr-name .vt-ent-acc { color: var(--pr-or); }
  @supports (background-clip: text) or (-webkit-background-clip: text) {
    .vt-pr .pr-name .vt-ent-acc {
      background-image: linear-gradient(96deg, var(--pr-or-clair) 0%, var(--pr-or) 38%, var(--pr-or-fonce) 68%, var(--pr-or-2) 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
    }
  }
  .vt-pr .pr-dots { display: flex; gap: 4px; margin-top: 6px; }
  .vt-pr .pr-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--pr-or); }
  .vt-pr .pr-bienv { margin-top: 9px; display: flex; align-items: center; gap: 8px; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 19px; line-height: 1.2; color: var(--pr-ivoire); }
  .vt-pr .pr-eclats { flex: none; }
  .vt-pr .pr-verif { margin-top: 10px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: #FFFFFF; }
  .vt-pr .pr-zone { margin-top: 6px; display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--pr-txt); }
  .vt-pr .pr-zone svg { flex: none; margin-top: 1px; }
  .vt-pr .pr-proof { margin-top: 12px; display: flex; align-items: center; gap: 9px; }
  .vt-pr .pr-pastille {
    width: 44px; height: 44px; flex: none; border-radius: 50%; background: var(--pr-or);
    box-shadow: 0 0 0 1.5px var(--pr-noir), 0 0 0 3px rgba(217,169,65,.5);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 15px; color: var(--pr-encre);
  }
  .vt-pr .pr-proof-t { font-size: 11px; line-height: 1.35; color: var(--pr-txt); }
  .vt-pr .pr-proof-t b { color: #FFFFFF; font-weight: 700; }
  .vt-pr .pr-stars { display: flex; align-items: center; gap: 3px; margin-top: 2px; color: var(--pr-or); font-weight: 600; font-size: 10.5px; }
  .vt-pr .pr-nouv-wrap { margin-top: 14px; }
  .vt-pr .pr-nouv {
    position: relative; display: inline-flex; align-items: center; gap: 9px;
    padding: 10px 14px; background: var(--pr-or); border-radius: 4px; transform: rotate(-3deg);
    box-shadow: 0 10px 22px -10px rgba(217,169,65,.7), inset 0 0 0 1.5px rgba(23,19,14,.25);
  }
  .vt-pr .pr-nouv-t { font-weight: 700; font-size: 13px; line-height: 1.2; color: var(--pr-encre); }
  .vt-pr .pr-bande {
    height: 14px; background-color: var(--pr-encre);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,169,65,.7) 0 2px, transparent 2px 11px),
      repeating-linear-gradient(-45deg, rgba(217,169,65,.7) 0 2px, transparent 2px 11px);
  }
  .vt-pr .pr-trust { background: var(--pr-creme); padding: 13px 10px; display: grid; grid-template-columns: 1.12fr 1fr 1.06fr; }
  .vt-pr .pr-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-pr .pr-cell + .pr-cell { border-left: 1px solid var(--pr-sep); }
  .vt-pr .pr-cell-i { width: 38px; height: 38px; flex: none; border-radius: 50%; background: var(--pr-encre); display: flex; align-items: center; justify-content: center; }
  .vt-pr .pr-cell-l { display: block; font-size: 9.5px; font-weight: 700; line-height: 1.3; color: var(--pr-encre); }
  .vt-pr .pr-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; color: var(--pr-txt2); }
  .vt-pr .pr-btn { background: var(--pr-or); }
  .vt-pr .vt-ent-btn { top: 70px; }

  /* ══════════════════════ 22 · TERRACOTTA ══════════════════════
     Relevé — terre cuite #A65A33 (radials #B96B40/#7E3F20) · patch vert
     #46573A→#35472B, chips #3E4E33 · cuir #B97F46→#96602F · or #D9A441,
     étoile #FBD98A · crème #F5EFE4 / #EFE6D4 · rouille #A24E22. Photo pleine
     colonne droite 47 %. Écusson cuir cousu = « Bienvenue ». */
  .vt-te {
    --te-terre: #A65A33; --te-terre-c: #B96B40; --te-terre-f: #7E3F20;
    --te-vert-a: #46573A; --te-vert-b: #35472B; --te-chip: #3E4E33;
    --te-cuir-a: #B97F46; --te-cuir-b: #96602F;
    --te-or: #D9A441; --te-etoile: #FBD98A;
    --te-creme: #F5EFE4; --te-creme2: #EFE6D4; --te-ivoire: #F2E9D8;
    --te-rouille: #A24E22; --te-txt: #FFF6E8;
    background: var(--te-terre);
  }
  .vt-te .te-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 20px;
    background-color: var(--te-terre);
    background-image:
      radial-gradient(60% 46% at 88% 10%, var(--te-terre-c) 0%, rgba(185,107,64,0) 70%),
      radial-gradient(50% 40% at 6% 96%, var(--te-terre-f) 0%, rgba(126,63,32,0) 70%);
  }
  .vt-te .te-scene { position: relative; min-height: 250px; padding-top: 34px; }
  .vt-te .te-frame { position: absolute; top: -74px; right: -14px; bottom: -20px; width: 47%; overflow: hidden; }
  .vt-te .te-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: #7A4526;
    background-image:
      repeating-linear-gradient(90deg, rgba(240,231,210,.16) 0 3px, transparent 3px 12px),
      repeating-linear-gradient(0deg, rgba(30,20,12,.22) 0 2px, transparent 2px 14px);
  }
  .vt-te .te-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 52px; color: rgba(245,239,228,.6); }
  .vt-te .te-patch { position: absolute; left: -26px; top: 18px; width: 216px; height: 222px; background: radial-gradient(120% 100% at 30% 20%, var(--te-vert-a) 0%, var(--te-vert-b) 70%); opacity: .94; border-radius: 6px; transform: rotate(-1deg); }
  .vt-te .te-glyphes {
    position: absolute;
    background-image: radial-gradient(circle 1.6px at 4px 4px, rgba(240,231,210,.5) 96%, transparent);
    background-size: 10px 9px;
  }
  .vt-te .te-glyphes1 { left: 118px; top: 4px; width: 54px; height: 27px; opacity: .5; }
  .vt-te .te-glyphes2 { left: 4px; bottom: 62px; width: 44px; height: 27px; opacity: .42; }
  .vt-te .te-couronne { position: absolute; left: 4px; top: 0; }
  .vt-te .te-col { position: relative; width: calc(100% - 154px); }
  .vt-te .te-name {
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.06; color: var(--te-ivoire); overflow-wrap: break-word;
  }
  .vt-te .te-name.vt-ent-long { font-size: 24px; }
  /* Relevé §Type — le dernier segment passe en Bricolage 800 ITALIQUE or. */
  .vt-te .te-name .vt-ent-acc { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic; color: var(--te-or); }
  @supports (background-clip: text) or (-webkit-background-clip: text) {
    .vt-te .te-name .vt-ent-acc {
      background-image: linear-gradient(96deg, #EFCB78 0%, var(--te-or) 38%, #B37F24 68%, #E7C069 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
    }
  }
  .vt-te .te-brosse { display: block; margin-top: 5px; width: 64px; height: 5px; border-radius: 3px; background: #5E7048; transform: rotate(-2deg); }
  .vt-te .te-bienv-wrap { margin-top: 12px; }
  .vt-te .te-bienv {
    position: relative; display: inline-flex; padding: 9px 16px 10px; border-radius: 10px;
    background: linear-gradient(140deg, var(--te-cuir-a), var(--te-cuir-b));
    box-shadow: 0 8px 18px -8px rgba(60,35,15,.7); transform: rotate(-1.5deg);
  }
  .vt-te .te-couture { position: absolute; inset: 3px; border-radius: 7px; border: 1.5px dashed rgba(58,36,16,.5); }
  .vt-te .te-accroc { position: absolute; left: -5px; top: 50%; transform: translateY(-50%); width: 8px; height: 22px; background: var(--te-cuir-b); clip-path: polygon(100% 0, 0 20%, 100% 40%, 0 60%, 100% 80%, 0 100%); }
  .vt-te .te-bienv-t { position: relative; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 17px; line-height: 1.2; color: #4A2A10; }
  .vt-te .te-verif { margin-top: 12px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--te-txt); }
  .vt-te .te-zone { margin-top: 6px; display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--te-txt); }
  .vt-te .te-zone svg { flex: none; margin-top: 1px; }
  .vt-te .te-proof { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
  .vt-te .te-chip { flex: none; display: inline-flex; align-items: center; padding: 8px 12px; border-radius: 10px; background: var(--te-chip); font-weight: 800; font-size: 15px; color: var(--te-ivoire); }
  .vt-te .te-proof-t { font-size: 10.5px; line-height: 1.35; font-weight: 600; color: var(--te-txt); }
  .vt-te .te-stars { display: flex; align-items: center; gap: 3px; margin-top: 1px; color: var(--te-etoile); }
  .vt-te .te-nouv-wrap { margin-top: 14px; }
  .vt-te .te-nouv {
    position: relative; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    width: 96px; height: 96px; border-radius: 50%; background: var(--te-chip);
    box-shadow: 0 12px 26px -12px rgba(20,30,12,.8);
  }
  .vt-te .te-nouv-r { position: absolute; inset: 5px; border-radius: 50%; border: 1.5px dashed rgba(242,233,216,.55); }
  .vt-te .te-nouv-t { font-size: 12px; font-weight: 700; line-height: 1.15; text-align: center; color: var(--te-txt); }
  .vt-te .te-nouv-b { width: 26px; height: 2px; background: var(--te-or); }
  .vt-te .te-dechirure { height: 14px; background: var(--te-creme2); clip-path: polygon(0 68%, 3% 22%, 8% 74%, 13% 26%, 18% 80%, 23% 20%, 28% 66%, 33% 14%, 38% 74%, 43% 30%, 48% 84%, 53% 22%, 58% 64%, 63% 12%, 68% 72%, 73% 28%, 78% 80%, 83% 24%, 88% 66%, 93% 14%, 100% 58%, 100% 100%, 0 100%); }
  .vt-te .te-trust {
    background-color: var(--te-creme2);
    background-image: radial-gradient(circle at 6% 40%, rgba(160,120,80,.14) 1.4px, transparent 1.6px);
    background-size: 11px 11px; padding: 12px 10px; display: grid; grid-template-columns: 1.14fr 1fr 1.04fr; margin-top: -1px;
  }
  .vt-te .te-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-te .te-cell + .te-cell { border-left: 1.5px solid var(--te-terre); }
  .vt-te .te-cell-i { width: 38px; height: 38px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .vt-te .te-cell-i--vert { background: var(--te-chip); }
  .vt-te .te-cell-i--rouille { background: var(--te-rouille); }
  .vt-te .te-cell-l { display: block; font-size: 9.5px; font-weight: 700; line-height: 1.3; color: #2E2A20; }
  .vt-te .te-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; }
  .vt-te .te-cell-s--vert { color: #7C6A50; }
  .vt-te .te-cell-s--rouille { color: var(--te-rouille); }
  .vt-te .te-btn { background: var(--te-creme); }
  .vt-te .vt-ent-btn { top: 70px; }

  /* ══════════════════════ 23 · ÉTENDARD ══════════════════════
     Relevé — jaune d'or #D9A31C→#C89117 (radial #E5B322) · verts #1F7A3D /
     #2E9C52 · rouge #C1272D · noir #121212. Nom Bricolage 800 italique sur
     éclaboussure noire ; carte info noire déchirée ; rangée noire.
     ÉCART DU CONTRAT LUI-MÊME : livreur Séra et paysage photo omis. */
  .vt-et {
    --et-jaune: #D9A31C; --et-jaune-b: #C89117; --et-jaune-c: #E5B322;
    --et-vert: #1F7A3D; --et-vert-c: #2E9C52;
    --et-rouge: #C1272D; --et-rouge-c: #E85055;
    --et-noir: #121212;
    background: var(--et-jaune);
  }
  .vt-et .et-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background-color: var(--et-jaune);
    background-image: radial-gradient(58% 44% at 74% 8%, var(--et-jaune-c) 0%, rgba(229,179,34,0) 70%), linear-gradient(168deg, var(--et-jaune) 0%, var(--et-jaune-b) 100%);
  }
  .vt-et .et-scene { position: relative; min-height: 206px; }
  .vt-et .et-blob { position: absolute; background: var(--et-vert); opacity: .9; }
  .vt-et .et-blob1 { left: -34px; top: -40px; width: 132px; height: 118px; border-radius: 62% 38% 46% 54% / 54% 46% 58% 42%; }
  .vt-et .et-blob2 { left: 22px; bottom: -46px; width: 104px; height: 92px; border-radius: 44% 56% 62% 38% / 48% 58% 42% 52%; opacity: .82; }
  .vt-et .et-barre { position: absolute; left: -18px; top: 96px; width: 148px; height: 10px; background: var(--et-rouge); transform: rotate(-14deg); }
  .vt-et .et-damier { position: absolute; left: 0; top: -60px; width: 96px; height: 64px; background-image: repeating-conic-gradient(var(--et-noir) 0% 25%, var(--et-rouge) 0% 50%); background-size: 16px 16px; opacity: .5; }
  .vt-et .et-tours { position: absolute; left: 2px; bottom: -18px; }
  .vt-et .et-serpentin { position: absolute; right: 84px; bottom: 2px; }
  .vt-et .et-frame { position: absolute; top: 44px; right: -6px; width: 158px; height: 212px; border-radius: 4px; overflow: hidden; box-shadow: 0 14px 30px -14px rgba(18,18,18,.7); }
  .vt-et .et-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--et-jaune-b);
    background-image:
      radial-gradient(circle 14px at 22% 30%, rgba(18,18,18,.55) 96%, transparent),
      radial-gradient(circle 9px at 68% 18%, rgba(18,18,18,.4) 96%, transparent),
      radial-gradient(circle 18px at 74% 72%, rgba(18,18,18,.45) 96%, transparent),
      radial-gradient(circle 7px at 30% 82%, rgba(18,18,18,.5) 96%, transparent);
  }
  .vt-et .et-mono { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-style: italic; font-size: 52px; color: rgba(18,18,18,.62); }
  .vt-et .et-col { position: relative; width: calc(100% - 170px); }
  .vt-et .et-couronne { display: block; }
  .vt-et .et-nameblock { position: relative; margin-top: 4px; padding: 8px 10px 9px 6px; }
  .vt-et .et-splash { position: absolute; inset: 0; background: var(--et-noir); clip-path: polygon(2% 14%, 22% 2%, 52% 9%, 78% 0, 99% 12%, 96% 62%, 99% 92%, 62% 99%, 28% 94%, 0 100%); transform: rotate(-2deg); }
  .vt-et .et-name {
    position: relative; font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif;
    font-weight: 800; font-style: italic; font-size: clamp(27px, 9.4cqw, 32px);
    line-height: 1.04; color: #FFFFFF; overflow-wrap: break-word;
  }
  .vt-et .et-name.vt-ent-long { font-size: 24px; }
  .vt-et .et-name .vt-ent-acc { color: var(--et-jaune); }
  .vt-et .et-bienv-wrap { margin-top: 9px; }
  .vt-et .et-bienv { display: inline-flex; padding: 5px 14px 6px; background: var(--et-rouge); transform: rotate(-3deg) skew(-4deg); box-shadow: 0 8px 16px -8px rgba(120,20,24,.7); }
  .vt-et .et-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 17px; line-height: 1.2; color: #FFFFFF; }
  .vt-et .et-carte { position: relative; margin: 11px -6px 0 -8px; padding: 11px 12px 12px; background: var(--et-noir); clip-path: polygon(0 6%, 100% 0, 98% 96%, 2% 100%); }
  .vt-et .et-verif { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: #FFFFFF; }
  .vt-et .et-zone { margin-top: 5px; display: flex; align-items: flex-start; gap: 7px; font-size: 11px; font-weight: 600; line-height: 1.4; color: #F2EFE8; }
  .vt-et .et-zone svg { flex: none; margin-top: 1px; }
  .vt-et .et-filet { display: block; margin: 8px 0; height: 1px; background: rgba(255,255,255,.22); }
  .vt-et .et-proof { display: flex; align-items: center; gap: 8px; }
  .vt-et .et-pilule { flex: none; display: inline-flex; align-items: center; padding: 5px 11px; border-radius: 99px; background: var(--et-jaune); font-weight: 800; font-size: 13px; color: var(--et-noir); }
  .vt-et .et-proof-t { font-size: 10px; line-height: 1.35; font-weight: 600; color: #FFFFFF; }
  .vt-et .et-stars { display: flex; align-items: center; gap: 3px; margin-top: 1px; color: var(--et-jaune); }
  .vt-et .et-nouv-wrap { margin-top: 12px; }
  .vt-et .et-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 84px; height: 84px; border-radius: 50%; background: var(--et-vert); transform: rotate(4deg);
    box-shadow: 0 12px 26px -12px rgba(16,60,30,.85);
  }
  .vt-et .et-nouv-r { position: absolute; inset: 6px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.8); }
  .vt-et .et-nouv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 13px; line-height: 1.15; text-align: center; color: #FFFFFF; padding: 0 10px; }
  .vt-et .et-trust { background: var(--et-noir); padding: 12px 10px; display: grid; grid-template-columns: 1.14fr 1fr 1.06fr; }
  .vt-et .et-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-et .et-cell-i { width: 36px; height: 36px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .vt-et .et-cell-i--vert { background: var(--et-vert); box-shadow: inset 0 0 0 1.5px rgba(18,18,18,.3), 0 0 0 2px rgba(46,156,82,.35); }
  .vt-et .et-cell-i--jaune { background: var(--et-jaune); box-shadow: inset 0 0 0 1.5px rgba(18,18,18,.3), 0 0 0 2px rgba(217,163,28,.35); }
  .vt-et .et-cell-i--rouge { background: var(--et-rouge); box-shadow: inset 0 0 0 1.5px rgba(18,18,18,.3), 0 0 0 2px rgba(232,80,85,.35); }
  .vt-et .et-cell-l { display: block; font-size: 9.5px; font-weight: 700; font-style: italic; line-height: 1.3; color: #FFFFFF; }
  .vt-et .et-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; }
  .vt-et .et-cell-s--vert { color: var(--et-vert-c); }
  .vt-et .et-cell-s--jaune { color: var(--et-jaune); }
  .vt-et .et-cell-s--rouge { color: var(--et-rouge-c); }
  .vt-et .et-btn { background: #FFFFFF; }
  .vt-et .vt-ent-btn { top: 70px; }

  /* ══════════════════════ 24 · DOUCEUR ══════════════════════
     Relevé — crème #F7F0E6 · olive #6B7455, sauge #8A9B77 · blush #C98A92 /
     #C97B84, textes rosés #B06A73 · or #C9A45C · brun #3E3428. Galet photo
     organique 196×264 ; sceau festonné or 12 lobes en MINIMAL. Ce visuel n'a
     AUCUN sceau soudé au nom — le dernier segment blush le remplace. */
  .vt-do {
    --do-creme: #F7F0E6; --do-creme2: #F9F2E9;
    --do-olive: #6B7455; --do-sauge: #8A9B77; --do-sauge2: #7C8B67;
    --do-blush: #C98A92; --do-blush2: #C97B84; --do-rose: #B06A73;
    --do-or: #C9A45C; --do-or2: #B98A3A; --do-brun: #3E3428;
    background: var(--do-creme);
  }
  .vt-do .do-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background-color: var(--do-creme);
    background-image: radial-gradient(60% 44% at 84% 12%, var(--do-creme2) 0%, rgba(249,242,233,0) 72%);
  }
  .vt-do .do-scene { position: relative; min-height: 250px; }
  .vt-do .do-textile {
    position: absolute; left: -14px; top: -74px; bottom: -18px; width: 44px;
    background-image:
      linear-gradient(180deg, var(--do-blush) 0 18%, var(--do-sauge) 18% 34%, var(--do-creme2) 34% 46%, var(--do-blush2) 46% 62%, var(--do-sauge2) 62% 78%, var(--do-creme2) 78% 100%),
      repeating-linear-gradient(0deg, rgba(255,255,255,.32) 0 2px, transparent 2px 7px);
    clip-path: polygon(0 0, 100% 0, 88% 6%, 100% 13%, 86% 20%, 100% 27%, 88% 34%, 100% 41%, 86% 48%, 100% 55%, 88% 62%, 100% 69%, 86% 76%, 100% 83%, 88% 90%, 100% 96%, 92% 100%, 0 100%);
  }
  .vt-do .do-blob { position: absolute; right: -6px; top: 6px; width: 210px; height: 246px; background: var(--do-sauge); opacity: .34; border-radius: 58% 42% 46% 54% / 46% 52% 48% 54%; }
  .vt-do .do-anneau { position: absolute; right: 132px; top: 128px; width: 76px; height: 76px; border-radius: 50%; border: 1.4px solid var(--do-or); opacity: .55; }
  .vt-do .do-fleurs { position: absolute; right: 148px; top: 16px; opacity: .8; }
  .vt-do .do-frame { position: absolute; right: 0; top: 0; width: 196px; height: 264px; overflow: hidden; border-radius: 54% 46% 42% 58% / 40% 44% 56% 60%; }
  .vt-do .do-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--do-creme2);
    background-image:
      radial-gradient(circle 4px at 12px 16px, rgba(201,138,146,.42) 96%, transparent),
      radial-gradient(circle 4px at 40px 44px, rgba(138,155,119,.4) 96%, transparent);
    background-size: 56px 60px;
  }
  .vt-do .do-mono { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 52px; color: rgba(107,116,85,.5); }
  .vt-do .do-col { position: relative; width: calc(100% - 158px); padding-left: 44px; }
  .vt-do .do-sceau-mono { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; border: 1.4px solid var(--do-or); box-shadow: inset 0 0 0 4px var(--do-creme), inset 0 0 0 5.4px rgba(201,164,92,.6); }
  .vt-do .do-sceau-i { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 19px; letter-spacing: .04em; color: var(--do-or2); }
  .vt-do .do-name {
    margin-top: 10px; font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: clamp(24px, 8.4cqw, 29px); line-height: 1.08; color: var(--do-olive); overflow-wrap: break-word;
  }
  /* Relevé §Casse — Douceur est la seule des cinq à 20 px fixe past 14 car. */
  .vt-do .do-name.vt-ent-long { font-size: 20px; }
  .vt-do .do-name .vt-ent-acc { color: var(--do-blush2); }
  .vt-do .do-bienv { position: relative; margin-top: 8px; display: inline-block; transform: rotate(-3deg); }
  .vt-do .do-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 19px; line-height: 1.2; color: var(--do-or2); }
  .vt-do .do-souligne { display: block; margin-top: 2px; height: 1.2px; background: var(--do-or); opacity: .8; }
  .vt-do .do-verif { margin-top: 11px; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--do-brun); }
  .vt-do .do-verif-r { width: 17px; height: 17px; flex: none; border-radius: 50%; background: var(--do-sauge); display: flex; align-items: center; justify-content: center; }
  .vt-do .do-zone { margin-top: 6px; display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--do-brun); }
  .vt-do .do-zone svg { flex: none; margin-top: 1px; }
  .vt-do .do-proof { margin-top: 12px; display: flex; align-items: center; gap: 8px; }
  .vt-do .do-chip { flex: none; display: inline-flex; align-items: center; padding: 7px 12px; border-radius: 12px; background: var(--do-blush2); font-weight: 800; font-size: 14px; color: #FFFFFF; }
  .vt-do .do-proof-t { font-size: 10.5px; line-height: 1.35; font-weight: 600; color: var(--do-rose); }
  .vt-do .do-stars { display: flex; align-items: center; gap: 3px; margin-top: 1px; color: var(--do-or2); }
  .vt-do .do-nouv-wrap { margin-top: 13px; }
  .vt-do .do-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 100px; height: 100px;
  }
  /* Le sceau festonné 12 lobes : un dégradé or masqué par une couronne conique. */
  .vt-do .do-feston {
    position: absolute; inset: 0; background: linear-gradient(150deg, #D8B060, var(--do-or2));
    clip-path: polygon(50% 0%, 62% 6%, 75% 4%, 82% 15%, 94% 20%, 95% 33%, 100% 45%, 94% 57%, 96% 70%, 85% 78%, 80% 90%, 67% 92%, 56% 99%, 44% 94%, 32% 97%, 23% 87%, 11% 83%, 7% 70%, 0 58%, 5% 46%, 2% 33%, 13% 24%, 17% 12%, 30% 9%, 39% 2%);
  }
  .vt-do .do-nouv-t { position: relative; text-align: center; line-height: 1.15; }
  .vt-do .do-nouv-a { display: block; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 16px; color: #FFFFFF; }
  .vt-do .do-nouv-b { display: block; margin-top: 1px; font-size: 8.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #FFFFFF; }
  .vt-do .do-trust { margin: 0 10px 12px; padding: 12px 6px; background: #FFFFFF; border-radius: 20px; box-shadow: 0 12px 26px -16px rgba(62,52,40,.5); display: grid; grid-template-columns: 1.12fr 1fr 1.04fr; }
  .vt-do .do-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-do .do-cell-i { width: 38px; height: 38px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .vt-do .do-cell-i--sauge { background: var(--do-sauge); }
  .vt-do .do-cell-i--blush { background: var(--do-blush2); }
  .vt-do .do-cell-i--or { background: var(--do-or); }
  .vt-do .do-cell-l { display: block; font-size: 9.5px; font-weight: 700; line-height: 1.3; color: var(--do-brun); }
  .vt-do .do-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; color: var(--do-rose); }
  .vt-do .do-btn { background: #FFFFFF; box-shadow: 0 6px 16px -8px rgba(62,52,40,.5); }
  .vt-do .vt-ent-btn { top: 70px; }

  /* ══════════════════════ 25 · TISSAGE ══════════════════════
     Relevé — vert profond #17351F (carte #0F2717) · ivoire #F1E9D6 · or
     #D9A441 (.txg) · ambre #C77B2B · coche #2E7A44 · sous-lignes #2E5B3A.
     Héros fendu : liseré kente vertical 32 à gauche (casiers 14) + reprise
     horizontale h12 sous le héros ; photo pleine colonne droite 46 %. */
  .vt-ti {
    --ti-vert: #17351F; --ti-carte: #0F2717; --ti-badge: #12301B;
    --ti-ivoire: #F1E9D6; --ti-blanc: #F7F5F0;
    --ti-or: #D9A441; --ti-ambre: #C77B2B; --ti-coche: #2E7A44; --ti-sous: #2E5B3A; --ti-liser: #142E14;
    background: var(--ti-vert);
  }
  .vt-ti .ti-hero {
    position: relative; overflow: hidden; margin-top: -60px; padding: 74px 14px 18px;
    background-color: var(--ti-vert);
    background-image: radial-gradient(54% 40% at 82% 8%, rgba(217,164,65,.09) 0%, transparent 70%);
  }
  .vt-ti .ti-scene { position: relative; min-height: 248px; }
  .vt-ti .ti-lisere {
    position: absolute; left: -14px; top: -74px; bottom: -18px; width: 32px;
    background-color: var(--ti-liser);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,164,65,.55) 0 2px, transparent 2px 9px),
      repeating-linear-gradient(-45deg, rgba(241,233,214,.3) 0 2px, transparent 2px 9px),
      repeating-linear-gradient(180deg, rgba(241,233,214,.16) 0 1px, transparent 1px 14px);
  }
  .vt-ti .ti-frame { position: absolute; top: -74px; right: -14px; bottom: -18px; width: 46%; overflow: hidden; }
  .vt-ti .ti-motif {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background-color: var(--ti-badge);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,164,65,.34) 0 2px, transparent 2px 11px),
      repeating-linear-gradient(-45deg, rgba(217,164,65,.2) 0 2px, transparent 2px 11px);
  }
  .vt-ti .ti-mono { font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 52px; color: rgba(217,164,65,.55); }
  .vt-ti .ti-col { position: relative; width: calc(100% - 151px); padding-left: 24px; }
  .vt-ti .ti-couronne { display: block; }
  .vt-ti .ti-name {
    margin-top: 6px; font-family: 'Bricolage Grotesque', 'Instrument Sans', sans-serif; font-weight: 800;
    font-size: clamp(27px, 9.4cqw, 32px); line-height: 1.05; letter-spacing: -.012em;
    color: var(--ti-ivoire); overflow-wrap: break-word;
  }
  .vt-ti .ti-name.vt-ent-long { font-size: 24px; }
  .vt-ti .ti-name .vt-ent-acc { color: var(--ti-or); }
  @supports (background-clip: text) or (-webkit-background-clip: text) {
    .vt-ti .ti-name .vt-ent-acc {
      background-image: linear-gradient(96deg, #EFCB78 0%, var(--ti-or) 38%, #B37F24 68%, #E7C069 100%);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
    }
  }
  .vt-ti .ti-bienv { margin-top: 7px; display: flex; align-items: center; gap: 8px; }
  .vt-ti .ti-bienv-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 18px; line-height: 1.2; color: #FFFFFF; }
  .vt-ti .ti-brosse { width: 30px; height: 4px; border-radius: 3px; background: var(--ti-or); transform: rotate(-2deg); }
  .vt-ti .ti-carte { margin-top: 11px; padding: 11px 12px 12px; background: var(--ti-carte); border-radius: 16px; box-shadow: inset 0 0 0 1px rgba(217,164,65,.28); }
  .vt-ti .ti-verif { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: #FFFFFF; }
  .vt-ti .ti-coche { width: 15px; height: 15px; flex: none; border-radius: 50%; background: var(--ti-coche); display: flex; align-items: center; justify-content: center; }
  .vt-ti .ti-zone { margin-top: 5px; display: flex; align-items: flex-start; gap: 7px; font-size: 11px; font-weight: 600; line-height: 1.4; color: var(--ti-ivoire); }
  .vt-ti .ti-zone svg { flex: none; margin-top: 1px; }
  .vt-ti .ti-proof { margin-top: 9px; display: flex; align-items: center; gap: 8px; }
  .vt-ti .ti-rond { min-width: 38px; width: auto; padding: 0 8px; height: 38px; flex: none; border-radius: 99px; border-radius: 50%; border: 1.4px solid var(--ti-or); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; color: var(--ti-or); }
  /* Relevé — la ligne de preuve est en italique doré sur ce visuel. */
  .vt-ti .ti-proof-t { font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 11px; line-height: 1.35; color: var(--ti-or); }
  .vt-ti .ti-stars { display: flex; align-items: center; gap: 3px; margin-top: 1px; font-style: normal; font-family: 'Instrument Sans', system-ui, sans-serif; font-weight: 600; font-size: 10.5px; }
  .vt-ti .ti-nouv-wrap { margin-top: 12px; }
  .vt-ti .ti-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 88px; height: 88px; border-radius: 50%; background: var(--ti-badge);
    box-shadow: 0 12px 26px -12px rgba(10,30,16,.85);
  }
  .vt-ti .ti-nouv-r { position: absolute; inset: 5px; border-radius: 50%; border: 1.5px dashed rgba(217,164,65,.7); }
  .vt-ti .ti-nouv-t { position: relative; text-align: center; line-height: 1.15; }
  .vt-ti .ti-nouv-a { display: block; font-weight: 800; font-size: 13px; color: #FFFFFF; }
  .vt-ti .ti-nouv-b { display: block; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 700; font-size: 13px; color: var(--ti-or); }
  .vt-ti .ti-bande {
    height: 12px; background-color: var(--ti-vert);
    background-image:
      repeating-linear-gradient(45deg, rgba(217,164,65,.55) 0 2px, transparent 2px 9px),
      repeating-linear-gradient(-45deg, rgba(241,233,214,.3) 0 2px, transparent 2px 9px);
  }
  .vt-ti .ti-trust { background: var(--ti-blanc); padding: 12px 10px; display: grid; grid-template-columns: 1.12fr 1fr 1.06fr; }
  .vt-ti .ti-cell { padding: 0 5px; display: flex; align-items: center; gap: 8px; }
  .vt-ti .ti-cell-i { position: relative; width: 38px; height: 38px; flex: none; border-radius: 50%; background: var(--ti-vert); display: flex; align-items: center; justify-content: center; }
  .vt-ti .ti-cell-c { position: absolute; right: -3px; bottom: -3px; width: 15px; height: 15px; border-radius: 50%; background: var(--ti-or); border: 2px solid var(--ti-blanc); display: flex; align-items: center; justify-content: center; }
  .vt-ti .ti-cell-l { display: block; font-size: 9.5px; font-weight: 700; line-height: 1.3; color: #14251A; }
  .vt-ti .ti-cell-s { display: block; font-size: 9.5px; font-weight: 600; line-height: 1.3; color: var(--ti-sous); }
  .vt-ti .ti-btn { background: var(--ti-or); }
  .vt-ti .vt-ent-btn { top: 70px; }


  /* ENTETES-F — the strip stays a strip. Measured: the catalog carries the FULL
     label in one string (« Livraison Séra vérifiée & scellée ») where the
     contract splits it over two short lines, so at the relevé's own 9.5px it
     wrapped to three lines and pushed the strip to 86–100px against the
     contract's ~64. What gives is the VIGNETTE (38 → 32) and the LEADING
     (1.3 → 1.22) — never the type: every relevé says « titres 700/9.5 +
     sous-lignes 600 », and 9px labels on a 320px 1GB Android in the sun is
     failure mode #9, not a rounding decision. */
  .vt-pr .pr-trust, .vt-te .te-trust, .vt-et .et-trust, .vt-ti .ti-trust { padding: 9px 8px; align-items: center; }
  .vt-do .do-trust { padding: 9px 4px; align-items: center; }
  .vt-pr .pr-cell-i, .vt-te .te-cell-i, .vt-et .et-cell-i,
  .vt-do .do-cell-i, .vt-ti .ti-cell-i { width: 32px; height: 32px; }
  .vt-pr .pr-cell-l, .vt-te .te-cell-l, .vt-et .et-cell-l,
  .vt-do .do-cell-l, .vt-ti .ti-cell-l { font-size: 9.5px; line-height: 1.22; }
  .vt-pr .pr-cell-s, .vt-te .te-cell-s, .vt-et .et-cell-s,
  .vt-do .do-cell-s, .vt-ti .ti-cell-s { font-size: 9.5px; line-height: 1.22; }
  .vt-pr .pr-cell, .vt-te .te-cell, .vt-et .et-cell,
  .vt-do .do-cell, .vt-ti .ti-cell { gap: 7px; padding: 0 4px; }

  /* 2 — THE MINIMAL BADGE. Each style's pastille is the contract's own shape,
     but stacked AFTER the greeting, the verified line and the zone it pushed
     the column 60–90px past its relevé min-height. The badge keeps its
     identity at a size the column can hold. */
  .vt-te .te-nouv { width: 78px; height: 78px; }
  .vt-et .et-nouv { width: 72px; height: 72px; }
  .vt-do .do-nouv { width: 66px; height: 66px; }
  .vt-ti .ti-nouv { width: 74px; height: 74px; }
  .vt-te .te-nouv-wrap, .vt-et .et-nouv-wrap,
  .vt-do .do-nouv-wrap, .vt-ti .ti-nouv-wrap { margin-top: 9px; }
  .vt-pr .pr-nouv-wrap { margin-top: 10px; }
  .vt-do .do-nouv-a { font-size: 12px; }
  .vt-do .do-nouv-b { font-size: 8px; }
  .vt-et .et-nouv-t { font-size: 12px; padding: 0 8px; }

  /* 3 — COLUMN RHYTHM. The greeting is a line the contract's MINIMAL does not
     carry (« ni accueil ») but this build keeps always — a new seller needs the
     warm word most. The margins absorb it instead of the height. */
  /* Douceur measured tallest of the five: its column is the narrowest (the
     44px textile band eats it) so the zone wrapped to three lines at 320. The
     band and the gutter give the words their room back. */
  .vt-do .do-col { width: calc(100% - 180px); padding-left: 32px; }
  .vt-do .do-textile { width: 32px; }
  .vt-do .do-frame { width: 168px; height: 240px; }
  .vt-do .do-zone { margin-top: 5px; }
  .vt-do .do-proof { margin-top: 9px; }
  .vt-do .do-sceau-mono { width: 40px; height: 40px; }
  .vt-do .do-sceau-i { font-size: 14px; }
  .vt-do .do-name { margin-top: 5px; }
  .vt-et .et-carte { margin-top: 9px; padding: 9px 12px 10px; }
  .vt-ti .ti-carte { margin-top: 9px; padding: 9px 12px 10px; }
  .vt-do .do-verif, .vt-ti .ti-zone { margin-top: 8px; }
  .vt-et .et-nameblock { margin-top: 2px; }

  /* ═══════ ENTETES-F · 320 px (contrat série 4 « validé à 320 ») ═══════
     Les colonnes fendues se resserrent : cadres −18 à −24, colonnes
     recalculées, décor secondaire élagué. Jamais une chaîne, jamais la
     preuve, jamais la pastille — seulement de la géométrie. */
  @container (max-width: 339px) {
    .vt-pr .pr-scene { min-height: 250px; }
    .vt-pr .pr-panneau { width: 162px; }
    .vt-pr .pr-col { width: calc(100% - 158px); }
    .vt-pr .pr-name { font-size: clamp(24px, 9.4cqw, 28px); }
    .vt-pr .pr-crest { width: 40px; height: 26px; }
    .vt-pr .pr-bienv { font-size: 17px; }
    .vt-te .te-scene { min-height: 238px; padding-top: 30px; }
    .vt-te .te-frame { width: 44%; }
    .vt-te .te-col { width: calc(100% - 126px); }
    .vt-te .te-name { font-size: clamp(24px, 9.4cqw, 28px); }
    .vt-te .te-patch { width: 188px; height: 200px; }
    .vt-te .te-glyphes2 { display: none; }
    .vt-te .te-bienv-t { font-size: 15px; }
    .vt-te .te-nouv { width: 84px; height: 84px; }
    .vt-et .et-scene { min-height: 196px; }
    .vt-et .et-frame { width: 136px; height: 190px; }
    .vt-et .et-col { width: calc(100% - 148px); }
    .vt-et .et-name { font-size: clamp(24px, 9.4cqw, 28px); }
    .vt-et .et-tours, .vt-et .et-serpentin { display: none; }
    .vt-et .et-bienv-t { font-size: 15px; }
    .vt-do .do-scene { min-height: 238px; }
    .vt-do .do-frame { width: 138px; height: 208px; }
    .vt-do .do-col { width: calc(100% - 150px); padding-left: 22px; }
    .vt-do .do-name { font-size: clamp(20px, 8.4cqw, 24px); }
    .vt-do .do-zone, .vt-do .do-verif { font-size: 11px; }
    .vt-do .do-textile { width: 22px; }
    .vt-do .do-fleurs, .vt-do .do-anneau { display: none; }
    .vt-do .do-sceau-mono { width: 48px; height: 48px; }
    .vt-do .do-bienv-t { font-size: 17px; }
    .vt-ti .ti-scene { min-height: 236px; }
    .vt-ti .ti-frame { width: 43%; }
    .vt-ti .ti-col { width: calc(100% - 124px); padding-left: 20px; }
    .vt-ti .ti-name { font-size: clamp(24px, 9.4cqw, 28px); }
    .vt-ti .ti-lisere { width: 26px; }
    .vt-ti .ti-couronne { width: 34px; height: 20px; }
    .vt-ti .ti-bienv-t { font-size: 16px; }
    .vt-ti .ti-nouv { width: 78px; height: 78px; }
    /* Les trois libellés de confiance gardent leur sens : on rétrécit la
       vignette et l'interligne, jamais le texte au point de le tronquer. */
    .vt-pr .pr-cell-i, .vt-te .te-cell-i, .vt-et .et-cell-i, .vt-do .do-cell-i, .vt-ti .ti-cell-i { width: 30px; height: 30px; }
    /* 320 keeps the relevé's 9.5px too — the vignette and the gutter carry
       the narrower screen, because this is the width where legibility is
       already hardest. */
    .vt-pr .pr-cell-l, .vt-te .te-cell-l, .vt-et .et-cell-l, .vt-do .do-cell-l, .vt-ti .ti-cell-l { font-size: 9.5px; line-height: 1.2; }
    .vt-pr .pr-cell-s, .vt-te .te-cell-s, .vt-et .et-cell-s, .vt-do .do-cell-s, .vt-ti .ti-cell-s { font-size: 9.5px; line-height: 1.2; }
    .vt-pr .pr-cell, .vt-te .te-cell, .vt-et .et-cell, .vt-do .do-cell, .vt-ti .ti-cell { gap: 6px; padding: 0 3px; }
  }
`;
