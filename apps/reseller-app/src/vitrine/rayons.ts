/**
 * ═══ CATEGORIES-OPPORTUNITES-1 (founder order 2026-08-23) — « add products
 * categories where resellers can choose their category » ═══
 *
 * The browse wire has carried `category` since CATEGORY-WIRE-1 (canon v3.0.0)
 * and this app's Offer mirror dropped it on the floor. These three pure
 * functions are the whole feature's logic: what the wire's value is CALLED,
 * which categories are PRESENT in the live feed, and the filter itself.
 *
 * ═══ DATA-DRIVEN, NEVER A HARDCODED TAXONOMY ═══
 *
 * Boutik+'s wizard (RAYONS-1) submits the category label VERBATIM — the wire
 * value for its whole taxonomy IS French display text ('Poussette',
 * 'Mode femme', …). Only the three canonical MVP identifiers predate that and
 * ride as snake_case ids; they get their boutik-equivalent names here. So the
 * chips row is built from what the feed actually contains: boutik adding a
 * category tomorrow grows a chip here with NO change in this repo, and an id
 * this map has never met still reads as words, never as snake_case on a
 * reseller's screen. Deterministic throughout (Loi 5): first-appearance
 * order, no ranking, no counts-as-ordering.
 */

import type { Offer } from './offers';

/** The three canon MVP ids — the only non-French values the wire has ever
 *  carried — named as boutik's own wizard names their successors. */
const IDS_CANON: ReadonlyMap<string, string> = new Map([
  ['fashion_bags_fabrics', 'Mode, sacs & tissus'],
  ['shoes', 'Chaussures'],
  ['sealed_beauty_cosmetics', 'Beauté scellée'],
]);

/** What a wire category is CALLED on her screen. French text passes through
 *  untouched; a known id gets its name; an unknown id-shaped value (it can
 *  only come from a future canon) is mechanically humanized — words, never
 *  snake_case, never a crash. */
export function labelCategorie(raw: string): string {
  const v = raw.trim();
  const canon = IDS_CANON.get(v);
  if (canon !== undefined) return canon;
  if (!v.includes('_')) return v;
  const mots = v.split('_').filter((m) => m !== '').join(' ');
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

/** The distinct categories PRESENT in the live feed, in first-appearance
 *  order — stable across renders because the feed's order is the service's.
 *  Offers with no usable category simply belong to « Tout » alone: a chip
 *  must name something, so none is invented for them. */
export function categoriesPresentes(offers: readonly Offer[]): readonly string[] {
  const vues: string[] = [];
  for (const o of offers) {
    const c = typeof o.category === 'string' ? o.category.trim() : '';
    if (c !== '' && !vues.includes(c)) vues.push(c);
  }
  return vues;
}

/** The filter. `null` = « Tout ». Matching is on the WIRE VALUE (trimmed),
 *  never the label — two ids naming alike must not merge. */
export function filtrerOffres(offers: readonly Offer[], categorie: string | null): readonly Offer[] {
  if (categorie === null) return offers;
  return offers.filter((o) => (typeof o.category === 'string' ? o.category.trim() : '') === categorie);
}

/**
 * RAYONS-REVENDEUR-1 — HER selection first: the categories she chose at
 * signup narrow the whole browse feed before the chips row even builds. No
 * choice (absent/empty) = everything — the pre-slice screen, and every
 * account that predates the slice. Trim-matched on the wire value, exactly
 * as `filtrerOffres`.
 */
export function filtrerParSelection(offers: readonly Offer[], selection: readonly string[] | undefined): readonly Offer[] {
  if (selection === undefined || selection.length === 0) return offers;
  const voulu = selection.map((c) => c.trim());
  return offers.filter((o) => voulu.includes(typeof o.category === 'string' ? o.category.trim() : ''));
}
