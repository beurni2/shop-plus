import { describe, expect, it } from 'vitest';
import {
  clampPercent,
  coverScaledSize,
  defaultFocusFor,
  dragToPercent,
  focusPosition,
  frameSpecFor,
  offsetFor,
  overflowFor,
  translateFor,
} from '../src/vitrine/customize/framing-math';
import { DEFAULT_STOREFRONT, HEADER_STYLES, focusOf, withFocus } from '../src/vitrine/customize/storefront';
import { StorefrontSchema } from '@platform/contracts';

/**
 * ENTETES-C — the framing sheet's geometry, EXECUTED. The sheet imports these
 * exact functions for its preview, so pinning them here pins what she sees
 * while dragging — and what she sees is what CSS `object-position` does.
 */

describe('framing-math — cover-scale (object-fit: cover), executed', () => {
  it('a landscape photo in a squarer frame scales to the frame HEIGHT and overflows in width', () => {
    // 4000×2000 into 300×200: scale = max(300/4000, 200/2000) = 0.1
    const s = coverScaledSize({ width: 4000, height: 2000 }, { width: 300, height: 200 });
    expect(s).toEqual({ width: 400, height: 200 });
    expect(overflowFor(s.width, 300)).toBe(100); // the slidable axis
    expect(overflowFor(s.height, 200)).toBe(0); // nothing to slide vertically
  });

  it('a portrait photo in a landscape frame overflows in height', () => {
    // 1000×2000 into 300×200: scale = max(0.3, 0.1) = 0.3
    const s = coverScaledSize({ width: 1000, height: 2000 }, { width: 300, height: 200 });
    expect(s).toEqual({ width: 300, height: 600 });
    expect(overflowFor(s.height, 200)).toBe(400);
  });

  it('a degenerate image size falls back to the frame — nothing overflows, nothing drags', () => {
    const s = coverScaledSize({ width: 0, height: 0 }, { width: 300, height: 200 });
    expect(s).toEqual({ width: 300, height: 200 });
    expect(dragToPercent(50, 999, s.width, 300)).toBe(50); // no overflow ⇒ the start value
  });
});

describe('framing-math — object-position offset / translate, the CSS formula exactly', () => {
  // scaled 400 in a 300 frame: overflow 100.
  it('offset(axis) = (imageSize − frameSize) · p/100 — 0 shows the start edge, 100 the end, 50 the centre', () => {
    expect(offsetFor(400, 300, 0)).toBe(0);
    expect(offsetFor(400, 300, 50)).toBe(50);
    expect(offsetFor(400, 300, 100)).toBe(100);
    expect(offsetFor(400, 300, 28)).toBe(28); // Royale's y-default, on this geometry
  });

  it('the preview translate is the exact NEGATIVE of the crop offset — same function, same pixels', () => {
    for (const p of [0, 22, 50, 77, 100]) {
      expect(translateFor(400, 300, p)).toBe(-offsetFor(400, 300, p));
    }
  });

  it('no overflow ⇒ offset 0 at every percentage (an exactly-fitting photo never moves)', () => {
    for (const p of [0, 50, 100]) expect(offsetFor(300, 300, p)).toBe(0);
  });
});

describe('framing-math — drag → percentage: clamped 0–100, integer, against the finger', () => {
  // overflow 100 ⇒ 1px of drag = 1 point of percentage.
  it('dragging the photo RIGHT (positive dx) moves the focus LEFT (p decreases)', () => {
    expect(dragToPercent(50, 10, 400, 300)).toBe(40);
    expect(dragToPercent(50, -10, 400, 300)).toBe(60);
  });

  it('clamps to 0–100 — she can never drag the photo out of its frame', () => {
    expect(dragToPercent(50, 500, 400, 300)).toBe(0);
    expect(dragToPercent(50, -500, 400, 300)).toBe(100);
  });

  it('rounds to INTEGERS — the canon photo focus stores integers', () => {
    // overflow 300: 1px = 1/3 point
    expect(dragToPercent(50, 1, 600, 300)).toBe(50); // 49.667 → 50
    expect(dragToPercent(50, 2, 600, 300)).toBe(49); // 49.333 → 49
    expect(Number.isInteger(dragToPercent(13, 7, 517, 300))).toBe(true);
  });

  it('clampPercent is the shared clamp: negatives to 0, over-100 to 100, floats rounded', () => {
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(104)).toBe(100);
    expect(clampPercent(49.6)).toBe(50);
  });

  it('focusPosition renders the stored pair as the exact CSS value', () => {
    expect(focusPosition({ x: 10, y: 90 })).toBe('10% 90%');
    expect(focusPosition({ x: 0, y: 100 })).toBe('0% 100%');
  });
});

