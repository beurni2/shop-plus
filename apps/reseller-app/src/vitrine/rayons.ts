/**
 * ═══ CATEGORIES-OPPORTUNITES-1 (founder order 2026-08-23) — « add products
 * categories where resellers can choose their category » ═══
 *
 * The browse wire has carried `category` since CATEGORY-WIRE-1 (canon v3.0.0)
 * and this app's Offer mirror dropped it on the floor. These three pure
 * functions are the whole feature's logic: what the wire's value is CALLED,
 * which categories are PRESENT in the live feed, and the filter itself.
 *
 * ═══ THE OPPORTUNITÉS CHIPS ROW IS DATA-DRIVEN; THE PROFILE PICKER MIRRORS
 * BOUTIK+'S SHELVES (RAYONS-CANON-1, founder order 2026-09-12) ═══
 *
 * Boutik+'s wizard (RAYONS-1) submits the category label VERBATIM — the wire
 * value for its whole taxonomy IS French display text ('Poussette',
 * 'Mode femme', …). Only the three canonical MVP identifiers predate that and
 * ride as snake_case ids; they get their boutik-equivalent names here.
 *
 * Two pickers, two laws, on purpose:
 *   · the Opportunités CHIPS ROW is built from what the feed actually
 *     contains — a chip must never point at an empty grid;
 *   · the PROFILE picker (« Mes rayons ») offers Boutik+'s whole taxonomy
 *     (`RAYONS_BOUTIK`, below) PLUS whatever the wire or her account carries
 *     that the mirror does not know — the founder's order: a rayon with no
 *     product on the feed yet (« Maison ») must still be choosable, or a
 *     product published under it can never reach her. The signup picker stays
 *     feed-driven this slice, with a sentence pointing at the profile.
 *
 * An id this map has never met still reads as words, never as snake_case on
 * a reseller's screen. Deterministic throughout (Loi 5): first-appearance
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

/**
 * RAYONS_BOUTIK — a LOCAL MIRROR of Boutik+'s wizard taxonomy
 * (boutik-plus/apps/supplier-app/src/v2/categorie-details.ts, `RAYONS`,
 * RAYONS-1 2026-08-23). Byte-exact: the wire carries the category label
 * verbatim, so a changed letter is a different rayon. The canon has no
 * taxonomy (the category floor is an open founder decision — the CATEGORY-WIRE
 * derivation names it); until it does, this copy is pinned by test
 * (`test/rayons-taxonomie.test.ts`) and edited BY HAND, in both repos, on
 * purpose. Shelf titles are taxonomy DATA like the category names (Boutik+'s
 * own posture: proper nouns of the store, not sentences).
 *
 * Founder order 2026-09-12: « Add the product category Maison and the other
 * categories on shop+ » — a rayon with no product on the feed yet must still
 * be choosable on her profile.
 */
export interface RayonBoutik {
  readonly titre: string;
  readonly categories: readonly string[];
}

export const RAYONS_BOUTIK: readonly RayonBoutik[] = [
  { titre: 'Bébé — sortie & voyage', categories: ['Siège auto', 'Poussette'] },
  { titre: 'Bébé — chambre', categories: ['Lit petit enfant', 'Lit à barreaux', 'Couffin'] },
  { titre: 'Bébé — bain', categories: ['Baignoire bébé', 'Bassine de bain', 'Tapis de bain', 'Serviette bébé'] },
  { titre: 'Bébé — repas', categories: ['Chaise haute', 'Assiettes & couverts enfant', 'Table de repas enfant', 'Bavoir'] },
  { titre: 'Jouets & jeux', categories: ['Petites voitures', 'Jeux éducatifs', 'Poupées & dînette', "Jeux d'extérieur", 'Vélo enfant'] },
  { titre: 'Maison & chambre', categories: ['Coiffeuse', 'Draps & housses', 'Vase', 'Décoration', 'Maison'] },
  { titre: 'Mode & tissus', categories: ['Mode femme', 'Mode homme', 'Enfant', 'Chaussures', 'Sacs', 'Tissus'] },
  { titre: 'Beauté', categories: ['Beauté scellée'] },
];

/** Every wire value the mirror knows — the membership test behind « Autres rayons ». */
export const CATEGORIES_BOUTIK: ReadonlySet<string> = new Set(RAYONS_BOUTIK.flatMap((r) => r.categories));

/**
 * Everything the given lists carry that the mirror does NOT know — her saved
 * rayons (a legacy canon id, or a value Boutik+ retired), her unsaved picks,
 * the feed's values — trimmed, non-empty, first appearance wins, so the picker
 * renders each wire value exactly once and never rewrites one: matching is on
 * the wire value (`filtrerParSelection`), and a rewrite would change what
 * Opportunités shows her.
 */
export function autresRayons(...listes: readonly (readonly string[])[]): string[] {
  const vues: string[] = [];
  for (const liste of listes) {
    for (const raw of liste) {
      const c = raw.trim();
      if (c !== '' && !CATEGORIES_BOUTIK.has(c) && !vues.includes(c)) vues.push(c);
    }
  }
  return vues;
}
