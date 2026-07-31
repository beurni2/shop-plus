/**
 * ENTETES-C — the framing sheet's PURE math. No react-native import: every
 * function here is EXECUTED by Node tests, and the sheet imports THESE — the
 * preview is the tested function, never an inline re-derivation (what she sees
 * while dragging is what CSS `object-position` does on her buyer page).
 *
 * THE MODEL is CSS `object-fit: cover` + `object-position: x% y%`, exactly as
 * the buyer render emits it:
 *   · the image is COVER-SCALED: scale = max(frameW/imgW, frameH/imgH);
 *   · along an axis where the scaled image overflows the frame, the crop
 *     offset is `(scaledSize − frameSize) · p/100` — p 0 shows the start edge,
 *     p 100 the end edge, 50 the centre;
 *   · the preview translates the image by MINUS that offset;
 *   · a drag of Δpx moves the image WITH the finger, so the percentage moves
 *     AGAINST it: Δp = −Δpx · 100 / overflow. Clamped 0–100, rounded to
 *     integers — the canon `StorefrontPhotoFocusSchema` stores integers.
 *
 * Deterministic only (loi 5): the numbers are HER hand on the photo. There is
 * no face detection, no saliency, nothing "smart" — the default IS the header
 * style's contract position, below.
 */

import type { HeaderStyleKey, PhotoFocus } from './storefront';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** The cover-scaled (object-fit: cover) size of `image` inside `frame`. */
export function coverScaledSize(image: Size, frame: Size): Size {
  if (image.width <= 0 || image.height <= 0) return { width: frame.width, height: frame.height };
  const scale = Math.max(frame.width / image.width, frame.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/** How far the scaled image overhangs the frame on one axis (never negative). */
export function overflowFor(scaledSize: number, frameSize: number): number {
  return Math.max(0, scaledSize - frameSize);
}

/** CSS object-position: the crop offset at percentage `p` on one axis. */
export function offsetFor(scaledSize: number, frameSize: number, p: number): number {
  return (overflowFor(scaledSize, frameSize) * p) / 100;
}

/** The preview translate for percentage `p` — the exact negative of the crop
 *  offset, so the sheet shows the same pixels the buyer page will crop to. */
export function translateFor(scaledSize: number, frameSize: number, p: number): number {
  return -offsetFor(scaledSize, frameSize, p);
}

/** Clamp + integer-round a percentage (canon stores integers 0–100). */
export function clampPercent(p: number): number {
  return Math.min(100, Math.max(0, Math.round(p)));
}

/**
 * A drag delta (px, finger direction) applied to the percentage she started
 * the gesture at. No overflow on the axis ⇒ nothing to slide ⇒ the start value
 * (clamped), so a photo that exactly fits can never be dragged out of frame.
 */
export function dragToPercent(startP: number, deltaPx: number, scaledSize: number, frameSize: number): number {
  const overflow = overflowFor(scaledSize, frameSize);
  if (overflow <= 0) return clampPercent(startP);
  return clampPercent(startP - (deltaPx * 100) / overflow);
}

/** The CSS `object-position` value a stored pair renders as. */
export function focusPosition(f: PhotoFocus): string {
  return `${f.x}% ${f.y}%`;
}

/* ------------------------------------------------- representative frames -- */

export type FrameKind = 'cover' | 'avatar';

/**
 * The REPRESENTATIVE frame of one header style: aspect + silhouette, never a
 * pixel replica of the five headers (« voir comme cliente » is the truth
 * mirror — the sheet says so in its hint line). Radii are FRACTIONS of the
 * rendered frame WIDTH so the silhouette scales with the sheet.
 */
export interface FrameSpec {
  /** width / height of the frame box. */
  readonly aspect: number;
  /** A circle frame (Royale's medallion, every avatar) — radius = half size. */
  readonly circle: boolean;
  /** Corner radii as fractions of the frame width: [tl, tr, br, bl]. */
  readonly radii: readonly [number, number, number, number];
}

const RECT = (aspect: number, r: number): FrameSpec => ({ aspect, circle: false, radii: [r, r, r, r] });
const CIRCLE: FrameSpec = { aspect: 1, circle: true, radii: [0.5, 0.5, 0.5, 0.5] };

/**
 * ENTETES-F — the SÉRIE 4 five, from each style's own relevé (« Photo » /
 * « Héros fendu »). The canon keys are unchanged; the silhouettes are the
 * contract's. ONE definition for both kinds: the frame's shape does not change
 * with which photograph fills it, and two copies would be two answers that can
 * disagree. Hero heights are the unit's own: padding-top 74 (14 + the 60 px
 * status bleed) + the column's min-height + the bottom padding.
 *   · Prestige   — panneau 186 wide over the full 358 hero. Its diagonal is a
 *     `clip-path`, which this preview cannot draw; radii 0 is the honest
 *     approximation, and the CROP it teaches her is exact.
 *   · Terracotta — the full right column, 47 % of 360 over a 344 hero.
 *   · Étendard   — the fixed 158×212 card, r4.
 *   · Douceur    — the organic galet, 168×240 as the buyer sheet finally
 *     renders it: the relevé's 196×264 did not leave the text column room to
 *     clear the photo, and THIS number is the one her drag must preview.
 *   · Tissage    — the full right column, 46 % of 360 over a 340 hero.
 */
const BEURNI_FRAMES = {
  masque: { aspect: 186 / 358, circle: false, radii: [0, 0, 0, 0] },
  harmattan: { aspect: (0.47 * 360) / 344, circle: false, radii: [0, 0, 0, 0] },
  balafon: { aspect: 158 / 212, circle: false, radii: [4 / 158, 4 / 158, 4 / 158, 4 / 158] },
  seance: { aspect: 168 / 240, circle: false, radii: [0.54, 0.46, 0.42, 0.58] },
  cauris: { aspect: (0.46 * 360) / 340, circle: false, radii: [0, 0, 0, 0] },
} as const satisfies Record<string, FrameSpec>;

/** Each style's relevé crop bias — what an UNFRAMED photo renders at in that
 *  frame, and therefore where her drag starts. Identical to the buyer sheet's
 *  `framePhoto` values, style for style (the contract's « cover · X% Y% »). */
const BEURNI_FOCUS = {
  masque: { x: 62, y: 24 },
  harmattan: { x: 55, y: 30 },
  balafon: { x: 55, y: 22 },
  seance: { x: 60, y: 30 },
  cauris: { x: 52, y: 28 },
} as const satisfies Record<string, PhotoFocus>;

/** Cover silhouettes, from the contract's own dimensions (ENTETES-A relevé):
 *  Royale medallion 188×188 · Héritage strip 238 tall full-width · Chaleureux
 *  galet 150×198 (radii 76/58/72/62 of 150) · Cristal frame 196 tall
 *  full-width · Dynamique column 152 wide full-height · classique hero column. */
const COVER_FRAMES: Record<HeaderStyleKey, FrameSpec> = {
  classique: RECT(3 / 4, 0.07),
  royale: CIRCLE,
  heritage: RECT(360 / 238, 24 / 360),
  chaleureux: { aspect: 150 / 198, circle: false, radii: [76 / 150, 58 / 150, 72 / 150, 62 / 150] },
  cristal: RECT(360 / 196, 18 / 360),
  dynamique: RECT(152 / 320, 0.08),
  // ENTETES-E — founder ruling 2026-07-30 (« make it all be like the 6 original
  // headers »): the Beurni Boss five draw HER COVER in their §5 frame, exactly
  // as the six put it in theirs. So the sheet shows the cover in the real
  // silhouette the buyer will see — Masque's orthogonal plank, Harmattan's and
  // Balafon's discs, Séance's 35 mm inner screen, Cauris' cowrie oval — and not
  // the classique placeholder these once carried.
  ...BEURNI_FRAMES,
};

/**
 * ENTETES-F — the Série 4 five frame EITHER photograph in the same silhouette
 * (the contract has no separate portrait shape), so the avatar sheet shows
 * hers in the style's own frame. None of the five is a circle: Prestige's
 * 186-wide panel, Terracotta's and Tissage's full right columns, Étendard's
 * 158×212 card, Douceur's organic galet. The six keep the circle medallion
 * they have always had.
 */
const AVATAR_FRAMES: Partial<Record<HeaderStyleKey, FrameSpec>> = { ...BEURNI_FRAMES };

export function frameSpecFor(style: HeaderStyleKey, kind: FrameKind): FrameSpec {
  // Her portrait: a circle medallion in the six (and classique's ring); the
  // Série 4 five frame it in their own contract silhouette (AVATAR_FRAMES).
  if (kind === 'avatar') return AVATAR_FRAMES[style] ?? CIRCLE;
  return COVER_FRAMES[style];
}

/**
 * The header style's CONTRACT framing — what an UNFRAMED photo renders at, and
 * therefore where the sheet starts when she has saved nothing. Cover values are
 * the ENTETES-A per-style object-positions; classique emits none (browser
 * default 50% 50%). Avatars: Héritage's medallion carries 50% 32% in the
 * sheet's CSS; every other avatar renders at the default centre.
 */
const COVER_DEFAULTS: Record<HeaderStyleKey, PhotoFocus> = {
  classique: { x: 50, y: 50 },
  royale: { x: 42, y: 28 },
  heritage: { x: 50, y: 18 },
  chaleureux: { x: 50, y: 24 },
  cristal: { x: 50, y: 22 },
  dynamique: { x: 58, y: 30 },
  // ENTETES-F — the five draw the cover at their own relevé crop bias; the
  // sheet starts her drag exactly there.
  ...BEURNI_FOCUS,
};

/**
 * ENTETES-F — the PORTRAIT fallback is NOT the cover bias. The buyer sheet
 * crops every Série 4 portrait at one shared high bias (Série 1 §5: « biais
 * haut 18–30 %, aucune tête coupée par construction »), while BEURNI_FOCUS
 * above carries each style's COVER bias. Spreading the cover map here would
 * have taught her a 62/24 start for a portrait the buyer draws at 50/24 —
 * the two sheets must agree, so this is its own constant, pinned by test.
 */
const SERIE4_PORTRAIT: PhotoFocus = { x: 50, y: 24 };
const AVATAR_DEFAULTS: Partial<Record<HeaderStyleKey, PhotoFocus>> = {
  heritage: { x: 50, y: 32 },
  masque: SERIE4_PORTRAIT,
  harmattan: SERIE4_PORTRAIT,
  balafon: SERIE4_PORTRAIT,
  seance: SERIE4_PORTRAIT,
  cauris: SERIE4_PORTRAIT,
};

export function defaultFocusFor(style: HeaderStyleKey, kind: FrameKind): PhotoFocus {
  if (kind === 'avatar') return AVATAR_DEFAULTS[style] ?? { x: 50, y: 50 };
  return COVER_DEFAULTS[style];
}
