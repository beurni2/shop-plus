/**
 * VITRINE — §3.2 the seed catalog (8 articles, diaspora excluded by decree).
 *
 * Names, prices, stock and the per-product ART treatment (the 140deg gradient
 * pair + the glyph key) are the Phase-0 table's exact bytes — the same seed the
 * Shop+ reseller planche carries. Prices are HER prices (productSubtotal =
 * B + M), frozen at the signed page; the vitrine RENDERS them and computes
 * nothing (§0 loi 2 · décret « render-only »).
 *
 * The glyph key names an SVG in `icons.ts` — the planche prototypes art with
 * emoji glyphs, which the no-emoji-in-chrome gate (Grand Teint §8) forbids in
 * app code; canon SVG glyphs carry the same 44px slot. This is the ONE lawful
 * divergence from the pixel source, journaled in the Phase-4 audit mask.
 */

export interface VitrineSeedProduct {
  readonly pid: string;
  readonly name: string;
  /** HER price — productSubtotal (B + M), signed-page truth, render-only. */
  readonly priceFcfa: number;
  readonly inStock: boolean;
  /** Art gradient pair, 140deg (Phase-0 bytes). */
  readonly art: readonly [string, string];
  /** Canon SVG glyph key (replaces the planche's emoji placeholder). */
  readonly glyph: string;
}

export const VITRINE_SEED: readonly VitrineSeedProduct[] = [
  { pid: 'p1', name: 'Robe brodée bogolan', priceFcfa: 11_500, inStock: true, art: ['#B65C2E', '#7A3014'], glyph: 'robe' },
  { pid: 'p2', name: 'Pagne wax 6 yards', priceFcfa: 20_500, inStock: true, art: ['#146152', '#0A3A31'], glyph: 'tissu' },
  { pid: 'p3', name: 'Sac cuir artisanal', priceFcfa: 17_000, inStock: false, art: ['#8A4F1D', '#5C3210'], glyph: 'sac' },
  { pid: 'p4', name: 'Sandales cuir homme', priceFcfa: 9_200, inStock: true, art: ['#6E4A2B', '#3F2814'], glyph: 'sandale' },
  { pid: 'p5', name: 'Coffret karité pur', priceFcfa: 6_900, inStock: true, art: ['#B08A2E', '#7A5C14'], glyph: 'coffret' },
  { pid: 'p7', name: 'Foulard Faso Dan Fani', priceFcfa: 6_300, inStock: true, art: ['#A31D4E', '#5E0F2C'], glyph: 'foulard' },
  { pid: 'p8', name: 'Chemise Faso Dan Fani', priceFcfa: 13_800, inStock: true, art: ['#3E4B8C', '#232B54'], glyph: 'chemise' },
  { pid: 'k1', name: 'Pack Cuisine Départ', priceFcfa: 14_000, inStock: true, art: ['#8C5A2E', '#4E3016'], glyph: 'pack' },
];

export function seedProduct(pid: string): VitrineSeedProduct | undefined {
  return VITRINE_SEED.find((p) => p.pid === pid);
}
