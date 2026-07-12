import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRACKING_STEPS } from '../src/tracking-view';

/**
 * WO-4.4 — the zero-hardcode scan for the PWA visual layer (the DoD's
 * "zero-hardcode scan green"), the web sibling of the reseller kit's scan:
 * every color is a theme token (custom property or currentColor), every
 * dimension a token var. Documented interims, same class as the kit's
 * accepted literals under the ui-tokens v0.7.0 docket:
 *  — 1px hairlines (CSS's StyleSheet.hairlineWidth);
 *  — SVG opacity multipliers on the demo Studio asset;
 *  — ONE cubic-bezier approximating motion.springSoft (CSS cannot consume
 *    spring physics params; the duration IS the token var).
 */

const appDir = join(import.meta.dirname, '..');
const srcDir = join(appDir, 'src');
const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts'));
const read = (f: string) => readFileSync(join(srcDir, f), 'utf8');

describe('SCAN: the visual layer rides the tokens', () => {
  it('zero hardcoded colors anywhere in src — no hex, no rgb()/hsl(), no named CSS colors', () => {
    for (const f of files) {
      const src = read(f);
      expect(src, `${f} carries a hex color`).not.toMatch(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/);
      expect(src, `${f} carries rgb()/hsl()`).not.toMatch(/\brgba?\(|\bhsla?\(/);
      expect(src, `${f} carries a named color value`).not.toMatch(
        /:\s*(red|blue|green|orange|white|black|grey|gray)\b/,
      );
    }
  });

  it('every CSS dimension is a token var — no px/em/rem/pt literal except the 1px hairline', () => {
    // Strip ${...} token interpolations first: those ARE the tokens.
    const css = read('main.ts').replace(/\$\{[^}]+\}/g, 'TOKEN');
    const dims = [...css.matchAll(/\b(\d+(?:\.\d+)?)(px|em|rem|pt)\b/g)].map((m) => `${m[1]}${m[2]}`);
    for (const dim of dims) {
      expect(dim, 'only the documented 1px hairline may be a literal dimension').toBe('1px');
    }
  });

  it('view modules carry no inline style attributes and no px literals — markup composes classes', () => {
    for (const f of files.filter((n) => n !== 'main.ts')) {
      const src = read(f);
      expect(src, `${f} carries an inline style attribute`).not.toMatch(/style="/);
      expect(src, `${f} carries a px literal`).not.toMatch(/\b\d+(?:\.\d+)?px\b/);
    }
  });

  it('SVG presentation uses currentColor or token vars only', () => {
    for (const f of ['icons.ts', 'audio-note.ts', 'product-view.ts']) {
      const src = read(f);
      const fills = [...src.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]);
      for (const value of fills) {
        expect(
          value === 'none' || value === 'currentColor' || value!.startsWith('var(--'),
          `${f}: fill/stroke "${value}" is not token-driven`,
        ).toBe(true);
      }
    }
  });

  it('exactly ONE cubic-bezier (the documented spring-soft approximation) and the duration is the motion token', () => {
    const css = read('main.ts');
    expect(css.match(/cubic-bezier\(/g)).toHaveLength(1);
    expect(css).toContain('var(--motion-standard)');
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('SCAN: every string the journey uses lives in the catalog', () => {
  it('static t()/tf() keys and the dynamic key families all resolve', () => {
    const catalog = JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')) as Array<{
      key: string;
    }>;
    const keys = new Set(catalog.map((e) => e.key));
    for (const f of files) {
      const src = read(f);
      const used = [...src.matchAll(/(?<![\w.])tf?\('([^']+)'/g)].map((m) => m[1]);
      for (const key of used) {
        expect(keys.has(key ?? ''), `${f} uses missing catalog key: ${key}`).toBe(true);
      }
      // no inline French escapes the catalog (comments stripped)
      const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const htmlText = codeOnly.replace(/data-[a-z-]+="[^"]*"/g, '');
      expect(htmlText, `${f} carries inline accented French in markup text`).not.toMatch(
        />[^<>`]*[àâçéèêëîïôùûü][^<>`]*</,
      );
    }
    // dynamic families: the timeline steps and the voice reason keys
    for (const step of TRACKING_STEPS) {
      expect(keys.has(`suivi.etat.${step}`), `catalog missing suivi.etat.${step}`).toBe(true);
    }
    for (const reason of ['voix.micro_refuse', 'voix.indisponible']) {
      expect(keys.has(reason), `catalog missing ${reason}`).toBe(true);
    }
  });
});
