import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharedColour, shopColour } from '@platform/ui-tokens';

/**
 * ═══ OPPORTUNITÉS-BLANC — the appearance pin (founder order 2026-08-14) ═══
 *
 * « make the background of opportunités screen all white like the screenshot »
 *
 * WHY THIS FILE EXISTS, STATED PRECISELY. The change is a colour, and a colour
 * has exactly one home in this project's proof law: NOT the walk. The standing
 * order forbids a RENDU walk from claiming appearance, and `rendu-opportunites`
 * obeys that — it proves the screen still WORKS and is deliberately blind to
 * what it looks like. Between the two, three failure modes exist and only two
 * were already covered:
 *
 *   · the tree breaks / the tile goes dead  → the WALK catches it (proven by
 *     mutation: killing the tile's `onPress` turns TWO walks red — the
 *     reach-the-next-step one and the second-visit one).
 *   · the style reference is a typo         → TYPECHECK catches it (proven by
 *     mutation: `styles.screenBlancTypo` left all four walks GREEN — React
 *     Native ignores an undefined entry in a style array, so the white would
 *     have silently never applied — while tsc named it TS2551).
 *   · the WRONG COLOUR, or the right colour on the WRONG SCREENS → nothing
 *     caught it. That is this file.
 *
 * The last one is not hypothetical: four days ago a valid token on the wrong
 * ground (`onInk` over a white card, 1.05:1) shipped to his hand in the rider
 * app and no gate saw it, because the hex scan reads literals and the contrast
 * gate read a hand-curated pairing list. So the pin here is by TOKEN and by
 * MEASURED RATIO, never by a copied hex.
 */

const appDir = join(new URL('.', import.meta.url).pathname, '..');
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const app = (): string => stripComments(readFileSync(join(appDir, 'App.tsx'), 'utf8'));

/** WCAG relative luminance + contrast, computed — never a remembered number. */
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

describe('OPPORTUNITÉS-BLANC — the ground is white, from the system’s own token', () => {
  it('the white is `sharedColour.card`, and no hex is typed into the style', () => {
    const style = /screenBlanc:\s*\{([^}]*)\}/.exec(app())?.[1] ?? 'STYLE NOT FOUND';
    expect(style, 'the screenBlanc style must exist').not.toBe('STYLE NOT FOUND');
    expect(style).toContain('sharedColour.card');
    expect(/#[0-9a-fA-F]{3,8}\b/.test(style), 'a hand-typed hex is not a token').toBe(false);
    // …and that token really is white, so the pin cannot pass on a renamed value.
    expect(sharedColour.card).toBe('#FFFFFF');
  });

  it('it is applied ONLY behind `surOpportunites` — the four other hubs keep the warm paper', () => {
    const src = app();
    // The root composes the white OVER the shared ground, gated on this tab.
    expect(src).toContain('style={[styles.screen, surOpportunites && styles.screenBlanc]}');
    // Exactly ONE place composes it: an unconditional second use would repaint
    // screens the founder did not ask about.
    expect((src.match(/styles\.screenBlanc/g) ?? []).length).toBe(1);
    // The shared ground itself is UNTOUCHED — accueil, ma vitrine, cercle and
    // gains still stand on paper.
    const base = /screen:\s*\{([^}]*)\}/.exec(src)?.[1] ?? 'STYLE NOT FOUND';
    expect(base).toContain('sharedColour.paper');
    expect(sharedColour.paper).toBe('#F4EFE6');
  });

  it('the status bar follows the ground it sits on — no warm strip above a white screen', () => {
    expect(app()).toContain('backgroundColor={surOpportunites ? sharedColour.card : sharedColour.paper}');
  });
});

