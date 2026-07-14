import { Svg, Rect, Path } from 'react-native-svg';
import { shopPlusTheme as theme, shopColour, dimension } from '@platform/ui-tokens/legacy';
import { encodeQr } from './encoder';
import { DEMO_QR_URL } from './identity';

/**
 * WO-7.2b — the on-screen QR (ruling #10: RN draws the same maths via
 * react-native-svg). Ink modules on pure paper, a 4-module quiet zone carried by
 * the component itself (ISO 18004), the terracotta corner ticks (the proof
 * grammar) OUTSIDE the quiet zone — never touching the QR, never a colour on the
 * modules, never a logo. The side is DERIVED from the canon `dimension.qr`
 * primitives (v0.9.7), never hand-picked: side = (modules + 2·quietZone)·moduleMin
 * — the version sets the module count, the tokens set the rest. Decorative to
 * the screen reader — the non-visual path is the copyable short code beside it.
 */

const QUIET = dimension.qr.quietZoneModules; // 4
const MOD = dimension.qr.moduleMinPx; // 4 (= spacing.xs, no sub-pixel)

/** The render-time side derivation from the canon primitives (the WO's math). */
export function qrSideDp(modules: number): number {
  return (modules + 2 * QUIET) * MOD;
}

export function QrCode({ url = DEMO_QR_URL }: { url?: string }) {
  const qr = encodeQr(url);
  const side = qrSideDp(qr.size);
  const tick = MOD * 3; // 12 dp corner tick, drawn outside the quiet zone
  const stroke = MOD / 2; // 2 dp

  // Run-merge consecutive dark modules per row into one Rect (fewer nodes).
  const rects: { x: number; y: number; w: number }[] = [];
  for (let r = 0; r < qr.size; r++) {
    let c = 0;
    while (c < qr.size) {
      if (!qr.modules[r]![c]) { c++; continue; }
      let run = 1;
      while (c + run < qr.size && qr.modules[r]![c + run]) run++;
      rects.push({ x: (c + QUIET) * MOD, y: (r + QUIET) * MOD, w: run * MOD });
      c += run;
    }
  }
  const tl = `M0 ${tick} V0 H${tick}`;
  const tr = `M${side - tick} 0 H${side} V${tick}`;
  const bl = `M0 ${side - tick} V${side} H${tick}`;
  const br = `M${side - tick} ${side} H${side} V${side - tick}`;

  return (
    <Svg width={side} height={side} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={0} y={0} width={side} height={side} fill={theme.colours.paper} />
      {rects.map((m, i) => (
        <Rect key={String(i)} x={m.x} y={m.y} width={m.w} height={MOD} fill={theme.colours.ink} />
      ))}
      {[tl, tr, bl, br].map((d, i) => (
        <Path key={`t${i}`} d={d} stroke={shopColour.primaryStrong} strokeWidth={stroke} fill="none" />
      ))}
    </Svg>
  );
}
