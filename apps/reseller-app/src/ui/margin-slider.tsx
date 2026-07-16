import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type DimensionValue, type LayoutChangeEvent } from 'react-native';
import { sharedColour, shopColour, radius } from '@platform/ui-tokens';
import { spacing, touch, interaction } from '@platform/ui-tokens/legacy';
import { snapMarkup } from '../vitrine/margin';

/**
 * WO-VITRINE-FLOW (founder redirect) — THE MARGE SLIDER. The planche control is an
 * HTML `<input type=range class=fpr>` (Shop Plus - Redesign.dc.html:26–30, 169):
 * piste 8 px warm-beige · pouce 26 px accent bordé blanc · min 0 · max cap · pas 100.
 * RN has no range input (lawful platform divergence), so the piste + pouce are
 * rebuilt from tokens and driven by PanResponder — tap OR drag anywhere on the
 * 48 px-tall strip (the ≥44 px touch target) sets the value. The value snaps to the
 * step and clamps to [0, cap] through the PURE `snapMarkup` — the same function the
 * money tests pin — so the UI never invents a value the arithmetic disagrees with.
 * TOKENS ONLY; a source scan proves zero hardcode.
 */
const rmax = (v: number | { readonly min: number; readonly max: number }): number =>
  typeof v === 'number' ? v : v.max;

export function MarginSlider({
  value,
  cap,
  onChange,
}: {
  value: number;
  cap: number;
  onChange: (markup: number) => void;
}) {
  const [width, setWidth] = useState(0);
  // Refs so the PanResponder (created once) always reads the live cap/width/handler.
  const widthRef = useRef(0);
  widthRef.current = width;
  const capRef = useRef(cap);
  capRef.current = cap;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const apply = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return;
    const raw = (x / w) * capRef.current;
    onChangeRef.current(snapMarkup(raw, capRef.current));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => apply(e.nativeEvent.locationX),
      onPanResponderMove: (e) => apply(e.nativeEvent.locationX),
    }),
  ).current;

  const ratio = cap > 0 ? Math.max(0, Math.min(1, value / cap)) : 0;
  const pct: DimensionValue = `${ratio * 100}%`;

  return (
    <View
      style={styles.track}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: cap, now: value }}
      {...pan.panHandlers}
    >
      <View style={styles.piste}>
        <View style={[styles.fill, { width: pct }]} />
      </View>
      <View style={[styles.thumb, { left: pct }]} />
    </View>
  );
}

const THUMB = spacing.xl + spacing.xs; // 26–28 px, the planche pouce

const styles = StyleSheet.create({
  // the full-width strip IS the touch target (≥44 px), piste centred within it
  track: { height: touch.minTargetPx, justifyContent: 'center' },
  piste: {
    height: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: sharedColour.dim,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: shopColour.primary,
    borderRadius: radius.pill,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -(THUMB / 2),
    top: (touch.minTargetPx - THUMB) / 2,
    borderRadius: radius.pill,
    backgroundColor: shopColour.primary,
    borderWidth: spacing.xs,
    borderColor: sharedColour.paper,
    // the pouce's lift (planche box-shadow); elevation is Android-only, benign on iOS
    elevation: interaction.hairline.strong,
  },
});
