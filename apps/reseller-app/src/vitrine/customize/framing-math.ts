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
} as const satisfies Record<string, FrameSpec>;

/**
 * ENTETES-H · Indigo — the FIRST style whose photo is the header itself: a
 * 300px full-width band, not a framed inset. Her drag therefore previews a
 * 360×300 landscape band with square corners, because that is literally what
 * the buyer draws.
 */
/** ENTETES-H · SÉRIE 3 — ten faithful replicas of the supplied boards. */
const SERIE3_FRAMES = {
  // Audace — a 172 disc pushed off the right edge at −42, so only ~130 show.
  // Same honest approximation as Safran: the CROP is exact, the cut is not
  // drawn, and the default bias (40 %) is what keeps her face off the cut.
  audace: CIRCLE,
  // Fleurie — the organic galet, 158×196. Its eight-value border-radius cannot
  // be expressed as four corner fractions, so the silhouette approximates the
  // blob with the four dominant ones; the CROP it teaches her is exact.
  fleurie: { aspect: 158 / 196, circle: false, radii: [0.62, 0.38, 0.56, 0.44] },
  // Prisme — the glass frame inside the card: 336 wide at 360, 186 tall, r22.
  prisme: { aspect: 336 / 186, circle: false, radii: [22 / 336, 22 / 336, 22 / 336, 22 / 336] },
  // Pop — the browser window's SCREEN, 158 tall inside the 3px outline. The
  // window's chrome bar, its black border and its −1° tilt are frame, not
  // photo, so none of them enters the silhouette.
  pop: { aspect: 326 / 158, circle: false, radii: [0, 0, 6 / 326, 6 / 326] },
  // Chrome — a 168 disc pushed off the right edge at −38, ringed in chrome. The
  chrome: CIRCLE,
  // Néon — the taped frame, 150×184 inside its 3px fluo edge. The tape, the
  // glow and the 2° tilt are frame, not photo, so none of them enters the
  // silhouette — her drag positions only what lands inside the opening.
  neon: { aspect: 150 / 184, circle: false, radii: [0, 0, 0, 0] },
  // Perle — a 186 disc pushed off the right edge at −44. Same approximation as
  // Safran and Audace: the whole disc is drawn, the CROP is exact, and the
  // 38 % bias is what keeps her face clear of the cut.
  perle: CIRCLE,
  // Artisan — the right column, 126 wide over a ~300 panel, ARCHED on its left
  // edge only (130px radius on that side). The two left radii approximate the
  // arch; the right edge is square, as the panel's own edge is.
  artisan: { aspect: 126 / 300, circle: false, radii: [0.52, 0, 0, 0.52] },
  // Braise — the 172 photo circle laid on the coral disc, offset and biting the
  // right edge. The disc behind it is decoration, not frame; her drag positions
  // the circle, and the 46 % bias keeps her face off the cut.
  braise: CIRCLE,
  // Graffiti — the polaroid's photo window, 138x150 inside its white print. The
  // print, its tape and its 2.5 degree tilt are frame, not photo.
  graffiti: { aspect: 138 / 150, circle: false, radii: [0, 0, 0, 0] },
  // Dunda — the 158 dye-knot circle. Its dashed ring is decoration around the
  // frame, not part of it, so the silhouette is the disc her photo fills.
  dunda: CIRCLE,
  // Karité — the CUSHION: 162 square at border-radius 42%, which is a squircle
  // and deliberately NOT a circle. The leaf resting on its edge is decoration.
  karite: { aspect: 1, circle: false, radii: [0.42, 0.42, 0.42, 0.42] },
  // Bronze — l'arche de médaillon 156×206, ronde en tête et carrée au pied.
  bronze: { aspect: 156 / 206, circle: false, radii: [0.5, 0.5, 12 / 156, 12 / 156] },
} as const satisfies Record<string, FrameSpec>;

const SERIE3_FOCUS = {
  audace: { x: 40, y: 28 },
  fleurie: { x: 44, y: 26 },
  prisme: { x: 50, y: 24 },
  pop: { x: 50, y: 26 },
  chrome: { x: 40, y: 28 },
  neon: { x: 50, y: 24 },
  perle: { x: 38, y: 28 },
  artisan: { x: 56, y: 22 },
  braise: { x: 46, y: 28 },
  graffiti: { x: 50, y: 24 },
  dunda: { x: 50, y: 26 },
  karite: { x: 50, y: 28 },
  bronze: { x: 50, y: 24 },
} as const satisfies Record<string, PhotoFocus>;

