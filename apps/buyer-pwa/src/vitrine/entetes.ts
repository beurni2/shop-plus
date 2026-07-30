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
 * ENTETES-E (Beurni Boss handoff, Part B anti-orphelin) — past this length the
 * five cinematic columns drop BELOW the handoff's fixed size. The handoff fixes
 * 38px past 14 chars AND demands two name lines max with a 24-char fixture;
 * measured in the browser, both cannot hold at once in a 176px column — so the
 * matrix's two-line law wins (CTO adaptation, journalled) and a second, smaller
 * fixed tier exists for the extreme tail of the range.
 */
const XLONG_NAME = 19;

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
  /** ENTETES-E — the tier past 19 chars where the two-line law forces a second
   *  reduction (the Beurni Boss columns only; the six never read this). */
  readonly xlongName: boolean;
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
    xlongName: sf.name.length > XLONG_NAME,
    tail: nameTail(sf.name),
    back: opts.fromProduct === true,
  };
}

/**
 * ENTETES-E — the Beurni Boss anti-orphan name (handoff Part B): the name is
 * trimmed and multi-spaces collapse to one; the last WORD (space-delimited)
 * wraps whole in `.vt-ent-tail` (inline-block + nowrap in the sheet) with the
 * space before it turned `&nbsp;`, and the accent segment (`/[^ \-]+$/` — the
 * part after the last hyphen) is `.vt-ent-acc` inside it. Keeping the whole
 * word unbreakable is what the two-line law demands, browser-measured: a
 * hyphen break in « Élégance-Burkina » is exactly the third-line orphan the
 * handoff bans, so the hyphen never breaks here and the xlong size tier
 * (measured per face) makes the word fit its column instead. A single-word
 * name IS its own tail. Escaped part by part; pure and exported so the rule
 * is executed by tests, never re-derived.
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
const hasPhoto = (v: Vals): boolean => v.hasCover || v.hasAvatar;
const etatPhoto = (v: Vals): string => (hasPhoto(v) ? 'live' : 'none');
/** The frame's <img>: the cover at this style's §5 crop bias, else the portrait. */
const framePhoto = (v: Vals, pos: string): string => (v.hasCover ? coverImg(v, pos) : avatarImg(v));

/** « {rating} · {N} avis » — the handoff's exact review chip (its « Chaînes
 *  exactes » list), NNBSP-grouped count, star drawn by the caller's style. */
const avisChip = (v: Vals): string =>
  `<span><v>${v.rating}</v> · <v>${groupFr(v.reviewCount)}</v> ${t('vit.avis')}</span>`;

/** « {N} ventes livrées par Séra » with the count grouped the repo's byte-stable
 *  way (manual NNBSP grouping — ICU is banned; the handoff's fr-FR intent). */
const ventesLine = (v: Vals): string => `<b><v>${groupFr(v.delivN)}</v></b> ${t('vit.ventes_livrees')}`;

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

/* --------------------------------------------- 6 · MASQUE (planches Bwa) -- */

