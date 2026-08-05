/**
 * VITRINE — §1.2 LES QUATRE HABILLAGES « FASO PREMIUM » (ensemble fermé).
 *
 * The closed theme set for the buyer-side vitrine surface. Four presets, no
 * free color picker, ever — contrasts are pre-validated by design (θ.on on
 * θ.accent ≥ 4.5:1 ; θ.deep on white ≥ 7:1). The values are the Phase-0
 * computed-style table's bytes (extracted from the pixel source), which match
 * HANDOFF §1.2 exactly — zero delta was found.
 *
 * CANON-IN-FLIGHT NOTE: `theme` is one of the 7 net-new storefront fields
 * (HANDOFF §3.1) whose contracts change is in flight. This module is shaped so
 * the future `@platform/ui-tokens` pin is a SWAP, not a rebuild: one exported
 * record keyed by the §3.1 `theme` enum, consumed only through `applyTheme`.
 *
 * Recipes are parametric in θ (§1.2): the woven liseré, the price band, the
 * default cover, the CTA shadow, the trust chip — all derive from these five
 * values per theme. Theme re-tint is a CSS-custom-property swap (§8.5:
 * < 300 ms, no reflow — a var swap repaints, it never relayouts).
 */

export type VitrineThemeKey =
  | 'laterite'
  | 'danfani'
  | 'indigo'
  | 'foret'
  // THEMES-8 (canon v3.9.0) — see the recipe note above VITRINE_THEMES.
  | 'frangipanier'
  | 'lagune'
  | 'aubergine'
  | 'sahel';

export interface VitrineTheme {
  /** UI name (K4 preset card). */
  readonly name: string;
  readonly accent: string;
  readonly deep: string;
  readonly soft: string;
  /** Ink on accent (θ.on). */
  readonly on: string;
  /** Shadow rgb triplet for `rgba(θ.sh, .5)` recipes. */
  readonly sh: string;
}

/**
 * ═══ THEMES-8 (canon v3.9.0) — FOUR MORE, ONE OF THEM THE LIGHT PINK ═══
 *
 * Founder order, 2026-08-05: « add 4 more nice and beautiful habillage colors
 * and make sure there is a light pink in it ». The four appended fill the hues
 * the original set left open — rose, teal, violet, bronze — so eight presets
 * cover the wheel without two of them ever being mistaken for each other.
 *
 * THE TWO PROOFS ARE COMPUTED, NEVER EYEBALLED, and pinned in the test suite:
 *   · θ.on on θ.accent ≥ 4.5:1 — the price band's own text
 *   · θ.deep on white   ≥ 7:1  — the deep ink wherever it lands on paper
 *
 * WHY THE PINK'S ACCENT IS A ROSE AND NOT A PASTEL, stated because it is the
 * one place the order and the law pull apart: `θ.on` is the ink on `θ.deep`
 * (see `.vt-*` header rules), so it must stay near-white — which forces the
 * accent dark enough to carry white text. `#B0446B` is the LIGHTEST rose that
 * still clears 4.5:1 (it measures 5.03; the next step lighter, `#B84E74`, falls
 * to 4.46 and fails). The LIGHT pink the founder asked for is therefore θ.soft
 * — `#FBE3EC` — which is what actually covers the vitrine: cover default, tile
 * art, chips, section surfaces. The habillage reads pink and light; only its
 * price band is deep enough to be read in the sun.
 */
export const VITRINE_THEMES: Record<VitrineThemeKey, VitrineTheme> = {
  laterite: { name: 'Latérite', accent: '#C2571B', deep: '#7A340E', soft: '#F7E7D8', on: '#FFF6EC', sh: '194,87,27' },
  danfani: { name: 'Dan Fani', accent: '#A31D4E', deep: '#701134', soft: '#F8E4EC', on: '#FCF4EE', sh: '163,29,78' },
  indigo: { name: 'Indigo', accent: '#3E4B8C', deep: '#232B54', soft: '#E7EAF6', on: '#F2F4FC', sh: '62,75,140' },
  foret: { name: 'Forêt', accent: '#0B5B47', deep: '#073B2E', soft: '#E4EFE9', on: '#F6F1E7', sh: '11,91,71' },
  // THEMES-8 — measured ratios in the comment: on/accent · deep/white.
  frangipanier: { name: 'Frangipanier', accent: '#B0446B', deep: '#6E1F3C', soft: '#FAD3E1', on: '#FFF4F7', sh: '176,68,107' }, // 5.03 · 10.91
  lagune: { name: 'Lagune', accent: '#0E6E70', deep: '#06484A', soft: '#E2F1F0', on: '#F0F8F7', sh: '14,110,112' }, //   5.59 · 10.33
  aubergine: { name: 'Aubergine', accent: '#6A2D6E', deep: '#431B47', soft: '#F1E7F3', on: '#F8F1F9', sh: '106,45,110' }, // 8.56 · 14.13
  sahel: { name: 'Sahel', accent: '#8A6413', deep: '#5A400A', soft: '#F7EBD2', on: '#FDF6E6', sh: '138,100,19' }, //   4.98 · 9.67
};

/** The default theme (§1.2): Latérite. */
export const DEFAULT_THEME: VitrineThemeKey = 'laterite';

/** Buyer-side gold (§1: or acheteuse) — the liseré's third stripe. */
export const BUYER_GOLD = '#C89A3F';

/**
 * Apply θ to a subtree root as CSS custom properties. All theme-parametric CSS
 * reads only these vars, so a theme change is one call — repaint, no reflow.
 */
export function applyTheme(root: HTMLElement, key: VitrineThemeKey): void {
  const t = VITRINE_THEMES[key];
  // Theme class — carries the statically-authored per-theme rules (the cover
  // stripes keep the stylesheet-parsed 8-digit-hex serialization).
  //
  // THEMES-8: the removal list is DERIVED from the record, never re-typed. The
  // hand-written list of four was a trap with a delay on it — adding a preset
  // and forgetting this line leaves the OLD theme's class on the root beside
  // the new one, so a re-theme keeps the previous habillage's static rules and
  // the seller sees two shops fighting. Derived, that is unrepresentable.
  for (const k of Object.keys(VITRINE_THEMES)) root.classList.remove(`vt-theme-${k}`);
  root.classList.add(`vt-theme-${key}`);
  root.style.setProperty('--vt-accent', t.accent);
  root.style.setProperty('--vt-deep', t.deep);
  root.style.setProperty('--vt-soft', t.soft);
  root.style.setProperty('--vt-on', t.on);
  root.style.setProperty('--vt-sh', t.sh);
  // The cover-default stripe is θ.accent at 10 % — authored as an 8-digit hex
  // (suffixe hex 1A, §1.2) exactly as the pixel source authors it.
  root.style.setProperty('--vt-accent10', `${t.accent}1A`);
}