const SERIE2_FRAMES = {
  indigo: { aspect: 360 / 300, circle: false, radii: [0, 0, 0, 0] },
  // Couture — a letterbox band, and the ONE style of the series with square
  // corners (« angles droits (r0) »). Her drag previews a mounted print.
  couture: { aspect: 360 / 138, circle: false, radii: [0, 0, 0, 0] },
  // Safran — a 190×190 disc, of which the header shows only the right 132: it
  // sits at left −58 and the card's overflow cuts it. The preview draws the
  // WHOLE disc, the same honest approximation Prestige's clip-path takes: the
  // CROP it teaches her is exact (190×190 at her focus is byte-for-byte what
  // the buyer computes), only the left third is then hidden — which is why the
  // relevé's default bias is 58 % and not 50 %, « le sujet fuit le bord coupé ».
  safran: CIRCLE,
  // Grenat — the cameo: a 136×176 OVAL, which the FrameSpec vocabulary carries
  // exactly (circle:true is « radius = half the box », an ellipse on a
  // non-square box). Her drag previews the real portrait shape.
  grenat: { aspect: 136 / 176, circle: true, radii: [0.5, 0.5, 0.5, 0.5] },
  // Kraft — the polaroid's photo window: 124 wide inside a 138 print, 132 tall,
  // square corners. The print's white border and its 2.5° tilt are frame, not
  // photo, so they are NOT in the silhouette — her drag positions what lands
  // inside the window.
  kraft: { aspect: 124 / 132, circle: false, radii: [0, 0, 0, 0] },
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

/** Indigo's relevé: « cover, object-position:50% 30% ». */
const SERIE2_FOCUS = {
  indigo: { x: 50, y: 30 },
  couture: { x: 50, y: 26 },
  // « cover / 58% 30% (le sujet fuit le bord coupé) » — the x-bias is not a
  // taste call, it is what keeps her face off the 58px the header clips.
  safran: { x: 58, y: 30 },
  // « cover / 50% 22% » — a cameo crops tight, so the bias sits high.
  grenat: { x: 50, y: 22 },
  kraft: { x: 50, y: 26 },
} as const satisfies Record<string, PhotoFocus>;

/** Cover silhouettes, from the contract's own dimensions (ENTETES-A relevé):
 *  Royale medallion 188×188 · Héritage strip 238 tall full-width · Chaleureux
 *  galet 150×198 (radii 76/58/72/62 of 150) · Cristal frame 196 tall
 *  full-width · Dynamique column 152 wide full-height · classique hero column. */
/**
 * ENTETES-H — PARTIAL since canon v2.4.0. The vocabulary carries 31 keys but
 * only the ELEVEN that are built have a silhouette here; a key with no buyer
 * render unit has no shape to preview either. The accessor falls back to
 * `classique`, which is exactly what the buyer's `renderEntete` draws for the
 * same key — the two sheets agree on the fallback as well as on the shapes.
 */
const COVER_FRAMES: Partial<Record<HeaderStyleKey, FrameSpec>> = {
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
  ...SERIE2_FRAMES,
  ...SERIE3_FRAMES,
};

/**
 * ENTETES-F — the Série 4 five frame EITHER photograph in the same silhouette
 * (the contract has no separate portrait shape), so the avatar sheet shows
 * hers in the style's own frame. None of the five is a circle: Prestige's
 * 186-wide panel, Terracotta's and Tissage's full right columns, Étendard's
 * 158×212 card, Douceur's organic galet. The six keep the circle medallion
 * they have always had.
 */
const AVATAR_FRAMES: Partial<Record<HeaderStyleKey, FrameSpec>> = { ...BEURNI_FRAMES, ...SERIE2_FRAMES };

export function frameSpecFor(style: HeaderStyleKey, kind: FrameKind): FrameSpec {
  // Her portrait: a circle medallion in the six (and classique's ring); the
  // Série 4 five frame it in their own contract silhouette (AVATAR_FRAMES).
  if (kind === 'avatar') return AVATAR_FRAMES[style] ?? CIRCLE;
  return COVER_FRAMES[style] ?? COVER_FRAMES.classique!;
}

/**
 * The header style's CONTRACT framing — what an UNFRAMED photo renders at, and
 * therefore where the sheet starts when she has saved nothing. Cover values are
 * the ENTETES-A per-style object-positions; classique emits none (browser
 * default 50% 50%). Avatars: Héritage's medallion carries 50% 32% in the
 * sheet's CSS; every other avatar renders at the default centre.
 */
/** Partial for the same reason as COVER_FRAMES: an unbuilt style has no
 *  contract crop bias, and falls back to what classique renders. */
const COVER_DEFAULTS: Partial<Record<HeaderStyleKey, PhotoFocus>> = {
  classique: { x: 50, y: 50 },
  royale: { x: 42, y: 28 },
  heritage: { x: 50, y: 18 },
  chaleureux: { x: 50, y: 24 },
  cristal: { x: 50, y: 22 },
  dynamique: { x: 58, y: 30 },
  // ENTETES-F — the five draw the cover at their own relevé crop bias; the
  // sheet starts her drag exactly there.
  ...BEURNI_FOCUS,
  ...SERIE2_FOCUS,
  ...SERIE3_FOCUS,
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
  // Indigo's portrait fallback sits in the same band, at its own high bias.
  indigo: { x: 50, y: 24 },
  couture: { x: 50, y: 26 },
  // Safran frames the SAME disc whichever photo fills it, so the portrait
  // fallback keeps the cut-edge bias too.
  safran: { x: 58, y: 30 },
  // the small overlapping portrait, at the relevé's own bias
  grenat: { x: 50, y: 32 },
  kraft: { x: 50, y: 32 },
  audace: { x: 40, y: 28 },
  fleurie: { x: 50, y: 32 },
  prisme: { x: 50, y: 30 },
  pop: { x: 50, y: 30 },
  chrome: { x: 40, y: 28 },
  neon: { x: 50, y: 24 },
  perle: { x: 50, y: 30 },
  artisan: { x: 50, y: 30 },
  braise: { x: 46, y: 28 },
  graffiti: { x: 50, y: 24 },
  dunda: { x: 50, y: 26 },
  karite: { x: 50, y: 28 },
  bronze: { x: 50, y: 24 },
};

export function defaultFocusFor(style: HeaderStyleKey, kind: FrameKind): PhotoFocus {
  if (kind === 'avatar') return AVATAR_DEFAULTS[style] ?? { x: 50, y: 50 };
  return COVER_DEFAULTS[style] ?? COVER_DEFAULTS.classique!;
}
