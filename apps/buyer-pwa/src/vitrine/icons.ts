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

/** Heart — the « garder » wishlist glyph (NORTH-STAR-1, founder order). Stroke
 *  when off; the .vt-fav-on class flips it filled via CSS `fill: currentColor`. */
export const iconHeart = (size: number, color: string, width: number): string =>
  SVG(size, '<path d="M12 19.8S4.6 15 4.6 9.9a3.9 3.9 0 0 1 7-2.4l.4.5.4-.5a3.9 3.9 0 0 1 7 2.4C19.4 15 12 19.8 12 19.8z"></path>', stroke(color, width));

/** Location pin — the zone line glyph (NORTH-STAR round 4, founder mockup). */
export const iconPin = (size: number, color: string, width: number): string =>
  SVG(size, '<path d="M12 21s-6.5-5.4-6.5-10.3a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z"></path><circle cx="12" cy="10.5" r="2.3"></circle>', stroke(color, width));

/** Shopping bag — the « commander » affordance glyph (NORTH-STAR round 3). */
export const iconBag = (size: number, color: string, width: number): string =>
  SVG(size, '<path d="M6 9.5h12l-1 10H7l-1-10z"></path><path d="M9 9.5V8a3 3 0 0 1 6 0v1.5"></path>', stroke(color, width));

/** Price tag — the trust-row prix glyph (NORTH-STAR round 3). */
export const iconTag = (size: number, color: string, width: number): string =>
  SVG(size, '<path d="M12.6 3.5H20v7.4l-8.2 8.2a2 2 0 0 1-2.8 0l-4.6-4.6a2 2 0 0 1 0-2.8z"></path><circle cx="15.8" cy="7.8" r="1.4"></circle>', stroke(color, width));

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

/* --------------------------------------- ENTETES-A — the contract's paths -- */

/**
 * The five selectable headers draw their own icon set. These paths are the
 * design contract's VERBATIM geometry (« En-tetes Boutique - 5 Styles v2.dc »),
 * not redrawings of the icons above: the contract's shield, padlock (it carries
 * a keyhole), price tag (mirrored) and check differ from the vitrine planche's,
 * and the same law that made the planche paths design data makes these design
 * data too. They are used ONLY by `entetes.ts`; nothing above changes.
 */

/** Check — the contract's seal/badge stroke (`M20 6L9 17l-5-5`). */
export const iconCheckEnt = (size: number, color: string, width: number): string =>
  SVG(size, '<path d="M20 6L9 17l-5-5"></path>', stroke(color, width));

/** Outline location pin (Royale · Chaleureux · Dynamique zone lines). */
export const iconPinEnt = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"></path><circle cx="12" cy="10" r="2.4"></circle>',
    stroke(color, width),
  );

/** SOLID location pin with a punched-out centre (Héritage · Cristal zone
 *  lines): the pin is filled, the inner disc takes the surface colour. */
export const iconPinSolid = (size: number, fill: string, hole: string): string =>
  SVG(
    size,
    `<path d="M12 21.5s7.5-6.6 7.5-11.5a7.5 7.5 0 10-15 0c0 4.9 7.5 11.5 7.5 11.5z"></path><circle cx="12" cy="10" r="2.6" fill="${hole}"></circle>`,
    `fill="${fill}"`,
  );

/** Four-branch sparkle + spark (Héritage frames the shop name with a mirrored
 *  pair). Filled, no stroke. */
export const iconSparkle = (size: number, fill: string): string =>
  SVG(
    size,
    '<path d="M12 2.8l1.6 5.8 5.8 1.6-5.8 1.6L12 17.6l-1.6-5.8L4.6 10.2l5.8-1.6zM19.4 16l.7 2.5 2.5.7-2.5.7-.7 2.5-.7-2.5-2.5-.7 2.5-.7z"></path>',
    `fill="${fill}"`,
  );

/** Shield-check — the contract's trust-row delivery glyph. */
export const iconShieldEnt = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 8.5-4.1-.9-7-4.3-7-8.5V6z"></path><path d="M9 12.2l2.2 2.2L15.5 10"></path>',
    stroke(color, width),
  );

/** Padlock WITH a keyhole — the contract's « Paiement protégé » glyph. */
export const iconLockEnt = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4"></rect><path d="M8.2 10.5V7.8a3.8 3.8 0 017.6 0v2.7"></path><circle cx="12" cy="15.4" r="1.5"></circle>',
    stroke(color, width),
  );

/** Price tag (contract orientation) — the « meilleurs prix » glyph. */
export const iconTagEnt = (size: number, color: string, width: number): string =>
  SVG(
    size,
    '<path d="M20.5 13.2l-7.3 7.3a2 2 0 01-2.8 0l-6.9-6.9a2 2 0 01-.6-1.4V5.5a2 2 0 012-2h6.7a2 2 0 011.4.6l6.9 6.9a2 2 0 010 2.2z"></path><circle cx="8.4" cy="8.4" r="1.5"></circle>',
    stroke(color, width),
  );

/** Filled review star, contract geometry (the five headers' proof rows). */
export const iconStarEnt = (size: number, fill: string): string =>
  SVG(
    size,
    '<path d="M12 2.6l2.9 6.1 6.6.9-4.8 4.7 1.2 6.7L12 17.7 6.1 21l1.2-6.7L2.5 9.6l6.6-.9z"></path>',
    `fill="${fill}"`,
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
