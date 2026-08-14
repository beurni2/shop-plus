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
    /**
     * BANDEAUX-RETIRÉS (founder, 2026-08-14) — the shell's key count may now be
     * ZERO, and legitimately: `t('apercu.ruban')` (the sandbox ribbon) was the
     * only catalog string main.ts ever rendered, and the ribbon is removed. The
     * old `usedKeys.length > 0` guarded against the regex silently matching
     * nothing; that guard now moves onto the REGEX ITSELF, so it still cannot
     * rot into a vacuous pass while the real assertions below stay honest.
     */
    const sonde = "const x = t('probe.key');";
    expect(
      [...sonde.matchAll(/(?<![\w.])t\('([^']+)'\)/g)].map((m) => m[1]),
      'the key-extraction regex must still extract keys',
    ).toEqual(['probe.key']);
    for (const key of usedKeys) {
      expect(keys.has(key ?? '')).toBe(true);
    }
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/['"«][^'"»]*[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ]/);
  });

  it('manifest colors stay equal to the ui-tokens theme (drift guard)', async () => {
    const { shopPlusTheme } = await import('@platform/ui-tokens/legacy');
    const manifest = JSON.parse(
      readFileSync(join(appDir, 'public/manifest.webmanifest'), 'utf8'),
    );
    // v0.8.0 (GRAND TEINT): the theme palette is `.colours` (British); the
    // page background is `paper`, the theme colour is the app `primary`.
    expect(manifest.background_color).toBe(shopPlusTheme.colours.paper);
    expect(manifest.theme_color).toBe(shopPlusTheme.colours.primary);
  });
});