function masque(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ma-cell"><span class="ma-cell-i">${icon}</span><span class="ma-cell-l">${label}</span><span class="ma-cell-s">${sub}</span></div>`;
  const long = v.xlongName ? ' vt-ent-xlong' : v.longName ? ' vt-ent-long' : '';
  // §6 — « vendeuse » rouge: derived from the ONE catalog string, never re-authored.
  const [nA = '', ...nB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-ma" data-role="vitrine-hero">',
    '<div class="ma-hero">',
    '<div class="ma-scene">',
    // §2/§3 — cible, chevrons, planche fantôme, bandes d'ombre, vignette (z0).
    '<span class="ma-cible" aria-hidden="true"></span>',
    '<svg class="ma-chevrons" aria-hidden="true" viewBox="0 0 44 96" width="44" height="96"><path d="M2 10 L22 2 L42 10 M2 22 L22 14 L42 22 M2 34 L22 26 L42 34 M2 46 L22 38 L42 46 M2 58 L22 50 L42 58 M2 70 L22 62 L42 70 M2 82 L22 74 L42 82 M2 94 L22 86 L42 94" fill="none" stroke="#141414" stroke-width="4"/></svg>',
    '<span class="ma-planche" aria-hidden="true"></span>',
    '<span class="ma-bande ma-bande1" aria-hidden="true"></span>',
    '<span class="ma-bande ma-bande2" aria-hidden="true"></span>',
    '<span class="ma-vignette" aria-hidden="true"></span>',
    // §7 footer frieze — BEFORE the column in the DOM: QA 8, the foot shapes
    // must never paint over proof (verifier M1: DOM order is paint order here).
    '<span class="ma-frise" aria-hidden="true"></span>',
    // §5 — the orthogonal frame: 2px noir · 5px crème · 2px noir, damier base.
    `<div class="ma-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    '<div class="ma-photo">',
    hasPhoto(v)
      ? framePhoto(v, '50% 26%')
      : `<div class="ma-frame-motif"><span class="ma-motif-cible" aria-hidden="true"></span><span class="ma-mono">${v.mono}</span></div>`,
    '<span class="ma-damier" aria-hidden="true"></span>',
    '</div>',
    '</div>',
    // §4 — the text column.
    '<div class="ma-col" data-role="vitrine-identity">',
    `<div class="ma-name${long}">${v.tail}</div>`,
    `<div class="ma-bienv">${t('vit.bienvenue')}<svg class="ma-zigzag" aria-hidden="true" viewBox="0 0 74 7" width="74" height="7"><path d="M1 5 L8 2 L15 5 L22 2 L29 5 L36 2 L43 5 L50 2 L57 5 L64 2 L71 5" fill="none" stroke="#C8332A" stroke-width="2"/></svg></div>`,
    `<div class="ma-verif">${iconPinEnt(13, '#C8332A', 2.2)}${verifieeBare()}</div>`,
    `<div class="ma-zone"><v>${v.zone}</v></div>`,
    v.showProof
      ? `<div class="ma-proofrow"><span class="ma-proof" data-role="reputation">${ventesLine(v)}</span>${v.showStars ? `<span class="ma-stars" data-role="chip-avis">${iconStarEnt(11, '#C8332A')}${avisChip(v)}</span>` : ''}</div>`
      : '',
    v.nouvelle
      ? `<div class="ma-nouv-wrap"><span class="ma-nouv" data-role="chip-nouvelle"><v>${nA}</v> <span class="ma-nouv-acc"><v>${nB.join(' ')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // §7 — the trust strip, three labels word for word.
    '<div class="ma-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#141414', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#141414', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#141414', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'ma', 'right', '20px', '72px', '#141414'),
    '</div>',
  ].join('');
}

/* --------------------------------- 7 · HARMATTAN (contre-jour de poussière) -- */

function harmattan(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ha-cell"><span class="ha-cell-i">${icon}</span><span class="ha-cell-l">${label}</span><span class="ha-cell-s">${sub}</span></div>`;
  const long = v.xlongName ? ' vt-ent-xlong' : v.longName ? ' vt-ent-long' : '';
  return [
    '<div class="vt-ent vt-ha" data-role="vitrine-hero">',
    '<div class="ha-hero">',
    '<div class="ha-scene">',
    // §2/§3 — soleil voilé, dunes, sentier de vent, acacias, calaos, bokeh (z0).
    '<span class="ha-soleil" aria-hidden="true"></span>',
    '<span class="ha-dune ha-dune1" aria-hidden="true"></span>',
    '<span class="ha-dune ha-dune2" aria-hidden="true"></span>',
    '<svg class="ha-vent" aria-hidden="true" viewBox="0 0 170 70" width="170" height="70"><path d="M4 62 C 44 48, 66 24, 96 22 C 120 20, 140 30, 166 16" fill="none" stroke="#FFF7EA" stroke-width="2" stroke-dasharray="5 7"/></svg>',
    '<svg class="ha-acacia ha-acacia1" aria-hidden="true" viewBox="0 0 82 44" width="82" height="44"><path d="M40 44 L40 20 M40 26 L22 12 M40 24 L58 10 M40 30 L30 18" fill="none" stroke="#4E2C18" stroke-width="2"/><path d="M6 14 Q40 -4 78 12" fill="none" stroke="#4E2C18" stroke-width="3"/></svg>',
    '<svg class="ha-acacia ha-acacia2" aria-hidden="true" viewBox="0 0 46 30" width="46" height="30"><path d="M22 30 L22 12 M22 16 L12 8 M22 15 L34 6" fill="none" stroke="#4E2C18" stroke-width="1.6"/><path d="M4 10 Q23 -2 43 9" fill="none" stroke="#4E2C18" stroke-width="2"/></svg>',
    '<svg class="ha-calaos" aria-hidden="true" viewBox="0 0 32 18" width="32" height="18"><path d="M2 8 Q6 4 10 8 Q14 12 18 8 M18 12 Q22 8 26 12 Q28 14 31 12" fill="none" stroke="#4E2C18" stroke-width="1.5"/></svg>',
    '<span class="ha-bokeh" aria-hidden="true"></span>',
    '<span class="ha-vignette" aria-hidden="true"></span>',
    // §5 — circular portrait riding the veiled sun.
    `<div class="ha-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 24%')
      : `<div class="ha-frame-motif"><span class="ha-mono">${v.mono}</span></div>`,
    '</div>',
    // §4 — the text column.
    '<div class="ha-col" data-role="vitrine-identity">',
    `<div class="ha-name${long}">${v.tail}</div>`,
    `<div class="ha-bienv">${t('vit.bienvenue')}<svg class="ha-route" aria-hidden="true" viewBox="0 0 88 2" width="88" height="2"><line x1="0" y1="1" x2="88" y2="1" stroke="#A94F24" stroke-width="2" stroke-dasharray="4 5"/></svg></div>`,
    `<div class="ha-verif">${iconPinEnt(13, '#A94F24', 2.2)}${verifieeBare()}</div>`,
    `<div class="ha-zone"><v>${v.zone}</v></div>`,
    v.showProof
      ? `<div class="ha-proofrow"><span class="ha-proof" data-role="reputation">${ventesLine(v)}</span>${v.showStars ? `<span class="ha-stars" data-role="chip-avis">${iconStarEnt(11, '#FFE7A8')}${avisChip(v)}</span>` : ''}</div>`
      : '',
    v.nouvelle
      ? `<div class="ha-nouv-wrap"><span class="ha-nouv" data-role="chip-nouvelle"><span class="ha-nouv-rais" aria-hidden="true"></span><span class="ha-nouv-t">${t('vit.nouvelle_vendeuse')}</span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // §7 — the trust strip.
    '<div class="ha-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#4E2C18', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#4E2C18', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#4E2C18', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'ha', 'right', '20px', '72px', '#4E2C18'),
    '</div>',
  ].join('');
}

/* ------------------------------------------- 8 · BALAFON (nuit de concert) -- */

function balafon(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ba-cell"><span class="ba-cell-i">${icon}</span><span class="ba-cell-l">${label}</span><span class="ba-cell-s">${sub}</span></div>`;
  const long = v.xlongName ? ' vt-ent-xlong' : v.longName ? ' vt-ent-long' : '';
  return [
    '<div class="vt-ent vt-ba" data-role="vitrine-hero">',
    '<div class="ba-hero">',
    '<div class="ba-scene">',
    // §2/§3 — projecteurs croisés, touches + résonateurs, portée, bokeh (z0).
    '<span class="ba-cone ba-cone-l" aria-hidden="true"></span>',
    '<span class="ba-cone ba-cone-r" aria-hidden="true"></span>',
    '<svg class="ba-portee" aria-hidden="true" viewBox="0 0 172 54" width="172" height="54"><path d="M2 8 H170 M2 19 H170 M2 30 H170 M2 41 H170 M2 52 H170" fill="none" stroke="#E6D7E8" stroke-width="1" stroke-dasharray="3 6"/><circle cx="52" cy="19" r="7" fill="#B886D9"/><path d="M59 19 V2" stroke="#B886D9" stroke-width="2"/><circle cx="118" cy="34" r="9" fill="#E8B476"/><path d="M127 34 V12" stroke="#E8B476" stroke-width="2"/></svg>',
    '<span class="ba-reso ba-reso1" aria-hidden="true"></span>',
    '<span class="ba-reso ba-reso2" aria-hidden="true"></span>',
    '<span class="ba-reso ba-reso3" aria-hidden="true"></span>',
    '<span class="ba-touche ba-touche1" aria-hidden="true"></span>',
    '<span class="ba-touche ba-touche2" aria-hidden="true"></span>',
    '<span class="ba-touche ba-touche3" aria-hidden="true"></span>',
    '<span class="ba-bokeh" aria-hidden="true"></span>',
    '<span class="ba-vignette" aria-hidden="true"></span>',
    // §5 — the drum-ringed portrait, one resting note.
    `<div class="ba-medaille">`,
    `<div class="ba-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 24%')
      : `<div class="ba-frame-motif"><span class="ba-mono">${v.mono}</span></div>`,
    '</div>',
    '<svg class="ba-note" aria-hidden="true" viewBox="0 0 18 18" width="18" height="18"><circle cx="6" cy="13" r="4.5" fill="#E8B476"/><path d="M10.5 13 V2 L15 4" fill="none" stroke="#E8B476" stroke-width="2"/></svg>',
    '</div>',
    // §4 — the text column.
    '<div class="ba-col" data-role="vitrine-identity">',
    `<div class="ba-name${long}">${v.tail}</div>`,
    `<div class="ba-bienv"><span class="ba-los" aria-hidden="true"></span>${t('vit.bienvenue')}<span class="ba-los" aria-hidden="true"></span></div>`,
    `<div class="ba-verif">${iconPinEnt(13, '#B886D9', 2.2)}${verifieeBare()}</div>`,
    `<div class="ba-zone"><v>${v.zone}</v></div>`,
    v.showProof
      ? `<div class="ba-proofrow"><span class="ba-proof" data-role="reputation">${ventesLine(v)}</span>${v.showStars ? `<span class="ba-stars" data-role="chip-avis">${iconStarEnt(11, '#E8B476')}${avisChip(v)}</span>` : ''}</div>`
      : '',
    v.nouvelle
      ? `<div class="ba-nouv-wrap"><span class="ba-nouv" data-role="chip-nouvelle"><span class="ba-oeillet" aria-hidden="true"></span><span class="ba-nouv-t">${t('vit.nouvelle_vendeuse')}</span><span class="ba-oeillet" aria-hidden="true"></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // §7 — the trust strip, wood-disc icons.
    '<div class="ba-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#160D18', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#160D18', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#160D18', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'ba', 'right', '20px', '72px', '#FFF4DD'),
    '</div>',
  ].join('');
}

/* ------------------------------------- 9 · SÉANCE (grand écran de Ouaga) -- */

function seance(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="se-cell"><span class="se-cell-i">${icon}</span><span class="se-cell-l">${label}</span><span class="se-cell-s">${sub}</span></div>`;
  const long = v.xlongName ? ' vt-ent-xlong' : v.longName ? ' vt-ent-long' : '';
  return [
    '<div class="vt-ent vt-se" data-role="vitrine-hero">',
    '<div class="se-hero">',
    '<div class="se-scene">',
    // §2/§3 — projecteur, contre-faisceau, poussière, bobine, skyline, étoiles.
    '<span class="se-proj" aria-hidden="true"></span>',
    '<span class="se-contre" aria-hidden="true"></span>',
    '<span class="se-pouss" aria-hidden="true"></span>',
    '<svg class="se-bobine" aria-hidden="true" viewBox="0 0 74 74" width="74" height="74"><circle cx="37" cy="37" r="35" fill="none" stroke="#B89AE8" stroke-width="1.5"/><circle cx="37" cy="37" r="8" fill="none" stroke="#B89AE8" stroke-width="1.5"/><circle cx="37" cy="16" r="6" fill="none" stroke="#B89AE8" stroke-width="1.5"/><circle cx="55" cy="48" r="6" fill="none" stroke="#B89AE8" stroke-width="1.5"/><circle cx="19" cy="48" r="6" fill="none" stroke="#B89AE8" stroke-width="1.5"/></svg>',
    '<span class="se-skyline" aria-hidden="true"></span>',
    '<span class="se-etoiles" aria-hidden="true"></span>',
    '<span class="se-vignette" aria-hidden="true"></span>',
    // §5 — the 35 mm frame: perforation columns, inner screen.
    `<div class="se-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    '<span class="se-perfo se-perfo-l" aria-hidden="true"></span>',
    '<span class="se-perfo se-perfo-r" aria-hidden="true"></span>',
    '<div class="se-photo">',
    hasPhoto(v)
      ? framePhoto(v, '50% 24%')
      : `<div class="se-frame-motif"><span class="se-mono">${v.mono}</span></div>`,
    '</div>',
    '</div>',
    // §4 — the text column, marquee row under the name.
    '<div class="se-col" data-role="vitrine-identity">',
    `<div class="se-name${long}">${v.tail}</div>`,
    `<div class="se-bienv">${t('vit.bienvenue')}</div>`,
    '<span class="se-ampoules" aria-hidden="true"></span>',
    `<div class="se-verif">${iconPinEnt(13, '#B89AE8', 2.2)}${verifieeBare()}</div>`,
    `<div class="se-zone"><v>${v.zone}</v></div>`,
    v.showProof
      ? `<div class="se-proofrow"><span class="se-proof" data-role="reputation">${ventesLine(v)}</span>${v.showStars ? `<span class="se-stars" data-role="chip-avis">${iconStarEnt(11, '#E8B84B')}${avisChip(v)}</span>` : ''}</div>`
      : '',
    v.nouvelle
      ? `<div class="se-nouv-wrap"><span class="se-nouv" data-role="chip-nouvelle"><svg class="se-nouv-bob" aria-hidden="true" viewBox="0 0 14 14" width="14" height="14"><circle cx="7" cy="7" r="6" fill="none" stroke="#171226" stroke-width="1.5"/><circle cx="7" cy="7" r="1.8" fill="#171226"/></svg><span class="se-nouv-t">${t('vit.nouvelle_vendeuse')}</span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // §7 — the trust strip.
    '<div class="se-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#E8B84B', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#E8B84B', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#E8B84B', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'se', 'right', '20px', '72px', '#FFF9EC'),
    '</div>',
  ].join('');
}

/* ------------------------------- 10 · CAURIS (lagune & porte-bonheur) ----- */

function cauris(v: Vals): string {
  const cell = (icon: string, label: string, sub: string): string =>
    `<div class="ca-cell"><span class="ca-cell-i">${icon}</span><span class="ca-cell-l">${label}</span><span class="ca-cell-s">${sub}</span></div>`;
  const long = v.xlongName ? ' vt-ent-xlong' : v.longName ? ' vt-ent-long' : '';
  const cauri = (cls: string): string =>
    `<svg class="ca-cauri ${cls}" aria-hidden="true" viewBox="0 0 30 18" width="30" height="18"><ellipse cx="15" cy="9" rx="14" ry="8" fill="#FFF7E8"/><ellipse cx="15" cy="9" rx="14" ry="8" fill="none" stroke="#D8CCB7" stroke-width="1.5"/><line x1="6" y1="9" x2="24" y2="9" stroke="#8A7155" stroke-width="1.5" stroke-dasharray="2 2"/></svg>`;
  // §6 — the MINIMAL badge is the handoff's two-line cauri: derived split.
  const [cA = '', ...cB] = t('vit.nouvelle_vendeuse').split(' ');
  return [
    '<div class="vt-ent vt-ca" data-role="vitrine-hero">',
    '<div class="ca-hero">',
    '<div class="ca-scene">',
    // §2/§3 — cauris, anneaux de vague, bulles, banc de sable, god-rays (z0).
    '<span class="ca-ray ca-ray1" aria-hidden="true"></span>',
    '<span class="ca-ray ca-ray2" aria-hidden="true"></span>',
    '<span class="ca-ray ca-ray3" aria-hidden="true"></span>',
    '<span class="ca-vagues" aria-hidden="true"></span>',
    cauri('ca-cauri1'),
    cauri('ca-cauri2'),
    cauri('ca-cauri3'),
    cauri('ca-cauri4'),
    '<span class="ca-bulles" aria-hidden="true"></span>',
    '<span class="ca-sable" aria-hidden="true"></span>',
    '<span class="ca-vignette" aria-hidden="true"></span>',
    // §5 — the cowrie-oval portrait.
    `<div class="ca-frame" data-role="vitrine-cover" data-etat="${etatPhoto(v)}">`,
    hasPhoto(v)
      ? framePhoto(v, '50% 24%')
      : `<div class="ca-frame-motif"><span class="ca-mono">${v.mono}</span></div>`,
    '</div>',
    '<span class="ca-frame-ring" aria-hidden="true"></span>',
    // §4 — the text column.
    '<div class="ca-col" data-role="vitrine-identity">',
    `<div class="ca-name${long}">${v.tail}</div>`,
    `<div class="ca-bienv">${t('vit.bienvenue')}<span class="ca-pinceau" aria-hidden="true"></span></div>`,
    `<div class="ca-verif">${iconPinEnt(13, '#D9B87A', 2.2)}${verifieeBare()}</div>`,
    `<div class="ca-zone"><v>${v.zone}</v></div>`,
    v.showProof
      ? `<div class="ca-proofrow"><span class="ca-proof" data-role="reputation">${ventesLine(v)}</span>${v.showStars ? `<span class="ca-stars" data-role="chip-avis">${iconStarEnt(11, '#D9B87A')}${avisChip(v)}</span>` : ''}</div>`
      : '',
    v.nouvelle
      ? `<div class="ca-nouv-wrap"><span class="ca-nouv" data-role="chip-nouvelle"><span class="ca-nouv-fente" aria-hidden="true"></span><span class="ca-nouv-t"><v>${cA}</v><br><v>${cB.join(' ')}</v></span></span></div>`
      : '',
    '</div>',
    '</div>',
    '</div>',
    // §7 — the trust strip.
    '<div class="ca-trust" data-role="vitrine-trust">',
    cell(iconShieldEnt(16, '#0E3E36', 2), t('vit.chip_sera'), t('vit.cell_sera_sub')),
    cell(iconLockEnt(15, '#0E3E36', 2), t('vit.chip_paiement'), t('vit.cell_paiement_sub')),
    cell(iconTagEnt(15, '#0E3E36', 2), t('vit.cell_prix'), t('vit.cell_prix_sub')),
    '</div>',
    controls(v, 'ca', 'right', '20px', '72px', '#145248'),
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
    case 'masque':
      return masque(v);
    case 'harmattan':
      return harmattan(v);
    case 'balafon':
      return balafon(v);
    case 'seance':
      return seance(v);
    case 'cauris':
      return cauris(v);
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

  /* ═══════════════ ENTETES-E · the Beurni Boss five ═══════════════
     Handoff Part B shared rules. The anti-orphan tail (nowrap, nbsp joint —
     the deterministic discipline this repo uses instead of soft wrapping
     heuristics), decorative layers never intercept taps, hero + trust strip
     full-bleed with NO app bar (CTO adaptation, journalled). Each style is
     its own scoped block below; z-order everywhere: decor 0 · vignette ·
     photo · text (DOM order carries it), controls 6. */
  .vt-ent .vt-ent-tail { display: inline-block; white-space: nowrap; }
  .vt-ent [aria-hidden="true"] { pointer-events: none; }

  /* ══════════════════════ 6 · MASQUE ══════════════════════ */
  .vt-ma { background: #141414; }
  .vt-ma .ma-hero {
    position: relative; overflow: hidden;
    margin-top: -60px; padding-top: 60px;
    background-color: #EFE9DC;
    background-image:
      linear-gradient(112deg, transparent 0 25%, rgba(255,255,255,.32) 42%, rgba(255,255,255,.08) 63%, transparent 78%),
      linear-gradient(90deg, rgba(20,20,20,.08), transparent 32%, transparent 70%, rgba(20,20,20,.11));
  }
  .vt-ma .ma-scene { position: relative; height: 246px; }
  .vt-ma .ma-cible {
    position: absolute; top: 22px; left: 96px; width: 64px; height: 64px; border-radius: 50%;
    background: repeating-radial-gradient(circle, transparent 0 6px, #141414 6px 10px);
    opacity: .12;
  }
  .vt-ma .ma-chevrons { position: absolute; right: -8px; top: 84px; }
  .vt-ma .ma-planche { position: absolute; left: 204px; top: 18px; width: 74px; height: 206px; background: #141414; opacity: .075; border-radius: 37px 37px 8px 8px; }
  .vt-ma .ma-bande { position: absolute; top: -20px; bottom: -20px; width: 58px; background: rgba(20,20,20,.08); transform: rotate(-11deg); }
  .vt-ma .ma-bande1 { left: 142px; }
  .vt-ma .ma-bande2 { left: 244px; }
  .vt-ma .ma-vignette { position: absolute; inset: 0; box-shadow: inset 0 0 42px rgba(20,20,20,.12); }
  .vt-ma .ma-frame {
    position: absolute; right: 12px; top: 20px; width: 144px; height: 206px;
    border: 2px solid #141414; background: #EFE9DC; padding: 5px;
    box-shadow: 8px 10px 0 rgba(20,20,20,.10);
  }
  .vt-ma .ma-photo { position: relative; width: 100%; height: 100%; border: 2px solid #141414; overflow: hidden; }
  .vt-ma .ma-photo .vt-avatar-img { position: absolute; inset: 0; object-position: 50% 26%; border-radius: 0; }
  .vt-ma .ma-damier {
    position: absolute; left: 0; right: 0; bottom: 0; height: 18px;
    background: conic-gradient(#141414 90deg, #EFE9DC 90deg 180deg, #141414 180deg 270deg, #EFE9DC 270deg);
    background-size: 28px 28px;
  }
  .vt-ma .ma-frame-motif {
    position: absolute; inset: 0; background-color: #EFE9DC;
    background-image: repeating-linear-gradient(0deg, rgba(20,20,20,.06) 0 2px, transparent 2px 14px);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ma .ma-motif-cible {
    position: absolute; top: 10px; left: 10px; width: 30px; height: 30px; border-radius: 50%;
    background: repeating-radial-gradient(circle, transparent 0 4px, #C8332A 4px 6px);
  }
  .vt-ma .ma-mono { font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; font-weight: 800; font-size: 64px; color: #141414; }
  .vt-ma .ma-col { position: relative; width: calc(100% - 168px); min-height: 206px; padding: 6px 0 10px 16px; }
  .vt-ma .ma-bienv { margin-top: 3px; display: inline-flex; flex-direction: column; gap: 2px; font-family: 'Caveat', 'Segoe Script', cursive; font-weight: 700; font-size: 26px; line-height: 1; color: #141414; }
  .vt-ma .ma-name {
    margin-top: 0; font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; font-weight: 800;
    line-height: .88; letter-spacing: -.025em; font-size: clamp(38px, 13.8cqw, 52px);
    color: #141414; overflow-wrap: normal; hyphens: none;
  }
  .vt-ma .ma-name .vt-ent-acc { color: #C8332A; }
  .vt-ma .ma-name.vt-ent-long { font-size: 38px; }
  .vt-ma .ma-name.vt-ent-xlong { font-size: 21px; }
  .vt-ma .ma-verif { margin-top: 5px; font-size: 12px; font-weight: 600; line-height: 15px; color: #5A554D; }
  .vt-ma .ma-verif svg { vertical-align: -2px; margin-right: 4px; }
  .vt-ma .ma-zone { margin-top: 1px; font-size: 13px; font-weight: 600; line-height: 17px; color: #5A554D; }
  .vt-ma .ma-proofrow { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .vt-ma .ma-proof {
    display: inline-flex; align-items: center; min-height: 34px; min-width: 138px; max-width: 100%;
    padding: 5px 12px; background: #141414; border: 1px solid #141414; border-radius: 2px;
    box-shadow: 3px 3px 0 #C8332A; color: #EFE9DC; font-size: 11.5px; line-height: 14px;
  }
  .vt-ma .ma-proof b { font-weight: 700; margin-right: 4px; }
  .vt-ma .ma-stars {
    display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 3px 10px;
    background: #EFE9DC; border: 1px solid #141414; border-radius: 2px; white-space: nowrap;
  }
  .vt-ma .ma-stars span { font-size: 11.5px; font-weight: 600; color: #141414; }
  .vt-ma .ma-nouv-wrap { margin-top: 8px; }
  .vt-ma .ma-nouv {
    display: inline-flex; align-items: center; gap: 4px; min-height: 32px; min-width: 132px;
    padding: 6px 14px; background: #141414; border-radius: 0; box-shadow: 3px 3px 0 #C8332A;
    transform: rotate(-1.5deg); color: #FFFFFF; font-size: 12px; font-weight: 700; line-height: 14px;
    text-transform: uppercase; letter-spacing: .02em; white-space: nowrap;
  }
  .vt-ma .ma-nouv-acc { color: #C8332A; }
  .vt-ma .ma-frise {
    position: absolute; left: 0; right: 0; bottom: 0; height: 8px;
    background: repeating-linear-gradient(90deg, #141414 0 8px, #C8332A 8px 16px);
  }
  .vt-ma .ma-trust { position: relative; height: 74px; background: #141414; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; padding: 0 12px; }
  .vt-ma .ma-cell { height: 100%; padding: 0 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
  .vt-ma .ma-cell + .ma-cell { border-left: 1px solid rgba(239,233,220,.28); }
  .vt-ma .ma-cell-i { width: 30px; height: 30px; flex: none; border-radius: 50%; background: #EFE9DC; border: 2px solid #C8332A; display: flex; align-items: center; justify-content: center; }
  .vt-ma .ma-cell-l { font-size: 10.5px; font-weight: 700; line-height: 1.2; color: #EFE9DC; }
  .vt-ma .ma-cell-s { font-size: 8.5px; line-height: 1.24; color: rgba(239,233,220,.72); }
  .vt-ma .ma-btn { background: #EFE9DC; border: 2px solid #C8332A; }
  .vt-ma .vt-ent-btn { top: 84px; }
  .vt-ma .vt-ent-back { right: 20px; }

  /* verifier m3 — hierarchy holds on the xlong tier: the greeting steps
     down with the name (sibling rule; name precedes Bienvenue in the DOM). */
  .vt-ma .ma-name.vt-ent-xlong + .ma-bienv { font-size: 16px; }

  /* ══════════════════════ 7 · HARMATTAN ══════════════════════ */
  .vt-ha { background: #4E2C18; }
  .vt-ha .ha-hero {
    position: relative; overflow: hidden;
    margin-top: -60px; padding-top: 60px;
    background-color: #EEB26F;
    background-image:
      radial-gradient(circle at 72% 18%, rgba(255,247,234,.95) 0 8%, rgba(255,231,168,.52) 26%, transparent 56%),
      linear-gradient(18deg, transparent 22%, rgba(255,247,234,.20) 43%, transparent 67%),
      radial-gradient(circle, rgba(255,244,215,.35) 1px, transparent 1.6px),
      linear-gradient(180deg, #F7D6A6 0%, #EEB26F 44%, #DE8A52 100%);
    background-size: auto, auto, 17px 17px, auto;
  }
  .vt-ha .ha-scene { position: relative; height: 246px; }
  .vt-ha .ha-soleil { position: absolute; right: 42px; top: 22px; width: 112px; height: 112px; border-radius: 50%; background: #FFE7A8; border: 2px solid rgba(255,247,234,.85); }
  .vt-ha .ha-dune { position: absolute; border-radius: 50%; }
  .vt-ha .ha-dune1 { left: -28px; bottom: -42px; width: 230px; height: 74px; background: #D98547; }
  .vt-ha .ha-dune2 { right: -52px; bottom: -54px; width: 260px; height: 90px; background: #C86F3D; }
  .vt-ha .ha-vent { position: absolute; left: -8px; top: 112px; opacity: .5; }
  .vt-ha .ha-acacia1 { position: absolute; left: 4px; bottom: 20px; opacity: .32; }
  .vt-ha .ha-acacia2 { position: absolute; right: 10px; bottom: 34px; opacity: .32; }
  .vt-ha .ha-calaos { position: absolute; right: 40px; top: 160px; opacity: .8; }
  .vt-ha .ha-bokeh {
    position: absolute; inset: 0;
    background-image:
      radial-gradient(circle 3px at 58% 6%, rgba(255,247,234,.20) 98%, transparent),
      radial-gradient(circle 5px at 66% 14%, rgba(255,247,234,.22) 98%, transparent),
      radial-gradient(circle 9px at 84% 8%, rgba(255,247,234,.18) 98%, transparent),
      radial-gradient(circle 4px at 92% 26%, rgba(255,247,234,.26) 98%, transparent),
      radial-gradient(circle 6px at 88% 44%, rgba(255,247,234,.16) 98%, transparent),
      radial-gradient(circle 3px at 94% 64%, rgba(255,247,234,.20) 98%, transparent),
      radial-gradient(circle 4px at 78% 86%, rgba(255,247,234,.14) 98%, transparent),
      radial-gradient(circle 7px at 60% 90%, rgba(255,247,234,.10) 98%, transparent),
      radial-gradient(circle 5px at 70% 78%, rgba(255,247,234,.12) 98%, transparent),
      radial-gradient(circle 2px at 50% 4%, rgba(255,247,234,.20) 98%, transparent),
      radial-gradient(circle 6px at 96% 10%, rgba(255,247,234,.24) 98%, transparent),
      radial-gradient(circle 5px at 90% 80%, rgba(255,247,234,.12) 98%, transparent),
      radial-gradient(circle 2px at 64% 30%, rgba(255,247,234,.28) 98%, transparent),
      radial-gradient(circle 4px at 82% 60%, rgba(255,247,234,.18) 98%, transparent);
  }
  .vt-ha .ha-vignette { position: absolute; inset: 0; box-shadow: inset 0 0 52px rgba(92,48,23,.18); }
  .vt-ha .ha-frame {
    position: absolute; right: 18px; top: 18px; width: 132px; height: 132px; border-radius: 50%;
    overflow: hidden; border: 2px solid rgba(255,247,234,.88);
    box-shadow: 0 0 0 8px rgba(255,231,168,.24), 0 0 28px rgba(255,231,168,.54);
  }
  .vt-ha .ha-frame .vt-avatar-img { position: absolute; inset: 0; object-position: 50% 24%; }
  .vt-ha .ha-frame-motif {
    position: absolute; inset: 0;
    background: radial-gradient(120% 120% at 34% 24%, #F3C98F 0%, #D98547 78%);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ha .ha-mono { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; font-size: 56px; color: #4E2C18; }
  .vt-ha .ha-col { position: relative; width: calc(100% - 154px); min-height: 210px; padding: 6px 0 10px 16px; }
  .vt-ha .ha-bienv { margin-top: 3px; display: inline-flex; flex-direction: column; gap: 3px; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 600; font-size: 24px; line-height: 1; color: #A94F24; }
  .vt-ha .ha-name {
    margin-top: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700;
    line-height: .86; letter-spacing: -.035em; font-size: clamp(36px, 13.2cqw, 50px);
    color: #4E2C18; overflow-wrap: normal; hyphens: none;
  }
  .vt-ha .ha-name .vt-ent-acc { color: #FFF7EA; text-shadow: 0 2px 14px rgba(78,44,24,.28); }
  .vt-ha .ha-name.vt-ent-long { font-size: 38px; }
  .vt-ha .ha-name.vt-ent-xlong { font-size: 25px; }
  .vt-ha .ha-verif { margin-top: 5px; font-size: 12px; font-weight: 600; line-height: 15px; color: #6A432C; }
  .vt-ha .ha-verif svg { vertical-align: -2px; margin-right: 4px; }
  .vt-ha .ha-zone { margin-top: 1px; font-size: 13px; font-weight: 600; line-height: 17px; color: #6A432C; }
  .vt-ha .ha-proofrow { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .vt-ha .ha-proof {
    display: inline-flex; align-items: center; min-height: 38px; min-width: 150px; max-width: 100%;
    padding: 6px 14px; background: rgba(255,247,234,.78); border: 1px solid rgba(78,44,24,.22);
    border-radius: 19px; box-shadow: 0 8px 18px rgba(78,44,24,.12);
    color: #4E2C18; font-size: 11.5px; line-height: 14px;
  }
  .vt-ha .ha-proof b { font-weight: 700; margin-right: 4px; }
  .vt-ha .ha-stars {
    display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 3px 11px;
    background: rgba(78,44,24,.88); border-radius: 13px; white-space: nowrap;
  }
  .vt-ha .ha-stars span { font-size: 11.5px; font-weight: 600; color: #FFF7EA; }
  .vt-ha .ha-nouv-wrap { margin-top: 4px; }
  .vt-ha .ha-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    width: 76px; height: 76px; border-radius: 50%; border: 2px dashed #D96F24;
    background: rgba(255,231,168,.76); transform: rotate(2deg); text-align: center;
  }
  .vt-ha .ha-nouv-rais {
    position: absolute; inset: -7px; border-radius: 50%;
    background: repeating-conic-gradient(#D96F24 0deg 5deg, transparent 5deg 30deg);
    -webkit-mask: radial-gradient(circle, transparent 0 56%, #000 57%);
    mask: radial-gradient(circle, transparent 0 56%, #000 57%);
  }
  .vt-ha .ha-nouv-t { font-size: 11px; font-weight: 700; line-height: 1.25; color: #A94F24; padding: 0 6px; }
  .vt-ha .ha-trust { position: relative; height: 74px; background: #4E2C18; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; padding: 0 12px; }
  .vt-ha .ha-cell { height: 100%; padding: 0 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
  .vt-ha .ha-cell + .ha-cell { border-left: 1px solid rgba(247,214,166,.28); }
  .vt-ha .ha-cell-i { width: 30px; height: 30px; flex: none; border-radius: 50%; background: #F7D6A6; border: 1px solid rgba(255,231,168,.60); display: flex; align-items: center; justify-content: center; }
  .vt-ha .ha-cell-l { font-size: 10.5px; font-weight: 700; line-height: 1.2; color: #FFF7EA; }
  .vt-ha .ha-cell-s { font-size: 8.5px; line-height: 1.24; color: rgba(247,214,166,.72); }
  .vt-ha .ha-btn { background: rgba(255,247,234,.85); border: 1px solid rgba(78,44,24,.25); }
  .vt-ha .vt-ent-btn { top: 80px; }
  .vt-ha .vt-ent-back { right: 20px; }

  .vt-ha .ha-name.vt-ent-xlong + .ha-bienv { font-size: 16px; }

  /* ══════════════════════ 8 · BALAFON ══════════════════════ */
  .vt-ba { background: #160D18; }
  .vt-ba .ba-hero {
    position: relative; overflow: hidden;
    margin-top: -60px; padding-top: 60px;
    background-color: #211223;
    background-image:
      radial-gradient(ellipse at 50% 100%, rgba(232,180,118,.28), transparent 62%),
      linear-gradient(180deg, #2E1B2E 0%, #211223 56%, #160D18 100%);
  }
  .vt-ba .ba-scene { position: relative; height: 248px; }
  .vt-ba .ba-cone { position: absolute; top: -60px; width: 90px; height: 200px; clip-path: polygon(40% 0, 60% 0, 100% 100%, 0 100%); }
  .vt-ba .ba-cone-l { left: 22px; transform: rotate(18deg); background: linear-gradient(180deg, rgba(184,134,217,.28), transparent 85%); }
  .vt-ba .ba-cone-r { right: 8px; transform: rotate(-18deg); background: linear-gradient(180deg, rgba(232,180,118,.30), transparent 85%); }
  .vt-ba .ba-portee { position: absolute; right: 4px; bottom: 44px; opacity: .8; }
  .vt-ba .ba-reso { position: absolute; bottom: -30px; width: 58px; height: 58px; border-radius: 50%; border: 2px solid rgba(232,180,118,.55); }
  .vt-ba .ba-reso1 { left: 24px; }
  .vt-ba .ba-reso2 { left: 120px; }
  .vt-ba .ba-reso3 { left: 216px; }
  .vt-ba .ba-touche { position: absolute; bottom: 2px; width: 92px; height: 26px; border-radius: 9px; background: linear-gradient(180deg, #E8B476, #C98A3B); box-shadow: inset 0 1px 0 rgba(255,244,221,.55), 0 5px 0 #8F5D2B; }
  .vt-ba .ba-touche1 { left: 8px; transform: rotate(-1deg); }
  .vt-ba .ba-touche2 { left: 104px; }
  .vt-ba .ba-touche3 { left: 200px; transform: rotate(1deg); }
  .vt-ba .ba-bokeh {
    position: absolute; inset: 0;
    background-image:
      radial-gradient(circle 4px at 8% 6%, rgba(184,134,217,.20) 98%, transparent),
      radial-gradient(circle 6px at 20% 12%, rgba(232,180,118,.16) 98%, transparent),
      radial-gradient(circle 3px at 34% 5%, rgba(255,244,221,.22) 98%, transparent),
      radial-gradient(circle 8px at 48% 10%, rgba(184,134,217,.10) 98%, transparent),
      radial-gradient(circle 4px at 60% 4%, rgba(232,180,118,.24) 98%, transparent),
      radial-gradient(circle 5px at 72% 14%, rgba(184,134,217,.14) 98%, transparent),
      radial-gradient(circle 9px at 88% 8%, rgba(232,180,118,.08) 98%, transparent),
      radial-gradient(circle 3px at 94% 22%, rgba(255,244,221,.18) 98%, transparent),
      radial-gradient(circle 5px at 90% 40%, rgba(184,134,217,.12) 98%, transparent),
      radial-gradient(circle 4px at 96% 58%, rgba(232,180,118,.16) 98%, transparent),
      radial-gradient(circle 6px at 86% 70%, rgba(184,134,217,.10) 98%, transparent),
      radial-gradient(circle 3px at 92% 84%, rgba(255,244,221,.14) 98%, transparent);
  }
  .vt-ba .ba-vignette { position: absolute; inset: 0; box-shadow: inset 0 0 54px rgba(9,4,10,.24); }
  .vt-ba .ba-medaille { position: absolute; right: 16px; top: 34px; width: 126px; height: 126px; }
  .vt-ba .ba-frame {
    position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
    border: 4px solid #E8B476;
    box-shadow: 0 0 0 4px #2E1B2E, 0 0 0 6px #B886D9, 0 0 24px rgba(184,134,217,.22);
  }
  .vt-ba .ba-frame .vt-avatar-img { position: absolute; inset: 0; object-position: 50% 24%; }
  .vt-ba .ba-frame-motif {
    position: absolute; inset: 0;
    background: radial-gradient(120% 120% at 32% 24%, #3C2440 0%, #211223 78%);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ba .ba-mono { font-family: 'Sora', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 52px; color: #E8B476; }
  .vt-ba .ba-note { position: absolute; right: -4px; top: 16px; }
  .vt-ba .ba-col { position: relative; width: calc(100% - 150px); min-height: 200px; padding: 6px 0 10px 16px; }
  .vt-ba .ba-bienv { margin-top: 3px; display: inline-flex; align-items: center; gap: 8px; font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 600; font-size: 25px; line-height: 1; color: #B886D9; }
  .vt-ba .ba-los { width: 6px; height: 6px; flex: none; background: #B886D9; transform: rotate(45deg); }
  .vt-ba .ba-name {
    margin-top: 0; font-family: 'Sora', 'Instrument Sans', sans-serif; font-weight: 800;
    line-height: .90; letter-spacing: -.045em; font-size: clamp(34px, 12.8cqw, 48px);
    color: #FFF4DD; overflow-wrap: normal; hyphens: none;
  }
  .vt-ba .ba-name .vt-ent-acc { color: #E8B476; }
  .vt-ba .ba-name.vt-ent-long { font-size: 36px; }
  .vt-ba .ba-name.vt-ent-xlong { font-size: 22px; }
  .vt-ba .ba-verif { margin-top: 5px; font-size: 12px; font-weight: 600; line-height: 15px; color: #D3C3D7; }
  .vt-ba .ba-verif svg { vertical-align: -2px; margin-right: 4px; }
  .vt-ba .ba-zone { margin-top: 1px; font-size: 13px; font-weight: 600; line-height: 17px; color: #D3C3D7; }
  .vt-ba .ba-proofrow { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .vt-ba .ba-proof {
    display: inline-flex; align-items: center; min-height: 40px; min-width: 152px; max-width: 100%;
    padding: 6px 14px; background: rgba(22,13,24,.78); border: 1px solid rgba(232,180,118,.55);
    border-radius: 20px; box-shadow: 0 10px 20px rgba(9,4,10,.22);
    color: #FFF4DD; font-size: 11.5px; line-height: 14px;
  }
  .vt-ba .ba-proof b { font-weight: 700; color: #E8B476; margin-right: 4px; }
  .vt-ba .ba-stars {
    display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 3px 11px;
    background: #56375F; border-radius: 13px; white-space: nowrap;
  }
  .vt-ba .ba-stars span { font-size: 11.5px; font-weight: 600; color: #FFF4DD; }
  .vt-ba .ba-nouv-wrap { margin-top: 8px; }
  .vt-ba .ba-nouv {
    display: inline-flex; align-items: center; gap: 8px; min-width: 124px; min-height: 34px;
    padding: 6px 12px; border-radius: 10px; background: linear-gradient(180deg, #E8B476, #C98A3B);
    box-shadow: inset 0 1px 0 rgba(255,244,221,.55), 0 4px 0 #8F5D2B;
    transform: rotate(-3deg); white-space: nowrap;
  }
  .vt-ba .ba-oeillet { width: 5px; height: 5px; flex: none; border-radius: 50%; background: #2E1B2E; }
  .vt-ba .ba-nouv-t { font-size: 12px; font-weight: 700; line-height: 14px; color: #2E1B2E; }
  .vt-ba .ba-trust { position: relative; height: 72px; background: #160D18; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; padding: 0 12px; }
  .vt-ba .ba-cell { height: 100%; padding: 0 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
  .vt-ba .ba-cell + .ba-cell { border-left: 1px solid rgba(184,134,217,.28); }
  .vt-ba .ba-cell-i { width: 30px; height: 30px; flex: none; border-radius: 50%; background: radial-gradient(circle, #E8B476 0 34%, #C98A3B 35% 70%, #6E431F 71%); display: flex; align-items: center; justify-content: center; }
  .vt-ba .ba-cell-l { font-size: 10.5px; font-weight: 700; line-height: 1.2; color: #FFF4DD; }
  .vt-ba .ba-cell-s { font-size: 8.5px; line-height: 1.24; color: rgba(232,215,232,.70); }
  .vt-ba .ba-btn { background: rgba(22,13,24,.6); border: 1px solid rgba(232,180,118,.55); }
  .vt-ba .vt-ent-btn { top: 70px; }
  .vt-ba .vt-ent-back { right: 20px; }

  .vt-ba .ba-name.vt-ent-xlong + .ba-bienv { font-size: 16px; }

  /* ══════════════════════ 9 · SÉANCE ══════════════════════ */
  .vt-se { background: #0D0916; }
  .vt-se .se-hero {
    position: relative; overflow: hidden;
    margin-top: -60px; padding-top: 60px;
    background-color: #100B1D;
    background-image:
      radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1.4px),
      linear-gradient(180deg, #171226 0%, #100B1D 65%, #0D0916 100%);
    background-size: 9px 9px, auto;
  }
  .vt-se .se-scene { position: relative; height: 246px; }
  .vt-se .se-proj {
    position: absolute; left: -48px; top: 18px; width: 230px; height: 170px;
    transform: rotate(10deg); clip-path: polygon(0 42%, 100% 0, 100% 100%, 0 58%);
    background: linear-gradient(90deg, rgba(232,184,75,.52), rgba(232,184,75,.08));
  }
  .vt-se .se-contre {
    position: absolute; right: -20px; top: 4px; width: 160px; height: 120px;
    transform: rotate(-15deg); clip-path: polygon(100% 40%, 0 0, 0 100%, 100% 60%);
    background: linear-gradient(270deg, rgba(184,154,232,.18), transparent 85%);
  }
  .vt-se .se-pouss {
    position: absolute; left: -30px; top: 30px; width: 220px; height: 140px; transform: rotate(10deg);
    background-image:
      radial-gradient(circle 1.5px at 10% 30%, rgba(255,249,236,.32) 98%, transparent),
      radial-gradient(circle 1px at 22% 55%, rgba(255,249,236,.22) 98%, transparent),
      radial-gradient(circle 2px at 30% 40%, rgba(255,249,236,.18) 98%, transparent),
      radial-gradient(circle 1px at 42% 62%, rgba(255,249,236,.28) 98%, transparent),
      radial-gradient(circle 1.5px at 55% 45%, rgba(255,249,236,.24) 98%, transparent),
      radial-gradient(circle 1px at 66% 58%, rgba(255,249,236,.16) 98%, transparent),
      radial-gradient(circle 2px at 74% 48%, rgba(255,249,236,.20) 98%, transparent),
      radial-gradient(circle 1px at 84% 52%, rgba(255,249,236,.12) 98%, transparent),
      radial-gradient(circle 1.5px at 16% 44%, rgba(255,249,236,.26) 98%, transparent),
      radial-gradient(circle 1px at 36% 50%, rgba(255,249,236,.14) 98%, transparent),
      radial-gradient(circle 1px at 50% 36%, rgba(255,249,236,.22) 98%, transparent),
      radial-gradient(circle 1.5px at 62% 40%, rgba(255,249,236,.18) 98%, transparent),
      radial-gradient(circle 1px at 70% 60%, rgba(255,249,236,.26) 98%, transparent),
      radial-gradient(circle 1px at 80% 42%, rgba(255,249,236,.16) 98%, transparent),
      radial-gradient(circle 2px at 90% 55%, rgba(255,249,236,.12) 98%, transparent),
      radial-gradient(circle 1px at 6% 52%, rgba(255,249,236,.20) 98%, transparent),
      radial-gradient(circle 1px at 26% 34%, rgba(255,249,236,.24) 98%, transparent),
      radial-gradient(circle 1.5px at 46% 56%, rgba(255,249,236,.14) 98%, transparent),
      radial-gradient(circle 1px at 58% 62%, rgba(255,249,236,.18) 98%, transparent),
      radial-gradient(circle 1px at 88% 38%, rgba(255,249,236,.22) 98%, transparent);
  }
  .vt-se .se-bobine { position: absolute; right: -12px; top: 8px; opacity: .12; }
  .vt-se .se-skyline {
    position: absolute; left: 0; right: 0; bottom: 0; height: 28px; background: #0A0710;
    clip-path: polygon(0 100%, 0 55%, 6% 55%, 6% 30%, 11% 30%, 11% 60%, 18% 60%, 18% 20%, 24% 20%, 24% 55%, 32% 55%, 32% 38%, 38% 38%, 38% 70%, 46% 70%, 46% 45%, 53% 45%, 53% 25%, 59% 25%, 59% 60%, 66% 60%, 66% 35%, 73% 35%, 73% 65%, 80% 65%, 80% 42%, 87% 42%, 87% 58%, 93% 58%, 93% 30%, 100% 30%, 100% 100%);
  }
  .vt-se .se-etoiles {
    position: absolute; inset: 0;
    background-image:
      radial-gradient(circle 2px at 8% 10%, rgba(255,249,236,.8) 98%, transparent),
      radial-gradient(circle 1.5px at 46% 6%, rgba(255,249,236,.6) 98%, transparent),
      radial-gradient(circle 2.5px at 90% 74%, rgba(255,249,236,.5) 98%, transparent);
  }
  .vt-se .se-vignette { position: absolute; inset: 0; box-shadow: inset 0 0 60px rgba(0,0,0,.26); }
  .vt-se .se-frame {
    position: absolute; right: 12px; top: 18px; width: 142px; height: 206px;
    background: #110D18; box-shadow: 0 14px 28px rgba(0,0,0,.28);
  }
  .vt-se .se-perfo { position: absolute; top: 6px; bottom: 6px; width: 7px; background: repeating-linear-gradient(180deg, #F4F0E8 0 10px, transparent 10px 16px); }
  .vt-se .se-perfo-l { left: 1.5px; }
  .vt-se .se-perfo-r { right: 1.5px; }
  .vt-se .se-photo { position: absolute; inset: 8px 15px; overflow: hidden; border: 1px solid rgba(255,249,236,.20); }
  .vt-se .se-photo .vt-avatar-img { position: absolute; inset: 0; object-position: 50% 24%; border-radius: 0; }
  .vt-se .se-frame-motif {
    position: absolute; inset: 0; background-color: #FFF9EC;
    background-image: radial-gradient(circle, rgba(23,18,38,.06) 1px, transparent 1.4px);
    background-size: 9px 9px;
    display: flex; align-items: center; justify-content: center;
  }
  .vt-se .se-mono { font-family: 'Archivo', system-ui, sans-serif; font-weight: 900; font-size: 64px; color: #E8B84B; }
  .vt-se .se-col { position: relative; width: calc(100% - 166px); min-height: 206px; padding: 6px 0 10px 16px; }
  .vt-se .se-bienv { margin-top: 3px; font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 600; font-size: 25px; line-height: 1; color: #B89AE8; }
  .vt-se .se-name {
    margin-top: 0; font-family: 'Archivo', system-ui, sans-serif; font-weight: 900;
    line-height: .90; letter-spacing: -.045em; font-size: clamp(34px, 12.4cqw, 46px);
    color: #FFF9EC; overflow-wrap: normal; hyphens: none;
  }
  .vt-se .se-name .vt-ent-acc { color: #E8B84B; text-shadow: 0 0 10px rgba(232,184,75,.32); }
  .vt-se .se-name.vt-ent-long { font-size: 35px; }
  .vt-se .se-name.vt-ent-xlong { font-size: 19px; }
  .vt-se .se-ampoules {
    display: block; margin-top: 4px; width: 138px; height: 8px;
    background-image: radial-gradient(circle 4px at 4px 4px, #E8B84B 2.6px, rgba(232,184,75,.35) 3px, transparent 4px);
    background-size: 18px 8px; background-repeat: repeat-x;
  }
  .vt-se .se-verif { margin-top: 5px; font-size: 12px; font-weight: 600; line-height: 15px; color: #C8BCD8; }
  .vt-se .se-verif svg { vertical-align: -2px; margin-right: 4px; }
  .vt-se .se-zone { margin-top: 1px; font-size: 13px; font-weight: 600; line-height: 17px; color: #C8BCD8; }
  .vt-se .se-proofrow { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .vt-se .se-proof {
    display: inline-flex; align-items: center; min-height: 38px; min-width: 146px; max-width: 100%;
    padding: 6px 16px; background: #B89AE8; border: 1px solid rgba(255,255,255,.25);
    border-radius: 3px; color: #171226; font-size: 11.5px; line-height: 14px;
    -webkit-mask: radial-gradient(circle 5px at 0 50%, transparent 5px, #000 5.5px), radial-gradient(circle 5px at 100% 50%, transparent 5px, #000 5.5px);
    -webkit-mask-composite: source-in;
    mask: radial-gradient(circle 5px at 0 50%, transparent 5px, #000 5.5px), radial-gradient(circle 5px at 100% 50%, transparent 5px, #000 5.5px);
    mask-composite: intersect;
  }
  .vt-se .se-proof b { font-weight: 700; margin-right: 4px; }
  .vt-se .se-stars {
    display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 3px 11px;
    background: #2B2041; border-radius: 3px; white-space: nowrap;
  }
  .vt-se .se-stars span { font-size: 11.5px; font-weight: 600; color: #FFF9EC; }
  .vt-se .se-nouv-wrap { margin-top: 8px; }
  .vt-se .se-nouv {
    display: inline-flex; align-items: center; gap: 8px; min-width: 122px; min-height: 42px;
    padding: 8px 16px; background: #E8B84B; border-radius: 3px; transform: rotate(-4deg);
    white-space: nowrap;
    -webkit-mask: radial-gradient(circle 6px at 0 50%, transparent 6px, #000 6.5px), radial-gradient(circle 6px at 100% 50%, transparent 6px, #000 6.5px);
    -webkit-mask-composite: source-in;
    mask: radial-gradient(circle 6px at 0 50%, transparent 6px, #000 6.5px), radial-gradient(circle 6px at 100% 50%, transparent 6px, #000 6.5px);
    mask-composite: intersect;
  }
  .vt-se .se-nouv-t { font-size: 12px; font-weight: 700; line-height: 14px; color: #171226; }
  .vt-se .se-trust { position: relative; height: 74px; background: #0D0916; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; padding: 0 12px; }
  .vt-se .se-cell { height: 100%; padding: 0 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
  .vt-se .se-cell + .se-cell { border-left: 1px solid rgba(184,154,232,.30); }
  .vt-se .se-cell-i { width: 30px; height: 30px; flex: none; border-radius: 50%; background: #2B2041; border: 1px solid rgba(232,184,75,.55); display: flex; align-items: center; justify-content: center; }
  .vt-se .se-cell-l { font-size: 10.5px; font-weight: 700; line-height: 1.2; color: #FFF9EC; }
  .vt-se .se-cell-s { font-size: 8.5px; line-height: 1.24; color: rgba(184,154,232,.72); }
  .vt-se .se-btn { background: #2B2041; border: 1px solid rgba(232,184,75,.55); }
  .vt-se .vt-ent-btn { top: 84px; }
  .vt-se .vt-ent-back { right: 20px; }

  .vt-se .se-name.vt-ent-xlong + .se-bienv { font-size: 16px; }

  /* ══════════════════════ 10 · CAURIS ══════════════════════ */
  .vt-ca { background: #0E3E36; }
  .vt-ca .ca-hero {
    position: relative; overflow: hidden;
    margin-top: -60px; padding-top: 60px;
    background-color: #0F493F;
    background-image:
      radial-gradient(ellipse at 62% 16%, rgba(200,240,222,.24), transparent 58%),
      radial-gradient(ellipse 13px 6px at 50% 50%, rgba(255,247,232,.05) 98%, transparent),
      linear-gradient(180deg, #145248 0%, #0F493F 56%, #0E3E36 100%);
    background-size: auto, 64px 52px, auto;
  }
  .vt-ca .ca-scene { position: relative; height: 248px; }
  .vt-ca .ca-ray { position: absolute; top: -60px; height: 340px; transform: rotate(17deg); }
  .vt-ca .ca-ray1 { left: 26%; width: 44px; background: linear-gradient(180deg, rgba(200,240,222,.10), transparent 70%); }
  .vt-ca .ca-ray2 { left: 42%; width: 58px; background: linear-gradient(180deg, rgba(200,240,222,.16), transparent 70%); }
  .vt-ca .ca-ray3 { left: 60%; width: 72px; background: linear-gradient(180deg, rgba(200,240,222,.08), transparent 70%); }
  .vt-ca .ca-vagues {
    position: absolute; right: -20px; top: 20px; width: 200px; height: 200px; border-radius: 50%;
    background: repeating-radial-gradient(circle, rgba(200,240,222,.22) 0 1.5px, transparent 1.5px 18px);
  }
  .vt-ca .ca-cauri1 { position: absolute; left: 8px; top: -46px; transform: rotate(-18deg); }
  .vt-ca .ca-cauri2 { position: absolute; right: 60px; top: -44px; transform: rotate(14deg); }
  .vt-ca .ca-cauri3 { position: absolute; right: 162px; bottom: 10px; transform: rotate(28deg); }
  .vt-ca .ca-cauri4 { position: absolute; left: 52px; top: -28px; transform: rotate(-8deg); }
  .vt-ca .ca-bulles {
    position: absolute; right: 154px; top: 50px; width: 14px; height: 100px;
    background-image:
      radial-gradient(circle 3px at 7px 90px, rgba(200,240,222,.4) 98%, transparent),
      radial-gradient(circle 4px at 5px 66px, rgba(200,240,222,.34) 98%, transparent),
      radial-gradient(circle 5px at 8px 40px, rgba(200,240,222,.28) 98%, transparent),
      radial-gradient(circle 6px at 6px 10px, rgba(200,240,222,.22) 98%, transparent);
  }
  .vt-ca .ca-sable {
    position: absolute; left: -28px; bottom: -54px; width: 420px; height: 92px;
    border-radius: 50%; transform: rotate(-3deg);
    background: linear-gradient(180deg, #D9B87A, #B99459);
  }
  .vt-ca .ca-vignette { position: absolute; inset: 0; box-shadow: inset 0 0 56px rgba(3,33,29,.22); }
  .vt-ca .ca-frame {
    position: absolute; right: 14px; top: 22px; width: 132px; height: 202px;
    border-radius: 50% / 42%; overflow: hidden; border: 5px solid #FFF7E8;
    box-shadow: 0 0 0 2px #D8CCB7, 0 14px 28px rgba(3,33,29,.22);
  }
  .vt-ca .ca-frame .vt-avatar-img { position: absolute; inset: 0; object-position: 50% 24%; border-radius: 0; }
  .vt-ca .ca-frame-ring { position: absolute; right: 7px; top: 15px; width: 146px; height: 216px; border-radius: 50% / 42%; border: 2px dashed #C8F0DE; }
  .vt-ca .ca-frame-motif {
    position: absolute; inset: 0;
    background: radial-gradient(120% 120% at 34% 22%, #1C6455 0%, #0F493F 78%);
    display: flex; align-items: center; justify-content: center;
  }
  .vt-ca .ca-mono { font-family: 'Sora', 'Instrument Sans', sans-serif; font-weight: 800; font-size: 52px; color: #D9B87A; }
  .vt-ca .ca-col { position: relative; width: calc(100% - 156px); min-height: 204px; padding: 6px 0 10px 16px; }
  .vt-ca .ca-bienv { margin-top: 3px; display: inline-flex; flex-direction: column; gap: 3px; font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 600; font-size: 25px; line-height: 1; color: #C8F0DE; }
  .vt-ca .ca-pinceau { width: 72px; height: 4px; border-radius: 2px; background: #D9B87A; }
  .vt-ca .ca-name {
    margin-top: 0; font-family: 'Sora', 'Instrument Sans', sans-serif; font-weight: 800;
    line-height: .90; letter-spacing: -.04em; font-size: clamp(36px, 13cqw, 49px);
    color: #FFF7E8; overflow-wrap: normal; hyphens: none;
  }
  .vt-ca .ca-name .vt-ent-acc { color: #D9B87A; }
  .vt-ca .ca-name.vt-ent-long { font-size: 37px; }
  .vt-ca .ca-name.vt-ent-xlong { font-size: 21px; }
  .vt-ca .ca-verif { margin-top: 5px; font-size: 12px; font-weight: 600; line-height: 15px; color: #B7DACB; }
  .vt-ca .ca-verif svg { vertical-align: -2px; margin-right: 4px; }
  .vt-ca .ca-zone { margin-top: 1px; font-size: 13px; font-weight: 600; line-height: 17px; color: #B7DACB; }
  .vt-ca .ca-proofrow { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .vt-ca .ca-proof {
    display: inline-flex; align-items: center; min-height: 40px; min-width: 152px; max-width: 100%;
    padding: 6px 14px; background: rgba(14,62,54,.88); border: 1px solid rgba(217,184,122,.70);
    border-radius: 20px; box-shadow: 0 8px 18px rgba(3,33,29,.20);
    color: #FFF7E8; font-size: 11.5px; line-height: 14px;
  }
  .vt-ca .ca-proof b { font-weight: 700; color: #D9B87A; margin-right: 4px; }
  .vt-ca .ca-stars {
    display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 3px 11px;
    background: #FFF7E8; border-radius: 13px; white-space: nowrap;
  }
  .vt-ca .ca-stars span { font-size: 11.5px; font-weight: 600; color: #145248; }
  .vt-ca .ca-nouv-wrap { margin-top: 8px; }
  .vt-ca .ca-nouv {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    min-width: 122px; min-height: 56px; padding: 8px 18px; border-radius: 50% / 50%;
    background: #FFF7E8; box-shadow: inset 0 0 0 2px #D8CCB7, 0 8px 18px rgba(3,33,29,.24);
    transform: rotate(8deg); text-align: center;
  }
  .vt-ca .ca-nouv-fente { position: absolute; top: 7px; left: 26%; right: 26%; border-top: 1.5px dashed #8A7155; }
  .vt-ca .ca-nouv-t { font-size: 11px; font-weight: 700; line-height: 1.3; color: #145248; }
  .vt-ca .ca-trust { position: relative; height: 72px; background: #0E3E36; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; padding: 0 12px; }
  .vt-ca .ca-cell { height: 100%; padding: 0 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
  .vt-ca .ca-cell + .ca-cell { border-left: 1px solid rgba(200,240,222,.26); }
  .vt-ca .ca-cell-i { width: 30px; height: 30px; flex: none; border-radius: 50%; background: #D9B87A; box-shadow: 0 0 0 1px rgba(255,247,232,.35); display: flex; align-items: center; justify-content: center; }
  .vt-ca .ca-cell-l { font-size: 10.5px; font-weight: 700; line-height: 1.2; color: #FFF7E8; }
  .vt-ca .ca-cell-s { font-size: 8.5px; line-height: 1.24; color: rgba(200,240,222,.72); }
  .vt-ca .ca-btn { background: rgba(255,249,239,.9); border: 1px solid rgba(20,82,72,.3); }
  .vt-ca .vt-ent-btn { top: 84px; }
  .vt-ca .vt-ent-back { right: 20px; }

  .vt-ca .ca-name.vt-ent-xlong + .ca-bienv { font-size: 16px; }

  /* ═══════ ENTETES-E · 320 px (handoff Part B, @container ≤ 339) ═══════
     Hero 236, strip 72, paddings 16→12, frames shrink 6–10, 20–35 % of the
     small decor prunes — never a string, never the proof, never the badge. */
  @container (max-width: 339px) {
    .vt-ma .ma-scene, .vt-ha .ha-scene, .vt-ba .ba-scene, .vt-se .se-scene, .vt-ca .ca-scene { height: 236px; }
    .vt-ma .ma-trust, .vt-ha .ha-trust, .vt-se .se-trust { height: 72px; }
    .vt-ma .ma-col, .vt-ha .ha-col, .vt-ba .ba-col, .vt-se .se-col, .vt-ca .ca-col { padding-left: 12px; }
    .vt-ma .ma-cell-i, .vt-ha .ha-cell-i, .vt-ba .ba-cell-i, .vt-se .se-cell-i, .vt-ca .ca-cell-i { width: 26px; height: 26px; }
    .vt-ma .ma-cell-l, .vt-ha .ha-cell-l, .vt-ba .ba-cell-l, .vt-se .se-cell-l, .vt-ca .ca-cell-l { font-size: 9.7px; line-height: 1.19; }
    .vt-ma .ma-cell-s, .vt-ha .ha-cell-s, .vt-ba .ba-cell-s, .vt-se .se-cell-s, .vt-ca .ca-cell-s { font-size: 8px; line-height: 1.19; }
    /* the 236px scene is 10 shorter while the zone often takes two lines:
       the rhythm tightens uniformly — margins and chip minimums, never text. */
    .vt-ma .ma-col, .vt-ha .ha-col, .vt-ba .ba-col, .vt-se .se-col, .vt-ca .ca-col { padding-top: 4px; }
    .vt-ma .ma-bienv { font-size: 22px; }
    .vt-ha .ha-bienv, .vt-ba .ba-bienv, .vt-se .se-bienv, .vt-ca .ca-bienv { font-size: 21px; }
    .vt-ma .ma-name, .vt-ha .ha-name, .vt-ba .ba-name, .vt-se .se-name, .vt-ca .ca-name { margin-top: 0; }
    .vt-ma .ma-verif, .vt-ha .ha-verif, .vt-ba .ba-verif, .vt-se .se-verif, .vt-ca .ca-verif { margin-top: 4px; }
    .vt-ma .ma-proofrow, .vt-ha .ha-proofrow, .vt-ba .ba-proofrow, .vt-se .se-proofrow, .vt-ca .ca-proofrow { margin-top: 6px; }
    .vt-ma .ma-nouv-wrap, .vt-ha .ha-nouv-wrap, .vt-ba .ba-nouv-wrap, .vt-se .se-nouv-wrap, .vt-ca .ca-nouv-wrap { margin-top: 4px; }
    .vt-ma .ma-proof { min-height: 30px; }
    .vt-ha .ha-proof, .vt-ba .ba-proof, .vt-se .se-proof { min-height: 34px; }
    .vt-ca .ca-proof { min-height: 36px; }
    .vt-ma .ma-stars, .vt-ha .ha-stars, .vt-ba .ba-stars, .vt-se .se-stars, .vt-ca .ca-stars { min-height: 24px; }
    .vt-ha .ha-nouv { width: 70px; height: 70px; }
    /* MASQUE — frame −8, chevrons/planche prune (§8.6). */
    .vt-ma .ma-frame { width: 136px; height: 196px; }
    .vt-ma .ma-col { width: calc(100% - 158px); }
    .vt-ma .ma-planche, .vt-ma .ma-chevrons, .vt-ma .ma-zigzag { display: none; }
    .vt-ma .ma-name.vt-ent-long { font-size: 34px; }
    .vt-ma .ma-name.vt-ent-xlong { font-size: 18px; }
    /* HARMATTAN — portrait −8, one acacia and one bird only (§8.7). */
    .vt-ha .ha-frame { width: 124px; height: 124px; }
    .vt-ha .ha-col { width: calc(100% - 146px); }
    .vt-ha .ha-acacia2, .vt-ha .ha-calaos { display: none; }
    .vt-ha .ha-name.vt-ent-long { font-size: 34px; }
    .vt-ha .ha-name.vt-ent-xlong { font-size: 22px; }
    /* BALAFON — portrait −8, the staff shortens (§8.7). */
    .vt-ba .ba-medaille { width: 118px; height: 118px; }
    .vt-ba .ba-col { width: calc(100% - 142px); }
    .vt-ba .ba-portee { transform: scale(.75); transform-origin: left bottom; }
    .vt-ba .ba-touche3 { display: none; }
    .vt-ba .ba-name.vt-ent-long { font-size: 33px; }
    .vt-ba .ba-name.vt-ent-xlong { font-size: 18px; }
    /* SÉANCE — frame −8, reel filigree prunes (§8.7). */
    .vt-se .se-frame { width: 134px; height: 196px; }
    .vt-se .se-col { width: calc(100% - 158px); }
    .vt-se .se-bobine { display: none; }
    .vt-se .se-zone { font-size: 12px; line-height: 16px; }
    .vt-se .se-ampoules { margin-top: 2px; }
    .vt-se .se-ampoules { width: 102px; }
    .vt-se .se-name.vt-ent-long { font-size: 32px; }
    .vt-se .se-name.vt-ent-xlong { font-size: 16px; }
    /* CAURIS — oval −8, two shells and a bubble prune (§8.6). */
    .vt-ca .ca-frame { width: 124px; height: 190px; }
    .vt-ca .ca-frame-ring { width: 138px; height: 204px; }
    .vt-ca .ca-col { width: calc(100% - 148px); }
    .vt-ca .ca-cauri3, .vt-ca .ca-cauri4 { display: none; }
    .vt-ca .ca-bulles { height: 66px; background-image: radial-gradient(circle 3px at 7px 56px, rgba(200,240,222,.4) 98%, transparent), radial-gradient(circle 4px at 5px 32px, rgba(200,240,222,.34) 98%, transparent), radial-gradient(circle 5px at 8px 8px, rgba(200,240,222,.28) 98%, transparent); }
    .vt-ca .ca-name.vt-ent-long { font-size: 33px; }
    .vt-ca .ca-name.vt-ent-xlong { font-size: 18px; }
  }
`;
