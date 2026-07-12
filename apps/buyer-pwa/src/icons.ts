/**
 * WO-4.4 — the §6.1 option icons (lock for Option A, scooter for Option B),
 * paired with text per the family law (« icons always paired with text »).
 * ui-tokens v0.6.0 carries icon-name slots only under `landmark.iconNames`
 * (« ⏳ icon names are CTO default slots; the assets are app-side work ») and
 * names no lock/scooter slot — so these are APP-SIDE assets following the
 * same convention, sized and colored ONLY through the token custom
 * properties (`--icon-size`, `currentColor`). ⚠ journaled: lock/scooter
 * iconName slots belong in the ui-tokens v0.7.0 docket alongside the
 * interaction tokens.
 */

export const CHECKOUT_ICON_NAMES = {
  optionA: 'cadenas',
  optionB: 'moto',
} as const;

const SVG_OPEN =
  '<svg class="option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Option A — the lock: « Votre paiement est protégé ». */
export function lockIcon(): string {
  return [
    SVG_OPEN,
    '<rect x="5" y="11" width="14" height="9" rx="2"/>',
    '<path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    '</svg>',
  ].join('');
}

/** Option B — the scooter: the delivery leg paid now, the rest at the door. */
export function scooterIcon(): string {
  return [
    SVG_OPEN,
    '<circle cx="5.5" cy="17.5" r="2.5"/>',
    '<circle cx="18.5" cy="17.5" r="2.5"/>',
    '<path d="M5.5 17.5h6l2-7h3"/>',
    '<path d="M14 7h2.5l2 10.5"/>',
    '<path d="M8 10h4"/>',
    '</svg>',
  ].join('');
}
