/**
 * RESELLER KIT — money formatting (the ecosystem's ONE discipline, kit-local:
 * the kit is its own deployable and cannot import buyer-pwa code).
 *
 * Every amount groups its thousands with U+202F (narrow no-break space) and is
 * suffixed with `[NNBSP]FCFA` — never a bare « F », never a breakable space.
 * The NNBSP comes from ONE escaped constant (`\u202f`), so no raw U+202F byte
 * ever sits in source; grouping is done BY HAND, never via `Intl.NumberFormat`
 * (ICU's fr-FR separator has drifted across versions — U+00A0 → U+202F — so
 * the byte would not be deterministic across builds). PWA-CLEANUP-1 §2.
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

/** « 11 500 FCFA » with NNBSP inside AND before FCFA. Render-only: the value
 * is HER signed price, never recomputed here. */
export function fmtFCFA(n: number): string {
  return `${groupFr(n)}${NNBSP}FCFA`;
}
