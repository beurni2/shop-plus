/**
 * ═══ VIGNETTE — ASK FOR THE SMALL COPY, AT THE ONE PLACE THAT KNOWS THE SIZE ═══
 *
 * Founder, 2026-08-11: « implement the vignette on all of them. »
 *
 * WHAT THE VIGNETTE IS: Boutik+'s media service stores a 320 px copy of every
 * product photograph alongside the full one, and `GET {url}?v=thumb` answers it
 * — falling back to the full photograph when no small copy exists, so this is
 * safe on every ref, including every product listed before the vignette existed.
 *
 * « ALL OF THEM » IS NOT EVERY IMAGE, AND THAT IS THE WHOLE JUDGEMENT HERE.
 * A 320 px file is right for a 52 px thumbnail and WRONG for a card hero: the
 * Opportunités tile and Ma Vitrine's card both render their photograph at
 * `width: '100%'` — full card width, ~350 px on a phone and over a thousand
 * device pixels at 3×. Serving 320 px there would visibly soften the product
 * photography §5 asks us to treat with respect, which is the same cheap-software
 * failure this exists to prevent, arriving from the other direction.
 *
 * So it is applied at the SMALL renders only — the thumbnail strips, at
 * `touch.minTargetPx + spacing.sm` — and never through the projection, because
 * the projection cannot know how big anything is drawn. The render site knows;
 * the wire does not.
 */

/**
 * The vignette's url for an ABSOLUTE product-photograph url, or the input
 * unchanged when there is nothing to ask for.
 *
 * `''` PASSES THROUGH, deliberately: an empty ref already means « no photograph »
 * upstream (`absoluteAssetRefs` answers `[]` rather than a bare ref), and
 * inventing `?v=thumb` on nothing would turn a designed empty state into a
 * request for a url that cannot exist.
 *
 * AN EXISTING QUERY IS RESPECTED rather than clobbered — today none of these
 * urls carry one, and a helper that assumed so would break silently the day one
 * does.
 */
export function vignette(url: string): string {
  if (url === '') return url;
  return url.includes('?') ? `${url}&v=thumb` : `${url}?v=thumb`;
}
