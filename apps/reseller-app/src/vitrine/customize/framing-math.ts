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
  // ENTETES-E — the Beurni Boss five render NO cover at all (handoff §5: the
  // frame holds her PORTRAIT; the cover is « non requis pour ces variantes »).
  // A saved cover framing is still honest data — it applies the moment she
  // switches back to a cover-bearing style — so the sheet keeps the classique
  // silhouette rather than inventing a frame these headers never draw.
  masque: RECT(3 / 4, 0.07),
  harmattan: RECT(3 / 4, 0.07),
  balafon: RECT(3 / 4, 0.07),
  seance: RECT(3 / 4, 0.07),
  cauris: RECT(3 / 4, 0.07),
};

/**
 * ENTETES-E — the Beurni Boss five frame the PORTRAIT in their own §5
 * silhouettes, so the avatar sheet must show hers in THAT shape: Masque's
 * orthogonal plank frame (144×206, no rounding), Séance's 35 mm inner screen
 * (112×190 — the visible photo, not the perforated chassis), Cauris' cowrie
 * oval (132×202 at 50%/42% — represented by the spec's width-fraction radii),
 * Harmattan's and Balafon's circles. The six keep the circle medallion they
 * have always had.
 */
const AVATAR_FRAMES: Partial<Record<HeaderStyleKey, FrameSpec>> = {
  masque: { aspect: 144 / 206, circle: false, radii: [0, 0, 0, 0] },
  harmattan: CIRCLE,
  balafon: CIRCLE,
  seance: { aspect: 112 / 190, circle: false, radii: [0, 0, 0, 0] },
  cauris: { aspect: 132 / 202, circle: false, radii: [0.5, 0.5, 0.5, 0.5] },
};

export function frameSpecFor(style: HeaderStyleKey, kind: FrameKind): FrameSpec {
  // Her portrait: a circle medallion in the six (and classique's ring); the
  // Beurni Boss five frame it per their own §5 (AVATAR_FRAMES above).
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
  // ENTETES-E — these five draw no cover (COVER_FRAMES above): the sheet
  // starts at classique's browser-default centre, exactly what an unframed
  // cover renders at everywhere else.
  masque: { x: 50, y: 50 },
  harmattan: { x: 50, y: 50 },
  balafon: { x: 50, y: 50 },
  seance: { x: 50, y: 50 },
  cauris: { x: 50, y: 50 },
};

/** ENTETES-E — each Beurni Boss unit biases the PORTRAIT crop per its §5
 *  (the buyer sheet's own object-position); the sheet must start there. */
const AVATAR_DEFAULTS: Partial<Record<HeaderStyleKey, PhotoFocus>> = {
  heritage: { x: 50, y: 32 },
  masque: { x: 50, y: 26 },
  harmattan: { x: 50, y: 24 },
  balafon: { x: 50, y: 24 },
  seance: { x: 50, y: 24 },
  cauris: { x: 50, y: 24 },
};

export function defaultFocusFor(style: HeaderStyleKey, kind: FrameKind): PhotoFocus {
  if (kind === 'avatar') return AVATAR_DEFAULTS[style] ?? { x: 50, y: 50 };
  return COVER_DEFAULTS[style];
}
