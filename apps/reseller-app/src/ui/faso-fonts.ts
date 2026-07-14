/**
 * WO-FP · STEP 0 — the FASO PREMIUM typeface substrate for RN. This mirrors the
 * Grand Teint `fonts.ts` idiom exactly: it is DATA ONLY — the two family names,
 * their canon-declared static weights, the bundled asset files, and the
 * metrics-safe system fallback. It does NOT load the font (that is expo-font
 * work in a view slice) and it consumes no token.
 *
 * THE FAMILIES ARE THE CANON'S, not this file's. fasoPremium `type.families`
 * (ui-tokens v1.0.0) declares exactly:
 *   display → « Bricolage Grotesque », weights [700, 800]
 *   text    → « Instrument Sans »,     weights [400, 700]
 * Those four faces — and only those four — ship. Instrument 500/600 are NOT in
 * the canon token, so they are NOT built (derive-never-invent).
 *
 * DISTINCT NAME-TABLE IDENTITIES: each file is a discrete static instance with
 * its own internal name-table family, so the platform never synthesises a faux
 * bold from a lighter face — the weight you ask for is the weight that draws.
 *
 * THE COLD-START LAW (carried from fonts.ts): the families below are the
 * ENHANCEMENT; `fallback` paints FIRST. Nothing gates a first render on a face
 * resolving — Expo loads custom fonts asynchronously; the design renders in the
 * system fallback immediately and swaps in Bricolage/Instrument when ready,
 * with no reflow.
 *
 * THE MONEY-RENDER GUARD: every face here is proven to draw « 11 500 F » (the
 * fr-FR franc figure — narrow no-break space U+202F between thousands) and the
 * full French charset. The proof is faso-premium.coverage.json (sha-bound to
 * these exact bytes) + test/faso-fonts.test.ts, which consumes the real
 * `formatFcfa` and fails LOUD if any emitted codepoint is not covered.
 */

/** The display family the canon locks (fasoPremium type.families.display.name). */
export const DISPLAY_FAMILY = 'Bricolage Grotesque';

/** The text family the canon locks (fasoPremium type.families.text.name). */
export const TEXT_FAMILY = 'Instrument Sans';

/** The bold text face, loaded under its OWN family key. On low-end Android a
 * custom family carries a single weight, so 700 text must name a distinct
 * loaded face — never a synthesised faux-bold (STEP 0's distinct name-tables). */
export const TEXT_FAMILY_BOLD = 'Instrument Sans Bold';

/** The fallback that paints before the faces resolve. On RN this is the
 * platform system face; the swap is designed to cause no reflow (cold-start law). */
export const FONT_FALLBACK = 'System';

/** Display weights → bundled asset files (canon: [700, 800]). */
export const DISPLAY_WEIGHTS = {
  700: 'Bricolage-Bold.ttf',
  800: 'Bricolage-ExtraBold.ttf',
} as const;

/** Text weights → bundled asset files (canon: [400, 700]). */
export const TEXT_WEIGHTS = {
  400: 'Instrument-Regular.ttf',
  700: 'Instrument-Bold.ttf',
} as const;

export type DisplayWeight = keyof typeof DISPLAY_WEIGHTS;
export type TextWeight = keyof typeof TEXT_WEIGHTS;