describe('OPPORTUNITÉS-BLANC — what the white does to legibility, measured', () => {
  const PAPER = sharedColour.paper;
  const WHITE = sharedColour.card;

  it('every text on the ground CLEARS AA on white, and every one of them improves', () => {
    /**
     * THE LIST IS CROSS-CHECKED AGAINST THE SOURCE, not remembered (verifier:
     * a hand-curated pairing list is the exact hole the rider app's invisible
     * line fell through). If either style swaps its token tomorrow, the
     * `toContain` below fails and the ratio is never computed on a stale pair.
     */
    const src = app();
    const styleOf = (key: string): string =>
      new RegExp(`${key}:\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? 'STYLE NOT FOUND';
    expect(styleOf('screenTitle'), 'screenTitle must still read in ink').toContain('sharedColour.ink');
    expect(styleOf('oppSub'), 'oppSub must still read in sub').toContain('sharedColour.sub');

    const onGround: ReadonlyArray<readonly [string, string]> = [
      ['screenTitle (Les opportunités)', sharedColour.ink],
      ['oppSub (the net-first subtitle)', sharedColour.sub],
    ];
    for (const [what, fg] of onGround) {
      const avant = ratio(fg, PAPER);
      const apres = ratio(fg, WHITE);
      expect(apres, `${what}: ${fg} on white is ${apres.toFixed(2)}:1 — below AA 4.5`).toBeGreaterThanOrEqual(4.5);
      expect(apres, `${what} must not lose contrast on the new ground`).toBeGreaterThan(avant);
    }
  });

  it('THE CARD EDGE SURVIVES: the tile fill matches the ground, so its hairline must carry it — and it carries it BETTER than before', () => {
    /**
     * The honest consequence of an all-white ground: `oppTile` is filled with
     * the SAME `card` token, so fill-vs-ground goes to 1.00:1 and the fill
     * stops defining the card at all. What defines it instead is the hairline
     * and the photograph's own block — and both gain contrast here rather than
     * losing it. This is the number the code comment claims; pinned so the
     * comment cannot rot into a fiction.
     */
    // THE SOURCE FACT, not arithmetic over two constants (verifier): the tile
    // is filled with the SAME token as the ground, which is WHY the fill stops
    // separating. Change either side and this is what notices.
    const tile = /oppTile:\s*\{([\s\S]*?)\n  \}/.exec(app())?.[1] ?? 'STYLE NOT FOUND';
    expect(tile, 'the oppTile style must exist').not.toBe('STYLE NOT FOUND');
    expect(tile).toContain('backgroundColor: sharedColour.card');
    expect(tile).toContain('borderColor: sharedColour.hairline');
    expect(ratio(WHITE, WHITE)).toBeCloseTo(1, 5); // …hence: the fill no longer separates
    const hairlineAvant = ratio(sharedColour.hairline, PAPER);
    const hairlineApres = ratio(sharedColour.hairline, WHITE);
    expect(hairlineApres).toBeGreaterThan(hairlineAvant);
    expect(hairlineApres).toBeGreaterThan(1.2);
    // The art block (the photograph's frame) separates more too.
    expect(ratio(shopColour.soft, WHITE)).toBeGreaterThan(ratio(shopColour.soft, PAPER));
  });

  it('the tab bar is STILL THE WARM BAND — read from the kit, so the day it changes this pin says so', () => {
    /**
     * The verifier caught this asserting token arithmetic while never reading
     * `styles.tabBar` — it would have passed over a tab bar repainted white.
     * It reads the kit now. And the claim is stated at the size the number
     * supports: 1.145:1 is a TINT, well under the 3:1 WCAG asks of a
     * non-text boundary, which is why the band also carries a top hairline
     * and why leaving it warm is the founder's call, put to him with the
     * build rather than settled here.
     */
    const kit = stripComments(readFileSync(join(appDir, 'src/ui/kit.tsx'), 'utf8'));
    const bar = /tabBar:\s*\{([\s\S]*?)\n  \}/.exec(kit)?.[1] ?? 'STYLE NOT FOUND';
    expect(bar, 'the tabBar style must exist').not.toBe('STYLE NOT FOUND');
    expect(bar).toContain('sharedColour.paper');
    expect(bar).toContain('borderTopColor: sharedColour.hairline');
    expect(ratio(PAPER, WHITE)).toBeLessThan(3); // a tint, not a border — said plainly
    expect(ratio(PAPER, WHITE)).toBeGreaterThan(1.1);
  });
});
