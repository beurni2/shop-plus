import React from 'react';

/**
 * RENDU-RÉEL (Shop+ reseller) — the expo-linear-gradient boundary, doubled.
 *
 * ENTREE-POLI-1 (founder 2026-09-05: « gradient »): the kit's PrimaryButton
 * paints a top-light over its plum with `LinearGradient`, a native view. Under
 * vitest it is this: a plain host element that renders its children and
 * forwards its props, so a screen carrying the button still MOUNTS.
 *
 * ITS BOUND, stated: it paints NOTHING. No walk may read a colour, a stop or
 * a direction from here — the gradient's presence and its token colours are
 * pinned by source (`entree-poli.test.ts`), and what it looks like is his eyes
 * on a real phone. `pointerEvents="none"` rides through as a prop and is not
 * enforced: the harness finds controls by `onPress`, which this never carries.
 */
export function LinearGradient(props: { readonly children?: React.ReactNode; readonly [k: string]: unknown }): React.ReactElement {
  const { children, ...rest } = props;
  return React.createElement('LinearGradient', rest, children);
}
