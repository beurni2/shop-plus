/**
 * CADRE — how tall a product photograph is allowed to make its card.
 *
 * ═══ WHY THIS EXISTS: THE SQUARE RULE IS RETIRED (founder order 2026-08-03) ═══
 *
 * RESELLER-UX-3 framed every product photograph in a SQUARE, and the reasoning
 * was sound at the time: `cover` on a square barely trims, where a wide short
 * banner butchers a portrait shot. But a square frame also means EVERY CARD IS
 * THE SAME HEIGHT — and once opportunités became two independently flowing
 * columns (RESELLER-UX-5), identical heights meant the columns never fell out
 * of step. The founder asked for his reference's stagger and, told that the
 * square rule was what prevented it, answered: « Drop the square rule. »
 *
 * So the frame now takes the PHOTOGRAPH'S OWN PROPORTIONS. That is what makes
 * the columns drift, and it is also simply more honest: a tall product is shown
 * tall. The trim the square rule was protecting against does not return, because
 * the frame is no longer fighting the photo — it is agreeing with it.
 *
 * ═══ WHY IT IS STILL BOUNDED ═══
 *
 * Unbounded, one panorama or one accidental screenshot would produce a card
 * either the height of the whole screen or a letterbox sliver, and a single bad
 * upload would wreck the column for every product under it. So the ratio is
 * CLAMPED, and inside the clamp the photo is shown as it is; only genuinely
 * extreme shapes get trimmed — a far smaller cost than trimming all of them.
 *
 * Ratios are RN's `aspectRatio` = width ÷ height:
 *   · 1.00 — square
 *   · < 1  — portrait (taller than wide); the tall cards in the reference
 *   · > 1  — landscape
 */

/** 3:4 — the tallest a card may be. Below this, a portrait shot is trimmed. */
export const CADRE_MIN = 0.75;
/** 4:3 — the widest. Above this, a panorama is trimmed rather than obeyed. */
export const CADRE_MAX = 4 / 3;
/** What an unmeasured (or unmeasurable) photograph gets: the old square. */
export const CADRE_DEFAUT = 1;

/**
 * The frame ratio for a photograph of `width` × `height` pixels.
 *
 * NONSENSE IN ⇒ THE SQUARE OUT, deliberately: a zero, a negative, a NaN or a
 * missing dimension means the measurement failed, and the honest answer to a
 * failed measurement is the neutral frame — never a card whose height was
 * decided by a divide-by-zero. This is the branch that runs when a photograph
 * 404s, so it is not a theoretical one.
 */
export function cadreRatio(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return CADRE_DEFAUT;
  return Math.min(CADRE_MAX, Math.max(CADRE_MIN, width / height));
}
