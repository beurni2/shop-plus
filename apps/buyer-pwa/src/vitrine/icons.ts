/**
 * VITRINE — the SVG icon library for the redesigned buyer surface.
 *
 * Path geometry is DESIGN DATA extracted verbatim from the pixel source
 * (Phase-0) — the same law as a color value: taken exactly, never redrawn by
 * feel. Every icon renders as `<svg class="i" …>` with explicit width/height,
 * matching the planche's markup byte-for-byte so the Phase-4 property diff can
 * compare the nodes structurally.
 *
 * PRODUCT GLYPHS are the one lawful divergence: the planche prototypes product
 * art with emoji placeholders, which the no-emoji-in-chrome gate (Grand Teint
 * §8) forbids in app code. The 8 canon stroke glyphs below fill the same 44px
 * slot (C-VIT4 « glyphe 44 ») — masked and journaled in the Phase-4 audit.
 */

const SVG = (
  size: number,
  body: string,
  attrs: string,
): string => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" ${attrs}>${body}</svg>`;

const stroke = (color: string, width: number, joins = true): string =>
  `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"${joins ? ' stroke-linejoin="round"' : ''}`;

/** Check mark — the verified/confirmation glyph (planche path, all sizes). */
export const iconCheck = (size: number, color: string, width: number): string =>
  SVG(size, '<path d="M5 12.5l4.5 4.5L19 7.5"></path>', stroke(color, width));

/** Forward chevron (C-ENT1/C-ENT2 affordance). */
export const iconChevron = (size: number, color: string, width: number): string =>
  SVG(size, '<path d="M9.5 6l6 6-6 6"></path>', stroke(color, width));

/** Back chevron (V7 retour, K headers). */
export const iconBack = (size: number, color: string, width: number): string =>
  SVG(size, '<path d="M14.5 6l-6 6 6 6"></path>', stroke(color, width));

/** Shield-check — protections / Séra verified (two planche paths). */
export const iconShieldCheck = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<path d="M12 3.2l6.8 2.7v5.1c0 4.3-2.9 7.2-6.8 8.8-3.9-1.6-6.8-4.5-6.8-8.8V5.9L12 3.2z"></path><path d="M9.2 11.8l2 2 3.6-3.9"></path>',
    stroke(color, width),
  );

/** Séra scooter (« Livré par Séra » chip on the product page). */
export const iconScooter = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<circle cx="5.5" cy="17.5" r="2.4"></circle><circle cx="18.5" cy="17.5" r="2.4"></circle><path d="M7.9 17.5h5.6l2.2-6h3.4"></path><path d="M15.8 6.8h2.4l1.4 4.7"></path><path d="M11 11.5H7.2c-1.8 0-3 1.3-3.4 3"></path>',
    stroke(color, width),
  );

/** Padlock (« Paiement protégé »). */
export const iconLock = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"></rect><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"></path>',
    stroke(color, width, false),
  );

/** Devanture — the storefront glyph (C-ENT2/3/4, V6). */
export const iconDevanture = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<path d="M4.5 9.5L5.8 5h12.4l1.3 4.5"></path><path d="M5.5 9.5V19h13V9.5"></path><path d="M10 19v-5.5h4V19"></path>',
    stroke(color, width),
  );

/** Share (vitrine top bar). */
export const iconShare = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<path d="M12 13.5V3.8"></path><path d="M8.5 7.2L12 3.8l3.5 3.4"></path><path d="M6.5 11.5H6a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5a2 2 0 0 0-2-2h-.5"></path>',
    stroke(color, width),
  );

/** Filled review star (buyer gold — the avis chip). */
export const iconStar = (size: number, fill: string): string =>
  SVG(size, '<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z"></path>', `fill="${fill}"`);

/** Wifi barré (V4 hors ligne). */
export const iconWifiOff = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<path d="M5 10.5a11 11 0 0 1 14 0"></path><path d="M8 13.8a7 7 0 0 1 8 0"></path><circle cx="12" cy="17.5" r="1.4" fill="' +
      color +
      '" stroke="none"></circle><path d="M4 4l16 16"></path>',
    stroke(color, width, false),
  );

/** Maillon cassé (V5 lien invalide). */
export const iconBrokenLink = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<path d="M9 15l6-6"></path><path d="M10.5 6.5L12 5a4 4 0 0 1 5.7 5.7L16 12.4"></path><path d="M13.5 17.5L12 19a4 4 0 0 1-5.7-5.7L8 11.6"></path><path d="M4 4l3 3M20 20l-3-3"></path>',
    stroke(color, width),
  );

/* ------------------------------------------------- product glyphs (44px) -- */

const GLYPH_STROKE = 'rgba(255,255,255,0.9)';

const glyphSvg = (body: string): string =>
  `<svg class="i" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="${GLYPH_STROKE}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** The 8 canon product glyphs (SVG replaces the planche's emoji placeholders). */
export const PRODUCT_GLYPHS: Record<string, string> = {
  robe: glyphSvg(
    '<path d="M9 3.5h6l-1 3 2.5 3-2 10.5h-5L7.5 9.5 10 6.5l-1-3z"></path><path d="M9.5 12h5"></path>',
  ),
  tissu: glyphSvg(
    '<path d="M4.5 6.5h15v11h-15z"></path><path d="M4.5 10h15M4.5 14h15"></path><path d="M9.5 6.5v11M14.5 6.5v11"></path>',
  ),
  sac: glyphSvg(
    '<path d="M6 9.5h12l-1 10H7l-1-10z"></path><path d="M9 9.5V8a3 3 0 0 1 6 0v1.5"></path>',
  ),
  sandale: glyphSvg(
    '<path d="M6 17.5c-1.5-4 0-9 3-11.5 2 1 3 3.5 2.5 6L9 17.5H6z"></path><path d="M13 17.5c0-3 1.5-5.5 4-6.5 1.5 1.5 2 4 1.5 6.5H13z"></path>',
  ),
  coffret: glyphSvg(
    '<path d="M5.5 10.5h13v9h-13z"></path><path d="M5.5 13h13"></path><path d="M9 10.5V7.5a3 3 0 0 1 6 0v3"></path>',
  ),
  foulard: glyphSvg(
    '<path d="M5 6.5c4.5 2 9.5 2 14 0v4c-4.5 2-9.5 2-14 0v-4z"></path><path d="M8 11.8L6.5 19M16 11.8l1.5 7.2"></path>',
  ),
  chemise: glyphSvg(
    '<path d="M9 4.5L5 7l1.5 4L8 10v9.5h8V10l1.5 1L19 7l-4-2.5-1.5 2h-3L9 4.5z"></path>',
  ),
  photo: glyphSvg(
    '<rect x="4" y="5.5" width="16" height="13" rx="2"></rect><path d="M4 15l4.5-4.5 3.5 3.5 3-3 5 5"></path><circle cx="9.5" cy="9.5" r="1.4"></circle>',
  ),
  pack: glyphSvg(
    '<path d="M5 10.5h14v2H5z"></path><path d="M6.5 12.5v6h11v-6"></path><path d="M9.5 8.5c0-2 5-2 5 0"></path><path d="M12 6.5v2"></path>',
  ),
};

export function productGlyph(key: string): string {
  return PRODUCT_GLYPHS[key] ?? PRODUCT_GLYPHS.tissu!;
}
