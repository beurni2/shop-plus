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
  // ENTETES-E0 — the Beurni Boss five carry the CLASSIQUE spec until their
  // E1/E2 render units define real silhouettes. Unreachable in the sheet
  // today (the picker never offers them — PICKABLE_HEADER_STYLES), and the
  // same fallback law as the buyer render: an unbuilt style behaves as
  // classique, never as an invented frame.
  masque: RECT(3 / 4, 0.07),
  harmattan: RECT(3 / 4, 0.07),
  balafon: RECT(3 / 4, 0.07),
  seance: RECT(3 / 4, 0.07),
  cauris: RECT(3 / 4, 0.07),
};

export function frameSpecFor(style: HeaderStyleKey, kind: FrameKind): FrameSpec {
  // Her portrait sits in a circle medallion in EVERY header (and classique's
  // avatar ring) — one silhouette, no per-style variance.
  if (kind === 'avatar') return CIRCLE;
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
  // ENTETES-E0 — classique's browser-default centre until each E1/E2 unit
  // names its contract position (see COVER_FRAMES above; same fallback law).
  masque: { x: 50, y: 50 },
  harmattan: { x: 50, y: 50 },
  balafon: { x: 50, y: 50 },
  seance: { x: 50, y: 50 },
  cauris: { x: 50, y: 50 },
};

export function defaultFocusFor(style: HeaderStyleKey, kind: FrameKind): PhotoFocus {
  if (kind === 'avatar') return style === 'heritage' ? { x: 50, y: 32 } : { x: 50, y: 50 };
  return COVER_DEFAULTS[style];
}
