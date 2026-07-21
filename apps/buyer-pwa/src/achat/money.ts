/**
 * PARCOURS D'ACHAT — money & hour formatting (§3, §0 loi 4).
 *
 * THE MONEY DISCIPLINE (non-negotiable): every amount groups its thousands with
 * U+202F (narrow no-break space) and is suffixed with `[NNBSP]FCFA` — never a
 * bare « F », never a breakable space, never a wrap. The NNBSP comes from ONE
 * escaped constant (`\u202f`, six ASCII bytes in source), so there is never a
 * raw U+202F byte laundered into a source file (the source-scan test locks it),
 * and the rendered DOM carries the real byte (the money-bytes e2e locks that).
 *
 * Grouping is done BY HAND, never via `Intl.NumberFormat`: ICU's fr-FR group
 * separator has drifted across versions (U+00A0 → U+202F), so relying on it
 * would make the byte non-deterministic across the CI Node's ICU build. Manual
 * grouping with the explicit constant is the only byte-stable path.
 */

/** U+202F — the one narrow-no-break-space source, never a raw byte in a file. */
export const NNBSP = '\u202f';

/** Group an integer's thousands with NNBSP: 11500 → « 11 500 » (NNBSP inside). */
export function groupFr(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = Math.trunc(Math.abs(n)).toString();
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += NNBSP;
    out += digits[i];
  }
  return sign + out;
}

/** « 11 500 FCFA » with NNBSP inside AND before FCFA (§3). Render-only: the
 * value is the signed/composed amount, never recomputed here. */
export function fmtFCFA(n: number): string {
  return `${groupFr(n)}${NNBSP}FCFA`;
}

/** Hours with the NNBSP grammar (§3): « 9 h », « 17 h 40 ». `min` omitted → whole
 * hour. Used in delivery slots and timeline stamps. */
export function fmtHeure(h: number, min?: number): string {
  const base = `${h}${NNBSP}h`;
  return min === undefined ? base : `${base}${NNBSP}${String(min).padStart(2, '0')}`;
}
