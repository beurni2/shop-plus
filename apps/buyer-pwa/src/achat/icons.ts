/**
 * PARCOURS D'ACHAT — the icon set, byte-for-byte from the pixel source.
 *
 * Every icon draws in `currentColor`: the containing element sets `color` — to
 * `var(--vt-accent)`/`var(--vt-deep)` where θ applies, to a literal where it
 * must never theme (custody gold/ink, danger, statuses). This keeps the theme
 * drive a single property flip and the « Jamais θ » elements immune by
 * construction. Sizes and stroke-widths are the pixel source's exact values.
 */

interface SvgOpts {
  readonly sw?: number;
  readonly fill?: boolean;
}

function stroked(size: number, path: string, sw = 1.9): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

/** Shield + inner check — the header trust button and the trust/protection rows. */
export const iconShieldCheck = (s: number, sw = 1.9): string =>
  stroked(s, '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"></path><path d="M9 11.5l2 2 4-4"></path>', sw);

/** The lone check — verified coche, PAGE SIGNÉE, choice radios, timeline done, S6 disc. */
export const iconCheck = (s: number, sw = 2.6): string =>
  stroked(s, '<path d="M5 12.5l4.5 4.5L19 7.5"></path>', sw);

/** Filled play triangle (voice player). Colour via `fill` on the element `color`. */
export const iconPlay = (s: number): string =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M9 7.2v9.6l8.2-4.8z"></path></svg>`;

/** Back chevron (stacked-screen head). */
export const iconBack = (s: number, sw = 2.1): string =>
  stroked(s, '<path d="M14.5 6l-6 6 6 6"></path>', sw);

/** Forward chevron (« Voir la boutique › », protections row, « Un souci ? »). */
export const iconChevron = (s: number, sw = 2.2): string =>
  stroked(s, '<path d="M9 6l6 6-6 6"></path>', sw);

/** Séra scooter (trust row « Livré par Séra »). */
export const iconScooter = (s: number, sw = 1.9): string =>
  stroked(s, '<circle cx="5.5" cy="17" r="2.6"></circle><circle cx="18.5" cy="17" r="2.6"></circle><path d="M5.5 17h5l2.5-5h3l2 5"></path><path d="M13 12l-1.5-3H9"></path>', sw);

/** Storefront / devanture (épuisé exit, confirmation ghost). */
export const iconStore = (s: number, sw = 1.9): string =>
  stroked(s, '<path d="M4.5 9.5L5.8 5h12.4l1.3 4.5"></path><path d="M5.5 9.5V19h13V9.5"></path><path d="M10 19v-5.5h4V19"></path>', sw);

/** Repère pin (S4 repère line). */
export const iconPin = (s: number, sw = 2): string =>
  stroked(s, '<path d="M12 21s-6.5-5.3-6.5-10A6.5 6.5 0 0112 4.5 6.5 6.5 0 0118.5 11c0 4.7-6.5 10-6.5 10z"></path><circle cx="12" cy="11" r="2.4"></circle>', sw);

/** Bolt (Express). */
export const iconBolt = (s: number, sw = 2): string =>
  stroked(s, '<path d="M13 3L5 13.5h6L11 21l8-10.5h-6z"></path>', sw);

/** Microphone (S3 voice-chemin). */
export const iconMic = (s: number, sw = 1.9): string =>
  stroked(s, '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5.5 11.5a6.5 6.5 0 0013 0"></path><path d="M12 18v3"></path>', sw);

/** Lock closed (phone field, SCELLÉ pill, protections numéro). */
export const iconLockClosed = (s: number, sw = 1.9): string =>
  stroked(s, '<rect x="5" y="10" width="14" height="10" rx="2.5"></rect><path d="M8 10V7.5a4 4 0 018 0V10"></path>', sw);

/** Lock open (RÉVÉLÉ pill). */
export const iconLockOpen = (s: number, sw = 2.4): string =>
  stroked(s, '<rect x="5" y="10" width="14" height="10" rx="2.5"></rect><path d="M8 10V5.5a4 4 0 018 0"></path>', sw);

/** Lock + code slot (protections « Remise contre votre code »). */
export const iconLockCode = (s: number, sw = 1.9): string =>
  stroked(s, '<rect x="5" y="10" width="14" height="10" rx="2.5"></rect><path d="M8 10V5.5a4 4 0 018 0"></path><path d="M12 14v2.5"></path>', sw);

/** Warning triangle (« Un souci ? », protections danger row). */
export const iconWarning = (s: number, sw = 2.3): string =>
  stroked(s, '<path d="M12 4L2.8 20h18.4L12 4z"></path><path d="M12 10v4.5"></path><path d="M12 17.5v.01"></path>', sw);

/** Clock (S5-B « Prenez votre temps » banner). */
export const iconClock = (s: number, sw = 2): string =>
  stroked(s, '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 8v4.5l2.8 1.8"></path>', sw);

/** Magnifier (protections « Inspectez avant de payer »). */
export const iconSearch = (s: number, sw = 1.9): string =>
  stroked(s, '<circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.2-4.2"></path>', sw);

/** Cash card (S2 « Espèces à la porte »). */
export const iconCash = (s: number, sw = 1.9): string =>
  stroked(s, '<rect x="3" y="7" width="18" height="11" rx="2.5"></rect><circle cx="12" cy="12.5" r="2.6"></circle><path d="M6.5 10.2v.01M17.5 14.8v.01"></path>', sw);

/** Mobile phone (S2 « Mobile Money à la porte »). */
export const iconMobile = (s: number, sw = 1.9): string =>
  stroked(s, '<rect x="7" y="2.5" width="10" height="19" rx="2.5"></rect><path d="M11 18.5h2"></path>', sw);

export type { SvgOpts };
