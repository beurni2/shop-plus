/**
 * WO-VITRINE-FLOW (founder redirect) — RESELLER-MARGIN ARITHMETIC.
 *
 * ═══ MONEY-SHAPE-1 — THE ARITHMETIC MOVED; THIS FILE IS NOW THE APP'S DOOR TO IT ═══
 *
 * Every function and constant below is RE-EXPORTED from `@shop-plus/reseller-money`,
 * which storefront-service imports too. **Nothing is redeclared here** — a second copy
 * of a pricing rule is a second rule, and the two would drift on the first tuning.
 *
 * WHY IT MOVED (founder ruling): `MARKUP_CAP_RATE` was correct in the app while the
 * APP computed the price. PUBLISH-PRICE-1 moved the signing to the service precisely
 * so the app would not author money — and the rule BOUNDING that money stayed behind
 * in the app whose authority over money had just been removed. **A service that signs
 * must bound.**
 *
 * WHY A RE-EXPORT RATHER THAN CHANGING 20+ IMPORT SITES: the app's import surface is
 * unchanged, so this is a placement change that touches one file instead of twenty,
 * and no call site can be missed. The re-export is an IMPORT — the founder's
 * « not duplicated, not re-declared, IMPORTED » is satisfied by construction, and a
 * source scan in `margin.test.ts` proves no arithmetic survives in this file.
 *
 * The rules are the planche's `rc(p, m)` (Shop Plus - Redesign.dc.html:889) and
 * HANDOFF §3: `gross = C + M` · `fee = round(gross × 0.20)` · `net = gross − fee`
 * · `prix client = B + M`. The reseller fee is the canon 20 %·(C+M) (Law #1); this is
 * her OWN margin math on frozen inputs (base B, commission C) — NOT the custody
 * waterfall: it imports no `computeWaterfall` and touches nothing frozen.
 */

export {
  DEFAULT_MARKUP,
  MARKUP_CAP_RATE,
  markupCap,
  defaultMarkup,
  snapMarkup,
  marginBreakdown,
  netFromStored,
  type MarginBreakdown,
} from '@shop-plus/reseller-money';
