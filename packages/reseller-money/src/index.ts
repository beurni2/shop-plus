/**
 * MONEY-SHAPE-1 — THE RESELLER-MARGIN ARITHMETIC AND THE MARKUP CEILING, IN ONE PLACE.
 *
 * ═══ WHY THIS MOVED OUT OF THE APP (founder ruling) ═══
 *
 * `MARKUP_CAP_RATE` and `markupCap` lived in `apps/reseller-app/src/vitrine/margin.ts`.
 * That was correct while the APP computed the price. It stopped being correct the
 * moment PUBLISH-PRICE-1 moved the signing to storefront-service precisely so the app
 * would not author money: **the rule bounding that money stayed in the app whose
 * authority over money had just been removed.** A SERVICE THAT SIGNS MUST BOUND.
 *
 * So the constant and the ceiling live here and BOTH consumers IMPORT them — the app
 * to draw the slider's ceiling, the service to refuse a markup above it. Not
 * duplicated, not re-declared: a second copy of a pricing rule is a second rule, and
 * the two would drift on the first tuning.
 *
 * ═══ WHAT THIS IS NOT ═══
 *
 * This is a PLACEMENT change, not a canon change. Nothing here is new arithmetic:
 * every function is the byte-identical body that shipped in the app, moved. The
 * reseller fee rate and `productSubtotal = B + M` live where they always did, and this
 * package deliberately imports NOTHING — no `@platform/*`, no zod, no runtime dep —
 * for two reasons that agree: the RN bundle has to carry it under Metro, and a money
 * rule with a dependency graph is a money rule that can break for unrelated reasons.
 *
 * ═══ THE RULE VS ITS VALUE (journal — tuned 2026-07-16, re-tuned 2026-08-25) ═══
 *
 * SP3's rule « markup within cap » is the canon-side rule and is untouched. Its VALUE
 * is the pilot-tunable knob: the planche's 20 %-of-base was loosened to 100 % on
 * 2026-07-16, then set to **25 % of base** by founder order 2026-08-25 (« Resellers
 * cannot add more than 25% of the base price »). SP3 itself states the cap is
 * « category-tunable, pilot », so tuning the value is not removing the rule. This cap
 * rate is DISTINCT from the reseller FEE rate (0 since FRAIS-ZERO, 2026-08-25).
 */

export interface MarginBreakdown {
  /** M — the reseller's markup. */
  readonly markup: number;
  /** The markup ceiling — `floor(B × MARKUP_CAP_RATE)` (25 % of B, founder 2026-08-25). */
  readonly cap: number;
  /** C + M. */
  readonly gross: number;
  /** round(gross × rate) — the reseller platform fee. FRAIS-ZERO (founder
   *  order 2026-08-25): the rate is 0, so this is 0 F on every breakdown —
   *  the FIELD stays so his future fee design is a rate, not a reshape. */
  readonly fee: number;
  /** gross − fee — the reseller's net (the whole gross while the rate is 0). */
  readonly net: number;
  /** B + M — the price the cliente pays (productSubtotal). */
  readonly client: number;
}

/** The default markup before the reseller sets one.
 *
 * FOUNDER OVERRIDE (2026-07-26, supersedes HANDOFF §3's `?? 1500`): **0 on
 * arrival.** She starts from the base price and ADDS her margin deliberately —
 * a defaulted 1 500 pre-chosen for her was the thing the old untouched-slider
 * CTA gate existed to guard against; with 0 the un-acted default signs the
 * LOWEST possible cliente price and her net stays what the commission alone
 * pays (80 % of C), so publishing on arrival is a safe act, not a trap. One
 * default for every surface — the browse estimate, the fiche and Ma Vitrine
 * read this same constant, so no two screens can disagree about the start. */
export const DEFAULT_MARKUP = 0;

/** The markup ceiling as a fraction of base B. SP3's « markup within cap » rule
 * holds; the VALUE is the pilot-tunable knob — set to 25 % of B (founder order
 * 2026-08-25: « Resellers cannot add more than 25% of the base price »,
 * superseding the 2026-07-16 loosening to 100 %). */
export const MARKUP_CAP_RATE = 0.25;

/** The markup ceiling for a base price — `floor(B × MARKUP_CAP_RATE)`.
 *
 * FLOOR, exact to the franc, replacing the old `round(…/100)×100`: that
 * rounding came from the retired step-100 slider, and on a base like 11 500 it
 * would place the cap at 2 900 — ABOVE 25 % (2 875), which is exactly what the
 * founder's sentence forbids. She types exact francs (MARGE-EXACTE), so the
 * cap can be exact too, and flooring means the bound is never exceeded. */
export function markupCap(basePrice: number): number {
  return Math.floor(basePrice * MARKUP_CAP_RATE);
}

/** The starting markup for a product: the default, clamped to its cap
 * (HANDOFF §3 « margin = min(markup connu ?? 1500, plafond) »). */
export function defaultMarkup(cap: number): number {
  return Math.min(DEFAULT_MARKUP, cap);
}

/**
 * Clamp a raw markup to [0, cap], rounding to `step`.
 *
 * MARGE-EXACTE (founder, 2026-08-15) — THE STEP IS NO LONGER USED IN PRODUCTION.
 * It existed for the planche's `<input step=100>`; the reseller app removed that
 * slider and now passes `step: 1`, because a default of 100 silently turned a
 * typed 750 into 800. The CLAMP is what every caller still wants, and it is the
 * one pricing bound the app shares with `signPrice` in storefront-service. The
 * default is kept only so the money tests can pin the rounding behaviour itself.
 */
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
  // FRAIS-ZERO (founder order 2026-08-25): « For now remove all charging
  // fees system everywhere » — the rate is 0, mirroring RoundingLaw's zeroed
  // numerators in @platform/contracts. The construction stays.
  const fee = Math.round(gross * 0);
  return {
    markup,
    cap: markupCap(basePrice),
    gross,
    fee,
    net: gross - fee,
    client: basePrice + markup,
  };
}

/**
 * MONEY-SHAPE-1 — HER NET, FROM STORED FIELDS ALONE.
 *
 * ═══ THE HALF-SIGNED ARTIFACT THIS CLOSES (founder finding) ═══
 *
 * The listing froze `markup` and `customerPriceFcfa`, so the BUYER's side was signed.
 * It did not freeze `resellerCommission`, so HER side was not: her net was only
 * recomputable against a LIVE C that the supplier can change at any moment. **Her
 * earnings drifted on a listing she had already signed while the buyer's price did
 * not.** The standing law — the money model reconciles, always — covers the whole of
 * a signed artifact, not the buyer's half of it.
 *
 * This function takes the STORED commission and the STORED markup and nothing else.
 * It cannot read supply, because it is not given a way to: the absence of a supply
 * parameter is the guarantee, not a convention anyone has to keep.
 *
 * `basePrice` is deliberately NOT a parameter — net does not depend on B
 * (`gross = C + M`), so requiring it would invite a caller to fetch it live and
 * reintroduce exactly the drift this closes.
 */
export function netFromStored(storedCommission: number, storedMarkup: number): number {
  const gross = storedCommission + storedMarkup;
  // FRAIS-ZERO (founder order 2026-08-25): rate 0 — her net IS the gross,
  // still from stored fields alone, same construction.
  return gross - Math.round(gross * 0);
}
