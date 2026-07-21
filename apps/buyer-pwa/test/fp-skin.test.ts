import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FP_SKIN_STYLES } from '../src/vitrine/fp-skin';
import { VITRINE_THEMES } from '../src/vitrine/themes';
import { resolveVitrineEntry, DEMO_RESELLER_SLUG } from '../src/journey';
import { demoStorefrontPort } from '../src/vitrine/profile';

/**
 * RE-SKIN (FP) — the binding guards. The e2e proves the skin renders and the
 * theme drives it live; these pin the CONSTRUCTION so a refactor cannot
 * silently unhook it: (1) every skin rule is `.fp-screen`-scoped (no leak into
 * unskinned screens), (2) the sheet consumes the `--vt-*` properties applyTheme
 * sets (drive, not copy), (3) the journey resolves the reseller's habillage
 * from the SAME storefront source the vitrine uses, and (4) the wiring lines
 * (applyTheme + the class toggle + the sheet injection) stay present.
 */

const srcDir = join(import.meta.dirname, '..', 'src');
const read = (f: string): string => readFileSync(join(srcDir, f), 'utf8');

describe('the fp-skin sheet is scoped and theme-driven', () => {
  it('every rule is .fp-screen-scoped — the skin cannot leak into unskinned screens', () => {
    // Selectors are everything before a `{` at rule starts (comments stripped
    // first); @media/@keyframes frames and keyframe offsets (from/to) are
    // structural, not leaks.
    const css = FP_SKIN_STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+?)\s*\{/g)]
      .map((m) => (m[2] ?? '').trim())
      .filter((s) => s !== 'from' && s !== 'to');
    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        expect(part.trim(), `unscoped skin selector: ${part.trim()}`).toMatch(/^\.fp-screen\b/);
      }
    }
  });

  it('the sheet CONSUMES the --vt-* theme properties — the drive, not a colour copy', () => {
    for (const cssVar of ['--vt-accent', '--vt-deep', '--vt-soft', '--vt-on']) {
      expect(FP_SKIN_STYLES, `skin does not consume var(${cssVar})`).toContain(`var(${cssVar})`);
    }
    // the K CTA recipe is the documented consumer of θ.sh: rgba(θ.sh, .5).
    expect(FP_SKIN_STYLES).toContain('rgba(var(--vt-sh), .5)');
    // no theme accent is hardcoded — a skin byte equal to a θ.accent would be
    // a copy that survives a theme change and breaks the re-tint law.
    for (const theme of Object.values(VITRINE_THEMES)) {
      expect(FP_SKIN_STYLES.toUpperCase()).not.toContain(theme.accent.toUpperCase());
    }
  });
});

describe('the journey resolves and applies HER habillage', () => {
  it('the vitrine entry carries the storefront theme key — same source the vitrine themes from', () => {
    const entry = resolveVitrineEntry(DEMO_RESELLER_SLUG);
    const sf = demoStorefrontPort().resolve(DEMO_RESELLER_SLUG)!.storefront;
    expect(entry!.themeKey).toBe(sf.theme);
    // the entry colours and the key name the SAME closed §1.2 habillage.
    expect(entry!.accent).toBe(VITRINE_THEMES[entry!.themeKey].accent);
  });

  it('the wiring stays bound: applyTheme on the container, the whole-journey scope, the sheet injection', () => {
    const journey = read('journey.ts');
    expect(journey).toContain('applyTheme(container,');
    // Part 2: the WHOLE journey rides the skin — one language, product to
    // protections (the per-screen toggle is retired).
    expect(journey).toContain("container.classList.add('fp-screen')");
    expect(journey).not.toContain("classList.toggle('fp-screen'");
    const main = read('main.ts');
    expect(main).toContain('FP_SKIN_STYLES');
    expect(main).toContain("setAttribute('data-fp-skin'");
  });
});
