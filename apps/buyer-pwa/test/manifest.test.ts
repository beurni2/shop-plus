import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shopPlusTheme } from '@platform/ui-tokens/legacy';

/**
 * INSTALLABLE-1 (AUDIT-SHOP-2 F-20) — the PWA is installable: the manifest
 * declares the 192/512 icon pair Chrome's install criteria need, the files
 * exist as real PNGs of the declared size, the page carries `theme-color`
 * and the iOS touch icon, and the SPA-fallback HEAD mirrors it. The live
 * proof (every icon served 200, and served offline from the worker's cache)
 * is e2e/shell.spec.ts and e2e/hors-ligne.spec.ts.
 */

const appDir = join(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(appDir, 'public/manifest.webmanifest'), 'utf8')) as {
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
};

/** PNG: 8-byte signature, then the IHDR chunk carries width and height. */
function dimensionsPng(chemin: string): { largeur: number; hauteur: number } {
  const octets = readFileSync(chemin);
  expect(octets.subarray(0, 8).toString('hex'), `${chemin} is not a PNG`).toBe('89504e470d0a1a0a');
  expect(octets.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { largeur: octets.readUInt32BE(16), hauteur: octets.readUInt32BE(20) };
}

describe('the manifest declares real icons', () => {
  it('192 and 512, PNG, any+maskable, relative to the manifest (one build serves / and /shop-plus/)', () => {
    expect(manifest.icons.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512']);
    for (const icone of manifest.icons) {
      expect(icone.type).toBe('image/png');
      expect(icone.purpose).toBe('any maskable');
      expect(icone.src.startsWith('/'), 'an absolute src would break one of the two hosts').toBe(false);
      const taille = Number(icone.sizes.split('x')[0]);
      const dims = dimensionsPng(join(appDir, 'public', icone.src));
      expect(dims).toEqual({ largeur: taille, hauteur: taille });
    }
  });

  it('the touch icon exists at 180 px and both HTML heads name it with theme-color = the primary token', () => {
    expect(dimensionsPng(join(appDir, 'public/icons/apple-touch-icon.png'))).toEqual({ largeur: 180, hauteur: 180 });
    const index = readFileSync(join(appDir, 'index.html'), 'utf8');
    const fallback = readFileSync(join(appDir, 'public/404.html'), 'utf8');
    for (const [nom, html, base] of [['index.html', index, '/'], ['404.html', fallback, '/shop-plus/']] as const) {
      expect(html, `${nom}: theme-color`).toContain(`<meta name="theme-color" content="${shopPlusTheme.colours.primary}" />`);
      expect(html, `${nom}: apple-touch-icon`).toContain(`<link rel="apple-touch-icon" href="${base}icons/apple-touch-icon.png" />`);
    }
  });

  it('the icons ride the worker precache (vite.config lists icons/*.png beside assets and fonts)', () => {
    const config = readFileSync(join(appDir, 'vite.config.ts'), 'utf8');
    expect(config).toContain("['assets', 'fonts', 'icons']");
  });
});
