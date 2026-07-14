import { Easing, type EasingFunction } from 'react-native';
import { motion as m2 } from '@platform/ui-tokens';

/**
 * WO-FP-SHOP · THE SEVEN MOTIONS — the Faso Premium motion set (canon v2
 * `motion`: fpIn · fpUp · fpPop · fpPulse · fpBar · fpShimmer · fpShake),
 * resolved ONCE into RN-consumable { durationMs, easing } pairs. Screens and the
 * state families read from here; nothing invents a curve or a clock.
 *
 * DERIVE-NEVER-INVENT: each easing comes from the token's own timingFunction —
 * a cubic-bezier is parsed into Easing.bezier (its four control points); a
 * keyword (ease · ease-in-out · linear) maps to its RN equivalent. Durations are
 * the token ms; a range (fpPop 300–450) resolves to max, the one documented rule.
 *
 * REDUCED MOTION is the doctrine's flag: every motion here has a static
 * equivalent that loses no information — callers gate on `useReducedMotion()`
 * (kit) and land instantly. This module is the DATA; the honoring is at the call
 * site. `layoutAnimation` stays forbidden (transform + opacity only).
 */

type Motion = { readonly durationMs: number; readonly timingFunction: string } | { readonly durationMs: { readonly min: number; readonly max: number }; readonly timingFunction: string };

const dur = (m: Motion): number => (typeof m.durationMs === 'number' ? m.durationMs : m.durationMs.max);

const easingOf = (timingFunction: string): EasingFunction => {
  const cb = timingFunction.match(/cubic-bezier\(([^)]+)\)/);
  if (cb) {
    const [a, b, c, d] = cb[1]!.split(',').map((n) => Number(n.trim())) as [number, number, number, number];
    return Easing.bezier(a, b, c, d);
  }
  if (timingFunction === 'linear') return Easing.linear;
  if (timingFunction === 'ease-in-out') return Easing.inOut(Easing.ease);
  // 'ease' and any unlisted keyword fall to the platform ease (never invented).
  return Easing.ease;
};

export interface ResolvedMotion {
  readonly durationMs: number;
  readonly easing: EasingFunction;
}

const resolve = (m: Motion): ResolvedMotion => ({ durationMs: dur(m), easing: easingOf(m.timingFunction) });

/** The seven, RN-ready. Keys are the canon token names — one source of motion. */
export const fp = {
  fpIn: resolve(m2.fpIn),
  fpUp: resolve(m2.fpUp),
  fpPop: resolve(m2.fpPop),
  fpPulse: resolve(m2.fpPulse),
  fpBar: resolve(m2.fpBar),
  fpShimmer: resolve(m2.fpShimmer),
  fpShake: resolve(m2.fpShake),
} as const;

export type MotionName = keyof typeof fp;
