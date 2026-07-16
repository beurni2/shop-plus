/**
 * WO-VITRINE-FLOW (founder redirect) — RESELLER-MARGIN ARITHMETIC. The reseller
 * sets her markup per product on Ma Vitrine and sees her net update live. This is
 * her OWN margin math on the seed's frozen inputs (base B, commission C) — it is
 * NOT the custody waterfall: it imports no `computeWaterfall`, writes no order /
 * settlement / attribution value, and touches nothing frozen.
 *
 * The rules are the planche's `rc(p, m)` verbatim (Shop Plus - Redesign.dc.html:889)
 * and HANDOFF §3: `gross = C + M` · `fee = round(gross × 0.20)` · `net = gross − fee`
 * · `prix client = B + M` · `plafond M = round(B × 0.20 / 100) × 100`. The reseller
 * fee is the canon 20 %·(C+M) (Law #1); the identities reconcile at EVERY markup
 * (net + fee = gross), and at each seed's authored markup the result equals the
 * pinned seed money to the franc (the money-integrity cross-check in the test).
 */

export interface MarginBreakdown {
  /** M — the reseller's markup. */
  readonly markup: number;
  /** The 20 %-of-base markup ceiling — `round(B × 0.20 / 100) × 100`. */
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

/** The 20 %-of-base markup ceiling (planche rc: `round(B × 0.2 / 100) × 100`). */
export function markupCap(basePrice: number): number {
  return Math.round((basePrice * 0.2) / 100) * 100;
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
