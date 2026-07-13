import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogSchema } from '@platform/i18n';

const appDir = join(import.meta.dirname, '..');
const catalog = CatalogSchema.parse(JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')));

describe('reseller-kit catalog', () => {
  it('is a valid catalog with register + screenClass on every entry', () => {
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('covers every key the shell uses (t/tf calls + segment labelKeys), and the shell has no inline French', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const source = readFileSync(join(appDir, 'src/main.ts'), 'utf8');
    const used = [
      ...[...source.matchAll(/(?<![\w.])tf?\('([^']+)'/g)].map((m) => m[1]),
      ...[...source.matchAll(/labelKey: '([^']+)'/g)].map((m) => m[1]),
    ];
    expect(used.length).toBeGreaterThan(0);
    for (const key of used) expect(keys.has(key ?? ''), `catalog missing ${key}`).toBe(true);

    // no inline French in the shell — every user string comes from the catalog
    // (comments are stripped first; they are documentation, not UI copy).
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/['"«][^'"»]*[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ]/);
  });

  it('the card copy the composeur paints is 100% catalog-sourced (no inline French in composeur/paint)', () => {
    for (const f of ['src/composeur.ts', 'src/paint.ts', 'src/demo.ts']) {
      const src = readFileSync(join(appDir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      // demo.ts carries product data ('Robe brodée bogolan') — that is reseller
      // DATA, not UI copy, so it is exempt; composeur/paint carry none.
      if (f === 'src/demo.ts') continue;
      expect(src, `${f} has inline French`).not.toMatch(/['"«][^'"»]*[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ]/);
    }
  });
});
