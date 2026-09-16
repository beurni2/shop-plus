/**
 * ═══ CATEGORIES-OPPORTUNITES-1 (founder order 2026-08-23) — « add products
 * categories where resellers can choose their category » ═══
 *
 * The browse wire has carried `category` since CATEGORY-WIRE-1 (canon v3.0.0)
 * and this app's Offer mirror dropped it on the floor. The pure functions here
 * are the whole feature's logic: what the wire's value is CALLED, which rayon
 * it IS, which categories are PRESENT in the live feed, and the filters.
 *
 * ═══ THE OPPORTUNITÉS CHIPS ROW IS DATA-DRIVEN; THE PICKERS OFFER THE
 * PLATFORM'S SHELVES (RAYONS-CANON-1 → TAXONOMIE-CANON-1, canon 3.14.0) ═══
 *
 * Boutik+'s wizard (RAYONS-1) submits the category label VERBATIM — the wire
 * value for its whole taxonomy IS French display text ('Poussette',
 * 'Mode femme', …). The shelves themselves now live ONCE, in
 * `@platform/taxonomy` (the founder's order of 2026-09-16: the list's home is
 * platform-contracts, edited there with a canon MINOR, never in an app); the
 * hand copy this file carried for four days is gone with its drift.
 *
 * Two pickers, two laws, on purpose:
 *   · the Opportunités CHIPS ROW is built from what the feed actually
 *     contains — a chip must never point at an empty grid;
 *   · the PICKERS (« Mes rayons », the entrance) offer the whole taxonomy
 *     PLUS whatever the wire or her account carries that the taxonomy does
 *     not know — a rayon with no product on the feed yet (« Maison ») must
 *     still be choosable, or a product published under it can never reach her.
 *
 * ═══ RAYONS-HERITES-1 (founder, 2026-09-16: « fix the 3 ») — ONE RAYON,
 * WHATEVER ITS SPELLING ON THE WIRE ═══
 *
 * Only the three canon-era MVP identifiers predate the labels and ride as
 * snake_case ids. Two of them are the SAME rayon as a shelf's category today
 * (`shoes` = « Chaussures », `sealed_beauty_cosmetics` = « Beauté scellée »);
 * an account that chose `shoes` in the id era and a product Boutik+ publishes
 * as « Chaussures » today are one rayon and used to never meet. So every
 * match, every count and every chip goes through `rayonCanon`: the id and its
 * label are one value on her screen, and her book moves to the label the next
 * time SHE saves her rayons (never silently). The third id
 * (`fashion_bags_fabrics` — « Mode, sacs & tissus ») spans several shelves
 * and has no twin: it stays its own rayon, under « Autres rayons ».
 *
 * An id this map has never met still reads as words, never as snake_case on
 * a reseller's screen. Deterministic throughout (Loi 5): first-appearance
 * order, no ranking, no counts-as-ordering.
 */

import { CATEGORIES, IDENTIFIANTS_CANON, RAYONS, type Rayon } from '@platform/taxonomy';
import type { Offer } from './offers';

export { CATEGORIES, RAYONS, type Rayon };

/** What a wire category is CALLED on her screen. French text passes through
 *  untouched; a known id gets its name; an unknown id-shaped value (it can
 *  only come from a future canon) is mechanically humanized — words, never
 *  snake_case, never a crash. */
export function labelCategorie(raw: string): string {
  const v = raw.trim();
  const canon = IDENTIFIANTS_CANON.get(v);
  if (canon !== undefined) return canon;
  if (!v.includes('_')) return v;
  const mots = v.split('_').filter((m) => m !== '').join(' ');
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

/** Which rayon a wire value IS: a canon-era id whose label sits on a shelf
 *  today is that shelf's category; anything else is itself, trimmed. */
export function rayonCanon(raw: string): string {
  const v = raw.trim();
  const nom = IDENTIFIANTS_CANON.get(v);
  return nom !== undefined && CATEGORIES.has(nom) ? nom : v;
}

/** The distinct rayons PRESENT in the live feed, in first-appearance order —
 *  stable across renders because the feed's order is the service's. Each
 *  rayon ONCE, whatever its spelling on the wire (an id-era product and a
 *  label-era product of the same rayon share one chip). Offers with no usable
 *  category simply belong to « Tout » alone: a chip must name something, so
 *  none is invented for them. */
export function categoriesPresentes(offers: readonly Offer[]): readonly string[] {
  const vues: string[] = [];
  for (const o of offers) {
    const c = typeof o.category === 'string' ? rayonCanon(o.category) : '';
    if (c !== '' && !vues.includes(c)) vues.push(c);
  }
  return vues;
}

/** The filter. `null` = « Tout ». Matching is on the RAYON (the canonical
 *  wire value), never the label — two different rayons naming alike must not
 *  merge, and one rayon spelled two ways must. */
export function filtrerOffres(offers: readonly Offer[], categorie: string | null): readonly Offer[] {
  if (categorie === null) return offers;
  const voulu = rayonCanon(categorie);
  return offers.filter((o) => (typeof o.category === 'string' ? rayonCanon(o.category) : '') === voulu);
}

/**
 * RAYONS-REVENDEUR-1 — HER selection first: the categories she chose narrow
 * the whole browse feed before the chips row even builds. No choice
 * (absent/empty) = everything — the pre-slice screen, and every account that
 * predates the slice. Matched rayon to rayon, exactly as `filtrerOffres`.
 */
export function filtrerParSelection(offers: readonly Offer[], selection: readonly string[] | undefined): readonly Offer[] {
  if (selection === undefined || selection.length === 0) return offers;
  const voulu = selection.map(rayonCanon);
  return offers.filter((o) => voulu.includes(typeof o.category === 'string' ? rayonCanon(o.category) : ''));
}

/**
 * Everything the given lists carry that the taxonomy does NOT know — her
 * saved rayons (a canon-era id with no twin, or a value Boutik+ retired), her
 * unsaved picks, the feed's values — as rayons, non-empty, first appearance
 * wins, so a picker renders each rayon exactly once.
 */
export function autresRayons(...listes: readonly (readonly string[])[]): string[] {
  const vues: string[] = [];
  for (const liste of listes) {
    for (const raw of liste) {
      const c = rayonCanon(raw);
      if (c !== '' && !CATEGORIES.has(c) && !vues.includes(c)) vues.push(c);
    }
  }
  return vues;
}
