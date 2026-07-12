import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { grandTeintIcon, GRAND_TEINT_ICON_NAMES } from '../src/grand-teint-icons';

/**
 * WO-5.1 — the Grand Teint web substrate (buyer-pwa): the 26 inline icons,
 * the variable Archivo woff2, and the cold-start @font-face declaration.
 * NO product screen changes; no token consumed. Source-discipline proofs.
 */

const appDir = join(import.meta.dirname, '..');
const repoRoot = join(appDir, '../..');
const svgDir = join(repoRoot, 'design-reference/grand-teint/icons');
const svgNames = readdirSync(svgDir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

describe('the 26 inline PWA icons carry the design-reference geometry', () => {
  it('exactly 26 entries, matching the canonical glyph names', () => {
    expect(GRAND_TEINT_ICON_NAMES.slice().sort()).toEqual(svgNames);
    expect(svgNames).toHaveLength(26);
  });

  it('every icon renders WELL-FORMED currentColor SVG at the requested size, no hardcoded color', () => {
    for (const name of GRAND_TEINT_ICON_NAMES) {
      const svg = grandTeintIcon[name](20);
      expect(svg, `${name}`).toContain('stroke="currentColor"');
      expect(svg, `${name}`).toContain('width="20" height="20"');
      expect(svg, `${name}`).toContain('viewBox="0 0 24 24"');
      expect(svg, `${name}: no hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      // WELL-FORMED for the DOM: plain <path>/<circle>/<rect>, NEVER a namespace
      // prefix (<ns0:path xmlns:ns0=…> parses to nothing as inline SVG).
      expect(svg, `${name}: namespace-prefixed element would not render`).not.toMatch(/<ns\d+:|xmlns:/);
      expect(svg, `${name}: has a real drawing element`).toMatch(/<(path|circle|rect)\b/);
    }
  });

  it('the whole module is free of namespace-prefixed elements (the ns0: defect class)', () => {
    const mod = readFileSync(join(appDir, 'src/grand-teint-icons.ts'), 'utf8');
    expect(mod).not.toMatch(/ns\d+:|xmlns:/); // no <ns0:path xmlns:ns0=…> anywhere
    // every element that appears is a real SVG drawing tag
    const tags = [...mod.matchAll(/<([a-z][\w:]*)/g)].map((m) => m[1]);
    for (const tag of tags) expect(['svg', 'path', 'circle', 'rect']).toContain(tag);
  });

  it('each inline icon carries its source SVG geometry verbatim (byte-identity)', () => {
    for (const name of svgNames) {
      const src = readFileSync(join(svgDir, `${name}.svg`), 'utf8');
      const ds = [...src.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
      const out = grandTeintIcon[name as keyof typeof grandTeintIcon](24);
      for (const d of ds) expect(out, `${name} path`).toContain(`d="${d}"`);
    }
  });
});

describe('the variable typeface + the cold-start @font-face (substrate, unconsumed)', () => {
  it('the Latin variable woff2 is present and small (compressed, wght 400-900)', () => {
    const woff2 = join(appDir, 'public/fonts/archivo-latin-var.woff2');
    const bytes = statSync(woff2).size;
    // woff2 is already brotli-compressed; well under the design's 65-80 KB estimate
    expect(bytes).toBeGreaterThan(10_000);
    expect(bytes).toBeLessThan(85 * 1024);
  });

  it('font-display is optional and the fallback is metrics-matched (CLS=0 by construction)', () => {
    const css = readFileSync(join(appDir, 'src/fonts.css'), 'utf8');
    expect(css).toMatch(/font-family:\s*'Archivo'/);
    expect(css).toMatch(/font-display:\s*optional/); // never a mid-page swap
    expect(css).toMatch(/font-weight:\s*400 900/); // the variable range
    expect(css).toMatch(/ascent-override:\s*87\.80%/); // Archivo's own metrics
    expect(css).toMatch(/descent-override:\s*21\.00%/);
    expect(css).toMatch(/archivo-latin-var\.woff2/);
  });

  it('the substrate is UNCONSUMED: no product screen sets --font-grand-teint yet (no token work)', () => {
    // main.ts (the product) must not yet import fonts.css or use the family.
    const main = readFileSync(join(appDir, 'src/main.ts'), 'utf8');
    expect(main).not.toMatch(/fonts\.css|font-grand-teint|Archivo/);
  });
});