describe('framing-math — the representative frames (aspect + silhouette, per style)', () => {
  it('Royale cover is the CIRCLE medallion; Héritage is a landscape full-bleed rect', () => {
    const ry = frameSpecFor('royale', 'cover');
    expect(ry.circle).toBe(true);
    expect(ry.aspect).toBe(1);
    const he = frameSpecFor('heritage', 'cover');
    expect(he.circle).toBe(false);
    expect(he.aspect).toBeGreaterThan(1); // the 238-tall full-width strip
    expect(new Set(he.radii).size).toBe(1); // uniform corners
  });

  it('Chaleureux cover is the galet — four DIFFERENT large radii; Dynamique is a portrait column', () => {
    const ch = frameSpecFor('chaleureux', 'cover');
    expect(ch.aspect).toBeLessThan(1);
    expect(new Set(ch.radii).size).toBe(4); // asymmetric by silhouette
    expect(Math.min(...ch.radii)).toBeGreaterThan(0.3); // LARGE radii — a galet, not a card
    const dy = frameSpecFor('dynamique', 'cover');
    expect(dy.aspect).toBeLessThan(1); // the 152-wide full-height column
    expect(dy.circle).toBe(false);
  });

  it('the AVATAR frame: a circle in the six; the Beurni Boss five carry their own §5 silhouettes (ENTETES-E)', () => {
    for (const style of ['classique', 'royale', 'heritage', 'chaleureux', 'cristal', 'dynamique', 'harmattan', 'balafon'] as const) {
      const spec = frameSpecFor(style, 'avatar');
      expect(spec.circle, style).toBe(true);
      expect(spec.aspect, style).toBe(1);
    }
    // the portrait-framing styles: Masque's plank rect, Séance's 35 mm inner
    // screen, Cauris' cowrie oval — real frames, no invented variance
    expect(frameSpecFor('masque', 'avatar')).toEqual({ aspect: 144 / 206, circle: false, radii: [0, 0, 0, 0] });
    expect(frameSpecFor('seance', 'avatar')).toEqual({ aspect: 112 / 190, circle: false, radii: [0, 0, 0, 0] });
    expect(frameSpecFor('cauris', 'avatar')).toEqual({ aspect: 132 / 202, circle: false, radii: [0.5, 0.5, 0.5, 0.5] });
  });
});

describe("framing-math — the defaults ARE the styles' contract positions (law 5: no smart default)", () => {
  it('cover defaults match the ENTETES-A per-style object-positions; classique is the browser default', () => {
    expect(defaultFocusFor('royale', 'cover')).toEqual({ x: 42, y: 28 });
    expect(defaultFocusFor('heritage', 'cover')).toEqual({ x: 50, y: 18 });
    expect(defaultFocusFor('chaleureux', 'cover')).toEqual({ x: 50, y: 24 });
    expect(defaultFocusFor('cristal', 'cover')).toEqual({ x: 50, y: 22 });
    expect(defaultFocusFor('dynamique', 'cover')).toEqual({ x: 58, y: 30 });
    expect(defaultFocusFor('classique', 'cover')).toEqual({ x: 50, y: 50 });
  });

  it("avatar defaults: Héritage 50/32; the Beurni Boss five their §5 portrait biases; the rest the centre", () => {
    expect(defaultFocusFor('heritage', 'avatar')).toEqual({ x: 50, y: 32 });
    expect(defaultFocusFor('masque', 'avatar')).toEqual({ x: 50, y: 26 });
    for (const style of ['harmattan', 'balafon', 'seance', 'cauris'] as const) {
      expect(defaultFocusFor(style, 'avatar'), style).toEqual({ x: 50, y: 24 });
    }
    for (const style of ['classique', 'royale', 'chaleureux', 'cristal', 'dynamique'] as const) {
      expect(defaultFocusFor(style, 'avatar'), style).toEqual({ x: 50, y: 50 });
    }
  });
});

describe('ENTETES-C — focusOf / withFocus on the local Storefront mirror', () => {
  it('focusOf reads a valid pair; absent and garbage both read undefined (the header default drives)', () => {
    expect(focusOf({ focus: { x: 10, y: 90 } })).toEqual({ x: 10, y: 90 });
    expect(focusOf({})).toBeUndefined();
    expect(focusOf({ focus: null })).toBeUndefined();
    expect(focusOf({ focus: 'haut' })).toBeUndefined();
    expect(focusOf({ focus: { x: 10 } })).toBeUndefined(); // lone axis
    expect(focusOf({ focus: { x: 1.5, y: 2 } })).toBeUndefined(); // floats
    expect(focusOf({ focus: { x: 500, y: 50 } })).toBeUndefined(); // out of range
    expect(focusOf({ focus: { x: '10', y: '90' } })).toBeUndefined(); // strings
    expect(focusOf({ focus: { x: 0, y: 100 } })).toEqual({ x: 0, y: 100 }); // corners are legal
  });

  it('withFocus mirrors the service merge: set writes a CLEAN pair, null REMOVES the key', () => {
    const cover: { status: 'live'; url: string; focus?: { x: number; y: number } } = { status: 'live', url: 'https://m/a.jpg' };
    const set = withFocus(cover, { x: 10, y: 90 });
    expect(set).toEqual({ status: 'live', url: 'https://m/a.jpg', focus: { x: 10, y: 90 } });
    const cleared = withFocus(set, null);
    expect('focus' in cleared).toBe(false);
    expect(cleared.url).toBe('https://m/a.jpg');
    // set over an existing framing replaces it
    expect(withFocus(set, { x: 1, y: 2 }).focus).toEqual({ x: 1, y: 2 });
  });

  it('a focused local storefront still parses with the CANON schema (the mirror stays canon)', () => {
    const sf = {
      ...DEFAULT_STOREFRONT,
      cover: { status: 'live' as const, url: 'https://m/a.jpg', focus: { x: 10, y: 90 } },
      avatar: { mode: 'photo' as const, url: 'https://m/b.jpg', focus: { x: 40, y: 20 } },
    };
    const parsed = StorefrontSchema.parse(sf);
    expect(parsed.cover.focus).toEqual({ x: 10, y: 90 });
    expect(parsed.avatar.focus).toEqual({ x: 40, y: 20 });
  });
});
