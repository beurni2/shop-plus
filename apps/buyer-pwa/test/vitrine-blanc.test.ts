import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VITRINE_STYLES } from '../src/vitrine/styles';
import { ENTETES_STYLES } from '../src/vitrine/entetes';
import { CLIENTE_STYLES } from '../src/cliente/styles';
import { VITRINE_THEMES } from '../src/vitrine/themes';

/**
 * ═══ BOUTIQUE-BLANC — the appearance pin (founder order 2026-08-14) ═══
 *
 * « I meant the buyer facing boutique whitening it but without touching the
 *   en-tête/headers section »
 *
 * The boutique page's ground was a fixed warm paper for EVERY theme — the
 * theme never lived on the ground; it lives in the liseré, the en-tête sheets
 * and the accents, which all paint their OWN surfaces. So the change is one
 * line on `.vt-root`, and this file pins the three facts that make it exactly
 * his order and nothing more:
 *
 *   1. the ground IS white;
 *   2. the en-tête stays untouched BY CONSTRUCTION — its units bleed over the
 *      page top and paint their own backgrounds edge to edge, so the ground
 *      never shows through a header;
 *   3. the scope line holds — the buyer PAYMENT pages (cl-*) keep their own
 *      warm ground: he named the boutique.
 *
 * Ratios are computed, never remembered. Walks/e2e stay blind to colour by
 * the standing order; appearance lives here.
 */

const lum = (hex: string): number => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const PAPER = '#F4EFE6';
const WHITE = '#FFFFFF';

/** The `.vt-root` block's declarations, comments stripped. */
const rootBlock = (): string => {
  const sans = VITRINE_STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
  return /\.vt-root\s*\{([^}]*)\}/.exec(sans)?.[1] ?? 'BLOCK NOT FOUND';
};

