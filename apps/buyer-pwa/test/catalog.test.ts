import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogSchema } from '@platform/i18n';

const appDir = join(import.meta.dirname, '..');
const catalog = CatalogSchema.parse(
  JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')),
);

describe('buyer-pwa catalog', () => {
  it('is a valid catalog with register + screenClass on every entry', () => {
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('covers every key the shell uses and the shell has no inline French', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const source = readFileSync(join(appDir, 'src/main.ts'), 'utf8');
    const usedKeys = [...source.matchAll(/(?<![\w.])t\('([^']+)'\)/g)].map((m) => m[1]);
    expect(usedKeys.length).toBeGreaterThan(0);
    for (const key of usedKeys) {
      expect(keys.has(key ?? '')).toBe(true);
    }
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/['"«][^'"»]*[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ]/);
  });

  it('manifest colors stay equal to the ui-tokens theme (drift guard)', async () => {
    const { shopPlusTheme } = await import('@platform/ui-tokens');
    const manifest = JSON.parse(
      readFileSync(join(appDir, 'public/manifest.webmanifest'), 'utf8'),
    );
    // v0.8.0 (GRAND TEINT): the theme palette is `.colours` (British); the
    // page background is `paper`, the theme colour is the app `primary`.
    expect(manifest.background_color).toBe(shopPlusTheme.colours.paper);
    expect(manifest.theme_color).toBe(shopPlusTheme.colours.primary);
  });
});
