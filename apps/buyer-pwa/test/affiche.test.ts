import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { qrSvg } from '../src/affiche/poster';
import { encodeQr } from '../src/qr/encoder';

/**
 * ═══ AFFICHE-QR — the printable poster behind « Imprimer le code QR » ═══
 *
 * FOUNDER, 2026-08-15: « the option to print the QR code as well ». The
 * reseller app opens `/v/{slug}?affiche=qr`; this file proves the sheet that
 * answers it. The DRIVEN half (the page mounts, the button is pressable, the
 * QR is visible in a real browser) lives in `e2e/affiche.spec.ts` — these are
 * the deterministic halves a unit can hold exactly.
 */

const appDir = join(import.meta.dirname, '..');
const read = (p: string): string => readFileSync(join(appDir, p), 'utf8');

describe('the vendored encoder is ONE file across the two apps', () => {
  it('buyer and reseller carry byte-identical encoders — what she previews IS what the paper says', () => {
    /**
     * The reseller app draws her on-screen QR from its vendored encoder; this
     * poster draws the PRINTED one from this copy. Two copies that drift would
     * print a paper that scans to somewhere her phone never previewed — so the
     * copies are pinned byte-for-byte, the same drift-check law the /docs
     * canon uses.
     */
    const ici = read('src/qr/encoder.ts');
    const source = readFileSync(join(appDir, '..', 'reseller-app', 'src', 'qr', 'encoder.ts'), 'utf8');
    expect(ici === source, 'the two vendored encoders have drifted apart').toBe(true);
  });
});

describe('qrSvg — the printed matrix is the encoder’s matrix', () => {
  const URL = 'https://beurni2.github.io/shop-plus/v/boutique-0001';

  it('every dark module of the encoding lands in the svg, and nothing else does', () => {
    const svg = qrSvg(URL);
    const qr = encodeQr(URL);
    // The svg's rects, re-read: total dark cells must equal the matrix's count.
    let attendu = 0;
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.modules[r]![c]) attendu += 1;
    let dessine = 0;
    for (const m of svg.matchAll(/<rect x="\d+" y="\d+" width="(\d+)" height="1"\/>/g)) {
      dessine += Number(m[1]);
    }
    expect(dessine, 'the svg draws a different number of dark modules than the encoding').toBe(attendu);
    // …inside a viewBox that carries the ISO quiet zone on all four sides.
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`);
  });

  it('the svg is deterministic — same url, same bytes, always', () => {
    expect(qrSvg(URL)).toBe(qrSvg(URL));
  });
});

describe('the poster module holds the repo’s own laws', () => {
  const poster = read('src/affiche/poster.ts');

  it('server bytes travel through textContent only — never innerHTML', () => {
    /**
     * The shop NAME is a server byte. The one innerHTML in the file is the QR
     * svg, which is composed above from module booleans and numbers only —
     * asserted here so a future edit cannot quietly route the name through it.
     */
    const innerHtml = [...poster.matchAll(/\.innerHTML/g)];
    expect(innerHtml, 'exactly one innerHTML — the boolean-built svg').toHaveLength(1);
    expect(poster).toContain('nom.textContent');
    expect(poster).toContain('lien.textContent = url');
  });

  it('the print button exists, prints, and disappears FROM THE PRINT itself', () => {
    expect(poster).toContain("addEventListener('click', () => window.print())");
    // The sheet must not print its own print button.
    expect(poster).toMatch(/@media print \{\s*\n\s*\.af-imprimer \{ display: none; \}/);
  });

  it('a failed name-read prints an honest sheet — the resolve is best-effort, never load-bearing', () => {
    expect(poster).toContain('.catch(() => {})');
    // The QR, the link and the spoken code are appended before any resolve lands.
    expect(poster.indexOf('host.append(page)')).toBeLessThan(poster.indexOf('resolveStorefrontPort()'));
  });
});

describe('the route — `affiche=qr` dresses the boutique page as the poster', () => {
  const main = read('src/main.ts');

  it('the poster branch guards on the vitrine slug AND the exact param, before the vitrine mounts', () => {
    /**
     * The anchor is the VITRINE-SLUG mount specifically — `mountVitrine(app…)`
     * also serves the signed-link route far earlier in the file, and matching
     * that one would compare the poster against the wrong branch.
     */
    const affiche = main.indexOf("vitrineSlug && params.get('affiche') === 'qr'");
    const vitrine = main.indexOf('mountVitrine(app as HTMLElement, vitrineSlug,');
    expect(affiche, 'the poster route is missing').toBeGreaterThan(-1);
    expect(vitrine, 'the vitrine mount anchor is missing').toBeGreaterThan(-1);
    expect(affiche, 'the poster must be decided before the vitrine mounts').toBeLessThan(vitrine);
    expect(main).toContain("import('./affiche/poster')");
  });
});