describe('BOUTIQUE-BLANC — the ground is white, the en-tête is untouched, the scope holds', () => {
  it('the boutique ground is white', () => {
    const root = rootBlock();
    expect(root, 'the .vt-root block must exist').not.toBe('BLOCK NOT FOUND');
    expect(root).toContain('background: #FFFFFF');
    expect(root).not.toContain(PAPER);
  });

  it('the en-tête never sits on the page ground — its units paint their own surfaces and bleed over the top', () => {
    /**
     * The structural facts that make « without touching the en-tête » true by
     * construction rather than by promise: the classique hero and the vt-ent
     * family both pull themselves over the page's top structure and carry
     * their own backgrounds, so no header pixel was ever the ground's.
     */
    expect(VITRINE_STYLES).toContain('background: var(--vt-deep)'); // the hero paints itself
    expect(/\.vt-hero\s*\{[^}]*margin:\s*-76px/.test(VITRINE_STYLES), 'the hero bleeds over the page top').toBe(true);
    expect(/\.vt-ent\s*\{[^}]*margin:\s*-76px/.test(ENTETES_STYLES), 'the vt-ent family bleeds over the page top').toBe(true);
    // …and this slice added no ground paint to the en-tête sheet.
    expect(ENTETES_STYLES).not.toContain('BOUTIQUE-BLANC');
    /**
     * THE DIRECTORY-WIDE LAW (verifier: the pin above covered only the
     * classique hero and the shared .vt-ent shell, which paints nothing —
     * the paint lives in the per-style units). EVERY en-tête unit must
     * declare its own background: a unit that paints none would let the
     * page ground show inside a header, which is exactly what the founder
     * carved out. All 32 do today; a 33rd that does not fails here by name.
     */
    const unitsDir = join(new URL('.', import.meta.url).pathname, '..', 'src', 'vitrine', 'entetes');
    const units = readdirSync(unitsDir).filter((f) => f.endsWith('.ts') && f !== 'registry.ts');
    expect(units.length, 'the en-tête units must exist').toBeGreaterThanOrEqual(28);
    for (const f of units) {
      const css = readFileSync(join(unitsDir, f), 'utf8');
      expect(/background(-color)?:/.test(css), `${f}: an en-tête unit must paint its own background`).toBe(true);
    }
  });

  it('SCOPE: the buyer payment pages keep their own warm ground — he named the boutique', () => {
    const cl = CLIENTE_STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
    const clRoot = /\.cl-root\s*\{([^}]*)\}/.exec(cl)?.[1] ?? 'BLOCK NOT FOUND';
    expect(clRoot, 'the .cl-root block must exist — a rename must fail loudly, never fall through').not.toBe('BLOCK NOT FOUND');
    expect(clRoot, 'the cliente ground must still be the warm paper').toContain(PAPER);
  });

  it('every text on the boutique ground gains contrast on white — measured', () => {
    // The three on-ground text colours the page uses (ink, sub, the small
    // section counter). All must improve; the two body-size ones clear AA.
    for (const [what, fg, aa] of [
      ['ink body text', '#1C1710', true],
      ['sub text', '#6F6355', true],
      ['section counter (12px bold — was ALREADY under AA on paper at 3.51, improves here; its cure is its own debt)', '#8A7D6B', false],
    ] as const) {
      expect(ratio(fg, WHITE), `${what} must gain on white`).toBeGreaterThan(ratio(fg, PAPER));
      if (aa) expect(ratio(fg, WHITE), `${what} must clear AA`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('NO THEME IS ERASED — the ground was never themed, and every habillage still stands on white, measured one by one', () => {
    /**
     * FOUNDER (2026-08-14): « make sure no theme is getting erased ». Three
     * proofs, none of them a promise:
     *
     * 1 · BY CONSTRUCTION — the ground never carried a theme: the `.vt-root`
     *     block reads no `--vt-*` variable, before or after the white. Every
     *     theme lives in the variables `applyTheme` sets (themes-canon pins
     *     that it sets every one, for every canon habillage) — so switching
     *     habillages re-tints exactly what it re-tinted before.
     * 2 · THE THEMED RULES SURVIVE — the load-bearing themed surfaces still
     *     read their variables in the sheet.
     * 3 · EVERY THEME, MEASURED ON THE NEW GROUND — for each of the canon
     *     habillages: its deep ink is ≥ 7:1 on white (the canon's own bar),
     *     its accent ≥ 3:1, and its soft art-block still separates from the
     *     white ground. Measured minima across all eight today: deep 9.03
     *     (laterite) · accent 4.49 (laterite) · soft 1.17 (lagune) — a ninth
     *     habillage that cannot stand on white fails here by name.
     */
    const root = rootBlock();
    expect(root).not.toContain('var(--vt-'); // 1 — the ground is theme-blind
    for (const rule of [ // 2 — the themed surfaces still read their variables
      'var(--vt-accent) 0px',            // the liseré weave
      'background: var(--vt-deep)',      // the hero panel
      'background-color: var(--vt-soft)',// the tile art block
    ]) {
      expect(VITRINE_STYLES, `themed rule lost: ${rule}`).toContain(rule);
    }
    for (const [key, th] of Object.entries(VITRINE_THEMES)) { // 3 — each habillage
      expect(ratio(th.deep, WHITE), `${key}: deep must hold the canon 7:1 on white`).toBeGreaterThanOrEqual(7);
      expect(ratio(th.accent, WHITE), `${key}: accent must stay visible on white`).toBeGreaterThanOrEqual(3);
      expect(ratio(th.soft, WHITE), `${key}: the soft art block must still separate from the ground`).toBeGreaterThan(1.1);
    }
  });

  it('THE HONEST TRADE: the white tile fill stops separating, and its hairline carries the edge better than before', () => {
    // The tile was always a white card (#FFFFFF, 1px #EDE4D3): on the white
    // ground its FILL no longer separates it (1.00:1) and the hairline + the
    // photograph draw the card. The hairline gains (1.10 → 1.26) — and stays
    // faint in sunlight; that judgement belongs to his eyes, not a ratio.
    expect(VITRINE_STYLES).toContain('border: 1px solid #EDE4D3; border-radius: 18px; background: #FFFFFF');
    expect(ratio('#EDE4D3', WHITE)).toBeGreaterThan(ratio('#EDE4D3', PAPER));
    expect(ratio('#EDE4D3', WHITE)).toBeGreaterThan(1.2);
    // The same trade hits the presentation card and the empty card (verifier):
    // both near-white fills stop separating and their own borders carry them —
    // named here and in the founder report; his eyes are the judge.
    expect(ratio('#FFFDF8', WHITE)).toBeLessThan(1.1); // presentation fill ≈ ground now
    expect(ratio('#FCF9F2', WHITE)).toBeLessThan(1.1); // empty-card fill ≈ ground now
  });

  it('the SHELL behind the page follows the ground — no warm flash on overscroll', () => {
    expect(VITRINE_STYLES).toContain('body:has(.vt-root) { background: #FFFFFF; }');
  });
});
