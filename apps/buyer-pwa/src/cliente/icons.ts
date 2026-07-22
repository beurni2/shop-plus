/**
 * PWA CLIENTE — the inline SVG icon set, ported stroke-for-stroke from the
 * pixel source (`docs/PWA Cliente - Redesign.dc.html`). Every path/viewBox is
 * the prototype's exact byte; color rides `currentColor` (or an explicit fill
 * where the pixel hardcodes one on a « Jamais θ » surface), so the stylesheet
 * — never this module — decides θ vs literal. No emoji anywhere (the
 * no-emoji-in-chrome gate): the product photo glyph comes from the canon
 * vitrine set, drawn by screens.ts.
 */

interface SvgOpts {
  readonly w: number;
  readonly h?: number;
}

const svg = (o: SvgOpts, viewBox: string, body: string, fill = 'none', stroke = true, sw = 2, caps = true): string =>
  `<svg width="${o.w}" height="${o.h ?? o.w}" viewBox="${viewBox}" fill="${fill}"${
    stroke ? ` stroke="currentColor" stroke-width="${sw}"${caps ? ' stroke-linecap="round" stroke-linejoin="round"' : ''}` : ''
  } aria-hidden="true">${body}</svg>`;

/** La coche — vérifiée / option choisie / étape faite (pixel path). */
export const iconCheck = (s: number, sw = 2.6): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M5 12.5l4.5 4.5L19 7.5"></path>', 'none', true, sw);

/** Le bouclier-coche — protections / paiement protégé. */
export const iconShieldCheck = (s: number, sw = 1.9): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M12 3.2l6.8 2.7v5.1c0 4.3-2.9 7.2-6.8 8.8-3.9-1.6-6.8-4.5-6.8-8.8V5.9L12 3.2z"></path><path d="M9.2 11.8l2 2 3.6-3.9"></path>', 'none', true, sw);

/** La moto Séra. */
export const iconScooter = (s: number, sw = 1.8): string =>
  svg({ w: s }, '0 0 24 24', '<circle cx="5.5" cy="17.5" r="2.4"></circle><circle cx="18.5" cy="17.5" r="2.4"></circle><path d="M7.9 17.5h5.6l2.2-6h3.4"></path><path d="M15.8 6.8h2.4l1.4 4.7"></path><path d="M11 11.5H7.2c-1.8 0-3 1.3-3.4 3"></path>', 'none', true, sw);

/** Le cadenas fermé (numéro privé, code caché). */
export const iconLock = (s: number, sw = 1.9): string =>
  svg({ w: s }, '0 0 24 24', '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"></rect><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"></path>', 'none', true, sw, false);

/** Le cadenas à point (option « Tout payer maintenant »). */
export const iconLockDot = (s: number, sw = 1.9): string =>
  svg({ w: s }, '0 0 24 24', '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"></rect><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"></path><circle cx="12" cy="15.2" r="1.4" fill="currentColor" stroke="none"></circle>', 'none', true, sw, false);

/** Retour. */
export const iconBack = (s: number, sw = 2.1): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M14.5 6l-6 6 6 6"></path>', 'none', true, sw);

/** Chevron avant. */
export const iconChevron = (s: number, sw = 2): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M9.5 6l6 6-6 6"></path>', 'none', true, sw);

/** Triangle de lecture plein (lecteur voix 24-grid). */
export const iconPlay = (s: number): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M9 7.2v9.6l8.2-4.8z"></path>', 'currentColor', false);

/** Petit triangle de lecture (ÉCOUTER LA NOTE / barre vocale — pixel 10×12 grid). */
export const iconPlaySmall = (w: number, h: number): string =>
  `<svg width="${w}" height="${h}" viewBox="0 0 10 12" aria-hidden="true"><path d="M0.5 0.8l9 5.2-9 5.2z" fill="currentColor"></path></svg>`;

/** Le micro. */
export const iconMic = (s: number, sw = 1.9): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"></path><path d="M6 11a6 6 0 0 0 12 0"></path><path d="M12 17v3.5"></path>', 'none', true, sw);

/** Le micro barré (refusé). */
export const iconMicOff = (s: number, sw = 1.8): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"></path><path d="M6 11a6 6 0 0 0 12 0"></path><path d="M12 17v3.5"></path><path d="M4 20L20 4"></path>', 'none', true, sw);

