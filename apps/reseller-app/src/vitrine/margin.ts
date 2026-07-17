/**
 * WO-VITRINE-FLOW (founder redirect) — RESELLER-MARGIN ARITHMETIC. The reseller
 * sets her markup per product on Ma Vitrine and sees her net update live. This is
 * her OWN margin math on the seed's frozen inputs (base B, commission C) — it is
 * NOT the custody waterfall: it imports no `computeWaterfall`, writes no order /
 * settlement / attribution value, and touches nothing frozen.
 *
 * The rules are the planche's `rc(p, m)` (Shop Plus - Redesign.dc.html:889) and
 * HANDOFF §3: `gross = C + M` · `fee = round(gross × 0.20)` · `net = gross − fee`
 * · `prix client = B + M`. The reseller fee is the canon 20 %·(C+M) (Law #1); the
 * identities reconcile at EVERY markup (net + fee = gross), and at each seed's
 * authored markup the result equals the pinned seed money to the franc.
 *
 * MARKUP CEILING (founder decision 2026-07-16, JOURNAL): SP3's rule « markup within
 * cap » stays; only its VALUE is loosened — from the planche/launch 20 %-of-base to
 * **100 % of base** (`MARKUP_CAP_RATE`). SP3 states the cap is « category-tunable,
 * pilot », so this is a pilot tuning of the value, not a removal of the rule. Note:
 * this cap rate is DISTINCT from the 20 % reseller FEE, which is canon and untouched.
 */

export interface MarginBreakdown {
  /** M — the reseller's markup. */
  readonly markup: number;
  /** The markup ceiling — `round(B × MARKUP_CAP_RATE / 100) × 100` (loosened to 100 % of B). */
  readonly cap: number;
  /** C + M. */
  readonly gross: number;
  /** round(gross × 0.20) — the canon reseller fee, 20 %·(C+M) (Law #1). */
  readonly fee: number;
  /** gross − fee — the reseller's net (80 % of gross, à la franc près). */
  readonly net: number;
  /** B + M — the price the cliente pays (productSubtotal). */
  readonly client: number;
}

/** The default markup before the reseller sets one (HANDOFF §3: `?? 1500`). */
export const DEFAULT_MARKUP = 1500;

/** The markup ceiling as a fraction of base B. SP3's « markup within cap » rule
 * holds; the VALUE is the pilot-tunable knob — loosened from 20 % to 100 % of B
 * (founder 2026-07-16), so the cliente never pays more than double base. */
export const MARKUP_CAP_RATE = 1;

/** The markup ceiling for a base price — `round(B × MARKUP_CAP_RATE / 100) × 100`. */
export function markupCap(basePrice: number): number {
  return Math.round((basePrice * MARKUP_CAP_RATE) / 100) * 100;
}

/** The starting markup for a product: the default, clamped to its cap
 * (HANDOFF §3 « margin = min(markup connu ?? 1500, plafond) »). */
export function defaultMarkup(cap: number): number {
  return Math.min(DEFAULT_MARKUP, cap);
}

/** Snap a raw markup to the slider step (100) and clamp to [0, cap]
 * (planche slider: `min 0 · max cap · step 100`). */
export function snapMarkup(raw: number, cap: number, step = 100): number {
  const snapped = Math.round(raw / step) * step;
  return Math.max(0, Math.min(cap, snapped));
}

/**
 * The reseller-margin breakdown at markup M — the planche `rc(p, m)` (…:889).
 * `markup` is taken as given (callers clamp via `snapMarkup`); `cap` is returned
 * for the ceiling label. Pure — the same function the display and the tests share.
 */
export function marginBreakdown(basePrice: number, commission: number, markup: number): MarginBreakdown {
  const gross = commission + markup;
  const fee = Math.round(gross * 0.2);
  return {
    markup,
    cap: markupCap(basePrice),
    gross,
    fee,
    net: gross - fee,
    client: basePrice + markup,
  };
}
