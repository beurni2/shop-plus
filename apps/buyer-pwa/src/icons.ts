/**
 * WO-5.3 (Grand Teint) — the 26 canon icons, inlined byte-exact from the
 * founder's `design_handoff_grand_teint/icons` bundle (vendored at
 * apps/buyer-pwa/assets/icons/*.svg, sha-pinned in icons.manifest.json). One
 * shared source of truth for all four repos; every glyph is a single colour
 * `currentColor`, 24-unit viewBox, stroke 1.9 round-caps, no external fetch,
 * no emoji anywhere in chrome (GRAND-TEINT §8). Sized ONLY through the token
 * custom properties on the wrapping class; colour follows `currentColor`.
 *
 * The §6.1 checkout keeps the same slot contract it shipped with — `lockIcon`
 * (Option A, cadenas) and `scooterIcon` (Option B, moto), each an
 * `option-icon` element with no width/height attributes (the CSS var sizes it).
 */

export const CHECKOUT_ICON_NAMES = {
  optionA: 'cadenas',
  optionB: 'moto',
} as const;

/** Inner markup of every canon glyph (the svg wrapper is added per call).
 * Transcribed byte-exact from assets/icons/*.svg — do not hand-edit paths. */
const GLYPHS: Record<string, string> = {
  alerte:
    '<path d="M12 4L21 19.5H3L12 4z"></path><path d="M12 10v4"></path><circle cx="12" cy="16.8" r="1.2" fill="currentColor" stroke="none"></circle>',
  argent:
    '<circle cx="12" cy="12" r="8.5"></circle><path d="M10 16V8.5h4.5"></path><path d="M10 12.2h3.5"></path>',
  cadenas:
    '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"></rect><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"></path><circle cx="12" cy="15.2" r="1.4" fill="currentColor" stroke="none"></circle>',
  camera:
    '<path d="M4 8h3l2-2.5h6L17 8h3v11H4V8z"></path><circle cx="12" cy="13" r="3.2"></circle>',
  chevron: '<path d="M9.5 6l6 6-6 6"></path>',
  cle:
    '<circle cx="8" cy="12" r="3.5"></circle><path d="M11.5 12H20"></path><path d="M17 12v3"></path><path d="M20 12v2.2"></path>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  colis:
    '<path d="M12 3l7.5 4.2v9.6L12 21l-7.5-4.2V7.2L12 3z"></path><path d="M4.5 7.2L12 11.5l7.5-4.3"></path><path d="M12 11.5V21"></path>',
  ecouter:
    '<circle cx="12" cy="12" r="9"></circle><path d="M10.2 8.8l5.2 3.2-5.2 3.2z" fill="currentColor" stroke="none"></path>',
  enregistrer:
    '<circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"></circle>',
  filtre: '<path d="M4 5h16l-6 7v5.5l-4 2.5v-8L4 5z"></path>',
  gains: '<path d="M4 17l5-5 3 3 7.5-7.5"></path><path d="M14.5 7.5h5v5"></path>',
  horloge:
    '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path>',
  horsligne:
    '<path d="M3 6.5a13 13 0 0 1 18 0"></path><path d="M6.5 10a8.5 8.5 0 0 1 11 0"></path><circle cx="12" cy="16.5" r="1.6" fill="currentColor" stroke="none"></circle><path d="M4 20L20 4"></path>',
  moto:
    '<circle cx="5.5" cy="17.5" r="2.4"></circle><circle cx="18.5" cy="17.5" r="2.4"></circle><path d="M7.9 17.5h5.6l2.2-6h3.4"></path><path d="M15.8 6.8h2.4l1.4 4.7"></path><path d="M11 11.5H7.2c-1.8 0-3 1.3-3.4 3"></path>',
  oeil:
    '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path><circle cx="12" cy="12" r="2.6"></circle>',
  partager:
    '<circle cx="6" cy="12" r="2.6"></circle><circle cx="17.5" cy="5.5" r="2.6"></circle><circle cx="17.5" cy="18.5" r="2.6"></circle><path d="M8.4 10.8l6.8-4"></path><path d="M8.4 13.2l6.8 4"></path>',
  recherche:
    '<circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path>',
  refus: '<path d="M6.5 6.5l11 11"></path><path d="M17.5 6.5l-11 11"></path>',
  repere: '<path d="M6 21V4"></path><path d="M6 5h11l-2.5 3.5L17 12H6"></path>',
  reprendre:
    '<path d="M4 10a8 8 0 1 1 2 5.3"></path><path d="M4 5.5V10h4.5"></path>',
  scelle:
    '<circle cx="12" cy="9.5" r="4.5"></circle><path d="M9.8 13.5L8.5 20.5l3.5-1.8 3.5 1.8-1.3-7"></path>',
  sos:
    '<path d="M12 3.2l6.8 2.7v5.1c0 4.3-2.9 7.2-6.8 8.8-3.9-1.6-6.8-4.5-6.8-8.8V5.9L12 3.2z"></path><path d="M12 8v4.5"></path><circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none"></circle>',
  telephone:
    '<path d="M5 4h4l1.5 4.5-2.2 1.6a13 13 0 0 0 5.6 5.6l1.6-2.2L20 15v4a1.8 1.8 0 0 1-2 1.8A16.5 16.5 0 0 1 3.2 6 1.8 1.8 0 0 1 5 4z"></path>',
  voix:
    '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"></path><path d="M6 11a6 6 0 0 0 12 0"></path><path d="M12 17v3.5"></path>',
  zone:
    '<rect x="4" y="4" width="7" height="9"></rect><rect x="13.5" y="4" width="6.5" height="5.5"></rect><rect x="13.5" y="12" width="6.5" height="8"></rect><rect x="4" y="15.5" width="7" height="4.5"></rect>',
};

// The FIRST svg-open literal in this module carries class="option-icon" and
// no width/height — the checkout slot contract the kit test pins.
const OPTION_SVG_OPEN =
  '<svg class="option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Option A — the lock (cadenas): « Votre paiement est protégé ». */
export function lockIcon(): string {
  return OPTION_SVG_OPEN + GLYPHS['cadenas'] + '</svg>';
}

/** Option B — the scooter (moto): the delivery leg paid now, the rest at the door. */
export function scooterIcon(): string {
  return OPTION_SVG_OPEN + GLYPHS['moto'] + '</svg>';
}

/** Any canon glyph, inline, sized by the wrapping class's token var. Icons are
 * always paired with text in the markup (icon + word law) — never alone. */
export function icon(name: string, className = 'gt-icon'): string {
  const inner = GLYPHS[name] ?? '';
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
