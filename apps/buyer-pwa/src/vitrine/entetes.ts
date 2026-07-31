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
  // ENTETES-H (canon v2.4.0) — séries 2, 3 and 5. VOCABULARY, not drawings:
  // every key here must be NAMEABLE because a storefront may already carry it,
  // and `renderEntete` falls back to `classique` for any key whose unit has not
  // landed (the ENTETES-E0 law). The picker offers none of them yet.
  'indigo',
  'couture',
  'safran',
  'grenat',
  'kraft',
  'audace',
  'fleurie',
  'prisme',
  'pop',
  'chrome',
  'neon',
  'perle',
  'artisan',
  'braise',
  'graffiti',
  'dunda',
  'karite',
  'bronze',
  'calebasse',
  'pagne',
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
/* THE SÉRIE 1 PRIMITIVES — exported at ENTETES-I, when those five moved into
 * their own chunks. They were private while the five lived in this file;
 * they are the older, lower-level cousins of `etatPhoto`/`framePhoto` above
 * and only série 1 uses them. Exported, not merged: making the five adopt the
 * newer helpers would change their bytes, and this slice moves code without
 * changing a single one. */
export const etat = (v: Vals): string => (v.hasCover ? 'live' : 'none');

/**
 * The style's cover <img>. `object-position` rides inline because it is the ONE
 * per-style value the contract fixes per photograph (HANDOFF §5) — the portrait
 * bias that keeps a head from being cropped by the frame.
 * ENTETES-C — HER saved framing wins when present (`v.coverFocus`); absent, the
 * style's contract position stands byte-for-byte as before.
 */
export const coverImg = (v: Vals, pos: string): string =>
  `<img class="vt-cover-img" src="${v.coverUrl}" alt="${t('vit.cover_alt')}" loading="lazy" decoding="async" style="object-position:${v.coverFocus ?? pos}">`;

/** ENTETES-C — the avatar has NO per-style inline position (Héritage's 50% 32%
 *  medallion bias lives in the sheet's CSS); her framing rides as an inline
 *  style ONLY when present — inline wins over the CSS, and an unframed avatar
 *  emits the exact bytes it always did. */
export const avatarImg = (v: Vals): string =>
  `<img class="vt-avatar-img" src="${v.avatarUrl}" alt="${t('vit.avatar_alt')}" loading="lazy" decoding="async"${v.avatarFocus !== undefined ? ` style="object-position:${v.avatarFocus}"` : ''}>`;

/** « Vendeuse vérifiée · {zone} » — the catalog string plus her real zone. */
export const zoneLine = (v: Vals, pin: string): string => `${pin}${t('vit.verifiee')} <v>${v.zone}</v>`;

/** The catalog's zone label without its trailing separator — Héritage's photo
 *  chip carries the bare « Vendeuse vérifiée ». Derived, never re-authored. */
export const verifieeBare = (): string => t('vit.verifiee').replace(/\s*·\s*$/, '');

/**
 * WELD A SEAL INTO THE NAME'S ACCENT SEGMENT — the handoff's « anti-orphelin du
 * sceau »: « le sceau vit dans un span white-space:nowrap avec nameLast … il ne
 * reste jamais seul sur une ligne ».
 *
 * MEASURED, TWICE. `nameTail` already wraps the accent segment in `.vt-ent-acc`
 * (inline-block, nowrap), but a seal appended AFTER it is a separate atomic
 * inline, and the line may break between the two. It did: Grenat at 320 put all
 * of « Atelier Élégance-Burkina » on one line and left its seal alone on the
 * next, centred. A U+2060 WORD JOINER between them did NOT fix it — re-measured
 * after the change, the break was still there, because Chromium does not carry
 * a joiner across two atomic inline boxes. So the seal has to go INSIDE the
 * unbreakable box, which is what the contract said in the first place.
 *
 * Injecting before the tail's two closing tags places the seal inside
 * `.vt-ent-acc`, so it is part of that atomic box: it cannot wrap away from the
 * accent word, and when the box does not fit the line breaks BEFORE it — at the
 * space or the hyphen — which is the ENTETES-F behaviour, not the overflow that
 * welding the WHOLE tail once caused. A tail of an unexpected shape appends
 * rather than silently losing the seal.
 */
export function weldSeal(tail: string, seal: string): string {
  const close = '</span></span>';
  return tail.endsWith(close) ? `${tail.slice(0, -close.length)}${seal}${close}` : `${tail}${seal}`;
}

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


/* ------------------------------------------------------ 2 · HÉRITAGE ------ */


/* ---------------------------------------------------- 3 · CHALEUREUX ------ */


/* ------------------------------------------------------- 4 · CRISTAL ------ */


/* ----------------------------------------------------- 5 · DYNAMIQUE ------ */


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


/* -------------------------------------------- 22 · TERRACOTTA (harmattan) -- */


/* ---------------------------------------------- 23 · ÉTENDARD (balafon) -- */


/* ------------------------------------------------ 24 · DOUCEUR (seance) -- */


/* ------------------------------------------------ 25 · TISSAGE (cauris) -- */


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
    // ENTETES-F — the Série 4 contract units. The KEYS are the canon ones the
    // service already accepts and a live storefront may already carry; the
    // DRAWING is the pixel contract's. Renaming the keys to `prestige` … needs
    // a contracts bump + a service deploy, and is owed follow-up.
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

  /* ═══════ ENTETES-F · 320 px (contrat série 4 « validé à 320 ») ═══════
     Les colonnes fendues se resserrent : cadres −18 à −24, colonnes
     recalculées, décor secondaire élagué. Jamais une chaîne, jamais la
     preuve, jamais la pastille — seulement de la géométrie. */
  @container (max-width: 339px) {
    /* Les trois libellés de confiance gardent leur sens : on rétrécit la
       vignette et l'interligne, jamais le texte au point de le tronquer. */
    /* 320 keeps the relevé's 9.5px too — the vignette and the gutter carry
       the narrower screen, because this is the width where legibility is
       already hardest. */
  }
`;