/** Le wifi barré (hors ligne). */
export const iconWifiOff = (s: number, sw = 1.8): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M3 6.5a13 13 0 0 1 18 0"></path><path d="M6.5 10a8.5 8.5 0 0 1 11 0"></path><circle cx="12" cy="16.5" r="1.6" fill="currentColor" stroke="none"></circle><path d="M4 20L20 4"></path>', 'none', true, sw, false);

/** L'horloge (en attente). */
export const iconClock = (s: number, sw = 1.9): string =>
  svg({ w: s }, '0 0 24 24', '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path>', 'none', true, sw, false);

/** Le drapeau du repère (récap C4). */
export const iconFlag = (s: number, sw = 1.9): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M6 21V4"></path><path d="M6 5h11l-2.5 3.5L17 12H6"></path>', 'none', true, sw);

/** L'œil (inspecter avant de payer — C2). */
export const iconEye = (s: number, sw = 1.8): string =>
  svg({ w: s }, '0 0 24 24', '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path><circle cx="12" cy="12" r="2.6"></circle>', 'none', true, sw);

/** Le téléphone (confirmation opérateur). */
export const iconPhone = (s: number, sw = 1.7): string =>
  svg({ w: s }, '0 0 24 24', '<rect x="6" y="2.5" width="12" height="19" rx="2.5"></rect><path d="M10 5.5h4"></path><circle cx="12" cy="17.5" r="1.3" fill="currentColor" stroke="none"></circle>', 'none', true, sw, false);

/** La clé (le code de remise fait foi — C2). */
export const iconKey = (s: number, sw = 1.8): string =>
  svg({ w: s }, '0 0 24 24', '<circle cx="8" cy="12" r="3.5"></circle><path d="M11.5 12H20"></path><path d="M17 12v3"></path>', 'none', true, sw, false);

/** La case cochée de la checklist porte (sémantique #0B5B47 — Jamais θ). */
export const iconCheckSquare = (s: number, sw = 2): string =>
  svg({ w: s }, '0 0 24 24', '<rect x="4" y="4" width="16" height="16" rx="5"></rect><path d="M8.5 12.5l2.4 2.4 4.8-5"></path>', 'none', true, sw);

/** L'onde statique du lecteur C-VOIX — 20 barres, hauteurs px du pixel source. */
export const VOICE_WAVE_HEIGHTS: readonly number[] = [8, 14, 10, 18, 22, 12, 16, 20, 9, 15, 19, 11, 17, 13, 21, 10, 14, 18, 9, 12];

/** L'onde SVG de la note enregistrée (C3) — les rects exacts du pixel source. */
export const RECORDED_WAVE_SVG =
  '<svg width="110" height="22" viewBox="0 0 120 22" fill="currentColor" aria-hidden="true" style="flex:1;min-width:0;"><rect x="0" y="8" width="3" height="6" rx="1.5"></rect><rect x="6" y="5" width="3" height="12" rx="1.5"></rect><rect x="12" y="2" width="3" height="18" rx="1.5"></rect><rect x="18" y="6" width="3" height="10" rx="1.5"></rect><rect x="24" y="3" width="3" height="16" rx="1.5"></rect><rect x="30" y="8" width="3" height="6" rx="1.5"></rect><rect x="36" y="4" width="3" height="14" rx="1.5"></rect><rect x="42" y="1" width="3" height="20" rx="1.5"></rect><rect x="48" y="6" width="3" height="10" rx="1.5"></rect><rect x="54" y="3" width="3" height="16" rx="1.5"></rect><rect x="60" y="7" width="3" height="8" rx="1.5"></rect><rect x="66" y="2" width="3" height="18" rx="1.5"></rect><rect x="72" y="6" width="3" height="10" rx="1.5"></rect><rect x="78" y="9" width="3" height="4" rx="1.5"></rect><rect x="84" y="4" width="3" height="14" rx="1.5"></rect><rect x="90" y="7" width="3" height="8" rx="1.5"></rect><rect x="96" y="2" width="3" height="18" rx="1.5"></rect><rect x="102" y="6" width="3" height="10" rx="1.5"></rect><rect x="108" y="8" width="3" height="6" rx="1.5"></rect><rect x="114" y="5" width="3" height="12" rx="1.5"></rect></svg>';

export type { SvgOpts };
