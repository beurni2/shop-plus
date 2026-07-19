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

export type VitrineThemeKey = 'laterite' | 'danfani' | 'indigo' | 'foret';

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

export const VITRINE_THEMES: Record<VitrineThemeKey, VitrineTheme> = {
  laterite: { name: 'Latérite', accent: '#C2571B', deep: '#7A340E', soft: '#F7E7D8', on: '#FFF6EC', sh: '194,87,27' },
  danfani: { name: 'Dan Fani', accent: '#A31D4E', deep: '#701134', soft: '#F8E4EC', on: '#FCF4EE', sh: '163,29,78' },
  indigo: { name: 'Indigo', accent: '#3E4B8C', deep: '#232B54', soft: '#E7EAF6', on: '#F2F4FC', sh: '62,75,140' },
  foret: { name: 'Forêt', accent: '#0B5B47', deep: '#073B2E', soft: '#E4EFE9', on: '#F6F1E7', sh: '11,91,71' },
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
  root.classList.remove('vt-theme-laterite', 'vt-theme-danfani', 'vt-theme-indigo', 'vt-theme-foret');
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
