import { describe, expect, it } from 'vitest';
import {
  clampPercent,
  coverScaledSize,
  STAGE_MAX_H,
  STAGE_MAX_W,
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
    expect(he.aspect).toBeGreaterThan(1);
    expect(new Set(he.radii).size).toBe(1); // uniform corners
  });

  it('CADRAGE-PARITÉ — classique and héritage match the SHIPPED buyer CSS, to the digit', () => {
    /**
     * Founder, 2026-08-13: « the photo frame is cropping wrongly the photo ».
     * The two sheets exist to AGREE, so each spec answers to the buyer css the
     * page actually ships, not to the relevé.
     *
     * classique — buyer-pwa styles.ts:59/:73: `.vt-hero` grid 54%/46%, margin
     * -76px -20px 0 (cancels the 20px scroll pad ⇒ % of the full 360),
     * padding-top 60 over min-height 340 ⇒ photo column 0.46×360 = 165.6 wide
     * × 280 tall. Of the hero's `border-radius: 0 0 26px 26px` only the
     * BOTTOM-RIGHT corner touches the photo column (its bottom-left sits
     * mid-grid at 54%), inherited through overflow:hidden. The old 3/4 card
     * previewed a slice ~27% wider than the page crops.
     */
    const cl = frameSpecFor('classique', 'cover');
    expect(cl.aspect).toBeCloseTo(165.6 / 280, 10);
    expect(cl.circle).toBe(false);
    expect(cl.radii).toEqual([0, 0, 26 / 165.6, 0]);
    /**
     * heritage — the ENTETES-D full-bleed override is cascade-LAST in
     * entetes/heritage.ts:187 and wins: `margin: -60px 0 0; height: 298px;
     * border-radius: 0` inside the full-width `.vt-ent` ⇒ the shipped box is
     * full-width 360×298, square. The old 360/238 r24 spec came from the base
     * rule (heritage.ts:90) the override replaces.
     */
    const he2 = frameSpecFor('heritage', 'cover');
    expect(he2.aspect).toBeCloseTo(360 / 298, 10);
    expect(he2.radii).toEqual([0, 0, 0, 0]);
    // …and the fallback for every unbuilt style is classique, so the corrected
    // aspect also repairs every fallback preview at once.
    expect(frameSpecFor('inconnu' as never, 'cover')).toEqual(cl);
  });

  it('CADRAGE-PARITÉ — the two drag regressions the old specs caused can never come back', () => {
    /** The app's own photo-pick output: 2048 long edge, 4:3 (landscape take
     *  2048×1536, portrait take 1536×2048) — the sizes his phone actually
     *  produces, which is why both defects reached him and no test. */
    const stage = (spec: { aspect: number }): { width: number; height: number } => {
      // the sheet's own fit rule, on the sheet's OWN exported bounds — a
      // re-implemented 300/320 here would stay green if the sheet moved
      // (verifier MINOR, 2026-08-13)
      const w = Math.min(STAGE_MAX_W, STAGE_MAX_H * spec.aspect);
      return { width: w, height: w / spec.aspect };
    };

    /**
     * CLASSIQUE, portrait take — the OLD 3/4 spec froze the drag entirely:
     * at its 240×320 stage, 240/1536 = 320/2048 exactly ⇒ zero overflow on
     * BOTH axes, so dragToPercent returned the start value forever while the
     * buyer page (46%-column, aspect ≈0.591) crops ~21% of the width. The
     * corrected spec must leave overflow on the crop axis (x), so her drag
     * MOVES.
     */
    const cl = frameSpecFor('classique', 'cover');
    const clFrame = stage(cl);
    const portrait = coverScaledSize({ width: 1536, height: 2048 }, clFrame);
    expect(overflowFor(portrait.width, clFrame.width)).toBeGreaterThan(0); // x drags…
    expect(overflowFor(portrait.height, clFrame.height)).toBe(0); // …exactly as the page crops
    expect(dragToPercent(50, 10, portrait.width, clFrame.width)).not.toBe(50);
    // …and a landscape take overflows on the same crop axis, wider still.
    const landscape = coverScaledSize({ width: 2048, height: 1536 }, clFrame);
    expect(overflowFor(landscape.width, clFrame.width)).toBeGreaterThan(0);

    /**
     * HÉRITAGE, landscape take — the OLD 360/238 spec FLIPPED the drag axis:
     * frame aspect 1.513 > image 1.333 ⇒ the sheet was width-bound (only y
     * dragged) while the shipped 360×298 page box (aspect 1.208 < 1.333) is
     * height-bound (only x crops). Her drag moved the axis the page never
     * cuts. The corrected spec's drag axis must MATCH the page's crop axis.
     */
    const he = frameSpecFor('heritage', 'cover');
    const heFrame = stage(he);
    const take = coverScaledSize({ width: 2048, height: 1536 }, heFrame);
    expect(overflowFor(take.width, heFrame.width)).toBeGreaterThan(0); // x drags…
    expect(overflowFor(take.height, heFrame.height)).toBeCloseTo(0, 10); // …y has nothing to cut
    expect(dragToPercent(50, 10, take.width, heFrame.width)).not.toBe(50);
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

  it('the AVATAR frame: a circle in the survivors; the Série 4 four carry their contract silhouettes (ENTETES-F/J)', () => {
    // ENTETES-J — « cristal » and « masque » were cut with eight others. They stay
    // canon vocabulary and draw `classique`, so a silhouette for them would
    // describe a frame nothing renders.
    for (const style of ['classique', 'royale', 'heritage', 'chaleureux', 'dynamique'] as const) {
      const spec = frameSpecFor(style, 'avatar');
      expect(spec.circle, style).toBe(true);
      expect(spec.aspect, style).toBe(1);
    }
    // NOT ONE of the Série 4 five is a circle — the contract has no round
    // portrait on these visuals, so a circle here would be an invented shape
    for (const style of ['harmattan', 'balafon', 'seance', 'cauris'] as const) {
      expect(frameSpecFor(style, 'avatar').circle, style).toBe(false);
    }
    expect(frameSpecFor('balafon', 'avatar')).toEqual({
      aspect: 158 / 212, circle: false, radii: [4 / 158, 4 / 158, 4 / 158, 4 / 158],
    });
    // Douceur's galet is the one asymmetric silhouette of the five
    const galet = frameSpecFor('seance', 'avatar');
    // the aspect the BUYER renders, not the relevé's nominal one — these two
    // sheets exist to agree, so this asserts the shipped shape
    expect(galet.aspect).toBe(168 / 240);
    expect(new Set(galet.radii).size).toBe(4);
    expect(Math.min(...galet.radii)).toBeGreaterThan(0.3);
  });
});

