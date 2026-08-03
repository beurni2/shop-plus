import { View } from 'react-native';
import { apercuBox, type FrameSpec } from './framing-math';
import { K_RAW_STYLES as S } from './k-styles';

/*
 * MOVED OUT OF screens.tsx (VOIX/APERÇU, 2026-08-03) and not otherwise changed.
 * The reason is a cycle, not tidying: `entete-sheet.tsx` needs this silhouette
 * for the not-yet-published state, and `screens.tsx` imports the sheet. Leaving
 * it where it was would have made screens ⇄ sheet import each other.
 */

/**
 * EN-TÊTE — LA SILHOUETTE (founder order 2026-08-03: « on theme I want to see
 * the en-tête preview attached to its name so I can see it before tapping to
 * choose like the habillages »).
 *
 * The habillage cards have always shown their colours above their name; the
 * en-tête cards showed a name and a sentence, so choosing meant tapping and
 * looking. This draws THE SHAPE each style puts her cover photograph in —
 * Royale's medallion, Héritage's full-width strip, Chaleureux's galet, and so
 * on — so the difference is visible before the tap.
 *
 * IT IS NOT A DRAWING I INVENTED. The silhouette comes from `frameSpecFor`,
 * the SAME source the framing sheet uses to crop her real photo, so the preview
 * and the crop can never disagree: if a style's frame changes, both move
 * together. A key with no built render unit falls back to `classique` there and
 * therefore here too — the fallback is shared, not duplicated.
 *
 * NO PHOTOGRAPH IS SHOWN. This is a shape, in her theme's own tones, not a
 * fake cover: promising a preview of HER header and drawing someone else's
 * picture would be the kind of pretend this app does not do.
 */
export function EnteteApercu({ spec, deep, soft, accent }: { spec: FrameSpec; deep: string; soft: string; accent: string }) {
  // The fit is `apercuBox` — pure, clamped, and tested; a component is the
  // wrong place for arithmetic no test can reach.
  const { width: w, height: h } = apercuBox(spec);
  const [tl, tr, br, bl] = spec.radii;
  const r = (frac: number): number => (spec.circle ? Math.min(w, h) / 2 : frac * w);
  return (
    <View style={[S.enteteApercu, { backgroundColor: soft }]}>
      <View
        style={{
          width: w,
          height: h,
          backgroundColor: deep,
          borderTopLeftRadius: r(tl),
          borderTopRightRadius: r(tr),
          borderBottomRightRadius: r(br),
          borderBottomLeftRadius: r(bl),
        }}
      />
      {/* the accent hairline echoes the woven band on the habillage cards, so
          the two grids read as one family rather than two conventions */}
      <View style={[S.enteteApercuLigne, { backgroundColor: accent }]} />
    </View>
  );
}

/* ------------------------------------------------------------------- K4 -- */