describe("framing-math — the defaults ARE the styles' contract positions (law 5: no smart default)", () => {
  it('cover defaults match the ENTETES-A per-style object-positions; classique is the browser default', () => {
    expect(defaultFocusFor('royale', 'cover')).toEqual({ x: 42, y: 28 });
    expect(defaultFocusFor('heritage', 'cover')).toEqual({ x: 50, y: 18 });
    expect(defaultFocusFor('chaleureux', 'cover')).toEqual({ x: 50, y: 24 });
    expect(defaultFocusFor('dynamique', 'cover')).toEqual({ x: 58, y: 30 });
    expect(defaultFocusFor('classique', 'cover')).toEqual({ x: 50, y: 50 });
  });

  it("avatar defaults: Héritage 50/32; the Série 4 four the shared high portrait bias; the rest the centre", () => {
    expect(defaultFocusFor('heritage', 'avatar')).toEqual({ x: 50, y: 32 });
    // The PORTRAIT bias is one shared value (Série 1 §5 « biais haut 18–30 % »),
    // NOT each style's cover bias — the buyer sheet crops the portrait
    // fallback at 50/24 for all of them, and the two sheets have to agree.
    for (const style of ['harmattan', 'balafon', 'seance', 'cauris'] as const) {
      expect(defaultFocusFor(style, 'avatar'), style).toEqual({ x: 50, y: 24 });
      expect(defaultFocusFor(style, 'avatar'), style).not.toEqual(defaultFocusFor(style, 'cover'));
    }
    for (const style of ['classique', 'royale', 'chaleureux', 'dynamique'] as const) {
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
      // SEED-NEUTRE — the seed is a pre-canon draft; the parse specimen fills
      // the canon-required fields so what this test watches stays the FOCUS.
      slug: 'aicha-4821',
      name: 'Chez Aïcha Mode',
      zone: 'Gounghin, Ouagadougou',
      cover: { status: 'live' as const, url: 'https://m/a.jpg', focus: { x: 10, y: 90 } },
      avatar: { mode: 'photo' as const, url: 'https://m/b.jpg', focus: { x: 40, y: 20 } },
    };
    const parsed = StorefrontSchema.parse(sf);
    expect(parsed.cover.focus).toEqual({ x: 10, y: 90 });
    expect(parsed.avatar.focus).toEqual({ x: 40, y: 20 });
  });
});
